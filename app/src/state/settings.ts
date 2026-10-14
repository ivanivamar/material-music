/**
 * Settings store. Every change saves instantly (handoff: Settings).
 * Persisted to localStorage now; later mirrored to Drive `Pelagic/settings.json`
 * so desktop and Android share one store.
 *
 * Tiny external store + useSyncExternalStore — no dependency needed.
 */
import { useSyncExternalStore } from 'react'
import type { MotionSetting, ParticleSetting } from '../design/tokens'

export interface Settings {
  /** Atmosphere */
  motion: MotionSetting
  particles: ParticleSetting
  texture: boolean
  /** Lyrics */
  romaji: boolean
  english: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  motion: 'system',
  particles: 'default',
  texture: true,
  romaji: true,
  english: false,
}

const KEY = 'pelagic.settings.v1'
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
    emit()
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
