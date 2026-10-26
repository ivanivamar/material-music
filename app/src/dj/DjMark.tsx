/**
 * The DJ mark and DJ icon (Material 3 Expressive redesign, DJMaterial.dc.html):
 * scalloped violet dial knob on a deep violet tile with 5 detents and a warm-gold active detent.
 */
import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { onFrame } from './live'
import { useMotion } from '../state/motion'
import { knobPath, MARK_TILE, markRadius } from './mark'

export interface DjMarkProps {
  size: number
  speaking?: boolean
  /** 0..1 voice loudness */
  level?: number
  idle?: boolean
  radius?: number
  shadow?: string
  className?: string
  style?: CSSProperties
  /** fill the parent instead of a fixed size (size still picks the detail level) */
  fluid?: boolean
  /** DJ running, not speaking */
  onAir?: boolean
  /**
   * Live voice level, read every frame and written straight into a CSS variable (`--lvl`), so the
   * mark doesn't re-render 30 times a second. Wins over `level`.
   */
  getLevel?: () => number
}

const DIAL_ANGLES = [-55, -27.5, 0, 30, 55]
const KNOB_SM = knobPath(8, 0.07, 38, 50, 50)
const KNOB_LG = knobPath(9, 0.06, 30, 50, 54)
const ICON_KNOB = knobPath(8, 0.08, 48, 50, 50)

export function DjMark({ size, speaking = false, level = 0, radius, shadow, className, style, fluid, getLevel }: DjMarkProps) {
  const motion = useMotion()
  const lvl = speaking ? Math.max(0, Math.min(1, level)) : 0
  const r = radius ?? markRadius(size)
  const sm = size <= 44
  const labelSize = Math.max(10, Math.round(size * 0.024))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el || !getLevel || !speaking) return
    let last = -1
    const off = onFrame(() => {
      const v = Math.round(Math.max(0, Math.min(1, getLevel())) * 50) / 50
      if (v === last) return
      last = v
      el.style.setProperty('--lvl', String(v))
    })
    return () => {
      off()
      el.style.setProperty('--lvl', '0')
    }
  }, [getLevel, speaking])

  const defaultShadow =
    size > 100
      ? '0 32px 64px -20px rgba(0,0,0,0.85), inset 0 0 0 1px oklch(0.55 0.09 290 / 0.35)'
      : 'inset 0 0 0 1px oklch(0.55 0.09 290 / 0.35)'

  return (
    <div
      ref={rootRef}
      className={`djm ${speaking ? 'is-speaking' : ''} ${className ?? ''}`}
      style={{
        ['--lvl' as string]: getLevel ? 0 : lvl,
        width: fluid ? '100%' : size,
        height: fluid ? '100%' : size,
        borderRadius: r,
        background: MARK_TILE,
        boxShadow: shadow ?? defaultShadow,
        ...style,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="djm-svg">
        {size > 64 &&
          DIAL_ANGLES.map((a) => {
            const rad = ((a - 90) * Math.PI) / 180
            const x = 50 + 40 * Math.cos(rad)
            const y = 54 + 40 * Math.sin(rad)
            const active = a === 30
            return (
              <circle
                key={a}
                cx={x}
                cy={y}
                r={active ? 3.2 : 2.2}
                fill={active ? 'oklch(0.93 0.05 80)' : 'oklch(0.62 0.10 290)'}
              />
            )
          })}
        <g
          className="djm-knob"
          style={{
            transformOrigin: sm ? '50px 50px' : '50px 54px',
            animation: motion ? 'dj-knob 9s infinite' : 'none',
          }}
        >
          <path d={sm ? KNOB_SM : KNOB_LG} fill="oklch(0.84 0.09 290)" />
          <rect
            x={sm ? 46 : 47.2}
            y={sm ? 20 : 30}
            width={sm ? 8 : 5.6}
            height={sm ? 20 : 15}
            rx={sm ? 4 : 2.8}
            fill="oklch(0.28 0.08 292)"
          />
        </g>
      </svg>
      {size >= 200 && (
        <>
          <span className="djm-label" style={{ fontSize: labelSize }}>
            MATERIAL MUSIC DJ
          </span>
          {speaking && (
            <span className="djm-speaking" style={{ fontSize: labelSize }}>
              SPEAKING
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** DJ icon (scalloped dial knob with indicator slot cutout). */
export function DjIcon({ on = false, alive = false, size = '1em' }: { on?: boolean; alive?: boolean; dark?: boolean; size?: number | string }) {
  const motion = useMotion()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const maskId = `dji-${id}`
  const spin = (on || alive) && motion
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible', flex: 'none' }} aria-hidden>
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <rect x="43" y="12" width="14" height="30" rx="7" fill="black" />
        </mask>
      </defs>
      <g
        mask={`url(#${maskId})`}
        style={{
          transformOrigin: '50px 50px',
          animation: spin ? 'dj-knob 9s infinite' : 'none',
          transform: spin ? undefined : 'rotate(24deg)',
        }}
      >
        <path d={ICON_KNOB} fill="currentColor" />
      </g>
    </svg>
  )
}

/** Voice level bars: a bell-shaped row whose heights follow the live level. */
export function LevelBars({ n, height, level, speaking, t, className }: { n: number; height: number; level: number; speaking: boolean; t: number; className?: string }) {
  const motion = useMotion()
  const bars = []
  for (let i = 0; i < n; i++) {
    const bell = Math.sin((Math.PI * (i + 0.5)) / n)
    let h = 3
    if (speaking) {
      h = motion
        ? 3 + height * bell * Math.min(1, (0.25 + 0.75 * level) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.83 + t * 6.1) * Math.cos(i * 0.29 - t * 3.7))))
        : 3 + height * 0.4 * bell * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)))
    }
    bars.push(
      <span
        key={i}
        className={speaking ? 'is-on' : ''}
        style={{ height: height + 3, transform: `scaleY(${(Math.round(h * 2) / 2 / (height + 3)).toFixed(3)})` }}
      />,
    )
  }
  return (
    <span className={`dj-bars ${className ?? ''}`} style={{ height }} aria-hidden>
      {bars}
    </span>
  )
}
