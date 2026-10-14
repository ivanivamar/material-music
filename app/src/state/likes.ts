/**
 * Liked songs. Kept locally for now (localStorage); step 8 turns this into
 * Drive `Pelagic/playlists/liked.json` with the per-entry merge from the plan.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'pelagic.likes.v1'
/** trackId -> likedAt (ISO) */
type Likes = Record<string, string>

function load(): Likes {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Likes
  } catch {
    return {}
  }
}

let likes: Likes = load()
const listeners = new Set<() => void>()

export const likesStore = {
  get: () => likes,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  set(trackId: string, liked: boolean) {
    if (!!likes[trackId] === liked) return
    const next = { ...likes }
    if (liked) next[trackId] = new Date().toISOString()
    else delete next[trackId]
    likes = next
    try {
      localStorage.setItem(KEY, JSON.stringify(likes))
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  },
  clear() {
    likes = {}
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  },
}

export function useLikes(): Likes {
  return useSyncExternalStore(likesStore.subscribe, likesStore.get, likesStore.get)
}
