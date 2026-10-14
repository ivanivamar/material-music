/**
 * Atmosphere textures as CSS `url(data:…)` values.
 * Ported from design_handoff_pelagic/pelagic-kit.js — generated once at module load.
 *   STONE  — fractal-noise "stone", 900px tile, opacity .09
 *   GRAIN  — film grain, 220px tile, opacity .07, mix-blend-mode: screen
 *   CONTOUR_SMOOTH / CONTOUR_LIVE — topographic rings, opacity .075, size cover.
 *     LIVE breathes in place (26s path morph, SMIL); SMOOTH is the static/reduced-motion version.
 *   CONTOUR_SMOOTH_B — the other end of LIVE's morph, static. The phone layout cross-fades SMOOTH ⇄ SMOOTH_B
 *     on the GPU instead of re-drawing the SMIL morph every frame (which costs most of a phone CPU core).
 */
export const svgUri = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`

export const GRAIN = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)

export const STONE = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><filter id="s" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="5" seed="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.6 0 0 0 -0.62"/></filter><rect width="100%" height="100%" filter="url(#s)"/></svg>',
)

type Pt = [number, number]

/** Closed/open Catmull-Rom spline → cubic Bézier path. */
function crPath(pts: Pt[], closed: boolean): string {
  const n = pts.length
  const g = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  const f = (v: number) => v.toFixed(1)
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  const end = closed ? n : n - 1
  for (let i = 0; i < end; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2)
    d +=
      ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${f(p2[0])} ${f(p2[1])}`
  }
  return d + (closed ? 'Z' : '')
}

function contourSvg(W: number, H: number, animated: boolean, endState = false): string {
  const out: string[] = []
  const ring = (cx: number, cy: number, r: number, k: number, ph: number, sc: number) => {
    const pts: Pt[] = []
    for (let a = 0; a < 36; a++) {
      const t = (a / 36) * Math.PI * 2
      const w =
        sc *
        (1 +
          0.16 * Math.sin(t * 2 + ph + k * 0.12) +
          0.08 * Math.sin(t * 3 - ph * 1.7 + k * 0.2) +
          0.04 * Math.sin(t * 5 + k * 0.3))
      pts.push([cx + Math.cos(t) * r * w * 1.35, cy + Math.sin(t) * r * w])
    }
    return crPath(pts, true)
  }
  const peak = (cx: number, cy: number, rings: number, r0: number, step: number, ph: number) => {
    for (let k = 0; k < rings; k++) {
      const r = r0 + k * step
      const A = endState ? ring(cx, cy, r, k, ph + 0.55 + k * 0.03, 1.025) : ring(cx, cy, r, k, ph, 1)
      if (!animated) {
        out.push(`<path d="${A}"/>`)
        continue
      }
      const B = ring(cx, cy, r, k, ph + 0.55 + k * 0.03, 1.025)
      out.push(
        `<path d="${A}"><animate attributeName="d" dur="26s" repeatCount="indefinite" values="${A};${B};${A}" keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></path>`,
      )
    }
  }
  peak(W * 0.78, H * 0.3, 11, 26, 30, 0.8)
  peak(W * 0.16, H * 0.82, 8, 20, 32, 2.4)
  peak(W * 0.3, H * 0.24, 5, 14, 24, 4.1)
  peak(W * 0.62, H * 0.86, 4, 12, 22, 5.6)
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round">${out.join('')}</g></svg>`,
  )
}

export const CONTOUR_SMOOTH = contourSvg(1600, 1000, false)
export const CONTOUR_LIVE = contourSvg(1600, 1000, true)
export const CONTOUR_SMOOTH_B = contourSvg(1600, 1000, false, true)
