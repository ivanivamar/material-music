/** Playback helpers for the Library pages: play an album / artist / list, and what's playing now. */
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { playerStore, usePlayer, type PlayContext } from '../../state/player'
import { artistInfos } from '../../state/views'

export const albumTrackIds = (c: Catalogue, albumId: string) => (tracksByAlbum(c).get(albumId) ?? []).map((t) => t.id)

export function artistTrackIds(c: Catalogue, artistId: string): string[] {
  const info = artistInfos(c).get(artistId)
  return info ? info.albums.flatMap((a) => albumTrackIds(c, a.id)) : []
}

/** Play a list from `start`; `shuffle` turns shuffle on and starts on a random track. */
export function playList(ids: string[], context: PlayContext, opts: { start?: number; shuffle?: boolean } = {}) {
  if (!ids.length) return
  const start = opts.shuffle ? Math.floor(Math.random() * ids.length) : (opts.start ?? 0)
  playerStore.playQueue(ids, start, context, { shuffle: opts.shuffle })
}

/** Is the player currently playing from this context (album / artist / library songs)? */
export function useContextState(kind: PlayContext['kind'], id?: string): { active: boolean; playing: boolean; currentId: string | null } {
  const p = usePlayer()
  const currentId = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  const active = !!p.context && p.context.kind === kind && p.context.id === id && currentId !== null
  return { active, playing: active && p.playing, currentId }
}

/** The loaded track (any context) and whether it's playing, for row highlights. */
export function useNowPlaying(): { id: string | null; playing: boolean } {
  const p = usePlayer()
  return { id: p.index >= 0 ? (p.queue[p.index] ?? null) : null, playing: p.playing }
}

/** Album id of the track playing now (album cards light up). */
export function usePlayingAlbumId(c: Catalogue | null): string | null {
  const { id, playing } = useNowPlaying()
  return id && playing ? (c?.tracks[id]?.albumId ?? null) : null
}

