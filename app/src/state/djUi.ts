/**
 * DJ UI state (step 22): the full-screen player's DJ start view and the DJ panel
 * (desktop popover anchored to the DJ button that opened it; phone bottom sheet).
 */
import { useMemo, useSyncExternalStore } from 'react'
import { djStore, djViewOf, useDj, type DjView } from './dj'
import { nowPlayingStore } from './nowPlaying'
import { onAccountReset } from './session'
import { usePlayer } from './player'

export interface DjUi {
  /** the full-screen player shows the DJ start view */
  start: boolean
  /** DJ panel: popover position (desktop) or the phone sheet */
  panel: { kind: 'popover'; left: number; bottom: number } | { kind: 'sheet' } | null
}

let state: DjUi = { start: false, panel: null }
const listeners = new Set<() => void>()
function set(patch: Partial<DjUi>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const djUi = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  /** DJ off → the DJ button opens the full-screen player in its start view. */
  openStart() {
    nowPlayingStore.closeQueue()
    nowPlayingStore.open('np')
    set({ start: true, panel: null })
  },
  closeStart() {
    if (state.start) set({ start: false })
  },
  openPanel(anchor: HTMLElement | null, sheet: boolean) {
    // no button given (account menu): the visible DJ button, full-screen player first
    anchor ??= document.querySelector<HTMLElement>('.np .djb-np, .np .djb-ly, .djb-bar')
    if (sheet || !anchor) return set({ panel: { kind: 'sheet' } })
    const r = anchor.getBoundingClientRect()
    const W = 420
    const left = Math.max(16, Math.min(r.left, window.innerWidth - W - 16))
    set({ panel: { kind: 'popover', left, bottom: window.innerHeight - r.top + 12 } })
  },
  closePanel() {
    if (state.panel) set({ panel: null })
  },
}

// the player closing takes the start view with it; the DJ starting leaves it
nowPlayingStore.subscribe(() => {
  if (!nowPlayingStore.get().open && state.start) set({ start: false })
})
djStore.subscribe(() => {
  // the queue panel isn't available while the DJ plays
  if (djStore.get().run && nowPlayingStore.get().queue) nowPlayingStore.closeQueue()
  if (djStore.get().run && state.start) set({ start: false })
  if (!djStore.get().run && state.panel) set({ panel: null })
})
onAccountReset(() => set({ start: false, panel: null }))

export function useDjUi(): DjUi {
  return useSyncExternalStore(djUi.subscribe, djUi.get, djUi.get)
}

/** Where the DJ run is (on / intro / session / song n of m), from the player queue. */
export function useDjView(): DjView {
  const { run } = useDj()
  const p = usePlayer()
  const { queue, index, context } = p
  return useMemo(() => djViewOf(run, { queue, index, context }), [run, queue, index, context])
}
