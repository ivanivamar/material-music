/**
 * Upload (handoff 09 Desktop Upload: "drop, match, confirm"; step 10).
 *
 * Left: drop zone (files or whole album folders; Choose folder / Choose files) and the file list,
 * grouped by album — per file a progress line and READING / READY / ALREADY IN LIBRARY / ENCODING
 * OPUS · 40% / UPLOADING · 62% / ADDED · 41 MB / FAILED. Header: IN PROGRESS · 4 OF 10 and
 * 412 MB · ABOUT 1 MIN LEFT.
 * Right: the matched-album panel for the selected album — cover, quality badge, NEW ALBUM or
 * MATCHED ALBUM (adding to one already in the library), album artist / album / year / genre,
 * tracks found, size; Add to library · Edit tags (album-level tags, applied to the catalogue and
 * the Opus copies).
 * Phone layout: one column, panel above the list.
 */
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Button, IconButton, ProgressRing, QualityBadge, qualityKind, qualityLabel, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useCover } from '../../lib/covers'
import { useLibrary } from '../../state/library'
import {
  addFiles,
  cancel,
  clearFinished,
  editAlbum,
  removeAlbum,
  select,
  start,
  useUpload,
  type DroppedFile,
  type UploadAlbum,
  type UploadItem,
  type UploadState,
} from '../../state/upload'
import { fmtBytes, monogram, plural } from '../../state/views'
import { albumHref, go } from '../../shell/routes'
import { PageHeader } from '../PageHeader'
import './upload.css'

export function Upload() {
  const s = useUpload()
  const albums = s.albums
  const sel = albums.find((a) => a.key === s.selected) ?? albums.find((a) => a.key !== '!unreadable') ?? null
  const real = Object.values(s.items).filter((i) => i.state !== 'invalid')
  const meta = albums.length
    ? `${plural(albums.filter((a) => a.key !== '!unreadable').length, 'ALBUM')} · ${plural(real.length, 'TRACK')} · ${fmtBytes(real.reduce((n, i) => n + i.size, 0))}`
    : 'FLAC · TAGS AND COVER ART READ FROM THE FILES'

  return (
    <div className="upload">
      <PageHeader meta={meta} title="Upload" />
      {s.opus === false && (
        <div className="up-alert" role="status">
          <Icon name="alert" />
          <span>This browser can’t encode Opus, so tracks go up as FLAC only and the phone streams the FLAC. Chrome or Edge make the Opus copies.</span>
        </div>
      )}
      <div className={`up-grid ${sel ? 'has-panel' : ''}`}>
        <div className="up-main">
          <DropZone reading={s.reading} compact={albums.length > 0} />
          {albums.length > 0 && <FileList s={s} selected={sel?.key ?? null} />}
          {albums.length === 0 && s.reading === 0 && <Explainer />}
        </div>
        {sel && <Panel key={sel.key} a={sel} s={s} />}
      </div>
    </div>
  )
}

function Explainer() {
  return (
    <div className="up-explain">
      <div className="up-explain-row">
        <span className="up-explain-k">01</span>
        <span>Drop FLAC files or album folders. Tags, lyrics and the cover come from the files — nothing to fill in.</span>
      </div>
      <div className="up-explain-row">
        <span className="up-explain-k">02</span>
        <span>Check the matched album. Tracks already in your library are skipped.</span>
      </div>
      <div className="up-explain-row">
        <span className="up-explain-k">03</span>
        <span>Add to library: the FLAC goes to Drive with an Opus 160 copy for the phone, made right here.</span>
      </div>
    </div>
  )
}

/* ── Drop zone ──────────────────────────────────────── */

async function walk(entry: FileSystemEntry, out: DroppedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ file, rel: entry.fullPath.replace(/^\/+/, '') })
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (!batch.length) break
    for (const e of batch) if (!e.name.startsWith('.') && !e.name.startsWith('$')) await walk(e, out)
  }
}

function DropZone({ reading, compact }: { reading: number; compact: boolean }) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const folderInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // a file dropped next to the zone must not navigate the app away
  useEffect(() => {
    const stop = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    // entries must be taken synchronously, inside the event
    const entries = [...e.dataTransfer.items].map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null))
    const plain = [...e.dataTransfer.files]
    void (async () => {
      const out: DroppedFile[] = []
      if (entries.some(Boolean)) {
        for (const en of entries) if (en) await walk(en, out)
      }
      else for (const f of plain) out.push({ file: f, rel: f.name })
      await addFiles(out)
    })()
  }
  const onPick = (e: FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const files = [...(input.files ?? [])]
    void addFiles(files.map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })))
    input.value = ''
  }

  return (
    <div
      className={`up-drop ${over ? 'is-over' : ''} ${compact ? 'is-compact' : ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        depth.current++
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        if (--depth.current <= 0) {
          depth.current = 0
          setOver(false)
        }
      }}
      onDrop={onDrop}
    >
      <div className="up-drop-ic" aria-hidden>
        <Icon name="upload" />
      </div>
      <div className="up-drop-text">
        <div className="up-drop-title">{over ? 'Let go to add them' : 'Drop files or a whole album folder'}</div>
        <div className="up-drop-sub">{reading > 0 ? <span className="up-mono">READING {plural(reading, 'FILE')}…</span> : compact ? 'Tags and covers come from the files.' : 'Tags and cover art are read from the files.'}</div>
      </div>
      <div className="up-drop-btns">
        <Button variant="secondary" size="sm" onClick={() => folderInput.current?.click()}>
          Choose folder
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
          Choose files
        </Button>
      </div>
      <input ref={folderInput} type="file" hidden multiple onChange={onPick} {...{ webkitdirectory: '', directory: '' }} />
      <input ref={fileInput} type="file" hidden multiple accept=".flac,audio/flac,image/jpeg,image/png,image/webp" onChange={onPick} />
    </div>
  )
}

/* ── File list ──────────────────────────────────────── */

function eta(s: UploadState): string | null {
  const r = s.run
  if (!r || !r.speed || r.speed <= 0) return null
  const sec = Math.max(0, (r.total - r.sent) / r.speed)
  if (sec < 50) return 'UNDER A MINUTE LEFT'
  const min = Math.round(sec / 60)
  return min < 90 ? `ABOUT ${min} MIN LEFT` : `ABOUT ${Math.round(min / 60)} H LEFT`
}

function FileList({ s, selected }: { s: UploadState; selected: string | null }) {
  const items = Object.values(s.items)
  const inRun = items.filter((i) => ['queued', 'encoding', 'uploading', 'uploaded'].includes(i.state))
  const finished = s.albums.filter((a) => a.state === 'running').flatMap((a) => a.itemIds.map((i) => s.items[i])).filter((i) => i.state === 'done' || i.state === 'uploaded' || i.state === 'error')
  const reviewing = s.albums.filter((a) => a.state === 'review' && a.key !== '!unreadable')
  const ready = items.filter((i) => i.state === 'ready')
  const anyDone = s.albums.some((a) => a.state === 'done' || a.key === '!unreadable')

  let left: string
  let right: string | null = null
  if (s.running) {
    const total = inRun.length + finished.filter((i) => i.state !== 'uploaded').length
    left = `IN PROGRESS · ${Math.min(total, finished.length + 1)} OF ${total}`
    const remaining = s.run ? Math.max(0, s.run.total - s.run.sent) : 0
    right = [remaining > 0 && fmtBytes(remaining), eta(s)].filter(Boolean).join(' · ') || null
  } else if (ready.length) {
    left = `READY · ${plural(ready.length, 'TRACK')}`
    right = fmtBytes(ready.reduce((n, i) => n + i.size, 0))
  } else {
    left = `${plural(items.filter((i) => i.state === 'done').length, 'TRACK')} ADDED`
  }

  return (
    <section className="up-list" aria-label="Files">
      <div className="up-list-head">
        <span className="up-list-left">{left}</span>
        <span className="up-list-right">
          {right}
          {s.running ? (
            <button type="button" className="up-link" onClick={cancel}>
              CANCEL
            </button>
          ) : (
            reviewing.length > 1 && (
              <button type="button" className="up-link" onClick={() => start()}>
                ADD ALL {reviewing.length} ALBUMS
              </button>
            )
          )}
        </span>
      </div>
      {[...s.albums.filter((a) => a.key !== '!unreadable'), ...s.albums.filter((a) => a.key === '!unreadable')].map((a) => (
        <AlbumGroup key={a.key} a={a} s={s} on={a.key === selected} />
      ))}
      {(s.skipped > 0 || anyDone) && (
        <div className="up-list-foot">
          <span>{s.skipped > 0 ? `${plural(s.skipped, 'FILE')} SKIPPED · NOT FLAC` : ''}</span>
          {anyDone && !s.running && (
            <button type="button" className="up-link" onClick={clearFinished}>
              CLEAR FINISHED
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function AlbumGroup({ a, s, on }: { a: UploadAlbum; s: UploadState; on: boolean }) {
  const items = a.itemIds.map((i) => s.items[i]).filter(Boolean)
  const lib = useLibrary().data
  const cover = useCover(a.coverUrl ? null : lib?.albums[a.albumId]?.cover)
  const art = a.coverUrl ?? cover
  const fresh = items.filter((i) => i.state !== 'dup' && i.state !== 'invalid').length
  const todo = items.filter((i) => i.state === 'ready' || i.state === 'reading').length
  const status =
    a.key === '!unreadable'
      ? plural(items.length, 'FILE')
      : a.state === 'done'
        ? 'ADDED'
        : a.state === 'running'
          ? 'UPLOADING'
          : a.state === 'error'
            ? `${plural(items.filter((i) => i.state === 'error').length, 'TRACK')} FAILED`
            : todo === 0 && items.length
              ? fresh === 0
                ? 'ALREADY IN LIBRARY'
                : 'ADDED'
              : `${a.inLibrary ? 'ADDING TO ALBUM' : 'NEW ALBUM'} · ${plural(todo, 'TRACK')}`
  return (
    <div className={`up-album ${on ? 'is-on' : ''}`}>
      <div className="up-ahead">
        <button type="button" className="up-ahead-main" onClick={() => a.key !== '!unreadable' && select(a.key)} aria-pressed={on}>
          <span className="up-ahead-cover">{art ? <img src={art} alt="" /> : <span>{a.key === '!unreadable' ? '!' : monogram(a.title)}</span>}</span>
          <span className="up-ahead-text">
            <span className="up-ahead-title">{a.title}</span>
            <span className="up-ahead-sub">{a.artist}</span>
          </span>
          <span className={`up-ahead-status ${a.state === 'error' ? 'is-bad' : ''}`}>{status}</span>
        </button>
        {a.state !== 'running' && <IconButton icon="x" label={`Remove ${a.title} from the list`} size="sm" shape="square" onClick={() => removeAlbum(a.key)} />}
      </div>
      {items.map((it) => (
        <Row key={it.id} it={it} />
      ))}
    </div>
  )
}

function rowStatus(it: UploadItem): string {
  const pct = `${Math.floor(it.progress * 100)}%`
  switch (it.state) {
    case 'reading':
      return 'READING'
    case 'ready':
      return `READY · ${fmtBytes(it.size)}`
    case 'dup':
      return it.dup === 'batch' ? 'DUPLICATE IN THIS UPLOAD' : 'ALREADY IN LIBRARY'
    case 'invalid':
      return 'NOT A READABLE FLAC'
    case 'queued':
      return 'QUEUED'
    case 'encoding':
      return `ENCODING OPUS · ${pct}`
    case 'uploading':
      return `UPLOADING · ${pct}`
    case 'uploaded':
      return 'ADDING TO LIBRARY'
    case 'done':
      return `ADDED · ${fmtBytes(it.size)}`
    case 'error':
      return 'FAILED'
  }
}

function Row({ it }: { it: UploadItem }) {
  const busy = it.state === 'encoding' || it.state === 'uploading' || it.state === 'uploaded'
  const muted = it.state === 'dup' || it.state === 'queued' || it.state === 'invalid' || it.state === 'reading'
  const fill = it.state === 'done' ? 1 : busy ? it.progress : 0
  let ic
  if (it.state === 'done') ic = <Icon name="check" />
  else if (busy) ic = <ProgressRing progress={it.progress} size={16} />
  else if (it.state === 'dup' || it.state === 'invalid') ic = <Icon name="x" />
  else if (it.state === 'error') ic = <Icon name="alert" />
  else ic = <span className="up-dot" />
  return (
    <div className={`up-row is-${it.state} ${muted ? 'is-muted' : ''}`} title={it.error ?? it.rel}>
      <span className="up-row-ic">{ic}</span>
      <span className="up-row-name">{it.meta ? <TrackName it={it} /> : it.name}</span>
      <span className="up-row-line" aria-hidden>
        <span style={{ width: `${fill * 100}%` }} className={busy ? 'is-live' : ''} />
      </span>
      <span className="up-row-st">{rowStatus(it)}</span>
      {it.state === 'error' && it.error && <span className="up-row-err">{it.error}</span>}
    </div>
  )
}

function TrackName({ it }: { it: UploadItem }) {
  const m = it.meta!
  const n = m.track ? String(m.track).padStart(2, '0') : '··'
  return (
    <>
      <span className="up-row-n">{m.disc > 1 ? `${m.disc}-${n}` : n}</span>
      {m.title}
      <span className="up-row-file">{it.name}</span>
    </>
  )
}

/* ── Matched-album panel ────────────────────────────── */

function Panel({ a, s }: { a: UploadAlbum; s: UploadState }) {
  const toast = useToast()
  const lib = useLibrary().data
  const libCover = useCover(a.coverUrl ? null : lib?.albums[a.albumId]?.cover)
  const art = a.coverUrl ?? libCover
  const [editing, setEditing] = useState(false)
  const items = a.itemIds.map((i) => s.items[i]).filter(Boolean)
  const fresh = items.filter((i) => i.state !== 'dup' && i.state !== 'invalid')
  const dups = items.filter((i) => i.state === 'dup').length
  const bytes = fresh.reduce((n, i) => n + i.size, 0)
  const bitDepth = Math.max(16, ...items.map((i) => i.meta?.bitDepth ?? 16))
  const sampleRate = Math.max(44100, ...items.map((i) => i.meta?.sampleRate ?? 44100))
  const failed = items.filter((i) => i.state === 'error').length
  const done = items.filter((i) => i.state === 'done').length
  const found = items.filter((i) => i.state !== 'invalid').length

  const head =
    a.state === 'done'
      ? 'ADDED TO YOUR LIBRARY'
      : a.state === 'running'
        ? `UPLOADING · ${done + items.filter((i) => i.state === 'uploaded').length} OF ${fresh.length}`
        : a.state === 'error'
          ? `${plural(failed, 'TRACK')} FAILED`
          : a.inLibrary
            ? 'MATCHED ALBUM'
            : 'NEW ALBUM'

  // TRACKTOTAL counts one disc, so "n of N" only for single-disc albums
  const tracks = a.trackTotal && found <= a.trackTotal && !(a.discTotal && a.discTotal > 1) ? `${found} of ${a.trackTotal} found` : `${found} found`
  const rows: [string, string][] = [
    ['ALBUM ARTIST', a.artist],
    ['ALBUM', a.title],
    ['YEAR', a.year ? String(a.year) : '—'],
    ['GENRE', a.genre ?? '—'],
    ['TRACKS', dups ? `${tracks} · ${dups} already in library` : tracks],
    ['SIZE', `${fmtBytes(bytes || items.reduce((n, i) => n + i.size, 0))} FLAC`],
  ]

  const add = () => {
    if (!fresh.some((i) => i.state === 'ready' || i.state === 'error')) {
      toast.show({ icon: 'check', mutedIcon: true, text: `Every track of ${a.title} is already in your library.`, meta: 'NOTHING TO ADD' })
      return
    }
    start(a.key)
  }

  return (
    <aside className="up-panel" aria-label="Matched album">
      <div className="up-panel-top">
        <span className={`up-panel-k ${a.state === 'error' ? 'is-bad' : ''}`}>{head}</span>
        <QualityBadge kind={qualityKind('flac', bitDepth, sampleRate)}>{qualityLabel('flac', { bitDepth, sampleRate })}</QualityBadge>
      </div>
      <div className="up-panel-album">
        <span className="up-panel-cover">{art ? <img src={art} alt="" /> : <span>{monogram(a.title)}</span>}</span>
        <div className="up-panel-names">
          <div className="up-panel-title">{a.title}</div>
          <div className="up-panel-artist">{a.artist}</div>
          {!art && <div className="up-panel-nocover">NO COVER IN THE FILES</div>}
        </div>
      </div>

      {editing ? (
        <EditTags a={a} s={s} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="up-tags">
            {rows.map(([k, v]) => (
              <div key={k} className="up-tag">
                <span className="up-tag-k">
                  {k}
                  {((k === 'ALBUM ARTIST' && a.edits.albumArtist !== undefined) || (k === 'ALBUM' && a.edits.album !== undefined) || (k === 'YEAR' && a.edits.year !== undefined) || (k === 'GENRE' && a.edits.genre !== undefined)) && <i className="up-edited">EDITED</i>}
                </span>
                <span className="up-tag-v">{v}</span>
              </div>
            ))}
          </div>
          <div className="up-panel-btns">
            {a.state === 'review' && (
              <>
                <Button onClick={add} disabled={s.reading > 0}>
                  Add to library
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Edit tags
                </Button>
              </>
            )}
            {a.state === 'running' && (
              <Button variant="secondary" icon="x" onClick={cancel}>
                Cancel upload
              </Button>
            )}
            {a.state === 'error' && (
              <Button icon="refresh" onClick={() => start(a.key)} disabled={s.running}>
                Retry {plural(failed, 'track')}
              </Button>
            )}
            {(a.state === 'done' || (a.state === 'error' && done > 0)) && (
              <Button variant="secondary" onClick={() => go(albumHref(a.albumId))}>
                View album
              </Button>
            )}
          </div>
          {a.state === 'review' && s.opus && <p className="up-panel-note">Each track goes to Drive as FLAC, with an Opus 160 copy for the phone made on this device.</p>}
        </>
      )}
    </aside>
  )
}

function EditTags({ a, s, onDone }: { a: UploadAlbum; s: UploadState; onDone: () => void }) {
  const first = a.itemIds.map((i) => s.items[i]).find((i) => i?.meta)?.meta
  const [artist, setArtist] = useState(a.artist)
  const [album, setAlbum] = useState(a.title)
  const [year, setYear] = useState(a.year ? String(a.year) : '')
  const [genre, setGenre] = useState(a.genre ?? '')
  const yearOk = year === '' || /^\d{4}$/.test(year.trim())
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!yearOk || !artist.trim() || !album.trim()) return
    await editAlbum(a.key, { albumArtist: artist, album, year: year.trim() ? Number(year) : null, genre: genre.trim() || null })
    onDone()
  }
  const reset = async () => {
    await editAlbum(a.key, { albumArtist: first?.albumArtist, album: first?.album, year: first?.year ?? null, genre: first?.genre ?? null })
    onDone()
  }
  return (
    <form className="up-edit" onSubmit={save}>
      <label className="up-field">
        <span>ALBUM ARTIST</span>
        <input value={artist} onChange={(e) => setArtist(e.target.value)} autoFocus spellCheck={false} />
      </label>
      <label className="up-field">
        <span>ALBUM</span>
        <input value={album} onChange={(e) => setAlbum(e.target.value)} spellCheck={false} />
      </label>
      <div className="up-field-pair">
        <label className={`up-field ${yearOk ? '' : 'is-bad'}`}>
          <span>YEAR</span>
          <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" maxLength={4} placeholder="—" />
        </label>
        <label className="up-field">
          <span>GENRE</span>
          <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="—" />
        </label>
      </div>
      <p className="up-panel-note">Changes go into your library and the Opus copies. The FLAC files keep the tags they have.</p>
      <div className="up-panel-btns">
        <Button type="submit" disabled={!yearOk || !artist.trim() || !album.trim()}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        {Object.keys(a.edits).length > 0 && (
          <button type="button" className="up-link up-reset" onClick={() => void reset()}>
            USE FILE TAGS
          </button>
        )}
      </div>
    </form>
  )
}
