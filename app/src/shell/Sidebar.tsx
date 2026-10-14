/**
 * Desktop sidebar, 232px (handoff 04 Desktop).
 *
 * Active item: the white fill clips in as a circle from the icon centre
 * (circle(0 → 160% at 22px 50%), 1.5s cubic-bezier(.22,1,.36,1)); the icon tile turns black
 * after 0.3s; two 1px rings scale 1 → 2.6 over 0.8s, the second 0.18s later.
 * Leaving item: the fill contracts over 1s cubic-bezier(.55,0,.6,.4) and fades, with one faint
 * echo ring (1 → 2). Reduced motion: instant swap, no rings.
 */
import { useState } from 'react'
import { Icon } from '../design/icons'
import { useMotion } from '../state/motion'
import { NAV, href, type NavItem, type RouteKey } from './routes'
import './sidebar.css'

interface NavEvent {
  on: RouteKey
  off: RouteKey | null
  /** bumps on every change so the rings re-mount and replay */
  n: number
}

export function Sidebar({ active, badges }: { active: RouteKey; badges?: Partial<Record<RouteKey, string>> }) {
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

      <section className="sb-playlists" aria-label="Playlists">
        <div className="sb-section-head">
          <span className="sb-section-label">PLAYLISTS</span>
          <button type="button" className="sb-plus" aria-label="New playlist" title="New playlist (coming with playlists)" disabled>
            <Icon name="plus" />
          </button>
        </div>
        <div className="sb-pl-none">No playlists yet</div>
      </section>
    </aside>
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
