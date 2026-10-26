/**
 * Atmosphere — the layers behind every screen (pointer-events: none).
 *   1. Stone fractal-noise texture, 900px tile, .09
 *   2. Contour rings, .075 — breathe in place on a 26s loop (static with reduced motion)
 *   3. Grain, 220px, .07, mix-blend-mode: screen
 *   4. Light pools (two slow radial drifts) + marine snow particles (Off / 6 / 15 / 32)
 *
 * Positioned absolute/inset 0: place inside a `position: relative` container
 * (or use `fixed` for a full-viewport background).
 *
 * Phone layout ("lite", also the Android app): contours cross-fade between two static drawings on
 * the GPU instead of the SMIL morph, at most 6 snowflakes without blur, grain without blending.
 * `paused` freezes everything (the shell's layer while the full-screen player covers it).
 */
import { memo, useMemo } from 'react'
import { CONTOUR_LIVE, CONTOUR_SMOOTH, CONTOUR_SMOOTH_B, GRAIN, STONE } from '../design/textures'
import { particleCounts, type ParticleSetting } from '../design/tokens'
import { useSettings } from '../state/settings'
import { useMotion } from '../state/motion'
import { useIsPhone } from '../state/viewport'
import './atmosphere.css'

interface AtmosphereProps {
  /** override the user's particle setting (e.g. a small preview tile) */
  particles?: ParticleSetting
  /** override the user's texture setting */
  texture?: boolean
  /** show the two drifting light pools (default true) */
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
    const bokeh = rnd() < 0.25
    const size = bokeh ? 4 + rnd() * 5 : 1.4 + rnd() * 2.2
    const duration = 16 + rnd() * 22
    const left = rnd() * 100
    const top = rnd() * 85
    const delay = -rnd() * duration
    const opacity = bokeh ? 0.08 + rnd() * 0.12 : 0.25 + rnd() * 0.4
    out.push({ left, top, size, bokeh, opacity, duration, delay })
  }
  return out
}

/** Pelagic textures + particles (retired with the Material redesign; kept for reference). */
export const AtmosphereLegacy = memo(function AtmosphereLegacy({
  particles,
  texture,
  pools = true,
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
      {showTexture && (
        <>
          <div className="atm-stone" style={{ backgroundImage: STONE }} />
          {lite ? (
            <>
              <div className={`atm-contour ${motion ? 'atm-contour-a pg-anim' : ''}`} style={{ backgroundImage: CONTOUR_SMOOTH }} />
              {motion && <div className="atm-contour atm-contour-b pg-anim pg-snow" style={{ backgroundImage: CONTOUR_SMOOTH_B }} />}
            </>
          ) : (
            <div className="atm-contour" style={{ backgroundImage: motion && !paused ? CONTOUR_LIVE : CONTOUR_SMOOTH }} />
          )}
          <div className="atm-grain" style={{ backgroundImage: GRAIN }} />
        </>
      )}
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

/** Material redesign: no textures, particles or pools behind content. Callers keep compiling; renders nothing. */
export const Atmosphere = memo(function Atmosphere(_props: AtmosphereProps) {
  return null
})
