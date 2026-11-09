/**
 * Now Playing UI state: is the full-screen player open, does it show the lyrics beside / under the
 * queue carousel, and is the carousel in reorder mode (Nov 2026 carousel player: the queue *is* the
 * full-screen player, so there is no separate queue panel any more). Lyrics and reorder exclude
 * each other.
 *
 * Opening the full-screen player pushes a history entry (same hash, `history.state.pelagicNp`)
 * so the browser / mouse Back button closes it instead of leaving the page.
 */
import { useSyncExternalStore } from 'react'
import { go } from '../shell/routes'
import { onAccountReset } from './session'

export type NpView = 'np' | 'lyrics'

export interface NowPlayingUi {
  open: boolean
  view: NpView
  /** the carousel is in reorder mode (drag songs by their handle, drop on Remove) */
  reorder: boolean
}

let state: NowPlayingUi = { open: false, view: 'np', reorder: false }
const listeners = new Set<() => void>()
function set(patch: Partial<NowPlayingUi>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const MARK = 'pelagicNp'
const hasEntry = () => !!(window.history.state as Record<string, unknown> | null)?.[MARK]
/** href to visit once our history entry has been popped (link clicked inside the player). */
let pendingHref: string | null = null

// A reload keeps history.state: drop a stale marker so Back isn't swallowed.
if (hasEntry()) window.history.replaceState(null, '')

window.addEventListener('popstate', () => {
  if (state.open && !hasEntry()) set({ open: false, reorder: false })
  if (pendingHref) {
    const to = pendingHref
    pendingHref = null
    go(to)
  }
})

export const nowPlayingStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  open(view: NpView = state.view) {
    if (!state.open && !hasEntry()) window.history.pushState({ ...(window.history.state ?? {}), [MARK]: true }, '')
    set({ open: true, view })
  },
  close() {
    if (!state.open) return
    if (hasEntry())
      window.history.back() // popstate closes
    else set({ open: false, reorder: false })
  },
  /** Close the player and go to an in-app href (album / artist links inside it). */
  closeAndGo(href: string) {
    if (state.open && hasEntry()) {
      pendingHref = href
      window.history.back()
    } else {
      set({ open: false, reorder: false })
      go(href)
    }
  },
  setView(view: NpView) {
    set({ view })
  },
  /** Lyrics button: in the full-screen player it flips the view; elsewhere it opens the player on lyrics. */
  toggleLyrics() {
    if (!state.open) nowPlayingStore.open('lyrics')
    else set({ view: state.view === 'lyrics' ? 'np' : 'lyrics' })
    if (state.reorder) set({ reorder: false })
  },
  /** Reorder mode (opens the full-screen player first when it's closed). */
  openReorder() {
    if (!state.open) nowPlayingStore.open('np')
    set({ reorder: true, view: 'np' })
  },
  toggleReorder() {
    if (state.open && state.reorder) set({ reorder: false })
    else nowPlayingStore.openReorder()
  },
  closeReorder() {
    if (state.reorder) set({ reorder: false })
  },
  /** Nothing to show (queue cleared, signed out): close without touching history beyond our entry. */
  reset() {
    if (state.open && hasEntry()) window.history.back()
    set({ open: false, reorder: false })
  },
}

onAccountReset(() => {
  if (hasEntry()) window.history.replaceState(null, '')
  pendingHref = null
  set({ open: false, view: 'np', reorder: false })
})

export function useNowPlayingUi(): NowPlayingUi {
  return useSyncExternalStore(nowPlayingStore.subscribe, nowPlayingStore.get, nowPlayingStore.get)
}
