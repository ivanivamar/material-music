/**
 * Phone shell (handoff 05 Android): bottom tab bar (88px, HOME · LIBRARY · SEARCH · NEW · YOU) and the
 * floating mini-player (62px, 8px from the edges, just above the tabs).
 *
 * Mini-player: cover · title / artist · lyrics · play, with a 1px glowing progress line along
 * the bottom. Tapping it anywhere except its buttons opens the full-screen player.
 */
import { Icon } from '../design/icons'
import { Marquee } from '../components/Marquee'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { nowPlayingStore } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { AccountTab } from '../pages/AccountMenu'
import { href, type RouteKey } from './routes'
import { isIntroId } from '../state/player'
import { useDjView } from '../state/djUi'
import { DjMark } from '../dj/DjMark'
import { IntroSub, LiveMark } from '../dj/DjIntro'
import { useIntroProgress } from '../dj/live'

const TABS: { key: RouteKey; label: string; icon: 'home' | 'library' | 'search' | 'newr' }[] = [
  { key: 'home', label: 'HOME', icon: 'home' },
  { key: 'library', label: 'LIBRARY', icon: 'library' },
  { key: 'search', label: 'SEARCH', icon: 'search' },
  { key: 'new', label: 'NEW', icon: 'newr' },
]

export function TabBar({ active, dots }: { active: RouteKey; dots?: Partial<Record<RouteKey, boolean>> }) {
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map((t) => (
        <a key={t.key} href={href(t.key)} className={`tab ${t.key === active ? 'is-on' : ''}`} aria-current={t.key === active ? 'page' : undefined}>
          <span className="tab-ic">
            <Icon name={t.icon} />
            {dots?.[t.key] && <span className="tab-dot" aria-label="New" role="img" />}
          </span>
          <span className="tab-label">{t.label}</span>
        </a>
      ))}
      <AccountTab />
    </nav>
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
  const state = p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'
  const title = intro ? (dj.session?.title ?? 'DJ') : track!.title
  const chip = dj.on ? <span className="mini-dj">{intro ? 'DJ · INTRO' : 'DJ'}</span> : null

  return (
    <div
      className="mini"
      role="button"
      tabIndex={0}
      aria-label={intro ? `DJ intro: ${title}. Open player.` : `Now playing: ${track!.title} by ${track!.artist}. Open player.`}
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
        ) : dj.on ? (
          <span className="mini-sub-row">
            <Marquee className="mini-sub" text={track!.artist} />
            {chip}
          </span>
        ) : (
          <Marquee className="mini-sub" text={track!.artist} />
        )}
      </div>
      <button type="button" className="mini-btn" aria-label="Lyrics" onClick={() => nowPlayingStore.open('lyrics')}>
        <Icon name="lyrics" />
      </button>
      <button type="button" className={`mini-play is-${state}`} aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => playerStore.toggle()}>
        <Icon name={p.playing || p.buffering ? 'pauseF' : 'playF'} />
        {p.buffering && <span className="playbtn-spin pg-anim" aria-hidden />}
      </button>
      <span className="mini-progress" aria-hidden>
        <span style={{ width: `${frac * 100}%` }} />
      </span>
    </div>
  )
}
