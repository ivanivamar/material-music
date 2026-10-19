/**
 * Mean luminance and dominant hue of a cover / artist photo (step 26: mix covers normalise each
 * tile's brightness by it; radio art takes its tint from the seed's hue). Measured once per image
 * from the blob URL on a 24×24 canvas, then kept in localStorage (`pelagic.artstats.v1`, a few bytes
 * per image).
 */
import { useEffect, useState } from 'react'

export interface ArtStats {
  /** mean relative luminance 0..1 */
  lum: number
  /** oklch-ish hue 0..360, or null for grey art */
  hue: number | null
}

const KEY = 'pelagic.artstats.v1'
let store: Record<string, [number, number]> | null = null
const listeners = new Set<() => void>()
let saveTimer = 0

function read(): Record<string, [number, number]> {
  if (!store) {
    try {
      store = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, [number, number]>
    } catch {
      store = {}
    }
  }
  return store
}
function write(id: string, s: ArtStats) {
  const all = read()
  all[id] = [Math.round(s.lum * 1000) / 1000, s.hue === null ? -1 : Math.round(s.hue)]
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      const keys = Object.keys(all)
      if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete all[k]
      localStorage.setItem(KEY, JSON.stringify(all))
    } catch {
      /* ignore */
    }
  }, 400)
  listeners.forEach((l) => l())
}

export function peekStats(id: string | null | undefined): ArtStats | null {
  if (!id) return null
  const v = read()[id]
  return v ? { lum: v[0], hue: v[1] < 0 ? null : v[1] } : null
}

/** HSL hue → roughly the oklch hue the handoff's recipes use. */
function toOklchHue(h: number): number {
  const pts: [number, number][] = [
    [0, 29],
    [60, 110],
    [120, 142],
    [180, 195],
    [240, 264],
    [300, 328],
    [360, 389],
  ]
  for (let i = 1; i < pts.length; i++)
    if (h <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      return (y0 + ((h - x0) / (x1 - x0)) * (y1 - y0)) % 360
    }
  return h
}

const lin = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const pending = new Map<string, Promise<void>>()

async function measure(id: string, url: string) {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  const n = 24
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0, n, n)
  const d = ctx.getImageData(0, 0, n, n).data
  let lum = 0
  let sx = 0
  let sy = 0
  let sw = 0
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    // perceived (gamma) luminance, like a greyscale filter sees it
    lum += Math.sqrt(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b))
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    if (sat < 0.18 || max < 30) continue
    let h: number
    if (max === r) h = ((g - b) / (max - min)) % 6
    else if (max === g) h = (b - r) / (max - min) + 2
    else h = (r - g) / (max - min) + 4
    h *= 60
    if (h < 0) h += 360
    const w = sat * (max / 255)
    sx += Math.cos((h * Math.PI) / 180) * w
    sy += Math.sin((h * Math.PI) / 180) * w
    sw += w
  }
  const px = d.length / 4
  const hue = sw / px > 0.04 ? toOklchHue(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360) : null
  write(id, { lum: lum / px, hue })
}

/** Stats for image `id` (shown at `url`); null until measured. */
export function useArtStats(id: string | null | undefined, url: string | null | undefined): ArtStats | null {
  const [, force] = useState(0)
  const known = peekStats(id)
  useEffect(() => {
    if (!id || !url || known) return
    const l = () => force((n) => n + 1)
    listeners.add(l)
    let p = pending.get(id)
    if (!p) {
      p = measure(id, url)
        .catch(() => {})
        .finally(() => pending.delete(id))
      pending.set(id, p)
    }
    return () => {
      listeners.delete(l)
    }
  }, [id, url, known])
  return known
}
