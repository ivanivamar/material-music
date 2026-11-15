/**
 * Playlist cover (handoff 09): the custom image when there is one, else a 2×2 mosaic of the first
 * four different album covers (gap 2px on #0B0B0C). One album → its cover fills the tile; two or
 * three → they repeat across the four tiles (a b / b a, a b / c a); none → the playlist glyph.
 * Liked songs has its own fixed cover (Nov 15): a white glowing heart on a near-black tile in the
 * app's atmosphere style — stone texture, faint contour lines of one terrain, light pools, grain and
 * marine snow. Two static SVGs next to this file (generator: claude/liked-cover-heart/gen.py).
 */
import type { CSSProperties } from 'react'
import { Icon, type IconName } from '../../design/icons'
import { useCover, useLazyCover } from '../../lib/covers'
import { useLibrary } from '../../state/library'
import { playlistInfo } from '../../state/playlistViews'
import { LIKED_ID, type Playlist } from '../../state/playlists'

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

/**
 * The Liked songs cover art. Up to 56 px the small version is used (bigger heart, no contour lines or
 * snow), so the heart stays clear in rows and the sidebar; bigger tiles and parent-sized covers get
 * the full one.
 */
const LIKED_ART = new URL('./liked-cover.svg', import.meta.url).href
const LIKED_ART_SMALL = new URL('./liked-cover-small.svg', import.meta.url).href

export function LikedCover({ size, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  const cls = ['plc', 'plc-liked', className].filter(Boolean).join(' ')
  const src = size !== undefined && size <= 56 ? LIKED_ART_SMALL : LIKED_ART
  return (
    <div className={cls} style={{ ...(size ? { width: size, height: size } : {}), ...style }} role="img" aria-label="Liked songs">
      <img className="plc-full" src={src} alt="" decoding="async" draggable={false} />
    </div>
  )
}
