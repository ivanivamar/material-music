/**
 * JS mirror of the tokens in src/styles/tokens.css, for values used from code
 * (inline styles, canvas, animation options). Keep in sync with the CSS file.
 */
export const ease = {
  default: 'cubic-bezier(.16,1,.3,1)',
  navIn: 'cubic-bezier(.22,1,.36,1)',
  navOut: 'cubic-bezier(.55,0,.6,.4)',
  sonar: 'cubic-bezier(.15,.6,.35,1)',
  pop: 'cubic-bezier(.34,1.56,.64,1)',
  shimmer: 'cubic-bezier(.4,0,.2,1)',
  sway: 'cubic-bezier(.45,0,.55,1)',
} as const

/** Quality badge base colours (r,g,b). Text rgb(c), border rgba(c,.5), bg rgba(c,.08). */
export const quality = {
  flac16: [143, 199, 230],
  flac24: [198, 180, 242],
  opus: [230, 196, 141],
} as const
export type QualityKind = keyof typeof quality

/** Marine-snow particle counts for the Atmosphere setting. */
export const particleCounts = { off: 0, few: 6, default: 15, more: 32 } as const
export type ParticleSetting = keyof typeof particleCounts

/** In-app Motion setting. 'system' follows prefers-reduced-motion. */
export type MotionSetting = 'system' | 'full' | 'reduced'

/**
 * Album-art tint clamps in OKLCH (album / now-playing screens only).
 * Lightness is fixed; chroma is capped so secondary text stays ≥ WCAG AA.
 */
export const tintClamp = {
  wash: { l: 0.2, cMax: 0.035 },
  deep: { l: 0.13, cMax: 0.022 },
  glow: { l: 0.34, cMax: 0.06 },
  accent: { l: 0.9, cMax: 0.035 },
} as const

export const layout = {
  desktop: { width: 1440, height: 900, sidebar: 232, playerBar: 84, panel: 460 },
  android: { width: 412, height: 915, statusBar: 36, tabBar: 88, miniPlayer: 62, miniInset: 8 },
} as const
