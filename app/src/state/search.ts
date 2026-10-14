/**
 * Search (step 5): client-side, instant, over the cached catalogue — no Drive calls.
 *
 * Text is folded once per catalogue (case, accents, full-width forms, punctuation), so a query
 * like "beyonce deja" finds "Beyoncé — Déjà Vu". Every query word must match somewhere in the item
 * (title, artist, album); a match at the start of a word in the title ranks highest.
 * When nothing matches, `suggest()` offers the closest name ("spiritbx" → Spiritbox).
 *
 * The query, filter and recent searches live in `searchStore` (query survives navigation and
 * reloads in the tab; recents in localStorage `pelagic.search.v1`).
 */
import { useSyncExternalStore } from 'react'
import { type Album, type Artist, type Catalogue, type Track } from './library'
import { onAccountReset } from './session'
import { artistInfos, byName } from './views'

/* ── Folding ───────────────────────────────────────────
 * Folded text starts with a space and keeps one space between words, so "starts a word" is
 * `indexOf(' ' + token)`. `start`/`end` map each folded char back to the original string
 * (for highlighting).
 */

const SPECIAL: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' }
const DROP = /['’‘`´]/ // apostrophes vanish: "don't" = "dont"
const WORD = /[\p{L}\p{N}\p{M}]/u

export interface Folded {
  text: string
  start: number[]
  end: number[]
}

export function foldMapped(s: string): Folded {
  let text = ' '
  const start = [0]
  const end = [0]
  let i = 0
  for (const ch of s) {
    const len = ch.length
    if (!DROP.test(ch)) {
      let f = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      f = SPECIAL[f] ?? f
      for (const c of f) {
        if (WORD.test(c)) {
          text += c
          for (let k = 0; k < c.length; k++) {
            start.push(i)
            end.push(i + len)
          }
        } else if (!text.endsWith(' ')) {
          text += ' '
          start.push(i)
          end.push(i + len)
        }
      }
    }
    i += len
  }
  return { text, start, end }
}

/** Folded text only (indexing / queries). */
export const fold = (s: string) => foldMapped(s).text

/** Query → unique words, longest first. */
export function queryTokens(q: string): string[] {
  const words = fold(q).trim().split(' ').filter(Boolean)
  return [...new Set(words)].sort((a, b) => b.length - a.length)
}

/* ── Index (one per catalogue object) ─────────────── */

interface Entry<T> {
  item: T
  /** folded title / name */
  primary: string
  /** folded artist, album, year … */
  secondary: string[]
  /** display name, for sorting and suggestions */
  name: string
}

interface Index {
  artists: Entry<Artist>[]
  albums: Entry<Album>[]
  tracks: Entry<Track>[]
}

const indexes = new WeakMap<Catalogue, Index>()

function indexOf(c: Catalogue): Index {
  let ix = indexes.get(c)
  if (ix) return ix
  const infos = artistInfos(c)
  const artists: Entry<Artist>[] = []
  for (const info of infos.values()) {
    if (!info.albums.length) continue
    const primary = fold(info.artist.name)
    // initials as a secondary word: "bfmv" → Bullet for My Valentine
    const words = primary.trim().split(' ')
    const secondary = words.length > 1 ? [' ' + words.map((w) => [...w][0]).join('')] : []
    artists.push({ item: info.artist, primary, secondary, name: info.artist.name })
  }
  const albums: Entry<Album>[] = Object.values(c.albums).map((a) => ({
    item: a,
    primary: fold(a.title),
    secondary: [fold(a.artist), a.year ? ` ${a.year}` : ''].filter(Boolean),
    name: a.title,
  }))
  const tracks: Entry<Track>[] = Object.values(c.tracks).map((t) => {
    const album = c.albums[t.albumId]
    const sec = [fold(t.artist)]
    if (album) {
      sec.push(fold(album.title))
      if (album.artist !== t.artist) sec.push(fold(album.artist))
    }
    return { item: t, primary: fold(t.title), secondary: sec, name: t.title }
  })
  ix = { artists, albums, tracks }
  indexes.set(c, ix)
  return ix
}

/* ── Matching ──────────────────────────────────────── */

const LATIN1 = /^[a-z0-9]$/

/** Score 0 = no match. Higher is better; ~1 = every word starts a word of the title. */
function scoreEntry(e: Entry<unknown>, tokens: string[], whole: string): number {
  let sum = 0
  for (const tok of tokens) {
    // a lone Latin letter / digit only counts at the start of a word ("a" shouldn't match everything)
    const prefixOnly = LATIN1.test(tok)
    let s = 0
    if (e.primary.includes(' ' + tok)) s = 3
    else if (!prefixOnly && e.primary.includes(tok)) s = 1.5
    else {
      for (const f of e.secondary) {
        if (f.includes(' ' + tok)) {
          s = Math.max(s, 1)
          break
        }
        if (!prefixOnly && f.includes(tok)) s = Math.max(s, 0.5)
      }
    }
    if (!s) return 0
    sum += s
  }
  let score = sum / (3 * tokens.length)
  const p = e.primary.trim()
  if (p === whole) score += 2
  else if (p.startsWith(whole)) score += 1
  return score
}

export interface Hit<T> {
  item: T
  score: number
}

export type TopHit = { kind: 'artist'; item: Artist } | { kind: 'album'; item: Album } | { kind: 'track'; item: Track }

export interface SearchResults {
  query: string
  tokens: string[]
  artists: Hit<Artist>[]
  albums: Hit<Album>[]
  tracks: Hit<Track>[]
  top: TopHit | null
  total: number
  /** milliseconds spent searching */
  ms: number
}

function run<T>(list: Entry<T>[], tokens: string[], whole: string, tie: (a: T, b: T) => number): Hit<T>[] {
  const out: Hit<T>[] = []
  for (const e of list) {
    const score = scoreEntry(e, tokens, whole)
    if (score > 0) out.push({ item: e.item, score })
  }
  return out.sort((a, b) => b.score - a.score || tie(a.item, b.item))
}

const albumYear = (a: Album) => a.date ?? (a.year ? String(a.year) : '')

export function search(c: Catalogue, query: string): SearchResults {
  const t0 = performance.now()
  const tokens = queryTokens(query)
  const whole = fold(query).trim()
  const empty: SearchResults = { query, tokens, artists: [], albums: [], tracks: [], top: null, total: 0, ms: 0 }
  if (!tokens.length) return empty
  const ix = indexOf(c)
  const infos = artistInfos(c)
  const artists = run(ix.artists, tokens, whole, (a, b) => (infos.get(b.id)?.tracks ?? 0) - (infos.get(a.id)?.tracks ?? 0) || byName(a.name, b.name))
  const albums = run(ix.albums, tokens, whole, (a, b) => byName(a.artist, b.artist) || albumYear(b).localeCompare(albumYear(a)) || byName(a.title, b.title))
  const tracks = run(ix.tracks, tokens, whole, (a, b) => a.title.length - b.title.length || byName(a.title, b.title) || byName(a.artist, b.artist))

  // Top result: best score, artists first on ties, then albums.
  const cands: [TopHit, number][] = []
  if (artists[0]) cands.push([{ kind: 'artist', item: artists[0].item }, artists[0].score + 0.15])
  if (albums[0]) cands.push([{ kind: 'album', item: albums[0].item }, albums[0].score + 0.05])
  if (tracks[0]) cands.push([{ kind: 'track', item: tracks[0].item }, tracks[0].score])
  const top = cands.sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return { query, tokens, artists, albums, tracks, top, total: artists.length + albums.length + tracks.length, ms: performance.now() - t0 }
}

/* ── "Did you mean" ────────────────────────────────── */

/** Optimal-string-alignment distance, giving up past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const n = b.length
  let prev2 = new Array<number>(n + 1).fill(0)
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let cur = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    ;[prev2, prev, cur] = [prev, cur, prev2]
  }
  return prev[n]
}

/** Closest artist / album / song name to a query that found nothing, or null. */
export function suggest(c: Catalogue, query: string): string | null {
  const q = fold(query).trim()
  if (q.length < 3) return null
  const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3
  const words = q.split(' ').length
  const ix = indexOf(c)
  let best: { name: string; d: number; rank: number } | null = null
  const consider = (list: Entry<unknown>[], rank: number) => {
    for (const e of list) {
      const p = e.primary.trim()
      // whole name, or its first words when the name is longer than the query ("periphery v" ← "periphary")
      const parts = p.split(' ')
      const head = parts.length > words ? parts.slice(0, words).join(' ') : null
      for (const [cand, extra] of [[p, 0], [head, 0.5]] as const) {
        if (!cand) continue
        const d = distance(q, cand, max) + extra
        if (d > max) continue
        if (!best || d < best.d || (d === best.d && rank < best.rank)) best = { name: e.name, d, rank }
      }
    }
  }
  consider(ix.artists, 0)
  consider(ix.albums, 1)
  consider(ix.tracks, 2)
  return (best as { name: string } | null)?.name ?? null
}

/* ── Highlighting ──────────────────────────────────── */

export interface Segment {
  text: string
  hit: boolean
}

/** Split `text` into plain / matched segments for the query words (first match per word, word starts preferred). */
export function highlight(text: string, tokens: string[]): Segment[] {
  if (!tokens.length || !text) return [{ text, hit: false }]
  const f = foldMapped(text)
  const ranges: [number, number][] = []
  for (const tok of tokens) {
    let at = f.text.indexOf(' ' + tok)
    if (at >= 0) at += 1
    else if (!LATIN1.test(tok)) at = f.text.indexOf(tok)
    if (at < 0) continue
    ranges.push([f.start[at], f.end[at + tok.length - 1]])
  }
  if (!ranges.length) return [{ text, hit: false }]
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  const out: Segment[] = []
  let pos = 0
  for (const [a, b] of merged) {
    if (a > pos) out.push({ text: text.slice(pos, a), hit: false })
    out.push({ text: text.slice(a, b), hit: true })
    pos = b
  }
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false })
  return out
}

/* ── Store: query, filter, recent searches ─────────── */

export type SearchFilter = 'all' | 'artists' | 'albums' | 'songs'

export interface SearchState {
  query: string
  filter: SearchFilter
  /** newest first */
  recent: string[]
  /** bumped to ask the search field to take focus (keyboard shortcut) */
  focusTick: number
}

const RECENT_KEY = 'pelagic.search.v1'
const SESSION_KEY = 'pelagic.search.session'
const MAX_RECENT = 8

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '{}') as { recent?: unknown }
    return Array.isArray(v.recent) ? v.recent.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}
function loadSession(): Pick<SearchState, 'query' | 'filter'> {
  try {
    const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') as Partial<SearchState>
    const filter = (['all', 'artists', 'albums', 'songs'] as const).find((f) => f === v.filter) ?? 'all'
    return { query: typeof v.query === 'string' ? v.query : '', filter }
  } catch {
    return { query: '', filter: 'all' }
  }
}

let state: SearchState = { ...loadSession(), recent: loadRecent(), focusTick: 0 }
const listeners = new Set<() => void>()

function emit(next: SearchState) {
  const recentChanged = next.recent !== state.recent
  state = next
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query: state.query, filter: state.filter }))
    if (recentChanged) localStorage.setItem(RECENT_KEY, JSON.stringify({ recent: state.recent }))
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l())
}

export const searchStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  setQuery(query: string) {
    if (query !== state.query) emit({ ...state, query })
  },
  setFilter(filter: SearchFilter) {
    if (filter !== state.filter) emit({ ...state, filter })
  },
  /** Remember a query the user acted on (opened / played a result, pressed Enter). */
  remember(query: string) {
    const q = query.trim().replace(/\s+/g, ' ')
    if (!q) return
    const key = fold(q).trim()
    const recent = [q, ...state.recent.filter((r) => fold(r).trim() !== key)].slice(0, MAX_RECENT)
    if (recent.join('\n') !== state.recent.join('\n')) emit({ ...state, recent })
  },
  forget(query: string) {
    emit({ ...state, recent: state.recent.filter((r) => r !== query) })
  },
  clearRecent() {
    if (state.recent.length) emit({ ...state, recent: [] })
  },
  requestFocus() {
    emit({ ...state, focusTick: state.focusTick + 1 })
  },
}

onAccountReset(() => emit({ query: '', filter: 'all', recent: [], focusTick: state.focusTick }))

export function useSearch(): SearchState {
  return useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get)
}
