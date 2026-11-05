/**
 * Bottom sheet — the one phone sheet for the whole app, modelled on the Queue sheet.
 *
 * A floating card 8px from the screen edges (radius 28). The header is the grab area: press and drag
 * it and the sheet follows the finger, the handle stretches and brightens while it is held, and the
 * scrim fades as it goes down. Let go past CLOSE_PX (or flick down) and it carries on off-screen and
 * closes; otherwise it springs back. A press on a header button stays a tap until the finger travels
 * BTN_SLOP, then it becomes a drag and the button's click is swallowed. The body also pulls the sheet
 * down when it is scrolled to the top, so long lists still scroll normally.
 *
 * `expandable`: rests part-way up (`rest`, like the Queue) and drags / taps up to full height;
 * dragging down from full height goes back to the resting height first.
 *
 * Only `transform` and the scrim's `opacity` change during a drag (GPU layers, no relayout): the
 * Android WebView re-rasterised the Queue every frame when its size changed mid-drag.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IconButton } from './Button'
import { Portal, useOverlayKeys, usePresence } from './overlay'

const CLOSE_PX = 120
const EXPAND_PX = 60
const FLICK = 0.5 // px per ms
const BTN_SLOP = 8
const SLOP = 4
const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]'

export type SheetTone = 'default' | 'glass' | 'dj'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** accessible name; also the visible title unless `title` is given */
  label: string
  title?: ReactNode
  /** small line under the title (mono meta) */
  meta?: ReactNode
  /** buttons at the right of the title row (they stay tappable; dragging from them moves the sheet) */
  headerActions?: ReactNode
  /** extra header content under the title row (search field, tabs…) — part of the grab area */
  header?: ReactNode
  /** pinned under the scrolling body (primary actions) */
  footer?: ReactNode
  children?: ReactNode
  /** rests part-way up and can be dragged / tapped up to full height (Queue, Lyrics, long lists) */
  expandable?: boolean
  /** expandable only: how far from the top it rests (CSS length) */
  rest?: string
  /** show a close button in the title row (default: when there is a title) */
  closeButton?: boolean
  tone?: SheetTone
  /** lighter scrim, for sheets over Now playing */
  lightScrim?: boolean
  className?: string
  bodyClassName?: string
  /** expanded state, if the owner wants to control it */
  expanded?: boolean
  onExpandedChange?: (v: boolean) => void
}

export function Sheet({
  open,
  onClose,
  label,
  title,
  meta,
  headerActions,
  header,
  footer,
  children,
  expandable,
  rest = '192px',
  closeButton,
  tone = 'default',
  lightScrim,
  className,
  bodyClassName,
  expanded: expandedProp,
  onExpandedChange,
}: SheetProps) {
  const { mounted, shown } = usePresence(open, 420)
  const [expandedState, setExpandedState] = useState(false)
  const expanded = expandable ? (expandedProp ?? expandedState) : false
  const setExpanded = useCallback(
    (v: boolean) => {
      setExpandedState(v)
      onExpandedChange?.(v)
    },
    [onExpandedChange],
  )
  if (!open && expandedState) setExpandedState(false)

  const sheetRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useOverlayKeys(open, sheetRef, onClose, { trap: true, focusPanel: true })

  // the latest values for the gesture handlers (they are bound once per mount)
  const live = useRef({ expanded, expandable: !!expandable, onClose, setExpanded })
  live.current = { expanded, expandable: !!expandable, onClose, setExpanded }

  useEffect(() => {
    const sheet = sheetRef.current
    const card = cardRef.current
    const head = card?.querySelector<HTMLElement>('.sh-head')
    const body = bodyRef.current
    if (!mounted || !sheet || !card || !head) return
    // fresh open: drop whatever a previous drag-close left inline
    sheet.style.transform = ''
    sheet.style.transition = ''

    const g = { on: false, moved: false, fromBtn: false, onHandle: false, y0: 0, x0: 0, y: 0, t: 0, v: 0, dy: 0, swallow: false, pointerId: -1 }
    // the resting offset of an expandable sheet (its normal height), whether or not it is expanded now
    const restPx = () => parseFloat(getComputedStyle(sheet).getPropertyValue('--sh-rest')) || 0

    const paint = (dy: number) => {
      sheet.style.transition = 'none'
      sheet.style.transform = `translate3d(0, calc(var(--sh-rest-now) + ${dy}px), 0)`
      const scrim = scrimRef.current
      if (scrim) {
        scrim.style.transition = 'none'
        scrim.style.opacity = dy > 0 ? String(Math.max(0, 1 - dy / Math.max(1, card.offsetHeight))) : ''
      }
    }
    const release = (closing: boolean) => {
      sheet.classList.remove('is-grabbing')
      sheet.style.transition = ''
      const scrim = scrimRef.current
      if (scrim) scrim.style.transition = ''
      if (closing) {
        // carry on down from where the finger let go
        sheet.style.transform = 'translate3d(0, calc(100% + 24px), 0)'
        if (scrim) scrim.style.opacity = '0'
      } else {
        sheet.style.transform = ''
        if (scrim) scrim.style.opacity = ''
      }
    }

    const begin = (x: number, y: number, t: number, fromBtn: boolean, onHandle: boolean) => {
      Object.assign(g, { on: true, moved: false, fromBtn, onHandle, x0: x, y0: y, y, t, v: 0, dy: 0 })
    }
    /** returns true once this gesture is a sheet drag */
    const move = (x: number, y: number, t: number) => {
      if (!g.on) return false
      if (t > g.t) g.v = 0.7 * ((y - g.y) / (t - g.t)) + 0.3 * g.v // px/ms, + = down
      g.y = y
      g.t = t
      const dy = y - g.y0
      if (!g.moved) {
        if (Math.abs(dy) <= (g.fromBtn ? BTN_SLOP : SLOP)) return false
        if (Math.abs(x - g.x0) > Math.abs(dy) * 1.2) {
          g.on = false // a sideways swipe isn't ours
          return false
        }
        g.moved = true
        if (g.fromBtn) g.swallow = true
        sheet.classList.add('is-grabbing')
      }
      const { expanded: ex, expandable: can } = live.current
      // up: to full height when expandable, otherwise a little rubber band
      g.dy = dy >= 0 ? dy : can && !ex ? Math.max(-restPx(), dy) : dy / 5
      paint(g.dy)
      return true
    }
    const end = () => {
      if (!g.on) return
      g.on = false
      const { expanded: ex, expandable: can, onClose: close, setExpanded: setEx } = live.current
      if (g.swallow) window.setTimeout(() => (g.swallow = false), 350)
      if (!g.moved) {
        if (g.onHandle && can) setEx(!ex) // a tap on the handle toggles full height
        return
      }
      const { dy, v } = g
      if (dy > 0 && (dy > CLOSE_PX || v > FLICK)) {
        if (ex && dy < restPx() + 200 && v < 1.2) {
          release(false)
          setEx(false)
        } else {
          release(true)
          close()
        }
      } else if (dy < 0 && can && !ex && (dy < -EXPAND_PX || v < -FLICK)) {
        release(false)
        setEx(true)
      } else release(false)
    }

    /* header: pointer events (touch-action: none in CSS) */
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      const target = e.target as Element
      if (target.closest(NO_DRAG)) return
      const fromBtn = !!target.closest('button, a, [role="button"]:not(.sh-grab)')
      g.pointerId = e.pointerId
      if (!fromBtn) head.setPointerCapture(e.pointerId)
      begin(e.clientX, e.clientY, e.timeStamp, fromBtn, !!target.closest('.sh-grab'))
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId) return
      const wasMoved = g.moved
      if (move(e.clientX, e.clientY, e.timeStamp) && !wasMoved && g.fromBtn) {
        try {
          head.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already gone */
        }
      }
    }
    const onUp = (e: PointerEvent) => e.pointerId === g.pointerId && end()
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== g.pointerId || !g.on) return
      g.on = false
      release(false)
    }
    const onClickCapture = (e: MouseEvent) => {
      if (!g.swallow) return
      g.swallow = false
      e.preventDefault()
      e.stopPropagation()
    }

    /* body: touch events, so the list keeps native scrolling; it pulls the sheet only from the top */
    let bodyArmed = false
    const onTouchStart = (e: TouchEvent) => {
      bodyArmed = false
      if (e.touches.length !== 1 || !body) return
      const target = e.target as Element
      if (target.closest(NO_DRAG)) return
      const scroller = target.closest('.sh-body, [data-sheet-scroll]')
      if (scroller && scroller.scrollTop > 0) return
      bodyArmed = true
      const t = e.touches[0]
      begin(t.clientX, t.clientY, e.timeStamp, false, false)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!bodyArmed) return
      const t = e.touches[0]
      // only a downward pull takes over; an upward one is a normal scroll
      if (!g.moved && t.clientY - g.y0 < -SLOP) {
        bodyArmed = g.on = false
        return
      }
      if (move(t.clientX, t.clientY, e.timeStamp) && e.cancelable) e.preventDefault()
      if (!g.on) bodyArmed = false
    }
    const onTouchEnd = () => {
      if (!bodyArmed) return
      bodyArmed = false
      if (g.moved) g.swallow = true
      end()
    }

    head.addEventListener('pointerdown', onDown)
    head.addEventListener('pointermove', onMove)
    head.addEventListener('pointerup', onUp)
    head.addEventListener('pointercancel', onCancel)
    card.addEventListener('click', onClickCapture, true)
    body?.addEventListener('touchstart', onTouchStart, { passive: true })
    body?.addEventListener('touchmove', onTouchMove, { passive: false })
    body?.addEventListener('touchend', onTouchEnd)
    body?.addEventListener('touchcancel', onTouchEnd)
    return () => {
      head.removeEventListener('pointerdown', onDown)
      head.removeEventListener('pointermove', onMove)
      head.removeEventListener('pointerup', onUp)
      head.removeEventListener('pointercancel', onCancel)
      card.removeEventListener('click', onClickCapture, true)
      body?.removeEventListener('touchstart', onTouchStart)
      body?.removeEventListener('touchmove', onTouchMove)
      body?.removeEventListener('touchend', onTouchEnd)
      body?.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [mounted])

  if (!mounted) return null
  const showClose = closeButton ?? !!title
  const heading = title ?? null
  const style = (expandable ? { '--sh-rest': rest } : undefined) as CSSProperties | undefined

  return (
    <Portal>
      <div className={`sh-layer is-${tone}`}>
        <div ref={scrimRef} className={`sh-scrim pg-anim ${shown ? 'is-on' : ''} ${lightScrim ? 'is-light' : ''}`} onClick={onClose} aria-hidden />
        <section
          ref={sheetRef}
          className={['sh pg-anim', shown && 'is-on', expandable && 'is-expandable', expanded && 'is-expanded', className].filter(Boolean).join(' ')}
          style={style}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
        >
          <div ref={cardRef} className="sh-card">
            <div className="sh-head">
              <div className="sh-grab" role="presentation" title={expandable ? (expanded ? 'Drag down to shrink or close' : 'Drag up to expand, down to close') : 'Drag down to close'}>
                <span />
              </div>
              {(heading || headerActions || showClose) && (
                <div className="sh-title-row">
                  <div className="sh-titles">
                    {heading && <h2 className="sh-title">{heading}</h2>}
                    {meta && <div className="sh-meta">{meta}</div>}
                  </div>
                  {headerActions && <div className="sh-actions">{headerActions}</div>}
                  {showClose && <IconButton icon="x" label="Close" size="sm" variant="soft" onClick={onClose} />}
                </div>
              )}
              {header}
            </div>
            <div ref={bodyRef} className={['sh-body', bodyClassName].filter(Boolean).join(' ')}>
              {children}
            </div>
            {footer && <div className="sh-foot">{footer}</div>}
          </div>
        </section>
      </div>
    </Portal>
  )
}
