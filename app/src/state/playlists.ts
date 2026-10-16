/**
 * Playlists (step 9): one JSON file per playlist in Drive `Pelagic/playlists/<playlistId>.json`
 * (+ an optional `<playlistId>.jpg` custom cover). No "Liked songs" playlist (see the plan).
 *
 * Offline-first: every edit lands in the local copy (IndexedDB `kv.playlists`) at once and is
 * pushed to Drive a moment later, or whenever the device is back online. Two devices editing the
 * same playlist merge entry by entry, so nothing is lost:
 *
 *   - entries are keyed by `entryId`; adds from both devices survive (union);
 *   - removing an entry leaves a tombstone (`removed` + `removedAt`), so an older copy can't bring
 *     it back; Undo flips it back with a newer stamp;
 *   - order is a fractional index (`pos`); the latest move of an entry wins (`movedAt`);
 *   - name / description / cover / deleted: the latest edit of each field wins (`stamps`).
 *
 * Deleting a playlist writes `deleted: true` into its file and moves the file to the Drive trash
 * (the other device still sees it there and drops the playlist; restoring brings it back). Once
 * the trash is emptied the file is gone and the local tombstone is dropped as well.
 *
 * Each entry keeps the track's `isrc`, `title` and `artist` next to its `trackId`, so a track
 * whose id changes after a tag edit can still be found (state/playlistViews.ts).
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT, PLAYLISTS_DIR } from '../config'
import { AuthError, download, driveFetch, findChild, FOLDER_MIME, getMeta } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { folder, putFile } from '../upload/driveWrite'
import { genresStore } from './genres'
import { historyStore } from './history'
import { libraryStore, type Track } from './library'
import { onAccountReset, sessionStore } from './session'
import { normaliseSmart, type SmartRules } from './smart'

/* ── Types ──────────────────────────────────────────── */

export interface Entry {
  entryId: string
  trackId: string
  isrc?: string
  title: string
  artist: string
  /** ISO time the track was added */
  addedAt: string
  /** fractional index: entries sort by pos (then entryId) */
  pos: number
  /** ms; the latest move wins */
  movedAt: number
  /** tombstone: the entry stays in the file so an older copy can't resurrect it */
  removed?: boolean
  /** ms of the last remove / restore */
  removedAt?: number
}

export interface Stamps {
  name: number
  description: number
  cover: number
  deleted: number
  /** smart playlists: the rules (step 20) */
  smart: number
}

export interface Playlist {
  id: string
  name: string
  description: string
  /** Drive file id of playlists/<id>.jpg, or null → 2×2 mosaic of the first album covers */
  cover: string | null
  createdAt: string
  updatedAt: string
  deleted: boolean
  /** ms of the last change of each field (latest wins on merge) */
  stamps: Stamps
  entries: Entry[]
  /**
   * Smart playlist (step 20): its songs come from these rules (state/smart.ts), worked out on each
   * device from the catalogue + play history; `entries` stays empty. null / missing = a normal playlist.
   */
  smart?: SmartRules | null
}

export const isSmart = (p: Playlist | undefined | null): boolean => !!p?.smart

/** playlists/<id>.json on Drive */
interface PlaylistFile extends Playlist {
  format: 'pelagic-playlist'
  v: 1
}

interface Rec {
  doc: Playlist
  /** Drive file + the version our copy was merged with (null: never written) */
  fileId: string | null
  version: string | null
  /** changed here since the last write */
  dirty: boolean
}

interface CacheRecord {
  email: string | null
  recs: Record<string, Rec>
  syncedAt: number | null
}

export interface PlaylistsState {
  /** live (not deleted) playlists, A–Z */
  list: Playlist[]
  byId: Map<string, Playlist>
  /** the IndexedDB copy has been read */
  loaded: boolean
  syncing: boolean
  syncedAt: number | null
  /** playlists changed here that Drive doesn't have yet */
  pending: number
  error: string | null
}

const CACHE_KEY = 'playlists'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const GAP = 1024

/* ── Helpers ────────────────────────────────────────── */

const rid = (n = 10) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
}
const now = () => Date.now()
const iso = (ms = now()) => new Date(ms).toISOString()
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export const byPos = (a: Entry, b: Entry) => a.pos - b.pos || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0)
/** Entries in playlist order, tombstones left out. */
export const liveEntries = (p: Playlist): Entry[] => p.entries.filter((e) => !e.removed).sort(byPos)

function normalise(raw: Partial<PlaylistFile>, id: string): Playlist {
  const t = now()
  const stamps: Stamps = { name: 0, description: 0, cover: 0, deleted: 0, smart: 0, ...(raw.stamps ?? {}) }
  return {
    id: raw.id || id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled playlist',
    description: typeof raw.description === 'string' ? raw.description : '',
    cover: typeof raw.cover === 'string' ? raw.cover : null,
    createdAt: raw.createdAt || iso(t),
    updatedAt: raw.updatedAt || raw.createdAt || iso(t),
    deleted: !!raw.deleted,
    stamps,
    smart: normaliseSmart(raw.smart),
    entries: (Array.isArray(raw.entries) ? raw.entries : [])
      .filter((e): e is Entry => !!e && typeof e.entryId === 'string' && typeof e.trackId === 'string')
      .map((e) => ({ ...e, pos: Number.isFinite(e.pos) ? e.pos : 0, movedAt: e.movedAt || 0 })),
  }
}

/** Field-by-field, entry-by-entry merge (commutative: either side may be "ours"). */
export function mergePlaylists(a: Playlist, b: Playlist): Playlist {
  const pick = <K extends keyof Stamps>(k: K) => (b.stamps[k] > a.stamps[k] ? b : a)
  const n = pick('name')
  const d = pick('description')
  const c = pick('cover')
  const del = pick('deleted')
  const sm = pick('smart')
  const entries = new Map<string, Entry>()
  for (const e of a.entries) entries.set(e.entryId, e)
  for (const e of b.entries) {
    const o = entries.get(e.entryId)
    if (!o) {
      entries.set(e.entryId, e)
      continue
    }
    const moved = e.movedAt > o.movedAt ? e : o
    const rm = (e.removedAt ?? 0) > (o.removedAt ?? 0) ? e : o
    entries.set(e.entryId, { ...o, pos: moved.pos, movedAt: moved.movedAt, removed: rm.removed, removedAt: rm.removedAt })
  }
  return {
    id: a.id,
    name: n.name,
    description: d.description,
    cover: c.cover,
    deleted: del.deleted,
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
    stamps: { name: n.stamps.name, description: d.stamps.description, cover: c.stamps.cover, deleted: del.stamps.deleted, smart: sm.stamps.smart },
    entries: [...entries.values()],
    smart: sm.smart ?? null,
  }
}

/** Order positions for `count` new entries at the end. */
function tailPositions(p: Playlist, count: number): number[] {
  const max = p.entries.reduce((m, e) => Math.max(m, e.pos), 0)
  return Array.from({ length: count }, (_, i) => max + GAP * (i + 1))
}

/* ── Store ──────────────────────────────────────────── */

let recs = new Map<string, Rec>()
/** edit counter per playlist: a write only clears `dirty` if nothing changed while it ran */
const revs = new Map<string, number>()
let generation = 0
let folderId: string | null = null

let state: PlaylistsState = { list: [], byId: new Map(), loaded: false, syncing: false, syncedAt: null, pending: 0, error: null }
const listeners = new Set<() => void>()
function set(patch: Partial<PlaylistsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function publish(extra: Partial<PlaylistsState> = {}) {
  const live = [...recs.values()].map((r) => r.doc).filter((p) => !p.deleted)
  live.sort((a, b) => collator.compare(a.name, b.name) || a.createdAt.localeCompare(b.createdAt))
  set({ list: live, byId: new Map(live.map((p) => [p.id, p])), pending: [...recs.values()].filter((r) => r.dirty).length, ...extra })
}

let persistTimer = 0
function persist() {
  window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    if (!state.loaded) return
    void idbSet('kv', CACHE_KEY, {
      email: sessionStore.get().account?.email ?? null,
      recs: Object.fromEntries(recs),
      syncedAt: state.syncedAt,
    } satisfies CacheRecord)
  }, 250)
}

let syncTimer = 0
function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void playlistsStore.sync(), ms)
}

/** Apply an edit to one playlist: new doc, marked dirty, published, saved, pushed soon. */
function edit(id: string, fn: (p: Playlist, t: number) => Playlist | null): boolean {
  const rec = recs.get(id)
  if (!rec) return false
  const t = now()
  const doc = fn(rec.doc, t)
  if (!doc) return false
  recs.set(id, { ...rec, doc: { ...doc, updatedAt: iso(t) }, dirty: true })
  revs.set(id, (revs.get(id) ?? 0) + 1)
  publish()
  persist()
  scheduleSync(2_000)
  return true
}

function trackFields(t: Track) {
  return { trackId: t.id, isrc: t.isrc || undefined, title: t.title, artist: t.artist }
}

/* ── Drive ──────────────────────────────────────────── */

interface ListedFile {
  id: string
  name: string
  version?: string
  trashed?: boolean
}

async function findFolder(): Promise<string | null> {
  if (folderId) return folderId
  const root = await findChild(DRIVE_ROOT, 'root', true)
  if (!root) return null
  const f = await findChild(PLAYLISTS_DIR, root.id, true)
  folderId = f?.id ?? null
  return folderId
}

/** Every playlist file in the folder, trashed ones too (they carry deletions). */
async function listFiles(parent: string): Promise<ListedFile[]> {
  const out: ListedFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and mimeType != '${FOLDER_MIME}'`,
      fields: 'nextPageToken,files(id,name,version,trashed)',
      spaces: 'drive',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(`/files?${params}`)
    const j = (await res.json()) as { files: ListedFile[]; nextPageToken?: string }
    out.push(...j.files.filter((f) => f.name.endsWith('.json')))
    pageToken = j.nextPageToken
  } while (pageToken)
  return out
}

async function readFile(fileId: string, id: string): Promise<Playlist> {
  const raw = JSON.parse(new TextDecoder().decode(await download(fileId))) as Partial<PlaylistFile>
  return normalise(raw, id)
}

async function writeFile(doc: Playlist, parent: string, existingId: string | null, trashed: boolean | undefined): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-playlist', v: 1, ...doc } satisfies PlaylistFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: `${doc.id}.json`, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  let j = (await res.json()) as { id: string; version?: string }
  // deleted ⇄ Drive trash
  if (doc.deleted !== !!trashed && (doc.deleted || trashed !== undefined)) {
    const r = await driveFetch(`/files/${j.id}?fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: doc.deleted }),
    })
    j = (await r.json()) as { id: string; version?: string }
  }
  return { id: j.id, version: j.version ?? null }
}

/* ── Public API ─────────────────────────────────────── */

let loading: Promise<void> | null = null
let inflight: Promise<void> | null = null

export const playlistsStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  /** Read the IndexedDB copy (once). */
  load(): Promise<void> {
    loading ??= (async () => {
      const gen = generation
      const rec = await idbGet<CacheRecord>('kv', CACHE_KEY)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec && (!email || !rec.email || rec.email === email)) {
        for (const [id, r] of Object.entries(rec.recs)) {
          const mine = recs.get(id) // edited before the cache was read
          recs.set(id, mine ? { ...mine, doc: mergePlaylists(normalise(r.doc, id), mine.doc), fileId: r.fileId, version: r.version } : { ...r, doc: normalise(r.doc, id) })
        }
        publish({ loaded: true, syncedAt: rec.syncedAt })
      } else publish({ loaded: true })
    })()
    return loading
  },

  /** Pull every playlist that changed on Drive, push the ones changed here. */
  sync(opts: { minAge?: number } = {}): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    if (opts.minAge && !state.pending && state.syncedAt && now() - state.syncedAt < opts.minAge) return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await playlistsStore.load()
      set({ syncing: true, error: null })
      try {
        let parent = await findFolder()
        if (gen !== generation) return
        const dirty = () => [...recs.entries()].filter(([, r]) => r.dirty)
        if (!parent && !dirty().length) {
          // nothing on Drive, nothing to send: playlists written before were removed with the folder
          for (const [id, r] of recs) if (r.fileId) recs.delete(id)
          publish({ syncing: false, syncedAt: now() })
          persist()
          return
        }
        parent ??= folderId = await folder([PLAYLISTS_DIR])
        if (gen !== generation) return

        const files = await listFiles(parent)
        if (gen !== generation) return
        const listed = new Map<string, ListedFile>()
        for (const f of files) {
          const id = f.name.replace(/\.json$/, '')
          // two files for one id (written twice at once): keep the one we know, else the first
          if (!listed.has(id) || recs.get(id)?.fileId === f.id) listed.set(id, f)
        }

        // pull
        for (const [id, f] of listed) {
          const rec = recs.get(id)
          if (rec && rec.fileId === f.id && rec.version === f.version) continue
          const remote = await readFile(f.id, id)
          if (gen !== generation) return
          if (f.trashed && !remote.deleted) {
            // trashed by hand in Drive: same as deleted
            remote.deleted = true
          }
          const cur = recs.get(id)
          const doc = cur ? mergePlaylists(cur.doc, remote) : remote
          recs.set(id, { doc, fileId: f.id, version: f.version ?? null, dirty: cur?.dirty ?? false })
        }
        // gone from Drive for good (trash emptied / deleted by hand): drop, unless edited here since
        for (const [id, r] of [...recs]) if (r.fileId && !listed.has(id) && !r.dirty) recs.delete(id)
        publish()

        // push
        for (const [id, r] of dirty()) {
          const rev = revs.get(id) ?? 0
          let doc = r.doc
          let fileId = listed.has(id) ? r.fileId : null
          const trashed = listed.get(id)?.trashed
          if (fileId) {
            // someone wrote since we listed → merge their copy first
            const meta = await getMeta(fileId).catch(() => null)
            if (gen !== generation) return
            if (!meta) fileId = null
            else if (meta.version !== r.version && meta.version !== listed.get(id)?.version) {
              doc = mergePlaylists(doc, await readFile(fileId, id))
              if (gen !== generation) return
            }
          }
          if (!fileId && doc.deleted) {
            // created and deleted before it ever reached Drive
            recs.delete(id)
            continue
          }
          const w = await writeFile(doc, parent, fileId, fileId ? trashed : undefined)
          if (gen !== generation) return
          const cur = recs.get(id)
          if (!cur) continue
          const stillSame = (revs.get(id) ?? 0) === rev
          recs.set(id, { doc: stillSame ? doc : mergePlaylists(cur.doc, doc), fileId: w.id, version: w.version, dirty: !stillSame })
        }
        publish({ syncing: false, syncedAt: now() })
        persist()
        if (state.pending) scheduleSync(3_000) // edited while writing
      } catch (e) {
        if (gen !== generation) return
        folderId = null // it may have been deleted
        set({ syncing: false, error: e instanceof AuthError ? null : (e as Error).message || 'Could not sync playlists.' })
        persist()
        if (!(e instanceof AuthError)) scheduleSync(120_000)
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  /* ── Edits ── */

  /** New playlist (optionally starting with tracks). Returns its id. */
  create(name: string, trackIds: string[] = [], description = '', smart: SmartRules | null = null): string {
    const t = now()
    const id = `pl-${rid(10)}`
    const doc: Playlist = {
      id,
      name: name.normalize('NFC').trim() || 'Untitled playlist',
      description: description.normalize('NFC').trim(),
      cover: null,
      createdAt: iso(t),
      updatedAt: iso(t),
      deleted: false,
      stamps: { name: t, description: t, cover: t, deleted: t, smart: smart ? t : 0 },
      entries: [],
      smart: smart ?? null,
    }
    recs.set(id, { doc, fileId: null, version: null, dirty: true })
    revs.set(id, 1)
    if (trackIds.length && !smart) playlistsStore.addTracks(id, trackIds)
    else {
      publish()
      persist()
      scheduleSync(2_000)
    }
    return id
  },

  rename(id: string, name: string) {
    const v = name.normalize('NFC').trim()
    if (!v) return
    edit(id, (p, t) => (p.name === v ? null : { ...p, name: v, stamps: { ...p.stamps, name: t } }))
  },

  setDescription(id: string, description: string) {
    const v = description.normalize('NFC').trim()
    edit(id, (p, t) => (p.description === v ? null : { ...p, description: v, stamps: { ...p.stamps, description: t } }))
  },

  /** Custom cover (a JPEG, already resized) → playlists/<id>.jpg; null goes back to the mosaic. Needs Drive. */
  async setCover(id: string, jpeg: Blob | null): Promise<void> {
    if (!jpeg) {
      edit(id, (p, t) => (p.cover === null ? null : { ...p, cover: null, stamps: { ...p.stamps, cover: t } }))
      return
    }
    const up = await putFile({ name: `${id}.jpg`, parts: [PLAYLISTS_DIR], mime: 'image/jpeg', data: jpeg })
    edit(id, (p, t) => ({ ...p, cover: up.id, stamps: { ...p.stamps, cover: t } }))
  },

  /** Change a smart playlist's rules (Undo: call again with the old ones). */
  setSmart(id: string, smart: SmartRules) {
    edit(id, (p, t) => (!p.smart || JSON.stringify(p.smart) === JSON.stringify(smart) ? null : { ...p, smart, stamps: { ...p.stamps, smart: t } }))
  },

  /** Delete (Undo: `restore`). */
  remove(id: string) {
    edit(id, (p, t) => (p.deleted ? null : { ...p, deleted: true, stamps: { ...p.stamps, deleted: t } }))
  },
  restore(id: string) {
    edit(id, (p, t) => (!p.deleted ? null : { ...p, deleted: false, stamps: { ...p.stamps, deleted: t } }))
  },

  /** Append tracks (in the given order). Returns the new entry ids. */
  addTracks(id: string, trackIds: string[]): string[] {
    const c = libraryStore.get().data
    const added: string[] = []
    edit(id, (p, t) => {
      const tracks = trackIds.map((tid) => c?.tracks[tid]).filter((x): x is Track => !!x)
      if (!tracks.length || p.smart) return null
      const pos = tailPositions(p, tracks.length)
      const entries = tracks.map((tr, i): Entry => {
        const entryId = rid(10)
        added.push(entryId)
        return { entryId, ...trackFields(tr), addedAt: iso(t), pos: pos[i], movedAt: t }
      })
      return { ...p, entries: [...p.entries, ...entries] }
    })
    return added
  },

  /** Remove entries (tombstones). */
  removeEntries(id: string, entryIds: string[]) {
    const ids = new Set(entryIds)
    edit(id, (p, t) => ({ ...p, entries: p.entries.map((e) => (ids.has(e.entryId) && !e.removed ? { ...e, removed: true, removedAt: t } : e)) }))
  },
  /** Undo a removal (or an add: `removeEntries` with the new ids). */
  restoreEntries(id: string, entryIds: string[]) {
    const ids = new Set(entryIds)
    edit(id, (p, t) => ({ ...p, entries: p.entries.map((e) => (ids.has(e.entryId) && e.removed ? { ...e, removed: false, removedAt: t } : e)) }))
  },

  /** Move one entry so it ends up at index `to` of the live order. */
  moveEntry(id: string, entryId: string, to: number) {
    edit(id, (p, t) => {
      if (p.smart) return null
      const live = liveEntries(p)
      const from = live.findIndex((e) => e.entryId === entryId)
      if (from < 0 || from === to || to < 0 || to >= live.length) return null
      const rest = live.filter((e) => e.entryId !== entryId)
      const before = rest[to - 1]
      const after = rest[to]
      let pos: number
      if (!before) pos = after.pos - GAP
      else if (!after) pos = before.pos + GAP
      else pos = (before.pos + after.pos) / 2
      const tooTight = before && after && (pos <= before.pos || pos >= after.pos || after.pos - before.pos < 1e-6)
      if (tooTight) {
        // renumber the whole list (rare: thousands of moves into the same gap)
        const order = [...rest.slice(0, to), live[from], ...rest.slice(to)]
        const newPos = new Map(order.map((e, i) => [e.entryId, (i + 1) * GAP]))
        return { ...p, entries: p.entries.map((e) => (newPos.has(e.entryId) ? { ...e, pos: newPos.get(e.entryId)!, movedAt: t } : e)) }
      }
      return { ...p, entries: p.entries.map((e) => (e.entryId === entryId ? { ...e, pos, movedAt: t } : e)) }
    })
  },

  /** Point an entry at a re-found track (after a tag edit changed its id). */
  relink(id: string, entryId: string, track: Track) {
    edit(id, (p) => {
      const e = p.entries.find((x) => x.entryId === entryId)
      if (!e || e.trackId === track.id) return null
      return { ...p, entries: p.entries.map((x) => (x.entryId === entryId ? { ...x, ...trackFields(track) } : x)) }
    })
  },

  reset() {
    generation++
    window.clearTimeout(syncTimer)
    recs = new Map()
    revs.clear()
    folderId = null
    inflight = null
    loading = Promise.resolve()
    set({ list: [], byId: new Map(), loaded: true, syncing: false, syncedAt: null, pending: 0, error: null })
  },

  /** Boot: read the local copy; sync on sign-in, reconnect, coming back and leaving. */
  init() {
    void playlistsStore.load()
    const trySync = () => void playlistsStore.sync({ minAge: 60_000 })
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight && (state.pending || !state.syncedAt)) scheduleSync(1_500)
    })
    if (sessionStore.get().status === 'signed-in') scheduleSync(1_500)
    window.addEventListener('online', () => void playlistsStore.sync())
    // smart playlists depend on the play history and the clock: hand out a fresh list (same docs)
    // so every view works them out again — after a play, and once an hour
    let plays = historyStore.get().plays
    historyStore.subscribe(() => {
      const next = historyStore.get().plays
      if (next === plays) return
      plays = next
      if (state.list.some((p) => p.smart)) publish()
    })
    let gdoc = genresStore.get().doc
    genresStore.subscribe(() => {
      const next = genresStore.get().doc
      if (next === gdoc) return
      gdoc = next
      if (state.list.some((p) => p.smart?.rules.some((r) => r.field === 'genre'))) publish()
    })
    window.setInterval(() => {
      if (state.list.some((p) => p.smart)) publish()
    }, 3_600_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (state.pending) void playlistsStore.sync()
      } else trySync()
    })
  },
}

onAccountReset(() => playlistsStore.reset())

export function usePlaylists(): PlaylistsState {
  return useSyncExternalStore(playlistsStore.subscribe, playlistsStore.get, playlistsStore.get)
}
