/**
 * Cloud data (step 39): the small stores that change often — play history, Jump back in, the DJ's
 * learning, playlists and the shared settings — live in Firestore instead of Drive JSON files.
 * The music, covers and library.json stay on Drive.
 *
 * Each store keeps its local copy (IndexedDB / localStorage) and its own merge rules; this module
 * only hands out a signed-in Firestore backend (the same Firebase session as the player sync, but
 * independent of the "Sync playback" switch) and a few helpers:
 *
 *   - `onCloud(fn)`: fn(backend) whenever a backend is ready (again), and the returned cleanup when
 *     it goes away (sign-out, account switch). Stores attach their live listeners here.
 *   - `whenCloud()`: the backend, or null when it can't be had right now (signed out, offline…).
 *   - `migrateOnce(store, pull)`: the first time this device syncs a store, its Drive JSON is read
 *     once and merged in, so nothing recorded before the move (or by a device still on the old
 *     version) is lost. `meta/migration` lists which devices did that (Settings → Cloud data).
 *   - `stable()`: JSON with sorted keys, to compare a merge result with what Firestore holds.
 */
import { useSyncExternalStore } from 'react'
import { FIREBASE_CONFIG } from '../config'
import { isNative } from '../native/bridge'
import { onAccountReset, sessionStore } from '../state/session'
import type { SyncBackend } from './firebase'

export type CloudStoreName = 'history' | 'recent' | 'dj' | 'playlists' | 'settings'

export interface CloudState {
  status: 'off' | 'connecting' | 'on' | 'error'
  error: string | null
}

export interface MigrationDoc {
  /** device id (history DEVICE) → when it copied its Drive files, and what it is */
  devices?: Record<string, { at: number; name: string; stores: CloudStoreName[] }>
  /** set when the old Drive JSON files went to the Drive trash */
  trashedAt?: number
}

let state: CloudState = { status: 'off', error: null }
const listeners = new Set<() => void>()
function setState(patch: Partial<CloudState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let backend: SyncBackend | null = null
let pending: Promise<SyncBackend | null> | null = null
let gen = 0
let retryTimer = 0

type Attach = (b: SyncBackend) => (() => void) | void
const attachers = new Set<Attach>()
const cleanups = new Map<Attach, () => void>()

export const cloudAvailable = () => !!FIREBASE_CONFIG.apiKey

function detachAll() {
  for (const c of cleanups.values()) {
    try {
      c()
    } catch {
      /* ignore */
    }
  }
  cleanups.clear()
}

function attach(fn: Attach, b: SyncBackend) {
  const c = fn(b)
  if (c) cleanups.set(fn, c)
}

/** Connect (once per account); resolves null when that isn't possible right now. */
export function whenCloud(): Promise<SyncBackend | null> {
  if (backend) return Promise.resolve(backend)
  if (pending) return pending
  const s = sessionStore.get()
  const email = s.account?.email
  if (!cloudAvailable() || s.status !== 'signed-in' || !email) return Promise.resolve(null)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null)
  const my = ++gen
  setState({ status: 'connecting', error: null })
  pending = (async () => {
    try {
      const { connect } = await import('./firebase')
      const b = await connect(email, () => sessionStore.ensureToken())
      if (my !== gen) return null
      backend = b
      setState({ status: 'on', error: null })
      for (const fn of attachers) attach(fn, b)
      return b
    } catch (e) {
      if (my !== gen) return null
      setState({ status: 'error', error: (e as Error).message || 'Could not reach the cloud.' })
      window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(() => void whenCloud(), 120_000)
      return null
    } finally {
      if (my === gen) pending = null
    }
  })()
  return pending
}

/** Run `fn` with the backend now (if connected) and every time it connects again. */
export function onCloud(fn: Attach): () => void {
  attachers.add(fn)
  if (backend) attach(fn, backend)
  return () => {
    attachers.delete(fn)
    cleanups.get(fn)?.()
    cleanups.delete(fn)
  }
}

/** A live listener died (permissions / network): drop the backend and connect again in a minute. */
export function cloudFailed(e: Error) {
  if (!backend) return
  console.warn('cloud listener failed', e)
  gen++
  backend = null
  pending = null
  detachAll()
  setState({ status: 'error', error: e.message || 'Lost the connection to the cloud.' })
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => void whenCloud(), 60_000)
}

export const cloudStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useCloud(): CloudState {
  return useSyncExternalStore(cloudStore.subscribe, cloudStore.get, cloudStore.get)
}

let started = false
/** Boot: connect when signed in, again when the connection comes back. */
export function initCloud() {
  if (started) return
  started = true
  const kick = () => {
    if (sessionStore.get().status === 'signed-in') void whenCloud()
  }
  sessionStore.subscribe(kick)
  window.addEventListener('online', kick)
  kick()
}

onAccountReset(() => {
  gen++
  window.clearTimeout(retryTimer)
  backend = null
  pending = null
  detachAll()
  setState({ status: 'off', error: null })
})

/* ── Helpers ────────────────────────────────────────── */

/** JSON with sorted keys and without undefined (what Firestore keeps), for comparing docs. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const o = x as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(o)
          .filter((k) => o[k] !== undefined)
          .sort()
          .map((k) => [k, o[k]]),
      )
    }
    return x
  })
}

/** Reject after `ms` (a Firestore write waits for the server while offline). */
export function withTimeout<T>(p: Promise<T>, ms = 25_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('The cloud took too long to answer.')), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

/* ── Migration from the Drive JSON files ────────────── */

const MIGRATED_KEY = 'pelagic.cloud.migrated.v1'

function migratedHere(): Record<string, CloudStoreName[]> {
  try {
    return JSON.parse(localStorage.getItem(MIGRATED_KEY) || '{}') as Record<string, CloudStoreName[]>
  } catch {
    return {}
  }
}

export function isMigratedHere(store: CloudStoreName): boolean {
  const email = sessionStore.get().account?.email ?? ''
  return (migratedHere()[email] ?? []).includes(store)
}

/**
 * Once per device and store: `pull()` reads the store's Drive JSON and merges it into the local copy
 * (the store then pushes everything up as usual). A pull that fails is tried again next time.
 */
export async function migrateOnce(b: SyncBackend, store: CloudStoreName, deviceId: string, pull: () => Promise<void>): Promise<void> {
  if (isMigratedHere(store)) return
  await pull()
  const email = sessionStore.get().account?.email ?? ''
  const all = migratedHere()
  all[email] = [...new Set([...(all[email] ?? []), store])]
  try {
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
  const done = all[email]
  await b
    .update<MigrationDoc>('meta/migration', (cur) => ({
      ...cur,
      devices: { ...cur?.devices, [deviceId]: { at: Date.now(), name: isNative ? 'Phone' : 'PC', stores: done } },
    }))
    .catch(() => undefined)
}

export function forgetMigrations() {
  try {
    localStorage.removeItem(MIGRATED_KEY)
  } catch {
    /* ignore */
  }
}
