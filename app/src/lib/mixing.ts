/**
 * Mixes and radio (step 26a): pure functions, no stores, no DOM — headless-testable, like the DJ
 * engine (dj/engine.ts), whose library facts (buildLibrary → DjLibrary / DjTrack) they reuse, so the
 * DJ, the mixes and the radio judge songs the same way (plays, last played, genres, era, early-skip
 * penalties).
 *
 *   mixDay()        the mix day: mixes refresh at 06:00 local time, and only see plays from before
 *                   that moment — so a mix doesn't change while you play it, and the PC and the
 *                   phone (same catalogue + synced history) get the same songs without syncing them
 *   buildMixSet()   Daily Mixes (genre clusters), Deep cuts, Rediscover — seeded by (day, mix id)
 *   radioProfile()  what a radio is about (seed artist / song / album)
 *   radioBatch()    the next picks of a radio run
 *   flowOrder()     long-list ordering: drift between neighbours, never the same artist twice in a row
 */
import { seeded, type DjLibrary, type DjTrack, type Rng } from '../dj/engine'

const DAY = 86_400_000
export const MIX_HOUR = 6
export const DAILY_SIZE = 50
export const DEEP_SIZE = 40
export const REDIS_SIZE = 40
export const MIN_DAILY = 25
export const MAX_DAILY = 6

/* ── Day + seeds ────────────────────────────────────── */

export interface MixDay {
  /** "2026-10-19" */
  key: string
  /** ms: today's 06:00 (the mixes only use plays before it) */
  start: number
  /** ms: the next refresh */
  next: number
}

export function mixDay(nowMs: number): MixDay {
  const d = new Date(nowMs)
  if (d.getHours() < MIX_HOUR) d.setDate(d.getDate() - 1)
  d.setHours(MIX_HOUR, 0, 0, 0)
  const start = d.getTime()
  const n = new Date(start)
  n.setDate(n.getDate() + 1)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { key, start, next: n.getTime() }
}

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return (h ^ (h >>> 15)) >>> 0
}
export const rngFor = (...parts: string[]) => seeded(hash(parts.join('|')))

export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'

/* ── Hues ───────────────────────────────────────────── */

/** Genre → hue (oklch H). A fixed lookup by keyword (handoff examples), else a stable hash. */
const HUES: [RegExp, number][] = [
  [/darkwave|post.?punk|coldwave|new wave|synth|minimal wave/, 205],
  [/metalcore|post.?hardcore|hardcore|deathcore|screamo/, 25],
  [/j.?rock|j.?pop|japan|anime|vocaloid|k.?pop/, 350],
  [/alt.*metal|alternative metal|nu.?metal|groove/, 70],
  [/prog|djent|math/, 150],
  [/symphonic|gothic|goth|doom/, 255],
  [/shoegaze|dream|ambient|drone/, 230],
  [/electro|techno|house|edm|dance|trance|dubstep|drum/, 290],
  [/hip.?hop|rap|trap|r&b|soul|funk/, 40],
  [/jazz|blues/, 60],
  [/folk|country|acoustic|singer/, 95],
  [/classical|orchestral|soundtrack|score/, 265],
  [/punk|garage/, 15],
  [/indie|alternative|rock/, 185],
  [/pop/, 330],
  [/metal/, 10],
]
export function genreHue(name: string | undefined | null): number {
  const s = (name ?? '').toLowerCase()
  if (!s) return 220
  for (const [re, h] of HUES) if (re.test(s)) return h
  return hash(s) % 360
}
/** Artist hue for the no-photo disc: a stable hash of the name. */
export const nameHue = (name: string) => hash(name.toLowerCase()) % 360
export const DEEP_HUE = 230
export const REDIS_HUE = 45

/* ── Sampling helpers ───────────────────────────────── */

interface Caps {
  album: number
  artist: number
}

/**
 * Greedy pick by score with per-album / per-artist caps (`taken` already counts). The caps are
 * relaxed step by step only when the pool can't fill `size` otherwise.
 */
function pickCapped(pool: DjTrack[], size: number, score: (t: DjTrack) => number, caps: Caps, taken: DjTrack[] = [], relax = true): DjTrack[] {
  const out: DjTrack[] = []
  const have = new Set(taken.map((t) => t.id))
  const albums = new Map<string, number>()
  const artists = new Map<string, number>()
  for (const t of taken) {
    albums.set(t.albumId, (albums.get(t.albumId) ?? 0) + 1)
    artists.set(t.artistId, (artists.get(t.artistId) ?? 0) + 1)
  }
  const scored = pool
    .filter((t) => !have.has(t.id))
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  const steps: Caps[] = relax ? [caps, { album: caps.album + 1, artist: caps.artist + 2 }] : [caps]
  for (const c of steps) {
    for (const { t } of scored) {
      if (out.length >= size) return out
      if (have.has(t.id)) continue
      if ((albums.get(t.albumId) ?? 0) >= c.album || (artists.get(t.artistId) ?? 0) >= c.artist) continue
      out.push(t)
      have.add(t.id)
      albums.set(t.albumId, (albums.get(t.albumId) ?? 0) + 1)
      artists.set(t.artistId, (artists.get(t.artistId) ?? 0) + 1)
    }
    if (out.length >= size) break
  }
  return out
}

const decadeOf = (y: number | null) => (y ? Math.floor(y / 10) * 10 : null)

function similarity(a: DjTrack, b: DjTrack): number {
  let s = 0
  if (a.gkeys.length && b.gkeys.length) {
    const shared = a.gkeys.filter((k) => b.gkeys.includes(k)).length
    s += shared / Math.max(a.gkeys.length, b.gkeys.length)
  }
  if (a.year && b.year) s += Math.max(0, 1 - Math.abs(a.year - b.year) / 12) * 0.6
  else if (decadeOf(a.year) === decadeOf(b.year)) s += 0.2
  if (a.bpm && b.bpm) s += Math.max(0, 1 - Math.abs(a.bpm - b.bpm) / 50) * 0.2
  return s
}

/**
 * Order a long list for flow: a strong opener (most played / livelier, among the top few), then
 * each next song the closest neighbour of the last (genre, era, tempo) with a little chance, never
 * the same artist back to back (and the same album only when nothing else is left).
 */
export function flowOrder(songs: DjTrack[], rng: Rng, first?: DjTrack): DjTrack[] {
  if (songs.length <= 2) return first ? [first, ...songs.filter((t) => t !== first)] : songs
  const left = [...songs]
  const strength = (t: DjTrack) => Math.log1p(t.plays) + (t.bpm ? Math.max(-1, Math.min(1, (t.bpm - 110) / 50)) : 0) + rng() * 0.8
  let cur = first ?? [...left].sort((a, b) => strength(b) - strength(a))[Math.floor(rng() * Math.min(3, left.length))]
  left.splice(left.indexOf(cur), 1)
  const out = [cur]
  while (left.length) {
    // an artist holding more than half of what's left goes now, or it would end up back to back
    const per = new Map<string, number>()
    for (const t of left) per.set(t.artistId, (per.get(t.artistId) ?? 0) + 1)
    let must: string | null = null
    for (const [a, n] of per) if (a !== cur.artistId && n > left.length / 2) must = a
    let best = -1
    let bestS = -Infinity
    for (let i = 0; i < left.length; i++) {
      const t = left[i]
      let s = similarity(cur, t) + rng() * 0.9 + (per.get(t.artistId)! / left.length) * 1.5
      if (must && t.artistId !== must) s -= 20
      if (t.artistId === cur.artistId) s -= 10
      if (t.albumId === cur.albumId) s -= 3
      if (s > bestS) {
        bestS = s
        best = i
      }
    }
    cur = left[best]
    left.splice(best, 1)
    out.push(cur)
  }
  return out
}

/* ── Inputs ─────────────────────────────────────────── */

export type HistoryLevel = 'none' | 'early' | 'full'

export interface MixInput {
  /** built with plays before `day.start` and `now = day.start` (so `plays` / `last` are as of 06:00) */
  lib: DjLibrary
  day: MixDay
  /** plays per track in the 90 days before `day.start` */
  recent90: Map<string, number>
  /** ms of the first play ever (0 = none) */
  historyStart: number
  /** all plays before `day.start` */
  totalPlays: number
  /** artist id → name (album artists; titles and subtitles) */
  artistName: (id: string) => string
}

export function historyLevel(totalPlays: number, historyStart: number, now: number): HistoryLevel {
  if (!totalPlays) return 'none'
  if (totalPlays < 150 || now - historyStart < 21 * DAY) return 'early'
  return 'full'
}

/* ── Mixes ──────────────────────────────────────────── */

export type MixKind = 'daily' | 'deep' | 'redis'

export interface MixPlan {
  /** `daily-<seed genre>`, `deepcuts`, `rediscover` */
  id: string
  kind: MixKind
  /** Daily Mix number (1–6) */
  n?: number
  title: string
  sub: string
  /** one line on the mix page */
  why: string
  hue: number
  /** up to four album ids for the cover mosaic (one per artist where possible) */
  coverAlbums: string[]
  trackIds: string[]
  /** songs never played (as of 06:00) */
  newCount: number
  /** genre keys (Daily) */
  genres?: string[]
}

export interface MixSet {
  day: string
  level: HistoryLevel
  items: MixPlan[]
  dailyCount: number
  /** songs the mixes were made from */
  songCount: number
}

const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function coverAlbumsOf(songs: DjTrack[]): string[] {
  const count = new Map<string, { n: number; artist: string; first: number }>()
  songs.forEach((t, i) => {
    const c = count.get(t.albumId)
    if (c) c.n++
    else count.set(t.albumId, { n: 1, artist: t.artistId, first: i })
  })
  const ranked = [...count].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first)
  const out: string[] = []
  const artists = new Set<string>()
  for (const [id, c] of ranked) {
    if (out.length >= 4) break
    if (artists.has(c.artist)) continue
    artists.add(c.artist)
    out.push(id)
  }
  for (const [id] of ranked) {
    if (out.length >= 4) break
    if (!out.includes(id)) out.push(id)
  }
  return out
}

function topArtists(songs: DjTrack[], n: number, names: (id: string) => string): string[] {
  const m = new Map<string, number>()
  for (const t of songs) m.set(t.artistId, (m.get(t.artistId) ?? 0) + 1)
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => names(id) || songs.find((t) => t.artistId === id)?.artist || '')
    .filter(Boolean)
}

/** Genre clusters for the Daily Mixes. */
export function genreClusters(input: MixInput): { keys: string[]; songs: DjTrack[]; plays: number }[] {
  const { lib, recent90 } = input
  const libCount = new Map<string, number>()
  const playCount = new Map<string, number>()
  const sets = new Map<string, Set<string>>()
  let playTotal = 0
  for (const t of lib.tracks) {
    const p = recent90.get(t.id) ?? 0
    if (t.gkeys.length) playTotal += p
    for (const k of t.gkeys) {
      libCount.set(k, (libCount.get(k) ?? 0) + 1)
      if (p) playCount.set(k, (playCount.get(k) ?? 0) + p)
      let s = sets.get(k)
      if (!s) sets.set(k, (s = new Set()))
      s.add(`al:${t.albumId}`)
      s.add(`ar:${t.artistId}`)
    }
  }
  const withGenre = Math.max(1, lib.withGenre)
  const weight = (k: string) => {
    const ls = (libCount.get(k) ?? 0) / withGenre
    if (!playTotal) return ls
    return 0.5 * ((playCount.get(k) ?? 0) / playTotal) + 0.5 * ls
  }
  const jac = (a: string, b: string) => {
    const A = sets.get(a)!
    const B = sets.get(b)!
    let inter = 0
    for (const x of A) if (B.has(x)) inter++
    return inter / (A.size + B.size - inter)
  }
  const ranked = [...libCount.keys()].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))
  const used = new Set<string>()
  const out: { keys: string[]; songs: DjTrack[]; plays: number }[] = []
  for (const g of ranked) {
    if (out.length >= MAX_DAILY) break
    if (used.has(g) || (libCount.get(g) ?? 0) < 6) continue
    const keys = [g]
    const near = ranked
      .filter((x) => x !== g && !used.has(x))
      .map((x) => ({ x, j: jac(g, x) }))
      .filter((r) => r.j >= 0.12)
      .sort((a, b) => b.j - a.j || weight(b.x) - weight(a.x))
    for (const { x } of near) {
      if (keys.length >= 3) break
      // a third genre only while the mix is still short of songs
      if (keys.length === 2 && countSongs(lib, keys) >= DAILY_SIZE * 1.6) break
      keys.push(x)
    }
    const set = new Set(keys)
    const songs = lib.tracks.filter((t) => t.gkeys.some((k) => set.has(k)))
    if (songs.length < MIN_DAILY) continue
    keys.forEach((k) => used.add(k))
    out.push({ keys, songs, plays: songs.reduce((s, t) => s + (recent90.get(t.id) ?? 0), 0) })
  }
  return out
}

function countSongs(lib: DjLibrary, keys: string[]) {
  const set = new Set(keys)
  let n = 0
  for (const t of lib.tracks) if (t.gkeys.some((k) => set.has(k))) n++
  return n
}

const RECENT_MS = 3 * DAY

function songWeight(t: DjTrack, now: number, rng: Rng) {
  let w = 1
  if (t.penalty) w *= 0.3
  if (t.last > now - RECENT_MS) w *= 0.5
  return w * (0.35 + rng())
}

function dailyMix(input: MixInput, cluster: { keys: string[]; songs: DjTrack[] }, n: number): MixPlan {
  const { lib, day } = input
  const id = `daily-${slug(lib.genreByKey.get(cluster.keys[0])?.name ?? cluster.keys[0])}`
  const rng = rngFor(day.key, id)
  const now = lib.now
  const caps = { album: 2, artist: 4 }
  const fav = cluster.songs.filter((t) => t.plays >= 2)
  const known = cluster.songs.filter((t) => t.plays === 1)
  const never = cluster.songs.filter((t) => t.plays === 0)
  const w = (t: DjTrack) => songWeight(t, now, rng) * (t.plays >= 2 ? Math.log2(2 + t.plays) : 1)
  let picked: DjTrack[] = []
  for (const [bucket, share] of [
    [fav, 0.4],
    [known, 0.4],
    [never, 0.2],
  ] as const) {
    picked = [...picked, ...pickCapped(bucket, Math.round(DAILY_SIZE * share), w, caps, picked, false)]
  }
  if (picked.length < DAILY_SIZE) picked = [...picked, ...pickCapped(cluster.songs, DAILY_SIZE - picked.length, w, caps, picked)]
  // a small cluster: looser caps rather than a mix of a handful of songs
  if (picked.length < MIN_DAILY) picked = [...picked, ...pickCapped(cluster.songs, MIN_DAILY - picked.length, w, { album: 5, artist: 12 }, picked, false)]
  const songs = flowOrder(picked, rng)
  const names = cluster.keys.map((k) => lib.genreByKey.get(k)?.name ?? k)
  const artists = topArtists(songs, 2, input.artistName)
  const newCount = songs.filter((t) => t.plays === 0).length
  const lead = input.totalPlays ? 'Your most played genres lately' : 'The biggest corners of your library'
  return {
    id,
    kind: 'daily',
    n,
    title: names.slice(0, 2).join(' · '),
    sub: artists.length ? `${artists.join(', ')} and more` : names.join(', '),
    why: newCount ? `${lead}, with ${newCount} ${newCount === 1 ? 'song' : 'songs'} you haven't heard yet` : lead,
    hue: genreHue(names[0]),
    coverAlbums: coverAlbumsOf(songs),
    trackIds: songs.map((t) => t.id),
    newCount,
    genres: cluster.keys,
  }
}

/** Most played artists in the 90 days (track artists), else the ones with the most albums. */
export function topArtistIds(input: MixInput, n: number): { ids: string[]; byPlays: boolean } {
  const plays = new Map<string, number>()
  for (const t of input.lib.tracks) {
    const p = input.recent90.get(t.id) ?? 0
    if (p) plays.set(t.artistId, (plays.get(t.artistId) ?? 0) + p)
  }
  if (plays.size >= Math.min(5, n)) return { ids: [...plays].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id), byPlays: true }
  const albums = new Map<string, Set<string>>()
  for (const t of input.lib.tracks) {
    let s = albums.get(t.artistId)
    if (!s) albums.set(t.artistId, (s = new Set()))
    s.add(t.albumId)
  }
  const extra = [...albums]
    .filter(([id]) => !plays.has(id))
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([id]) => id)
  return { ids: [...[...plays].sort((a, b) => b[1] - a[1]).map(([id]) => id), ...extra].slice(0, n), byPlays: false }
}

function deepCuts(input: MixInput): MixPlan | null {
  const { lib, day } = input
  const rng = rngFor(day.key, 'deepcuts')
  const top = topArtistIds(input, 15)
  const set = new Set(top.ids)
  const pool = lib.tracks.filter((t) => t.plays === 0 && set.has(t.artistId))
  // album openers and singles are the ones you'd have heard
  const w = (t: DjTrack) => songWeight(t, lib.now, rng) * (t.no % 1000 === 1 ? 0.4 : 1)
  const picked = pickCapped(pool, DEEP_SIZE, w, { album: 2, artist: 3 })
  if (picked.length < 12) return null
  const songs = flowOrder(picked, rng)
  const artists = topArtists(songs, 3, input.artistName)
  return {
    id: 'deepcuts',
    kind: 'deep',
    title: 'Deep cuts',
    sub: `Never played, from ${artists.join(', ')}…`,
    why: top.byPlays ? "Songs you've never played, from the artists you play most" : "Songs you've never played, from the artists with the most albums",
    hue: DEEP_HUE,
    coverAlbums: coverAlbumsOf(songs),
    trackIds: songs.map((t) => t.id),
    newCount: songs.length,
  }
}

function rediscoverMix(input: MixInput): MixPlan | null {
  const { lib, day } = input
  if (!input.totalPlays) return null
  const rng = rngFor(day.key, 'rediscover')
  // history started Oct 15 2026: until it is two months old, "not lately" means 30 days
  const days = input.historyStart && input.historyStart < day.start - 60 * DAY ? 60 : 30
  const before = day.start - days * DAY
  const pool = lib.tracks.filter((t) => t.plays >= 2 && t.last > 0 && t.last < before).sort((a, b) => b.plays - a.plays || a.last - b.last)
  const top = pool.slice(0, REDIS_SIZE * 2)
  const picked = pickCapped(top, REDIS_SIZE, (t) => Math.log2(1 + t.plays) * (0.5 + rng()) * (t.penalty ? 0.3 : 1), { album: 2, artist: 4 })
  if (picked.length < 15) return null
  const songs = flowOrder(picked, rng)
  const lasts = songs.map((t) => t.last).sort((a, b) => a - b)
  const mid = new Date(lasts[Math.floor(lasts.length / 2)])
  const season = `${SEASON[mid.getMonth()]} ${mid.getMonth() === 11 ? mid.getFullYear() + 1 : mid.getFullYear()}`
  const cut = new Date(before)
  return {
    id: 'rediscover',
    kind: 'redis',
    title: 'Rediscover',
    sub: `Songs you loved in ${season}`,
    why: `Songs you played a lot, then let go. None of them heard since ${cut.getDate()} ${MONTHS[cut.getMonth()]}`,
    hue: REDIS_HUE,
    coverAlbums: coverAlbumsOf(songs),
    trackIds: songs.map((t) => t.id),
    newCount: 0,
  }
}

export function buildMixSet(input: MixInput): MixSet {
  const level = historyLevel(input.totalPlays, input.historyStart, input.day.start)
  let clusters = genreClusters(input)
  if (level === 'none') clusters = clusters.slice(0, 2)
  else if (level === 'early') {
    const played = clusters.filter((c) => c.plays >= 5).slice(0, 3)
    clusters = played.length ? played : clusters.slice(0, 2)
  }
  const items: MixPlan[] = []
  for (const cl of clusters) {
    const m = dailyMix(input, cl, items.length + 1)
    if (m.trackIds.length >= 15) items.push(m)
  }
  const dailyCount = items.length
  const deep = deepCuts(input)
  if (deep) items.push(deep)
  const redis = level === 'full' ? rediscoverMix(input) : null
  if (redis) items.push(redis)
  return { day: input.day.key, level, items, dailyCount, songCount: input.lib.tracks.length }
}

/* ── Radio ──────────────────────────────────────────── */

export type RadioSeedType = 'artist' | 'song' | 'album'
export interface RadioSeed {
  type: RadioSeedType
  id: string
}
export const radioId = (s: RadioSeed) => `radio:${s.type}:${s.id}`
export function parseRadioId(id: string): RadioSeed | null {
  const m = /^radio:(artist|song|album):(.+)$/.exec(id)
  return m ? { type: m[1] as RadioSeedType, id: m[2] } : null
}

export interface RadioProfile {
  seed: RadioSeed
  /** the seed's artist (song / album: its artist) */
  artistId: string
  /** genre key → share among the seed's songs */
  genres: Map<string, number>
  year: number | null
  bpm: number | null
  /** the seed's own songs (song: just it) */
  own: DjTrack[]
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function radioProfile(lib: DjLibrary, seed: RadioSeed): RadioProfile | null {
  const own =
    seed.type === 'song' ? [lib.byId.get(seed.id)].filter((t): t is DjTrack => !!t) : lib.tracks.filter((t) => (seed.type === 'artist' ? t.artistId === seed.id : t.albumId === seed.id))
  if (!own.length) return null
  const g = new Map<string, number>()
  for (const t of own) for (const k of t.gkeys) g.set(k, (g.get(k) ?? 0) + 1)
  for (const [k, v] of g) g.set(k, v / own.length)
  const artistCount = new Map<string, number>()
  for (const t of own) artistCount.set(t.artistId, (artistCount.get(t.artistId) ?? 0) + 1)
  const artistId = seed.type === 'artist' ? seed.id : [...artistCount].sort((a, b) => b[1] - a[1])[0][0]
  return {
    seed,
    artistId,
    genres: g,
    year: median(own.map((t) => t.year).filter((y): y is number => !!y)),
    bpm: median(own.map((t) => t.bpm).filter((b): b is number => !!b)),
    own,
  }
}

/**
 * Neighbour weight of each artist (0..1): a Deezer-related library artist (rank-weighted), or an
 * artist sharing the seed's genres; with no Deezer result it falls back to genres only.
 */
export function neighbourWeights(lib: DjLibrary, prof: RadioProfile, related: string[] | null): Map<string, number> {
  const out = new Map<string, number>()
  if (related?.length) related.forEach((id, i) => out.set(id, 1 - (i / related.length) * 0.6))
  const shared = new Map<string, number>()
  const n = new Map<string, number>()
  for (const t of lib.tracks) {
    if (t.artistId === prof.artistId) continue
    let s = 0
    for (const k of t.gkeys) s += prof.genres.get(k) ?? 0
    shared.set(t.artistId, (shared.get(t.artistId) ?? 0) + Math.min(1, s))
    n.set(t.artistId, (n.get(t.artistId) ?? 0) + 1)
  }
  for (const [id, s] of shared) {
    const v = (s / (n.get(id) ?? 1)) * (related?.length ? 0.45 : 0.8)
    if (v > (out.get(id) ?? 0)) out.set(id, v)
  }
  return out
}

/** The first song of a run: the seed song, else a strong track of the seed artist / album. */
export function radioOpener(prof: RadioProfile, rng: Rng): DjTrack {
  if (prof.seed.type === 'song') return prof.own[0]
  const ranked = [...prof.own].sort((a, b) => b.plays - a.plays || (a.penalty ? 1 : 0) - (b.penalty ? 1 : 0))
  const top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 4)))
  return top[Math.floor(rng() * top.length)]
}

export interface RadioBatchOpts {
  /** songs already in this run (never twice) */
  used: Set<string>
  /** neighbourWeights() */
  neighbours: Map<string, number>
  size: number
  rng: Rng
  /** seed-artist songs so far in the run, and the run length (max 1 in 4 from the seed artist) */
  seedArtistSoFar?: number
  runSoFar?: number
}

/** Similarity of a candidate to the seed: genre 40 %, related artists 25 %, era 15 %, seed artist 15 %, bpm 5 %. */
export function radioScore(t: DjTrack, prof: RadioProfile, neighbours: Map<string, number>): number {
  let g = 0
  for (const k of t.gkeys) g = Math.max(g, prof.genres.get(k) ?? 0)
  const gen = t.gkeys.length ? Math.min(1, g * 1.25) : 0
  const rel = neighbours.get(t.artistId) ?? 0
  const era = prof.year && t.year ? Math.max(0, 1 - Math.abs(prof.year - t.year) / 15) : 0.4
  const self = t.artistId === prof.artistId ? 1 : 0
  const bpm = prof.bpm && t.bpm ? Math.max(0, 1 - Math.abs(prof.bpm - t.bpm) / 40) : 0.4
  return 0.4 * gen + 0.25 * rel + 0.15 * era + 0.15 * self + 0.05 * bpm
}

export function radioBatch(lib: DjLibrary, prof: RadioProfile, o: RadioBatchOpts): DjTrack[] {
  const now = lib.now
  const scored = lib.tracks
    .filter((t) => !o.used.has(t.id))
    .map((t) => {
      let s = radioScore(t, prof, o.neighbours)
      if (t.last > now - RECENT_MS) s *= 0.5
      if (t.penalty) s *= 0.3
      if (t.plays === 0) s *= 1.08
      return { t, base: s, s: s * (0.6 + 0.8 * o.rng()) }
    })
  const seedCap = Math.max(0, Math.floor(((o.runSoFar ?? 0) + o.size) / 4) - (o.seedArtistSoFar ?? 0))
  const pick = (threshold: number, taken: DjTrack[]) => {
    const pool = scored.filter((x) => x.base >= threshold).map((x) => x.t)
    const w = new Map(scored.map((x) => [x.t.id, x.s]))
    const out: DjTrack[] = []
    let seedN = taken.filter((t) => t.artistId === prof.artistId).length
    for (const t of pickCapped(pool, o.size * 2, (t) => w.get(t.id) ?? 0, { album: 2, artist: 3 }, taken, false)) {
      if (out.length + taken.length >= o.size) break
      if (t.artistId === prof.artistId) {
        if (seedN >= seedCap) continue
        seedN++
      }
      out.push(t)
    }
    return out
  }
  let out = pick(0.3, [])
  if (out.length < o.size) out = [...out, ...pick(0.12, out)]
  if (out.length < o.size) out = [...out, ...pick(0, out)]
  return flowOrder(out.slice(0, o.size), o.rng)
}
