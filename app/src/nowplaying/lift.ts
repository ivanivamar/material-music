/**
 * Phone: drag the player between the mini card and full screen (Nov 2026 carousel player).
 *
 * The mini player's handle drags it up; the full-screen header drags it back down. While the finger
 * moves, `nowPlayingStore.lift` holds the progress (0 = mini card, 1 = full screen) and the full-screen
 * player draws itself as a blend of the two layouts (nowplaying.css, --np-t), so it morphs with the
 * finger. On release it settles to the nearer end, or follows a flick.
 *
 * The settle is animated here in JS (useMorph), not with a CSS transition: the carousel inside
 * computes its card sizes from the same value, so CSS and layout stay in step frame by frame.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { nowPlayingStore } from '../state/nowPlaying'

/** How far (px) the finger travels between the two ends: the mini card's top edge to the screen's top. */
function travel(): number {
  const top = document.querySelector('.mini')?.getBoundingClientRect().top
  return Math.max(120, top ?? window.innerHeight * 0.75)
}

function swallowNextClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** px per ms that counts as a flick */
const FLICK = 0.5
/** px before a press becomes a drag */
const SLOP = 6

export function useLiftDrag(from: 'mini' | 'full') {
  const swallow = useRef(false)

  /**
   * Press on the band / header. The rest of the gesture is followed on the window, so it keeps
   * tracking wherever the pointer goes, and a plain tap still reaches the button or link under it
   * (nothing captures the pointer).
   */
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!e.isPrimary || e.button !== 0) return
    swallow.current = false
    const s = { y0: e.clientY, last: e.clientY, t: performance.now(), v: 0, travel: travel(), moved: false, id: e.pointerId }

    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== s.id) return
      const now = performance.now()
      s.v = 0.7 * ((s.last - ev.clientY) / Math.max(1, now - s.t)) + 0.3 * s.v // + = upwards
      s.last = ev.clientY
      s.t = now
      const dy = s.y0 - ev.clientY
      if (!s.moved) {
        if (Math.abs(dy) < SLOP) return
        s.moved = true
        // the morph runs between the plain layouts: leave reorder mode and lyrics first
        if (from === 'full') {
          nowPlayingStore.closeReorder()
          if (nowPlayingStore.get().view === 'lyrics') nowPlayingStore.setView('np')
        }
      }
      ev.preventDefault()
      nowPlayingStore.setLift((from === 'full' ? 1 : 0) + dy / s.travel)
    }
    const finish = (cancel: boolean) => (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== s.id) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancelled)
      if (!s.moved) return
      swallow.current = true
      // a drag that started on a header button / link must not also click it
      window.addEventListener('click', swallowNextClick, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallowNextClick, { capture: true }), 400)
      const t = nowPlayingStore.get().lift ?? (from === 'full' ? 1 : 0)
      if (from === 'mini') {
        const open = !cancel && (t > 0.25 || s.v > FLICK)
        if (open) nowPlayingStore.open('np')
        nowPlayingStore.setLift(null)
      } else {
        const close = !cancel && (t < 0.75 || s.v < -FLICK)
        nowPlayingStore.setLift(null)
        if (close) nowPlayingStore.close()
      }
    }
    const up = finish(false)
    const cancelled = finish(true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancelled)
  }

  return {
    onPointerDown,
    /** a drag that ends on the handle is not also a tap */
    swallowClick: () => {
      const v = swallow.current
      swallow.current = false
      return v
    },
  }
}

/** How long the player takes to settle open / closed (ms). */
export const SETTLE_MS = 460
const ease = (k: number) => 1 - Math.pow(1 - k, 3)

/**
 * The morph value to draw (0 = mini card, 1 = full screen): the finger's while dragging, otherwise an
 * eased glide from wherever it was to `target`. Starts at 0, so opening grows out of the mini card.
 */
export function useMorph(lift: number | null, target: number, motion: boolean): number {
  const [v, setV] = useState(lift ?? 0)
  // follow the finger (adjusting state from a changed input during render)
  const [seen, setSeen] = useState(lift)
  if (lift !== seen) {
    setSeen(lift)
    if (lift !== null) setV(lift)
  }
  const vRef = useRef(v)
  useEffect(() => {
    vRef.current = v
  })
  useEffect(() => {
    if (lift !== null || !motion) return
    const from = vRef.current
    const d = target - from
    if (Math.abs(d) < 0.0005) return
    const start = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - start) / SETTLE_MS)
      setV(from + d * ease(k))
      if (k < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [lift, target, motion])
  if (lift !== null) return lift
  return motion ? v : target
}
