/**
 * Listening stats / yearly recap (step 21) — computed per device from the catalogue + play history
 * (state/history.ts, Drive `history.json`). Nothing new is stored: a period's stats are recomputed
 * from the plays whenever the history or catalogue changes (memoised per period).
 *
 * Periods are calendar years / months in the device's local time. "Time listened" counts each play
 * as the track's full length (history rows only keep when a play started; a play needs ≥ 30 s heard,
 * so skipped tracks aren't in it) — an estimate, labelled as such where it matters.
 *
 * Artists are album artists (the artist pages), so a feature on someone else's album counts for the
 * album's artist. Plays of tracks no longer in the catalogue are left out.
 */
import type { Album, Artist, Catalogue, Track } from './library'
import type { Play } from './history'

export interface Period {
  year: number
  /** 0–11, null = the whole year */
  month: number | null
}

export interface Ranked<T> {
  item: T
  plays: number
  /** seconds (plays × track length) */
  seconds: number
  /** Unix seconds of the first play in the period — breaks ties (earlier = higher) */
  first: number
}

export interface PeriodStats {
  period: Period
  plays: number
  seconds: number
  tracks: number
  albums: number
  artists: number
  /** days with at least one play */
  days: number
  topArtists: Ranked<Artist>[]
  topAlbums: Ranked<Album>[]
  topTracks: Ranked<Track>[]
  /** the very first play of the period */
  firstPlay: { track: Track; at: number } | null
  /** per month (year view, 12) or per day (month view, 28–31): seconds and plays */
  buckets: { seconds: number; plays: number }[]
  /** index into `buckets` with the most time, -1 when empty */
  peak: number
}

export interface PeriodIndex {
  /** years with plays, newest first */
  years: number[]
  /** year → which months (0–11) have plays */
  months: Map<number, Set<number>>
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

const TOP = 50

export const periodKey = (p: Period) => (p.month == null ? `${p.year}` : `${p.year}-${String(p.month + 1).padStart(2, '0')}`)
export const periodLabel = (p: Period) => (p.month == null ? `${p.year}` : `${MONTHS[p.month]} ${p.year}`)

/** "2026" / "2026-10" → Period (null if it doesn't parse). */
export function parsePeriod(s: string | null | undefined): Period | null {
  const m = /^(\d{4})(?:-(\d{1,2}))?$/.exec(s ?? '')
  if (!m) return null
  const year = Number(m[1])
  const month = m[2] ? Number(m[2]) - 1 : null
  if (month != null && (month < 0 || month > 11)) return null
  return { year, month }
}

function bounds(p: Period): [number, number] {
  const start = p.month == null ? new Date(p.year, 0, 1) : new Date(p.year, p.month, 1)
  const end = p.month == null ? new Date(p.year + 1, 0, 1) : new Date(p.year, p.month + 1, 1)
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)]
}

/* ── Which periods have plays ───────────────────────── */

let indexCache: { c: Catalogue; plays: readonly Play[]; out: PeriodIndex } | null = null

export function periodIndex(c: Catalogue, plays: readonly Play[]): PeriodIndex {
  if (indexCache && indexCache.c === c && indexCache.plays === plays) return indexCache.out
  const months = new Map<number, Set<number>>()
  for (const p of plays) {
    if (!c.tracks[p.trackId]) continue
    const d = new Date(p.at * 1000)
    let set = months.get(d.getFullYear())
    if (!set) months.set(d.getFullYear(), (set = new Set()))
    set.add(d.getMonth())
  }
  const out = { years: [...months.keys()].sort((a, b) => b - a), months }
  indexCache = { c, plays, out }
  return out
}

/* ── One period ─────────────────────────────────────── */

function rank<T>(m: Map<string, Ranked<T>>): Ranked<T>[] {
  return [...m.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || a.first - b.first).slice(0, TOP)
}

function bump<T>(m: Map<string, Ranked<T>>, id: string, item: T, secs: number, at: number) {
  const r = m.get(id)
  if (r) {
    r.plays++
    r.seconds += secs
  } else m.set(id, { item, plays: 1, seconds: secs, first: at })
}

const cache = new Map<string, PeriodStats>()
let cacheFor: { c: Catalogue; plays: readonly Play[] } | null = null

/** `plays` must be oldest first (as the history store keeps them). */
export function periodStats(c: Catalogue, plays: readonly Play[], period: Period): PeriodStats {
  if (!cacheFor || cacheFor.c !== c || cacheFor.plays !== plays) {
    cache.clear()
    cacheFor = { c, plays }
  }
  const key = periodKey(period)
  const hit = cache.get(key)
  if (hit) return hit

  const [from, to] = bounds(period)
  const nBuckets = period.month == null ? 12 : new Date(period.year, period.month + 1, 0).getDate()
  const buckets = Array.from({ length: nBuckets }, () => ({ seconds: 0, plays: 0 }))
  const artists = new Map<string, Ranked<Artist>>()
  const albums = new Map<string, Ranked<Album>>()
  const tracks = new Map<string, Ranked<Track>>()
  const days = new Set<string>()
  let total = 0
  let seconds = 0
  let firstPlay: PeriodStats['firstPlay'] = null

  for (const p of plays) {
    if (p.at < from) continue
    if (p.at >= to) break
    const track = c.tracks[p.trackId]
    if (!track) continue
    const secs = track.duration ?? 0
    total++
    seconds += secs
    firstPlay ??= { track, at: p.at }
    const d = new Date(p.at * 1000)
    days.add(`${d.getMonth()}-${d.getDate()}`)
    const b = buckets[period.month == null ? d.getMonth() : d.getDate() - 1]
    if (b) {
      b.seconds += secs
      b.plays++
    }
    bump(tracks, track.id, track, secs, p.at)
    const album = c.albums[track.albumId]
    if (album) bump(albums, album.id, album, secs, p.at)
    const artistId = album?.artistId ?? track.artistId
    const artist = c.artists[artistId]
    if (artist) bump(artists, artist.id, artist, secs, p.at)
  }

  let peak = -1
  buckets.forEach((b, i) => {
    if (b.seconds > 0 && (peak < 0 || b.seconds > buckets[peak]!.seconds)) peak = i
  })

  const out: PeriodStats = {
    period,
    plays: total,
    seconds,
    tracks: tracks.size,
    albums: albums.size,
    artists: artists.size,
    days: days.size,
    topArtists: rank(artists),
    topAlbums: rank(albums),
    topTracks: rank(tracks),
    firstPlay,
    buckets,
    peak,
  }
  cache.set(key, out)
  return out
}

/* ── Home: the once-a-year recap shelf ──────────────── */

/**
 * Which year the Home recap shelf shows on this date, or null when it's hidden: the last two weeks
 * of December (Dec 18–31) show the year so far, January shows the finished previous year.
 */
export function recapYear(now: Date): number | null {
  const m = now.getMonth()
  if (m === 11 && now.getDate() >= 18) return now.getFullYear()
  if (m === 0) return now.getFullYear() - 1
  return null
}

/* ── Formatting ─────────────────────────────────────── */

/** Hours as a counter: "0.4", "12", "1,204". */
export function fmtHours(seconds: number): string {
  const h = seconds / 3600
  if (h < 10) return (Math.round(h * 10) / 10).toLocaleString('en-US')
  return Math.round(h).toLocaleString('en-US')
}

/** "3 h 12 min" / "42 min" / "<1 min". */
export function fmtListen(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 1) return '<1 min'
  const h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

/** "Thu 15 Oct · 09:12" */
export function fmtPlayedAt(sec: number): string {
  const d = new Date(sec * 1000)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
  return `${day} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}
