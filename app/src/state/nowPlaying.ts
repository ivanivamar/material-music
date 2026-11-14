/**
 * Now Playing UI state (step 6): is the full-screen player open, which view it shows
 * (now playing ⇄ lyrics), and whether the queue panel is open. Handoff 08: Queue and Lyrics
 * toggle independently, so both panels can be open together.
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
  queue: boolean
}

let state: NowPlayingUi = { open: false, view: 'np', queue: false }
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
  if (state.open && !hasEntry()) set({ open: false, queue: false })
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
    else set({ open: false, queue: false })
  },
  /** Close the player and go to an in-app href (album / artist links inside it). */
  closeAndGo(href: string) {
    if (state.open && hasEntry()) {
      pendingHref = href
      window.history.back()
    } else {
      set({ open: false, queue: false })
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
  },
  toggleQueue() {
    set({ queue: !state.queue })
  },
  closeQueue() {
    if (state.queue) set({ queue: false })
  },
  /** Nothing to show (queue cleared, signed out): close without touching history beyond our entry. */
  reset() {
    if (state.open && hasEntry()) window.history.back()
    set({ open: false, queue: false })
  },
}

onAccountReset(() => {
  if (hasEntry()) window.history.replaceState(null, '')
  pendingHref = null
  set({ open: false, view: 'np', queue: false })
})

export function useNowPlayingUi(): NowPlayingUi {
  return useSyncExternalStore(nowPlayingStore.subscribe, nowPlayingStore.get, nowPlayingStore.get)
}
