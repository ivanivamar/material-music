/**
 * Material redesign primitives (handoff helpers cookieEl / wave / eq):
 * - CookieButton: the album-coloured play button; a circle when paused, a slowly turning soft
 *   9-sided cookie while playing (clip-path morph 520ms, the shape spring easing).
 * - WaveProgress: the wavy progress line (played part wavy and moving, the rest a flat track).
 * - AlbumEq: three equaliser bars in the album colour.
 * Colours default to the album accent (--album / --on-album / --track); pass others for DJ etc.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
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
