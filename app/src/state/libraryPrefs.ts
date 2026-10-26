/** Library view preferences (last tab, sort orders, "Offline only"). Per device, localStorage. */
import { useSyncExternalStore } from 'react'
import type { LibraryTab } from '../shell/routes'
import type { AlbumSort, SongSort } from './views'

export type ArtistSort = 'name' | 'added' | 'albums'
export type MixedSort = 'added' | 'name'
export type LibraryView = 'timeline' | 'grid'

export interface LibraryPrefs {
  tab: LibraryTab
  albumSort: AlbumSort
  artistSort: ArtistSort
  songSort: SongSort
  songDesc: boolean
  /** All (albums + artists + playlists) and Playlists chips */
  allSort: MixedSort
  playlistSort: MixedSort
  /** Timeline (grouped, with a rail) or a plain grid / list, per chip */
  views: Partial<Record<LibraryTab, LibraryView>>
  /** Android app: show only what's stored on the phone (Albums / Artists / Songs) */
  offlineOnly: boolean
}

const KEY = 'pelagic.library.v1'
const DEFAULTS: LibraryPrefs = { tab: 'all', albumSort: 'added', artistSort: 'name', songSort: 'added', songDesc: false, allSort: 'added', playlistSort: 'added', views: {}, offlineOnly: false }

let prefs: LibraryPrefs = (() => {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LibraryPrefs>) }
  } catch {
    return { ...DEFAULTS }
  }
})()
const listeners = new Set<() => void>()

export const libraryPrefs = {
  get: () => prefs,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  set(patch: Partial<LibraryPrefs>) {
    prefs = { ...prefs, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  },
}

export function useLibraryPrefs(): LibraryPrefs {
  return useSyncExternalStore(libraryPrefs.subscribe, libraryPrefs.get, libraryPrefs.get)
}
