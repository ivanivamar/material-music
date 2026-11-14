/**
 * Bits shared by the full-screen player, its lyrics view, the player bar and the mini player.
 * What's playing / where from / how long comes from player.ts. The parts that follow the playback
 * position (seek, times, progress line) are their own small components, so only they re-render
 * several times a second, not the surface around them.
 */
import type { MouseEvent, ReactNode } from 'react'
import { IconButton, PlayButton, SeekBar, Slider, Waveform, formatTime, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer, usePlayerPosition } from '../state/player'
import { useDjView } from '../state/djUi'
import { DjButton } from '../dj/DjButton'
import { useProgress } from './player'

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

/** Play / pause, with a toast when there's nothing to play it on (no engine, not driving another device). */
export function usePlayPause() {
  const p = usePlayer()
  const toast = useToast()
  return () => {
    if (!playerStore.hasEngine() && !p.remote) {
      toast.show({ icon: 'alert', mutedIcon: true, text: 'The audio engine isn’t running.', meta: 'RELOAD THE PAGE' })
      return
    }
    playerStore.toggle()
  }
}

/** Shuffle / repeat aren't used by the DJ or a radio: why, for the disabled toggles. */
export function useFixedOrder(): string | null {
  const p = usePlayer()
  const dj = useDjView().on
  if (dj) return 'Not used by the DJ'
  if (p.context?.kind === 'radio') return 'Not used by the radio'
  return null
}

/** Shuffle · prev · play · next · repeat (handoff: 40px gaps, 76px play). `compact` = lyrics view (54px play, tighter gaps; shuffle and repeat stay). */
export function Transport({ compact }: { compact?: boolean }) {
  const p = usePlayer()
  const onPlay = usePlayPause()
  const fixed = useFixedOrder()
  const empty = p.index < 0
  const state = p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'
  const repeatLabel = p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'
  return (
    <div className={`np-transport ${compact ? 'is-compact' : ''}`}>
      <IconButton
        icon="shuffle"
        label={fixed ?? (p.shuffle ? 'Shuffle on' : 'Shuffle')}
        bare
        pressed={!fixed && p.shuffle}
        className={`np-mode ${!fixed && p.shuffle ? 'is-on' : ''} ${fixed ? 'is-dj-off' : ''}`}
        onClick={() => !fixed && playerStore.toggleShuffle()}
      />
      <IconButton icon="prev" label="Previous" bare filled className="np-skip" disabled={empty} onClick={() => playerStore.prev()} />
      <span className="np-play">
        <PlayButton size={compact ? 54 : 76} state={state} onClick={empty ? undefined : onPlay} />
      </span>
      <IconButton icon="next" label="Next" bare filled className="np-skip" disabled={empty} onClick={() => playerStore.next()} />
      <span className="np-repeat-wrap">
        <IconButton
          icon="repeat"
          label={fixed ?? repeatLabel}
          bare
          pressed={!fixed && p.repeat !== 'off'}
          className={`np-mode ${!fixed && p.repeat !== 'off' ? 'is-on' : ''} ${fixed ? 'is-dj-off' : ''}`}
          onClick={() => !fixed && playerStore.cycleRepeat()}
        />
        {!fixed && p.repeat === 'one' && (
          <span className="np-repeat-one" aria-hidden>
            1
          </span>
        )}
      </span>
    </div>
  )
}

/** Lyrics / Queue toggle buttons (outlined; solid white when on) + the DJ button. Phone order: Lyrics · DJ · Queue. */
export function ViewButtons({ size = 'md', phone = false }: { size?: 'md' | 'sm'; phone?: boolean }) {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const dj = useDjView().on
  const upcoming = Math.max(0, p.queue.length - p.index - 1)
  const ly = ui.open && ui.view === 'lyrics'
  const lyrics = (
    <button key="ly" type="button" className={`np-vbtn ${size === 'sm' ? 'is-sm' : ''} ${ly ? 'is-on' : ''}`} aria-pressed={ly} onClick={() => nowPlayingStore.toggleLyrics()}>
      <span className="np-vbtn-ic">
        <Icon name="lyrics" />
      </span>
      Lyrics
    </button>
  )
  const queue = dj ? (
    <span key="q" className="dj-off-wrap">
      <button type="button" className={`np-vbtn ${size === 'sm' ? 'is-sm' : ''} is-dj-off`} aria-disabled="true" title={phone ? 'Not available while the DJ plays' : undefined}>
        <span className="np-vbtn-ic">
          <Icon name="queue" />
        </span>
        Queue
      </button>
      {!phone && (
        <span className="dj-off-tip" role="tooltip">
          Not available while the DJ plays
        </span>
      )}
    </span>
  ) : (
    <button key="q" type="button" className={`np-vbtn ${size === 'sm' ? 'is-sm' : ''} ${ui.queue ? 'is-on' : ''}`} aria-pressed={ui.queue} onClick={() => nowPlayingStore.toggleQueue()}>
      <span className="np-vbtn-ic">
        <Icon name="queue" />
      </span>
      Queue
      <span className="np-vbtn-n">{String(upcoming).padStart(2, '0')}</span>
    </button>
  )
  const djb = <DjButton key="dj" variant={phone ? 'phone' : size === 'sm' ? 'ly' : 'np'} />
  return <>{phone ? [lyrics, djb, queue] : [lyrics, queue, djb]}</>
}

/** Mute + volume slider (1px line, no knob). */
export function Volume({ sliderClass, size }: { sliderClass: string; size?: 'sm' }) {
  const p = usePlayer()
  return (
    <>
      <IconButton icon={p.muted || p.volume === 0 ? 'mute' : 'volume'} label={p.muted ? 'Unmute' : 'Mute'} bare size={size} onClick={() => playerStore.toggleMute()} />
      <Slider
        label="Volume"
        variant="volume"
        knob={0}
        height={14}
        value={p.muted ? 0 : p.volume}
        onChange={(v) => playerStore.setVolume(v)}
        valueText={(v) => `${Math.round(v * 100)}%`}
        step={0.05}
        className={sliderClass}
      />
    </>
  )
}

/** The swell wave + "01:36   −02:35" under it (full-screen player). */
export function SwellSeek({ duration, playing }: { duration: number; playing: boolean }) {
  const position = usePlayerPosition()
  const frac = duration > 0 ? Math.min(1, position / duration) : 0
  return (
    <div className="np-seek">
      <Waveform progress={frac} duration={duration} playing={playing} onSeek={(f) => playerStore.seek(f * duration)} />
      <div className="np-times t-mono">
        <span className="is-now">{formatTime(position)}</span>
        <span>−{formatTime(Math.max(0, duration - position))}</span>
      </div>
    </div>
  )
}

/** Thin seek line + "01:36   04:11" (desktop lyrics view). */
export function LineSeek({ duration }: { duration: number }) {
  const position = usePlayerPosition()
  const frac = duration > 0 ? Math.min(1, position / duration) : 0
  return (
    <div className="np-ly-seek">
      <Slider
        label="Seek"
        value={frac}
        knob={7}
        height={13}
        onCommit={(v) => playerStore.seek(v * duration)}
        valueText={(v) => `${formatTime(v * duration)} of ${formatTime(duration)}`}
        step={duration > 0 ? 5 / duration : 0.02}
      />
      <div className="np-times t-mono">
        <span className="is-now">{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}

/** "01:36 ───●──── 04:11" (player bar `compact`, phone lyrics view). `idle` pins it at 0. */
export function TimeSeek({ duration, compact, idle }: { duration: number; compact?: boolean; idle?: boolean }) {
  const position = usePlayerPosition()
  return <SeekBar compact={compact} position={idle ? 0 : position} duration={duration} onSeek={(s) => playerStore.seek(s)} />
}

/** 1px glowing progress line (mini player); a DJ intro follows the live voice. */
export function ProgressLine({ className }: { className: string }) {
  const frac = useProgress()
  return (
    <span className={className} aria-hidden>
      <span style={{ width: `${frac * 100}%` }} />
    </span>
  )
}
