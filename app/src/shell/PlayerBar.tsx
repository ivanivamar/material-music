/**
 * Desktop player bar, 84px (handoff 04 Desktop):
 * grid  [now playing | 560px transport + seek | quality · lyrics · queue · volume]
 */
import { IconButton, LikeButton, PlayButton, QualityBadge, SeekBar, Slider, qualityKind, qualityLabel, useToast } from '../components/ui'
import { useCover } from '../lib/covers'
import { useLibrary, type Track } from '../state/library'
import { likesStore, useLikes } from '../state/likes'
import { playerStore, usePlayer } from '../state/player'
import './playerbar.css'

export function PlayerBar() {
  const p = usePlayer()
  const { data } = useLibrary()
  const likes = useLikes()
  const toast = useToast()
  const id = p.index >= 0 ? p.queue[p.index] : null
  const track: Track | null = (id && data?.tracks[id]) || null
  const album = track ? data?.albums[track.albumId] : undefined
  const cover = useCover(album?.cover)
  const duration = track?.duration ?? 0
  const empty = !track

  const later = (what: string) => () => toast.show({ icon: 'clock', mutedIcon: true, text: `${what} isn’t built yet.`, meta: 'COMING SOON' })

  const onPlay = () => {
    if (!playerStore.hasEngine()) {
      toast.show({ icon: 'clock', mutedIcon: true, text: 'Playback arrives with the player core (step 3d).', meta: 'QUEUE IS READY' })
      return
    }
    playerStore.toggle()
  }

  return (
    <footer className={`pb ${empty ? 'is-empty' : ''}`} aria-label="Player">
      <div className="pb-now">
        {empty ? (
          <>
            <span className="pb-cover pb-cover-empty" aria-hidden />
            <div className="pb-text">
              <div className="pb-title pb-title-empty">Nothing playing</div>
              <div className="pb-sub t-mono">PICK AN ALBUM TO START</div>
            </div>
          </>
        ) : (
          <>
            {cover ? <img className="pb-cover" src={cover} alt="" /> : <span className="pb-cover pb-cover-empty" aria-hidden />}
            <div className="pb-text">
              <div className="pb-title" title={track.title}>{track.title}</div>
              <div className="pb-sub" title={track.artist}>{track.artist}</div>
            </div>
            <LikeButton liked={!!likes[track.id]} onToggle={(v) => likesStore.set(track.id, v)} size={16} className="pb-like" />
          </>
        )}
      </div>

      <div className="pb-center">
        <div className="pb-transport">
          <IconButton icon="shuffle" label={p.shuffle ? 'Shuffle on' : 'Shuffle'} bare size="sm" pressed={p.shuffle} className={`pb-mode ${p.shuffle ? 'is-on' : ''}`} onClick={() => playerStore.toggleShuffle()} />
          <IconButton icon="prev" label="Previous" bare size="sm" className="pb-skip" disabled={empty} onClick={() => playerStore.prev()} />
          <PlayButton size={38} state={p.buffering ? 'buffering' : p.playing ? 'playing' : 'paused'} onClick={empty ? undefined : onPlay} />
          <IconButton icon="next" label="Next" bare size="sm" className="pb-skip" disabled={empty} onClick={() => playerStore.next()} />
          <span className="pb-repeat-wrap">
            <IconButton
              icon="repeat"
              label={p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
              bare
              size="sm"
              pressed={p.repeat !== 'off'}
              className={`pb-mode ${p.repeat !== 'off' ? 'is-on' : ''}`}
              onClick={() => playerStore.cycleRepeat()}
            />
            {p.repeat === 'one' && <span className="pb-repeat-one" aria-hidden>1</span>}
          </span>
        </div>
        <SeekBar compact position={empty ? 0 : p.position} duration={duration} onSeek={(s) => playerStore.seek(s)} />
      </div>

      <div className="pb-right">
        {track && (
          <QualityBadge kind={qualityKind('flac', track.flac?.bitDepth, track.flac?.sampleRate)}>
            {qualityLabel('flac', { bitDepth: track.flac?.bitDepth, sampleRate: track.flac?.sampleRate })}
          </QualityBadge>
        )}
        <IconButton icon="lyrics" label="Lyrics" bare size="sm" disabled={empty} onClick={later('The lyrics view')} />
        <IconButton icon="queue" label="Queue" bare size="sm" disabled={empty} onClick={later('The queue panel')} />
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
      </div>
      <span className="sr-only" aria-live="polite">
        {track ? `${p.playing ? 'Playing' : 'Paused'}: ${track.title} by ${track.artist}` : ''}
      </span>
    </footer>
  )
}
