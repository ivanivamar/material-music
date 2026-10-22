/**
 * Upload — Batch (step 24; replaces the step-10 album-by-album flow).
 *
 * Everything dropped joins one batch. Each FLAC's header (tags, STREAMINFO, cover) is read in the browser
 * and the files are grouped into releases by album artist + album (the importer's album id; with no
 * ALBUM tag the folder name is used, as before). Nothing uploads until Upload is pressed. Then two
 * releases upload at a time, in list order, one track after the other: an Opus 160 copy is encoded here
 * (WebCodecs), then the FLAC and the Opus go to Pelagic/library/… and Pelagic/mobile/… (same names as the
 * importer). The cover goes to covers/<albumId>.jpg if the album has none yet.
 *
 * A release whose files are all up and that has no issue is added to the library at once (library.json
 * read fresh, merged, written back; the app adopts the new catalogue). Issues (see uploadViews.ts):
 * - missing tracks: keeps uploading, waits for "Add missing file" / "Add without it" before it's added;
 * - already in the library: waits *before* uploading (uploading first would overwrite the library's
 *   Drive files in place), until Replace / Keep both / Skip;
 * - failed tracks: Retry / Add without them.
 *
 * Pause all aborts the transfers but keeps each track's resumable session URL and its encoded Opus, so
 * Resume carries on from what Drive already has.
 *
 * State lives in this module, so uploads keep going while browsing other pages (toast + sidebar badge
 * in the shell). Leaving the page while uploading asks first.
 */
import { useSyncExternalStore } from 'react'
import { AuthError } from '../lib/drive'
import { idbSet } from '../lib/idb'
import { readFlac, toMeta, idsFor, safeName, type FlacInfo, type TrackMeta } from '../upload/flac'
import { canEncodeOpus, flacToOpus } from '../upload/opus'
import { prepareArtist, type ArtistPatch, type ArtistSources } from '../upload/artistImages'
import { putFile, resetFolders, updateCatalogue, type Uploaded } from '../upload/driveWrite'
import { autoFetchLyrics } from './health'
import { libraryStore, type Album, type Catalogue, type Track } from './library'
import { onAccountReset } from './session'
import { canCommit, hasHeldDup, releaseQuality, uploadable } from './uploadViews'

export type ItemState = 'reading' | 'ready' | 'dup' | 'encoding' | 'uploading' | 'uploaded' | 'done' | 'error'

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
  /** tags as read (album edits are applied on top, see effective()); `forced` already applied */
  meta: TrackMeta | null
  trackId: string | null
  /** same track twice in this batch (the later copy is left out) */
  dup?: 'batch'
  /** this track id is already in the catalogue */
  inLibrary?: boolean
  /** picked through "Add missing file": album artist / album taken from the release, not the file */
  forced?: { albumArtist: string; album: string }
  error?: string
  flac?: Uploaded
  mobile?: Uploaded
  /** what survives a pause: resumable session URLs and the encoded Opus */
  resume?: { flacUrl?: string; mobileUrl?: string; opus?: Blob }
}

export interface AlbumEdits {
  albumArtist?: string
  album?: string
  year?: number | null
  genre?: string | null
}

export type ReleasePhase = 'pending' | 'adding' | 'added'

/** One release of the batch (an album, EP or single: whatever shares album artist + album). */
export interface UploadAlbum {
  key: string
  /** album id from the files' own tags (later drops of the same album join this release) */
  srcAlbumId: string
  /** after edits */
  albumId: string
  artistId: string
  title: string
  artist: string
  year?: number
  genre?: string
  cover: Blob | null
  coverUrl: string | null
  /** artist.jpg / artist_background.jpg found in the artist's folder of the drop */
  artistPhoto?: File | null
  artistBg?: File | null
  /** catalogue already has this album (adding tracks to it) */
  inLibrary: boolean
  edits: AlbumEdits
  itemIds: number[]
  skipped: boolean
  /** answers given on the issue card */
  resolved: { missing?: boolean; dup?: 'replace' | 'skip'; failed?: boolean }
  phase: ReleasePhase
  /** list position: the smallest item id (files are numbered in path order as they're dropped) */
  ord: number
}

export type UploadFilter = 'all' | 'need' | 'prog' | 'added'

export interface UploadState {
  albums: UploadAlbum[]
  items: Record<number, UploadItem>
  /** inspector: focused release; checked rows (2+ → multi-select inspector) */
  focus: string | null
  checked: string[]
  filter: UploadFilter
  /** files still being read */
  reading: number
  /** dropped files that aren't FLAC (images used as covers aren't counted) */
  skipped: number
  /** .flac files that couldn't be read */
  unreadable: number
  /** Upload pressed (until the batch has nothing left to send) */
  started: boolean
  paused: boolean
  /** paused because the Google session expired */
  authError: boolean
  /** browser can make the Opus copies (null = not checked yet) */
  opus: boolean | null
  /** upload speed, bytes/s (FLAC + Opus estimate) */
  speed: number | null
}

const INITIAL: UploadState = { albums: [], items: {}, focus: null, checked: [], filter: 'all', reading: 0, skipped: 0, unreadable: 0, started: false, paused: false, authError: false, opus: null, speed: null }
let state: UploadState = INITIAL
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
const albumOf = (key: string) => state.albums.find((a) => a.key === key)

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
  if (it.forced) {
    over.ALBUMARTIST = it.forced.albumArtist
    over.ALBUM = it.forced.album
  }
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

/**
 * Files picked or dropped (folders already walked). `target`: put every FLAC into this release
 * ("Add missing file"), whatever its album tags say. Resolves to how many FLACs joined the batch.
 */
export async function addFiles(dropped: DroppedFile[], target?: string): Promise<{ added: number; ignored: number }> {
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

  // skip files already in the batch (same path + size), e.g. a folder dropped twice
  const have = new Set(Object.values(state.items).map((i) => `${i.rel}|${i.size}`))
  // path order, so item ids (and the release order derived from them) follow the folders
  const fresh = flacs.filter((d) => !have.has(`${d.rel}|${d.file.size}`)).sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))
  if (others) set({ skipped: state.skipped + others })
  if (!fresh.length) return { added: 0, ignored: others }

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
  set({ items: { ...state.items, ...Object.fromEntries(created.map((i) => [i.id, i])) }, reading: state.reading + created.length })

  // read headers, 4 at a time, in path order
  let added = 0
  const queue = [...created].sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let it; (it = queue.shift()); ) {
        try {
          const info = await readFlac(it.file)
          const meta = toMeta(info, it.rel)
          await place(it.id, info, meta, images.get(dirOf(it.rel)) ?? null, artistFor(artistImgs, it.rel), target)
          added++
        } catch {
          const items = { ...state.items }
          delete items[it.id]
          set({ items, unreadable: state.unreadable + 1 })
        } finally {
          set({ reading: state.reading - 1 })
        }
      }
    }),
  )
  kick()
  finishIfIdle()
  return { added, ignored: others + (fresh.length - added) }
}

/** Put a read item into its release (an open one with the same album id, else a new one at the end). */
async function place(id: number, info: FlacInfo, meta: TrackMeta, folderCover: File | null, artistImgs: ArtistSources | null, target?: string) {
  let album = target ? state.albums.find((a) => a.key === target && a.phase === 'pending') : undefined
  let forced: UploadItem['forced']
  if (album) {
    forced = { albumArtist: album.artist, album: album.title }
    // edits are applied on top by effective(); keep the raw values here so "use file tags" still works
    const first = album.itemIds.map((i) => state.items[i]).find((i) => i?.meta)?.meta
    if (first) forced = { albumArtist: first.albumArtist, album: first.album }
    meta = { ...meta, ...forced }
  }
  const { albumId, artistId } = await idsFor(meta)
  album ??= state.albums.find((a) => a.phase === 'pending' && (a.srcAlbumId === albumId || a.albumId === albumId))
  if (!album) {
    const cat = libraryStore.get().data
    album = {
      key: `${albumId}#${++seq}`,
      srcAlbumId: albumId,
      albumId,
      artistId,
      title: meta.album,
      artist: meta.albumArtist,
      year: meta.year,
      genre: meta.genre,
      cover: null,
      coverUrl: null,
      inLibrary: !!cat?.albums[albumId],
      edits: {},
      itemIds: [],
      skipped: false,
      resolved: {},
      phase: 'pending',
      ord: id,
    }
    // files are read 4 at a time: keep the list in path order, not in the order reads finish
    const albums = [...state.albums, album].sort((x, y) => x.ord - y.ord)
    set({ albums })
  }
  patchItem(id, { info, meta, state: 'ready', forced })
  attach(id, album.key)
  const a = albumOf(album.key)!
  // album fields: first non-empty wins; cover: embedded front cover, else cover.jpg in the folder
  const p: Partial<UploadAlbum> = {}
  if (!a.year && meta.year) p.year = meta.year
  if (!a.genre && meta.genre) p.genre = meta.genre
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

function attach(id: number, key: string) {
  set({
    albums: state.albums.map((a) =>
      a.key === key ? { ...a, ord: Math.min(a.ord, id), itemIds: [...a.itemIds, id].sort((x, y) => order(state.items[x]) - order(state.items[y]) || state.items[x].rel.localeCompare(state.items[y].rel, undefined, { numeric: true })) } : a,
    ),
  })
}
const order = (it: UploadItem) => (it.meta ? it.meta.disc * 1000 + (it.meta.track ?? 999) : 1e6)

/** Recompute album / track ids after tags were read or edited; mark batch duplicates and tracks already in the library. */
async function refreshIds(key: string) {
  const a = albumOf(key)
  if (!a) return
  const cat = libraryStore.get().data
  const first = a.itemIds.map((i) => state.items[i]).find((i) => i?.meta)
  if (!first?.meta) return
  const eff0 = effective(a, first.meta)
  const { albumId, artistId } = await idsFor(eff0)
  const ids = await Promise.all(
    a.itemIds.map(async (i) => {
      const it = state.items[i]
      return it?.meta ? ([i, (await idsFor(effective(a, it.meta))).trackId] as const) : ([i, null] as const)
    }),
  )
  // other releases' tracks claim their ids first
  const elsewhere = new Set(
    Object.values(state.items)
      .filter((it) => it.trackId && !a.itemIds.includes(it.id) && it.state !== 'dup')
      .map((it) => it.trackId),
  )
  const seen = new Set<string>()
  const items = { ...state.items }
  for (const [i, trackId] of ids) {
    const it = items[i]
    if (!it || !trackId) continue
    if (!['ready', 'dup'].includes(it.state)) {
      items[i] = { ...it, trackId }
      continue
    }
    const batchDup = seen.has(trackId) || elsewhere.has(trackId)
    seen.add(trackId)
    items[i] = { ...it, trackId, state: batchDup ? 'dup' : 'ready', dup: batchDup ? 'batch' : undefined, inLibrary: !!cat?.tracks[trackId] }
  }
  set({
    items,
    albums: state.albums.map((x) => (x.key === key ? { ...x, albumId, artistId, title: eff0.album, artist: eff0.albumArtist, inLibrary: !!cat?.albums[albumId] } : x)),
  })
}

/* ── Inspector: selection, edits, issue answers ─────── */

export function setFocus(key: string) {
  set({ focus: key, checked: [] })
}
export function toggleChecked(key: string) {
  set({ checked: state.checked.includes(key) ? state.checked.filter((k) => k !== key) : [...state.checked, key] })
}
export function setChecked(keys: string[]) {
  set({ checked: keys })
}
export function setFilter(filter: UploadFilter) {
  set({ filter })
}

/** Clear finished: drop the releases already added to the library (and the skipped-file counts). */
export function clearFinished() {
  const gone = state.albums.filter((a) => a.phase === 'added')
  if (!gone.length) return
  const items = { ...state.items }
  for (const a of gone) {
    if (a.coverUrl) URL.revokeObjectURL(a.coverUrl)
    for (const i of a.itemIds) delete items[i]
    prepared.delete(a.key)
  }
  const keys = new Set(gone.map((a) => a.key))
  set({
    albums: state.albums.filter((a) => !keys.has(a.key)),
    items,
    focus: state.focus && keys.has(state.focus) ? null : state.focus,
    checked: state.checked.filter((k) => !keys.has(k)),
    filter: state.filter === 'added' ? 'all' : state.filter,
    skipped: 0,
    unreadable: 0,
  })
}

/** Tags can change until the first of the release's tracks has started uploading (paths and ids depend on them). */
export const editable = (a: UploadAlbum, s: UploadState = state) =>
  a.phase === 'pending' && a.itemIds.every((i) => !s.items[i] || (['reading', 'ready', 'dup'].includes(s.items[i].state) && !s.items[i].resume && !s.items[i].flac))

export async function editAlbum(key: string, edits: AlbumEdits) {
  const a = albumOf(key)
  if (!a || !editable(a)) return
  const first = a.itemIds.map((i) => state.items[i]).find((i) => i?.meta)?.meta
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
  kick()
}

/**
 * Multi-select "Edit shared tags": only the fields given are changed, on top of each release's own edits
 * (album titles stay per release). Releases that already started uploading are left alone.
 */
export async function editShared(keys: string[], edits: Omit<AlbumEdits, 'album'>) {
  for (const key of keys) {
    const a = albumOf(key)
    if (!a || !editable(a)) continue
    await editAlbum(key, { albumArtist: a.artist, album: a.title, year: a.year ?? null, genre: a.genre ?? null, ...edits })
  }
}

export function setSkipped(keys: string[], skipped: boolean) {
  const ks = new Set(keys)
  set({ albums: state.albums.map((a) => (ks.has(a.key) && a.phase === 'pending' ? { ...a, skipped } : a)) })
  if (skipped) for (const a of state.albums) if (ks.has(a.key)) for (const i of a.itemIds) ctrls.get(i)?.abort()
  if (!skipped) {
    kick()
    for (const k of keys) maybeCommit(k)
  }
  finishIfIdle()
}

/** "Add without it": add the release with the tracks it has. */
export function addWithoutMissing(key: string) {
  const a = albumOf(key)
  if (!a) return
  patchAlbum(key, { resolved: { ...a.resolved, missing: true } })
  maybeCommit(key)
}

/** Answer to "Already in your library". */
export async function resolveDup(key: string, how: 'replace' | 'both' | 'skip') {
  const a = albumOf(key)
  if (!a) return
  if (how === 'both') {
    // a separate album: same title + the format, so it gets its own album id (and Drive folder)
    const q = releaseQuality(a, state)
    await editAlbum(key, { albumArtist: a.artist, album: `${a.title} (${q.label})`, year: a.year ?? null, genre: a.genre ?? null })
    return
  }
  patchAlbum(key, { resolved: { ...a.resolved, dup: how } })
  if (how === 'skip') {
    // nothing new left → the whole release is skipped
    const left = uploadable(albumOf(key)!, state)
    if (!left.length) patchAlbum(key, { skipped: true })
  }
  kick()
  maybeCommit(key)
  finishIfIdle()
}

/** Failed tracks: try them again (tracks fully on Drive only need the library write). */
export function retryFailed(key: string) {
  const a = albumOf(key)
  if (!a) return
  const items = { ...state.items }
  for (const i of a.itemIds) {
    const it = items[i]
    if (it?.state !== 'error') continue
    const onDrive = !!it.flac && (!!it.mobile || !state.opus)
    items[i] = { ...it, state: onDrive ? 'uploaded' : 'ready', error: undefined, progress: onDrive ? 1 : 0 }
  }
  set({ items, authError: false })
  patchAlbum(key, { resolved: { ...a.resolved, failed: false } })
  if (!state.started && a.itemIds.some((i) => items[i]?.state === 'ready')) start()
  else kick()
  maybeCommit(key)
}
/** Failed tracks: add the release without them. */
export function addWithoutFailed(key: string) {
  const a = albumOf(key)
  if (!a) return
  patchAlbum(key, { resolved: { ...a.resolved, failed: true } })
  maybeCommit(key)
}

/* ── Running ────────────────────────────────────────── */

const claimed = new Set<string>() // releases a worker is on
const ctrls = new Map<number, AbortController>() // item → its transfer
let workers = 0
const prepared = new Map<string, Promise<string | null>>() // release key → cover file id
let commits: Promise<void> = Promise.resolve()
const settle = new Set<(r: AlbumResult) => void>()

export interface AlbumResult {
  key: string
  albumId: string
  title: string
  added: number
  failed: number
}
/** A release's tracks went through and the catalogue was written (for the "added" toast). */
export function onAlbumAdded(l: (r: AlbumResult) => void) {
  settle.add(l)
  return () => {
    settle.delete(l)
  }
}

/** Upload: start the batch. */
export function start() {
  set({ started: true, paused: false, authError: false })
  resetSpeed()
  kick()
  finishIfIdle()
}

/** Pause all: stop every transfer, keeping what Drive already has. */
export function pause() {
  if (!state.started) return
  set({ paused: true, speed: null })
  for (const c of ctrls.values()) c.abort()
}
/** Resume after Pause all. */
export function resume() {
  set({ paused: false, authError: false })
  resetSpeed()
  kick()
  finishIfIdle()
}

/** The next track of a release to send (list order: disc, track). */
function nextItem(a: UploadAlbum): UploadItem | undefined {
  return uploadable(a, state).find((it) => it.state === 'ready')
}
function eligible(a: UploadAlbum) {
  return !a.skipped && a.phase === 'pending' && !claimed.has(a.key) && !hasHeldDup(a, state) && !!nextItem(a)
}
const going = () => state.started && !state.paused

/** Fill the two release slots. */
function kick() {
  while (going() && workers < 2 && state.albums.some(eligible)) {
    workers++
    void worker().finally(() => {
      workers--
      finishIfIdle()
    })
  }
}

async function worker() {
  for (;;) {
    if (!going()) return
    const a = state.albums.find(eligible)
    if (!a) return
    claimed.add(a.key)
    try {
      for (;;) {
        const cur = albumOf(a.key)
        if (!going() || !cur || cur.skipped || hasHeldDup(cur, state)) break
        const it = nextItem(cur)
        if (!it) break
        await runItem(it.id, cur.key)
      }
    } finally {
      claimed.delete(a.key)
    }
    maybeCommit(a.key)
  }
}

/** Nothing left to send (and nothing being read): the batch is through, the button goes back to Upload. */
function finishIfIdle() {
  if (!state.started || workers > 0 || state.reading > 0) return
  if (state.paused) return
  if (state.albums.some(eligible)) return
  set({ started: false, speed: null })
}

async function runItem(id: number, key: string) {
  const ctrl = new AbortController()
  ctrls.set(id, ctrl)
  patchItem(id, { state: state.opus && !state.items[id]?.resume?.opus ? 'encoding' : 'uploading', error: undefined })
  try {
    await one(id, key, ctrl.signal)
  } catch (e) {
    const aborted = ctrl.signal.aborted || (e as Error).name === 'AbortError'
    if (aborted) patchItem(id, { state: 'ready' }) // keeps progress + resume handles
    else if (e instanceof AuthError) {
      patchItem(id, { state: 'ready' })
      set({ paused: true, authError: true, speed: null })
      for (const c of ctrls.values()) c.abort()
    } else patchItem(id, { state: 'error', progress: 0, error: errorText(e), resume: undefined })
  } finally {
    ctrls.delete(id)
  }
}

const errorText = (e: unknown) => (e instanceof AuthError ? 'Google session expired — sign in, then retry' : (e as Error).message || 'Upload failed')

export const OPUS_RATIO = 0.08 // Opus 160 ≈ 8% of a 16/44.1 FLAC, for the progress estimate

/** Encode + upload one track (picking up a paused one where it stopped). */
async function one(id: number, key: string, signal: AbortSignal) {
  const it = state.items[id]
  const a = albumOf(key)!
  const m = effective(a, it.meta!)
  await prepareAlbum(key)
  signal.throwIfAborted()
  const artistDir = safeName(m.albumArtist)
  const albumDir = safeName(m.album)
  const base = it.name.replace(/\.flac$/i, '')
  const res = { ...it.resume }

  let opus: Blob | null = res.opus ?? null
  if (state.opus && !opus && !it.mobile) {
    opus = await flacToOpus(it.file, {
      comments: opusComments(a, it),
      inputRate: it.info?.sampleRate,
      signal,
      onProgress: (r) => {
        patchItem(id, { progress: r * 0.12 }, true)
        sample()
      },
    })
    res.opus = opus
    patchItem(id, { resume: { ...res } })
  }
  signal.throwIfAborted()
  patchItem(id, { state: 'uploading', progress: Math.max(0.12, state.items[id].progress) })
  const both = it.size + (opus?.size ?? 0)
  const prog = (sent: number) => {
    patchItem(id, { progress: 0.12 + 0.88 * (sent / both) }, true)
    sample()
  }
  let flac = it.flac
  if (!flac) {
    flac = await putFile({
      name: `${base}.flac`,
      parts: ['library', artistDir, albumDir],
      mime: 'audio/flac',
      data: it.file,
      signal,
      resume: res.flacUrl,
      onSession: (url) => patchItem(id, { resume: { ...(state.items[id].resume ?? {}), flacUrl: url } }),
      onProgress: (n) => prog(n),
    })
    patchItem(id, { flac })
  }
  let mobile = it.mobile
  if (opus && !mobile) {
    mobile = await putFile({
      name: `${base}.opus`,
      parts: ['mobile', artistDir, albumDir],
      mime: 'audio/ogg',
      data: opus,
      signal,
      resume: res.mobileUrl,
      onSession: (url) => patchItem(id, { resume: { ...(state.items[id].resume ?? {}), mobileUrl: url } }),
      onProgress: (n) => prog(it.size + n),
    })
  }
  patchItem(id, { state: 'uploaded', progress: 1, flac, mobile, resume: undefined })
}

/* speed (bytes/s) from the progress of every track, smoothed */
let lastT = 0
let lastSent = 0
function resetSpeed() {
  lastT = 0
  lastSent = 0
}
export function sentBytes(s: UploadState) {
  let n = 0
  for (const it of Object.values(s.items)) if (it.state !== 'dup') n += it.size * (1 + OPUS_RATIO) * (it.state === 'done' || it.state === 'uploaded' ? 1 : it.progress)
  return n
}
function sample() {
  const now = performance.now()
  if (lastT && now - lastT < 1500) return
  const sent = sentBytes(state)
  if (lastT) {
    const v = ((sent - lastSent) / (now - lastT)) * 1000
    if (v >= 0) set({ speed: state.speed == null ? v : state.speed * 0.6 + v * 0.4 }, true)
  }
  lastT = now
  lastSent = sent
}

/** Once per release: upload the cover if the catalogue album has none. */
function prepareAlbum(key: string): Promise<string | null> {
  let p = prepared.get(key)
  if (!p) {
    p = (async () => {
      const a = albumOf(key)!
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

/** Add the release to the library if it's ready: all files up and no open issue. */
function maybeCommit(key: string) {
  const a = albumOf(key)
  if (!a || !canCommit(a, state, libraryStore.get().data)) return
  patchAlbum(key, { phase: 'adding' })
  void finishAlbum(key)
}

/** Write the release's uploaded tracks into library.json (serialised with other releases). */
function finishAlbum(key: string): Promise<void> {
  commits = commits.then(async () => {
    const a = albumOf(key)
    if (!a) return
    const ready = uploadable(a, state).filter((i) => i.state === 'uploaded')
    const failed = uploadable(a, state).filter((i) => i.state === 'error').length
    let ok = false
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
        ok = true
        // songs that came without lyrics in their tags: look them up (LRCLIB) and save them next to the song
        autoFetchLyrics(ready.map((it) => it.trackId!))
      } catch (e) {
        for (const it of ready) patchItem(it.id, { state: 'error', error: `Uploaded, but library.json wasn’t updated: ${errorText(e)}` })
      }
    }
    const cur = albumOf(key)!
    // tracks joined meanwhile ("Add missing file") → back to pending; else added
    const left = uploadable(cur, state).filter((i) => i.state !== 'done' && !(i.state === 'error' && cur.resolved.failed))
    patchAlbum(key, { phase: ok && !left.length ? 'added' : 'pending', inLibrary: !!libraryStore.get().data?.albums[cur.albumId], resolved: ok ? { ...cur.resolved, failed: false } : cur.resolved })
    prepared.delete(key)
    if (ok) settle.forEach((l) => l({ key, albumId: a.albumId, title: a.title, added: ready.length, failed }))
    kick()
    finishIfIdle()
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

/** Same entries as tools/import/src/import.js. A replaced track keeps its id (plays, likes, playlists) and addedAt. */
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
      addedAt: c.tracks[it.trackId!]?.addedAt ?? now,
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

const busy = (s: UploadState) => Object.values(s.items).some((i) => i.state === 'encoding' || i.state === 'uploading')

// Leaving or reloading the page mid-upload loses the batch: ask first.
window.addEventListener('beforeunload', (e) => {
  if (busy(state) || (state.started && !state.paused)) e.preventDefault()
})

onAccountReset(() => {
  for (const c of ctrls.values()) c.abort()
  for (const a of state.albums) if (a.coverUrl) URL.revokeObjectURL(a.coverUrl)
  prepared.clear()
  claimed.clear()
  resetFolders()
  state = { ...INITIAL, opus: state.opus }
  emit()
})
