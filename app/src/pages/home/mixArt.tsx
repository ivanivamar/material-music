/**
 * Covers of the Day mix and Discovery (Nov 2026 designs, "Mix covers" canvas), drawn as SVG so they
 * scale from the 48 px Jump back in tile to the 208 px mix page cover:
 *
 *   DayCover   close-up of the sky at that part of the day — a big sun or moon, its glow and a
 *              strip of water reflecting it; stars and the Milky Way at night. Grain over all.
 *   LeakCover  Discovery: diagonal film light-leak bands, colours changing every week. Grain.
 *
 * The grain is an feTurbulence filter whose frequency follows the drawn size, so it stays about a
 * pixel wide at any size. Same generator as the canvas renders (close.py).
 */
import { useId, useMemo, type ReactElement } from 'react'
import type { PartId } from '../../lib/daymix'
import { hash } from '../../lib/mixing'

const S = 400
const HZ = 318

interface Pal {
  sky: [string, string, string, string, string]
  body: 'sun' | 'moon' | 'crescent'
  bx: number
  by: number
  br: number
  core: string
  glow: string
  glowa: number
  water: [string, string, string]
  haze: string
  clouds: [number, number, number, number, string, number][]
  stars: number
  stara: number
  milky?: boolean
}

const DAY_PALETTES: Record<PartId, Pal> = {
  early: { sky: ['#2a2c52', '#6a5a8e', '#d98d8a', '#f7c39a', '#ffe2b8'], body: 'sun', bx: 150, by: 318, br: 92, core: '#fff1d6', glow: '#ffb98a', glowa: 0.85, water: ['#e9b49a', '#7a6286', '#2c2440'], haze: '#ffd6b4', clouds: [[250, 120, 90, 9, '#f2a9a0', 0.55], [90, 165, 70, 6, '#ffc9a8', 0.5]], stars: 18, stara: 0.35 },
  morning: { sky: ['#3f74b8', '#6e9fd2', '#a9c9e6', '#dde9ef', '#f3efe2'], body: 'sun', bx: 140, by: 150, br: 70, core: '#fffdf4', glow: '#fff3cf', glowa: 0.9, water: ['#c7dbe8', '#6f93ae', '#22394a'], haze: '#f5f1e4', clouds: [[270, 130, 80, 10, '#ffffff', 0.65], [110, 185, 95, 7, '#f6f6f2', 0.5]], stars: 0, stara: 0 },
  afternoon: { sky: ['#4a76a8', '#86a6c2', '#cfc3a6', '#efc98c', '#f6c477'], body: 'sun', bx: 258, by: 170, br: 74, core: '#fffbe8', glow: '#ffe2a0', glowa: 0.85, water: ['#ecd3a2', '#8f8a74', '#2c3036'], haze: '#f7dfae', clouds: [[110, 110, 85, 9, '#fff6e2', 0.55], [250, 190, 70, 6, '#fde7bf', 0.45]], stars: 0, stara: 0 },
  evening: { sky: ['#2b2350', '#6a3366', '#c04f6a', '#ee7f50', '#ffbf6a'], body: 'sun', bx: 250, by: 300, br: 104, core: '#ffe7b0', glow: '#ff8a4a', glowa: 0.95, water: ['#ff9a5c', '#8d3b5e', '#1d1326'], haze: '#ffae74', clouds: [[120, 150, 110, 7, '#f58c72', 0.6], [260, 105, 80, 6, '#d8607a', 0.5]], stars: 6, stara: 0.35 },
  night: { sky: ['#070d24', '#101c45', '#1f2f63', '#34406f', '#4c4f78'], body: 'moon', bx: 150, by: 160, br: 78, core: '#f1efe6', glow: '#9fb3e6', glowa: 0.5, water: ['#3a4777', '#18224a', '#070b1a'], haze: '#5b628f', clouds: [[270, 150, 90, 6, '#43507f', 0.5]], stars: 90, stara: 0.9 },
  late: { sky: ['#03040c', '#070a1d', '#0e1430', '#1a1d3d', '#26264a'], body: 'crescent', bx: 262, by: 190, br: 70, core: '#e9e4d6', glow: '#7c86c2', glowa: 0.35, water: ['#1e2245', '#0c0f26', '#030409'], haze: '#3a3c66', clouds: [], stars: 170, stara: 1, milky: true },
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Grain: fine noise added to the picture — a texture, not a veil (Ivan, Nov 9: the first version hid
 * the sun and the bands). About one CSS pixel per grain whatever the drawn size, low contrast.
 */
function Grain({ id, size, amount }: { id: string; size: number; amount: number }) {
  const freq = Math.min(1.4, Math.max(0.35, (1.1 * size) / S))
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={3} seed={5} stitchTiles="stitch" result="n" />
      <feColorMatrix in="n" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="g" />
      <feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1={0} k2={1} k3={amount} k4={-amount / 2} />
    </filter>
  )
}

const stops = (list: [number, string, number][]) => list.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a} />)

export function DayCover({ part, size, radius }: { part: PartId; size: number; radius: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const p = DAY_PALETTES[part]
  const id = (n: string) => `dc${uid}${n}`
  const body = useMemo(() => drawDay(part, p, id), [part, uid]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <svg className="mix-art-svg" viewBox={`0 0 ${S} ${S}`} width={size} height={size} style={{ borderRadius: radius, display: 'block' }} aria-hidden>
      <defs>
        <Grain id={id('gr')} size={size} amount={part === 'night' || part === 'late' ? 0.16 : 0.2} />
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          {stops([
            [0, p.sky[0], 1],
            [0.35, p.sky[1], 1],
            [0.62, p.sky[2], 1],
            [0.84, p.sky[3], 1],
            [1, p.sky[4], 1],
          ])}
        </linearGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          {stops([
            [0, p.glow, p.glowa],
            [0.3, p.glow, p.glowa * 0.45],
            [1, p.glow, 0],
          ])}
        </radialGradient>
        <radialGradient id={id('core')} cx="0.5" cy="0.5" r="0.5">
          {stops([
            [0, '#ffffff', 1],
            [0.5, '#fffdf6', 1],
            [0.85, p.core, 1],
            [1, p.core, 1],
          ])}
        </radialGradient>
        <radialGradient id={id('moon')} cx="0.4" cy="0.38" r="0.5">
          {stops([
            [0, '#fbf8ef', 1],
            [0.7, p.core, 1],
            [1, '#b9b6c8', 1],
          ])}
        </radialGradient>
        <linearGradient id={id('water')} x1="0" y1="0" x2="0" y2="1">
          {stops([
            [0, p.water[0], 1],
            [0.5, p.water[1], 1],
            [1, p.water[2], 1],
          ])}
        </linearGradient>
        <linearGradient id={id('scrim')} x1="0" y1="0" x2="0" y2="1">
          {stops([
            [0, '#000', 0],
            [1, '#000', 0.5],
          ])}
        </linearGradient>
        <radialGradient id={id('vig')} cx="0.5" cy="0.5" r="0.75">
          {stops([
            [0, '#000', 0],
            [0.65, '#000', 0],
            [1, '#000', 0.5],
          ])}
        </radialGradient>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={id('soft2')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={id('edge')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <clipPath id={id('clip')}>
          <rect width={S} height={HZ} />
        </clipPath>
        {p.body === 'crescent' && (
          <mask id={id('cm')}>
            <rect width={S} height={S} fill="#000" />
            <circle cx={p.bx} cy={p.by} r={p.br} fill="#fff" />
            <circle cx={Math.round(p.bx - p.br * 0.42)} cy={Math.round(p.by - p.br * 0.28)} r={Math.round(p.br * 0.98)} fill="#000" />
          </mask>
        )}
      </defs>
      <g filter={`url(#${id('gr')})`}>{body}</g>
    </svg>
  )
}

function drawDay(part: PartId, p: Pal, id: (n: string) => string): ReactElement[] {
  const r = rng(hash(part))
  const g: ReactElement[] = []
  let k = 0
  const push = (el: ReactElement) => g.push({ ...el, key: String(k++) })
  push(<rect width={S} height={S} fill={`url(#${id('sky')})`} />)
  if (p.milky) push(<ellipse cx={170} cy={120} rx={260} ry={40} fill="#5a5f9a" opacity={0.25} transform="rotate(-32 170 120)" filter={`url(#${id('soft')})`} />)
  const nStars = Math.round(p.stars * 0.6)
  for (let i = 0; i < nStars; i++) {
    const x = r() * S
    const y = Math.pow(r(), 1.4) * (HZ - 20)
    const big = r() < 0.05
    const rad = big ? 1.5 : [0.4, 0.55, 0.7, 0.9][Math.floor(r() * 4)]
    const a = (0.25 + r() * 0.75) * p.stara
    if ((x - p.bx) ** 2 + (y - p.by) ** 2 < (p.br + 14) ** 2) continue
    if (big) push(<circle cx={x} cy={y} r={5} fill="#cfd8ff" opacity={a * 0.3} filter={`url(#${id('soft2')})`} />)
    push(<circle cx={x} cy={y} r={rad} fill="#fffaf0" opacity={a} />)
  }
  push(<circle cx={p.bx} cy={p.by} r={p.br * (p.body === 'sun' ? 3.6 : 2.6)} fill={`url(#${id('glow')})`} />)
  const bodyEls: ReactElement[] = []
  if (p.body === 'sun') {
    bodyEls.push(<circle key="b1" cx={p.bx} cy={p.by} r={p.br * 1.5} fill={p.glow} opacity={0.55} filter={`url(#${id('soft')})`} />)
    bodyEls.push(<circle key="b2" cx={p.bx} cy={p.by} r={p.br * 1.12} fill="#fffaf0" opacity={0.6} filter={`url(#${id('soft')})`} />)
    bodyEls.push(<circle key="b3" cx={p.bx} cy={p.by} r={p.br} fill={`url(#${id('core')})`} filter={`url(#${id('edge')})`} />)
  } else if (p.body === 'moon') {
    bodyEls.push(<circle key="m" cx={p.bx} cy={p.by} r={p.br} fill={`url(#${id('moon')})`} />)
    const mr = rng(2)
    for (let i = 0; i < 9; i++) {
      const dx = (mr() * 1.2 - 0.6) * p.br
      const dy = (mr() * 1.2 - 0.6) * p.br
      bodyEls.push(<circle key={`c${i}`} cx={p.bx + dx} cy={p.by + dy} r={(0.06 + mr() * 0.14) * p.br} fill="#8c8aa2" opacity={0.12 + mr() * 0.14} filter={`url(#${id('edge')})`} />)
    }
  } else bodyEls.push(<circle key="cr" cx={p.bx} cy={p.by} r={p.br} fill={`url(#${id('moon')})`} mask={`url(#${id('cm')})`} />)
  push(<g clipPath={`url(#${id('clip')})`}>{bodyEls}</g>)
  for (const [cx, cy, rx, ry, col, a] of p.clouds.slice(0, 2)) push(<ellipse cx={cx} cy={p.by + (cy - 140) * 0.25} rx={rx * 1.4} ry={ry * 0.9} fill={col} opacity={a * 0.55} filter={`url(#${id('soft')})`} />)
  push(<rect x={0} y={HZ} width={S} height={S - HZ} fill={`url(#${id('water')})`} />)
  push(<rect x={0} y={HZ - 1} width={S} height={2} fill={p.haze} opacity={0.5} filter={`url(#${id('edge')})`} />)
  const rr = rng(5)
  for (let y = HZ + 3; y < S; y += 3 + rr() * 3.5) {
    const t = (y - HZ) / (S - HZ)
    const w = p.br * (0.9 + rr() * 0.5) * (1.1 + t * 0.8)
    push(<rect x={p.bx - w / 2 + (rr() * 10 - 5)} y={y} width={w} height={1 + rr() * 1.2} fill={p.core} opacity={(0.3 + rr() * 0.45) * (1 - t * 0.85) * (p.body !== 'sun' ? 0.7 : 1)} />)
  }
  push(<ellipse cx={p.bx} cy={HZ + 30} rx={p.br * 1.3} ry={40} fill={p.glow} opacity={0.35} filter={`url(#${id('soft')})`} />)
  push(<rect x={0} y={270} width={S} height={130} fill={`url(#${id('scrim')})`} opacity={0.7} />)
  push(<rect width={S} height={S} fill={`url(#${id('vig')})`} />)
  return g
}

/* ── Discovery: light leak ──────────────────────────── */

/** Weekly colourways: base + four bands. */
const LEAKS: { base: string; bands: [string, string, string, string] }[] = [
  { base: '#1a1220', bands: ['#5b2a6e', '#e0566b', '#F39A7D', '#ffd39a'] },
  { base: '#0f1620', bands: ['#1f4f7a', '#3fa0b0', '#b9e0c8', '#f2e7b8'] },
  { base: '#16131f', bands: ['#3b2a6b', '#8f7bd6', '#e6a2c8', '#ffe1c2'] },
  { base: '#14170f', bands: ['#2f5a3a', '#9cc06a', '#f0d47a', '#fff0c8'] },
  { base: '#1c1010', bands: ['#7a2a2a', '#e06a3f', '#f7b267', '#fde7c0'] },
  { base: '#0e1418', bands: ['#24486b', '#c25a7c', '#f39a7d', '#f8e3c4'] },
]

const leakFor = (week: string) => LEAKS[hash(week) % LEAKS.length]

export function LeakCover({ week, size, radius }: { week: string; size: number; radius: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const id = (n: string) => `lk${uid}${n}`
  const pal = leakFor(week)
  return (
    <svg className="mix-art-svg" viewBox={`0 0 ${S} ${S}`} width={size} height={size} style={{ borderRadius: radius, display: 'block' }} aria-hidden>
      <defs>
        <Grain id={id('gr')} size={size} amount={0.21} />
        <filter id={id('big')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="55" />
        </filter>
        <filter id={id('band')} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
        <radialGradient id={id('vig')} cx="0.5" cy="0.5" r="0.75">
          {stops([
            [0, '#000', 0],
            [0.7, '#000', 0],
            [1, '#000', 0.4],
          ])}
        </radialGradient>
      </defs>
      <g filter={`url(#${id('gr')})`}>
        <rect width={S} height={S} fill={pal.base} />
        {pal.bands.map((col, i) => (
          <rect key={i} x={-80 + i * 110} y={-200} width={90 + i * 12} height={800} fill={col} opacity={0.85} transform="rotate(24 200 200)" filter={`url(#${id('band')})`} />
        ))}
        <circle cx={320} cy={60} r={120} fill="#fff6e8" opacity={0.25} filter={`url(#${id('big')})`} />
        <rect width={S} height={S} fill={`url(#${id('vig')})`} />
      </g>
    </svg>
  )
}
