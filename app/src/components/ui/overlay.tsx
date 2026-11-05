/**
 * Shared plumbing for everything that floats above the page: Sheet, Dialog, Menu.
 * - Portal: overlays render into <body> so no page container clips them or traps their z-index.
 * - usePresence: keeps an overlay mounted while its exit animation runs.
 * - useOverlayKeys: Escape and Android Back close; focus moves in on open and back to the opener on close.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { registerBack } from '../../native/backButton'

export function Portal({ children }: { children: ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body)
}

/** `mounted`: render the overlay; `shown`: it is on screen (drives the .is-on enter / exit transition). */
export function usePresence(open: boolean, exitMs = 320) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      // next frame, so the closed styles paint first and the transition runs
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), exitMs)
    return () => window.clearTimeout(t)
  }, [open, exitMs])
  return { mounted, shown }
}

/* Open overlays, newest last: only the top one reacts to Escape / Tab (a menu opened inside a dialog). */
const stack: symbol[] = []

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Escape closes; focus the first field / control (or the panel) on open, give focus back to the opener on close. */
export function useOverlayKeys(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void, opts: { trap?: boolean; focusPanel?: boolean } = {}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const me = Symbol('overlay')
    stack.push(me)
    const opener = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const el = panel.current
      if (!el || el.contains(document.activeElement)) return
      // an explicit [data-autofocus], else the first field, else the first control, else the panel itself
      // (focusPanel: only [data-autofocus] or the panel — on phones a focused field would pop the keyboard)
      const first =
        el.querySelector<HTMLElement>('[data-autofocus]') ??
        (opts.focusPanel
          ? null
          : (el.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])') ??
            el.querySelector<HTMLElement>(FOCUSABLE)))
      ;(first ?? el).focus({ preventScroll: true })
    })
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !opts.trap) return
      const el = panel.current
      if (!el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    // Android Back closes the top-most overlay too
    const offBack = registerBack(() => {
      if (stack[stack.length - 1] !== me) return false
      closeRef.current()
      return true
    }, 'top')
    return () => {
      offBack()
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey, true)
      stack.splice(stack.indexOf(me), 1)
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open, panel, opts.trap])
}
