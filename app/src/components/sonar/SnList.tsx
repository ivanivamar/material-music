/**
 * Sonar list rows (Nov 2026 mockups): one line per song, a small arc for its length, then title,
 * two text columns (artist / album, or what the page needs), time and plays with a dot. On the
 * phone: the arc, title over artist, a right-hand meta and the dot. Plus the header row, the
 * section head ("M ——— 150 songs · 9 h 41 min") and a windowed list for long, grouped views.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Icon } from '../../design/icons'
import { playerStore } from '../../state/player'
import { isTouch } from '../../state/viewport'
import { LenGlyph, PlaysDot, fmtLeft, useTimeLeft, type SonarSong } from './Sonar'

export interface SnRowProps {
  /** row number (desktop), or null */
  n?: string | null
  len: number
  isNew?: boolean
  title: ReactNode
  /** phone: second line under the title */
  sub?: ReactNode
  colA?: ReactNode
  colB?: ReactNode
  time?: ReactNode
  /** phone: right-hand text (time, date) */
  meta?: ReactNode
  plays?: number
  maxPlays?: number
  current?: boolean
  playing?: boolean
  /** before the playing song in an ordered list: quieter title */
  played?: boolean
  dim?: boolean
  phone?: boolean
  onPlay?: () => void
  onMore?: (e: MouseEvent) => void
  /** desktop: drag handle at the start; phone: grip at the end */
  grip?: ReactNode
  /** replaces the more button (e.g. remove a missing song) */
  end?: ReactNode
  className?: string
  style?: CSSProperties
  rowProps?: HTMLAttributes<HTMLDivElement> & { [k: `data-${string}`]: string | number | undefined }
}

export function SnRow(p: SnRowProps) {
  const { n, len, isNew, title, sub, colA, colB, time, meta, plays, maxPlays = 0, current, playing, played, dim, phone, onPlay, onMore, grip, end, className, style, rowProps } = p
  const cls = ['snr', 'like-host', phone ? 'is-phone' : '', current ? 'is-current' : '', played ? 'is-played' : '', dim ? 'is-dim' : '', className, rowProps?.className].filter(Boolean).join(' ')
  const play = (e: MouseEvent) => {
    e.stopPropagation()
    if (!onPlay) return
    if (current) playerStore.toggle()
    else onPlay()
  }
  return (
    <div
      {...rowProps}
      className={cls}
      style={style}
      role="listitem"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        if (!onPlay) return
        if (phone || isTouch()) {
          if (current) playerStore.toggle()
          else onPlay()
        }
      }}
      onDoubleClick={(e) => {
        if (phone || isTouch() || (e.target as HTMLElement).closest('a, button')) return
        if (current) playerStore.toggle()
        else onPlay?.()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMore?.(e)
      }}
    >
      {!phone && grip !== undefined && <span className="snr-grip">{grip}</span>}
      {n != null && (
        <span className="snr-n">
          <span className="snr-nn">{n}</span>
          {onPlay && !phone && (
            <button type="button" className="snr-play" tabIndex={-1} aria-label={current && playing ? 'Pause' : 'Play'} onClick={play}>
              <Icon name={current && playing ? 'pauseF' : 'playF'} />
            </button>
          )}
        </span>
      )}
      <LenGlyph seconds={len} active={current} isNew={isNew} />
      {phone ? (
        <span className="snr-text">
          <span className="snr-t">
            {title}
            {isNew && <span className="sn-new">NEW</span>}
          </span>
          {sub && <span className="snr-sub">{sub}</span>}
        </span>
      ) : (
        <>
          <span className="snr-t">
            <span className="snr-tt">{title}</span>
            {isNew && <span className="sn-new">NEW</span>}
          </span>
          <span className="snr-a">{colA}</span>
          <span className="snr-b">{colB}</span>
        </>
      )}
      {phone ? meta != null && <span className="snr-meta">{meta}</span> : <span className="snr-time">{time}</span>}
      {plays !== undefined &&
        (phone ? (
          <span className="snr-dotc">
            <PlaysDot plays={plays} max={maxPlays} active={current} />
          </span>
        ) : (
          <span className="snr-plays">
            <span className="snr-pn">{plays}</span>
            <PlaysDot plays={plays} max={maxPlays} active={current} />
          </span>
        ))}
      {phone && grip !== undefined && <span className="snr-pgrip">{grip}</span>}
      {(end || onMore) && (
        <span className="snr-end">
          {end ??
            (onMore && (
              <button type="button" className="snr-more" aria-label="More" onClick={(e) => (e.stopPropagation(), onMore(e))}>
                <Icon name="more" />
              </button>
            ))}
        </span>
      )}
    </div>
  )
}

/** Column labels over a desktop list. */
export function SnHead({ cols, grip }: { cols: (string | null)[]; grip?: boolean }) {
  return (
    <div className="snr snr-head" role="presentation">
      {grip && <span />}
      {cols.map((c, i) => (
        <span key={i} className={i >= cols.length - 2 ? 'is-r' : undefined}>
          {c ?? ''}
        </span>
      ))}
    </div>
  )
}

/** "M ——— 150 songs · 9 h 41 min" */
export function SnSection({ label, right, letter, phone }: { label: string; right?: ReactNode; letter?: string; phone?: boolean }) {
  return (
    <div className={`sns ${phone ? 'is-phone' : ''}`} data-letter={letter}>
      <span className="sns-l">{label}</span>
      <span className="sns-line" />
      {right != null && <span className="sns-r">{right}</span>}
    </div>
  )
}

export function fmtHoursMin(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

/* ── Windowed, grouped list (thousands of songs) ──────── */

export interface SnGroup<T> {
  key: string
  label: string
  letter?: string
  items: T[]
}

export interface SnWindowApi {
  /** scroll so group k's head is at the top */
  jump: (k: number) => void
}

/**
 * Renders only the rows near the screen. Reports which songs are on screen (`onView`, as positions
 * in the whole list) so the ring can follow, and hands back `jump` for the ring / scrubber.
 */
export function SnWindow<T>({
  groups,
  rowH,
  headH,
  renderRow,
  renderHead,
  onView,
  apiRef,
  topOffset = 120,
}: {
  groups: SnGroup<T>[]
  rowH: number
  headH: number
  renderRow: (item: T, index: number, inGroup: number) => ReactNode
  renderHead: (g: SnGroup<T>, k: number) => ReactNode
  onView?: (from: number, to: number) => void
  apiRef?: React.RefObject<SnWindowApi | null>
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
    <div ref={ref} className="snw" style={{ height: layout.height }} role="list">
      {layout.heads
        .filter((h) => h.top + headH >= a && h.top <= b)
        .map((h) => (
          <div key={'h' + groups[h.k].key} className="snw-item" style={{ top: h.top, height: headH }}>
            {renderHead(groups[h.k], h.k)}
          </div>
        ))}
      {layout.rows
        .filter((r) => r.top + rowH >= a && r.top <= b)
        .map((r) => (
          <div key={groups[r.k].key + ':' + r.j} className="snw-item" style={{ top: r.top, height: rowH }}>
            {renderRow(groups[r.k].items[r.j], r.i, r.j)}
          </div>
        ))}
    </div>
  )
}

/** "Up next ——— 1 h 44 min left" over a phone list (or "Songs ——— 38" when nothing here plays). */
export function UpNext({ songs, current }: { songs: SonarSong[]; current: number }) {
  if (current < 0) return <SnSection label="Songs" phone right={`${songs.length}`} />
  return <UpNextLive songs={songs} current={current} />
}
function UpNextLive({ songs, current }: { songs: SonarSong[]; current: number }) {
  const left = useTimeLeft(songs, current)
  return (
    <div className="snp-upnext">
      <span className="sn-lab" style={{ color: 'var(--ink-primary)' }}>
        Up next
      </span>
      <span className="sect-line" />
      <span className="sn-lab">{fmtLeft(left)}</span>
    </div>
  )
}
