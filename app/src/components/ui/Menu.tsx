/**
 * Menu — the one popup menu for the whole app (context menus, overflow ⋮ menus, sort menus,
 * pickers). Replaces the page copies (.am-panel, shell .menu, .dl-menu, .lb-sort-menu, .nr-artpop…).
 *
 *   const [at, setAt] = useState<MenuAnchor | null>(null)
 *   <IconButton icon="more" label="More" onClick={(e) => setAt(e.currentTarget)} />
 *   <Menu open={!!at} anchor={at} onClose={() => setAt(null)} label="Album">
 *     <MenuItem icon="queue" onSelect={…}>Add to queue</MenuItem>
 *     <MenuSeparator />
 *     <MenuItem icon="delete" danger onSelect={…}>Remove</MenuItem>
 *   </Menu>
 *
 * Desktop: a popover placed against the anchor (an element, or a point for right-click menus),
 * flipped / clamped to stay on screen; arrow keys, Home / End, type-ahead, Escape, Tab closes.
 * Phone: with `phone="sheet"` (default) it opens as a bottom Sheet with bigger rows.
 * Selecting an item closes the menu unless the item passes keepOpen.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../design/icons'
import { useIsPhone } from '../../state/viewport'
import { Portal, useOverlayKeys, usePresence } from './overlay'
import { Sheet } from './Sheet'

export type MenuAnchor = Element | { x: number; y: number }
export type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

const MenuCtx = createContext<{ close: () => void; role: 'menu' | 'listbox' } | null>(null)

export interface MenuProps {
  open: boolean
  onClose: () => void
  anchor: MenuAnchor | null | undefined
  /** accessible name; also the phone sheet's title unless `title` is given */
  label: string
  title?: ReactNode
  children: ReactNode
  placement?: MenuPlacement
  /** px; default: at least the anchor's width, 200 minimum */
  width?: number
  phone?: 'sheet' | 'popover'
  /** selectable list (role=listbox semantics for pickers) */
  role?: 'menu' | 'listbox'
  className?: string
}

export function Menu({ open, onClose, anchor, label, title, children, placement = 'bottom-start', width, phone = 'sheet', role = 'menu', className }: MenuProps) {
  const isPhone = useIsPhone()
  const asSheet = isPhone && phone === 'sheet'
  const { mounted, shown } = usePresence(open && !asSheet, 200)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  useOverlayKeys(open && !asSheet, ref, onClose)

  // place against the anchor; flip above / clamp sideways when it doesn't fit
  useLayoutEffect(() => {
    if (!mounted || asSheet || !anchor) return
    const place = () => {
      const el = ref.current
      if (!el) return
      const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 }
      const minW = Math.max(width ?? 0, Math.min(r.width, 360), 200)
      el.style.minWidth = `${minW}px`
      if (width) el.style.width = `${width}px`
      const w = el.offsetWidth // content width (max-content, capped at 360 by CSS)
      const h = Math.min(el.scrollHeight, window.innerHeight - 16)
      const gap = anchor instanceof Element ? 4 : 0
      const wantUp = placement.startsWith('top')
      const below = window.innerHeight - r.bottom - gap - 8
      const above = r.top - gap - 8
      const up = wantUp ? above >= h || above > below : below < h && above > below
      const alignEnd = placement.endsWith('end')
      let left = alignEnd ? r.right - w : r.left
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      const maxH = Math.max(120, up ? above : below)
      setPos({
        left,
        minWidth: minW,
        ...(width ? { width } : null),
        maxHeight: maxH,
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
        '--mn-origin': `${up ? 'bottom' : 'top'} ${alignEnd ? 'right' : 'left'}`,
      } as unknown as CSSProperties)
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [mounted, asSheet, anchor, placement, width])

  // a press outside closes (the anchor too: pressing it again is a toggle handled by the owner)
  useLayoutEffect(() => {
    if (!open || asSheet) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchor instanceof Element && anchor.contains(t)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, asSheet, anchor, onClose])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('.mn-item:not(:disabled)') ?? [])]
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => {
      e.preventDefault()
      items[(n + items.length) % items.length].focus()
    }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i < 0 ? items.length - 1 : i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Tab') onClose()
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase()
      const from = i + 1
      const hit = [...items.slice(from), ...items.slice(0, from)].find((n) => n.textContent?.trim().toLowerCase().startsWith(k))
      hit?.focus()
    }
  }

  const ctx = { close: onClose, role }
  if (asSheet) {
    return (
      <MenuCtx.Provider value={ctx}>
        <Sheet open={open} onClose={onClose} label={label} title={title ?? label} closeButton={false} bodyClassName="mn-sheet">
          <div role={role} aria-label={label} onKeyDown={onKey} ref={ref}>
            {children}
          </div>
        </Sheet>
      </MenuCtx.Provider>
    )
  }
  if (!mounted) return null
  return (
    <MenuCtx.Provider value={ctx}>
      <Portal>
        <div
          ref={ref}
          className={['mn pg-anim', shown && pos && 'is-on', className].filter(Boolean).join(' ')}
          style={pos ?? { left: -9999, top: 0 }}
          role={role}
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKey}
        >
          {children}
        </div>
      </Portal>
    </MenuCtx.Provider>
  )
}

export interface MenuItemProps {
  children: ReactNode
  onSelect?: () => void
  icon?: IconName
  /** second line under the label */
  description?: ReactNode
  /** right-aligned text (count, shortcut, value) */
  trailing?: ReactNode
  /** picked option (tonal row with a check) — for pickers / sort menus */
  selected?: boolean
  danger?: boolean
  disabled?: boolean
  /** don't close the menu after selecting (toggles inside a menu) */
  keepOpen?: boolean
  className?: string
}

export function MenuItem({ children, onSelect, icon, description, trailing, selected, danger, disabled, keepOpen, className }: MenuItemProps) {
  const ctx = useContext(MenuCtx)
  const inPicker = selected !== undefined
  return (
    <button
      type="button"
      className={['mn-item', selected && 'is-on', danger && 'is-danger', className].filter(Boolean).join(' ')}
      role={ctx?.role === 'listbox' ? 'option' : inPicker ? 'menuitemradio' : 'menuitem'}
      aria-checked={inPicker && ctx?.role !== 'listbox' ? !!selected : undefined}
      aria-selected={ctx?.role === 'listbox' ? !!selected : undefined}
      disabled={disabled}
      onClick={() => {
        onSelect?.()
        if (!keepOpen) ctx?.close()
      }}
    >
      {icon && <Icon name={icon} />}
      <span className="mn-item-l">
        {children}
        {description && <span className="mn-item-d">{description}</span>}
      </span>
      {trailing != null && <span className="mn-item-t">{trailing}</span>}
      {inPicker && <Icon name="done" className="mn-item-ck" />}
    </button>
  )
}

export const MenuSeparator = () => <div className="mn-sep" role="separator" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="mn-label">{children}</div>
