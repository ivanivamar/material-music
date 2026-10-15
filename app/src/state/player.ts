/**
 * Player state: queue, position, transport flags, volume.
 *
 * This is the shape the player bar binds to. The audio engine (step 3d: HTML audio on PC with
 * local FLAC via File System Access or Drive streaming, Media Session; native ExoPlayer on
 * Android) attaches with `playerStore.attach(engine)` and drives `position` / `playing`.
 * Until an engine is attached, transport calls only move the queue.
 *
 * PC engine: `player/htmlEngine.ts`; Android: `player/nativeEngine.ts` (attached in App.tsx).
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
  /**
   * Queue order from before shuffle was turned on, so turning it off can put it back
   * (null while shuffle is off).
   */
  unshuffled: string[] | null
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
  /**
   * The track that will play after the current one (null = none / unknown). Engines that can
   * prepare it ahead of time (PC: gapless playback) do so; others ignore it. Idempotent.
   */
  preload?(trackId: string | null): void
}

/** Things the engine needs the UI to say (toasts). */
export type PlayerNotice =
  | { kind: 'auth'; trackId: string } // Drive stream needs a fresh Google sign-in
  | { kind: 'error'; trackId: string; message: string; skipped: boolean }
  | { kind: 'missing'; trackId: string } // track no longer in the catalogue

const KEY = 'pelagic.player.v1'
type Persisted = Pick<PlayerState, 'queue' | 'index' | 'context' | 'position' | 'volume' | 'muted' | 'shuffle' | 'unshuffled' | 'repeat'>

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
  unshuffled: null,
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
const movedListeners = new Set<(from: number, to: number) => void>()
let persistTimer = 0
/** `go()` loads the track first and tells the engine about the next one afterwards */
let holdPreload = false
let lastPreload: string | null | undefined

function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = 0
  const { queue, index, context, position, volume, muted, shuffle, unshuffled, repeat } = state
  try {
    localStorage.setItem(KEY, JSON.stringify({ queue, index, context, position, volume, muted, shuffle, unshuffled, repeat } satisfies Persisted))
  } catch {
    /* ignore */
  }
}

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  // throttle, not debounce: the engine reports position several times a second while playing
  if (!persistTimer) persistTimer = window.setTimeout(persist, 1000)
  if (!holdPreload) syncPreload()
}

/** Id of the track that follows the current one, as the queue / repeat mode stand now. */
function nextId(): string | null {
  const { queue, index, repeat } = state
  if (index < 0 || repeat === 'one') return null
  const next = index < queue.length - 1 ? queue[index + 1] : repeat === 'all' ? queue[0] : undefined
  return next && next !== queue[index] ? next : null
}

/** Tell the engine which track to prepare (only when it changed, unless `force`). */
function syncPreload(force = false) {
  if (!engine?.preload) return
  const id = nextId()
  if (!force && id === lastPreload) return
  lastPreload = id
  engine.preload(id)
}
window.addEventListener('pagehide', persist)

function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Shuffle off: put the queue back in its pre-shuffle order, keeping only what's still queued
 * (removals stick) and the current track playing. Tracks added while shuffled have no original
 * place, so they go right after the current one.
 */
function unshuffledOrder(): Pick<PlayerState, 'queue' | 'index'> | null {
  const orig = state.unshuffled
  if (!orig || state.index < 0) return null
  const cur = state.queue[state.index]
  const left = new Map<string, number>()
  state.queue.forEach((id, i) => i !== state.index && left.set(id, (left.get(id) ?? 0) + 1))
  const out: string[] = []
  let at = -1
  for (const id of orig) {
    if (at < 0 && id === cur) {
      at = out.length
      out.push(id)
    } else if ((left.get(id) ?? 0) > 0) {
      left.set(id, left.get(id)! - 1)
      out.push(id)
    }
  }
  if (at < 0) {
    at = 0
    out.unshift(cur)
  }
  const extras = [...left].flatMap(([id, n]) => Array<string>(n).fill(id))
  out.splice(at + 1, 0, ...extras)
  return { queue: out, index: at }
}

const current = () => (state.index >= 0 ? (state.queue[state.index] ?? null) : null)

function go(index: number, autoplay: boolean) {
  holdPreload = true
  try {
    set({ index, position: 0 })
  } finally {
    holdPreload = false
  }
  const id = current()
  if (id && engine) engine.load(id, { autoplay })
  syncPreload(true) // after load(): the engine may have just taken over the preloaded track
}

export const playerStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  currentId: current,
  nextId,
  hasEngine: () => engine !== null,

  /** Step 3d: the engine reports back through `report`. */
  attach(e: PlayerEngine) {
    engine = e
    e.setVolume(state.volume, state.muted)
    const id = current()
    if (id) e.load(id, { autoplay: false, position: state.position })
    syncPreload(true)
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
  /**
   * Native engine (Android): the player moved to another queue row on its own — auto-advance,
   * repeat, lock-screen / headset next & previous. Only the store follows; nothing is sent back.
   */
  engineMoved(index: number) {
    if (index === state.index || index < 0 || index >= state.queue.length) return
    const from = state.index
    movedListeners.forEach((l) => l(from, index))
    set({ index, position: 0 })
  },
  /** Engine calls this when a track finishes. */
  ended() {
    if (state.repeat === 'one') return go(state.index, true)
    if (state.index < state.queue.length - 1) return go(state.index + 1, true)
    if (state.repeat === 'all' && state.queue.length) return go(0, true)
    set({ playing: false, position: 0 })
  },

  /**
   * Replace the queue and play from `start`. With shuffle on (or `opts.shuffle`, which turns it on)
   * the starting track goes first and the rest of the list is shuffled after it.
   */
  playQueue(ids: string[], start = 0, context: PlayContext | null = null, opts: { shuffle?: boolean } = {}) {
    if (!ids.length) return
    const shuffle = state.shuffle || !!opts.shuffle
    let queue = ids
    let index = start
    if (shuffle) {
      queue = [ids[start], ...shuffled(ids.filter((_, i) => i !== start))]
      index = 0
    }
    lastCleared = null
    set({ queue, context, shuffle, unshuffled: shuffle ? ids : null })
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
  /**
   * Shuffle on: the current track moves to the top of the queue and everything else (played and
   * upcoming) is shuffled after it. Shuffle off: the original order comes back (see unshuffledOrder).
   */
  toggleShuffle() {
    if (!state.shuffle) {
      if (state.index < 0) return set({ shuffle: true, unshuffled: null })
      const cur = state.queue[state.index]
      const others = state.queue.filter((_, i) => i !== state.index)
      set({ shuffle: true, unshuffled: state.queue, queue: [cur, ...shuffled(others)], index: 0 })
    } else {
      set({ shuffle: false, unshuffled: null, ...unshuffledOrder() })
    }
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

/**
 * The native engine moved from queue row `from` to `to` by itself (fires before the store changes).
 * The play counter uses it to account for tracks that played while the app's JS was asleep.
 */
export function onEngineMoved(l: (from: number, to: number) => void) {
  movedListeners.add(l)
  return () => {
    movedListeners.delete(l)
  }
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(playerStore.subscribe, playerStore.get, playerStore.get)
}
