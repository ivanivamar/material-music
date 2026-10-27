/**
 * Hash routes: #/home, #/library[/artists|albums|playlists|songs], #/album/<id>, #/artist/<id>,
 * #/playlist/<id>, #/mix/<id>, #/stats[/<year>|/<year>-<month>], #/health (Library health, opened from Settings),
 * #/concerts[?loc|?add] (Concerts near you; ?loc opens the location picker, ?add the Add a show form) …
 * plus the dev reference pages (#/dev/components, #/dev/foundations).
 */
import { useSyncExternalStore } from 'react'
import type { IconName } from '../design/icons'

export type RouteKey = 'home' | 'library' | 'new' | 'concerts' | 'upload' | 'downloads' | 'settings' | 'health' | 'album' | 'artist' | 'playlist' | 'stats' | 'mix'
export type DevRoute = 'dev/components' | 'dev/foundations'
export type LibraryTab = 'all' | 'albums' | 'artists' | 'playlists' | 'songs'
export const LIBRARY_TABS: LibraryTab[] = ['all', 'albums', 'artists', 'playlists', 'songs']

export interface NavItem {
  key: RouteKey
  label: string
  icon: IconName
}

/** Sidebar order (handoff 04 Desktop; Search folded into Library by the Library + Search merge). */
export const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'new', label: 'New releases', icon: 'newr' },
  { key: 'concerts', label: 'Concerts', icon: 'concerts' },
  { key: 'upload', label: 'Upload', icon: 'upload' },
  { key: 'downloads', label: 'Downloads', icon: 'download' },
]
/** Pinned to the bottom of the sidebar (handoff Settings). */
export const SETTINGS_NAV: NavItem = { key: 'settings', label: 'Settings', icon: 'gear' }

type SimpleKey = Exclude<RouteKey, 'library' | 'album' | 'artist' | 'playlist' | 'stats' | 'mix'>
const KEYS = new Set<string>(['home', 'new', 'concerts', 'upload', 'downloads', 'settings', 'health'])
const DEV = new Set<string>(['dev/components', 'dev/foundations'])

export type Route =
  | { kind: 'app'; key: SimpleKey; path: string }
  | { kind: 'app'; key: 'library'; tab: LibraryTab | null; path: string }
  | { kind: 'app'; key: 'album' | 'artist' | 'playlist' | 'mix'; id: string; path: string }
  /** listening stats (step 21); `period` = "2026" / "2026-10", null = the latest */
  | { kind: 'app'; key: 'stats'; period: string | null; path: string }
  | { kind: 'dev'; key: DevRoute; path: string }

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  if (DEV.has(path)) return { kind: 'dev', key: path as DevRoute, path }
  const [head, ...rest] = path.split('/')
  // the old Search page (bookmarks, the PWA shortcut): Library, which carries the field now
  if (head === 'search') return { kind: 'app', key: 'library', tab: null, path: 'library' }
  if (head === 'library') {
    const tab = rest[0] as LibraryTab | undefined
    return { kind: 'app', key: 'library', tab: tab && LIBRARY_TABS.includes(tab) ? tab : null, path }
  }
  if ((head === 'album' || head === 'artist' || head === 'playlist' || head === 'mix') && rest[0]) {
    let id = rest.join('/')
    try {
      id = decodeURIComponent(id)
    } catch {
      /* keep raw */
    }
    return { kind: 'app', key: head, id, path }
  }
  if (head === 'stats') return { kind: 'app', key: 'stats', period: rest[0] || null, path }
  if (KEYS.has(path)) return { kind: 'app', key: path as SimpleKey, path }
  return { kind: 'app', key: 'home', path: 'home' }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
let cached: { hash: string; route: Route } | null = null
/** Parsed once per hash so the snapshot is stable between renders. */
function getRoute(): Route {
  const hash = window.location.hash
  if (cached?.hash !== hash) cached = { hash, route: parse(hash) }
  return cached.route
}
const serverRoute = parse('')

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute, () => serverRoute)
}

export const href = (key: RouteKey) => `#/${key}`
export const libraryHref = (tab: LibraryTab) => `#/library/${tab}`
export const albumHref = (id: string) => `#/album/${encodeURIComponent(id)}`
export const artistHref = (id: string) => `#/artist/${encodeURIComponent(id)}`
export const playlistHref = (id: string) => `#/playlist/${encodeURIComponent(id)}`
/** a mix of today (step 26): daily-<genre>, deepcuts, rediscover */
export const mixHref = (id: string) => `#/mix/${encodeURIComponent(id)}`
/** New releases with one release's detail open (reminder toast / notification) */
export const releaseHref = (id: string) => `#/new?rel=${encodeURIComponent(id)}`
/** `period`: "2026" / "2026-10" (state/stats.ts periodKey) */
export const statsHref = (period?: string) => (period ? `#/stats/${period}` : '#/stats')

export function navigate(key: RouteKey) {
  window.location.hash = `/${key}`
}
/** Go to an `#/…` href. */
export function go(to: string) {
  window.location.hash = to.replace(/^#/, '')
}

/** Sidebar item lit for a route: album / artist / playlist pages live under Library. */
export const navKeyOf = (r: Route): RouteKey => (r.kind === 'app' ? (r.key === 'album' || r.key === 'artist' || r.key === 'playlist' ? 'library' : r.key === 'mix' ? 'home' : r.key === 'health' ? 'settings' : r.key) : 'home')

/** In-app history depth (hash changes since load), so Back can fall back to a page when there's none. */
let depth = 0
/** The next hashchange replaced the current entry (no new history entry): don't count it. */
let replacing = false
if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    if (replacing) replacing = false
    else depth++
  })
/** Is there an in-app page to go back to? */
export const canGoBack = () => depth > 0
export function back(fallback: string) {
  if (depth > 0) {
    depth -= 2 // the popstate itself fires one more hashchange
    window.history.back()
  } else go(fallback)
}
/** Go to an `#/…` href in place of the current history entry. */
export function replace(to: string) {
  const hash = '#' + to.replace(/^#/, '')
  if (window.location.hash === hash) return
  replacing = true
  window.location.replace(hash)
}
