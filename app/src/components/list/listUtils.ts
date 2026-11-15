/** Small helpers shared by the song lists (album, playlist, Liked songs, mixes, Library → Songs). */
import { useMemo } from 'react'
import { useHistory } from '../../state/history'
import { usePlayerPosition } from '../../state/player'

/** A song in an ordered list, for "x min left". */
export interface ListSong {
  id: string
  /** seconds */
  len: number
}

/** trackId → how many times it was played (all devices, all time). */
export function usePlayCounts(): Map<string, number> {
  const { plays } = useHistory()
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const p of plays) m.set(p.trackId, (m.get(p.trackId) ?? 0) + 1)
    return m
  }, [plays])
}

export const fmtClock = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** "1 h 44 min left" / "27 min left" */
export function fmtLeft(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60))
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min left` : `${m} min left`
}

/** "9 h 41 min" / "48 min" */
export function fmtHoursMin(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

/** "48 PLAYS" / "NOT PLAYED" for the mono plays column. */
export const playsLabel = (n: number) => (n ? `${n.toLocaleString('en')} ${n === 1 ? 'PLAY' : 'PLAYS'}` : 'NOT PLAYED')

/** Seconds left in the list from the playing song's position. */
export function useTimeLeft(songs: ListSong[], current: number): number {
  const pos = usePlayerPosition()
  if (current < 0) return songs.reduce((a, s) => a + (s.len || 0), 0)
  let left = Math.max(0, (songs[current]?.len || 0) - pos)
  for (let i = current + 1; i < songs.length; i++) left += songs[i].len || 0
  return left
}
