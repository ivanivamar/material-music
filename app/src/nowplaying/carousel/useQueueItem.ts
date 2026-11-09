/**
 * One queue row as the carousel and reorder mode show it: title, artist, album and cover for a song;
 * the DJ's live mark for a DJ intro. The single place that resolves a queue id for display.
 */
import { useCover } from '../../lib/covers'
import { useLibrary, type Album, type Track } from '../../state/library'
import { isIntroId } from '../../state/player'
import { djIntroInfo } from '../../state/dj'
import { trackOf, albumOf } from '../../state/previews'

export interface QueueItem {
  id: string
  intro: boolean
  track: Track | null
  album: Album | undefined
  cover: string | null
  title: string
  /** "Artist · Album" (songs), '' for an intro */
  sub: string
}

export function useQueueItem(id: string): QueueItem {
  const { data } = useLibrary()
  const intro = isIntroId(id)
  const track = intro ? null : trackOf(data, id) || null
  const album = track ? albumOf(data, track.albumId) : undefined
  const cover = useCover(album?.cover)
  const title = intro ? (djIntroInfo(id)?.title ?? 'DJ') : (track?.title ?? 'No longer in your library')
  const sub = track ? (album ? `${track.artist} · ${album.title}` : track.artist) : ''
  return { id, intro, track, album, cover, title, sub }
}
