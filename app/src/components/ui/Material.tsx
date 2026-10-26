/**
 * Material redesign primitives (handoff helpers cookieEl / wave / eq):
 * - CookieButton: the album-coloured play button; a circle when paused, a slowly turning soft
 *   9-sided cookie while playing (clip-path morph 520ms, the shape spring easing).
 * - WaveProgress: the wavy progress line (played part wavy and moving, the rest a flat track).
 * - AlbumEq: three equaliser bars in the album colour.
 * Colours default to the album accent (--album / --on-album / --track); pass others for DJ etc.
 */
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type React from 'react'
import { Icon, type IconName } from '../../design/icons'
import { SHAPE_PAUSED, SHAPE_PLAYING } from '../../design/shapes'

export function CookieButton({
  size,
  playing,
  icon,
  iconSize,
  onClick,
  label,
  color = 'var(--album)',
  ink = 'var(--on-album)',
  className,
  disabled,
  children,
}: {
  size: number
  /** playing → cookie + slow turn; paused → circle */
  playing: boolean
  icon?: IconName
  iconSize?: number
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  label: string
  color?: string
  ink?: string
  className?: string
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className={'mm-cookie' + (className ? ' ' + className : '')}
      style={{ width: size, height: size, color: ink } as CSSProperties}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
    >
      <span
        className={'mm-cookie-shape mm-shape' + (playing ? ' is-on mm-anim' : '')}
        style={{ background: color, clipPath: playing ? SHAPE_PLAYING : SHAPE_PAUSED }}
        aria-hidden
      />
      <span className="mm-cookie-ic">{children ?? (icon && <Icon name={icon} filled size={iconSize ?? Math.round(size * 0.52)} />)}</span>
    </button>
  )
}

const waveMask = (hh: number) => {
  const m = hh / 2
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='${hh}'><path d='M0 ${m} Q6 ${m - 6} 12 ${m} T24 ${m}' fill='none' stroke='black' stroke-width='3'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function WaveProgress({
  fraction,
  moving,
  height = 12,
  color = 'var(--album)',
  track = 'var(--track)',
  thumb = true,
  className,
}: {
  /** 0..1 */
  fraction: number
  /** animate the wave (playing) */
  moving: boolean
  height?: number
  color?: string
  track?: string
  thumb?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  const mask = waveMask(height)
  const m = height / 2
  return (
    <div className={'mm-wave' + (className ? ' ' + className : '')} style={{ height: height + 4 }} aria-hidden>
      <div
        className={'mm-wave-played' + (moving ? ' mm-anim is-moving' : '')}
        style={{ width: pct + '%', height, background: color, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: `24px ${height}px`, maskSize: `24px ${height}px` }}
      />
      <div className="mm-wave-track" style={{ left: `calc(${pct}% + 8px)`, top: m, background: track }} />
      {thumb && <div className="mm-wave-thumb" style={{ left: `calc(${pct}% - 2px)`, height: height + 6, background: color }} />}
    </div>
  )
}

export function AlbumEq({ color = 'var(--album-eq)', height = 14, on = true }: { color?: string; height?: number; on?: boolean }) {
  return (
    <span className="mm-eq" style={{ height }} aria-hidden>
      {[0, 1, 2].map((j) => (
        <span key={j} className={on ? 'mm-anim' : ''} style={{ background: color, animationDelay: `${j * -0.28}s`, transform: on ? undefined : 'scaleY(.35)' }} />
      ))}
    </span>
  )
}

/** Pointer + keyboard driver shared by the wave seek bar and the thin volume bar. */
function useDrag(onValue: (f: number) => void, onDone?: (f: number) => void) {
  const at = (el: HTMLElement, x: number) => {
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (x - r.left) / r.width))
  }
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button > 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      onValue(at(e.currentTarget, e.clientX))
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) onValue(at(e.currentTarget, e.clientX))
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      onDone?.(at(e.currentTarget, e.clientX))
    },
  }
}

const clock = (s: number) => {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Wavy seek bar (player bar, Now playing): drag or click to seek, arrows ±5 s.
 * While dragging the wave follows the pointer; the seek happens on release.
 */
export function WaveSeek({
  position,
  duration,
  playing,
  onSeek,
  height = 12,
  times = true,
  className,
}: {
  position: number
  duration: number
  playing: boolean
  onSeek: (s: number) => void
  height?: number
  times?: boolean
  className?: string
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const f = drag ?? (duration > 0 ? position / duration : 0)
  const handlers = useDrag(
    (v) => duration > 0 && setDrag(v),
    (v) => {
      setDrag(null)
      if (duration > 0) onSeek(v * duration)
    },
  )
  return (
    <div className={'mm-seek' + (className ? ' ' + className : '')}>
      {times && <span className="mm-seek-t">{clock(f * duration)}</span>}
      <div
        className="mm-seek-hit"
        role="slider"
        tabIndex={duration > 0 ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(f * duration)}
        aria-valuetext={`${clock(f * duration)} of ${clock(duration)}`}
        {...handlers}
        onKeyDown={(e) => {
          if (!duration) return
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault()
            onSeek(Math.max(0, Math.min(duration, position + (e.key === 'ArrowRight' ? 5 : -5))))
          }
        }}
      >
        <WaveProgress fraction={f} moving={playing && drag === null} height={height} />
      </div>
      {times && <span className="mm-seek-t is-end">{clock(duration)}</span>}
    </div>
  )
}

/** Thin 6px volume bar (player bar). */
export function ThinSlider({ value, onChange, label, width = 72 }: { value: number; onChange: (v: number) => void; label: string; width?: number }) {
  const handlers = useDrag(onChange)
  return (
    <div
      className="mm-thin"
      style={{ width }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      {...handlers}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(1, value + 0.05))
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - 0.05))
      }}
    >
      <div className="mm-thin-track">
        <div className="mm-thin-fill" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

/** Shuffle / repeat style toggle: off = plain 46px icon, on = 34px album-colour rounded square. */
export function ModeToggle({ icon, on, label, disabled, onClick, badge }: { icon: IconName; on: boolean; label: string; disabled?: boolean; onClick: () => void; badge?: string }) {
  return (
    <span className="mm-mode-slot">
      <button type="button" className={`mm-mode ${on ? 'is-on' : ''} ${disabled ? 'is-off' : ''}`} aria-pressed={on} aria-label={label} title={label} onClick={() => !disabled && onClick()}>
        <Icon name={icon} />
        {badge && <span className="mm-mode-badge">{badge}</span>}
      </button>
    </span>
  )
}
