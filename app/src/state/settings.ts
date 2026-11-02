/**
 * Settings store. Every change saves instantly (handoff: Settings).
 * Persisted to localStorage. Since step 39 the settings in SHARED_SETTINGS are also kept in
 * Firestore (`users/<uid>/state/settings`, sync/settingsSync.ts) so the PC and the phone share
 * them: each key carries the time it was last changed and the latest change wins. The rest
 * (streaming quality, Drive fallback, the sync switch) stays per device.
 *
 * Tiny external store + useSyncExternalStore — no dependency needed.
 */
import { useSyncExternalStore } from 'react'
import type { MotionSetting, ParticleSetting } from '../design/tokens'
import { isNative } from '../native/bridge'

/** What streams from Drive: the Opus 160 copy (`track.mobile`) or the FLAC as stored. */
export type StreamQuality = 'opus' | 'original'

export interface Settings {
  /** Atmosphere */
  motion: MotionSetting
  particles: ParticleSetting
  texture: boolean
  /** Lyrics */
  romaji: boolean
  english: boolean
  /** Playback: what streams from Drive (a linked local folder always plays its FLAC) */
  streamQuality: StreamQuality
  /** Library (PC): play from Drive when a track isn't in the linked local folder */
  driveFallback: boolean
  /** New Releases: the daily sweep runs after this local hour */
  sweepHour: number
  /** Upload: look up lyrics (LRCLIB) for songs that arrive without them */
  fetchLyrics: boolean
  /** Step 37: share the queue / playback with the other devices (Firestore) */
  syncPlayback: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  motion: 'system',
  particles: 'default',
  texture: true,
  romaji: true,
  english: false,
  // what each device played before the setting existed: FLAC on the PC, the Opus copy on the phone
  streamQuality: isNative ? 'opus' : 'original',
  driveFallback: true,
  sweepHour: 6,
  fetchLyrics: true,
  syncPlayback: true,
}

/** Shared between devices (the rest is per device: what this device streams, its folder, its sync). */
export const SHARED_SETTINGS = ['motion', 'particles', 'texture', 'romaji', 'english', 'sweepHour', 'fetchLyrics'] as const satisfies readonly (keyof Settings)[]
export type SharedSetting = (typeof SHARED_SETTINGS)[number]
const isShared = (k: keyof Settings): k is SharedSetting => (SHARED_SETTINGS as readonly string[]).includes(k)

const KEY = 'pelagic.settings.v1'
/** ms of the last change of each shared setting on this device (0 / missing: never changed here) */
const STAMPS_KEY = 'pelagic.settings.stamps.v1'
type Listener = () => void

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS }
}

let state: Settings = load()
const listeners = new Set<Listener>()

function loadStamps(): Partial<Record<SharedSetting, number>> {
  try {
    return JSON.parse(localStorage.getItem(STAMPS_KEY) || '{}') as Partial<Record<SharedSetting, number>>
  } catch {
    return {}
  }
}
let stamps = loadStamps()
const changeListeners = new Set<() => void>()
function saveStamps() {
  try {
    localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps))
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l())
}

export const settingsStore = {
  get: () => state,
  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (state[key] === value) return
    state = { ...state, [key]: value }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore quota / private mode */
    }
    if (isShared(key)) {
      stamps = { ...stamps, [key]: Date.now() }
      saveStamps()
      changeListeners.forEach((l) => l())
    }
    emit()
  },
  /** Shared settings + when each was last changed here (sync/settingsSync.ts). */
  shared(): { values: Partial<Pick<Settings, SharedSetting>>; stamps: Partial<Record<SharedSetting, number>> } {
    const values: Partial<Record<SharedSetting, unknown>> = {}
    for (const k of SHARED_SETTINGS) values[k] = state[k]
    return { values: values as Partial<Pick<Settings, SharedSetting>>, stamps: { ...stamps } }
  },
  /** Take shared settings changed on another device (only keys whose stamp is newer than ours). */
  applyShared(values: Partial<Record<string, unknown>>, remoteStamps: Partial<Record<string, number>>) {
    let next = state
    let changed = false
    for (const k of SHARED_SETTINGS) {
      const t = remoteStamps[k] ?? 0
      if (!(k in values) || t <= (stamps[k] ?? 0)) continue
      const v = values[k]
      if (typeof v !== typeof DEFAULT_SETTINGS[k]) continue
      stamps = { ...stamps, [k]: t }
      if (next[k] !== v) {
        next = { ...next, [k]: v }
        changed = true
      }
    }
    saveStamps()
    if (!changed) return
    state = next
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
    emit()
  },
  /** A shared setting changed here. */
  onSharedChange(l: () => void) {
    changeListeners.add(l)
    return () => changeListeners.delete(l)
  },
  /** Replace wholesale (e.g. after pulling settings.json from Drive). */
  replace(next: Partial<Settings>) {
    state = { ...DEFAULT_SETTINGS, ...next }
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
    emit()
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get)
}

export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const s = useSettings()
  return [s[key], (v) => settingsStore.set(key, v)]
}
