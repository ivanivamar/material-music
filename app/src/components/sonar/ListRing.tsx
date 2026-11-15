/**
 * The ring panel that sits beside an ordered list (playlist, mix): one arc per song sized by length,
 * time ticks every 10 minutes, optionally the artist band (playlists), hatched arcs for songs new to
 * you and play-count blips (mixes). The centre shows what's playing, the hovered song, or Play.
 */
import { useState } from 'react'
import { Icon } from '../../design/icons'
import { SonarRing, fmtClock, fmtLeft, useTimeLeft, type SonarSong } from './Sonar'
import { usePlayerPosition } from '../../state/player'

export type LegendItem = 'length' | 'band' | 'ticks' | 'new' | 'blip'

const LEGEND: Record<LegendItem, { sw: string; text: string }> = {
  length: { sw: '', text: 'Arc · a song, sized by length' },
  band: { sw: 'is-band', text: 'Inner band · same artist in a row' },
  ticks: { sw: 'is-tick', text: 'Ticks · every 10 min' },
  new: { sw: 'is-hatch', text: 'Hatched arc · new to you' },
  blip: { sw: 'is-dot', text: 'Blip · how often you’ve played it' },
}

export interface ListRingProps {
  songs: SonarSong[]
  current: number
  playing: boolean
  size: number
  onPick: (i: number) => void
  onPlay: () => void
  bands?: boolean
  blips?: boolean
  legend?: LegendItem[]
  label: string
  /** phone: smaller centre, no legend */
  compact?: boolean
}

export function ListRing({ songs, current, playing, size, onPick, onPlay, bands, blips, legend, label, compact }: ListRingProps) {
  const [hover, setHover] = useState(-1)
  const total = songs.reduce((a, s) => a + (s.len || 0), 0)
  const mins = Math.round(total / 60)
  const length = mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`
  return (
    <>
      <SonarRing
        songs={songs}
        current={current}
        playing={playing}
        size={size}
        width={compact ? 9 : 12}
        gap={songs.length > 60 ? 0.4 : songs.length > 30 ? 0.9 : 1.4}
        ticks
        bands={bands}
        blips={blips}
        hover={hover}
        onHover={setHover}
        onPick={onPick}
        label={label}
      >
        {current >= 0 ? (
          <>
            <div className="sn-lab">
              {compact ? '' : playing ? 'Now · ' : 'Paused · '}
              {current + 1} of {songs.length}
            </div>
            <div className={`sn-now ${compact ? 'is-sm' : 'is-sm'}`} style={compact ? undefined : { fontSize: 22 }}>
              {songs[current].title}
            </div>
            <Clock len={songs[current].len} />
            {!compact && <Left songs={songs} current={current} />}
          </>
        ) : hover >= 0 ? (
          <>
            <div className="sn-lab">
              {hover + 1} of {songs.length}
            </div>
            <div className="sn-now is-sm is-dim">{songs[hover].title}</div>
            <div className="sn-mono">{fmtClock(songs[hover].len)}</div>
          </>
        ) : (
          <>
            <button type="button" className="sn-play" onClick={onPlay} aria-label="Play" style={compact ? { width: 52, height: 52 } : undefined}>
              <Icon name="playF" />
            </button>
            <div className="sn-lab">
              {songs.length} songs · {length}
            </div>
          </>
        )}
      </SonarRing>
      {legend && !compact && (
        <div className="sn-legend">
          {legend.map((k) => (
            <div key={k} className="sn-legend-row">
              <span className="sn-legend-sw">
                <i className={LEGEND[k].sw} />
              </span>
              {LEGEND[k].text}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function Clock({ len }: { len: number }) {
  const pos = usePlayerPosition()
  return (
    <div className="sn-mono" style={{ color: 'var(--ink-primary)' }}>
      {fmtClock(pos)} <span style={{ color: 'var(--ink-tertiary)' }}>/ {fmtClock(len)}</span>
    </div>
  )
}

function Left({ songs, current }: { songs: SonarSong[]; current: number }) {
  return <div className="sn-lab">{fmtLeft(useTimeLeft(songs, current))}</div>
}
