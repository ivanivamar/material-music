/**
 * Made for you = the Day mix + Discovery first (Ivan, Nov 2026: always the first two), then today's
 * Daily Mixes, Deep cuts and Rediscover (state/mixes.ts).
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { MixSet } from '../lib/mixing'
import { dayMix, subscribeDayMix } from './daymix'
import { discoveryMix, ensureDiscovery, useDiscovery } from './discovery'
import { usePlaylists } from './playlists'

let hiddenRev = 0
subscribeDayMix(() => hiddenRev++)

/** Today's set with the Day mix and Discovery in front (null while today's mixes compute). */
export function withMadeForYou(set: MixSet | null, nowMs = Date.now()): MixSet | null {
  if (!set) return null
  const first = [dayMix(nowMs), discoveryMix(nowMs)].filter((m): m is NonNullable<typeof m> => !!m)
  if (!first.length) return set
  return { ...set, items: [...first, ...set.items] }
}

/**
 * The Made for you set for a page: re-renders when the Day mix's inputs (hearts, hidden songs) or
 * Discovery change, and starts this week's Discovery build when needed.
 */
export function useMadeForYou(set: MixSet | null, nowMs = Date.now()): { set: MixSet | null; discoveryBuilding: boolean } {
  const disc = useDiscovery()
  usePlaylists() // hearts live in the Liked songs playlist
  useSyncExternalStore(subscribeDayMix, () => hiddenRev, () => hiddenRev)
  const weekKey = new Date(nowMs).toDateString()
  useEffect(() => {
    if (set) void ensureDiscovery()
  }, [set, weekKey])
  return { set: withMadeForYou(set, nowMs), discoveryBuilding: disc.building && !discoveryMix(nowMs) }
}
