/**
 * Playlists (step 9): one Firestore doc per playlist, `users/<uid>/playlists/<playlistId>` (step 39;
 * before that one JSON file per playlist in Drive `Pelagic/playlists/<playlistId>.json`, read once
 * per device to migrate). A custom cover is still a Drive file, `Pelagic/playlists/<playlistId>.jpg`.
 *
 * Liked songs (Nov 2026): one permanent playlist with the fixed id `liked` (LIKED_ID). It is an
 * ordinary playlist doc, so it syncs and merges like the others, but it always exists (a blank one
 * is made locally until the cloud's arrives), can't be renamed, deleted, given a cover or rules,
 * sits first in every list, and new likes go to the top (newest first). The heart buttons edit it
 * through `setLiked` (state/likes.ts has the helpers the UI uses).
 *
 * Offline-first: every edit lands in the local copy (IndexedDB `kv.playlists`) at once and is
 * pushed to the cloud a moment later (read, merge, write in a transaction), or whenever the device
 * is back online; a live listener brings the other device's edits in. Two devices editing the
 * same playlist merge entry by entry, so nothing is lost:
 *
 *   - entries are keyed by `entryId`; adds from both devices survive (union);
 *   - removing an entry leaves a tombstone (`removed` + `removedAt`), so an older copy can't bring
 *     it back; Undo flips it back with a newer stamp;
 *   - order is a fractional index (`pos`); the latest move of an entry wins (`movedAt`);
 *   - name / description / cover / deleted: the latest edit of each field wins (`stamps`).
 *
 * Deleting a playlist writes `deleted: true` into its doc (a tombstone the other device sees, so it
 * drops the playlist; restoring brings it back). The doc stays.
 *
 * Each entry keeps the track's `isrc`, `title` and `artist` next to its `trackId`, so a track
 * whose id changes after a tag edit can still be found (state/playlistViews.ts).
 */
import { useSyncExternalStore } from 'react'
import { PLAYLISTS_DIR } from '../config'
import { AuthError } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { cloudFailed, migrateOnce, onCloud, stable, whenCloud, withTimeout } from '../sync/cloud'
import type { SyncBackend } from '../sync/firebase'
import { readPlaylistFiles } from '../sync/legacyDrive'
import { putFile } from '../upload/driveWrite'
import { genresStore } from './genres'
import { DEVICE, historyStore } from './history'
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
  /** sidebar position (missing in older files = 0) */
  order?: number
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
  /**
   * Position in the sidebar list (fractional index, step 37). null / missing = never placed by hand:
   * those playlists sit after the placed ones, by last update (see `sidebarOrder`).
   */
  order?: number | null
}

export const isSmart = (p: Playlist | undefined | null): boolean => !!p?.smart

/** playlists/<id>.json on Drive (before step 39) */
interface PlaylistFile extends Playlist {
  format: 'pelagic-playlist'
  v: 1
}

interface Rec {
  doc: Playlist
  /** the cloud has a doc for it */
  synced: boolean
  /** changed here since the last write */
  dirty: boolean
  /** it was on Drive before the move (a deletion must still reach the cloud) */
  shared?: boolean
}

/** older cache records (Drive): a file id meant it had been written */
type CachedRec = Rec & { fileId?: string | null }

interface CacheRecord {
  email: string | null
  recs: Record<string, CachedRec>
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
  /** playlists changed here that the cloud doesn't have yet */
  pending: number
  error: string | null
}

const CACHE_KEY = 'playlists'
const GAP = 1024

/** The permanent Liked songs playlist. */
export const LIKED_ID = 'liked'
export const LIKED_NAME = 'Liked songs'
export const isLikedList = (p: Playlist | { id: string } | undefined | null): boolean => p?.id === LIKED_ID

/** The local stand-in until the cloud's copy (or the cached one) arrives; stamps 0 so any real edit wins. */
function blankLiked(): Playlist {
  return {
    id: LIKED_ID,
    name: LIKED_NAME,
    description: '',
    cover: null,
    createdAt: new Date(Date.UTC(2026, 10, 6)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 10, 6)).toISOString(),
    deleted: false,
    stamps: { name: 0, description: 0, cover: 0, deleted: 0, smart: 0, order: 0 },
    entries: [],
    smart: null,
    order: null,
  }
}

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
  const p = normaliseRaw(raw, id)
  // Liked songs is fixed: name, no cover / rules / description, never deleted
  return p.id === LIKED_ID ? { ...p, name: LIKED_NAME, description: '', cover: null, deleted: false, smart: null, order: null } : p
}

function normaliseRaw(raw: Partial<PlaylistFile>, id: string): Playlist {
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
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : null,
    entries: (Array.isArray(raw.entries) ? raw.entries : [])
      .filter((e): e is Entry => !!e && typeof e.entryId === 'string' && typeof e.trackId === 'string')
      .map((e) => ({ ...e, pos: Number.isFinite(e.pos) ? e.pos : 0, movedAt: e.movedAt || 0 })),
  }
}

/** Field-by-field, entry-by-entry merge (commutative: either side may be "ours"). */
export function mergePlaylists(a: Playlist, b: Playlist): Playlist {
  const pick = <K extends keyof Stamps>(k: K) => ((b.stamps[k] ?? 0) > (a.stamps[k] ?? 0) ? b : a)
  const n = pick('name')
  const d = pick('description')
  const c = pick('cover')
  const del = pick('deleted')
  const sm = pick('smart')
  const ord = (b.stamps.order ?? 0) > (a.stamps.order ?? 0) ? b : a
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
    stamps: { name: n.stamps.name, description: d.stamps.description, cover: c.stamps.cover, deleted: del.stamps.deleted, smart: sm.stamps.smart, order: ord.stamps.order ?? 0 },
    entries: [...entries.values()],
    smart: sm.smart ?? null,
    order: ord.order ?? null,
  }
}

/**
 * The sidebar order: playlists placed by hand first (by `order`), then the rest by last update,
 * newest first (the default). `list` itself stays A–Z for every other picker and page.
 */
export function sidebarOrder(list: Playlist[]): Playlist[] {
  const liked = list.filter((p) => p.id === LIKED_ID)
  const others = list.filter((p) => p.id !== LIKED_ID)
  const placed = others.filter((p) => p.order != null).sort((a, b) => a.order! - b.order!)
  const rest = others.filter((p) => p.order == null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || collator.compare(a.name, b.name))
  return [...liked, ...placed, ...rest]
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

let state: PlaylistsState = { list: [], byId: new Map(), loaded: false, syncing: false, syncedAt: null, pending: 0, error: null }
const listeners = new Set<() => void>()
function set(patch: Partial<PlaylistsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

/** Liked songs always exists: a blank local one until the cached / cloud copy is merged in. */
function ensureLiked() {
  if (!recs.has(LIKED_ID)) recs.set(LIKED_ID, { doc: blankLiked(), synced: false, dirty: false })
}

function publish(extra: Partial<PlaylistsState> = {}) {
  ensureLiked()
  const live = [...recs.values()].map((r) => r.doc).filter((p) => !p.deleted)
  // A–Z, Liked songs first
  live.sort((a, b) => (b.id === LIKED_ID ? 1 : 0) - (a.id === LIKED_ID ? 1 : 0) || collator.compare(a.name, b.name) || a.createdAt.localeCompare(b.createdAt))
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

/* ── Cloud ──────────────────────────────────────────── */

/** `a` holds everything `b` has (merging b in changes nothing). */
const covers = (a: Playlist, b: Playlist) => stable(mergePlaylists(a, b)) === stable(mergePlaylists(a, a))

/** Before step 39: every Drive playlists/<id>.json (trashed = deleted), merged in once per device. */
async function pullDrive() {
  const files = await readPlaylistFiles()
  for (const f of files) {
    const remote = normalise(f.raw as Partial<PlaylistFile>, f.id)
    if (f.trashed) remote.deleted = true
    const cur = recs.get(f.id)
    // marked dirty: the cloud may not have it yet (the push merges with whatever it has)
    recs.set(f.id, { doc: cur ? mergePlaylists(cur.doc, remote) : remote, synced: cur?.synced ?? false, dirty: true, shared: true })
  }
  publish()
  persist()
}

/** The other device's edits, live. */
function listen(b: SyncBackend) {
  const gen = generation
  return b.watchCol<Partial<Playlist>>(
    'playlists',
    (docs) => {
      if (gen !== generation) return
      let changed = false
      let push = false
      for (const d of docs) {
        const remote = normalise(d.data, d.id)
        const cur = recs.get(d.id)
        if (!cur) {
          recs.set(d.id, { doc: remote, synced: true, dirty: false })
          changed = true
          continue
        }
        const doc = covers(cur.doc, remote) ? cur.doc : mergePlaylists(cur.doc, remote)
        // ours has something the cloud doesn't → send it
        const dirty = cur.dirty || !covers(remote, doc)
        if (dirty && !cur.dirty) push = true
        if (doc !== cur.doc || !cur.synced || dirty !== cur.dirty) {
          recs.set(d.id, { doc, synced: true, dirty })
          changed = true
        }
      }
      // never reached the cloud (made offline, or before the move): send it
      for (const r of recs.values()) if (!r.synced && !r.dirty) {
        r.dirty = true
        push = true
      }
      if (changed || push || !state.syncedAt) {
        publish({ syncedAt: now(), error: null })
        persist()
      }
      if (push) scheduleSync(2_000)
    },
    (e) => cloudFailed(e),
  )
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
          const mine = recs.get(id) // edited (or heard from the cloud) before the cache was read
          const doc = normalise(r.doc, id)
          const synced = !!r.synced
          const shared = !!r.shared || !!r.fileId
          // not in the cloud yet (e.g. only ever on Drive) → it has to go up
          const dirty = !!r.dirty || !synced
          recs.set(id, mine ? { doc: mergePlaylists(doc, mine.doc), synced: mine.synced || synced, dirty: mine.dirty || !!r.dirty || (!synced && !mine.synced), shared } : { doc, synced, dirty, shared })
        }
        publish({ loaded: true, syncedAt: rec.syncedAt })
      } else publish({ loaded: true })
    })()
    return loading
  },

  /** Push the playlists changed here (the live listener brings the other device's edits in). */
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
        const b = await whenCloud()
        if (gen !== generation) return
        if (!b) {
          set({ syncing: false })
          if (state.pending) scheduleSync(120_000)
          return
        }
        await migrateOnce(b, 'playlists', DEVICE, pullDrive)
        if (gen !== generation) return
        for (const [id, r] of [...recs].filter(([, x]) => x.dirty)) {
          const rev = revs.get(id) ?? 0
          const doc = r.doc
          if (!r.synced && !r.shared && doc.deleted) {
            // created and deleted before it ever reached the cloud
            recs.delete(id)
            continue
          }
          const saved = await withTimeout(
            b.update<Playlist>(`playlists/${id}`, (cur) => {
              if (!cur) return doc
              const remote = normalise(cur as Partial<PlaylistFile>, id)
              return covers(remote, doc) ? null : mergePlaylists(remote, doc)
            }),
          )
          if (gen !== generation) return
          const cur = recs.get(id)
          if (!cur) continue
          const stillSame = (revs.get(id) ?? 0) === rev
          const merged = saved ? mergePlaylists(cur.doc, normalise(saved, id)) : cur.doc
          recs.set(id, { doc: merged, synced: true, dirty: !stillSame, shared: cur.shared })
        }
        publish({ syncing: false, syncedAt: now() })
        persist()
        if (state.pending) scheduleSync(3_000) // edited while writing
      } catch (e) {
        if (gen !== generation) return
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
    recs.set(id, { doc, synced: false, dirty: true })
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
    if (id === LIKED_ID) return
    const v = name.normalize('NFC').trim()
    if (!v) return
    edit(id, (p, t) => (p.name === v ? null : { ...p, name: v, stamps: { ...p.stamps, name: t } }))
  },

  setDescription(id: string, description: string) {
    if (id === LIKED_ID) return
    const v = description.normalize('NFC').trim()
    edit(id, (p, t) => (p.description === v ? null : { ...p, description: v, stamps: { ...p.stamps, description: t } }))
  },

  /** Custom cover (a JPEG, already resized) → playlists/<id>.jpg; null goes back to the mosaic. Needs Drive. */
  async setCover(id: string, jpeg: Blob | null): Promise<void> {
    if (id === LIKED_ID) return
    if (!jpeg) {
      edit(id, (p, t) => (p.cover === null ? null : { ...p, cover: null, stamps: { ...p.stamps, cover: t } }))
      return
    }
    const up = await putFile({ name: `${id}.jpg`, parts: [PLAYLISTS_DIR], mime: 'image/jpeg', data: jpeg })
    edit(id, (p, t) => ({ ...p, cover: up.id, stamps: { ...p.stamps, cover: t } }))
  },

  /** Change a smart playlist's rules (Undo: call again with the old ones). */
  setSmart(id: string, smart: SmartRules) {
    if (id === LIKED_ID) return
    edit(id, (p, t) => (!p.smart || JSON.stringify(p.smart) === JSON.stringify(smart) ? null : { ...p, smart, stamps: { ...p.stamps, smart: t } }))
  },

  /**
   * Drag in the sidebar: put playlist `id` at index `to` of the sidebar list (as it is without it).
   * Only the moved playlist is written, unless the list has to be numbered first (first drag, or
   * playlists created since) or the gap ran out.
   */
  moveInSidebar(id: string, to: number) {
    if (id === LIKED_ID) return
    // Liked songs is pinned on top: indexes count from below it
    const cur = sidebarOrder(state.list).filter((p) => p.id !== LIKED_ID)
    if (state.byId.has(LIKED_ID)) to--
    const from = cur.findIndex((p) => p.id === id)
    if (from < 0) return
    const rest = cur.filter((p) => p.id !== id)
    const at = Math.max(0, Math.min(to, rest.length))
    if (at === from) return
    const prev = rest[at - 1]
    const next = rest[at]
    let pos: number | null = null
    if (rest.every((p) => p.order != null)) {
      if (prev && next) pos = (prev.order! + next.order!) / 2
      else if (prev) pos = prev.order! + GAP
      else if (next) pos = next.order! - GAP
      else pos = GAP
      if (prev && next && !(pos > prev.order! && pos < next.order!)) pos = null // gap used up
    }
    const set1 = (pid: string, order: number) => edit(pid, (p, t) => (p.order === order ? null : { ...p, order, stamps: { ...p.stamps, order: t } }))
    if (pos != null) {
      set1(id, pos)
      return
    }
    const next_ = [...rest.slice(0, at), cur[from], ...rest.slice(at)]
    next_.forEach((p, i) => set1(p.id, (i + 1) * GAP))
  },

  /** Delete (Undo: `restore`). */
  remove(id: string) {
    if (id === LIKED_ID) return
    edit(id, (p, t) => (p.deleted ? null : { ...p, deleted: true, stamps: { ...p.stamps, deleted: t } }))
  },
  restore(id: string) {
    edit(id, (p, t) => (!p.deleted ? null : { ...p, deleted: false, stamps: { ...p.stamps, deleted: t } }))
  },

  /** Append tracks (in the given order; Liked songs: on top, songs already liked skipped). Returns the new entry ids. */
  addTracks(id: string, trackIds: string[]): string[] {
    const c = libraryStore.get().data
    const added: string[] = []
    if (id === LIKED_ID) ensureLiked()
    edit(id, (p, t) => {
      const liked = id === LIKED_ID ? new Set(p.entries.filter((e) => !e.removed).map((e) => e.trackId)) : null
      const tracks = (liked ? [...new Set(trackIds)].filter((tid) => !liked.has(tid)) : trackIds).map((tid) => c?.tracks[tid]).filter((x): x is Track => !!x)
      if (!tracks.length || p.smart) return null
      const min = p.entries.reduce((m, e) => Math.min(m, e.pos), Infinity)
      const pos = liked ? tracks.map((_, i) => (Number.isFinite(min) ? min : GAP * (tracks.length + 1)) - GAP * (tracks.length - i)) : tailPositions(p, tracks.length)
      const entries = tracks.map((tr, i): Entry => {
        const entryId = rid(10)
        added.push(entryId)
        return { entryId, ...trackFields(tr), addedAt: iso(t), pos: pos[i], movedAt: t }
      })
      return { ...p, entries: [...p.entries, ...entries] }
    })
    return added
  },

  /**
   * Like / unlike one song (the heart buttons). A like goes to the top of Liked songs (newest
   * first). Unliking tombstones every entry of that song (also one found by ISRC / title after a
   * tag edit: pass its entry ids in `entryIds`). Returns the entry ids it changed (for Undo).
   */
  setLiked(trackId: string, on: boolean, entryIds: string[] = []): string[] {
    ensureLiked()
    const changed: string[] = []
    if (on) {
      const tr = libraryStore.get().data?.tracks[trackId]
      if (!tr) return changed
      edit(LIKED_ID, (p, t) => {
        if (p.entries.some((e) => !e.removed && e.trackId === trackId)) return null
        const min = p.entries.reduce((m, e) => Math.min(m, e.pos), Infinity)
        const entryId = rid(10)
        changed.push(entryId)
        return { ...p, entries: [...p.entries, { entryId, ...trackFields(tr), addedAt: iso(t), pos: Number.isFinite(min) ? min - GAP : GAP, movedAt: t }] }
      })
    } else {
      const ids = new Set(entryIds)
      edit(LIKED_ID, (p, t) => {
        const hit = p.entries.filter((e) => !e.removed && (e.trackId === trackId || ids.has(e.entryId)))
        if (!hit.length) return null
        for (const e of hit) changed.push(e.entryId)
        const gone = new Set(changed)
        return { ...p, entries: p.entries.map((e) => (gone.has(e.entryId) ? { ...e, removed: true, removedAt: t } : e)) }
      })
    }
    return changed
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
    inflight = null
    loading = Promise.resolve()
    set({ syncing: false, syncedAt: null, error: null })
    publish({ loaded: true })
  },

  /** Boot: read the local copy; sync on sign-in, reconnect, coming back and leaving. */
  init() {
    void playlistsStore.load()
    onCloud((b) => {
      const off = listen(b)
      if (state.pending || !state.syncedAt) scheduleSync(1_500)
      return off
    })
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
