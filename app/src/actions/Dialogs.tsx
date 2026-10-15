/**
 * New playlist / Edit playlist dialogs (handoff 15: 460px, radius 20, #141416, scrim 0.6).
 *
 *   NEW PLAYLIST                                    ×
 *   [96px mosaic]  [ Name it            ]
 *                  STARTS WITH BLACK RAINBOW
 *                                      Cancel  [Create]
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { MosaicTiles, PlaylistCover } from '../pages/playlists/PlaylistCover'
import { useLibrary } from '../state/library'
import { playlistsStore, usePlaylists } from '../state/playlists'
import { useSession } from '../state/session'
import { actions } from './actions'
import { createPlaylist } from './ops'

function Shell({ label, children, onClose, wide }: { label: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return (
    <>
      <div className={`dlg-scrim pg-anim ${on ? 'is-on' : ''}`} onClick={onClose} />
      <div className={`dlg pg-anim ${on ? 'is-on' : ''} ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="dlg-top">
          <div className="dlg-label">{label.toUpperCase()}</div>
          <button type="button" className="dlg-x" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

function MiniTile({ id }: { id?: string }) {
  const url = useCover(id)
  return <div className="plc-one">{url && <img className="plc-full" src={url} alt="" />}</div>
}

export function NewPlaylistDialog({ trackIds, hint, open, name: initial }: { trackIds: string[]; hint: string; open: boolean; name?: string }) {
  const toast = useToast()
  const { data } = useLibrary()
  const [name, setName] = useState(initial ?? '')
  const covers = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const id of trackIds) {
      const t = data?.tracks[id]
      if (!t || seen.has(t.albumId)) continue
      seen.add(t.albumId)
      const c = data?.albums[t.albumId]?.cover
      if (c) out.push(c)
      if (out.length === 4) break
    }
    return out
  }, [data, trackIds])
  const create = () => {
    if (!name.trim()) return
    actions.closeDialog()
    createPlaylist(toast, name, trackIds, open)
  }
  return (
    <Shell label="New playlist" onClose={() => actions.closeDialog()}>
      <form
        className="dlg-new"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <div className="dlg-new-row">
          <div className={`plc dlg-new-cover ${covers.length > 1 ? 'is-mosaic' : covers.length ? '' : 'is-empty'}`}>
            {covers.length > 1 ? <MosaicTiles covers={covers} /> : covers.length ? <MiniTile id={covers[0]} /> : <Icon name="playlist" />}
          </div>
          <div className="dlg-new-field">
            <input className="dlg-input dlg-input-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it" autoFocus maxLength={120} enterKeyHint="done" />
            <div className="dlg-hint">{trackIds.length ? hint : 'EMPTY · ADD SONGS FROM ANY ALBUM'}</div>
          </div>
        </div>
        <div className="dlg-buttons">
          <button type="button" className="dlg-cancel" onClick={() => actions.closeDialog()}>
            Cancel
          </button>
          <button type="submit" className="dlg-ok" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </Shell>
  )
}

/** Fit the picked image into a 600px square JPEG (centre crop), like the album covers. */
async function squareJpeg(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const out = Math.min(600, side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = out
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image.'))), 'image/jpeg', 0.9))
}

export function EditPlaylistDialog({ playlistId }: { playlistId: string }) {
  const toast = useToast()
  const { byId } = usePlaylists()
  const session = useSession()
  const p = byId.get(playlistId)
  const [name, setName] = useState(p?.name ?? '')
  const [desc, setDesc] = useState(p?.description ?? '')
  /** null = unchanged, 'mosaic' = drop the custom cover, Blob = new image */
  const [cover, setCover] = useState<Blob | 'mosaic' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const online = session.status === 'signed-in' && navigator.onLine

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  if (!p) return null

  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      const jpeg = await squareJpeg(f)
      setCover(jpeg)
      setPreview(URL.createObjectURL(jpeg))
    } catch {
      toast.show({ icon: 'alert', tone: 'danger', text: 'Couldn’t read that image.' })
    }
  }

  const save = () => {
    if (!name.trim()) return
    playlistsStore.rename(p.id, name)
    playlistsStore.setDescription(p.id, desc)
    actions.closeDialog()
    if (cover === 'mosaic') void playlistsStore.setCover(p.id, null)
    else if (cover) {
      const id = toast.show({ icon: 'upload', text: `Uploading the cover of ${name.trim()}…`, duration: 0 })
      playlistsStore
        .setCover(p.id, cover)
        .then(() => toast.update(id, { icon: 'check', text: `New cover for ${name.trim()}.`, duration: 3000 }))
        .catch(() => toast.update(id, { icon: 'alert', tone: 'danger', text: 'Couldn’t upload the cover to Drive.', meta: 'TRY AGAIN ONLINE', duration: 6000 }))
    }
  }

  const showCustom = cover instanceof Blob ? preview : cover === 'mosaic' ? null : undefined
  return (
    <Shell label="Edit playlist" onClose={() => actions.closeDialog()} wide>
      <form
        className="dlg-edit"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="dlg-edit-cover">
          {showCustom ? (
            <div className="plc dlg-edit-img">
              <img className="plc-full" src={showCustom} alt="" />
            </div>
          ) : (
            <PlaylistCover playlist={showCustom === null ? { ...p, cover: null } : p} className="dlg-edit-img" />
          )}
          <div className="dlg-edit-cover-btns">
            <button type="button" className="dlg-link" disabled={!online} title={online ? undefined : 'Needs a connection to Drive'} onClick={() => file.current?.click()}>
              {p.cover || cover instanceof Blob ? 'Change image' : 'Choose image'}
            </button>
            {(cover instanceof Blob || (p.cover && cover !== 'mosaic')) && (
              <button type="button" className="dlg-link" onClick={() => setCover(cover instanceof Blob && !p.cover ? null : 'mosaic')}>
                Use mosaic
              </button>
            )}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        <div className="dlg-edit-fields">
          <label className="dlg-field">
            <span className="dlg-hint">NAME</span>
            <input className="dlg-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="dlg-field">
            <span className="dlg-hint">DESCRIPTION</span>
            <textarea className="dlg-input dlg-textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Add a description" rows={3} maxLength={300} />
          </label>
        </div>
        <div className="dlg-buttons">
          <button type="button" className="dlg-cancel" onClick={() => actions.closeDialog()}>
            Cancel
          </button>
          <button type="submit" className="dlg-ok" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Shell>
  )
}
