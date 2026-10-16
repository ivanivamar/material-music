/**
 * Downloads (handoff 09–10 Downloads; step 7 phase D, Android).
 *
 * Header: what's on the phone; Wi-Fi only + quality (Opus 160 / Original FLAC) — desktop-style tools on
 * a wide screen, a settings card on the phone layout. Storage bar (Pelagic / other / free).
 * IN PROGRESS: albums still downloading, with a progress line, "TRACK 7 OF 12 · 58% · 2.4 MB/S" or why
 * it waits (Wi-Fi, connection, paused, storage), pause / resume and remove.
 * ON THIS DEVICE: complete albums with track count, quality and size, remove (Undo in a toast). A single
 * song downloaded on its own (track menu, no album / playlist download around it) shows as that song.
 * Then "Download everything" / "Remove all downloads".
 *
 * In the browser there are no downloads (PC plays FLAC from the linked folder): an explainer instead.
 */
import { useEffect, useRef, useState } from 'react'
import { Button, EmptyState, IconButton, QualityBadge, Segmented, Toggle, qualityKind, useToast } from '../../components/ui'
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

export function Downloads() {
  const dl = useDownloads()
  const { data } = useLibrary()
  const phone = useIsPhone()
  const toast = useToast()

  if (!dl.available) {
    return (
      <>
        <PageHeader meta="OFFLINE · ANDROID APP" title="Downloads" />
        <div className="placeholder">
          <EmptyState
            icon="download"
            title="Downloads live in the Android app."
            body="On the phone, download albums, artists or the whole library to listen without a connection. On this PC, FLAC plays from your linked folder or streams from Drive."
          />
        </div>
      </>
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
        // albums with their own quality (album page) keep it
        meta: 'FILES ARE REPLACED AS THEY ARRIVE',
        action: { label: 'Undo', onClick: () => downloadsStore.setQuality(before) },
      })
  }
  const removeAll = () => {
    const before = dl.prefs
    downloadsStore.removeAll()
    toast.show({ icon: 'x', mutedIcon: true, text: 'Removed all downloads from this phone.', meta: n?.used ? `${fmtBytes(n.used)} FREED` : undefined, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }
  const downloadAll = () => {
    const before = dl.prefs
    downloadsStore.pin('all', '*')
    toast.show({ icon: 'download', text: 'Downloading your whole library.', meta: `${fmtBytes(libraryBytes(data, dl.prefs))} · ${dl.prefs.wifiOnly ? 'WI-FI ONLY' : 'ANY NETWORK'}`, action: { label: 'Undo', onClick: () => downloadsStore.restore(before) } })
  }

  const settings = (
    <>
      <label className="dl-set">
        <span>Wi-Fi only</span>
        <Toggle checked={dl.prefs.wifiOnly} onChange={(v) => downloadsStore.setWifiOnly(v)} label="Download on Wi-Fi only" />
      </label>
      <div className="dl-set">
        {phone && <span>Quality</span>}
        <Segmented value={dl.prefs.quality} options={QUALITY} onChange={setQuality} label="Download quality" />
      </div>
    </>
  )

  const meta = rows.length ? `${plural(rows.length, 'ITEM')} · ${plural(tracksStored, 'TRACK')} · ${fmtBytes(n?.used ?? 0)} ON THIS DEVICE` : 'NOTHING STORED OFFLINE'

  return (
    <div className="downloads">
      <PageHeader meta={meta} title="Downloads" tools={phone ? undefined : <div className="dl-tools">{settings}</div>} />
      <StorageBar s={dl} phone={phone} />
      {phone && <div className="dl-card">{settings}</div>}

      {n && (n.error || n.failed.length > 0) && (
        <div className="dl-alert" role="status">
          <span>
            {n.error === 'storage'
              ? 'The phone is out of space. Free some up or remove downloads.'
              : n.error === 'auth'
                ? 'Downloads need your Google sign-in. Open Pelagic signed in to continue.'
                : `${plural(n.failed.length, 'FILE')} couldn’t be downloaded from Drive.`}
          </span>
          {n.failed.length > 0 && (
            <button type="button" className="sect-link" onClick={() => downloadsStore.retryFailed()}>
              RETRY
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="placeholder dl-empty">
          <EmptyState
            icon="download"
            title="No music stored offline"
            body="Download an album, playlist, artist or song to play it without a connection."
            actions={
              <>
                <Button variant="secondary" icon="library" onClick={() => go(libraryHref('albums'))}>
                  Browse library
                </Button>
                <Button variant="secondary" icon="download" onClick={downloadAll}>
                  Everything · {fmtBytes(libraryBytes(data, dl.prefs))}
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <>
          {busy.length > 0 && (
            <section className="dl-sect">
              <div className="dl-sect-head">IN PROGRESS</div>
              {busy.map(({ ap }, i) => (
                <BusyRow key={ap.albumId} c={data} ap={ap} s={dl} first={i === 0} />
              ))}
            </section>
          )}
          {done.length > 0 && (
            <section className="dl-sect">
              <div className="dl-sect-head">ON THIS DEVICE</div>
              {done.map(({ ap, off }) => (
                <DoneRow key={ap.albumId} c={data} ap={ap} count={off.count} bytes={off.bytesDone} quality={qualityOf(dl.prefs, ap.albumId)} />
              ))}
            </section>
          )}
          <div className="dl-foot">
            {!hasAll && (
              <Button variant="secondary" icon="download" onClick={downloadAll}>
                Download everything · {fmtBytes(libraryBytes(data, dl.prefs))}
              </Button>
            )}
            <Button variant="danger" icon="x" onClick={removeAll}>
              Remove all downloads
            </Button>
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
        <span className="dl-bar-me" style={{ width: pct(n.used), minWidth: n.used ? 3 : 0 }} />
        <span className="dl-bar-other" style={{ width: pct(other) }} />
      </div>
      {phone ? (
        <div className="dl-legend dl-legend-phone">
          <span>PELAGIC {n.used ? fmtBytes(n.used) : '0 MB'}</span>
          <span>{fmtBytes(n.free)} FREE</span>
        </div>
      ) : (
        <div className="dl-legend">
          <span><i className="dl-dot dl-dot-me" />PELAGIC {n.used ? fmtBytes(n.used) : '0 MB'}</span>
          <span><i className="dl-dot dl-dot-other" />OTHER {fmtBytes(other)}</span>
          <span>FREE {fmtBytes(n.free)} OF {fmtBytes(n.total)}</span>
        </div>
      )}
    </div>
  )
}

/** Row title / subtitle: the album, or the song when just one song of it is kept (a song download). */
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
      meta: bytes ? `${fmtBytes(bytes)} FREED` : undefined,
      action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
    })
  }
}

/** bytes/s from the progress events of the file downloading now */
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

function BusyRow({ c, ap, s, first }: { c: Catalogue; ap: AlbumPlan; s: DownloadsState; first: boolean }) {
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
  const why = waitingReason(s)
  const paused = !!s.native?.paused

  let status: string
  if (mine && !why) {
    const parts = [`TRACK ${Math.min(off.count, off.done + 1)} OF ${off.count}`, `${Math.floor(ratio * 100)}%`]
    if (speed && speed > 0) parts.push(`${(speed / 1e6).toFixed(1)} MB/S`)
    status = parts.join(' · ')
  } else status = why ?? (first ? 'STARTING' : 'QUEUED')

  return (
    <div className={`dl-row dl-busy ${mine ? 'is-active' : ''}`}>
      <button type="button" className="dl-cover" onClick={() => go(albumHref(ap.albumId))} aria-label={`Open ${album?.title ?? ''}`}>
        {cover ? <img src={cover} alt="" /> : <span />}
      </button>
      <div className="dl-text">
        <a className="dl-title" href={albumHref(ap.albumId)}>{name.title}</a>
        <div className="dl-sub">{name.sub}</div>
      </div>
      <div className="dl-prog">
        <div className="dl-line">
          <span style={{ width: `${Math.round(ratio * 1000) / 10}%` }} />
        </div>
        <div className="dl-status">{status}</div>
      </div>
      <div className="dl-btns">
        {first && (
          <IconButton
            icon={paused ? 'playF' : 'pauseF'}
            label={paused ? 'Resume downloads' : 'Pause downloads'}
            shape="square"
            onClick={() => downloadsStore.setPaused(!paused)}
          />
        )}
        <IconButton icon="x" label={`Cancel ${name.title}`} shape="square" className="dl-x" onClick={remove} />
      </div>
    </div>
  )
}

function DoneRow({ c, ap, count, bytes, quality }: { c: Catalogue; ap: AlbumPlan; count: number; bytes: number; quality: DownloadQuality }) {
  const album = c.albums[ap.albumId]
  const name = rowName(c, ap)
  const cover = useCover(album?.cover)
  const remove = useRemove(c, ap, bytes)
  const first = c.tracks[[...ap.trackFiles.keys()][0]]
  const flac = quality === 'flac' || !first?.mobile?.id
  const label = flac ? `FLAC ${first?.flac?.bitDepth ?? 16}/${((first?.flac?.sampleRate ?? 44100) / 1000).toString().replace(/\.0$/, '')}` : 'OPUS 160'
  return (
    <div className="dl-row dl-done">
      <button type="button" className="dl-cover" onClick={() => go(albumHref(ap.albumId))} aria-label={`Open ${album?.title ?? ''}`}>
        {cover ? <img src={cover} alt="" /> : <span />}
      </button>
      <div className="dl-text">
        <a className="dl-title" href={albumHref(ap.albumId)}>{name.title}</a>
        <div className="dl-sub">
          {name.sub}
          <span className="dl-sub-phone"> · {plural(count, 'TRACK')}</span>
        </div>
      </div>
      <div className="dl-n">{plural(count, 'TRACK')}</div>
      <div className="dl-q">
        <QualityBadge kind={flac ? qualityKind('flac', first?.flac?.bitDepth, first?.flac?.sampleRate) : 'opus'}>{label}</QualityBadge>
      </div>
      <div className="dl-size">{fmtBytes(bytes)}</div>
      <IconButton icon="x" label={`Remove ${name.title} from this phone`} shape="square" bare className="dl-x" onClick={remove} />
    </div>
  )
}
