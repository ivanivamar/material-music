/**
 * FLAC metadata in the browser (step 10, Upload): STREAMINFO, Vorbis comments and the cover picture,
 * read from the header blocks only (no audio is decoded here).
 *
 * The result mirrors `readMeta()` in tools/import/src/library.js (music-metadata's common tags), so
 * uploads get the same artist / album / track ids as the importer.
 */

export interface FlacInfo {
  sampleRate: number
  bitDepth: number
  channels: number
  /** seconds, 3 decimals; undefined when STREAMINFO has no sample count */
  duration?: number
  /** Vorbis comments in file order, keys upper-cased */
  comments: [string, string][]
  vendor: string
  picture: { mime: string; type: number; data: Blob } | null
}

export interface TrackMeta {
  title: string
  artist: string
  albumArtist: string
  album: string
  track?: number
  trackTotal?: number
  disc: number
  discTotal?: number
  year?: number
  date?: string
  genre?: string
  isrc?: string
  bpm?: number
  lyrics?: string
  syncedLyrics: boolean
  duration?: number
  sampleRate: number
  bitDepth: number
}

export class NotFlacError extends Error {
  constructor(msg = 'Not a FLAC file') {
    super(msg)
    this.name = 'NotFlacError'
  }
}

const bytes = async (b: Blob, start: number, len: number) => new Uint8Array(await b.slice(start, start + len).arrayBuffer())

/** Read the metadata blocks at the start of a FLAC file. */
export async function readFlac(file: Blob): Promise<FlacInfo> {
  let pos = 0
  let head = await bytes(file, 0, 10)
  // ID3v2 in front of fLaC (some rippers add it): skip it
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f)
    pos = 10 + size + (head[5] & 0x10 ? 10 : 0)
    head = await bytes(file, pos, 4)
  }
  if (String.fromCharCode(head[0], head[1], head[2], head[3]) !== 'fLaC') throw new NotFlacError()
  pos += 4

  const info: FlacInfo = { sampleRate: 0, bitDepth: 0, channels: 0, comments: [], vendor: '', picture: null }
  const pictures: FlacInfo['picture'][] = []
  for (let guard = 0; guard < 4096; guard++) {
    const h = await bytes(file, pos, 4)
    if (h.length < 4) throw new NotFlacError('The FLAC header is cut short')
    const last = (h[0] & 0x80) !== 0
    const type = h[0] & 0x7f
    const len = (h[1] << 16) | (h[2] << 8) | h[3]
    const start = pos + 4
    pos = start + len
    if (type === 0) {
      const b = await bytes(file, start, 18)
      const v = new DataView(b.buffer)
      info.sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4)
      info.channels = ((b[12] >> 1) & 0x07) + 1
      info.bitDepth = (((b[12] & 0x01) << 4) | (b[13] >> 4)) + 1
      const samples = (b[13] & 0x0f) * 2 ** 32 + v.getUint32(14)
      if (samples > 0 && info.sampleRate > 0) info.duration = Math.round((samples / info.sampleRate) * 1000) / 1000
    } else if (type === 4) {
      parseComments(await bytes(file, start, len), info)
    } else if (type === 6) {
      const b = await bytes(file, start, Math.min(len, 64 * 1024))
      const v = new DataView(b.buffer)
      const ptype = v.getUint32(0)
      const mimeLen = v.getUint32(4)
      const mime = new TextDecoder().decode(b.subarray(8, 8 + mimeLen))
      let o = 8 + mimeLen
      o += 4 + v.getUint32(o) // description
      o += 16 // width, height, depth, colours
      const dataLen = v.getUint32(o)
      o += 4
      pictures.push({ mime: mime || 'image/jpeg', type: ptype, data: file.slice(start + o, start + o + dataLen, mime || 'image/jpeg') })
    }
    if (last) break
  }
  if (!info.sampleRate) throw new NotFlacError('No STREAMINFO block')
  // the front cover if there is one, else the first picture (the importer's ffmpeg takes the first)
  info.picture = pictures.find((p) => p!.type === 3) ?? pictures[0] ?? null
  return info
}

function parseComments(b: Uint8Array, info: FlacInfo) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const dec = new TextDecoder()
  let o = 0
  const vlen = v.getUint32(o, true)
  o += 4
  info.vendor = dec.decode(b.subarray(o, o + vlen))
  o += vlen
  const n = v.getUint32(o, true)
  o += 4
  for (let i = 0; i < n && o + 4 <= b.length; i++) {
    const l = v.getUint32(o, true)
    o += 4
    const s = dec.decode(b.subarray(o, o + l))
    o += l
    const eq = s.indexOf('=')
    if (eq > 0) info.comments.push([s.slice(0, eq).toUpperCase(), s.slice(eq + 1)])
  }
}

/* ── Tags → importer fields ─────────────────────────── */

/** Treat empty strings and the literal "null" some taggers write as missing. */
const clean = (v: string | undefined) => {
  if (v == null) return undefined
  const s = v.trim()
  return s === '' || s.toLowerCase() === 'null' ? undefined : s
}
const num = (v: string | undefined) => {
  const n = Number(clean(v))
  return Number.isFinite(n) && n > 0 ? n : undefined
}
/** "3/12" → [3, 12] */
const pos = (v: string | undefined): [number | undefined, number | undefined] => {
  const s = clean(v)
  if (!s) return [undefined, undefined]
  const [a, b] = s.split('/')
  return [num(a), num(b)]
}

/** Parse "NN - Title.flac" (and the folders above it) when tags are missing. */
function fromFilename(rel: string) {
  const parts = rel.split('/').filter(Boolean)
  const name = parts.at(-1) ?? ''
  const base = name.replace(/\.[^.]+$/, '')
  const m = base.match(/^(\d{1,3})\s*[-.]\s*(.+)$/)
  return {
    artist: parts.length >= 3 ? parts.at(-3) : undefined,
    album: parts.length >= 2 ? parts.at(-2) : undefined,
    track: m ? Number(m[1]) : undefined,
    title: m ? m[2] : base,
  }
}

/** Split artist values on ";" (one artist per part), drop empties and case-insensitive repeats. */
export function splitArtists(values: (string | undefined)[]): string[] {
  const out: string[] = []
  for (const v of values) {
    for (const part of (v ?? '').split(';')) {
      const s = clean(part)
      if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s)
    }
  }
  return out
}

export function toMeta(info: FlacInfo, rel: string): TrackMeta {
  const first = (...keys: string[]) => {
    for (const k of keys) {
      for (const [ck, cv] of info.comments) if (ck === k && clean(cv) !== undefined) return cv
    }
    return undefined
  }
  const fb = fromFilename(rel)
  const [trackNo, trackOf] = pos(first('TRACKNUMBER'))
  const [discNo, discOf] = pos(first('DISCNUMBER'))
  const date = clean(first('DATE'))
  const year = num(date?.match(/^\d{4}/)?.[0]) ?? num(first('YEAR'))
  // the raw LYRICS tag keeps its LRC timestamps
  const lyrics = clean(first('LYRICS', 'UNSYNCEDLYRICS', 'UNSYNCED LYRICS'))
  // Several artists can come as repeated tags or as one "A; B" value. The album artist (→ artist
  // page, ids, Drive folder) is the first one only, so a "feat." track stays on its album.
  // Same rule as readMeta() in tools/import.
  const all = (...keys: string[]) => info.comments.filter(([ck]) => keys.includes(ck)).map(([, cv]) => cv)
  const artists = splitArtists(all('ARTIST'))
  const albumArtists = splitArtists(all('ALBUMARTIST', 'ALBUM ARTIST'))
  const albumArtist = albumArtists[0] ?? artists[0] ?? fb.artist ?? 'Unknown Artist'
  return {
    title: clean(first('TITLE')) ?? fb.title,
    artist: artists.length ? artists.join(', ') : albumArtist,
    albumArtist,
    album: clean(first('ALBUM')) ?? fb.album ?? 'Unknown Album',
    track: trackNo ?? fb.track,
    trackTotal: trackOf ?? num(first('TRACKTOTAL', 'TOTALTRACKS')),
    disc: discNo ?? 1,
    discTotal: discOf ?? num(first('DISCTOTAL', 'TOTALDISCS')),
    year,
    date,
    genre: clean(first('GENRE')),
    isrc: clean(first('ISRC')),
    bpm: num(first('BPM')),
    lyrics,
    syncedLyrics: lyrics ? /^\s*\[\d{1,2}:\d{2}/.test(lyrics) : false,
    duration: info.duration,
    sampleRate: info.sampleRate,
    bitDepth: info.bitDepth,
  }
}

/* ── Ids (same as tools/import/src/library.js) ──────── */

export function slug(s: string): string {
  const ascii = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii) return ascii
  // No Latin letters/digits at all (e.g. 超越, 絶望の淵でも): these all used to collapse to 'x' and
  // every such album by one artist merged into `<artist>--x`. Hash the real text instead.
  const key = s.normalize('NFKC').trim().toLowerCase()
  return key ? `u-${fnv1a(key)}` : 'x'
}

/** FNV-1a 32-bit over UTF-16 code units, 8 hex chars (sync; must match tools/import/src/library.js). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export async function hashId(...parts: (string | number)[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(parts.join('\u0000')))
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

/** Windows/Drive-safe folder or file name. */
export function safeName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 150) || '_'
}

export async function idsFor(m: Pick<TrackMeta, 'albumArtist' | 'album' | 'disc' | 'track' | 'title'>) {
  const artistId = slug(m.albumArtist)
  const albumId = `${artistId}--${slug(m.album)}`
  const trackId = await hashId(albumId, m.disc, m.track ?? '', m.title)
  return { artistId, albumId, trackId }
}
