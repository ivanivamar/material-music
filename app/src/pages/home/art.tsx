/**
 * Generated art for Home v2 (handoff design_handoff_home_v2 §5–7, home-kit.js):
 *
 *   MixCover    2×2 mosaic of the mix's albums → each tile greyscale, brightness normalised by its
 *               mean luminance → genre tint (colour blend) → kind overlay → grain → marks
 *               (DAILY MIX + numeral / DEEP CUTS line + dot / REDISCOVER surface light)
 *   RadioArt    tinted stone ground, the seed (round artist photo / square cover) in the centre,
 *               three fixed sonar rings and one satellite dot orbiting the first ring (36 s)
 *   ArtistDisc  round artist photo, or a tinted initials disc
 *   SmartArt    playlist mosaic + the ✦ badge (Jump back in tiles)
 */
import { useId, type CSSProperties, type ReactNode } from 'react'
import { useCover } from '../../lib/covers'
import { useArtStats } from '../../lib/artStats'
import { CONTOUR_SMOOTH, GRAIN, STONE } from '../../design/textures'
import { nameHue, type MixKind } from '../../lib/mixing'
import type { Artist, Catalogue } from '../../state/library'
import { useMotion } from '../../state/motion'
import { PlaylistCover } from '../playlists/PlaylistCover'
import type { Playlist } from '../../state/playlists'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const radiusFor = (size: number) => (size >= 100 ? 10 : size >= 40 ? 8 : 6)

function Tex({ size, stone, contour, grain }: { size: number; stone?: number; contour?: number; grain?: number }) {
  return (
    <>
      {!!stone && <span className="hx-tex" style={{ backgroundImage: STONE, backgroundSize: '900px 900px', opacity: stone }} />}
      {!!contour && <span className="hx-tex" style={{ backgroundImage: CONTOUR_SMOOTH, backgroundSize: `${size * 3.2}px ${size * 2}px`, backgroundPosition: '70% 30%', opacity: contour }} />}
      {!!grain && <span className="hx-tex" style={{ backgroundImage: GRAIN, backgroundSize: '220px 220px', opacity: grain, mixBlendMode: 'screen' }} />}
    </>
  )
}

function Label({ size, children }: { size: number; children: ReactNode }) {
  const pad = Math.round(size * 0.075)
  return (
    <span className="hx-label" style={{ left: pad, top: pad, fontSize: Math.max(9, Math.round(size * 0.055)) }}>
      {children}
    </span>
  )
}

/* ── Mix cover ──────────────────────────────────────── */

function MixTile({ cover, kind }: { cover: string | null | undefined; kind: MixKind }) {
  const url = useCover(cover)
  const stats = useArtStats(cover, url)
  const target = kind === 'redis' ? 0.36 : kind === 'deep' ? 0.22 : 0.27
  const lum = stats?.lum ?? 0.2
  const filter = `grayscale(1) brightness(${clamp(target / Math.max(0.02, lum), 0.4, 2.4).toFixed(2)}) contrast(${kind === 'redis' ? 0.82 : 1.08})`
  return <span className="hx-mix-tile">{url && <img src={url} alt="" draggable={false} style={{ filter }} />}</span>
}

export interface MixArt {
  kind: MixKind
  n?: number
  hue: number
  coverAlbums: string[]
}

export function MixCover({ c, mix, size, radius, className }: { c: Catalogue; mix: MixArt; size: number; radius?: number; className?: string }) {
  const H = mix.hue
  const big = size >= 100
  const r = radius ?? radiusFor(size)
  const covers = mix.coverAlbums.map((id) => c.albums[id]?.cover ?? null)
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.length === 3 ? [covers[0], covers[1], covers[2], covers[0]] : covers.length === 2 ? [covers[0], covers[1], covers[1], covers[0]] : [covers[0], covers[0], covers[0], covers[0]]
  const overlay =
    mix.kind === 'deep'
      ? `linear-gradient(180deg, oklch(0.07 0.02 ${H} / 0.97) 0%, oklch(0.09 0.025 ${H} / 0.84) 50%, oklch(0.13 0.035 ${H} / 0.42) 100%)`
      : mix.kind === 'redis'
        ? `radial-gradient(85% 62% at 84% -6%, oklch(0.93 0.035 ${H} / 0.48), oklch(0.93 0.035 ${H} / 0) 64%), linear-gradient(180deg, oklch(0.5 0.03 ${H} / 0.12) 0%, oklch(0.14 0.03 ${H} / 0.86) 100%)`
        : `linear-gradient(170deg, oklch(0.15 0.035 ${H} / 0.72) 0%, oklch(0.18 0.04 ${H} / 0.12) 40%, oklch(0.10 0.03 ${H} / 0.92) 100%)`
  const pad = Math.max(5, Math.round(size * 0.075))
  let marks: ReactNode = null
  if (mix.kind === 'daily') {
    marks = (
      <>
        {big && <Label size={size}>DAILY MIX</Label>}
        <span
          className="hx-num"
          style={{ left: big ? pad - Math.round(size * 0.01) : pad, bottom: big ? pad - Math.round(size * 0.02) : pad - 2, fontSize: Math.round(size * (big ? 0.4 : 0.44)) }}
        >
          {mix.n ?? ''}
        </span>
      </>
    )
  } else if (mix.kind === 'deep') {
    const lx = pad + 2
    const top = big ? size * 0.3 : size * 0.18
    const bot = size - pad - (big ? 4 : 3)
    const dot = big ? 6 : 5
    marks = (
      <>
        {big && <Label size={size}>DEEP CUTS</Label>}
        <span className="hx-deep-line" style={{ left: lx, top, height: bot - top }} />
        <span className="hx-deep-dot" style={{ left: lx - dot / 2 + 0.5, top: bot - dot / 2, width: dot, height: dot }} />
        {big && (
          <span className="hx-mark-t" style={{ left: lx + 12, bottom: pad - 2, fontSize: Math.max(9, Math.round(size * 0.05)), color: 'rgba(255,255,255,0.72)' }}>
            NEVER PLAYED
          </span>
        )}
      </>
    )
  } else {
    marks = (
      <>
        {big && <Label size={size}>REDISCOVER</Label>}
        <span className="hx-surface" style={{ left: pad, right: pad, bottom: big ? pad + Math.round(size * 0.1) : pad + 2 }} />
        {big && (
          <span className="hx-mark-t" style={{ left: pad, bottom: pad - 2, fontSize: Math.max(9, Math.round(size * 0.05)), color: 'rgba(255,255,255,0.78)' }}>
            LOVED · NOT LATELY
          </span>
        )}
      </>
    )
  }
  return (
    <div className={`hx-mix ${className ?? ''}`} style={{ width: size, height: size, borderRadius: r }} aria-hidden>
      <div className="hx-mosaic" style={{ gap: big ? 1 : 0, background: `oklch(0.12 0.03 ${H})` }}>
        {tiles.map((cv, i) => (
          <MixTile key={i} cover={cv} kind={mix.kind} />
        ))}
      </div>
      <span className="hx-fill" style={{ background: `oklch(0.62 ${mix.kind === 'redis' ? 0.045 : 0.07} ${H})`, mixBlendMode: 'color' }} />
      <span className="hx-fill" style={{ background: overlay }} />
      <Tex size={size} contour={mix.kind === 'deep' ? 0.16 : 0} grain={0.09} />
      {marks}
      <span className="hx-edge" style={{ borderRadius: r }} />
    </div>
  )
}

/* ── Artist disc ────────────────────────────────────── */

export function initials(name: string): string {
  const words = name
    .replace(/^the\s+/i, '')
    .split(/[\s\-_.]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (!words.length) return name.slice(0, 1).toUpperCase()
  if (words.length === 1) return [...words[0]][0].toUpperCase()
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase()
}

function InitialsDisc({ name, size }: { name: string; size: number }) {
  const H = nameHue(name)
  const ini = initials(name)
  return (
    <div className="hx-disc" style={{ width: size, height: size, background: `radial-gradient(80% 80% at 35% 25%, oklch(0.30 0.035 ${H}), oklch(0.16 0.02 ${H}) 75%)` }}>
      <Tex size={size} contour={0.12} grain={0.08} />
      <span className="hx-ini" style={{ fontSize: Math.round(size * (ini.length > 1 ? 0.3 : 0.38)), color: `oklch(0.90 0.03 ${H})` }}>
        {ini}
      </span>
    </div>
  )
}

export function ArtistDisc({ artist, size, className, style }: { artist: Artist; size: number; className?: string; style?: CSSProperties }) {
  const url = useCover(artist.image?.id, artist.image?.v)
  if (!url) return <div className={className} style={style}><InitialsDisc name={artist.name} size={size} /></div>
  return (
    <div className={`hx-photo ${className ?? ''}`} style={{ width: size, height: size, ...style }}>
      <img src={url} alt="" draggable={false} />
    </div>
  )
}

/* ── Radio art ──────────────────────────────────────── */

export interface RadioArtSeed {
  type: 'artist' | 'song' | 'album'
  artist: Artist | null
  /** song / album seeds: the album cover id */
  cover: string | null | undefined
  name: string
}

export function RadioArt({ seed, size, radius, round }: { seed: RadioArtSeed; size: number; radius?: number; round?: boolean }) {
  const motion = useMotion()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const isArtist = seed.type === 'artist'
  const imgId = isArtist ? seed.artist?.image?.id : seed.cover
  const url = useCover(imgId, isArtist ? seed.artist?.image?.v : undefined)
  const stats = useArtStats(imgId, url)
  const H = stats?.hue ?? nameHue(seed.name)
  const r = radius ?? radiusFor(size)
  const c = size / 2
  const big = size >= 100
  const tiny = size < 70
  const D = size * (isArtist ? (tiny ? 0.6 : 0.54) : tiny ? 0.52 : 0.46)
  const rings = tiny ? [D / 2 + size * 0.11] : [D / 2 + size * 0.085, D / 2 + size * 0.17, D / 2 + size * 0.255]
  const ops = [0.3, 0.14, 0.07]
  const R = rings[0]
  const a0 = (-52 * Math.PI) / 180
  const dx = c + R * Math.cos(a0)
  const dy = c + R * Math.sin(a0)
  const dr = big ? 2.4 : 1.7
  const seedR = isArtist ? '50%' : Math.max(4, Math.round(D * 0.06))
  return (
    <div
      className="hx-radio"
      style={{
        width: size,
        height: size,
        borderRadius: round ? '50%' : r,
        background: `radial-gradient(75% 75% at 50% 50%, oklch(0.27 0.035 ${H}) 0%, oklch(0.14 0.02 ${H}) 55%, #0A0A0B 100%)`,
      }}
      aria-hidden
    >
      <Tex size={size} stone={0.1} grain={0.08} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="hx-radio-svg">
        <defs>
          <filter id={`${id}b`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={big ? 2.2 : 1.2} />
          </filter>
        </defs>
        {rings.map((rr, i) => (
          <circle key={i} cx={c} cy={c} r={rr} fill="none" stroke="#FFFFFF" strokeOpacity={ops[i]} strokeWidth={1} />
        ))}
        <g>
          <circle cx={dx} cy={dy} r={dr * 2.6} fill="#FFFFFF" opacity={0.45} filter={`url(#${id}b)`} />
          <circle cx={dx} cy={dy} r={dr} fill="#FFFFFF" />
          {motion && <animateTransform attributeName="transform" type="rotate" from={`0 ${c} ${c}`} to={`360 ${c} ${c}`} dur="36s" repeatCount="indefinite" />}
        </g>
      </svg>
      <div className="hx-radio-seed" style={{ left: c - D / 2, top: c - D / 2, width: D, height: D, borderRadius: seedR }}>
        {url ? <img src={url} alt="" draggable={false} style={{ borderRadius: seedR }} /> : <InitialsDisc name={seed.name} size={D} />}
      </div>
      {big && <Label size={size}>RADIO</Label>}
    </div>
  )
}

/* ── Smart playlist art (tiles) ─────────────────────── */

export function SmartArt({ playlist, size }: { playlist: Playlist; size: number }) {
  return (
    <div className="hx-smart" style={{ width: size, height: size }}>
      <PlaylistCover playlist={playlist} size={size} className="hx-smart-cover" />
      <span className="hx-smart-badge" aria-hidden>
        <SparkIcon />
      </span>
    </div>
  )
}

/* ── New icons (home-kit.js ICX) ────────────────────── */

const svgProps = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { display: 'block', overflow: 'visible' } }

export function RadioIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <circle cx={12} cy={12} r={8} strokeOpacity={0.5} />
      <circle cx={12} cy={12} r={3.2} />
      <circle cx={17.66} cy={6.34} r={1.6} fill="currentColor" stroke="none" />
    </svg>
  )
}
export function SparkIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z" />
    </svg>
  )
}
export function SaveListIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M4 6h11" />
      <path d="M4 11h11" />
      <path d="M4 16h7" />
      <path d="M17.5 13v7" />
      <path d="M14 16.5h7" />
    </svg>
  )
}
