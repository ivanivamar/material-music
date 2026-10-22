/**
 * Library health (step 35): what the catalogue is missing, and the quick fixes.
 *
 *   covers      albums without a cover image                      fix: pick one from Cover Art Archive / iTunes, or a file
 *   lyrics      songs without lyrics                              fix: LRCLIB (synced first), one song or all of them
 *   genre       albums with no genre at all (tag, app, MusicBrainz)  fix: one tap on a suggestion, or type one
 *   year        albums without a year                             fix: MusicBrainz / iTunes suggestions, or type one
 *   duplicates  likely copies: same ISRC, or same title + artist  fix: keep the best copy, remove the rest
 *   bitrate     FLAC files with a low average bitrate             fix: replace the file (Upload page), or ignore
 *
 * Lyrics are saved into library.json (`track.lyrics` + `track.syncedLyrics`, the same fields the importer
 * fills from the FLAC tags), so Now Playing shows them with no other change. Covers go to Drive
 * `Pelagic/covers/<albumId>.jpg` like the Upload page does; year and cover are written with the same
 * read-merge-write as Upload (`updateCatalogue`). Genres use the app's genres.json (state/genres.ts).
 *
 * "Ignore" choices (instrumental songs, a deliberate duplicate…) and songs LRCLIB didn't know are kept on
 * this device only (IndexedDB kv.health).
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { LyricsOffline, lookupLyrics } from '../lib/lyricsFetch'
import { foldTitle, MbError, MbOffline, searchReleaseGroups } from '../lib/musicbrainz'
import { AuthError } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { putFile, updateCatalogue } from '../upload/driveWrite'
import { albumGenresOf, genresStore, useGenres, type GenresDoc } from './genres'
import { libraryStore, tracksByAlbum, useLibrary, type Album, type Catalogue, type Track } from './library'
import { onAccountReset } from './session'
import { settingsStore } from './settings'

/* ── Analysis ───────────────────────────────────────── */

export type IssueKind = 'cover' | 'lyrics' | 'genre' | 'year' | 'duplicate' | 'bitrate'
export const ISSUE_KINDS: IssueKind[] = ['cover', 'lyrics', 'genre', 'year', 'duplicate', 'bitrate']

/** kbit/s: a FLAC averaging less than this is flagged (very quiet or mono music can be honest, hence Ignore) */
export const LOW_KBPS = 400

export interface DupGroup {
  /** stable id: the sorted track ids */
  id: string
  why: 'isrc' | 'title'
  /** best copy first */
  trackIds: string[]
}
export interface LowBitrate {
  track: Track
  kbps: number
  /** short reason for the row */
  why: string
}
export interface Health {
  covers: Album[]
  years: Album[]
  genres: Album[]
  lyrics: Track[]
  duplicates: DupGroup[]
  bitrate: LowBitrate[]
}

export const kbpsOf = (t: Track): number | null => (t.duration && t.duration > 0 && t.flac?.size ? Math.round((t.flac.size * 8) / t.duration / 1000) : null)
/** how good a copy is: resolution first, then bitrate */
const qualityScore = (t: Track) => (t.flac?.bitDepth ?? 16) * (t.flac?.sampleRate ?? 44100) * 1000 + (kbpsOf(t) ?? 0)
export const hasLyrics = (t: Track) => !!t.lyrics && /\S/.test(t.lyrics)

const foldKey = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const isrcKey = (s?: string) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

function duplicates(c: Catalogue): DupGroup[] {
  const ids = Object.keys(c.tracks)
  const parent = new Map<string, string>(ids.map((i) => [i, i]))
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!)
      x = parent.get(x)!
    }
    return x
  }
  const why = new Map<string, 'isrc' | 'title'>()
  const link = (a: string, b: string, w: 'isrc' | 'title') => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    parent.set(ra, rb)
    why.set(rb, why.get(rb) === 'isrc' || w === 'isrc' || why.get(ra) === 'isrc' ? 'isrc' : 'title')
  }
  const byIsrc = new Map<string, string[]>()
  const byName = new Map<string, string[]>()
  for (const t of Object.values(c.tracks)) {
    const i = isrcKey(t.isrc)
    if (i.length >= 10) (byIsrc.get(i) ?? byIsrc.set(i, []).get(i)!).push(t.id)
    const k = `${foldKey(t.title)}|${foldKey(t.artist)}`
    if (k.length > 3) (byName.get(k) ?? byName.set(k, []).get(k)!).push(t.id)
  }
  for (const list of byIsrc.values()) for (let i = 1; i < list.length; i++) link(list[0], list[i], 'isrc')
  // same title + artist: only when the lengths agree (a live take or a radio edit isn't a copy)
  for (const list of byName.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = c.tracks[list[i]]
        const b = c.tracks[list[j]]
        if (a.duration && b.duration && Math.abs(a.duration - b.duration) > 5) continue
        link(a.id, b.id, 'title')
      }
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) (groups.get(find(id)) ?? groups.set(find(id), []).get(find(id))!).push(id)
  const out: DupGroup[] = []
  for (const [root, list] of groups) {
    if (list.length < 2) continue
    list.sort((a, b) => qualityScore(c.tracks[b]) - qualityScore(c.tracks[a]) || Number(hasLyrics(c.tracks[b])) - Number(hasLyrics(c.tracks[a])) || (c.tracks[a].addedAt ?? '').localeCompare(c.tracks[b].addedAt ?? ''))
    out.push({ id: [...list].sort().join('+'), why: why.get(root) ?? 'title', trackIds: list })
  }
  return out.sort((a, b) => (c.tracks[a.trackIds[0]]?.title ?? '').localeCompare(c.tracks[b.trackIds[0]]?.title ?? ''))
}

export function analyse(c: Catalogue, genres: GenresDoc, ignored: Ignored): Health {
  const skip = (k: IssueKind) => new Set(ignored[k] ?? [])
  const sCover = skip('cover')
  const sYear = skip('year')
  const sGenre = skip('genre')
  const sLyrics = skip('lyrics')
  const sBit = skip('bitrate')
  const sDup = skip('duplicate')
  const albums = Object.values(c.albums).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title))
  const tracks = Object.values(c.tracks)
  const byAlbum = tracksByAlbum(c)
  const albumName = (t: Track) => c.albums[t.albumId]?.title ?? ''
  const bitrate: LowBitrate[] = []
  for (const t of tracks) {
    if (sBit.has(t.id)) continue
    const k = kbpsOf(t)
    const sr = t.flac?.sampleRate ?? 0
    if (sr && sr < 44100) bitrate.push({ track: t, kbps: k ?? 0, why: `${(sr / 1000).toFixed(sr % 1000 ? 1 : 0)} kHz` })
    else if (k !== null && k < LOW_KBPS) bitrate.push({ track: t, kbps: k, why: `${k} kbit/s` })
  }
  bitrate.sort((a, b) => a.kbps - b.kbps || a.track.title.localeCompare(b.track.title))
  return {
    covers: albums.filter((a) => !a.cover && !sCover.has(a.id) && (byAlbum.get(a.id)?.length ?? 0) > 0),
    years: albums.filter((a) => !a.year && !sYear.has(a.id)),
    genres: albums.filter((a) => !albumGenresOf(genres, a).genres.length && !sGenre.has(a.id)),
    lyrics: tracks.filter((t) => !hasLyrics(t) && !sLyrics.has(t.id)).sort((a, b) => a.artist.localeCompare(b.artist) || albumName(a).localeCompare(albumName(b)) || a.disc - b.disc || (a.track ?? 999) - (b.track ?? 999)),
    duplicates: duplicates(c).filter((g) => !sDup.has(g.id)),
    bitrate,
  }
}

export const issueCount = (h: Health): Record<IssueKind, number> => ({
  cover: h.covers.length,
  lyrics: h.lyrics.length,
  genre: h.genres.length,
  year: h.years.length,
  duplicate: h.duplicates.length,
  bitrate: h.bitrate.length,
})

/* ── Local state: ignored items, songs LRCLIB didn't know ── */

export type Ignored = Partial<Record<IssueKind, string[]>>

interface Local {
  ignored: Ignored
  /** trackId → ms LRCLIB had nothing (skipped by "Fetch all" for 2 weeks) */
  misses: Record<string, number>
}
const KEY = 'health'
const MISS_TTL = 14 * 86_400_000

type LyricState = 'looking' | 'found' | 'none' | 'instrumental' | 'error'
export interface HealthState extends Local {
  loaded: boolean
  /** lyrics lookups */
  job: { running: boolean; total: number; done: number; saved: number; offline: boolean; error: string | null }
  lyricState: Record<string, LyricState>
}

let state: HealthState = {
  ignored: {},
  misses: {},
  loaded: false,
  job: { running: false, total: 0, done: 0, saved: 0, offline: false, error: null },
  lyricState: {},
}
const listeners = new Set<() => void>()
function set(patch: Partial<HealthState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let loading: Promise<void> | null = null
function persist() {
  void idbSet('kv', KEY, { ignored: state.ignored, misses: state.misses } satisfies Local)
}

export const healthStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  load(): Promise<void> {
    loading ??= idbGet<Local>('kv', KEY)
      .then((rec) => set({ ignored: rec?.ignored ?? {}, misses: rec?.misses ?? {}, loaded: true }))
      .catch(() => set({ loaded: true }))
    return loading
  },
  ignore(kind: IssueKind, ids: string[]) {
    const cur = new Set(state.ignored[kind] ?? [])
    ids.forEach((i) => cur.add(i))
    set({ ignored: { ...state.ignored, [kind]: [...cur] } })
    persist()
  },
  unignore(kind: IssueKind, ids: string[]) {
    const drop = new Set(ids)
    set({ ignored: { ...state.ignored, [kind]: (state.ignored[kind] ?? []).filter((i) => !drop.has(i)) } })
    persist()
  },
  clearIgnored() {
    set({ ignored: {}, misses: {} })
    persist()
  },
}

onAccountReset(() => {
  loading = null
  jobQueue.length = 0
  set({ ignored: {}, misses: {}, loaded: false, lyricState: {}, job: { running: false, total: 0, done: 0, saved: 0, offline: false, error: null } })
  void idbSet('kv', KEY, { ignored: {}, misses: {} })
})

export function useHealthState(): HealthState {
  return useSyncExternalStore(healthStore.subscribe, healthStore.get, healthStore.get)
}

/** The analysis for the current catalogue (null until it is loaded). */
export function useHealth(): Health | null {
  const { data } = useLibrary()
  const { doc, loaded: genresLoaded } = useGenres()
  const { ignored, loaded } = useHealthState()
  useEffect(() => {
    void healthStore.load()
    void genresStore.load()
  }, [])
  // wait for genres.json and the ignore list, or every album would show up as genre-less for a moment
  return useMemo(() => (data && loaded && genresLoaded ? analyse(data, doc, ignored) : null), [data, doc, ignored, loaded, genresLoaded])
}

/* ── Lyrics ─────────────────────────────────────────── */

export interface LyricsEvent {
  /** songs that got lyrics in this run */
  saved: number
  /** songs looked up */
  tried: number
  auto: boolean
}
const lyricListeners = new Set<(e: LyricsEvent) => void>()
/** A lyrics run finished (the app shell toasts the automatic ones). */
export function onLyricsRun(l: (e: LyricsEvent) => void) {
  lyricListeners.add(l)
  return () => {
    lyricListeners.delete(l)
  }
}

const jobQueue: string[] = []
let runPromise: Promise<void> | null = null
let runAuto = true
let runTried = 0
let runSaved = 0
const CONCURRENCY = 3
const BATCH = 12

const patchLyric = (id: string, s: LyricState) => set({ lyricState: { ...state.lyricState, [id]: s } })
const errMsg = (e: unknown) => (e instanceof AuthError ? 'Google session expired — sign in again' : ((e as Error)?.message ?? 'Something went wrong'))

/** Write found lyrics into library.json (songs that got lyrics meanwhile keep theirs). */
async function commitLyrics(batch: Map<string, { text: string; synced: boolean }>): Promise<number> {
  if (!batch.size) return 0
  let n = 0
  const w = await updateCatalogue(
    (c) => {
      n = 0
      for (const [id, v] of batch) {
        const t = c.tracks[id]
        if (!t || hasLyrics(t)) continue
        t.lyrics = v.text
        t.syncedLyrics = v.synced
        n++
      }
    },
    () => ({ data: libraryStore.get().data, version: libraryStore.get().fileVersion }),
  )
  libraryStore.adopt(w.data, w.fileId, w.version)
  return n
}

/**
 * Look up lyrics for these songs on LRCLIB and save what is found. Songs that already have lyrics are
 * skipped. Adds to the running job if there is one.
 */
export function fetchLyrics(trackIds: string[], opts: { auto?: boolean; force?: boolean } = {}): Promise<void> {
  const c = libraryStore.get().data
  if (!c) return Promise.resolve()
  const now = Date.now()
  const queued = new Set(jobQueue)
  const fresh = trackIds.filter((id) => {
    const t = c.tracks[id]
    if (!t || hasLyrics(t) || queued.has(id) || state.lyricState[id] === 'looking') return false
    if (!opts.force && (state.misses[id] ?? 0) > now - MISS_TTL) return false
    return true
  })
  if (!fresh.length) return runPromise ?? Promise.resolve()
  jobQueue.push(...fresh)
  const job = state.job
  set({ job: { ...job, running: true, total: job.running ? job.total + fresh.length : fresh.length, done: job.running ? job.done : 0, saved: job.running ? job.saved : 0, offline: false, error: null } })
  if (!runPromise) {
    runAuto = opts.auto ?? false
    runTried = 0
    runSaved = 0
    runPromise = runJobs().finally(() => {
      runPromise = null
    })
  } else if (!opts.auto) runAuto = false
  return runPromise
}

async function runJobs(): Promise<void> {
  const pending = new Map<string, { text: string; synced: boolean }>()
  let stop = false
  let writing: Promise<void> = Promise.resolve()
  const flush = () => {
    if (!pending.size) return
    const batch = new Map(pending)
    pending.clear()
    writing = writing
      .then(async () => {
        const n = await commitLyrics(batch)
        runSaved += n
        set({ job: { ...state.job, saved: state.job.saved + n } })
        for (const id of batch.keys()) if (libraryStore.get().data?.tracks[id] && !hasLyrics(libraryStore.get().data!.tracks[id])) patchLyric(id, 'error')
      })
      .catch((e) => {
        stop = true
        for (const id of batch.keys()) patchLyric(id, 'error')
        set({ job: { ...state.job, error: errMsg(e) } })
      })
  }
  const worker = async () => {
    while (!stop) {
      const id = jobQueue.shift()
      if (!id) return
      const t = libraryStore.get().data?.tracks[id]
      if (!t || hasLyrics(t)) {
        set({ job: { ...state.job, done: state.job.done + 1 } })
        continue
      }
      const album = libraryStore.get().data?.albums[t.albumId]
      patchLyric(id, 'looking')
      try {
        const r = await lookupLyrics({ title: t.title, artist: t.artist, album: album?.title, duration: t.duration })
        runTried++
        if (r.kind === 'found') {
          pending.set(id, { text: r.text, synced: r.synced })
          patchLyric(id, 'found')
          if (pending.size >= BATCH) flush()
        } else if (r.kind === 'instrumental') {
          patchLyric(id, 'instrumental')
          healthStore.ignore('lyrics', [id])
        } else {
          patchLyric(id, 'none')
          set({ misses: { ...state.misses, [id]: Date.now() } })
          persist()
        }
      } catch (e) {
        if (e instanceof LyricsOffline) {
          // LRCLIB / the connection is down: put this one back and stop, nothing is marked as missing
          jobQueue.unshift(id)
          patchLyric(id, 'error')
          stop = true
          set({ job: { ...state.job, offline: true } })
          return
        }
        patchLyric(id, 'error')
      }
      set({ job: { ...state.job, done: state.job.done + 1 } })
    }
  }
  // songs added while the last workers were finishing: go round again
  do await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  while (!stop && jobQueue.length)
  flush()
  await writing
  if (stop) jobQueue.length = 0
  set({ job: { ...state.job, running: false } })
  if (runTried) lyricListeners.forEach((l) => l({ saved: runSaved, tried: runTried, auto: runAuto }))
}

/** Songs that just arrived (Upload): look their lyrics up in the background, if the setting is on. */
export function autoFetchLyrics(trackIds: string[]) {
  if (!settingsStore.get().fetchLyrics || !navigator.onLine) return
  void healthStore.load().then(() => fetchLyrics(trackIds, { auto: true }))
}

/** Stop a running "fetch all" (what is already found still gets saved). */
export function cancelLyrics() {
  jobQueue.length = 0
}

/* ── Year ───────────────────────────────────────────── */

export interface YearSuggestion {
  year: number
  source: string
  /** the title the source has, when it differs */
  title: string
}

const ITUNES = 'https://itunes.apple.com/search'

/** Possible years for an album: MusicBrainz (first release) and iTunes, most trusted first. */
export async function yearSuggestions(album: Album): Promise<YearSuggestion[]> {
  const out: YearSuggestion[] = []
  const ours = foldTitle(album.title)
  const add = (s: YearSuggestion) => {
    if (!out.some((o) => o.year === s.year)) out.push(s)
  }
  try {
    const hits = await searchReleaseGroups(album.artist, album.title)
    for (const h of hits) if (h.year && h.score >= 70 && foldTitle(h.title) === ours) add({ year: h.year, source: 'MusicBrainz', title: h.title })
  } catch (e) {
    if (e instanceof MbOffline) throw e
    if (!(e instanceof MbError)) throw e
  }
  try {
    const res = await fetch(`${ITUNES}?${new URLSearchParams({ term: `${album.artist} ${album.title}`, entity: 'album', limit: '6' })}`)
    if (res.ok) {
      const j = (await res.json()) as { results?: { collectionName?: string; artistName?: string; releaseDate?: string }[] }
      for (const r of j.results ?? []) {
        const y = Number((r.releaseDate ?? '').slice(0, 4))
        if (y >= 1900 && y < 2100 && foldTitle(r.collectionName ?? '') === ours) add({ year: y, source: 'iTunes', title: r.collectionName ?? '' })
      }
    }
  } catch {
    /* offline: MusicBrainz result (if any) stands */
  }
  return out.sort((a, b) => (a.source === b.source ? a.year - b.year : a.source === 'MusicBrainz' ? -1 : 1))
}

/** Save an album's year into library.json. Returns the previous value (for Undo). */
export async function setAlbumYear(albumId: string, year: number | null): Promise<number | undefined> {
  let prev: number | undefined
  const w = await updateCatalogue(
    (c) => {
      const a = c.albums[albumId]
      if (!a) return
      prev = a.year
      if (year) a.year = year
      else delete a.year
    },
    () => ({ data: libraryStore.get().data, version: libraryStore.get().fileVersion }),
  )
  libraryStore.adopt(w.data, w.fileId, w.version)
  return prev
}

/* ── Cover ──────────────────────────────────────────── */

export interface CoverCandidate {
  id: string
  source: string
  /** small preview (plain <img>, no CORS needed) */
  thumb: string
  /** what gets downloaded and saved (600 px square JPEG) */
  full: string[]
  caption: string
}

/** Covers for an album from Cover Art Archive (via MusicBrainz) and iTunes. */
export async function coverCandidates(album: Album): Promise<CoverCandidate[]> {
  const out: CoverCandidate[] = []
  const ours = foldTitle(album.title)
  try {
    const hits = (await searchReleaseGroups(album.artist, album.title, 3)).filter((h) => h.score >= 70 && foldTitle(h.title) === ours).slice(0, 3)
    for (const h of hits)
      out.push({
        id: `caa-${h.id}`,
        source: 'Cover Art Archive',
        thumb: `https://coverartarchive.org/release-group/${h.id}/front-250`,
        full: [`https://coverartarchive.org/release-group/${h.id}/front-1200`, `https://coverartarchive.org/release-group/${h.id}/front-500`],
        caption: h.year ? String(h.year) : 'MusicBrainz',
      })
  } catch (e) {
    if (e instanceof MbOffline) throw e
  }
  try {
    const res = await fetch(`${ITUNES}?${new URLSearchParams({ term: `${album.artist} ${album.title}`, entity: 'album', limit: '8' })}`)
    if (res.ok) {
      const j = (await res.json()) as { results?: { collectionId?: number; collectionName?: string; artworkUrl100?: string }[] }
      for (const r of j.results ?? []) {
        if (!r.artworkUrl100 || foldTitle(r.collectionName ?? '') !== ours) continue
        out.push({
          id: `itunes-${r.collectionId}`,
          source: 'iTunes',
          thumb: r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.'),
          full: [r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/1000x1000bb.'), r.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.')],
          caption: r.collectionName ?? '',
        })
        if (out.length >= 5) break
      }
    }
  } catch {
    /* offline */
  }
  return out
}

/** Fit inside size×size (same as the Upload page). */
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

/** Download the first of these URLs that works. */
async function fetchImage(urls: string[]): Promise<Blob> {
  let last: unknown = null
  for (const u of urls) {
    try {
      const res = await fetch(u)
      if (!res.ok) continue
      const b = await res.blob()
      if (b.size > 2000 && b.type.startsWith('image/')) return b
    } catch (e) {
      last = e
    }
  }
  throw new Error(last ? 'The image could not be downloaded (blocked or offline) — try another, or choose a file.' : 'That image is no longer available — try another.')
}

/** Save a cover for an album: Drive `covers/<albumId>.jpg` + `album.cover` in library.json. */
export async function setAlbumCover(albumId: string, source: Blob | string[]): Promise<void> {
  const blob = Array.isArray(source) ? await fetchImage(source) : source
  const jpg = await squareJpeg(blob, 600)
  const up = await putFile({ name: `${albumId}.jpg`, parts: ['covers'], mime: 'image/jpeg', data: jpg })
  void idbSet('covers', up.id, jpg) // shows straight away, no download
  const w = await updateCatalogue(
    (c) => {
      const a = c.albums[albumId]
      if (a) a.cover = up.id
    },
    () => ({ data: libraryStore.get().data, version: libraryStore.get().fileVersion }),
  )
  libraryStore.adopt(w.data, w.fileId, w.version)
}

/* ── Genre ──────────────────────────────────────────── */

/** Genre ideas for an album: its artist's other albums first, then what the library uses most. */
export function genreSuggestions(c: Catalogue, doc: GenresDoc, album: Album): { fromArtist: string[]; common: string[] } {
  const count = (albums: Album[]) => {
    const m = new Map<string, { name: string; n: number }>()
    for (const a of albums)
      for (const g of albumGenresOf(doc, a).genres) {
        const k = g.toLowerCase()
        const cur = m.get(k)
        if (cur) cur.n++
        else m.set(k, { name: g, n: 1 })
      }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name)
  }
  const all = Object.values(c.albums)
  const fromArtist = count(all.filter((a) => a.artistId === album.artistId && a.id !== album.id)).slice(0, 4)
  const common = count(all).filter((g) => !fromArtist.some((f) => f.toLowerCase() === g.toLowerCase())).slice(0, 8)
  return { fromArtist, common }
}

export const setAlbumGenres = (albumId: string, genres: string[]) => genresStore.setAlbum(albumId, genres)
