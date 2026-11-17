/**
 * Bits shared by the full-screen player, its lyrics view, the player bar and the mini player.
 * What's playing / where from / how long comes from player.ts. The parts that follow the playback
 * position (seek, times, progress line) are their own small components, so only they re-render
 * several times a second, not the surface around them.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
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

/**
 * Seek bars (Ivan): every bar the same height — the shape isn't the song's sound, so it doesn't
 * pretend to be. The only movement is a swell that travels through the bars around the playhead
 * while playing (a soft bump in place while paused), so you see where you are.
 */
const flatBars = (n: number) => Array.from({ length: n }, () => 1)

/**
 * Paints a waveform seek every frame (no React re-render): the playhead moves smoothly between the
 * player's position reports (a few a second, extrapolated with the clock), and the swell around it
 * follows the wall clock, so nothing steps. `sel` picks the bars inside `ref`.
 */
function useWaveFrames(
  ref: RefObject<HTMLElement | null>,
  o: { sel: string; wave: number[]; duration: number; position: number; playing: boolean; height: number; min: number; swell: number; spread: number; nearClass?: string },
) {
  const anchor = useRef({ pos: o.position, at: 0, playing: o.playing })
  const opts = useRef(o)
  useLayoutEffect(() => {
    opts.current = o
  })
  // before the paint below, so a jump (a seek while paused / loading) is drawn at once
  useLayoutEffect(() => {
    anchor.current = { pos: o.position, at: performance.now(), playing: o.playing }
  }, [o.position, o.playing])

  const paint = (now: number) => {
    const el = ref.current
    if (!el) return
    const { sel, wave, duration, playing, height, min, swell, spread, nearClass } = opts.current
    const a = anchor.current
    const pos = a.playing ? Math.min(duration, a.pos + Math.min(1.2, (now - a.at) / 1000)) : a.pos
    const N = wave.length
    const ph = duration > 0 ? Math.min(1, pos / duration) * N : 0
    const clock = now / 1000
    const bars = el.querySelectorAll<HTMLElement>(sel)
    for (let i = 0; i < bars.length && i < N; i++) {
      const near = Math.exp(-(((i - ph) / spread) ** 2))
      // one bump around the playhead, breathing as a whole while playing (no wave running through it,
      // which read as two parts growing and shrinking against each other)
      const h = Math.max(min, wave[i] * height * (1 + swell * near * (playing ? 0.7 + 0.3 * Math.sin(clock * 3.2) : 0.55)))
      const b = bars[i]
      b.style.height = `${h.toFixed(1)}px`
      const played = i < ph
      b.classList.toggle('is-played', played)
      if (nearClass) b.classList.toggle(nearClass, played && near > 0.3)
    }
  }
  // after every render (React may have reset the class names), then every frame while playing
  useLayoutEffect(() => paint(performance.now()))
  useEffect(() => {
    if (!o.playing) return
    let raf = 0
    const tick = (now: number) => {
      if (document.visibilityState === 'visible') paint(now)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.playing])
}

/**
 * Seeking feels immediate: the playhead and the time jump to where you clicked and stay there (the
 * engine's reports from before the jump are ignored) while the new spot loads; until the audio plays
 * again the bars around the playhead pulse (`seeking`). Clears when the player reports near the target,
 * or after 6 s.
 */
function useSeek(duration: number) {
  const position = usePlayerPosition()
  const { buffering, playing } = usePlayer()
  const [pending, setPending] = useState<{ t: number } | null>(null)
  const arrived = pending != null && Math.abs(position - pending.t) < 1.5 && !buffering
  // done once the player reports near the target (and isn't loading); give up after 6 s
  useEffect(() => {
    if (!pending) return
    const id = window.setTimeout(() => setPending(null), arrived ? 0 : 6000)
    return () => window.clearTimeout(id)
  }, [pending, arrived])
  const seek = (t: number) => {
    const to = Math.max(0, Math.min(duration, t))
    setPending({ t: to })
    playerStore.seek(to)
  }
  const shown = pending && !arrived ? pending.t : position
  return { shown, seeking: (!!pending && !arrived) || (buffering && playing), seek }
}

/**
 * Desktop seek (redesign, NowPlayingV2): 80 bars, 54px tall, a fixed shape per song. Played bars light up in
 * the now-playing hue and swell gently around the playhead while playing; hovering shows the time there
 * and lightens the stretch you'd jump over. Times under it: "01:36   −02:35".
 */
export function BarSeek({ duration, playing, bars = 80, height = 54 }: { duration: number; playing: boolean; bars?: number; height?: number }) {
  const { shown: position, seeking, seek } = useSeek(duration)
  const [hover, setHover] = useState<number | null>(null)
  const N = bars
  const wave = useMemo(() => flatBars(N), [N])
  const frac = duration > 0 ? Math.min(1, position / duration) : 0
  const ph = frac * N
  const barsRef = useRef<HTMLDivElement>(null)
  useWaveFrames(barsRef, { sel: '.np-bar', wave, duration, position, playing: playing && !seeking, height: height * 0.3, min: 3, swell: 1.6, spread: 4.5, nearClass: 'is-near' })
  const at = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }
  return (
    <div className="np-seek is-bars">
      <div
        ref={barsRef}
        className={`np-bars ${seeking ? 'is-seeking' : ''}`}
        style={{ height }}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
        onMouseMove={(e) => setHover(at(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => duration > 0 && seek(at(e) * duration)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seek(position + 5)
          else if (e.key === 'ArrowLeft') seek(position - 5)
        }}
      >
        {wave.map((_, i) => {
          // height, played and near are painted per frame (useWaveFrames)
          const hov = hover != null && i >= ph && i <= hover * N
          return <span key={i} className={`np-bar ${hov ? 'is-hov' : ''}`} />
        })}
        {hover != null && (
          <span className="np-bar-tip t-mono" style={{ left: `${hover * 100}%` }}>
            {formatTime(hover * duration)}
          </span>
        )}
      </div>
      <div className="np-times t-mono">
        <span className="is-now">{formatTime(position)}</span>
        <span>−{formatTime(Math.max(0, duration - position))}</span>
      </div>
    </div>
  )
}

/** "UP NEXT · IN 02:31" (time left in this song). */
export function UpNextIn({ duration }: { duration: number }) {
  const position = usePlayerPosition()
  return <>Up next · in {formatTime(Math.max(0, duration - position))}</>
}

/**
 * Player bar seek (redesign, PlayerBar): "01:36 ▁▃▅▂▆ 04:00": 64 short bars (16px), played in the hue,
 * swelling a little around the playhead while playing. Click to seek.
 */
export function TideSeek({ duration, playing, idle }: { duration: number; playing: boolean; idle?: boolean }) {
  const { shown: position, seeking, seek } = useSeek(duration)
  const N = 64
  const wave = useMemo(() => flatBars(N), [])
  const pos = idle ? 0 : position
  const barsRef = useRef<HTMLSpanElement>(null)
  useWaveFrames(barsRef, { sel: 'span', wave, duration, position: pos, playing: playing && !idle && !seeking, height: 5, min: 2, swell: 1.3, spread: 3.5, nearClass: 'is-near' })
  return (
    <div
      className={`pb-tide ${seeking && !idle ? 'is-seeking' : ''}`}
      role="slider"
      tabIndex={idle ? -1 : 0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(pos)}
      aria-valuetext={`${formatTime(pos)} of ${formatTime(duration)}`}
      onClick={(e) => {
        const bars = (e.currentTarget.querySelector('.pb-tide-bars') as HTMLElement).getBoundingClientRect()
        const f = Math.max(0, Math.min(1, (e.clientX - bars.left) / bars.width))
        if (!idle && duration > 0) seek(f * duration)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') seek(position + 5)
        else if (e.key === 'ArrowLeft') seek(position - 5)
      }}
    >
      <span className="pb-tide-t">{formatTime(pos)}</span>
      <span ref={barsRef} className="pb-tide-bars">
        {wave.map((_, i) => (
          <span key={i} />
        ))}
      </span>
      <span className="pb-tide-t">{formatTime(duration)}</span>
    </div>
  )
}
