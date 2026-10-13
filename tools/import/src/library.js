import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFile } from 'music-metadata';

const AUDIO_EXT = new Set(['.flac']);

/** Recursively list FLAC files, skipping hidden/system folders like $Temp. */
export async function scan(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('$') || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
        const st = await fs.stat(full);
        out.push({
          path: full,
          rel: path.relative(rootDir, full).split(path.sep).join('/'),
          size: st.size,
          mtime: Math.floor(st.mtimeMs),
        });
      }
    }
  }
  await walk(rootDir);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Treat empty strings and the literal "null" some taggers write as missing. */
const clean = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'null' ? undefined : s;
};
const num = (v) => {
  const n = Number(clean(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Parse "NN - Title.flac" as a fallback when tags are missing. */
function fromFilename(rel) {
  const parts = rel.split('/');
  const base = path.basename(parts.at(-1), path.extname(parts.at(-1)));
  const m = base.match(/^(\d{1,3})\s*[-.]\s*(.+)$/);
  return {
    artist: parts.length >= 3 ? parts.at(-3) : undefined,
    album: parts.length >= 2 ? parts.at(-2) : undefined,
    track: m ? Number(m[1]) : undefined,
    title: m ? m[2] : base,
  };
}

function lyricsText(common) {
  const l = common.lyrics?.[0];
  if (!l) return undefined;
  if (typeof l === 'string') return clean(l);
  if (l.text) return clean(l.text);
  if (Array.isArray(l.syncText) && l.syncText.length) {
    return l.syncText
      .map((s) => {
        const t = (s.timestamp ?? 0) / 1000;
        const mm = String(Math.floor(t / 60)).padStart(2, '0');
        const ss = (t % 60).toFixed(2).padStart(5, '0');
        return `[${mm}:${ss}]${s.text}`;
      })
      .join('\n');
  }
  return undefined;
}

export async function readMeta(file) {
  const { common, format, native } = await parseFile(file.path, { duration: true, skipCovers: true });
  const fb = fromFilename(file.rel);

  // Prefer the raw Vorbis LYRICS tag: it keeps LRC timestamps that common.lyrics strips.
  let lyrics;
  for (const tags of Object.values(native ?? {})) {
    const t = tags.find((x) => /^(UNSYNCED)?LYRICS$/i.test(x.id));
    if (t) {
      lyrics = clean(typeof t.value === 'string' ? t.value : t.value?.text);
      if (lyrics) break;
    }
  }
  lyrics ??= lyricsText(common);

  const albumArtist = clean(common.albumartist) ?? clean(common.artist) ?? fb.artist ?? 'Unknown Artist';
  return {
    title: clean(common.title) ?? fb.title,
    artist: clean(common.artist) ?? albumArtist,
    albumArtist,
    album: clean(common.album) ?? fb.album ?? 'Unknown Album',
    track: num(common.track?.no) ?? fb.track,
    disc: num(common.disk?.no) ?? 1,
    year: num(common.year),
    date: clean(common.date),
    genre: clean(common.genre?.[0]),
    isrc: clean(common.isrc?.[0]),
    bpm: num(common.bpm),
    lyrics,
    syncedLyrics: lyrics ? /^\s*\[\d{1,2}:\d{2}/.test(lyrics) : false,
    duration: format.duration ? Math.round(format.duration * 1000) / 1000 : undefined,
    sampleRate: format.sampleRate,
    bitDepth: format.bitsPerSample,
  };
}

export function slug(s) {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

export const hashId = (...parts) =>
  crypto.createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 12);

/** Windows/Drive-safe folder or file name. */
export function safeName(s) {
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 150) || '_';
}
