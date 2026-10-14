import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** md = 46 desktop, lg = 54 Android primary, sm = 36 compact */
  size?: 'sm' | 'md' | 'lg'
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

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** accessible name (required: icon-only) */
  label: string
  size?: 'sm' | 'md'
  shape?: 'round' | 'square'
  /** no hover fill — for dense bars (player bar) */
  bare?: boolean
  /** toggle state, e.g. Queue / Lyrics panels */
  pressed?: boolean
}

export function IconButton({ icon, label, size = 'md', shape = 'round', bare, pressed, className, type = 'button', ...rest }: IconButtonProps) {
  const cls = ['ibtn', size === 'sm' && 'ibtn-sm', shape === 'square' && 'ibtn-sq', bare && 'ibtn-bare', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <Icon name={icon} />
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
  return (
    <button
      type="button"
      className={`playbtn is-${state}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={state === 'paused' ? 'playF' : 'pauseF'} />
      {state === 'buffering' && <span className="playbtn-spin pg-anim" aria-hidden />}
    </button>
  )
}
