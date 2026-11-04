/**
 * Toasts — bottom centre of the main area (Android: above the mini-player).
 * Enter: opacity + 20px rise, 0.6s default ease. Leave: 0.35s ease. Last 4–5s.
 * At most one action (Undo, View, Play, Retry).
 * Dismiss: swipe left on touch; close (×) button on hover/fine-pointer devices.
 *
 *   const toast = useToast()
 *   toast.show({ icon: 'check', text: 'Tsunami Sea is stored offline.', meta: '74 MB · OPUS 160', action: { label: 'Undo', onClick } })
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

export interface ToastInput {
  text: ReactNode
  icon?: IconName
  /** grey icon (e.g. removed / x) */
  mutedIcon?: boolean
  meta?: ReactNode
  action?: { label: string; onClick: () => void }
  tone?: 'default' | 'danger' | 'dj'
  /** 0..1 — thin glowing line along the bottom (uploads) */
  progress?: number
  /** ms; default 4500. 0 = stays until dismissed/updated */
  duration?: number
}

interface ToastItem extends ToastInput {
  id: number
  leaving: boolean
}

interface ToastApi {
  show: (t: ToastInput) => number
  update: (id: number, t: Partial<ToastInput>) => void
  dismiss: (id: number) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

const MAX = 3
const LEAVE_MS = 350
/** px of leftward travel (or a quick flick) that dismisses */
const SWIPE_DISMISS_PX = 80
const SWIPE_FLICK_V = 0.5 // px/ms
/** after a cancelled swipe, the toast gets this long again */
const REARM_MS = 3000

export function ToastProvider({
  children,
  fixed = true,
  bottom,
  className,
}: {
  children: ReactNode
  fixed?: boolean
  bottom?: number
  /** extra class on the toast stack, e.g. to centre it over the shell's main area */
  className?: string
}) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, number>())

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      const t = timers.current.get(id)
      if (t) window.clearTimeout(t)
      timers.current.delete(id)
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)))
      window.setTimeout(() => remove(id), LEAVE_MS)
    },
    [remove],
  )

  const arm = useCallback(
    (id: number, duration: number) => {
      const old = timers.current.get(id)
      if (old) window.clearTimeout(old)
      if (duration > 0) timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
    },
    [dismiss],
  )

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current
      setItems((xs) => {
        const next = [...xs, { ...t, id, leaving: false }]
        // drop the oldest beyond MAX (immediately — they're replaced)
        return next.slice(-MAX)
      })
      arm(id, t.duration ?? 4500)
      return id
    },
    [arm],
  )

  const update = useCallback(
    (id: number, t: Partial<ToastInput>) => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...t } : x)))
      if (t.duration !== undefined) arm(id, t.duration)
    },
    [arm],
  )

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={`toasts ${fixed ? 'toasts-fixed' : ''} ${className ?? ''}`} style={bottom != null ? { bottom } : undefined} role="status" aria-live="polite">
        {items.map((t) => (
          <ToastView
            key={t.id}
            t={t}
            onDismiss={() => dismiss(t.id)}
            onHold={() => {
              const tm = timers.current.get(t.id)
              if (tm) window.clearTimeout(tm)
              timers.current.delete(t.id)
            }}
            onRelease={() => {
              if ((t.duration ?? 4500) > 0) arm(t.id, REARM_MS)
            }}
          />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastView({
  t,
  onDismiss,
  onHold,
  onRelease,
}: {
  t: ToastItem
  onDismiss: () => void
  /** a swipe started — pause auto-dismiss */
  onHold: () => void
  /** swipe cancelled — resume auto-dismiss */
  onRelease: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; active: boolean } | null>(null)
  const [swiped, setSwiped] = useState(false)

  const setX = (dx: number, animate: boolean) => {
    const el = ref.current
    if (!el) return
    // the enter animation's fill would otherwise override an inline transform
    el.style.animation = 'none'
    el.style.transition = animate ? 'transform .22s var(--ease-shape, ease), opacity .22s ease' : 'none'
    el.style.transform = dx ? `translateX(${dx}px)` : ''
    el.style.opacity = dx < 0 ? String(Math.max(0.2, 1 + dx / 260)) : ''
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || t.leaving || swiped) return
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, active: false }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // vertical intent → let it go
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      d.active = true
      ref.current?.setPointerCapture(e.pointerId)
      onHold()
    }
    // leftward follows the finger; rightward gets heavy resistance
    d.dx = dx < 0 ? dx : dx * 0.2
    setX(d.dx, false)
  }

  const end = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.active) return
    const v = d.dx / Math.max(1, e.timeStamp - d.t)
    if (!cancelled && (d.dx < -SWIPE_DISMISS_PX || (d.dx < -24 && v < -SWIPE_FLICK_V))) {
      const w = ref.current?.offsetWidth ?? 320
      setSwiped(true)
      setX(-(w + 40), true)
      if (ref.current) ref.current.style.opacity = '0'
      onDismiss()
    } else {
      setX(0, true)
      onRelease()
    }
  }

  return (
    <div
      ref={ref}
      className={`toast ${t.tone === 'danger' ? 'toast-danger' : t.tone === 'dj' ? 'toast-dj' : ''} ${t.leaving ? 'is-leaving' : ''} ${swiped ? 'is-swiped' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
    >
      {t.icon && (
        <span className={`toast-ic ${t.mutedIcon ? 'is-muted' : ''}`}>
          <Icon name={t.icon} />
        </span>
      )}
      <span className="toast-text">{t.text}</span>
      {t.meta != null && <span className="toast-meta">{t.meta}</span>}
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            t.action!.onClick()
            onDismiss()
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
        <Icon name="x" />
      </button>
      {t.progress != null && <span className="toast-progress" style={{ width: `${t.progress * 100}%` }} />}
    </div>
  )
}
