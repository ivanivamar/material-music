/**
 * Playlist cover (handoff 09): the custom image when there is one, else a 2×2 mosaic of the first
 * four different album covers (gap 2px on #0B0B0C). One album → its cover fills the tile; two or
 * three → they repeat across the four tiles (a b / b a, a b / c a); none → the playlist glyph.
 * Liked songs has its own fixed cover: a rose tile with a big heart and two small ones rising
 * from it (the heart buttons' fountain, frozen).
 */
import type { CSSProperties } from 'react'
import { Icon, type IconName } from '../../design/icons'
import { useCover, useLazyCover } from '../../lib/covers'
import { useLibrary } from '../../state/library'
import { playlistInfo } from '../../state/playlistViews'
import { LIKED_ID, type Playlist } from '../../state/playlists'
import './playlists.css'

function Tile({ id, lazy }: { id: string | undefined; lazy: boolean }) {
  const [ref, lazyUrl] = useLazyCover<HTMLDivElement>(lazy ? id : null)
  const eager = useCover(lazy ? null : id)
  const url = lazy ? lazyUrl : eager
  return <div ref={ref} className="plc-tile">{url && <img src={url} alt="" decoding="async" draggable={false} />}</div>
}

export function PlaylistCover({
  playlist,
  size,
  lazy = false,
  className,
  style,
}: {
  playlist: Playlist
  /** px, or undefined to fill the parent (aspect 1) */
  size?: number
  lazy?: boolean
  className?: string
  style?: CSSProperties
}) {
  const { data } = useLibrary()
  const custom = useCover(playlist.cover, playlist.stamps.cover)
  if (playlist.id === LIKED_ID) return <LikedCover size={size} className={className} style={style} />
  const covers = data ? playlistInfo(data, playlist).covers : []
  const cls = ['plc', className].filter(Boolean).join(' ')
  const st: CSSProperties = { ...(size ? { width: size, height: size } : {}), ...style }

  if (playlist.cover && custom)
    return (
      <div className={cls} style={st}>
        <img className="plc-full" src={custom} alt="" draggable={false} />
      </div>
    )
  return <CoverMosaic covers={covers} lazy={lazy} className={className} style={st} />
}

/**
 * Cover tile from a list of album covers: none → the glyph, one → it fills the tile, two or more →
 * the 2×2 mosaic. Used by PlaylistCover and the New / Smart playlist dialogs.
 */
export function CoverMosaic({ covers, lazy = false, icon = 'playlist', className, style }: { covers: string[]; lazy?: boolean; icon?: IconName; className?: string; style?: CSSProperties }) {
  const cls = ['plc', className].filter(Boolean).join(' ')
  if (covers.length === 0)
    return (
      <div className={`${cls} is-empty`} style={style}>
        <Icon name={icon} />
      </div>
    )
  if (covers.length === 1)
    return (
      <div className={cls} style={style}>
        <div className="plc-one">
          <Tile id={covers[0]} lazy={lazy} />
        </div>
      </div>
    )
  return (
    <div className={`${cls} is-mosaic`} style={style}>
      <MosaicTiles covers={covers} lazy={lazy} />
    </div>
  )
}

/** The four tiles of a mosaic (inside a `.plc.is-mosaic`), repeating 2 or 3 covers. */
function MosaicTiles({ covers, lazy = false }: { covers: string[]; lazy?: boolean }) {
  const tiles = covers.length === 2 ? [covers[0], covers[1], covers[1], covers[0]] : covers.length === 3 ? [covers[0], covers[1], covers[2], covers[0]] : covers.slice(0, 4)
  return (
    <>
      {tiles.map((id, i) => (
        <Tile key={i} id={id} lazy={lazy} />
      ))}
    </>
  )
}

/** The Liked songs cover: one SVG that scales with the tile, so the same look from 26 to 264 px. */
export function LikedCover({ size, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  const cls = ['plc', 'plc-liked', className].filter(Boolean).join(' ')
  return (
    <div className={cls} style={{ ...(size ? { width: size, height: size } : {}), ...style }} role="img" aria-label="Liked songs">
      <svg className="plc-liked-art" viewBox="0 0 100 100" aria-hidden>
        <path className="plc-liked-big" d={heartAt(50, 59, 2.55)} />
        <path className="plc-liked-s1" d={heartAt(78, 22, 0.78)} transform="rotate(16 78 22)" />
        <path className="plc-liked-s2" d={heartAt(23, 25, 0.54)} transform="rotate(-18 23 25)" />
      </svg>
    </div>
  )
}

/** Material "favorite" (24-unit box, centred) placed at (cx, cy) and scaled by k. */
function heartAt(cx: number, cy: number, k: number): string {
  const P = [
    [12, 21.35], [10.55, 20.03], [5.4, 15.36, 2, 12.28, 2, 8.5], [2, 5.42, 4.42, 3, 7.5, 3], [9.24, 3, 10.91, 3.81, 12, 5.09],
    [13.09, 3.81, 14.76, 3, 16.5, 3], [19.58, 3, 22, 5.42, 22, 8.5], [22, 12.28, 18.6, 15.36, 13.45, 20.04], [12, 21.35],
  ]
  const f = (x: number, y: number) => `${(cx + (x - 12) * k).toFixed(2)} ${(cy + (y - 12.2) * k).toFixed(2)}`
  return P.map((p, i) => (i === 0 ? `M${f(p[0], p[1])}` : p.length === 2 ? `L${f(p[0], p[1])}` : `C${f(p[0], p[1])} ${f(p[2], p[3])} ${f(p[4], p[5])}`)).join('') + 'Z'
}
