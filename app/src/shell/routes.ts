/** Hash routes: #/home, #/library … plus the dev reference pages (#/dev/components, #/dev/foundations). */
import { useSyncExternalStore } from 'react'
import type { IconName } from '../design/icons'

export type RouteKey = 'home' | 'library' | 'search' | 'new' | 'upload' | 'downloads' | 'liked'
export type DevRoute = 'dev/components' | 'dev/foundations'

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

const KEYS = new Set<string>([...NAV.map((n) => n.key), 'liked'])
const DEV = new Set<string>(['dev/components', 'dev/foundations'])

export type Route = { kind: 'app'; key: RouteKey } | { kind: 'dev'; key: DevRoute }

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  if (DEV.has(path)) return { kind: 'dev', key: path as DevRoute }
  if (KEYS.has(path)) return { kind: 'app', key: path as RouteKey }
  return { kind: 'app', key: 'home' }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  return parse(hash)
}

export const href = (key: RouteKey) => `#/${key}`
export function navigate(key: RouteKey) {
  window.location.hash = `/${key}`
}
