/**
 * Queue panel (handoff 07 Queue + 08 demo): 460px right panel that slides in over 0.8s with a scrim.
 * Toggled from the player bar and the full-screen player; over the full-screen player it sits
 * below its 84px header, elsewhere it sits above the player bar.
 *
 *   PLAYING FROM ALBUM · ZANMU / Queue          [shuffle] [Clear] [×]
 *   now playing row (eq, glowing title, position)
 *   PLAYED ──────────────── 03 · 11:02 ⌄   (collapsible; rows: play again · remove; draggable)
 *   NEXT UP ─────────────── 05 · 18:50
 *   rows: drag handle · cover · title/artist · length · ↑ play next · × remove   (click = play)
 *   DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE
 *
 * Reordering: HTML drag-and-drop on desktop (whole row); on the phone (touch) the grip is always
 * visible and dragging it moves the row (pointer events, auto-scroll near the list edges).
 *
 * Long queues (a whole library from Songs) are windowed: only rows near the viewport mount.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Eq, formatTime, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { useLibrary, type Catalogue } from '../state/library'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { fmtTotal } from '../state/views'
import { useIsPhone } from '../state/viewport'
import { contextLine } from './parts'
import './queue.css'

const ROW = 60 // 58px row + 2px gap
const OVERSCAN = 8

function useListWindow(ref: React.RefObject<HTMLDivElement | null>, count: number, active: boolean) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 24)])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let raf = 0
    const update = () => {
      raf = 0
      const from = Math.max(0, Math.floor(el.scrollTop / ROW) - OVERSCAN)
      const to = Math.min(count, Math.ceil((el.scrollTop + el.clientHeight) / ROW) + OVERSCAN)
      setRange((r) => (r[0] === from && r[1] === to ? r : [from, Math.max(from, to)]))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [ref, count, active])
  return range
}

function Cover({ c, albumId, size }: { c: Catalogue; albumId: string; size: number }) {
  const url = useCover(c.albums[albumId]?.cover)
  return url ? <img className="qp-cover" src={url} alt="" width={size} height={size} draggable={false} /> : <span className="qp-cover qp-cover-empty" aria-hidden />
}

interface DragState {
  /** absolute queue index of the dragged row */
  from: number
  /** row (absolute index) the pointer is over; the current track's row counts too */
  over: number | null
  /** drop below `over` instead of above */
  after: boolean
}

/** Drag-and-drop handlers shared by the Played and Next up lists (absolute queue indices). */
interface Dnd {
  enabled: boolean
  drag: DragState | null
  start: (abs: number) => (e: DragEvent) => void
  over: (abs: number) => (e: DragEvent) => void
  end: () => void
  /** phone: touch-drag from the grip (HTML drag-and-drop doesn't exist on touch) */
  grip: (abs: number) => { onPointerDown: (e: PointerEvent<HTMLElement>) => void; onClick: (e: React.MouseEvent) => void }
}

/** Glowing drop line above / below a row while dragging. */
function DropLine({ dnd, abs }: { dnd: Dnd; abs: number }) {
  const d = dnd.drag
  if (!d || d.over !== abs || d.from === abs) return null
  return <span className={`qp-drop ${d.after ? 'qp-drop-bot' : 'qp-drop-top'}`} />
}

const PLAYED_KEY = 'pelagic.queue.played.v1'
const readShowPlayed = () => {
  try {
    return localStorage.getItem(PLAYED_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Already played: the queue rows before the current track, oldest first, so the most recent sits
 * right above "now playing". Own scroll area (max ~30% of the panel), pinned to the bottom while
 * playback moves on. Click a row to play it again, × to drop it. Collapsible (remembered).
 */
function PlayedSection({ c, ids, active, dnd, last }: { c: Catalogue; ids: string[]; active: boolean; dnd: Dnd; last: number }) {
  const [show, setShow] = useState(readShowPlayed)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [from, to] = useListWindow(listRef, ids.length, active && show)
  const total = useMemo(() => ids.reduce((s, id) => s + (c.tracks[id]?.duration ?? 0), 0), [ids, c])

  const toggle = () => {
    const v = !show
    setShow(v)
    stick.current = true
    try {
      localStorage.setItem(PLAYED_KEY, v ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }

  // keep the most recent row in view as tracks finish (unless scrolled up to look back)
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [ids.length, show, active])

  const focusRow = (i: number) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-abs="${i}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        el.focus({ preventScroll: true })
      }
    })
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playerStore.jump(i)
    } else if (e.altKey && e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      playerStore.move(i, i - 1)
      focusRow(i - 1)
    } else if (e.altKey && e.key === 'ArrowDown' && i < last) {
      // past the current track it becomes the first of Next up
      e.preventDefault()
      playerStore.move(i, i + 1)
      focusRow(i + 1)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      playerStore.remove(i)
      focusRow(Math.min(i, ids.length - 2))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(i + (e.key === 'ArrowDown' ? 1 : -1))
    }
  }

  return (
    <div className={`qp-played ${show ? 'is-open' : ''}`}>
      <button type="button" className="qp-rule qp-rule-btn" aria-expanded={show} onClick={toggle} title={show ? 'Hide played tracks' : 'Show played tracks'}>
        <span className="qp-rule-l t-mono">PLAYED</span>
        <span className="qp-rule-line" />
        <span className="qp-rule-r t-mono">
          {String(ids.length).padStart(2, '0')} · {fmtTotal(total)}
        </span>
        <span className="qp-rule-chev" aria-hidden>
          <Icon name="chevD" />
        </span>
      </button>
      {show && (
        <div
          className="qp-list qp-played-list"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
          }}
        >
          <div className="qp-list-in" style={{ height: ids.length * ROW }}>
            {ids.slice(from, to).map((id, k) => {
              const i = from + k
              const t = c.tracks[id]
              return (
                <div
                  key={`${i}:${id}`}
                  data-abs={i}
                  className={`qp-row is-played ${dnd.drag?.from === i ? 'is-drag' : ''}`}
                  style={{ top: i * ROW }}
                  draggable={dnd.enabled}
                  tabIndex={0}
                  role="button"
                  aria-label={t ? `Played: ${t.title} by ${t.artist}. Enter to play again, Alt+arrows to move, Delete to remove.` : 'Missing track'}
                  onDragStart={dnd.start(i)}
                  onDragOver={dnd.over(i)}
                  onDragEnd={dnd.end}
                  onClick={() => playerStore.jump(i)}
                  onKeyDown={onKey(i)}
                >
                  <DropLine dnd={dnd} abs={i} />
                  <span className="qp-handle qp-grip" aria-hidden {...dnd.grip(i)}>
                    <span className="qp-played-n t-mono">{String(i + 1).padStart(2, '0')}</span>
                    <span className="qp-grip-ic">
                      <Icon name="drag" />
                    </span>
                  </span>
                  {t ? <Cover c={c} albumId={t.albumId} size={40} /> : <span className="qp-cover qp-cover-empty" />}
                  <div className="qp-text">
                    <div className="qp-t">{t?.title ?? 'Missing track'}</div>
                    <div className="qp-a">{t?.artist ?? 'No longer in your library'}</div>
                  </div>
                  <span className="qp-d t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
                  <button
                    type="button"
                    className="qp-act"
                    title="Play again"
                    aria-label="Play again"
                    onClick={(e) => {
                      e.stopPropagation()
                      playerStore.jump(i)
                    }}
                  >
                    <Icon name="playF" />
                  </button>
                  <button
                    type="button"
                    className="qp-act qp-act-x"
                    title="Remove"
                    aria-label="Remove from queue"
                    onClick={(e) => {
                      e.stopPropagation()
                      playerStore.remove(i)
                    }}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function QueuePanel() {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const { data } = useLibrary()
  const toast = useToast()
  const phone = useIsPhone()
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const open = ui.queue && p.index >= 0
  const overNp = ui.open
  const currentId = p.index >= 0 ? p.queue[p.index] : null
  const current = currentId ? data?.tracks[currentId] : undefined
  const base = p.index + 1
  const upcoming = useMemo(() => (p.index >= 0 ? p.queue.slice(p.index + 1) : []), [p.queue, p.index])
  const played = useMemo(() => (p.index > 0 ? p.queue.slice(0, p.index) : []), [p.queue, p.index])
  const total = useMemo(() => upcoming.reduce((s, id) => s + (data?.tracks[id]?.duration ?? 0), 0), [upcoming, data])
  const [from, to] = useListWindow(listRef, upcoming.length, open)
  const ctx = contextLine(p.context)
  const cleared = playerStore.clearedUpcoming()

  const close = () => nowPlayingStore.closeQueue()

  /* ── Phone bottom sheet: drag the handle / header ──
   * down → close (or back to normal height when expanded), up → full height; tap the handle to
   * toggle full height. The sheet follows the finger; the scrim fades while pulling down. */
  const [expanded, setExpanded] = useState(false)
  const [grabDy, setGrabDy] = useState<number | null>(null)
  const grab = useRef({ y0: 0, y: 0, t: 0, v: 0, moved: false, onHandle: false })
  if (!open && expanded) setExpanded(false)
  const sheetRef = useRef<HTMLElement>(null)
  // how far the full-height sheet is pushed down at half height (CSS --qp-rest: 50vh − status bar)
  const normalTop = () => window.innerHeight * 0.5 - (sheetRef.current?.offsetTop ?? 0)

  const onGrabDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!phone || (e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, moved: false, onHandle: !!(e.target as HTMLElement).closest('.qp-grab') }
    setGrabDy(0)
  }
  const onGrabMove = (e: PointerEvent<HTMLDivElement>) => {
    if (grabDy === null) return
    const g = grab.current
    const now = performance.now()
    if (now > g.t) g.v = 0.7 * ((e.clientY - g.y) / (now - g.t)) + 0.3 * g.v // px/ms, + = down
    g.y = e.clientY
    g.t = now
    const dy = e.clientY - g.y0
    if (Math.abs(dy) > 4) g.moved = true
    // expanded: can't go higher; normal: up to full height
    setGrabDy(expanded ? Math.max(0, dy) : Math.max(-normalTop(), dy))
  }
  const onGrabUp = () => {
    if (grabDy === null) return
    const { v, moved, onHandle } = grab.current
    const dy = grabDy
    setGrabDy(null)
    if (!moved) {
      // a tap on the handle itself toggles full height
      if (onHandle) setExpanded((x) => !x)
      return
    }
    if (dy > 0 && (dy > 120 || v > 0.5)) {
      if (expanded && dy < normalTop() + 200 && v < 1.2) setExpanded(false)
      else close()
    } else if (dy < 0 && !expanded && (dy < -80 || v < -0.5)) setExpanded(true)
  }
  const sheetStyle: CSSProperties | undefined =
    // transform only (never top/height): the sheet follows the finger from its resting offset
    grabDy === null ? undefined : { transform: `translate3d(0, calc(var(--qp-rest) + ${grabDy}px), 0)` }
  const scrimStyle: CSSProperties | undefined =
    grabDy !== null && grabDy > 0 ? { opacity: Math.max(0, 1 - grabDy / Math.max(1, window.innerHeight - (expanded ? 0 : normalTop()))) } : undefined

  // toasts step left of the panel while it's open
  useEffect(() => {
    if (!open) return
    document.documentElement.setAttribute('data-qp', '')
    return () => document.documentElement.removeAttribute('data-qp')
  }, [open])

  const onClear = () => {
    const removed = playerStore.clearUpcoming()
    if (!removed.length) return
    toast.show({
      icon: 'queue',
      text: `Cleared ${removed.length} upcoming track${removed.length === 1 ? '' : 's'}.`,
      meta: 'QUEUE',
      action: { label: 'Undo', onClick: () => playerStore.restoreUpcoming() },
    })
  }

  /* drag to reorder (absolute queue indices) */
  const onDragStart = (abs: number) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(abs))
    setDrag({ from: abs, over: null, after: false })
  }
  const onDragOver = (abs: number) => (e: DragEvent) => {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    if (drag.over !== abs || drag.after !== after) setDrag({ ...drag, over: abs, after })
  }
  // Rows anywhere in the panel (Played, the current track, Next up) are drop targets: the queue is
  // one list, so dropping a played track into Next up (or the other way round) is a plain move.
  const onDrop = (e: DragEvent) => {
    if (!drag) return
    e.preventDefault()
    if (drag.over !== null) {
      const pos = drag.over + (drag.after ? 1 : 0)
      playerStore.move(drag.from, pos > drag.from ? pos - 1 : pos)
    }
    setDrag(null)
  }

  /* phone: touch drag from the grip. The finger's row (any [data-abs] in the panel, the current
   * track included) is the drop target; near the top / bottom of a list it scrolls. */
  const dragRef = useRef<DragState | null>(null)
  const setDragNow = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }
  const touchEnd = useRef<(() => void) | null>(null)
  // sheet closed (Back, queue emptied) or unmounted mid-drag: drop it
  useEffect(() => {
    if (!open) touchEnd.current?.()
  }, [open])
  useEffect(() => () => touchEnd.current?.(), [])
  const onGripDown = (abs: number) => (e: PointerEvent<HTMLElement>) => {
    if (!phone || !e.isPrimary || touchEnd.current) return
    e.preventDefault()
    e.stopPropagation()
    const pid = e.pointerId
    const pt = { x: e.clientX, y: e.clientY }
    let raf = 0
    setDragNow({ from: abs, over: null, after: false })
    navigator.vibrate?.(8)

    const hit = () => {
      const d = dragRef.current
      const el = document.elementFromPoint(pt.x, pt.y)?.closest<HTMLElement>('.qp [data-abs]')
      if (!d || !el) return
      const over = Number(el.dataset.abs)
      const r = el.getBoundingClientRect()
      const after = pt.y > r.top + r.height / 2
      if (d.over !== over || d.after !== after) setDragNow({ ...d, over, after })
    }
    // auto-scroll: within 56px of a list's visible top / bottom edge (or past it), faster the closer
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const EDGE = 56
      for (const list of document.querySelectorAll<HTMLElement>('.qp .qp-list')) {
        const r = list.getBoundingClientRect()
        const top = r.top
        const bottom = Math.min(r.bottom, window.innerHeight) // half-height sheet: bottom is off-screen
        if (pt.y < top - EDGE || pt.y > bottom + EDGE) continue
        let v = 0
        if (pt.y < top + EDGE && list.scrollTop > 0) v = -Math.min(1, (top + EDGE - pt.y) / EDGE)
        else if (pt.y > bottom - EDGE) v = Math.min(1, (pt.y - (bottom - EDGE)) / EDGE)
        if (v) {
          list.scrollTop += v * 14
          hit()
        }
      }
    }
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pid) return
      ev.preventDefault()
      pt.x = ev.clientX
      pt.y = ev.clientY
      hit()
    }
    const finish = (commit: boolean) => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      touchEnd.current = null
      const d = dragRef.current
      setDragNow(null)
      if (commit && d && d.over !== null && d.over !== d.from) {
        const pos = d.over + (d.after ? 1 : 0)
        const to = pos > d.from ? pos - 1 : pos
        if (to !== d.from) playerStore.move(d.from, to)
      }
    }
    const onUp = (ev: globalThis.PointerEvent) => ev.pointerId === pid && finish(true)
    const onCancel = (ev: globalThis.PointerEvent) => ev.pointerId === pid && finish(false)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    touchEnd.current = () => finish(false)
    raf = requestAnimationFrame(tick)
  }
  const grip = (abs: number) => ({
    onPointerDown: onGripDown(abs),
    // a tap on the grip must not play the row
    onClick: (e: React.MouseEvent) => phone && e.stopPropagation(),
  })

  const dnd: Dnd = { enabled: !phone, drag, start: onDragStart, over: onDragOver, end: () => setDrag(null), grip }

  const onRowKey = (abs: number) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const last = p.queue.length - 1
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playerStore.jump(abs)
    } else if (e.altKey && e.key === 'ArrowUp' && abs > 0) {
      e.preventDefault()
      playerStore.move(abs, abs - 1)
      focusRow(abs - 1)
    } else if (e.altKey && e.key === 'ArrowDown' && abs < last) {
      e.preventDefault()
      playerStore.move(abs, abs + 1)
      focusRow(abs + 1)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      playerStore.remove(abs)
      focusRow(Math.min(abs, last - 1))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(abs + (e.key === 'ArrowDown' ? 1 : -1))
    }
  }
  const focusRow = (abs: number) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-abs="${abs}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        el.focus({ preventScroll: true })
      }
    })

  return (
    <>
      <div className={`qp-scrim pg-anim ${overNp ? 'is-over-np' : ''} ${open ? 'is-open' : ''} ${grabDy !== null ? 'is-grabbing' : ''}`} style={scrimStyle} onClick={close} aria-hidden />
      <aside
        ref={sheetRef}
        className={`qp pg-anim ${overNp ? 'is-over-np' : ''} ${open ? 'is-open' : ''} ${drag ? 'is-dragging' : ''} ${expanded ? 'is-expanded' : ''} ${grabDy !== null ? 'is-grabbing' : ''}`}
        style={sheetStyle}
        aria-label="Queue"
        aria-hidden={!open}
        inert={!open}
        onDragOver={(e) => drag && e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="qp-grab-zone" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={() => setGrabDy(null)}>
          {phone && (
            <div className="qp-grab" role="presentation" title={expanded ? 'Drag down to shrink or close' : 'Drag up to expand, down to close'}>
              <span />
            </div>
          )}
        <div className="qp-head">
          <div className="qp-head-text">
            <div className="qp-kicker t-mono" title={`${ctx.kicker} · ${ctx.label}`}>
              {ctx.kicker} · {ctx.label.toUpperCase()}
            </div>
            <h2 className="qp-title">Queue</h2>
          </div>
          <div className="qp-tools">
            <button
              type="button"
              className={`qp-tool qp-tool-sq ${p.shuffle ? 'is-on' : ''}`}
              title={p.shuffle ? 'Shuffle on: turn off to restore the order' : 'Shuffle: current track first, the rest shuffled'}
              aria-label={p.shuffle ? 'Shuffle on' : 'Shuffle'}
              aria-pressed={p.shuffle}
              onClick={() => playerStore.toggleShuffle()}
            >
              <Icon name="shuffle" />
            </button>
            <button type="button" className="qp-tool qp-tool-text" disabled={!upcoming.length} onClick={onClear}>
              Clear
            </button>
            <button type="button" className="qp-tool qp-tool-x" title="Close" aria-label="Close queue" onClick={close}>
              <Icon name="x" />
            </button>
          </div>
        </div>
        </div>

        {played.length > 0 && data && <PlayedSection c={data} ids={played} active={open} dnd={dnd} last={p.queue.length - 1} />}

        {current && data && (
          <div className="qp-now" data-abs={p.index} onDragOver={onDragOver(p.index)}>
            <DropLine dnd={dnd} abs={p.index} />
            <span className="qp-handle">
              <Eq playing={p.playing} />
            </span>
            <Cover c={data} albumId={current.albumId} size={42} />
            <div className="qp-text">
              <div className="qp-t is-now">{current.title}</div>
              <div className="qp-a">{current.artist}</div>
            </div>
            <span className="qp-d t-mono">{formatTime(p.position)}</span>
          </div>
        )}

        <div className="qp-rule">
          <span className="qp-rule-l t-mono">NEXT UP</span>
          <span className="qp-rule-line" />
          <span className="qp-rule-r t-mono">
            {String(upcoming.length).padStart(2, '0')} · {fmtTotal(total) || '00:00'}
          </span>
        </div>

        {upcoming.length > 0 && data ? (
          <div className="qp-list" ref={listRef}>
            <div className="qp-list-in" style={{ height: upcoming.length * ROW }}>
              {upcoming.slice(from, to).map((id, k) => {
                const i = from + k
                const abs = base + i
                const t = data.tracks[id]
                const isDrag = drag?.from === abs
                return (
                  <div
                    key={`${abs}:${id}`}
                    data-abs={abs}
                    className={`qp-row ${isDrag ? 'is-drag' : ''}`}
                    style={{ top: i * ROW }}
                    draggable={!phone}
                    tabIndex={0}
                    role="button"
                    aria-label={t ? `${t.title} by ${t.artist}. Enter to play, Alt+arrows to move, Delete to remove.` : 'Missing track'}
                    onDragStart={onDragStart(abs)}
                    onDragOver={onDragOver(abs)}
                    onDragEnd={() => setDrag(null)}
                    onClick={() => playerStore.jump(abs)}
                    onKeyDown={onRowKey(abs)}
                  >
                    <DropLine dnd={dnd} abs={abs} />
                    <span className="qp-handle qp-grip" aria-hidden {...dnd.grip(abs)}>
                      <Icon name="drag" />
                    </span>
                    {t ? <Cover c={data} albumId={t.albumId} size={40} /> : <span className="qp-cover qp-cover-empty" />}
                    <div className="qp-text">
                      <div className="qp-t">{t?.title ?? 'Missing track'}</div>
                      <div className="qp-a">{t?.artist ?? 'No longer in your library'}</div>
                    </div>
                    <span className="qp-d t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
                    <button
                      type="button"
                      className="qp-act"
                      title="Play next"
                      aria-label="Play next"
                      disabled={abs === base}
                      onClick={(e) => {
                        e.stopPropagation()
                        playerStore.move(abs, base)
                      }}
                    >
                      <Icon name="chevU" />
                    </button>
                    <button
                      type="button"
                      className="qp-act qp-act-x"
                      title="Remove"
                      aria-label="Remove from queue"
                      onClick={(e) => {
                        e.stopPropagation()
                        playerStore.remove(abs)
                      }}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="qp-empty">
            <div className="qp-empty-mark" aria-hidden>
              <span />
              <span />
              <span />
            </div>
            <div className="qp-empty-t">Still water after this one.</div>
            <div className="qp-empty-b">
              {p.repeat === 'one'
                ? `Nothing is queued. Repeat one keeps “${current?.title ?? 'this track'}” going.`
                : p.repeat === 'all'
                  ? `Nothing is queued. With repeat on, “${current?.title ?? 'this track'}” plays again.`
                  : `Nothing is queued. Playback stops when “${current?.title ?? 'this track'}” ends.`}
            </div>
            {cleared?.length ? (
              <button type="button" className="qp-restore" onClick={() => playerStore.restoreUpcoming()}>
                Restore queue
              </button>
            ) : null}
          </div>
        )}

        <div className="qp-foot t-mono">{phone ? 'HOLD ⠿ TO REORDER · ↑ PLAY NEXT · × REMOVE' : 'DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE'}</div>
      </aside>
    </>
  )
}
