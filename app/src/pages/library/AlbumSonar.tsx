/**
 * Album tracklist as a sonar ring (Nov 2026). Desktop with room and ≤ 16 songs: titles sit around
 * the ring, each next to its arc. Phone, narrow panels and long albums: the ring on top and a compact
 * numbered list under it. The centre shows what's playing (or a Play button when nothing here is).
 */
import { useState, type CSSProperties, type MouseEvent } from 'react'
import { IconButton, formatTime } from '../../components/ui'
import { Icon } from '../../design/icons'
import { LikeButton } from '../../components/LikeButton'
import { SonarRing, fmtClock, fmtLeft, polar, rad, useTimeLeft, useWidth, type SonarSong } from '../../components/sonar/Sonar'
import { usePlayerPosition } from '../../state/player'
import { useIsPhone } from '../../state/viewport'
import type { Track } from '../../state/library'

export interface AlbumSonarProps {
  tracks: Track[]
  /** index of the loaded track in `tracks`, -1 when nothing from here is loaded */
  current: number
  playing: boolean
  variousArtists: boolean
  onPlayAt: (i: number) => void
  onPlay: () => void
  onMore: (trackId: string, e: MouseEvent) => void
}

const MAX_TAGS = 16

export function AlbumSonar({ tracks, current, playing, variousArtists, onPlayAt, onPlay, onMore }: AlbumSonarProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const phone = useIsPhone()
  const [hover, setHover] = useState(-1)
  const songs: SonarSong[] = tracks.map((t, i) => ({ id: t.id, len: t.duration || 0, title: t.title, num: String(t.track ?? i + 1).padStart(2, '0') }))
  const tagged = !phone && tracks.length <= MAX_TAGS && width >= 760
  const total = songs.reduce((a, s) => a + (s.len || 0), 0)

  const center = (small: boolean) =>
    current >= 0 ? (
      <>
        <div className="sn-lab">
          {small ? `${current + 1} of ${tracks.length}` : `${playing ? 'Now' : 'Paused'} · track ${current + 1} of ${tracks.length}`}
        </div>
        <div className={`sn-now ${small ? 'is-sm' : ''}`}>{tracks[current].title}</div>
        <NowClock len={tracks[current].duration || 0} />
        {!small && (
          <div className="sn-iconrow">
            <LikeButton trackId={tracks[current].id} size="sm" />
            <IconButton icon="more" label="Song options" shape="square" size="sm" onClick={(e) => onMore(tracks[current].id, e)} />
          </div>
        )}
      </>
    ) : hover >= 0 ? (
      <>
        <div className="sn-lab">Track {hover + 1} of {tracks.length}</div>
        <div className={`sn-now is-dim ${small ? 'is-sm' : ''}`}>{tracks[hover].title}</div>
        <div className="sn-mono">{tracks[hover].duration ? formatTime(tracks[hover].duration) : '—'}</div>
      </>
    ) : (
      <>
        <button type="button" className="sn-play" onClick={onPlay} aria-label="Play album" style={small ? ({ width: 52, height: 52 } as CSSProperties) : undefined}>
          <Icon name="playF" />
        </button>
        <div className="sn-lab">
          {tracks.length} songs · {Math.round(total / 60)} min
        </div>
      </>
    )

  if (tagged) {
    const size = Math.max(360, Math.min(560, width - 470))
    return (
      <div className="sn-album" ref={ref} style={{ paddingTop: 56, paddingBottom: 64 } as CSSProperties}>
        <SonarRing
          songs={songs}
          current={current}
          playing={playing}
          size={size}
          width={14}
          gap={1.8}
          ticks
          hover={hover}
          onHover={setHover}
          onPick={onPlayAt}
          label="Tracklist around a ring, each song sized by its length"
          overlay={({ cx, cy, R, spans }) =>
            tracks.map((t, i) => {
              const mid = spans[i].mid
              const [x, y] = polar(cx, cy, R + 34, mid)
              const right = Math.sin(rad(mid)) >= 0
              const vy = Math.cos(rad(mid))
              const state = current < 0 ? '' : i < current ? 'is-played' : i === current ? 'is-current' : ''
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`sn-tag ${state} ${hover === i ? 'is-hover' : ''}`}
                  style={{
                    left: x,
                    top: y,
                    transform: `translate(${right ? '0' : '-100%'}, ${vy > 0.6 ? '-100%' : vy < -0.6 ? '0' : '-50%'})`,
                    alignItems: right ? 'flex-start' : 'flex-end',
                    textAlign: right ? 'left' : 'right',
                  }}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(-1)}
                  onClick={() => onPlayAt(i)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onMore(t.id, e)
                  }}
                  aria-label={`${i === current ? 'Playing' : 'Play'} ${t.title}`}
                >
                  <span className="sn-tag-meta">
                    {songs[i].num} · {t.duration ? formatTime(t.duration) : '—'}
                    {variousArtists ? ` · ${t.artist}` : ''}
                  </span>
                  <span className="sn-tag-title">{t.title}</span>
                </button>
              )
            })
          }
        >
          {center(false)}
        </SonarRing>
      </div>
    )
  }

  const size = Math.max(260, Math.min(phone ? 340 : 420, width || 340))
  return (
    <div ref={ref} className={phone || width < 900 ? 'sn-stack' : 'sn-side'}>
      <SonarRing songs={songs} current={current} playing={playing} size={size} width={phone ? 10 : 12} gap={1.6} ticks={!phone} hover={hover} onHover={setHover} onPick={onPlayAt} label="Tracklist as a ring">
        {center(true)}
      </SonarRing>
      <div className="sn-mini-list" role="list">
        {current >= 0 && <TimeLeftHead songs={songs} current={current} />}
        {tracks.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="listitem"
            className={`sn-mrow ${current >= 0 && i < current ? 'is-played' : ''} ${i === current ? 'is-current' : ''}`}
            onClick={() => onPlayAt(i)}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(-1)}
            onContextMenu={(e) => {
              e.preventDefault()
              onMore(t.id, e)
            }}
          >
            <span className="sn-mrow-n">{songs[i].num}</span>
            <span className="sn-mrow-t">
              <span className="sn-mrow-title">{t.title}</span>
              {variousArtists && <span className="sn-mrow-sub">{t.artist}</span>}
            </span>
            <span className="sn-mrow-d">{t.duration ? formatTime(t.duration) : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NowClock({ len }: { len: number }) {
  const pos = usePlayerPosition()
  return (
    <div className="sn-mono" style={{ color: 'var(--ink-primary)' }}>
      {fmtClock(pos)} <span style={{ color: 'var(--ink-tertiary)' }}>/ {fmtClock(len)}</span>
    </div>
  )
}

function TimeLeftHead({ songs, current }: { songs: SonarSong[]; current: number }) {
  const left = useTimeLeft(songs, current)
  return (
    <div className="sn-head" style={{ margin: '4px 0 2px', padding: '0 6px' }}>
      <span className="sn-lab" style={{ color: 'var(--ink-primary)' }}>
        Tracklist
      </span>
      <span className="sect-line" />
      <span className="sn-lab">{fmtLeft(left)}</span>
    </div>
  )
}

/** The ring / list switch shown at the end of a section head. */
export function SonarSwitch({ mode, onChange }: { mode: 'ring' | 'list'; onChange: (m: 'ring' | 'list') => void }) {
  return (
    <button type="button" className="sn-switch" onClick={() => onChange(mode === 'ring' ? 'list' : 'ring')}>
      {mode === 'ring' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 12 17 7" />
        </svg>
      )}
      {mode === 'ring' ? 'Show as list' : 'Show as ring'}
    </button>
  )
}
