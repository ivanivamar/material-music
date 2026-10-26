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
import { Segmented, useToast } from '../../components/ui'
import { OfflineBlock } from './detail'
import { albumBytes, albumOffline, downloadsStore, qualityOf, storedFileOf, useDownloads, type DownloadQuality } from '../../state/downloads'
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { fmtBytes } from '../../state/views'
import { waitingReason } from './DownloadButton'

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
  // only some songs wanted: through playlist downloads, or songs downloaded on their own (track menu)
  const viaPlaylist = dl.prefs.pins.some((p) => p.kind === 'playlist')
  const viaSongs = tracks.some((t) => dl.prefs.pins.some((p) => p.kind === 'track' && p.id === t.id))
  const from = viaSongs && !viaPlaylist ? 'songs only' : viaSongs ? 'songs and playlists' : 'from playlists'
  const of = (a: number, b: number) => `${a} of ${b} ${b === 1 ? 'track' : 'tracks'}`
  if (!on) status = off.partial && off.done ? `${of(off.done, tracks.length)} · ${from}` : `Stream only · ${fmtBytes(size[hasOpus ? q : 'flac'])}`
  else if (off.complete) status = `${of(off.count, off.count)} · stored · ${fmtBytes(off.bytesDone)}`
  else {
    const why = waitingReason(dl)
    const switching = playable > off.done
    status = `${of(off.done, off.count)} · ${why ? why.charAt(0) + why.slice(1).toLowerCase() : switching ? `switching to ${q === 'flac' ? 'FLAC' : 'Opus'}` : `downloading track ${off.done + 1}`}`
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
    <OfflineBlock
      status={status}
      checked={on}
      onChange={toggle}
      label={`Keep ${name} on this phone`}
      extra={
        hasOpus && (
          <Segmented
            value={q}
            options={[
              { value: 'opus', label: 'Opus 160', meta: fmtBytes(size.opus) },
              { value: 'flac', label: 'FLAC', meta: fmtBytes(size.flac) },
            ]}
            onChange={setQuality}
            label={`Offline quality for ${name}`}
          />
        )
      }
    />
  )
}

/** Playlist / artist "Available offline": the switch pins it, switching off removes it (with Undo). */
export function PinOfflineToggle({ state, name, onPin, onRemove }: { state: import('../../state/downloads').AlbumOffline; name: string; onPin: () => void; onRemove: () => void }) {
  const toast = useToast()
  const dl = useDownloads()
  const of = (a: number, b: number) => `${a} of ${b} ${b === 1 ? 'track' : 'tracks'}`
  const why = waitingReason(dl)
  const status = !state.wanted
    ? state.done
      ? `${of(state.done, state.count)} stored`
      : 'Stream only'
    : state.complete
      ? `${of(state.count, state.count)} · stored · ${fmtBytes(state.bytesDone)}`
      : `${of(state.done, state.count)} · ${why ? why.charAt(0) + why.slice(1).toLowerCase() : `downloading track ${state.done + 1}`}`
  const toggle = (next: boolean) => {
    if (next) return onPin()
    const before = downloadsStore.get().prefs
    onRemove()
    toast.show({
      icon: 'x',
      mutedIcon: true,
      text: `Removed ${name} from this phone.`,
      meta: state.bytesDone ? `${fmtBytes(state.bytesDone)} FREED` : undefined,
      action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
    })
  }
  return <OfflineBlock status={status} checked={state.wanted} onChange={toggle} label={`Keep ${name} on this phone`} />
}
