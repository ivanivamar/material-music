/**
 * Player state: queue, position, transport flags, volume.
 *
 * This is the shape the player bar binds to. The audio engine (step 3d: HTML audio on PC with
 * local FLAC via File System Access or Drive streaming, Media Session; native ExoPlayer on
 * Android) attaches with `playerStore.attach(engine)` and drives `position` / `playing`.
 * Until an engine is attached, transport calls only move the queue.
 *
 * PC engine: `player/htmlEngine.ts` (attached in App.tsx).
 */
import { useSyncExternalStore } from 'react'
import { onAccountReset } from './session'

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayContext {
  kind: 'album' | 'artist' | 'playlist' | 'library' | 'search' | 'queue'
  id?: string
  /** "Playing from" label, e.g. the album title */
  label: string
}

export interface PlayerState {
  queue: string[]
  /** index into `queue`; -1 = nothing loaded */
  index: number
  context: PlayContext | null
  playing: boolean
  buffering: boolean
  /** seconds */
  position: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  /** where the current track's audio comes from (not persisted) */
  source: PlaybackSource | null
}

export type PlaybackSource = 'local' | 'drive'

export interface PlayerEngine {
  load(trackId: string, opts: { autoplay: boolean; position?: number }): void
  play(): void
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number, muted: boolean): void
  /** Drop the current track (queue cleared / sign-out). */
  unload(): void
}

/** Things the engine needs the UI to say (toasts). */
export type PlayerNotice =
  | { kind: 'auth'; trackId: string } // Drive stream needs a fresh Google sign-in
  | { kind: 'error'; trackId: string; message: string; skipped: boolean }
  | { kind: 'missing'; trackId: string } // track no longer in the catalogue

const KEY = 'pelagic.player.v1'
type Persisted = Pick<PlayerState, 'queue' | 'index' | 'context' | 'position' | 'volume' | 'muted' | 'shuffle' | 'repeat'>

const DEFAULTS: PlayerState = {
  queue: [],
  index: -1,
  context: null,
  playing: false,
  buffering: false,
  position: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  source: null,
}

function load(): PlayerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>), playing: false, buffering: false, source: null }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

let state = load()
let engine: PlayerEngine | null = null
const listeners = new Set<() => void>()
const noticeListeners = new Set<(n: PlayerNotice) => void>()
let persistTimer = 0

function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = 0
  const { queue, index, context, position, volume, muted, shuffle, repeat } = state
  try {
    localStorage.setItem(KEY, JSON.stringify({ queue, index, context, position, volume, muted, shuffle, repeat } satisfies Persisted))
  } catch {
    /* ignore */
  }
}

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  // throttle, not debounce: the engine reports position several times a second while playing
  if (!persistTimer) persistTimer = window.setTimeout(persist, 1000)
}
window.addEventListener('pagehide', persist)

const current = () => (state.index >= 0 ? (state.queue[state.index] ?? null) : null)

function go(index: number, autoplay: boolean) {
  set({ index, position: 0 })
  const id = current()
  if (id && engine) engine.load(id, { autoplay })
}

export const playerStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  currentId: current,
  hasEngine: () => engine !== null,

  /** Step 3d: the engine reports back through `report`. */
  attach(e: PlayerEngine) {
    engine = e
    e.setVolume(state.volume, state.muted)
    const id = current()
    if (id) e.load(id, { autoplay: false, position: state.position })
    return () => {
      if (engine === e) engine = null
    }
  },
  report(patch: Partial<Pick<PlayerState, 'playing' | 'buffering' | 'position' | 'source'>>) {
    set(patch)
  },
  notify(n: PlayerNotice) {
    noticeListeners.forEach((l) => l(n))
  },
  /** Engine calls this when a track finishes. */
  ended() {
    if (state.repeat === 'one') return go(state.index, true)
    if (state.index < state.queue.length - 1) return go(state.index + 1, true)
    if (state.repeat === 'all' && state.queue.length) return go(0, true)
    set({ playing: false, position: 0 })
  },

  playQueue(ids: string[], start = 0, context: PlayContext | null = null) {
    if (!ids.length) return
    let queue = ids
    let index = start
    if (state.shuffle) {
      const first = ids[start]
      const rest = ids.filter((_, i) => i !== start)
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[rest[i], rest[j]] = [rest[j], rest[i]]
      }
      queue = [first, ...rest]
      index = 0
    }
    lastCleared = null
    set({ queue, context })
    go(index, true)
  },
  toggle() {
    if (!engine || state.index < 0) return
    if (state.playing) engine.pause()
    else engine.play()
  },
  next() {
    if (state.index < 0) return
    if (state.index < state.queue.length - 1) go(state.index + 1, state.playing)
    else if (state.repeat === 'all') go(0, state.playing)
  },
  /** Restarts the track when more than 3 s in, like every other player. */
  prev() {
    if (state.index < 0) return
    if (state.position > 3 || state.index === 0) {
      set({ position: 0 })
      engine?.seek(0)
    } else go(state.index - 1, state.playing)
  },
  seek(seconds: number) {
    set({ position: seconds })
    engine?.seek(seconds)
  },
  setVolume(volume: number) {
    set({ volume, muted: volume === 0 ? state.muted : false })
    engine?.setVolume(state.volume, state.muted)
  },
  toggleMute() {
    set({ muted: !state.muted })
    engine?.setVolume(state.volume, state.muted)
  },
  toggleShuffle() {
    set({ shuffle: !state.shuffle })
  },
  cycleRepeat() {
    set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })
  },
  clear() {
    engine?.unload()
    lastCleared = null
    set({ ...DEFAULTS, volume: state.volume, muted: state.muted })
  },

  /* ── Queue editing (step 6: queue panel) ──────────────
   * The queue is one list; "Next up" is everything after `index`. Edits keep the current track
   * (and its playback) untouched and only shift `index` when rows move around it. */

  /** Play queue row `i` (click in the queue panel). */
  jump(i: number) {
    if (i < 0 || i >= state.queue.length) return
    if (i === state.index) return playerStore.toggle()
    go(i, true)
  },
  /** Move row `from` so it ends up at index `to` (drag to reorder). */
  move(from: number, to: number) {
    const n = state.queue.length
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return
    const queue = [...state.queue]
    const [id] = queue.splice(from, 1)
    queue.splice(to, 0, id)
    let index = state.index
    if (from === index) index = to
    else if (from < index && to >= index) index--
    else if (from > index && to <= index) index++
    set({ queue, index })
  },
  /** Remove an upcoming / earlier row (the current track is not removable here). */
  remove(i: number) {
    if (i < 0 || i >= state.queue.length || i === state.index) return
    const queue = state.queue.filter((_, k) => k !== i)
    set({ queue, index: i < state.index ? state.index - 1 : state.index })
  },
  /** Drop everything after the current track. Returns what was removed (for "Restore queue"). */
  clearUpcoming(): string[] {
    if (state.index < 0) return []
    const removed = state.queue.slice(state.index + 1)
    if (!removed.length) return removed
    lastCleared = removed
    set({ queue: state.queue.slice(0, state.index + 1) })
    return removed
  },
  /** What the last "Clear" removed, while it can still be put back. */
  clearedUpcoming: () => lastCleared,
  restoreUpcoming() {
    if (!lastCleared?.length || state.index < 0) return
    const ids = lastCleared
    lastCleared = null
    set({ queue: [...state.queue.slice(0, state.index + 1), ...ids, ...state.queue.slice(state.index + 1)] })
  },
  /** Insert tracks right after the current one (or start playing them if nothing is loaded). */
  playNext(ids: string[]) {
    if (!ids.length) return
    if (state.index < 0) return playerStore.playQueue(ids, 0, { kind: 'queue', label: 'Queue' })
    const queue = [...state.queue]
    queue.splice(state.index + 1, 0, ...ids)
    set({ queue })
  },
  /** Append tracks to the end of the queue. */
  addToQueue(ids: string[]) {
    if (!ids.length) return
    if (state.index < 0) return playerStore.playQueue(ids, 0, { kind: 'queue', label: 'Queue' })
    set({ queue: [...state.queue, ...ids] })
  },
  /** Shuffle the upcoming part once (the queue panel's shuffle button). */
  shuffleUpcoming() {
    if (state.index < 0) return
    const head = state.queue.slice(0, state.index + 1)
    const rest = state.queue.slice(state.index + 1)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    set({ queue: [...head, ...rest] })
  },
}

/** Upcoming rows removed by the last "Clear" (memory only; dropped when a new list starts). */
let lastCleared: string[] | null = null

onAccountReset(() => playerStore.clear())

export function onPlayerNotice(l: (n: PlayerNotice) => void) {
  noticeListeners.add(l)
  return () => {
    noticeListeners.delete(l)
  }
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(playerStore.subscribe, playerStore.get, playerStore.get)
}
