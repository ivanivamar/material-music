/**
 * Full-screen library states before the shell can show (Material 3 Expressive redesign, FirstRunMaterial.dc.html):
 *   LoadingLibrary — first download of library.json ("Charting your library" / "All charted.")
 *   NoLibrary      — Drive has no Pelagic/library.json ("No library found")
 *   LibraryError   — the download or parse failed
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppMark } from '../components/Logo'
import { Button, LinearProgress } from '../components/ui'
import { Icon } from '../design/icons'
import { libraryStats, libraryStore, useLibrary, type Catalogue } from '../state/library'
import { useMotion } from '../state/motion'
import { sessionStore, useSession } from '../state/session'
import { useIsPhone } from '../state/viewport'
import './screens.css'

const fmtN = (n: number) => n.toLocaleString('en-US')
const fmtMB = (b: number) => (b / 1024 / 1024).toFixed(1)

/** Counts up to the real totals once the catalogue is parsed (instant with reduced motion). */
function useCountUp(target: readonly number[], ms = 1600) {
  const motion = useMotion()
  const [k, setK] = useState(0)
  const key = target.join(',')
  const run = target.some((t) => t > 0)
  useEffect(() => {
    if (!run || !motion) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      setK(p)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, key, motion, ms])
  const p = motion ? k : run ? 1 : 0
  const e = 1 - Math.pow(1 - p, 3)
  return [target.map((t) => Math.round(t * e)), run && p >= 1] as const
}

function AccountPill() {
  const { account } = useSession()
  if (!account) return null
  const initials = (account.name || account.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <div className="acct-pill">
      <span className="acct-avatar">{account.photo ? <img src={account.photo} alt="" referrerPolicy="no-referrer" /> : initials}</span>
      <span className="acct-email">{account.email}</span>
    </div>
  )
}

function ScreenShell({ tag, topAccount, progress, children }: { tag: string; topAccount?: boolean; progress?: number; children: ReactNode }) {
  const phone = useIsPhone()
  return (
    <main className={`scr ${phone ? 'is-phone' : ''}`}>
      <div className="scr-panel">
        <div className="scr-glow" aria-hidden />
        <div className="shell-deco" aria-hidden>
          <i className="sd-dots" />
          <i className="sd-ring sd-r1" />
          <i className="sd-ring sd-r2" />
          <i className="sd-ring sd-r3" />
        </div>
        {progress != null && (
          <LinearProgress className="scr-prog" value={progress / 100} />
        )}
        <div className="scr-top">
          {!phone ? (
            <div className="scr-brand">
              <AppMark size={32} />
              <span>Material Music</span>
            </div>
          ) : (
            <span />
          )}
          <div className="scr-top-r">
            {topAccount && <AccountPill />}
            <span className="scr-pill">{tag}</span>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}

export function LoadingLibrary({ onDone }: { onDone: () => void }) {
  const lib = useLibrary()
  const phone = useIsPhone()
  const data: Catalogue | null = lib.status === 'ready' ? lib.data : null
  const stats = data ? libraryStats(data) : null
  const [[artists, albums, tracks], counted] = useCountUp(stats ? [stats.artists, stats.albums, stats.tracks] : [0, 0, 0])
  const names = useMemo(() => (data ? Object.values(data.albums).map((a) => a.title) : []), [data])
  const done = !!stats && counted

  let now: string
  if (!data) {
    now = lib.total ? `Receiving · ${fmtMB(lib.received)} / ${fmtMB(lib.total)} MB` : 'Looking for My Drive / Pelagic / library.json'
  } else {
    const list = names
    const i = list.length ? Math.floor((albums / Math.max(1, stats!.albums)) * (list.length - 1)) : 0
    now = `Reading · ${list[i] ?? ''}`
  }

  const counters = [
    ['Artists', artists],
    ['Albums', albums],
    ['Tracks', tracks],
  ] as const

  const pct = done ? 100 : data ? (albums / Math.max(1, stats!.albums)) * 100 : lib.total > 0 ? (lib.received / lib.total) * 100 : 12

  return (
    <ScreenShell tag={done ? 'Ready' : 'First sync'} topAccount progress={pct}>
      <div className="scr-center loading">
        <div className="loading-sonar" aria-hidden>
          <span className="ls-ring ls-r1" />
          <span className="ls-ring ls-r2" />
          <span className="ls-ring ls-r3" />
          <svg viewBox="0 0 140 140" className="ls-svg">
            <circle cx="70" cy="70" r="10" fill="none" stroke="oklch(0.80 0.115 38)" strokeWidth="1.5" style={{ animation: 'scr-ping 3.2s cubic-bezier(.15,.6,.35,1) infinite' }} />
            <circle cx="70" cy="70" r="10" fill="none" stroke="oklch(0.80 0.115 38)" strokeWidth="1.5" style={{ animation: 'scr-ping 3.2s cubic-bezier(.15,.6,.35,1) 1.6s infinite' }} />
          </svg>
          <span className="ls-dot" />
        </div>
        <div className="scr-copy">
          <h1 className="loading-title">{done ? 'All charted.' : 'Charting your library'}</h1>
          <p className="scr-body">{done ? `${fmtN(stats!.tracks)} tracks, ready when you are.` : 'Reading the catalogue from Google Drive. Only happens once.'}</p>
        </div>
        <div className={`counters ${phone ? 'is-phone' : ''}`} role="status" aria-live="off">
          {counters.map(([k, v]) =>
            phone ? (
              <div key={k} className="counter-row">
                <span className="counter-k">{k}</span>
                <span className="counter-v">{fmtN(v)}</span>
              </div>
            ) : (
              <div key={k} className="counter">
                <div className="counter-v">{fmtN(v)}</div>
                <div className="counter-k">{k}</div>
              </div>
            ),
          )}
        </div>
        <div className="loading-foot">
          {done ? (
            <Button variant="brand" size="lg" className="scr-cta" onClick={onDone} autoFocus>
              Go to Home
              <Icon name="forward" />
            </Button>
          ) : (
            <div className="loading-now">{now}</div>
          )}
        </div>
      </div>
    </ScreenShell>
  )
}

export function NoLibrary() {
  const { refreshing, status } = useLibrary()
  const { pending } = useSession()
  const busy = refreshing || status === 'loading'
  return (
    <ScreenShell tag="No library on Drive">
      <div className="scr-center">
        <div className="empty-rings" aria-hidden>
          <span className="er-r1" />
          <span className="er-r2" />
          <span className="er-ic">
            <Icon name="folderOff" size={28} />
          </span>
        </div>
        <div className="scr-copy">
          <h1 className="scr-title">No library found</h1>
          <p className="scr-body">This Drive has no Pelagic folder yet. Run the importer on your computer, then check again.</p>
        </div>
        <AccountPill />
        <div className="scr-btns">
          <Button variant="brand" size="lg" disabled={busy} onClick={() => libraryStore.sync()}>
            <Icon name="refresh" />
            {busy ? 'Checking…' : 'Check again'}
          </Button>
          <Button variant="outlined" size="lg" disabled={pending} onClick={() => sessionStore.signIn({ switchAccount: true })}>
            Switch account
          </Button>
        </div>
        <div className="scr-meta">Looked for My Drive / Pelagic / library.json</div>
      </div>
    </ScreenShell>
  )
}

export function LibraryError() {
  const { error, status } = useLibrary()
  const { pending } = useSession()
  const busy = status === 'loading'
  return (
    <ScreenShell tag="Library unreachable">
      <div className="scr-center">
        <div className="empty-rings" aria-hidden>
          <span className="er-r1" />
          <span className="er-r2" />
          <span className="er-ic">
            <Icon name="offline" size={28} />
          </span>
        </div>
        <div className="scr-copy">
          <h1 className="scr-title">Couldn’t reach your library</h1>
          <p className="scr-body">Material Music couldn’t read library.json from Google Drive.</p>
        </div>
        <AccountPill />
        <div className="scr-btns">
          <Button variant="brand" size="lg" disabled={busy} onClick={() => libraryStore.sync({ force: true })}>
            <Icon name="refresh" />
            Try again
          </Button>
          <Button variant="outlined" size="lg" disabled={pending} onClick={() => sessionStore.signIn({ switchAccount: true })}>
            Switch account
          </Button>
        </div>
        {error && <div className="scr-meta scr-error">{error}</div>}
      </div>
    </ScreenShell>
  )
}
