/**
 * Cover flights: one cover moving from one place to another.
 *
 * - Opening the full-screen player: the cover in the player bar (desktop) or the mini-player (phone)
 *   grows into the player's cover. Closing it: the cover shrinks back into the bar. The player itself
 *   only fades during these (no rise), so the spot the cover lands on holds still.
 * - Desktop, Now playing ⇄ Lyrics: the 500px cover moves into the lyrics column's 272px cover and
 *   back, while the two views cross-fade around it.
 *
 * How: a fixed "ghost" <img> above everything is laid out at the larger of the two rects and moved
 * with a transform (x / y / scale) between them (GSAP). The real covers at both ends are hidden while
 * it flies and shown again when it lands, so it reads as one cover moving.
 *
 * One flight at a time (module state): a new flight starting mid-air (closing during the opening,
 * flipping views back) takes off from wherever the ghost is. The closing flight outlives the player
 * (which unmounts after ~420 ms).
 * No flight: reduced motion, no cover at either end (empty cover, DJ intro mark), the start view,
 * or a swipe-down close (the finger already moved the sheet).
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { EASE, EASE_MOVE, gsap } from '../lib/gsap'

const OPEN_S = 0.6
const CLOSE_S = 0.42
/** the views cross-fade over 0.9s (--np-fade); the cover arrives a little before the fade ends */
const VIEW_S = 0.75

/** the small cover: player bar (desktop) or mini-player (phone) */
const BAR = '.pb img.pb-cover, .mini img.mini-cover'
/** the big cover, per view (phone now-playing: the CoverSwipe row holds a cover per queue row) */
const BIG_NP = '.np-main img.np-cover'
const BIG_LY = '.np-ly img.np-ly-cover, .np-ly img.npp-strip-cover'

interface Flight {
  ghost: HTMLImageElement
  hidden: HTMLElement[]
  tween: gsap.core.Tween | null
}
let flight: Flight | null = null

/** the candidate that is on screen, nearest the middle of the viewport (CoverSwipe: the current row) */
function visible(root: ParentNode, sel: string): HTMLImageElement | null {
  const cx = window.innerWidth / 2
  let best: HTMLImageElement | null = null
  let bestD = Infinity
  for (const el of root.querySelectorAll<HTMLImageElement>(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) continue
    const d = Math.abs(r.left + r.width / 2 - cx)
    if (d < bestD) {
      best = el
      bestD = d
    }
  }
  return best
}

const radius = (el: Element) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0

function land() {
  const f = flight
  if (!f) return
  flight = null
  f.tween?.kill()
  f.ghost.remove()
  for (const el of f.hidden) el.style.visibility = ''
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** transform that puts the ghost (laid out at `base`) over `to` */
function over(base: Box, to: Box, rTo: number) {
  const scale = to.width / base.width
  return { x: to.left - base.left, y: to.top - base.top, scaleX: scale, scaleY: to.height / base.height, borderRadius: rTo / scale }
}

/**
 * Fly a copy of the cover from `from` to `to`. `fromBox` / `toBox` override the measured rects
 * (an element whose section is mid-transition: where it will be once settled).
 */
function fly(from: HTMLImageElement, to: HTMLImageElement, duration: number, ease: gsap.EaseFunction, boxes: { fromBox?: Box; toBox?: Box } = {}) {
  // mid-air: take off from where the ghost is now
  const midAir = flight?.ghost.getBoundingClientRect()
  land()
  const f: Box = midAir ?? boxes.fromBox ?? from.getBoundingClientRect()
  const t: Box = boxes.toBox ?? to.getBoundingClientRect()
  const big = f.width >= t.width ? from : to
  const base = f.width >= t.width ? f : t
  const ghost = document.createElement('img')
  ghost.src = big.currentSrc || big.src
  ghost.alt = ''
  ghost.setAttribute('aria-hidden', 'true')
  ghost.className = 'np-flight'
  Object.assign(ghost.style, { left: `${base.left}px`, top: `${base.top}px`, width: `${base.width}px`, height: `${base.height}px`, boxShadow: getComputedStyle(big).boxShadow })
  document.body.appendChild(ghost)
  from.style.visibility = 'hidden'
  to.style.visibility = 'hidden'
  const fl: Flight = { ghost, hidden: [from, to], tween: null }
  flight = fl
  fl.tween = gsap.fromTo(ghost, over(base, f, radius(from)), { ...over(base, t, radius(to)), duration, ease, onComplete: land })
}

/** the rect `el` will have once its section's transition (a translate) has finished */
function settledBox(el: Element, section: Element | null): Box {
  const r = el.getBoundingClientRect()
  if (!section) return r
  const m = new DOMMatrix(getComputedStyle(section).transform)
  return { left: r.left - m.e, top: r.top - m.f, width: r.width, height: r.height }
}

/**
 * Runs the opening flight when the player mounts, the closing flight when `closing` turns on, and
 * (desktop) the view flight when Now playing ⇄ Lyrics flips. Sets data-flight on the player root,
 * which swaps its rise-and-fade for a plain fade (nowplaying.css).
 */
export function useCoverFlight(rootRef: RefObject<HTMLElement | null>, opts: { closing: boolean; ly: boolean; enabled: boolean; viewMorph: boolean }) {
  const live = useRef(opts)
  live.current = opts
  const prev = useRef<{ closing: boolean; ly: boolean } | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    const { closing, ly, enabled, viewMorph } = live.current
    const was = prev.current
    prev.current = { closing, ly }
    if (!root || !enabled) return land()
    if (!was) {
      // opening
      if (closing) return
      const small = visible(document, BAR)
      const big = visible(root, ly ? BIG_LY : BIG_NP)
      if (!small || !big) return
      root.dataset.flight = ''
      fly(small, big, OPEN_S, EASE_MOVE)
    } else if (closing && !was.closing) {
      // a swipe-down already carried the sheet off: nothing to fly
      if (root.dataset.swipe === 'swiped') return land()
      const big = flight ? (flight.hidden.find((el) => root.contains(el)) as HTMLImageElement | undefined) : undefined
      const from = big ?? visible(root, ly ? BIG_LY : BIG_NP)
      const small = visible(document, BAR)
      if (!small || !from) return land()
      root.dataset.flight = ''
      fly(from, small, CLOSE_S, EASE_MOVE)
    } else if (!closing && was.closing) {
      // reopened while the closing flight ran: drop it, the player is back
      land()
    } else if (!closing && ly !== was.ly && viewMorph) {
      // Now playing ⇄ Lyrics: both sections are starting their cross-fade (opacity + a small
      // translate); measure the incoming cover where it will settle, not where it starts
      const from = visible(root, was.ly ? BIG_LY : BIG_NP)
      const to = visible(root, ly ? BIG_LY : BIG_NP)
      if (!from || !to) return land()
      fly(from, to, VIEW_S, EASE, { toBox: settledBox(to, to.closest('.np-main, .np-ly')) })
    }
  }, [rootRef, opts.closing, opts.ly])
  // the player went away mid-flight (other than by closing): don't leave the ghost behind
  useLayoutEffect(() => () => void (flight && !live.current.closing && land()), [])
}
