/**
 * Made for you (step 26): today's mixes and the Radio for you stations, worked out on each device
 * from the catalogue + play history (Drive history.json) + genres (genres.json) + the DJ's early-skip
 * penalties (dj.json). Nothing about the mixes is synced: both devices see the same inputs as of
 * today's 06:00 (lib/mixing.ts mixDay), so they come up with the same songs.
 *
 * Computing takes a few milliseconds even on a large library, but Home asks for it after its first
 * paint (idle callback), with placeholder cards meanwhile, so Home stays instant. The result is
 * memoised per (day, catalogue, history, genres, penalties).
 *
 * Phone offline (or the DJ's mobile-data saver): a mix plays only its downloaded songs, like the DJ;
 * the mix page greys out the others.
 */
import { useEffect, useState } from 'react'
import { buildLibrary, type DjLibrary } from '../dj/engine'
import { buildMixSet, historyLevel, mixDay, neighbourWeights, radioId, radioProfile, topArtistIds, type HistoryLevel, type MixDay, type MixInput, type MixPlan, type MixSet, type RadioSeed } from '../lib/mixing'
import { relatedOf, requestRelated } from '../lib/deezer'
import { djStore, downloadedOnly } from './dj'
import { downloadsStore, offlineIndex } from './downloads'
import { genreResolver, genresStore } from './genres'
import { historyStore } from './history'
import { libraryStore, type Catalogue } from './library'
import { playerStore } from './player'

const DAY = 86_400_000
const PENALTY_MS = 30 * DAY

/* ── Inputs ─────────────────────────────────────────── */

let inputMemo: { key: unknown[]; input: MixInput } | null = null

/** The mix inputs as of today's 06:00. */
export function mixInput(nowMs = Date.now()): MixInput | null {
  const c = libraryStore.get().data
  if (!c) return null
  const plays = historyStore.get().plays
  const gdoc = genresStore.get().doc
  const pen = djStore.get().doc.songPenalties
  const day = mixDay(nowMs)
  const key = [c, plays, gdoc, pen, day.key]
  if (inputMemo && inputMemo.key.every((k, i) => k === key[i])) return inputMemo.input
  const before = plays.filter((p) => p.at * 1000 < day.start)
  // only skips that happened before 06:00 count today
  const penalties: Record<string, number> = {}
  for (const [id, until] of Object.entries(pen)) if (until - PENALTY_MS < day.start && until > day.start) penalties[id] = until
  const lib = buildLibrary({ tracks: Object.values(c.tracks), albums: c.albums, genreOf: genreResolver(gdoc, c), plays: before, penalties, now: day.start })
  const recent90 = new Map<string, number>()
  for (const p of before) if (p.at * 1000 >= day.start - 90 * DAY) recent90.set(p.trackId, (recent90.get(p.trackId) ?? 0) + 1)
  const input: MixInput = {
    lib,
    day,
    recent90,
    historyStart: before.length ? before[0].at * 1000 : 0,
    totalPlays: before.length,
    artistName: (id) => c.artists[id]?.name ?? '',
  }
  inputMemo = { key, input }
  return input
}

let setMemo: { input: MixInput; set: MixSet } | null = null

/** Today's mixes (computed on first use, then memoised). */
export function mixSet(nowMs = Date.now()): MixSet | null {
  const input = mixInput(nowMs)
  if (!input) return null
  if (setMemo?.input === input) return setMemo.set
  const set = buildMixSet(input)
  setMemo = { input, set }
  rememberSeen(set)
  return set
}
/** Already computed for these inputs (no work)? */
const mixesReady = () => {
  const input = inputMemo?.input
  return !!input && setMemo?.input === input && input.day.key === mixDay(Date.now()).key && inputMemo!.key[0] === libraryStore.get().data && inputMemo!.key[1] === historyStore.get().plays
}

export function findMix(id: string, nowMs = Date.now()): MixPlan | null {
  return mixSet(nowMs)?.items.find((m) => m.id === id) ?? null
}

/* ── What a mix link was (expired page) ────────────── */

const SEEN_KEY = 'pelagic.mixes.seen.v1'
export interface SeenMix {
  n?: number
  title: string
  day: string
  kind: MixPlan['kind']
}
function readSeen(): Record<string, SeenMix> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, SeenMix>
  } catch {
    return {}
  }
}
function rememberSeen(set: MixSet) {
  const seen = readSeen()
  for (const m of set.items) seen[m.id] = { n: m.n, title: m.title, day: set.day, kind: m.kind }
  const keep = Object.entries(seen)
    .sort((a, b) => b[1].day.localeCompare(a[1].day))
    .slice(0, 40)
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    /* ignore */
  }
}
export const seenMix = (id: string): SeenMix | null => readSeen()[id] ?? null

/* ── Playing ────────────────────────────────────────── */

/** Phone offline: only downloaded songs play. null = everything plays. */
export function playableSet(c: Catalogue): Set<string> | null {
  if (!downloadedOnly()) return null
  return offlineIndex(downloadsStore.get(), c).tracks
}

export function mixContext(m: MixPlan) {
  return { kind: 'mix' as const, id: m.id, label: m.title }
}

export function playMix(m: MixPlan, opts: { shuffle?: boolean; startId?: string } = {}) {
  const c = libraryStore.get().data
  if (!c) return
  const allowed = playableSet(c)
  const ids = m.trackIds.filter((id) => c.tracks[id] && (!allowed || allowed.has(id)))
  if (!ids.length) return
  const start = opts.startId ? Math.max(0, ids.indexOf(opts.startId)) : opts.shuffle ? Math.floor(Math.random() * ids.length) : 0
  playerStore.playQueue(ids, start, mixContext(m), { shuffle: opts.shuffle })
}

/* ── Radio for you ──────────────────────────────────── */

export interface RadioCard {
  id: string
  seed: RadioSeed
  title: string
  /** "With Editors, The National…" */
  sub: string
  /** artist seed: the artist; song seed: its album (cover) */
  artistId: string
  albumId: string | null
  /** seed name (context line) */
  name: string
}

export interface RadioSet {
  items: RadioCard[]
  /** seeded from plays (else from the artists with the most albums) */
  byPlays: boolean
}

/** "Interpol Radio" / "Radio from ‘Evil’" / "Radio from ‘Antics’". */
export function radioTitle(c: Catalogue, seed: RadioSeed): { title: string; name: string; artistId: string; albumId: string | null } | null {
  if (seed.type === 'artist') {
    const a = c.artists[seed.id]
    const name = a?.name ?? Object.values(c.albums).find((al) => al.artistId === seed.id)?.artist
    return name ? { title: `${name} Radio`, name, artistId: seed.id, albumId: null } : null
  }
  if (seed.type === 'song') {
    const t = c.tracks[seed.id]
    return t ? { title: `Radio from ‘${t.title}’`, name: t.title, artistId: c.albums[t.albumId]?.artistId ?? t.artistId, albumId: t.albumId } : null
  }
  const al = c.albums[seed.id]
  return al ? { title: `Radio from ‘${al.title}’`, name: al.title, artistId: al.artistId, albumId: al.id } : null
}

/** "With A, B, C…" from the neighbour artists (Deezer when cached, else shared genres). */
export function radioSub(c: Catalogue, lib: DjLibrary, seed: RadioSeed): string {
  const prof = radioProfile(lib, seed)
  if (!prof) return ''
  const nb = neighbourWeights(lib, prof, relatedOf(c, prof.artistId))
  const names = [...nb]
    .filter(([id]) => id !== prof.artistId && c.artists[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => c.artists[id].name)
  return names.length ? `With ${names.join(', ')}…` : 'Songs like it from your library'
}

let radioMemo: { input: MixInput; plays: unknown; rel: number; set: RadioSet } | null = null

/**
 * Six stations: the top 4 artists of the last 30 days + the 2 most recent songs (of other artists);
 * while history is thin, the artists with the most albums.
 */
export function radioSet(relVersion: number, nowMs = Date.now()): RadioSet | null {
  const c = libraryStore.get().data
  const input = mixInput(nowMs)
  if (!c || !input) return null
  const plays = historyStore.get().plays
  if (radioMemo && radioMemo.input === input && radioMemo.plays === plays && radioMemo.rel === relVersion) return radioMemo.set
  const since = (nowMs - 30 * DAY) / 1000
  const per = new Map<string, number>()
  for (const p of plays) {
    if (p.at < since) continue
    const t = c.tracks[p.trackId]
    if (!t) continue
    const a = c.albums[t.albumId]?.artistId ?? t.artistId
    per.set(a, (per.get(a) ?? 0) + 1)
  }
  const seeds: RadioSeed[] = []
  const byPlays = per.size >= 3
  const artists = byPlays ? [...per].sort((a, b) => b[1] - a[1]).map(([id]) => id) : topArtistIds({ ...input, recent90: new Map() }, 6).ids
  for (const id of artists.slice(0, byPlays ? 4 : 6)) seeds.push({ type: 'artist', id })
  if (byPlays) {
    const taken = new Set(seeds.map((s) => s.id))
    for (let i = plays.length - 1; i >= 0 && seeds.length < 6; i--) {
      const t = c.tracks[plays[i].trackId]
      if (!t) continue
      const a = c.albums[t.albumId]?.artistId ?? t.artistId
      if (taken.has(a) || seeds.some((s) => s.id === t.id)) continue
      taken.add(a)
      seeds.push({ type: 'song', id: t.id })
    }
    for (const id of artists.slice(4)) {
      if (seeds.length >= 6) break
      if (!seeds.some((s) => s.type === 'artist' && s.id === id)) seeds.push({ type: 'artist', id })
    }
  }
  const items: RadioCard[] = []
  for (const seed of seeds) {
    const t = radioTitle(c, seed)
    if (!t) continue
    items.push({ id: radioId(seed), seed, title: t.title, name: t.name, sub: radioSub(c, input.lib, seed), artistId: t.artistId, albumId: t.albumId })
  }
  const set = { items, byPlays }
  radioMemo = { input, plays, rel: relVersion, set }
  return set
}

/** Fetch the related artists of the Radio for you seeds in the background. */
export function prefetchRelated(set: RadioSet) {
  const c = libraryStore.get().data
  if (!c) return
  for (const r of set.items) void requestRelated(c, r.artistId)
}

/* ── Hooks ──────────────────────────────────────────── */

const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 400 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, 30)
  return () => window.clearTimeout(id)
}

/**
 * Today's mixes for Home: null while computing (placeholders), then the set. `deps` re-runs it
 * (catalogue / history / genres changed, a new day).
 */
export function useMixSet(deps: unknown[]): MixSet | null {
  const [state, setState] = useState<{ key: unknown[]; set: MixSet | null }>(() => ({ key: deps, set: mixesReady() ? mixSet() : null }))
  const stale = state.key.length !== deps.length || state.key.some((k, i) => k !== deps[i])
  if (stale && mixesReady()) setState({ key: deps, set: mixSet() })
  useEffect(() => {
    if (state.set && !stale) return
    return idle(() => setState({ key: deps, set: mixSet() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state.set
}

/** The history level shown in the subs (few plays → fewer mixes, radio from albums…). */
export function currentLevel(nowMs = Date.now()): HistoryLevel {
  const input = mixInput(nowMs)
  if (!input) return 'none'
  return historyLevel(input.totalPlays, input.historyStart, input.day.start)
}

export type { MixDay, MixPlan, MixSet }
