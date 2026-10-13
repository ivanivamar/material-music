/**
 * Artist images + MusicBrainz IDs.
 *
 * Per artist folder (e.g. Music\Spiritbox\):
 *   artist.jpg             -> square photo  (covers/artists/<id>.jpg, 600x600)
 *   artist_background.jpg  -> wide banner   (covers/artists/<id>_bg.jpg, max 1920 wide)
 * (.jpg / .jpeg / .png / .webp all accepted)
 *
 * If there is no artist.jpg: Deezer photo -> mosaic of album covers.
 * Background is only ever taken from your own file.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, extractCover } from './encode.js';
import { TMP_DIR } from './config.js';

const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const UA = 'Pelagic/0.1 (personal music player; ivanivamar99@gmail.com)';
const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function findImage(dir, base) {
  for (const ext of IMG_EXT) {
    for (const name of [`${base}.${ext}`, `${base}.${ext.toUpperCase()}`]) {
      const p = path.join(dir, name);
      const st = await fs.stat(p).catch(() => null);
      if (st?.isFile()) return { path: p, mtime: Math.floor(st.mtimeMs) };
    }
  }
  return null;
}

const squareFilter = (n) => `scale=${n}:${n}:force_original_aspect_ratio=increase,crop=${n}:${n}`;

async function squareImage(input, output, size = 600) {
  await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', squareFilter(size), '-q:v', '3', output]);
}
async function wideImage(input, output) {
  await runFfmpeg(['-i', input, '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", '-q:v', '3', output]);
}

/* ---------- online lookups (best effort) ---------- */

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

let mbLast = 0;
async function mbGet(url) {
  // MusicBrainz allows ~1 request/second
  const wait = mbLast + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  mbLast = Date.now();
  return getJson(url);
}

const overlap = (titles, ours) => titles.filter((t) => ours.has(norm(t))).length;

/** Find the MusicBrainz artist whose release groups match our album titles. */
async function lookupMbid(name, albumTitles) {
  const ours = new Set(albumTitles.map(norm));
  const res = await mbGet(
    `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&limit=5&fmt=json`,
  );
  const cands = (res.artists ?? []).filter((a) => norm(a.name) === norm(name)).slice(0, 3);
  let best = null;
  for (const a of cands) {
    const rg = await mbGet(`https://musicbrainz.org/ws/2/release-group?artist=${a.id}&limit=100&fmt=json`);
    const score = overlap((rg['release-groups'] ?? []).map((r) => r.title), ours);
    if (!best || score > best.score) best = { id: a.id, score };
  }
  if (!best) return null;
  if (best.score === 0 && cands.length > 1) return null; // ambiguous — don't guess
  return best.id;
}

/** Find the Deezer artist (verified by album titles) and return {id, pictureUrl}. */
async function lookupDeezer(name, albumTitles) {
  const ours = new Set(albumTitles.map(norm));
  const res = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`);
  const cands = (res.data ?? []).filter((a) => norm(a.name) === norm(name));
  let best = null;
  for (const a of cands.slice(0, 3)) {
    const albums = await getJson(`https://api.deezer.com/artist/${a.id}/albums?limit=200`);
    const score = overlap((albums.data ?? []).map((x) => x.title), ours);
    if (!best || score > best.score || (score === best.score && a.nb_fan > best.fans))
      best = { id: a.id, score, fans: a.nb_fan, pic: a.picture_xl };
  }
  if (!best || (best.score === 0 && cands.length > 1)) return null;
  // Deezer's placeholder for artists without a photo has an empty hash in the URL
  if (!best.pic || /\/artist\/\//.test(best.pic)) return null;
  return { id: best.id, pictureUrl: best.pic };
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} downloading image`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/* ---------- mosaic fallback ---------- */

async function mosaic(musicDir, sampleTracks, output) {
  const tiles = [];
  for (const [i, rel] of sampleTracks.slice(0, 4).entries()) {
    const t = path.join(TMP_DIR, `tile-${i}.jpg`);
    if (await extractCover(path.join(musicDir, rel), t, 300).catch(() => false)) tiles.push(t);
  }
  try {
    if (!tiles.length) return false;
    if (tiles.length < 4) {
      await squareImage(tiles[0], output);
      return true;
    }
    const inputs = tiles.flatMap((t) => ['-i', t]);
    const scaled = tiles.map((_, i) => `[${i}:v]${squareFilter(300)}[v${i}]`).join(';');
    await runFfmpeg([
      ...inputs,
      '-filter_complex',
      `${scaled};[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[out]`,
      '-map',
      '[out]',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      output,
    ]);
    return true;
  } finally {
    await Promise.all(tiles.map((t) => fs.rm(t, { force: true })));
  }
}

/* ---------- main pass ---------- */

export async function syncArtists(cat, store, musicDir, { online = true, refresh = false } = {}) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tracks = Object.values(cat.tracks);
  const albums = Object.values(cat.albums);
  let changed = 0;

  for (const artist of Object.values(cat.artists)) {
    const own = tracks.filter((t) => t.artistId === artist.id && t.source?.path);
    const albumTitles = albums.filter((a) => a.artistId === artist.id).map((a) => a.title);

    // Artist folder = most common "Artist" segment of its tracks' source paths
    const counts = {};
    for (const t of own) {
      const seg = t.source.path.split('/').slice(0, -2).join('/');
      if (seg) counts[seg] = (counts[seg] ?? 0) + 1;
    }
    const dirRel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dirRel) artist.dir = dirRel;
    const dir = artist.dir ? path.join(musicDir, ...artist.dir.split('/')) : null;
    const dirExists = dir && (await fs.stat(dir).catch(() => null))?.isDirectory();
    const label = `  ${artist.name}:`;

    try {
      // MusicBrainz ID (needed later for New Releases)
      if (online && (!artist.mbid || refresh)) {
        const mbid = await lookupMbid(artist.name, albumTitles).catch((e) => (console.warn(`${label} MusicBrainz ${e.message}`), undefined));
        if (mbid) {
          if (mbid !== artist.mbid) changed++;
          artist.mbid = mbid;
        }
      }

      // --- Photo ---
      const local = dirExists ? await findImage(dir, 'artist') : null;
      const tmp = path.join(TMP_DIR, `artist-${artist.id}.jpg`);
      let source = null;

      if (local) {
        if (refresh || artist.image?.source !== 'local' || artist.image.mtime !== local.mtime) {
          await squareImage(local.path, tmp);
          source = { source: 'local', mtime: local.mtime };
        }
      } else if (refresh || !artist.image || artist.image.source === 'local' /* file was removed */ || artist.image.source === 'mosaic') {
        let dz = null;
        if (online && (refresh || artist.image?.source !== 'deezer')) {
          dz = await lookupDeezer(artist.name, albumTitles).catch((e) => (console.warn(`${label} Deezer ${e.message}`), null));
        }
        if (dz) {
          const raw = path.join(TMP_DIR, `dz-${artist.id}`);
          await download(dz.pictureUrl, raw);
          await squareImage(raw, tmp);
          await fs.rm(raw, { force: true });
          artist.deezerId = dz.id;
          source = { source: 'deezer' };
        } else if (artist.image?.source !== 'mosaic' || refresh || artist.image.albums !== albumTitles.length) {
          // one sample track per album, newest albums first
          const byAlbum = new Map();
          for (const t of own) if (!byAlbum.has(t.albumId)) byAlbum.set(t.albumId, t.source.path);
          const order = albums
            .filter((a) => a.artistId === artist.id)
            .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
            .map((a) => byAlbum.get(a.id))
            .filter(Boolean);
          if (dirExists && (await mosaic(musicDir, order, tmp))) source = { source: 'mosaic', albums: albumTitles.length };
        }
      }

      if (source) {
        const up = await store.uploadFile(tmp, `${artist.id}.jpg`, ['covers', 'artists'], 'image/jpeg');
        artist.image = { id: up.id, v: Date.now(), ...source };
        await fs.rm(tmp, { force: true });
        changed++;
        console.log(`${label} photo ← ${source.source}`);
      }

      // --- Background (only from your own artist_background.jpg) ---
      const bg = dirExists ? await findImage(dir, 'artist_background') : null;
      if (bg && (refresh || artist.background?.mtime !== bg.mtime)) {
        const bgTmp = path.join(TMP_DIR, `artist-${artist.id}_bg.jpg`);
        await wideImage(bg.path, bgTmp);
        const up = await store.uploadFile(bgTmp, `${artist.id}_bg.jpg`, ['covers', 'artists'], 'image/jpeg');
        await fs.rm(bgTmp, { force: true });
        artist.background = { id: up.id, v: Date.now(), mtime: bg.mtime };
        changed++;
        console.log(`${label} background ← local`);
      } else if (!bg && dirExists && artist.background) {
        delete artist.background; // you removed the file
        changed++;
        console.log(`${label} background removed`);
      }
    } catch (e) {
      console.warn(`${label} ${e.message}`);
    }
  }
  return changed;
}
