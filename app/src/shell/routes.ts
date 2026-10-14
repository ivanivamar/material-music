/**
 * Hash routes: #/home, #/library[/albums|artists|songs], #/album/<id>, #/artist/<id> …
 * plus the dev reference pages (#/dev/components, #/dev/foundations).
 */
import { useSyncExternalStore } from 'react'
import type { IconName } from '../design/icons'

export type RouteKey = 'home' | 'library' | 'search' | 'new' | 'upload' | 'downloads' | 'album' | 'artist'
export type DevRoute = 'dev/components' | 'dev/foundations'
export type LibraryTab = 'albums' | 'artists' | 'songs'
export const LIBRARY_TABS: LibraryTab[] = ['artists', 'albums', 'songs']

export interface NavItem {
  key: RouteKey
  label: string
  icon: IconName
}

/** Sidebar order (handoff 04 Desktop). */
export const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'new', label: 'New releases', icon: 'newr' },
  { key: 'upload', label: 'Upload', icon: 'upload' },
  { key: 'downloads', label: 'Downloads', icon: 'download' },
]

type SimpleKey = Exclude<RouteKey, 'library' | 'album' | 'artist'>
const KEYS = new Set<string>(['home', 'search', 'new', 'upload', 'downloads'])
const DEV = new Set<string>(['dev/components', 'dev/foundations'])

export type Route =
  | { kind: 'app'; key: SimpleKey; path: string }
  | { kind: 'app'; key: 'library'; tab: LibraryTab | null; path: string }
  | { kind: 'app'; key: 'album' | 'artist'; id: string; path: string }
  | { kind: 'dev'; key: DevRoute; path: string }

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  if (DEV.has(path)) return { kind: 'dev', key: path as DevRoute, path }
  const [head, ...rest] = path.split('/')
  if (head === 'library') {
    const tab = rest[0] as LibraryTab | undefined
    return { kind: 'app', key: 'library', tab: tab && LIBRARY_TABS.includes(tab) ? tab : null, path }
  }
  if ((head === 'album' || head === 'artist') && rest[0]) {
    let id = rest.join('/')
    try {
      id = decodeURIComponent(id)
    } catch {
      /* keep raw */
    }
    return { kind: 'app', key: head, id, path }
  }
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

export function navigate(key: RouteKey) {
  window.location.hash = `/${key}`
}
/** Go to an `#/…` href. */
export function go(to: string) {
  window.location.hash = to.replace(/^#/, '')
}

/** Sidebar item lit for a route: album / artist pages live under Library. */
export const navKeyOf = (r: Route): RouteKey => (r.kind === 'app' ? (r.key === 'album' || r.key === 'artist' ? 'library' : r.key) : 'home')

/** In-app history depth (hash changes since load), so Back can fall back to a page when there's none. */
let depth = 0
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => depth++)
export function back(fallback: string) {
  if (depth > 0) {
    depth -= 2 // the popstate itself fires one more hashchange
    window.history.back()
  } else go(fallback)
}
