/**
 * Desktop player bar (Nov 2026 carousel player): a 100px floating pane inside the main panel
 * (the pane surface + a hairline border, 32px corners).
 *   [ queue carousel: played · HERO (the playing song) · next · pills ]
 *   [ prev · play · next · shuffle · repeat · lyrics · reorder · DJ · devices · quality · volume ]
 *   [ ─────────────── wavy progress with times ─────────────── ]
 * A click on the playing song's card (or on the bar itself) opens the full-screen player.
 *
 * Reorder (the full-screen player closed): the bar grows upward into a tray, in the phone mini
 * player's band style — the outer card turns a lighter neutral and holds the same ReorderView the
 * full-screen player uses; the player row stays as the darker rounded surface under it. Done, Esc,
 * the Reorder button or a click on the dimmed page closes it.
 * Every control comes from nowplaying/parts.tsx; the carousel from nowplaying/carousel.
 */
import { useEffect, useState } from 'react'
import { Icon } from '../design/icons'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { isIntroId } from '../state/player'
import { useDjView } from '../state/djUi'
import { DjButton } from '../dj/DjButton'
import { DevicesButton } from '../sync/DevicesButton'
import { QueueCarousel } from '../nowplaying/carousel/QueueCarousel'
import { ReorderView } from '../nowplaying/carousel/ReorderView'
import { LyricsToggle, PlayerSeek, QualityPill, RepeatToggle, ReorderToggle, ShuffleToggle, Transport, VolumeControl } from '../nowplaying/parts'
import { useCurrent, useDuration } from '../nowplaying/player'

/** How long the tray takes to close (playerbar.css): its content stays mounted that long. */
const TRAY_MS = 420

export function PlayerBar() {
  const { p, id, track } = useCurrent()
  const dj = useDjView()
  const duration = useDuration()
  const intro = isIntroId(id)
  const empty = !track && !intro
  const ui = useNowPlayingUi()
  // reorder mode with the full-screen player closed: the tray (the DJ keeps no upcoming queue)
  const tray = ui.reorder && !ui.open && !dj.on && !empty
  const [mounted, setMounted] = useState(tray)
  if (tray && !mounted) setMounted(true)
  useEffect(() => {
    if (tray) return
    const id = window.setTimeout(() => setMounted(false), TRAY_MS)
    return () => window.clearTimeout(id)
  }, [tray])

  return (
    <>
      {tray && <div className="pb-scrim pg-anim" aria-hidden onClick={() => nowPlayingStore.closeReorder()} />}
      <footer
        className={`pb pg-anim ${empty ? 'is-empty' : ''} ${tray ? 'is-reorder' : ''}`}
        aria-label="Player"
        onClick={(e) => {
          // a click on the bar itself (not a card, control, link, slider or the tray) opens the full-screen player
          if (empty || (e.target as HTMLElement).closest('button, a, input, [role="slider"], .qc, .pb-tray')) return
          nowPlayingStore.open('np')
        }}
      >
        <div className="pb-tray pg-anim" aria-hidden={!tray}>
          {/* the full-screen player has its own ReorderView while it is open */}
          {mounted && !ui.open && (
            <div className="pb-tray-in">
              <ReorderView axis="x" />
            </div>
          )}
        </div>

        <div className="pb-surface">
          {empty ? (
            <div className="pb-empty">
              <span className="pb-empty-ic" aria-hidden>
                <Icon name="song" />
              </span>
              <span className="pb-empty-t">
                <b>Nothing playing</b>
                Pick an album to start
              </span>
            </div>
          ) : (
            <QueueCarousel variant="bar" className="pb-carousel" />
          )}

          <div className="pb-controls">
            <div className="pb-row">
              <Transport play={48} skip={40} />
              <ShuffleToggle />
              <RepeatToggle />
              <span className="pb-sep" aria-hidden />
              <LyricsToggle />
              <ReorderToggle />
              <DjButton variant="bar" />
              <DevicesButton className="pb-devices" />
              <span className="pb-flex" />
              {track && !intro && <QualityPill track={track} />}
              <VolumeControl width={72} />
            </div>
            <PlayerSeek className="pb-seek" idle={empty} duration={duration} playing={p.playing && !empty} />
          </div>
        </div>

        <span className="sr-only" aria-live="polite">
          {intro ? `DJ intro: ${dj.session?.title ?? ''}` : track ? `${p.playing ? 'Playing' : 'Paused'}${p.remote ? ` on ${p.remote.name}` : ''}: ${track.title} by ${track.artist}` : ''}
        </span>
      </footer>
    </>
  )
}
