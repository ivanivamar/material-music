#!/usr/bin/env node
/**
 * Pelagic library import.
 *
 *   npm run import                       # sync C:\Users\ivani\Music -> Google Drive /Pelagic
 *   npm run import -- --music "E:\More"  # another source folder
 *   npm run dry-run                      # just scan + read tags, change nothing
 *   npm run import -- --out ./out        # write to a local folder instead of Drive (testing)
 *   npm run import -- --force            # re-process everything
 *   npm run import -- --include-removed  # also bring back songs removed in the app
 *
 * Re-runnable: unchanged files (same path, size, mtime) are skipped.
 * Songs removed in the app ("Remove from library", listed in library.json `removed`) are skipped
 * by source path or track id, unless --include-removed.
 * Never deletes anything from Drive.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULTS, TMP_DIR, CATALOGUE_NAME, CATALOGUE_VERSION } from './config.js';
import { scan, readMeta, slug, hashId, safeName } from './library.js';
import { toOpus, extractCover } from './encode.js';
import { DriveStore, LocalStore } from './stores.js';
import { syncArtists } from './artists.js';

const { values: args } = parseArgs({
  options: {
    music: { type: 'string', default: DEFAULTS.musicDir },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: String(DEFAULTS.concurrency) },
    bitrate: { type: 'string', default: DEFAULTS.opusBitrate },
    offline: { type: 'boolean', default: false },
    'refresh-artists': { type: 'boolean', default: false },
    'include-removed': { type: 'boolean', default: false },
  },
});

const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const fmtGB = (b) => `${(b / 1024 ** 3).toFixed(2)} GB`;

function emptyCatalogue() {
  return { version: CATALOGUE_VERSION, updatedAt: null, artists: {}, albums: {}, tracks: {} };
}

async function main() {
  const musicDir = path.resolve(args.music);
  console.log(`Pelagic import\n  source: ${musicDir}`);

  let files = await scan(musicDir);
  if (args.limit) files = files.slice(0, Number(args.limit));
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`  found:  ${files.length} FLAC files, ${fmtGB(total)}\n`);

  if (args['dry-run']) return dryRun(files);

  let store;
  if (args.out) store = await new LocalStore(args.out).init();
  else {
    const { getAuth } = await import('./auth.js');
    store = await new DriveStore(await getAuth(), DEFAULTS.driveRoot).init();
  }
  console.log(`  target: ${store.describe()}\n`);

  const cat = (await store.readJson(CATALOGUE_NAME)) ?? emptyCatalogue();
  const byPath = new Map(Object.values(cat.tracks).map((t) => [t.source?.path, t]));

  // Removed in the app: skip unless asked to bring them back (then the tombstone goes on import)
  cat.removed ??= { tracks: {}, albums: {}, artists: {} };
  for (const k of ['tracks', 'albums', 'artists']) cat.removed[k] ??= {};
  const removedPaths = new Set(Object.values(cat.removed.tracks).map((r) => r.track?.source?.path).filter(Boolean));
  const keepRemoved = args['include-removed'];
  let skippedRemoved = 0;

  const todo = files.filter((f) => {
    if (!keepRemoved && removedPaths.has(f.rel)) {
      skippedRemoved++;
      return false;
    }
    const t = byPath.get(f.rel);
    return args.force || !t || t.source.size !== f.size || t.source.mtime !== f.mtime;
  });
  console.log(
    `  ${files.length - todo.length - skippedRemoved} unchanged, ${todo.length} to process` +
      (skippedRemoved ? `, ${skippedRemoved} removed in the app (skipped; --include-removed brings them back)` : '') +
      '\n',
  );
  if (!todo.length) console.log('Tracks are up to date.');

  await fs.mkdir(TMP_DIR, { recursive: true });

  // Serialised catalogue saves so concurrent workers don't race
  let saving = Promise.resolve();
  let dirty = 0;
  const save = (force = false) => {
    if (!force && ++dirty < 10) return saving;
    dirty = 0;
    cat.updatedAt = new Date().toISOString();
    const snapshot = structuredClone(cat);
    saving = saving.then(() => store.writeJson(CATALOGUE_NAME, snapshot));
    return saving;
  };

  const coverJobs = new Map(); // albumId -> Promise
  const stats = { done: 0, failed: 0, dupes: 0, removed: 0, flac: 0, opus: 0 };
  const failures = [];
  const now = () => new Date().toISOString();

  async function processFile(f, n) {
    const tag = `[${n}/${todo.length}]`;
    const m = await readMeta(f);

    const artistId = slug(m.albumArtist);
    const albumId = `${artistId}--${slug(m.album)}`;
    const trackId = hashId(albumId, m.disc, m.track ?? '', m.title);

    // removed in the app under another path (file moved / renamed): still skipped
    if (cat.removed.tracks[trackId]) {
      if (!keepRemoved) {
        stats.removed++;
        console.log(`${tag} ⊘ removed in the app — skipped (${f.rel})`);
        return;
      }
      delete cat.removed.tracks[trackId];
      delete cat.removed.albums[albumId];
      delete cat.removed.artists[artistId];
    }

    const existing = cat.tracks[trackId];
    if (existing && existing.source?.path !== f.rel && !args.force) {
      stats.dupes++;
      console.log(`${tag} ⧉ duplicate of ${existing.source.path} — skipped (${f.rel})`);
      return;
    }

    const artistDir = safeName(m.albumArtist);
    const albumDir = safeName(m.album);
    const base = path.basename(f.rel, path.extname(f.rel));

    // Cover: once per album, shared across workers
    if (!cat.albums[albumId]?.cover && !coverJobs.has(albumId)) {
      coverJobs.set(
        albumId,
        (async () => {
          const tmp = path.join(TMP_DIR, `${albumId}.jpg`);
          if (!(await extractCover(f.path, tmp, DEFAULTS.coverSize))) return null;
          const up = await store.uploadFile(tmp, `${albumId}.jpg`, ['covers'], 'image/jpeg');
          await fs.rm(tmp, { force: true });
          return up.id;
        })().catch((e) => {
          console.warn(`  ! cover for ${m.album}: ${e.message}`);
          return null;
        }),
      );
    }

    // Phone copy
    const opusTmp = path.join(TMP_DIR, `${trackId}.opus`);
    await toOpus(f.path, opusTmp, args.bitrate);

    const flacUp = await store.uploadFile(f.path, `${base}.flac`, ['library', artistDir, albumDir], 'audio/flac');
    const opusUp = await store.uploadFile(opusTmp, `${base}.opus`, ['mobile', artistDir, albumDir], 'audio/ogg');
    await fs.rm(opusTmp, { force: true });
    const coverId = (await coverJobs.get(albumId)) ?? cat.albums[albumId]?.cover ?? null;

    // Catalogue entries
    const ts = existing?.addedAt ?? now();
    cat.artists[artistId] ??= { id: artistId, name: m.albumArtist, addedAt: ts };
    const album = (cat.albums[albumId] ??= {
      id: albumId,
      title: m.album,
      artistId,
      artist: m.albumArtist,
      addedAt: ts,
    });
    Object.assign(album, {
      year: m.year ?? album.year,
      date: m.date ?? album.date,
      genre: m.genre ?? album.genre,
      cover: coverId ?? album.cover ?? null,
    });
    if (ts < album.addedAt) album.addedAt = ts;

    cat.tracks[trackId] = {
      id: trackId,
      title: m.title,
      artist: m.artist,
      albumId,
      artistId,
      disc: m.disc,
      track: m.track ?? null,
      duration: m.duration,
      isrc: m.isrc,
      bpm: m.bpm,
      lyrics: m.lyrics,
      syncedLyrics: m.syncedLyrics,
      flac: { id: flacUp.id, size: flacUp.size, sampleRate: m.sampleRate, bitDepth: m.bitDepth },
      mobile: { id: opusUp.id, size: opusUp.size, codec: 'opus', bitrate: args.bitrate },
      source: { path: f.rel, size: f.size, mtime: f.mtime },
      addedAt: ts,
    };

    stats.done++;
    stats.flac += flacUp.size;
    stats.opus += opusUp.size;
    console.log(`${tag} ✓ ${m.albumArtist} — ${m.album} — ${m.title}  (${fmtMB(f.size)} → ${fmtMB(opusUp.size)})`);
    await save();
  }

  // Simple worker pool
  const queue = todo.map((f, i) => [f, i + 1]);
  const workers = Array.from({ length: Math.max(1, Number(args.concurrency)) }, async () => {
    for (let job; (job = queue.shift()); ) {
      try {
        await processFile(...job);
      } catch (e) {
        stats.failed++;
        failures.push([job[0].rel, e.message]);
        console.error(`[${job[1]}/${todo.length}] ✗ ${job[0].rel}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  await save(true);

  // Artist photos, backgrounds, MusicBrainz IDs
  console.log('\nArtists…');
  const artistChanges = await syncArtists(cat, store, musicDir, {
    online: !args.offline,
    refresh: args['refresh-artists'],
  });
  if (!artistChanges) console.log('  nothing to update');
  await fs.rm(TMP_DIR, { recursive: true, force: true });

  // Album track counts
  for (const a of Object.values(cat.albums)) a.trackCount = 0;
  for (const t of Object.values(cat.tracks)) cat.albums[t.albumId] && cat.albums[t.albumId].trackCount++;
  await save(true);

  console.log(
    `\nDone: ${stats.done} imported, ${stats.dupes} duplicates skipped, ${skippedRemoved + stats.removed} removed in the app skipped, ${stats.failed} failed.` +
      `\n  uploaded ${fmtGB(stats.flac)} FLAC + ${fmtGB(stats.opus)} Opus` +
      `\n  library: ${Object.keys(cat.artists).length} artists, ${Object.keys(cat.albums).length} albums, ${Object.keys(cat.tracks).length} tracks`,
  );
  if (failures.length) {
    console.log('\nFailures:');
    for (const [p, msg] of failures) console.log(`  ${p}: ${msg}`);
    process.exitCode = 1;
  }
}

async function dryRun(files) {
  const albums = new Map();
  let warnings = 0;
  for (const f of files) {
    const m = await readMeta(f);
    const key = `${m.albumArtist} — ${m.album}`;
    if (!albums.has(key)) albums.set(key, { year: m.year, tracks: 0, lyrics: 0 });
    const a = albums.get(key);
    a.tracks++;
    if (m.lyrics) a.lyrics++;
    if (!m.track) {
      warnings++;
      console.log(`  ! no track number: ${f.rel}`);
    }
  }
  for (const [k, a] of albums) console.log(`  ${k} (${a.year ?? '?'}) — ${a.tracks} tracks, ${a.lyrics} with lyrics`);
  console.log(`\n${albums.size} albums, ${files.length} tracks, ${warnings} warnings. Nothing was changed.`);
}

main().catch((e) => {
  console.error(`\nImport failed: ${e.message}`);
  process.exit(1);
});
