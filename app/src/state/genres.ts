/**
 * Genres (step 20b). Most albums have no GENRE tag, so the app fills the gaps itself and lets Ivan
 * fix any album or artist. Kept in Drive `Pelagic/genres.json` (never in the FLAC tags or
 * library.json):
 *
 *   albums[albumId]   { mb: [...] from the MusicBrainz release group, user: [...] set in the app }
 *   artists[artistId] { mb: [...] the artist's MusicBrainz genres,   user: [...] set in the app }
 *   checked[artistId] when the MusicBrainz pass last looked at that artist
 *
 * An album's genres, first that has any:
 *   1. set on the album in the app      2. the album's GENRE tag
 *   3. set on its artist in the app     4. MusicBrainz release group     5. MusicBrainz artist
 *
 * Merge between devices: each `mb` / `user` value by its own stamp (latest wins), `checked` by max.
 * `user: null` with a stamp = "back to automatic". The MusicBrainz pass runs a few seconds after
 * launch for artists not checked in the last 90 days (2 requests each, through the shared
 * rate-limited queue in lib/musicbrainz.ts), syncing first so the PC and the phone don't both do it.
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT, GENRES_NAME } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { artistGenres as mbArtistGenres, browseReleaseGroupGenres, findArtist, foldTitle, MbOffline, SPECIAL_ARTISTS, type MbGenre } from '../lib/musicbrainz'
import { libraryStore, type Album, type Catalogue } from './library'
import { releasesStore } from './releases'
import { onAccountReset, sessionStore } from './session'
import { artistInfos } from './views'

/* ── Types ──────────────────────────────────────────── */

export interface GenreEntry {
  mb?: string[]
  mbAt?: number
  /** null = cleared (back to automatic) */
  user?: string[] | null
  userAt?: number
}

export interface GenresDoc {
  albums: Record<string, GenreEntry>
  artists: Record<string, GenreEntry>
  /** artistId → ms the MusicBrainz pass last looked (0 / missing = never) */
  checked: Record<string, number>
}

interface GenresFile extends GenresDoc {
  format: 'pelagic-genres'
  v: 1
  updatedAt: string
}

export type GenreSource = 'album' | 'tag' | 'artist' | 'mb-album' | 'mb-artist' | 'none'

export interface GenresState {
  doc: GenresDoc
  loaded: boolean
  syncing: boolean
  /** MusicBrainz pass in progress: artists done / to do */
  pass: { done: number; total: number } | null
}

const CACHE_KEY = 'genres'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const RECHECK_MS = 90 * 86_400_000
/** artists with nothing on MusicBrainz are tried again after a week */
const RETRY_EMPTY_MS = 7 * 86_400_000
const emptyDoc = (): GenresDoc => ({ albums: {}, artists: {}, checked: {} })

/* ── Helpers ────────────────────────────────────────── */

export const splitGenres = (g?: string | null) =>
  (g ?? '')
    .split(/[;/,|]/)
    .map((x) => x.trim())
    .filter(Boolean)

const foldG = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ').trim()

/** Clean a user list: trimmed, no duplicates (case-insensitive), at most 6. */
export function cleanGenres(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of list) {
    const v = g.normalize('NFC').trim().replace(/\s+/g, ' ')
    if (!v || seen.has(foldG(v))) continue
    seen.add(foldG(v))
    out.push(v)
    if (out.length === 6) break
  }
  return out
}

/** MusicBrainz genres are lower case ("progressive metal", "j-pop"): title-case them. */
export function titleGenre(g: string): string {
  const special: Record<string, string> = { 'r&b': 'R&B', edm: 'EDM', idm: 'IDM', 'k-pop': 'K-Pop', 'j-pop': 'J-Pop', 'j-rock': 'J-Rock', 'hip hop': 'Hip Hop', uk: 'UK', dnb: 'DnB' }
  if (special[g]) return special[g]
  return g.replace(/(^|[\s\-/(])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase()).replace(/\bAnd\b/g, 'and').replace(/\bN\b/g, 'n')
}

/** The top genres of a MusicBrainz entity (by vote count, at most 3). */
export function topGenres(list: MbGenre[] | undefined): string[] {
  return (list ?? [])
    .filter((g) => (g.count ?? 0) > 0)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((g) => titleGenre(g.name))
}

function mergeEntry(a: GenreEntry | undefined, b: GenreEntry | undefined): GenreEntry {
  if (!a) return b!
  if (!b) return a
  const mb = (b.mbAt ?? 0) > (a.mbAt ?? 0) ? b : a
  const user = (b.userAt ?? 0) > (a.userAt ?? 0) ? b : a
  const out: GenreEntry = {}
  if (mb.mbAt) Object.assign(out, { mb: mb.mb ?? [], mbAt: mb.mbAt })
  if (user.userAt) Object.assign(out, { user: user.user ?? null, userAt: user.userAt })
  return out
}

function mergeMap(a: Record<string, GenreEntry>, b: Record<string, GenreEntry>): Record<string, GenreEntry> {
  const out: Record<string, GenreEntry> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = mergeEntry(out[k], v)
  return out
}

export function mergeGenres(a: GenresDoc, b: GenresDoc): GenresDoc {
  const checked = { ...a.checked }
  for (const [k, v] of Object.entries(b.checked)) checked[k] = Math.max(checked[k] ?? 0, v)
  return { albums: mergeMap(a.albums, b.albums), artists: mergeMap(a.artists, b.artists), checked }
}

const strList = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : undefined)
function normEntries(raw: unknown): Record<string, GenreEntry> {
  const out: Record<string, GenreEntry> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== 'object') continue
    const e: GenreEntry = {}
    if (typeof v.mbAt === 'number') Object.assign(e, { mb: strList(v.mb) ?? [], mbAt: v.mbAt })
    if (typeof v.userAt === 'number') Object.assign(e, { user: v.user === null ? null : (strList(v.user) ?? null), userAt: v.userAt })
    if (e.mbAt || e.userAt) out[k] = e
  }
  return out
}
function normalise(raw: Partial<GenresFile> | null | undefined): GenresDoc {
  const checked: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw?.checked ?? {})) if (typeof v === 'number') checked[k] = v
  return { albums: normEntries(raw?.albums), artists: normEntries(raw?.artists), checked }
}

/* ── Resolving ──────────────────────────────────────── */

export interface AlbumGenres {
  genres: string[]
  source: GenreSource
}

/** An album's genres and where they came from (see the order at the top). */
export function albumGenresOf(doc: GenresDoc, album: Album | undefined): AlbumGenres {
  if (!album) return { genres: [], source: 'none' }
  const own = doc.albums[album.id]
  if (own?.user?.length) return { genres: own.user, source: 'album' }
  const tag = splitGenres(album.genre)
  if (tag.length) return { genres: tag, source: 'tag' }
  const artist = doc.artists[album.artistId]
  if (artist?.user?.length) return { genres: artist.user, source: 'artist' }
  if (own?.mb?.length) return { genres: own.mb, source: 'mb-album' }
  if (artist?.mb?.length) return { genres: artist.mb, source: 'mb-artist' }
  return { genres: [], source: 'none' }
}

const resolverMemo = new WeakMap<GenresDoc, WeakMap<Catalogue, (albumId: string) => string[]>>()
/** Memoised album → genres lookup for one (doc, catalogue) pair (smart playlists, facets). */
export function genreResolver(doc: GenresDoc, c: Catalogue): (albumId: string) => string[] {
  let byCat = resolverMemo.get(doc)
  if (!byCat) resolverMemo.set(doc, (byCat = new WeakMap()))
  let fn = byCat.get(c)
  if (!fn) {
    const cache = new Map<string, string[]>()
    fn = (albumId: string) => {
      let g = cache.get(albumId)
      if (!g) cache.set(albumId, (g = albumGenresOf(doc, c.albums[albumId]).genres))
      return g
    }
    byCat.set(c, fn)
  }
  return fn
}

/** An artist's genres: set in the app, else the most common among its albums, else MusicBrainz. */
export function artistGenresOf(doc: GenresDoc, c: Catalogue, artistId: string): AlbumGenres {
  const own = doc.artists[artistId]
  if (own?.user?.length) return { genres: own.user, source: 'artist' }
  const counts = new Map<string, { name: string; n: number }>()
  for (const a of artistInfos(c).get(artistId)?.albums ?? []) {
    const r = albumGenresOf(doc, a)
    if (r.source === 'mb-artist') continue
    for (const g of r.genres) {
      const k = foldG(g)
      const cur = counts.get(k)
      if (cur) cur.n++
      else counts.set(k, { name: g, n: 1 })
    }
  }
  if (counts.size) return { genres: [...counts.values()].sort((a, b) => b.n - a.n).map((x) => x.name), source: 'tag' }
  if (own?.mb?.length) return { genres: own.mb, source: 'mb-artist' }
  return { genres: [], source: 'none' }
}

export const SOURCE_LABEL: Record<GenreSource, string> = {
  album: 'SET BY YOU',
  tag: 'FROM THE FILE TAGS',
  artist: 'FROM THE ARTIST (SET BY YOU)',
  'mb-album': 'FROM MUSICBRAINZ',
  'mb-artist': 'FROM MUSICBRAINZ · ARTIST',
  none: 'NONE YET',
}

/* ── Store ──────────────────────────────────────────── */

let state: GenresState = { doc: emptyDoc(), loaded: false, syncing: false, pass: null }
const listeners = new Set<() => void>()
function set(patch: Partial<GenresState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let fileId: string | null = null
let version: string | null = null
let dirty = false
let generation = 0
let loading: Promise<void> | null = null
let inflight: Promise<void> | null = null
let passRun: Promise<void> | null = null
let syncTimer = 0
let persistTimer = 0

interface CacheRecord {
  email: string | null
  doc: GenresDoc
  fileId: string | null
  version: string | null
  dirty: boolean
}

function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    if (!state.loaded) return
    void idbSet('kv', CACHE_KEY, { email: sessionStore.get().account?.email ?? null, doc: state.doc, fileId, version, dirty } satisfies CacheRecord)
  }, 300)
}

function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void genresStore.sync(), ms)
}

function change(doc: GenresDoc, syncIn = 3_000) {
  dirty = true
  set({ doc })
  persist()
  scheduleSync(syncIn)
}

async function writeFile(doc: GenresDoc, parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-genres', v: 1, updatedAt: new Date().toISOString(), ...doc } satisfies GenresFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: GENRES_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
}

const VARIOUS = /^(various artists?|va|soundtrack|unknown artist)$/i

/** Artists the MusicBrainz pass should look at now: some album still has no genre of its own. */
function passTargets(c: Catalogue, doc: GenresDoc, now: number): { artistId: string; name: string; mbid: string | null; albums: Album[] }[] {
  const rdoc = releasesStore.get().doc
  const out = []
  for (const info of artistInfos(c).values()) {
    const a = info.artist
    if (!info.albums.length || VARIOUS.test(a.name.trim())) continue
    // only albums without a tag / own choice need MusicBrainz
    const needs = info.albums.filter((al) => !splitGenres(al.genre).length && !doc.albums[al.id]?.user?.length)
    if (!needs.length) continue
    const at = doc.checked[a.id] ?? 0
    const found = needs.some((al) => doc.albums[al.id]?.mb?.length) || !!doc.artists[a.id]?.mb?.length
    if (now - at < (found ? RECHECK_MS : RETRY_EMPTY_MS)) continue
    const mbid = a.mbid ?? rdoc.resolved[a.id]?.mbid ?? null
    if (mbid && SPECIAL_ARTISTS.has(mbid)) continue
    out.push({ artistId: a.id, name: a.name, mbid, albums: needs })
  }
  return out
}

export const genresStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  load(): Promise<void> {
    loading ??= (async () => {
      const gen = generation
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec?.doc && (!email || !rec.email || rec.email === email)) {
        fileId = rec.fileId
        version = rec.version
        dirty = rec.dirty || dirty
        set({ doc: mergeGenres(normalise(rec.doc), state.doc), loaded: true })
      } else set({ loaded: true })
    })()
    return loading
  },

  sync(): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await genresStore.load()
      set({ syncing: true })
      try {
        const parent = (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
        if (gen !== generation || !parent) return
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(GENRES_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            const d = state.doc
            dirty = Object.keys(d.albums).length + Object.keys(d.artists).length + Object.keys(d.checked).length > 0
            fileId = null
            version = null
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<GenresFile>
            if (gen !== generation) return
            set({ doc: mergeGenres(state.doc, normalise(raw)) })
            fileId = meta.id
            version = meta.version ?? null
          }
          if (!dirty) break
          if (meta && attempt < 4) {
            const again = await findChild(GENRES_NAME, parent, false)
            if (again && again.version !== meta.version) continue
          }
          dirty = false
          const w = await writeFile(state.doc, parent, meta?.id ?? null)
          if (gen !== generation) return
          fileId = w.id
          version = w.version
          break
        }
        persist()
      } catch (e) {
        if (gen !== generation) return
        dirty = true
        if (!(e instanceof AuthError)) scheduleSync(120_000)
      } finally {
        if (gen === generation) set({ syncing: false })
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  /** Fill missing genres from MusicBrainz (artists not checked lately). One pass at a time. */
  fill(): Promise<void> {
    if (passRun) return passRun
    const gen = generation
    passRun = (async () => {
      await genresStore.load()
      await releasesStore.load()
      if (sessionStore.get().status === 'signed-in') await genresStore.sync().catch(() => undefined)
      const c = libraryStore.get().data
      if (gen !== generation || !c || !navigator.onLine) return
      const targets = passTargets(c, state.doc, Date.now())
      if (!targets.length) return
      set({ pass: { done: 0, total: targets.length } })
      let done = 0
      for (const t of targets) {
        if (gen !== generation) return
        try {
          const mbid = t.mbid ?? (await findArtist(t.name, t.albums.map((a) => a.title)))
          const now = Date.now()
          const doc = state.doc
          const albums = { ...doc.albums }
          const artists = { ...doc.artists }
          if (mbid) {
            const artistG = topGenres(await mbArtistGenres(mbid))
            const rgs = await browseReleaseGroupGenres(mbid)
            const byTitle = new Map<string, MbGenre[]>()
            for (const rg of rgs) {
              const k = foldTitle(rg.title)
              if (k && !byTitle.has(k) && rg.genres?.length) byTitle.set(k, rg.genres)
            }
            for (const al of t.albums) {
              const g = topGenres(byTitle.get(foldTitle(al.title)))
              if (g.length) albums[al.id] = { ...albums[al.id], mb: g, mbAt: now }
            }
            artists[t.artistId] = { ...artists[t.artistId], mb: artistG, mbAt: now }
          }
          if (gen !== generation) return
          change({ albums, artists, checked: { ...state.doc.checked, [t.artistId]: now } }, 30_000)
        } catch (e) {
          if (e instanceof MbOffline || (e instanceof DOMException && e.name === 'AbortError')) break
          // rate-limited / server trouble: leave this artist for next time
        }
        done++
        set({ pass: { done, total: targets.length } })
      }
    })().finally(() => {
      passRun = null
      if (gen === generation) set({ pass: null })
      if (dirty) scheduleSync(1_000)
    })
    return passRun
  },

  /* ── Edits (stamped, synced) ── */

  /** Set an album's genres (null / empty = back to automatic). */
  setAlbum(albumId: string, genres: string[] | null) {
    const list = genres ? cleanGenres(genres) : []
    const doc = state.doc
    change({ ...doc, albums: { ...doc.albums, [albumId]: { ...doc.albums[albumId], user: list.length ? list : null, userAt: Date.now() } } })
  },
  /** Set an artist's genres: used for its albums that have none of their own. */
  setArtist(artistId: string, genres: string[] | null) {
    const list = genres ? cleanGenres(genres) : []
    const doc = state.doc
    change({ ...doc, artists: { ...doc.artists, [artistId]: { ...doc.artists[artistId], user: list.length ? list : null, userAt: Date.now() } } })
  },

  reset() {
    generation++
    window.clearTimeout(syncTimer)
    fileId = null
    version = null
    dirty = false
    inflight = null
    passRun = null
    loading = Promise.resolve()
    set({ doc: emptyDoc(), loaded: true, syncing: false, pass: null })
  },

  init() {
    void genresStore.load()
    let kick = 0
    const later = (ms: number) => {
      window.clearTimeout(kick)
      kick = window.setTimeout(() => {
        if (libraryStore.get().data && sessionStore.get().status === 'signed-in') void genresStore.fill()
      }, ms)
    }
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight) {
        scheduleSync(3_000)
        later(20_000)
      }
    })
    if (sessionStore.get().status === 'signed-in') scheduleSync(3_000)
    // new music (import / Upload) → look its artists up too; also once after launch
    let cat = libraryStore.get().data
    libraryStore.subscribe(() => {
      const next = libraryStore.get().data
      if (next && next !== cat) {
        cat = next
        later(20_000)
      }
    })
    later(20_000)
    window.addEventListener('online', () => {
      scheduleSync(2_000)
      later(10_000)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) void genresStore.sync()
    })
  },
}

onAccountReset(() => genresStore.reset())

export function useGenres(): GenresState {
  return useSyncExternalStore(genresStore.subscribe, genresStore.get, genresStore.get)
}
