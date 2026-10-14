/**
 * Toasts — bottom centre of the main area (Android: above the mini-player).
 * Enter: opacity + 20px rise, 0.6s default ease. Leave: 0.35s ease. Last 4–5s.
 * At most one action (Undo, View, Play, Retry).
 *
 *   const toast = useToast()
 *   toast.show({ icon: 'check', text: 'Tsunami Sea is stored offline.', meta: '74 MB · OPUS 160', action: { label: 'Undo', onClick } })
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

export interface ToastInput {
  text: ReactNode
  icon?: IconName
  /** grey icon (e.g. removed / x) */
  mutedIcon?: boolean
  meta?: ReactNode
  action?: { label: string; onClick: () => void }
  tone?: 'default' | 'danger'
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

export function ToastProvider({ children, fixed = true, bottom }: { children: ReactNode; fixed?: boolean; bottom?: number }) {
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
      <div className={`toasts ${fixed ? 'toasts-fixed' : ''}`} style={bottom != null ? { bottom } : undefined} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'danger' ? 'toast-danger' : ''} ${t.leaving ? 'is-leaving' : ''}`}>
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
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            {t.progress != null && <span className="toast-progress" style={{ width: `${t.progress * 100}%` }} />}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
