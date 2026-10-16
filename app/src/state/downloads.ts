/**
 * Offline downloads (step 7 phase D, Android).
 *
 * What the user asked to keep offline is a list of *pins*: an album, an artist (all their albums,
 * including ones imported later), a playlist (just its tracks, step 9), a single song (the track menu's
 * Download) or the whole library. Albums can be left out of an artist / library
 * pin (`excluded`). From the pins and the catalogue the store derives the exact list of Drive files
 * — each album's cover, then its tracks in the chosen quality (Opus 160, or the original FLAC) — and
 * hands that complete list to the native side (PelagicDownloads.sync). Native deletes anything not
 * listed and a WorkManager job fetches what's missing, in list order, with the app closed too.
 *
 * Playback needs nothing from here: the native player plays a stored copy of a Drive file whenever
 * there is one. This store only tells the UI what is stored / downloading.
 *
 * Quality is global (`quality`) with a per-album override (`albumQuality`, the album page's Opus / FLAC
 * switch). While an album switches quality, the copy already on the phone is kept in the list (`plan.keep`)
 * until its replacement has arrived, so the album stays playable offline the whole time.
 *
 * Persisted in localStorage `pelagic.downloads.v1` (pins, quality, per-album quality, Wi-Fi only). In the browser
 * (`isNative` false) the store stays empty and the UI shows no download controls.
 */
import { useSyncExternalStore } from 'react'
import { isNative, PelagicDownloads, type NativeDownloadItem, type NativeDownloadProgress, type NativeDownloadState } from '../native/bridge'
import { libraryStore, tracksByAlbum, type Catalogue, type Track } from './library'
import { playlistsStore, type Playlist } from './playlists'
import { playlistInfo } from './playlistViews'
import { artistInfos, sortAlbums } from './views'

export type DownloadQuality = 'opus' | 'flac'
export type PinKind = 'album' | 'artist' | 'playlist' | 'track'
export type Pin = { kind: PinKind; id: string; at: number } | { kind: 'all'; id: '*'; at: number }

export interface Prefs {
  pins: Pin[]
  /** album ids left out of an artist / whole-library pin */
  excluded: string[]
  quality: DownloadQuality
  /** album id → quality for that album (overrides `quality`) */
  albumQuality: Record<string, DownloadQuality>
  wifiOnly: boolean
}

const KEY = 'pelagic.downloads.v1'
const DEFAULT_PREFS: Prefs = { pins: [], excluded: [], quality: 'opus', albumQuality: {}, wifiOnly: true }

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
  /** only some tracks are wanted (they come from playlist / song pins, the album itself isn't pinned) */
  partial?: boolean
}

export interface Plan {
  /** wanted albums in queue order */
  albums: AlbumPlan[]
  byAlbum: Map<string, AlbumPlan>
  /** copies already on the phone in the other quality, kept until their replacement is stored */
  keep: NativeDownloadItem[]
  items: NativeDownloadItem[]
  bytes: number
}

const EMPTY_PLAN: Plan = { albums: [], byAlbum: new Map(), keep: [], items: [], bytes: 0 }

export const fileFor = (t: Track, q: DownloadQuality) => (q === 'flac' || !t.mobile?.id ? t.flac : t.mobile)

/** The quality an album is downloaded in: its own choice, else the global one. */
export const qualityOf = (p: Pick<Prefs, 'quality' | 'albumQuality'>, albumId: string): DownloadQuality => p.albumQuality?.[albumId] ?? p.quality

function albumsOf(c: Catalogue, pin: Pin): string[] {
  if (pin.kind === 'album') return c.albums[pin.id] ? [pin.id] : []
  if (pin.kind === 'artist') return (artistInfos(c).get(pin.id)?.albums ?? []).map((a) => a.id)
  if (pin.kind === 'playlist') return [...new Set(playlistTracks(c, pin.id).map((t) => t.albumId))]
  if (pin.kind === 'track') return c.tracks[pin.id] && c.albums[c.tracks[pin.id].albumId] ? [c.tracks[pin.id].albumId] : []
  return sortAlbums(Object.values(c.albums), 'added').map((a) => a.id)
}

function playlistTracks(c: Catalogue, playlistId: string): Track[] {
  const p: Playlist | undefined = playlistsStore.get().byId.get(playlistId)
  return p ? playlistInfo(c, p).ids.map((id) => c.tracks[id]).filter((t): t is Track => !!t) : []
}

function buildPlan(c: Catalogue, prefs: Prefs, stored: Map<string, number>): Plan {
  const byTracks = tracksByAlbum(c)
  const excluded = new Set(prefs.excluded)
  const plan: Plan = { albums: [], byAlbum: new Map(), keep: [], items: [], bytes: 0 }
  const seenFiles = new Set<string>()
  // explicit album pins first, then artists, then "everything", then playlists and single songs — each
  // in pin order (whole albums must come first: a partial plan for an album would make them skip it)
  const rank = { album: 0, artist: 1, all: 2, playlist: 3, track: 3 }
  const pins = prefs.pins.slice().sort((a, b) => rank[a.kind] - rank[b.kind] || a.at - b.at)
  for (const pin of pins) {
    if (pin.kind === 'playlist' || pin.kind === 'track') {
      // just the playlist's tracks / the one song, filed under their albums (a partial album plan)
      const tracks = pin.kind === 'playlist' ? playlistTracks(c, pin.id) : c.tracks[pin.id] ? [c.tracks[pin.id]] : []
      for (const t of tracks) {
        const album = c.albums[t.albumId]
        if (!album || excluded.has(t.albumId)) continue
        let ap = plan.byAlbum.get(t.albumId)
        if (ap && !ap.partial) continue // the whole album is wanted anyway
        if (!ap) {
          ap = { albumId: t.albumId, files: [], trackFiles: new Map(), bytes: 0, at: pin.at, partial: true }
          if (album.cover && !seenFiles.has(album.cover)) {
            seenFiles.add(album.cover)
            ap.files.push({ id: album.cover, size: 0, title: `${album.title} · cover` })
          }
          plan.albums.push(ap)
          plan.byAlbum.set(t.albumId, ap)
        }
        const f = fileFor(t, qualityOf(prefs, t.albumId))
        if (!f?.id || ap.trackFiles.has(t.id)) continue
        ap.trackFiles.set(t.id, f.id)
        if (seenFiles.has(f.id)) continue
        seenFiles.add(f.id)
        const item = { id: f.id, size: f.size || 0, title: `${t.title} · ${t.artist}` }
        ap.files.push(item)
        ap.bytes += item.size
        plan.bytes += item.size
      }
      continue
    }
    for (const albumId of albumsOf(c, pin)) {
      if (plan.byAlbum.has(albumId) || (pin.kind !== 'album' && excluded.has(albumId))) continue
      const album = c.albums[albumId]
      const ap: AlbumPlan = { albumId, files: [], trackFiles: new Map(), bytes: 0, at: pin.at }
      if (album.cover && !seenFiles.has(album.cover)) {
        seenFiles.add(album.cover)
        ap.files.push({ id: album.cover, size: 0, title: `${album.title} · cover` })
      }
      const q = qualityOf(prefs, albumId)
      for (const t of byTracks.get(albumId) ?? []) {
        const f = fileFor(t, q)
        if (!f?.id) continue
        ap.trackFiles.set(t.id, f.id)
        if (seenFiles.has(f.id)) continue
        seenFiles.add(f.id)
        ap.files.push({ id: f.id, size: f.size || 0, title: `${t.title} · ${t.artist}` })
        ap.bytes += f.size || 0
      }
      plan.albums.push(ap)
      plan.byAlbum.set(albumId, ap)
      plan.bytes += ap.bytes
    }
  }
  // quality switch: keep the other-quality copy already on the phone until the wanted one is stored
  for (const ap of plan.albums)
    for (const [tid, fid] of ap.trackFiles) {
      if (stored.has(fid)) continue
      const t = c.tracks[tid]
      for (const f of [t?.mobile, t?.flac]) {
        if (!f?.id || f.id === fid || !stored.has(f.id) || seenFiles.has(f.id)) continue
        seenFiles.add(f.id)
        plan.keep.push({ id: f.id, size: stored.get(f.id) || f.size || 0, title: `${t.title} · ${t.artist}` })
      }
    }
  // kept copies go last: they are on the phone already, so the worker never fetches them
  plan.items = [...plan.albums.flatMap((ap) => ap.files), ...plan.keep]
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
type TrackDoneListener = (trackId: string) => void
const trackDoneListeners = new Set<TrackDoneListener>()

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
/** Same for songs pinned on their own (not part of a whole album being downloaded). */
const seenIncompleteTracks = new Set<string>()

/** Drive file wanted for a song pinned on its own, unless its whole album is downloaded anyway. */
function pinnedTrackFile(plan: Plan, trackId: string): string | null {
  const albumId = catalogue?.tracks[trackId]?.albumId
  const ap = albumId ? plan.byAlbum.get(albumId) : undefined
  return ap?.partial ? (ap.trackFiles.get(trackId) ?? null) : null
}

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
    else if (seenIncomplete.delete(ap.albumId) && !first && !ap.partial) done.push(ap.albumId)
  }
  const tracksDone: string[] = []
  for (const pin of state.prefs.pins) {
    if (pin.kind !== 'track') continue
    const fid = pinnedTrackFile(state.plan, pin.id)
    if (!fid) continue
    if (!stored.has(fid)) seenIncompleteTracks.add(pin.id)
    else if (seenIncompleteTracks.delete(pin.id) && !first) tracksDone.push(pin.id)
  }
  set({ stored, native: rest })
  for (const id of done) albumDoneListeners.forEach((l) => l(id))
  for (const id of tracksDone) trackDoneListeners.forEach((l) => l(id))
  if (first && pushWaiting) schedulePush()
  // a quality switch went through (or a kept copy vanished): send the shorter list so the old copy goes
  else if (state.plan.keep.length && catalogue) {
    const keep = buildPlan(catalogue, state.prefs, stored).keep
    if (keep.length !== state.plan.keep.length || keep.some((k, i) => k.id !== state.plan.keep[i].id)) schedulePush(1000)
  }
}

let catalogue: Catalogue | null = null
let syncTimer: number | null = null
/** a push asked for before the phone said what it has stored (kept copies would be dropped) */
let pushWaiting = false
/** the phone's state couldn't be read: push anyway, without kept copies */
let nativeUnknown = false

/** Recompute the plan and send it to the phone (debounced). Never without a catalogue: that would empty the phone. */
function schedulePush(delay = 300) {
  if (!isNative || !catalogue) return
  // same for playlist pins before the playlists' local copy is read
  if (state.prefs.pins.some((p) => p.kind === 'playlist') && !playlistsStore.get().loaded) return
  // and not before the phone's stored list is known: an in-progress quality switch would lose its old copies
  if (!state.native && !nativeUnknown) {
    pushWaiting = true
    return
  }
  pushWaiting = false
  const plan = buildPlan(catalogue, state.prefs, state.stored)
  if (state.native) {
    for (const ap of plan.albums) if (!ap.files.every((f) => state.stored.has(f.id))) seenIncomplete.add(ap.albumId)
    for (const pin of state.prefs.pins) {
      const fid = pin.kind === 'track' ? pinnedTrackFile(plan, pin.id) : null
      if (fid && !state.stored.has(fid)) seenIncompleteTracks.add(pin.id)
    }
  }
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
  void PelagicDownloads.state()
    .then(applyNative)
    .catch(() => {
      nativeUnknown = true
      if (pushWaiting) schedulePush()
    })
  const onLib = () => {
    const data = libraryStore.get().data
    if (data && data !== catalogue) {
      catalogue = data
      schedulePush()
    }
  }
  libraryStore.subscribe(onLib)
  onLib()
  // playlist pins follow their playlist (tracks added / removed on either device)
  let lists = playlistsStore.get().byId
  playlistsStore.subscribe(() => {
    const now = playlistsStore.get().byId
    if (now === lists) return
    lists = now
    if (state.prefs.pins.some((p) => p.kind === 'playlist')) schedulePush(1000)
  })
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
  /** A song pinned on its own finished downloading (for a toast). */
  onTrackDone(l: TrackDoneListener) {
    trackDoneListeners.add(l)
    return () => {
      trackDoneListeners.delete(l)
    }
  },
  init: start,

  pin(kind: PinKind | 'all', id: string) {
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
      else if (kind === 'track') {
        const albumId = catalogue?.tracks[id]?.albumId
        if (albumId) excluded = excluded.filter((x) => x !== albumId)
      } else if (kind === 'playlist' && catalogue) {
        const mine = new Set(playlistTracks(catalogue, id).map((t) => t.albumId))
        excluded = excluded.filter((x) => !mine.has(x))
      }
      else if (kind === 'artist' && catalogue) {
        const mine = new Set((artistInfos(catalogue).get(id)?.albums ?? []).map((a) => a.id))
        excluded = excluded.filter((x) => !mine.has(x))
      } else if (kind === 'all') excluded = []
      return { ...p, pins, excluded }
    })
  },

  /** Stop keeping an album offline (also when it's part of an artist / library pin; its pinned songs go too). */
  removeAlbum(albumId: string) {
    updatePrefs((p) => {
      const pins = p.pins.filter((x) => !(x.kind === 'album' && x.id === albumId) && !(x.kind === 'track' && catalogue?.tracks[x.id]?.albumId === albumId))
      const stillCovered = catalogue && pins.some((x) => x.kind !== 'album' && albumsOf(catalogue!, x).includes(albumId))
      return { ...p, pins, excluded: stillCovered && !p.excluded.includes(albumId) ? [...p.excluded, albumId] : p.excluded }
    }, UNDO_MS)
  },

  /** Stop keeping an artist offline: their artist pin and every album pin of theirs. */
  removeArtist(artistId: string) {
    updatePrefs((p) => {
      const albums = new Set(catalogue ? (artistInfos(catalogue).get(artistId)?.albums ?? []).map((a) => a.id) : [])
      const pins = p.pins.filter(
        (x) =>
          !(x.kind === 'artist' && x.id === artistId) &&
          !(x.kind === 'album' && albums.has(x.id)) &&
          !(x.kind === 'track' && albums.has(catalogue?.tracks[x.id]?.albumId ?? '')),
      )
      const all = pins.some((x) => x.kind === 'all')
      return { ...p, pins, excluded: all ? [...new Set([...p.excluded, ...albums])] : p.excluded }
    }, UNDO_MS)
  },

  /** Stop keeping a playlist offline (its tracks stay if an album / artist pin wants them). */
  removePlaylist(playlistId: string) {
    updatePrefs((p) => ({ ...p, pins: p.pins.filter((x) => !(x.kind === 'playlist' && x.id === playlistId)) }), UNDO_MS)
  },

  /** Stop keeping one song offline (it stays if an album / artist / playlist pin wants it). */
  removeTrack(trackId: string) {
    updatePrefs((p) => ({ ...p, pins: p.pins.filter((x) => !(x.kind === 'track' && x.id === trackId)) }), UNDO_MS)
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
  /** One album's quality (the album page's Opus / FLAC switch); the global quality clears the override. */
  setAlbumQuality(albumId: string, quality: DownloadQuality) {
    updatePrefs((p) => {
      const albumQuality = { ...p.albumQuality }
      if (quality === p.quality) delete albumQuality[albumId]
      else albumQuality[albumId] = quality
      return { ...p, albumQuality }
    })
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
  /** in the plan (pinned directly, or through its artist / the whole library) — not just some playlist tracks */
  wanted: boolean
  /** only some of its tracks are wanted (through playlists) */
  partial?: boolean
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
  return { wanted: !ap.partial, partial: ap.partial, direct, done, count, bytesDone, bytes: ap.bytes, complete: done === count && ap.files.every((f) => s.stored.has(f.id)) }
}

/** A playlist's tracks on the phone (the playlist page's Download button). */
export function playlistOffline(s: DownloadsState, c: Catalogue, p: Playlist): AlbumOffline {
  const ids = playlistInfo(c, p).ids
  const pinned = s.prefs.pins.some((x) => x.kind === 'playlist' && x.id === p.id)
  let done = 0
  let count = 0
  let bytes = 0
  let bytesDone = 0
  for (const id of new Set(ids)) {
    const t = c.tracks[id]
    const fid = t && s.plan.byAlbum.get(t.albumId)?.trackFiles.get(id)
    if (!fid) continue
    count++
    const size = fileFor(t, qualityOf(s.prefs, t.albumId))?.size ?? 0
    bytes += size
    const b = s.stored.get(fid)
    if (b !== undefined) {
      done++
      bytesDone += b
    }
  }
  const all = ids.length > 0 && count === new Set(ids).size
  return { wanted: pinned, direct: pinned, done, count, bytesDone, bytes, complete: all && done === count }
}

export interface TrackOffline {
  /** pinned on its own (the track menu's Download) */
  pinned: boolean
  /** in the plan through a whole album (its album, artist or the whole library is downloaded) */
  viaAlbum: boolean
  /** a copy is on the phone */
  stored: boolean
  /** size in the quality it downloads in */
  bytes: number
}

/** One song on the phone (the track menu's Download / Remove download). */
export function trackOffline(s: DownloadsState, t: Track): TrackOffline {
  const ap = s.plan.byAlbum.get(t.albumId)
  const fid = ap?.trackFiles.get(t.id)
  return {
    pinned: s.prefs.pins.some((p) => p.kind === 'track' && p.id === t.id),
    viaAlbum: !!fid && !ap?.partial,
    stored: !!fid && s.stored.has(fid),
    bytes: fileFor(t, qualityOf(s.prefs, t.albumId))?.size ?? 0,
  }
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
  const first = fileFor(t, qualityOf(s.prefs, t.albumId))
  for (const f of [first, t.mobile, t.flac]) if (f?.id && s.stored.has(f.id)) return f.id
  return null
}

/** Size of everything in the library in the chosen qualities (the "Download everything" button). */
export function libraryBytes(c: Catalogue, prefs: Pick<Prefs, 'quality' | 'albumQuality'>): number {
  let n = 0
  for (const t of Object.values(c.tracks)) n += fileFor(t, qualityOf(prefs, t.albumId))?.size ?? 0
  return n
}

/** Size of one album's tracks in a quality (the album page's Opus / FLAC switch). */
export function albumBytes(tracks: Track[], q: DownloadQuality): number {
  return tracks.reduce((n, t) => n + (fileFor(t, q)?.size ?? 0), 0)
}

/* ── What plays offline (the Library's "Offline only" filter) ── */

export interface OfflineIndex {
  /** tracks with a copy on the phone (either quality) */
  tracks: Set<string>
  /** album id → tracks of it on the phone */
  albums: Map<string, number>
  /** artist id → albums of theirs with something on the phone */
  artists: Map<string, number>
}

let indexCache: { stored: Map<string, number>; c: Catalogue; index: OfflineIndex } | null = null

/** Everything that plays without a connection, from what the phone has stored. */
export function offlineIndex(s: DownloadsState, c: Catalogue): OfflineIndex {
  if (indexCache && indexCache.stored === s.stored && indexCache.c === c) return indexCache.index
  const index: OfflineIndex = { tracks: new Set(), albums: new Map(), artists: new Map() }
  if (s.stored.size)
    for (const t of Object.values(c.tracks)) {
      if (!((t.mobile?.id && s.stored.has(t.mobile.id)) || (t.flac?.id && s.stored.has(t.flac.id)))) continue
      index.tracks.add(t.id)
      const n = index.albums.get(t.albumId) ?? 0
      index.albums.set(t.albumId, n + 1)
      if (n === 0) {
        const artistId = c.albums[t.albumId]?.artistId ?? t.artistId
        index.artists.set(artistId, (index.artists.get(artistId) ?? 0) + 1)
      }
    }
  indexCache = { stored: s.stored, c, index }
  return index
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
