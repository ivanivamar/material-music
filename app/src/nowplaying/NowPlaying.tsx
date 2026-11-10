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
 *   close · PLAYING FROM … · devices more / [ carousel ] / seek / shuffle ⏮ ▶ ⏭ repeat
 *   / Lyrics · DJ · Reorder. It morphs out of the mini card: while the mini player's handle (or this
 *   header) is dragged, --np-t runs 0 → 1 and the layout blends between the two (lift.ts).
 *   Lyrics open in the shared bottom sheet (components/ui Sheet) from just under the header to the
 *   bottom of the screen, with play / pause in its head. A DJ intro on its own still shows inline
 *   under the controls.
 *
 * Background: the cover, hugely blurred (.np-bg), violet during the DJ's own scenes. While the DJ speaks
 * an intro the lyrics slot shows the intro; the DJ's start view takes the whole body.
 * Opened from the player bar / mini player; Esc, Back or (phone) dragging the header down closes it.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlbumEq, IconButton, Sheet } from '../components/ui'
import { LikeButton } from '../components/LikeButton'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, isIntroId } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { albumHref, artistHref } from '../shell/routes'
import { LiveLyrics } from './Lyrics'
import { SETTLE_MS, useLiftDrag, useMorph } from './lift'
import { LyricsToggle, NpLink, PlayerSeek, QualityPill, RepeatToggle, ReorderToggle, ShuffleToggle, Transport } from './parts'
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
  const motion = useMotion()

  // phone morph: 0 = the mini card, 1 = full screen (follows the finger, then glides to the end)
  const dragging = ui.lift !== null
  const t = useMorph(ui.lift, closing ? 0 : 1, motion)

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

  // phone: the lyrics open in the shared bottom sheet; only a DJ intro on its own stays inline
  const sheetOn = phone && !!side && ly
  const inline = side && !sheetOn

  const ctx = contextLine(p.context)
  const backToNp = startView && hasSomething
  const djScene = startView || intro

  const seek = <PlayerSeek className="np-seek" below duration={duration} playing={p.playing} height={phone ? 16 : 14} />

  const sideSub = intro ? (dj.session?.title ?? 'DJ') : track ? `${track.title} · ${track.artist}` : ''
  const sideBody = (lyrics: boolean) =>
    intro && id ? (
      lyrics ? (
        <DjIntroLyrics item={id} line={dj.session?.line ?? ''} />
      ) : (
        <div className="np-side-intro">
          <DjIntroInfo item={id} view={dj} playing={p.playing} phone={phone} />
        </div>
      )
    ) : (
      track && <LiveLyrics track={track} playing={p.playing && ly} />
    )

  const sidePanel = inline && (
    <aside className="np-side" aria-label={ly ? 'Lyrics' : 'DJ intro'}>
      <div className="np-side-head">
        <div className="np-side-titles">
          <div className="np-side-title">{ly ? 'Lyrics' : 'DJ intro'}</div>
          <div className="np-side-sub">{sideSub}</div>
        </div>
        {ly && !phone && <IconButton icon="x" label="Close lyrics" title="Close" onClick={() => nowPlayingStore.setView('np')} />}
      </div>
      <div className="np-side-body">{sideBody(ly)}</div>
    </aside>
  )

  const cls = [
    'np pg-anim',
    closing && 'is-closing',
    phone && 'is-phone',
    phone && (dragging || (t > 0 && t < 1)) && 'is-morphing',
    inline && 'has-side',
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
        >
          <span />
        </div>
      )}

      <header
        className="np-head"
        onPointerDown={phone ? headDrag.onPointerDown : undefined}
        // the "Playing from" link would otherwise start a native link drag instead of ours
        onDragStart={phone ? (e) => e.preventDefault() : undefined}
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
          {/* lyrics: the shared bottom sheet, from under the header down (nowplaying.css .np-ly-sheet) */}
          <Sheet
            open={sheetOn}
            onClose={() => nowPlayingStore.setView('np')}
            label="Lyrics"
            title="Lyrics"
            meta={sideSub}
            headerActions={<IconButton icon={p.playing ? 'pauseF' : 'playF'} label={p.playing ? 'Pause' : 'Play'} size="sm" variant="soft" onClick={() => playerStore.toggle()} />}
            tone="glass"
            lightScrim
            className="np-ink np-ly-sheet"
            bodyClassName="np-ly-body"
          >
            {/* the lyrics scroll by touch themselves: only the sheet's head drags it */}
            <div className="np-ly-fill" data-no-sheet-drag>
              {sideBody(true)}
            </div>
          </Sheet>
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
                <span className="np-queue-hint">{dj.on ? 'Played songs and the current one' : 'Click to play · scroll to browse · right-click for more'}</span>
              </div>
              <QueueCarousel variant="strip" className="np-strip" />
            </section>
          )}
        </>
      )}
    </div>
  )
}
