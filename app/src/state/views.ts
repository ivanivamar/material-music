/**
 * Library views (step 4): derived, memoised per catalogue object, so every page reads the same
 * sorted lists without re-sorting on each render.
 */
import { tracksByAlbum, type Album, type Artist, type Catalogue, type Track } from './library'

const memo = <T,>(fn: (c: Catalogue) => T) => {
  const cache = new WeakMap<Catalogue, T>()
  return (c: Catalogue): T => {
    let v = cache.get(c)
    if (v === undefined) cache.set(c, (v = fn(c)))
    return v
  }
}

/** Locale-aware, case/accent-insensitive, numeric ("Vol. 2" < "Vol. 10"). Ignores a leading "The ". */
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const sortKey = (s: string) => s.replace(/^the\s+/i, '').trim()
export const byName = (a: string, b: string) => collator.compare(sortKey(a), sortKey(b))

/* ── Release type ─────────────────────────────────────
 * The catalogue has no release type yet, so it's inferred with the usual store rule:
 * 1–3 tracks and under 30 min → single; 4–6 tracks and under 30 min → EP; else album.
 * A title hint ("… EP", "(Live)") wins over the count.
 */
export type ReleaseKind = 'album' | 'ep' | 'single' | 'live'

export function releaseKind(album: Album, tracks: Track[]): ReleaseKind {
  const t = album.title
  if (/\blive\b|\(live|\[live/i.test(t)) return 'live'
  if (/\bep\b|\(ep\)|\[ep\]/i.test(t)) return 'ep'
  if (/\bsingle\b|\(single\)/i.test(t)) return 'single'
  const n = tracks.length || album.trackCount || 0
  const secs = tracks.reduce((s, x) => s + (x.duration ?? 0), 0)
  if (secs >= 30 * 60 || n >= 7) return 'album'
  if (n <= 3) return 'single'
  return 'ep'
}

export const RELEASE_LABEL: Record<ReleaseKind, { one: string; many: string }> = {
  album: { one: 'ALBUM', many: 'ALBUMS' },
  ep: { one: 'EP', many: 'EPS' },
  single: { one: 'SINGLE', many: 'SINGLES' },
  live: { one: 'LIVE', many: 'LIVE' },
}

/* ── Albums ───────────────────────────────────────── */

export interface AlbumInfo {
  album: Album
  tracks: Track[]
  seconds: number
  bytes: number
  kind: ReleaseKind
  discs: number
  /** best FLAC format on the album (for the quality badge) */
  bitDepth?: number
  sampleRate?: number
}

export const albumInfos = memo((c) => {
  const byAlbum = tracksByAlbum(c)
  const map = new Map<string, AlbumInfo>()
  for (const album of Object.values(c.albums)) {
    const tracks = byAlbum.get(album.id) ?? []
    let seconds = 0
    let bytes = 0
    let bitDepth: number | undefined
    let sampleRate: number | undefined
    const discs = new Set<number>()
    for (const t of tracks) {
      seconds += t.duration ?? 0
      bytes += t.flac?.size ?? 0
      discs.add(t.disc || 1)
      if ((t.flac?.bitDepth ?? 0) > (bitDepth ?? 0)) bitDepth = t.flac.bitDepth
      if ((t.flac?.sampleRate ?? 0) > (sampleRate ?? 0)) sampleRate = t.flac.sampleRate
    }
    map.set(album.id, { album, tracks, seconds, bytes, kind: releaseKind(album, tracks), discs: discs.size || 1, bitDepth, sampleRate })
  }
  return map
})

export type AlbumSort = 'added' | 'title' | 'artist' | 'year'
export const ALBUM_SORTS: { value: AlbumSort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'year', label: 'Release year' },
]

const yearOf = (a: Album) => a.date ?? (a.year ? String(a.year) : '')

export function sortAlbums(list: Album[], sort: AlbumSort): Album[] {
  const out = list.slice()
  switch (sort) {
    case 'added':
      return out.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || byName(a.title, b.title))
    case 'title':
      return out.sort((a, b) => byName(a.title, b.title) || byName(a.artist, b.artist))
    case 'artist':
      return out.sort((a, b) => byName(a.artist, b.artist) || yearOf(a).localeCompare(yearOf(b)) || byName(a.title, b.title))
    case 'year':
      return out.sort((a, b) => yearOf(b).localeCompare(yearOf(a)) || byName(a.artist, b.artist) || byName(a.title, b.title))
  }
}

export const allAlbums = memo((c) => Object.values(c.albums))

/* ── Artists ──────────────────────────────────────── */

export interface ArtistInfo {
  artist: Artist
  /** newest first */
  albums: Album[]
  tracks: number
  seconds: number
  genres: string[]
}

export const artistInfos = memo((c) => {
  const infos = albumInfos(c)
  const map = new Map<string, ArtistInfo>()
  for (const artist of Object.values(c.artists)) map.set(artist.id, { artist, albums: [], tracks: 0, seconds: 0, genres: [] })
  for (const album of Object.values(c.albums)) {
    let info = map.get(album.artistId)
    if (!info) {
      // catalogue without an artist record for this album: synthesise one
      const artist: Artist = { id: album.artistId, name: album.artist, addedAt: album.addedAt }
      map.set(album.artistId, (info = { artist, albums: [], tracks: 0, seconds: 0, genres: [] }))
    }
    const ai = infos.get(album.id)
    info.albums.push(album)
    info.tracks += ai?.tracks.length ?? 0
    info.seconds += ai?.seconds ?? 0
  }
  for (const info of map.values()) {
    info.albums.sort((a, b) => yearOf(b).localeCompare(yearOf(a)) || byName(a.title, b.title))
    const counts = new Map<string, number>()
    for (const a of info.albums) for (const g of (a.genre ?? '').split(/[;/,]/)) {
      const k = g.trim()
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    info.genres = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
  }
  return map
})

export const artistsByName = memo((c) =>
  [...artistInfos(c).values()].filter((i) => i.albums.length > 0).sort((a, b) => byName(a.artist.name, b.artist.name)),
)

/** Monogram (handoff rule): first letters of the first two words. "Black Veil Brides" → "BV", "Ado" → "A". */
export function monogram(name: string): string {
  const words = name.replace('&', '').split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w))
  const latin = words.filter((w) => /^[A-Za-z0-9]/.test(w))
  const use = latin.length ? latin : words
  return use.slice(0, 2).map((w) => [...w][0]).join('').toUpperCase() || '·'
}

/** Letter group for the A–Z index ("#" for digits / symbols, the glyph for non-Latin). */
export function initialOf(name: string): string {
  const c = sortKey(name).normalize('NFD').replace(/[̀-ͯ]/g, '')[0] ?? '#'
  if (/[A-Za-z]/.test(c)) return c.toUpperCase()
  if (/[0-9]/.test(c) || !/\p{L}/u.test(c)) return '#'
  return c
}

/* ── Songs ────────────────────────────────────────── */

export type SongSort = 'added' | 'title' | 'artist' | 'album' | 'duration'

export const allTracks = memo((c) => Object.values(c.tracks))

export function sortTracks(c: Catalogue, list: Track[], sort: SongSort, desc: boolean): Track[] {
  const albumTitle = (t: Track) => c.albums[t.albumId]?.title ?? ''
  const inAlbum = (a: Track, b: Track) => byName(albumTitle(a), albumTitle(b)) || a.disc - b.disc || (a.track ?? 999) - (b.track ?? 999)
  let cmp: (a: Track, b: Track) => number
  switch (sort) {
    case 'added':
      cmp = (a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.albumId.localeCompare(b.albumId) || a.disc - b.disc || (a.track ?? 999) - (b.track ?? 999)
      break
    case 'title':
      cmp = (a, b) => byName(a.title, b.title) || byName(a.artist, b.artist)
      break
    case 'artist':
      cmp = (a, b) => byName(a.artist, b.artist) || inAlbum(a, b)
      break
    case 'album':
      cmp = (a, b) => inAlbum(a, b)
      break
    case 'duration':
      cmp = (a, b) => (a.duration ?? 0) - (b.duration ?? 0) || byName(a.title, b.title)
      break
  }
  const out = list.slice().sort(cmp)
  return desc ? out.reverse() : out
}

/* ── Formatting ───────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0')

/** 41:15, or 01:12:40 past an hour (mono metadata). */
export function fmtTotal(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${pad(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  return `${Math.max(1, Math.round(b / 1e6))} MB`
}

export const fmtN = (n: number) => n.toLocaleString('en-US')
export const plural = (n: number, one: string, many = `${one}S`) => `${fmtN(n)} ${n === 1 ? one : many}`

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** 13 OCT 2026 (mono metadata). */
export function fmtAdded(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
