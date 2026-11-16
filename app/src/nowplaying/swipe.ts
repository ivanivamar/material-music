/**
 * Phone: swipe the full-screen player down to close it (like the queue sheet).
 *
 * Touch events (not pointer events) because the player's content scrolls on short screens: a
 * non-passive touchmove lets us take the gesture over only when it is a downward drag that starts
 * with the content scrolled to the top, and leave every other touch to the browser.
 * Seek / volume sliders and the lyrics list keep their own gestures.
 *
 * The overlay follows the finger; on release it closes past CLOSE_PX or on a downward flick (carrying
 * on down at the finger's speed), otherwise it springs back. A drag swallows the click that would
 * follow it. The movement is lib/drag.ts (GSAP): a finger can catch the sheet while it springs back.
 *
 * The drag state lives in data-swipe on the element, not in classes: React owns className and
 * rewrites it whole when the player switches to is-closing, which used to wipe the swiped state —
 * the np-out exit animation then played from full height (the "flash" on swipe-close).
 */
import { useEffect, type RefObject } from 'react'
import { gsap } from '../lib/gsap'
import { drag, grab, release, Velocity } from '../lib/drag'

const CLOSE_PX = 140
const FLICK = 0.6 // px per ms
const EXCLUDE = '.np-seek, .np-ly-seek, .np-vol, .slider, .seekrow, .ly-viewport, .ly-plain, .np-panel, .np-scrim, input, textarea'
const SCROLLERS = '.np-main, .np-ly'

export function useSwipeDown(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    // reopened before the swiped-away sheet unmounted: bring it back on screen
    if (el.dataset.swipe === 'swiped') {
      delete el.dataset.swipe
      gsap.killTweensOf(el)
      gsap.set(el, { clearProps: 'transform' })
      el.style.transition = ''
    }

    let armed = false
    let decided = false
    let dragging = false
    let startX = 0
    let startY = 0
    let dy = 0
    let from = 0
    const vel = new Velocity()
    let swallowClick = false

    const reset = () => {
      armed = decided = dragging = false
      dy = 0
    }

    const onStart = (e: TouchEvent) => {
      reset()
      if (e.touches.length !== 1) return
      const target = e.target as Element
      if (target.closest(EXCLUDE)) return
      // inside scrolled content: let it scroll back up first
      const scroller = target.closest(SCROLLERS)
      if (scroller && scroller.scrollTop > 0) return
      armed = true
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      vel.reset(startY, e.timeStamp)
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      if (!decided) {
        const ddx = x - startX
        const ddy = y - startY
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return
        decided = true
        // only a mostly-vertical downward drag; anything else stays a normal touch
        if (ddy <= 0 || Math.abs(ddy) < Math.abs(ddx) * 1.2) {
          armed = false
          return
        }
        dragging = true
        // any data-swipe drops the (finished) entry animation, whose fill would override the inline transform
        el.dataset.swipe = 'dragging'
        // caught while springing back: carry on from where it is
        from = grab(el)
      }
      if (!dragging) return
      if (e.cancelable) e.preventDefault()
      dy = Math.max(0, from + y - startY)
      vel.add(y, e.timeStamp)
      drag(el, dy)
    }

    const onEnd = (e: TouchEvent) => {
      if (!dragging) return reset()
      swallowClick = true
      window.setTimeout(() => (swallowClick = false), 350)
      const velocity = vel.value(e.timeStamp)
      const close = dy > CLOSE_PX || (velocity > FLICK && dy > 24)
      el.dataset.swipe = close ? 'swiped' : 'springing'
      if (close) {
        // on down at the finger's speed; the player closes once it is off screen
        release(el, el.offsetHeight, { velocity, max: 0.32, onComplete: onClose })
      } else {
        release(el, 0, { velocity, clear: true, onComplete: () => el.dataset.swipe === 'springing' && (el.dataset.swipe = 'idle') })
      }
      reset()
    }

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('click', onClick, true)
      // swiped away: this cleanup runs because the player is now closing — leave the sheet off
      // screen until it unmounts, or it would snap back to full height for a moment
      if (el.dataset.swipe !== 'swiped') {
        if (el.dataset.swipe) el.dataset.swipe = 'idle'
        gsap.killTweensOf(el)
        gsap.set(el, { clearProps: 'transform' })
        el.style.transition = ''
      }
    }
  }, [ref, enabled, onClose])
}
