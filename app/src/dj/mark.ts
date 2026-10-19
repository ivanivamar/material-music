/**
 * DJ mark geometry (handoff_dj §1) shared by the React mark (DjMark.tsx) and the PNG used as
 * lock-screen / media-session art. A horizon line that fades at both ends, a glowing dot on it,
 * arcs rising above it at falling opacity and a faint reflection below — all in DJ gold.
 */
export const GOLD = 'rgb(226,186,96)'
export const GOLD_LIGHT = 'rgb(242,218,160)'
export const goldA = (a: number) => `rgba(226,186,96,${a})`
export const MARK_TILE = 'radial-gradient(85% 75% at 50% 64%, #221E17 0%, #111011 55%, #070708 100%)'

export interface MarkGeometry {
  big: boolean
  viewBox: string
  cx: number
  cy: number
  horizon: [number, number]
  arcs: { r: number; op: number }[]
  reflections: { r: number; op: number }[]
  dot: number
  halo: number
  blur: number
  stroke: number
  /** sonar ring radii (start → end) */
  sonar: [number, number]
  /** reduced-motion static ring */
  still: number
}

export function markGeometry(size: number): MarkGeometry {
  const big = size >= 100
  if (big)
    return {
      big,
      viewBox: '0 0 100 100',
      cx: 50,
      cy: 60,
      horizon: [4, 96],
      arcs: [9, 18, 27, 36, 45].map((r, i) => ({ r, op: [0.95, 0.6, 0.34, 0.17, 0.08][i] })),
      reflections: [
        { r: 9, op: 0.16 },
        { r: 18, op: 0.08 },
        { r: 27, op: 0.04 },
      ],
      dot: 2.2,
      halo: 6,
      blur: 2.4,
      stroke: 1.5,
      sonar: [9, 62],
      still: 15,
    }
  return {
    big,
    viewBox: '0 0 24 24',
    cx: 12,
    cy: 15.5,
    horizon: [1, 23],
    arcs: [
      { r: 4.5, op: 1 },
      { r: 8.5, op: 0.5 },
    ],
    reflections: [{ r: 4.5, op: 0.18 }],
    dot: 1.7,
    halo: 3.2,
    blur: 1.1,
    stroke: size >= 40 ? 1.4 : 1.25,
    sonar: [4.5, 12],
    still: 6.5,
  }
}

export const markRadius = (size: number) => (size >= 60 ? 10 : size >= 40 ? 8 : Math.max(4, Math.round(size * 0.24)))

export const arcPath = (cx: number, cy: number, r: number, up: boolean) => `M ${cx - r} ${cy} A ${r} ${r} 0 0 ${up ? 1 : 0} ${cx + r} ${cy}`

/** Static mark as an SVG document (for the PNG art). */
export function markSvg(px: number): string {
  const g = markGeometry(px)
  const sw = (g.stroke * 100) / px // non-scaling stroke in a 100-unit viewBox
  const parts: string[] = []
  parts.push(
    `<defs><radialGradient id="t" cx="50%" cy="64%" r="80%"><stop offset="0" stop-color="#221E17"/><stop offset=".55" stop-color="#111011"/><stop offset="1" stop-color="#070708"/></radialGradient>` +
      `<linearGradient id="h" x1="0" x2="1"><stop offset="0" stop-color="${GOLD}" stop-opacity="0"/><stop offset=".5" stop-color="${GOLD}" stop-opacity=".75"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></linearGradient>` +
      `<filter id="b" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${g.blur}"/></filter></defs>`,
  )
  parts.push(`<rect width="100" height="100" fill="url(#t)"/>`)
  parts.push(`<line x1="${g.horizon[0]}" x2="${g.horizon[1]}" y1="${g.cy}" y2="${g.cy}" stroke="url(#h)" stroke-width="${sw}"/>`)
  for (const a of g.arcs) parts.push(`<path d="${arcPath(g.cx, g.cy, a.r, true)}" fill="none" stroke="${GOLD}" stroke-opacity="${a.op}" stroke-width="${sw}" stroke-linecap="round"/>`)
  for (const a of g.reflections) parts.push(`<path d="${arcPath(g.cx, g.cy, a.r, false)}" fill="none" stroke="${GOLD}" stroke-opacity="${a.op}" stroke-width="${sw}"/>`)
  parts.push(`<circle cx="${g.cx}" cy="${g.cy}" r="${g.halo}" fill="${GOLD}" opacity=".4" filter="url(#b)"/>`)
  parts.push(`<circle cx="${g.cx}" cy="${g.cy}" r="${g.dot}" fill="${GOLD_LIGHT}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${g.viewBox}">${parts.join('')}</svg>`
}

let pngMemo: Promise<string | null> | null = null

/** The mark as a 512px PNG data URL (media session / lock-screen art). */
export function markPng(): Promise<string | null> {
  pngMemo ??= new Promise<string | null>((resolve) => {
    try {
      const px = 512
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = px
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0, px, px)
          ctx.fillStyle = '#8A8A8E'
          ctx.font = `${Math.round(px * 0.026)}px "IBM Plex Mono", monospace`
          ctx.letterSpacing = '0.42em'
          ctx.fillText('PELAGIC DJ', px * 0.07, px * 0.94)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg(px))}`
    } catch {
      resolve(null)
    }
  })
  return pngMemo
}
