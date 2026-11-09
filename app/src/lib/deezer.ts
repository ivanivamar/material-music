/**
 * Deezer related artists for the radio (step 26), through the site's Deezer proxy
 * (`/api/deezer/related` on Firebase; the Android app calls https://material-music-app.web.app).
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

const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://material-music-app.web.app/') : import.meta.env.BASE_URL
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

/** Deezer's related artists of a library artist as fetched (including ones not in the library); null = not known. */
export function relatedRaw(artistId: string): { id: number; name: string }[] | null {
  return cache[artistId]?.artists ?? null
}

/** Is this Deezer artist in the library (by Deezer id, else by folded name)? */
export function inLibrary(c: Catalogue, a: { id: number; name: string }): boolean {
  const m = matcher(c)
  return m.byDeezer.has(a.id) || m.byName.has(foldKey(a.name))
}

/** Wait until the related-artist cache is read from IndexedDB. */
export const relatedLoaded = () => load()

/** New Releases → Discover: a Deezer artist's releases of the last `days` (through the proxy). */
export interface DzReleases {
  id: number
  name: string
  picture: string | null
  releases: { id: number; t: string; type: 'album' | 'ep' | 'single' | 'compile'; date: string; cover: string | null }[]
  titles: string[]
}
export async function fetchDzReleases(id: number, days = 183): Promise<DzReleases | null> {
  const res = await fetch(`${API_BASE}api/deezer/releases?id=${id}&days=${days}`, { headers: { 'X-Pelagic': '1' } })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`proxy ${res.status}`)
  const j = (await res.json()) as { found?: boolean } & Partial<DzReleases>
  if (!j.found || !j.id) return null
  return { id: j.id, name: j.name ?? '', picture: j.picture ?? null, releases: Array.isArray(j.releases) ? j.releases : [], titles: Array.isArray(j.titles) ? j.titles : [] }
}

/** New Releases → Out now: a release's tracks on Deezer with their 30 s preview URLs (p). */
export interface DzPreviewTrack {
  t: string
  d: number | null
  p: string | null
}
export interface DzPreviews {
  id: number
  link: string | null
  tracks: DzPreviewTrack[]
}

/** Preview URLs are signed and expire, so they are only kept in memory for a few minutes. */
const PREVIEW_TTL = 10 * 60_000
const previewMemo = new Map<string, { at: number; p: Promise<DzPreviews | null> }>()

export function fetchDzPreviews(key: string, q: { artists: string[]; dz: number[]; title: string; date: string; n: number; type: string }): Promise<DzPreviews | null> {
  const hit = previewMemo.get(key)
  if (hit && Date.now() - hit.at < PREVIEW_TTL) return hit.p
  const params = new URLSearchParams()
  for (const a of q.artists) params.append('artist', a)
  for (const id of q.dz) params.append('dz', String(id))
  params.set('title', q.title)
  if (q.date) params.set('date', q.date)
  if (q.n) params.set('n', String(q.n))
  params.set('type', q.type)
  const p = fetch(`${API_BASE}api/deezer/previews?${params}`, { headers: { 'X-Pelagic': '1' } }).then(async (res) => {
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`proxy ${res.status}`)
    const j = (await res.json()) as { found?: boolean } & Partial<DzPreviews>
    if (!j.found || !j.id || !Array.isArray(j.tracks)) return null
    return { id: j.id, link: j.link ?? null, tracks: j.tracks }
  })
  previewMemo.set(key, { at: Date.now(), p })
  // a failure (offline, proxy down) is not remembered: the next ask tries again
  p.catch(() => {
    if (previewMemo.get(key)?.p === p) previewMemo.delete(key)
  })
  return p
}

/* ── Discovery mix (Nov 2026) ───────────────────────── */

/** A Deezer song with its preview: id, title, duration, preview URL, rank; album and artist. */
export interface DzTopTrack {
  id: number
  t: string
  d: number | null
  p: string | null
  al: { id: number; t: string; c: string | null }
  ar: { id: number; n: string }
  link: string | null
}

/**
 * An artist's most popular songs on Deezer (up to `limit`, with previews), by Deezer id, else looked
 * up by name + album titles (like the radio's related artists). null = artist not found.
 */
export async function fetchDzTop(q: { id?: number; name?: string; titles?: string[]; limit?: number }): Promise<{ id: number; name: string; tracks: DzTopTrack[] } | null> {
  const params = new URLSearchParams()
  if (q.id) params.set('id', String(q.id))
  else {
    params.set('name', q.name ?? '')
    for (const t of (q.titles ?? []).slice(0, 40)) params.append('a', t)
  }
  params.set('limit', String(q.limit ?? 40))
  const res = await fetch(`${API_BASE}api/deezer/top?${params}`, { headers: { 'X-Pelagic': '1' } })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`proxy ${res.status}`)
  const j = (await res.json()) as { found?: boolean; id?: number; name?: string; tracks?: DzTopTrack[] }
  if (!j.found || !j.id) return null
  return { id: j.id, name: j.name ?? '', tracks: Array.isArray(j.tracks) ? j.tracks : [] }
}

/** Fresh preview URLs (they expire) for up to 40 Deezer songs. */
export async function fetchDzTracks(ids: number[]): Promise<{ id: number; p: string | null }[]> {
  if (!ids.length) return []
  const params = new URLSearchParams()
  for (const id of ids.slice(0, 40)) params.append('id', String(id))
  const res = await fetch(`${API_BASE}api/deezer/tracks?${params}`, { headers: { 'X-Pelagic': '1' } })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error(`proxy ${res.status}`)
  const j = (await res.json()) as { tracks?: { id: number; p: string | null }[] }
  return Array.isArray(j.tracks) ? j.tracks : []
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
