/**
 * Full-screen player (Nov 2026 carousel player).
 *
 * Desktop — square hero + info, the queue as a strip underneath:
 *   close · PLAYING FROM … · quality devices more
 *   [ square cover ]  NOW PLAYING / title ♥ / artist · album / ~~~ seek ~~~        [ lyrics ]
 *                     shuffle ⏮ ▶ ⏭ repeat | lyrics reorder DJ
 *   Up next ─ [ next, large ][ after, medium ][■][■][■]…   (scroll back for the played songs)
 *   Reorder: the hero row gets smaller and the strip becomes the drag strip (ReorderView, axis x).
 *
 * Phone — the queue carousel is the hero:
 *   close · PLAYING FROM … · devices more / [ carousel ] / seek / shuffle ⏮ ▶ ⏭ repeat / [ lyrics ]
 *   / Lyrics · DJ · Reorder. It morphs out of the mini card: while the mini player's handle (or this
 *   header) is dragged, --np-t runs 0 → 1 and the layout blends between the two (lift.ts).
 *
 * Background: the cover, hugely blurred (.np-bg), violet during the DJ's own scenes. While the DJ speaks
 * an intro the lyrics slot shows the intro; the DJ's start view takes the whole body.
 * Opened from the player bar / mini player; Esc, Back or (phone) dragging the header down closes it.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlbumEq, IconButton, WaveSeek } from '../components/ui'
import { LikeButton } from '../components/LikeButton'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, isIntroId } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { albumHref, artistHref } from '../shell/routes'
import { Lyrics } from './Lyrics'
import { useLiftDrag } from './lift'
import { LyricsToggle, NpLink, QualityPill, RepeatToggle, ReorderToggle, ShuffleToggle, Transport } from './parts'
import { contextLine, nowKicker, useCurrent, useDuration } from './player'
import { QueueCarousel } from './carousel/QueueCarousel'
import { ReorderView } from './carousel/ReorderView'
import { useQueueItem } from './carousel/useQueueItem'
import { ItemArt } from './carousel/ItemArt'
import { actions } from '../actions/actions'
import { useDjUi, useDjView, djUi } from '../state/djUi'
import { DjIcon } from '../dj/DjMark'
import { DjIntroInfo, DjIntroLyrics, IntroSub } from '../dj/DjIntro'
import { DjButton } from '../dj/DjButton'
import { DjStart } from '../dj/DjStart'
import { registerBack } from '../native/backButton'
import { DevicesButton } from '../sync/DevicesButton'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { trackOf, albumOf } from '../state/previews'
import '../dj/dj.css'
import './nowplaying.css'

/** how long the open / close (and the phone morph's settle) takes; matches nowplaying.css */
const SETTLE_MS = 460

export function NowPlaying() {
  const ui = useNowPlayingUi()
  const motion = useMotion()
  // mounted while open, while being dragged open, and through the closing animation
  const want = ui.open || ui.lift !== null
  const [mounted, setMounted] = useState(want)
  if (want && !mounted) setMounted(true)
  if (!want && mounted && !motion) setMounted(false)
  useEffect(() => {
    if (want || !mounted || !motion) return
    const t = window.setTimeout(() => setMounted(false), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [want, mounted, motion])

  if (!mounted) return null
  return <NowPlayingScreen closing={!want} />
}

function NowPlayingScreen({ closing }: { closing: boolean }) {
  const ui = useNowPlayingUi()
  const { p, id, track, album } = useCurrent()
  const { data } = useLibrary()
  const dj = useDjView()
  const djui = useDjUi()
  const phone = useIsPhone()
  const duration = useDuration()
  const intro = isIntroId(id)
  const startView = djui.start
  const hasSomething = !!track || intro
  const item = useQueueItem(id ?? '')
  // the background follows the playing song; during an intro, the song it hands over to
  const bgTrack = intro ? (p.queue[p.index + 1] && trackOf(data, p.queue[p.index + 1])) || null : track
  const cover = useCover(bgTrack ? albumOf(data, bgTrack.albumId)?.cover : undefined)
  const closeRef = useRef<HTMLButtonElement>(null)
  const headDrag = useLiftDrag('full')

  // phone morph: 0 = the mini card, 1 = full screen. Opening animates 0 → 1 from the first frame.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const dragging = ui.lift !== null
  const t = ui.lift ?? (closing || !entered ? 0 : 1)

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

  const reorder = ui.reorder && !startView && !dj.on
  const ly = ui.view === 'lyrics' && !startView && !reorder
  // the lyrics slot: lyrics, or the intro while the DJ speaks
  const side = !reorder && !startView && (ly || intro) && !(phone && dragging)

  const ctx = contextLine(p.context)
  const backToNp = startView && hasSomething
  const djScene = startView || intro

  const seek = <WaveSeek className="np-seek" below position={p.position} duration={duration} playing={p.playing} height={phone ? 16 : 14} onSeek={(s) => playerStore.seek(s)} />

  const sidePanel = side && (
    <aside className="np-side" aria-label={ly ? 'Lyrics' : 'DJ intro'}>
      <div className="np-side-head">
        <div className="np-side-titles">
          <div className="np-side-title">{ly ? 'Lyrics' : 'DJ intro'}</div>
          <div className="np-side-sub">{intro ? (dj.session?.title ?? 'DJ') : track ? `${track.title} · ${track.artist}` : ''}</div>
        </div>
        {ly && !phone && <IconButton icon="x" label="Close lyrics" title="Close" onClick={() => nowPlayingStore.setView('np')} />}
      </div>
      <div className="np-side-body">
        {intro && id ? (
          ly ? (
            <DjIntroLyrics item={id} line={dj.session?.line ?? ''} />
          ) : (
            <div className="np-side-intro">
              <DjIntroInfo item={id} view={dj} playing={p.playing} phone={phone} />
            </div>
          )
        ) : (
          track && <Lyrics track={track} position={p.position} playing={p.playing && ly} />
        )}
      </div>
    </aside>
  )

  const cls = [
    'np pg-anim',
    closing && 'is-closing',
    phone && 'is-phone',
    phone && dragging && 'is-dragging',
    side && 'has-side',
    reorder && 'is-reorder',
    djScene && 'is-dj-scene',
    startView && 'is-dj-start',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={phone ? ({ '--np-t': t } as CSSProperties) : undefined} role="dialog" aria-modal="true" aria-label={startView ? 'DJ' : 'Now playing'}>
      <div className="np-bg" aria-hidden>
        {cover && <img key={cover} className="np-bg-img mm-anim" src={cover} alt="" />}
        <span className="np-bg-tone" />
      </div>

      {/* phone: the mini card's handle band, fading out as the player grows */}
      {phone && (
        <div
          className="np-band"
          aria-hidden
          onPointerDown={headDrag.onPointerDown}
          onPointerMove={headDrag.onPointerMove}
          onPointerUp={headDrag.onPointerUp}
          onPointerCancel={headDrag.onPointerCancel}
        >
          <span />
        </div>
      )}

      <header
        className="np-head"
        onPointerDown={phone ? headDrag.onPointerDown : undefined}
        onPointerMove={phone ? headDrag.onPointerMove : undefined}
        onPointerUp={phone ? headDrag.onPointerUp : undefined}
        onPointerCancel={phone ? headDrag.onPointerCancel : undefined}
      >
        <IconButton
          ref={closeRef}
          icon={backToNp ? 'back' : 'chevD'}
          label={backToNp ? 'Back to Now playing' : 'Close'}
          title={backToNp ? 'Back to Now playing' : 'Close · Esc'}
          size="lg"
          className="np-close"
          onClick={() => (backToNp ? djUi.closeStart() : nowPlayingStore.close())}
        />
        <div className="np-from">
          <div className={`np-from-k ${dj.on && !startView ? 'has-dj' : ''}`}>
            {dj.on && !startView && <DjIcon on />}
            {startView ? 'DJ' : dj.on ? 'PLAYING FROM DJ' : 'PLAYING FROM'}
          </div>
          {startView ? (
            <div className="np-from-l">Choose how to start</div>
          ) : ctx.href ? (
            <NpLink href={ctx.href} className="np-from-l">
              {ctx.label}
            </NpLink>
          ) : (
            <div className="np-from-l">{ctx.label}</div>
          )}
        </div>
        <div className="np-head-r">
          {!startView && !phone && track && <QualityPill track={track} />}
          {!startView && <DevicesButton variant="np" />}
          {track && !startView && <IconButton icon="more" label="More: add to playlist, go to album…" title="More" size="lg" onClick={(e) => actions.menu({ kind: 'track', trackId: track.id }, e)} />}
        </div>
      </header>

      {startView && <DjStart phone={phone} onBack={() => (hasSomething ? djUi.closeStart() : nowPlayingStore.close())} />}

      {hasSomething && !startView && phone && (
        <>
          <div className="np-body">
            <section className="np-stage" aria-label="Queue">
              {reorder ? <ReorderView axis="y" /> : <QueueCarousel variant="full" morph={t} />}
            </section>
          </div>
          {!reorder && (
            <div className="np-phone-controls">
              {seek}
              <div className="np-transport-row">
                <ShuffleToggle size="lg" />
                <Transport play={72} skip={56} />
                <RepeatToggle size="lg" />
              </div>
            </div>
          )}
          {sidePanel}
          <div className="np-bottom">
            <LyricsToggle text />
            <DjButton variant="phone" />
            <ReorderToggle text />
          </div>
        </>
      )}

      {hasSomething && !startView && !phone && (
        <>
          <div className="np-main">
            <section className="np-hero" aria-label="Now playing">
              <div className="np-cover">
                <ItemArt item={item} size={440} active />
              </div>
              <div className="np-info">
                <div className="np-text">
                  <span className={`np-kicker ${dj.on ? 'is-dj' : ''}`}>
                    {!intro && <AlbumEq height={12} on={p.playing} />}
                    {nowKicker(p, dj)}
                  </span>
                  <div className="np-title-row">
                    <h1 className="np-title" title={item.title}>
                      {item.title}
                    </h1>
                    {track && <LikeButton trackId={track.id} size="lg" ink className="np-like" />}
                  </div>
                  <div className="np-by">
                    {intro && id ? (
                      <IntroSub item={id} />
                    ) : (
                      track && (
                        <>
                          <NpLink href={artistHref(track.artistId)}>{track.artist}</NpLink>
                          {album && (
                            <>
                              {' · '}
                              <NpLink href={albumHref(album.id)}>{album.title}</NpLink>
                            </>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>
                {seek}
                <div className="np-row">
                  <ShuffleToggle />
                  <Transport play={64} skip={48} />
                  <RepeatToggle />
                  <span className="np-sep" aria-hidden />
                  <LyricsToggle />
                  <ReorderToggle />
                  <DjButton variant="np" />
                </div>
              </div>
            </section>
            {sidePanel}
          </div>

          {reorder ? (
            <section className="np-queue is-reorder" aria-label="Reorder queue">
              <ReorderView axis="x" />
            </section>
          ) : (
            <section className="np-queue" aria-label="Queue">
              <div className="np-queue-head">
                <span className="np-queue-title">{dj.on ? 'The DJ picks what plays next' : 'Up next'}</span>
                <span className="np-queue-hint">{dj.on ? 'Played songs and the current one' : 'Scroll or click to browse · hold a song to reorder'}</span>
              </div>
              <QueueCarousel variant="strip" className="np-strip" />
            </section>
          )}
        </>
      )}
    </div>
  )
}
