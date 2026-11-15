/**
 * Song lists (Nov 2026 list redesign, "Releases on Home + artist page" canvas rows 4–5): one look
 * for every list of songs — album tracklists, the artist's songs, playlists, Liked songs, mixes and
 * Library → Songs.
 *
 * Desktop row:  [grip] # [cover] Title / sub · column A · mono column B · ♥ · ↓ · 3:42 · ⋯
 * Phone row:    [cover | #] Title / (♥) sub · meta · [grip | ⋯]
 *
 * The columns a list shows are set by its container class (`.sl-album`, `.sl-pl`, …) through
 * `--slc`; a cell is only drawn when its prop is given, so a list passes the same props to every row.
 * Plus the column head, the section head ("A ——— 214 songs"), a windowed list for thousands of rows
 * and "Up next ——— 27 min left".
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { DownloadIcon, Eq, type DownloadState } from '../ui'
import { Icon } from '../../design/icons'
import { useLazyCover } from '../../lib/covers'
import { playerStore } from '../../state/player'
import { isTouch } from '../../state/viewport'
import { fmtLeft, useTimeLeft, type ListSong } from './listUtils'

/* ── Cover thumbnail ─────────────────────────────────── */

/** An album cover in a row (lazy: loads when the row comes near the screen). */
export function RowCover({ fileId, size }: { fileId: string | null | undefined; size?: number }) {
  const [ref, url] = useLazyCover<HTMLSpanElement>(fileId)
  return (
    <span ref={ref} className="slr-cover" style={size ? { width: size, height: size } : undefined} aria-hidden>
      {url && <img src={url} alt="" decoding="async" draggable={false} />}
    </span>
  )
}

/* ── Row ─────────────────────────────────────────────── */

export interface SongRowProps {
  /** row number, or null for none */
  n?: string | null
  /** cover thumbnail (RowCover) */
  art?: ReactNode
  title: ReactNode
  /** second line under the title (artist, album) */
  sub?: ReactNode
  /** desktop: a text column (album, "Liked 13 Nov", why it's in a mix) */
  colA?: ReactNode
  /** desktop: a mono column (plays, added) */
  colB?: ReactNode
  /** "NEW" tag after the title */
  isNew?: boolean
  /** desktop: the heart (LikeButton) */
  like?: ReactNode
  /** phone: a small heart before the second line */
  liked?: boolean
  /** desktop: offline state of the song (Android app) */
  download?: DownloadState | null
  time?: ReactNode
  /** phone: right-hand mono text */
  meta?: ReactNode
  current?: boolean
  playing?: boolean
  /** before the playing song in an ordered list: quieter title */
  played?: boolean
  dim?: boolean
  phone?: boolean
  onPlay?: () => void
  onMore?: (e: MouseEvent) => void
  /** drag handle: desktop at the start, phone at the end (in place of ⋯) */
  grip?: ReactNode
  /** replaces the more button (e.g. remove a missing song) */
  end?: ReactNode
  className?: string
  style?: CSSProperties
  rowProps?: HTMLAttributes<HTMLDivElement> & { [k: `data-${string}`]: string | number | undefined }
}

export function SongRow(p: SongRowProps) {
  const { n, art, title, sub, colA, colB, isNew, like, liked, download, time, meta, current, playing, played, dim, phone, onPlay, onMore, grip, end, className, style, rowProps } = p
  const cls = ['slr', 'like-host', phone ? 'is-phone' : '', current ? 'is-current' : '', played ? 'is-played' : '', dim ? 'is-dim' : '', className, rowProps?.className].filter(Boolean).join(' ')
  const toggleOrPlay = () => {
    if (!onPlay) return
    if (current) playerStore.toggle()
    else onPlay()
  }
  const play = (e: MouseEvent) => {
    e.stopPropagation()
    toggleOrPlay()
  }
  const more = end ?? (onMore && (
    <button type="button" className="slr-more" aria-label="More" onClick={(e) => (e.stopPropagation(), onMore(e))}>
      <Icon name="more" />
    </button>
  ))
  const titleEl = (
    <span className="slr-t">
      <span className="slr-tt">{title}</span>
      {isNew && <span className="slr-new">NEW</span>}
    </span>
  )
  return (
    <div
      {...rowProps}
      className={cls}
      style={style}
      role="listitem"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        if (phone || isTouch()) toggleOrPlay()
      }}
      onDoubleClick={(e) => {
        if (phone || isTouch() || (e.target as HTMLElement).closest('a, button')) return
        toggleOrPlay()
      }}
      onContextMenu={(e) => {
        if (!onMore) return
        e.preventDefault()
        onMore(e)
      }}
    >
      {!phone && grip !== undefined && <span className="slr-grip">{grip}</span>}
      {n !== undefined && !(phone && art !== undefined) && (
        <span className="slr-n">
          {current ? <Eq playing={playing} /> : <span className="slr-nn">{n}</span>}
          {onPlay && !phone && (
            <button type="button" className="slr-play" tabIndex={-1} aria-label={current && playing ? 'Pause' : 'Play'} onClick={play}>
              <Icon name={current && playing ? 'pauseF' : 'playF'} />
            </button>
          )}
        </span>
      )}
      {art !== undefined && <span className="slr-art">{art}</span>}
      {phone ? (
        <>
          <span className="slr-text">
            {titleEl}
            {sub != null && (
              <span className="slr-sub">
                {liked && <Icon name="heartF" className="slr-liked" />}
                <span className="slr-subt">{sub}</span>
              </span>
            )}
          </span>
          {meta != null && <span className="slr-meta">{meta}</span>}
          {grip !== undefined ? <span className="slr-pgrip">{grip}</span> : more && <span className="slr-end">{more}</span>}
        </>
      ) : (
        <>
          <span className="slr-text">
            {titleEl}
            {sub != null && <span className="slr-sub">{sub}</span>}
          </span>
          {colA !== undefined && <span className="slr-a">{colA}</span>}
          {colB !== undefined && <span className="slr-b">{colB}</span>}
          {like !== undefined && <span className="slr-like">{like}</span>}
          {download !== undefined && <span className="slr-dl">{download && <DownloadIcon state={download} />}</span>}
          <span className="slr-time">{time}</span>
          <span className="slr-end">{more}</span>
        </>
      )}
    </div>
  )
}

/** Column labels over a desktop list: one entry per drawn cell, `null` for an unlabelled one. */
export function ListHead({ cols }: { cols: (string | null)[] }) {
  return (
    <div className="slr slr-head" role="presentation">
      {cols.map((c, i) => (
        <span key={i} className={c && /^(#|time|plays|added)$/i.test(c) ? 'is-r' : undefined}>
          {c ?? ''}
        </span>
      ))}
    </div>
  )
}

/** "A ——— 214 songs" */
export function ListSection({ label, right, letter, phone }: { label: ReactNode; right?: ReactNode; letter?: string; phone?: boolean }) {
  return (
    <div className={`sls ${phone ? 'is-phone' : ''}`} data-letter={letter}>
      <span className="sls-l">{label}</span>
      <span className="sls-line" />
      {right != null && <span className="sls-r">{right}</span>}
    </div>
  )
}

/** "Up next ——— 1 h 44 min left" over a list (or "Songs ——— 38" when nothing here plays). */
export function UpNext({ songs, current, phone }: { songs: ListSong[]; current: number; phone?: boolean }) {
  if (current < 0) return <ListSection label="Songs" phone={phone} right={`${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`} />
  return <UpNextLive songs={songs} current={current} phone={phone} />
}
function UpNextLive({ songs, current, phone }: { songs: ListSong[]; current: number; phone?: boolean }) {
  const left = useTimeLeft(songs, current)
  return <ListSection label="Up next" phone={phone} right={fmtLeft(left)} />
}

/* ── Windowed, grouped list (thousands of songs) ──────── */

export interface ListGroup<T> {
  key: string
  /** '' = no head */
  label: string
  letter?: string
  items: T[]
}

export interface ListWindowApi {
  /** scroll so group k's head is at the top */
  jump: (k: number) => void
}

/**
 * Renders only the rows near the screen. Reports which rows are on screen (`onView`, as positions in
 * the whole list) and hands back `jump` for the A–Z scrubber.
 */
export function ListWindow<T>({
  groups,
  rowH,
  headH,
  renderRow,
  renderHead,
  onView,
  apiRef,
  topOffset = 120,
}: {
  groups: ListGroup<T>[]
  rowH: number
  headH: number
  renderRow: (item: T, index: number, inGroup: number) => ReactNode
  renderHead: (g: ListGroup<T>, k: number) => ReactNode
  onView?: (from: number, to: number) => void
  apiRef?: RefObject<ListWindowApi | null>
  /** px from the top of the scroller hidden under sticky bars */
  topOffset?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  // layout: one entry per head and row, with its top
  const layout = useMemo(() => {
    const heads: { top: number; k: number }[] = []
    const rows: { top: number; k: number; j: number; i: number }[] = []
    let y = 0
    let i = 0
    groups.forEach((g, k) => {
      if (g.label) {
        heads.push({ top: y, k })
        y += headH
      }
      g.items.forEach((_, j) => {
        rows.push({ top: y, k, j, i })
        y += rowH
        i++
      })
    })
    return { heads, rows, height: y }
  }, [groups, rowH, headH])
  const [range, setRange] = useState<[number, number]>([0, 0])
  // the latest callback without re-running the scroll effect on every render
  const viewRef = useRef(onView)
  useLayoutEffect(() => {
    viewRef.current = onView
  })
  const lastView = useRef('')

  useLayoutEffect(() => {
    const main = document.getElementById('main')
    const el = ref.current
    if (!main || !el) return
    let raf = 0
    const rowAt = (y: number) => {
      // binary search the first row whose bottom is below y
      const r = layout.rows
      let lo = 0
      let hi = r.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (r[mid].top + rowH <= y) lo = mid + 1
        else hi = mid
      }
      return lo
    }
    const update = () => {
      raf = 0
      const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top
      const viewTop = -top
      const viewBot = main.clientHeight - top
      const pad = 600
      setRange((p) => {
        const a = Math.max(0, viewTop - pad)
        const b = Math.min(layout.height, viewBot + pad)
        return Math.abs(p[0] - a) < 120 && Math.abs(p[1] - b) < 120 ? p : [a, b]
      })
      if (viewRef.current && layout.rows.length) {
        const a = rowAt(viewTop + topOffset)
        const b = rowAt(Math.max(0, viewBot - 40))
        if (`${a}:${b}` !== lastView.current) {
          lastView.current = `${a}:${b}`
          viewRef.current(a, b)
        }
      }
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    main.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      main.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [layout, rowH, topOffset])

  useLayoutEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      jump: (k) => {
        const main = document.getElementById('main')
        const el = ref.current
        const h = layout.heads.find((x) => x.k === k)
        const row = layout.rows.find((r) => r.k === k)
        if (!main || !el || (!h && !row)) return
        const y = h ? h.top : row!.top
        main.scrollTo({ top: main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top + y - topOffset + 8 })
      },
    }
  })

  const [a, b] = range
  return (
    <div ref={ref} className="slw" style={{ height: layout.height }} role="list">
      {layout.heads
        .filter((h) => h.top + headH >= a && h.top <= b)
        .map((h) => (
          <div key={'h' + groups[h.k].key} className="slw-item" style={{ top: h.top, height: headH }}>
            {renderHead(groups[h.k], h.k)}
          </div>
        ))}
      {layout.rows
        .filter((r) => r.top + rowH >= a && r.top <= b)
        .map((r) => (
          <div key={groups[r.k].key + ':' + r.j} className="slw-item" style={{ top: r.top, height: rowH }}>
            {renderRow(groups[r.k].items[r.j], r.i, r.j)}
          </div>
        ))}
    </div>
  )
}
