/**
 * New Releases → Discover ("From artists like yours"): recent releases by artists who aren't in the
 * library but come up as related to several that are.
 *
 * Once a day (the New Releases sweep cycle, after the MusicBrainz sweep or when the page opens):
 *  1. Deezer related artists of every library artist (lib/deezer.ts, cached 30 days, ~1/s — the
 *     first run takes about a second per artist; the radio shares the cache).
 *  2. Candidates: related artists not in the library, not "Not interested", not followed. Score =
 *     how many of yours list them (and how high). The top 20 listed by two or more of yours, topped
 *     up to 12 with the best single-link ones.
 *  3. Their releases of the last ~6 months (`/api/deezer/releases`, ~1/s), stored in releases.json
 *     `discover` (shared with the other device, so it skips artists already checked today).
 *
 * Offline / no proxy (local dev) → nothing changes; the section shows what it has.
 */
import { useSyncExternalStore } from 'react'
import { fetchDzReleases, inLibrary, relatedLoaded, relatedRaw, requestRelated } from '../lib/deezer'
import { libraryStore, type Catalogue } from './library'
import { cycleStart, onReleasesEvent, releasesStore, type DiscoverEntry, type DzRel } from './releases'
import { onAccountReset } from './session'
import { artistsByName } from './views'

const GAP_MS = 1000
const PER_ARTIST = 20
const MAX_STRONG = 20
const MIN_TOTAL = 12
const VARIOUS = /^(various artists?|va|soundtrack|unknown artist)$/i

export interface DiscoverState {
  running: boolean
  /** artists checked / to check in this run */
  done: number
  total: number
}

let state: DiscoverState = { running: false, done: 0, total: 0 }
const listeners = new Set<() => void>()
function set(p: Partial<DiscoverState>) {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

interface Cand {
  id: number
  name: string
  score: number
  because: string[]
}

/** Related artists of the library that aren't in it, best first. */
export function discoverCandidates(c: Catalogue): Cand[] {
  const doc = releasesStore.get().doc
  const map = new Map<number, Cand>()
  for (const info of artistsByName(c)) {
    if (VARIOUS.test(info.artist.name.trim())) continue
    const raw = relatedRaw(info.artist.id)
    if (!raw) continue
    raw.slice(0, PER_ARTIST).forEach((a, i) => {
      if (inLibrary(c, a)) return
      if (doc.dzMuted[String(a.id)]?.[0] || doc.follow[`dz:${a.id}`]?.[0]) return
      const e = map.get(a.id) ?? { id: a.id, name: a.name, score: 0, because: [] }
      e.score += 1 - i / PER_ARTIST
      if (!e.because.includes(info.artist.id)) e.because.push(info.artist.id)
      map.set(a.id, e)
    })
  }
  const all = [...map.values()].sort((a, b) => b.because.length - a.because.length || b.score - a.score)
  const strong = all.filter((a) => a.because.length >= 2).slice(0, MAX_STRONG)
  const weak = all.filter((a) => a.because.length < 2).slice(0, Math.max(0, MIN_TOTAL - strong.length))
  return [...strong, ...weak]
}

const toType = (t: string): DzRel['type'] => (t === 'ep' || t === 'single' || t === 'compile' ? t : 'album')

let run: Promise<void> | null = null
let generation = 0

/** Refresh Discover if it hasn't been this cycle (safe to call often). */
export function refreshDiscover(force = false): Promise<void> {
  if (run) return run
  const gen = generation
  run = (async () => {
    await releasesStore.load()
    await relatedLoaded()
    const c = libraryStore.get().data
    if (!c || typeof navigator === 'undefined' || !navigator.onLine) return
    const cutoff = cycleStart()
    // 1. related artists of the library (cached; only missing / stale ones are fetched)
    const artists = artistsByName(c).filter((i) => !VARIOUS.test(i.artist.name.trim()))
    const missing = artists.filter((i) => relatedRaw(i.artist.id) === null)
    set({ running: true, done: 0, total: missing.length })
    let done = 0
    for (const i of missing) {
      if (gen !== generation) return
      // no answer (offline / no proxy in local dev): stop, the next run tries again
      if (!(await requestRelated(c, i.artist.id))) break
      set({ done: ++done })
    }
    // 2. + 3. candidates and their releases
    const cands = discoverCandidates(c)
    const doc = releasesStore.get().doc
    const todo = cands.filter((a) => force || (doc.discover[String(a.id)]?.at ?? 0) < cutoff)
    // a candidate that's still there but already checked keeps its entry, with the new reasons
    for (const a of cands) {
      const e = releasesStore.get().doc.discover[String(a.id)]
      if (e && !todo.includes(a) && (e.because.join() !== a.because.join() || e.score !== a.score)) releasesStore.putDiscover(a.id, { ...e, because: a.because, score: a.score })
    }
    set({ done: 0, total: todo.length })
    done = 0
    let last = 0
    for (const a of todo) {
      if (gen !== generation || !navigator.onLine) return
      const wait = last + GAP_MS - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      last = Date.now()
      try {
        const r = await fetchDzReleases(a.id)
        if (gen !== generation) return
        if (!r) releasesStore.putDiscover(a.id, null)
        else {
          const entry: DiscoverEntry = {
            at: Date.now(),
            name: r.name || a.name,
            pic: r.picture,
            because: a.because,
            score: a.score,
            rel: r.releases.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => ({ id: x.id, t: x.t, type: toType(x.type), date: x.date, cover: x.cover })),
            titles: r.titles.slice(0, 60),
          }
          releasesStore.putDiscover(a.id, entry)
        }
      } catch {
        // proxy down / offline: try again on the next visit
        return
      }
      set({ done: ++done })
    }
  })().finally(() => {
    run = null
    if (gen === generation) set({ running: false })
  })
  return run
}

/** Boot: after each MusicBrainz sweep (and a minute after launch when due). */
export function initDiscover() {
  onReleasesEvent((e) => {
    if (e.kind === 'swept') void refreshDiscover()
  })
  window.setTimeout(() => void refreshDiscover(), 60_000)
}

export const discoverStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useDiscover(): DiscoverState {
  return useSyncExternalStore(discoverStore.subscribe, discoverStore.get, discoverStore.get)
}

onAccountReset(() => {
  generation++
  run = null
  set({ running: false, done: 0, total: 0 })
})
