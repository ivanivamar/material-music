/**
 * Downloads (Material 3 Expressive redesign, DownloadsMaterial.dc.html).
 *
 * Header: what's on the phone; Wi-Fi only + quality (Opus 160 / Original FLAC) — desktop-style tools on
 * a wide screen, a settings card on the phone layout. Storage bar (Material Music / Other / Free).
 * In progress: albums still downloading, with a 4px progress bar, "Track 7 of 12 · 58% · 2.4 MB/s" or why
 * it waits (Wi-Fi, connection, paused, storage), pause / resume and cancel.
 * On this device: complete albums with track count, tonal quality pill and size, plus a menu to remove.
 */
import { useEffect, useRef, useState } from 'react'
import { QualityBadge, Toggle, qualityKind, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useCover } from '../../lib/covers'
import { albumOffline, downloadsStore, libraryBytes, qualityOf, useDownloadProgress, useDownloads, type AlbumPlan, type DownloadQuality, type DownloadsState } from '../../state/downloads'
import { useLibrary, type Catalogue } from '../../state/library'
import { useIsPhone } from '../../state/viewport'
import { fmtBytes, plural } from '../../state/views'
import { albumHref, go, libraryHref } from '../../shell/routes'
import { waitingReason } from '../library/DownloadButton'
import { PageHeader } from '../PageHeader'
import './downloads.css'

const QUALITY: { value: DownloadQuality; label: string }[] = [
  { value: 'opus', label: 'Opus 160' },
  { value: 'flac', label: 'Original FLAC' },
]

function QualitySeg({ value, onChange, full }: { value: DownloadQuality; onChange: (q: DownloadQuality) => void; full?: boolean }) {
  return (
    <div className={`dl-seg ${full ? 'is-full' : ''}`} role="group" aria-label="Download quality">
      {QUALITY.map((o, i) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            className={`dl-seg-btn ${on ? 'is-on' : ''} ${i === 0 ? 'is-first' : 'is-last'}`}
            aria-pressed={on}
            onPointerDown={(e) => {
              if (e.button === 0 && e.pointerType === 'mouse') onChange(o.value)
            }}
            onClick={() => onChange(o.value)}
          >
            {on && <Icon name="done" size={16} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Downloads() {
  const dl = useDownloads()
  const { data } = useLibrary()
  const phone = useIsPhone()
  const toast = useToast()

  if (!dl.available) {
    return (
      <div className="downloads">
        <PageHeader meta="Offline · Android app" title="Downloads" />
        <div className="dl-empty-card">
          <div className="dl-empty-ic" aria-hidden>
            <Icon name="cloudDownload" />
          </div>
          <div className="dl-empty-text">
            <h2 className="dl-empty-title">Downloads live in the Android app</h2>
            <p className="dl-empty-sub">On the phone, download albums, artists or the whole library to listen without a connection. On this PC, FLAC plays from your linked folder or streams from Drive.</p>
          </div>
        </div>
      </div>
    )
  }
  if (!data) return null

  const rows = dl.plan.albums.map((ap) => ({ ap, off: albumOffline(dl, ap.albumId) }))
  const busy = rows.filter((r) => !r.off.complete)
  const done = rows.filter((r) => r.off.complete)
  const tracksStored = rows.reduce((n, r) => n + r.off.done, 0)
  const n = dl.native
  const hasAll = dl.prefs.pins.some((p) => p.kind === 'all')

  const setQuality = (q: DownloadQuality) => {
    if (q === dl.prefs.quality) return
    const before = dl.prefs.quality
    downloadsStore.setQuality(q)
    if (rows.length)
      toast.show({
        icon: 'download',
        text: q === 'flac' ? 'Downloads switch to the original FLAC.' : 'Downloads switch to Opus 160.',
        meta: 'Files are replaced as they arrive',
        action: { label: 'Undo', onClick: () => downloadsStore.setQuality(before) },
      })
  }
  const removeAll = () => {
    const before = dl.prefs
    downloadsStore.removeAll()
    toast.show({ icon: 'x', mutedIcon: true, text: 'Removed all downloads from this phone.', meta: n?.used ? `${fmtBytes(n.used)} freed` : undefined, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }
  const downloadAll = () => {
    const before = dl.prefs
    downloadsStore.pin('all', '*')
    toast.show({ icon: 'download', text: 'Downloading your whole library.', meta: `${fmtBytes(libraryBytes(data, dl.prefs))} · ${dl.prefs.wifiOnly ? 'Wi-Fi only' : 'Any network'}`, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }

  const meta = rows.length ? `${plural(rows.length, 'item', 'items')} · ${plural(tracksStored, 'track', 'tracks')} · ${fmtBytes(n?.used ?? 0)} on this device` : 'Nothing stored offline'

  return (
    <div className="downloads">
      <PageHeader
        meta={meta}
        title="Downloads"
        tools={
          phone ? undefined : (
            <div className="dl-tools">
              <label className="dl-set">
                <span>Wi-Fi only</span>
                <Toggle checked={dl.prefs.wifiOnly} onChange={(v) => downloadsStore.setWifiOnly(v)} label="Download on Wi-Fi only" />
              </label>
              <QualitySeg value={dl.prefs.quality} onChange={setQuality} />
            </div>
          )
        }
      />
      <StorageBar s={dl} phone={phone} />
      {phone && (
        <div className="dl-card">
          <label className="dl-set">
            <div>
              <div className="dl-set-t">Wi-Fi only</div>
              <div className="dl-set-s">Pause downloads on mobile data</div>
            </div>
            <Toggle checked={dl.prefs.wifiOnly} onChange={(v) => downloadsStore.setWifiOnly(v)} label="Download on Wi-Fi only" />
          </label>
          <QualitySeg value={dl.prefs.quality} onChange={setQuality} full />
        </div>
      )}

      {n && (n.error || n.failed.length > 0) && (
        <div className="dl-alert" role="status">
          <span>
            {n.error === 'storage'
              ? 'The phone is out of space. Free some up or remove downloads.'
              : n.error === 'auth'
                ? 'Downloads need your Google sign-in. Open Material Music signed in to continue.'
                : `${plural(n.failed.length, 'file', 'files')} couldn’t be downloaded from Drive.`}
          </span>
          {n.failed.length > 0 && (
            <button type="button" className="dl-alert-btn" onClick={() => downloadsStore.retryFailed()}>
              Retry
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="dl-empty-card">
          <div className="dl-empty-ic" aria-hidden>
            <Icon name="cloudDownload" />
          </div>
          <div className="dl-empty-text">
            <h2 className="dl-empty-title">No music stored offline</h2>
            <p className="dl-empty-sub">Download an album, playlist, artist or song to play it without a connection.</p>
          </div>
          <div className="dl-empty-btns">
            <button type="button" className="dl-btn-pri" onClick={() => go(libraryHref('albums'))}>
              <Icon name="library" />
              Browse library
            </button>
            <button type="button" className="dl-btn-sec" onClick={downloadAll}>
              <Icon name="download" />
              Everything · {fmtBytes(libraryBytes(data, dl.prefs))}
            </button>
          </div>
        </div>
      ) : (
        <>
          {busy.length > 0 && (
            <section className="dl-sect">
              <div className="dl-sect-head">In progress</div>
              <div className="dl-busy-list">
                {busy.map(({ ap }, i) => (
                  <BusyRow key={ap.albumId} c={data} ap={ap} s={dl} first={i === 0} phone={phone} />
                ))}
              </div>
            </section>
          )}
          {done.length > 0 && (
            <section className="dl-sect">
              <div className="dl-sect-head">On this device</div>
              <div className="dl-done-list">
                {done.map(({ ap, off }) => (
                  <DoneRow key={ap.albumId} c={data} ap={ap} count={off.count} bytes={off.bytesDone} quality={qualityOf(dl.prefs, ap.albumId)} phone={phone} />
                ))}
              </div>
            </section>
          )}
          <div className="dl-foot">
            {!hasAll && (
              <button type="button" className="dl-btn-sec" onClick={downloadAll}>
                <Icon name="download" />
                Download everything · {fmtBytes(libraryBytes(data, dl.prefs))}
              </button>
            )}
            <button type="button" className="dl-btn-danger" onClick={removeAll}>
              <Icon name="delete" />
              Remove all downloads
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StorageBar({ s, phone }: { s: DownloadsState; phone: boolean }) {
  const n = s.native
  if (!n || !n.total) return null
  const pct = (b: number) => `${Math.max(0, Math.min(100, (b / n.total) * 100))}%`
  const other = Math.max(0, n.total - n.free - n.used)
  return (
    <div className="dl-storage">
      <div className="dl-bar" aria-hidden>
        <span className="dl-bar-me" style={{ width: pct(n.used), minWidth: n.used ? 6 : 0 }} />
        <span className="dl-bar-other" style={{ width: pct(other) }} />
        <span className="dl-bar-free" />
      </div>
      {phone ? (
        <div className="dl-legend dl-legend-phone">
          <span>
            <i className="dl-dot dl-dot-me" />
            Material Music {n.used ? fmtBytes(n.used) : '0 MB'}
          </span>
          <span>{fmtBytes(n.free)} free</span>
        </div>
      ) : (
        <div className="dl-legend">
          <span>
            <i className="dl-dot dl-dot-me" />
            Material Music <b>{n.used ? fmtBytes(n.used) : '0 MB'}</b>
          </span>
          <span>
            <i className="dl-dot dl-dot-other" />
            Other {fmtBytes(other)}
          </span>
          <span>
            <i className="dl-dot dl-dot-free" />
            Free {fmtBytes(n.free)} of {fmtBytes(n.total)}
          </span>
        </div>
      )}
    </div>
  )
}

function rowName(c: Catalogue, ap: AlbumPlan): { title: string; sub: string } {
  const album = c.albums[ap.albumId]
  const only = ap.partial && ap.trackFiles.size === 1 ? c.tracks[[...ap.trackFiles.keys()][0]] : undefined
  if (only) return { title: only.title, sub: [only.artist, album?.title].filter(Boolean).join(' · ') }
  return { title: album?.title ?? ap.albumId, sub: album?.artist ?? '' }
}

function useRemove(c: Catalogue, ap: AlbumPlan, bytes: number) {
  const toast = useToast()
  return () => {
    const before = downloadsStore.get().prefs
    downloadsStore.removeAlbum(ap.albumId)
    toast.show({
      icon: 'x',
      mutedIcon: true,
      text: `Removed ${rowName(c, ap).title} from this phone.`,
      meta: bytes ? `${fmtBytes(bytes)} freed` : undefined,
      action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
    })
  }
}

function useSpeed(active: boolean, bytes: number): number | null {
  const last = useRef<{ t: number; b: number } | null>(null)
  const [speed, setSpeed] = useState<number | null>(null)
  useEffect(() => {
    if (!active) {
      last.current = null
      return
    }
    const now = performance.now()
    const prev = last.current
    if (!prev || bytes < prev.b) last.current = { t: now, b: bytes }
    else if (now - prev.t >= 1500) {
      const v = ((bytes - prev.b) / (now - prev.t)) * 1000
      setSpeed((s) => (s == null ? v : s * 0.5 + v * 0.5))
      last.current = { t: now, b: bytes }
    }
  }, [active, bytes])
  return active ? speed : null
}

function formatWait(why: string | null): string | null {
  if (!why) return null
  const u = why.toUpperCase()
  if (u.includes('WI-FI')) return 'Waiting for Wi-Fi'
  if (u.includes('PAUSED')) return 'Paused'
  if (u.includes('OFFLINE') || u.includes('CONNECTION')) return 'Waiting for connection'
  if (u.includes('SPACE') || u.includes('STORAGE')) return 'Out of storage space'
  return why.charAt(0).toUpperCase() + why.slice(1).toLowerCase()
}

function BusyRow({ c, ap, s, first, phone }: { c: Catalogue; ap: AlbumPlan; s: DownloadsState; first: boolean; phone: boolean }) {
  const album = c.albums[ap.albumId]
  const name = rowName(c, ap)
  const cover = useCover(album?.cover)
  const cur = useDownloadProgress()
  const off = albumOffline(s, ap.albumId)
  const remove = useRemove(c, ap, off.bytesDone)
  const mine = cur && ap.files.some((f) => f.id === cur.id) && !s.stored.has(cur.id) ? cur : null
  const bytes = off.bytesDone + (mine && [...ap.trackFiles.values()].includes(mine.id) ? mine.bytes : 0)
  const speed = useSpeed(!!mine, bytes)
  const ratio = off.bytes ? bytes / off.bytes : 0
  const why = formatWait(waitingReason(s))
  const paused = !!s.native?.paused

  let status: string
  if (mine && !why) {
    const parts = [`Track ${Math.min(off.count, off.done + 1)} of ${off.count}`, `${Math.floor(ratio * 100)}%`]
    if (speed && speed > 0) parts.push(`${(speed / 1e6).toFixed(1)} MB/s`)
    status = parts.join(' · ')
  } else status = why ? `${why}${ratio > 0 ? ` · ${Math.floor(ratio * 100)}%` : ''}` : first ? 'Starting' : 'Queued'

  return (
    <div className={`dl-row dl-busy ${mine ? 'is-active' : ''} ${why ? 'is-wait' : ''}`}>
      <button type="button" className="dl-cover" onClick={() => go(albumHref(ap.albumId))} aria-label={`Open ${album?.title ?? ''}`}>
        {cover ? <img src={cover} alt="" /> : <span />}
      </button>
      {phone ? (
        <div className="dl-mid">
          <a className="dl-title" href={albumHref(ap.albumId)}>
            {name.title}
          </a>
          <div className="dl-line">
            <span style={{ width: `${Math.round(ratio * 1000) / 10}%` }} />
          </div>
          <div className="dl-status">{status}</div>
        </div>
      ) : (
        <>
          <div className="dl-text">
            <a className="dl-title" href={albumHref(ap.albumId)}>
              {name.title}
            </a>
            <div className="dl-sub">{name.sub}</div>
          </div>
          <div className="dl-prog">
            <div className="dl-line">
              <span style={{ width: `${Math.round(ratio * 1000) / 10}%` }} />
            </div>
            <div className="dl-status">{status}</div>
          </div>
        </>
      )}
      <div className="dl-btns">
        {first && (
          <button
            type="button"
            className="dl-ibtn is-tonal"
            aria-label={paused ? 'Resume downloads' : 'Pause downloads'}
            title={paused ? 'Resume downloads' : 'Pause downloads'}
            onClick={() => downloadsStore.setPaused(!paused)}
          >
            <Icon name={paused ? 'playF' : 'pauseF'} />
          </button>
        )}
        <button type="button" className="dl-ibtn" aria-label={`Cancel ${name.title}`} title={`Cancel ${name.title}`} onClick={remove}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}

function DoneRow({ c, ap, count, bytes, quality, phone }: { c: Catalogue; ap: AlbumPlan; count: number; bytes: number; quality: DownloadQuality; phone: boolean }) {
  const album = c.albums[ap.albumId]
  const name = rowName(c, ap)
  const cover = useCover(album?.cover)
  const remove = useRemove(c, ap, bytes)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const first = c.tracks[[...ap.trackFiles.keys()][0]]
  const flac = quality === 'flac' || !first?.mobile?.id
  const label = flac ? `FLAC ${first?.flac?.bitDepth ?? 16}/${((first?.flac?.sampleRate ?? 44100) / 1000).toString().replace(/\.0$/, '')}` : 'Opus 160'
  const qBadge = <QualityBadge kind={flac ? qualityKind('flac', first?.flac?.bitDepth, first?.flac?.sampleRate) : 'opus'}>{label}</QualityBadge>

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  return (
    <div className="dl-row dl-done">
      <button type="button" className="dl-cover" onClick={() => go(albumHref(ap.albumId))} aria-label={`Open ${album?.title ?? ''}`}>
        {cover ? <img src={cover} alt="" /> : <span />}
      </button>
      <div className="dl-text">
        <a className="dl-title" href={albumHref(ap.albumId)}>
          {name.title}
        </a>
        {phone ? (
          <div className="dl-sub dl-sub-row">
            {qBadge}
            <span>
              {plural(count, 'track', 'tracks')} · {fmtBytes(bytes)}
            </span>
          </div>
        ) : (
          <div className="dl-sub">{name.sub}</div>
        )}
      </div>
      {!phone && (
        <>
          <div className="dl-n">{plural(count, 'track', 'tracks')}</div>
          <div className="dl-q">{qBadge}</div>
          <div className="dl-size">{fmtBytes(bytes)}</div>
        </>
      )}
      <div ref={menuRef} className="dl-more-wrap">
        <button
          type="button"
          className="dl-ibtn"
          aria-label={`More actions for ${name.title}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="dl-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="dl-menu-item"
              onClick={() => {
                setMenuOpen(false)
                remove()
              }}
            >
              <Icon name="delete" />
              Remove download
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
