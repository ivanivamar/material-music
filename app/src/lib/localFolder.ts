/**
 * Local FLAC on PC via the File System Access API (Chrome / Edge).
 *
 * The user links one folder once; the handle is kept in IndexedDB. Any of these work:
 *   - the music folder the importer read (C:\Users\ivani\Music)  → track.source.path
 *   - the Pelagic folder in Google Drive for desktop (G:\My Drive\Pelagic) → library/Artist/Album/NN - Title.flac
 *   - that folder's library/ subfolder                           → Artist/Album/NN - Title.flac
 * The layout is detected when linking by probing a few tracks.
 *
 * After a reload Chrome drops the read permission back to "prompt"; it can only be re-granted from
 * a click, so the player asks on the first Play press (one small browser prompt per session).
 */
import { useSyncExternalStore } from 'react'
import { idbGet, idbSet } from './idb'
import { onAccountReset } from '../state/session'
import type { Album, Catalogue, Track } from '../state/library'

export type FolderLayout = 'source' | 'drive' | 'drive-library'
export type LocalStatus =
  | 'unsupported' // no File System Access (Firefox, Safari, Android WebView)
  | 'loading' // reading the saved handle
  | 'none' // no folder linked
  | 'prompt' // linked; needs a click to re-grant read access
  | 'granted'
  | 'denied'

export interface LocalFolderState {
  status: LocalStatus
  name: string | null
  layout: FolderLayout | null
}

interface Saved {
  handle: FileSystemDirectoryHandle
  layout: FolderLayout
}

const KEY = 'localFolder'
const supported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

let saved: Saved | null = null
let state: LocalFolderState = { status: supported ? 'loading' : 'unsupported', name: null, layout: null }
const listeners = new Set<() => void>()
function set(patch: Partial<LocalFolderState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const ready: Promise<void> = supported
  ? (async () => {
      const rec = await idbGet<Saved>('kv', KEY)
      if (!rec?.handle) return set({ status: 'none' })
      saved = rec
      let perm: PermissionState = 'prompt'
      try {
        perm = await rec.handle.queryPermission({ mode: 'read' })
      } catch {
        /* treat as prompt */
      }
      set({ status: perm, name: rec.handle.name, layout: rec.layout })
    })()
  : Promise.resolve()

/* ── paths ─────────────────────────────────────────── */

/** Same rule as tools/import/src/library.js safeName() — Drive folder names. */
// eslint-disable-next-line no-control-regex -- same rule as the importer
const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 150) || '_'

function pathFor(layout: FolderLayout, track: Track, album: Album | undefined): string[] | null {
  const src = track.source?.path?.replace(/\\/g, '/')
  if (layout === 'source') return src ? src.split('/').filter(Boolean) : null
  if (!src || !album) return null
  const file = src.split('/').pop()!.replace(/\.[^.]+$/, '') + '.flac'
  const rel = [safeName(album.artist), safeName(album.title), file]
  return layout === 'drive' ? ['library', ...rel] : rel
}

async function open(root: FileSystemDirectoryHandle, parts: string[]): Promise<File | null> {
  try {
    let dir = root
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    const fh = await dir.getFileHandle(parts[parts.length - 1])
    return await fh.getFile()
  } catch {
    return null // NotFoundError / TypeError (bad name) / NotReadableError
  }
}

const LAYOUTS: FolderLayout[] = ['source', 'drive', 'drive-library']

function sample<T>(xs: T[], n: number): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.slice(0, n)
}

/* ── public API ────────────────────────────────────── */

export const localFolder = {
  supported,
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  ready: () => ready,

  /**
   * Pick a folder (call from a click), detect its layout from a handful of tracks, save it.
   * Throws with a readable message when no tracks are found there; resolves null if the picker was cancelled.
   */
  async link(cat: Catalogue): Promise<{ name: string; found: number; probed: number } | null> {
    if (!supported) throw new Error('This browser can’t open local folders. Use Chrome or Edge.')
    let handle: FileSystemDirectoryHandle
    try {
      handle = await window.showDirectoryPicker!({ id: 'pelagic-music', mode: 'read', startIn: 'music' })
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null
      throw e
    }
    const probe = sample(Object.values(cat.tracks), 8)
    let best: { layout: FolderLayout; found: number } | null = null
    for (const layout of LAYOUTS) {
      let found = 0
      for (const t of probe) {
        const parts = pathFor(layout, t, cat.albums[t.albumId])
        if (parts && (await open(handle, parts))) found++
      }
      if (found && (!best || found > best.found)) best = { layout, found }
      if (found === probe.length) break
    }
    if (!best) {
      throw new Error(`No library tracks found in “${handle.name}”. Pick your music folder, or the Pelagic folder in Google Drive for desktop.`)
    }
    saved = { handle, layout: best.layout }
    await idbSet('kv', KEY, saved)
    set({ status: 'granted', name: handle.name, layout: best.layout })
    return { name: handle.name, found: best.found, probed: probe.length }
  },

  async unlink() {
    saved = null
    await idbSet('kv', KEY, null)
    set({ status: supported ? 'none' : 'unsupported', name: null, layout: null })
  },

  /**
   * Make sure we may read the folder. Prompts only when `gesture` (inside a click); otherwise
   * reports false so the caller falls back to Drive.
   */
  async ensurePermission(gesture: boolean): Promise<boolean> {
    if (!saved) return false
    if (state.status === 'granted') return true
    if (!gesture || state.status === 'denied') return false
    try {
      // requestPermission must run while the click's user activation is still live: no awaits before it
      const perm = await saved.handle.requestPermission({ mode: 'read' })
      set({ status: perm })
      return perm === 'granted'
    } catch {
      return false
    }
  },

  /** The track's FLAC from the linked folder, or null (not linked / no permission / not there). */
  async file(track: Track, album: Album | undefined): Promise<File | null> {
    if (!saved || state.status !== 'granted') return null
    const parts = pathFor(saved.layout, track, album)
    return parts ? open(saved.handle, parts) : null
  },
}

// Signing out clears IndexedDB `kv` (library.reset); forget the handle here too.
onAccountReset(() => {
  saved = null
  if (supported) set({ status: 'none', name: null, layout: null })
})

export function useLocalFolder(): LocalFolderState {
  return useSyncExternalStore(localFolder.subscribe, localFolder.get, localFolder.get)
}
