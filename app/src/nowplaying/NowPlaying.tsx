/**
 * Full-screen player (Nov 2026 carousel player): the queue *is* the full-screen player.
 *
 * Desktop:                                         Phone:
 *   close · PLAYING FROM … · quality devices more    close · PLAYING FROM … · devices more
 *   [ played · HERO · next · pills ][ lyrics ]       [ played · HERO · next ]
 *   prev play next ~~~~ seek ~~~~ shuffle repeat      ~~~~ seek ~~~~
 *   DJ lyrics reorder volume                         shuffle · prev play next · repeat
 *                                                    [ lyrics, when on ]
 *                                                    Lyrics · DJ · Reorder
 *
 * - Background: the cover, hugely blurred (.np-bg), violet during the DJ's own scenes.
 * - Lyrics slide in beside the carousel (desktop, 520px; the carousel narrows) or under the controls
 *   (phone; the carousel shrinks). While the DJ speaks an intro the same slot shows the intro (the
 *   spoken line, word by word); the lyrics toggle switches it to the line as lyric lines.
 * - Reorder swaps the carousel for the reorder strip (desktop) / list (phone): ReorderView.
 * - The DJ's start view (DJ off → DJ button) takes the whole body.
 * Opened from the player bar / mini player; Esc, Back or (phone) a swipe down closes it.
 */
import { useEffect, useRef, useState } from 'react'
import { IconButton, WaveSeek } from '../components/ui'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { isIntroId, playerStore } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { Lyrics } from './Lyrics'
import { useSwipeDown } from './swipe'
import { LyricsToggle, NpLink, QualityPill, RepeatToggle, ReorderToggle, ShuffleToggle, Transport, VolumeControl } from './parts'
import { contextLine, useCurrent, useDuration } from './player'
import { QueueCarousel } from './carousel/QueueCarousel'
import { ReorderView } from './carousel/ReorderView'
import { actions } from '../actions/actions'
import { useDjUi, useDjView, djUi } from '../state/djUi'
import { DjIcon } from '../dj/DjMark'
import { DjIntroInfo, DjIntroLyrics } from '../dj/DjIntro'
import { DjButton } from '../dj/DjButton'
import { DjStart } from '../dj/DjStart'
import { registerBack } from '../native/backButton'
import { DevicesButton } from '../sync/DevicesButton'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { trackOf, albumOf } from '../state/previews'
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
  const { p, id, track } = useCurrent()
  const { data } = useLibrary()
  const dj = useDjView()
  const djui = useDjUi()
  const phone = useIsPhone()
  const duration = useDuration()
  const intro = isIntroId(id)
  const startView = djui.start
  const hasSomething = !!track || intro
  // the background follows the playing song; during an intro, the song it hands over to
  const bgTrack = intro ? (p.queue[p.index + 1] && trackOf(data, p.queue[p.index + 1])) || null : track
  const cover = useCover(bgTrack ? albumOf(data, bgTrack.albumId)?.cover : undefined)
  const closeRef = useRef<HTMLButtonElement>(null)

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
  // the side slot: lyrics, or the intro while the DJ speaks
  const side = !reorder && !startView && (ly || intro)

  // phone: swipe down anywhere (outside sliders, lyrics, the reorder list) to close
  const rootRef = useRef<HTMLDivElement>(null)
  useSwipeDown(rootRef, phone && !closing && !startView && !reorder, closeNp)

  const ctx = contextLine(p.context)
  const backToNp = startView && hasSomething
  const djScene = startView || intro

  const seek = <WaveSeek className="np-seek" below={phone} position={p.position} duration={duration} playing={p.playing} height={phone ? 16 : 14} onSeek={(s) => playerStore.seek(s)} />

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

  return (
    <div
      ref={rootRef}
      className={`np pg-anim ${closing ? 'is-closing' : ''} ${phone ? 'is-phone' : ''} ${side ? 'has-side' : ''} ${reorder ? 'is-reorder' : ''} ${djScene ? 'is-dj-scene' : ''} ${startView ? 'is-dj-start' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={startView ? 'DJ' : 'Now playing'}
    >
      <div className="np-bg" aria-hidden>
        {cover && <img key={cover} className="np-bg-img mm-anim" src={cover} alt="" />}
        <span className="np-bg-tone" />
      </div>

      <header className="np-head">
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

      {hasSomething && !startView && (
        <>
          <div className="np-body">
            <section className="np-stage" aria-label="Queue">
              {reorder ? <ReorderView axis={phone ? 'y' : 'x'} /> : <QueueCarousel variant="full" />}
            </section>
            {!phone && sidePanel}
          </div>

          {phone ? (
            <>
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
          ) : (
            <div className="np-controls">
              <Transport play={64} skip={48} />
              {seek}
              <ShuffleToggle />
              <RepeatToggle />
              <span className="np-sep" aria-hidden />
              <DjButton variant="np" />
              <LyricsToggle />
              <ReorderToggle />
              <span className="np-sep" aria-hidden />
              <VolumeControl width={96} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
