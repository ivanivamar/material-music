/**
 * Material Music app mark: icon 8a "Play & disc, dark" (design_handoff_app_icon_8a, final).
 * 100-unit grid: dark tile gradient #231b18 → #110c0a, play triangle #e55745 (corners rounded r 9),
 * amber ring #ffc65a r 21 and coral disc #fc8b5d r 15 at (43, 50), cream eighth note #fcf8f3.
 * Every layer but the tile has a soft drop shadow (0, 1.4) blur 1.3, black 55 %.
 * Used wherever the logo appears; the launcher / PWA / Android assets come from the same geometry.
 */
import { useId } from 'react'

interface MarkProps {
  size?: number
  /** in-app tile with 30 % corners (sidebar, top bar, sign-in); false = square full-bleed (launcher masks it) */
  tile?: boolean
  className?: string
}

export function AppMark({ size = 36, tile = true, className }: MarkProps) {
  const id = useId().replace(/:/g, '')
  const sh = `url(#s${id})`
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#231b18" />
          <stop offset="1" stopColor="#110c0a" />
        </linearGradient>
        <filter id={`s${id}`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.3" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      <rect width="100" height="100" rx={tile ? 30 : 0} fill={`url(#t${id})`} />
      <path d="M31.83 20.44Q24 16 24 25L24 75Q24 84 31.83 79.56L76.17 54.44Q84 50 76.17 45.56Z" fill="#e55745" filter={sh} />
      <circle cx="43" cy="50" r="21" fill="#ffc65a" filter={sh} />
      <circle cx="43" cy="50" r="15" fill="#fc8b5d" filter={sh} />
      <g transform="translate(43 49) scale(0.8)" fill="#fcf8f3" filter={sh}>
        <circle cx="-2.5" cy="9" r="6" />
        <rect x="-0.5" y="-12" width="4" height="21" rx="1" />
        <rect x="-0.5" y="-12" width="10" height="5.5" rx="1" />
      </g>
    </svg>
  )
}

export function Wordmark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.01em' }}>
      Material Music
    </span>
  )
}

/** Mark + wordmark stacked (sign-in, first run, about). */
export function Lockup({ size = 96 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.2 }}>
      <AppMark size={size} />
      <Wordmark size={size * 0.28} />
    </div>
  )
}
