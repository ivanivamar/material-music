import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
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

interface LikeButtonProps {
  liked: boolean
  onToggle: (next: boolean) => void
  size?: number
  className?: string
}

/** Heart: outline #55555A → solid white, pops to 1.28× on like. */
export function LikeButton({ liked, onToggle, size, className }: LikeButtonProps) {
  const [pop, setPop] = useState(0)
  return (
    <button
      type="button"
      className={['like', liked && 'is-liked', pop > 0 && 'is-pop', className].filter(Boolean).join(' ')}
      aria-pressed={liked}
      aria-label={liked ? 'Remove from Liked songs' : 'Add to Liked songs'}
      title={liked ? 'Remove from Liked songs' : 'Add to Liked songs'}
      style={size ? { fontSize: size } : undefined}
      onClick={(e) => {
        e.stopPropagation()
        if (!liked) setPop((n) => n + 1)
        onToggle(!liked)
      }}
    >
      {/* key re-mounts the svg so the pop animation replays */}
      <Icon key={pop} name={liked ? 'heartF' : 'heart'} />
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
