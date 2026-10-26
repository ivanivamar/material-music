/**
 * Album accent (Material redesign, "neutral surfaces"): large areas stay warm-neutral (hue 40);
 * the playing album's hue only colours small accents — play buttons, progress lines, equalisers, small icons.
 *
 *   primary    oklch(0.82 0.11 H)    on-primary oklch(0.26 0.06 H)    container oklch(0.30 0.06 H)
 *
 * The hue comes from the cover (tint.ts dominantColor). Grey / white / black covers get --hc 0: a near-white accent.
 * `--h` on <html> is the now-playing hue; pages with their own album (album page) set `--h` locally.
 */
import { toOklch } from './tint'

export const BRAND_HUE = 38

export const albumColors = (h: number) => ({
  primary: `oklch(0.82 0.11 ${h})`,
  primaryHi: `oklch(0.84 0.11 ${h})`,
  onPrimary: `oklch(0.26 0.06 ${h})`,
  container: `oklch(0.30 0.06 ${h})`,
  icon: `oklch(0.80 0.09 ${h})`,
  eq: `oklch(0.86 0.10 ${h})`,
})

/** Hue for an RGB colour; near-grey colours (no clear hue) → brand hue. */
export function hueOf(rgb: [number, number, number]): number {
  const [, C, H] = toOklch(rgb)
  return C < 0.03 ? BRAND_HUE : Math.round(H)
}

export function setNowPlayingHue(h: number, chroma = 1) {
  const root = document.documentElement.style
  root.setProperty('--h', String(h))
  root.setProperty('--hc', String(Math.round(chroma * 100) / 100))
}
