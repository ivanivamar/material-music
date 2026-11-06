/**
 * Liked songs (Nov 2026): the hearts. The songs live in the permanent Liked songs playlist
 * (state/playlists.ts, id `liked`), so they sync, merge and show like any playlist. This module
 * answers "is this song liked?" fast for the many heart buttons on screen, and since when.
 *
 * An entry counts for the track it resolves to (its stored id, else the same ISRC / artist + title
 * after a tag edit), so a heart stays lit when a song's id changes.
 */
import { useSyncExternalStore } from 'react'
import { libraryStore, type Catalogue } from './library'
import { resolveEntry } from './playlistViews'
import { LIKED_ID, liveEntries, playlistsStore, type Playlist } from './playlists'

export interface LikedIndex {
  /** liked track ids (resolved against the catalogue) */
  ids: Set<string>
  /** trackId → when it was liked (ms) */
  at: Map<string, number>
  /** trackId → its live entry ids in Liked songs (unlike removes them all) */
  entries: Map<string, string[]>
}

const EMPTY: LikedIndex = { ids: new Set(), at: new Map(), entries: new Map() }
const memo = new WeakMap<Playlist, { c: Catalogue | null; ix: LikedIndex }>()

function build(p: Playlist, c: Catalogue | null): LikedIndex {
  const ix: LikedIndex = { ids: new Set(), at: new Map(), entries: new Map() }
  for (const e of liveEntries(p)) {
    const id = c ? (resolveEntry(c, e).track?.id ?? e.trackId) : e.trackId
    ix.ids.add(id)
    const ms = Date.parse(e.addedAt) || 0
    if (ms > (ix.at.get(id) ?? 0)) ix.at.set(id, ms)
    const list = ix.entries.get(id)
    if (list) list.push(e.entryId)
    else ix.entries.set(id, [e.entryId])
  }
  return ix
}

/** The current liked set (memoised per Liked songs doc + catalogue). */
export function likedIndex(): LikedIndex {
  const p = playlistsStore.get().byId.get(LIKED_ID)
  if (!p) return EMPTY
  const c = libraryStore.get().data
  const hit = memo.get(p)
  if (hit && hit.c === c) return hit.ix
  const ix = build(p, c)
  memo.set(p, { c, ix })
  return ix
}

export const isLiked = (trackId: string | null | undefined): boolean => !!trackId && likedIndex().ids.has(trackId)

function subscribe(l: () => void) {
  const a = playlistsStore.subscribe(l)
  const b = libraryStore.subscribe(l)
  return () => {
    a()
    b()
  }
}

/** Re-renders only when this song's heart flips. */
export function useIsLiked(trackId: string | null | undefined): boolean {
  const get = () => isLiked(trackId)
  return useSyncExternalStore(subscribe, get, get)
}

export function useLikedIndex(): LikedIndex {
  return useSyncExternalStore(subscribe, likedIndex, likedIndex)
}
