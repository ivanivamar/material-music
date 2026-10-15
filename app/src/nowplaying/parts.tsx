/** Bits shared by the full-screen player, its lyrics view and the queue panel. */
import type { MouseEvent, ReactNode } from 'react'
import { IconButton, PlayButton } from '../components/ui'
import { Icon } from '../design/icons'
import { useLibrary, type Album, type Track } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer, type PlayContext, type PlayerState } from '../state/player'
import { albumHref, artistHref, playlistHref } from '../shell/routes'

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
  const track = (id && data?.tracks[id]) || null
  return { p, id, track, album: track ? data?.albums[track.albumId] : undefined }
}

const KICKER: Record<PlayContext['kind'], string> = {
  album: 'PLAYING FROM ALBUM',
  artist: 'PLAYING FROM ARTIST',
  playlist: 'PLAYING FROM PLAYLIST',
  library: 'PLAYING FROM LIBRARY',
  search: 'PLAYING FROM SEARCH',
  queue: 'PLAYING FROM QUEUE',
}

/** "PLAYING FROM ALBUM" + "Zanmu", with a link back when the context has a page. */
export function contextLine(ctx: PlayContext | null): { kicker: string; label: string; href?: string } {
  if (!ctx) return { kicker: 'PLAYING FROM QUEUE', label: 'Queue' }
  const label = ctx.label.replace(/^(Library|Search) · /, '')
  const href = !ctx.id ? undefined : ctx.kind === 'album' ? albumHref(ctx.id) : ctx.kind === 'artist' ? artistHref(ctx.id) : ctx.kind === 'playlist' ? playlistHref(ctx.id) : undefined
  return { kicker: KICKER[ctx.kind], label, href }
}

/** In-app link from inside the full-screen player: closes it first (and pops its history entry). */
export function NpLink({ href, className, title, children }: { href: string; className?: string; title?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    nowPlayingStore.closeAndGo(href)
  }
  return (
    <a href={href} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  )
}

export function onPlayPause() {
  playerStore.toggle()
}

/** Shuffle · prev · play · next · repeat (handoff: 40px gaps, 76px play). `compact` = lyrics view (54px play, tighter gaps; shuffle and repeat stay). */
export function Transport({ compact }: { compact?: boolean }) {
  const p = usePlayer()
  const state = p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'
  const repeatLabel = p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'
  return (
    <div className={`np-transport ${compact ? 'is-compact' : ''}`}>
      <IconButton
        icon="shuffle"
        label={p.shuffle ? 'Shuffle on' : 'Shuffle'}
        bare
        pressed={p.shuffle}
        className={`np-mode ${p.shuffle ? 'is-on' : ''}`}
        onClick={() => playerStore.toggleShuffle()}
      />
      <IconButton icon="prev" label="Previous" bare className="np-skip" onClick={() => playerStore.prev()} />
      <span className="np-play">
        <PlayButton size={compact ? 54 : 76} state={state} onClick={onPlayPause} />
      </span>
      <IconButton icon="next" label="Next" bare className="np-skip" onClick={() => playerStore.next()} />
      <span className="np-repeat-wrap">
        <IconButton icon="repeat" label={repeatLabel} bare pressed={p.repeat !== 'off'} className={`np-mode ${p.repeat !== 'off' ? 'is-on' : ''}`} onClick={() => playerStore.cycleRepeat()} />
        {p.repeat === 'one' && (
          <span className="np-repeat-one" aria-hidden>
            1
          </span>
        )}
      </span>
    </div>
  )
}

/** Lyrics / Queue toggle buttons (outlined; solid white when on). */
export function ViewButtons({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const upcoming = Math.max(0, p.queue.length - p.index - 1)
  const ly = ui.open && ui.view === 'lyrics'
  return (
    <>
      <button type="button" className={`np-vbtn ${size === 'sm' ? 'is-sm' : ''} ${ly ? 'is-on' : ''}`} aria-pressed={ly} onClick={() => nowPlayingStore.toggleLyrics()}>
        <span className="np-vbtn-ic">
          <Icon name="lyrics" />
        </span>
        Lyrics
      </button>
      <button type="button" className={`np-vbtn ${size === 'sm' ? 'is-sm' : ''} ${ui.queue ? 'is-on' : ''}`} aria-pressed={ui.queue} onClick={() => nowPlayingStore.toggleQueue()}>
        <span className="np-vbtn-ic">
          <Icon name="queue" />
        </span>
        Queue
        <span className="np-vbtn-n">{String(upcoming).padStart(2, '0')}</span>
      </button>
    </>
  )
}
