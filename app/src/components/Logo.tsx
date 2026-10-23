/**
 * The Pelagic "Porthole" mark: a bevelled metal rim with rivets, a dark glass window and a glowing
 * white equaliser with its reflection. Grayscale, light from the top left. Geometry is the 1024
 * canvas of design_handoff_app_icon/PortholeIcon.dc.html (copied exactly); `tile` adds the squircle
 * app-icon tile behind it. Sizes up to 48 px use the "small" variant (8 rivets, 5 wide bars, no
 * particles) so the bars stay separate.
 */
import { useId, useMemo } from 'react'

interface PortholeProps {
  /** rendered width/height in px */
  size?: number
  /** squircle tile behind the porthole (app-icon look); off = the porthole alone */
  tile?: boolean
  className?: string
}

const circ = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

function portholeGeo(small: boolean) {
  const n = small ? 8 : 12
  const rr = small ? 26 : 17
  let rivets = ''
  let rivetHi = ''
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2
    const x = Math.round(512 + 405 * Math.cos(a))
    const y = Math.round(512 + 405 * Math.sin(a))
    rivets += circ(x, y, rr)
    rivetHi += circ(x - Math.round(rr * 0.32), y - Math.round(rr * 0.32), Math.round(rr * 0.36))
  }
  const hs = small ? [128, 232, 320, 208, 112] : [64, 112, 176, 256, 320, 240, 160, 104, 56]
  const w = small ? 56 : 28
  const gap = small ? 36 : 20
  const base = small ? 600 : 596
  const rg = small ? 20 : 16
  const rk = small ? 0.35 : 0.42
  const x0 = 512 - (hs.length * w + (hs.length - 1) * gap) / 2
  let bars = ''
  let refl = ''
  hs.forEach((h, i) => {
    const x = x0 + i * (w + gap)
    bars += `M${x} ${base}h${w}v${-h}h${-w}Z`
    refl += `M${x} ${base + rg}h${w}v${Math.round(h * rk)}h${-w}Z`
  })
  return { rivets, rivetHi, bars, refl, hiW: small ? 28 : 16 }
}

export function PortholeMark({ size = 150, tile = false, className }: PortholeProps) {
  const id = useId().replace(/:/g, '')
  const small = size <= 48
  const g = useMemo(() => portholeGeo(small), [small])
  const u = (n: string) => `${id}${n}`
  const ref = (n: string) => `url(#${u(n)})`
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 1024 1024" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={u('bg')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17171A" /><stop offset="1" stopColor="#08080A" /></linearGradient>
        <linearGradient id={u('rim')} x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stopColor="#7C7C82" /><stop offset="0.45" stopColor="#2E2E32" /><stop offset="0.72" stopColor="#232326" /><stop offset="1" stopColor="#505056" /></linearGradient>
        <linearGradient id={u('eo')} x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity="0.14" /></linearGradient>
        <linearGradient id={u('ei')} x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stopColor="#000" stopOpacity="0.7" /><stop offset="0.5" stopColor="#000" stopOpacity="0.2" /><stop offset="1" stopColor="#fff" stopOpacity="0.22" /></linearGradient>
        <linearGradient id={u('gl')} x1="0" y1="184" x2="0" y2="840" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#35373C" /><stop offset="0.55" stopColor="#131416" /><stop offset="1" stopColor="#060607" /></linearGradient>
        <linearGradient id={u('ray')} x1="0" y1="184" x2="0" y2="840" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0.11" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={u('rf')} x1="0" y1="608" x2="0" y2="760" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity="0.42" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <filter id={u('glow')} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="11" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id={u('soft')} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10" /></filter>
        <clipPath id={u('clip')}><circle cx="512" cy="512" r="328" /></clipPath>
        <clipPath id={u('tile')}><rect width="1024" height="1024" rx="236" /></clipPath>
      </defs>
      <g clipPath={tile ? ref('tile') : undefined}>
        {tile && <rect width="1024" height="1024" fill={ref('bg')} />}
        <circle cx="512" cy="522" r="452" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="20" filter={ref('soft')} />
        <circle cx="512" cy="512" r="405" fill="none" stroke={ref('rim')} strokeWidth="94" />
        <circle cx="512" cy="512" r="450" fill="none" stroke={ref('eo')} strokeWidth="4" />
        <circle cx="512" cy="512" r="360" fill="none" stroke={ref('ei')} strokeWidth="4" />
        <path d={g.rivets} fill="#000" fillOpacity="0.55" transform="translate(0 5)" />
        <path d={g.rivets} fill="#6C6C72" />
        <path d={g.rivetHi} fill="#fff" fillOpacity="0.55" />
        <circle cx="512" cy="512" r="343" fill="none" stroke="#050506" strokeWidth="30" />
        <g clipPath={ref('clip')}>
          <rect x="184" y="184" width="656" height="656" fill={ref('gl')} />
          <path d="M392 184 L470 184 L410 840 L300 840 Z" fill={ref('ray')} />
          {!small && (
            <>
              <path d="M560 184 L596 184 L640 840 L540 840 Z" fill={ref('ray')} opacity="0.7" />
              <circle cx="362" cy="332" r="6" fill="#fff" fillOpacity="0.45" />
              <circle cx="676" cy="404" r="5" fill="#fff" fillOpacity="0.35" />
              <circle cx="664" cy="700" r="10" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="4" />
              <circle cx="684" cy="660" r="6" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="3" />
            </>
          )}
          <path d={g.bars} fill="#fff" filter={ref('glow')} />
          <path d={g.refl} fill={ref('rf')} />
          <circle cx="512" cy="512" r="328" fill="none" stroke="#000" strokeOpacity="0.75" strokeWidth="40" filter={ref('soft')} />
        </g>
        <path d="M234 411 A296 296 0 0 1 411 234" fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth={g.hiW} strokeLinecap="round" />
        {!small && <path d="M451 223 A296 296 0 0 1 491 217" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="16" strokeLinecap="round" />}
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
