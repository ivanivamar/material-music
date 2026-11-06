/**
 * DJ engine (step 22a): pure functions, no stores, no DOM — headless-testable.
 *
 * A DJ run is a chain of sessions: 6–9 songs (random per session) around one theme, introduced by
 * a short spoken line. This file decides everything about a session except playing it:
 *
 *   buildLibrary()  per-track facts the DJ needs (plays, last played, added, genres, era), once per
 *                   catalogue / history / genres change
 *   buildSession()  pick a theme (weighted by what the DJ has learned, ~15 % exploration, never the
 *                   same kind twice in a row), a size, a pool, the songs (max 1 per album / 2 per
 *                   artist, fresh songs preferred), an order with a gentle arc, a title and the line
 *
 * Artist variety (Nov 2026 fix): sub-themes and the DJ's own genre picks need a few artists (a
 * one-artist genre or decade used to turn a whole Never played session into that artist); picks
 * are weighted ~1/√(artist's songs in the pool) so big discographies don't win most slots; the last
 * session's artists step back; and the caps are only lifted after the sub-theme is dropped and
 * the fallback pool is tried.
 *   featureScores() learning: session outcomes → scores per feature (theme kind, genre, decade,
 *                   new / familiar / never played), exponential decay with a 60-day half-life
 *
 * Themes. The four session types Ivan can choose (Genre, Never played, Forgotten, New additions);
 * Endless mode (all four on) also mixes in Favourites, Decade, Artist sets and Wildcards.
 * Forgotten = played before, not in the last six months. History only starts on Oct 15 2026, so
 * until spring 2027 Forgotten quietly fills its sessions with never-played songs.
 *
 * Liked songs (Nov 2026). The hearts matter to some sessions, not all (LIKED_SHARE: about how much
 * of the session goes to liked songs first, ±25 %, when the theme has them; the rest is picked
 * as usual and may hold more by chance):
 *   - Favourites counts a liked song as a favourite even with few plays: about half hearts;
 *   - Forgotten digs up liked songs first ("you even gave some of these a heart"): about half;
 *   - Genre, Decade and Artist sets lean towards liked songs a little: about a quarter to a third;
 *   - Never played, New additions and Wildcards ignore them (those are about discovery).
 * The share grows or shrinks with what the DJ learns (feature `liked:yes`: sessions that were
 * mostly hearts, played through or skipped).
 * Endless also has its own Liked songs session (kind `liked`): only hearted songs, the ones not
 * heard lately first, sometimes narrowed to a genre or an era. Liking a song during a session
 * counts as keeping it (learning +0.3, like saving it to a playlist).
 */

export type DjType = 'genre' | 'never' | 'forgotten' | 'new'
export type ThemeKind = DjType | 'favourites' | 'decade' | 'artist' | 'wild' | 'liked'
export const DJ_TYPES: DjType[] = ['genre', 'never', 'forgotten', 'new']

export const TYPE_LABEL: Record<ThemeKind, string> = {
  genre: 'Genre',
  never: 'Never played',
  forgotten: 'Forgotten',
  new: 'New additions',
  favourites: 'Favourites',
  decade: 'Decade',
  artist: 'Artist set',
  wild: 'Wildcard',
  liked: 'Liked songs',
}
/** mono label (session type line, panel) */
export const TYPE_UPPER: Record<ThemeKind, string> = {
  genre: 'GENRE',
  never: 'NEVER PLAYED',
  forgotten: 'FORGOTTEN',
  new: 'NEW ADDITIONS',
  favourites: 'FAVOURITES',
  decade: 'DECADE',
  artist: 'ARTIST SET',
  wild: 'WILDCARD',
  liked: 'LIKED SONGS',
}

const DAY = 86_400_000
export const FORGOTTEN_MS = 182 * DAY
export const NEW_DAYS = 30
const RECENT_MS = 3 * DAY
/** a liked song not heard for this long is a "forgotten heart" (Liked songs sessions dig these up first) */
const LIKED_STALE_MS = 30 * DAY
/**
 * Share of a session kept for liked songs, per session kind. The kinds left out don't look at the
 * hearts at all (a Liked songs session is all hearts by its pool).
 */
export const LIKED_SHARE: Partial<Record<ThemeKind, number>> = { favourites: 0.5, forgotten: 0.5, genre: 0.3, decade: 0.3, artist: 0.25 }
export const MIN_SIZE = 6
export const MAX_SIZE = 9

/* ── Random ─────────────────────────────────────────── */

export type Rng = () => number

/** Small seedable PRNG (mulberry32) so tests are repeatable; the app passes Math.random. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  let total = 0
  const ws = items.map((t) => {
    const w = Math.max(0, weight(t))
    total += w
    return w
  })
  if (!items.length || total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/* ── Library facts ──────────────────────────────────── */

export interface DjTrack {
  id: string
  title: string
  artist: string
  artistId: string
  albumId: string
  /** track number (album neighbours) */
  no: number
  year: number | null
  duration: number
  bpm: number | null
  /** ms */
  addedAt: number
  /** display names, as the genres store gives them */
  genres: string[]
  /** folded keys of `genres` */
  gkeys: string[]
  plays: number
  /** ms of the last play, 0 = never */
  last: number
  /** skipped early recently: picked less for a while */
  penalty: boolean
  /** in Liked songs: when it was liked (ms), 0 = not liked */
  liked: number
}

export interface GenreInfo {
  key: string
  name: string
  /** songs (in the allowed set) */
  count: number
}

export interface DjLibrary {
  tracks: DjTrack[]
  byId: Map<string, DjTrack>
  /** most songs first */
  genres: GenreInfo[]
  genreByKey: Map<string, GenreInfo>
  /** genre key → keys that share albums with it, most shared first */
  neighbours: Map<string, string[]>
  now: number
  /** songs with at least one genre */
  withGenre: number
  /** liked songs (in the allowed set) */
  likedCount: number
}

export interface LibraryInput {
  tracks: Iterable<{ id: string; title: string; artist: string; artistId: string; albumId: string; track: number | null; disc?: number; duration?: number; bpm?: number; addedAt: string }>
  albums: Record<string, { id: string; title: string; year?: number; date?: string; addedAt?: string }>
  /** album id → its genres (display names) */
  genreOf: (albumId: string) => string[]
  /** plays, any order; `at` in Unix seconds */
  plays: Iterable<{ trackId: string; at: number }>
  /** only these tracks (offline on the phone); null = all */
  allowed?: Set<string> | null
  /** trackId → ms until which an early skip still counts against it */
  penalties?: Record<string, number>
  /** trackId → when it was liked (ms): the Liked songs playlist */
  liked?: ReadonlyMap<string, number>
  now: number
}

export const foldKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()

function yearOf(a: { year?: number; date?: string } | undefined): number | null {
  if (!a) return null
  if (a.year && a.year > 0) return a.year
  const m = /^(\d{4})/.exec(a.date ?? '')
  return m ? Number(m[1]) : null
}

export function buildLibrary(input: LibraryInput): DjLibrary {
  const count = new Map<string, number>()
  const last = new Map<string, number>()
  for (const p of input.plays) {
    count.set(p.trackId, (count.get(p.trackId) ?? 0) + 1)
    const ms = p.at * 1000
    if (ms > (last.get(p.trackId) ?? 0)) last.set(p.trackId, ms)
  }
  const genreCache = new Map<string, { names: string[]; keys: string[] }>()
  const tracks: DjTrack[] = []
  const gcount = new Map<string, { name: string; n: number }>()
  const pairs = new Map<string, Map<string, number>>()
  const seenAlbum = new Set<string>()
  let withGenre = 0
  for (const t of input.tracks) {
    if (input.allowed && !input.allowed.has(t.id)) continue
    let g = genreCache.get(t.albumId)
    if (!g) {
      const names: string[] = []
      const keys: string[] = []
      for (const n of input.genreOf(t.albumId)) {
        const k = foldKey(n)
        if (!k || keys.includes(k)) continue
        keys.push(k)
        names.push(n)
      }
      genreCache.set(t.albumId, (g = { names, keys }))
    }
    const album = input.albums[t.albumId]
    const added = Date.parse(t.addedAt || album?.addedAt || '') || 0
    tracks.push({
      id: t.id,
      title: t.title,
      artist: t.artist,
      artistId: t.artistId,
      albumId: t.albumId,
      no: (t.disc ?? 1) * 1000 + (t.track ?? 0),
      year: yearOf(album),
      duration: t.duration ?? 0,
      bpm: t.bpm && t.bpm > 30 && t.bpm < 260 ? t.bpm : null,
      addedAt: added,
      genres: g.names,
      gkeys: g.keys,
      plays: count.get(t.id) ?? 0,
      last: last.get(t.id) ?? 0,
      penalty: (input.penalties?.[t.id] ?? 0) > input.now,
      liked: input.liked?.get(t.id) ?? 0,
    })
    if (g.keys.length) withGenre++
    g.keys.forEach((k, i) => {
      const cur = gcount.get(k)
      if (cur) cur.n++
      else gcount.set(k, { name: g.names[i], n: 1 })
    })
    if (!seenAlbum.has(t.albumId)) {
      seenAlbum.add(t.albumId)
      for (const a of g.keys)
        for (const b of g.keys) {
          if (a === b) continue
          let m = pairs.get(a)
          if (!m) pairs.set(a, (m = new Map()))
          m.set(b, (m.get(b) ?? 0) + 1)
        }
    }
  }
  const genres = [...gcount].map(([key, v]) => ({ key, name: v.name, count: v.n })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const neighbours = new Map<string, string[]>()
  for (const [k, m] of pairs) neighbours.set(k, [...m].sort((a, b) => b[1] - a[1]).map(([x]) => x))
  const likedCount = tracks.reduce((n, t) => n + (t.liked ? 1 : 0), 0)
  return { tracks, byId: new Map(tracks.map((t) => [t.id, t])), genres, genreByKey: new Map(genres.map((g) => [g.key, g])), neighbours, now: input.now, withGenre, likedCount }
}

/* ── Pools ──────────────────────────────────────────── */

export const isNever = (t: DjTrack) => t.plays === 0
export const isForgotten = (t: DjTrack, now: number) => t.plays > 0 && t.last < now - FORGOTTEN_MS
export const isNew = (t: DjTrack, now: number, days = NEW_DAYS) => t.addedAt > now - days * DAY
export const isLiked = (t: DjTrack) => t.liked > 0

export interface TypeCounts {
  total: number
  never: number
  forgotten: number
  new: number
}

export function typeCounts(lib: DjLibrary): TypeCounts {
  let never = 0
  let forgotten = 0
  let fresh = 0
  for (const t of lib.tracks) {
    if (isNever(t)) never++
    else if (isForgotten(t, lib.now)) forgotten++
    if (isNew(t, lib.now)) fresh++
  }
  return { total: lib.tracks.length, never, forgotten, new: fresh }
}

/** Songs for a genre selection (any of the keys). */
export function genreSongCount(lib: DjLibrary, keys: string[]): number {
  if (!keys.length) return 0
  const set = new Set(keys)
  let n = 0
  for (const t of lib.tracks) if (t.gkeys.some((k) => set.has(k))) n++
  return n
}

/* ── Sessions ───────────────────────────────────────── */

export interface Theme {
  kind: ThemeKind
  /** genre keys (genre sessions; also a sub-theme of never / forgotten) */
  genres?: string[]
  decade?: number
  artistId?: string
}

export interface Mode {
  /** session types this run may use (at least one) */
  types: DjType[]
  /** genres picked on the start view (keys); empty = the DJ picks */
  genres: string[]
  /** Endless (Start DJ): extra theme kinds when all four types are on */
  endless: boolean
}

export interface SessionPlan {
  theme: Theme
  /** songs in play order */
  songs: string[]
  title: string
  /** spoken intro */
  line: string
  /** shortage note under the subtitle, e.g. "Only 3 never-played songs left, mixing in forgotten ones." */
  note: string | null
  /** learning features */
  features: string[]
}

export interface BuildContext {
  /** songs already in this run (never twice in a run) */
  used: Set<string>
  /** songs skipped early in this run (soft) */
  skipped?: Set<string>
  /** the theme before this one (no same kind twice; genre drift) */
  last?: Theme | null
  /** the previous session was skipped with the DJ button */
  lastSkipped?: boolean
  scores?: Map<string, number>
  rng?: Rng
  /** number of this session in the run (1-based) */
  n?: number
  /** songs of the session before this one (its artists step back a little, so sessions differ) */
  lastSongs?: string[]
}

const score = (scores: Map<string, number> | undefined, f: string) => Math.max(-2.5, Math.min(2.5, scores?.get(f) ?? 0))
const boost = (scores: Map<string, number> | undefined, f: string) => Math.exp(0.6 * score(scores, f))

const BASE_WEIGHT: Record<ThemeKind, number> = { genre: 3, never: 2, forgotten: 1.4, new: 1.6, favourites: 1.1, decade: 1, artist: 1, wild: 0.7, liked: 1.2 }
const EXPLORE = 0.15

const decadeOf = (y: number | null) => (y ? Math.floor(y / 10) * 10 : null)

function dominant<T>(items: T[], min: number): T | null {
  const m = new Map<T, number>()
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1)
  let best: T | null = null
  let n = 0
  for (const [k, v] of m)
    if (v > n) {
      best = k
      n = v
    }
  return best !== null && n / Math.max(1, items.length) >= min ? best : null
}

/**
 * A (sub-)theme needs enough artists to fill a session within the per-artist cap (2), else a niche
 * genre or decade owned by one artist turned a whole Never played session into that artist.
 */
const minArtists = (size: number) => Math.max(3, Math.ceil(size / 2))

interface Picked {
  theme: Theme
  pool: DjTrack[]
}

/** Genre keys for a genre session: the start view's picks, else a seed + 0–2 neighbours. */
function pickGenres(lib: DjLibrary, mode: Mode, avail: DjTrack[], ctx: BuildContext, rng: Rng): string[] | null {
  const counts = new Map<string, number>()
  for (const t of avail) for (const k of t.gkeys) counts.set(k, (counts.get(k) ?? 0) + 1)
  if (mode.genres.length) {
    const live = mode.genres.filter((k) => (counts.get(k) ?? 0) > 0)
    if (!live.length) return null
    if (live.length <= 2) return live
    // more than two picked: take turns with 2–3 of them so sessions differ
    const size = Math.min(live.length, 2 + Math.floor(rng() * 2))
    const order = [...live].sort(() => rng() - 0.5)
    return order.slice(0, size)
  }
  const lastG = new Set(ctx.last?.genres ?? [])
  const near = new Set([...lastG].flatMap((k) => (lib.neighbours.get(k) ?? []).slice(0, 4)))
  const gArtists = new Map<string, Set<string>>()
  for (const t of avail)
    for (const k of t.gkeys) {
      let s = gArtists.get(k)
      if (!s) gArtists.set(k, (s = new Set()))
      s.add(t.artistId)
    }
  // the DJ's own picks: genres with a few artists in them (a one-artist genre is an Artist set, not a Genre session)
  let cands = [...counts].filter(([k, n]) => n >= 3 && (gArtists.get(k)?.size ?? 0) >= 3).map(([k]) => k)
  if (!cands.length) cands = [...counts].filter(([, n]) => n >= 3).map(([k]) => k)
  const seed = weighted(cands, (k) => Math.sqrt(counts.get(k)!) * boost(ctx.scores, `genre:${k}`) * (near.has(k) ? 1.8 : lastG.has(k) ? 0.6 : 1), rng)
  if (!seed) return null
  const out = [seed]
  const want = Math.floor(rng() * 3) // 0–2 neighbours
  for (const k of lib.neighbours.get(seed) ?? []) {
    if (out.length > want) break
    if ((counts.get(k) ?? 0) >= 2 && rng() < 0.75) out.push(k)
  }
  return out
}

/** Optional sub-theme for never / forgotten / new / liked: a decade or a genre with enough songs. */
function subTheme(pool: DjTrack[], size: number, rng: Rng): { decade?: number; genres?: string[] } {
  if (pool.length < size * 3 || rng() < 0.4) return {}
  // songs and artists per candidate: a sub-theme needs enough of both (see minArtists)
  const tally = <K,>(keysOf: (t: DjTrack) => K[]) => {
    const m = new Map<K, { n: number; artists: Set<string> }>()
    for (const t of pool)
      for (const k of keysOf(t)) {
        let e = m.get(k)
        if (!e) m.set(k, (e = { n: 0, artists: new Set() }))
        e.n++
        e.artists.add(t.artistId)
      }
    return weighted(
      [...m].filter(([, e]) => e.n >= size + 2 && e.artists.size >= minArtists(size)).map(([k]) => k),
      (k) => Math.sqrt(m.get(k)!.n * m.get(k)!.artists.size),
      rng,
    )
  }
  if (rng() < 0.5) {
    const d = tally((t) => {
      const x = decadeOf(t.year)
      return x ? [x] : []
    })
    return d ? { decade: d } : {}
  }
  const g = tally((t) => t.gkeys)
  return g ? { genres: [g] } : {}
}

function inTheme(t: DjTrack, th: Theme): boolean {
  if (th.decade && decadeOf(t.year) !== th.decade) return false
  if (th.genres?.length && !t.gkeys.some((k) => th.genres!.includes(k))) return false
  return true
}

function poolFor(lib: DjLibrary, kind: ThemeKind, avail: DjTrack[]): DjTrack[] {
  const now = lib.now
  switch (kind) {
    case 'never':
      return avail.filter(isNever)
    case 'forgotten':
      return avail.filter((t) => isForgotten(t, now))
    case 'new': {
      for (const days of [NEW_DAYS, 60, 90]) {
        const p = avail.filter((t) => isNew(t, now, days))
        if (p.length >= MIN_SIZE || days === 90) return p
      }
      return []
    }
    case 'favourites': {
      // the most played, plus every liked song (a heart makes it a favourite even before the plays do)
      const top = avail
        .filter((t) => t.plays >= 2 && !isLiked(t))
        .sort((a, b) => b.plays - a.plays)
        .slice(0, 150)
      return [...avail.filter(isLiked), ...top]
    }
    case 'liked':
      return avail.filter(isLiked)
    default:
      return avail
  }
}

/** Which theme next (Endless: weighted over kinds; a type-only run keeps to its types). */
function pickTheme(lib: DjLibrary, mode: Mode, avail: DjTrack[], size: number, ctx: BuildContext, rng: Rng): Picked {
  const allTypes = DJ_TYPES.every((k) => mode.types.includes(k))
  const kinds: ThemeKind[] = [...mode.types]
  if (mode.endless && allTypes) kinds.push('favourites', 'decade', 'artist', 'wild', 'liked')
  const pools = new Map<ThemeKind, DjTrack[]>()
  const poolOf = (k: ThemeKind) => {
    let p = pools.get(k)
    if (!p) pools.set(k, (p = poolFor(lib, k, avail)))
    return p
  }
  // usable: enough songs (Forgotten borrows never-played songs while history is young)
  const usable = kinds.filter((k) => {
    if (k === 'genre') return avail.some((t) => t.gkeys.length)
    if (k === 'forgotten') return poolOf('forgotten').length > 0 || poolOf('never').length > 0
    if (k === 'decade') return avail.some((t) => t.year)
    if (k === 'artist') return avail.length >= size
    return poolOf(k).length >= (k === 'favourites' || k === 'liked' ? size : 1)
  })
  let cands = usable.length ? usable : (['wild'] as ThemeKind[])
  if (cands.length > 1 && ctx.last) cands = cands.filter((k) => k !== ctx.last!.kind) // never twice in a row
  const explore = rng() < EXPLORE
  const kind = explore
    ? cands[Math.floor(rng() * cands.length)]
    : weighted(cands, (k) => BASE_WEIGHT[k] * boost(ctx.scores, `type:${k}`) * (k === 'forgotten' && !poolOf('forgotten').length ? 0.4 : 1), rng)!

  if (kind === 'genre') {
    const genres = pickGenres(lib, mode, avail, ctx, rng)
    if (genres?.length) {
      const pool = avail.filter((t) => t.gkeys.some((k) => genres.includes(k)))
      // a big pool may narrow to one era so sessions of the same genres differ
      const sub = pool.length > size * 4 && rng() < 0.35 ? subTheme(pool, size, rng) : {}
      const theme: Theme = { kind, genres, ...(sub.decade ? { decade: sub.decade } : {}) }
      return { theme, pool: pool.filter((t) => inTheme(t, theme)) }
    }
    return { theme: { kind: 'wild' }, pool: avail }
  }
  if (kind === 'decade') {
    const m = new Map<number, number>()
    const da = new Map<number, Set<string>>()
    for (const t of avail) {
      const d = decadeOf(t.year)
      if (!d) continue
      m.set(d, (m.get(d) ?? 0) + 1)
      let s = da.get(d)
      if (!s) da.set(d, (s = new Set()))
      s.add(t.artistId)
    }
    const varied = [...m.keys()].filter((d) => da.get(d)!.size >= minArtists(size))
    const decade = weighted(varied.length ? varied : [...m.keys()], (d) => Math.sqrt(m.get(d)!) * boost(ctx.scores, `decade:${d}`), rng)
    if (decade) return { theme: { kind, decade }, pool: avail.filter((t) => decadeOf(t.year) === decade) }
    return { theme: { kind: 'wild' }, pool: avail }
  }
  if (kind === 'artist') {
    const m = new Map<string, number>()
    for (const t of avail) m.set(t.artistId, (m.get(t.artistId) ?? 0) + 1)
    const artistId = weighted(
      [...m].filter(([, n]) => n >= 4).map(([k]) => k),
      (k) => Math.sqrt(m.get(k)!),
      rng,
    )
    if (artistId) {
      const own = avail.filter((t) => t.artistId === artistId)
      const keys = new Set(own.flatMap((t) => t.gkeys))
      const friends = avail.filter((t) => t.artistId !== artistId && t.gkeys.some((k) => keys.has(k)))
      return { theme: { kind, artistId }, pool: [...own, ...friends] }
    }
    return { theme: { kind: 'wild' }, pool: avail }
  }
  const pool = poolOf(kind)
  if (kind === 'never' || kind === 'forgotten' || kind === 'new' || kind === 'liked') {
    const sub = subTheme(pool, size, rng)
    const theme: Theme = { kind, ...sub }
    return { theme, pool: pool.filter((t) => inTheme(t, theme)) }
  }
  return { theme: { kind }, pool }
}

/** Pick `size` songs from `pool`: weighted by fit + freshness + chance, max per album / artist (+ the liked share). */
type Limits = [perAlbum: number, perArtist: number][]
/** max 1 per album / 2 per artist, then 2 / 3: what a session normally allows */
const STRICT: Limits = [
  [1, 2],
  [2, 3],
]
/** last resort, once every other pool is used up */
const LOOSE: Limits = [[99, 99]]

function pickSongs(pool: DjTrack[], size: number, theme: Theme, lib: DjLibrary, ctx: BuildContext, rng: Rng, taken: DjTrack[] = [], limits: Limits = STRICT): DjTrack[] {
  const share = LIKED_SHARE[theme.kind]
  if (!share || taken.length) return fillSongs(pool, size, theme, lib, ctx, rng, taken, limits)
  // hearts first, up to this session's share (learned: heart-heavy sessions that landed ask for more)
  const want = Math.round(size * Math.min(0.75, share * boost(ctx.scores, 'liked:yes')) * (0.75 + rng() * 0.5))
  const hearts = want > 0 ? fillSongs(pool.filter(isLiked), Math.min(want, size), theme, lib, ctx, rng, [], limits) : []
  return fillSongs(pool, size, theme, lib, ctx, rng, hearts, limits)
}

function fillSongs(pool: DjTrack[], size: number, theme: Theme, lib: DjLibrary, ctx: BuildContext, rng: Rng, taken: DjTrack[] = [], limits: Limits = STRICT): DjTrack[] {
  const out = [...taken]
  const now = lib.now
  // variety: an artist with a big discography shouldn't win most picks just by having more songs
  // (weight ~ 1/√songs in the pool), and the last session's artists step back a little
  const perArtist = new Map<string, number>()
  for (const t of pool) perArtist.set(t.artistId, (perArtist.get(t.artistId) ?? 0) + 1)
  const prevArtists = new Set((ctx.lastSongs ?? []).map((id) => lib.byId.get(id)?.artistId).filter((a): a is string => !!a))
  const fit = (t: DjTrack) => {
    let w = 1
    if (theme.kind === 'favourites') w *= Math.log2(2 + t.plays)
    if (theme.kind === 'new') w *= 1 + Math.max(0, 1 - (now - t.addedAt) / (90 * DAY))
    if (theme.kind === 'artist' && t.artistId === theme.artistId) w *= 2.2
    // a Liked songs session digs up the hearts not heard lately first
    if (theme.kind === 'liked' && t.last < now - LIKED_STALE_MS) w *= 2.2
    if (!(theme.kind === 'artist' && t.artistId === theme.artistId)) {
      w /= Math.sqrt(perArtist.get(t.artistId) ?? 1)
      if (prevArtists.has(t.artistId)) w *= 0.35
    }
    if (t.last > now - RECENT_MS) w *= 0.25 // played in the last 3 days
    if (t.penalty) w *= 0.3
    if (ctx.skipped?.has(t.id)) w *= 0.2
    return w * (0.35 + rng())
  }
  for (const [perAlbum, artistCap] of limits) {
    if (out.length >= size) break
    const albums = new Map<string, number>()
    const artists = new Map<string, number>()
    for (const t of out) {
      albums.set(t.albumId, (albums.get(t.albumId) ?? 0) + 1)
      artists.set(t.artistId, (artists.get(t.artistId) ?? 0) + 1)
    }
    const artistMax = (t: DjTrack) => (theme.kind === 'artist' && t.artistId === theme.artistId ? Math.max(4, artistCap) : artistCap)
    const scored = pool
      .filter((t) => !ctx.used.has(t.id) && !out.includes(t))
      .map((t) => ({ t, w: fit(t) }))
      .sort((a, b) => b.w - a.w)
    for (const { t } of scored) {
      if (out.length >= size) break
      if ((albums.get(t.albumId) ?? 0) >= perAlbum || (artists.get(t.artistId) ?? 0) >= artistMax(t)) continue
      out.push(t)
      albums.set(t.albumId, (albums.get(t.albumId) ?? 0) + 1)
      artists.set(t.artistId, (artists.get(t.artistId) ?? 0) + 1)
    }
  }
  return out
}

/**
 * Order for flow (no mixing, so this is about the feel): a strong opener, the "big" songs in the
 * middle, a calmer closer (play counts and BPM as hints), genre / era drift rather than jumps,
 * and never the same artist twice in a row.
 */
export function orderForFlow(songs: DjTrack[], rng: Rng): DjTrack[] {
  const n = songs.length
  if (n <= 2) return songs
  const strength = new Map(songs.map((t) => [t.id, Math.log1p(t.plays) + (t.bpm ? Math.max(-1, Math.min(1, (t.bpm - 110) / 50)) : 0) + rng() * 0.6]))
  const sorted = [...songs].sort((a, b) => strength.get(b.id)! - strength.get(a.id)!)
  const slots: (DjTrack | null)[] = Array(n).fill(null)
  const mid = Math.floor(n / 2)
  slots[mid] = sorted[0]
  slots[0] = sorted[1]
  slots[n - 1] = sorted[n - 1]
  const rest = sorted.slice(2, n - 1)
  const order: number[] = []
  for (let d = 1; order.length < n; d++) {
    if (mid - d >= 0) order.push(mid - d)
    if (mid + d < n) order.push(mid + d)
    if (mid - d < 0 && mid + d >= n) break
  }
  for (const i of order) if (!slots[i] && rest.length) slots[i] = rest.shift()!
  let out = slots.filter((x): x is DjTrack => !!x)
  // drift: between the fixed opener / peak / closer, neighbours that share a genre or era sit together
  const similar = (a: DjTrack, b: DjTrack) => (a.gkeys.some((k) => b.gkeys.includes(k)) ? 1 : 0) + (decadeOf(a.year) === decadeOf(b.year) ? 0.5 : 0)
  for (let i = 1; i < n - 2; i++) {
    if (i === mid || i + 1 === mid) continue
    if (similar(out[i - 1], out[i + 1]) > similar(out[i - 1], out[i]) && similar(out[i + 1], out[i + 2] ?? out[i + 1]) <= similar(out[i], out[i + 2] ?? out[i])) {
      ;[out[i], out[i + 1]] = [out[i + 1], out[i]]
    }
  }
  // no artist back to back: swap a clashing song with one that clashes with nothing where it lands
  const clash = (a: DjTrack[], i: number) => (i > 0 && a[i].artistId === a[i - 1].artistId ? 1 : 0) + (i < n - 1 && a[i].artistId === a[i + 1].artistId ? 1 : 0)
  const total = (a: DjTrack[]) => a.reduce((s, _, i) => s + clash(a, i), 0)
  out = [...out]
  for (let pass = 0; pass < n && total(out) > 0; pass++) {
    for (let i = 1; i < n; i++) {
      if (out[i].artistId !== out[i - 1].artistId) continue
      const before = total(out)
      for (let k = 0; k < n; k++) {
        if (k === i || k === i - 1) continue
        ;[out[i], out[k]] = [out[k], out[i]]
        if (total(out) < before) break
        ;[out[i], out[k]] = [out[k], out[i]]
      }
    }
  }
  return out
}

/* ── Words ──────────────────────────────────────────── */

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
export const numWord = (n: number) => NUM[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const SEASON = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
/** "2010s" in titles; the voice reads "twenty-tens"-style names poorly, so lines say "the 2010s" too */
const decadeName = (d: number) => `${d}s`

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function pick<T>(xs: T[], rng: Rng): T {
  return xs[Math.floor(rng() * xs.length)]
}

function describe(theme: Theme, songs: DjTrack[], lib: DjLibrary, mode: Mode, ctx: BuildContext, rng: Rng, shortage: { have: number; kind: ThemeKind } | null): { title: string; line: string; note: string | null } {
  // never say how many songs a session has (Ivan doesn't want to know)
  const first = songs[0]?.artist ?? ''
  const gname = (k: string) => lib.genreByKey.get(k)?.name ?? k
  const decade = theme.decade ?? dominant(songs.map((t) => decadeOf(t.year)).filter((d): d is number => !!d), 0.6)
  const gTop = theme.genres?.length ? theme.genres : ((g) => (g ? [g] : []))(dominant(songs.flatMap((t) => t.gkeys.slice(0, 1)), 0.5))
  const flavour = [decade ? decadeName(decade) : null, gTop[0] ? gname(gTop[0]).toLowerCase() : null].filter(Boolean).join(' ')
  const start = pick([`Starting with ${first}.`, `First up, ${first}.`, `${first} gets us going.`], rng)
  let title = TYPE_LABEL[theme.kind]
  let line = ''
  let note: string | null = null

  switch (theme.kind) {
    case 'never': {
      title = flavour ? `Never played · ${flavour}` : 'Never played'
      line = pick(
        [
          `Songs you've never played${flavour ? `. Mostly ${flavour}` : ''}. ${start}`,
          `Next up, songs you own and haven't played yet${flavour ? `, mostly ${flavour}` : ''}. ${start}`,
          `Here are some you've never pressed play on. ${start}`,
        ],
        rng,
      )
      break
    }
    case 'forgotten': {
      const lasts = songs.map((t) => t.last).filter(Boolean).sort((a, b) => a - b)
      if (lasts.length >= Math.ceil(songs.length / 2)) {
        const d = new Date(lasts[Math.floor(lasts.length / 2)])
        const when = `${SEASON[d.getMonth()]} ${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}`
        title = `Forgotten · ${when}`
        line = pick([`You played these back in ${when}, then stopped. ${start}`, `Songs you haven't heard since ${when}. ${start}`], rng)
      } else if (lasts.length) {
        title = flavour ? `Forgotten · ${flavour}` : 'Forgotten'
        line = `Songs you haven't played in a long while. ${start}`
      } else {
        title = flavour ? `Forgotten · ${flavour}` : 'Forgotten'
        line = `Nothing has been gone long enough to be forgotten yet, so here are some you've never played. ${start}`
      }
      break
    }
    case 'new': {
      const artists = dominant(
        songs.map((t) => t.artist),
        0.5,
      )
      title = 'New arrivals'
      line = pick(
        [`Fresh in the library: new arrivals${artists ? `, and most of them are ${artists}` : ''}. ${start}`, `Songs you added recently${artists ? `, mostly ${artists}` : ''}. ${start}`],
        rng,
      )
      break
    }
    case 'genre': {
      const names = (theme.genres ?? []).map(gname)
      title = names.slice(0, 2).join(' × ') + (names.length > 2 ? ` +${names.length - 2}` : '') + (theme.decade ? ` · ${decadeName(theme.decade)}` : '')
      const era = theme.decade ? ` from the ${decadeName(theme.decade)}` : ''
      const learned = score(ctx.scores, `genre:${theme.genres?.[0]}`) > 1.5
      line = mode.genres.length
        ? `You asked for ${list(names)}${era ? `. Here it is${era}` : ''}${names.length > 1 ? ', taking turns' : ''}. ${start}`
        : learned
          ? `You kept the last ${names[0]} sets going, so here's more of that${era}. ${start}`
          : pick([`Some ${list(names)} now${era}. ${start}`, `${cap(list(names))} for a while${era}. ${start}`], rng)
      break
    }
    case 'favourites':
      title = flavour ? `Favourites · ${flavour}` : 'Favourites'
      line = pick([`Songs you keep coming back to. ${start}`, `Some of your most played. ${start}`], rng)
      break
    case 'decade':
      title = `The ${decadeName(theme.decade ?? 2000)}`
      line = pick([`Back to the ${decadeName(theme.decade ?? 2000)}. ${start}`, `Songs from the ${decadeName(theme.decade ?? 2000)}. ${start}`], rng)
      break
    case 'artist': {
      const a = songs.find((t) => t.artistId === theme.artistId)?.artist ?? first
      title = `${a} and friends`
      line = `A set built around ${a}, with a few neighbours in between. ${start}`
      break
    }
    case 'wild':
      title = 'Wildcard'
      line = `No theme this time, just songs from anywhere in the library. ${start}`
      break
    case 'liked': {
      const stale = songs.filter((t) => t.liked && t.last < lib.now - LIKED_STALE_MS).length
      title = flavour ? `Liked songs · ${flavour}` : 'Liked songs'
      line =
        stale >= Math.ceil(songs.length / 2)
          ? pick([`Songs you gave a heart, and haven't heard in a while. ${start}`, `Some of your liked songs you've been neglecting${flavour ? `, mostly ${flavour}` : ''}. ${start}`], rng)
          : pick([`Straight from your liked songs${flavour ? `, mostly ${flavour}` : ''}. ${start}`, `Only songs you've hearted this time. ${start}`, `A run through your liked songs. ${start}`], rng)
      break
    }
  }

  // sessions that lean on the hearts sometimes say so (never with a number)
  const hearts = songs.filter(isLiked).length
  if (LIKED_SHARE[theme.kind] && hearts >= Math.max(2, Math.ceil(songs.length / 3)) && rng() < 0.5) {
    const tail = theme.kind === 'forgotten' ? ` You even gave some of these a heart.` : theme.kind === 'favourites' ? ` Your liked songs are in here too.` : ` Some of your liked songs are in the mix.`
    if (line.endsWith(start)) line = `${line.slice(0, -start.length).trimEnd()}${tail} ${start}`
  }

  if (shortage) {
    // no numbers: they would hint at how long the session is
    const what: Partial<Record<ThemeKind, [string, string]>> = {
      never: [`Running low on never-played songs, mixing in forgotten ones.`, `Running low on songs you've never played, so I've mixed in some you've forgotten.`],
      forgotten: [`Few forgotten songs so far, mixing in never-played ones.`, `Not much is forgotten yet, so I've mixed in some you've never played.`],
      new: [`Few new arrivals, mixing in older songs.`, `Not many new arrivals, so there are some older songs in here too.`],
      genre: [`Running low on ${(theme.genres ?? []).map(gname).join(' and ')}, mixing in neighbouring genres.`, `Running low on those, so I've mixed in some neighbours.`],
      liked: [`Running low on liked songs, mixing in favourites.`, `Not many liked songs left for now, so I've mixed in some favourites.`],
    }
    const w = what[shortage.kind]
    if (w && shortage.have > 0) {
      note = w[0]
      line = `${w[1]} ${start}`
    }
  }
  if (ctx.lastSkipped) line = `${pick(['Fair enough, moving on.', 'Something else, then.', 'Right, changing it up.'], rng)} ${line}`
  return { title, line, note }
}

/** Learning features of a finished session. */
function featuresOf(theme: Theme, songs: DjTrack[], now: number): string[] {
  const f = [`type:${theme.kind}`]
  const gkeys = theme.genres?.length ? theme.genres : ((g) => (g ? [g] : []))(dominant(songs.flatMap((t) => t.gkeys.slice(0, 1)), 0.5))
  for (const k of gkeys.slice(0, 2)) f.push(`genre:${k}`)
  const d = theme.decade ?? dominant(songs.map((t) => decadeOf(t.year)).filter((x): x is number => !!x), 0.5)
  if (d) f.push(`decade:${d}`)
  const fresh = dominant(
    songs.map((t) => (t.plays === 0 ? 'never' : isNew(t, now) ? 'new' : 'familiar')),
    0.5,
  )
  if (fresh) f.push(`fresh:${fresh}`)
  // mostly hearts: learning whether heart-heavy sessions land (Liked songs sessions are their own type)
  if (theme.kind !== 'liked' && songs.filter(isLiked).length * 2 >= songs.length) f.push('liked:yes')
  return f
}

/** Fallback pools when a theme runs short. */
function fallbackPool(lib: DjLibrary, theme: Theme, avail: DjTrack[]): DjTrack[] {
  switch (theme.kind) {
    case 'never':
      return [...avail.filter((t) => isForgotten(t, lib.now)), ...avail.filter((t) => t.plays > 0)]
    case 'forgotten':
      return [...avail.filter(isNever), ...avail]
    case 'new':
      return [...avail.filter(isNever), ...avail]
    case 'liked':
      return [...avail.filter((t) => t.plays >= 2).sort((a, b) => b.plays - a.plays), ...avail]
    case 'genre': {
      const near = new Set((theme.genres ?? []).flatMap((k) => (lib.neighbours.get(k) ?? []).slice(0, 5)))
      return [...avail.filter((t) => t.gkeys.some((k) => near.has(k))), ...avail]
    }
    default:
      return avail
  }
}

/** The next session of a run. Null only when nothing in the library can be played. */
export function buildSession(lib: DjLibrary, mode: Mode, ctx: BuildContext): SessionPlan | null {
  const rng = ctx.rng ?? Math.random
  const avail = lib.tracks.filter((t) => !ctx.used.has(t.id))
  if (!avail.length) return null
  const size = MIN_SIZE + Math.floor(rng() * (MAX_SIZE - MIN_SIZE + 1))
  const picked = pickTheme(lib, mode, avail, size, ctx, rng)
  let theme = picked.theme
  const pool = picked.pool
  let songs = pickSongs(pool, size, theme, lib, ctx, rng)
  let shortage: { have: number; kind: ThemeKind } | null = null
  // Short within the per-artist / per-album caps? Widen step by step, keeping the caps, before
  // ever letting one artist fill the session: (1) drop the sub-theme (era / genre) of a
  // Never played / Forgotten / New / Liked session, (2) the fallback pool, (3) only then lift the caps.
  if (songs.length < size && (theme.decade || theme.genres) && theme.kind !== 'genre') {
    const wide = poolFor(lib, theme.kind, avail)
    songs = pickSongs(wide, size, theme, lib, ctx, rng, songs)
    theme = { kind: theme.kind } // the title / line no longer promise that era or genre
  }
  if (songs.length < size) {
    const have = songs.length
    const fb = fallbackPool(lib, theme, avail)
    songs = pickSongs(fb, size, theme, lib, ctx, rng, songs)
    if (songs.length < size) songs = pickSongs([...pool, ...fb], size, theme, lib, ctx, rng, songs, LOOSE)
    // the note only when songs really came from outside the theme (not when the caps were just lifted)
    const inPool = new Set(pool.map((t) => t.id))
    if (songs.length > have && songs.some((t) => !inPool.has(t.id))) shortage = { have, kind: theme.kind }
  }
  if (!songs.length) return null
  // album neighbours (short interludes) keep their album order when two of an album made it in
  const ordered = orderForFlow(songs, rng)
  const { title, line, note } = describe(theme, ordered, lib, mode, ctx, rng, shortage)
  return { theme, songs: ordered.map((t) => t.id), title, line, note, features: featuresOf(theme, ordered, lib.now) }
}

/* ── Learning ───────────────────────────────────────── */

export interface Outcome {
  id: string
  /** ms, when the session ended */
  at: number
  kind: ThemeKind
  features: string[]
  /** songs heard through / skipped (the DJ's own songs only) */
  played: number
  skipped: number
  /** skipped with the DJ button: index of the song it was on (-1 = during the intro); null = played through */
  sessionSkip: number | null
  /** songs saved to a playlist during the session */
  saved: number
}

const HALF_LIFE = 60 * DAY

export function outcomeValue(o: Outcome): number {
  let v = o.sessionSkip === null ? 1 : o.sessionSkip <= 1 ? -1 : -0.3
  v += 0.3 * o.saved
  return v
}

export function featureScores(outcomes: readonly Outcome[], now: number): Map<string, number> {
  const m = new Map<string, number>()
  for (const o of outcomes) {
    const decay = Math.pow(0.5, Math.max(0, now - o.at) / HALF_LIFE)
    const v = outcomeValue(o) * decay
    for (const f of o.features) m.set(f, (m.get(f) ?? 0) + v)
  }
  return m
}

const FRESH_LABEL: Record<string, string> = { never: 'Unplayed songs', new: 'New songs', familiar: 'Familiar songs' }

export function featureLabel(f: string, genreName: (key: string) => string | undefined): string | null {
  const [k, v] = [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)]
  if (k === 'type') return v === 'genre' ? 'Genre sessions' : (TYPE_LABEL[v as ThemeKind] ?? null)
  if (k === 'genre') return genreName(v) ?? v.replace(/(^|\s)\S/g, (s) => s.toUpperCase())
  if (k === 'decade') return `${v}s`
  if (k === 'fresh') return FRESH_LABEL[v] ?? null
  if (k === 'liked') return 'Sets full of hearts'
  return null
}

/** "Plays more" / "plays less" chips: the strongest learned features either way (max 3 each). */
export function learnedChips(scores: Map<string, number>, genreName: (key: string) => string | undefined): { more: string[]; less: string[] } {
  const rows = [...scores].map(([f, s]) => ({ label: featureLabel(f, genreName), s })).filter((r): r is { label: string; s: number } => !!r.label)
  const more = rows
    .filter((r) => r.s >= 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((r) => r.label)
  const less = rows
    .filter((r) => r.s <= -0.6)
    .sort((a, b) => a.s - b.s)
    .slice(0, 3)
    .map((r) => r.label)
  return { more, less }
}
