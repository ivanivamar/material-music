/**
 * Queue (design_handoff_queue_popover): a floating glass popover on desktop, a floating bottom
 * sheet on the phone. Both show ONE scroll area: PLAYED → Now playing card → NEXT UP.
 *
 *   Queue 07                                [shuffle] [save] [Clear] [×]
 *   [cover] PLAYING FROM ALBUM  Zanmu…            (only the name truncates)
 *   ──────────────────────────────────────────────
 *   PLAYED ──────────────── 03 · 11:50
 *     01 [cover] title / artist · album   3:42 ▶     (dimmed; click = play again)
 *   ┌ NOW PLAYING card (lilac), elapsed / total, 2px progress along the bottom ┐
 *   NEXT UP ─────────────── 07 · 28:10
 *     ⠿ [cover] title / artist · album  ♥  3:42  ↑ ×
 *   ──────────────────────────────────────────────
 *   DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE
 *
 * The list is windowed (a whole library can be queued from Songs): rows are absolutely placed and
 * only the ones near the viewport mount. It opens with the Now playing card ~12px from the top and
 * keeps following the current track until the list is scrolled or touched.
 *
 * Desktop: HTML drag-and-drop on Next up rows (lilac drop line above / below the target).
 * Phone: no inline ↑ / × buttons. Hold a row (or press its grip) and drag to reorder; swipe a row
 * left to remove it (Undo in a toast); hold and let go without moving = the track menu. The whole
 * header drags the sheet (down = close / shrink, up = full height); a press on a header button
 * only becomes a drag after 8px, so taps still work.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Eq, formatTime, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { useLibrary, type Catalogue } from '../state/library'
import { useLikes } from '../state/likes'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { playerStore, usePlayer } from '../state/player'
import { usePlaylists } from '../state/playlists'
import { fmtTotal } from '../state/views'
import { useIsPhone } from '../state/viewport'
import { PlaylistCover } from '../pages/playlists/PlaylistCover'
import { contextLine } from './parts'
import { actions } from '../actions/actions'
import './queue.css'

/* Row metrics (px) per layout: section rule, played row (56 + 2px gap), next-up row (58/60 + 2px gap). */
const DESKTOP = { rule: 40, played: 58, next: 60 }
const PHONE = { rule: 36, played: 58, next: 62 }
/** Now playing block: 10px margin + 78px card (1 + 12 + 52 + 12 + 1) + 6px margin */
const NOW_M_TOP = 10
const NOW_CARD = 78
const NOW_BLOCK = NOW_M_TOP + NOW_CARD + 6
const EMPTY_H = 280
const OVERSCAN = 6
/** distance between the scroller's top edge and the card when it's scrolled into place */
const NOW_INSET = 12

/** Scroll offset + visible height of a scroller (rAF-throttled). */
function useScrollBox(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [box, setBox] = useState<[number, number]>([0, 800])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) return
    let raf = 0
    const update = () => {
      raf = 0
      const st = el.scrollTop
      const h = el.clientHeight
      setBox((b) => (b[0] === st && b[1] === h ? b : [st, h]))
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
  }, [ref, active])
  return box
}

/** Rows [from, to) of a run of `h`-high rows starting at `y0` that overlap the viewport (+ overscan). */
const rowRange = (y0: number, n: number, rowH: number, st: number, vh: number): [number, number] => {
  const from = Math.max(0, Math.floor((st - y0) / rowH) - OVERSCAN)
  const to = Math.min(n, Math.ceil((st + vh - y0) / rowH) + OVERSCAN)
  return [Math.min(from, n), Math.max(from, to)]
}

function Cover({ c, albumId, className }: { c: Catalogue; albumId: string; className: string }) {
  const url = useCover(c.albums[albumId]?.cover)
  return url ? <img className={className} src={url} alt="" draggable={false} /> : <span className={`${className} qp-cover-empty`} aria-hidden />
}

const sub = (c: Catalogue, id: string) => {
  const t = c.tracks[id]
  if (!t) return 'No longer in your library'
  const album = c.albums[t.albumId]?.title
  return album ? `${t.artist} · ${album}` : t.artist
}

interface DragState {
  /** absolute queue index of the dragged (upcoming) row */
  from: number
  /** upcoming row (absolute index) the pointer is over */
  over: number | null
  /** drop below `over` instead of above */
  after: boolean
}

/** Where a drag ends up: index `to` for playerStore.move, or null for "no change". */
function dropTarget(d: DragState | null, base: number): number | null {
  if (!d || d.over === null) return null
  const pos = d.over + (d.after ? 1 : 0)
  const to = Math.max(base, pos > d.from ? pos - 1 : pos)
  return to === d.from ? null : to
}

/* ── Played row: check/play · cover · title / artist · album · Played badge · length (click = play again) ── */
function PlayedRow({
  c,
  id,
  abs,
  top,
  isFirst,
  isLast,
  onKey,
}: {
  c: Catalogue
  id: string
  abs: number
  top: number
  isFirst: boolean
  isLast: boolean
  phone: boolean
  onKey: (abs: number) => (e: KeyboardEvent) => void
}) {
  const t = c.tracks[id]
  return (
    <div
      data-abs={abs}
      className={`qp-row qp-prow ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''}`}
      style={{ top }}
      tabIndex={0}
      role="button"
      aria-label={t ? `Played: ${t.title} by ${t.artist}. Enter to play again.` : 'Missing track'}
      onClick={() => playerStore.jump(abs)}
      onContextMenu={(e) => t && actions.menu({ kind: 'track', trackId: t.id }, e)}
      onKeyDown={onKey(abs)}
    >
      <div className="qp-row-in">
        <span className="qp-pnum" title="Played · click to play again" aria-hidden>
          <span className="qp-pn-done">
            <Icon name="check" />
          </span>
          <span className="qp-pn-play">
            <Icon name="playF" />
          </span>
        </span>
        {t ? <Cover c={c} albumId={t.albumId} className="qp-cover qp-pcover" /> : <span className="qp-cover qp-pcover qp-cover-empty" />}
        <div className="qp-text">
          <div className="qp-t">{t?.title ?? 'Missing track'}</div>
          <div className="qp-a">{sub(c, id)}</div>
        </div>
        <span className="qp-played-tag">Played</span>
        <span className="qp-d t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
      </div>
    </div>
  )
}

interface NextRowProps {
  c: Catalogue
  id: string
  abs: number
  top: number
  base: number
  isFirst: boolean
  isLast: boolean
  phone: boolean
  liked: boolean
  drag: DragState | null
  onDragStart: (abs: number) => (e: DragEvent) => void
  onDragOver: (abs: number) => (e: DragEvent) => void
  onDragEnd: () => void
  onTouchDown: (abs: number, mode: 'grip' | 'row') => (e: PointerEvent<HTMLElement>) => void
  onKey: (abs: number) => (e: KeyboardEvent) => void
  remove: (abs: number) => void
}

/* ── Next up row: grip · cover · title / artist · album · length · ↑ · × ── */
function NextRow({ c, id, abs, top, base, isFirst, isLast, phone, drag, onDragStart, onDragOver, onDragEnd, onTouchDown, onKey, remove }: NextRowProps) {
  const t = c.tracks[id]
  const isDrag = drag?.from === abs
  const line = drag && drag.over === abs && drag.from !== abs && dropTarget(drag, base) !== null ? (drag.after ? 'bot' : 'top') : null
  return (
    <div
      data-abs={abs}
      data-up=""
      className={`qp-row qp-nrow ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''} ${isDrag ? 'is-drag' : ''}`}
      style={{ top }}
      draggable={!phone}
      tabIndex={0}
      role="button"
      aria-label={t ? `${t.title} by ${t.artist}. Enter to play, Alt+arrows to move, Delete to remove.` : 'Missing track'}
      onDragStart={onDragStart(abs)}
      onDragOver={onDragOver(abs)}
      onDragEnd={onDragEnd}
      onPointerDown={phone ? onTouchDown(abs, 'row') : undefined}
      onClick={() => playerStore.jump(abs)}
      onContextMenu={(e) => {
        // phone: a long press is the reorder lift (and opens the menu itself when let go in place)
        if (phone) return e.preventDefault()
        if (t) actions.menu({ kind: 'track', trackId: t.id }, e)
      }}
      onKeyDown={onKey(abs)}
    >
      {phone && (
        <span className="qp-swipe-bg" aria-hidden>
          <Icon name="x" />
        </span>
      )}
      <div className="qp-row-in">
        {line && <span className={`qp-drop qp-drop-${line}`} />}
        <span className="qp-grip" aria-hidden onPointerDown={phone ? onTouchDown(abs, 'grip') : undefined} onClick={(e) => phone && e.stopPropagation()}>
          <Icon name="drag" />
        </span>
        {t ? <Cover c={c} albumId={t.albumId} className="qp-cover qp-ncover" /> : <span className="qp-cover qp-ncover qp-cover-empty" />}
        <div className="qp-text">
          <div className="qp-t">{t?.title ?? 'Missing track'}</div>
          <div className="qp-a">{sub(c, id)}</div>
        </div>
        <span className="qp-d qp-nd t-mono">{t?.duration ? formatTime(t.duration) : '--:--'}</span>
        {!phone && (
          <span className="qp-acts">
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
                remove(abs)
              }}
            >
              <Icon name="x" />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/** 22px (phone 20px) cover of what's playing: the playlist's cover, else the album's. */
function SourceCover({ c, albumId }: { c: Catalogue | null | undefined; albumId: string | undefined }) {
  const p = usePlayer()
  const pl = usePlaylists()
  const ctx = p.context
  const playlist = ctx?.kind === 'playlist' && ctx.id ? pl.byId.get(ctx.id) : undefined
  const cover = useCover(ctx?.kind === 'album' && ctx.id ? c?.albums[ctx.id]?.cover : albumId ? c?.albums[albumId]?.cover : null)
  if (playlist) return <PlaylistCover playlist={playlist} className="qp-src-cover" />
  return cover ? <img className="qp-src-cover" src={cover} alt="" draggable={false} /> : <span className="qp-src-cover qp-cover-empty" aria-hidden />
}

export function QueuePanel() {
  const ui = useNowPlayingUi()
  const p = usePlayer()
  const { data } = useLibrary()
  const likes = useLikes()
  const toast = useToast()
  const phone = useIsPhone()
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const open = ui.queue && p.index >= 0 && p.context?.kind !== 'dj' // no queue panel while the DJ plays
  const overNp = ui.open
  const currentId = p.index >= 0 ? p.queue[p.index] : null
  const current = currentId ? data?.tracks[currentId] : undefined
  const base = p.index + 1
  const upcoming = useMemo(() => (p.index >= 0 ? p.queue.slice(p.index + 1) : []), [p.queue, p.index])
  const played = useMemo(() => (p.index > 0 ? p.queue.slice(0, p.index) : []), [p.queue, p.index])
  const total = useMemo(() => upcoming.reduce((s, id) => s + (data?.tracks[id]?.duration ?? 0), 0), [upcoming, data])
  const playedTotal = useMemo(() => played.reduce((s, id) => s + (data?.tracks[id]?.duration ?? 0), 0), [played, data])
  const ctx = contextLine(p.context)
  const cleared = playerStore.clearedUpcoming()
  const close = () => nowPlayingStore.closeQueue()

  /* ── one list: PLAYED rule · played rows · now playing card · NEXT UP rule · upcoming rows ── */
  const M = phone ? PHONE : DESKTOP
  const [st, boxH] = useScrollBox(listRef, open)
  const playedTop = played.length ? M.rule : 0
  const nowTop = played.length ? playedTop + played.length * M.played : 0
  const nextRuleTop = nowTop + NOW_BLOCK
  const upTop = nextRuleTop + M.rule
  // tall enough that the card can always be scrolled up to NOW_INSET from the top
  const innerH = Math.max(upTop + (upcoming.length ? upcoming.length * M.next : EMPTY_H), nowTop + NOW_M_TOP + boxH - 40)
  const [pFrom, pTo] = rowRange(playedTop, played.length, M.played, st, boxH)
  const [uFrom, uTo] = rowRange(upTop, upcoming.length, M.next, st, boxH)

  // the scroller's padding-top sits above the inner list, so the card is at padTop + nowTop + 10
  const follow = useRef(true)
  const scrollToNow = () => {
    const el = listRef.current
    if (!el) return
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0
    el.scrollTop = Math.max(0, padTop + nowTop + NOW_M_TOP - NOW_INSET)
  }
  useLayoutEffect(() => {
    if (!open) return
    follow.current = true
    scrollToNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phone])
  useLayoutEffect(() => {
    if (open && follow.current && !drag) scrollToNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.index])
  const stopFollowing = () => (follow.current = false)

  /* ── Phone bottom sheet: drag the handle / header ──
   * down → close (or back to normal height when expanded), up → full height; tap the handle to
   * toggle full height. The sheet follows the finger; the scrim fades while pulling down. */
  const [expanded, setExpanded] = useState(false)
  const [grabDy, setGrabDy] = useState<number | null>(null)
  const grab = useRef({ y0: 0, y: 0, t: 0, v: 0, moved: false, onHandle: false, fromBtn: false })
  if (!open && expanded) setExpanded(false)
  const sheetRef = useRef<HTMLElement>(null)
  // how far the expanded sheet is pushed down at rest (CSS --qp-rest)
  const restOffset = () => (sheetRef.current ? parseFloat(getComputedStyle(sheetRef.current).getPropertyValue('--qp-rest')) || 0 : 0)

  /* The whole header is the grab area, its buttons included: a press on a button stays a tap
   * (the button gets its click) until the finger travels BTN_SLOP, then the zone captures the
   * pointer and it becomes a sheet drag (and the click is swallowed). */
  const BTN_SLOP = 8
  const swallowClick = useRef(false)
  const onGrabDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!phone || !e.isPrimary) return
    const target = e.target as HTMLElement
    const fromBtn = !!target.closest('button')
    if (!fromBtn) e.currentTarget.setPointerCapture(e.pointerId)
    swallowClick.current = false
    grab.current = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0, moved: false, onHandle: !!target.closest('.qp-grab'), fromBtn }
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
    if (!g.moved) {
      if (Math.abs(dy) <= (g.fromBtn ? BTN_SLOP : 4)) return
      g.moved = true
      if (g.fromBtn) {
        // the button press turns into a drag: take the pointer so the button never gets a click
        swallowClick.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
      }
    }
    // expanded: can't go higher; normal: up to full height
    setGrabDy(expanded ? Math.max(0, dy) : Math.max(-restOffset(), dy))
  }
  const onGrabClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }
  const onGrabUp = () => {
    if (grabDy === null) return
    const { v, moved, onHandle } = grab.current
    const dy = grabDy
    setGrabDy(null)
    // a click from this gesture (if any) fires right after pointerup; drop the flag after it
    if (swallowClick.current) window.setTimeout(() => (swallowClick.current = false), 350)
    if (!moved) {
      // a tap on the handle itself toggles full height
      if (onHandle) setExpanded((x) => !x)
      return
    }
    if (dy > 0 && (dy > 120 || v > 0.5)) {
      if (expanded && dy < restOffset() + 200 && v < 1.2) setExpanded(false)
      else close()
    } else if (dy < 0 && !expanded && (dy < -60 || v < -0.5)) setExpanded(true)
  }
  const sheetStyle: CSSProperties | undefined =
    // transform only (never top/height): the sheet follows the finger from its resting offset
    grabDy === null ? undefined : { transform: `translate3d(0, calc(var(--qp-rest) + ${grabDy}px), 0)` }
  const scrimStyle: CSSProperties | undefined =
    grabDy !== null && grabDy > 0 ? { opacity: Math.max(0, 1 - grabDy / Math.max(1, window.innerHeight - (expanded ? 0 : restOffset()))) } : undefined

  // toasts step left of the popover while it's open
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

  /** × (desktop) / swipe left (phone). The phone gets an Undo, since a swipe is easy to do by accident. */
  const removeRow = (abs: number) => {
    const id = playerStore.get().queue[abs]
    if (!id) return
    playerStore.remove(abs)
    if (!phone) return
    const t = data?.tracks[id]
    toast.show({
      icon: 'queue',
      text: t ? `Removed “${t.title}” from the queue.` : 'Removed from the queue.',
      meta: 'QUEUE',
      action: { label: 'Undo', onClick: () => playerStore.insert(abs, id) },
    })
  }

  /* ── desktop: HTML drag-and-drop on Next up rows (absolute queue indices) ── */
  const onDragStart = (abs: number) => (e: DragEvent) => {
    if (phone) return
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
  // over the Now playing card = above the first upcoming row
  const onNowDragOver = (e: DragEvent) => {
    if (!drag || !upcoming.length) return
    e.preventDefault()
    if (drag.over !== base || drag.after) setDrag({ ...drag, over: base, after: false })
  }
  const onDrop = (e: DragEvent) => {
    if (!drag) return
    e.preventDefault()
    const to = dropTarget(drag, base)
    if (to !== null) playerStore.move(drag.from, to)
    setDrag(null)
  }

  /* ── phone: touch gestures on Next up rows ──
   * grip: drag at once. row: hold 380ms → lift and drag (let go in place → track menu);
   * a horizontal move first → swipe (left past 35% of the width or a flick → remove);
   * a vertical move first → the list scrolls as usual (rows are touch-action: pan-y). */
  const dragRef = useRef<DragState | null>(null)
  const setDragNow = (d: DragState | null) => {
    dragRef.current = d
    setDrag(d)
  }
  const gesture = useRef<(() => void) | null>(null)
  const swallowRowClick = useRef(0)
  // sheet closed (Back, queue emptied) or unmounted mid-gesture: drop it
  useEffect(() => {
    if (!open) gesture.current?.()
  }, [open])
  useEffect(() => () => gesture.current?.(), [])
  // while a row is lifted, the list must not scroll under the finger (rows are pan-y for swipes /
  // scrolling): a non-passive touchmove listener, there before the touch starts, cancels it
  useEffect(() => {
    const el = listRef.current
    if (!el || !phone) return
    const noScroll = (ev: TouchEvent) => {
      if (dragRef.current && ev.cancelable) ev.preventDefault()
    }
    el.addEventListener('touchmove', noScroll, { passive: false })
    return () => el.removeEventListener('touchmove', noScroll)
  }, [phone])

  const startReorder = (abs: number, pid: number, pt: { x: number; y: number }, fromHold: boolean) => {
    let raf = 0
    let moved = false
    const x0 = pt.x
    const y0 = pt.y
    setDragNow({ from: abs, over: null, after: false })
    navigator.vibrate?.(8)

    const hit = () => {
      const d = dragRef.current
      const el = document.elementFromPoint(pt.x, pt.y)?.closest<HTMLElement>('.qp [data-up]')
      if (!d || !el) return
      const over = Number(el.dataset.abs)
      const r = el.getBoundingClientRect()
      const after = pt.y > r.top + r.height / 2
      if (d.over !== over || d.after !== after) setDragNow({ ...d, over, after })
    }
    // auto-scroll within 56px of the list's visible top / bottom edge (or past it), faster the closer
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const list = listRef.current
      if (!list) return
      const EDGE = 56
      const r = list.getBoundingClientRect()
      const top = r.top
      const bottom = Math.min(r.bottom, window.innerHeight) // sheet at rest: its bottom is off-screen
      let v = 0
      if (pt.y < top + EDGE && list.scrollTop > 0) v = -Math.min(1, (top + EDGE - pt.y) / EDGE)
      else if (pt.y > bottom - EDGE) v = Math.min(1, (pt.y - (bottom - EDGE)) / EDGE)
      if (v) {
        list.scrollTop += v * 14
        hit()
      }
    }
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pid) return
      ev.preventDefault()
      pt.x = ev.clientX
      pt.y = ev.clientY
      if (!moved && Math.hypot(pt.x - x0, pt.y - y0) > 8) moved = true
      if (moved) hit()
    }
    const finish = (commit: boolean) => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      gesture.current = null
      const d = dragRef.current
      setDragNow(null)
      swallowRowClick.current = performance.now()
      if (!commit) return
      if (!moved && fromHold) {
        const id = playerStore.get().queue[abs]
        if (id && data?.tracks[id]) actions.menu({ kind: 'track', trackId: id }, { x: pt.x, y: pt.y })
        return
      }
      const to = dropTarget(d, base)
      if (to !== null) playerStore.move(d!.from, to)
    }
    const onUp = (ev: globalThis.PointerEvent) => ev.pointerId === pid && finish(true)
    const onCancel = (ev: globalThis.PointerEvent) => ev.pointerId === pid && finish(false)
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    gesture.current = () => finish(false)
    raf = requestAnimationFrame(tick)
  }

  const onTouchDown = (abs: number, mode: 'grip' | 'row') => (e: PointerEvent<HTMLElement>) => {
    if (!phone || !e.isPrimary || gesture.current) return
    if (mode === 'grip') {
      e.preventDefault()
      e.stopPropagation()
      stopFollowing()
      startReorder(abs, e.pointerId, { x: e.clientX, y: e.clientY }, false)
      return
    }
    const row = e.currentTarget
    const inner = row.querySelector<HTMLElement>('.qp-row-in')
    const bg = row.querySelector<HTMLElement>('.qp-swipe-bg')
    const pid = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const pt = { x: x0, y: y0 }
    let phase: 'wait' | 'swipe' = 'wait'
    let dx = 0
    let last = { x: x0, t: performance.now() }
    let vx = 0
    const hold = window.setTimeout(() => {
      cleanup()
      startReorder(abs, pid, pt, true)
    }, 380)
    const paint = (x: number, anim: boolean) => {
      if (!inner) return
      inner.style.transition = anim ? 'transform .28s var(--ease)' : 'none'
      inner.style.transform = x ? `translate3d(${x}px,0,0)` : ''
      if (bg) {
        // the red strip only fills the space the row has left (the row itself is see-through)
        bg.style.transition = anim ? 'width .28s var(--ease)' : 'none'
        bg.style.width = `${Math.min(row.clientWidth, Math.max(0, -x))}px`
      }
    }
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pid) return
      pt.x = ev.clientX
      pt.y = ev.clientY
      const mx = ev.clientX - x0
      const my = ev.clientY - y0
      if (phase === 'wait') {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2 && mx < 0) {
          window.clearTimeout(hold)
          phase = 'swipe'
          stopFollowing()
          try {
            row.setPointerCapture(pid)
          } catch {
            /* gone */
          }
        } else if (Math.hypot(mx, my) > 10) {
          // a scroll (or a rightward move): not ours
          cleanup()
          return
        } else return
      }
      const now = performance.now()
      if (now > last.t) vx = 0.7 * ((ev.clientX - last.x) / (now - last.t)) + 0.3 * vx
      last = { x: ev.clientX, t: now }
      dx = mx < 0 ? mx : mx * 0.25
      paint(dx, false)
    }
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pid) return
      const wasSwipe = phase === 'swipe'
      cleanup()
      if (!wasSwipe) return
      swallowRowClick.current = performance.now()
      const w = row.clientWidth
      if (dx < -w * 0.35 || (vx < -0.6 && dx < -30)) {
        paint(-w - 20, true)
        window.setTimeout(() => removeRow(abs), 200)
      } else paint(0, true)
    }
    const onCancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pid) return
      const wasSwipe = phase === 'swipe'
      cleanup()
      if (wasSwipe) paint(0, true)
    }
    function cleanup() {
      window.clearTimeout(hold)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (gesture.current === abort) gesture.current = null
    }
    const abort = () => {
      cleanup()
      paint(0, false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    gesture.current = abort
  }

  /* keyboard: Enter plays, Alt+↑/↓ moves (within Next up), Delete removes, ↑/↓ moves focus */
  const focusRow = (abs: number) =>
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-abs="${abs}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        el.focus({ preventScroll: true })
      }
    })
  const onRowKey = (abs: number) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const last = p.queue.length - 1
    const isUp = abs > p.index
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      playerStore.jump(abs)
    } else if (isUp && e.altKey && e.key === 'ArrowUp' && abs > base) {
      e.preventDefault()
      playerStore.move(abs, abs - 1)
      focusRow(abs - 1)
    } else if (isUp && e.altKey && e.key === 'ArrowDown' && abs < last) {
      e.preventDefault()
      playerStore.move(abs, abs + 1)
      focusRow(abs + 1)
    } else if (isUp && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      removeRow(abs)
      focusRow(Math.min(abs, last - 1))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      let to = abs + (e.key === 'ArrowDown' ? 1 : -1)
      if (to === p.index) to += e.key === 'ArrowDown' ? 1 : -1
      focusRow(to)
    }
  }

  const rule = (label: string, meta: string, top: number) => (
    <div className="qp-rule" style={{ top, height: M.rule }}>
      <span className="qp-rule-l t-mono">{label}</span>
      <span className="qp-rule-line" />
      <span className="qp-rule-r t-mono">{meta}</span>
    </div>
  )
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const dur = current?.duration ?? 0
  const pct = dur > 0 ? Math.max(0, Math.min(100, (p.position / dur) * 100)) : 0

  const nowCard =
    current && data ? (
      <div
        className="qp-now"
        style={{ top: nowTop + NOW_M_TOP }}
        role="button"
        tabIndex={0}
        aria-label={`Now playing: ${current.title} by ${current.artist}. Click to ${p.playing ? 'pause' : 'play'}.`}
        onClick={() => playerStore.toggle()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            playerStore.toggle()
          }
        }}
        onDragOver={onNowDragOver}
        onContextMenu={(e) => actions.menu({ kind: 'track', trackId: current.id }, e)}
      >
        <span className="qp-now-cover-wrap">
          <Cover c={data} albumId={current.albumId} className="qp-now-cover" />
          <span className="qp-now-play" aria-hidden>
            <Icon name={p.playing ? 'pauseF' : 'playF'} />
          </span>
        </span>
        <div className="qp-now-text">
          <div className="qp-now-eye t-mono">
            <Eq playing={p.playing} />
            NOW PLAYING
          </div>
          <div className="qp-now-t">{current.title}</div>
          <div className="qp-a">{sub(data, current.id)}</div>
        </div>
        <span className="qp-now-time t-mono">
          {formatTime(p.position)}
          {!phone && dur > 0 && <span className="qp-now-dur"> / {formatTime(dur)}</span>}
        </span>
        <span className="qp-now-bar" style={{ width: `${pct}%` }} />
      </div>
    ) : null

  const emptyBlock = (
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
  )

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
        <div className="qp-card">
        <div className="qp-head" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={() => setGrabDy(null)} onClickCapture={onGrabClickCapture}>
          {phone && (
            <div className="qp-grab" role="presentation" title={expanded ? 'Drag down to shrink or close' : 'Drag up to expand, down to close'}>
              <span />
            </div>
          )}
          <div className="qp-head-row">
            <div className="qp-title-wrap">
              <h2 className="qp-title">Queue</h2>
              <span className="qp-count t-mono">{pad2(upcoming.length)}</span>
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
              <button
                type="button"
                className="qp-tool qp-tool-sq"
                title="Save the queue as a playlist"
                aria-label="Save the queue as a playlist"
                disabled={!p.queue.length}
                onClick={(e) => actions.addTo({ kind: 'tracks', trackIds: p.queue.filter((id) => data?.tracks[id]), label: 'Queue' }, e)}
              >
                <Icon name="playlist" />
              </button>
              <button type="button" className="qp-tool qp-tool-text" disabled={!upcoming.length} onClick={onClear}>
                Clear
              </button>
              {!phone && (
                <button type="button" className="qp-tool qp-tool-x" title="Close" aria-label="Close queue" onClick={close}>
                  <Icon name="x" />
                </button>
              )}
            </div>
          </div>
          <div className="qp-src" title={`${ctx.kicker} · ${ctx.label}`}>
            <SourceCover c={data} albumId={current?.albumId} />
            <span className="qp-src-k t-mono">{ctx.kicker}</span>
            <span className="qp-src-name">{ctx.label}</span>
          </div>
        </div>

        <div
          className="qp-list"
          ref={listRef}
          onTouchStart={stopFollowing}
          onWheel={stopFollowing}
          onKeyDown={stopFollowing}
          onClickCapture={(e) => {
            // the click a browser may send after a swipe / lift must not play the row
            if (performance.now() - swallowRowClick.current < 400) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          {data && current ? (
            <div className="qp-list-in" style={{ height: innerH }}>
              {played.length > 0 && rule('PLAYED', `${pad2(played.length)} · ${fmtTotal(playedTotal)}`, 0)}
              {played.slice(pFrom, pTo).map((id, k) => {
                const abs = pFrom + k
                return (
                  <PlayedRow
                    key={`${abs}:${id}`}
                    c={data}
                    id={id}
                    abs={abs}
                    top={playedTop + abs * M.played}
                    isFirst={abs === 0}
                    isLast={abs === played.length - 1}
                    phone={phone}
                    onKey={onRowKey}
                  />
                )
              })}
              {nowCard}
              {rule('NEXT UP', `${pad2(upcoming.length)} · ${fmtTotal(total) || '00:00'}`, nextRuleTop)}
              {upcoming.length > 0 ? (
                upcoming.slice(uFrom, uTo).map((id, k) => {
                  const idx = uFrom + k
                  const abs = base + idx
                  return (
                    <NextRow
                      key={`${abs}:${id}`}
                      c={data}
                      id={id}
                      abs={abs}
                      top={upTop + idx * M.next}
                      base={base}
                      isFirst={idx === 0}
                      isLast={idx === upcoming.length - 1}
                      phone={phone}
                      liked={!!likes[id]}
                      drag={drag}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDragEnd={() => setDrag(null)}
                      onTouchDown={onTouchDown}
                      onKey={onRowKey}
                      remove={removeRow}
                    />
                  )
                })
              ) : (
                <div className="qp-empty-wrap" style={{ top: upTop, height: EMPTY_H }}>
                  {emptyBlock}
                </div>
              )}
            </div>
          ) : (
            emptyBlock
          )}
        </div>

        <div className="qp-foot t-mono">{phone ? 'HOLD AND DRAG TO REORDER · SWIPE LEFT TO REMOVE' : 'DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE'}</div>
        </div>
      </aside>
    </>
  )
}
