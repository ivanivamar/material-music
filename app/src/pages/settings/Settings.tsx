/**
 * Settings (Material 3 Expressive redesign, SettingsMaterial.dc.html). Everything saves the moment
 * it changes; there is no Save button.
 *
 * Desktop: a 200px sticky column ("Settings" + "Saved automatically" + pill subnav) beside a 740px
 * column of rounded 28px section cards.
 * Phone: a sticky header (← Settings · Saved), coral section labels, segmented controls and sliders
 * full width under their row.
 *
 * Only rows that do something real are here. Unbuilt features (Opus 320, normalisation, crossfade,
 * output device, release notifications, lyric romaji / translation, lock-screen toggle, "Stop the DJ
 * when I play an album") remain hidden.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chip, IconButton, Button, LinearProgress, Segmented, StorageBar, TextField, Toggle, ValueSlider, useToast, type SegOption } from '../../components/ui'
import { Icon } from '../../design/icons'
import type { MotionSetting, ParticleSetting } from '../../design/tokens'
import { DJ_TYPES, TYPE_LABEL, type DjType } from '../../dj/engine'
import { localFolder, useLocalFolder } from '../../lib/localFolder'
import { APP_VERSION, appUpdate, usePwa } from '../../lib/pwa'
import { isNative } from '../../native/bridge'
import { nativeUpdates, useNativeUpdates } from '../../native/updates'
import { back, go, href } from '../../shell/routes'
import { checkDrive } from '../../state/checkDrive'
import { djLearned, djStore, useDj } from '../../state/dj'
import { downloadsStore, libraryBytes, useDownloads, type DownloadQuality } from '../../state/downloads'
import { issueCount, ISSUE_KINDS, useHealth } from '../../state/health'
import { useLibrary, type Catalogue } from '../../state/library'
import { useMotion, useSystemReducedMotion } from '../../state/motion'
import { nextSweepAt, releasesStore, sweepTargets, useReleases } from '../../state/releases'
import { sessionStore, useSession } from '../../state/session'
import { settingsStore, useSettings, type StreamQuality } from '../../state/settings'
import { useIsPhone } from '../../state/viewport'
import { concertsStore, RADII, useConcerts, type Radius } from '../../state/concerts'
import { buildShows, cityLabel, lastUpdated, nearbyShows, radiusHint, updatedLabel } from '../../state/concertViews'
import { CitySearch } from '../concerts/parts'
import { fmtBytes, fmtN } from '../../state/views'
import { syncStore, useSync } from '../../sync/playerSync'
import './settings.css'

/* ── Page ───────────────────────────────────────────── */

interface Ctx {
  phone: boolean
  /** the inline confirmation that's open (one at a time) */
  conf: string | null
  setConf: (id: string | null) => void
}
const SettingsCtx = createContext<Ctx>({ phone: false, conf: null, setConf: () => {} })

interface SectionDef {
  id: string
  label: string
  render: () => ReactNode
}

export function Settings() {
  const phone = useIsPhone()
  const motion = useMotion()
  const [conf, setConf] = useState<string | null>(null)
  const ctx = useMemo(() => ({ phone, conf, setConf }), [phone, conf])

  const sections: SectionDef[] = [
    { id: 'account', label: 'Account', render: () => <AccountSection /> },
    { id: 'library', label: 'Library', render: () => <LibrarySection /> },
    { id: 'playback', label: 'Playback', render: () => <PlaybackSection /> },
    { id: 'devices', label: 'Devices', render: () => <DevicesSection /> },
    ...(isNative ? [{ id: 'downloads', label: 'Downloads', render: () => <DownloadsSection /> }] : []),
    { id: 'new', label: 'New releases', render: () => <ReleasesSection /> },
    { id: 'concerts', label: 'Concerts', render: () => <ConcertsSection /> },
    { id: 'dj', label: 'DJ', render: () => <DjSection /> },
    { id: 'atmos', label: 'Atmosphere', render: () => <AtmosphereSection /> },
    { id: 'about', label: 'About', render: () => <AboutSection /> },
  ]

  /* desktop: the section list follows the scroll position of the main column */
  const els = useRef(new Map<string, HTMLElement>())
  const [active, setActive] = useState('account')
  const ids = sections.map((s) => s.id).join()
  useEffect(() => {
    if (phone) return
    const main = document.getElementById('main')
    if (!main) return
    const order = ids.split(',')
    const onScroll = () => {
      const top = main.getBoundingClientRect().top
      let cur = order[0]
      for (const id of order) {
        const el = els.current.get(id)
        if (el && el.getBoundingClientRect().top - top <= 120) cur = id
      }
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) cur = order[order.length - 1]
      setActive(cur)
    }
    onScroll()
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [phone, ids])
  const jump = (id: string) => {
    const main = document.getElementById('main')
    const el = els.current.get(id)
    if (!main || !el) return
    const y = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 40
    main.scrollTo({ top: y, behavior: motion ? 'smooth' : 'auto' })
    setActive(id)
  }

  // #/settings?city (Artist page → On tour → Set city): straight to Concerts → Home city
  useEffect(() => {
    if (!/[?&]city\b/.test(window.location.hash)) return
    const t = window.setTimeout(() => jump('concerts'), 60)
    return () => window.clearTimeout(t)
  }, [])

  // Esc closes an open confirmation
  useEffect(() => {
    if (!conf) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setConf(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conf])

  const body = sections.map((s) => (
    <section
      key={s.id}
      className="st-sec"
      aria-label={s.label}
      ref={(el) => {
        if (el) els.current.set(s.id, el)
        else els.current.delete(s.id)
      }}
    >
      {s.render()}
    </section>
  ))

  return (
    <SettingsCtx.Provider value={ctx}>
      {phone ? (
        <div className="st st-phone">
          <header className="st-phead">
            <IconButton icon="back" label="Back" size="lg" variant="strong" onClick={() => back(href('home'))} />
            <h1 className="st-ptitle">Settings</h1>
            <span className="st-saved">Saved</span>
          </header>
          <div className="st-secs">{body}</div>
        </div>
      ) : (
        <div className="st">
          <aside className="st-side">
            <div className="st-head">
              <h1 className="st-title">Settings</h1>
              <div className="st-meta">Saved automatically</div>
            </div>
            <nav className="st-subnav" aria-label="Settings sections">
              {sections.map((s) => (
                <button key={s.id} type="button" className={`st-sublink ${active === s.id ? 'is-on' : ''}`} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>
          <div className="st-secs">{body}</div>
        </div>
      )}
    </SettingsCtx.Provider>
  )
}

/* ── Building blocks ────────────────────────────────── */

function SectionGroup({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  const { phone } = useContext(SettingsCtx)
  return (
    <>
      {phone ? (
        <div className="st-plabel">{label}</div>
      ) : (
        <div className="st-shead">
          <h2 className="st-slabel">{label}</h2>
          {note && <span className="st-snote">{note}</span>}
        </div>
      )}
      <div className="st-card">
        <div className="st-card-in">{children}</div>
      </div>
    </>
  )
}

interface RowProps {
  label: ReactNode
  hint?: ReactNode
  /** coral status dot before the hint */
  dot?: boolean
  muted?: boolean
  tile?: ReactNode
  round?: boolean
  /** right-hand control */
  control?: ReactNode
  /** segmented control / slider: right on desktop, full width under the row on the phone */
  wide?: ReactNode
  /** full width under the row (storage bar, progress line, chips, confirmation…) */
  below?: ReactNode
}

function Row({ label, hint, dot, muted, tile, round, control, wide, below }: RowProps) {
  const { phone } = useContext(SettingsCtx)
  return (
    <div className="st-row">
      <div className="st-main">
        {tile != null && <span className={`st-tile ${round ? 'is-round' : ''}`}>{tile}</span>}
        <div className="st-text">
          <div className={`st-label ${muted ? 'is-muted' : ''}`}>{label}</div>
          {hint && (
            <div className="st-hint">
              {dot && <span className="st-dot" aria-hidden />}
              <span>{hint}</span>
            </div>
          )}
        </div>
      </div>
      {(control || (wide && !phone)) && (
        <div className="st-ctl">
          {!phone && wide}
          {control}
        </div>
      )}
      {phone && wide && <div className="st-below st-wide">{wide}</div>}
      {below && <div className="st-below">{below}</div>}
    </div>
  )
}

function Act({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Button variant={danger ? 'danger-outlined' : 'outlined'} className="st-act" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}

function ValueBtn({ children, onClick, open, label }: { children: ReactNode; onClick?: () => void; open?: boolean; label?: string }) {
  if (!onClick) return <span className="st-value is-static">{children}</span>
  return (
    <button type="button" className={`st-value ${open ? 'is-open' : ''}`} aria-expanded={open} aria-label={label} onClick={onClick}>
      <span className="st-value-text">{children}</span>
      <Icon name="chevR" />
    </button>
  )
}




function useConfirm(id: string) {
  const { conf, setConf } = useContext(SettingsCtx)
  return {
    open: conf === id,
    ask: () => setConf(id),
    box: (text: string, btn: string, run: () => void) =>
      conf === id ? (
        <div className="st-conf" role="alertdialog" aria-label={text}>
          <span className="st-conf-ic">
            <Icon name="warning" filled />
          </span>
          <span className="st-conf-text">{text}</span>
          <span className="st-conf-btns">
            <Button variant="plain" onClick={() => setConf(null)}>
              Cancel
            </Button>
            <Button
              variant="error"
              autoFocus
              onClick={() => {
                setConf(null)
                run()
              }}
            >
              {btn}
            </Button>
          </span>
        </div>
      ) : null,
  }
}

const initials = (s: string) =>
  s
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** "21:40" today, else "14 Oct 21:40" */
function stamp(ms: number): string {
  const d = new Date(ms)
  return d.toDateString() === new Date().toDateString() ? clock(d) : `${d.getDate()} ${MON[d.getMonth()]} ${clock(d)}`
}

/* ── Account ────────────────────────────────────────── */

function AccountSection() {
  const { account, status } = useSession()
  const toast = useToast()
  const c = useConfirm('signout')
  const expired = status === 'expired'
  return (
    <SectionGroup label="Account" note="Google">
      <Row
        tile={account?.photo ? <img src={account.photo} alt="" referrerPolicy="no-referrer" /> : initials(account?.name || account?.email || '?')}
        round
        label={account?.email ?? 'Signed in'}
        hint={expired ? 'Google · session expired' : `Google · signed in${account?.name ? ` as ${account.name}` : ''}`}
        dot={!expired}
        control={
          <>
            {expired && <Act onClick={() => void sessionStore.signIn()}>Sign in again</Act>}
            <Act danger onClick={c.ask}>
              Sign out
            </Act>
          </>
        }
        below={c.box('Sign out? Material Music forgets this library on this device until you sign in again.', 'Sign out', () => {
          sessionStore.signOut()
          toast.show({ icon: 'check', text: 'Signed out.' })
        })}
      />
      <Row
        tile={<Icon name="account" size={22} />}
        label="Switch account"
        hint="Sign in with another Google account"
        control={<Act onClick={() => void sessionStore.signIn({ switchAccount: true })}>Switch</Act>}
      />
    </SectionGroup>
  )
}

/* ── Library ────────────────────────────────────────── */

function libraryCounts(c: Catalogue) {
  let flac = 0
  for (const t of Object.values(c.tracks)) flac += t.flac?.size ?? 0
  return { albums: Object.keys(c.albums).length, tracks: Object.keys(c.tracks).length, flac }
}

function LibrarySection() {
  const lib = useLibrary()
  const local = useLocalFolder()
  const s = useSettings()
  const toast = useToast()
  const { phone } = useContext(SettingsCtx)
  const counts = useMemo(() => (lib.data ? libraryCounts(lib.data) : null), [lib.data])
  const expired = useSession().status === 'expired'
  const desktopFolder = !isNative && localFolder.supported
  const linked = local.status !== 'none' && local.status !== 'unsupported' && local.status !== 'loading'
  const health = useHealth()
  const issues = health ? ISSUE_KINDS.reduce((n, k) => n + issueCount(health)[k], 0) : null

  const link = async () => {
    if (!lib.data) return
    try {
      const r = await localFolder.link(lib.data)
      if (r) toast.show({ icon: 'check', text: `FLAC now plays from “${r.name}”.`, meta: `${r.found} of ${r.probed} sample tracks found` })
    } catch (e) {
      toast.show({ icon: 'alert', tone: 'danger', text: (e as Error).message, meta: 'Local folder', duration: 8000 })
    }
  }

  const albums = counts ? `${fmtN(counts.albums)} albums` : ''
  const folderState = local.status === 'prompt' ? 'Asks for access on play' : local.status === 'denied' ? 'Access denied' : 'Connected'

  return (
    <SectionGroup label="Library" note={desktopFolder && linked ? 'Local folder' : 'Google Drive'}>
      {desktopFolder && linked ? (
        <>
          <Row
            tile={<Icon name="folderClosed" size={22} />}
            label={local.name}
            hint={`${folderState} · ${albums}${counts ? ` · ${fmtBytes(counts.flac)} FLAC` : ''}`}
            dot={local.status === 'granted'}
            control={
              <>
                {!phone && (
                  <button type="button" className="st-link" onClick={() => void localFolder.unlink()}>
                    Stop using
                  </button>
                )}
                <Act onClick={() => void link()}>Change folder</Act>
              </>
            }
          />
          <Row
            tile={<Icon name="cloud" size={22} />}
            label="Stream from Drive when the folder is missing"
            hint={s.driveFallback ? 'Keeps playing if the disk is unplugged' : 'Tracks not in the folder won’t play'}
            control={<Toggle label="Stream from Drive when the folder is missing" checked={s.driveFallback} onChange={(v) => settingsStore.set('driveFallback', v)} />}
          />
        </>
      ) : (
        <Row
          tile={<Icon name="cloud" size={22} />}
          label="Google Drive"
          hint={`My Drive / Pelagic${counts ? ` · ${fmtN(counts.tracks)} tracks` : ''}`}
          dot={!expired}
          control={desktopFolder ? <Act onClick={() => void link()}>Use a local folder</Act> : undefined}
        />
      )}
      <Row
        tile={<Icon name="sync" size={22} />}
        label="Check Drive for changes"
        hint={lib.refreshing ? 'Checking Drive…' : lib.syncedAt ? `Last checked ${stamp(lib.syncedAt)}` : 'Not checked yet'}
        control={
          <Act disabled={lib.refreshing || expired} onClick={checkDrive}>
            {lib.refreshing ? 'Checking…' : 'Check now'}
          </Act>
        }
        below={lib.refreshing ? <LinearProgress className="pg-anim" /> : undefined}
      />
      <Row
        tile={<Icon name="health" size={22} />}
        label="Library health"
        hint={issues === null ? 'Looking…' : issues ? `${fmtN(issues)} to fix · covers, lyrics, genre, year, duplicates, bitrate` : 'All clear'}
        dot={issues === 0}
        control={<Act onClick={() => go(href('health'))}>Open</Act>}
      />
      <Row
        tile={<Icon name="lyrics" size={22} />}
        label="Look up lyrics for new uploads"
        hint={s.fetchLyrics ? 'Songs without lyrics get them from LRCLIB after upload' : 'Only lyrics from the file tags'}
        control={<Toggle label="Look up lyrics for new uploads" checked={s.fetchLyrics} onChange={(v) => settingsStore.set('fetchLyrics', v)} />}
      />
    </SectionGroup>
  )
}

/* ── Playback ───────────────────────────────────────── */

const STREAM: SegOption<StreamQuality>[] = [
  { value: 'opus', label: 'Opus 160' },
  { value: 'original', label: 'Original' },
]

function PlaybackSection() {
  const s = useSettings()
  const local = useLocalFolder()
  const linked = !isNative && local.status !== 'none' && local.status !== 'unsupported' && local.status !== 'loading'
  const hint = s.streamQuality === 'opus' ? '~1.2 MB / min · FLAC when a song has no Opus copy' : 'FLAC as stored · ~6–30 MB / min'
  return (
    <SectionGroup label="Playback" note="From the next song">
      <Row
        tile={<Icon name="highQuality" size={22} />}
        label="Streaming quality"
        hint={linked ? 'From Drive · the local folder always plays FLAC' : hint}
        wide={<Segmented label="Streaming quality" value={s.streamQuality} options={STREAM} onChange={(v) => settingsStore.set('streamQuality', v)} />}
      />
    </SectionGroup>
  )
}

/* ── Devices (step 37: player sync) ─────────────────── */

function DevicesSection() {
  const s = useSettings()
  const sync = useSync()
  const [name, setName] = useState(sync.me.name)
  const available = syncStore.available()
  const online = sync.devices.filter((d) => d.online).length
  const status = !available
    ? 'Not set up yet: the Firebase web app keys are missing (config.ts)'
    : !s.syncPlayback
      ? 'Off · this device keeps its own queue'
      : sync.status === 'connecting'
        ? 'Connecting…'
        : sync.status === 'error'
          ? `Problem: ${sync.error ?? 'unknown'}`
          : online
            ? `On · ${online} other ${online === 1 ? 'device' : 'devices'} online`
            : 'On · no other device online right now'
  return (
    <SectionGroup label="Devices" note="Firebase">
      <Row
        tile={<Icon name="devices" size={22} />}
        label="Sync playback between devices"
        hint={status}
        dot={available && s.syncPlayback && sync.status === 'on' && online > 0}
        muted={!available}
        control={<Toggle label="Sync playback between devices" checked={available && s.syncPlayback} disabled={!available} onChange={(v) => settingsStore.set('syncPlayback', v)} />}
      />
      <Row
        tile={<Icon name={isNative ? 'smartphone' : 'computer'} size={22} />}
        label="This device’s name"
        hint="Shown on your other devices (Play on …)"
        below={
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            inputProps={{ maxLength: 40, onBlur: () => syncStore.rename(name), onKeyDown: (e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur() }}
          />
        }
      />
    </SectionGroup>
  )
}

/* ── Downloads (Android) ────────────────────────────── */

const DQ: SegOption<DownloadQuality>[] = [
  { value: 'opus', label: 'Opus 160' },
  { value: 'flac', label: 'Original FLAC' },
]

function DownloadsSection() {
  const dl = useDownloads()
  const { data } = useLibrary()
  const toast = useToast()
  const c = useConfirm('clear')
  const n = dl.native
  const used = n?.used ?? 0
  const whole = data ? libraryBytes(data, { quality: dl.prefs.quality, albumQuality: {} }) : 0
  const hasPins = dl.prefs.pins.length > 0

  const setQuality = (q: DownloadQuality) => {
    const before = dl.prefs.quality
    if (q === before) return
    downloadsStore.setQuality(q)
    if (hasPins)
      toast.show({
        icon: 'download',
        text: q === 'flac' ? 'Downloads switch to the original FLAC.' : 'Downloads switch to Opus 160.',
        meta: 'The other copies go once these are stored',
        action: { label: 'Undo', onClick: () => downloadsStore.setQuality(before) },
      })
  }
  const clear = () => {
    const before = dl.prefs
    downloadsStore.removeAll()
    toast.show({ icon: 'x', mutedIcon: true, text: 'Removed all downloads from this phone.', meta: used ? `${fmtBytes(used)} freed` : undefined, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }

  return (
    <SectionGroup label="Downloads" note={used ? `${fmtBytes(used)} stored` : 'Nothing stored'}>
      <Row
        tile={<Icon name="cloudDownload" size={22} />}
        label="Download quality"
        hint={whole ? `Whole library ≈ ${fmtBytes(whole)}` : undefined}
        wide={<Segmented label="Download quality" value={dl.prefs.quality} options={DQ} onChange={setQuality} />}
      />
      <Row
        tile={<Icon name="wifi" size={22} />}
        label="Download on Wi-Fi only"
        control={<Toggle label="Download on Wi-Fi only" checked={dl.prefs.wifiOnly} onChange={(v) => downloadsStore.setWifiOnly(v)} />}
      />
      <Row
        tile={<Icon name="sdStorage" size={22} />}
        label="Storage"
        control={
          <Act danger disabled={!hasPins && !used} onClick={c.ask}>
            Clear downloads
          </Act>
        }
        below={
          <>
            {n && (
              <div className="st-store">
                <StorageBar used={used} free={n.free} total={n.total} />
                <div className="st-store-line">
                  <span>
                    <i className="st-sdot st-sdot-me" />
                    Material Music {used ? fmtBytes(used) : '0 MB'}
                  </span>
                  <span>{fmtBytes(n.free)} free</span>
                </div>
              </div>
            )}
            {c.box(`Remove ${used ? fmtBytes(used) : 'all'} of downloads from this phone? Your library stays on Drive.`, 'Remove', clear)}
          </>
        }
      />
      <Row
        tile={<Icon name="folder" size={22} />}
        label="Downloaded music"
        control={<ValueBtn onClick={() => go(href('downloads'))}>Manage</ValueBtn>}
      />
    </SectionGroup>
  )
}

/* ── New Releases ───────────────────────────────────── */

const SWEEP: SegOption<string>[] = [
  { value: '6', label: '06:00' },
  { value: '12', label: '12:00' },
  { value: '22', label: '22:00' },
]

function ReleasesSection() {
  const s = useSettings()
  const rs = useReleases()
  const { data } = useLibrary()
  const followed = useMemo(() => (data ? sweepTargets(data, rs.doc) : []), [data, rs.doc])
  const muted = followed.filter((t) => rs.doc.muted[t.artistId]?.[0]).length
  const next = new Date(nextSweepAt())
  const nextLabel = rs.sweeping ? 'Sweeping now' : `Next · ${next.getDate()} ${MON[next.getMonth()]} ${clock(next)}`
  return (
    <SectionGroup label="New releases" note="MusicBrainz">
      <Row
        tile={<Icon name="radar" size={22} />}
        label="Daily sonar sweep"
        hint={nextLabel}
        wide={<Segmented label="Daily sonar sweep" value={String(s.sweepHour)} options={SWEEP} onChange={(v) => settingsStore.set('sweepHour', Number(v))} />}
      />
      <Row
        tile={<Icon name="album" size={22} />}
        label="Hide reissues and deluxe editions"
        control={<Toggle label="Hide reissues and deluxe editions" checked={rs.doc.hideReissues[0]} onChange={(v) => releasesStore.setHideReissues(v)} />}
      />
      <Row
        tile={<Icon name="artist" size={22} />}
        label="Followed artists"
        control={<ValueBtn onClick={() => go(`${href('new')}?artists`)}>{`${fmtN(followed.length)} · ${muted ? `${fmtN(muted)} muted` : 'none muted'}`}</ValueBtn>}
      />
    </SectionGroup>
  )
}

/* ── Concerts ───────────────────────────────────────── */

const RADIUS_OPTS: SegOption<string>[] = RADII.map((r) => ({ value: String(r), label: `${r} km` }))

function ConcertsSection() {
  const st = useConcerts()
  const rs = useReleases()
  const { data } = useLibrary()
  const toast = useToast()
  const home = st.doc.home[0]
  const radius = st.doc.radius[0]
  const [editing, setEditing] = useState(() => /[?&]city\b/.test(window.location.hash))
  const upcoming = useMemo(() => (data && home ? nearbyShows(buildShows(data, st, st.doc, rs.doc, st.doc.seenAt[0]), radius).length : 0), [data, st, rs.doc, home, radius])
  const updated = lastUpdated(st)
  return (
    <>
      <SectionGroup label="Concerts" note="Ticketmaster · checked daily">
        <Row
          tile={<Icon name="city" size={22} />}
          label="Home city"
          hint="Used for Concerts near you. No GPS."
          control={
            <ValueBtn open={editing} label="Change home city" onClick={() => setEditing((v) => !v)}>
              {home ? cityLabel(home) : 'Not set'}
            </ValueBtn>
          }
          below={
            editing ? (
              <div className="st-city">
                <CitySearch
                  value={home}
                  autoFocus
                  big
                  surface="high"
                  onPick={(c) => {
                    concertsStore.setHome(c)
                    setEditing(false)
                    toast.show({ icon: 'concerts', text: `Showing concerts near ${c.name} · ${radius} km` })
                  }}
                />
              </div>
            ) : undefined
          }
        />
        <Row label="Radius" hint={radiusHint(radius)} wide={<Segmented label="Radius" value={String(radius)} options={RADIUS_OPTS} onChange={(v) => concertsStore.setRadius(Number(v) as Radius)} />} />
        <Row
          label="Concerts near you"
          hint={st.sweeping ? `Checking now · ${st.sweeping.done} of ${st.sweeping.total} artists` : updated ? `Last checked ${updatedLabel(updated)}` : home ? 'Not checked yet' : 'Set a home city first'}
          control={<ValueBtn onClick={() => go(href('concerts'))}>{home ? `${upcoming} upcoming` : 'Open'}</ValueBtn>}
        />
      </SectionGroup>
      <div className="st-foot-note">Ticket info from Ticketmaster.</div>
    </>
  )
}

/* ── DJ ─────────────────────────────────────────────── */

function DjSection() {
  const { doc } = useDj()
  const toast = useToast()
  const c = useConfirm('djReset')
  const [typesOpen, setTypesOpen] = useState(false)
  const p = doc.prefs
  const learned = djLearned()
  const has = learned.more.length + learned.less.length > 0
  const learnedHint = has
    ? [learned.more.length ? `More · ${learned.more.join(', ')}` : '', learned.less.length ? `Less · ${learned.less.join(', ')}` : ''].filter(Boolean).join(' · ')
    : 'Nothing yet'
  const toggleType = (t: DjType) => {
    const on = p.types.includes(t)
    if (on && p.types.length === 1) return
    djStore.setPref('types', on ? p.types.filter((x) => x !== t) : DJ_TYPES.filter((x) => x === t || p.types.includes(x)))
  }
  const typesValue = p.types.length === DJ_TYPES.length ? 'All four' : p.types.map((t) => TYPE_LABEL[t]).join(', ')
  return (
    <SectionGroup label="DJ" note="Sessions and voice">
      <Row
        tile={<Icon name="recordVoiceOver" size={22} />}
        label="Voice intros"
        hint={p.voice ? 'Male English voice before each session' : 'Intros appear as text for 5 seconds'}
        control={<Toggle label="Voice intros" checked={p.voice} onChange={(v) => djStore.setPref('voice', v)} />}
      />
      <Row
        tile={<Icon name="volume" size={22} />}
        label="Voice volume"
        hint="Relative to the music"
        wide={
          <ValueSlider
            className="st-slider"
            label="Voice volume"
            value={p.voice ? p.voiceVolume : 0}
            shown={p.voice ? `${Math.round(p.voiceVolume * 100)}%` : 'Off'}
            valueText={p.voice ? `${Math.round(p.voiceVolume * 100)}%` : 'Off'}
            disabled={!p.voice}
            step={0.05}
            onChange={(v) => p.voice && djStore.setPref('voiceVolume', Math.round(v * 100) / 100)}
          />
        }
      />
      <Row
        tile={<Icon name="tune" size={22} />}
        label="Session types"
        hint="What Start DJ mixes"
        control={
          <ValueBtn open={typesOpen} label={`Session types: ${typesValue}`} onClick={() => setTypesOpen((o) => !o)}>
            {typesValue}
          </ValueBtn>
        }
        below={
          typesOpen ? (
            <div className="st-chips" role="group" aria-label="Session types">
              {DJ_TYPES.map((t) => {
                const on = p.types.includes(t)
                return (
                  <Chip key={t} selected={on} disabled={on && p.types.length === 1} onClick={() => toggleType(t)}>
                    {TYPE_LABEL[t]}
                  </Chip>
                )
              })}
            </div>
          ) : undefined
        }
      />
      {isNative && (
        <Row
          tile={<Icon name="cloudDownload" size={22} />}
          label="Only downloaded songs on mobile data"
          hint="Offline always uses downloaded songs"
          control={<Toggle label="Only downloaded songs on mobile data" checked={p.dataSaver} onChange={(v) => djStore.setPref('dataSaver', v)} />}
        />
      )}
      <Row
        tile={<Icon name="psychology" size={22} />}
        label="What the DJ has learned"
        hint={learnedHint}
        control={
          <Act danger disabled={!has} onClick={c.ask}>
            Reset
          </Act>
        }
        below={c.box('Forget what the DJ has learned? Sessions go back to an even mix.', 'Reset', () => {
          djStore.resetLearned()
          toast.show({ icon: 'dj', tone: 'dj', text: 'The DJ starts learning again from now.' })
        })}
      />
    </SectionGroup>
  )
}

/* ── Atmosphere ─────────────────────────────────────── */

const MOTION: SegOption<MotionSetting>[] = [
  { value: 'system', label: 'Follow system' },
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
]
const PARTICLES: SegOption<ParticleSetting>[] = [
  { value: 'off', label: 'Off' },
  { value: 'few', label: 'Few' },
  { value: 'default', label: 'Default' },
  { value: 'more', label: 'More' },
]

function AtmosphereSection() {
  const s = useSettings()
  const sysReduced = useSystemReducedMotion()
  return (
    <SectionGroup label="Atmosphere" note="This page changes live">
      <Row
        tile={<Icon name="spark" size={22} />}
        label="Motion"
        hint={s.motion === 'system' ? (sysReduced ? 'System asks for reduced motion' : 'System allows motion') : undefined}
        wide={<Segmented label="Motion" value={s.motion} options={MOTION} onChange={(v) => settingsStore.set('motion', v)} />}
      />
      <Row
        tile={<Icon name="palette" size={22} />}
        label="Drifting particles"
        hint="Marine snow · fades out with reduced motion"
        wide={<Segmented label="Drifting particles" value={s.particles} options={PARTICLES} onChange={(v) => settingsStore.set('particles', v)} />}
      />
      <Row
        tile={<Icon name="grid" size={22} />}
        label="Stone, grain and contour texture"
        control={<Toggle label="Stone, grain and contour texture" checked={s.texture} onChange={(v) => settingsStore.set('texture', v)} />}
      />
    </SectionGroup>
  )
}

/* ── About ──────────────────────────────────────────── */

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['/  or  Ctrl K', 'Search the library'],
  ['Esc', 'Close the player or the queue'],
  ['Alt ↑ / ↓', 'Move a song in the queue'],
  ['Delete', 'Remove a song from the queue'],
]

function AboutSection() {
  const { phone } = useContext(SettingsCtx)
  const pwa = usePwa()
  const apk = useNativeUpdates()
  const [keys, setKeys] = useState(false)
  const version = isNative ? `${apk.current?.versionName ?? 'Android'} · ${APP_VERSION}` : `${APP_VERSION}${pwa.installed ? ' · App' : ''}`
  return (
    <SectionGroup label="About">
      <Row
        tile={<Icon name="info" size={22} />}
        label="Version"
        hint={pwa.updateReady ? 'A new version is ready' : apk.available ? `Material Music ${apk.available.versionName} is available` : undefined}
        dot={pwa.updateReady || !!apk.available}
        control={
          pwa.updateReady ? (
            <Act onClick={() => appUpdate.apply()}>Reload</Act>
          ) : apk.available ? (
            <Act onClick={() => nativeUpdates.install()}>Install</Act>
          ) : (
            <ValueBtn>{version}</ValueBtn>
          )
        }
      />
      {pwa.canInstall && !pwa.installed && !isNative && (
        <Row
          tile={<Icon name="install" size={22} />}
          label="Install Material Music as an app"
          hint="Opens in its own window"
          control={<Act onClick={() => void appUpdate.install()}>Install</Act>}
        />
      )}
      {!phone && (
        <Row
          tile={<Icon name="keyboard" size={22} />}
          label="Keyboard shortcuts"
          control={
            <ValueBtn open={keys} label="Keyboard shortcuts" onClick={() => setKeys((k) => !k)}>
              {keys ? 'Hide' : 'Show'}
            </ValueBtn>
          }
          below={
            keys ? (
              <dl className="st-keys">
                {SHORTCUTS.map(([k, what]) => (
                  <div key={k} className="st-key">
                    <dt>{k}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            ) : undefined
          }
        />
      )}
      <Row tile={<Icon name="cloud" size={22} />} label="Catalogue data" hint="MusicBrainz · Cover Art Archive · Deezer artist photos" />
    </SectionGroup>
  )
}
