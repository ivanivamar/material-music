/**
 * Full-screen Now Playing (handoff 04 "Now Playing / full screen, waveform seek" and 08 demo).
 *
 * Fixed overlay over the whole app, album-art tinted scene + atmosphere. Two views that cross-fade
 * (opacity + 28/36px rise, 0.9s default ease; instant with reduced motion):
 *   np      500px cover · badges · hero title · artist · album · waveform seek · transport ·
 *           Lyrics / Queue · volume · "NEXT —— title" bottom right
 *   lyrics  420px column (272px cover, thin seek, compact transport, buttons) + synced lyrics
 * Opened from the player bar (cover / expand / lyrics). Esc or Back closes (AppShell + history).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { IconButton, QualityBadge, SeekBar, Slider, Waveform, formatTime, qualityKind, qualityLabel, seedFrom } from '../components/ui'
import { Icon } from '../design/icons'
import { rgba, sceneBackground, useArtTint } from '../design/tint'
import { useCover } from '../lib/covers'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore } from '../state/player'
import { isTouch, useIsPhone } from '../state/viewport'
import { albumHref, artistHref } from '../shell/routes'
import { Lyrics } from './Lyrics'
import { useSwipeDown } from './swipe'
import { NpLink, Transport, ViewButtons, contextLine, useCurrent } from './parts'
import './nowplaying.css'

/** Hero title steps down with length (≤ 2 lines at 1440 wide), and with the viewport. */
const titleSize = (t: string) => {
  const px = t.length <= 12 ? 84 : t.length <= 20 ? 72 : t.length <= 32 ? 60 : t.length <= 48 ? 48 : 40
  return `min(${px}px, ${(px / 14.4).toFixed(2)}vw)`
}

const pad2 = (n: number) => String(n).padStart(2, '0')
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
  const { p, track, album } = useCurrent()
  const { data } = useLibrary()
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
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
    if (!track && !closing) nowPlayingStore.reset()
  }, [track, closing])

  const ly = ui.view === 'lyrics'
  const phone = useIsPhone()
  // phone: swipe down anywhere (outside sliders / lyrics) to close, like the queue sheet
  const rootRef = useRef<HTMLDivElement>(null)
  useSwipeDown(rootRef, phone && !closing, closeNp)
  // mount the lyrics column the first time it's shown, then keep it (so it can fade out)
  const [lyMounted, setLyMounted] = useState(ly)
  if (ly && !lyMounted) setLyMounted(true)
  const ctx = contextLine(p.context)
  const duration = track?.duration ?? 0
  const frac = duration > 0 ? Math.min(1, p.position / duration) : 0
  const glow = tint ? rgba(tint.glow, 0.9) : 'rgba(255,255,255,0.12)'
  const scene: CSSProperties = { background: tint ? sceneBackground(tint) : '#0B0B0C' }

  const nextIdx = p.index + 1 < p.queue.length ? p.index + 1 : p.repeat === 'all' && p.queue.length > 1 ? 0 : -1
  const next = nextIdx >= 0 ? data?.tracks[p.queue[nextIdx]] : undefined

  const quality = track ? (
    <QualityBadge kind={qualityKind('flac', track.flac?.bitDepth, track.flac?.sampleRate)}>{qualityLabel('flac', { bitDepth: track.flac?.bitDepth, sampleRate: track.flac?.sampleRate })}</QualityBadge>
  ) : null
  const source =
    p.source === 'local' ? (
      <span className="np-src" title="Playing from your local folder">
        <Icon name="check" />
        LOCAL
      </span>
    ) : p.source === 'drive' ? (
      <span className="np-src" title="Streaming from Google Drive">
        <Icon name="cloud" />
        STREAMING
      </span>
    ) : null
  const trackNo = track?.track ? `TRACK ${pad2(track.track)}${album?.trackCount ? `/${pad2(album.trackCount)}` : ''}` : null

  return (
    <div ref={rootRef} className={`np pg-anim ${closing ? 'is-closing' : ''} ${ly ? 'is-lyrics' : ''} ${phone ? 'is-phone' : ''}`} style={scene} role="dialog" aria-modal="true" aria-label="Now playing">
      <Atmosphere seed={41} />

      <header className="np-head">
        <button ref={closeRef} type="button" className="np-close t-mono" onClick={() => nowPlayingStore.close()}>
          <Icon name="chevD" />
          CLOSE
        </button>
        <div className="np-from">
          <div className="np-from-k t-mono">{ctx.kicker}</div>
          {ctx.href ? (
            <NpLink href={ctx.href} className="np-from-l">
              {ctx.label}
            </NpLink>
          ) : (
            <div className="np-from-l">{ctx.label}</div>
          )}
        </div>
        <div className="np-head-r" />
      </header>

      {track && (
        <>
          {/* ── Now playing view ── */}
          <section className="np-main pg-anim" aria-hidden={ly} inert={ly}>
            <div className="np-cover-wrap">
              {cover ? (
                <img className="np-cover" src={cover} alt="" style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px ${glow}` }} />
              ) : (
                <span className="np-cover np-cover-empty" aria-hidden />
              )}
            </div>
            <div className="np-info">
              <div className="np-text">
                <div className="np-badges t-mono">
                  {quality}
                  {source}
                  {trackNo && <span>{trackNo}</span>}
                </div>
                <h1 className="np-title" style={{ fontSize: titleSize(track.title) }} title={track.title}>
                  {track.title}
                </h1>
                <div className="np-sub">
                  <NpLink href={artistHref(track.artistId)} className="np-artist">
                    {track.artist}
                  </NpLink>
                  {album && (
                    <>
                      {' · '}
                      <NpLink href={albumHref(album.id)} className="np-album">
                        {album.title}
                      </NpLink>
                    </>
                  )}
                </div>
              </div>
              <div className="np-seek">
                <Waveform progress={frac} seed={seedFrom(track.id)} onSeek={(f) => playerStore.seek(f * duration)} />
                <div className="np-times t-mono">
                  <span className="is-now">{formatTime(p.position)}</span>
                  <span>−{formatTime(Math.max(0, duration - p.position))}</span>
                </div>
              </div>
              <Transport />
              <div className="np-actions">
                <ViewButtons />
                <span className="np-flex" />
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
                  className="np-vol"
                />
              </div>
            </div>
          </section>
          {next && (
            <button type="button" className="np-next pg-anim" onClick={() => playerStore.next()} title="Skip to next" tabIndex={ly ? -1 : 0}>
              <span className="t-mono">NEXT</span>
              <span className="np-next-line" />
              <span className="np-next-t">{next.title}</span>
            </button>
          )}

          {/* ── Lyrics view ── */}
          <section className="np-ly pg-anim" aria-hidden={!ly} inert={!ly}>
            {phone ? (
              <div className="npp-strip">
                {cover ? <img className="npp-strip-cover" src={cover} alt="" /> : <span className="npp-strip-cover np-cover-empty" aria-hidden />}
                <div className="npp-strip-text">
                  <div className="npp-strip-title">{track.title}</div>
                  <div className="npp-strip-sub">{track.artist}</div>
                </div>
              </div>
            ) : (
              <div className="np-ly-side">
                {cover ? <img className="np-ly-cover" src={cover} alt="" /> : <span className="np-ly-cover np-cover-empty" aria-hidden />}
                <div className="np-ly-text">
                  <div className="np-ly-title" title={track.title}>
                    {track.title}
                  </div>
                  <div className="np-ly-sub">
                    <NpLink href={artistHref(track.artistId)}>{track.artist}</NpLink>
                    {album && (
                      <>
                        {' · '}
                        <NpLink href={albumHref(album.id)}>{album.title}</NpLink>
                      </>
                    )}
                  </div>
                </div>
                <div className="np-ly-seek">
                  <Slider
                    label="Seek"
                    value={frac}
                    knob={7}
                    height={13}
                    onCommit={(v) => playerStore.seek(v * duration)}
                    valueText={(v) => `${formatTime(v * duration)} of ${formatTime(duration)}`}
                    step={duration > 0 ? 5 / duration : 0.02}
                  />
                  <div className="np-times t-mono">
                    <span className="is-now">{formatTime(p.position)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
                <Transport compact />
                <div className="np-actions">
                  <ViewButtons size="sm" />
                </div>
              </div>
            )}
            <div className="np-ly-col">{lyMounted && <Lyrics track={track} position={p.position} playing={p.playing && ly} />}</div>
            {phone && (
              <div className="npp-bottom">
                <SeekBar position={p.position} duration={duration} onSeek={(sec) => playerStore.seek(sec)} />
                <Transport compact />
                <div className="np-actions">
                  <ViewButtons size="sm" />
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
