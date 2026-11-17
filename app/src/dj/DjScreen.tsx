/**
 * The DJ screen (design "DjV2" / "PhoneDjV2"), shown inside the full-screen player when the DJ
 * button is pressed. One screen, three states, each sliding in with a blur:
 *
 *   start   DJ off: Start DJ, or one type (DjStart.tsx)
 *   intro   the DJ speaks: SESSION n · INTRO, the line word by word, Skip intro
 *   on air  ON AIR · NOW · SESSION n · SONG k, the session title, the song card (cover, title, previous ·
 *           play / pause · next), and one big button on to the next session
 *
 * Left (phone: top) the sonar turns faster while the DJ talks. Header: Close · state · settings
 * (the DJ panel slides in from the right).
 */
import { useEffect, useRef } from 'react'
import { Icon } from '../design/icons'
import { Button, IconButton, PlayButton } from '../components/ui'
import { nowPlayingStore } from '../state/nowPlaying'
import { useCover } from '../lib/covers'
import { djStore } from '../state/dj'
import { djUi, useDjUi, useDjView } from '../state/djUi'
import { useLibrary } from '../state/library'
import { isIntroId, playerStore, usePlayer } from '../state/player'
import { albumOf, trackOf } from '../state/previews'
import { isTouch } from '../state/viewport'
import { useProgress } from '../nowplaying/player'
import { DjBackdrop, DjSonar } from './DjSonar'
import { DjStart } from './DjStart'
import { TYPE_UPPER } from './engine'
import { useIntroLive } from './live'

function Intro({ item }: { item: string }) {
  const view = useDjView()
  const live = useIntroLive(item, true)
  const s = view.session
  if (!s) return null
  const ws = s.line.split(/\s+/).filter(Boolean)
  // a text intro (no voice) shows the words over its first two thirds
  const said = live.kind === 'silent' || !live.kind ? Math.ceil(ws.length * Math.min(1, live.duration ? (live.t / live.duration) * 1.5 : 1)) : live.word + 1
  return (
    <div className="djv djv-intro" key={`intro-${s.id}`}>
      <div className="djv-k t-mono">
        SESSION {s.n} · INTRO{view.skippedFrom ? ` · SKIPPED ${view.skippedFrom.toUpperCase()}` : ''}
      </div>
      <p className="djv-line" aria-label={s.line}>
        {ws.map((w, i) => (
          <span key={i} className={i < said ? 'is-said' : ''} aria-hidden>
            {w}{' '}
          </span>
        ))}
      </p>
      <div className="djv-sess">
        <span className="djv-sess-t">{s.title}</span>
        <span className="t-mono">
          {TYPE_UPPER[s.kind]} · {live.kind === 'silent' || !live.kind ? 'TEXT' : 'VOICE'}
        </span>
      </div>
      {s.note && (
        <div className="djv-note">
          <Icon name="alert" /> {s.note}
        </div>
      )}
      <div className="djv-btns">
        <button type="button" className="djv-btn" onClick={() => playerStore.next()}>
          Skip intro
        </button>
        <Button variant="secondary" icon="lyrics" onClick={showLyrics}>
          Lyrics
        </Button>
      </div>
    </div>
  )
}

/** The lyrics (the song's, or the spoken intro as lines); leaving them comes back to the DJ screen. */
const showLyrics = () => {
  nowPlayingStore.setView('lyrics')
  djUi.closeStart()
}

function SongBar() {
  const frac = useProgress()
  return (
    <span className="djv-song-bar" aria-hidden>
      <span style={{ width: `${(frac * 100).toFixed(1)}%` }} />
    </span>
  )
}

function OnAir() {
  const view = useDjView()
  const p = usePlayer()
  const { data } = useLibrary()
  const id = p.queue[p.index] ?? ''
  const t = trackOf(data, id)
  const album = t ? albumOf(data, t.albumId) : undefined
  const cover = useCover(album?.cover)
  const s = view.session
  if (!s) return null
  const next = view.next
  return (
    <div className="djv djv-on" key={`on-${s.id}`}>
      <div className="djv-air t-mono">
        <span className="djv-eq" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        ON AIR
      </div>
      <div className="djv-now t-mono">
        NOW · SESSION {s.n}
        {view.songIndex >= 0 ? ` · SONG ${view.songIndex + 1}` : ''}
        {view.addedByUser ? ' · ADDED BY YOU' : ''}
      </div>
      <h1 className="djv-title">{s.title}</h1>
      {t && (
        <div className={`djv-song ${p.playing ? 'is-playing' : ''}`}>
          {cover ? <img className="djv-song-art" src={cover} alt="" /> : <span className="djv-song-art is-empty" aria-hidden />}
          <span className="djv-song-text">
            <span className="djv-song-t">{t.title}</span>
            <span className="djv-song-a">{t.artist}</span>
          </span>
          <span className="djv-song-nav">
            <IconButton icon="lyrics" label="Lyrics" className="djv-song-ly" onClick={showLyrics} />
            <IconButton icon="prev" label="Previous song" filled onClick={() => playerStore.prev()} />
            <PlayButton state={p.playing ? 'playing' : 'paused'} size={44} onClick={() => playerStore.toggle()} />
            <IconButton icon="next" label="Next song" filled onClick={() => playerStore.next()} />
          </span>
          <SongBar />
        </div>
      )}
      {/* the one action: on to the next session (its title is the button's label) */}
      <button type="button" className="djv-skip" onClick={() => djStore.skip()}>
        <span className="djv-skip-text">
          <span className="djv-skip-k t-mono">SKIP TO THE NEXT SESSION</span>
          <span className="djv-skip-t">{next?.title ?? 'Picking the next one…'}</span>
        </span>
        <span className="djv-skip-go" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M12 6l6 6-6 6" />
          </svg>
        </span>
      </button>
    </div>
  )
}

export function DjScreen({ phone, onClose }: { phone: boolean; onClose: () => void }) {
  const view = useDjView()
  const ui = useDjUi()
  const p = usePlayer()
  const item = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  const intro = view.on && isIntroId(item)
  const mode = !view.on ? 'start' : intro ? 'intro' : 'on'
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLButtonElement>(null)
  const panelOpen = ui.panel?.kind === 'side'

  useEffect(() => {
    if (!isTouch()) closeRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section className={`djs pg-anim ${phone ? 'is-phone' : ''}`} aria-label="DJ">
      <DjBackdrop />
      <header className="djs-head">
        <button ref={closeRef} type="button" className="djs-ib djs-close t-mono" aria-label="Close" onClick={onClose}>
          <Icon name="chevD" />
          CLOSE
        </button>
        <div className="djs-head-l t-mono">{mode === 'start' ? 'PELAGIC DJ' : mode === 'intro' ? 'DJ · SPEAKING' : 'DJ · ON AIR'}</div>
        <div className="djs-head-r">
          <IconButton
            ref={panelRef}
            icon="tune"
            label="DJ settings"
            size="lg"
            pressed={panelOpen}
            aria-expanded={panelOpen}
            onClick={() => (panelOpen ? djUi.closePanel() : djUi.openSide(phone))}
          />
        </div>
      </header>
      <DjSonar mode={mode === 'start' ? 'standby' : mode === 'intro' ? 'speaking' : 'on'} item={intro ? item : null} />
      <div className="djs-view">{mode === 'start' ? <DjStart phone={phone} /> : mode === 'intro' && item ? <Intro item={item} /> : <OnAir />}</div>
    </section>
  )
}
