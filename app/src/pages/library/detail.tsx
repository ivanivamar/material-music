/**
 * Detail-page kit (Material redesign: AlbumMaterial / ArtistMaterial / PlaylistMaterial /
 * SmartPlaylistMaterial.dc.html): the "← Library › Albums" back row, the hero (art · coral kicker ·
 * 57px title), the big action buttons, the offline switch block, and the segmented track list
 * (64px rows on 0.21 surfaces, 2px apart, 24px outer corners; the playing row coral with 20px corners).
 */
import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react'
import { AlbumEq, ProgressRing, Toggle, type DownloadState } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { useLazyCover } from '../../lib/covers'
import { back as goBack } from '../../shell/routes'
import { isTouch } from '../../state/viewport'
import { playerStore } from '../../state/player'
import './detail.css'

/* ── Back row ───────────────────────────────────────── */

export function DetailBack({ fallback, parts }: { fallback: string; parts: { label: string; href?: string }[] }) {
  return (
    <nav className="dt-back" aria-label="Breadcrumb">
      <button type="button" className="dt-back-btn" aria-label="Back" title="Back" onClick={() => goBack(fallback)}>
        <Icon name="back" />
      </button>
      {parts.map((p, i) => (
        <span key={i} className="dt-back-part">
          {i > 0 && <Icon name="chevR" className="dt-back-sep" />}
          {p.href && i < parts.length - 1 ? (
            <a href={p.href}>{p.label}</a>
          ) : (
            <span className={i === parts.length - 1 ? 'is-last' : undefined}>{p.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ── Hero ───────────────────────────────────────────── */

/** Title size steps down for long names so they stay on ≤ 2 lines. */
export const titleSize = (t: string) => (t.length <= 18 ? 57 : t.length <= 30 ? 48 : t.length <= 48 ? 40 : 34)

export function DetailHero({ art, kicker, title, onTitleDouble, children, className }: { art: ReactNode; kicker: ReactNode; title: string; onTitleDouble?: () => void; children?: ReactNode; className?: string }) {
  return (
    <header className={`dt-hero ${className ?? ''}`}>
      <div className="dt-art">{art}</div>
      <div className="dt-hero-text">
        <div className="dt-kicker">{kicker}</div>
        <h1 className="dt-title" style={{ '--ts': `${titleSize(title)}px` } as CSSProperties} title={title} onDoubleClick={onTitleDouble}>
          {title}
        </h1>
        {children}
      </div>
    </header>
  )
}

/* ── Actions ────────────────────────────────────────── */

export function ActBtn({ kind, icon, filled, children, onClick, disabled, title, className }: { kind: 'filled' | 'tonal' | 'outlined'; icon?: IconName; filled?: boolean; children: ReactNode; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; title?: string; className?: string }) {
  return (
    <button type="button" className={`dt-btn is-${kind} ${className ?? ''}`} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon name={icon} filled={filled} />}
      <span className="dt-btn-l">{children}</span>
    </button>
  )
}

export function MoreBtn({ onClick, label = 'More' }: { onClick: (e: MouseEvent<HTMLButtonElement>) => void; label?: string }) {
  return (
    <button type="button" className="dt-more" aria-label={label} title={label} onClick={onClick}>
      <Icon name="more" />
    </button>
  )
}

/** "Available offline" + status, with the switch (and an optional quality switch next to it). */
export function OfflineBlock({ title = 'Available offline', status, checked, onChange, label, extra }: { title?: string; status: ReactNode; checked: boolean; onChange: (v: boolean) => void; label: string; extra?: ReactNode }) {
  return (
    <div className={`dt-offl ${checked ? 'is-on' : ''}`}>
      <label className="dt-offl-main">
        <span className="dt-offl-text">
          <span className="dt-offl-t">{title}</span>
          <span className="dt-offl-s">{status}</span>
        </span>
        <Toggle checked={checked} onChange={onChange} label={label} />
      </label>
      {extra}
    </div>
  )
}

/* ── Track list ─────────────────────────────────────── */

export function DtList({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`dt-list ${className ?? ''}`} role="table" {...rest}>
      {children}
    </div>
  )
}

export function DlMark({ state }: { state: DownloadState | undefined }) {
  if (!state) return null
  if (state.kind === 'done')
    return (
      <span className="dt-dl is-done" title="Downloaded">
        <Icon name="checkCircle" filled />
      </span>
    )
  if (state.kind === 'downloading')
    return (
      <span className="dt-dl" title={`Downloading ${Math.round(state.progress * 100)}%`}>
        <ProgressRing progress={state.progress} size={24} />
      </span>
    )
  return (
    <span className="dt-dl is-cloud" title="Stream only">
      <Icon name="cloud" />
    </span>
  )
}

function RowCover({ id }: { id: string | null | undefined }) {
  const [ref, url] = useLazyCover<HTMLSpanElement>(id)
  return (
    <span ref={ref} className="dt-cover">
      {url && <img src={url} alt="" decoding="async" draggable={false} />}
    </span>
  )
}

export interface DtRowProps {
  n: ReactNode
  title: ReactNode
  sub?: ReactNode
  /** album cover id (playlist / artist rows) */
  cover?: string | null
  showCover?: boolean
  /** this row is the current song (coral), and whether it plays */
  current: boolean
  playing: boolean
  /** Android: offline mark column */
  dl?: DownloadState
  hasDl?: boolean
  /** e.g. "64 plays", "2 days ago" */
  stat?: ReactNode
  duration: ReactNode
  onPlay?: () => void
  onMore?: (e: MouseEvent) => void
  /** replaces ⋯ (e.g. ✕ for a song that left the library) */
  end?: ReactNode
  /** drag / data-i / extra classes */
  rowProps?: HTMLAttributes<HTMLDivElement> & { [k: `data-${string}`]: string | number | undefined }
  className?: string
  dim?: boolean
  /** phone: drag grip */
  grip?: ReactNode
}

export function DtRow({ n, title, sub, cover, showCover, current, playing, dl, hasDl, stat, duration, onPlay, onMore, end, rowProps, className, dim, grip }: DtRowProps) {
  const play = (e: MouseEvent) => {
    e.stopPropagation()
    if (!onPlay) return
    if (current) playerStore.toggle()
    else onPlay()
  }
  return (
    <div
      {...rowProps}
      className={['dt-row', current && 'is-current', dim && 'is-dim', className, rowProps?.className].filter(Boolean).join(' ')}
      role="row"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        if (!onPlay) return
        if (current && !isTouch()) return playerStore.toggle()
        onPlay()
      }}
      onContextMenu={(e) => {
        if (onMore) {
          e.preventDefault()
          onMore(e)
        } else e.preventDefault()
      }}
    >
      <div className="dt-num">
        {current ? <AlbumEq color="var(--brand)" height={14} on={playing} /> : <span className="dt-n">{n}</span>}
        {onPlay && (
          <button type="button" className="dt-play" tabIndex={-1} aria-label={current && playing ? 'Pause' : 'Play'} onClick={play}>
            <Icon name={current && playing ? 'pauseF' : 'playF'} />
          </button>
        )}
      </div>
      {showCover && <RowCover id={cover} />}
      <div className="dt-text">
        <div className="dt-t">{title}</div>
        {sub && <div className="dt-s">{sub}</div>}
      </div>
      {stat != null && <div className="dt-stat">{stat}</div>}
      {hasDl && <div className="dt-dlc">{<DlMark state={dl} />}</div>}
      <div className="dt-dur">{duration}</div>
      <div className="dt-end">
        {end ?? (
          onMore && (
            <button type="button" className="dt-dots" aria-label="More" title="More" onClick={(e) => (e.stopPropagation(), onMore(e))}>
              <Icon name="more" />
            </button>
          )
        )}
        {grip}
      </div>
    </div>
  )
}

/** "Disc 2" between disc groups. */
export function DiscHead({ label }: { label: string }) {
  return <div className="dt-disc">{label}</div>
}

const MON = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/g
/** "2 DAYS AGO" / "OCT 2026" (mono labels) → "2 days ago" / "Oct 2026". */
export const softDate = (s: string) => s.toLowerCase().replace(MON, (m) => m.charAt(0).toUpperCase() + m.slice(1))
