/**
 * Hold-to-reorder hand-off: a long press on a carousel card enters reorder mode with that song
 * already in hand. The carousel parks the press here and opens reorder mode; the reorder view picks
 * it up when it mounts and keeps following the same pointer (window listeners), so the finger or
 * mouse never has to let go.
 */
import { nowPlayingStore } from '../../state/nowPlaying'

export interface PendingGrab {
  /** queue row that was held; null = enter reorder mode without lifting anything (the playing song) */
  index: number | null
  pointerId: number
  x: number
  y: number
}

let pending: PendingGrab | null = null

/** Long press fired on a card: hand the press to reorder mode. */
export function grabIntoReorder(g: PendingGrab) {
  pending = g
  nowPlayingStore.openReorder()
}

/** Reorder view mounting: take the press that opened it (once). */
export function takeGrab(): PendingGrab | null {
  const g = pending
  pending = null
  return g
}

/** How long a press has to be held before it lifts the card (ms), and how far it may wander (px). */
export const LONG_PRESS_MS = 450
export const LONG_PRESS_SLOP = 8
