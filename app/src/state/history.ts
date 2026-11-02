/**
 * Play history (step 8): every counted play, on every device. Since step 39 it lives in Firestore
 * (`users/<uid>/history/<YYYY-MM>`: `plays: ["at|trackId|dev", …]`, added with arrayUnion, so two
 * devices never conflict); before that it was Drive `Pelagic/history.json`, which each device reads
 * once to migrate (sync/cloud.ts).
 *
 * A play is one row `[at, trackId, dev]` — `at` in Unix seconds (when listening started), `dev` a
 * random id per install. Rows are never edited, so devices merge by union: the key `at|trackId|dev`
 * can't collide, nothing conflicts and a play recorded offline on the phone simply joins the file
 * the next time that device syncs.
 *
 * Local copy: IndexedDB `kv.history` (all plays + which ones the cloud doesn't have yet). A live
 * listener brings the other devices' plays in; this device's new plays go up in batches.
 *
 * What counts as a play is decided by player/playTracker.ts.
 */
import { useSyncExternalStore } from 'react'
import { HISTORY_NAME } from '../config'
import { AuthError } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { isNative } from '../native/bridge'
import { cloudFailed, migrateOnce, onCloud, whenCloud, withTimeout } from '../sync/cloud'
import type { SyncBackend } from '../sync/firebase'
import { readRootJson } from '../sync/legacyDrive'
import { onAccountReset, sessionStore } from './session'

export interface Play {
  /** Unix seconds, when listening started */
  at: number
  trackId: string
  /** device id (`a-…` Android app, `w-…` browser / PWA) */
  dev: string
}

/** history.json on Drive (before step 39; read once to migrate) */
interface HistoryFile {
  format: 'pelagic-history'
  v: 1
  updatedAt: string
  plays: [number, string, string][]
}

interface CacheRecord {
  email: string | null
  plays: [number, string, string][]
  /** keys of plays the cloud doesn't have yet */
  pending: string[]
  syncedAt: number | null
}

/** users/<uid>/history/<YYYY-MM> */
interface MonthDoc {
  plays?: string[]
}

export interface HistoryState {
  /** oldest first */
  plays: Play[]
  /** the IndexedDB copy has been read */
  loaded: boolean
  syncing: boolean
  syncedAt: number | null
  /** plays recorded here that the cloud doesn't have yet */
  pending: number
  error: string | null
}

const CACHE_KEY = 'history'

export const playKey = (p: Play) => `${p.at}|${p.trackId}|${p.dev}`
const toRow = (p: Play): [number, string, string] => [p.at, p.trackId, p.dev]
/** "at|trackId|dev" (the cloud's form) → play */
const fromKey = (k: unknown): Play | null => {
  if (typeof k !== 'string') return null
  const [a, trackId, dev] = k.split('|')
  const at = Number(a)
  return Number.isFinite(at) && trackId && dev ? { at, trackId, dev } : null
}
/** month bucket of a play (UTC) */
const monthOf = (at: number) => new Date(at * 1000).toISOString().slice(0, 7)
const fromRow = (r: unknown): Play | null =>
  Array.isArray(r) && typeof r[0] === 'number' && typeof r[1] === 'string' && typeof r[2] === 'string' ? { at: r[0], trackId: r[1], dev: r[2] } : null

/* ── Device id ──────────────────────────────────────── */

const DEVICE_KEY = 'pelagic.device.v1'
function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY)
    if (saved) return saved
    const id = `${isNative ? 'a' : 'w'}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return isNative ? 'a-anon' : 'w-anon'
  }
}
export const DEVICE = deviceId()

/* ── Store ──────────────────────────────────────────── */

let state: HistoryState = { plays: [], loaded: false, syncing: false, syncedAt: null, pending: 0, error: null }
const listeners = new Set<() => void>()
function set(patch: Partial<HistoryState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

/** everything known (key → play) and what the cloud still lacks */
let byKey = new Map<string, Play>()
let pending = new Set<string>()
let generation = 0

function publish(extra: Partial<HistoryState> = {}) {
  set({ plays: [...byKey.values()].sort((a, b) => a.at - b.at), pending: pending.size, ...extra })
}

let persistTimer = 0
function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    if (!state.loaded) return
    void idbSet('kv', CACHE_KEY, {
      email: sessionStore.get().account?.email ?? null,
      plays: state.plays.map(toRow),
      pending: [...pending],
      syncedAt: state.syncedAt,
    } satisfies CacheRecord)
  }, 300)
}

/** Add plays; returns how many were new. */
function merge(plays: Iterable<Play>, markPending: boolean): number {
  let n = 0
  for (const p of plays) {
    const k = playKey(p)
    if (byKey.has(k)) continue
    byKey.set(k, p)
    if (markPending) pending.add(k)
    n++
  }
  return n
}

let loading: Promise<void> | null = null
let inflight: Promise<void> | null = null
let syncTimer = 0

function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void historyStore.sync(), ms)
}

/** Before step 39: the Drive file, merged in once per device; whatever it has that we didn't goes up. */
async function pullDrive() {
  const raw = await readRootJson<Partial<HistoryFile>>(HISTORY_NAME)
  const remote = (Array.isArray(raw?.plays) ? raw.plays : []).map(fromRow).filter((p): p is Play => !!p)
  merge(remote, false)
  // the cloud may not have any of it yet: send everything once (arrayUnion skips what it has)
  for (const k of byKey.keys()) pending.add(k)
  publish()
  persist()
}

/** The other devices' plays, live. */
function listen(b: SyncBackend) {
  const gen = generation
  return b.watchCol<MonthDoc>(
    'history',
    (docs) => {
      if (gen !== generation) return
      const remote: Play[] = []
      for (const d of docs) for (const k of d.data.plays ?? []) {
        const p = fromKey(k)
        if (p) remote.push(p)
      }
      const n = merge(remote, false)
      // a play we were about to send is there already
      let cleared = 0
      if (pending.size) {
        const there = new Set(remote.map(playKey))
        for (const k of pending) if (there.has(k)) {
          pending.delete(k)
          cleared++
        }
      }
      if (n || cleared || !state.syncedAt) {
        publish({ syncedAt: Date.now(), error: null })
        persist()
      }
    },
    (e) => cloudFailed(e),
  )
}

export const historyStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  /** Read the IndexedDB copy (once). Plays recorded before it finishes are kept. */
  load(): Promise<void> {
    loading ??= (async () => {
      const gen = generation
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec && (!email || !rec.email || rec.email === email)) {
        merge(rec.plays.map(fromRow).filter((p): p is Play => !!p), false)
        for (const k of rec.pending) if (byKey.has(k)) pending.add(k)
        publish({ loaded: true, syncedAt: rec.syncedAt })
      } else publish({ loaded: true })
      persist()
    })()
    return loading
  },

  /** A play was counted on this device. */
  record(trackId: string, atMs: number) {
    const play: Play = { at: Math.round(atMs / 1000), trackId, dev: DEVICE }
    if (!merge([play], true)) return
    publish()
    persist()
    // batch a listening session's plays into one write
    scheduleSync(20_000)
  },

  /**
   * Send this device's new plays to the cloud (the live listener brings the others' in). The first
   * time on this device, the old Drive history.json is merged in first. `minAge`: skip when the
   * last sync is younger than that (ms) and nothing is waiting to go up.
   */
  sync(opts: { minAge?: number } = {}): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    if (opts.minAge && !pending.size && state.syncedAt && Date.now() - state.syncedAt < opts.minAge) return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await historyStore.load()
      set({ syncing: true, error: null })
      try {
        const b = await whenCloud()
        if (gen !== generation) return
        if (!b) {
          set({ syncing: false })
          if (pending.size) scheduleSync(120_000)
          return
        }
        await migrateOnce(b, 'history', DEVICE, pullDrive)
        if (gen !== generation) return
        if (pending.size) {
          const sent = [...pending]
          const months = new Map<string, string[]>()
          for (const k of sent) {
            const p = byKey.get(k)
            if (!p) continue
            const m = monthOf(p.at)
            months.set(m, [...(months.get(m) ?? []), k])
          }
          for (const [m, keys] of months) {
            // stay well under Firestore's request size: 2000 keys (~70 kB) per write
            for (let i = 0; i < keys.length; i += 2000) {
              await withTimeout(b.union(`history/${m}`, 'plays', keys.slice(i, i + 2000)))
              if (gen !== generation) return
              for (const k of keys.slice(i, i + 2000)) pending.delete(k)
            }
          }
        }
        publish({ syncing: false, syncedAt: Date.now() })
        persist()
        if (pending.size) scheduleSync(5_000) // plays counted while writing
      } catch (e) {
        if (gen !== generation) return
        set({ syncing: false, error: e instanceof AuthError ? null : (e as Error).message || 'Could not sync play history.' })
        persist()
        if (!(e instanceof AuthError)) scheduleSync(120_000)
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  reset() {
    generation++
    window.clearTimeout(syncTimer)
    byKey = new Map()
    pending = new Set()
    inflight = null
    loading = Promise.resolve()
    set({ plays: [], loaded: true, syncing: false, syncedAt: null, pending: 0, error: null })
  },

  /** Boot: read the local copy; sync when the session allows, on reconnect and when leaving. */
  init() {
    void historyStore.load()
    onCloud((b) => {
      const off = listen(b)
      if (pending.size || !state.syncedAt) scheduleSync(1_500)
      return off
    })
    const trySync = () => void historyStore.sync({ minAge: 60_000 })
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight && (pending.size || !state.syncedAt)) scheduleSync(1_500)
    })
    if (sessionStore.get().status === 'signed-in') scheduleSync(1_500)
    window.addEventListener('online', trySync)
    document.addEventListener('visibilitychange', () => {
      // leaving: push what's waiting; coming back: pick up the other device's plays
      if (document.visibilityState === 'hidden') {
        if (pending.size) void historyStore.sync()
      } else trySync()
    })
  },
}

onAccountReset(() => historyStore.reset())

export function useHistory(): HistoryState {
  return useSyncExternalStore(historyStore.subscribe, historyStore.get, historyStore.get)
}
