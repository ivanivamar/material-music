/**
 * Settings (handoff `Settings.dc.html`, DJ section from the DJ handoff). Everything saves the moment
 * it changes; there is no Save button.
 *
 * Desktop: a 200px sticky column (SAVED AUTOMATICALLY · Settings · section list with a glowing dot on
 * the section in view) beside a 720px column of sections. Each section: 22px title + mono note over
 * a 1px rule, then 68px rows (label + mono hint left, control right).
 * Phone: a sticky header (‹ Settings · SAVED), mono section labels, segmented controls and sliders
 * full width under their row.
 *
 * Only rows that do something real are here. Not built yet (so not shown): Opus 320, gapless /
 * normalisation / crossfade / output device, release notifications, lyric romaji / translation
 * (the lyric files carry neither), lock-screen controls (always on), and "Stop the DJ when I play
 * an album" (it always stops).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Segmented, Slider, Toggle, useToast, type SegOption } from '../../components/ui'
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
import { useLibrary, type Catalogue } from '../../state/library'
import { useMotion, useSystemReducedMotion } from '../../state/motion'
import { nextSweepAt, releasesStore, sweepTargets, useReleases } from '../../state/releases'
import { sessionStore, useSession } from '../../state/session'
import { settingsStore, useSettings, type StreamQuality } from '../../state/settings'
import { useIsPhone } from '../../state/viewport'
import { fmtBytes, fmtN } from '../../state/views'
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
    ...(isNative ? [{ id: 'downloads', label: 'Downloads', render: () => <DownloadsSection /> }] : []),
    { id: 'new', label: 'New Releases', render: () => <ReleasesSection /> },
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
            <button type="button" className="st-back" aria-label="Back" onClick={() => back(href('home'))}>
              <Icon name="chevL" />
            </button>
            <h1 className="st-ptitle">Settings</h1>
            <span className="st-saved">SAVED</span>
          </header>
          <div className="st-secs">{body}</div>
        </div>
      ) : (
        <div className="st">
          <aside className="st-side">
            <div className="st-head">
              <div className="st-meta">SAVED AUTOMATICALLY</div>
              <h1 className="st-title">Settings</h1>
            </div>
            <nav className="st-subnav" aria-label="Settings sections">
              {sections.map((s) => (
                <button key={s.id} type="button" className={`st-sublink ${active === s.id ? 'is-on' : ''}`} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
                  <span className="st-subdot" aria-hidden />
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

function SectionHead({ label, note }: { label: string; note?: string }) {
  const { phone } = useContext(SettingsCtx)
  if (phone) return <div className="st-plabel">{label.toUpperCase()}</div>
  return (
    <div className="st-shead">
      <h2 className="st-slabel">{label}</h2>
      {note && <span className="st-snote">{note}</span>}
    </div>
  )
}

interface RowProps {
  label: ReactNode
  hint?: ReactNode
  /** glowing status dot before the hint */
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
    <button type="button" className={`st-act ${danger ? 'is-danger' : ''}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
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

function Tog({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void }) {
  return <Segmented label={label} value={value} options={options} onChange={onChange} />
}

function SliderCtl({ label, value, shown, onChange, disabled, step }: { label: string; value: number; shown: string; onChange: (v: number) => void; disabled?: boolean; step?: number }) {
  return (
    <div className={`st-slider ${disabled ? 'is-off' : ''}`}>
      <Slider label={label} value={value} knob={12} height={24} step={step} onChange={onChange} valueText={() => shown} />
      <span className="st-sval">{shown}</span>
    </div>
  )
}

/** Inline "are you sure" under a row (handoff: red outline, Cancel · red button). */
function useConfirm(id: string) {
  const { conf, setConf } = useContext(SettingsCtx)
  return {
    open: conf === id,
    ask: () => setConf(id),
    box: (text: string, btn: string, run: () => void) =>
      conf === id ? (
        <div className="st-conf" role="alertdialog" aria-label={text}>
          <span className="st-conf-ic">
            <Icon name="alert" />
          </span>
          <span className="st-conf-text">{text}</span>
          <span className="st-conf-btns">
            <button type="button" className="st-conf-cancel" onClick={() => setConf(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="st-conf-go"
              autoFocus
              onClick={() => {
                setConf(null)
                run()
              }}
            >
              {btn}
            </button>
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

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** "21:40" today, else "14 OCT 21:40" */
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
    <>
      <SectionHead label="Account" note="GOOGLE" />
      <Row
        tile={account?.photo ? <img src={account.photo} alt="" referrerPolicy="no-referrer" /> : initials(account?.name || account?.email || '?')}
        round
        label={account?.email ?? 'Signed in'}
        hint={expired ? 'GOOGLE · SESSION EXPIRED' : `GOOGLE · SIGNED IN${account?.name ? ` AS ${account.name.toUpperCase()}` : ''}`}
        dot={!expired}
        control={
          <>
            {expired && <Act onClick={() => void sessionStore.signIn()}>Sign in again</Act>}
            <Act danger onClick={c.ask}>
              Sign out
            </Act>
          </>
        }
        below={c.box('Sign out? Pelagic forgets this library on this device until you sign in again.', 'Sign out', () => {
          sessionStore.signOut()
          toast.show({ icon: 'check', text: 'Signed out.' })
        })}
      />
      <Row label="Switch account" hint="SIGN IN WITH ANOTHER GOOGLE ACCOUNT" control={<Act onClick={() => void sessionStore.signIn({ switchAccount: true })}>Switch</Act>} />
    </>
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

  const link = async () => {
    if (!lib.data) return
    try {
      const r = await localFolder.link(lib.data)
      if (r) toast.show({ icon: 'check', text: `FLAC now plays from “${r.name}”.`, meta: `${r.found} OF ${r.probed} SAMPLE TRACKS FOUND` })
    } catch (e) {
      toast.show({ icon: 'alert', tone: 'danger', text: (e as Error).message, meta: 'LOCAL FOLDER', duration: 8000 })
    }
  }

  const albums = counts ? `${fmtN(counts.albums)} ALBUMS` : ''
  const folderState = local.status === 'prompt' ? 'ASKS FOR ACCESS ON PLAY' : local.status === 'denied' ? 'ACCESS DENIED' : 'CONNECTED'

  return (
    <>
      <SectionHead label="Library" note={desktopFolder && linked ? 'LOCAL FOLDER' : 'GOOGLE DRIVE'} />
      {desktopFolder && linked ? (
        <>
          <Row
            tile={<Icon name="library" size={20} />}
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
            label="Stream from Drive when the folder is missing"
            hint={s.driveFallback ? 'KEEPS PLAYING IF THE DISK IS UNPLUGGED' : 'TRACKS NOT IN THE FOLDER WON’T PLAY'}
            control={<Tog label="Stream from Drive when the folder is missing" checked={s.driveFallback} onChange={(v) => settingsStore.set('driveFallback', v)} />}
          />
        </>
      ) : (
        <Row
          tile={<Icon name="cloud" size={20} />}
          label="Google Drive"
          hint={`MY DRIVE / PELAGIC${counts ? ` · ${fmtN(counts.tracks)} TRACKS` : ''}`}
          dot={!expired}
          control={desktopFolder ? <Act onClick={() => void link()}>Use a local folder</Act> : undefined}
        />
      )}
      <Row
        label="Check Drive for changes"
        hint={lib.refreshing ? 'CHECKING DRIVE…' : lib.syncedAt ? `LAST CHECKED ${stamp(lib.syncedAt)}` : 'NOT CHECKED YET'}
        control={
          <Act disabled={lib.refreshing || expired} onClick={checkDrive}>
            {lib.refreshing ? 'Checking…' : 'Check now'}
          </Act>
        }
        below={lib.refreshing ? <div className="st-prog pg-anim" aria-hidden /> : undefined}
      />
    </>
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
  const hint = s.streamQuality === 'opus' ? '~1.2 MB / MIN · FLAC WHEN A SONG HAS NO OPUS COPY' : 'FLAC AS STORED · ~6–30 MB / MIN'
  return (
    <>
      <SectionHead label="Playback" note="FROM THE NEXT SONG" />
      <Row
        label="Streaming quality"
        hint={linked ? `FROM DRIVE · THE LOCAL FOLDER ALWAYS PLAYS FLAC` : hint}
        wide={<Seg label="Streaming quality" value={s.streamQuality} options={STREAM} onChange={(v) => settingsStore.set('streamQuality', v)} />}
      />
    </>
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
  const other = n ? Math.max(0, n.total - n.free - used) : 0
  const pct = (b: number) => (n?.total ? `${Math.min(100, (b / n.total) * 100)}%` : '0%')

  const setQuality = (q: DownloadQuality) => {
    const before = dl.prefs.quality
    if (q === before) return
    downloadsStore.setQuality(q)
    if (hasPins)
      toast.show({
        icon: 'download',
        text: q === 'flac' ? 'Downloads switch to the original FLAC.' : 'Downloads switch to Opus 160.',
        meta: 'THE OTHER COPIES GO ONCE THESE ARE STORED',
        action: { label: 'Undo', onClick: () => downloadsStore.setQuality(before) },
      })
  }
  const clear = () => {
    const before = dl.prefs
    downloadsStore.removeAll()
    toast.show({ icon: 'x', mutedIcon: true, text: 'Removed all downloads from this phone.', meta: used ? `${fmtBytes(used)} FREED` : undefined, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }

  return (
    <>
      <SectionHead label="Downloads" note={used ? `${fmtBytes(used)} STORED` : 'NOTHING STORED'} />
      <Row label="Download quality" hint={whole ? `WHOLE LIBRARY ≈ ${fmtBytes(whole)}` : undefined} wide={<Seg label="Download quality" value={dl.prefs.quality} options={DQ} onChange={setQuality} />} />
      <Row label="Download on Wi-Fi only" control={<Tog label="Download on Wi-Fi only" checked={dl.prefs.wifiOnly} onChange={(v) => downloadsStore.setWifiOnly(v)} />} />
      <Row
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
                <div className="st-bar">
                  <span className="st-bar-me" style={{ width: pct(used) }} />
                  <span className="st-bar-other" style={{ width: pct(other) }} />
                </div>
                <div className="st-store-line">
                  <span>PELAGIC {used ? fmtBytes(used) : '0 MB'}</span>
                  <span>{fmtBytes(n.free)} FREE</span>
                </div>
              </div>
            )}
            {c.box(`Remove ${used ? fmtBytes(used) : 'all'} of downloads from this phone? Your library stays on Drive.`, 'Remove', clear)}
          </>
        }
      />
      <Row label="Downloaded music" control={<ValueBtn onClick={() => go(href('downloads'))}>Manage</ValueBtn>} />
    </>
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
  const nextLabel = rs.sweeping ? 'SWEEPING NOW' : `NEXT · ${next.getDate()} ${MON[next.getMonth()]} ${clock(next)}`
  return (
    <>
      <SectionHead label="New Releases" note="MUSICBRAINZ" />
      <Row
        label="Daily sonar sweep"
        hint={nextLabel}
        wide={<Seg label="Daily sonar sweep" value={String(s.sweepHour)} options={SWEEP} onChange={(v) => settingsStore.set('sweepHour', Number(v))} />}
      />
      <Row
        label="Hide reissues and deluxe editions"
        control={<Tog label="Hide reissues and deluxe editions" checked={rs.doc.hideReissues[0]} onChange={(v) => releasesStore.setHideReissues(v)} />}
      />
      <Row label="Followed artists" control={<ValueBtn onClick={() => go(`${href('new')}?artists`)}>{`${fmtN(followed.length)} · ${muted ? `${fmtN(muted)} muted` : 'none muted'}`}</ValueBtn>} />
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
  const learnedHint = has ? [learned.more.length ? `MORE · ${learned.more.join(', ')}` : '', learned.less.length ? `LESS · ${learned.less.join(', ')}` : ''].filter(Boolean).join(' · ').toUpperCase() : 'NOTHING YET'
  const toggleType = (t: DjType) => {
    const on = p.types.includes(t)
    if (on && p.types.length === 1) return
    djStore.setPref('types', on ? p.types.filter((x) => x !== t) : DJ_TYPES.filter((x) => x === t || p.types.includes(x)))
  }
  const typesValue = p.types.length === DJ_TYPES.length ? 'All four' : p.types.map((t) => TYPE_LABEL[t]).join(', ')
  return (
    <>
      <SectionHead label="DJ" note="SESSIONS AND VOICE" />
      <Row
        label="Voice intros"
        hint={p.voice ? 'MALE ENGLISH VOICE BEFORE EACH SESSION' : 'INTROS APPEAR AS TEXT FOR 5 SECONDS'}
        control={<Tog label="Voice intros" checked={p.voice} onChange={(v) => djStore.setPref('voice', v)} />}
      />
      <Row
        label="Voice volume"
        hint="RELATIVE TO THE MUSIC"
        wide={
          <SliderCtl
            label="Voice volume"
            value={p.voice ? p.voiceVolume : 0}
            shown={p.voice ? `${Math.round(p.voiceVolume * 100)}%` : 'OFF'}
            disabled={!p.voice}
            step={0.05}
            onChange={(v) => p.voice && djStore.setPref('voiceVolume', Math.round(v * 100) / 100)}
          />
        }
      />
      <Row
        label="Session types"
        hint="WHAT START DJ MIXES"
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
                  <button key={t} type="button" className="chip st-chip" aria-pressed={on} disabled={on && p.types.length === 1} onClick={() => toggleType(t)}>
                    {TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          ) : undefined
        }
      />
      {isNative && (
        <Row
          label="Only downloaded songs on mobile data"
          hint="OFFLINE ALWAYS USES DOWNLOADED SONGS"
          control={<Tog label="Only downloaded songs on mobile data" checked={p.dataSaver} onChange={(v) => djStore.setPref('dataSaver', v)} />}
        />
      )}
      <Row
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
    </>
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
    <>
      <SectionHead label="Atmosphere" note="THIS PAGE CHANGES LIVE" />
      <Row
        label="Motion"
        hint={s.motion === 'system' ? (sysReduced ? 'SYSTEM ASKS FOR REDUCED MOTION' : 'SYSTEM ALLOWS MOTION') : undefined}
        wide={<Seg label="Motion" value={s.motion} options={MOTION} onChange={(v) => settingsStore.set('motion', v)} />}
      />
      <Row
        label="Drifting particles"
        hint="MARINE SNOW · FADES OUT WITH REDUCED MOTION"
        wide={<Seg label="Drifting particles" value={s.particles} options={PARTICLES} onChange={(v) => settingsStore.set('particles', v)} />}
      />
      <Row label="Stone, grain and contour texture" control={<Tog label="Stone, grain and contour texture" checked={s.texture} onChange={(v) => settingsStore.set('texture', v)} />} />
    </>
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
    <>
      <SectionHead label="About" />
      <Row
        label="Version"
        hint={pwa.updateReady ? 'A NEW VERSION IS READY' : apk.available ? `PELAGIC ${apk.available.versionName} IS AVAILABLE` : undefined}
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
      {pwa.canInstall && !pwa.installed && !isNative && <Row label="Install Pelagic as an app" hint="OPENS IN ITS OWN WINDOW" control={<Act onClick={() => void appUpdate.install()}>Install</Act>} />}
      {!phone && (
        <Row
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
      <Row label="Catalogue data" hint="MUSICBRAINZ · COVER ART ARCHIVE · DEEZER ARTIST PHOTOS" />
    </>
  )
}

