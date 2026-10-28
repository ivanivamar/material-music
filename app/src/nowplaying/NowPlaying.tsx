/**
 * Full-screen Now playing (Material redesign, NowPlayingMaterial.dc.html, neutral surfaces).
 *
 * A fixed glass sheet over the app (oklch(0.14 0.005 40 / .9) + blur 44px): header (close · PLAYING FROM ·
 * more), then the tilted cover (phone: drag it sideways to switch songs, CoverSwipe.tsx) beside / above
 * the FLAC pill, title, artist · album, the wavy seek bar, the transport (cookie play button) and the
 * Lyrics · DJ · Queue chips (+ volume on desktop). Lyrics open as a panel on the right (desktop) or a
 * sheet from below (phone) over a scrim; the queue is its own panel (QueuePanel.tsx).
 * Opened from the player bar / mini player. Esc or Back closes (AppShell + history).
 */
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { IconButton, ThinSlider, WaveSeek } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { albumHref, artistHref } from '../shell/routes'
import { Marquee } from '../components/Marquee'
import { Lyrics } from './Lyrics'
import { CoverSwipe } from './CoverSwipe'
import { useSwipeDown } from './swipe'
import { NpLink, Transport, ViewButtons, contextLine, useCurrent } from './parts'
import { useSettings } from '../state/settings'
import { actions } from '../actions/actions'
import { useDjUi, useDjView, djUi } from '../state/djUi'
import { isIntroId } from '../state/player'
import { djIntroInfo } from '../state/dj'
import { useIntroAudio } from '../dj/voice'
import { DjIcon } from '../dj/DjMark'
import { DjIntroInfo, DjIntroLyrics, LiveMark } from '../dj/DjIntro'
import { DjStart } from '../dj/DjStart'
import { introLevel, onFrame } from '../dj/live'
import { registerBack } from '../native/backButton'
import '../dj/dj.css'
import './nowplaying.css'

const closeNp = () => nowPlayingStore.close()

export function NowPlaying() {
  const ui = useNowPlayingUi()
  const motion = useMotion()
  // keep mounted through the exit animation
  const [mounted, setMounted] = useState(ui.open)
  if (ui.open && !mounted) setMounted(true)
  if (!ui.open && mounted && !motion) setMounted(false)
  useEffect(() => {
    if (ui.open || !mounted || !motion) return
    const t = window.setTimeout(() => setMounted(false), 420)
    return () => window.clearTimeout(t)
  }, [ui.open, mounted, motion])

  if (!mounted) return null
  return <NowPlayingScreen closing={!ui.open} />
}

function NowPlayingScreen({ closing }: { closing: boolean }) {
  const ui = useNowPlayingUi()
  const { p, track: songTrack, album: songAlbum } = useCurrent()
  const { data } = useLibrary()
  const motion = useMotion()
  const dj = useDjView()
  const djui = useDjUi()
  const item = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  const intro = dj.on && isIntroId(item)
  const startView = djui.start
  // during an intro the cover spot holds the mark over the first song's cover (the hand-over)
  const track = intro ? ((p.queue[p.index + 1] && data?.tracks[p.queue[p.index + 1]]) || null) : songTrack
  const album = intro ? (track ? data?.albums[track.albumId] : undefined) : songAlbum
  const cover = useCover(album?.cover)
  const closeRef = useRef<HTMLButtonElement>(null)
  const introAudio = useIntroAudio(intro && item ? djIntroInfo(item)?.sessionId : null)

  // focus in on open, back to whatever opened it on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // touch screens: no programmatic focus (it would draw a focus ring on the close button)
    if (!isTouch()) closeRef.current?.focus({ preventScroll: true })
    return () => prev?.focus?.({ preventScroll: true })
  }, [])

  // toasts move to the bottom centre of the full screen
  useEffect(() => {
    document.documentElement.setAttribute('data-np', '')
    return () => document.documentElement.removeAttribute('data-np')
  }, [])

  // nothing left to show (queue cleared, track gone from the catalogue)
  const hasSomething = !!songTrack || intro
  useEffect(() => {
    if (!hasSomething && !startView && !closing) nowPlayingStore.reset()
  }, [hasSomething, startView, closing])

  // phone Back on the start view: back to the player (when something is loaded)
  useEffect(() => {
    if (!startView || !hasSomething) return
    return registerBack(() => {
      djUi.closeStart()
      return true
    }, 'top')
  }, [startView, hasSomething])

  // intro → first song: the info column dips for ~0.9 s while the cover takes over
  const [handing, setHanding] = useState(false)
  const wasIntro = useRef(intro)
  useEffect(() => {
    if (wasIntro.current && !intro && motion) {
      setHanding(true)
      const t = window.setTimeout(() => setHanding(false), 900)
      wasIntro.current = intro
      return () => window.clearTimeout(t)
    }
    wasIntro.current = intro
  }, [intro, motion])

  const ly = ui.view === 'lyrics' && !startView
  const phone = useIsPhone()
  // phone: swipe down anywhere (outside sliders / lyrics) to close, like the queue sheet
  const rootRef = useRef<HTMLDivElement>(null)
  useSwipeDown(rootRef, phone && !closing && !startView, closeNp)

  /* ── Phone lyrics bottom sheet: drag the handle / header (like QueuePanel) ──
   * down → close (or back to normal height when expanded), up → full height; tap the handle to
   * toggle full height. The sheet follows the finger; the scrim fades while pulling down. */
  const [lyExpanded, setLyExpanded] = useState(false)
  const [lyGrabDy, setLyGrabDy] = useState<number | null>(null)
  const lyGrab = useRef({ y0: 0, y: 0, t: 0, v: 0, moved: false, onHandle: false, fromBtn: false })
  if (!ly && lyExpanded) setLyExpanded(false)
  if (!ly && lyGrabDy !== null) setLyGrabDy(null)
  const lySheetRef = useRef<HTMLElement>(null)
  const lyRestOffset = () => (lySheetRef.current ? parseFloat(getComputedStyle(lySheetRef.current).getPropertyValue('--np-ly-rest')) || 0 : 0)
  const closeLyrics = () => nowPlayingStore.setView('np')

  const BTN_SLOP = 8
  const lySwallowClick = useRef(false)
  const onLyGrabDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!phone || !e.isPrimary) return
    const target = e.target as HTMLElement
    const fromBtn = !!target.closest('button')
    if (!fromBtn) e.currentTarget.setPointerCapture(e.pointerId)
    lySwallowClick.current = false
    lyGrab.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, moved: false, onHandle: !!target.closest('.np-panel-grab'), fromBtn }
    setLyGrabDy(0)
  }
  const onLyGrabMove = (e: PointerEvent<HTMLDivElement>) => {
    if (lyGrabDy === null) return
    const g = lyGrab.current
    const now = performance.now()
    if (now > g.t) g.v = 0.7 * ((e.clientY - g.y) / (now - g.t)) + 0.3 * g.v // px/ms, + = down
    g.y = e.clientY
    g.t = now
    const dy = e.clientY - g.y0
    if (!g.moved) {
      if (Math.abs(dy) <= (g.fromBtn ? BTN_SLOP : 4)) return
      g.moved = true
      if (g.fromBtn) {
        lySwallowClick.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
      }
    }
    setLyGrabDy(lyExpanded ? Math.max(0, dy) : Math.max(-lyRestOffset(), dy))
  }
  const onLyGrabClickCapture = (e: MouseEvent) => {
    if (!lySwallowClick.current) return
    lySwallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }
  const onLyGrabUp = () => {
    if (lyGrabDy === null) return
    const { v, moved, onHandle } = lyGrab.current
    const dy = lyGrabDy
    setLyGrabDy(null)
    if (lySwallowClick.current) window.setTimeout(() => (lySwallowClick.current = false), 350)
    if (!moved) {
      if (onHandle) setLyExpanded((x) => !x)
      return
    }
    if (dy > 0 && (dy > 120 || v > 0.5)) {
      if (lyExpanded && dy < lyRestOffset() + 200 && v < 1.2) setLyExpanded(false)
      else closeLyrics()
    } else if (dy < 0 && !lyExpanded && (dy < -60 || v < -0.5)) setLyExpanded(true)
  }
  const lySheetStyle: CSSProperties | undefined =
    lyGrabDy === null
      ? undefined
      : ({
          transform: `translate3d(0, calc(var(--np-ly-rest) + ${lyGrabDy}px), 0)`,
          '--np-ly-drag-up': `${Math.min(0, lyGrabDy)}px`,
        } as CSSProperties)
  const lyScrimStyle: CSSProperties | undefined =
    lyGrabDy !== null && lyGrabDy > 0 ? { opacity: Math.max(0, 1 - lyGrabDy / Math.max(1, window.innerHeight - (lyExpanded ? 0 : lyRestOffset()))) } : undefined
  const ctx = contextLine(p.context)
  const duration = intro ? (introAudio?.duration ?? 0) : (songTrack?.duration ?? 0)
  const djScene = startView || intro

  const radioOn = p.context?.kind === 'radio'
  const kicker = startView ? 'DJ' : dj.on ? 'PLAYING FROM DJ' : 'PLAYING FROM'
  const fromLabel = startView ? 'Choose how to start' : ctx.label
  const streamQuality = useSettings().streamQuality
  const backToNp = startView && hasSomething

  const fmtQ = (() => {
    const t = songTrack
    if (!t) return null
    if (p.source === 'drive' && streamQuality === 'opus' && t.mobile?.id) return { kind: 'OPUS', detail: `${Number.parseInt(t.mobile.bitrate, 10) || 160}` }
    return { kind: 'FLAC', detail: `${t.flac?.bitDepth ?? 16}/${((t.flac?.sampleRate ?? 44100) / 1000).toString().replace(/\.0$/, '')}` }
  })()
  const chip = dj.on ? (intro ? 'DJ · intro' : dj.addedByUser ? 'DJ · added by you' : 'DJ') : radioOn ? 'Radio' : ''

  const coverEl = (size: 'np' | 'panel') =>
    dj.on ? (
      <div className={`dj-stack ${intro ? 'is-intro' : ''} ${size === 'panel' ? 'is-ly' : ''}`}>
        {intro && item && size === 'np' && <IntroPool item={item} />}
        <div className="dj-stack-cover pg-anim">{cover ? <img className="np-cover" src={cover} alt="" /> : <span className="np-cover np-cover-empty" aria-hidden />}</div>
        <div className="dj-stack-mark pg-anim">{item && <LiveMark item={item} size={size === 'np' ? 480 : 52} fluid active={intro} />}</div>
      </div>
    ) : cover ? (
      <img className="np-cover" src={cover} alt="" />
    ) : (
      <span className="np-cover np-cover-empty" aria-hidden />
    )

  return (
    <div
      ref={rootRef}
      className={`np pg-anim ${closing ? 'is-closing' : ''} ${ly ? 'has-panel' : ''} ${phone ? 'is-phone' : ''} ${djScene ? 'is-dj-scene' : ''} ${startView ? 'is-dj-start' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={startView ? 'DJ' : 'Now playing'}
    >
      <div className="np-bg" aria-hidden>
        {cover && <img key={cover} className="np-bg-img mm-anim" src={cover} alt="" />}
        <span className="np-bg-tone" />
      </div>
      <header className="np-head">
        <button
          ref={closeRef}
          type="button"
          className="np-close"
          title={backToNp ? 'Back to Now playing' : 'Close · Esc'}
          aria-label={backToNp ? 'Back to Now playing' : 'Close'}
          onClick={() => (backToNp ? djUi.closeStart() : nowPlayingStore.close())}
        >
          <Icon name={backToNp ? 'back' : 'chevD'} />
        </button>
        <div className="np-from">
          <div className={`np-from-k ${dj.on && !startView ? 'has-dj' : ''}`}>
            {dj.on && !startView && <DjIcon on />}
            {kicker}
          </div>
          {startView ? (
            <div className="np-from-l">{fromLabel}</div>
          ) : ctx.href ? (
            <NpLink href={ctx.href} className="np-from-l">
              {ctx.label}
            </NpLink>
          ) : (
            <div className="np-from-l">{ctx.label}</div>
          )}
        </div>
        <div className="np-head-r">
          {songTrack && !startView && (
            <IconButton icon="more" label="More: add to playlist, go to album…" title="More" size="lg" className="np-more" onClick={(e) => actions.menu({ kind: 'track', trackId: songTrack.id }, e)} />
          )}
        </div>
      </header>

      {startView && <DjStart phone={phone} onBack={() => (hasSomething ? djUi.closeStart() : nowPlayingStore.close())} />}

      {hasSomething && !startView && (
        <>
          <section className="np-main" aria-hidden={ly} inert={ly}>
            <div className={`np-cover-wrap ${intro ? 'is-intro' : ''}`}>{phone ? <CoverSwipe cover={cover} glow="rgba(0,0,0,0.55)" /> : coverEl('np')}</div>
            <div className={`np-info ${handing ? 'is-handing' : ''}`}>
              {intro && item ? (
                <DjIntroInfo item={item} view={dj} playing={p.playing} phone={phone} />
              ) : (
                songTrack && (
                  <div className="np-text">
                    {!phone && (
                      <div className="np-badges">
                        {fmtQ && (
                          <span className="np-q" title={p.source === 'local' ? 'Playing from a local file' : 'Streaming from Google Drive'}>
                            <b>{fmtQ.kind}</b>
                            {fmtQ.detail}
                          </span>
                        )}
                        {chip && <span className="np-chip">{chip}</span>}
                      </div>
                    )}
                    <div className="np-title-row">
                      <div className="np-title-col">
                        {phone && chip && <span className="np-chip">{chip}</span>}
                        {phone ? <Marquee className="np-title" text={songTrack.title} /> : <h2 className="np-title" title={songTrack.title}>{songTrack.title}</h2>}
                        <div className="np-by">
                          <NpLink href={artistHref(songTrack.artistId)} className="np-artist" title={songTrack.artist}>
                            {songTrack.artist}
                          </NpLink>
                          {songAlbum && (
                            <>
                              {' · '}
                              <NpLink href={albumHref(songAlbum.id)} className="np-album" title={songAlbum.title}>
                                {songAlbum.title}
                              </NpLink>
                            </>
                          )}
                        </div>
                      </div>
                      {phone && fmtQ && (
                        <span className="np-q">
                          <b>{fmtQ.kind}</b>
                          {fmtQ.detail}
                        </span>
                      )}
                    </div>
                  </div>
                )
              )}
              {!intro && songTrack && (
                <WaveSeek className="np-seek" below position={p.position} duration={duration} playing={p.playing} height={phone ? 16 : 18} onSeek={(sec) => playerStore.seek(sec)} />
              )}
              <Transport phone={phone} />
              {!phone && (
                <div className="np-actions">
                  <ViewButtons />
                  <span className="np-flex" />
                  <span className="np-vol">
                    <button type="button" className="np-mute" aria-label={p.muted ? 'Unmute' : 'Mute'} onClick={() => playerStore.toggleMute()}>
                      <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} />
                    </button>
                    <ThinSlider label="Volume" knob width={132} value={p.muted ? 0 : p.volume} onChange={(v) => playerStore.setVolume(v)} />
                  </span>
                </div>
              )}
            </div>
            {phone && (
              <>
                <div className="np-phone-actions">
                  <ViewButtons phone />
                </div>
                {dj.on && <div className="np-dj-hint">Tap DJ to skip this session · tune for the DJ panel</div>}
              </>
            )}
          </section>

          <div
            className={`np-scrim pg-anim ${ly ? 'is-open' : ''} ${lyGrabDy !== null ? 'is-grabbing' : ''}`}
            style={lyScrimStyle}
            onClick={closeLyrics}
            aria-hidden
          />
          <aside
            ref={lySheetRef}
            className={`np-panel np-ly-panel pg-anim ${ly ? 'is-open' : ''} ${lyExpanded ? 'is-expanded' : ''} ${lyGrabDy !== null ? 'is-grabbing' : ''}`}
            style={lySheetStyle}
            aria-label="Lyrics"
            aria-hidden={!ly}
            inert={!ly}
          >
            <div className="np-panel-card">
              <div
                className="np-panel-head"
                onPointerDown={onLyGrabDown}
                onPointerMove={onLyGrabMove}
                onPointerUp={onLyGrabUp}
                onPointerCancel={() => setLyGrabDy(null)}
                onClickCapture={onLyGrabClickCapture}
              >
                {phone && (
                  <div className="np-panel-grab" role="presentation" title={lyExpanded ? 'Drag down to shrink or close' : 'Drag up to expand, down to close'}>
                    <span />
                  </div>
                )}
                <div className="np-panel-head-row">
                  <div className="np-panel-titles">
                    <div className="np-panel-title">Lyrics</div>
                    <div className="np-panel-sub">{intro ? `${dj.session?.title ?? 'DJ'} · spoken intro` : songTrack ? `${songTrack.title} · ${songTrack.artist}` : ''}</div>
                  </div>
                  {!phone && (
                    <IconButton icon="x" label="Close lyrics" title="Close" className="np-panel-x" onClick={closeLyrics} />
                  )}
                </div>
              </div>
              <div className="np-ly-col">{intro && item ? <DjIntroLyrics item={item} line={dj.session?.line ?? ''} /> : songTrack && <Lyrics track={songTrack} position={p.position} playing={p.playing && ly} />}</div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

/** The gold light pool behind the mark, brighter with the voice. */
function IntroPool({ item }: { item: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(
    () =>
      onFrame(() => {
        if (ref.current) ref.current.style.opacity = String(0.35 + introLevel(item) * 0.65)
      }),
    [item],
  )
  return <span ref={ref} className="dj-pool pg-anim" style={{ opacity: 0.35 }} aria-hidden />
}
