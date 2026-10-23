/**
 * Dev-only gallery of the core components, laid out like handoff section 03
 * ("Core components and states") plus atmosphere, empty states and toasts (section 11).
 * Open at #/dev/components.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import {
  AlbumCard, Button, Chip, DownloadStatus, EmptyState, IconButton, OfflineBanner, PlayButton,
  QualityBadge, ReleaseBadge, Rule, SeekBar, Segmented, Skeleton, Slider, Sonar, Toggle, TrackRow, Waveform,
  useToast, type DownloadState,
} from '../components/ui'
import { settingsStore, useSettings } from '../state/settings'
import { useMotion, useSystemReducedMotion } from '../state/motion'
import type { MotionSetting, ParticleSetting } from '../design/tokens'
/** Sample covers drawn in code (no image files, so the build doesn't depend on any handoff folder). */
function sampleCover(a: string, b: string, c: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="270" cy="140" r="90" fill="${c}" fill-opacity=".35"/><circle cx="130" cy="300" r="140" fill="#000" fill-opacity=".25"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
const underBlue = sampleCover('#1d4a7a', '#06121f', '#6fb3ff')
const rotoscope = sampleCover('#5a2a3a', '#120609', '#ff8aa8')
const tsunami = sampleCover('#1f6f6a', '#04100f', '#8af0e0')
import './components.css'

const ROWS: { n: number; t: string; d: string; label: string; dl: DownloadState }[] = [
  { n: 1, t: 'Fata Morgana', d: '4:21', label: 'FLAC 16/44.1', dl: { kind: 'done' } },
  { n: 2, t: 'Black Rainbow', d: '3:58', label: 'FLAC 16/44.1', dl: { kind: 'done' } },
  { n: 3, t: 'Perfect Soul', d: '4:02', label: 'FLAC 16/44.1', dl: { kind: 'downloading', progress: 0.62 } },
  { n: 4, t: 'Soft Spine', d: '3:36', label: 'FLAC 16/44.1', dl: { kind: 'none' } },
  { n: 5, t: 'Tsunami Sea', d: '4:11', label: 'FLAC 16/44.1', dl: { kind: 'none' } },
]

export function Components() {
  const toast = useToast()
  const motion = useMotion()
  const sysReduced = useSystemReducedMotion()
  const s = useSettings()

  const [playingRow, setPlayingRow] = useState('Black Rainbow')
  const [playing, setPlaying] = useState(true)
  const [pos, setPos] = useState(96)
  const [vol, setVol] = useState(0.7)
  const [tab, setTab] = useState<'albums' | 'artists' | 'songs'>('albums')
  const [dq, setDq] = useState<'opus' | 'flac'>('opus')
  const [wifi, setWifi] = useState(true)
  const [gapless, setGapless] = useState(false)
  const [xfade, setXfade] = useState(0)
  const DUR = 251

  // fake playback clock for the seek demos
  useEffect(() => {
    if (!playing) return
    const iv = window.setInterval(() => setPos((p) => (p + 0.25) % DUR), 250)
    return () => window.clearInterval(iv)
  }, [playing])

  return (
    <div className="cg">
      <Atmosphere fixed seed={17} />
      <div className="cg-inner">
        <header className="cg-head">
          <div className="t-mono">Pelagic / core components</div>
          <div className="t-page">Components and states</div>
          <div className="cg-nav">
            <a href="#/dev/foundations">Foundations</a>
            <span className="t-mono">{motion ? 'Motion on' : 'Motion reduced'}</span>
          </div>
        </header>

        <div className="cg-grid">
          {/* Buttons */}
          <Panel title="Buttons">
            <div className="cg-btns">
              <Button icon="playF">Play</Button>
              <Button variant="secondary" icon="shuffle">Shuffle</Button>
              <Button variant="secondary">Connect a folder</Button>
              <Button variant="danger">Sign out</Button>
              <Button icon="playF" disabled>Play</Button>
            </div>
            <div className="cg-btns">
              <Button size="sm" variant="secondary" icon="plus">New playlist</Button>
              <Button size="lg" icon="download">Download everything</Button>
            </div>
            <div className="cg-btns">
              <IconButton icon="lyrics" label="Lyrics" pressed />
              <IconButton icon="queue" label="Queue" />
              <IconButton icon="more" label="More" shape="square" />
            </div>
            <div className="t-mono">Hover, press and Tab through for states</div>
          </Panel>

          {/* Playback & file states */}
          <Panel title="Playback and file states">
            <div className="cg-play">
              <Labeled label="Playing"><PlayButton state="playing" /></Labeled>
              <Labeled label="Paused"><PlayButton state="paused" /></Labeled>
              <Labeled label="Buffering"><PlayButton state="buffering" /></Labeled>
              <div className="cg-vsep" />
              <div className="cg-col" style={{ gap: 12 }}>
                <DownloadStatus state={{ kind: 'done' }} />
                <DownloadStatus state={{ kind: 'downloading', progress: 0.62 }} />
                <DownloadStatus state={{ kind: 'none' }} />
              </div>
            </div>
            <div className="cg-row">
              {(['albums', 'artists', 'songs'] as const).map((k) => (
                <Chip key={k} selected={tab === k} onClick={() => setTab(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </Chip>
              ))}
              <span style={{ width: 8 }} />
              <Toggle label="Wi-Fi only" checked={wifi} onChange={setWifi} />
              <Toggle label="Gapless" checked={gapless} onChange={setGapless} />
            </div>
            <div className="cg-row">
              <Segmented
                label="Download quality"
                value={dq}
                onChange={setDq}
                options={[
                  { value: 'opus', label: 'Opus 160', meta: '74 MB' },
                  { value: 'flac', label: 'FLAC', meta: '286 MB' },
                ]}
              />
              <QualityBadge kind="flac16">FLAC 16/44.1</QualityBadge>
              <QualityBadge kind="flac24">FLAC 24/48</QualityBadge>
              <QualityBadge kind="opus">OPUS 160</QualityBadge>
            </div>
            <div className="cg-row">
              {(['ALBUM', 'EP', 'SINGLE', 'LIVE', 'REISSUE'] as const).map((r) => <ReleaseBadge key={r} type={r} />)}
            </div>
          </Panel>

          {/* Track rows */}
          <Panel title="Track row">
            <div className="cg-col" style={{ gap: 0 }}>
              {ROWS.map((r) => (
                <TrackRow
                  key={r.t}
                  n={r.n}
                  title={r.t}
                  duration={r.d}
                  label={r.label}
                  download={r.dl}
                  playing={playingRow === r.t}
                  onPlay={() => setPlayingRow(r.t)}
                  onMore={() => toast.show({ icon: 'more', text: `Menu for ${r.t} comes in step 8.`, mutedIcon: true })}
                />
              ))}
            </div>
          </Panel>

          {/* Seek / waveform / divider / album cards */}
          <Panel title="Waterline / seek, waveform, divider">
            <div className="cg-col" style={{ gap: 28 }}>
              <SeekBar position={pos} duration={DUR} onSeek={setPos} />
              <div className="seekrow">
                <span className="time">{fmt(pos)}</span>
                <Waveform progress={pos / DUR} duration={DUR} height={28} onSeek={(f) => setPos(f * DUR)} />
                <span className="time">{fmt(DUR)}</span>
              </div>
              <Rule left="Side A" right="06 tracks" />
            </div>
            <div className="cg-subtitle t-mono">Album card / default, hover, playing, loading</div>
            <div className="cg-cards">
              <AlbumCard title="Under Blue" subtitle="Eve" cover={underBlue} onPlay={() => {}} />
              <AlbumCard title="Rotoscope" subtitle="Spiritbox" cover={rotoscope} onPlay={() => {}} />
              <AlbumCard title="Tsunami Sea" subtitle="Spiritbox" cover={tsunami} playing />
              <div className="cg-col" style={{ gap: 10 }}>
                <Skeleton width="100%" height={124} radius={10} />
                <Skeleton width="80%" height={12} />
                <Skeleton width="50%" height={10} />
              </div>
            </div>
          </Panel>

          {/* Toasts + banner + player bar preview */}
          <Panel title="Toast · offline banner · player bar" wide>
            <div className="cg-row">
              <Button size="sm" variant="secondary" icon="check" onClick={() => toast.show({ icon: 'check', text: 'Tsunami Sea is stored offline.', meta: '74 MB · OPUS 160', action: { label: 'Undo', onClick: () => {} } })}>Stored</Button>
              <Button size="sm" variant="secondary" icon="x" onClick={() => toast.show({ icon: 'x', mutedIcon: true, text: 'Removed Soft Spine from Heavy water.', action: { label: 'Undo', onClick: () => {} } })}>Removed</Button>
              <Button size="sm" variant="secondary" icon="upload" onClick={() => {
                const id = toast.show({ icon: 'upload', text: 'Uploading Dopamine', meta: '1 OF 10', progress: 0.1, duration: 0, action: { label: 'Show', onClick: () => {} } })
                let i = 1
                const iv = window.setInterval(() => {
                  i++
                  toast.update(id, { meta: `${i} OF 10`, progress: i / 10 })
                  if (i >= 10) { window.clearInterval(iv); toast.update(id, { duration: 1500 }) }
                }, 500)
              }}>Upload</Button>
              <Button size="sm" variant="secondary" icon="offline" onClick={() => toast.show({ tone: 'danger', icon: 'offline', text: 'Couldn’t reach Google Drive.', meta: 'RETRYING IN 12 S', action: { label: 'Retry', onClick: () => {} } })}>Error</Button>
              <Button size="sm" variant="secondary" icon="cloud" onClick={() => toast.show({ icon: 'cloud', text: 'Back online. Syncing 2 playlists.' })}>Online</Button>
            </div>
            <div className="cg-row">
              <OfflineBanner meta="LAST SYNC 21:12" />
            </div>
            <div className="cg-bar">
              <div className="cg-bar-left">
                <img src={tsunami} alt="" />
                <div className="cg-col" style={{ gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{playingRow}</div>
                  <div className="t-secondary">Spiritbox</div>
                </div>
              </div>
              <div className="cg-col" style={{ gap: 8, alignItems: 'center' }}>
                <div className="cg-bar-ctl">
                  <IconButton icon="shuffle" label="Shuffle" size="sm" bare />
                  <IconButton icon="prev" label="Previous" size="sm" bare className="is-strong" />
                  <PlayButton size={38} state={playing ? 'playing' : 'paused'} onClick={() => setPlaying((p) => !p)} />
                  <IconButton icon="next" label="Next" size="sm" bare className="is-strong" />
                  <IconButton icon="repeat" label="Repeat" size="sm" bare />
                </div>
                <SeekBar position={pos} duration={DUR} onSeek={setPos} compact />
              </div>
              <div className="cg-bar-right">
                <QualityBadge kind="flac16">FLAC 16/44.1</QualityBadge>
                <IconButton icon="lyrics" label="Lyrics" size="sm" bare />
                <IconButton icon="queue" label="Queue" size="sm" bare />
                <IconButton icon="volume" label="Volume" size="sm" bare />
                <div style={{ width: 80 }}><Slider label="Volume" value={vol} onChange={setVol} variant="volume" knob={0} height={12} /></div>
              </div>
            </div>
          </Panel>

          {/* Empty + sonar */}
          <Panel title="Empty state">
            <EmptyState
              icon="library"
              title="Nothing down here yet"
              body="Run the import on your PC and your library appears here."
              actions={<><Button icon="refresh">Check again</Button><Button variant="secondary">Connect a folder</Button></>}
            />
          </Panel>
          <Panel title="Sonar ping / loading">
            <div className="cg-sonar">
              <Sonar size={160} />
              <div className="t-mono">Reading 214 albums</div>
            </div>
          </Panel>

          {/* Atmosphere settings — live */}
          <Panel title="Atmosphere · changes the background live" wide>
            <SettingRow label="Motion" hint={s.motion === 'system' ? (sysReduced ? 'System asks for reduced motion' : 'System allows motion') : ''}>
              <Segmented<MotionSetting>
                label="Motion"
                value={s.motion}
                onChange={(v) => settingsStore.set('motion', v)}
                options={[{ value: 'system', label: 'Follow system' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]}
              />
            </SettingRow>
            <SettingRow label="Drifting particles" hint="Marine snow · fades out with reduced motion">
              <Segmented<ParticleSetting>
                label="Drifting particles"
                value={s.particles}
                onChange={(v) => settingsStore.set('particles', v)}
                options={[{ value: 'off', label: 'Off' }, { value: 'few', label: 'Few' }, { value: 'default', label: 'Default' }, { value: 'more', label: 'More' }]}
              />
            </SettingRow>
            <SettingRow label="Stone, grain and contour texture">
              <Toggle label="Texture" checked={s.texture} onChange={(v) => settingsStore.set('texture', v)} />
            </SettingRow>
            <SettingRow label="Crossfade" hint="Settings slider · 12px knob">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: 260 }}>
                <Slider label="Crossfade" value={xfade / 12} knob={12} onChange={(v) => setXfade(Math.round(v * 12))} step={1 / 12} />
                <span className="t-mono" style={{ width: 40, textAlign: 'right' }}>{xfade ? `${xfade} S` : 'OFF'}</span>
              </div>
            </SettingRow>
          </Panel>
        </div>
      </div>
    </div>
  )
}

const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function Panel({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`cg-panel ${wide ? 'cg-wide' : ''}`}>
      <div className="cg-title t-mono">{title}</div>
      {children}
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cg-col" style={{ alignItems: 'center', gap: 10 }}>
      {children}
      <span className="t-mono" style={{ fontSize: 10, color: 'var(--ink-secondary)' }}>{label}</span>
    </div>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="cg-setting">
      <div className="cg-col" style={{ gap: 4 }}>
        <div style={{ fontSize: 15 }}>{label}</div>
        {hint && <div className="t-mono" style={{ fontSize: 10 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}
