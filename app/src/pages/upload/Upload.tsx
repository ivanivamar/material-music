/**
 * Upload — Batch (design_handoff_upload_batch, step 24).
 *
 * Header: live summary kicker + "Upload", and a compact "drop more" strip on the right.
 * Left: the release list (select-all, filter pills, Upload / Pause all / Resume), rows, and a footer with
 * the overall progress and a status line. Right: the inspector (one release, or several when 2+ are
 * ticked). Dragging files anywhere over the page shows a full drop overlay. Nothing in the batch →
 * empty state with one big drop zone.
 * Below 980px (and on the phone) everything stacks in one column and the page scrolls.
 */
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Button, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useLibrary } from '../../state/library'
import { addFiles, useUpload, type DroppedFile } from '../../state/upload'
import { batchView } from '../../state/uploadViews'
import { plural } from '../../state/views'
import { PageHeader } from '../PageHeader'
import { Inspector } from './Inspector'
import { ReleaseList } from './ReleaseList'
import './upload.css'

export function Upload() {
  const s = useUpload()
  const cat = useLibrary().data
  const pick = usePickers()
  const drag = useDropTarget(pick.add)
  const empty = s.albums.length === 0
  const view = batchView(s, cat)

  return (
    <div className={`ub ${empty ? 'is-empty' : ''}`} {...drag.handlers}>
      {empty ? (
        <EmptyState reading={s.reading} onFolders={pick.folders} onFiles={pick.files} />
      ) : (
        <>
          <PageHeader
            meta={view.head}
            title="Upload"
            tools={
              <div className="ub-strip">
                <span className="ub-strip-ic" aria-hidden>
                  <Icon name="upload" />
                </span>
                <span className="ub-strip-text">Drop more folders or files. They join this batch.</span>
                <Button variant="secondary" size="sm" className="ub-strip-btn" onClick={pick.folders}>
                  Choose folders
                </Button>
              </div>
            }
          />
          {s.opus === false && (
            <div className="ub-alert" role="status">
              <Icon name="alert" />
              <span>This browser can’t encode Opus, so tracks go up as FLAC only and the phone streams the FLAC. Chrome or Edge make the Opus copies.</span>
            </div>
          )}
          <div className="ub-body">
            <ReleaseList s={s} cat={cat} view={view} />
            <Inspector s={s} cat={cat} onPickMissing={pick.missing} />
          </div>
        </>
      )}
      {drag.info && <DropOverlay info={drag.info} />}
      {pick.inputs}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────── */

function EmptyState({ reading, onFolders, onFiles }: { reading: number; onFolders: () => void; onFiles: () => void }) {
  return (
    <>
      <PageHeader meta="FLAC · TAGS AND COVER ART READ FROM THE FILES" title="Upload" />
      <div className="ub-zone">
        <div className="ub-tile" aria-hidden>
          <Icon name="upload" />
        </div>
        <div className="ub-zone-text">
          <h2 className="ub-zone-title">Drop albums, EPs and singles</h2>
          <p className="ub-zone-sub">Drop as many folders or files as you like. They’re sorted into releases using their tags, and releases with no problems are added to your library automatically.</p>
        </div>
        <div className="ub-zone-btns">
          <Button className="ub-btn-44" onClick={onFolders}>
            Choose folders
          </Button>
          <Button variant="secondary" className="ub-btn-44" onClick={onFiles}>
            Choose files
          </Button>
        </div>
        <div className="ub-zone-hint">{reading > 0 ? `READING ${plural(reading, 'FILE')}…` : 'ONE FOLDER PER RELEASE WORKS BEST · LOOSE FILES ARE GROUPED BY TAGS'}</div>
      </div>
    </>
  )
}

/* ── Drop overlay ───────────────────────────────────── */

interface DragInfo {
  folders: number
  files: number
}

function dropText({ folders, files }: DragInfo): string {
  const f = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (!folders && !files) return 'Drop folders or files'
  if (!files) return `Drop ${f(folders, 'folder')}`
  if (!folders) return `Drop ${f(files, 'file')}`
  return `Drop ${f(folders, 'folder')} and ${f(files, 'file')}`
}

function DropOverlay({ info }: { info: DragInfo }) {
  return (
    <div className="ub-overlay" aria-hidden>
      <div className="ub-overlay-box">
        <div className="ub-tile ub-tile-lit">
          <Icon name="upload" />
        </div>
        <div className="ub-overlay-title">{dropText(info)}</div>
        <div className="ub-overlay-sub">They’ll be sorted into releases and added to the batch below.</div>
      </div>
    </div>
  )
}

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

/**
 * Files dragged over the page → overlay; dropped → walked and added. While dragging, browsers only tell
 * an item's MIME type, not whether it's a folder: an item without a type is counted as a folder.
 */
function useDropTarget(add: (files: DroppedFile[]) => void) {
  const [info, setInfo] = useState<DragInfo | null>(null)
  const depth = useRef(0)

  // a file dropped outside the page must not navigate the app away
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

  const isFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      depth.current++
      if (depth.current === 1) {
        const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file')
        const folders = items.filter((i) => !i.type).length
        setInfo({ folders, files: items.length - folders })
      }
    },
    onDragOver: (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: DragEvent) => {
      if (!isFiles(e)) return
      if (--depth.current <= 0) {
        depth.current = 0
        setInfo(null)
      }
    },
    onDrop: (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setInfo(null)
      // entries must be taken synchronously, inside the event
      const entries = [...e.dataTransfer.items].map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null))
      const plain = [...e.dataTransfer.files]
      void (async () => {
        const out: DroppedFile[] = []
        if (entries.some(Boolean)) {
          for (const en of entries) if (en) await walk(en, out)
        } else for (const f of plain) out.push({ file: f, rel: f.name })
        add(out)
      })()
    },
  }
  return { info, handlers }
}

/* ── Pickers ────────────────────────────────────────── */

function usePickers() {
  const toast = useToast()
  const folderInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const missingInput = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)

  const add = (files: DroppedFile[], into?: string) => {
    void addFiles(files, into).then((r) => {
      if (!r.added && files.length) toast.show({ icon: 'alert', mutedIcon: true, text: into ? 'That file couldn’t be added.' : 'Nothing to add from that drop.', meta: 'FLAC FILES ONLY' })
    })
  }
  const onPick = (e: FormEvent<HTMLInputElement>, into?: string) => {
    const input = e.currentTarget
    const files = [...(input.files ?? [])]
    add(
      files.map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })),
      into,
    )
    input.value = ''
  }
  return {
    add: (files: DroppedFile[]) => add(files),
    folders: () => folderInput.current?.click(),
    files: () => fileInput.current?.click(),
    /** "Add missing file": the picked FLACs join this release */
    missing: (key: string) => {
      target.current = key
      missingInput.current?.click()
    },
    inputs: (
      <>
        <input ref={folderInput} type="file" hidden multiple onChange={(e) => onPick(e)} {...{ webkitdirectory: '', directory: '' }} />
        <input ref={fileInput} type="file" hidden multiple accept=".flac,audio/flac,image/jpeg,image/png,image/webp" onChange={(e) => onPick(e)} />
        <input ref={missingInput} type="file" hidden multiple accept=".flac,audio/flac" onChange={(e) => onPick(e, target.current ?? undefined)} />
      </>
    ),
  }
}
