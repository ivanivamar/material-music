/**
 * Search results helpers (Library + Search merge): results for the Library field, the count line,
 * Enter → top result, and playing a result list. The views are in Search.tsx.
 */
import { useDeferredValue, useMemo } from 'react'
import type { Catalogue } from '../../state/library'
import { usePlaylists } from '../../state/playlists'
import { search, searchStore, suggest, type SearchFilter, type SearchResults } from '../../state/search'
import { albumHref, artistHref, go, playlistHref } from '../../shell/routes'
import { plural } from '../../state/views'
import { playList } from '../library/playback'

/** Focusable results for ↑ / ↓ (album cards come from the shared AlbumCard). */
export const NAV = '[data-nav], .acard'

export function playTracks(ids: string[], start: number, query: string) {
  searchStore.remember(query)
  playList(ids, { kind: 'search', id: query, label: `Search · “${query.trim()}”` }, { start })
}

/** Results + "did you mean" for a query (null while the field is empty). Typing stays responsive on
 * big libraries: results follow a frame behind if needed. */
export function useSearchResults(c: Catalogue | null, query: string): { results: SearchResults | null; suggestion: string | null } {
  const deferred = useDeferredValue(query)
  const { list: playlists } = usePlaylists()
  const results = useMemo(() => (c && deferred.trim() ? search(c, deferred, playlists) : null), [c, deferred, playlists])
  const suggestion = useMemo(() => (c && results && results.total === 0 ? suggest(c, deferred) : null), [c, results, deferred])
  return { results, suggestion }
}

/** How many results the current results tab shows. */
export function shownCount(r: SearchResults, filter: SearchFilter): number {
  return filter === 'artists' ? r.artists.length : filter === 'albums' ? r.albums.length : filter === 'playlists' ? r.playlists.length : filter === 'songs' ? r.tracks.length : r.total
}

/** "22 RESULTS · 2 MS" */
export const resultsMeta = (r: SearchResults, filter: SearchFilter) => `${plural(shownCount(r, filter), 'RESULT')} · ${r.ms < 1 ? '<1' : Math.round(r.ms)} MS`

/** Enter in the field: open (or play) the top result and remember the query. */
export function openTopResult(r: SearchResults | null, query: string) {
  const top = r?.top
  if (!r || !top) return
  searchStore.remember(query)
  if (top.kind === 'artist') go(artistHref(top.item.id))
  else if (top.kind === 'album') go(albumHref(top.item.id))
  else if (top.kind === 'playlist') go(playlistHref(top.item.id))
  else playTracks(r.tracks.map((h) => h.item.id), 0, query)
}

/** The first focusable result (↓ from the field). */
export const firstResult = (root: HTMLElement | null) => root?.querySelector<HTMLElement>(NAV) ?? null

