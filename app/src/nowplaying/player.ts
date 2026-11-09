/**
 * Player state, read once for every player surface (the player bar, the mini player, the full-screen
 * player, the queue carousel): what's playing, how long it is, how far along, where it's playing
 * from, and the queue edits with their Undo toasts. The components live in parts.tsx.
 */
import { useToast } from '../components/ui'
import { useLibrary, type Album, type Track } from '../state/library'
import { isIntroId, playerStore, usePlayer, type PlayContext, type PlayerState } from '../state/player'
import { albumHref, artistHref, mixHref, playlistHref } from '../shell/routes'
import { parseRadioId } from '../lib/mixing'
import { djIntroInfo, type DjView } from '../state/dj'
import { useIntroAudio } from '../dj/voice'
import { useIntroProgress } from '../dj/live'
import { trackOf, albumOf } from '../state/previews'

export interface Current {
  p: PlayerState
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

/** The playing song's state line: "On Kitchen speaker", "DJ · intro", "Radio", "Now playing", "Paused". */
export function nowKicker(p: PlayerState, dj: DjView): string {
  if (p.remote) return `On ${p.remote.name}`
  if (dj.on) return dj.intro ? 'DJ · intro' : dj.addedByUser ? 'DJ · added by you' : 'DJ'
  if (p.context?.kind === 'radio') return 'Radio'
  return p.playing ? 'Now playing' : 'Paused'
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
  const { p, id } = useCurrent()
  const duration = useDuration()
  const intro = useIntroProgress(isIntroId(id) ? id : null)
  if (isIntroId(id)) return intro.frac
  return duration > 0 ? Math.min(1, p.position / duration) : 0
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

/** Queue edits from the carousel, each with an Undo toast. Rows are absolute queue indices. */
export function useQueueEdits() {
  const toast = useToast()
  const { data } = useLibrary()
  return {
    remove(abs: number) {
      const id = playerStore.get().queue[abs]
      if (!id || abs === playerStore.get().index) return
      playerStore.remove(abs)
      const t = trackOf(data, id)
      toast.show({
        icon: 'queue',
        text: t ? `Removed “${t.title}” from the queue.` : 'Removed from the queue.',
        meta: 'QUEUE',
        action: { label: 'Undo', onClick: () => playerStore.insert(abs, id) },
      })
    },
    /** Move a row to right after the current song. */
    playNext(abs: number) {
      const { index } = playerStore.get()
      if (abs === index) return
      playerStore.move(abs, abs < index ? index : index + 1)
    },
  }
}
