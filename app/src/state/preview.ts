/**
 * 30 s song previews (New Releases → Out now), played on their own <audio> element, outside the
 * queue and the player. One preview at a time.
 *
 * - Starting a preview pauses the player if it was playing here; it resumes when the preview ends
 *   or is stopped (not when another preview takes over).
 * - Pressing play on the player while a preview runs stops the preview (and nothing resumes).
 * - When the player is remote-controlling another device, that device is left alone.
 */
import { useSyncExternalStore } from 'react'
import { playerStore } from './player'

export interface PreviewState {
  /** what is previewing (`<release id>#<deezer track index>`), null = nothing */
  key: string | null
  loading: boolean
  /** 0..1 */
  progress: number
}

let state: PreviewState = { key: null, loading: false, progress: 0 }
const listeners = new Set<() => void>()
const set = (patch: Partial<PreviewState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let audio: HTMLAudioElement | null = null
let resumeMain = false

function el(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = 'auto'
  a.addEventListener('playing', () => state.key && set({ loading: false }))
  a.addEventListener('waiting', () => state.key && set({ loading: true }))
  a.addEventListener('timeupdate', () => {
    if (state.key && a.duration) set({ progress: Math.min(1, a.currentTime / a.duration) })
  })
  a.addEventListener('ended', () => stopPreview())
  a.addEventListener('error', () => {
    if (state.key && a.error) stopPreview()
  })
  audio = a
  return a
}

// the player started playing on its own (play button, lock screen, another device): drop the preview
let wasPlaying = playerStore.get().playing
playerStore.subscribe(() => {
  const p = playerStore.get().playing
  if (p && !wasPlaying && state.key) stopPreview(false)
  wasPlaying = p
})

export function playPreview(key: string, url: string) {
  const a = el()
  const ps = playerStore.get()
  if (!state.key) resumeMain = false
  if (ps.playing && !ps.remote) {
    resumeMain = true
    playerStore.toggle()
  }
  a.src = url
  a.volume = Math.max(0, Math.min(1, ps.volume || 0.8))
  set({ key, loading: true, progress: 0 })
  a.play().catch(() => {
    if (state.key === key) stopPreview()
  })
}

/** Stop the preview; `resume` = let the player carry on if the preview paused it. */
export function stopPreview(resume = true) {
  if (!state.key) return
  audio?.pause()
  set({ key: null, loading: false, progress: 0 })
  const again = resume && resumeMain
  resumeMain = false
  if (again && !playerStore.get().playing) playerStore.toggle()
}

export function togglePreview(key: string, url: string) {
  if (state.key === key) stopPreview()
  else playPreview(key, url)
}

export function usePreview(): PreviewState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
