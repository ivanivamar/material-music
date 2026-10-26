/**
 * Smart playlists (step 20): playlists that fill themselves from rules instead of a hand-made list.
 *
 * The rules live in the playlist's own Drive file (`playlists/<id>.json`, field `smart`, merged by
 * its stamp like the name), so they sync between devices with everything else. The songs are never
 * stored: they're worked out on each device from the catalogue + the play history (history.json),
 * so a smart playlist is always current — "Never played" loses a song the moment its play counts.
 *
 *   match  all | any of the rules (no rules = the whole library)
 *   rules  date added · last played · play count · plays in a period · genre · decade · year ·
 *          artist · album · title
 *   sort   which songs come first (and which are kept when there's a limit)
 *   limit  keep the first N songs, or all of them
 */
import type { Album, Catalogue, Track } from './library'
import type { Play } from './history'
import { genreResolver, type GenresDoc } from './genres'

/* ── Types ──────────────────────────────────────────── */

export type Unit = 'days' | 'weeks' | 'months' | 'years'

export type TimeField = 'added' | 'lastPlayed'
export type CountField = 'plays' | 'playsIn'
export type TextField = 'genre' | 'artist' | 'album' | 'title'
export type NumField = 'decade' | 'year'
export type Field = TimeField | CountField | TextField | NumField

export type TimeOp = 'inLast' | 'notInLast'
export type CountOp = 'eq' | 'gte' | 'lte'
export type TextOp = 'is' | 'isNot' | 'contains' | 'notContains'
export type NumOp = 'is' | 'isNot' | 'gte' | 'lte'

export type Rule =
  | { id: string; field: TimeField; op: TimeOp; amount: number; unit: Unit }
  | { id: string; field: 'plays'; op: CountOp; value: number }
  | { id: string; field: 'playsIn'; op: CountOp; value: number; amount: number; unit: Unit }
  | { id: string; field: TextField; op: TextOp; value: string }
  | { id: string; field: NumField; op: NumOp; value: number }

export type SortBy = 'added' | 'lastPlayed' | 'leastRecent' | 'plays' | 'playsIn' | 'artist' | 'album' | 'title' | 'year' | 'random'

export interface SmartSort {
  by: SortBy
  /** playsIn: the period counted */
  amount?: number
  unit?: Unit
}

export interface SmartRules {
  match: 'all' | 'any'
  rules: Rule[]
  sort: SmartSort
  /** keep the first N songs (after sorting); null = all */
  limit: number | null
}

/* ── Labels ─────────────────────────────────────────── */

export const FIELDS: { value: Field; label: string }[] = [
  { value: 'added', label: 'Date added' },
  { value: 'lastPlayed', label: 'Last played' },
  { value: 'plays', label: 'Play count' },
  { value: 'playsIn', label: 'Plays in the last…' },
  { value: 'genre', label: 'Genre' },
  { value: 'decade', label: 'Decade' },
  { value: 'year', label: 'Year' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'title', label: 'Title' },
]

export const TIME_OPS: { value: TimeOp; label: string }[] = [
  { value: 'inLast', label: 'is in the last' },
  { value: 'notInLast', label: 'is not in the last' },
]
export const COUNT_OPS: { value: CountOp; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'gte', label: 'is at least' },
  { value: 'lte', label: 'is at most' },
]
export const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'isNot', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'doesn’t contain' },
]
export const DECADE_OPS: { value: NumOp; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'isNot', label: 'is not' },
]
export const YEAR_OPS: { value: NumOp; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'isNot', label: 'is not' },
  { value: 'gte', label: 'is from' },
  { value: 'lte', label: 'is up to' },
]
export const UNITS: { value: Unit; one: string; many: string }[] = [
  { value: 'days', one: 'day', many: 'days' },
  { value: 'weeks', one: 'week', many: 'weeks' },
  { value: 'months', one: 'month', many: 'months' },
  { value: 'years', one: 'year', many: 'years' },
]
export const SORTS: { value: SortBy; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'plays', label: 'Most played' },
  { value: 'playsIn', label: 'Most played in the last…' },
  { value: 'lastPlayed', label: 'Recently played' },
  { value: 'leastRecent', label: 'Longest since played' },
  { value: 'year', label: 'Newest release' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'title', label: 'Title' },
  { value: 'random', label: 'Random (new order every day)' },
]

const unitWord = (n: number, u: Unit) => {
  const x = UNITS.find((v) => v.value === u) ?? UNITS[0]
  return n === 1 ? x.one : `${n} ${x.many}`
}

export const ruleId = () => Math.random().toString(36).slice(2, 10)

/* ── Defaults / presets ─────────────────────────────── */

/** What the library has: genres (most songs first) and decades (newest first). */
export interface Facets {
  genres: string[]
  decades: number[]
  /** songs per genre (display name → count), for the genre dropdown */
  genreSongs?: Record<string, number>
}

export function defaultRule(field: Field, f?: Facets | null): Rule {
  const id = ruleId()
  switch (field) {
    case 'added':
      return { id, field, op: 'inLast', amount: 30, unit: 'days' }
    case 'lastPlayed':
      return { id, field, op: 'notInLast', amount: 1, unit: 'years' }
    case 'plays':
      return { id, field, op: 'eq', value: 0 }
    case 'playsIn':
      return { id, field, op: 'gte', value: 1, amount: 1, unit: 'months' }
    case 'genre':
      return { id, field, op: 'is', value: f?.genres[0] ?? '' }
    case 'decade':
      return { id, field, op: 'is', value: f?.decades[0] ?? 2020 }
    case 'year':
      return { id, field, op: 'is', value: new Date().getFullYear() }
    default:
      return { id, field, op: 'contains', value: '' }
  }
}

export interface Preset {
  key: string
  name: string
  description: string
  make: (f: Facets | null) => SmartRules
}

export const PRESETS: Preset[] = [
  {
    key: 'added',
    name: 'Recently added',
    description: 'Everything added in the last 30 days.',
    make: () => ({ match: 'all', rules: [defaultRule('added')], sort: { by: 'added' }, limit: null }),
  },
  {
    key: 'never',
    name: 'Never played',
    description: 'Songs you haven’t heard in Material Music yet.',
    make: () => ({ match: 'all', rules: [{ id: ruleId(), field: 'plays', op: 'eq', value: 0 }], sort: { by: 'random' }, limit: null }),
  },
  {
    key: 'year',
    name: 'Not played in a year',
    description: 'Nothing from the last 12 months.',
    make: () => ({ match: 'all', rules: [{ id: ruleId(), field: 'lastPlayed', op: 'notInLast', amount: 1, unit: 'years' }], sort: { by: 'leastRecent' }, limit: null }),
  },
  {
    key: 'month',
    name: 'Most played this month',
    description: 'Your top 50 of the last month.',
    make: () => ({
      match: 'all',
      rules: [{ id: ruleId(), field: 'playsIn', op: 'gte', value: 1, amount: 1, unit: 'months' }],
      sort: { by: 'playsIn', amount: 1, unit: 'months' },
      limit: 50,
    }),
  },
  {
    key: 'genre',
    name: 'Genre',
    description: 'One genre, newest first.',
    make: (f) => ({ match: 'all', rules: [defaultRule('genre', f)], sort: { by: 'added' }, limit: null }),
  },
  {
    key: 'decade',
    name: 'Decade',
    description: 'Releases from one decade.',
    make: (f) => ({ match: 'all', rules: [defaultRule('decade', f)], sort: { by: 'random' }, limit: null }),
  },
]

/** A preset's playlist name (genre / decade use the chosen value). */
export function presetName(key: string, s: SmartRules): string {
  const r = s.rules[0]
  if (key === 'genre' && r?.field === 'genre' && r.value) return r.value
  if (key === 'decade' && r?.field === 'decade') return `${r.value}s`
  return PRESETS.find((p) => p.key === key)?.name ?? 'Smart playlist'
}

/* ── Reading a file (anything malformed is dropped) ── */

const isUnit = (u: unknown): u is Unit => u === 'days' || u === 'weeks' || u === 'months' || u === 'years'
const posInt = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : d)

function normaliseRule(raw: unknown): Rule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' && r.id ? r.id : ruleId()
  switch (r.field) {
    case 'added':
    case 'lastPlayed':
      if (r.op !== 'inLast' && r.op !== 'notInLast') return null
      return { id, field: r.field, op: r.op, amount: Math.max(1, posInt(r.amount, 1)), unit: isUnit(r.unit) ? r.unit : 'days' }
    case 'plays':
      if (r.op !== 'eq' && r.op !== 'gte' && r.op !== 'lte') return null
      return { id, field: 'plays', op: r.op, value: posInt(r.value, 0) }
    case 'playsIn':
      if (r.op !== 'eq' && r.op !== 'gte' && r.op !== 'lte') return null
      return { id, field: 'playsIn', op: r.op, value: posInt(r.value, 1), amount: Math.max(1, posInt(r.amount, 1)), unit: isUnit(r.unit) ? r.unit : 'months' }
    case 'genre':
    case 'artist':
    case 'album':
    case 'title':
      if (r.op !== 'is' && r.op !== 'isNot' && r.op !== 'contains' && r.op !== 'notContains') return null
      return { id, field: r.field, op: r.op, value: typeof r.value === 'string' ? r.value : '' }
    case 'decade':
    case 'year':
      if (r.op !== 'is' && r.op !== 'isNot' && r.op !== 'gte' && r.op !== 'lte') return null
      return { id, field: r.field, op: r.op, value: posInt(r.value, 2000) }
    default:
      return null
  }
}

const SORT_KEYS = new Set<SortBy>(['added', 'lastPlayed', 'leastRecent', 'plays', 'playsIn', 'artist', 'album', 'title', 'year', 'random'])

export function normaliseSmart(raw: unknown): SmartRules | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const sortRaw = (s.sort && typeof s.sort === 'object' ? s.sort : {}) as Record<string, unknown>
  const by = SORT_KEYS.has(sortRaw.by as SortBy) ? (sortRaw.by as SortBy) : 'added'
  const sort: SmartSort = by === 'playsIn' ? { by, amount: Math.max(1, posInt(sortRaw.amount, 1)), unit: isUnit(sortRaw.unit) ? sortRaw.unit : 'months' } : { by }
  return {
    match: s.match === 'any' ? 'any' : 'all',
    rules: (Array.isArray(s.rules) ? s.rules : []).map(normaliseRule).filter((r): r is Rule => !!r),
    sort,
    limit: typeof s.limit === 'number' && s.limit > 0 ? Math.round(s.limit) : null,
  }
}

/* ── Library facets (for the editor) ────────────────── */

const facetMemo = new WeakMap<GenresDoc, WeakMap<Catalogue, Facets>>()
/** Genres (tags + MusicBrainz + set in the app) and decades in the library. */
export function libraryFacets(c: Catalogue, doc: GenresDoc): Facets {
  let byCat = facetMemo.get(doc)
  if (!byCat) facetMemo.set(doc, (byCat = new WeakMap()))
  let f = byCat.get(c)
  if (!f) {
    const genreOf = genreResolver(doc, c)
    const counts = new Map<string, { name: string; n: number }>()
    const decades = new Set<number>()
    for (const a of Object.values(c.albums)) {
      for (const g of genreOf(a.id)) {
        const k = fold(g)
        const cur = counts.get(k)
        if (cur) cur.n += a.trackCount ?? 1
        else counts.set(k, { name: g, n: a.trackCount ?? 1 })
      }
      const y = yearOf(a)
      if (y) decades.add(Math.floor(y / 10) * 10)
    }
    f = {
      genres: [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((g) => g.name),
      genreSongs: Object.fromEntries([...counts.values()].map((g) => [g.name, g.n])),
      decades: [...decades].sort((a, b) => b - a),
    }
    byCat.set(c, f)
  }
  return f
}

/* ── Evaluating ─────────────────────────────────────── */

export const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()


function yearOf(a: Album | undefined): number | null {
  if (!a) return null
  if (a.year && a.year > 0) return a.year
  const m = /^(\d{4})/.exec(a.date ?? '')
  return m ? Number(m[1]) : null
}

/** The moment `amount unit` before `nowMs`, in Unix seconds (months / years by the calendar). */
export function cutoff(nowMs: number, amount: number, unit: Unit): number {
  const d = new Date(nowMs)
  if (unit === 'days') d.setDate(d.getDate() - amount)
  else if (unit === 'weeks') d.setDate(d.getDate() - amount * 7)
  else if (unit === 'months') d.setMonth(d.getMonth() - amount)
  else d.setFullYear(d.getFullYear() - amount)
  return Math.floor(d.getTime() / 1000)
}

interface PlayStats {
  count: Map<string, number>
  last: Map<string, number>
}
const statsMemo = new WeakMap<readonly Play[], PlayStats>()
function playStats(plays: readonly Play[]): PlayStats {
  let s = statsMemo.get(plays)
  if (!s) {
    s = { count: new Map(), last: new Map() }
    for (const p of plays) {
      s.count.set(p.trackId, (s.count.get(p.trackId) ?? 0) + 1)
      if ((s.last.get(p.trackId) ?? 0) < p.at) s.last.set(p.trackId, p.at)
    }
    statsMemo.set(plays, s)
  }
  return s
}

/** Plays per track since `since` (Unix s). `plays` is oldest first (historyStore). */
const periodMemo = new WeakMap<readonly Play[], Map<number, Map<string, number>>>()
function playsSince(plays: readonly Play[], since: number): Map<string, number> {
  let byCut = periodMemo.get(plays)
  if (!byCut) periodMemo.set(plays, (byCut = new Map()))
  let m = byCut.get(since)
  if (!m) {
    m = new Map()
    // binary search the first play at/after `since`
    let lo = 0
    let hi = plays.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (plays[mid].at < since) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < plays.length; i++) m.set(plays[i].trackId, (m.get(plays[i].trackId) ?? 0) + 1)
    byCut.set(since, m)
  }
  return m
}

const cmpCount = (op: CountOp, n: number, v: number) => (op === 'eq' ? n === v : op === 'gte' ? n >= v : n <= v)

function textTest(op: TextOp, field: TextField, value: string, t: Track, a: Album | undefined, genreOf: (albumId: string) => string[]): boolean {
  const v = fold(value)
  if (field === 'genre') {
    const gs = genreOf(t.albumId).map(fold)
    const hit = op === 'is' || op === 'isNot' ? gs.includes(v) : !!v && gs.some((g) => g.includes(v))
    return op === 'is' || op === 'contains' ? hit : !hit
  }
  const hay = fold(field === 'artist' ? `${t.artist}` : field === 'album' ? (a?.title ?? '') : t.title)
  // artist "is" also matches the album artist (a featured track on someone else's album still counts)
  const alt = field === 'artist' && a ? fold(a.artist) : null
  if (op === 'is') return hay === v || alt === v
  if (op === 'isNot') return hay !== v && alt !== v
  if (!v) return op === 'contains'
  const has = hay.includes(v) || (alt?.includes(v) ?? false)
  return op === 'contains' ? has : !has
}

/** Does one rule match one track? */
function test(r: Rule, t: Track, c: Catalogue, plays: readonly Play[], stats: PlayStats, nowMs: number, genreOf: (albumId: string) => string[]): boolean {
  const a = c.albums[t.albumId]
  switch (r.field) {
    case 'added': {
      const at = Date.parse(t.addedAt || a?.addedAt || '') / 1000
      const inside = Number.isFinite(at) && at >= cutoff(nowMs, r.amount, r.unit)
      return r.op === 'inLast' ? inside : !inside
    }
    case 'lastPlayed': {
      const last = stats.last.get(t.id)
      const inside = last !== undefined && last >= cutoff(nowMs, r.amount, r.unit)
      // "not in the last year" includes songs never played at all
      return r.op === 'inLast' ? inside : !inside
    }
    case 'plays':
      return cmpCount(r.op, stats.count.get(t.id) ?? 0, r.value)
    case 'playsIn':
      return cmpCount(r.op, playsSince(plays, cutoff(nowMs, r.amount, r.unit)).get(t.id) ?? 0, r.value)
    case 'genre':
    case 'artist':
    case 'album':
    case 'title':
      return textTest(r.op, r.field, r.value, t, a, genreOf)
    case 'decade':
    case 'year': {
      const y = yearOf(a)
      if (y === null) return r.op === 'isNot'
      const x = r.field === 'decade' ? Math.floor(y / 10) * 10 : y
      return r.op === 'is' ? x === r.value : r.op === 'isNot' ? x !== r.value : r.op === 'gte' ? x >= r.value : x <= r.value
    }
  }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const sortKey = (s: string) => s.replace(/^the\s+/i, '')
const byName = (a: string, b: string) => collator.compare(sortKey(a), sortKey(b))

function dailyRank(day: string, id: string): number {
  let h = 2166136261
  const key = `${day}|${id}`
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  return (h ^ (h >>> 15)) >>> 0
}

export interface SmartResult {
  /** track ids in playlist order */
  ids: string[]
  /** per-track value for the playlist page's last column (plays / last played / added) */
  stat: (trackId: string) => string
  statLabel: string
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function fmtWhen(sec: number | undefined, nowMs: number): string {
  if (!sec) return 'NEVER'
  const s = Math.max(0, nowMs / 1000 - sec)
  if (s < 3600) return 'JUST NOW'
  if (s < 86_400) return `${Math.floor(s / 3600)} H AGO`
  const d = Math.floor(s / 86_400)
  if (d === 1) return 'YESTERDAY'
  if (d < 7) return `${d} DAYS AGO`
  if (d < 28) return `${Math.floor(d / 7)} WEEK${d < 14 ? '' : 'S'} AGO`
  const date = new Date(sec * 1000)
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** The songs of a smart playlist, now. */
export function evaluateSmart(c: Catalogue, plays: readonly Play[], genres: GenresDoc, s: SmartRules, nowMs = Date.now()): SmartResult {
  const stats = playStats(plays)
  const genreOf = genreResolver(genres, c)
  const tracks = Object.values(c.tracks)
  const hits = !s.rules.length
    ? tracks
    : tracks.filter((t) => (s.match === 'all' ? s.rules.every((r) => test(r, t, c, plays, stats, nowMs, genreOf)) : s.rules.some((r) => test(r, t, c, plays, stats, nowMs, genreOf))))

  const albumOrder = (a: Track, b: Track) => {
    const x = c.albums[a.albumId]
    const y = c.albums[b.albumId]
    return (
      byName(a.artist, b.artist) ||
      (yearOf(x) ?? 0) - (yearOf(y) ?? 0) ||
      byName(x?.title ?? '', y?.title ?? '') ||
      a.disc - b.disc ||
      (a.track ?? 0) - (b.track ?? 0)
    )
  }
  const added = (t: Track) => Date.parse(t.addedAt || c.albums[t.albumId]?.addedAt || '') || 0
  const newestFirst = (a: Track, b: Track) => added(b) - added(a) || a.albumId.localeCompare(b.albumId) || a.disc - b.disc || (a.track ?? 0) - (b.track ?? 0)
  const period = s.sort.by === 'playsIn' ? playsSince(plays, cutoff(nowMs, s.sort.amount ?? 1, s.sort.unit ?? 'months')) : null
  const day = new Date(nowMs).toISOString().slice(0, 10)

  let cmp: (a: Track, b: Track) => number
  switch (s.sort.by) {
    case 'plays':
      cmp = (a, b) => (stats.count.get(b.id) ?? 0) - (stats.count.get(a.id) ?? 0) || (stats.last.get(b.id) ?? 0) - (stats.last.get(a.id) ?? 0) || albumOrder(a, b)
      break
    case 'playsIn':
      cmp = (a, b) => (period!.get(b.id) ?? 0) - (period!.get(a.id) ?? 0) || (stats.last.get(b.id) ?? 0) - (stats.last.get(a.id) ?? 0) || albumOrder(a, b)
      break
    case 'lastPlayed':
      cmp = (a, b) => (stats.last.get(b.id) ?? 0) - (stats.last.get(a.id) ?? 0) || newestFirst(a, b)
      break
    case 'leastRecent':
      cmp = (a, b) => (stats.last.get(a.id) ?? 0) - (stats.last.get(b.id) ?? 0) || albumOrder(a, b)
      break
    case 'year':
      cmp = (a, b) => (yearOf(c.albums[b.albumId]) ?? 0) - (yearOf(c.albums[a.albumId]) ?? 0) || albumOrder(a, b)
      break
    case 'artist':
      cmp = albumOrder
      break
    case 'album':
      cmp = (a, b) => byName(c.albums[a.albumId]?.title ?? '', c.albums[b.albumId]?.title ?? '') || albumOrder(a, b)
      break
    case 'title':
      cmp = (a, b) => byName(a.title, b.title) || byName(a.artist, b.artist)
      break
    case 'random':
      cmp = (a, b) => dailyRank(day, a.id) - dailyRank(day, b.id)
      break
    default:
      cmp = newestFirst
  }
  let list = hits.slice().sort(cmp)
  if (s.limit) list = list.slice(0, s.limit)

  const by = s.sort.by
  const stat =
    by === 'plays'
      ? (id: string) => String(stats.count.get(id) ?? 0)
      : by === 'playsIn'
        ? (id: string) => String(period!.get(id) ?? 0)
        : by === 'lastPlayed' || by === 'leastRecent'
          ? (id: string) => fmtWhen(stats.last.get(id), nowMs)
          : null
  return {
    ids: list.map((t) => t.id),
    stat: stat ?? (() => ''),
    statLabel: by === 'plays' || by === 'playsIn' ? 'PLAYS' : by === 'lastPlayed' || by === 'leastRecent' ? 'LAST PLAYED' : 'ADDED',
  }
}

/* ── Describing ─────────────────────────────────────── */

const opLabel = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v

/** "Added in the last 30 days", "Genre is Metal", "Played 0 times". */
export function describeRule(r: Rule): string {
  switch (r.field) {
    case 'added':
      return `${r.op === 'inLast' ? 'Added in the last' : 'Not added in the last'} ${unitWord(r.amount, r.unit)}`
    case 'lastPlayed':
      return `${r.op === 'inLast' ? 'Played in the last' : 'Not played in the last'} ${unitWord(r.amount, r.unit)}`
    case 'plays':
      if (r.op === 'eq' && r.value === 0) return 'Never played'
      return `Played ${r.op === 'eq' ? '' : r.op === 'gte' ? 'at least ' : 'at most '}${r.value} time${r.value === 1 ? '' : 's'}`
    case 'playsIn':
      return `Played ${r.op === 'eq' ? '' : r.op === 'gte' ? 'at least ' : 'at most '}${r.value} time${r.value === 1 ? '' : 's'} in the last ${unitWord(r.amount, r.unit)}`
    case 'decade':
      return `Decade ${opLabel(DECADE_OPS, r.op)} ${r.value}s`
    case 'year':
      return `Year ${opLabel(YEAR_OPS, r.op)} ${r.value}`
    default:
      return `${FIELDS.find((f) => f.value === r.field)?.label ?? r.field} ${opLabel(TEXT_OPS, r.op)} “${r.value}”`
  }
}

export function describeSort(s: SmartSort): string {
  if (s.by === 'playsIn') return `Most played in the last ${unitWord(s.amount ?? 1, s.unit ?? 'months')}`
  return SORTS.find((x) => x.value === s.by)?.label.replace(/ \(.*\)$/, '') ?? s.by
}

/** One line for the playlist page: the rules, joined by "and" / "or". */
export function describeSmart(s: SmartRules): string {
  const rules = s.rules.map(describeRule)
  const what = rules.length ? rules.join(s.match === 'all' ? ' · ' : ' or ') : 'Your whole library'
  return what
}
