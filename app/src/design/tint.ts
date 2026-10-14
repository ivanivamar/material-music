/**
 * Album-art tint (handoff "Album-art tint"): take the cover's dominant hue, clamp it in OKLCH so
 * text stays readable, and build the page wash. Album / now-playing screens only.
 *
 *   wash  L .20  C ≤ .035   ·   deep L .13 C ≤ .022   ·   glow L .34 C ≤ .06   ·   accent L .90 C ≤ .035
 *
 * Background = two radial gradients (wash at 26%/60% desktop, deep at the bottom) over #0B0B0C.
 */
import { useEffect, useState } from 'react'
import { tintClamp } from './tokens'

type RGB = [number, number, number]

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

export function toOklch([R, G, B]: RGB): [number, number, number] {
  const [r, g, b] = [R, G, B].map((v) => lin(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, Bb), ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360]
}

export function fromOklch(L: number, C: number, H: number): RGB {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.round(Math.max(0, Math.min(1, gam(Math.max(0, c)))) * 255)) as RGB
}

export interface Tint {
  wash: RGB
  deep: RGB
  glow: RGB
  accent: RGB
}

export function tintFrom(rgb: RGB): Tint {
  const [, C, H] = toOklch(rgb)
  const at = (k: keyof typeof tintClamp) => fromOklch(tintClamp[k].l, Math.min(C, tintClamp[k].cMax), H)
  return { wash: at('wash'), deep: at('deep'), glow: at('glow'), accent: at('accent') }
}

export const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** Desktop scene background (handoff `scene(t, wide)`). */
export const sceneBackground = (t: Tint) =>
  `radial-gradient(50% 60% at 26% 60%, ${rgba(t.wash, 0.95)}, transparent 72%), radial-gradient(120% 55% at 50% 112%, ${rgba(t.deep, 1)}, transparent 72%), #0B0B0C`

/**
 * Dominant colour of an image: downsample to 32×32, bucket pixels by hue, weight by chroma, and
 * average the RGB of the heaviest bucket. Near-grey covers come out grey (chroma ≈ 0 → neutral wash).
 */
export function dominantColor(img: HTMLImageElement): RGB {
  const N = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [20, 20, 20]
  ctx.drawImage(img, 0, 0, N, N)
  const px = ctx.getImageData(0, 0, N, N).data
  const BUCKETS = 24
  const w = new Float64Array(BUCKETS)
  const sum = Array.from({ length: BUCKETS }, () => [0, 0, 0])
  let grey = [0, 0, 0]
  let greyN = 0
  for (let i = 0; i < px.length; i += 4) {
    const rgb: RGB = [px[i], px[i + 1], px[i + 2]]
    const [L, C, H] = toOklch(rgb)
    if (L < 0.12 || L > 0.97 || C < 0.025) {
      grey = [grey[0] + rgb[0], grey[1] + rgb[1], grey[2] + rgb[2]]
      greyN++
      continue
    }
    const k = Math.floor(H / (360 / BUCKETS)) % BUCKETS
    const weight = C * (1 - Math.abs(L - 0.55))
    w[k] += weight
    sum[k][0] += rgb[0] * weight
    sum[k][1] += rgb[1] * weight
    sum[k][2] += rgb[2] * weight
  }
  let best = -1
  for (let k = 0; k < BUCKETS; k++) if (best < 0 || w[k] > w[best]) best = k
  // Mostly monochrome cover → neutral
  const colourful = best >= 0 && w[best] > 0.6
  if (!colourful) return greyN ? (grey.map((v) => Math.round(v / greyN)) as RGB) : [20, 20, 20]
  return sum[best].map((v) => Math.round(v / w[best])) as RGB
}

const cache = new Map<string, Tint>()

/** Tint for a cover object URL (cached per URL). Null until the image has been sampled. */
export function useArtTint(url: string | null | undefined): Tint | null {
  const [tint, setTint] = useState<Tint | null>(() => (url ? (cache.get(url) ?? null) : null))
  const [prev, setPrev] = useState(url)
  if (prev !== url) {
    setPrev(url)
    setTint(url ? (cache.get(url) ?? null) : null)
  }
  useEffect(() => {
    if (!url || cache.has(url)) return
    let live = true
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const t = tintFrom(dominantColor(img))
        cache.set(url, t)
        if (live) setTint(t)
      } catch {
        /* tainted / undecodable: stay neutral */
      }
    }
    img.src = url
    return () => {
      live = false
    }
  }, [url])
  return tint
}
