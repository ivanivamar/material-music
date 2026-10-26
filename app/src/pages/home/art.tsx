/**
 * Generated art for Home (Material redesign, HomeMaterial.dc.html — mixCover / radioArt / avatar /
 * mosaic / newSmart / djMark):
 *
 *   MixCover    genre-hue gradient tile, a soft 10-lobe burst in the corner, two tilted album covers,
 *               the kind ("Daily mix") and a big numeral (Deep cuts: explore, Rediscover: history)
 *   RadioArt    radial hue ground, three rings, the seed photo / cover clipped to the 9-sided cookie
 *               over a lighter cookie (turns while that station plays), "Artist radio" chip, sensors mark
 *   ArtistDisc  round artist photo, or a hue disc with initials
 *   SmartArt    playlist mosaic + the yellow clover ✦ badge
 *   DjKnobMark  the DJ: violet tile with the dial (knob swings while on air)
 * Small sizes (< 90px, Jump back in tiles) drop the labels and chips.
 */
import type { CSSProperties, MouseEvent } from 'react'
import { useCover } from '../../lib/covers'
import { useArtStats } from '../../lib/artStats'
import { nameHue, type MixKind } from '../../lib/mixing'
import type { Artist, Catalogue } from '../../state/library'
import { cookie, SHAPE_CLOVER, SHAPE_PLAYING } from '../../design/shapes'
import { Icon } from '../../design/icons'
import { PlaylistCover } from '../playlists/PlaylistCover'
import type { Playlist } from '../../state/playlists'

/** Card radius: 20px at 168, scaled, never under 8. */
export const radiusFor = (size: number) => Math.max(8, Math.round((20 * size) / 168))

/* ── Mix cover ──────────────────────────────────────── */

export interface MixArt {
  kind: MixKind
  n?: number
  hue: number
  coverAlbums: string[]
}

const KIND_NAME: Record<MixKind, string> = { daily: 'Daily mix', deep: 'Deep cuts', redis: 'Rediscover' }

function MixCov({ cover, size, radius, style }: { cover: string | null | undefined; size: number; radius: number; style: CSSProperties }) {
  const url = useCover(cover)
  return <span className="hx-mixcov" style={{ width: size, height: size, borderRadius: radius, ...style }}>{url && <img src={url} alt="" draggable={false} />}</span>
}

export function MixCover({ c, mix, size, radius, className }: { c: Catalogue; mix: MixArt; size: number; radius?: number; className?: string }) {
  const H = mix.hue
  const r = radius ?? radiusFor(size)
  const f = size / 168
  const big = size >= 90
  const cw = Math.round(size * (big ? 0.5 : 0.56))
  const cr = Math.max(6, Math.round(r * 0.6))
  const covers = mix.coverAlbums.map((id) => c.albums[id]?.cover ?? null)
  const c1 = covers[0] ?? null
  const c2 = covers[1] ?? covers[0] ?? null
  const ink = `oklch(0.97 0.02 ${H})`
  const markPos = { left: Math.round(14 * f), bottom: Math.round(10 * f) }
  return (
    <div
      className={`hx-mix ${className ?? ''}`}
      style={{ width: size, height: size, borderRadius: r, background: `linear-gradient(150deg, oklch(0.64 0.14 ${H}) 0%, oklch(0.46 0.13 ${H}) 55%, oklch(0.34 0.10 ${H}) 100%)` }}
      aria-hidden
    >
      <span className="hx-burst" style={{ right: -size * 0.22, bottom: -size * 0.22, width: size * 0.7, height: size * 0.7, background: `oklch(0.78 0.12 ${(H + 30) % 360} / 0.35)`, clipPath: SHAPE_CLOVER }} />
      {big && <MixCov cover={c2} size={cw} radius={cr} style={{ right: Math.round(10 * f), top: Math.round(18 * f), transform: 'rotate(10deg)', opacity: 0.9 }} />}
      <MixCov cover={c1} size={cw} radius={cr} style={big ? { right: Math.round(30 * f), top: Math.round(12 * f), transform: 'rotate(-6deg)' } : { right: Math.round(6 * f), top: Math.round(6 * f), transform: 'rotate(-6deg)' }} />
      {big && (
        <span className="hx-kind" style={{ left: Math.round(14 * f), bottom: Math.round(58 * f), fontSize: Math.round(12 * f), color: `oklch(0.95 0.03 ${H})` }}>
          {KIND_NAME[mix.kind]}
        </span>
      )}
      {mix.kind === 'daily' ? (
        <span className="hx-num" style={{ ...markPos, fontSize: Math.round(48 * f), color: ink }}>
          {mix.n ?? ''}
        </span>
      ) : (
        <Icon name={mix.kind === 'deep' ? 'explore' : 'history'} filled className="hx-mark-ic" style={{ position: 'absolute', ...markPos, bottom: Math.round(12 * f), fontSize: Math.round(44 * f), color: ink }} />
      )}
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
  const stats = useArtStats(artist?.image?.id, url)
  if (!artist) return null
  return url ? (stats ? stats.hue : null) : nameHue(artist.name)
}

/* ── Radio art ──────────────────────────────────────── */

export interface RadioArtSeed {
  type: 'artist' | 'song' | 'album'
  artist: Artist | null
  /** song / album seeds: the album cover id */
  cover: string | null | undefined
  name: string
}

const COOKIE = cookie(9, 0.06)

/** Hue of a station (its seed image, else the seed name). */
export function useRadioHue(seed: RadioArtSeed): number {
  const isArtist = seed.type === 'artist'
  const imgId = isArtist ? seed.artist?.image?.id : seed.cover
  const url = useCover(imgId, isArtist ? seed.artist?.image?.v : undefined)
  const stats = useArtStats(imgId, url)
  return stats?.hue ?? nameHue(seed.name)
}

export function RadioArt({ seed, size, radius, playing }: { seed: RadioArtSeed; size: number; radius?: number; playing?: boolean }) {
  const isArtist = seed.type === 'artist'
  const imgId = isArtist ? seed.artist?.image?.id : seed.cover
  const url = useCover(imgId, isArtist ? seed.artist?.image?.v : undefined)
  const H = useRadioHue(seed)
  const r = radius ?? radiusFor(size)
  const big = size >= 90
  const inner = Math.round(size * (big ? 0.56 : 0.74))
  const cy = big ? '44%' : '50%'
  const ring = (pct: number, a: number) => (
    <span key={pct} className="hx-ring" style={{ top: cy, width: pct + '%', boxShadow: `inset 0 0 0 1.5px oklch(0.80 0.10 ${H} / ${a})` }} />
  )
  const center = (d: number): CSSProperties => ({ left: '50%', top: cy, width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2 })
  return (
    <div
      className="hx-radio"
      style={{ width: size, height: size, borderRadius: r, background: `radial-gradient(circle at 50% ${cy}, oklch(0.46 0.10 ${H}) 0%, oklch(0.30 0.06 ${H}) 45%, oklch(0.20 0.04 ${H}) 100%)` }}
      aria-hidden
    >
      {big && [ring(78, 0.42), ring(104, 0.26), ring(132, 0.14)]}
      <span className={`hx-radio-back ${playing ? 'is-on mm-anim' : ''}`} style={{ ...center(inner + 10), background: `oklch(0.82 0.11 ${H})`, clipPath: COOKIE }} />
      {url ? (
        <img className="hx-radio-img" src={url} alt="" draggable={false} style={{ ...center(inner), clipPath: COOKIE }} />
      ) : (
        <span className="hx-radio-ini" style={{ ...center(inner), clipPath: COOKIE, background: `oklch(0.62 0.12 ${H})`, color: `oklch(0.20 0.05 ${H})`, fontSize: Math.round(inner * 0.32) }}>
          {initials(seed.name)}
        </span>
      )}
      {big && (
        <span className="hx-radio-chip" style={{ background: `oklch(0.86 0.08 ${H})`, color: `oklch(0.24 0.06 ${H})` }}>
          <Icon name={isArtist ? 'artist' : seed.type === 'album' ? 'album' : 'song'} size={16} />
          {isArtist ? 'Artist radio' : seed.type === 'album' ? 'Album radio' : 'Song radio'}
        </span>
      )}
      {big && (
        <span className="hx-radio-mark" style={{ background: `oklch(0.20 0.04 ${H} / 0.55)`, color: `oklch(0.92 0.05 ${H})` }}>
          <Icon name="sensors" size={16} />
        </span>
      )}
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

/** Cookie-shaped play button (cards, tiles): album colour unless `tone` says otherwise. */
export function CookiePlay({ size, playing, label, onClick, tone = 'album', className }: { size: number; playing: boolean; label: string; onClick: (e: MouseEvent) => void; tone?: 'album' | 'brand' | 'dj'; className?: string }) {
  return (
    <button type="button" className={`hx-cplay is-${tone} ${className ?? ''}`} style={{ width: size, height: size, clipPath: SHAPE_PLAYING }} aria-label={label} onClick={onClick}>
      <Icon name={playing ? 'pauseF' : 'playF'} size={Math.round(size * 0.6)} />
    </button>
  )
}
