import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

/** See material.css (Buttons). `primary` = `filled` (kept for older call sites). */
export type ButtonVariant =
  | 'filled'
  | 'primary'
  | 'brand'
  | 'tonal'
  | 'secondary'
  | 'outlined'
  | 'outlined-ink'
  | 'ghost'
  | 'plain'
  | 'danger'
  | 'danger-outlined'
  | 'error'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** sm 32 · md 40 · lg 48 · xl 56 (detail-page actions) */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  icon?: IconName
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, children, className, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {icon && (
        <span className="btn-ic">
          <Icon name={icon} />
        </span>
      )}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> {
  icon: IconName
  /** accessible name (required: icon-only) */
  label: string
  /** sm 32 · md 40 · lg 48 (back / top-bar) · xl 56 (next to the xl actions) */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** standard = grey icon · strong = light icon (back arrows, top bars) · soft = faint fill · tonal = coral tint */
  variant?: 'standard' | 'strong' | 'soft' | 'tonal'
  shape?: 'round' | 'square'
  /** no hover fill — for dense bars (player bar) */
  bare?: boolean
  /** toggle state, e.g. Queue / Lyrics panels */
  pressed?: boolean
  /** filled icon glyph */
  filled?: boolean
  /** tooltip; defaults to `label`, pass null for none */
  title?: string | null
}

/** Round icon-only button. The one definition for close ✕, back ←, more ⋮ and toolbar icons. */
export function IconButton({ icon, label, size = 'md', variant = 'standard', shape = 'round', bare, pressed, filled, title, className, type = 'button', ...rest }: IconButtonProps) {
  const cls = ['ibtn', size !== 'md' && `ibtn-${size}`, variant !== 'standard' && `ibtn-${variant}`, shape === 'square' && 'ibtn-sq', bare && 'ibtn-bare', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} aria-label={label} title={title === null ? undefined : (title ?? label)} aria-pressed={pressed} {...rest}>
      <Icon name={icon} filled={filled} />
    </button>
  )
}

export type PlayState = 'playing' | 'paused' | 'buffering'

interface PlayButtonProps {
  state: PlayState
  onClick?: () => void
  /** 60 now-playing, 38 player bar, 54 Android */
  size?: number
}

export function PlayButton({ state, onClick, size = 60 }: PlayButtonProps) {
  const label = state === 'paused' ? 'Play' : 'Pause'
  // bumps on every press so the ripple rings re-mount and replay (same rings as the sidebar nav)
  const [ping, setPing] = useState(0)
  return (
    <button
      type="button"
      className={`playbtn is-${state}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      onClick={
        onClick &&
        (() => {
          setPing((n) => n + 1)
          onClick()
        })
      }
      aria-label={label}
      title={label}
    >
      {ping > 0 && (
        <span className="playbtn-pings" key={ping} aria-hidden>
          <span className="playbtn-ring pg-anim" />
          <span className="playbtn-ring playbtn-ring2 pg-anim" />
        </span>
      )}
      <Icon name={state === 'paused' ? 'playF' : 'pauseF'} />
      {state === 'buffering' && <span className="playbtn-spin pg-anim" aria-hidden />}
    </button>
  )
}
