/**
 * Home shelves (step 8) from the catalogue + play history: recently listened, recently added,
 * most played, rediscover. Album level — a play counts for the album of its track.
 */
import { albumsByAdded, type Album, type Catalogue } from './library'
import type { Play } from './history'

export const SHELF_SIZE = 12
const DAY = 86_400
/** an album not heard for this long can come back in Rediscover */
const STALE_DAYS = 30

export interface AlbumPlays {
  album: Album
  plays: number
  /** Unix seconds of the latest play */
  last: number
}

export interface HomeShelves {
  listened: AlbumPlays[]
  /** plays in the last 7 days */
  playsThisWeek: number
  added: Album[]
  /** albums added in the last 7 days */
  addedThisWeek: number
  most: AlbumPlays[]
  /** `last` null = never played */
  rediscover: { album: Album; last: number | null }[]
}

/** Plays per album (tracks gone from the catalogue are skipped). */
export function albumPlays(c: Catalogue, plays: readonly Play[]): Map<string, AlbumPlays> {
  const out = new Map<string, AlbumPlays>()
  for (const p of plays) {
    const albumId = c.tracks[p.trackId]?.albumId
    const album = albumId ? c.albums[albumId] : undefined
    if (!album) continue
    const s = out.get(album.id)
    if (s) {
      s.plays++
      if (p.at > s.last) s.last = p.at
    } else out.set(album.id, { album, plays: 1, last: p.at })
  }
  return out
}

/**
 * Daily order: each album gets a pseudo-random rank from (day, album id), so the pick changes once a
 * day and stays put when one album drops out (played → moves to Recently listened).
 */
function dailyRank(day: string, id: string): number {
  let h = 2166136261
  const key = `${day}|${id}`
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return (h ^ (h >>> 15)) >>> 0
}
const daily = <T,>(list: T[], day: string, id: (x: T) => string) => [...list].sort((a, b) => dailyRank(day, id(a)) - dailyRank(day, id(b)))

/**
 * Albums heard before but not for STALE_DAYS (favourites first, a daily pick among them), then a
 * daily handful never played yet. `recent`: on the shelves above — skipped; never-played albums also
 * skip `added` (they already sit on Recently added).
 */
function rediscover(c: Catalogue, stats: Map<string, AlbumPlays>, now: number, day: string, recent: Set<string>, added: Set<string>) {
  const staleBefore = now - STALE_DAYS * DAY
  const stale = [...stats.values()].filter((s) => s.last < staleBefore && !recent.has(s.album.id)).sort((a, b) => b.plays - a.plays || a.last - b.last)
  const picked = daily(stale.slice(0, SHELF_SIZE * 2), day, (s) => s.album.id).slice(0, SHELF_SIZE)
  const never = daily(
    Object.values(c.albums).filter((a) => !stats.has(a.id) && !added.has(a.id)),
    day,
    (a) => a.id,
  ).slice(0, SHELF_SIZE - picked.length)
  return [...picked.map((s) => ({ album: s.album, last: s.last as number | null })), ...never.map((album) => ({ album, last: null }))]
}

let cache: { c: Catalogue; plays: readonly Play[]; day: string; out: HomeShelves } | null = null

/** `nowMs` only matters per day (Rediscover's pick, "this week" counts). */
export function homeShelves(c: Catalogue, plays: readonly Play[], nowMs: number): HomeShelves {
  const d = new Date(nowMs)
  const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  if (cache && cache.c === c && cache.plays === plays && cache.day === day) return cache.out
  const now = Math.floor(nowMs / 1000)
  const weekAgo = now - 7 * DAY

  const stats = albumPlays(c, plays)
  const byLast = [...stats.values()].sort((a, b) => b.last - a.last)
  // the last month; older listening is Rediscover's
  const listened = byLast.filter((s) => s.last >= now - STALE_DAYS * DAY).slice(0, SHELF_SIZE)
  const most = [...stats.values()].sort((a, b) => b.plays - a.plays || b.last - a.last).slice(0, SHELF_SIZE)
  const added = albumsByAdded(c).slice(0, SHELF_SIZE)
  const weekAgoIso = new Date(weekAgo * 1000).toISOString()

  const recent = new Set(listened.map((s) => s.album.id))
  let redis = rediscover(c, stats, now, day, recent, new Set(added.map((a) => a.id)))
  // small library: allow what the shelves above show rather than an empty shelf
  if (redis.length < SHELF_SIZE / 2) redis = rediscover(c, stats, now, day, new Set(), new Set())

  const out: HomeShelves = {
    listened,
    playsThisWeek: plays.filter((p) => p.at >= weekAgo && c.tracks[p.trackId]).length,
    added,
    addedThisWeek: albumsByAdded(c).filter((a) => (a.addedAt ?? '') >= weekAgoIso).length,
    most,
    rediscover: redis,
  }
  cache = { c, plays, day, out }
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Mar 2025" */
export function monthYear(sec: number): string {
  const d = new Date(sec * 1000)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
