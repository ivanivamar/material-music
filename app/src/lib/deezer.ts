/**
 * Deezer related artists for the radio (step 26), through the site's Deezer proxy
 * (`/api/deezer/related` on Firebase; the Android app calls https://pelagic-sound.web.app).
 *
 * Only artists that are in the library are kept (matched by Deezer id, else by folded name), most
 * related first. Cached in IndexedDB `kv.related` for 30 days, fetched lazily when a radio needs an
 * artist (and for the Radio for you seeds in the background) through a small queue, ~1 request a
 * second. Offline / no proxy (local dev) → nothing, and the radio falls back to genres only.
 */
import { useSyncExternalStore } from 'react'
import { idbGet, idbSet } from './idb'
import { isNative } from '../native/bridge'
import { foldKey } from '../dj/engine'
import type { Catalogue } from '../state/library'
import { onAccountReset } from '../state/session'

const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://pelagic-sound.web.app/') : import.meta.env.BASE_URL
const KEY = 'related'
const TTL = 30 * 86_400_000
const GAP_MS = 1000

interface Entry {
  at: number
  /** Deezer's related artists (id, name), most related first */
  artists: { id: number; name: string }[]
}

let cache: Record<string, Entry> = {}
let loaded: Promise<void> | null = null
let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  listeners.forEach((l) => l())
}

function load() {
  loaded ??= idbGet<Record<string, Entry>>('kv', KEY)
    .then((rec) => {
      if (rec && typeof rec === 'object') cache = { ...rec, ...cache }
      bump()
    })
    .catch(() => {})
  return loaded
}

let saveTimer = 0
function save() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void idbSet('kv', KEY, cache), 500)
}

/* ── Queue ──────────────────────────────────────────── */

const queue: { artistId: string; name: string; deezerId?: number; titles: string[]; done: (ok: boolean) => void }[] = []
const queued = new Map<string, Promise<boolean>>()
let running = false
let lastAt = 0

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const job = queue.shift()!
      const wait = lastAt + GAP_MS - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastAt = Date.now()
      let ok = false
      try {
        const q = new URLSearchParams()
        if (job.deezerId) q.set('id', String(job.deezerId))
        else {
          q.set('name', job.name)
          for (const t of job.titles.slice(0, 40)) q.append('a', t)
        }
        const res = await fetch(`${API_BASE}api/deezer/related?${q}`, { headers: { 'X-Pelagic': '1' } })
        if (res.ok && (res.headers.get('content-type') ?? '').includes('application/json')) {
          const j = (await res.json()) as { found?: boolean; artists?: { id: number; name: string }[] }
          cache[job.artistId] = { at: Date.now(), artists: j.found && Array.isArray(j.artists) ? j.artists.slice(0, 60) : [] }
          save()
          bump()
          ok = true
        }
      } catch {
        /* offline / no proxy */
      }
      job.done(ok)
    }
  } finally {
    running = false
  }
}

/* ── Public ─────────────────────────────────────────── */

const fresh = (e: Entry | undefined) => !!e && Date.now() - e.at < TTL

/** Make sure the related artists of `artistId` are (being) fetched. Resolves true once cached. */
export function requestRelated(c: Catalogue, artistId: string): Promise<boolean> {
  void load()
  if (fresh(cache[artistId])) return Promise.resolve(true)
  const hit = queued.get(artistId)
  if (hit) return hit
  const a = c.artists[artistId]
  if (!a || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve(false)
  const titles = Object.values(c.albums)
    .filter((al) => al.artistId === artistId)
    .map((al) => al.title)
  const p = loaded!.then(
    () =>
      fresh(cache[artistId])
        ? true
        : new Promise<boolean>((done) => {
            queue.push({ artistId, name: a.name, deezerId: a.deezerId, titles, done })
            void pump()
          }),
  )
  queued.set(artistId, p)
  void p.finally(() => queued.delete(artistId))
  return p
}

const matchMemo = new WeakMap<Catalogue, { byDeezer: Map<number, string>; byName: Map<string, string> }>()
function matcher(c: Catalogue) {
  let m = matchMemo.get(c)
  if (!m) {
    const byDeezer = new Map<number, string>()
    const byName = new Map<string, string>()
    for (const a of Object.values(c.artists)) {
      if (a.deezerId) byDeezer.set(a.deezerId, a.id)
      byName.set(foldKey(a.name), a.id)
    }
    matchMemo.set(c, (m = { byDeezer, byName }))
  }
  return m
}

/** Library artists related to `artistId` (most related first); null = not known (yet). */
export function relatedOf(c: Catalogue, artistId: string): string[] | null {
  const e = cache[artistId]
  if (!e) return null
  const m = matcher(c)
  const out: string[] = []
  for (const a of e.artists) {
    const id = m.byDeezer.get(a.id) ?? m.byName.get(foldKey(a.name))
    if (id && id !== artistId && !out.includes(id)) out.push(id)
  }
  return out
}

/** Re-render when related artists arrive. */
export function useRelatedVersion(): number {
  return useSyncExternalStore(
    (l) => {
      void load()
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
    () => version,
  )
}

onAccountReset(() => {
  cache = {}
  queue.length = 0
  bump()
})
