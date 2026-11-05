/**
 * Tabs — one tab bar for the whole app (replaces New releases .nr-tabs / .nr-seg and the Library
 * chip tablist's hand-wiring).
 *   variant="underline": M3 primary tabs — label + count, a 3px rounded indicator under the active one
 *   variant="chips":     the kit Chip as tabs (Library-style filter row)
 * Keyboard: ←/→ (and Home/End) move and select, as a tablist should. Panels are the owner's:
 * give the panel id={`${id}-panel`} and aria-labelledby={`${id}-${value}`} if needed.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'
import { Chip } from './Controls'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  icon?: IconName
  count?: ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  value: T
  onChange: (v: T) => void
  items: TabItem<T>[]
  label: string
  variant?: 'underline' | 'chips'
  size?: 'sm' | 'md'
  /** underline: stretch the tabs across the row */
  full?: boolean
  className?: string
}

export function Tabs<T extends string>({ value, onChange, items, label, variant = 'underline', size = 'md', full, className }: TabsProps<T>) {
  const id = useId()
  const row = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent) => {
    const on = items.filter((t) => !t.disabled)
    const i = on.findIndex((t) => t.value === value)
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % on.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + on.length) % on.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = on.length - 1
    if (n < 0) return
    e.preventDefault()
    onChange(on[n].value)
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  if (variant === 'chips') {
    return (
      <div ref={row} className={['tbar tbar-chips', className].filter(Boolean).join(' ')} role="tablist" aria-label={label} onKeyDown={onKey}>
        {items.map((t) => (
          <Chip key={t.value} role="tab" selected={t.value === value} size={size} count={t.count} disabled={t.disabled} onClick={() => onChange(t.value)}>
            {t.label}
          </Chip>
        ))}
      </div>
    )
  }
  return (
    <div ref={row} className={['tbar tbar-ul', size === 'sm' && 'is-sm', full && 'is-full', className].filter(Boolean).join(' ')} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            id={`${id}-${t.value}`}
            type="button"
            role="tab"
            className={`tbar-t ${on ? 'is-on' : ''}`}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
          >
            <span className="tbar-in">
              {t.icon && <Icon name={t.icon} />}
              <span className="tbar-l">{t.label}</span>
              {t.count != null && <span className="tbar-n">{t.count}</span>}
              <span className="tbar-ind" aria-hidden />
            </span>
          </button>
        )
      })}
    </div>
  )
}
