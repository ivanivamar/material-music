/**
 * Player state: queue, position, transport flags, volume.
 *
 * This is the shape the player bar binds to. The audio engine (step 3d: HTML audio on PC with
 * local FLAC via File System Access or Drive streaming, Media Session; native ExoPlayer on
 * Android) attaches with `playerStore.attach(engine)` and drives `position` / `playing`.
 * Until an engine is attached, transport calls only move the queue.
 */
import { useSyncExternalStore } from 'react'
import { onAccountReset } from './session'

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayContext {
  kind: 'album' | 'artist' | 'playlist' | 'liked' | 'search' | 'queue'
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
}

export interface PlayerEngine {
  load(trackId: string, opts: { autoplay: boolean; position?: number }): void
  play(): void
  pause(): void
  seek(seconds: number): void
  setVolume(volume: number, muted: boolean): void
}

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
}

function load(): PlayerState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>), playing: false, buffering: false }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

let state = load()
let engine: PlayerEngine | null = null
const listeners = new Set<() => void>()
let persistTimer = 0

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    const { queue, index, context, position, volume, muted, shuffle, repeat } = state
    try {
      localStorage.setItem(KEY, JSON.stringify({ queue, index, context, position, volume, muted, shuffle, repeat } satisfies Persisted))
    } catch {
      /* ignore */
    }
  }, 400)
}

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
  report(patch: Partial<Pick<PlayerState, 'playing' | 'buffering' | 'position'>>) {
    set(patch)
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
    engine?.pause()
    set({ ...DEFAULTS, volume: state.volume, muted: state.muted })
  },
}

onAccountReset(() => playerStore.clear())

export function usePlayer(): PlayerState {
  return useSyncExternalStore(playerStore.subscribe, playerStore.get, playerStore.get)
}
