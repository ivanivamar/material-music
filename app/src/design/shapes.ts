/**
 * Material 3 Expressive shapes as CSS `clip-path: polygon(...)` (handoff `cookie(n, amp)`).
 * cookie(9, 0)    = circle (paused play button)
 * cookie(9, 0.06) = the soft 9-sided cookie (playing play button, turns slowly)
 * cookie(9, 0.14) = the DJ burst
 */
const cache = new Map<string, string>()

export function cookie(n: number, amp: number, points = 120): string {
  const key = `${n}:${amp}:${points}`
  const hit = cache.get(key)
  if (hit) return hit
  const p: string[] = []
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2
    const r = 50 * (1 - amp + amp * Math.cos(n * t))
    p.push(`${(50 + r * Math.cos(t)).toFixed(2)}% ${(50 + r * Math.sin(t)).toFixed(2)}%`)
  }
  const css = `polygon(${p.join(',')})`
  cache.set(key, css)
  return css
}

/** Play-button shapes: same point count so the browser can morph between them. */
export const SHAPE_PAUSED = cookie(9, 0)
export const SHAPE_PLAYING = cookie(9, 0.06)
export const SHAPE_BURST = cookie(9, 0.14)

/** M3 Expressive loading-indicator sequence (same point count, so they morph). */
export const LOADING_SHAPES = [
  cookie(9, 0.1), // soft burst
  cookie(5, 0.1), // soft pentagon
  cookie(2, 0.14), // oval / pill
  cookie(8, 0.05), // sunny
  cookie(4, 0.15), // 4-leaf clover
  cookie(12, 0.07), // 12-cookie
]
