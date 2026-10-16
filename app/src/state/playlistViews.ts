/**
 * Playlist views (step 9): entries resolved against the catalogue, totals, the mosaic cover and
 * the M3U export. Memoised per (catalogue, playlist) object.
 *
 * Resolving an entry: its `trackId`; if that id is gone (tags edited → new id), the same ISRC;
 * else the same artist + title. Entries that match nothing stay in the playlist as "not in your
 * library" rows (they come back if the track is imported again).
 */
import { historyStore, type Play } from './history'
import { tracksByAlbum, type Catalogue, type Track } from './library'
import { liveEntries, type Entry, type Playlist } from './playlists'
import { evaluateSmart } from './smart'

export interface PlaylistRow {
  entry: Entry
  /** null: not in the library (any more) */
  track: Track | null
  /** found by ISRC / title instead of its stored id */
  relinked: boolean
  /** smart playlists: the value of the last column (plays / last played) */
  stat?: string
}

export interface PlaylistInfo {
  rows: PlaylistRow[]
  /** playable track ids in order (for the queue) */
  ids: string[]
  seconds: number
  bytes: number
  missing: number
  /** up to 4 different album cover file ids, in playlist order */
  covers: string[]
  /** smart playlists: what the last column of the table shows (ADDED / PLAYS / LAST PLAYED) */
  statLabel?: string
}

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const indexes = new WeakMap<Catalogue, { isrc: Map<string, Track>; key: Map<string, Track> }>()
function indexOf(c: Catalogue) {
  let ix = indexes.get(c)
  if (!ix) {
    ix = { isrc: new Map(), key: new Map() }
    for (const t of Object.values(c.tracks)) {
      if (t.isrc && !ix.isrc.has(t.isrc)) ix.isrc.set(t.isrc, t)
      const k = `${fold(t.artist)}|${fold(t.title)}`
      if (!ix.key.has(k)) ix.key.set(k, t)
    }
    indexes.set(c, ix)
  }
  return ix
}

export function resolveEntry(c: Catalogue, e: Entry): { track: Track | null; relinked: boolean } {
  const direct = c.tracks[e.trackId]
  if (direct) return { track: direct, relinked: false }
  const ix = indexOf(c)
  const t = (e.isrc && ix.isrc.get(e.isrc)) || ix.key.get(`${fold(e.artist)}|${fold(e.title)}`) || null
  return { track: t, relinked: !!t }
}

const memo = new WeakMap<Playlist, { c: Catalogue; plays: readonly Play[] | null; hour: number; info: PlaylistInfo }>()

export function playlistInfo(c: Catalogue, p: Playlist): PlaylistInfo {
  // smart playlists also depend on the play history and the time (recomputed at most once an hour)
  const plays = p.smart ? historyStore.get().plays : null
  const hour = p.smart ? Math.floor(Date.now() / 3_600_000) : 0
  const hit = memo.get(p)
  if (hit && hit.c === c && hit.plays === plays && hit.hour === hour) return hit.info
  if (p.smart) {
    const info = smartInfo(c, p, plays ?? [])
    memo.set(p, { c, plays, hour, info })
    return info
  }
  const rows: PlaylistRow[] = []
  const ids: string[] = []
  const covers: string[] = []
  const seenAlbums = new Set<string>()
  let seconds = 0
  let bytes = 0
  let missing = 0
  for (const entry of liveEntries(p)) {
    const { track, relinked } = resolveEntry(c, entry)
    rows.push({ entry, track, relinked })
    if (!track) {
      missing++
      continue
    }
    ids.push(track.id)
    seconds += track.duration ?? 0
    bytes += track.flac?.size ?? 0
    if (covers.length < 4 && !seenAlbums.has(track.albumId)) {
      seenAlbums.add(track.albumId)
      const cover = c.albums[track.albumId]?.cover
      if (cover) covers.push(cover)
    }
  }
  const info = { rows, ids, seconds, bytes, missing, covers }
  memo.set(p, { c, plays, hour, info })
  return info
}

function smartInfo(c: Catalogue, p: Playlist, plays: readonly Play[]): PlaylistInfo {
  const res = evaluateSmart(c, plays, p.smart!)
  const rows: PlaylistRow[] = []
  const covers: string[] = []
  const seenAlbums = new Set<string>()
  let seconds = 0
  let bytes = 0
  res.ids.forEach((id, i) => {
    const track = c.tracks[id]
    // a stand-in entry: rows are keyed and labelled by it; ADDED shows when the song joined the library
    const entry: Entry = { entryId: `smart-${id}`, trackId: id, isrc: track.isrc, title: track.title, artist: track.artist, addedAt: track.addedAt, pos: i, movedAt: 0 }
    rows.push({ entry, track, relinked: false, stat: res.stat(id) })
    seconds += track.duration ?? 0
    bytes += track.flac?.size ?? 0
    if (covers.length < 4 && !seenAlbums.has(track.albumId)) {
      seenAlbums.add(track.albumId)
      const cover = c.albums[track.albumId]?.cover
      if (cover) covers.push(cover)
    }
  })
  return { rows, ids: res.ids, seconds, bytes, missing: 0, covers, statLabel: res.statLabel }
}

/** Which of these playlists already hold this track (by resolved track id). */
export function playlistsWith(c: Catalogue, list: Playlist[], trackId: string): Set<string> {
  const out = new Set<string>()
  for (const p of list) if (!p.smart && playlistInfo(c, p).ids.includes(trackId)) out.add(p.id)
  return out
}

/** How many of `trackIds` the playlist already has. */
export function alreadyIn(c: Catalogue, p: Playlist, trackIds: string[]): Set<string> {
  const have = new Set(playlistInfo(c, p).ids)
  return new Set(trackIds.filter((id) => have.has(id)))
}

/** Track ids of an album in order (for "add album to playlist"). */
export const albumTracks = (c: Catalogue, albumId: string) => (tracksByAlbum(c).get(albumId) ?? []).map((t) => t.id)

/* ── M3U export ─────────────────────────────────────── */

/**
 * Extended M3U (UTF-8, .m3u8) with paths relative to the music folder (the importer's
 * `source.path`: Artist/Album/NN - Title.flac). Save it in the music folder — or in the
 * Drive-for-desktop Pelagic/library folder, whose layout is the same — and any player opens it.
 */
export function toM3u(c: Catalogue, p: Playlist): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${p.name}`]
  for (const { track } of playlistInfo(c, p).rows) {
    if (!track) continue
    const album = c.albums[track.albumId]
    const path = track.source?.path?.replace(/\\/g, '/') ?? `${track.artist}/${album?.title ?? 'Unknown album'}/${track.title}.flac`
    lines.push(`#EXTINF:${Math.round(track.duration ?? -1)},${track.artist} - ${track.title}`)
    if (album) lines.push(`#EXTALB:${album.title}`)
    lines.push(path)
  }
  return lines.join('\r\n') + '\r\n'
}

export function downloadM3u(c: Catalogue, p: Playlist) {
  const blob = new Blob([toM3u(c, p)], { type: 'audio/x-mpegurl;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'playlist'}.m3u8`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/* ── Formatting ─────────────────────────────────────── */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** 2 DAYS AGO / 1 WEEK AGO / AUG 2026 (handoff 09 ADDED column, header "UPDATED …"). */
export function fmtAgo(isoTime: string, nowMs = Date.now()): string {
  const t = new Date(isoTime).getTime()
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, (nowMs - t) / 1000)
  if (s < 60) return 'JUST NOW'
  if (s < 3600) return `${Math.floor(s / 60)} MIN AGO`
  if (s < 86_400) return `${Math.floor(s / 3600)} H AGO`
  const d = Math.floor(s / 86_400)
  if (d === 1) return 'YESTERDAY'
  if (d < 7) return `${d} DAYS AGO`
  if (d < 28) return `${Math.floor(d / 7)} WEEK${d < 14 ? '' : 'S'} AGO`
  const date = new Date(t)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
