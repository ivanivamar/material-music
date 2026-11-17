/**
 * The Pelagic mark (Nov 2026 redesign; replaces the Porthole): one silhouette, a P that is a music note.
 * The P's bowl is a solid, tilted note head; the stem runs down from its left side and ends in a short
 * tapered flag. A small round hole in the head holds a white point of light (the sonar ping); on large,
 * animated marks the point swells and two thin rings of light ping out from it.
 * One fill (light blue → deep blue), a soft glow behind. Sizes ≤ 48 px drop the rings.
 * `tile` puts it on the dark rounded-square app-icon tile.
 */
import { useId } from 'react'
import { useMotion } from '../state/motion'

const MARK_D =
  'M40 100 V46 C40 28 52 15 70 14 C88 13 98 23 96 37 C94 51 80 60 64 61.5 C60 62 56 61.5 53 61 V95 ' +
  'C59 95 66 92 70.5 86 C74 81 74.5 76 72.5 71.5 A3 3 0 0 1 77.5 69.5 C82 75 83 83 80 90 ' +
  'C76 100 63 108 48 108.5 Q40 108.5 40 100 Z'
/** the ping: centre of the note head */
const PX = 69
const PY = 37.5
const HUE = 215

interface MarkProps {
  /** rendered width/height in px */
  size?: number
  /** dark rounded-square app-icon tile behind the mark */
  tile?: boolean
  /** pings + breathing point (default: on above 48 px, off with reduced motion) */
  animated?: boolean
  className?: string
}

export function PelagicMark({ size = 150, tile = false, animated, className }: MarkProps) {
  const id = useId().replace(/:/g, '')
  const motion = useMotion()
  const small = size <= 48
  const live = (animated ?? !small) && motion && !small
  const u = (n: string) => `${id}${n}`
  const glow = small ? undefined : `drop-shadow(0 0 ${size >= 80 ? 10 : 5}px oklch(0.7 0.13 ${HUE} / .55))`
  const svg = (
    <svg className={tile ? undefined : className} width={tile ? size * 0.82 : size} height={tile ? size * 0.82 : size} viewBox={tile ? '14 7 108 108' : '0 0 120 120'} aria-hidden style={{ display: 'block', flex: 'none', overflow: 'visible' }}>
      <defs>
        <linearGradient id={u('f')} gradientUnits="userSpaceOnUse" x1="30" y1="10" x2="70" y2="112">
          <stop offset="0" stopColor={`oklch(0.78 0.1 ${HUE})`} />
          <stop offset=".5" stopColor={`oklch(0.64 0.12 ${HUE})`} />
          <stop offset="1" stopColor={`oklch(0.42 0.11 ${HUE})`} />
        </linearGradient>
        <mask id={u('m')} maskUnits="userSpaceOnUse" x="-10" y="-10" width="140" height="140">
          <rect x="-10" y="-10" width="140" height="140" fill="#fff" />
          <circle cx={PX} cy={PY} r={small ? 11 : 9.5} fill="#000" />
        </mask>
      </defs>
      <g style={glow ? { filter: glow } : undefined}>
        <path d={MARK_D} fill={`url(#${u('f')})`} mask={`url(#${u('m')})`} />
      </g>
      {live &&
        [0, 1.6].map((d) => (
          <circle key={d} cx={PX} cy={PY} r="6" fill="none" stroke={`oklch(0.92 0.09 ${HUE})`} strokeWidth="1.2" strokeOpacity="0" style={{ filter: 'blur(.6px)' }}>
            <animate attributeName="r" values="6;44" dur="3.2s" begin={`${d}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".15 .6 .35 1" />
            <animate attributeName="stroke-opacity" values=".7;0" dur="3.2s" begin={`${d}s`} repeatCount="indefinite" />
          </circle>
        ))}
      <circle cx={PX} cy={PY} r={small ? 5.5 : 4.2} fill="#fff" style={{ filter: `drop-shadow(0 0 ${small ? 2 : 2.5}px oklch(0.9 0.12 ${HUE})) drop-shadow(0 0 2px #fff)` }}>
        {live && <animate attributeName="r" values="4.2;4.9;4.2" dur="3.2s" repeatCount="indefinite" />}
      </circle>
    </svg>
  )
  if (!tile) return svg
  return (
    <span
      className={`pm-tile ${className ?? ''}`}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      aria-hidden
    >
      {svg}
    </span>
  )
}

/** Old name, kept so existing imports keep working. */
export const PortholeMark = PelagicMark

interface WordmarkProps {
  size?: number
  className?: string
}

export function Wordmark({ size = 30, className }: WordmarkProps) {
  return (
    <span className={`t-wordmark ${className ?? ''}`} style={{ fontSize: size, lineHeight: 1 }}>
      Pelagic
    </span>
  )
}

/** Mark + wordmark stacked (sign-in, first-run, about). */
export function Lockup({ size = 150 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.21 }}>
      <PelagicMark size={size} />
      <Wordmark size={size * 0.2} />
    </div>
  )
}
