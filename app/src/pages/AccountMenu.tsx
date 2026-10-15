/**
 * Account menu: refresh library, local FLAC folder, switch account, sign out.
 * Desktop: avatar button in the top bar with a dropdown. Phone: the avatar is the last tab of the
 * bottom bar and opens the same items as a bottom sheet (same look as the action sheets).
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '../components/ui'
import { useSheetDrag } from '../components/useSheetDrag'
import { Icon, type IconName } from '../design/icons'
import { localFolder, useLocalFolder } from '../lib/localFolder'
import { APP_VERSION, appUpdate, usePwa } from '../lib/pwa'
import { isNative } from '../native/bridge'
import { registerBack } from '../native/backButton'
import { nativeUpdates, useNativeUpdates } from '../native/updates'
import { historyStore } from '../state/history'
import { releasesStore } from '../state/releases'
import { playlistsStore } from '../state/playlists'
import { libraryStore, useLibrary } from '../state/library'
import { sessionStore, useSession } from '../state/session'
import { go, href } from '../shell/routes'

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
  const toast = useToast()
  const pwa = usePwa()
  const apk = useNativeUpdates()

  const linkFolder = async () => {
    if (!lib.data) return
    try {
      const r = await localFolder.link(lib.data)
      if (r) toast.show({ icon: 'check', text: `FLAC now plays from “${r.name}”.`, meta: `${r.found} OF ${r.probed} SAMPLE TRACKS FOUND` })
    } catch (e) {
      toast.show({ icon: 'alert', tone: 'danger', text: (e as Error).message, meta: 'LOCAL FOLDER', duration: 8000 })
    }
  }
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
      run: () => {
        void libraryStore.sync({ force: true })
        void historyStore.sync()
        void releasesStore.sync()
        void playlistsStore.sync()
      },
    })
  if (isNative) rows.push({ icon: 'download', label: 'Downloads', run: () => go(href('downloads')) })
  if (localFolder.supported) rows.push({ icon: 'library', label: linked ? 'Change local music folder…' : 'Play FLAC from a local folder…', disabled: !lib.data, run: () => void linkFolder() })
  if (linked) rows.push({ icon: 'x', label: 'Stop using the local folder', run: () => void localFolder.unlink() })
  if (pwa.canInstall && !pwa.installed) rows.push({ icon: 'download', label: 'Install Pelagic app', run: () => void appUpdate.install() })
  if (pwa.updateReady) rows.push({ icon: 'refresh', label: 'Reload to update Pelagic', run: () => appUpdate.apply() })
  if (apk.available) rows.push({ icon: 'download', label: `Install Pelagic ${apk.available.versionName}`, run: () => nativeUpdates.install() })
  rows.push({ icon: 'ext', label: 'Switch account', run: () => void sessionStore.signIn({ switchAccount: true }) })
  rows.push({ icon: 'x', label: 'Sign out', danger: true, run: () => sessionStore.signOut() })

  const foot = isNative ? `PELAGIC ANDROID ${apk.current?.versionName ?? ''} · ${APP_VERSION}`.toUpperCase() : `PELAGIC ${APP_VERSION.toUpperCase()}${pwa.installed ? ' · APP' : ''}`

  return { account, initial, metas, rows, foot }
}

function AvatarFace({ photo, initial }: { photo?: string | null; initial: string }) {
  return photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : <>{initial}</>
}

/** Desktop: avatar + dropdown. */
export function AccountMenu() {
  const { account, initial, metas, rows, foot } = useAccountMenu()
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
    <div className="avatar-wrap" ref={wrap}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen((o) => !o)}>
        <AvatarFace photo={account?.photo} initial={initial} />
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
          {rows.map((r, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`menu-item ${r.danger ? 'is-danger' : ''}`}
              disabled={r.disabled}
              onClick={() => {
                setOpen(false)
                r.run()
              }}
            >
              <span className="mi-ic">
                <Icon name={r.icon} />
              </span>
              {r.label}
            </button>
          ))}
          <div className="menu-foot">{foot}</div>
        </div>
      )}
    </div>
  )
}

/** Phone: last tab of the bottom bar; opens the account sheet. */
export function AccountTab() {
  const { account, initial } = useAccountMenu()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`tab tab-me ${open ? 'is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="tab-ic">
          <span className="tab-av">
            <AvatarFace photo={account?.photo} initial={initial} />
          </span>
        </span>
        <span className="tab-label">YOU</span>
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
