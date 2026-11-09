/**
 * Preview songs (Discovery mix, Nov 2026): songs that are NOT in the library, played as Deezer's 30 s
 * clips through the normal player — queue, lock screen, notification, widget, PC ↔ phone sync.
 *
 * In the queue they are `pv:<deezer track id>` (like the DJ's `dj:intro:` items, never a catalogue
 * id). This registry knows what each one is (title, artist, cover, the preview URL); the player
 * surfaces look songs up with `trackOf()` / `albumOf()`, which fall back to it, so a preview shows
 * like any song. Everything that learns from listening skips them: play history (so stats, recap,
 * mixes, the Day mix), the DJ (they never enter a DJ session), hearts (no Liked songs entry).
 *
 * Preview URLs are signed and expire: `freshPreviewUrl()` asks the proxy again when one is older
 * than PREVIEW_TTL (before Play, and when a load fails).
 *
 * Kept in IndexedDB `kv.previews` (the current Discovery week + the wishlist), so a restored queue
 * still knows its songs after a reload.
 */
import { useSyncExternalStore } from 'react'
import { idbGet, idbSet } from '../lib/idb'
import { fetchDzTracks } from '../lib/deezer'
import type { Album, Catalogue, Track } from './library'
import { onAccountReset } from './session'

export const PREVIEW_PREFIX = 'pv:'
export const isPreviewId = (id: string | null | undefined): id is string => !!id && id.startsWith(PREVIEW_PREFIX)
export const previewId = (dz: number) => `${PREVIEW_PREFIX}${dz}`
export const dzOf = (id: string) => Number(id.slice(PREVIEW_PREFIX.length))

export interface PreviewInfo {
  /** Deezer track id */
  dz: number
  title: string
  artist: string
  /** Deezer artist id */
  artistDz: number
  album: string
  albumDz: number
  /** cover URL (Deezer CDN), null = none */
  cover: string | null
  /** the 30 s MP3 (signed; expires) */
  url: string | null
  /** ms: when `url` was fetched */
  urlAt: number
  /** gap: a song missing from a library artist; new: an artist you might like */
  kind: 'gap' | 'new'
  /** library artist names it comes from ("like A and B" / the artist itself) */
  because: string[]
  /** gap: the library artist id */
  libArtistId?: string
  /** Deezer link */
  link?: string | null
  /** clip length, seconds */
  duration: number
}

const PREVIEW_TTL = 20 * 60_000
const KEY = 'previews'

let map = new Map<string, PreviewInfo>()
let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  trackMemo.clear()
  listeners.forEach((l) => l())
}

let loaded: Promise<void> | null = null
export function loadPreviews(): Promise<void> {
  loaded ??= idbGet<PreviewInfo[]>('kv', KEY)
    .then((list) => {
      if (Array.isArray(list)) for (const p of list) if (p && p.dz && !map.has(previewId(p.dz))) map.set(previewId(p.dz), p)
      bump()
    })
    .catch(() => {})
  return loaded
}
let saveTimer = 0
function save() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void idbSet('kv', KEY, [...map.values()]), 400)
}

export const previewsStore = {
  get: (id: string) => map.get(id) ?? null,
  all: () => [...map.values()],
  /** Add / update songs (keeps a fresher URL already known). */
  put(list: PreviewInfo[]) {
    for (const p of list) {
      const id = previewId(p.dz)
      const cur = map.get(id)
      map.set(id, cur && cur.urlAt > p.urlAt ? { ...p, url: cur.url, urlAt: cur.urlAt } : p)
    }
    bump()
    save()
  },
  /** Forget everything but these ids (the new week + wishlist). */
  keepOnly(ids: Set<string>) {
    let changed = false
    for (const k of [...map.keys()])
      if (!ids.has(k)) {
        map.delete(k)
        changed = true
      }
    if (changed) {
      bump()
      save()
    }
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function usePreviewsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      void loadPreviews()
      return previewsStore.subscribe(l)
    },
    () => version,
    () => version,
  )
}

/* ── Looking songs up like catalogue songs ──────────── */

const trackMemo = new Map<string, { track: Track; album: Album }>()

function asCatalogue(id: string): { track: Track; album: Album } | null {
  const hit = trackMemo.get(id)
  if (hit) return hit
  const p = map.get(id)
  if (!p) return null
  const albumId = `pva:${p.albumDz || p.dz}`
  const artistId = `pvr:${p.artistDz}`
  const out = {
    track: { id, title: p.title, artist: p.artist, albumId, artistId, disc: 1, track: null, duration: p.duration, flac: { id: '', size: 0 }, addedAt: '' } satisfies Track,
    album: { id: albumId, title: p.album, artistId, artist: p.artist, addedAt: '', cover: p.cover ? `url:${p.cover}` : null } satisfies Album,
  }
  trackMemo.set(id, out)
  return out
}

/** A catalogue track, else a preview song shaped like one (title, artist, 30 s). */
export function trackOf(c: Catalogue | null | undefined, id: string | null | undefined): Track | undefined {
  if (!id) return undefined
  return c?.tracks[id] ?? (isPreviewId(id) ? asCatalogue(id)?.track : undefined)
}
/** A catalogue album, else a preview song's album (its cover is a `url:` cover, see lib/covers.ts). */
export function albumOf(c: Catalogue | null | undefined, albumId: string | null | undefined): Album | undefined {
  if (!albumId) return undefined
  const a = c?.albums[albumId]
  if (a) return a
  if (!albumId.startsWith('pva:')) return undefined
  for (const [id, p] of map) if (`pva:${p.albumDz || p.dz}` === albumId) return asCatalogue(id)?.album
  return undefined
}

/* ── Preview URLs ───────────────────────────────────── */

let inflight: Promise<void> | null = null

/** Fetch fresh preview URLs for these songs (the ones older than the TTL, or all with `force`). */
export async function refreshPreviews(ids: string[], force = false): Promise<void> {
  await loadPreviews()
  if (inflight) await inflight.catch(() => {})
  const stale = ids.filter((id) => {
    const p = map.get(id)
    return p && (force || !p.url || Date.now() - p.urlAt > PREVIEW_TTL)
  })
  if (!stale.length) return
  inflight = (async () => {
    for (let i = 0; i < stale.length; i += 40) {
      const chunk = stale.slice(i, i + 40)
      const got = await fetchDzTracks(chunk.map(dzOf))
      const now = Date.now()
      for (const g of got) {
        const id = previewId(g.id)
        const cur = map.get(id)
        if (cur) map.set(id, { ...cur, url: g.p, urlAt: now })
      }
    }
    bump()
    save()
  })()
  try {
    await inflight
  } finally {
    inflight = null
  }
}

/** The song's preview URL, fetched again if it may have expired (null: none / offline). */
export async function freshPreviewUrl(id: string, force = false): Promise<string | null> {
  await loadPreviews()
  try {
    await refreshPreviews([id], force)
  } catch {
    /* offline: try the one we have */
  }
  return map.get(id)?.url ?? null
}

onAccountReset(() => {
  map = new Map()
  bump()
  void idbSet('kv', KEY, [])
})
