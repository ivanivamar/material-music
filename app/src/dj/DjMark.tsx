/**
 * The DJ mark (handoff_dj §1) and the DJ icon. Gold on a dark tile; stands in for the cover while
 * the DJ talks.
 *
 *   idle      the two outer arcs breathe on a 9 s loop (large marks only)
 *   speaking  two sonar rings grow from the dot and fade (3.2 s, the second 1.6 s later); arcs 2–5
 *             brighten with the voice level and the halo grows with it
 *   reduced   no sonar or breathing: one static ring + the SPEAKING label
 */
import { useId, type CSSProperties } from 'react'
import { CONTOUR_SMOOTH, GRAIN, STONE } from '../design/textures'
import { useMotion } from '../state/motion'
import { arcPath, GOLD, GOLD_LIGHT, MARK_TILE, markGeometry, markRadius } from './mark'

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
}

export function DjMark({ size, speaking = false, level = 0, idle = false, radius, shadow, className, style, fluid }: DjMarkProps) {
  const motion = useMotion()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const g = markGeometry(size)
  const lvl = speaking ? Math.max(0, Math.min(1, level)) : 0
  const r = radius ?? markRadius(size)
  const labelSize = Math.max(9, Math.round(size * 0.022))
  return (
    <div
      className={`djm ${className ?? ''}`}
      style={{
        width: fluid ? '100%' : size,
        height: fluid ? '100%' : size,
        borderRadius: r,
        background: MARK_TILE,
        boxShadow: shadow ?? '0 0 0 1px rgba(255,255,255,0.08)',
        ...style,
      }}
      aria-hidden
    >
      {g.big && (
        <>
          <span className="djm-tex" style={{ backgroundImage: STONE, backgroundSize: '900px 900px', opacity: 0.1 }} />
          <span className="djm-tex" style={{ backgroundImage: CONTOUR_SMOOTH, backgroundSize: `${size * 2.4}px ${size * 1.5}px`, backgroundPosition: '62% 28%', opacity: 0.08 }} />
          <span className="djm-tex" style={{ backgroundImage: GRAIN, backgroundSize: '220px 220px', opacity: 0.07, mixBlendMode: 'screen' }} />
        </>
      )}
      <svg viewBox={g.viewBox} className={g.big ? 'djm-svg' : 'djm-svg is-small'}>
        <defs>
          <linearGradient id={`${id}h`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={GOLD} stopOpacity="0" />
            <stop offset="0.5" stopColor={GOLD} stopOpacity="0.75" />
            <stop offset="1" stopColor={GOLD} stopOpacity="0" />
          </linearGradient>
          <filter id={`${id}b`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={g.blur} />
          </filter>
        </defs>
        <line x1={g.horizon[0]} x2={g.horizon[1]} y1={g.cy} y2={g.cy} stroke={`url(#${id}h)`} strokeWidth={g.stroke} vectorEffect="non-scaling-stroke" />
        {g.arcs.map((a, i) => {
          const op = speaking && i > 0 ? Math.min(1, a.op * (1 + lvl * 1.4)) : a.op
          const breathe = idle && motion && g.big && i >= 3
          return (
            <path key={a.r} d={arcPath(g.cx, g.cy, a.r, true)} fill="none" stroke={GOLD} strokeOpacity={op} strokeWidth={g.stroke} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="djm-arc">
              {breathe && (
                <animate attributeName="stroke-opacity" values={`${op};${Math.min(1, op * 2.4)};${op}`} dur="9s" begin={`${-i * 1.5}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" />
              )}
            </path>
          )
        })}
        {g.reflections.map((a) => (
          <path key={`r${a.r}`} d={arcPath(g.cx, g.cy, a.r, false)} fill="none" stroke={GOLD} strokeOpacity={a.op} strokeWidth={g.stroke} vectorEffect="non-scaling-stroke" />
        ))}
        {speaking && motion
          ? [0, 1.6].map((b) => (
              <circle key={b} cx={g.cx} cy={g.cy} r={g.sonar[0]} fill="none" stroke={GOLD} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0}>
                <animate attributeName="r" values={`${g.sonar[0]};${g.sonar[1]}`} dur="3.2s" begin={`${b}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".15 .6 .35 1" />
                <animate attributeName="opacity" values="0.65;0" dur="3.2s" begin={`${b}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".15 .6 .35 1" />
              </circle>
            ))
          : speaking && <circle cx={g.cx} cy={g.cy} r={g.still} fill="none" stroke={GOLD} strokeOpacity={0.32} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <circle cx={g.cx} cy={g.cy} r={g.big ? g.halo + lvl * 3 : g.halo} fill={GOLD} opacity={0.4 + lvl * 0.3} filter={`url(#${id}b)`} className="djm-halo" />
        <circle cx={g.cx} cy={g.cy} r={g.dot} fill={GOLD_LIGHT} />
      </svg>
      {size >= 200 && (
        <>
          <span className="djm-label t-mono" style={{ fontSize: labelSize }}>
            PELAGIC DJ
          </span>
          {speaking && (
            <span className="djm-speaking t-mono" style={{ fontSize: labelSize }}>
              SPEAKING
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** DJ icon (24 grid): horizon, two arcs, the dot. `on`: glowing dot; `alive`: the outer arc breathes. */
export function DjIcon({ on = false, alive = false, dark = false, size = '1em' }: { on?: boolean; alive?: boolean; dark?: boolean; size?: number | string }) {
  const motion = useMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" style={{ display: 'block', overflow: 'visible', flex: 'none' }} aria-hidden>
      <path d="M2 16.5h20" strokeOpacity={0.45} />
      <path d="M7.5 16.5a4.5 4.5 0 0 1 9 0" />
      <path d="M3.5 16.5a8.5 8.5 0 0 1 17 0" strokeOpacity={on ? 1 : 0.55}>
        {alive && motion && <animate attributeName="stroke-opacity" values="0.35;1;0.35" dur="4.8s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" />}
      </path>
      <circle cx={12} cy={16.5} r={1.7} fill="currentColor" stroke="none" style={{ filter: on && !dark ? 'drop-shadow(0 0 3px rgba(226,186,96,0.95))' : 'none' }} />
    </svg>
  )
}

/** Voice level bars: a bell-shaped row whose heights follow the live level. */
export function LevelBars({ n, height, level, speaking, t, className }: { n: number; height: number; level: number; speaking: boolean; t: number; className?: string }) {
  const motion = useMotion()
  const bars = []
  for (let i = 0; i < n; i++) {
    const bell = Math.sin((Math.PI * (i + 0.5)) / n)
    let h = 2
    if (speaking) {
      h = motion
        ? 2 + height * bell * Math.min(1, (0.25 + 0.75 * level) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.83 + t * 6.1) * Math.cos(i * 0.29 - t * 3.7))))
        : 2 + height * 0.4 * bell * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)))
    }
    bars.push(<span key={i} style={{ height: Math.round(h), background: speaking ? 'rgba(226,186,96,0.9)' : 'rgba(226,186,96,0.3)' }} />)
  }
  return (
    <span className={`dj-bars ${className ?? ''}`} style={{ height }} aria-hidden>
      {bars}
    </span>
  )
}
