/**
 * Day mix state (Nov 2026): lib/daymix.ts fed from the stores, as a MixPlan so Home, the mix page,
 * Jump back in and the cards treat it like the other mixes.
 *
 * Rebuilt when a part of the day starts (dayPart().key), and when the catalogue / history / hearts /
 * genres change — always from the plays before the part started, so it doesn't change while you
 * listen and PC + phone agree. The DJ doesn't use any of this.
 *
 * "Hide from Day mix" keeps a song out for 30 days (localStorage `pelagic.daymix.hidden.v1`; per
 * device, small).
 */
import { buildLibrary } from '../dj/engine'
import { buildDayMix, dayPart, DAY_MIX_ID, type DayMixPlan, type DaySlot } from '../lib/daymix'
import type { MixPlan } from '../lib/mixing'
import { djStore } from './dj'
import { genreResolver, genresStore } from './genres'
import { historyStore } from './history'
import { libraryStore } from './library'
import { likedIndex } from './likes'

const DAY = 86_400_000
const HIDE_KEY = 'pelagic.daymix.hidden.v1'
const HIDE_MS = 30 * DAY

/** Hue per part of the day (oklch H): dawn peach, day blue, gold, sunset coral, night blue, late indigo. */
export const PART_HUE: Record<DaySlot['part'], number> = { early: 40, morning: 235, afternoon: 75, evening: 30, night: 262, late: 275 }

function readHidden(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDE_KEY) ?? '{}') as Record<string, number>
    const now = Date.now()
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => until > now))
  } catch {
    return {}
  }
}
let hidden = readHidden()
let hiddenRev = 0
const listeners = new Set<() => void>()

export function hideFromDayMix(trackId: string, on = true) {
  hidden = { ...readHidden() }
  if (on) hidden[trackId] = Date.now() + HIDE_MS
  else delete hidden[trackId]
  try {
    localStorage.setItem(HIDE_KEY, JSON.stringify(hidden))
  } catch {
    /* ignore */
  }
  hiddenRev++
  memo = null
  listeners.forEach((l) => l())
}
export const isHiddenFromDayMix = (id: string) => (hidden[id] ?? 0) > Date.now()
export function subscribeDayMix(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export interface DayMix extends MixPlan {
  kind: 'day'
  day: DayMixPlan
}

let memo: { key: unknown[]; mix: DayMix | null } | null = null

/** The Day mix for now (memoised; null while there's no catalogue / too few songs). */
export function dayMix(nowMs = Date.now()): DayMix | null {
  const c = libraryStore.get().data
  if (!c) return null
  const slot = dayPart(nowMs)
  const plays = historyStore.get().plays
  const gdoc = genresStore.get().doc
  const pen = djStore.get().doc.songPenalties
  const liked = likedIndex()
  const key = [c, plays, gdoc, pen, liked, slot.key, hiddenRev]
  if (memo && memo.key.every((k, i) => k === key[i])) return memo.mix
  const before = plays.filter((p) => p.at * 1000 < slot.start)
  const penalties: Record<string, number> = {}
  for (const [id, until] of Object.entries(pen)) if (until > slot.start) penalties[id] = until
  const lib = buildLibrary({ tracks: Object.values(c.tracks), albums: c.albums, genreOf: genreResolver(gdoc, c), plays: before, penalties, liked: liked.at, now: slot.start })
  let mix: DayMix | null = null
  if (lib.tracks.length >= 12) {
    const plan = buildDayMix({ lib, plays: before, slot, hidden: new Set(Object.keys(hidden).filter(isHiddenFromDayMix)) })
    mix = {
      id: DAY_MIX_ID,
      kind: 'day',
      title: 'Day mix',
      sub: plan.phrase,
      why: plan.why,
      hue: PART_HUE[slot.part],
      coverAlbums: [],
      trackIds: plan.trackIds,
      newCount: plan.newCount,
      day: plan,
    }
  }
  memo = { key, mix }
  return mix
}

/** "Next update 17:00" */
export function nextUpdateLabel(slot: DaySlot): string {
  const d = new Date(slot.next)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

export type { DayMixPlan, DaySlot }
