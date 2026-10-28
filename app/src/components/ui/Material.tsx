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
import { SHAPE_PAUSED, SHAPE_PLAYING, LOADING_SHAPES } from '../../design/shapes'

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
  loading,
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
  /** buffering: the icon gives way to the M3 Expressive loading indicator (a morphing, turning shape) */
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={'mm-cookie' + (loading ? ' is-loading' : '') + (className ? ' ' + className : '')}
      aria-busy={loading || undefined}
      style={{ width: size, height: size, color: ink } as CSSProperties}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
    >
      <span
        className={'mm-cookie-shape mm-shape' + (playing && !loading ? ' is-on mm-anim' : '')}
        style={{ background: color, clipPath: playing && !loading ? SHAPE_PLAYING : SHAPE_PAUSED }}
        aria-hidden
      />
      <span className="mm-cookie-ic">{children ?? (icon && <Icon name={icon} filled size={iconSize ?? Math.round(size * 0.52)} />)}</span>
      {loading && <LoadingShape size={Math.round(size * 0.5)} className="mm-cookie-load" />}
    </button>
  )
}

/**
 * M3 Expressive loading indicator: one shape that keeps morphing through the expressive set
 * (soft burst → pentagon → oval → sunny → 4-leaf clover → 9-cookie) while it turns. Colour = currentColor.
 */
let loadKf = false
function ensureLoadKeyframes() {
  if (loadKf || typeof document === 'undefined') return
  loadKf = true
  const seq = [...LOADING_SHAPES, LOADING_SHAPES[0]]
  const steps = seq.map((sh, i) => `${((i / (seq.length - 1)) * 100).toFixed(2)}% { clip-path: ${sh}; }`).join('\n')
  const el = document.createElement('style')
  el.dataset.mm = 'loading-indicator'
  el.textContent = `@keyframes mm-load-morph {\n${steps}\n}`
  document.head.appendChild(el)
}

export function LoadingShape({ size, className, color = 'currentColor' }: { size: number; className?: string; color?: string }) {
  ensureLoadKeyframes()
  return (
    <span className={'mm-load' + (className ? ' ' + className : '')} style={{ width: size, height: size }} role="progressbar" aria-label="Loading">
      <span className="mm-load-shape mm-anim" style={{ background: color, clipPath: LOADING_SHAPES[0] }} />
    </span>
  )
}

const waveMask = (hh: number) => {
  const m = hh / 2
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='${hh}'><path d='M-12 ${m} Q-6 ${m + 6} 0 ${m} T12 ${m} T24 ${m} T36 ${m}' fill='none' stroke='black' stroke-width='3' stroke-linecap='round'/></svg>`
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
  below = false,
  className,
}: {
  position: number
  duration: number
  playing: boolean
  onSeek: (s: number) => void
  height?: number
  times?: boolean
  /** times under the wave: position left, remaining right (Now playing) */
  below?: boolean
  className?: string
}) {
  const [drag, setDrag] = useState<number | null>(null)
  /** mouse hover: where the pointer is (0..1), for the time tooltip */
  const [hover, setHover] = useState<number | null>(null)
  const f = drag ?? (duration > 0 ? position / duration : 0)
  const tip = drag ?? hover
  const handlers = useDrag(
    (v) => duration > 0 && setDrag(v),
    (v) => {
      setDrag(null)
      if (duration > 0) onSeek(v * duration)
    },
  )
  const hit = (
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
      onPointerMove={(e) => {
        handlers.onPointerMove(e)
        if (e.pointerType !== 'mouse' || !duration) return
        const r = e.currentTarget.getBoundingClientRect()
        setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
      }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (!duration) return
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          onSeek(Math.max(0, Math.min(duration, position + (e.key === 'ArrowRight' ? 5 : -5))))
        }
      }}
    >
      <WaveProgress fraction={f} moving={playing && drag === null} height={height} />
      {tip !== null && duration > 0 && (
        <span className="mm-seek-tip" style={{ left: `${tip * 100}%` }} aria-hidden>
          {clock(tip * duration)}
        </span>
      )}
    </div>
  )
  if (below)
    return (
      <div className={'mm-seek is-below' + (className ? ' ' + className : '')}>
        {hit}
        <div className="mm-seek-row">
          <span>{clock(f * duration)}</span>
          <span>-{clock(Math.max(0, duration - f * duration))}</span>
        </div>
      </div>
    )
  return (
    <div className={'mm-seek' + (className ? ' ' + className : '')}>
      {times && <span className="mm-seek-t">{clock(f * duration)}</span>}
      {hit}
      {times && <span className="mm-seek-t is-end">{clock(duration)}</span>}
    </div>
  )
}

/** Thin 6px volume bar (player bar; `knob` = with a 16px handle, Now playing). */
export function ThinSlider({ value, onChange, label, width = 72, knob = false }: { value: number; onChange: (v: number) => void; label: string; width?: number; knob?: boolean }) {
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
        {knob && <div className="mm-thin-knob" style={{ left: `${value * 100}%` }} />}
      </div>
    </div>
  )
}

/**
 * M3 value slider: 8px track, 4px handle with a gap ring, optional leading icon and trailing value.
 * Colours come from CSS vars (`--vs-accent`, `--vs-handle`, `--vs-track`, `--vs-gap`) so a page can
 * tint it (DJ = violet) through its `className`.
 */
export function ValueSlider({
  value,
  onChange,
  label,
  valueText,
  shown,
  icon,
  disabled,
  step = 0.05,
  className,
}: {
  /** 0..1 */
  value: number
  onChange: (v: number) => void
  label: string
  /** aria-valuetext */
  valueText?: string
  /** trailing value label (omit for none) */
  shown?: React.ReactNode
  icon?: IconName
  disabled?: boolean
  step?: number
  className?: string
}) {
  const snap = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100
  const handlers = useDrag((v) => !disabled && onChange(snap(v)))
  const pct = `${value * 100}%`
  return (
    <div className={`mm-vslider ${disabled ? 'is-off' : ''} ${className ?? ''}`}>
      {icon && <Icon name={icon} />}
      <div
        className="mm-vslider-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={valueText}
        aria-disabled={disabled}
        {...handlers}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(snap(value - step))
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(snap(value + step))
        }}
      >
        <span className="mm-vslider-line">
          <span className="mm-vslider-fill" style={{ width: pct }} />
        </span>
        <span className="mm-vslider-knob" style={{ left: pct }} />
      </div>
      {shown != null && <span className="mm-vslider-val">{shown}</span>}
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
