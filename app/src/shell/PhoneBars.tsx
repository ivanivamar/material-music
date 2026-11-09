/**
 * Phone shell (Material redesign, HomeMaterial.dc.html phone form):
 * - TabBar: 96px navigation bar, four destinations (Home · Library · New · Downloads); the active one
 *   gets the coral pill indicator and a filled icon; New carries the unseen count.
 * - MiniPlayer: a floating card above the tabs — handle band + the queue carousel.
 * - PhoneTopBar: 64px sticky top bar on every page (search field · account avatar).
 */
import { Icon, type IconName } from '../design/icons'
import { SHAPE_PLAYING } from '../design/shapes'
import { AccountButton } from '../pages/AccountMenu'
import { href, type RouteKey } from './routes'
import { isIntroId } from '../state/player'
import { QueueCarousel } from '../nowplaying/carousel/QueueCarousel'
import { useCurrent } from '../nowplaying/player'
import { useLiftDrag } from '../nowplaying/lift'
import { nowPlayingStore } from '../state/nowPlaying'

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
 * Phone mini player (Nov 2026 carousel player): a floating card above the tabs. Across its top, a
 * tonal band with the handle — tap it, or drag it up, to open the full-screen player (the player
 * follows the finger, nowplaying/lift.ts). Under it, the queue carousel on a neutral tonal surface:
 * the playing song is the hero card with the play button and a progress line; tapping any card plays it.
 */
export function MiniPlayer() {
  const { id, track } = useCurrent()
  const drag = useLiftDrag('mini')
  if (!track && !isIntroId(id)) return null
  return (
    <div className="mini" role="region" aria-label="Player">
      <button
        type="button"
        className="mini-band"
        aria-label="Open the full-screen player"
        title="Open the full-screen player"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onClick={() => !drag.swallowClick() && nowPlayingStore.open('np')}
      >
        <span aria-hidden />
      </button>
      <div className="mini-queue">
        <QueueCarousel variant="mini" />
      </div>
    </div>
  )
}
