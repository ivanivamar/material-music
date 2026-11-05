/**
 * Account menu: refresh library, listening stats, settings, local FLAC folder, switch account, sign out.
 * Desktop (Material redesign): the account chip at the bottom of the sidebar opens it as the kit Menu
 * above it. Phone: the avatar in the top bar opens the same items in the kit bottom Sheet.
 */
import { Fragment, useState } from 'react'
import { Menu, MenuItem, MenuSeparator, Sheet } from '../components/ui'
import { Icon, type IconName } from '../design/icons'
import { localFolder, useLocalFolder } from '../lib/localFolder'
import { APP_VERSION, appUpdate, usePwa } from '../lib/pwa'
import { isNative } from '../native/bridge'
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

function MenuRows({ rows, onPick }: { rows: Row[]; onPick?: (r: Row) => void }) {
  return (
    <>
      {rows.map((r, i) => (
        <Fragment key={i}>
          {r.danger && <MenuSeparator />}
          <MenuItem icon={r.icon} danger={r.danger} disabled={r.disabled} onSelect={() => (onPick ? onPick(r) : r.run())}>
            {r.label}
          </MenuItem>
        </Fragment>
      ))}
    </>
  )
}

/** Desktop: the account chip at the bottom of the sidebar; the kit Menu opens above it. */
export function AccountChip() {
  const { account, metas, rows, foot, synced } = useAccountMenu()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <div className="sb-acct">
      <button type="button" className="sb-acct-btn" aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <Avatar size={36} />
        <span className="sb-acct-text">
          <span className="sb-acct-name">{account?.name?.split(' ')[0] || 'Signed in'}</span>
          <span className="sb-acct-sub">{synced}</span>
        </span>
        <Icon name="unfold" />
      </button>
      <Menu open={!!anchor} anchor={anchor} onClose={() => setAnchor(null)} label="Account" placement="top-start" width={288} phone="popover">
        <div className="mn-head">
          <span className="mn-head-t">{account?.name || 'Signed in'}</span>
          <span className="mn-head-s">{account?.email}</span>
          {metas.map((m, i) => (
            <span key={i} className="mn-head-m" title={m.title}>
              {m.text}
            </span>
          ))}
        </div>
        <MenuRows rows={rows} />
        <div className="mn-foot">{foot}</div>
      </Menu>
    </div>
  )
}

/** Phone: the avatar in the top bar; opens the account sheet (the kit Sheet). */
export function AccountButton() {
  const [open, setOpen] = useState(false)
  const { account, initial, metas, rows, foot } = useAccountMenu()
  // let the sheet slide out, then run the row (navigation, sign out…)
  const pick = (r: Row) => {
    setOpen(false)
    window.setTimeout(r.run, 260)
  }
  return (
    <>
      <button type="button" className="ptb-av" aria-haspopup="dialog" aria-expanded={open} aria-label="Account" onClick={() => setOpen(true)}>
        <Avatar size={32} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label="Account"
        bodyClassName="mn-sheet"
        header={
          <div className="as-head">
            <span className="as-me-av">
              <AvatarFace photo={account?.photo} initial={initial} />
            </span>
            <div className="as-head-text">
              <div className="as-head-title">{account?.name || 'Signed in'}</div>
              <div className="as-head-sub">{account?.email}</div>
            </div>
          </div>
        }
        footer={<div className="as-me-foot">{foot}</div>}
      >
        <div className="as-me-meta">
          {metas.map((m, i) => (
            <span key={i}>{m.text}</span>
          ))}
        </div>
        <MenuRows rows={rows} onPick={pick} />
      </Sheet>
    </>
  )
}
