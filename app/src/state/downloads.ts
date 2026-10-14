/**
 * Offline downloads (step 7 phase D, Android).
 *
 * What the user asked to keep offline is a list of *pins*: an album, an artist (all their albums,
 * including ones imported later) or the whole library. Albums can be left out of an artist / library
 * pin (`excluded`). From the pins and the catalogue the store derives the exact list of Drive files
 * — each album's cover, then its tracks in the chosen quality (Opus 160, or the original FLAC) — and
 * hands that complete list to the native side (PelagicDownloads.sync). Native deletes anything not
 * listed and a WorkManager job fetches what's missing, in list order, with the app closed too.
 *
 * Playback needs nothing from here: the native player plays a stored copy of a Drive file whenever
 * there is one. This store only tells the UI what is stored / downloading.
 *
 * Persisted in localStorage `pelagic.downloads.v1` (pins, quality, Wi-Fi only). In the browser
 * (`isNative` false) the store stays empty and the UI shows no download controls.
 */
import { useSyncExternalStore } from 'react'
import { isNative, PelagicDownloads, type NativeDownloadItem, type NativeDownloadProgress, type NativeDownloadState } from '../native/bridge'
import { libraryStore, tracksByAlbum, type Catalogue, type Track } from './library'
import { artistInfos, sortAlbums } from './views'

export type DownloadQuality = 'opus' | 'flac'
export type Pin = { kind: 'album' | 'artist'; id: string; at: number } | { kind: 'all'; id: '*'; at: number }

export interface Prefs {
  pins: Pin[]
  /** album ids left out of an artist / whole-library pin */
  excluded: string[]
  quality: DownloadQuality
  wifiOnly: boolean
}

const KEY = 'pelagic.downloads.v1'
const DEFAULT_PREFS: Prefs = { pins: [], excluded: [], quality: 'opus', wifiOnly: true }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PREFS
}

/* ── Derived plan ─────────────────────────────────── */

export interface AlbumPlan {
  albumId: string
  /** wanted Drive files of this album: cover first, then tracks */
  files: NativeDownloadItem[]
  /** track id → Drive file id wanted for it */
  trackFiles: Map<string, string>
  bytes: number
  /** pin time (order of the queue / list) */
  at: number
}

export interface Plan {
  /** wanted albums in queue order */
  albums: AlbumPlan[]
  byAlbum: Map<string, AlbumPlan>
  items: NativeDownloadItem[]
  bytes: number
}

const EMPTY_PLAN: Plan = { albums: [], byAlbum: new Map(), items: [], bytes: 0 }

export const fileFor = (t: Track, q: DownloadQuality) => (q === 'flac' || !t.mobile?.id ? t.flac : t.mobile)

function albumsOf(c: Catalogue, pin: Pin): string[] {
  if (pin.kind === 'album') return c.albums[pin.id] ? [pin.id] : []
  if (pin.kind === 'artist') return (artistInfos(c).get(pin.id)?.albums ?? []).map((a) => a.id)
  return sortAlbums(Object.values(c.albums), 'added').map((a) => a.id)
}

function buildPlan(c: Catalogue, prefs: Prefs): Plan {
  const byTracks = tracksByAlbum(c)
  const excluded = new Set(prefs.excluded)
  const plan: Plan = { albums: [], byAlbum: new Map(), items: [], bytes: 0 }
  const seenFiles = new Set<string>()
  // explicit album pins first, then artists, then "everything" — each in pin order
  const rank = { album: 0, artist: 1, all: 2 }
  const pins = prefs.pins.slice().sort((a, b) => rank[a.kind] - rank[b.kind] || a.at - b.at)
  for (const pin of pins) {
    for (const albumId of albumsOf(c, pin)) {
      if (plan.byAlbum.has(albumId) || (pin.kind !== 'album' && excluded.has(albumId))) continue
      const album = c.albums[albumId]
      const ap: AlbumPlan = { albumId, files: [], trackFiles: new Map(), bytes: 0, at: pin.at }
      if (album.cover && !seenFiles.has(album.cover)) {
        seenFiles.add(album.cover)
        ap.files.push({ id: album.cover, size: 0, title: `${album.title} · cover` })
      }
      for (const t of byTracks.get(albumId) ?? []) {
        const f = fileFor(t, prefs.quality)
        if (!f?.id) continue
        ap.trackFiles.set(t.id, f.id)
        if (seenFiles.has(f.id)) continue
        seenFiles.add(f.id)
        ap.files.push({ id: f.id, size: f.size || 0, title: `${t.title} · ${t.artist}` })
        ap.bytes += f.size || 0
      }
      plan.albums.push(ap)
      plan.byAlbum.set(albumId, ap)
      plan.items.push(...ap.files)
      plan.bytes += ap.bytes
    }
  }
  return plan
}

/* ── Store ─────────────────────────────────────────── */

export interface DownloadsState {
  /** false in the browser: no download UI */
  available: boolean
  prefs: Prefs
  plan: Plan
  /** Drive file id → bytes, complete files on the phone */
  stored: Map<string, number>
  native: Omit<NativeDownloadState, 'stored' | 'current'> | null
  /** the last sync failed (message) */
  syncError: string | null
}

let state: DownloadsState = {
  available: isNative,
  prefs: loadPrefs(),
  plan: EMPTY_PLAN,
  stored: new Map(),
  native: null,
  syncError: null,
}
/** separate, frequent: the file downloading right now */
let progress: NativeDownloadProgress | null = null

const listeners = new Set<() => void>()
const progressListeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const emitProgress = () => progressListeners.forEach((l) => l())

type AlbumDoneListener = (albumId: string) => void
const albumDoneListeners = new Set<AlbumDoneListener>()

function set(patch: Partial<DownloadsState>) {
  state = { ...state, ...patch }
  emit()
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable */
  }
}

/** Albums seen incomplete this session: when one completes, "stored offline" toast. */
const seenIncomplete = new Set<string>()

function applyNative(s: NativeDownloadState) {
  const stored = new Map(s.stored.map((f) => [f.id, f.size] as const))
  const { stored: _stored, current, ...rest } = s
  progress = current
  emitProgress()
  const first = state.native === null
  const done: string[] = []
  for (const ap of state.plan.albums) {
    const complete = ap.files.length > 0 && ap.files.every((f) => stored.has(f.id))
    if (!complete) seenIncomplete.add(ap.albumId)
    else if (seenIncomplete.delete(ap.albumId) && !first) done.push(ap.albumId)
  }
  set({ stored, native: rest })
  for (const id of done) albumDoneListeners.forEach((l) => l(id))
}

let catalogue: Catalogue | null = null
let syncTimer: number | null = null

/** Recompute the plan and send it to the phone (debounced). Never without a catalogue: that would empty the phone. */
function schedulePush(delay = 300) {
  if (!isNative || !catalogue) return
  const plan = buildPlan(catalogue, state.prefs)
  if (state.native) for (const ap of plan.albums) if (!ap.files.every((f) => state.stored.has(f.id))) seenIncomplete.add(ap.albumId)
  set({ plan })
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void PelagicDownloads.sync({ items: state.plan.items, wifiOnly: state.prefs.wifiOnly })
      .then((s) => {
        applyNative(s)
        if (state.syncError) set({ syncError: null })
      })
      .catch((e: Error) => set({ syncError: e.message || 'Couldn’t update downloads' }))
  }, delay)
}

/** `delay`: removals wait out the Undo toast before the phone deletes anything. */
function updatePrefs(fn: (p: Prefs) => Prefs, delay?: number) {
  const prefs = fn(state.prefs)
  savePrefs(prefs)
  set({ prefs })
  schedulePush(delay)
}
const UNDO_MS = 5000

let started = false
function start() {
  if (started || !isNative) return
  started = true
  void PelagicDownloads.addListener('progress', (p) => {
    progress = p
    emitProgress()
  })
  void PelagicDownloads.addListener('changed', () => {
    void PelagicDownloads.state().then(applyNative).catch(() => {})
  })
  void PelagicDownloads.state().then(applyNative).catch(() => {})
  const onLib = () => {
    const data = libraryStore.get().data
    if (data && data !== catalogue) {
      catalogue = data
      schedulePush()
    }
  }
  libraryStore.subscribe(onLib)
  onLib()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void PelagicDownloads.state().then(applyNative).catch(() => {})
  })
}

let askedNotifications = false

export const downloadsStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  progress: () => progress,
  subscribeProgress(l: () => void) {
    progressListeners.add(l)
    return () => {
      progressListeners.delete(l)
    }
  },
  /** An album finished downloading (for a toast). */
  onAlbumDone(l: AlbumDoneListener) {
    albumDoneListeners.add(l)
    return () => {
      albumDoneListeners.delete(l)
    }
  },
  init: start,

  pin(kind: 'album' | 'artist' | 'all', id: string) {
    if (!isNative) return
    if (!askedNotifications) {
      askedNotifications = true
      void PelagicDownloads.askNotifications().catch(() => {})
    }
    updatePrefs((p) => {
      const pins = p.pins.filter((x) => !(x.kind === kind && x.id === id))
      pins.push(kind === 'all' ? { kind: 'all', id: '*', at: Date.now() } : { kind, id, at: Date.now() })
      let excluded = p.excluded
      if (kind === 'album') excluded = excluded.filter((x) => x !== id)
      else if (kind === 'artist' && catalogue) {
        const mine = new Set((artistInfos(catalogue).get(id)?.albums ?? []).map((a) => a.id))
        excluded = excluded.filter((x) => !mine.has(x))
      } else if (kind === 'all') excluded = []
      return { ...p, pins, excluded }
    })
  },

  /** Stop keeping an album offline (also when it's part of an artist / library pin). */
  removeAlbum(albumId: string) {
    updatePrefs((p) => {
      const pins = p.pins.filter((x) => !(x.kind === 'album' && x.id === albumId))
      const stillCovered = catalogue && pins.some((x) => x.kind !== 'album' && albumsOf(catalogue!, x).includes(albumId))
      return { ...p, pins, excluded: stillCovered && !p.excluded.includes(albumId) ? [...p.excluded, albumId] : p.excluded }
    }, UNDO_MS)
  },

  /** Stop keeping an artist offline: their artist pin and every album pin of theirs. */
  removeArtist(artistId: string) {
    updatePrefs((p) => {
      const albums = new Set(catalogue ? (artistInfos(catalogue).get(artistId)?.albums ?? []).map((a) => a.id) : [])
      const pins = p.pins.filter((x) => !(x.kind === 'artist' && x.id === artistId) && !(x.kind === 'album' && albums.has(x.id)))
      const all = pins.some((x) => x.kind === 'all')
      return { ...p, pins, excluded: all ? [...new Set([...p.excluded, ...albums])] : p.excluded }
    }, UNDO_MS)
  },

  removeAll() {
    updatePrefs((p) => ({ ...p, pins: [], excluded: [] }), UNDO_MS)
  },

  /** Put back what removeAlbum / removeArtist / removeAll took away (Undo). */
  restore(prefs: Prefs) {
    updatePrefs((p) => ({ ...p, pins: prefs.pins, excluded: prefs.excluded }))
  },

  setQuality(quality: DownloadQuality) {
    updatePrefs((p) => ({ ...p, quality }))
  },
  setWifiOnly(wifiOnly: boolean) {
    updatePrefs((p) => ({ ...p, wifiOnly }))
  },
  setPaused(paused: boolean) {
    void PelagicDownloads.setPaused({ paused }).then(applyNative).catch(() => {})
  },
  retryFailed() {
    void PelagicDownloads.retryFailed().then(applyNative).catch(() => {})
  },
}

/* ── Queries ───────────────────────────────────────── */

export interface AlbumOffline {
  /** in the plan (pinned directly, or through its artist / the whole library) */
  wanted: boolean
  /** pinned on its own (not only through an artist / library pin) */
  direct: boolean
  /** tracks stored / tracks wanted */
  done: number
  count: number
  /** bytes stored / bytes wanted */
  bytesDone: number
  bytes: number
  complete: boolean
}

const NONE: AlbumOffline = { wanted: false, direct: false, done: 0, count: 0, bytesDone: 0, bytes: 0, complete: false }

export function albumOffline(s: DownloadsState, albumId: string): AlbumOffline {
  const ap = s.plan.byAlbum.get(albumId)
  if (!ap) return NONE
  let done = 0
  let bytesDone = 0
  for (const fid of ap.trackFiles.values()) {
    const b = s.stored.get(fid)
    if (b !== undefined) {
      done++
      bytesDone += b
    }
  }
  const count = ap.trackFiles.size
  const direct = s.prefs.pins.some((p) => p.kind === 'album' && p.id === albumId)
  return { wanted: true, direct, done, count, bytesDone, bytes: ap.bytes, complete: done === count && ap.files.every((f) => s.stored.has(f.id)) }
}

/** Every album of the artist wanted? (the artist page's Download button) */
export function artistOffline(s: DownloadsState, c: Catalogue, artistId: string): AlbumOffline & { pinned: boolean } {
  const albums = artistInfos(c).get(artistId)?.albums ?? []
  const parts = albums.map((a) => albumOffline(s, a.id))
  const sum = (k: 'done' | 'count' | 'bytesDone' | 'bytes') => parts.reduce((n, p) => n + p[k], 0)
  const wanted = parts.length > 0 && parts.every((p) => p.wanted)
  return {
    wanted,
    direct: wanted,
    pinned: s.prefs.pins.some((p) => p.kind === 'artist' && p.id === artistId),
    done: sum('done'),
    count: sum('count'),
    bytesDone: sum('bytesDone'),
    bytes: sum('bytes'),
    complete: wanted && parts.every((p) => p.complete),
  }
}

/** A stored Drive file for this track (the wanted quality first), or null. */
export function storedFileOf(s: DownloadsState, t: Track | undefined): string | null {
  if (!t) return null
  const first = fileFor(t, s.prefs.quality)
  for (const f of [first, t.mobile, t.flac]) if (f?.id && s.stored.has(f.id)) return f.id
  return null
}

/** Size of everything in the library in the chosen quality (the "Download everything" button). */
export function libraryBytes(c: Catalogue, q: DownloadQuality): number {
  let n = 0
  for (const t of Object.values(c.tracks)) n += fileFor(t, q)?.size ?? 0
  return n
}

/* ── Hooks ─────────────────────────────────────────── */

export function useDownloads(): DownloadsState {
  return useSyncExternalStore(downloadsStore.subscribe, downloadsStore.get, downloadsStore.get)
}

export function useDownloadProgress(): NativeDownloadProgress | null {
  return useSyncExternalStore(downloadsStore.subscribeProgress, downloadsStore.progress, downloadsStore.progress)
}

/** navigator.onLine, live */
const subOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
export function useOnline(): boolean {
  return useSyncExternalStore(subOnline, () => navigator.onLine, () => true)
}
