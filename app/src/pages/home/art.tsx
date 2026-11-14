/**
 * Generated art for Home cards and tiles:
 *
 *   MixCover    grayscale album mosaic with genre tint and a mark for the mix type
 *   RadioArt    textured dark ground, sonar rings, an orbiting signal, and the station's seed art
 *   ArtistDisc  round artist photo, or a hue disc with initials
 *   SmartArt    playlist mosaic + the yellow clover ✦ badge
 *   DjKnobMark  the DJ: violet tile with the dial (knob swings while on air)
 * Small sizes drop the artwork labels.
 */
import { useId, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useCover } from '../../lib/covers'
import { useArtStats } from '../../lib/artStats'
import { useArtTint } from '../../design/tint'
import { nameHue, type MixKind } from '../../lib/mixing'
import type { PartId } from '../../lib/daymix'
import { DayCover, LeakCover } from './mixArt'
import type { Artist, Catalogue } from '../../state/library'
import { useMotion } from '../../state/motion'
import { CONTOUR_SMOOTH, GRAIN, STONE } from '../../design/textures'
import { SHAPE_CLOVER } from '../../design/shapes'
import { Icon } from '../../design/icons'
import { PlaylistCover } from '../playlists/PlaylistCover'
import type { Playlist } from '../../state/playlists'

/** Card radius: 10px at 168, scaled to match the original album-card shape. */
export const radiusFor = (size: number) => Math.max(6, Math.round((10 * size) / 168))
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

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

export interface MixArt {
  kind: MixKind
  n?: number
  hue: number
  coverAlbums: string[]
  /** Day mix: the part of the day (its cover) */
  day?: { slot: { part: PartId } }
  /** Discovery: the week (its colours) */
  week?: { key: string }
}

function MixTile({ cover, kind }: { cover: string | null | undefined; kind: MixKind }) {
  const url = useCover(cover)
  const stats = useArtStats(cover, url)
  const target = kind === 'redis' ? 0.36 : kind === 'deep' ? 0.22 : 0.27
  const luminance = stats?.lum ?? 0.2
  const filter = `grayscale(1) brightness(${clamp(target / Math.max(0.02, luminance), 0.4, 2.4).toFixed(2)}) contrast(${kind === 'redis' ? 0.82 : 1.08})`
  return <span className="hx-mix-tile">{url && <img src={url} alt="" draggable={false} style={{ filter }} />}</span>
}

export function MixCover({ c, mix, size, radius, className }: { c: Catalogue; mix: MixArt; size: number; radius?: number; className?: string }) {
  const r = radius ?? radiusFor(size)
  // the two mixes with drawn covers (Nov 2026 designs)
  if (mix.kind === 'day' && mix.day)
    return (
      <div className={`hx-mix hx-art ${className ?? ''}`} style={{ width: size, height: size, borderRadius: r }} aria-hidden>
        <DayCover part={mix.day.slot.part} size={size} radius={r} />
      </div>
    )
  if (mix.kind === 'disc' && mix.week)
    return (
      <div className={`hx-mix hx-art ${className ?? ''}`} style={{ width: size, height: size, borderRadius: r }} aria-hidden>
        <LeakCover week={mix.week.key} size={size} radius={r} />
      </div>
    )
  return <MixMosaic c={c} mix={mix} size={size} r={r} className={className} />
}

function MixMosaic({ c, mix, size, r, className }: { c: Catalogue; mix: MixArt; size: number; r: number; className?: string }) {
  const H = mix.hue
  const big = size >= 100
  const covers = mix.coverAlbums.map((id) => c.albums[id]?.cover ?? null)
  const tiles = covers.length >= 4 ? covers.slice(0, 4) : covers.length === 3 ? [covers[0], covers[1], covers[2], covers[0]] : covers.length === 2 ? [covers[0], covers[1], covers[1], covers[0]] : [covers[0], covers[0], covers[0], covers[0]]
  const overlay = mix.kind === 'deep'
    ? `linear-gradient(180deg, oklch(0.07 0.02 ${H} / .97), oklch(0.09 0.025 ${H} / .84) 50%, oklch(0.13 0.035 ${H} / .42))`
    : mix.kind === 'redis'
      ? `radial-gradient(85% 62% at 84% -6%, oklch(0.93 0.035 ${H} / .48), transparent 64%), linear-gradient(180deg, oklch(0.5 0.03 ${H} / .12), oklch(0.14 0.03 ${H} / .86))`
      : `linear-gradient(170deg, oklch(0.15 0.035 ${H} / .72), oklch(0.18 0.04 ${H} / .12) 40%, oklch(0.10 0.03 ${H} / .92))`
  const pad = Math.max(5, Math.round(size * 0.075))
  let marks: ReactNode
  if (mix.kind === 'daily') {
    marks = (
      <>
        {big && <Label size={size}>DAILY MIX</Label>}
        <span className="hx-num" style={{ left: big ? pad - Math.round(size * 0.01) : pad, bottom: big ? pad - Math.round(size * 0.02) : pad - 2, fontSize: Math.round(size * (big ? 0.4 : 0.44)) }}>{mix.n ?? ''}</span>
      </>
    )
  } else if (mix.kind === 'deep') {
    const lx = pad + 2
    const top = big ? size * 0.3 : size * 0.18
    const bottom = size - pad - (big ? 4 : 3)
    const dot = big ? 6 : 5
    marks = (
      <>
        {big && <Label size={size}>DEEP CUTS</Label>}
        <span className="hx-deep-line" style={{ left: lx, top, height: bottom - top }} />
        <span className="hx-deep-dot" style={{ left: lx - dot / 2 + 0.5, top: bottom - dot / 2, width: dot, height: dot }} />
        {big && <span className="hx-mark-t" style={{ left: lx + 12, bottom: pad - 2, fontSize: Math.max(9, Math.round(size * 0.05)), color: 'rgba(255,255,255,.72)' }}>NEVER PLAYED</span>}
      </>
    )
  } else {
    marks = (
      <>
        {big && <Label size={size}>REDISCOVER</Label>}
        <span className="hx-surface" style={{ left: pad, right: pad, bottom: big ? pad + Math.round(size * 0.1) : pad + 2 }} />
        {big && <span className="hx-mark-t" style={{ left: pad, bottom: pad - 2, fontSize: Math.max(9, Math.round(size * 0.05)), color: 'rgba(255,255,255,.78)' }}>LOVED · NOT LATELY</span>}
      </>
    )
  }
  return (
    <div className={`hx-mix ${className ?? ''}`} style={{ width: size, height: size, borderRadius: r }} aria-hidden>
      <div className="hx-mosaic" style={{ gap: big ? 1 : 0, background: `oklch(0.12 0.03 ${H})` }}>
        {tiles.map((cover, i) => <MixTile key={i} cover={cover} kind={mix.kind} />)}
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
  return (
    <div className="hx-disc" style={{ width: size, height: size, background: `oklch(0.42 0.08 ${H})`, color: `oklch(0.92 0.04 ${H})`, fontSize: Math.round(size * 0.3) }}>
      {initials(name)}
    </div>
  )
}

export function ArtistDisc({ artist, size, className, style }: { artist: Artist; size: number; className?: string; style?: CSSProperties }) {
  const url = useCover(artist.image?.id, artist.image?.v)
  if (!url)
    return (
      <div className={className} style={style}>
        <InitialsDisc name={artist.name} size={size} />
      </div>
    )
  return (
    <div className={`hx-photo ${className ?? ''}`} style={{ width: size, height: size, ...style }}>
      <img src={url} alt="" draggable={false} />
    </div>
  )
}

/** Hue of an artist (photo, else name). */
export function useArtistHue(artist: Artist | null | undefined): number | null {
  const url = useCover(artist?.image?.id, artist?.image?.v)
  const tint = useArtTint(url)
  if (!artist) return null
  return url ? (tint && tint.chroma > 0 ? tint.hue : null) : nameHue(artist.name)
}

/* ── Radio art ──────────────────────────────────────── */

export interface RadioArtSeed {
  type: 'artist' | 'song' | 'album'
  artist: Artist | null
  /** song / album seeds: the album cover id */
  cover: string | null | undefined
  name: string
}

/** Hue of a station (its seed image, else the seed name). */
export function useRadioHue(seed: RadioArtSeed): number {
  const isArtist = seed.type === 'artist'
  const imgId = isArtist ? seed.artist?.image?.id : seed.cover
  const url = useCover(imgId, isArtist ? seed.artist?.image?.v : undefined)
  const stats = useArtStats(imgId, url)
  return stats?.hue ?? nameHue(seed.name)
}

export function RadioArt({ seed, size, radius, round }: { seed: RadioArtSeed; size: number; radius?: number; round?: boolean; playing?: boolean }) {
  const motion = useMotion()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const isArtist = seed.type === 'artist'
  const imgId = isArtist ? seed.artist?.image?.id : seed.cover
  const url = useCover(imgId, isArtist ? seed.artist?.image?.v : undefined)
  const stats = useArtStats(imgId, url)
  const H = stats?.hue ?? nameHue(seed.name)
  const r = radius ?? radiusFor(size)
  const big = size >= 90
  const tiny = size < 70
  const c = size / 2
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
      style={{ width: size, height: size, borderRadius: round ? '50%' : r, background: `radial-gradient(75% 75% at 50% 50%, oklch(0.27 0.035 ${H}) 0%, oklch(0.14 0.02 ${H}) 55%, #0A0A0B 100%)` }}
      aria-hidden
    >
      <Tex size={size} stone={0.1} grain={0.08} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="hx-radio-svg">
        <defs>
          <filter id={`${id}b`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation={big ? 2.2 : 1.2} />
          </filter>
        </defs>
        {rings.map((rr, i) => <circle key={i} cx={c} cy={c} r={rr} fill="none" stroke="#FFFFFF" strokeOpacity={ops[i]} strokeWidth={1} />)}
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

/* ── Smart playlist art ─────────────────────────────── */

export function SmartArt({ playlist, size, radius }: { playlist: Playlist; size: number; radius?: number }) {
  const r = radius ?? radiusFor(size)
  return (
    <div className="hx-smart" style={{ width: size, height: size, borderRadius: r }}>
      <PlaylistCover playlist={playlist} size={size} lazy className="hx-smart-cover" />
      {size >= 90 && <SmartBadge />}
    </div>
  )
}

export function SmartBadge({ size = 32 }: { size?: number }) {
  return (
    <span className="hx-smart-badge" style={{ width: size, height: size, clipPath: SHAPE_CLOVER }} aria-hidden>
      <Icon name="smart" size={Math.round(size / 2)} />
    </span>
  )
}

/* ── DJ mark (dial) ─────────────────────────────────── */

function knobPath(n: number, amp: number, R: number, cx: number, cy: number) {
  let d = ''
  for (let i = 0; i <= 150; i++) {
    const t = (i / 150) * Math.PI * 2
    const r = R * (1 - amp + amp * Math.cos(n * t))
    d += (i ? 'L' : 'M') + (cx + Math.sin(t) * r).toFixed(2) + ' ' + (cy - Math.cos(t) * r).toFixed(2)
  }
  return d + 'Z'
}
const KNOB_SM = knobPath(8, 0.07, 38, 50, 50)
const KNOB_LG = knobPath(9, 0.06, 30, 50, 54)

export function DjKnobMark({ size, on }: { size: number; on: boolean }) {
  const sm = size <= 64
  return (
    <div className="hx-dj" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }} aria-hidden>
      <svg viewBox="0 0 100 100">
        {!sm &&
          [-55, -27.5, 0, 30, 55].map((a) => {
            const r = (a * Math.PI) / 180
            return <circle key={a} cx={50 + Math.sin(r) * 40} cy={54 - Math.cos(r) * 40} r={a === 30 ? 3.2 : 2.2} fill={a === 30 ? 'oklch(0.93 0.05 80)' : 'oklch(0.62 0.10 290)'} />
          })}
        <g className={`hx-dj-knob ${on ? 'is-on mm-anim' : ''}`} style={{ transformOrigin: sm ? '50% 50%' : '50% 54%' }}>
          <path d={sm ? KNOB_SM : KNOB_LG} fill="oklch(0.84 0.09 290)" />
          {sm ? <rect x={44} y={18} width={12} height={24} rx={6} fill="oklch(0.28 0.08 292)" /> : <rect x={46} y={30} width={8} height={18} rx={4} fill="oklch(0.28 0.08 292)" />}
        </g>
      </svg>
    </div>
  )
}

/** Circular play button for Home cards and tiles. */
export function CookiePlay({ size, playing, label, onClick, tone = 'album', className }: { size: number; playing: boolean; label: string; onClick: (e: MouseEvent) => void; tone?: 'album' | 'brand' | 'dj'; className?: string }) {
  return (
    <button type="button" className={`hx-cplay is-${tone} ${className ?? ''}`} style={{ width: size, height: size }} aria-label={label} onClick={onClick}>
      <Icon name={playing ? 'pauseF' : 'playF'} size={Math.round(size * 0.6)} />
    </button>
  )
}
