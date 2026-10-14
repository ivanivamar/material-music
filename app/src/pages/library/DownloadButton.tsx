/**
 * Offline downloads (phase D, Android): the album / artist Download button and the per-track state.
 *
 *   Download            nothing stored → pins the album / artist
 *   ◔ 07/11             downloading (ring = bytes) → tap removes, with Undo
 *   ✓ Downloaded        complete → tap removes, with Undo
 *
 * Rendered only in the Android app (`downloads.available`).
 */
import { Button, ProgressRing, useToast, type DownloadState } from '../../components/ui'
import { downloadsStore, useDownloadProgress, type AlbumOffline, type DownloadsState } from '../../state/downloads'
import type { Track } from '../../state/library'
import { fmtBytes } from '../../state/views'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Why a wanted download isn't moving (null = it is, or nothing to wait for). */
export function waitingReason(s: DownloadsState): string | null {
  const n = s.native
  if (!n || n.pending === 0) return null
  if (n.error === 'storage') return 'PHONE STORAGE FULL'
  if (n.error === 'auth') return 'SIGN IN TO CONTINUE'
  if (n.paused) return 'PAUSED'
  if (n.network === 'none') return 'WAITING FOR A CONNECTION'
  if (n.wifiOnly && n.network !== 'wifi') return 'WAITING FOR WI-FI'
  if (!n.running) return 'QUEUED'
  return null
}

export function DownloadButton({ state, name, onPin, onRemove }: { state: AlbumOffline; name: string; onPin: () => void; onRemove: () => void }) {
  const toast = useToast()
  const s = downloadsStore.get()
  useDownloadProgress() // live ring while a file of this album downloads

  const remove = () => {
    const before = s.prefs
    onRemove()
    toast.show({
      icon: 'x',
      mutedIcon: true,
      text: `Removed ${name} from this phone.`,
      meta: state.bytesDone ? `${fmtBytes(state.bytesDone)} FREED` : undefined,
      action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
    })
  }

  if (!state.wanted)
    return (
      <Button variant="secondary" icon="download" className="actions-dl" onClick={onPin} title="Keep on this phone for offline listening" aria-label={`Download ${name}`}>
        <span className="actions-dl-label">Download</span>
      </Button>
    )
  if (state.complete)
    return (
      <Button variant="secondary" icon="check" className="actions-dl is-done" onClick={remove} title={`Stored offline · ${fmtBytes(state.bytesDone)} · tap to remove`} aria-label={`Downloaded. Remove ${name} from this phone`}>
        <span className="actions-dl-label">Downloaded</span>
      </Button>
    )
  const why = waitingReason(s)
  const ratio = state.bytes ? state.bytesDone / state.bytes : state.count ? state.done / state.count : 0
  return (
    <button type="button" className="btn btn-secondary actions-dl is-busy" onClick={remove} title={`${why ?? 'Downloading'} · tap to cancel`}>
      <span className="btn-ic">
        <ProgressRing progress={ratio} size={20} />
      </span>
      <span className="t-mono actions-dl-count">
        {pad2(state.done)}/{pad2(state.count)}
      </span>
    </button>
  )
}

/** Track-row status cell: ✓ stored, ring while queued / downloading, empty when not kept offline. */
export function trackDownload(s: DownloadsState, t: Track, current: { id: string; bytes: number; total: number } | null): DownloadState | undefined {
  const ap = s.plan.byAlbum.get(t.albumId)
  const fid = ap?.trackFiles.get(t.id)
  if (fid && s.stored.has(fid)) return { kind: 'done' }
  if (!fid) return (t.mobile?.id && s.stored.has(t.mobile.id)) || s.stored.has(t.flac?.id) ? { kind: 'done' } : undefined
  if (current?.id === fid && current.total > 0) return { kind: 'downloading', progress: current.bytes / current.total }
  return { kind: 'downloading', progress: 0 }
}
