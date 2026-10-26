/**
 * Phone: swipe the full-screen player down to close it (like the queue sheet).
 *
 * Touch events (not pointer events) because the player's content scrolls on short screens: a
 * non-passive touchmove lets us take the gesture over only when it is a downward drag that starts
 * with the content scrolled to the top, and leave every other touch to the browser.
 * Seek / volume sliders and the lyrics list keep their own gestures.
 *
 * The overlay follows the finger; on release it closes past CLOSE_PX or on a downward flick,
 * otherwise it springs back. A drag swallows the click that would follow it.
 *
 * The drag state lives in data-swipe on the element, not in classes: React owns className and
 * rewrites it whole when the player switches to is-closing, which used to wipe the swiped state —
 * the np-out exit animation then played from full height (the "flash" on swipe-close).
 */
import { useEffect, type RefObject } from 'react'

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
      el.style.transform = ''
    }

    let armed = false
    let decided = false
    let dragging = false
    let startX = 0
    let startY = 0
    let dy = 0
    let lastY = 0
    let lastT = 0
    let velocity = 0
    let swallowClick = false

    const reset = () => {
      armed = decided = dragging = false
      dy = velocity = 0
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
      startY = lastY = e.touches[0].clientY
      lastT = e.timeStamp
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
      }
      if (!dragging) return
      if (e.cancelable) e.preventDefault()
      dy = Math.max(0, y - startY)
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = 0.8 * ((y - lastY) / dt) + 0.2 * velocity
      lastY = y
      lastT = e.timeStamp
      el.style.transform = `translate3d(0, ${dy}px, 0)`
    }

    const onEnd = () => {
      if (!dragging) return reset()
      swallowClick = true
      window.setTimeout(() => (swallowClick = false), 350)
      const close = dy > CLOSE_PX || (velocity > FLICK && dy > 24)
      el.dataset.swipe = close ? 'swiped' : 'springing'
      el.style.transform = close ? 'translate3d(0, 100%, 0)' : ''
      window.setTimeout(() => {
        if (close) onClose()
        else if (el.dataset.swipe === 'springing') el.dataset.swipe = 'idle'
      }, close ? 260 : 320)
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
        el.style.transform = ''
      }
    }
  }, [ref, enabled, onClose])
}
