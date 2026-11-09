/**
 * Phone shell (Material redesign, HomeMaterial.dc.html phone form):
 * - TabBar: 96px navigation bar, four destinations (Home · Library · New · Downloads); the active one
 *   gets the coral pill indicator and a filled icon; New carries the unseen count.
 * - MiniPlayer: the queue carousel (76px) above the tabs.
 * - PhoneTopBar: 64px sticky top bar on every page (search field · account avatar).
 */
import { Icon, type IconName } from '../design/icons'
import { SHAPE_PLAYING } from '../design/shapes'
import { AccountButton } from '../pages/AccountMenu'
import { href, type RouteKey } from './routes'
import { isIntroId } from '../state/player'
import { QueueCarousel } from '../nowplaying/carousel/QueueCarousel'
import { useCurrent } from '../nowplaying/player'

const TABS: { key: RouteKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'new', label: 'New', icon: 'newr' },
  { key: 'downloads', label: 'Downloads', icon: 'download' },
]

export function TabBar({ active, counts }: { active: RouteKey; counts?: Partial<Record<RouteKey, number>> }) {
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map((t) => {
        const on = t.key === active
        const n = counts?.[t.key] ?? 0
        return (
          <a key={t.key} href={href(t.key)} className={`tab ${on ? 'is-on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="tab-ic">
              <Icon name={t.icon} filled={on} />
              {n > 0 && (
                <span className="tab-count" aria-label={`${n} new`}>
                  {n > 99 ? '99+' : n}
                </span>
              )}
            </span>
            <span className="tab-label">{t.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

/** Sticky top bar on every phone page: a search field (opens Library search) and the account avatar. */
export function PhoneTopBar({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="ptb">
      <button type="button" className="ptb-search" onClick={onSearch}>
        <span className="ptb-search-ic" style={{ clipPath: SHAPE_PLAYING }} aria-hidden>
          <Icon name="search" />
        </span>
        <span className="ptb-search-t">Songs, albums, artists</span>
      </button>
      <AccountButton />
    </header>
  )
}

/**
 * Phone mini player (Nov 2026 carousel player): the queue carousel, 76px tall, full width above the
 * tabs — the playing song is the hero card with the play button on it and a solid progress line
 * along its bottom edge. Tap the card to open the full-screen player; swipe sideways to browse.
 */
export function MiniPlayer() {
  const { id, track } = useCurrent()
  if (!track && !isIntroId(id)) return null
  return (
    <div className="mini" role="region" aria-label="Player">
      <QueueCarousel variant="mini" />
    </div>
  )
}
