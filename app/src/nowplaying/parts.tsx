/**
 * The player's building blocks, shared by the desktop player bar, the phone mini player and the
 * full-screen player (Nov 2026 carousel player). Every control is defined once here; the surfaces
 * only arrange them. The state they read comes from player.ts.
 */
import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { CookieButton, ModeToggle, ThinSlider, useToast, WaveSeek } from '../components/ui'
import { Icon } from '../design/icons'
import type { Track } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer, usePlayerPosition } from '../state/player'
import { useDjView } from '../state/djUi'
import { useSettings } from '../state/settings'
import { isNative } from '../native/bridge'
import './player.css'

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

/** Shuffle / repeat aren't used by the DJ or a radio: why, for the disabled toggles. */
function useFixedOrder(): string | null {
  const p = usePlayer()
  const dj = useDjView().on
  if (dj) return 'Not used by the DJ'
  if (p.context?.kind === 'radio') return 'Not used by the radio'
  return null
}

/** Previous · play (album-colour cookie) · next. `play` / `skip` are the button sizes in px. */
export function Transport({ play, skip, className }: { play: number; skip: number; className?: string }) {
  const p = usePlayer()
  const toast = useToast()
  const empty = p.index < 0
  const onPlay = () => {
    if (!playerStore.hasEngine() && !p.remote) {
      toast.show({ icon: 'alert', mutedIcon: true, text: 'The audio engine isn’t running.', meta: 'RELOAD THE PAGE' })
      return
    }
    playerStore.toggle()
  }
  const skipStyle = { width: skip, height: skip, fontSize: Math.round(skip * 0.6) }
  return (
    <div className={`pl-transport ${className ?? ''}`}>
      <button type="button" className="pl-skip" style={skipStyle} aria-label="Previous" title="Previous" disabled={empty} onClick={() => playerStore.prev()}>
        <Icon name="prev" filled />
      </button>
      <CookieButton
        size={play}
        iconSize={Math.round(play * 0.5)}
        playing={p.playing && !empty}
        icon={p.playing || p.buffering ? 'pauseF' : 'playF'}
        label={p.playing ? 'Pause' : 'Play'}
        disabled={empty}
        onClick={empty ? undefined : onPlay}
        loading={p.buffering && !empty}
      />
      <button type="button" className="pl-skip" style={skipStyle} aria-label="Next" title="Next" disabled={empty} onClick={() => playerStore.next()}>
        <Icon name="next" filled />
      </button>
    </div>
  )
}

type ToggleSize = 'md' | 'lg'

export function ShuffleToggle({ size }: { size?: ToggleSize }) {
  const p = usePlayer()
  const fixed = useFixedOrder()
  return <ModeToggle size={size} icon="shuffle" on={!fixed && p.shuffle} disabled={!!fixed} label={fixed ?? (p.shuffle ? 'Shuffle on' : 'Shuffle')} onClick={() => playerStore.toggleShuffle()} />
}

export function RepeatToggle({ size }: { size?: ToggleSize }) {
  const p = usePlayer()
  const fixed = useFixedOrder()
  const label = p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeating the queue' : 'Repeating this song'
  return (
    <ModeToggle size={size} icon={p.repeat === 'one' ? 'repeatOne' : 'repeat'} on={!fixed && p.repeat !== 'off'} disabled={!!fixed} label={fixed ?? label} onClick={() => playerStore.cycleRepeat()} />
  )
}

/** Lyrics: beside the carousel (desktop) / under the controls (phone); opens the player when closed. */
export function LyricsToggle({ size, text }: { size?: ToggleSize; text?: boolean }) {
  const ui = useNowPlayingUi()
  const empty = usePlayer().index < 0
  const on = ui.open && ui.view === 'lyrics'
  return <ModeToggle size={size} icon="lyrics" text={text ? 'Lyrics' : undefined} on={on} disabled={empty} label={on ? 'Hide lyrics' : 'Lyrics'} onClick={() => nowPlayingStore.toggleLyrics()} />
}

/** Reorder mode for the queue carousel. The DJ keeps no upcoming queue, so it's off while the DJ plays. */
export function ReorderToggle({ size, text }: { size?: ToggleSize; text?: boolean }) {
  const ui = useNowPlayingUi()
  const dj = useDjView().on
  const empty = usePlayer().index < 0
  const on = ui.open && ui.reorder
  return (
    <ModeToggle
      size={size}
      icon="reorder"
      text={text ? 'Reorder' : undefined}
      on={on}
      disabled={dj || empty}
      label={dj ? 'The DJ picks what plays next' : on ? 'Done reordering' : 'Reorder queue'}
      onClick={() => nowPlayingStore.toggleReorder()}
    />
  )
}

/**
 * The wavy seek bar, following the player's position. Its own component so that only this bar
 * re-renders as the song moves on, not the player surface around it. `idle` pins it at 0.
 */
export function PlayerSeek({ idle, ...rest }: Omit<ComponentProps<typeof WaveSeek>, 'position' | 'onSeek'> & { idle?: boolean }) {
  const position = usePlayerPosition()
  return <WaveSeek {...rest} position={idle ? 0 : position} onSeek={(s) => playerStore.seek(s)} />
}

/** Mute + thin volume slider. */
export function VolumeControl({ width = 72 }: { width?: number }) {
  const p = usePlayer()
  return (
    <span className="pl-volume">
      <button type="button" className="pl-mute" aria-label={p.muted ? 'Unmute' : 'Mute'} title={p.muted ? 'Unmute' : 'Mute'} onClick={() => playerStore.toggleMute()}>
        <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} />
      </button>
      <ThinSlider label="Volume" width={width} value={p.muted ? 0 : p.volume} onChange={(v) => playerStore.setVolume(v)} />
    </span>
  )
}

/** FLAC 16/44.1 · OPUS 160 — what's playing and from where. */
export function QualityPill({ track }: { track: Track }) {
  const p = usePlayer()
  const streamQuality = useSettings().streamQuality
  // streaming the Opus copy (Settings → Playback); a local / stored file is whatever the engine found
  const opus = p.source === 'drive' && streamQuality === 'opus' && !!track.mobile?.id
  const kind = opus ? 'OPUS' : 'FLAC'
  const detail = opus
    ? `${Number.parseInt(track.mobile?.bitrate ?? '', 10) || 160}`
    : `${track.flac?.bitDepth ?? 16}/${((track.flac?.sampleRate ?? 44100) / 1000).toString().replace(/\.0$/, '')}`
  const source = p.source === 'local' ? (isNative ? 'Stored on this phone' : 'Playing from your local folder') : p.source === 'drive' ? 'Streaming from Google Drive' : undefined
  return (
    <span className="pl-quality" title={source}>
      <b>{kind}</b>
      {detail}
    </span>
  )
}
