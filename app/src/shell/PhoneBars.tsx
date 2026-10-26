/**
 * Phone shell (Material redesign, HomeMaterial.dc.html phone form):
 * - TabBar: 96px navigation bar, four destinations (Home · Library · New · Downloads); the active one
 *   gets the coral pill indicator and a filled icon; New carries the unseen count.
 * - MiniPlayer: 68px glass bar 8px from the edges above the tabs: cover · title / artist · play (album
 *   colour circle) · next, with a 3px album-colour progress line along the bottom.
 * - PhoneTopBar: 64px top bar for the top-level pages (logo or title, actions, account avatar).
 */
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../design/icons'
import { AppMark } from '../components/Logo'
import { Marquee } from '../components/Marquee'
import { LoadingShape } from '../components/ui'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { nowPlayingStore } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { AccountButton } from '../pages/AccountMenu'
import { href, type RouteKey } from './routes'
import { isIntroId } from '../state/player'
import { useDjView } from '../state/djUi'
import { IntroSub, LiveMark } from '../dj/DjIntro'
import { useIntroProgress } from '../dj/live'

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

/** Top bar for the top-level phone pages: the logo + name on Home, else the page title. */
export function PhoneTopBar({ title, actions }: { title?: string; actions?: ReactNode }) {
  return (
    <header className="ptb">
      {title ? (
        <h1 className="ptb-title">{title}</h1>
      ) : (
        <a className="ptb-brand" href={href('home')} aria-label="Material Music home">
          <AppMark size={32} />
          <span className="ptb-word">Material Music</span>
        </a>
      )}
      <span className="ptb-actions">
        {actions}
        <AccountButton />
      </span>
    </header>
  )
}

export function MiniPlayer() {
  const p = usePlayer()
  const { data } = useLibrary()
  const dj = useDjView()
  const id = p.index >= 0 ? p.queue[p.index] : null
  const intro = dj.on && isIntroId(id) && !!dj.session
  const track = (id && data?.tracks[id]) || null
  const album = track ? data?.albums[track.albumId] : undefined
  const cover = useCover(album?.cover)
  const introProgress = useIntroProgress(intro ? id : null)
  if (!track && !intro) return null
  const frac = intro ? introProgress.frac : track?.duration ? Math.min(1, p.position / track.duration) : 0
  const title = intro ? (dj.session?.title ?? 'DJ') : track!.title
  const chip = dj.on ? <span className="mini-chip is-dj">{intro ? 'DJ · intro' : 'DJ'}</span> : p.context?.kind === 'radio' ? <span className="mini-chip">Radio</span> : null
  const open = () => nowPlayingStore.open('np')

  return (
    <div className="mini" role="region" aria-label="Player">
      <button type="button" className="mini-open" onClick={open} aria-label={intro ? `DJ intro: ${title}. Open player.` : `Now playing: ${track!.title} by ${track!.artist}. Open player.`}>
        <span className="mini-cover-wrap">
          {intro && id ? <LiveMark item={id} size={52} /> : cover ? <img className="mini-cover" src={cover} alt="" /> : <span className="mini-cover mini-cover-empty" aria-hidden />}
        </span>
        <span className="mini-text">
          <span className="mini-title-row">
            <Marquee className="mini-title" text={title} />
            {chip}
          </span>
          {intro && id && dj.session ? <IntroSub item={id} /> : <Marquee className="mini-sub" text={track!.artist} />}
        </span>
      </button>
      <button type="button" className="mini-play" aria-label={p.playing ? 'Pause' : 'Play'} aria-busy={p.buffering || undefined} onClick={() => playerStore.toggle()}>
        {p.buffering ? <LoadingShape size={26} /> : <Icon name={p.playing ? 'pauseF' : 'playF'} />}
      </button>
      <button type="button" className="mini-next" aria-label="Next" onClick={() => playerStore.next()}>
        <Icon name="next" filled />
      </button>
      <span className="mini-progress" aria-hidden style={{ width: `${frac * 100}%` }} />
    </div>
  )
}
