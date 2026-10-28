/**
 * Jump back in (step 26): the last things played *from* — albums, playlists, smart playlists, mixes,
 * radios, artists — on every device, kept in Drive `Pelagic/recent.json`:
 *
 *   { format: 'pelagic-recent', v: 1, updatedAt, items: [{ kind, id, at, dev, label? }] }
 *
 * `kind` album · playlist · smart · mix · radio · artist; radio ids carry the seed
 * (`radio:song:<trackId>`…); `label` is a fallback name if the item is gone. Merge = union on
 * `kind|id|at|dev`, then the newest per `kind|id`, the last 50 kept — nothing conflicts (like
 * history.json). Local copy: IndexedDB `kv.recent`. Same sync triggers as the history (sign-in,
 * shortly after a change, leaving / coming back, Home open ≥ 60 s apart).
 *
 * An item is recorded when its context starts playing. A quick mis-tap shouldn't push out real
 * items, so an item replaced by another context within 30 s is dropped again (it hasn't been
 * synced yet: the sync waits 35 s after a change).
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { DEVICE } from './history'
import { playerStore, type PlayContext } from './player'
import { playlistsStore } from './playlists'
import { onAccountReset, sessionStore } from './session'

export const RECENT_NAME = 'recent.json'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const CACHE_KEY = 'recent'
const MAX = 50
const MIS_TAP_MS = 30_000

export type RecentKind = 'album' | 'playlist' | 'smart' | 'mix' | 'radio' | 'artist'
export interface RecentItem {
  kind: RecentKind
  id: string
  /** Unix seconds */
  at: number
  dev: string
  label?: string
}

interface RecentFile {
  format: 'pelagic-recent'
  v: 1
  updatedAt: string
  items: RecentItem[]
}

interface CacheRecord {
  email: string | null
  items: RecentItem[]
  dirty: boolean
  fileId: string | null
  version: string | null
  syncedAt: number | null
}

export interface RecentState {
  /** newest first, one per kind|id */
  items: RecentItem[]
  loaded: boolean
  syncedAt: number | null
}

const KINDS = new Set<RecentKind>(['album', 'playlist', 'smart', 'mix', 'radio', 'artist'])
const keyOf = (r: RecentItem) => `${r.kind}|${r.id}`
const valid = (x: unknown): x is RecentItem => {
  const r = x as RecentItem
  return !!r && KINDS.has(r.kind) && typeof r.id === 'string' && typeof r.at === 'number' && typeof r.dev === 'string'
}

/** Union, newest per kind|id, the last 50. */
export function mergeRecent(...lists: RecentItem[][]): RecentItem[] {
  const best = new Map<string, RecentItem>()
  for (const list of lists)
    for (const r of list) {
      if (!valid(r)) continue
      const k = keyOf(r)
      const cur = best.get(k)
      if (!cur || r.at > cur.at || (r.at === cur.at && r.dev > cur.dev)) best.set(k, r)
    }
  return [...best.values()].sort((a, b) => b.at - a.at || (a.dev < b.dev ? -1 : 1)).slice(0, MAX)
}

let state: RecentState = { items: [], loaded: false, syncedAt: null }
const listeners = new Set<() => void>()
function set(patch: Partial<RecentState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let dirty = false
let fileId: string | null = null
let version: string | null = null
let generation = 0
let loading: Promise<void> | null = null
let inflight: Promise<void> | null = null
let syncTimer = 0
/** the item recorded last, while it can still be taken back as a mis-tap */
let provisional: { item: RecentItem; prev: RecentItem | null; until: number } | null = null

function persist() {
  if (!state.loaded) return
  void idbSet('kv', CACHE_KEY, { email: sessionStore.get().account?.email ?? null, items: state.items, dirty, fileId, version, syncedAt: state.syncedAt } satisfies CacheRecord)
}

function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void recentStore.sync(), ms)
}

async function writeFile(items: RecentItem[], parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-recent', v: 1, updatedAt: new Date().toISOString(), items } satisfies RecentFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: RECENT_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
}

/** What a player context counts as in Jump back in (null: not tracked — DJ, search, queue…). */
function recentOf(ctx: PlayContext | null): { kind: RecentKind; id: string; label: string } | null {
  if (!ctx?.id) return null
  switch (ctx.kind) {
    case 'album':
    case 'artist':
    case 'mix':
    case 'radio':
      return { kind: ctx.kind, id: ctx.id, label: ctx.label }
    case 'playlist':
      return { kind: playlistsStore.get().byId.get(ctx.id)?.smart ? 'smart' : 'playlist', id: ctx.id, label: ctx.label }
    default:
      return null
  }
}

export const recentStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  load(): Promise<void> {
    loading ??= (async () => {
      const gen = generation
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec && (!email || !rec.email || rec.email === email)) {
        dirty = rec.dirty || dirty
        fileId = rec.fileId
        version = rec.version
        set({ items: mergeRecent(rec.items ?? [], state.items), loaded: true, syncedAt: rec.syncedAt })
      } else set({ loaded: true })
    })()
    return loading
  },

  /** A context started playing here. */
  record(kind: RecentKind, id: string, label: string) {
    const now = Date.now()
    const item: RecentItem = { kind, id, at: Math.floor(now / 1000), dev: DEVICE, label: label.slice(0, 120) }
    // the previous one was a mis-tap: take it back
    if (provisional && now < provisional.until && keyOf(provisional.item) !== keyOf(item)) {
      const { item: gone, prev } = provisional
      const kept = state.items.filter((r) => !(keyOf(r) === keyOf(gone) && r.at === gone.at && r.dev === gone.dev))
      state = { ...state, items: prev ? mergeRecent(kept, [prev]) : kept }
    }
    const prev = state.items.find((r) => keyOf(r) === keyOf(item)) ?? null
    provisional = { item, prev, until: now + MIS_TAP_MS }
    dirty = true
    set({ items: mergeRecent(state.items, [item]) })
    persist()
    scheduleSync(MIS_TAP_MS + 5_000)
  },

  sync(opts: { minAge?: number } = {}): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    if (opts.minAge && !dirty && state.syncedAt && Date.now() - state.syncedAt < opts.minAge) return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await recentStore.load()
      try {
        const parent = (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
        if (gen !== generation || !parent) return
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(RECENT_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            fileId = null
            version = null
            if (state.items.length) dirty = true
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<RecentFile>
            if (gen !== generation) return
            const remote = Array.isArray(raw.items) ? raw.items.filter(valid) : []
            const merged = mergeRecent(state.items, remote)
            // something of ours isn't on Drive yet → write
            const onDrive = new Set(remote.map((r) => `${keyOf(r)}|${r.at}|${r.dev}`))
            if (merged.some((r) => !onDrive.has(`${keyOf(r)}|${r.at}|${r.dev}`))) dirty = true
            fileId = meta.id
            version = meta.version ?? null
            set({ items: merged })
          }
          if (!dirty) break
          if (meta && attempt < 4) {
            const again = await findChild(RECENT_NAME, parent, false)
            if (again && again.version !== meta.version) continue
          }
          const w = await writeFile(state.items, parent, meta?.id ?? null)
          if (gen !== generation) return
          fileId = w.id
          version = w.version
          dirty = false
          break
        }
        set({ syncedAt: Date.now() })
        persist()
      } catch (e) {
        if (gen !== generation) return
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
    dirty = false
    fileId = null
    version = null
    inflight = null
    provisional = null
    loading = Promise.resolve()
    set({ items: [], loaded: true, syncedAt: null })
  },

  init() {
    void recentStore.load()
    const trySync = () => void recentStore.sync({ minAge: 60_000 })
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight && (dirty || !state.syncedAt)) scheduleSync(2_000)
    })
    if (sessionStore.get().status === 'signed-in') scheduleSync(2_000)
    window.addEventListener('online', trySync)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (dirty) void recentStore.sync()
      } else trySync()
    })
    // record what starts playing
    const keyNow = () => {
      const p = playerStore.get()
      if (p.index < 0) return null
      return `${p.context?.kind ?? ''}|${p.context?.id ?? ''}`
    }
    // what was loaded at boot isn't a new play
    let last: string | null = keyNow()
    playerStore.subscribe(() => {
      // following another device (step 37): it records what it plays
      if (playerStore.get().remote) return
      const k = keyNow()
      if (k === last) return
      last = k
      const r = k ? recentOf(playerStore.get().context) : null
      if (r) recentStore.record(r.kind, r.id, r.label)
    })
  },
}

onAccountReset(() => recentStore.reset())

export function useRecent(): RecentState {
  return useSyncExternalStore(recentStore.subscribe, recentStore.get, recentStore.get)
}
