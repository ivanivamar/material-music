/**
 * The Pelagic "Porthole" mark (final 10c, "Minimal"): a thin light ring around a dark glass window,
 * white equaliser pills rising from a soft waterline. Grayscale, light from the top left. Geometry is
 * the 1024 canvas of design_handoff_app_icon/PortholeMinimal.dc.html variant "i" (copied exactly).
 * `tile` adds the squircle app-icon tile; without it the box hugs the ring. Sizes up to 48 px use the
 * "small" variant (4 wide bars, no waterline / bubbles / glow). The ring and waterline are 2 px at any size.
 */
import { useId } from 'react'

interface PortholeProps {
  /** rendered width/height in px (without `tile` this is the ring's box) */
  size?: number
  /** squircle tile behind the porthole (app-icon look) */
  tile?: boolean
  className?: string
}

const pill = (x: number, y: number, w: number, h: number) => {
  const r = w / 2
  const hh = Math.max(h, w)
  return `M${x} ${y + r}a${r} ${r} 0 0 1 ${w} 0v${hh - w}a${r} ${r} 0 0 1 ${-w} 0Z`
}

function barsPath(small: boolean) {
  const hs = small ? [120, 220, 300, 200] : [120, 208, 288, 184, 104]
  const w = small ? 64 : 36
  const gap = small ? 40 : 28
  const x0 = 512 - (hs.length * w + (hs.length - 1) * gap) / 2
  return hs.map((h, i) => {
    const x = x0 + i * (w + gap)
    return small ? pill(x, 512 - h / 2, w, h) : pill(x, 600 - h, w, h + w / 2)
  }).join('')
}

const CURVE = 'M140 618 C 260 586, 380 586, 512 618 S 764 650, 884 618'
const BARS_SMALL = barsPath(true)
const BARS_FULL = barsPath(false)

export function PortholeMark({ size = 150, tile = false, className }: PortholeProps) {
  const id = useId().replace(/:/g, '')
  const small = size <= 48
  const u = (n: string) => `${id}${n}`
  const ref = (n: string) => `url(#${u(n)})`
  // tight box around the ring (r 360 + a little for the glow) unless the tile is shown
  const viewBox = tile ? '0 0 1024 1024' : '132 132 760 760'
  return (
    <svg className={className} width={size} height={size} viewBox={viewBox} aria-hidden style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={u('bg')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#151518" /><stop offset="1" stopColor="#0A0A0C" /></linearGradient>
        <linearGradient id={u('gl')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#232428" /><stop offset="1" stopColor="#08080A" /></linearGradient>
        <filter id={u('glow')} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <clipPath id={u('win')}><circle cx="512" cy="512" r="359" /></clipPath>
        <clipPath id={u('tile')}><rect width="1024" height="1024" rx="236" /></clipPath>
      </defs>
      <g clipPath={tile ? ref('tile') : undefined}>
        {tile && <rect width="1024" height="1024" fill={ref('bg')} />}
        <circle cx="512" cy="512" r="360" fill={ref('gl')} />
        <circle cx="512" cy="512" r="360" fill="none" stroke="#D8D8DC" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d="M232 430 A292 292 0 0 1 430 232" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth={small ? 28 : 18} strokeLinecap="round" />
        {!small && (
          <>
            <circle cx="676" cy="336" r="9" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="4" />
            <circle cx="700" cy="300" r="5" fill="#fff" fillOpacity="0.3" />
            <g clipPath={ref('win')}>
              <path d={`${CURVE} L884 884 L140 884 Z`} fill="#fff" fillOpacity="0.05" />
              <path d={CURVE} fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          </>
        )}
        <path d={small ? BARS_SMALL : BARS_FULL} fill="#fff" filter={small ? undefined : ref('glow')} />
      </g>
      {tile && <rect x="2" y="2" width="1020" height="1020" rx="234" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="4" />}
    </svg>
  )
}

interface WordmarkProps {
  size?: number
  className?: string
}

export function Wordmark({ size = 30, className }: WordmarkProps) {
  return (
    <span className={`t-wordmark ${className ?? ''}`} style={{ fontSize: size, lineHeight: 1 }}>
      Pelagic
    </span>
  )
}

/** Mark + wordmark stacked (sign-in, first-run, about). */
export function Lockup({ size = 150 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.21 }}>
      <PortholeMark size={size} />
      <Wordmark size={size * 0.2} />
    </div>
  )
}
