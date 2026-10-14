/** Avatar (top right of Home) with the account menu: refresh library, switch account, sign out. */
import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../design/icons'
import { libraryStore, useLibrary } from '../state/library'
import { sessionStore, useSession } from '../state/session'

const time = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'

export function AccountMenu() {
  const { account, status } = useSession()
  const lib = useLibrary()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (account?.name || account?.email || '?').trim()[0]!.toUpperCase()
  const item = (icon: IconName, label: string, onClick: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${opts.danger ? 'is-danger' : ''}`}
      disabled={opts.disabled}
      onClick={() => {
        setOpen(false)
        onClick()
      }}
    >
      <span className="mi-ic">
        <Icon name={icon} />
      </span>
      {label}
    </button>
  )

  return (
    <div className="avatar-wrap" ref={wrap}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen((o) => !o)}>
        {account?.photo ? <img src={account.photo} alt="" referrerPolicy="no-referrer" /> : initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <span className="menu-name">{account?.name || 'Signed in'}</span>
            <span className="menu-email">{account?.email}</span>
            <span className="menu-meta">
              {status === 'expired' ? 'SESSION EXPIRED' : lib.refreshing ? 'CHECKING DRIVE…' : `LIBRARY SYNCED ${time(lib.syncedAt)}`}
            </span>
          </div>
          {status === 'expired'
            ? item('refresh', 'Sign in again', () => void sessionStore.signIn())
            : item('refresh', lib.refreshing ? 'Checking Drive…' : 'Check Drive for changes', () => void libraryStore.sync({ force: true }), { disabled: lib.refreshing })}
          {item('ext', 'Switch account', () => void sessionStore.signIn({ switchAccount: true }))}
          {item('x', 'Sign out', () => sessionStore.signOut(), { danger: true })}
        </div>
      )}
    </div>
  )
}
