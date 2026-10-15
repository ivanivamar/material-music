/**
 * Playlist cover (handoff 09): the custom image when there is one, else a 2×2 mosaic of the first
 * four different album covers (gap 2px on #0B0B0C). One album → its cover fills the tile; two or
 * three → they repeat across the four tiles (a b / b a, a b / c a); none → the playlist glyph.
 */
import type { CSSProperties } from 'react'
import { Icon } from '../../design/icons'
import { useCover, useLazyCover } from '../../lib/covers'
import { useLibrary } from '../../state/library'
import { playlistInfo } from '../../state/playlistViews'
import type { Playlist } from '../../state/playlists'
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
  const covers = data ? playlistInfo(data, playlist).covers : []
  const cls = ['plc', className].filter(Boolean).join(' ')
  const st: CSSProperties = { ...(size ? { width: size, height: size } : {}), ...style }

  if (playlist.cover && custom)
    return (
      <div className={cls} style={st}>
        <img className="plc-full" src={custom} alt="" draggable={false} />
      </div>
    )
  if (covers.length === 0)
    return (
      <div className={`${cls} is-empty`} style={st}>
        <Icon name="playlist" />
      </div>
    )
  if (covers.length === 1)
    return (
      <div className={cls} style={st}>
        <div className="plc-one">
          <Tile id={covers[0]} lazy={lazy} />
        </div>
      </div>
    )
  return (
    <div className={`${cls} is-mosaic`} style={st}>
      <MosaicTiles covers={covers} lazy={lazy} />
    </div>
  )
}

/** The four tiles of a mosaic (inside a `.plc.is-mosaic`), repeating 2 or 3 covers. */
export function MosaicTiles({ covers, lazy = false }: { covers: string[]; lazy?: boolean }) {
  const tiles = covers.length === 2 ? [covers[0], covers[1], covers[1], covers[0]] : covers.length === 3 ? [covers[0], covers[1], covers[2], covers[0]] : covers.slice(0, 4)
  return (
    <>
      {tiles.map((id, i) => (
        <Tile key={i} id={id} lazy={lazy} />
      ))}
    </>
  )
}
