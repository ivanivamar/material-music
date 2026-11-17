/**
 * Atmosphere — the layers behind every screen (pointer-events: none). Nov 2026 redesign:
 *   1. Wash: a soft glow in the now-playing album's hue (--h) from the top of the screen
 *   2. Contour rings — 13 organic rings around a point at the top right, tinted with --h; each slowly
 *      morphs on a 26s loop (SMIL; static with reduced motion, on the phone and while paused)
 *   3. Marine snow particles (Off / 6 / 15 / 32)
 * The stone texture, grain and drifting light pools are gone (they read as fog). `pools` can still
 * bring the pools back for a single screen.
 *
 * Positioned absolute/inset 0: place inside a `position: relative` container
 * (or use `fixed` for a full-viewport background).
 *
 * Phone layout ("lite", also the Android app): contours cross-fade between two static drawings on
 * the GPU instead of the SMIL morph, at most 6 snowflakes without blur, grain without blending.
 * `paused` freezes everything (the shell's layer while the full-screen player covers it).
 */
import { memo, useMemo } from 'react'
import { particleCounts, type ParticleSetting } from '../design/tokens'
import { useSettings } from '../state/settings'
import { useMotion } from '../state/motion'
import { useIsPhone } from '../state/viewport'

interface AtmosphereProps {
  /** override the user's particle setting (e.g. a small preview tile) */
  particles?: ParticleSetting
  /** override the user's texture setting */
  texture?: boolean
  /** show the two drifting light pools (default false since the redesign) */
  pools?: boolean
  /** seed so different screens don't share the exact same flake layout */
  seed?: number
  fixed?: boolean
  /** freeze all animation (e.g. while covered by another full-screen layer) */
  paused?: boolean
  className?: string
}

interface Flake {
  left: number
  top: number
  size: number
  bokeh: boolean
  opacity: number
  duration: number
  delay: number
}

/** Same LCG as the handoff so layouts match the reference. */
function makeFlakes(n: number, seed: number): Flake[] {
  let s = seed
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
  const out: Flake[] = []
  for (let i = 0; i < n; i++) {
    rnd()
    const bokeh = false
    const size = 1 + rnd() * 2
    const duration = 16 + rnd() * 22
    const left = rnd() * 100
    const top = rnd() * 85
    const delay = -rnd() * duration
    const opacity = 0.12 + rnd() * 0.35
    out.push({ left, top, size, bokeh, opacity, duration, delay })
  }
  return out
}

/** One organic ring (65 points) around (cx, cy): a wobble of three sine terms; `ph` shifts the wobble. */
function ring(cx: number, cy: number, rad: number, seed: number, ph: number) {
  const pts: string[] = []
  for (let i = 0; i < 65; i++) {
    const a = (i / 64) * Math.PI * 2
    const rr = rad * (1 + 0.075 * Math.sin(3 * a + seed + ph) + 0.045 * Math.sin(5 * a - seed - ph * 1.4) + 0.02 * Math.sin(8 * a + ph * 2))
    pts.push(`${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr * 1.3).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`)
  }
  return pts.join(' ') + 'Z'
}

/** 13 rings around a point at the top right of a 1200×900 field (cover-scaled), drawn once. */
const RINGS = Array.from({ length: 13 }, (_, k) => {
  const rad = 55 + k * 60
  const sd = k * 1.37
  return { a: ring(960, 120, rad, sd, 0), b: ring(960, 120, rad * 1.04, sd, 1.3), op: Math.max(0.035, 0.13 - k * 0.007) }
})

/** Contour lines in the now-playing hue; `live` morphs each ring slowly (26 s). */
function Contours({ live }: { live: boolean }) {
  return (
    <svg className="atm-rings" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {RINGS.map((r, i) => (
        <path key={i} d={r.a} fill="none" stroke="currentColor" strokeOpacity={r.op} strokeWidth="1" vectorEffect="non-scaling-stroke">
          {live && <animate attributeName="d" dur="26s" repeatCount="indefinite" values={`${r.a};${r.b};${r.a}`} />}
        </path>
      ))}
    </svg>
  )
}

/** Pelagic textures and particles, controlled by the user's Atmosphere settings. */
export const AtmosphereLegacy = memo(function AtmosphereLegacy({
  particles,
  texture,
  pools = false,
  seed = 17,
  fixed = false,
  paused = false,
  className,
}: AtmosphereProps) {
  const settings = useSettings()
  const motion = useMotion()
  const lite = useIsPhone()
  const showTexture = texture ?? settings.texture
  const wanted = motion ? particleCounts[particles ?? settings.particles] : 0
  const count = lite ? Math.min(wanted, particleCounts.few) : wanted
  const flakes = useMemo(() => makeFlakes(count, seed), [count, seed])

  return (
    <div className={`atm ${fixed ? 'atm-fixed' : ''} ${lite ? 'atm-lite' : ''} ${paused ? 'atm-paused' : ''} ${className ?? ''}`} aria-hidden>
      <div className="atm-wash" />
      {showTexture && <Contours live={motion && !paused && !lite} />}
      {motion && pools && (
        <>
          <div className="atm-pool atm-pool-a pg-anim pg-snow" />
          <div className="atm-pool atm-pool-b pg-anim pg-snow" />
        </>
      )}
      {count > 0 && (
        <div className="atm-snow pg-snow">
          {flakes.map((f, i) => (
            <div
              key={i}
              className="atm-flake pg-anim"
              style={{
                left: `${f.left}%`,
                top: `${f.top}%`,
                animationDuration: `${f.duration}s`,
                animationDelay: `${f.delay}s`,
              }}
            >
              <div
                className={f.bokeh ? 'atm-dot atm-bokeh' : 'atm-dot'}
                style={{ width: f.size, height: f.size, opacity: f.opacity }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export const Atmosphere = AtmosphereLegacy
