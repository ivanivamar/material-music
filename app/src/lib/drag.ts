/**
 * Shared motion for drag gestures (bottom sheets, the queue sheet, swipe-down on the full-screen
 * player, toasts): while a finger drags, GSAP owns the element's transform; when it lets go, the
 * element glides to where it's going starting at the finger's speed (a fast flick leaves fast, a slow
 * release eases out), then hands the transform back to CSS.
 *
 * Why: these used to set inline transforms and lean on CSS transitions for the release. A transition
 * always runs its fixed duration (a flick slowed down at the moment of release), and the inline
 * styles fought the CSS enter / exit animations and transitions (several flicker bugs). Here a
 * release can also be grabbed again mid-way: grab() stops it where it is.
 *
 * Callers keep their own gesture rules (where a drag may start, thresholds, what a release means);
 * only the movement lives here.
 */
import { EASE, gsap } from './gsap'

export type Axis = 'x' | 'y'

/** same rule as .pg-anim in styles/base.css: the in-app setting, else the system preference */
export function motionOff(): boolean {
  const m = document.documentElement.getAttribute('data-motion')
  if (m === 'reduced') return true
  if (m === 'full') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** where the element is on screen right now along the axis (CSS transform, transition or tween included) */
export function currentOffset(el: HTMLElement, axis: Axis = 'y'): number {
  const m = new DOMMatrix(getComputedStyle(el).transform)
  return axis === 'y' ? m.m42 : m.m41
}

/**
 * Take the element over for a drag: stop any glide, pin it where it is, switch its CSS transitions
 * off. Returns its offset (the drag continues from there).
 */
export function grab(el: HTMLElement, axis: Axis = 'y'): number {
  gsap.killTweensOf(el)
  const at = currentOffset(el, axis)
  el.style.transition = 'none'
  gsap.set(el, { [axis]: at })
  return at
}

/** follow the finger */
export function drag(el: HTMLElement, at: number, axis: Axis = 'y') {
  gsap.set(el, { [axis]: at })
}

/** finger speed along one axis, px/ms (smoothed); 0 if the finger rested before lifting */
export class Velocity {
  private p = 0
  private t = 0
  private v = 0
  reset(p: number, t: number) {
    this.p = p
    this.t = t
    this.v = 0
  }
  add(p: number, t: number) {
    if (t > this.t) this.v = 0.75 * ((p - this.p) / (t - this.t)) + 0.25 * this.v
    this.p = p
    this.t = t
  }
  /** at release time `t` (same clock as add) */
  value(t: number): number {
    return t - this.t > 80 ? 0 : this.v
  }
}

export interface ReleaseOpts {
  axis?: Axis
  /** finger speed at release, px/ms (+ = towards larger offsets) */
  velocity?: number
  /** longest glide, s (a sheet that unmounts after its exit must be gone by then) */
  max?: number
  /** after landing, hand the transform back to CSS (clear the inline one, transitions back on) */
  clear?: boolean
  /** inline `transition` while gliding, instead of none (e.g. keep a delayed visibility change) */
  transition?: string
  /** also fade this to an opacity over the same time (scrim); `to: null` = back to fully shown and then
   *  to the CSS value; `clear` = hand the opacity back to CSS after landing anyway */
  fade?: { el: HTMLElement | null; to: number | null; clear?: boolean }
  onComplete?: () => void
}

/**
 * Glide to `to`. Leaving with the finger's speed: power2.out starts at 2× the average speed, so the
 * duration is picked to make that equal the finger's. A slow or backwards release (spring back) uses
 * the app's ease over a distance-based time. Returns the duration (s).
 */
export function release(el: HTMLElement, to: number, opts: ReleaseOpts = {}): number {
  const { axis = 'y', velocity = 0, max = 0.5, clear = false, transition = 'none', fade, onComplete } = opts
  gsap.killTweensOf(el)
  const from = currentOffset(el, axis)
  const dist = Math.abs(to - from)
  const towards = Math.sign(to - from) === Math.sign(velocity) && Math.abs(velocity) > 0.15
  let duration = towards ? (2 * dist) / (Math.abs(velocity) * 1000) : 0.26 + dist / 2400
  duration = Math.min(max, Math.max(0.14, duration))
  if (motionOff() || dist < 0.5) duration = 0
  el.style.transition = transition
  const done = () => {
    if (clear) {
      gsap.set(el, { clearProps: 'transform' })
      el.style.transition = ''
    }
    onComplete?.()
  }
  const fadeEl = fade?.el
  if (fadeEl) {
    gsap.killTweensOf(fadeEl)
    fadeEl.style.transition = 'none'
    const fadeDone = () => {
      if (fade.to === null || fade.clear) {
        gsap.set(fadeEl, { clearProps: 'opacity' })
        fadeEl.style.transition = ''
      }
    }
    // null: back to fully shown, then the CSS value takes over again
    const target = fade.to ?? 1
    if (duration) gsap.to(fadeEl, { opacity: target, duration, ease: towards ? 'power2.out' : EASE, onComplete: fadeDone })
    else {
      gsap.set(fadeEl, { opacity: target })
      fadeDone()
    }
  }
  if (duration) gsap.to(el, { [axis]: to, duration, ease: towards ? 'power2.out' : EASE, onComplete: done })
  else {
    gsap.set(el, { [axis]: to })
    done()
  }
  return duration
}

/** set an opacity during a drag (scrim following the sheet), CSS transition off */
export function dragFade(el: HTMLElement | null, opacity: number | null) {
  if (!el) return
  gsap.killTweensOf(el)
  el.style.transition = 'none'
  if (opacity === null) gsap.set(el, { clearProps: 'opacity' })
  else gsap.set(el, { opacity })
}

/** px resolved from a CSS length on an element: `bottom` of a card that ends --x-rest above its box */
export function px(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}
