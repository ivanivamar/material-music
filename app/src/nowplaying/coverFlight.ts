/**
 * Cover flight: opening the full-screen player, the cover in the player bar (desktop) or the
 * mini-player (phone) grows into the player's cover; closing it, the cover shrinks back into the
 * bar. The player itself only fades during a flight (no rise), so the cover's landing spot holds
 * still while it is measured and flown to.
 *
 * How: a fixed "ghost" <img> above everything is laid out at the big cover's rect and moved with a
 * transform (x / y / scale) from the small cover's rect. The real covers at both ends are hidden
 * while it flies and shown again when it lands, so it reads as one cover moving.
 *
 * One flight at a time (module state): closing during the opening flight retargets the same ghost
 * from wherever it is, and the closing flight outlives the player (which unmounts after ~420 ms).
 * No flight: reduced motion, no cover at either end (empty cover, DJ intro mark), the start view,
 * or a swipe-down close (the finger already moved the sheet).
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { EASE_MOVE, gsap } from '../lib/gsap'

const OPEN_S = 0.6
const CLOSE_S = 0.42

/** the small cover: player bar (desktop) or mini-player (phone) */
const BAR = '.pb img.pb-cover, .mini img.mini-cover'
/** the big cover, per view (phone now-playing: the CoverSwipe row holds a cover per queue row) */
const BIG_NP = '.np-main img.np-cover'
const BIG_LY = '.np-ly img.np-ly-cover, .np-ly img.npp-strip-cover'

interface Flight {
  ghost: HTMLImageElement
  big: HTMLElement
  small: HTMLElement
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
  f.big.style.visibility = ''
  f.small.style.opacity = ''
}

/** fixed copy of the big cover, laid out at its rect (the transform moves it from there) */
function makeGhost(big: HTMLImageElement, b: DOMRect): HTMLImageElement {
  const ghost = document.createElement('img')
  ghost.src = big.currentSrc || big.src
  ghost.alt = ''
  ghost.setAttribute('aria-hidden', 'true')
  ghost.className = 'np-flight'
  Object.assign(ghost.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, boxShadow: getComputedStyle(big).boxShadow })
  document.body.appendChild(ghost)
  return ghost
}

/** transform that puts the ghost (laid out at `base`) over `to` */
function over(base: DOMRect, to: DOMRect, rTo: number) {
  const scale = to.width / base.width
  return { x: to.left - base.left, y: to.top - base.top, scaleX: scale, scaleY: to.height / base.height, borderRadius: rTo / scale }
}

function openFlight(root: HTMLElement, ly: boolean): boolean {
  land()
  const small = visible(document, BAR)
  const big = visible(root, ly ? BIG_LY : BIG_NP)
  if (!small || !big) return false
  const s = small.getBoundingClientRect()
  const b = big.getBoundingClientRect()
  const ghost = makeGhost(big, b)
  big.style.visibility = 'hidden'
  small.style.opacity = '0'
  const f: Flight = { ghost, big, small, tween: null }
  flight = f
  f.tween = gsap.fromTo(ghost, over(b, s, radius(small)), { x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: radius(big), duration: OPEN_S, ease: EASE_MOVE, onComplete: land })
  return true
}

function closeFlight(root: HTMLElement, ly: boolean): boolean {
  const small = visible(document, BAR)
  // mid-opening: the ghost turns around from where it is
  if (flight && small) {
    const f = flight
    f.tween?.kill()
    f.small.style.opacity = ''
    f.small = small
    small.style.opacity = '0'
    const base = { left: parseFloat(f.ghost.style.left), top: parseFloat(f.ghost.style.top), width: parseFloat(f.ghost.style.width), height: parseFloat(f.ghost.style.height) } as DOMRect
    f.tween = gsap.to(f.ghost, { ...over(base, small.getBoundingClientRect(), radius(small)), duration: CLOSE_S, ease: EASE_MOVE, onComplete: land })
    return true
  }
  land()
  const big = visible(root, ly ? BIG_LY : BIG_NP)
  if (!small || !big) return false
  const b = big.getBoundingClientRect()
  const ghost = makeGhost(big, b)
  gsap.set(ghost, { borderRadius: radius(big) })
  big.style.visibility = 'hidden'
  small.style.opacity = '0'
  const f: Flight = { ghost, big, small, tween: null }
  flight = f
  f.tween = gsap.to(ghost, { ...over(b, small.getBoundingClientRect(), radius(small)), duration: CLOSE_S, ease: EASE_MOVE, onComplete: land })
  return true
}

/**
 * Runs the opening flight when the player mounts and the closing flight when `closing` turns on.
 * Sets data-flight on the player root, which swaps its rise-and-fade for a plain fade (nowplaying.css).
 */
export function useCoverFlight(rootRef: RefObject<HTMLElement | null>, opts: { closing: boolean; ly: boolean; enabled: boolean }) {
  const live = useRef(opts)
  live.current = opts
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const root = rootRef.current
    const { closing, ly, enabled } = live.current
    const first = !mounted.current
    mounted.current = true
    if (!root || !enabled) return
    if (first && !closing) {
      if (openFlight(root, ly)) root.dataset.flight = ''
    } else if (closing) {
      // a swipe-down already carried the sheet off: nothing to fly
      if (root.dataset.swipe === 'swiped') return land()
      if (closeFlight(root, ly)) root.dataset.flight = ''
    } else {
      // reopened while the closing flight ran: drop it, the player is back
      land()
    }
  }, [rootRef, opts.closing])
}
