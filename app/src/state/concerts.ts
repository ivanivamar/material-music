/**
 * Concerts (design_handoff_concerts): tour dates for the artists in the library, from Ticketmaster
 * through the site's `/api/concerts/artist` helper (firebase/functions/src/api/concerts.ts).
 *
 * Two kinds of data:
 * - What the user set, in Drive `Pelagic/concerts.json` so the PC and the phone share it: the home
 *   city, the radius, the shows added by hand, and when Concerts was last opened (drives "New" and
 *   the sidebar badge). Every entry carries a timestamp and devices merge entry by entry, latest
 *   wins (same pattern as releases.json). The daily Ticketmaster refresh never touches it.
 * - What Ticketmaster said, per device in IndexedDB `kv.concerts`: per library artist, its
 *   attraction id and all its upcoming events worldwide (the Artist page's On tour shows the far
 *   ones too), plus when each event was first seen.
 *
 * Refresh: once a day after the Settings sweep hour (same cycle as New releases), while a home city
 * is set. Artists are fetched oldest-checked first, about one a second, each one stamped, so a
 * refresh cut short carries on where it stopped. Distance is worked out here from the venue's
 * coordinates, so changing the city or radius needs no new request. Without a home city, an Artist
 * page still fetches its own artist when opened.
 *
 * Home city search: Open-Meteo's geocoding API (free, no key, CORS open).
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { isNative } from '../native/bridge'
import { libraryStore, type Catalogue } from './library'
import { cycleStart } from './releases'
import { onAccountReset, sessionStore } from './session'
import { artistsByName } from './views'

/* ── Types ──────────────────────────────────────────── */

export type Stamped<T> = [T, number]
export type Radius = 25 | 50 | 100 | 250
export const RADII: Radius[] = [25, 50, 100, 250]

export type TmStatus = 'onsale' | 'presale' | 'notyet' | 'soldout' | 'cancelled' | 'postponed' | 'resched'

/** One Ticketmaster event, as the helper returns it. */
export interface Ev {
  id: string
  name: string
  url: string
  /** local date YYYY-MM-DD (and the last day of a festival) */
  date: string
  end?: string
  /** local start HH:MM; missing = time TBA */
  time?: string
  status: TmStatus
  /** public on-sale (ISO) for notyet / presale */
  saleStart?: string
  presaleEnd?: string
  /** rescheduled from (YYYY-MM-DD) */
  movedFrom?: string
  price?: { min: number; max?: number; cur: string }
  venue: { name: string; city: string; country: string; cc: string; lat?: number; lon?: number }
  lineup: { id: string; name: string }[]
  /** festival name */
  festival?: string
}

export interface City {
  name: string
  country: string
  /** ISO country code */
  cc: string
  /** region (Catalonia…), to tell same-named cities apart */
  admin?: string
  lat: number
  lon: number
}

/** A show added by hand ("Add a show yourself"). */
export interface ManualShow {
  id: string
  artistId: string
  date: string
  time?: string
  venue: string
  city: string
  link?: string
}

export interface ConcertsDoc {
  home: Stamped<City | null>
  radius: Stamped<Radius>
  /** null = deleted (kept so the other device drops it too) */
  manual: Record<string, Stamped<ManualShow | null>>
  /** Concerts last opened (ms) */
  seenAt: Stamped<number>
}

export interface ArtistTour {
  /** fetched (ms) */
  at: number
  /** Ticketmaster attraction id; null = not on Ticketmaster */
  tmId: string | null
  events: Ev[]
}

export type ConcertsError = 'offline' | 'failed' | 'config'

export interface ConcertsState {
  loaded: boolean
  doc: ConcertsDoc
  /** keyed by library artist id */
  tours: Record<string, ArtistTour>
  /** first time each event was seen (ms; 0 = was there on the artist's first fetch) */
  firstSeen: Record<string, number>
  /** last refresh that went through every artist */
  sweptAt: number | null
  /** refresh in progress */
  sweeping: { done: number; total: number } | null
  /** the last refresh stopped early */
  error: ConcertsError | null
  /** artists being fetched on their own (Artist page) */
  fetching: string[]
  /** an Artist-page fetch failed */
  artistErrors: string[]
}

/* ── Constants ──────────────────────────────────────── */

export const CONCERTS_NAME = 'concerts.json'
const CACHE_KEY = 'concerts'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const GAP_MS = 700
const DAY = 86_400_000
const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://material-music-app.web.app/') : import.meta.env.BASE_URL
const VARIOUS = /^(various artists?|va|soundtrack|unknown artist)$/i

const emptyDoc = (): ConcertsDoc => ({ home: [null, 0], radius: [50, 0], manual: {}, seenAt: [0, 0] })

/* ── Store plumbing ─────────────────────────────────── */

let state: ConcertsState = { loaded: false, doc: emptyDoc(), tours: {}, firstSeen: {}, sweptAt: null, sweeping: null, error: null, fetching: [], artistErrors: [] }
const listeners = new Set<() => void>()
function set(patch: Partial<ConcertsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let generation = 0
let loading: Promise<void> | null = null
let fileId: string | null = null
let version: string | null = null
let dirty = false
let inflight: Promise<void> | null = null
let sweepRun: Promise<void> | null = null
let syncTimer = 0
let persistTimer = 0
let lastRequest = 0

interface CacheRecord {
  email: string | null
  doc: ConcertsDoc
  fileId: string | null
  version: string | null
  dirty: boolean
  tours: Record<string, ArtistTour>
  firstSeen: Record<string, number>
  sweptAt: number | null
}

interface ConcertsFile extends ConcertsDoc {
  format: 'pelagic-concerts'
  v: 1
  updatedAt: string
}

function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    if (!state.loaded) return
    const rec: CacheRecord = { email: sessionStore.get().account?.email ?? null, doc: state.doc, fileId, version, dirty, tours: state.tours, firstSeen: state.firstSeen, sweptAt: state.sweptAt }
    void idbSet('kv', CACHE_KEY, rec)
  }, 400)
}

/* ── Merge ──────────────────────────────────────────── */

const later = <T,>(a: Stamped<T>, b: Stamped<T>): Stamped<T> => (b[1] > a[1] ? b : a)

export function mergeDocs(a: ConcertsDoc, b: ConcertsDoc): ConcertsDoc {
  const manual = { ...a.manual }
  for (const [k, v] of Object.entries(b.manual)) if (!manual[k] || v[1] > manual[k][1]) manual[k] = v
  return { home: later(a.home, b.home), radius: later(a.radius, b.radius), manual, seenAt: later(a.seenAt, b.seenAt) }
}

function normalise(raw: Partial<ConcertsDoc> | undefined | null): ConcertsDoc {
  const e = emptyDoc()
  if (!raw || typeof raw !== 'object') return e
  return {
    home: Array.isArray(raw.home) ? raw.home : e.home,
    radius: Array.isArray(raw.radius) && RADII.includes(raw.radius[0]) ? raw.radius : e.radius,
    manual: raw.manual && typeof raw.manual === 'object' ? raw.manual : {},
    seenAt: Array.isArray(raw.seenAt) ? raw.seenAt : e.seenAt,
  }
}

/** Drop deletions older than 60 days (both devices have seen them by then) and shows long past. */
function prune(doc: ConcertsDoc): ConcertsDoc {
  const cutoff = Date.now() - 60 * DAY
  const old = isoDay(Date.now() - 30 * DAY)
  const manual: ConcertsDoc['manual'] = {}
  for (const [k, v] of Object.entries(doc.manual)) {
    if (v[0] === null && v[1] < cutoff) continue
    if (v[0] && v[0].date < old) continue
    manual[k] = v
  }
  return { ...doc, manual }
}

/* ── Local change → Drive ───────────────────────────── */

function change(doc: ConcertsDoc, syncIn = 4_000) {
  dirty = true
  set({ doc })
  persist()
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void concertsStore.sync(), syncIn)
}

async function rootId(): Promise<string | null> {
  return (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
}

async function writeFile(doc: ConcertsDoc, parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-concerts', v: 1, updatedAt: new Date().toISOString(), ...doc } satisfies ConcertsFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: CONCERTS_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
}

/* ── Ticketmaster helper ────────────────────────────── */

class ApiDown extends Error {
  kind: ConcertsError
  constructor(kind: ConcertsError) {
    super(kind)
    this.kind = kind
  }
}

async function fetchArtist(name: string, mbid: string | undefined, tmId: string | null | undefined): Promise<{ found: false } | { found: true; id: string; events: Ev[] }> {
  const wait = lastRequest + GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequest = Date.now()
  const q = new URLSearchParams({ name })
  if (mbid) q.set('mbid', mbid)
  if (tmId) q.set('id', tmId)
  let res: Response
  try {
    res = await fetch(`${API_BASE}api/concerts/artist?${q}`, { headers: { 'X-Pelagic': '1' } })
  } catch {
    throw new ApiDown('offline')
  }
  // no helper behind this origin (local dev) or no key set: nothing to do until it's set up
  if (res.status === 503 || res.status === 404 || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new ApiDown('config')
  if (!res.ok) throw new ApiDown('failed')
  const j = (await res.json()) as { found?: boolean; id?: string; events?: Ev[] }
  if (!j.found || !j.id) return { found: false }
  return { found: true, id: j.id, events: Array.isArray(j.events) ? j.events : [] }
}

/** Store one artist's answer; events not seen before are stamped (0 on the artist's first fetch). */
function store(artistId: string, ans: { found: false } | { found: true; id: string; events: Ev[] }) {
  const prev = state.tours[artistId]
  const now = Date.now()
  const tour: ArtistTour = ans.found ? { at: now, tmId: ans.id, events: ans.events } : { at: now, tmId: null, events: [] }
  const firstSeen = { ...state.firstSeen }
  for (const e of tour.events) if (firstSeen[e.id] === undefined) firstSeen[e.id] = prev ? now : 0
  set({ tours: { ...state.tours, [artistId]: tour }, firstSeen })
  persist()
}

function targets(c: Catalogue) {
  const seen = new Set<string>()
  const out: { id: string; name: string; mbid?: string }[] = []
  for (const info of artistsByName(c)) {
    const a = info.artist
    if (VARIOUS.test(a.name.trim())) continue
    const k = a.mbid ?? a.name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ id: a.id, name: a.name, mbid: a.mbid })
  }
  return out
}

/* ── Store API ──────────────────────────────────────── */

export const concertsStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  load(): Promise<void> {
    loading ??= (async () => {
      const gen = generation
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY).catch(() => undefined)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec?.doc && (!email || !rec.email || rec.email === email)) {
        fileId = rec.fileId
        version = rec.version
        dirty = rec.dirty
        set({ doc: mergeDocs(normalise(rec.doc), state.doc), tours: rec.tours ?? {}, firstSeen: rec.firstSeen ?? {}, sweptAt: rec.sweptAt ?? null, loaded: true })
      } else set({ loaded: true })
    })()
    return loading
  },

  /** Pull the other device's city / shows, push ours. */
  sync(): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await concertsStore.load()
      try {
        const parent = await rootId()
        if (gen !== generation || !parent) return
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(CONCERTS_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            fileId = null
            version = null
            const d = state.doc
            dirty = dirty || d.home[1] > 0 || Object.keys(d.manual).length > 0
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<ConcertsFile>
            if (gen !== generation) return
            set({ doc: mergeDocs(state.doc, normalise(raw)) })
            fileId = meta.id
            version = meta.version ?? null
          }
          if (!dirty) break
          if (meta && attempt < 4) {
            const again = await findChild(CONCERTS_NAME, parent, false)
            if (again && again.version !== meta.version) continue
          }
          dirty = false
          const w = await writeFile(prune(state.doc), parent, meta?.id ?? null)
          if (gen !== generation) return
          fileId = w.id
          version = w.version
          break
        }
        persist()
      } catch (e) {
        if (gen !== generation) return
        dirty = true
        if (!(e instanceof AuthError)) {
          window.clearTimeout(syncTimer)
          syncTimer = window.setTimeout(() => void concertsStore.sync(), 120_000)
        }
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  /** Is a refresh due (home city set, none finished this cycle)? */
  due(now = Date.now()): boolean {
    return !!state.doc.home[0] && (state.sweptAt ?? 0) < cycleStart(now)
  },

  /** The daily refresh: every library artist not yet checked this cycle. */
  sweep(): Promise<void> {
    if (sweepRun) return sweepRun
    const c = libraryStore.get().data
    if (!c) return Promise.resolve()
    const gen = generation
    sweepRun = (async () => {
      const cutoff = cycleStart()
      const all = targets(c)
      const todo = all.filter((t) => (state.tours[t.id]?.at ?? 0) < cutoff).sort((a, b) => (state.tours[a.id]?.at ?? 0) - (state.tours[b.id]?.at ?? 0))
      let done = all.length - todo.length
      set({ sweeping: { done, total: all.length }, error: null })
      let fails = 0
      try {
        for (const t of todo) {
          if (gen !== generation) return
          try {
            const ans = await fetchArtist(t.name, t.mbid, state.tours[t.id]?.tmId)
            if (gen !== generation) return
            store(t.id, ans)
            fails = 0
          } catch (e) {
            if (e instanceof ApiDown && e.kind !== 'failed') throw e
            // one artist Ticketmaster choked on: skip it this time, give up after a few in a row
            if (++fails >= 4) throw new ApiDown('failed')
          }
          done++
          set({ sweeping: { done, total: all.length } })
        }
        // drop artists that left the library and first-seen stamps of events that are gone
        const ids = new Set(all.map((t) => t.id))
        const tours: Record<string, ArtistTour> = {}
        for (const [k, v] of Object.entries(state.tours)) if (ids.has(k)) tours[k] = v
        const live = new Set(Object.values(tours).flatMap((t) => t.events.map((e) => e.id)))
        const firstSeen: Record<string, number> = {}
        for (const [k, v] of Object.entries(state.firstSeen)) if (live.has(k)) firstSeen[k] = v
        set({ tours, firstSeen, sweptAt: Date.now(), error: null })
        persist()
      } catch (e) {
        if (gen !== generation) return
        set({ error: e instanceof ApiDown ? e.kind : 'failed' })
      } finally {
        if (gen === generation) set({ sweeping: null })
      }
    })().finally(() => {
      sweepRun = null
    })
    return sweepRun
  },

  /** Retry button: run the refresh now (whatever is left of it). */
  retry() {
    if (state.sweeping) return
    if ((state.sweptAt ?? 0) >= cycleStart()) {
      set({ error: null })
      return
    }
    void concertsStore.sweep()
  },

  /** Artist page: make sure this artist's dates are from this cycle (fetch it alone if not). */
  async ensureArtist(artistId: string, force = false): Promise<void> {
    const c = libraryStore.get().data
    const a = c?.artists[artistId]
    if (!a) return
    const t = state.tours[artistId]
    if (!force && t && t.at >= cycleStart()) return
    if (state.fetching.includes(artistId)) return
    // the daily refresh will get to it (and an older answer is on screen meanwhile)
    if (!force && state.sweeping && t) return
    set({ fetching: [...state.fetching, artistId], artistErrors: state.artistErrors.filter((x) => x !== artistId) })
    const gen = generation
    try {
      const ans = await fetchArtist(a.name, a.mbid, t?.tmId)
      if (gen !== generation) return
      store(artistId, ans)
    } catch (e) {
      if (gen !== generation) return
      // no Ticketmaster key behind the helper (yet): On tour stays hidden rather than erroring
      if (e instanceof ApiDown && e.kind === 'config') set({ error: 'config' })
      else set({ artistErrors: [...state.artistErrors, artistId] })
    } finally {
      if (gen === generation) set({ fetching: state.fetching.filter((x) => x !== artistId) })
    }
  },

  setHome(city: City | null) {
    change({ ...state.doc, home: [city, Date.now()] }, 1_500)
    if (city && concertsStore.due()) window.setTimeout(() => void concertsStore.sweep(), 300)
  },
  setRadius(r: Radius) {
    if (state.doc.radius[0] === r) return
    change({ ...state.doc, radius: [r, Date.now()] })
  },
  /** Concerts opened: shows from now on aren't "new" (the badge clears). */
  markSeen() {
    change({ ...state.doc, seenAt: [Date.now(), Date.now()] }, 10_000)
  },
  saveShow(show: ManualShow) {
    change({ ...state.doc, manual: { ...state.doc.manual, [show.id]: [show, Date.now()] } })
  },
  removeShow(id: string) {
    change({ ...state.doc, manual: { ...state.doc.manual, [id]: [null, Date.now()] } })
  },

  reset() {
    generation++
    window.clearTimeout(syncTimer)
    window.clearTimeout(persistTimer)
    fileId = null
    version = null
    dirty = false
    inflight = null
    sweepRun = null
    loading = Promise.resolve()
    set({ loaded: true, doc: emptyDoc(), tours: {}, firstSeen: {}, sweptAt: null, sweeping: null, error: null, fetching: [], artistErrors: [] })
  },

  init() {
    void concertsStore.load()
    let kickTimer = 0
    const kick = (ms: number) => {
      window.clearTimeout(kickTimer)
      kickTimer = window.setTimeout(() => {
        if (libraryStore.get().data && concertsStore.due() && navigator.onLine !== false) void concertsStore.sweep()
      }, ms)
    }
    const syncSoon = () => {
      window.clearTimeout(syncTimer)
      syncTimer = window.setTimeout(() => void concertsStore.sync(), 3_000)
    }
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight) syncSoon()
    })
    if (sessionStore.get().status === 'signed-in') syncSoon()
    // after New releases has started its own sweep
    kick(15_000)
    let had = !!libraryStore.get().data
    libraryStore.subscribe(() => {
      const has = !!libraryStore.get().data
      if (has && !had) kick(15_000)
      had = has
    })
    // the city may arrive from the other device
    let home = state.doc.home[0]
    concertsStore.subscribe(() => {
      if (state.doc.home[0] !== home) {
        home = state.doc.home[0]
        if (home) kick(1_000)
      }
    })
    window.addEventListener('online', () => {
      if (state.error === 'offline') set({ error: null })
      kick(2_000)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (dirty) void concertsStore.sync()
      } else kick(3_000)
    })
    window.setInterval(() => concertsStore.due() && kick(0), 15 * 60_000)
  },
}

onAccountReset(() => concertsStore.reset())

export function useConcerts(): ConcertsState {
  return useSyncExternalStore(concertsStore.subscribe, concertsStore.get, concertsStore.get)
}

/* ── City search (Open-Meteo geocoding) ─────────────── */

interface GeoHit {
  name: string
  country?: string
  country_code?: string
  admin1?: string
  latitude: number
  longitude: number
}

/** Cities matching `q`, biggest first (Open-Meteo sorts by population). */
export async function searchCities(q: string, signal?: AbortSignal): Promise<City[]> {
  const name = q.trim()
  if (name.length < 2) return []
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: '6', language: 'en', format: 'json' })}`, { signal })
  if (!res.ok) throw new Error(`Geocoding answered ${res.status}`)
  const j = (await res.json()) as { results?: GeoHit[] }
  return (j.results ?? []).map((r) => ({ name: r.name, country: r.country ?? '', cc: (r.country_code ?? '').toUpperCase(), admin: r.admin1, lat: r.latitude, lon: r.longitude }))
}

/* ── Small helpers ──────────────────────────────────── */

export function isoDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Great-circle distance in km. */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
