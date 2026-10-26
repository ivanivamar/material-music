/** Bits shared by the full-screen player, its lyrics view and the queue panel. */
import type { MouseEvent, ReactNode } from 'react'
import { CookieButton } from '../components/ui'
import { Icon } from '../design/icons'
import { useLibrary, type Album, type Track } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer, type PlayContext, type PlayerState } from '../state/player'
import { albumHref, artistHref, mixHref, playlistHref } from '../shell/routes'
import { parseRadioId } from '../lib/mixing'
import { useDjView } from '../state/djUi'
import { DjButton } from '../dj/DjButton'

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

/** Shuffle · prev · play · next · repeat (Material redesign): mode toggles that tighten into album-colour
 * squares when on, 64px skip buttons, the cookie play button (96 desktop, 80 phone; `compact` 64). */
export function Transport({ compact, phone }: { compact?: boolean; phone?: boolean }) {
  const p = usePlayer()
  const djOn = useDjView().on
  const radio = p.context?.kind === 'radio'
  // shuffle / repeat are not used by the DJ or a radio
  const dj = djOn || radio
  const offLabel = djOn ? 'Not used by the DJ' : 'Not used by the radio'
  const repeatLabel = p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeating the queue' : 'Repeating this song'
  const size = compact ? 64 : phone ? 80 : 96
  return (
    <div className={`np-transport ${compact ? 'is-compact' : ''} ${phone ? 'is-phone' : ''}`}>
      <span className="np-mode-slot">
        <button type="button" className={`np-mode ${!dj && p.shuffle ? 'is-on' : ''} ${dj ? 'is-dj-off' : ''}`} aria-pressed={!dj && p.shuffle} aria-label={dj ? offLabel : p.shuffle ? 'Shuffle on' : 'Shuffle'} title={dj ? offLabel : 'Shuffle'} onClick={() => !dj && playerStore.toggleShuffle()}>
          <Icon name="shuffle" />
        </button>
      </span>
      <button type="button" className="np-skip" aria-label="Previous" title="Previous" onClick={() => playerStore.prev()}>
        <Icon name="prev" filled />
      </button>
      <CookieButton
        size={size}
        iconSize={Math.round(size / 2)}
        playing={p.playing}
        icon={p.playing || p.buffering ? 'pauseF' : 'playF'}
        label={p.playing ? 'Pause' : 'Play'}
        className="np-play"
        onClick={onPlayPause}
        loading={p.buffering}
      />
      <button type="button" className="np-skip" aria-label="Next" title="Next" onClick={() => playerStore.next()}>
        <Icon name="next" filled />
      </button>
      <span className="np-mode-slot">
        <button type="button" className={`np-mode ${!dj && p.repeat !== 'off' ? 'is-on' : ''} ${dj ? 'is-dj-off' : ''}`} aria-pressed={!dj && p.repeat !== 'off'} aria-label={dj ? offLabel : repeatLabel} title={dj ? offLabel : repeatLabel} onClick={() => !dj && playerStore.cycleRepeat()}>
          <Icon name={p.repeat === 'one' ? 'repeatOne' : 'repeat'} />
        </button>
      </span>
    </div>
  )
}

/** Lyrics / Queue chips (filled with the album colour when open) + the DJ button.
 * Desktop: labelled chips, Lyrics · DJ · Queue n. Phone: square icon buttons, Lyrics · DJ · Queue. */
export function ViewButtons({ phone = false }: { size?: 'md' | 'sm'; phone?: boolean }) {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const dj = useDjView().on
  const upcoming = Math.max(0, p.queue.length - p.index - 1)
  const ly = ui.open && ui.view === 'lyrics'
  const lyrics = (
    <button key="ly" type="button" className={`np-vbtn ${phone ? 'is-sq' : ''} ${ly ? 'is-on' : ''}`} aria-pressed={ly} aria-label="Lyrics" onClick={() => nowPlayingStore.toggleLyrics()}>
      <Icon name="lyrics" />
      {!phone && 'Lyrics'}
    </button>
  )
  const queue = dj ? (
    <span key="q" className="dj-off-wrap">
      <button type="button" className={`np-vbtn ${phone ? 'is-sq' : ''} is-dj-off`} aria-disabled="true" aria-label="Queue: not available while the DJ plays" title={phone ? 'Not available while the DJ plays' : undefined}>
        <Icon name="queue" />
        {!phone && 'Queue'}
      </button>
      {!phone && (
        <span className="dj-off-tip" role="tooltip">
          Not available while the DJ plays
        </span>
      )}
    </span>
  ) : (
    <button key="q" type="button" className={`np-vbtn ${phone ? 'is-sq' : ''} ${ui.queue ? 'is-on' : ''}`} aria-pressed={ui.queue} aria-label="Queue" onClick={() => nowPlayingStore.toggleQueue()}>
      <Icon name="queue" />
      {!phone && (
        <>
          Queue<span className="np-vbtn-n">{upcoming}</span>
        </>
      )}
    </button>
  )
  const djb = <DjButton key="dj" variant={phone ? 'phone' : 'np'} />
  return <>{[lyrics, djb, queue]}</>
}
