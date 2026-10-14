/** Track row and album card — the two most repeated library elements. */
import type { MouseEvent, ReactNode } from 'react'
import { Icon } from '../../design/icons'
import { DownloadIcon, Eq, type DownloadState } from './Status'
import { isTouch } from '../../state/viewport'

/* ── Track row ──────────────────────────────────────── */

interface TrackRowProps {
  n: number | string
  title: string
  /** artist line (playlists, search); omit on album pages */
  subtitle?: string
  duration: string
  /** right-most mono column: quality, added date, plays… */
  label?: ReactNode
  playing?: boolean
  download?: DownloadState
  onPlay?: () => void
  onMore?: (e: MouseEvent) => void
  /** extra class, e.g. a column variant (`trow-album`) */
  className?: string
}

/** `download` omitted → empty status cell (PC: nothing is stored offline). */
export function TrackRow({ n, title, subtitle, duration, label, playing, download, onPlay, onMore, className }: TrackRowProps) {
  return (
    <div
      className={['trow', playing && 'is-playing', className].filter(Boolean).join(' ')}
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (isTouch() && !(e.target as HTMLElement).closest('a, button')) onPlay?.()
      }}
      onContextMenu={(e) => {
        if (onMore) {
          e.preventDefault()
          onMore(e)
        }
      }}
    >
      <div className="trow-num">
        {playing ? <Eq /> : <span className="trow-n">{n}</span>}
        <button type="button" className="trow-play" onClick={onPlay} aria-label={`Play ${title}`}>
          <Icon name="playF" />
        </button>
      </div>
      <div className="trow-main">
        <div className="trow-text">
          <div className="trow-title">{title}</div>
          {subtitle && <div className="trow-sub">{subtitle}</div>}
        </div>
        {onMore && (
          <button type="button" className="ibtn ibtn-sm ibtn-bare trow-more" aria-label="More" onClick={onMore}>
            <Icon name="more" />
          </button>
        )}
      </div>
      <div className="trow-dl">{download && <DownloadIcon state={download} />}</div>
      <div className="trow-dur">{duration}</div>
      <div className="trow-label">{label}</div>
    </div>
  )
}

/* ── Album card ─────────────────────────────────────── */

interface AlbumCardProps {
  title: string
  subtitle: ReactNode
  cover?: string
  playing?: boolean
  /** offline mode: not downloaded → greyscale 40% + cloud badge */
  unavailable?: boolean
  /** offline mode: downloaded → check after the title */
  offline?: boolean
  onOpen?: () => void
  onPlay?: () => void
  /** ref on the card (lazy cover loading) */
  cardRef?: (el: HTMLDivElement | null) => void
}

export function AlbumCard({ title, subtitle, cover, playing, unavailable, offline, onOpen, onPlay, cardRef }: AlbumCardProps) {
  return (
    <div
      ref={cardRef}
      className={`acard ${playing ? 'is-playing' : ''} ${unavailable ? 'is-unavailable' : ''}`}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}
    >
      <div className="acard-cover">
        {cover ? <img className="acard-img" src={cover} alt="" loading="lazy" decoding="async" /> : <div className="acard-img" />}
        {playing && (
          <div className="acard-eq">
            <Eq />
          </div>
        )}
        {!playing && !unavailable && onPlay && (
          <button
            type="button"
            className="acard-play"
            aria-label={`Play ${title}`}
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
            style={{ border: 0, cursor: 'pointer' }}
          >
            <Icon name="playF" />
          </button>
        )}
        {unavailable && (
          <div className="acard-badge" title="Not stored offline">
            <Icon name="cloud" />
          </div>
        )}
      </div>
      <div className="acard-meta">
        <div className="acard-text">
          <div className="acard-title">{title}</div>
          <div className="acard-sub">{subtitle}</div>
        </div>
        {offline && (
          <span style={{ fontSize: 15, color: 'var(--ink-primary)', marginTop: 2 }}>
            <Icon name="check" />
          </span>
        )}
      </div>
    </div>
  )
}
