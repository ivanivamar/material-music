/**
 * The DJ sonar (design "DjV2"): range rings and a crosshair, a sweep that turns (5.1 s a turn on
 * standby, 3.6 s on air, 2.4 s while the DJ speaks), blips that light up as the sweep passes them,
 * a ping ring once a turn, and the centre dot that swells with the voice.
 *
 * All motion is CSS (one duration per mode); only the voice level is written per frame, as a CSS
 * variable, while the DJ speaks.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { introLevel, onFrame } from './live'

export type SonarMode = 'standby' | 'on' | 'speaking'

/** [angle from the top, clockwise; distance from the centre] */
const BLIPS: [number, number][] = [[38, 120], [96, 175], [150, 80], [205, 200], [262, 140], [318, 190], [20, 210], [242, 60], [128, 150]]
const RANGES = [60, 120, 180, 230]
const TURN: Record<SonarMode, number> = { standby: 360 / 70, on: 360 / 100, speaking: 360 / 150 }
const LABEL: Record<SonarMode, string> = { standby: 'STANDBY', on: 'ON AIR · LISTENING', speaking: 'SPEAKING · SWEEP 2.4 S' }

export function DjSonar({ mode, item, className }: { mode: SonarMode; item?: string | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const turn = TURN[mode]
  const blips = BLIPS.slice(0, mode === 'speaking' ? 9 : mode === 'on' ? 7 : 5)

  // the centre dot follows the voice (written as --lv, no re-render)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (mode !== 'speaking' || !item) {
      el.style.setProperty('--lv', '0')
      return
    }
    const off = onFrame(() => el.style.setProperty('--lv', introLevel(item).toFixed(3)))
    return () => {
      off()
      el.style.setProperty('--lv', '0')
    }
  }, [mode, item])

  return (
    <div ref={ref} className={`djs-sonar is-${mode} ${className ?? ''}`} role="img" aria-label="DJ sonar" style={{ '--turn': `${turn.toFixed(2)}s` } as CSSProperties}>
      <svg viewBox="0 0 560 560" width="560" height="560" aria-hidden>
        {RANGES.map((r, i) => (
          <circle key={r} cx="280" cy="300" r={r} fill="none" stroke="oklch(0.84 0.09 290)" strokeOpacity={0.22 - i * 0.04} strokeWidth="1" strokeDasharray={i === 3 ? '2 6' : undefined} />
        ))}
        <path d="M280 70 V530 M50 300 H510" stroke="oklch(0.84 0.09 290 / .08)" strokeWidth="1" />
        <path d="M40 300 H520" stroke="oklch(0.84 0.09 290 / .45)" strokeWidth="1.4" />
      </svg>
      <div className="djs-sweep" aria-hidden>
        <div className="djs-cone" />
      </div>
      <span className="djs-ping" aria-hidden />
      <span className="djs-ping is-2" aria-hidden />
      {blips.map(([a, d], i) => {
        const rad = (a * Math.PI) / 180
        return (
          <span
            key={i}
            className="djs-blip"
            aria-hidden
            style={{ left: 280 + Math.sin(rad) * d, top: 300 - Math.cos(rad) * d, animationDelay: `${(-(a / 360) * turn).toFixed(2)}s` }}
          />
        )
      })}
      <span className="djs-dot" aria-hidden />
      <div className="djs-sonar-l t-mono">{LABEL[mode]}</div>
    </div>
  )
}

/** The screen's backdrop: lilac wash, a breathing glow, slow contour rings and drifting specks. */
const RINGS = (() => {
  let s = 29
  const r = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const ring = (rad: number, seed: number, ph: number) => {
    const pts: string[] = []
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const rr = rad * (1 + 0.06 * Math.sin(3 * a + seed + ph) + 0.045 * Math.sin(5 * a - seed - ph))
      pts.push((i ? 'L' : 'M') + (390 + Math.cos(a) * rr * 1.2).toFixed(1) + ' ' + (500 + Math.sin(a) * rr).toFixed(1))
    }
    return pts.join(' ') + 'Z'
  }
  const rings = Array.from({ length: 14 }, (_, k) => {
    const A = ring(80 + k * 58, k * 1.5, 0)
    const B = ring((80 + k * 58) * 1.03, k * 1.5, 1.2)
    return { d: A, vals: `${A};${B};${A}`, o: Math.max(0.03, 0.12 - k * 0.007) }
  })
  const snow = Array.from({ length: 30 }, () => {
    const z = 1 + r() * 2
    return { left: `${(r() * 100).toFixed(1)}%`, top: `${(r() * 100).toFixed(1)}%`, width: z, height: z, '--o': (0.12 + r() * 0.35).toFixed(2), animationDuration: `${(10 + r() * 14).toFixed(1)}s`, animationDelay: `-${(r() * 20).toFixed(1)}s` } as CSSProperties
  })
  return { rings, snow }
})()

export function DjBackdrop() {
  return (
    <div className="djs-bg" aria-hidden>
      <div className="djs-wash" />
      <div className="djs-breathe" />
      <svg className="djs-rings" viewBox="0 0 1440 900" preserveAspectRatio="xMinYMid slice">
        {RINGS.rings.map((g, i) => (
          <path key={i} d={g.d} fill="none" stroke="oklch(0.85 0.06 290)" strokeOpacity={g.o} strokeWidth="1">
            <animate attributeName="d" dur="26s" repeatCount="indefinite" values={g.vals} />
          </path>
        ))}
      </svg>
      <div className="djs-snow">
        {RINGS.snow.map((st, i) => (
          <span key={i} style={st} />
        ))}
      </div>
    </div>
  )
}
