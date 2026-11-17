/**
 * Full-screen Now Playing (handoff 04 "Now Playing / full screen, waveform seek" and 08 demo).
 *
 * Fixed overlay over the whole app, album-art tinted scene + atmosphere. Two views that cross-fade
 * (opacity + 28/36px rise, 0.9s default ease; instant with reduced motion):
 *   np      500px cover (phone: drag it sideways to switch songs, CoverSwipe.tsx) · badges · hero title · artist · album · waveform seek · transport ·
 *           Lyrics / Queue · volume · "NEXT —— title" bottom right
 *   lyrics  420px column (272px cover, thin seek, compact transport, buttons) + synced lyrics
 * Opened from the player bar (cover / expand / lyrics); the bar's cover flies into the player and back (coverFlight.ts). Esc or Back closes (AppShell + history).
 * The parts that follow the playback position (seek, times, lyrics) re-render on their own (parts.tsx).
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { IconButton, QualityBadge, qualityKind, qualityLabel } from '../components/ui'
import { Icon } from '../design/icons'
import { LikeButton } from '../components/LikeButton'
import { rgba, sceneBackground, useArtTint } from '../design/tint'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { albumHref } from '../shell/routes'
import { Marquee } from '../components/Marquee'
import { HeroSub, HeroTitle } from './HeroTitle'
import { LiveLyrics } from './Lyrics'
import { CoverSwipe } from './CoverSwipe'
import { useSwipeDown } from './swipe'
import { useCoverFlight } from './coverFlight'
import { BarSeek, LineSeek, NpLink, Transport, UpNextIn, ViewButtons, Volume } from './parts'
import { contextLine, useCurrent, useDuration } from './player'
import { actions } from '../actions/actions'
import { useDjUi, useDjView, djUi } from '../state/djUi'
import { isIntroId } from '../state/player'
import { djIntroInfo } from '../state/dj'
import { DjIcon } from '../dj/DjMark'
import { DjIntroInfo, DjIntroLyrics, LiveMark } from '../dj/DjIntro'
import { DjScreen } from '../dj/DjScreen'
import { introLevel, onFrame } from '../dj/live'
import { registerBack } from '../native/backButton'
import { DevicesButton } from '../sync/DevicesButton'
import { trackOf, albumOf } from '../state/previews'
import { ArtistLink } from '../components/ArtistPicker'

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

/**
 * Desktop (design NowPlayingV2): a pool of the hue glowing left of centre, and water — slow caustics
 * (animated turbulence, screen-blended at 12%) around the cover.
 */
function NpWater({ motion }: { motion: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <>
      <div className="np-pool" aria-hidden />
      <svg className="np-water" aria-hidden>
        <filter id={`npw${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.009 0.014" numOctaves={2} seed={4}>
            {motion && <animate attributeName="baseFrequency" dur="18s" values="0.009 0.014;0.011 0.012;0.008 0.016;0.009 0.014" repeatCount="indefinite" />}
          </feTurbulence>
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 1  -3.2 0 0 0 1.15" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#npw${id})`} />
      </svg>
    </>
  )
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
  const track = intro ? ((p.queue[p.index + 1] && trackOf(data, p.queue[p.index + 1])) || null) : songTrack
  const album = intro ? (track ? albumOf(data, track.albumId) : undefined) : songAlbum
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
  const closeRef = useRef<HTMLButtonElement>(null)
  const duration = useDuration()

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
  // the bar's cover grows into this one on open and shrinks back into the bar on close; desktop:
  // the cover moves between the two views when Now playing ⇄ Lyrics flips
  useCoverFlight(rootRef, { closing, ly, enabled: motion && !startView && !intro && !!songTrack, viewMorph: !phone })
  // mount the lyrics column the first time it's shown, then keep it (so it can fade out)
  const [lyMounted, setLyMounted] = useState(ly)
  if (ly && !lyMounted) setLyMounted(true)
  const ctx = contextLine(p.context)
  const glow = tint ? rgba(tint.glow, 0.9) : 'rgba(255,255,255,0.12)'
  const djScene = startView || intro
  const scene: CSSProperties = { background: tint ? sceneBackground(tint) : '#0B0B0C' }

  const nextIdx = p.index + 1 < p.queue.length ? p.index + 1 : p.repeat === 'all' && p.queue.length > 1 ? 0 : -1
  const nextItem = nextIdx >= 0 ? p.queue[nextIdx] : null
  // while the DJ plays there's no NEXT line: it would give away when a session ends
  const nextTitle = dj.on ? undefined : nextItem ? (isIntroId(nextItem) ? `DJ · ${djIntroInfo(nextItem)?.title ?? 'Next session'}` : trackOf(data, nextItem)?.title) : undefined
  // radio: "RADIO · KEEPS GOING · NEXT  Munich, Editors"
  const radioOn = p.context?.kind === 'radio'
  const nextTrack = radioOn && nextItem ? trackOf(data, nextItem) : undefined
  const nextLabel = radioOn ? (phone ? 'RADIO KEEPS GOING · UP NEXT' : 'RADIO · KEEPS GOING · NEXT') : 'NEXT'
  const nextText = nextTrack ? `${nextTrack.title}, ${nextTrack.artist}` : nextTitle
  // desktop Up next card: "Title · Artist"
  const nextSong = !dj.on && nextItem && !isIntroId(nextItem) ? trackOf(data, nextItem) : undefined
  const nextFull = nextSong ? `${nextSong.title} · ${nextSong.artist}` : undefined
  // (the header is the DJ screen's own while it shows)
  const kicker = p.remote
      ? `PLAYING ON ${p.remote.name.toUpperCase()}`
      : dj.on
        ? dj.addedByUser
          ? 'PLAYING FROM DJ · ADDED BY YOU'
          : 'PLAYING FROM DJ'
        : ctx.kicker

  return (
    <div
      ref={rootRef}
      className={`np pg-anim ${closing ? 'is-closing' : ''} ${ly ? 'is-lyrics' : ''} ${phone ? 'is-phone' : ''} ${djScene ? 'is-dj-scene' : ''} ${startView ? 'is-dj-start' : ''}`}
      style={scene}
      onMouseMove={
        phone
          ? undefined
          : (e) => {
              // CSS vars, no re-render. --mx/--my: −1…1 from the screen's centre (the layers' drift);
              // the cover's tilt (--tx/--ty) and shine (--cx/--cy) are measured from the cover itself, so
              // the light sits under the pointer and the cover leans toward where the pointer really is
              const el = e.currentTarget
              el.style.setProperty('--mx', (e.clientX / window.innerWidth - 0.5) * 2 + '')
              el.style.setProperty('--my', (e.clientY / window.innerHeight - 0.5) * 2 + '')
              const cov = el.querySelector('.np-cov3d')
              if (cov) {
                const r = cov.getBoundingClientRect()
                const k = (v: number) => Math.max(-1, Math.min(1, v))
                el.style.setProperty('--tx', k((e.clientX - r.left - r.width / 2) / (window.innerWidth / 2)) + '')
                el.style.setProperty('--ty', k((e.clientY - r.top - r.height / 2) / (window.innerHeight / 2)) + '')
                el.style.setProperty('--cx', ((e.clientX - r.left) / r.width) * 100 + '%')
                el.style.setProperty('--cy', ((e.clientY - r.top) / r.height) * 100 + '%')
              }
            }
      }
      onMouseLeave={phone ? undefined : (e) => ['--mx', '--my', '--tx', '--ty'].forEach((v) => e.currentTarget.style.setProperty(v, '0'))}
      role="dialog"
      aria-modal="true"
      aria-label={startView ? 'DJ' : 'Now playing'}
    >
      <Atmosphere seed={41} />
      {!phone && <NpWater motion={motion} />}

      {!startView && (
      <header className="np-head">
        <button ref={closeRef} type="button" className="np-close t-mono" onClick={() => nowPlayingStore.close()}>
          <Icon name="chevD" />
          CLOSE
        </button>
        <div className="np-from">
          <div className={`np-from-k t-mono ${dj.on ? 'has-dj' : ''} ${radioOn ? 'has-radio' : ''}`}>
            {dj.on && <DjIcon on />}
            {radioOn && <Icon name="radio" />}
            {kicker}
          </div>
          {ctx.href ? (
            <NpLink href={ctx.href} className="np-from-l">
              {ctx.label}
            </NpLink>
          ) : (
            <div className="np-from-l">{ctx.label}</div>
          )}
        </div>
        <div className="np-head-r">
          <DevicesButton variant="np" />
          {songTrack && !startView && <IconButton icon="more" label="More: add to playlist, go to album…" className="np-more" onClick={(e) => actions.menu({ kind: 'track', trackId: songTrack.id }, e)} />}
        </div>
      </header>
      )}

      {startView && <DjScreen phone={phone} onClose={() => nowPlayingStore.close()} />}

      {hasSomething && !startView && (
        <>
          {/* ── Now playing view ── */}
          <section className="np-main pg-anim" aria-hidden={ly} inert={ly}>
            <div className="np-cover-wrap">
              {phone ? (
                <>
                  {/* phone (design): the cover's blurred reflection glows under it */}
                  {cover && <img className="npp-reflect" src={cover} alt="" aria-hidden />}
                  <CoverSwipe cover={cover} glow={glow} />
                </>
              ) : dj.on ? (
                <div className={`dj-stack ${intro ? 'is-intro' : ''}`}>
                  {intro && item && <IntroPool item={item} />}
                  <div className="dj-stack-cover pg-anim">
                    {cover ? <img className="np-cover" src={cover} alt="" style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px ${glow}` }} /> : <span className="np-cover np-cover-empty" aria-hidden />}
                  </div>
                  <div className="dj-stack-mark pg-anim">{item && <LiveMark item={item} size={500} fluid active={intro} shadow="0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px rgba(0,0,0,0.9)" />}</div>
                </div>
              ) : (
                /* desktop (design): a blurred reflection of the cover glows behind it; the cover tilts a
                   little towards the pointer and a soft light follows it */
                <div className="np-cov3d">
                  {cover && <img className="np-cov-reflect" src={cover} alt="" aria-hidden />}
                  {cover ? (
                    <img className="np-cover" src={cover} alt="" style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px ${glow}` }} />
                  ) : (
                    <span className="np-cover np-cover-empty" aria-hidden />
                  )}
                  <span className="np-cov-shine" aria-hidden />
                </div>
              )}
            </div>
            <div className={`np-info ${handing ? 'is-handing' : ''}`}>
              {intro && item ? (
                <DjIntroInfo item={item} view={dj} playing={p.playing} phone={phone} />
              ) : (
                songTrack && (
                  <>
                    <div className="np-text">
                      <HeroTitle title={songTrack.title} phone={phone} />
                      <div className="np-sub-row">
                        <HeroSub
                          text={`${songTrack.artist}\n${songAlbum?.title ?? ''}`}
                          artist={
                            <ArtistLink track={songTrack} className="np-artist" onNavigate={nowPlayingStore.closeAndGo}>
                              {songTrack.artist}
                            </ArtistLink>
                          }
                          album={
                            songAlbum && (
                              <NpLink href={albumHref(songAlbum.id)} className="np-album" title={songAlbum.title}>
                                {songAlbum.title}
                              </NpLink>
                            )
                          }
                        />
                        {phone && <LikeButton trackId={songTrack.id} size="md" ink className="np-like" />}
                      </div>
                    </div>
                    {phone ? <BarSeek duration={duration} playing={p.playing} bars={56} height={40} /> : <BarSeek duration={duration} playing={p.playing} />}
                  </>
                )
              )}
              <Transport />
              <div className="np-actions">
                <ViewButtons phone={phone} />
                {songTrack && !intro && !phone && <LikeButton trackId={songTrack.id} size="md" ink className="np-like" />}
                <span className="np-flex" />
                <Volume size="sm" sliderClass="np-vol" />
              </div>
              {!phone && nextText && !intro && (
                <button type="button" className="np-up" onClick={() => playerStore.next()} title="Skip to next" tabIndex={ly ? -1 : 0}>
                  <NextArt item={nextItem} />
                  <span className="np-up-text">
                    <span className="np-up-k t-mono">{radioOn ? 'Radio keeps going · next' : <UpNextIn duration={duration} />}</span>
                    <span className="np-up-t">{nextFull ?? nextText}</span>
                  </span>
                  <Icon name="next" className="np-up-ic" />
                </button>
              )}
            </div>
          </section>
          {phone && nextText && (
            <button type="button" className={`np-next pg-anim ${radioOn ? 'is-radio' : ''}`} onClick={() => playerStore.next()} title="Skip to next" tabIndex={ly ? -1 : 0}>
              <span className="t-mono">{nextLabel}</span>
              <span className="np-next-line" />
              <span className="np-next-t">{nextText}</span>
            </button>
          )}

          {/* ── Lyrics view ── */}
          <section className="np-ly pg-anim" aria-hidden={!ly} inert={!ly}>
            {phone ? (
              /* phone (design, PhoneLyricsV2): the lyrics come up as a sheet over the player — handle,
                 "Lyrics" with song · artist, a white play/pause and close */
              <div className="npp-strip npp-sheet-head">
                <button type="button" className="npp-handle" aria-label="Close lyrics" onClick={() => nowPlayingStore.toggleLyrics()}>
                  <span />
                </button>
                <div className="npp-sheet-row">
                  <div className="npp-strip-text">
                    <span className="npp-sheet-t">Lyrics</span>
                    <Marquee className="npp-strip-sub" text={intro ? `${dj.session?.title ?? 'DJ'} · Spoken intro` : songTrack ? `${songTrack.title} · ${songTrack.artist}` : ''} />
                  </div>
                  <IconButton icon={p.playing ? 'pauseF' : 'playF'} label={p.playing ? 'Pause' : 'Play'} className="npp-sheet-play" onClick={() => playerStore.toggle()} />
                  <IconButton icon="x" label="Close lyrics" bare className="npp-sheet-x" onClick={() => nowPlayingStore.toggleLyrics()} />
                </div>
              </div>
            ) : (
              <div className="np-ly-side">
                {dj.on ? (
                  <div className={`dj-stack is-ly ${intro ? 'is-intro' : ''}`}>
                    <div className="dj-stack-cover pg-anim">{cover ? <img className="np-ly-cover" src={cover} alt="" /> : <span className="np-ly-cover np-cover-empty" aria-hidden />}</div>
                    <div className="dj-stack-mark pg-anim">{item && <LiveMark item={item} size={272} fluid active={intro && ly} />}</div>
                  </div>
                ) : cover ? (
                  <img className="np-ly-cover" src={cover} alt="" />
                ) : (
                  <span className="np-ly-cover np-cover-empty" aria-hidden />
                )}
                <div className="np-ly-text">
                  {dj.on && <div className="np-ly-meta t-mono">{intro ? 'DJ · INTRO' : dj.addedByUser ? 'DJ · ADDED BY YOU' : 'PLAYING FROM DJ'}</div>}
                  {intro ? (
                    <>
                      <div className="np-ly-title" title={dj.session?.title}>
                        {dj.session?.title}
                      </div>
                      <div className="np-ly-sub">Spoken intro</div>
                    </>
                  ) : (
                    songTrack && (
                      <>
                        <div className="np-ly-title" title={songTrack.title}>
                          {songTrack.title}
                        </div>
                        <div className="np-ly-sub">
                          <ArtistLink track={songTrack} onNavigate={nowPlayingStore.closeAndGo}>
                            {songTrack.artist}
                          </ArtistLink>
                          {songAlbum && (
                            <>
                              {' · '}
                              <NpLink href={albumHref(songAlbum.id)}>{songAlbum.title}</NpLink>
                            </>
                          )}
                        </div>
                      </>
                    )
                  )}
                </div>
                <LineSeek duration={duration} />
                <Transport compact />
                <div className="np-actions">
                  <ViewButtons size="sm" />
                </div>
              </div>
            )}
            <div className="np-ly-col">
              {lyMounted && (intro && item ? <DjIntroLyrics item={item} line={dj.session?.line ?? ''} /> : songTrack && <LiveLyrics track={songTrack} playing={p.playing && ly} />)}
            </div>
            {phone && <div className="npp-sheet-foot t-mono">Tap a line to jump · tap the handle to close</div>}
          </section>
        </>
      )}
    </div>
  )
}

/** Up next: the next song's cover (42px). */
function NextArt({ item }: { item: string | null }) {
  const { data } = useLibrary()
  const t = item ? trackOf(data, item) : null
  const al = t ? albumOf(data, t.albumId) : undefined
  const url = useCover(al?.cover)
  return url ? <img className="np-up-art" src={url} alt="" /> : <span className="np-up-art is-empty" aria-hidden />
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
