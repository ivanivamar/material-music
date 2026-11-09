/**
 * Reorder mode for the queue carousel (Nov 2026 carousel player).
 *
 * - Desktop: a horizontal strip of equal pills, the drag handle at the top centre of each.
 *   Phone: a vertical list of rows, the handle on the right.
 * - Songs move only by their handle (or arrive in hand from a long press on the carousel, grab.ts).
 *   The others slide apart to open a gap where the song will land (0.3s), and close it again.
 * - Played and upcoming songs are one list: either can cross "Now playing". The playing song itself
 *   stays put (no handle); it shifts only when a song is moved across it.
 * - The one drop zone is Remove (Undo in the toast). Done leaves reorder mode.
 * - Near either end the list scrolls by itself while a song is held.
 * - Keyboard: arrows on a handle move the song by one, Delete / Backspace removes it.
 *
 * Only the rows in view (plus a few) mount, so long queues stay cheap.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../components/ui'
import { Icon } from '../../design/icons'
import { nowPlayingStore } from '../../state/nowPlaying'
import { playerStore, usePlayer } from '../../state/player'
import { useQueueEdits } from '../player'
import { insertionAt, reorderSlot, visibleRange } from './layout'
import { takeGrab } from './grab'
import { useQueueItem } from './useQueueItem'
import { ItemArt } from './ItemArt'
import './carousel.css'

export type ReorderAxis = 'x' | 'y'

const GAP = 8
/** pill width (strip) / row height (list) */
const SIZE: Record<ReorderAxis, number> = { x: 120, y: 64 }
/** auto-scroll: edge band (px) and top speed (px per frame) */
const EDGE = 64
const SPEED = 14
/** after a drop, rows jump to their new places without sliding (the "settle") */
const SETTLE_MS = 80

interface Drag {
  from: number
  ins: number
  pointerId: number
  /** pointer → the lifted card's top-left corner */
  dx: number
  dy: number
  x: number
  y: number
  overRemove: boolean
}

export function ReorderView({ axis }: { axis: ReorderAxis }) {
  const p = usePlayer()
  const edits = useQueueEdits()
  const count = p.queue.length
  const size = SIZE[axis]
  const pitch = size + GAP
  const horizontal = axis === 'x'

  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const removeRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ offset: 0, extent: 0, cross: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const [settle, setSettle] = useState(false)

  /* ── viewport: what's in view, how deep the strip is ───────── */
  const measure = () => {
    const el = scrollRef.current
    if (!el) return
    const next = horizontal
      ? { offset: el.scrollLeft, extent: el.clientWidth, cross: el.clientHeight }
      : { offset: el.scrollTop, extent: el.clientHeight, cross: el.clientWidth }
    setView((v) => (v.offset === next.offset && v.extent === next.extent && v.cross === next.cross ? v : next))
  }
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // open centred on the playing song
    const target = Math.max(0, p.index) * pitch - ((horizontal ? el.clientWidth : el.clientHeight) - size) / 2
    if (horizontal) el.scrollLeft = target
    else el.scrollTop = target
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // once, on entering reorder mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── drag ──────────────────────────────────────────────────── */
  const insertionFor = (x: number, y: number, from: number, dx: number, dy: number) => {
    const track = trackRef.current
    if (!track) return from
    const r = track.getBoundingClientRect()
    // the lifted card's centre along the axis, in strip coordinates
    const centre = horizontal ? x + dx + size / 2 - r.left : y + dy + size / 2 - r.top
    return insertionAt(centre, count - 1, size, GAP)
  }
  const overRemove = (x: number, y: number) => {
    const r = removeRef.current?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }
  const update = (x: number, y: number) => {
    const d = dragRef.current
    if (!d) return
    const next = { ...d, x, y, ins: insertionFor(x, y, d.from, d.dx, d.dy), overRemove: overRemove(x, y) }
    dragRef.current = next
    setDrag(next)
  }
  const begin = (from: number, pointerId: number, x: number, y: number, cardLeft: number, cardTop: number) => {
    if (from === playerStore.get().index) return
    const d: Drag = { from, ins: from, pointerId, dx: cardLeft - x, dy: cardTop - y, x, y, overRemove: false }
    d.ins = insertionFor(x, y, from, d.dx, d.dy)
    dragRef.current = d
    setDrag(d)
  }
  const finish = (commit: boolean) => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || !commit) return
    setSettle(true)
    window.setTimeout(() => setSettle(false), SETTLE_MS)
    if (d.overRemove) edits.remove(d.from)
    else if (d.ins !== d.from) playerStore.move(d.from, d.ins)
  }

  // a long press on the carousel opened reorder mode: that song is already in hand
  useEffect(() => {
    const g = takeGrab()
    if (!g || g.index === null) return
    const w = horizontal ? size : (scrollRef.current?.clientWidth ?? 320)
    const h = horizontal ? (scrollRef.current?.clientHeight ?? 160) : size
    begin(g.index, g.pointerId, g.x, g.y, g.x - w / 2, g.y - h / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // follow the pointer anywhere on the page while a song is held
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      if (e.pointerId !== dragRef.current?.pointerId) return
      e.preventDefault()
      update(e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === dragRef.current?.pointerId) finish(true)
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === dragRef.current?.pointerId) finish(false)
    }
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      finish(false)
    }
    // auto-scroll near the ends
    let raf = 0
    const tick = () => {
      const d = dragRef.current
      const el = scrollRef.current
      if (d && el) {
        const r = el.getBoundingClientRect()
        const pos = horizontal ? d.x : d.y
        const lo = horizontal ? r.left : r.top
        const hi = horizontal ? r.right : r.bottom
        const v = pos < lo + EDGE ? -SPEED * Math.min(1, (lo + EDGE - pos) / EDGE) : pos > hi - EDGE ? SPEED * Math.min(1, (pos - hi + EDGE) / EDGE) : 0
        if (v) {
          if (horizontal) el.scrollLeft += v
          else el.scrollTop += v
          update(d.x, d.y)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
    }
    // the handlers read the live drag from dragRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const onHandleDown = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary || e.button !== 0) return
    e.preventDefault()
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('.rq-item')
    const r = card?.getBoundingClientRect()
    begin(i, e.pointerId, e.clientX, e.clientY, r?.left ?? e.clientX, r?.top ?? e.clientY)
  }

  /* ── keyboard ──────────────────────────────────────────────── */
  const focusHandle = (i: number) =>
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLButtonElement>(`[data-ri="${i}"] .rq-handle`)?.focus())
  const onHandleKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const fwd = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (e.key === back || e.key === fwd) {
      e.preventDefault()
      const to = i + (e.key === fwd ? 1 : -1)
      if (to < 0 || to >= count) return
      playerStore.move(i, to)
      focusHandle(to)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      edits.remove(i)
      focusHandle(Math.min(i, count - 2))
    }
  }

  /* ── render ────────────────────────────────────────────────── */
  const [from, to] = visibleRange(count, view.offset, view.extent, size, GAP)
  const rows: number[] = []
  for (let i = from; i < to; i++) rows.push(i)
  // the dragged row stays mounted (hidden) so its pointer / focus survive scrolling away
  if (drag && (drag.from < from || drag.from >= to)) rows.push(drag.from)

  const ins = drag && !drag.overRemove ? drag.ins : null
  const trackStyle = { [horizontal ? 'width' : 'height']: `${Math.max(0, count * pitch - GAP)}px` } as CSSProperties

  return (
    <div className={`rq rq-${axis} ${drag ? 'is-dragging' : ''} ${settle ? 'is-settling' : ''}`} style={{ '--rq-size': `${size}px` } as CSSProperties}>
      <div className="rq-bar">
        <div ref={removeRef} className={`rq-remove ${drag ? 'is-armed' : ''} ${drag?.overRemove ? 'is-over' : ''}`} aria-hidden={!drag}>
          <Icon name="delete" />
          <span>{drag?.overRemove ? 'Release to remove' : drag ? 'Drop here to remove' : 'Drag a song by its handle'}</span>
        </div>
        <Button variant="album" size="md" icon="done" className="rq-done" onClick={() => nowPlayingStore.closeReorder()}>
          Done
        </Button>
      </div>

      <div ref={scrollRef} className="rq-scroll" onScroll={measure} role="list" aria-label="Queue, reorder mode">
        <div ref={trackRef} className="rq-track" style={trackStyle}>
          {rows.map((i) => {
            const slot = reorderSlot(i, drag?.from ?? null, ins)
            return (
              <ReorderItem
                key={i}
                index={i}
                id={p.queue[i]}
                axis={axis}
                now={i === p.index}
                hidden={slot < 0}
                offset={(slot < 0 ? i : slot) * pitch}
                onHandleDown={onHandleDown(i)}
                onHandleKey={onHandleKey(i)}
              />
            )
          })}
        </div>
      </div>

      {drag && (
        <ReorderItem
          index={drag.from}
          id={p.queue[drag.from]}
          axis={axis}
          now={false}
          lifted
          style={{
            left: drag.x + drag.dx,
            top: drag.y + drag.dy,
            [horizontal ? 'height' : 'width']: view.cross,
          }}
        />
      )}
    </div>
  )
}

interface ItemProps {
  index: number
  id: string
  axis: ReorderAxis
  now: boolean
  hidden?: boolean
  offset?: number
  lifted?: boolean
  style?: CSSProperties
  onHandleDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onHandleKey?: (e: KeyboardEvent<HTMLButtonElement>) => void
}

function ReorderItem({ index, id, axis, now, hidden, offset = 0, lifted, style, onHandleDown, onHandleKey }: ItemProps) {
  const item = useQueueItem(id ?? '')
  const pos = axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`
  return (
    <div
      role={lifted ? undefined : 'listitem'}
      className={`rq-item pg-anim ${now ? 'is-now' : ''} ${hidden ? 'is-hidden' : ''} ${lifted ? 'is-lifted' : ''}`}
      data-ri={lifted ? undefined : index}
      style={lifted ? style : { transform: pos }}
      aria-hidden={lifted || undefined}
    >
      <div className="rq-art" aria-hidden>
        <ItemArt item={item} size={axis === 'x' ? 120 : 48} active={now} />
      </div>
      <div className="rq-text">
        {now && <span className="rq-now">Now playing</span>}
        <span className="rq-title">{item.title}</span>
        {axis === 'y' && item.sub && <span className="rq-sub">{item.sub}</span>}
      </div>
      {now ? (
        <span className="rq-pin" title="The playing song stays in place">
          <Icon name="nowPlaying" />
        </span>
      ) : (
        <button
          type="button"
          className="rq-handle"
          aria-label={`Move ${item.title} (arrow keys), Delete to remove`}
          tabIndex={lifted ? -1 : 0}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
        >
          <Icon name="dragHandle" />
        </button>
      )}
    </div>
  )
}
