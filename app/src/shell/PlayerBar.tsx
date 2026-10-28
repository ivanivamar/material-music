/**
 * Desktop player bar (Material redesign, HomeMaterial.dc.html): a 96px floating glass bar inside the
 * main panel, 28px from its edges. Neutral glass (no album tint); the album colour only on the cookie
 * play button, the wavy progress and the active shuffle / repeat toggles.
 *   [ tilted 64px cover · title (+ DJ / Radio chip) · artist ]
 *   [ shuffle · prev · play · next · repeat  /  time · wave · time ]
 *   [ FLAC 16/44.1 · lyrics · DJ · queue · volume ]
 */
import { CookieButton, ModeToggle, ThinSlider, WaveSeek, useToast } from '../components/ui'
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
import { useSettings } from '../state/settings'
import { DevicesButton } from '../sync/DevicesButton'
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
  const djChip = p.remote ? (
    <span className="pb-chip is-remote" title={`Playing on ${p.remote.name}. The controls here drive it.`}>
      On {p.remote.name}
    </span>
  ) : dj.on ? (
    <span className="pb-chip is-dj">{intro ? 'DJ · intro' : 'DJ'}</span>
  ) : radio ? (
    <span className="pb-chip">Radio</span>
  ) : null
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
  const streamQuality = useSettings().streamQuality
  // streaming the Opus copy (Settings → Playback); a local / stored file is whatever the engine found
  const opusStream = p.source === 'drive' && streamQuality === 'opus' && !!track?.mobile?.id
  const sourceLabel = p.source === 'local' ? (isNative ? 'Stored on this phone' : 'Playing from your local folder') : p.source === 'drive' ? 'Streaming from Google Drive' : undefined

  const fmtQ = opusStream
    ? { kind: 'OPUS', detail: track?.mobile?.bitrate ? `${Number.parseInt(track.mobile.bitrate, 10)}` : '160' }
    : { kind: 'FLAC', detail: `${track?.flac?.bitDepth ?? 16}/${((track?.flac?.sampleRate ?? 44100) / 1000).toString().replace(/\.0$/, '')}` }

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
            <span className="pb-cover pb-cover-empty" aria-hidden>
              <Icon name="song" />
            </span>
            <div className="pb-text">
              <div className="pb-title">Nothing playing</div>
              <div className="pb-sub">Pick an album to start</div>
            </div>
          </>
        ) : intro && id && dj.session ? (
          <>
            <button type="button" className="pb-expand" onClick={() => nowPlayingStore.open('np')} aria-label="Open Now Playing" title="Now Playing">
              <LiveMark item={id} size={64} />
            </button>
            <div className="pb-text">
              <div className="pb-title-row" title={dj.session.title}>
                <Marquee className="pb-title" text={dj.session.title} />
                {djChip}
              </div>
              <div className="pb-sub">
                <IntroSub item={id} />
              </div>
            </div>
          </>
        ) : (
          track && (
            <>
              <button type="button" className="pb-expand" onClick={() => nowPlayingStore.open('np')} aria-label="Open Now Playing" title="Now Playing">
                {cover ? <img className="pb-cover" src={cover} alt="" /> : <span className="pb-cover pb-cover-empty" aria-hidden />}
              </button>
              <div className="pb-text">
                <div className="pb-title-row">
                  <a className="pb-link pb-title" href={albumHref(track.albumId)} title={album ? `${track.title} · ${album.title}` : track.title}>
                    <Marquee text={track.title} />
                  </a>
                  {djChip}
                </div>
                <a className="pb-sub pb-link" href={artistHref(track.artistId)} title={track.artist}>
                  <Marquee text={album ? `${track.artist} · ${album.title}` : track.artist} />
                </a>
              </div>
            </>
          )
        )}
      </div>

      <div className="pb-center">
        <div className="pb-transport">
          <ModeToggle icon="shuffle" on={!fixed && p.shuffle} disabled={fixed} label={fixed ? offLabel : p.shuffle ? 'Shuffle on' : 'Shuffle'} onClick={() => playerStore.toggleShuffle()} />
          <button type="button" className="pb-skip" aria-label="Previous" title="Previous" disabled={empty} onClick={() => playerStore.prev()}>
            <Icon name="prev" filled />
          </button>
          <CookieButton
            size={46}
            iconSize={26}
            playing={p.playing && !empty}
            icon={p.playing || p.buffering ? 'pauseF' : 'playF'}
            label={p.playing ? 'Pause' : 'Play'}
            disabled={empty}
            onClick={empty ? undefined : onPlay}
            loading={p.buffering && !empty}
          />
          <button type="button" className="pb-skip" aria-label="Next" title="Next" disabled={empty} onClick={() => playerStore.next()}>
            <Icon name="next" filled />
          </button>
          <ModeToggle
            icon={p.repeat === 'one' ? 'repeatOne' : 'repeat'}
            on={!fixed && p.repeat !== 'off'}
            disabled={fixed}
            label={fixed ? offLabel : p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
            onClick={() => playerStore.cycleRepeat()}
          />
        </div>
        <WaveSeek position={empty ? 0 : p.position} duration={duration} playing={p.playing && !empty} onSeek={(s) => playerStore.seek(s)} />
      </div>

      <div className="pb-right">
        {track && !intro && (
          <span className="pb-quality" title={sourceLabel}>
            <b>{fmtQ.kind}</b>
            <span>{fmtQ.detail}</span>
          </span>
        )}
        <DevicesButton className="pb-ib" />
        <button type="button" className={`pb-ib ${ui.open && ui.view === 'lyrics' ? 'is-on' : ''}`} aria-label="Lyrics" title="Lyrics" disabled={empty} onClick={() => nowPlayingStore.toggleLyrics()}>
          <Icon name="lyrics" />
        </button>
        <DjButton variant="bar" />
        {dj.on ? (
          <span className="dj-off-wrap">
            <button type="button" className="pb-ib is-dj-off" aria-label="Queue: not available while the DJ plays">
              <Icon name="queue" />
            </button>
            <span className="dj-off-tip" role="tooltip">
              Not available while the DJ plays
            </span>
          </span>
        ) : (
          <button type="button" className={`pb-ib ${ui.queue ? 'is-on' : ''}`} aria-label="Queue" title="Queue" aria-pressed={ui.queue} disabled={empty} onClick={() => nowPlayingStore.toggleQueue()}>
            <Icon name="queue" />
          </button>
        )}
        <span className="pb-volume">
          <button type="button" className="pb-ib pb-mute" aria-label={p.muted ? 'Unmute' : 'Mute'} onClick={() => playerStore.toggleMute()}>
            <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} />
          </button>
          <ThinSlider label="Volume" value={p.muted ? 0 : p.volume} onChange={(v) => playerStore.setVolume(v)} />
        </span>
      </div>
      <span className="sr-only" aria-live="polite">
        {intro ? `DJ intro: ${dj.session?.title ?? ''}` : track ? `${p.playing ? 'Playing' : 'Paused'}${p.remote ? ` on ${p.remote.name}` : ''}: ${track.title} by ${track.artist}` : ''}
      </span>
    </footer>
  )
}
