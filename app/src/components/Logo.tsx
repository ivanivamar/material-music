/**
 * Material Music app mark: "Ink on coral" (handoff Pelagic Icon v2, option 2b, chosen).
 * Coral gradient tile oklch(0.82 0.11 40) → oklch(0.75 0.13 34), a lighter 10-point burst
 * oklch(0.86 0.09 42) rotated 10°, and an eighth note in dark ink oklch(0.24 0.04 35).
 * Drawn on the handoff's 376-unit tile. Used wherever the logo appears.
 */
import { useId } from 'react'

const BURST = 'M100.00 50.00L99.46 52.59L97.99 55.04L95.93 57.27L93.77 59.30L91.99 61.25L90.90 63.29L90.58 65.58L90.88 68.20L91.43 71.11L91.79 74.12L91.54 76.98L90.45 79.39L88.49 81.17L85.86 82.29L82.88 82.88L79.94 83.26L77.36 83.78L75.27 84.79L73.67 86.46L72.38 88.75L71.11 91.43L69.63 94.08L67.75 96.24L65.45 97.55L62.82 97.84L60.03 97.20L57.27 95.93L54.68 94.50L52.27 93.41L50.00 93.00L47.73 93.41L45.32 94.50L42.73 95.93L39.97 97.20L37.18 97.84L34.55 97.55L32.25 96.24L30.37 94.08L28.89 91.43L27.63 88.75L26.33 86.46L24.73 84.79L22.64 83.78L20.06 83.26L17.12 82.88L14.14 82.29L11.51 81.17L9.55 79.39L8.46 76.98L8.21 74.12L8.57 71.11L9.12 68.20L9.42 65.58L9.10 63.29L8.01 61.25L6.23 59.30L4.07 57.27L2.01 55.04L0.54 52.59L0.00 50.00L0.54 47.41L2.01 44.96L4.07 42.73L6.23 40.70L8.01 38.75L9.10 36.71L9.42 34.42L9.12 31.80L8.57 28.89L8.21 25.87L8.46 23.02L9.55 20.61L11.51 18.83L14.14 17.71L17.12 17.12L20.06 16.74L22.64 16.22L24.73 15.21L26.33 13.54L27.62 11.25L28.89 8.57L30.37 5.92L32.25 3.76L34.55 2.45L37.18 2.16L39.97 2.80L42.73 4.07L45.32 5.50L47.73 6.59L50.00 7.00L52.27 6.59L54.68 5.50L57.27 4.07L60.03 2.80L62.82 2.16L65.45 2.45L67.75 3.76L69.63 5.92L71.11 8.57L72.38 11.25L73.67 13.54L75.27 15.21L77.36 16.22L79.94 16.74L82.88 17.12L85.86 17.71L88.49 18.83L90.45 20.61L91.54 23.02L91.79 25.87L91.43 28.89L90.88 31.80L90.58 34.42L90.90 36.71L91.99 38.75L93.77 40.70L95.93 42.73L97.99 44.96L99.46 47.41Z'

interface MarkProps {
  size?: number
  /** rounded tile (sidebar, top bar); false = square full-bleed (launcher masks it) */
  tile?: boolean
  className?: string
}

export function AppMark({ size = 36, tile = true, className }: MarkProps) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 376 376" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.82 0.11 40)" />
          <stop offset="1" stopColor="oklch(0.75 0.13 34)" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect width="376" height="376" rx={tile ? 125 : 0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="376" height="376" fill={`url(#g${id})`} />
        <g transform="translate(62 50) rotate(10 138 138) scale(2.76)">
          <path d={BURST} fill="oklch(0.86 0.09 42)" />
        </g>
        <g fill="oklch(0.24 0.04 35)">
          <ellipse cx="146" cy="265" rx="62" ry="53" transform="rotate(-22 146 265)" />
          <rect x="176" y="70" width="30" height="200" rx="15" />
          <path d="M191 70 A90 104 0 0 1 281 174 L191 174 Z" />
        </g>
      </g>
    </svg>
  )
}

/** @deprecated Pelagic porthole; kept as an alias while screens move to the redesign. */
export const PortholeMark = AppMark

export function Wordmark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.01em' }}>
      Material Music
    </span>
  )
}

/** Mark + wordmark stacked (sign-in, first run, about). */
export function Lockup({ size = 96 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.2 }}>
      <AppMark size={size} />
      <Wordmark size={size * 0.28} />
    </div>
  )
}
