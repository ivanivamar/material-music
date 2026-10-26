/**
 * Account menu: refresh library, listening stats, settings, local FLAC folder, switch account, sign out.
 * Desktop (Material redesign): the account chip at the bottom of the sidebar opens it as a menu above.
 * Phone: the avatar in the top bar opens the same items as a bottom sheet.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSheetDrag } from '../components/useSheetDrag'
import { Icon, type IconName } from '../design/icons'
import { localFolder, useLocalFolder } from '../lib/localFolder'
import { APP_VERSION, appUpdate, usePwa } from '../lib/pwa'
import { isNative } from '../native/bridge'
import { registerBack } from '../native/backButton'
import { nativeUpdates, useNativeUpdates } from '../native/updates'
import { useLibrary } from '../state/library'
import { checkDrive } from '../state/checkDrive'
import { sessionStore, useSession } from '../state/session'
import { go, href, statsHref } from '../shell/routes'

const time = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'

interface Row {
  icon: IconName
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
}

/** Everything both renderings show: identity, status lines, the action rows and the footer. */
function useAccountMenu() {
  const { account, status } = useSession()
  const lib = useLibrary()
  const local = useLocalFolder()
  const pwa = usePwa()
  const apk = useNativeUpdates()

  const linked = local.status !== 'none' && local.status !== 'unsupported' && local.status !== 'loading'

  const initial = (account?.name || account?.email || '?').trim()[0]!.toUpperCase()

  const metas: { text: string; title?: string }[] = [
    { text: status === 'expired' ? 'SESSION EXPIRED' : lib.refreshing ? 'CHECKING DRIVE…' : `LIBRARY SYNCED ${time(lib.syncedAt)}` },
  ]
  if (localFolder.supported) {
    metas.push({
      text: linked ? `LOCAL FLAC · ${local.name?.toUpperCase()}${local.status === 'prompt' ? ' · ASKS ON PLAY' : local.status === 'denied' ? ' · ACCESS DENIED' : ''}` : 'STREAMING FROM DRIVE',
      title: linked ? 'FLAC plays from this folder, Drive is the fallback' : 'FLAC streams from Google Drive',
    })
  }

  const rows: Row[] = []
  if (status === 'expired') rows.push({ icon: 'refresh', label: 'Sign in again', run: () => void sessionStore.signIn() })
  else
    rows.push({
      icon: 'refresh',
      label: lib.refreshing ? 'Checking Drive…' : 'Check Drive for changes',
      disabled: lib.refreshing,
      run: checkDrive,
    })
  rows.push({ icon: 'stats', label: 'Listening stats', run: () => go(statsHref()) })
  rows.push({ icon: 'gear', label: 'Settings', run: () => go(href('settings')) })
  if (isNative) rows.push({ icon: 'download', label: 'Downloads', run: () => go(href('downloads')) })
  if (pwa.canInstall && !pwa.installed) rows.push({ icon: 'install', label: 'Install Material Music', run: () => void appUpdate.install() })
  if (pwa.updateReady) rows.push({ icon: 'update', label: 'Reload to update', run: () => appUpdate.apply() })
  if (apk.available) rows.push({ icon: 'download', label: `Install version ${apk.available.versionName}`, run: () => nativeUpdates.install() })
  rows.push({ icon: 'account', label: 'Switch account', run: () => void sessionStore.signIn({ switchAccount: true }) })
  rows.push({ icon: 'logout', label: 'Sign out', danger: true, run: () => sessionStore.signOut() })

  const foot = isNative ? `Material Music for Android ${apk.current?.versionName ?? ''} · ${APP_VERSION}` : `Material Music ${APP_VERSION}${pwa.installed ? ' · app' : ''}`

  const synced = status === 'expired' ? 'Session expired' : lib.refreshing ? 'Checking Drive…' : `Synced ${ago(lib.syncedAt)}`
  return { account, initial, metas, rows, foot, synced }
}

/** "2 min ago" / "just now" / "at 14:05" for the account chip. */
function ago(ms: number | null) {
  if (!ms) return 'not yet'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `at ${time(ms)}`
}

function AvatarFace({ photo, initial }: { photo?: string | null; initial: string }) {
  return photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <>{initial}</>
}

/** Round avatar (photo, else the initial on a warm yellow). */
export function Avatar({ size = 36 }: { size?: number }) {
  const { account, initial } = useAccountMenu()
  return (
    <span className="mm-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      <AvatarFace photo={account?.photo} initial={initial} />
    </span>
  )
}

function MenuRows({ rows, onPick }: { rows: Row[]; onPick: (r: Row) => void }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {r.danger && <div className="menu-sep" />}
          <button type="button" role="menuitem" className={`menu-item ${r.danger ? 'is-danger' : ''}`} disabled={r.disabled} onClick={() => onPick(r)}>
            <Icon name={r.icon} className="mi-ic" />
            {r.label}
          </button>
        </div>
      ))}
    </>
  )
}

/** Desktop: the account chip at the bottom of the sidebar; the menu opens above it. */
export function AccountChip() {
  const { account, metas, rows, foot, synced } = useAccountMenu()
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
  return (
    <div className="sb-acct" ref={wrap}>
      <button type="button" className="sb-acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar size={36} />
        <span className="sb-acct-text">
          <span className="sb-acct-name">{account?.name?.split(' ')[0] || 'Signed in'}</span>
          <span className="sb-acct-sub">{synced}</span>
        </span>
        <Icon name="unfold" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <span className="menu-name">{account?.name || 'Signed in'}</span>
            <span className="menu-email">{account?.email}</span>
            {metas.map((m, i) => (
              <span key={i} className="menu-meta" title={m.title}>
                {m.text}
              </span>
            ))}
          </div>
          <MenuRows
            rows={rows}
            onPick={(r) => {
              setOpen(false)
              r.run()
            }}
          />
          <div className="menu-foot">{foot}</div>
        </div>
      )}
    </div>
  )
}

/** Phone: the avatar in the top bar; opens the account sheet. */
export function AccountButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ptb-av" aria-haspopup="dialog" aria-expanded={open} aria-label="Account" onClick={() => setOpen(true)}>
        <Avatar size={32} />
      </button>
      {open && createPortal(<AccountSheet onClosed={() => setOpen(false)} />, document.body)}
    </>
  )
}

function AccountSheet({ onClosed }: { onClosed: () => void }) {
  const { account, initial, metas, rows, foot } = useAccountMenu()
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)

  const close = (then?: () => void) => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(() => {
      onClosed()
      then?.()
    }, 260)
  }

  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [])
  // Android Back / Esc close the sheet
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(
    () =>
      registerBack(() => {
        closeRef.current()
        return true
      }, 'top'),
    [],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // drag the handle / header (or the list at its top) down to close
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  useSheetDrag(sheetRef, scrimRef, () => close())

  const open = shown && !closing
  return (
    <>
      <div ref={scrimRef} className={`as-scrim pg-anim ${open ? 'is-on' : ''}`} onClick={() => close()} />
      <div ref={sheetRef} className={`as as-account pg-anim ${open ? 'is-on' : ''}`} role="dialog" aria-label="Account">
        <button type="button" className="as-handle" aria-label="Close" onClick={() => close()}>
          <span />
        </button>
        <div className="as-head">
          <span className="as-me-av">
            <AvatarFace photo={account?.photo} initial={initial} />
          </span>
          <div className="as-head-text">
            <div className="as-head-title">{account?.name || 'Signed in'}</div>
            <div className="as-head-sub">{account?.email}</div>
          </div>
        </div>
        <div className="as-me-meta">
          {metas.map((m, i) => (
            <span key={i}>{m.text}</span>
          ))}
        </div>
        <div className="as-items">
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {r.danger && <div className="as-div" />}
              <button type="button" className={`as-item ${r.danger ? 'is-danger' : ''}`} disabled={r.disabled} onClick={() => close(r.run)}>
                <span className="as-ic">
                  <Icon name={r.icon} />
                </span>
                <span className="as-label">{r.label}</span>
              </button>
            </div>
          ))}
        </div>
        <div className="as-me-foot">{foot}</div>
      </div>
    </>
  )
}
