/**
 * Desktop sidebar, 232px (handoff 04 Desktop).
 *
 * Active item: the white fill clips in as a circle from the icon centre
 * (circle(0 → 160% at 22px 50%), 1.5s cubic-bezier(.22,1,.36,1)); the icon tile turns black
 * after 0.3s; two 1px rings scale 1 → 2.6 over 0.8s, the second 0.18s later.
 * Leaving item: the fill contracts over 1s cubic-bezier(.55,0,.6,.4) and fades, with one faint
 * echo ring (1 → 2). Reduced motion: instant swap, no rings.
 */
import { useState, type DragEvent } from 'react'
import { useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { actions, DRAG_MIME, draggedTracks } from '../actions/actions'
import { addToPlaylist } from '../actions/ops'
import { PlaylistCover } from '../pages/playlists/PlaylistCover'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { playlistInfo } from '../state/playlistViews'
import { usePlaylists, type Playlist } from '../state/playlists'
import { usePlayer } from '../state/player'
import { plural } from '../state/views'
import { NAV, SETTINGS_NAV, href, playlistHref, type NavItem, type RouteKey } from './routes'
import './sidebar.css'

interface NavEvent {
  on: RouteKey
  off: RouteKey | null
  /** bumps on every change so the rings re-mount and replay */
  n: number
}

export function Sidebar({ active, activePlaylist, badges }: { active: RouteKey; activePlaylist?: string | null; badges?: Partial<Record<RouteKey, string>> }) {
  const motion = useMotion()
  // "previous value in state" pattern: derive the change event during render, no effect needed
  const [ev, setEv] = useState<NavEvent>({ on: active, off: null, n: 0 })
  if (ev.on !== active) setEv({ on: active, off: ev.on, n: ev.n + 1 })

  return (
    <aside className="sb">
      <a className="sb-brand" href={href('home')} aria-label="Pelagic home">
        <span className="sb-mark" aria-hidden>
          <span className="sb-mark-top" />
          <span className="sb-mark-bottom" />
          <span className="sb-mark-line" />
        </span>
        <span className="sb-word">Pelagic</span>
      </a>

      <nav className="sb-nav" aria-label="Main">
        {NAV.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            on={item.key === active}
            badge={badges?.[item.key]}
            motion={motion}
            ping={motion && ev.n > 0 ? (ev.on === item.key ? 'on' : ev.off === item.key ? 'off' : null) : null}
            pingKey={ev.n}
          />
        ))}
      </nav>

      <SidebarPlaylists active={activePlaylist ?? null} />

      <nav className="sb-foot" aria-label="Settings">
        <SidebarItem
          item={SETTINGS_NAV}
          on={active === 'settings'}
          motion={motion}
          ping={motion && ev.n > 0 ? (ev.on === 'settings' ? 'on' : ev.off === 'settings' ? 'off' : null) : null}
          pingKey={ev.n}
        />
      </nav>
    </aside>
  )
}

/**
 * Playlists (handoff 09): 30px cover (greyscale until active), name, N TRACKS. The open playlist
 * is lit white. Each row is a drop target: drag songs (or an album card) onto it to add them.
 */
function SidebarPlaylists({ active }: { active: string | null }) {
  const { list, loaded } = usePlaylists()
  return (
    <section className="sb-playlists" aria-label="Playlists">
      <div className="sb-section-head">
        <span className="sb-section-label">PLAYLISTS</span>
        <span className="sb-heads">
          <button type="button" className="sb-plus" aria-label="New smart playlist" title="New smart playlist" onClick={() => actions.smartPlaylist()}>
            <Icon name="smart" />
          </button>
          <button type="button" className="sb-plus" aria-label="New playlist" title="New playlist" onClick={() => actions.newPlaylist([], '', true)}>
            <Icon name="plus" />
          </button>
        </span>
      </div>
      {list.map((p) => (
        <SidebarPlaylist key={p.id} p={p} on={p.id === active} />
      ))}
      {loaded && !list.length && <div className="sb-pl-none">No playlists yet</div>}
    </section>
  )
}

function SidebarPlaylist({ p, on }: { p: Playlist; on: boolean }) {
  const { data } = useLibrary()
  const toast = useToast()
  const player = usePlayer()
  const [over, setOver] = useState(false)
  const count = data ? playlistInfo(data, p).ids.length : 0
  const playing = player.playing && player.context?.kind === 'playlist' && player.context.id === p.id
  // smart playlists fill themselves: not a drop target
  const accepts = (e: DragEvent) => !p.smart && e.dataTransfer.types.includes(DRAG_MIME)
  return (
    <a
      href={playlistHref(p.id)}
      className={`sb-pl ${on ? 'is-active' : ''} ${over ? 'is-drop' : ''}`}
      aria-current={on ? 'page' : undefined}
      onContextMenu={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)}
      onDragEnter={(e) => accepts(e) && setOver(true)}
      onDragOver={(e) => {
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
        const ids = draggedTracks(e)
        if (!ids) return
        e.preventDefault()
        document.documentElement.removeAttribute('data-dragging-tracks')
        addToPlaylist(toast, p.id, ids)
      }}
    >
      <PlaylistCover playlist={p} size={30} lazy className="sb-pl-cover" />
      <span className="sb-pl-text">
        <span className="sb-pl-name">{p.name}</span>
        <span className="sb-pl-meta">{p.smart ? `SMART · ${plural(count, 'TRACK')}` : plural(count, 'TRACK')}</span>
      </span>
      {playing && <span className="sb-pl-dot" aria-label="Playing" role="img" />}
    </a>
  )
}

interface ItemProps {
  item: NavItem
  on: boolean
  badge?: string
  motion: boolean
  ping: 'on' | 'off' | null
  pingKey: number
}

function SidebarItem({ item, on, badge, motion, ping, pingKey }: ItemProps) {
  return (
    <a
      href={href(item.key)}
      className={`sb-item ${on ? 'is-on' : ''} ${motion ? '' : 'no-motion'}`}
      aria-current={on ? 'page' : undefined}
    >
      <span className="sb-fill" aria-hidden />
      {ping === 'on' && (
        <span className="sb-pings" key={`on${pingKey}`} aria-hidden>
          <span className="sb-ring sb-ring-on pg-anim" />
          <span className="sb-ring sb-ring-on2 pg-anim" />
        </span>
      )}
      {ping === 'off' && (
        <span className="sb-pings" key={`off${pingKey}`} aria-hidden>
          <span className="sb-ring sb-ring-off pg-anim" />
        </span>
      )}
      <span className="sb-ic">
        <Icon name={item.icon} />
      </span>
      <span className="sb-label">{item.label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </a>
  )
}
