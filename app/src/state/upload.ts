/**
 * Upload (step 10): add FLAC albums to the library from the app, without the importer.
 *
 * Drop → read: each FLAC's header (tags, STREAMINFO, cover) is read in the browser and the files are
 * grouped into albums with the importer's ids; tracks already in the catalogue are marked and skipped.
 * Review: the matched-album panel shows what was found; album-level tags can be edited.
 * Add to library: per track, an Opus 160 copy is encoded in the browser (WebCodecs), then the FLAC
 * and the Opus go to Pelagic/library/… and Pelagic/mobile/… (same names as the importer). The cover
 * goes to covers/<albumId>.jpg if the album has none yet. The artist's photo/banner come from
 * artist.jpg / artist_background.jpg in the dropped artist folder, else Deezer (upload/artistImages.ts). When an album's tracks are through,
 * library.json is read fresh, merged and written back, and the app adopts the new catalogue.
 *
 * State lives in this module, so uploads keep going while browsing other pages (toast + sidebar
 * badge in the shell). Leaving the page while uploading asks first.
 */
import { useSyncExternalStore } from 'react'
import { AuthError } from '../lib/drive'
import { idbSet } from '../lib/idb'
import { readFlac, toMeta, idsFor, safeName, type FlacInfo, type TrackMeta } from '../upload/flac'
import { canEncodeOpus, flacToOpus } from '../upload/opus'
import { prepareArtist, type ArtistPatch, type ArtistSources } from '../upload/artistImages'
import { putFile, resetFolders, updateCatalogue, type Uploaded } from '../upload/driveWrite'
import { libraryStore, type Album, type Catalogue, type Track } from './library'
import { onAccountReset } from './session'

export type ItemState = 'reading' | 'ready' | 'dup' | 'invalid' | 'queued' | 'encoding' | 'uploading' | 'uploaded' | 'done' | 'error'
export type AlbumState = 'review' | 'running' | 'done' | 'error'

export interface UploadItem {
  id: number
  file: File
  /** path inside what was dropped, e.g. "Wing/Dopamine/01 - Intro.flac" (or just the name) */
  rel: string
  name: string
  size: number
  state: ItemState
  /** 0..1 over encode + both uploads */
  progress: number
  info: FlacInfo | null
  /** tags as read (album edits are applied on top, see effective()) */
  meta: TrackMeta | null
  trackId: string | null
  dup?: 'library' | 'batch'
  error?: string
  flac?: Uploaded
  mobile?: Uploaded
}

export interface AlbumEdits {
  albumArtist?: string
  album?: string
  year?: number | null
  genre?: string | null
}

export interface UploadAlbum {
  key: string
  /** after edits */
  albumId: string
  artistId: string
  title: string
  artist: string
  year?: number
  genre?: string
  trackTotal?: number
  discTotal?: number
  cover: Blob | null
  coverUrl: string | null
  /** artist.jpg / artist_background.jpg found in the artist's folder of the drop */
  artistPhoto?: File | null
  artistBg?: File | null
  /** catalogue already has this album (adding tracks to it) */
  inLibrary: boolean
  edits: AlbumEdits
  state: AlbumState
  itemIds: number[]
}

export interface UploadState {
  albums: UploadAlbum[]
  items: Record<number, UploadItem>
  selected: string | null
  /** files still being read */
  reading: number
  /** dropped files that aren't FLAC (images used as covers aren't counted) */
  skipped: number
  running: boolean
  /** browser can make the Opus copies (null = not checked yet) */
  opus: boolean | null
  /** this run: bytes (FLAC + Opus estimate) to send and sent, upload speed (bytes/s) */
  run: { total: number; sent: number; speed: number | null; started: number } | null
}

let state: UploadState = { albums: [], items: {}, selected: null, reading: 0, skipped: 0, running: false, opus: null, run: null }
const listeners = new Set<() => void>()
let notifyTimer = 0
function emit() {
  window.clearTimeout(notifyTimer)
  notifyTimer = 0
  listeners.forEach((l) => l())
}
function set(patch: Partial<UploadState>, throttle = false) {
  state = { ...state, ...patch }
  if (!throttle) emit()
  else if (!notifyTimer) notifyTimer = window.setTimeout(emit, 120)
}
function patchItem(id: number, p: Partial<UploadItem>, throttle = false) {
  const it = state.items[id]
  if (!it) return
  set({ items: { ...state.items, [id]: { ...it, ...p } } }, throttle)
}
function patchAlbum(key: string, p: Partial<UploadAlbum>) {
  set({ albums: state.albums.map((a) => (a.key === key ? { ...a, ...p } : a)) })
}

let seq = 0
void canEncodeOpus().then((opus) => set({ opus }))

/* ── Effective tags (tags + album edits) ────────────── */

export function effective(a: UploadAlbum, m: TrackMeta): TrackMeta {
  const e = a.edits
  const year = e.year === undefined ? m.year : (e.year ?? undefined)
  return {
    ...m,
    albumArtist: e.albumArtist ?? m.albumArtist,
    album: e.album ?? m.album,
    year,
    // a changed year replaces the date unless the date already starts with it
    date: e.year === undefined ? m.date : year && m.date?.startsWith(String(year)) ? m.date : year ? String(year) : undefined,
    genre: e.genre === undefined ? m.genre : (e.genre ?? undefined),
  }
}

/** The FLAC's Vorbis comments with the album edits written over them (for the Opus copy). */
function opusComments(a: UploadAlbum, it: UploadItem): [string, string][] {
  const e = a.edits
  const over: Record<string, string | null | undefined> = {}
  if (e.albumArtist !== undefined) over.ALBUMARTIST = e.albumArtist
  if (e.album !== undefined) over.ALBUM = e.album
  if (e.year !== undefined) over.DATE = e.year ? String(e.year) : null
  if (e.genre !== undefined) over.GENRE = e.genre
  const list = (it.info?.comments ?? []).filter(([k]) => !(k in over) && !(k === 'ALBUM ARTIST' && 'ALBUMARTIST' in over) && !(k === 'YEAR' && 'DATE' in over))
  for (const [k, v] of Object.entries(over)) if (v) list.push([k, v])
  return list
}

/* ── Adding files ───────────────────────────────────── */

export interface DroppedFile {
  file: File
  rel: string
}

const COVER_NAME = /^(cover|folder|front|album)\.(jpe?g|png|webp)$/i
const ARTIST_PHOTO = /^artist\.(jpe?g|png|webp)$/i
const ARTIST_BG = /^artist_background\.(jpe?g|png|webp)$/i
const dirOf = (rel: string) => rel.split('/').slice(0, -1).join('/')

/** artist.jpg / artist_background.jpg of a track's artist folder (…/Artist/Album/file → …/Artist, or the file's own folder). */
function artistFor(map: Map<string, ArtistSources>, rel: string): ArtistSources | null {
  const parts = rel.split('/').filter(Boolean)
  for (const dir of [parts.slice(0, -2).join('/'), parts.slice(0, -1).join('/')]) {
    const hit = dir ? map.get(dir) : undefined
    if (hit) return hit
  }
  return null
}

/** Files picked or dropped (folders already walked). */
export async function addFiles(dropped: DroppedFile[]) {
  const flacs = dropped.filter((d) => /\.flac$/i.test(d.file.name))
  const images = new Map<string, File>() // folder → cover image
  for (const d of dropped) if (COVER_NAME.test(d.file.name) && !images.has(dirOf(d.rel))) images.set(dirOf(d.rel), d.file)
  const artistImgs = new Map<string, ArtistSources>() // folder → artist photo / banner
  for (const d of dropped) {
    const dir = dirOf(d.rel)
    const photo = ARTIST_PHOTO.test(d.file.name)
    if (!dir || (!photo && !ARTIST_BG.test(d.file.name))) continue
    const e = artistImgs.get(dir) ?? {}
    if (photo) e.photo ??= d.file
    else e.bg ??= d.file
    artistImgs.set(dir, e)
  }
  const others = dropped.filter((d) => !/\.flac$/i.test(d.file.name) && !/\.(jpe?g|png|webp|gif|bmp|txt|log|cue|m3u8?|nfo|lrc|ini|db|ds_store)$/i.test(d.file.name)).length

  // skip files already in the list (same path + size), e.g. a folder dropped twice
  const have = new Set(Object.values(state.items).map((i) => `${i.rel}|${i.size}`))
  const fresh = flacs.filter((d) => !have.has(`${d.rel}|${d.file.size}`))
  if (!fresh.length) {
    if (others) set({ skipped: state.skipped + others })
    return
  }

  const created: UploadItem[] = fresh.map((d) => ({
    id: ++seq,
    file: d.file,
    rel: d.rel,
    name: d.file.name,
    size: d.file.size,
    state: 'reading',
    progress: 0,
    info: null,
    meta: null,
    trackId: null,
  }))
  set({ items: { ...state.items, ...Object.fromEntries(created.map((i) => [i.id, i])) }, reading: state.reading + created.length, skipped: state.skipped + others })

  // read headers, 4 at a time, in path order
  const queue = [...created].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it; (it = queue.shift()); ) {
        try {
          const info = await readFlac(it.file)
          const meta = toMeta(info, it.rel)
          await place(it.id, info, meta, images.get(dirOf(it.rel)) ?? null, artistFor(artistImgs, it.rel))
        } catch (e) {
          patchItem(it.id, { state: 'invalid', error: (e as Error).message || 'Couldn’t read this file' })
          // keep unreadable files visible under an "Unreadable" group
          attach(it.id, null)
        } finally {
          set({ reading: state.reading - 1 })
        }
      }
    }),
  )
}

/** Put a read item into its album group (new group per album id, unless one is still in review). */
async function place(id: number, info: FlacInfo, meta: TrackMeta, folderCover: File | null, artistImgs: ArtistSources | null) {
  const { albumId, artistId } = await idsFor(meta)
  let album = state.albums.find((a) => a.albumId === albumId && a.state === 'review' && !a.key.startsWith('!'))
  if (!album) {
    const cat = libraryStore.get().data
    album = {
      key: `${albumId}#${++seq}`,
      albumId,
      artistId,
      title: meta.album,
      artist: meta.albumArtist,
      year: meta.year,
      genre: meta.genre,
      trackTotal: meta.trackTotal,
      discTotal: meta.discTotal,
      cover: null,
      coverUrl: null,
      inLibrary: !!cat?.albums[albumId],
      edits: {},
      state: 'review',
      itemIds: [],
    }
    set({ albums: [...state.albums, album], selected: state.selected ?? album.key })
  }
  patchItem(id, { info, meta, state: 'ready' })
  attach(id, album.key)
  const a = state.albums.find((x) => x.key === album.key)!
  // album fields: first non-empty wins; cover: embedded front cover, else cover.jpg in the folder
  const p: Partial<UploadAlbum> = {}
  if (!a.year && meta.year) p.year = meta.year
  if (!a.genre && meta.genre) p.genre = meta.genre
  if (!a.trackTotal && meta.trackTotal) p.trackTotal = meta.trackTotal
  if (!a.discTotal && meta.discTotal) p.discTotal = meta.discTotal
  if (!a.cover && (info.picture || folderCover)) {
    const img = info.picture?.data ?? folderCover!
    p.cover = img
    p.coverUrl = URL.createObjectURL(img)
  }
  if (artistImgs?.photo && !a.artistPhoto) p.artistPhoto = artistImgs.photo
  if (artistImgs?.bg && !a.artistBg) p.artistBg = artistImgs.bg
  if (Object.keys(p).length) patchAlbum(a.key, p)
  await refreshIds(a.key)
}

function attach(id: number, key: string | null) {
  if (key === null) {
    let bad = state.albums.find((a) => a.key === '!unreadable')
    if (!bad) {
      bad = { key: '!unreadable', albumId: '', artistId: '', title: 'Unreadable files', artist: 'Not FLAC, or damaged', cover: null, coverUrl: null, inLibrary: false, edits: {}, state: 'error', itemIds: [] }
      set({ albums: [...state.albums, bad] })
    }
    key = bad.key
  }
  set({
    albums: state.albums.map((a) =>
      a.key === key ? { ...a, itemIds: [...a.itemIds, id].sort((x, y) => order(state.items[x]) - order(state.items[y]) || state.items[x].rel.localeCompare(state.items[y].rel, undefined, { numeric: true })) } : a,
    ),
  })
}
const order = (it: UploadItem) => (it.meta ? it.meta.disc * 1000 + (it.meta.track ?? 999) : 1e6)

/** Recompute album / track ids after tags were read or edited, and mark duplicates. */
async function refreshIds(key: string) {
  const a = state.albums.find((x) => x.key === key)
  if (!a) return
  const cat = libraryStore.get().data
  const first = a.itemIds.map((i) => state.items[i]).find((i) => i.meta)
  if (!first?.meta) return
  const eff0 = effective(a, first.meta)
  const { albumId, artistId } = await idsFor(eff0)
  const ids = await Promise.all(a.itemIds.map(async (i) => {
    const it = state.items[i]
    return it.meta ? [i, (await idsFor(effective(a, it.meta))).trackId] as const : [i, null] as const
  }))
  // other pending tracks (other groups) claim their ids first
  const elsewhere = new Set(
    Object.values(state.items)
      .filter((it) => it.trackId && !a.itemIds.includes(it.id) && it.state !== 'dup' && it.state !== 'invalid')
      .map((it) => it.trackId),
  )
  const seen = new Set<string>()
  const items = { ...state.items }
  for (const [i, trackId] of ids) {
    const it = items[i]
    if (!trackId || !['ready', 'dup'].includes(it.state)) {
      if (trackId) items[i] = { ...it, trackId }
      continue
    }
    const dup: UploadItem['dup'] = cat?.tracks[trackId] ? 'library' : seen.has(trackId) || elsewhere.has(trackId) ? 'batch' : undefined
    seen.add(trackId)
    items[i] = { ...it, trackId, state: dup ? 'dup' : 'ready', dup }
  }
  set({
    items,
    albums: state.albums.map((x) => (x.key === key ? { ...x, albumId, artistId, title: eff0.album, artist: eff0.albumArtist, inLibrary: !!cat?.albums[albumId] } : x)),
  })
}

/* ── Review ─────────────────────────────────────────── */

export async function editAlbum(key: string, edits: AlbumEdits) {
  const a = state.albums.find((x) => x.key === key)
  if (!a || a.state !== 'review') return
  const first = a.itemIds.map((i) => state.items[i]).find((i) => i.meta)?.meta
  // drop edits that equal the tags
  const clean: AlbumEdits = {}
  if (edits.albumArtist !== undefined && edits.albumArtist.trim() && edits.albumArtist.trim() !== first?.albumArtist) clean.albumArtist = edits.albumArtist.trim()
  if (edits.album !== undefined && edits.album.trim() && edits.album.trim() !== first?.album) clean.album = edits.album.trim()
  if (edits.year !== undefined && edits.year !== (first?.year ?? null)) clean.year = edits.year
  if (edits.genre !== undefined && (edits.genre?.trim() || null) !== (first?.genre ?? null)) clean.genre = edits.genre?.trim() || null
  patchAlbum(key, {
    edits: clean,
    year: clean.year !== undefined ? (clean.year ?? undefined) : first?.year,
    genre: clean.genre !== undefined ? (clean.genre ?? undefined) : first?.genre,
  })
  await refreshIds(key)
}

export function select(key: string) {
  set({ selected: key })
}

export function removeAlbum(key: string) {
  const a = state.albums.find((x) => x.key === key)
  if (!a || a.state === 'running') return
  if (a.coverUrl) URL.revokeObjectURL(a.coverUrl)
  const items = { ...state.items }
  for (const i of a.itemIds) delete items[i]
  const albums = state.albums.filter((x) => x.key !== key)
  set({ albums, items, selected: state.selected === key ? (albums.find((x) => x.state === 'review')?.key ?? albums[0]?.key ?? null) : state.selected })
}

/** Drop finished albums (and the unreadable group) from the list. */
export function clearFinished() {
  for (const a of [...state.albums]) if (a.state === 'done' || a.key === '!unreadable') removeAlbum(a.key)
  set({ skipped: 0 })
}

/* ── Running ────────────────────────────────────────── */

let controller: AbortController | null = null
let commits: Promise<void> = Promise.resolve()
const prepared = new Map<string, Promise<string | null>>() // album key → cover file id
const settle = new Set<(r: AlbumResult) => void>()

export interface AlbumResult {
  key: string
  albumId: string
  title: string
  added: number
  failed: number
}
/** An album's tracks went through and the catalogue was written (for the "added" toast). */
export function onAlbumAdded(l: (r: AlbumResult) => void) {
  settle.add(l)
  return () => {
    settle.delete(l)
  }
}

/** Queue every reviewed album (or just `key`) and start. */
export function start(key?: string) {
  const albums = state.albums.filter((a) => (key ? a.key === key : true) && (a.state === 'review' || a.state === 'error') && a.key !== '!unreadable')
  const items = { ...state.items }
  let n = 0
  for (const a of albums)
    for (const i of a.itemIds)
      if (items[i].state === 'ready' || items[i].state === 'error') {
        items[i] = { ...items[i], state: 'queued', progress: 0, error: undefined }
        n++
      }
  if (!n) return
  set({ items, albums: state.albums.map((a) => (albums.includes(a) && a.itemIds.some((i) => items[i].state === 'queued') ? { ...a, state: 'running' } : a)) })
  void run()
}

/** Stop: tracks not finished go back to review; finished ones are still added. */
export function cancel() {
  controller?.abort()
}

const OPUS_RATIO = 0.08 // Opus 160 ≈ 8% of a 16/44.1 FLAC, for the progress estimate

async function run() {
  if (state.running) return
  controller = new AbortController()
  const signal = controller.signal
  const pending = () => Object.values(state.items).filter((i) => i.state === 'queued')
  const total = () => Object.values(state.items).filter((i) => ['queued', 'encoding', 'uploading', 'uploaded'].includes(i.state) || (i.state === 'done' && runDone.has(i.id))).reduce((s, i) => s + i.size * (1 + OPUS_RATIO), 0)
  const runDone = new Set<number>()
  set({ running: true, run: { total: total(), sent: 0, speed: null, started: Date.now() } })

  // upload speed from the bytes reported by all transfers
  let lastT = performance.now()
  let lastSent = 0
  let sentBase = 0
  const live = new Map<number, number>()
  const report = () => {
    const sent = sentBase + [...live.values()].reduce((s, n) => s + n, 0)
    const now = performance.now()
    let speed = state.run?.speed ?? null
    if (now - lastT > 1500) {
      const v = ((sent - lastSent) / (now - lastT)) * 1000
      speed = speed == null ? v : speed * 0.6 + v * 0.4
      lastT = now
      lastSent = sent
    }
    set({ run: { total: total(), sent, speed, started: state.run?.started ?? Date.now() } }, true)
  }

  const worker = async () => {
    for (;;) {
      if (signal.aborted) return
      // album order, then track order
      const next = state.albums.flatMap((a) => a.itemIds).map((i) => state.items[i]).find((i) => i?.state === 'queued')
      if (!next) return
      const album = state.albums.find((a) => a.itemIds.includes(next.id))!
      patchItem(next.id, { state: state.opus ? 'encoding' : 'uploading', progress: 0 })
      try {
        await one(next.id, album.key, signal, (bytes) => {
          live.set(next.id, bytes)
          report()
        })
        runDone.add(next.id)
      } catch (e) {
        const aborted = signal.aborted || (e as Error).name === 'AbortError'
        patchItem(next.id, aborted ? { state: 'ready', progress: 0 } : { state: 'error', progress: 0, error: errorText(e) })
        if (e instanceof AuthError) controller?.abort()
      } finally {
        sentBase += live.get(next.id) ?? 0
        live.delete(next.id)
        report()
      }
      if (!state.albums.find((a) => a.key === album.key)?.itemIds.some((i) => ['queued', 'encoding', 'uploading'].includes(state.items[i].state))) {
        void finishAlbum(album.key)
      }
    }
  }
  await Promise.all([worker(), worker()])
  // cancelled: what was still queued goes back to review
  for (const it of pending()) patchItem(it.id, { state: 'ready', progress: 0 })
  // albums the workers didn't get to the end of (cancelled): add what went up, the rest back to review
  for (const a of state.albums) if (a.state === 'running') void finishAlbum(a.key)
  await commits
  controller = null
  set({ running: false, run: null })
  // more was queued while we were finishing (e.g. Add on a second album)
  if (pending().length) void run()
}

const errorText = (e: unknown) => (e instanceof AuthError ? 'Google session expired — sign in, then retry' : (e as Error).message || 'Upload failed')

/** Encode + upload one track. `onBytes` = bytes sent so far for this track. */
async function one(id: number, key: string, signal: AbortSignal, onBytes: (n: number) => void) {
  const it = state.items[id]
  const a = state.albums.find((x) => x.key === key)!
  const m = effective(a, it.meta!)
  await prepareAlbum(key)
  const artistDir = safeName(m.albumArtist)
  const albumDir = safeName(m.album)
  const base = it.name.replace(/\.flac$/i, '')
  const est = it.size * (1 + OPUS_RATIO)

  let opus: Blob | null = null
  if (state.opus) {
    opus = await flacToOpus(it.file, {
      comments: opusComments(a, it),
      inputRate: it.info?.sampleRate,
      signal,
      onProgress: (r) => patchItem(id, { progress: r * 0.12 }, true),
    })
  }
  signal.throwIfAborted()
  patchItem(id, { state: 'uploading', progress: 0.12 })
  const both = it.size + (opus?.size ?? 0)
  const prog = (sent: number) => {
    patchItem(id, { progress: 0.12 + 0.88 * (sent / both) }, true)
    onBytes((sent / both) * est)
  }
  const flac = await putFile({ name: `${base}.flac`, parts: ['library', artistDir, albumDir], mime: 'audio/flac', data: it.file, signal, onProgress: (n) => prog(n) })
  let mobile: Uploaded | undefined
  if (opus) mobile = await putFile({ name: `${base}.opus`, parts: ['mobile', artistDir, albumDir], mime: 'audio/ogg', data: opus, signal, onProgress: (n) => prog(it.size + n) })
  patchItem(id, { state: 'uploaded', progress: 1, flac, mobile })
  onBytes(est)
}

/** Once per album: upload the cover if the catalogue album has none. */
function prepareAlbum(key: string): Promise<string | null> {
  let p = prepared.get(key)
  if (!p) {
    p = (async () => {
      const a = state.albums.find((x) => x.key === key)!
      const existing = libraryStore.get().data?.albums[a.albumId]
      if (existing?.cover || !a.cover) return existing?.cover ?? null
      try {
        const jpg = await squareJpeg(a.cover, 600)
        const up = await putFile({ name: `${a.albumId}.jpg`, parts: ['covers'], mime: 'image/jpeg', data: jpg })
        void idbSet('covers', up.id, jpg) // shows straight away, no download
        return up.id
      } catch (e) {
        if (e instanceof AuthError) throw e
        return null // tracks still go up; the album shows its monogram until the importer adds a cover
      }
    })()
    p.catch(() => prepared.delete(key))
    prepared.set(key, p)
  }
  return p
}

/** Fit inside size×size (like the importer's ffmpeg scale …:force_original_aspect_ratio=decrease). */
async function squareJpeg(img: Blob, size: number): Promise<Blob> {
  const bmp = await createImageBitmap(img)
  const k = Math.min(size / bmp.width, size / bmp.height)
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}

/** Write the album's uploaded tracks into library.json (serialised with other albums). */
function finishAlbum(key: string): Promise<void> {
  commits = commits.then(async () => {
    const a = state.albums.find((x) => x.key === key)
    if (!a) return
    const ready = a.itemIds.map((i) => state.items[i]).filter((i) => i.state === 'uploaded')
    const failed = a.itemIds.filter((i) => state.items[i].state === 'error').length
    if (ready.length) {
      let coverId: string | null = null
      try {
        coverId = await prepareAlbum(key)
      } catch {
        coverId = null
      }
      // artist photo / banner: from the dropped artist folder, else Deezer for an artist without a photo
      let artistPatch: ArtistPatch | null = null
      try {
        artistPatch = await artistImages(a, effective(a, ready[0].meta!))
      } catch {
        artistPatch = null
      }
      try {
        const lib = libraryStore.get()
        const w = await updateCatalogue((c) => merge(c, a, ready, coverId, artistPatch), { data: lib.data, version: lib.fileVersion })
        libraryStore.adopt(w.data, w.fileId, w.version)
        for (const it of ready) patchItem(it.id, { state: 'done' })
      } catch (e) {
        for (const it of ready) patchItem(it.id, { state: 'error', error: `Uploaded, but library.json wasn’t updated: ${errorText(e)}` })
      }
    }
    const items = a.itemIds.map((i) => state.items[i])
    const st: AlbumState = items.some((i) => i.state === 'error') ? 'error' : items.some((i) => i.state === 'ready') ? 'review' : 'done'
    patchAlbum(key, { state: st, inLibrary: !!libraryStore.get().data?.albums[a.albumId] })
    prepared.delete(key)
    const added = items.filter((i) => i.state === 'done' && ready.includes(i)).length
    if (added) settle.forEach((l) => l({ key, albumId: a.albumId, title: a.title, added, failed }))
  })
  return commits
}

/** Photo / banner for the album's artist, based on what the catalogue has right now. */
function artistImages(a: UploadAlbum, m: TrackMeta): Promise<ArtistPatch | null> {
  const data = libraryStore.get().data
  const titles = new Set(Object.values(data?.albums ?? {}).filter((x) => x.artistId === a.artistId).map((x) => x.title))
  titles.add(m.album)
  return prepareArtist(data?.artists[a.artistId], a.artistId, m.albumArtist, [...titles], { photo: a.artistPhoto, bg: a.artistBg })
}

/** Same entries as tools/import/src/import.js. */
function merge(c: Catalogue, a: UploadAlbum, ready: UploadItem[], coverId: string | null, artistPatch: ArtistPatch | null = null) {
  const now = new Date().toISOString()
  const first = effective(a, ready[0].meta!)
  const artist = (c.artists[a.artistId] ??= { id: a.artistId, name: first.albumArtist, addedAt: now })
  if (artistPatch) Object.assign(artist, artistPatch)
  const album: Album = (c.albums[a.albumId] ??= { id: a.albumId, title: first.album, artistId: a.artistId, artist: first.albumArtist, addedAt: now, cover: null })
  Object.assign(album, {
    year: first.year ?? album.year,
    date: first.date ?? album.date,
    genre: first.genre ?? album.genre,
    cover: album.cover ?? coverId ?? null,
  })
  for (const it of ready) {
    const m = effective(a, it.meta!)
    const t: Track = {
      id: it.trackId!,
      title: m.title,
      artist: m.artist,
      albumId: a.albumId,
      artistId: a.artistId,
      disc: m.disc,
      track: m.track ?? null,
      duration: m.duration,
      isrc: m.isrc,
      bpm: m.bpm,
      lyrics: m.lyrics,
      syncedLyrics: m.syncedLyrics,
      flac: { id: it.flac!.id, size: it.flac!.size, sampleRate: m.sampleRate, bitDepth: m.bitDepth },
      ...(it.mobile ? { mobile: { id: it.mobile.id, size: it.mobile.size, codec: 'opus' as const, bitrate: '160k' } } : {}),
      source: { path: sourcePath(it, m), size: it.size, mtime: it.file.lastModified },
      addedAt: now,
    }
    c.tracks[t.id] = JSON.parse(JSON.stringify(t)) as Track // drop undefined fields like the importer's JSON
  }
  album.trackCount = Object.values(c.tracks).filter((t) => t.albumId === a.albumId).length
  // dropped again after a "Remove from library": it's wanted back (the importer stops skipping it too)
  if (c.removed) {
    for (const it of ready) delete c.removed.tracks?.[it.trackId!]
    delete c.removed.albums?.[a.albumId]
    delete c.removed.artists?.[a.artistId]
  }
}

/**
 * The importer's `source.path` (relative to the music folder: Artist/Album/file.flac). If the same
 * file later sits there with the same size and mtime, `npm run import` sees it as already imported.
 */
function sourcePath(it: UploadItem, m: TrackMeta): string {
  const parts = it.rel.split('/').filter(Boolean)
  if (parts.length >= 3) return parts.slice(-3).join('/')
  return [safeName(m.albumArtist), parts.length === 2 ? parts[0] : safeName(m.album), it.name].join('/')
}

/* ── Store API ──────────────────────────────────────── */

export const uploadStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function useUpload(): UploadState {
  return useSyncExternalStore(uploadStore.subscribe, uploadStore.get, uploadStore.get)
}

/** Progress of the current run for the toast / sidebar: tracks done of total, and 0..1. */
export function runSummary(s: UploadState) {
  const inRun = Object.values(s.items).filter((i) => ['queued', 'encoding', 'uploading', 'uploaded'].includes(i.state) || (i.state === 'done' && s.running))
  const active = s.albums.find((a) => a.itemIds.some((i) => ['encoding', 'uploading'].includes(s.items[i]?.state)))
  const albums = s.albums.filter((a) => a.state === 'running')
  const tracks = albums.flatMap((a) => a.itemIds.map((i) => s.items[i])).filter((i) => i.state !== 'dup' && i.state !== 'ready' && i.state !== 'invalid')
  const done = tracks.filter((i) => i.state === 'uploaded' || i.state === 'done' || i.state === 'error').length
  return {
    active: active ?? albums[0] ?? null,
    done,
    total: tracks.length,
    ratio: s.run && s.run.total ? Math.min(1, s.run.sent / s.run.total) : 0,
    any: inRun.length > 0,
  }
}

// Leaving or reloading the page mid-upload loses the run: ask first.
window.addEventListener('beforeunload', (e) => {
  if (state.running) e.preventDefault()
})

onAccountReset(() => {
  controller?.abort()
  for (const a of state.albums) if (a.coverUrl) URL.revokeObjectURL(a.coverUrl)
  prepared.clear()
  resetFolders()
  state = { ...state, albums: [], items: {}, selected: null, reading: 0, skipped: 0 }
  emit()
})
