/**
 * Alert — the one inline banner for "needs you" / status messages inside a page (Downloads
 * failures, Upload issues, Concerts couldn't update, Settings confirm, New releases offline / error,
 * Health background job, DJ offline note). Not a toast (those float) and not a card (content).
 *
 *   tone: warn (yellow, needs you) · danger (red, destructive confirm / failure) · info (neutral
 *         card surface, status) · dj (violet glass, DJ start)
 *   layout: row (icon · text · actions) · stack (text above the actions, for long copy)
 *   as="button": the whole banner is one action (Upload "2 of these need you · Review")
 */
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'

export type AlertTone = 'warn' | 'danger' | 'info' | 'dj'

export interface AlertProps {
  tone?: AlertTone
  icon?: IconName | null
  title?: ReactNode
  children?: ReactNode
  /** buttons (kit Button, e.g. variant="warn") at the end */
  actions?: ReactNode
  layout?: 'row' | 'stack'
  role?: 'status' | 'alert' | 'alertdialog'
  label?: string
  as?: 'div' | 'button'
  onClick?: () => void
  className?: string
}

const DEFAULT_ICON: Record<AlertTone, IconName> = { warn: 'warning', danger: 'warning', info: 'info', dj: 'offline' }

export function Alert({ tone = 'warn', icon, title, children, actions, layout = 'row', role = 'status', label, as = 'div', onClick, className }: AlertProps) {
  const ic = icon === null ? null : (icon ?? DEFAULT_ICON[tone])
  const cls = ['alert', `alert-${tone}`, layout === 'stack' && 'is-stack', as === 'button' && 'is-action', className].filter(Boolean).join(' ')
  const inner = (
    <>
      <span className="alert-main">
        {ic && (
          <span className="alert-ic" aria-hidden>
            <Icon name={ic} filled={tone === 'warn' || tone === 'danger'} />
          </span>
        )}
        <span className="alert-text">
          {title && <span className="alert-title">{title}</span>}
          {children && <span className="alert-body">{children}</span>}
        </span>
      </span>
      {actions && <span className="alert-acts">{actions}</span>}
    </>
  )
  if (as === 'button')
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={label}>
        {inner}
      </button>
    )
  return (
    <div className={cls} role={role} aria-label={label}>
      {inner}
    </div>
  )
}
