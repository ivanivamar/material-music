/**
 * Desktop player bar, 84px (handoff 04 Desktop):
 * grid  [now playing | 560px transport + seek | quality · lyrics · queue · volume]
 */
import { IconButton, PlayButton, QualityBadge, SeekBar, Slider, qualityKind, qualityLabel, useToast } from '../components/ui'
import { useCover } from '../lib/covers'
import { useLibrary, type Track } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { Icon } from '../design/icons'
import { Marquee } from '../components/Marquee'
import { isNative } from '../native/bridge'
import { albumHref, artistHref } from './routes'
import { isIntroId } from '../state/player'
import { djIntroInfo } from '../state/dj'
import { useDjView } from '../state/djUi'
import { useIntroAudio } from '../dj/voice'
import { DjButton } from '../dj/DjButton'
import { IntroSub, LiveMark } from '../dj/DjIntro'
import './playerbar.css'

export function PlayerBar() {
  const p = usePlayer()
  const { data } = useLibrary()
  const toast = useToast()
  const ui = useNowPlayingUi()
  const id = p.index >= 0 ? p.queue[p.index] : null
  const track: Track | null = (id && data?.tracks[id]) || null
  const album = track ? data?.albums[track.albumId] : undefined
  const cover = useCover(album?.cover)
  const dj = useDjView()
  const intro = dj.on && isIntroId(id) && !!dj.session
  const introAudio = useIntroAudio(intro && id ? djIntroInfo(id)?.sessionId : null)
  const duration = intro ? (introAudio?.duration ?? 0) : (track?.duration ?? 0)
  const empty = !track && !intro
  const radio = p.context?.kind === 'radio'
  const djChip = dj.on ? <span className="dj-chip">{intro ? 'DJ · INTRO' : 'DJ'}</span> : radio ? <span className="radio-chip">RADIO</span> : null
  // shuffle / repeat: not used by the DJ or a radio
  const fixed = dj.on || radio
  const offLabel = dj.on ? 'Not used by the DJ' : 'Not used by the radio'

  const onPlay = () => {
    if (!playerStore.hasEngine()) {
      toast.show({ icon: 'alert', mutedIcon: true, text: 'The audio engine isn’t running.', meta: 'RELOAD THE PAGE' })
      return
    }
    playerStore.toggle()
  }
  const sourceLabel = p.source === 'local' ? (isNative ? 'Stored on this phone' : 'Playing from your local folder') : p.source === 'drive' ? 'Streaming from Google Drive' : undefined

  return (
    <footer
      className={`pb ${empty ? 'is-empty' : ''}`}
      aria-label="Player"
      onClick={(e) => {
        // a click on the bar itself (not on a control, link or slider) opens the full-screen player
        if (empty || (e.target as HTMLElement).closest('button, a, input, [role="slider"]')) return
        nowPlayingStore.open('np')
      }}
    >
      <div className="pb-now">
        {empty ? (
          <>
            <span className="pb-cover pb-cover-empty" aria-hidden />
            <div className="pb-text">
              <div className="pb-title pb-title-empty">Nothing playing</div>
              <div className="pb-sub t-mono">PICK AN ALBUM TO START</div>
            </div>
          </>
        ) : intro && id && dj.session ? (
          <>
            <button type="button" className="pb-expand" onClick={() => nowPlayingStore.open('np')} aria-label="Open Now Playing" title="Now Playing">
              <LiveMark item={id} size={52} />
              <span className="pb-expand-ic" aria-hidden>
                <Icon name="chevU" />
              </span>
            </button>
            <div className="pb-text">
              <div className="pb-title pb-dj-title" title={dj.session.title}>
                <Marquee text={dj.session.title} />
                {djChip}
              </div>
              <div className="pb-sub">
                <IntroSub item={id} />
              </div>
            </div>
          </>
        ) : (
          track && <>
            <button type="button" className="pb-expand" onClick={() => nowPlayingStore.open('np')} aria-label="Open Now Playing" title="Now Playing">
              {cover ? <img className="pb-cover" src={cover} alt="" /> : <span className="pb-cover pb-cover-empty" aria-hidden />}
              <span className="pb-expand-ic" aria-hidden>
                <Icon name="chevU" />
              </span>
            </button>
            <div className="pb-text">
              <div className="pb-dj-title">
                <a className="pb-title pb-link" href={albumHref(track.albumId)} title={album ? `${track.title} — ${album.title}` : track.title}>
                  <Marquee text={track.title} />
                </a>
                {djChip}
              </div>
              <a className="pb-sub pb-link" href={artistHref(track.artistId)} title={track.artist}>
                <Marquee text={track.artist} />
              </a>
            </div>
          </>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-transport">
          <IconButton
            icon="shuffle"
            label={fixed ? offLabel : p.shuffle ? 'Shuffle on' : 'Shuffle'}
            bare
            size="sm"
            pressed={!fixed && p.shuffle}
            className={`pb-mode ${!fixed && p.shuffle ? 'is-on' : ''} ${fixed ? 'is-dj-off' : ''}`}
            onClick={() => !fixed && playerStore.toggleShuffle()}
          />
          <IconButton icon="prev" label="Previous" bare size="sm" className="pb-skip" disabled={empty} onClick={() => playerStore.prev()} />
          <PlayButton size={38} state={p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'} onClick={empty ? undefined : onPlay} />
          <IconButton icon="next" label="Next" bare size="sm" className="pb-skip" disabled={empty} onClick={() => playerStore.next()} />
          <span className="pb-repeat-wrap">
            <IconButton
              icon="repeat"
              label={fixed ? offLabel : p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
              bare
              size="sm"
              pressed={!fixed && p.repeat !== 'off'}
              className={`pb-mode ${!fixed && p.repeat !== 'off' ? 'is-on' : ''} ${fixed ? 'is-dj-off' : ''}`}
              onClick={() => !fixed && playerStore.cycleRepeat()}
            />
            {!fixed && p.repeat === 'one' && <span className="pb-repeat-one" aria-hidden>1</span>}
          </span>
        </div>
        <SeekBar compact position={empty ? 0 : p.position} duration={duration} onSeek={(s) => playerStore.seek(s)} />
      </div>

      <div className="pb-right">
        {track && !intro && (
          <span className="pb-quality" title={sourceLabel}>
            {p.source && <span className="pb-source t-mono">{p.source === 'local' ? (isNative ? 'OFFLINE' : 'LOCAL') : 'DRIVE'}</span>}
            <QualityBadge kind={qualityKind('flac', track.flac?.bitDepth, track.flac?.sampleRate)}>
              {qualityLabel('flac', { bitDepth: track.flac?.bitDepth, sampleRate: track.flac?.sampleRate })}
            </QualityBadge>
          </span>
        )}
        <IconButton icon="lyrics" label="Lyrics" bare size="sm" disabled={empty} className={`pb-panel ${ui.open && ui.view === 'lyrics' ? 'is-on' : ''}`} onClick={() => nowPlayingStore.toggleLyrics()} />
        {dj.on ? (
          <span className="dj-off-wrap">
            <IconButton icon="queue" label="Queue: not available while the DJ plays" bare size="sm" className="pb-panel is-dj-off" onClick={() => {}} />
            <span className="dj-off-tip" role="tooltip">
              Not available while the DJ plays
            </span>
          </span>
        ) : (
          <IconButton icon="queue" label="Queue" bare size="sm" disabled={empty} pressed={ui.queue} className={`pb-panel ${ui.queue ? 'is-on' : ''}`} onClick={() => nowPlayingStore.toggleQueue()} />
        )}
        <DjButton variant="bar" />
        <span className="pb-volume">
          <IconButton icon={p.muted || p.volume === 0 ? 'mute' : 'volume'} label={p.muted ? 'Unmute' : 'Mute'} bare size="sm" onClick={() => playerStore.toggleMute()} />
          <Slider
            label="Volume"
            variant="volume"
            knob={0}
            height={14}
            value={p.muted ? 0 : p.volume}
            onChange={(v) => playerStore.setVolume(v)}
            valueText={(v) => `${Math.round(v * 100)}%`}
            step={0.05}
            className="pb-vol-slider"
          />
        </span>
        <IconButton icon="chevU" label="Open Now Playing" bare size="sm" disabled={empty} className="pb-open" onClick={() => nowPlayingStore.open('np')} />
      </div>
      <span className="sr-only" aria-live="polite">
        {intro ? `DJ intro: ${dj.session?.title ?? ''}` : track ? `${p.playing ? 'Playing' : 'Paused'}: ${track.title} by ${track.artist}` : ''}
      </span>
    </footer>
  )
}
