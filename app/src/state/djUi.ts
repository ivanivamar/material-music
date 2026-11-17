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
  /** the full-screen player shows the DJ screen (start / intro / on air) */
  start: boolean
  /** DJ panel: popover position (desktop), the phone sheet, or the DJ screen's side panel */
  panel: { kind: 'popover'; left: number; bottom: number } | { kind: 'sheet' } | { kind: 'side'; phone: boolean } | null
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
  /** The DJ button opens the full-screen player on the DJ screen (start view when the DJ is off). */
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
  /** the DJ screen's settings button: the panel slides in from the right (phone: a card over the screen) */
  openSide(phone: boolean) {
    set({ panel: { kind: 'side', phone } })
  },
  closePanel() {
    if (state.panel) set({ panel: null })
  },
}

// the player closing takes the DJ screen (and its side panel) with it. While the DJ plays, the player's
// Now playing view IS the DJ screen: opening the player, or leaving the lyrics, lands there.
let was = { open: nowPlayingStore.get().open, view: nowPlayingStore.get().view }
nowPlayingStore.subscribe(() => {
  const np = nowPlayingStore.get()
  const changed = np.open !== was.open || np.view !== was.view
  was = { open: np.open, view: np.view }
  if (!np.open && state.start) set({ start: false, panel: state.panel?.kind === 'side' ? null : state.panel })
  else if (changed && np.open && np.view === 'np' && !state.start && djStore.get().run) set({ start: true })
})
djStore.subscribe(() => {
  // the queue panel isn't available while the DJ plays
  if (djStore.get().run && nowPlayingStore.get().queue) nowPlayingStore.closeQueue()
  // the DJ screen stays open when the DJ starts (start → intro → on air); the popover / sheet go when it stops
  if (!djStore.get().run && state.panel && state.panel.kind !== 'side') set({ panel: null })
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
