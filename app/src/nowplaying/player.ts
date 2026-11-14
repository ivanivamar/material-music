/**
 * Player state, read once for every player surface (the player bar, the mini player, the full-screen
 * player, the queue panel): what's playing, how long it is, how far along, where it's playing
 * from. The components live in parts.tsx.
 */
import { useLibrary, type Album, type Track } from '../state/library'
import { isIntroId, usePlayer, usePlayerPosition, type PlayContext, type PlayerView } from '../state/player'
import { albumHref, artistHref, mixHref, playlistHref } from '../shell/routes'
import { parseRadioId } from '../lib/mixing'
import { djIntroInfo } from '../state/dj'
import { useIntroAudio } from '../dj/voice'
import { useIntroProgress } from '../dj/live'
import { trackOf, albumOf } from '../state/previews'

export interface Current {
  p: PlayerView
  id: string | null
  track: Track | null
  album: Album | undefined
}

export function useCurrent(): Current {
  const p = usePlayer()
  const { data } = useLibrary()
  const id = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  const track = (id && trackOf(data, id)) || null
  return { p, id, track, album: track ? albumOf(data, track.albumId) : undefined }
}

/** Length of what's playing (s): the song, or the DJ's spoken intro. */
export function useDuration(): number {
  const { id, track } = useCurrent()
  const intro = isIntroId(id)
  const audio = useIntroAudio(intro && id ? djIntroInfo(id)?.sessionId : null)
  return intro ? (audio?.duration ?? 0) : (track?.duration ?? 0)
}

/** How far through it we are (0..1); an intro follows the live voice. */
export function useProgress(): number {
  const { id } = useCurrent()
  const position = usePlayerPosition()
  const duration = useDuration()
  const intro = useIntroProgress(isIntroId(id) ? id : null)
  if (isIntroId(id)) return intro.frac
  return duration > 0 ? Math.min(1, position / duration) : 0
}

const KICKER: Record<PlayContext['kind'], string> = {
  album: 'PLAYING FROM ALBUM',
  artist: 'PLAYING FROM ARTIST',
  playlist: 'PLAYING FROM PLAYLIST',
  library: 'PLAYING FROM LIBRARY',
  search: 'PLAYING FROM SEARCH',
  queue: 'PLAYING FROM QUEUE',
  dj: 'PLAYING FROM DJ',
  mix: 'PLAYING FROM MIX',
  radio: 'PLAYING FROM RADIO',
}

/** "PLAYING FROM ALBUM" + "Zanmu", with a link back when the context has a page. */
export function contextLine(ctx: PlayContext | null): { kicker: string; label: string; href?: string } {
  if (!ctx) return { kicker: 'PLAYING FROM QUEUE', label: 'Queue' }
  const label = ctx.label.replace(/^(Library|Search) · /, '')
  const radio = ctx.kind === 'radio' && ctx.id ? parseRadioId(ctx.id) : null
  const href = !ctx.id
    ? undefined
    : ctx.kind === 'album'
      ? albumHref(ctx.id)
      : ctx.kind === 'artist'
        ? artistHref(ctx.id)
        : ctx.kind === 'playlist'
          ? playlistHref(ctx.id)
          : ctx.kind === 'mix'
            ? mixHref(ctx.id)
            : radio?.type === 'artist'
              ? artistHref(radio.id)
              : radio?.type === 'album'
                ? albumHref(radio.id)
                : undefined
  const kicker = ctx.kind === 'mix' && !!ctx.id?.startsWith('daily-') ? 'PLAYING FROM DAILY MIX' : KICKER[ctx.kind]
  return { kicker, label, href }
}
