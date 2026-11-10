/**
 * Desktop player bar (Nov 2026 carousel player): a 100px floating pane inside the main panel
 * (the pane surface + a hairline border, 32px corners).
 *   [ queue carousel: played · HERO (the playing song) · next · pills ]
 *   [ prev · play · next · shuffle · repeat · lyrics · reorder · DJ · devices · quality · volume ]
 *   [ ─────────────── wavy progress with times ─────────────── ]
 * A click on the playing song's card (or on the bar itself) opens the full-screen player.
 * Every control comes from nowplaying/parts.tsx; the carousel from nowplaying/carousel.
 */
import { Icon } from '../design/icons'
import { nowPlayingStore } from '../state/nowPlaying'
import { isIntroId } from '../state/player'
import { useDjView } from '../state/djUi'
import { DjButton } from '../dj/DjButton'
import { DevicesButton } from '../sync/DevicesButton'
import { QueueCarousel } from '../nowplaying/carousel/QueueCarousel'
import { LyricsToggle, PlayerSeek, QualityPill, RepeatToggle, ReorderToggle, ShuffleToggle, Transport, VolumeControl } from '../nowplaying/parts'
import { useCurrent, useDuration } from '../nowplaying/player'
import './playerbar.css'

export function PlayerBar() {
  const { p, id, track } = useCurrent()
  const dj = useDjView()
  const duration = useDuration()
  const intro = isIntroId(id)
  const empty = !track && !intro

  return (
    <footer
      className={`pb ${empty ? 'is-empty' : ''}`}
      aria-label="Player"
      onClick={(e) => {
        // a click on the bar itself (not a card, control, link or slider) opens the full-screen player
        if (empty || (e.target as HTMLElement).closest('button, a, input, [role="slider"], .qc')) return
        nowPlayingStore.open('np')
      }}
    >
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

      <span className="sr-only" aria-live="polite">
        {intro ? `DJ intro: ${dj.session?.title ?? ''}` : track ? `${p.playing ? 'Playing' : 'Paused'}${p.remote ? ` on ${p.remote.name}` : ''}: ${track.title} by ${track.artist}` : ''}
      </span>
    </footer>
  )
}
