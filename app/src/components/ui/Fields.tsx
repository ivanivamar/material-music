/**
 * Material 3 text fields and dropdowns.
 *
 * TextField: the outlined field — 56px, 4px corners, a 1px outline that turns 2px coral on focus, and a
 * label that sits inside the field until it has a value or focus, then floats into a notch in the top
 * edge. Optional supporting text below; `error` turns outline, label and text red. `multiline` gives a
 * textarea.
 *
 * Dropdown: the exposed dropdown menu — the same outlined field (or a compact 40px one inside rows) with
 * the value and an arrow that turns; the menu is a 0.26 surface, radius 16, 48px items, the picked one
 * tonal coral with a check. Keyboard: ↑/↓, Home/End, Enter / Space, Esc, type-ahead.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../design/icons'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'>
type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>

export function TextField({
  label,
  value,
  onChange,
  supporting,
  error,
  multiline,
  rows = 3,
  className,
  trailing,
  inputProps,
  areaProps,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  supporting?: ReactNode
  error?: boolean
  multiline?: boolean
  rows?: number
  className?: string
  /** an icon / button inside the right edge */
  trailing?: ReactNode
  inputProps?: InputProps
  areaProps?: AreaProps
}) {
  const id = useId()
  const filled = value !== '' || !!inputProps?.placeholder || !!areaProps?.placeholder
  return (
    <div className={['tf', filled && 'is-filled', error && 'is-error', multiline && 'is-multi', trailing && 'has-trailing', className].filter(Boolean).join(' ')}>
      <div className="tf-box">
        {multiline ? (
          <textarea id={id} className="tf-input" value={value} rows={rows} onChange={(e) => onChange(e.target.value)} {...areaProps} />
        ) : (
          <input id={id} className="tf-input" value={value} onChange={(e) => onChange(e.target.value)} {...inputProps} />
        )}
        <label className="tf-label" htmlFor={id}>
          {label}
        </label>
        <fieldset className="tf-outline" aria-hidden>
          <legend>
            <span>{label}</span>
          </legend>
        </fieldset>
        {trailing && <span className="tf-trailing">{trailing}</span>}
      </div>
      {supporting != null && <div className="tf-support">{supporting}</div>}
    </div>
  )
}

export interface DropOption<T> {
  value: T
  label: string
  /** smaller text on the right (counts, sizes) */
  meta?: string
}

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  compact,
  className,
  disabled,
}: {
  value: T
  options: DropOption<T>[]
  onChange: (v: T) => void
  /** floating label (full size) or aria-label (compact) */
  label: string
  /** 40px field for rows (no floating label) */
  compact?: boolean
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; max: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const typed = useRef({ s: '', t: 0 })
  const id = useId()
  const cur = options.findIndex((o) => o.value === value)
  const curOpt = options[cur]

  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const want = Math.min(options.length * 48 + 16, 320)
    const up = below < Math.min(want, 200) && above > below
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 160), up, max: Math.max(120, Math.min(320, up ? above : below)) })
  }
  const show = () => {
    if (disabled) return
    place()
    setActive(Math.max(0, cur))
    setOpen(true)
  }
  const pick = (i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    setOpen(false)
    btn.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('.dd-item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (menu.current?.contains(t) || btn.current?.contains(t)) return
      setOpen(false)
    }
    const re = () => place()
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('resize', re)
    window.addEventListener('scroll', re, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('resize', re)
      window.removeEventListener('scroll', re, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(options.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    } else if (e.key.length === 1) {
      const now = Date.now()
      typed.current = { s: (now - typed.current.t < 700 ? typed.current.s : '') + e.key.toLowerCase(), t: now }
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <div className={['dd', compact ? 'is-compact' : 'tf is-filled', open && 'is-open', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      <button
        ref={btn}
        type="button"
        className={compact ? 'dd-field' : 'tf-box dd-field'}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={compact ? label : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="dd-value">{curOpt?.label ?? ''}</span>
        <Icon name="arrowDrop" className="dd-arrow" />
        {!compact && (
          <>
            <span className="tf-label">{label}</span>
            <fieldset className="tf-outline" aria-hidden>
              <legend>
                <span>{label}</span>
              </legend>
            </fieldset>
          </>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            id={`${id}-list`}
            className={`dd-menu ${pos.up ? 'is-up' : ''}`}
            role="listbox"
            style={{ left: pos.left, minWidth: pos.width, maxHeight: pos.max, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            <div className="dd-menu-scroll">
              {options.map((o, i) => (
                <div
                  key={String(o.value)}
                  role="option"
                  aria-selected={i === cur}
                  className={`dd-item ${i === cur ? 'is-on' : ''} ${i === active ? 'is-active' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  <Icon name="done" className="dd-check" />
                  <span className="dd-label">{o.label}</span>
                  {o.meta && <span className="dd-meta">{o.meta}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
