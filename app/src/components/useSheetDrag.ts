/**
 * Phone bottom sheets (action sheet, account sheet): drag down to close.
 *
 * Touch events (not pointer events) so the sheet's lists can still scroll: a non-passive
 * touchmove takes the gesture over only when it is a mostly-vertical downward drag that starts
 * on the handle / header, or inside a list that is already scrolled to the top.
 *
 * The sheet follows the finger and the scrim fades with it. On release it closes past CLOSE_PX
 * or on a downward flick (sliding on down from where the finger let go); otherwise it springs
 * back. A drag swallows the click that would follow it.
 */
import { useEffect, useRef, type RefObject } from 'react'

const CLOSE_PX = 100
const FLICK = 0.5 // px per ms
const EXCLUDE = 'input, textarea, select'
const SCROLLERS = '.as-items, .as-pl-list'

export function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, scrimRef: RefObject<HTMLElement | null>, onClose: () => void, enabled = true) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const el = sheetRef.current
    if (!el || !enabled) return

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

    const setStyles = (transform: string, opacity: string, instant: boolean) => {
      el.style.transform = transform
      el.style.transition = instant ? 'none' : ''
      const scrim = scrimRef.current
      if (scrim) {
        scrim.style.opacity = opacity
        scrim.style.transition = instant ? 'none' : ''
      }
    }

    const onStart = (e: TouchEvent) => {
      armed = decided = dragging = false
      dy = velocity = 0
      if (e.touches.length !== 1) return
      const target = e.target as Element
      if (target.closest(EXCLUDE)) return
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
        if (ddy <= 0 || Math.abs(ddy) < Math.abs(ddx) * 1.2) {
          armed = false
          return
        }
        dragging = true
      }
      if (!dragging) return
      if (e.cancelable) e.preventDefault()
      dy = Math.max(0, y - startY)
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = 0.8 * ((y - lastY) / dt) + 0.2 * velocity
      lastY = y
      lastT = e.timeStamp
      setStyles(`translate3d(0, ${dy}px, 0)`, String(Math.max(0, 1 - dy / 400)), true)
    }

    const onEnd = () => {
      if (!dragging) {
        armed = false
        return
      }
      dragging = armed = false
      swallowClick = true
      window.setTimeout(() => (swallowClick = false), 350)
      const close = dy > CLOSE_PX || (velocity > FLICK && dy > 24)
      if (close) {
        // carry on down from where the finger let go (the sheet unmounts mid-way, like a tap close)
        setStyles('translate3d(0, 105%, 0)', '0', false)
        closeRef.current()
      } else setStyles('', '', false) // the CSS transition springs it back up
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
    }
  }, [sheetRef, scrimRef, enabled])
}
