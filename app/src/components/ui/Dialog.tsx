/**
 * Dialog — the one modal for the whole app (replaces actions/Dialogs `Shell`, Concerts `ShowDialog`'s
 * own frame and its phone full-screen copy).
 *
 * Desktop: centred card (460px, or 560px with size="lg"), scrim click / Escape / ✕ close it, focus is
 * trapped inside and returns to the opener. Phone (`phone` prop):
 *   'dialog' — the same card, 16px from the edges (short confirmations)
 *   'full'   — full screen with a top bar (long forms)
 *   'sheet'  — a bottom Sheet with the same title, body and actions (pickers, short forms)
 */
import { useRef, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'
import { useIsPhone } from '../../state/viewport'
import { IconButton } from './Button'
import { Portal, useOverlayKeys, usePresence } from './overlay'
import { Sheet, type SheetTone } from './Sheet'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** accessible name when the title isn't plain text */
  label?: string
  subtitle?: ReactNode
  /** tonal icon tile left of the title */
  icon?: IconName
  /** footer buttons, right-aligned (put the primary action last) */
  actions?: ReactNode
  /** footer content on the left (e.g. a destructive "Delete") */
  actionsStart?: ReactNode
  children?: ReactNode
  size?: 'md' | 'lg'
  /** px, for the odd dialog wider than lg (Smart playlist rules) */
  width?: number
  phone?: 'dialog' | 'full' | 'sheet'
  /** scrim click closes (default true; turn off for forms with unsaved input) */
  dismissable?: boolean
  /** tone of the phone sheet variant */
  tone?: SheetTone
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  label,
  subtitle,
  icon,
  actions,
  actionsStart,
  children,
  size = 'md',
  width,
  phone = 'dialog',
  dismissable = true,
  tone,
  className,
}: DialogProps) {
  const isPhone = useIsPhone()
  const asSheet = isPhone && phone === 'sheet'
  const full = isPhone && phone === 'full'
  const { mounted, shown } = usePresence(open && !asSheet, 320)
  const panel = useRef<HTMLDivElement>(null)
  useOverlayKeys(open && !asSheet, panel, onClose, { trap: true })
  const name = label ?? (typeof title === 'string' ? title : undefined)

  if (asSheet) {
    const foot = actions || actionsStart ? (
      <>
        {actionsStart}
        {actions}
      </>
    ) : undefined
    return (
      <Sheet open={open} onClose={onClose} label={name ?? 'Dialog'} title={title} meta={subtitle} footer={foot} tone={tone} className={className}>
        {children}
      </Sheet>
    )
  }
  if (!mounted) return null
  return (
    <Portal>
      <div className={`dg-layer ${full ? 'is-full' : ''}`}>
        <div className={`dg-scrim pg-anim ${shown ? 'is-on' : ''}`} onClick={dismissable ? onClose : undefined} aria-hidden />
        <div
          ref={panel}
          className={['dg pg-anim', size === 'lg' && 'is-lg', shown && 'is-on', className].filter(Boolean).join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label={name}
          tabIndex={-1}
          style={width ? ({ '--dg-w': `${width}px` } as React.CSSProperties) : undefined}
        >
          <div className="dg-head">
            {icon && !full && (
              <span className="dg-tile" aria-hidden>
                <Icon name={icon} />
              </span>
            )}
            <div className="dg-titles">
              <h2 className="dg-title">{title}</h2>
              {subtitle && !full && <div className="dg-sub">{subtitle}</div>}
            </div>
            <IconButton icon={full ? 'back' : 'x'} label="Close" size="sm" onClick={onClose} />
          </div>
          <div className="dg-body">
            {full && subtitle && <div className="dg-sub dg-intro">{subtitle}</div>}
            {children}
          </div>
          {(actions || actionsStart) && (
            <div className="dg-foot">
              {actionsStart && <div className="dg-foot-start">{actionsStart}</div>}
              {actions}
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
