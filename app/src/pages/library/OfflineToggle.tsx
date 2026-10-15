/**
 * Album page "Available offline" (handoff 04 Desktop Album, Android app only):
 *
 *   Available offline          [toggle]   ( Opus 160 74 MB | FLAC 286 MB )
 *   07/11 · DOWNLOADING
 *
 * The toggle keeps the album on the phone (album pin) or lets it go (with Undo). The switch picks this
 * album's quality — it overrides the Downloads page's global quality for this album only. Switching a
 * stored album keeps the old copy playable until the new one has arrived (`plan.keep`).
 * Phone layout: a full-width card under Play / Shuffle (`phone.css`).
 */
import { Segmented, Toggle, useToast } from '../../components/ui'
import { albumBytes, albumOffline, downloadsStore, qualityOf, storedFileOf, useDownloads, type DownloadQuality } from '../../state/downloads'
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { fmtBytes } from '../../state/views'
import { waitingReason } from './DownloadButton'

const pad2 = (n: number) => String(n).padStart(2, '0')
const Q_NAME: Record<DownloadQuality, string> = { opus: 'Opus 160', flac: 'the original FLAC' }

export function AlbumOfflineToggle({ c, albumId, name }: { c: Catalogue; albumId: string; name: string }) {
  const dl = useDownloads()
  const toast = useToast()
  const tracks = tracksByAlbum(c).get(albumId) ?? []
  const off = albumOffline(dl, albumId)
  const q = qualityOf(dl.prefs, albumId)
  const hasOpus = tracks.some((t) => t.mobile?.id)
  const size = { opus: albumBytes(tracks, 'opus'), flac: albumBytes(tracks, 'flac') }
  const on = off.wanted

  // tracks that play offline in any quality (during a quality switch: the old copies)
  const playable = tracks.filter((t) => storedFileOf(dl, t)).length
  let status: string
  if (!on) status = off.partial && off.done ? `${pad2(off.done)}/${pad2(tracks.length)} · FROM PLAYLISTS` : `NOT ON THIS PHONE · ${fmtBytes(size[hasOpus ? q : 'flac'])}`
  else if (off.complete) status = `${pad2(off.count)}/${pad2(off.count)} · STORED · ${fmtBytes(off.bytesDone)}`
  else {
    const why = waitingReason(dl)
    const switching = playable > off.done
    status = `${pad2(off.done)}/${pad2(off.count)} · ${why ?? (switching ? `SWITCHING TO ${q === 'flac' ? 'FLAC' : 'OPUS'}` : 'DOWNLOADING')}`
  }

  const toggle = (next: boolean) => {
    if (next) {
      downloadsStore.pin('album', albumId)
      return
    }
    const before = dl.prefs
    downloadsStore.removeAlbum(albumId)
    toast.show({
      icon: 'x',
      mutedIcon: true,
      text: `Removed ${name} from this phone.`,
      meta: off.bytesDone ? `${fmtBytes(off.bytesDone)} FREED` : undefined,
      action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
    })
  }

  const setQuality = (next: DownloadQuality) => {
    if (next === q) return
    const before = q
    downloadsStore.setAlbumQuality(albumId, next)
    if (on)
      toast.show({
        icon: 'download',
        text: `${name} switches to ${Q_NAME[next]}.`,
        meta: `${fmtBytes(size[next])} · THE STORED COPY PLAYS UNTIL THEN`,
        action: { label: 'Undo', onClick: () => downloadsStore.setAlbumQuality(albumId, before) },
      })
  }

  return (
    <div className={`offl ${on ? 'is-on' : ''}`}>
      <label className="offl-main">
        <span className="offl-text">
          <span className="offl-title">Available offline</span>
          <span className="offl-status">{status}</span>
        </span>
        <Toggle checked={on} onChange={toggle} label={`Keep ${name} on this phone`} />
      </label>
      {hasOpus && (
        <Segmented
          value={q}
          options={[
            { value: 'opus', label: 'Opus 160', meta: fmtBytes(size.opus) },
            { value: 'flac', label: 'FLAC', meta: fmtBytes(size.flac) },
          ]}
          onChange={setQuality}
          label={`Offline quality for ${name}`}
        />
      )}
    </div>
  )
}
