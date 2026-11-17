/**
 * Desktop sidebar (Material redesign, HomeMaterial.dc.html): brand row (Ink-on-coral mark,
 * PELAGIC, library source), Browse nav (46px rows; the active one sits on a raised pill that slides
 * from row to row, with a short bar in the now-playing hue), count badge, Playlists (44px rows, 28px covers, drop targets, drag to reorder) and the
 * account chip at the bottom (avatar, name, last sync; opens the account menu).
 */
import { useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { useToast, IconButton } from '../components/ui'
import { Icon } from '../design/icons'
import { PelagicMark } from '../components/Logo'
import { AccountChip } from '../pages/AccountMenu'
import { useLocalFolder } from '../lib/localFolder'
import { actions, DRAG_MIME, draggedTracks } from '../actions/actions'
import { addToPlaylist } from '../actions/ops'
import { PlaylistCover } from '../pages/playlists/PlaylistCover'
import { useLibrary } from '../state/library'
import { playlistInfo } from '../state/playlistViews'
import { LIKED_ID, playlistsStore, sidebarOrder, usePlaylists, type Playlist } from '../state/playlists'
import { usePlayer } from '../state/player'
import { plural } from '../state/views'
import { useMotion } from '../state/motion'
import { NAV, href, playlistHref, type NavItem, type RouteKey } from './routes'

export function Sidebar({ active, activePlaylist, badges }: { active: RouteKey; activePlaylist?: string | null; badges?: Partial<Record<RouteKey, string>> }) {
  const local = useLocalFolder()
  const linked = local.status !== 'none' && local.status !== 'unsupported' && local.status !== 'loading'
  const motion = useMotion()
  // one raised pill behind the active row, sliding to the next one (no per-row reveal)
  const navRef = useRef<HTMLElement>(null)
  const indRef = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  useLayoutEffect(() => {
    const nav = navRef.current
    const ind = indRef.current
    if (!nav || !ind) return
    const row = nav.querySelector<HTMLElement>('.sb-item.is-on')
    if (!row) {
      ind.style.opacity = '0'
      return
    }
    // the first placement (and with motion off) jumps; after that it glides, the bar stretching on the way
    const glide = placed.current && motion
    ind.classList.toggle('is-still', !glide)
    const from = ind.style.transform
    const to = `translateY(${row.offsetTop}px)`
    if (glide && from !== to) ind.firstElementChild?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(2.4)', offset: 0.35 }, { transform: 'scaleY(1)' }], { duration: 600, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    ind.style.transform = to
    ind.style.height = `${row.offsetHeight}px`
    ind.style.opacity = '1'
    placed.current = true
  }, [active, motion])

  return (
    <aside className="sb">
      <a className="sb-brand" href={href('home')} aria-label="PELAGIC home">
        <PelagicMark size={40} tile className="sb-mark" />
        <span className="sb-brand-text">
          <span className="sb-word">PELAGIC</span>
          <span className="sb-src">{linked ? 'Local library' : 'Google Drive'}</span>
        </span>
      </a>

      <div className="sb-section-label sb-browse">Browse</div>
      <nav ref={navRef} className="sb-nav" aria-label="Main">
        <span ref={indRef} className="sb-ind is-still" aria-hidden>
          <span className="sb-ind-bar" />
        </span>
        {NAV.map((item) => (
          <SidebarItem key={item.key} item={item} on={item.key === active} badge={badges?.[item.key]} />
        ))}
      </nav>

      <SidebarPlaylists active={activePlaylist ?? null} />
      <AccountChip />
    </aside>
  )
}

/**
 * Playlists (handoff 09): 30px cover (greyscale until active), name, N TRACKS. The open playlist
 * is lit white. Each row is a drop target: drag songs (or an album card) onto it to add them.
 */
/** Drag payload of a sidebar playlist being reordered (not a track drag: those use DRAG_MIME). */
const REORDER_MIME = 'application/x-pelagic-playlist-order'

function SidebarPlaylists({ active }: { active: string | null }) {
  const { list, loaded } = usePlaylists()
  const ordered = sidebarOrder(list)
  // reordering: which playlist is being dragged, and the gap it would drop into (index in `ordered`)
  const [drag, setDrag] = useState<{ id: string } | null>(null)
  const [drop, setDrop] = useState<{ index: number } | null>(null)
  const endDrag = () => {
    setDrag(null)
    setDrop(null)
  }
  return (
    <section className="sb-playlists" aria-label="Playlists">
      <div className="sb-section-head">
        <span className="sb-section-label">Playlists</span>
        <span className="sb-heads">
          <IconButton icon="smart" label="New smart playlist" title="New smart playlist" size="sm" className="sb-plus" onClick={() => actions.smartPlaylist()} />
          <IconButton icon="plus" label="New playlist" title="New playlist" size="sm" className="sb-plus" onClick={() => actions.newPlaylist([], '', true)} />
        </span>
      </div>
      {/* only this list scrolls; the brand, nav and header above stay put */}
      <div className="sb-pl-list">
        {ordered.map((p, i) => (
          <SidebarPlaylist
            key={p.id}
            p={p}
            on={p.id === active}
            dragging={drag?.id === p.id}
            dropMark={drag && drop?.index === i ? 'before' : drag && drop?.index === i + 1 && i === ordered.length - 1 ? 'after' : null}
            onReorderStart={() => setDrag({ id: p.id })}
            onReorderOver={(before) => {
              // Liked songs stays on top: nothing drops above it
              const index = p.id === LIKED_ID ? 1 : before ? i : i + 1
              if (drop?.index !== index) setDrop({ index })
            }}
            onReorderDrop={() => {
              if (!drag || !drop) return
              const from = ordered.findIndex((x) => x.id === drag.id)
              playlistsStore.moveInSidebar(drag.id, drop.index > from ? drop.index - 1 : drop.index)
              endDrag()
            }}
            onReorderEnd={endDrag}
          />
        ))}
        {loaded && !list.some((p) => p.id !== LIKED_ID) && <div className="sb-pl-none">No playlists yet</div>}
      </div>
    </section>
  )
}

function SidebarPlaylist({
  p,
  on,
  dragging,
  dropMark,
  onReorderStart,
  onReorderOver,
  onReorderDrop,
  onReorderEnd,
}: {
  p: Playlist
  on: boolean
  /** this row is the one being dragged */
  dragging: boolean
  /** a playlist is being dragged over the gap above / below this row */
  dropMark: 'before' | 'after' | null
  onReorderStart: () => void
  onReorderOver: (before: boolean) => void
  onReorderDrop: () => void
  onReorderEnd: () => void
}) {
  const { data } = useLibrary()
  const toast = useToast()
  const player = usePlayer()
  const [over, setOver] = useState(false)
  const count = data ? playlistInfo(data, p).ids.length : 0
  const playing = player.playing && player.context?.kind === 'playlist' && player.context.id === p.id
  const pinned = p.id === LIKED_ID
  // smart playlists fill themselves: not a drop target
  const accepts = (e: DragEvent) => !p.smart && e.dataTransfer.types.includes(DRAG_MIME)
  return (
    <a
      href={playlistHref(p.id)}
      className={`sb-pl ${on ? 'is-active' : ''} ${over ? 'is-drop' : ''} ${dragging ? 'is-dragging' : ''} ${dropMark ? `is-mark-${dropMark}` : ''}`}
      aria-current={on ? 'page' : undefined}
      draggable={!pinned}
      onDragStart={(e) => {
        if (pinned) return e.preventDefault()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(REORDER_MIME, p.id)
        e.dataTransfer.setData('text/plain', p.name)
        onReorderStart()
      }}
      onDragEnd={onReorderEnd}
      onContextMenu={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)}
      onDragEnter={(e) => accepts(e) && setOver(true)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(REORDER_MIME)) {
          // a playlist being reordered: the gap above or below, by which half the pointer is in
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          const r = e.currentTarget.getBoundingClientRect()
          onReorderOver(e.clientY < r.top + r.height / 2)
          return
        }
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(false)
      }}
      onDrop={(e) => {
        setOver(false)
        if (e.dataTransfer.types.includes(REORDER_MIME)) {
          e.preventDefault()
          onReorderDrop()
          return
        }
        const ids = draggedTracks(e)
        if (!ids) return
        e.preventDefault()
        document.documentElement.removeAttribute('data-dragging-tracks')
        addToPlaylist(toast, p.id, ids)
      }}
    >
      <PlaylistCover playlist={p} size={40} lazy className={`sb-pl-cover ${p.smart ? 'is-smart' : ''} ${pinned ? 'is-liked' : ''}`} />
      <span className="sb-pl-text">
        <span className="sb-pl-name">{p.name}</span>
        <span className="sb-pl-meta">{p.smart ? `${plural(count, 'song', 'songs')} · smart` : plural(count, 'track', 'tracks')}</span>
      </span>
      {playing && <span className="sb-pl-dot" aria-label="Playing" role="img" />}
    </a>
  )
}

interface SidebarItemProps {
  item: NavItem
  on: boolean
  badge?: string
}

function SidebarItem({ item, on, badge }: SidebarItemProps) {
  return (
    <a href={href(item.key)} className={`sb-item ${on ? 'is-on' : ''}`} aria-current={on ? 'page' : undefined}>
      <span className="sb-ic">
        <Icon name={item.icon} filled={on} />
      </span>
      <span className="sb-label">{item.label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </a>
  )
}
