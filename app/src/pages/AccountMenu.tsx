/** Avatar (top right of Home) with the account menu: refresh library, local FLAC folder, switch account, sign out. */
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../components/ui'
import { Icon, type IconName } from '../design/icons'
import { localFolder, useLocalFolder } from '../lib/localFolder'
import { APP_VERSION, appUpdate, usePwa } from '../lib/pwa'
import { isNative } from '../native/bridge'
import { nativeUpdates, useNativeUpdates } from '../native/updates'
import { libraryStore, useLibrary } from '../state/library'
import { sessionStore, useSession } from '../state/session'

const time = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'

export function AccountMenu() {
  const { account, status } = useSession()
  const lib = useLibrary()
  const local = useLocalFolder()
  const toast = useToast()
  const pwa = usePwa()
  const apk = useNativeUpdates()
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
            {localFolder.supported && (
              <span className="menu-meta" title={linked ? 'FLAC plays from this folder, Drive is the fallback' : 'FLAC streams from Google Drive'}>
                {linked ? `LOCAL FLAC · ${local.name?.toUpperCase()}${local.status === 'prompt' ? ' · ASKS ON PLAY' : local.status === 'denied' ? ' · ACCESS DENIED' : ''}` : 'STREAMING FROM DRIVE'}
              </span>
            )}
          </div>
          {status === 'expired'
            ? item('refresh', 'Sign in again', () => void sessionStore.signIn())
            : item('refresh', lib.refreshing ? 'Checking Drive…' : 'Check Drive for changes', () => void libraryStore.sync({ force: true }), { disabled: lib.refreshing })}
          {localFolder.supported && item('library', linked ? 'Change local music folder…' : 'Play FLAC from a local folder…', () => void linkFolder(), { disabled: !lib.data })}
          {linked && item('x', 'Stop using the local folder', () => void localFolder.unlink())}
          {pwa.canInstall && !pwa.installed && item('download', 'Install Pelagic app', () => void appUpdate.install())}
          {pwa.updateReady && item('refresh', 'Reload to update Pelagic', () => appUpdate.apply())}
          {apk.available && item('download', `Install Pelagic ${apk.available.versionName}`, () => nativeUpdates.install())}
          {item('ext', 'Switch account', () => void sessionStore.signIn({ switchAccount: true }))}
          {item('x', 'Sign out', () => sessionStore.signOut(), { danger: true })}
          <div className="menu-foot">
            {isNative ? `PELAGIC ANDROID ${apk.current?.versionName ?? ''} · ${APP_VERSION}`.toUpperCase() : `PELAGIC ${APP_VERSION.toUpperCase()}${pwa.installed ? ' · APP' : ''}`}
          </div>
        </div>
      )}
    </div>
  )
}
