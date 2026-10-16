/**
 * The catalogue (Drive `Pelagic/library.json`, written by tools/import).
 *
 * Launch: show the IndexedDB copy straight away, then ask Drive whether library.json changed
 * (file `version`) and download it in the background if so. With no cached copy the app shows
 * the "Charting your library" screen while it downloads.
 */
import { useSyncExternalStore } from 'react'
import { AuthError, download, findCatalogue, type DriveFile } from '../lib/drive'
import { idbClear, idbGet, idbSet } from '../lib/idb'
import { onAccountReset, sessionStore } from './session'

/* ── Catalogue types (mirror tools/import/src/import.js) ── */

export interface ArtistImage {
  id: string
  v?: number
  source?: 'local' | 'deezer' | 'mosaic'
  /** local: mtime of the source file (the importer and the Upload page both set it) */
  mtime?: number
  /** mosaic: how many albums it was made from */
  albums?: number
}
export interface Artist {
  id: string
  name: string
  addedAt: string
  dir?: string
  image?: ArtistImage
  background?: { id: string; v?: number; mtime?: number }
  mbid?: string
  deezerId?: number
}
export interface Album {
  id: string
  title: string
  artistId: string
  artist: string
  addedAt: string
  year?: number
  date?: string
  genre?: string
  /** Drive file id of covers/<albumId>.jpg (600px) */
  cover: string | null
  trackCount?: number
}
export interface Track {
  id: string
  title: string
  artist: string
  albumId: string
  artistId: string
  disc: number
  track: number | null
  duration?: number
  isrc?: string
  bpm?: number
  lyrics?: string
  syncedLyrics?: boolean
  flac: { id: string; size: number; sampleRate?: number; bitDepth?: number }
  mobile?: { id: string; size: number; codec: 'opus'; bitrate: string }
  source?: { path: string; size: number; mtime: number }
  addedAt: string
}
/**
 * What was removed from the library (state/removal.ts). The full entries are kept so a removal can
 * be undone, and so the importer / Upload page know not to bring them back: the importer skips a
 * file whose `source.path` or track id is listed here (unless `--include-removed`), the Upload page
 * clears the entry when the same track is dropped again.
 */
export interface Removed {
  tracks: Record<string, { at: string; track: Track }>
  albums: Record<string, { at: string; album: Album }>
  artists: Record<string, { at: string; artist: Artist }>
}
export interface Catalogue {
  version: number
  updatedAt: string | null
  artists: Record<string, Artist>
  albums: Record<string, Album>
  tracks: Record<string, Track>
  removed?: Removed
}

/* ── Store ─────────────────────────────────────────── */

export type LibraryStatus =
  | 'idle' // nothing cached, not started
  | 'loading' // first download (no cached copy)
  | 'ready'
  | 'missing' // signed in but Drive has no Pelagic/library.json
  | 'error'

export interface LibraryState {
  status: LibraryStatus
  data: Catalogue | null
  /** where `data` came from this session */
  source: 'cache' | 'drive' | null
  /** first-download progress */
  received: number
  total: number
  /** a background check/download is running */
  refreshing: boolean
  /** Drive file version of `data` */
  fileVersion: string | null
  syncedAt: number | null
  error: string | null
  /** the IndexedDB copy has been looked at (avoids flashing the loading screen at boot) */
  cacheChecked: boolean
}

interface CacheRecord {
  fileId: string
  version: string | null
  email: string | null
  syncedAt: number
  data: Catalogue
}

const CACHE_KEY = 'catalogue'

let state: LibraryState = {
  status: 'idle',
  data: null,
  source: null,
  received: 0,
  total: 0,
  refreshing: false,
  fileVersion: null,
  syncedAt: null,
  error: null,
  cacheChecked: false,
}
const listeners = new Set<() => void>()
function set(patch: Partial<LibraryState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export interface SyncResult {
  changed: boolean
  added: { albums: number; tracks: number }
}
const syncListeners = new Set<(r: SyncResult) => void>()
/** Fires after a background refresh replaced the cached catalogue. */
export function onLibraryUpdated(l: (r: SyncResult) => void) {
  syncListeners.add(l)
  return () => {
    syncListeners.delete(l)
  }
}

function validate(x: unknown): Catalogue {
  const c = x as Catalogue
  if (!c || typeof c !== 'object' || !c.tracks || !c.albums || !c.artists) {
    throw new Error('library.json is not a Pelagic catalogue (missing artists / albums / tracks).')
  }
  return c
}

let cacheLoaded: Promise<void> | null = null
let inflight: Promise<void> | null = null
let generation = 0 // bumps on sign-out so stale downloads are dropped

export const libraryStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  /** Read the IndexedDB copy (once). Independent of the session so it works offline / expired. */
  loadCache(): Promise<void> {
    cacheLoaded ??= (async () => {
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY)
      const email = sessionStore.get().account?.email ?? null
      if (rec?.data && (!email || !rec.email || rec.email === email) && state.data === null) {
        set({ status: 'ready', data: rec.data, source: 'cache', fileVersion: rec.version, syncedAt: rec.syncedAt })
      }
      set({ cacheChecked: true })
    })()
    return cacheLoaded
  },

  /** Check Drive and download library.json if it changed (or `force`). Safe to call repeatedly. */
  sync(opts: { force?: boolean } = {}): Promise<void> {
    if (inflight) return inflight
    const gen = generation
    inflight = (async () => {
      await libraryStore.loadCache()
      const first = !state.data
      set(first ? { status: 'loading', received: 0, total: 0, error: null } : { refreshing: true, error: null })
      try {
        const meta: DriveFile | null = await findCatalogue()
        if (gen !== generation) return
        if (!meta) {
          // Keep a cached library usable if the Drive file vanished; otherwise show "No library".
          set(first ? { status: 'missing', refreshing: false } : { refreshing: false })
          return
        }
        if (!first && !opts.force && meta.version && meta.version === state.fileVersion) {
          set({ refreshing: false, syncedAt: Date.now() })
          return
        }
        const bytes = await download(meta.id, {
          total: Number(meta.size) || 0,
          onProgress: first ? (received, total) => gen === generation && set({ received, total }) : undefined,
        })
        if (gen !== generation) return
        const data = validate(JSON.parse(new TextDecoder().decode(bytes)))
        const prev = state.data
        const syncedAt = Date.now()
        set({
          status: 'ready',
          data,
          source: 'drive',
          fileVersion: meta.version ?? null,
          syncedAt,
          refreshing: false,
          received: bytes.byteLength,
          total: bytes.byteLength,
        })
        void idbSet('kv', CACHE_KEY, {
          fileId: meta.id,
          version: meta.version ?? null,
          email: sessionStore.get().account?.email ?? null,
          syncedAt,
          data,
        } satisfies CacheRecord)
        if (prev) {
          syncListeners.forEach((l) =>
            l({
              changed: true,
              added: {
                albums: Object.keys(data.albums).filter((k) => !prev.albums[k]).length,
                tracks: Object.keys(data.tracks).filter((k) => !prev.tracks[k]).length,
              },
            }),
          )
        }
      } catch (e) {
        if (gen !== generation) return
        if (e instanceof AuthError) {
          set(first ? { status: 'idle', refreshing: false } : { refreshing: false })
          return
        }
        const msg = (e as Error).message || 'Could not load the library.'
        set(first ? { status: 'error', error: msg, refreshing: false } : { refreshing: false, error: msg })
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  /**
   * This device just wrote library.json itself (Upload page): take the written copy as current,
   * with its new Drive version, so the next sync doesn't download it again. No "updated" toast.
   */
  adopt(data: Catalogue, fileId: string, version: string | null) {
    const syncedAt = Date.now()
    set({ status: 'ready', data, source: 'drive', fileVersion: version, syncedAt, error: null })
    void idbSet('kv', CACHE_KEY, { fileId, version, email: sessionStore.get().account?.email ?? null, syncedAt, data } satisfies CacheRecord)
  },

  /** Drop the catalogue and the cover cache (sign-out / account switch). */
  async reset() {
    generation++
    inflight = null
    cacheLoaded = Promise.resolve()
    set({ status: 'idle', data: null, source: null, received: 0, total: 0, refreshing: false, fileVersion: null, syncedAt: null, error: null, cacheChecked: true })
    await Promise.all([idbClear('kv'), idbClear('covers')])
  },
}

onAccountReset(() => void libraryStore.reset())

export function useLibrary(): LibraryState {
  return useSyncExternalStore(libraryStore.subscribe, libraryStore.get, libraryStore.get)
}

/* ── Derived views (memoised per catalogue object) ── */

const memo = <T,>(fn: (c: Catalogue) => T) => {
  const cache = new WeakMap<Catalogue, T>()
  return (c: Catalogue): T => {
    let v = cache.get(c)
    if (v === undefined) cache.set(c, (v = fn(c)))
    return v
  }
}

export const albumsByAdded = memo((c) =>
  Object.values(c.albums).sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title)),
)

/** Album tracks in disc / track order. */
export const tracksByAlbum = memo((c) => {
  const map = new Map<string, Track[]>()
  for (const t of Object.values(c.tracks)) {
    let list = map.get(t.albumId)
    if (!list) map.set(t.albumId, (list = []))
    list.push(t)
  }
  for (const list of map.values()) list.sort((a, b) => a.disc - b.disc || (a.track ?? 999) - (b.track ?? 999) || a.title.localeCompare(b.title))
  return map
})

export const libraryStats = memo((c) => {
  let bytes = 0
  let seconds = 0
  for (const t of Object.values(c.tracks)) {
    bytes += t.flac?.size ?? 0
    seconds += t.duration ?? 0
  }
  return {
    artists: Object.keys(c.artists).length,
    albums: Object.keys(c.albums).length,
    tracks: Object.keys(c.tracks).length,
    bytes,
    seconds,
  }
})
