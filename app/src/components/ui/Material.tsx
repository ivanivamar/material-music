/**
 * Shared playback primitives kept from the Material pass, now in the original Pelagic look:
 * - CookieButton: the round light play / pause button (mix pages, Search…).
 * - LoadingShape: a thin turning ring.
 * - AlbumEq: three equaliser bars in the album colour.
 */
import { type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

export function CookieButton({
  size,
  playing,
  icon,
  iconSize,
  onClick,
  label,
  color = '#ededed',
  ink = '#0b0b0c',
  className,
  disabled,
  children,
  loading,
}: {
  size: number
  /** playing / paused: only the icon changes (original Pelagic round play button) */
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
      <span className={'mm-cookie-shape' + (playing && !loading ? ' is-on' : '')} style={{ background: color }} aria-hidden />
      <span className="mm-cookie-ic">{children ?? (icon && <Icon name={icon} filled size={iconSize ?? Math.round(size * 0.52)} />)}</span>
      {loading && <LoadingShape size={Math.round(size * 0.5)} className="mm-cookie-load" />}
    </button>
  )
}

/** Loading indicator: a thin turning ring (original Pelagic spinner). Colour = currentColor. */
export function LoadingShape({ size, className, color = 'currentColor' }: { size: number; className?: string; color?: string }) {
  return (
    <span className={'mm-load' + (className ? ' ' + className : '')} style={{ width: size, height: size, color }} role="progressbar" aria-label="Loading">
      <span className="mm-load-ring mm-anim" />
    </span>
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

