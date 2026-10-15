/**
 * Play history (step 8): every counted play, on every device, kept in Drive `Pelagic/history.json`.
 *
 * A play is one row `[at, trackId, dev]` — `at` in Unix seconds (when listening started), `dev` a
 * random id per install. Rows are never edited, so devices merge by union: the key `at|trackId|dev`
 * can't collide, nothing conflicts and a play recorded offline on the phone simply joins the file
 * the next time that device syncs.
 *
 * Local copy: IndexedDB `kv.history` (all plays + which ones Drive doesn't have yet + the Drive file
 * version they were merged with). Sync: download only when Drive's `version` moved, write only when
 * this device has plays Drive doesn't, and check the version again right before writing (same
 * pattern as the catalogue in upload/driveWrite.ts).
 *
 * What counts as a play is decided by player/playTracker.ts.
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT, HISTORY_NAME } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { isNative } from '../native/bridge'
import { onAccountReset, sessionStore } from './session'

export interface Play {
  /** Unix seconds, when listening started */
  at: number
  trackId: string
  /** device id (`a-…` Android app, `w-…` browser / PWA) */
  dev: string
}

/** history.json on Drive */
interface HistoryFile {
  format: 'pelagic-history'
  v: 1
  updatedAt: string
  plays: [number, string, string][]
}

interface CacheRecord {
  email: string | null
  plays: [number, string, string][]
  /** keys of plays Drive doesn't have yet */
  pending: string[]
  fileId: string | null
  version: string | null
  syncedAt: number | null
}

export interface HistoryState {
  /** oldest first */
  plays: Play[]
  /** the IndexedDB copy has been read */
  loaded: boolean
  syncing: boolean
  syncedAt: number | null
  /** plays recorded here that Drive doesn't have yet */
  pending: number
  error: string | null
}

const CACHE_KEY = 'history'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export const playKey = (p: Play) => `${p.at}|${p.trackId}|${p.dev}`
const toRow = (p: Play): [number, string, string] => [p.at, p.trackId, p.dev]
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

/** everything known (key → play) and what Drive still lacks */
let byKey = new Map<string, Play>()
let pending = new Set<string>()
let fileId: string | null = null
let version: string | null = null
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
      fileId,
      version,
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

async function rootId(): Promise<string | null> {
  return (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
}

async function writeFile(rows: [number, string, string][], parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-history', v: 1, updatedAt: new Date().toISOString(), plays: rows } satisfies HistoryFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: HISTORY_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
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
        fileId = rec.fileId
        version = rec.version
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
   * Pull plays from other devices and push this device's new ones. `minAge`: skip when the last
   * sync is younger than that (ms) and nothing is waiting to go up.
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
        const parent = await rootId()
        if (gen !== generation) return
        if (!parent) {
          set({ syncing: false })
          return
        }
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(HISTORY_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            // first device to write (or the file was deleted): everything we have goes up
            for (const k of byKey.keys()) pending.add(k)
            fileId = null
            version = null
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<HistoryFile>
            if (gen !== generation) return
            const remote = (Array.isArray(raw.plays) ? raw.plays : []).map(fromRow).filter((p): p is Play => !!p)
            merge(remote, false)
            const onDrive = new Set(remote.map(playKey))
            pending = new Set([...byKey.keys()].filter((k) => !onDrive.has(k)))
            fileId = meta.id
            version = meta.version ?? null
            publish()
          }
          if (!pending.size) break
          // someone wrote since we looked → merge their copy first
          if (meta && attempt < 4) {
            const now = await findChild(HISTORY_NAME, parent, false)
            if (now && now.version !== meta.version) continue
          }
          const sent = new Set(pending)
          const rows = [...byKey.values()].sort((a, b) => a.at - b.at).map(toRow)
          const w = await writeFile(rows, parent, meta?.id ?? null)
          if (gen !== generation) return
          fileId = w.id
          version = w.version
          for (const k of sent) pending.delete(k)
          break
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
    fileId = null
    version = null
    inflight = null
    loading = Promise.resolve()
    set({ plays: [], loaded: true, syncing: false, syncedAt: null, pending: 0, error: null })
  },

  /** Boot: read the local copy; sync when the session allows, on reconnect and when leaving. */
  init() {
    void historyStore.load()
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
