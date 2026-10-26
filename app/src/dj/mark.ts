/**
 * DJ mark geometry (Material 3 Expressive redesign, DJMaterial.dc.html) shared by the React mark
 * (DjMark.tsx) and the PNG used as lock-screen / media-session art: the scalloped violet dial knob
 * with five detents and a warm-gold active detent at +30°.
 */
export const ACCENT = 'oklch(0.84 0.09 290)'
export const ACCENT_LIGHT = 'oklch(0.93 0.05 290)'
export const accentA = (a: number) => `oklch(0.84 0.09 290 / ${a})`
export const MARK_TILE = 'linear-gradient(180deg, oklch(0.34 0.08 290), oklch(0.27 0.07 292))'

export function knobPath(n = 9, amp = 0.06, R = 30, cx = 50, cy = 54): string {
  const pts: string[] = []
  const steps = n * 24
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const r = R * (1 - amp + amp * Math.cos(n * t))
    pts.push(`${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`)
  }
  return 'M' + pts.join('L') + 'Z'
}

export const markRadius = (size: number) => (size > 100 ? Math.round(size * 0.27) : size > 60 ? 20 : 13)

/** Static mark as an SVG document (for the PNG art). */
export function markSvg(px: number): string {
  const dots = [-55, -27.5, 0, 30, 55]
    .map((a) => {
      const rad = ((a - 90) * Math.PI) / 180
      const x = (50 + 40 * Math.cos(rad)).toFixed(2)
      const y = (54 + 40 * Math.sin(rad)).toFixed(2)
      const active = a === 30
      return `<circle cx="${x}" cy="${y}" r="${active ? 3.2 : 2.2}" fill="${active ? '#EFE3C2' : '#9678C6'}"/>`
    })
    .join('')
  const knob = `<g transform="rotate(30 50 54)"><path d="${knobPath(9, 0.06, 30, 50, 54)}" fill="#D0BCFF"/><rect x="47.2" y="30" width="5.6" height="15" rx="2.8" fill="#381E72"/></g>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#483173"/><stop offset="1" stop-color="#322056"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#t)"/>` +
    dots +
    knob +
    `</svg>`
  )
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
          ctx.fillStyle = '#C9B6F2'
          ctx.font = `600 ${Math.round(px * 0.024)}px "Plus Jakarta Sans", sans-serif`
          ctx.letterSpacing = '0.3em'
          ctx.fillText('MATERIAL MUSIC DJ', px * 0.075, px * 0.935)
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
