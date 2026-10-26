import type { CSSProperties, ReactNode } from 'react'
import { SHAPE_CLOVER } from '../../design/shapes'
import { Icon } from '../../design/icons'
import { quality as Q, type QualityKind } from '../../design/tokens'
import { useMotion } from '../../state/motion'

/* ── Quality / release badges ───────────────────────── */

/** Pick the badge colour from file info. 24-bit or >48k → flac24 colour. */
export function qualityKind(codec: 'flac' | 'opus', bitDepth?: number, sampleRate?: number): QualityKind {
  if (codec === 'opus') return 'opus'
  return (bitDepth ?? 16) > 16 || (sampleRate ?? 44100) > 48000 ? 'flac24' : 'flac16'
}

export function qualityLabel(codec: 'flac' | 'opus', opts: { bitDepth?: number; sampleRate?: number; bitrate?: number } = {}): string {
  if (codec === 'opus') return `OPUS ${Math.round((opts.bitrate ?? 160000) / 1000)}`
  const sr = (opts.sampleRate ?? 44100) / 1000
  return `FLAC ${opts.bitDepth ?? 16}/${Number.isInteger(sr) ? sr : sr.toFixed(1)}`
}

export function QualityBadge({ kind, children }: { kind: QualityKind; children: ReactNode }) {
  return (
    <span className="badge badge-q" style={{ '--qc': Q[kind].join(',') } as CSSProperties}>
      {children}
    </span>
  )
}

export type ReleaseType = 'ALBUM' | 'EP' | 'SINGLE' | 'LIVE' | 'REISSUE'
export function ReleaseBadge({ type }: { type: ReleaseType }) {
  return <span className="badge badge-release">{type}</span>
}

/* ── Equaliser (playing indicator) ──────────────────── */

export function Eq({ playing = true }: { playing?: boolean }) {
  const motion = useMotion()
  const still = !motion || !playing
  return (
    <span className={`eq ${still ? 'is-still' : ''}`} aria-label="Playing" role="img">
      {[0, 1, 2].map((i) => (
        <span key={i} className="pg-anim" style={still ? undefined : { animationDuration: `${0.9 + i * 0.25}s`, animationDelay: `${-i * 0.3}s` }} />
      ))}
    </span>
  )
}

/* ── Download state ─────────────────────────────────── */

export function ProgressRing({ progress, size = 17 }: { progress: number; size?: number }) {
  const c = 2 * Math.PI * 8.5
  const on = Math.max(0, Math.min(1, progress)) * c
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--track, rgba(255,255,255,0.2))" strokeWidth="2.5" />
      <circle
        cx="12" cy="12" r="8.5" fill="none" stroke="var(--brand, #fff)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${Math.max(on, 2)} ${c}`} transform="rotate(-90 12 12)"
        style={{ transition: 'stroke-dasharray .4s var(--ease)' }}
      />
    </svg>
  )
}

export type DownloadState = { kind: 'none' } | { kind: 'downloading'; progress: number } | { kind: 'done' }

/** Icon-only status for track rows (28px column). */
export function DownloadIcon({ state }: { state: DownloadState }) {
  if (state.kind === 'done') return <span className="dl-done" title="Stored offline"><Icon name="checkCircle" filled /></span>
  if (state.kind === 'downloading') return <span className="dl-busy" title={`Downloading ${Math.round(state.progress * 100)}%`}><ProgressRing progress={state.progress} size={22} /></span>
  return <span className="dl-cloud" title="Stream only"><Icon name="cloud" /></span>
}

/** Labelled status: OFFLINE / DOWNLOADING 62% / STREAM ONLY. */
export function DownloadStatus({ state }: { state: DownloadState }) {
  if (state.kind === 'done')
    return <span className="dl"><span className="dl-ic"><Icon name="check" /></span>Offline</span>
  if (state.kind === 'downloading')
    return <span className="dl"><ProgressRing progress={state.progress} />Downloading {Math.round(state.progress * 100)}%</span>
  return <span className="dl dl-stream"><span className="dl-ic"><Icon name="cloud" /></span>Stream only</span>
}

/* ── Skeleton ───────────────────────────────────────── */

export function Skeleton({ width, height, radius = 6, style }: { width: number | string; height: number | string; radius?: number | string; style?: CSSProperties }) {
  return <div className="skel pg-anim" style={{ width, height, borderRadius: radius, ...style }} aria-hidden />
}

/* ── Divider ("SIDE A ──── 06 TRACKS") ──────────────── */

export function Rule({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="rule">
      {left != null && <span className="rule-label">{left}</span>}
      <span className="rule-line" />
      {right != null && <span className="rule-label">{right}</span>}
    </div>
  )
}

/* ── Sonar ping (refresh / loading) ─────────────────── */

export function Sonar({ size = 120, children }: { size?: number; children?: ReactNode }) {
  const motion = useMotion()
  return (
    <div className="sonar" style={{ width: size, height: size }} role="status">
      {motion ? (
        <>
          <span className="sonar-ring pg-anim" />
          <span className="sonar-ring pg-anim" />
        </>
      ) : (
        <span className="sonar-static" />
      )}
      {children ?? <span className="sonar-core" />}
    </div>
  )
}

/* ── Offline banner ─────────────────────────────────── */

export function OfflineBanner({ meta }: { meta?: ReactNode }) {
  return (
    <div className="offline-banner" role="status">
      <span className="ob-ic"><Icon name="offline" /></span>
      No signal down here. Only offline music will play.
      {meta != null && <span className="t-mono" style={{ fontSize: 'var(--fs-mono-sm)' }}>{meta}</span>}
    </div>
  )
}

/* ── Empty state (concentric rings, one line, one action) ── */

interface EmptyStateProps {
  icon: Parameters<typeof Icon>[0]['name']
  title: ReactNode
  body?: ReactNode
  actions?: ReactNode
}

export function EmptyState({ icon, title, body, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden>
        <span className="empty-clover" style={{ clipPath: SHAPE_CLOVER }} />
        <Icon name={icon} className="empty-ic" />
      </div>
      <div className="empty-copy">
        <div className="empty-title">{title}</div>
        {body && <div className="empty-body">{body}</div>}
      </div>
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  )
}
