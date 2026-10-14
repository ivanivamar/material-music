/**
 * Full-screen library states before the shell can show:
 *   LoadingLibrary — first download of library.json ("Charting your library", FirstRun step 3)
 *   NoLibrary      — Drive has no Pelagic/library.json (FirstRun 03)
 *   LibraryError   — the download or parse failed
 */
import { useEffect, useMemo, useState } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { Button, Sonar } from '../components/ui'
import { Icon } from '../design/icons'
import { libraryStats, libraryStore, useLibrary, type Catalogue } from '../state/library'
import { useMotion } from '../state/motion'
import { sessionStore, useSession } from '../state/session'
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

export function LoadingLibrary({ onDone }: { onDone: () => void }) {
  const lib = useLibrary()
  const data: Catalogue | null = lib.status === 'ready' ? lib.data : null
  const stats = data ? libraryStats(data) : null
  const [[artists, albums, tracks], counted] = useCountUp(stats ? [stats.artists, stats.albums, stats.tracks] : [0, 0, 0])
  const names = useMemo(() => (data ? Object.values(data.albums).map((a) => a.title) : []), [data])
  const done = !!stats && counted

  let now: string
  if (!data) {
    now = lib.total ? `RECEIVING · ${fmtMB(lib.received)} / ${fmtMB(lib.total)} MB` : 'LOOKING FOR MY DRIVE / PELAGIC / LIBRARY.JSON'
  } else {
    const list = names
    const i = list.length ? Math.floor((albums / Math.max(1, stats!.albums)) * (list.length - 1)) : 0
    now = `READING · ${(list[i] ?? '').toUpperCase()}`
  }

  const counters = [
    ['ARTISTS', artists],
    ['ALBUMS', albums],
    ['TRACKS', tracks],
  ] as const

  return (
    <main className="scr">
      <Atmosphere fixed seed={9} />
      <div className="scr-tag">FIRST SYNC</div>
      <div className="scr-center loading">
        <div className="loading-sonar">
          <span className="ls-ring" />
          <span className="ls-ring" />
          <span className="ls-ring" />
          <Sonar size={150} />
        </div>
        <div className="scr-copy">
          <h1 className="loading-title">{done ? 'All charted.' : 'Charting your library'}</h1>
          <p className="scr-body">{done ? `${fmtN(stats!.tracks)} tracks, ready when you are.` : 'Reading the catalogue from Google Drive. Only happens once.'}</p>
        </div>
        <div className="counters" role="status" aria-live="off">
          {counters.map(([k, v]) => (
            <div key={k} className="counter">
              <div className="counter-v">{fmtN(v)}</div>
              <div className="counter-k">{k}</div>
            </div>
          ))}
        </div>
        <div className="loading-foot">
          {done ? (
            <Button onClick={onDone} autoFocus>
              Go to Home
              <span className="btn-ic" style={{ fontSize: 19 }}>
                <Icon name="chevR" />
              </span>
            </Button>
          ) : (
            <div className="t-mono loading-now">{now}</div>
          )}
        </div>
      </div>
      {lib.total > 0 && !data && <div className="loading-bar" style={{ width: `${(lib.received / lib.total) * 100}%` }} />}
    </main>
  )
}

function AccountChip() {
  const { account, pending } = useSession()
  if (!account) return null
  const initials = (account.name || account.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <div className="acct-chip">
      <span className="acct-avatar">{initials}</span>
      <span className="acct-email">{account.email}</span>
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => sessionStore.signIn({ switchAccount: true })}>
        Switch account
      </Button>
    </div>
  )
}

export function NoLibrary() {
  const { refreshing, status } = useLibrary()
  const busy = refreshing || status === 'loading'
  return (
    <main className="scr">
      <Atmosphere fixed seed={21} />
      <div className="scr-tag">NO LIBRARY ON DRIVE</div>
      <div className="scr-center">
        <div className="empty-rings" aria-hidden>
          <span />
          <span />
          <span style={{ borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.22)' }} />
        </div>
        <div className="scr-copy">
          <h1 className="scr-title">No library down here.</h1>
          <p className="scr-body">This Drive has no Pelagic folder yet. Run the Pelagic importer on your computer, then check again.</p>
        </div>
        <AccountChip />
        <Button icon="refresh" disabled={busy} onClick={() => libraryStore.sync()}>
          {busy ? 'Checking…' : 'Check again'}
        </Button>
        <div className="t-mono scr-meta">LOOKED FOR · MY DRIVE / PELAGIC / LIBRARY.JSON</div>
      </div>
    </main>
  )
}

export function LibraryError() {
  const { error, status } = useLibrary()
  return (
    <main className="scr">
      <Atmosphere fixed seed={33} />
      <div className="scr-tag">LIBRARY UNREACHABLE</div>
      <div className="scr-center">
        <div className="empty-rings" aria-hidden>
          <span />
          <span />
          <span>
            <Icon name="alert" />
          </span>
        </div>
        <div className="scr-copy">
          <h1 className="scr-title">The signal didn’t come back.</h1>
          <p className="scr-body">Pelagic couldn’t read library.json from Google Drive.</p>
        </div>
        <Button icon="refresh" disabled={status === 'loading'} onClick={() => libraryStore.sync({ force: true })}>
          Try again
        </Button>
        {error && <div className="t-mono scr-meta scr-error">{error}</div>}
        <AccountChip />
      </div>
    </main>
  )
}
