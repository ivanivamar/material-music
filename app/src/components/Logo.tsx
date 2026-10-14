/**
 * The "Aperture" mark: a ring cut by the horizon. Top half drawn at white 85–90%,
 * bottom half nearly gone (18–22%), a horizontal line fading out at both ends,
 * and a glowing dot below it.
 */
import { useId } from 'react'

interface ApertureProps {
  /** diameter of the ring in px */
  size?: number
  /** show the glowing dot (omit in tiny/app-icon renderings) */
  dot?: boolean
  className?: string
}

export function Aperture({ size = 150, dot = true, className }: ApertureProps) {
  const id = useId()
  // geometry in a 150-unit space, matching the handoff (ring 150, line overhang 28, dot at y≈115)
  const over = 28
  const vbX = -over
  const vbW = 150 + over * 2
  const scale = size / 150
  return (
    <svg
      className={className}
      width={vbW * scale}
      height={size}
      viewBox={`${vbX} 0 ${vbW} 150`}
      fill="none"
      aria-hidden
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`${id}-h`} x1={vbX} x2={150 + over} y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".25" stopColor="#fff" />
          <stop offset=".75" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* top half */}
      <path d="M0.75 75 A74.25 74.25 0 0 1 149.25 75" stroke="rgba(255,255,255,0.88)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* bottom half */}
      <path d="M0.75 75 A74.25 74.25 0 0 0 149.25 75" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* horizon */}
      <rect x={vbX} y={75} width={vbW} height={1 / scale} fill={`url(#${id}-h)`} />
      {dot && (
        <circle
          cx={75}
          cy={115}
          r={3 / Math.max(scale, 0.4)}
          fill="#fff"
          style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.75))' }}
        />
      )}
    </svg>
  )
}

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
      <Aperture size={size} />
      <Wordmark size={size * 0.2} />
    </div>
  )
}
