/**
 * Phone shell:
 * - TabBar: 88px navigation bar, four destinations (Home · Library · New · Downloads); the active
 *   one's pill lights up; New carries the unseen count.
 * - MiniPlayer (handoff 05 Android): 62px, floating 8px from the edges just above the tabs:
 *   cover · title / artist · ♥ · lyrics · play, with a 1px glowing progress line along the bottom.
 *   Tapping it anywhere except its buttons opens the full-screen player.
 * - PhoneTopBar: 64px sticky top bar on every page (search field · account avatar).
 */
import { Icon, type IconName } from '../design/icons'
import { AccountButton } from '../pages/AccountMenu'
import { href, type RouteKey } from './routes'
import { isIntroId } from '../state/player'
import { useCurrent } from '../nowplaying/player'
import { ProgressLine, usePlayPause } from '../nowplaying/parts'
import { nowPlayingStore } from '../state/nowPlaying'
import { Marquee } from '../components/Marquee'
import { LikeButton } from '../components/LikeButton'
import { useCover } from '../lib/covers'
import { useDjView } from '../state/djUi'
import { DjMark } from '../dj/DjMark'
import { IntroSub, LiveMark } from '../dj/DjIntro'

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
        <span className="ptb-search-ic" aria-hidden>
          <Icon name="search" />
        </span>
        <span className="ptb-search-t">Songs, albums, artists</span>
      </button>
      <AccountButton />
    </header>
  )
}

export function MiniPlayer() {
  const { p, id, track, album } = useCurrent()
  const dj = useDjView()
  const onPlay = usePlayPause()
  const intro = dj.on && isIntroId(id) && !!dj.session
  const cover = useCover(album?.cover)
  if (!track && !intro) return null
  const state = p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'
  const title = intro ? (dj.session?.title ?? 'DJ') : track!.title
  const chip = p.remote ? (
    <span className="mini-remote">ON {p.remote.name.toUpperCase()}</span>
  ) : dj.on ? (
    <span className="mini-dj">{intro ? 'DJ · INTRO' : 'DJ'}</span>
  ) : p.context?.kind === 'radio' ? (
    <span className="mini-radio">RADIO</span>
  ) : null

  return (
    <div
      className="mini"
      role="button"
      tabIndex={0}
      aria-label={intro ? `DJ intro: ${title}. Open player.` : `Now playing${p.remote ? ` on ${p.remote.name}` : ''}: ${track!.title} by ${track!.artist}. Open player.`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        nowPlayingStore.open('np')
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          nowPlayingStore.open('np')
        }
      }}
    >
      <span className="mini-cover-wrap">
        {intro && id ? <LiveMark item={id} size={46} /> : cover ? <img className="mini-cover" src={cover} alt="" /> : <span className="mini-cover mini-cover-empty" aria-hidden />}
        {dj.on && !intro && (
          <span className="mini-badge">
            <DjMark size={18} />
          </span>
        )}
      </span>
      <div className="mini-text">
        <Marquee className="mini-title" text={title} />
        {intro && id && dj.session ? (
          <span className="mini-sub-row">
            <IntroSub item={id} />
            {chip}
          </span>
        ) : chip ? (
          <span className="mini-sub-row">
            <Marquee className="mini-sub" text={track!.artist} />
            {chip}
          </span>
        ) : (
          <Marquee className="mini-sub" text={track!.artist} />
        )}
      </div>
      {!intro && track && <LikeButton trackId={track.id} size="md" className="mini-like" />}
      <button type="button" className="mini-btn" aria-label="Lyrics" onClick={() => nowPlayingStore.open('lyrics')}>
        <Icon name="lyrics" />
      </button>
      <button type="button" className={`mini-play is-${state}`} aria-label={p.playing ? 'Pause' : 'Play'} onClick={onPlay}>
        <Icon name={p.playing || p.buffering ? 'pauseF' : 'playF'} />
        {p.buffering && <span className="playbtn-spin pg-anim" aria-hidden />}
      </button>
      <ProgressLine className="mini-progress" />
    </div>
  )
}
