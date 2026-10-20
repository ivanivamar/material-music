/**
 * New Releases (step 11): a daily MusicBrainz sweep of every artist in the library, kept in Drive
 * `Pelagic/releases.json` so the PC and the phone share one feed — and one sweep a day between them.
 *
 * The file holds what the sweep found (per artist, last ~6 months + upcoming), the tracklists fetched
 * for the feed, and what the user did: marks (new → seen / acquired / dismissed), reminders, muted
 * artists and the "hide reissues" switch. Every entry carries a timestamp and devices merge entry by
 * entry, latest wins — the same Drive pattern as history.json (download only when Drive's `version`
 * moved, write only when this device changed something, re-check the version right before writing).
 *
 * The sweep: due once per day after the Settings hour (06:00 by default). Artists are swept oldest-checked first and each one
 * is stamped, so a sweep cut short (app closed, phone asleep, rate-limited) carries on where it
 * stopped, and an artist the other device already checked this cycle is skipped. "In library" is
 * never stored: it's derived from the catalogue (state/releaseViews.ts).
 *
 * Feed filters (type chips, Show seen) are per device, in localStorage `pelagic.releases.v1`.
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT, RELEASES_NAME } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import {
  MbError,
  MbOffline,
  SPECIAL_ARTISTS,
  artistLinks,
  browseReleaseGroups,
  cancelAll,
  classify,
  creditOf,
  findArtist,
  releaseDetail,
  type ArtistLinks,
  type RelDetail,
  type RelType,
} from '../lib/musicbrainz'
import { DEVICE } from './history'
import { libraryStore, type Catalogue } from './library'
import { onAccountReset, sessionStore } from './session'
import { artistsByName } from './views'
import { settingsStore } from './settings'

/* ── Types ──────────────────────────────────────────── */

export type Mark = 'new' | 'seen' | 'acq' | 'gone'
export type Stamped<T> = [T, number]

/** One release group, as the sweep stores it. */
export interface Rel {
  /** MusicBrainz release-group id */
  id: string
  t: string
  /** artist credit as MusicBrainz writes it ("Ado", "Spiritbox & Joey Valence") */
  a: string
  type: RelType
  /** remaster / anniversary / deluxe edition */
  re?: 1
  /** first release date: YYYY-MM-DD, YYYY-MM or YYYY */
  date: string
  /** when a sweep first saw it (ms) */
  found: number
}

export interface ArtistEntry {
  /** checked (ms) */
  at: number
  rel: Rel[]
}

export interface ReleasesDoc {
  /** last complete sweep */
  sweep: { at: number | null; by: string | null }
  /** keyed by MusicBrainz artist id */
  artists: Record<string, ArtistEntry>
  /** catalogue artists without an `mbid`: what a name search found (null = not on MusicBrainz) */
  resolved: Record<string, { mbid: string | null; at: number }>
  details: Record<string, RelDetail>
  links: Record<string, ArtistLinks & { at: number }>
  marks: Record<string, Stamped<Mark>>
  remind: Record<string, Stamped<boolean>>
  /** keyed by catalogue artist id */
  muted: Record<string, Stamped<boolean>>
  hideReissues: Stamped<boolean>
}

interface ReleasesFile extends ReleasesDoc {
  format: 'pelagic-releases'
  v: 1
  updatedAt: string
}

export interface SweepProgress {
  total: number
  done: number
  /** new releases found by this sweep */
  found: number
  manual: boolean
}

export interface SweepError {
  status: number
  /** ms */
  at: number
  retryAt: number
  reached: number
  total: number
  manual: boolean
}

export interface ReleasePrefs {
  types: Record<RelType, boolean>
  showSeen: boolean
}

export interface ReleasesState {
  doc: ReleasesDoc
  loaded: boolean
  sweeping: SweepProgress | null
  error: SweepError | null
  /** the sweep is waiting for a connection */
  offline: boolean
  syncing: boolean
  prefs: ReleasePrefs
  /** release ids with a detail request in flight */
  loadingDetail: string[]
}

export type ReleasesEvent =
  | { kind: 'matched'; id: string; title: string }
  | { kind: 'swept'; manual: boolean; fresh: number; artists: number; since: number | null }
  | { kind: 'reminder'; id: string; title: string; artist: string }

/* ── Constants ──────────────────────────────────────── */

const CACHE_KEY = 'releases'
const PREFS_KEY = 'pelagic.releases.v1'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const DAY = 86_400_000
/** feed window: releases from the last ~6 months, plus everything upcoming */
export const WINDOW_DAYS = 183
/** first time a release is seen and it's older than this → it starts as "seen", not "new" */
const FRESH_DAYS = 30
/** daily sweep after this local hour (Settings → New Releases; 06:00 by default) */
const sweepHour = () => settingsStore.get().sweepHour
const RETRY_MS = 30 * 60_000
const RESOLVE_AGAIN_MS = 30 * DAY

export const DEFAULT_TYPES: Record<RelType, boolean> = { album: true, ep: true, single: true, live: false, other: false }

const emptyDoc = (): ReleasesDoc => ({
  sweep: { at: null, by: null },
  artists: {},
  resolved: {},
  details: {},
  links: {},
  marks: {},
  remind: {},
  muted: {},
  hideReissues: [true, 0],
})

/** Start of the current sweep cycle: today 06:00, or yesterday's before 06:00. */
export function cycleStart(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(sweepHour(), 0, 0, 0)
  if (d.getTime() > now) d.setDate(d.getDate() - 1)
  return d.getTime()
}
export function nextSweepAt(now = Date.now()): number {
  const d = new Date(cycleStart(now))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Is this date within the feed window (or upcoming)? */
export function inWindow(date: string, now = Date.now()): boolean {
  const [y, m, d] = date.split('-').map(Number)
  if (!y) return false
  const today = new Date(now)
  if (!m) return y > today.getFullYear() // year only: just announced for next year
  const end = d ? new Date(y, m - 1, d) : new Date(y, m, 0) // month precision → the month's last day
  return end.getTime() >= now - WINDOW_DAYS * DAY
}

/* ── Merge (entry by entry, latest wins) ─────────────── */

function mergeStamped<T>(a: Record<string, Stamped<T>>, b: Record<string, Stamped<T>>): Record<string, Stamped<T>> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (!out[k] || v[1] > out[k][1]) out[k] = v
  return out
}
function mergeAt<T extends { at: number }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.at > out[k].at) out[k] = v
  return out
}
export function mergeDocs(a: ReleasesDoc, b: ReleasesDoc): ReleasesDoc {
  return {
    sweep: (b.sweep.at ?? 0) > (a.sweep.at ?? 0) ? b.sweep : a.sweep,
    artists: mergeAt(a.artists, b.artists),
    resolved: mergeAt(a.resolved, b.resolved),
    details: mergeAt(a.details, b.details),
    links: mergeAt(a.links, b.links),
    marks: mergeStamped(a.marks, b.marks),
    remind: mergeStamped(a.remind, b.remind),
    muted: mergeStamped(a.muted, b.muted),
    hideReissues: b.hideReissues[1] > a.hideReissues[1] ? b.hideReissues : a.hideReissues,
  }
}

function normalise(raw: Partial<ReleasesFile> | null | undefined): ReleasesDoc {
  const d = emptyDoc()
  if (!raw || typeof raw !== 'object') return d
  return {
    sweep: raw.sweep && typeof raw.sweep === 'object' ? { at: raw.sweep.at ?? null, by: raw.sweep.by ?? null } : d.sweep,
    artists: raw.artists ?? {},
    resolved: raw.resolved ?? {},
    details: raw.details ?? {},
    links: raw.links ?? {},
    marks: raw.marks ?? {},
    remind: raw.remind ?? {},
    muted: raw.muted ?? {},
    hideReissues: Array.isArray(raw.hideReissues) ? raw.hideReissues : d.hideReissues,
  }
}

/** Drop releases that left the window and whatever only they used. */
function prune(doc: ReleasesDoc, now = Date.now()): ReleasesDoc {
  const keep = new Set<string>()
  const artists: Record<string, ArtistEntry> = {}
  for (const [mbid, e] of Object.entries(doc.artists)) {
    const rel = e.rel.filter((r) => inWindow(r.date, now))
    rel.forEach((r) => keep.add(r.id))
    artists[mbid] = rel.length === e.rel.length ? e : { ...e, rel }
  }
  const pick = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => keep.has(k)))
  const oldEnough = (ts: number) => ts < now - (WINDOW_DAYS + 30) * DAY
  return {
    ...doc,
    artists,
    details: pick(doc.details),
    // marks of releases out of the window are kept a month longer (a release can re-enter after a date fix)
    marks: Object.fromEntries(Object.entries(doc.marks).filter(([k, v]) => keep.has(k) || !oldEnough(v[1]))),
    remind: pick(doc.remind),
  }
}

/* ── Local prefs ─────────────────────────────────────── */

function loadPrefs(): ReleasePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<ReleasePrefs> | null
    if (raw) return { types: { ...DEFAULT_TYPES, ...raw.types }, showSeen: raw.showSeen ?? true }
  } catch {
    /* ignore */
  }
  return { types: { ...DEFAULT_TYPES }, showSeen: true }
}
function savePrefs(p: ReleasePrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/* ── Store ──────────────────────────────────────────── */

let state: ReleasesState = {
  doc: emptyDoc(),
  loaded: false,
  sweeping: null,
  error: null,
  offline: false,
  syncing: false,
  prefs: loadPrefs(),
  loadingDetail: [],
}
const listeners = new Set<() => void>()
const eventListeners = new Set<(e: ReleasesEvent) => void>()
function set(patch: Partial<ReleasesState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const emit = (e: ReleasesEvent) => eventListeners.forEach((l) => l(e))

export function onReleasesEvent(l: (e: ReleasesEvent) => void) {
  eventListeners.add(l)
  return () => {
    eventListeners.delete(l)
  }
}

let fileId: string | null = null
let version: string | null = null
/** this device changed something Drive doesn't have yet */
let dirty = false
let generation = 0
let loading: Promise<void> | null = null
let inflight: Promise<void> | null = null
let sweepRun: Promise<void> | null = null
/** start of the manual sweep in progress (artists checked after it are done) */
let manualCutoff: number | null = null
let syncTimer = 0
let retryTimer = 0
let persistTimer = 0

interface CacheRecord {
  email: string | null
  doc: ReleasesDoc
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

/** Local change: publish, save, push to Drive a little later. */
function change(doc: ReleasesDoc, syncIn = 15_000) {
  dirty = true
  set({ doc })
  persist()
  scheduleSync(syncIn)
}

function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void releasesStore.sync(), ms)
}

async function rootId(): Promise<string | null> {
  return (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
}

async function writeFile(doc: ReleasesDoc, parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-releases', v: 1, updatedAt: new Date().toISOString(), ...doc } satisfies ReleasesFile)
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
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: RELEASES_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
}

/* ── Sweep targets ───────────────────────────────────── */

export interface SweepTarget {
  artistId: string
  name: string
  mbid: string | null
  albumTitles: string[]
}

const VARIOUS = /^(various artists?|va|soundtrack|unknown artist)$/i

/** Library artists to follow (one per MusicBrainz id). */
export function sweepTargets(c: Catalogue, doc: ReleasesDoc): SweepTarget[] {
  const seen = new Set<string>()
  const out: SweepTarget[] = []
  for (const info of artistsByName(c)) {
    const a = info.artist
    if (VARIOUS.test(a.name.trim())) continue
    const mbid = a.mbid ?? doc.resolved[a.id]?.mbid ?? null
    if (mbid && (SPECIAL_ARTISTS.has(mbid) || seen.has(mbid))) continue
    if (mbid) seen.add(mbid)
    out.push({ artistId: a.id, name: a.name, mbid, albumTitles: info.albums.map((x) => x.title) })
  }
  return out
}

/** Does this target still need checking in the cycle that started at `cutoff`? */
function needsCheck(t: SweepTarget, doc: ReleasesDoc, cutoff: number, now: number): boolean {
  if (t.mbid) return (doc.artists[t.mbid]?.at ?? 0) < cutoff
  const r = doc.resolved[t.artistId]
  return !r || (r.mbid === null && r.at < now - RESOLVE_AGAIN_MS)
}

/* ── Store API ──────────────────────────────────────── */

export const releasesStore = {
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
      if (rec?.doc && (!email || !rec.email || rec.email === email)) {
        fileId = rec.fileId
        version = rec.version
        dirty = rec.dirty
        set({ doc: mergeDocs(normalise(rec.doc), state.doc), loaded: true })
      } else set({ loaded: true })
    })()
    return loading
  },

  /** Pull the other device's sweep and marks, push ours. */
  sync(): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await releasesStore.load()
      set({ syncing: true })
      try {
        const parent = await rootId()
        if (gen !== generation || !parent) return
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(RELEASES_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            // nothing worth a file yet (no sweep, no marks): wait for the first sweep
            const d = state.doc
            dirty = d.sweep.at !== null || Object.keys(d.artists).length > 0 || Object.keys(d.marks).length > 0 || Object.keys(d.muted).length > 0
            fileId = null
            version = null
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<ReleasesFile>
            if (gen !== generation) return
            set({ doc: mergeDocs(state.doc, normalise(raw)) })
            fileId = meta.id
            version = meta.version ?? null
          }
          if (!dirty) break
          if (meta && attempt < 4) {
            const now = await findChild(RELEASES_NAME, parent, false)
            if (now && now.version !== meta.version) continue
          }
          const doc = prune(state.doc)
          dirty = false
          const w = await writeFile(doc, parent, meta?.id ?? null)
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

  /** Is a sweep due (none this cycle)? */
  due(now = Date.now()): boolean {
    return (state.doc.sweep.at ?? 0) < cycleStart(now)
  },

  /**
   * Sweep every followed artist not yet checked this cycle (`manual`: all of them, now).
   * Safe to call repeatedly; one sweep at a time.
   */
  sweep(opts: { manual?: boolean; resume?: boolean } = {}): Promise<void> {
    if (sweepRun) return sweepRun
    const gen = generation
    sweepRun = (async () => {
      await releasesStore.load()
      await libraryStore.loadCache()
      // the other device may have swept already today
      if (sessionStore.get().status === 'signed-in') await releasesStore.sync().catch(() => undefined)
      if (gen !== generation) return
      const c = libraryStore.get().data
      if (!c) return
      const manual = !!opts.manual
      if (!manual && !releasesStore.due()) return
      if (!navigator.onLine) {
        set({ offline: true })
        return
      }
      window.clearTimeout(retryTimer)
      const started = Date.now()
      // a manual sweep checks everyone again; retrying one carries on from where it stopped
      if (manual && !(opts.resume && manualCutoff)) manualCutoff = started
      const cutoff = manual ? manualCutoff! : cycleStart(started)
      const targets = sweepTargets(c, state.doc)
      const todo = targets.filter((t) => needsCheck(t, state.doc, cutoff, started))
      const known = new Set<string>()
      for (const e of Object.values(state.doc.artists)) for (const r of e.rel) known.add(r.id)
      const previousSweep = state.doc.sweep.at
      let found = 0
      let done = targets.length - todo.length
      set({ sweeping: { total: targets.length, done, found, manual }, error: null, offline: false })

      for (const t of todo) {
        if (gen !== generation) return
        try {
          let mbid = t.mbid
          if (!mbid) {
            mbid = await findArtist(t.name, t.albumTitles)
            if (gen !== generation) return
            change({ ...state.doc, resolved: { ...state.doc.resolved, [t.artistId]: { mbid, at: Date.now() } } }, 60_000)
          }
          if (mbid && !SPECIAL_ARTISTS.has(mbid)) {
            const rgs = await browseReleaseGroups(mbid)
            if (gen !== generation) return
            const now = Date.now()
            const prev = new Map((state.doc.artists[mbid]?.rel ?? []).map((r) => [r.id, r]))
            const rel: Rel[] = []
            const marks = { ...state.doc.marks }
            for (const rg of rgs) {
              const date = rg['first-release-date'] ?? ''
              if (!date || !inWindow(date, now)) continue
              const { type, reissue } = classify(rg)
              const old = prev.get(rg.id)
              const r: Rel = { id: rg.id, t: rg.title, a: creditOf(rg, t.name), type, date, found: old?.found ?? now, ...(reissue ? { re: 1 as const } : {}) }
              rel.push(r)
              if (!known.has(rg.id)) {
                known.add(rg.id)
                const [y, m, d] = date.split('-').map(Number)
                const at = new Date(y, (m || 1) - 1, d || 1).getTime()
                // a first sweep (or an old release added to MusicBrainz late) isn't news
                if (at < now - FRESH_DAYS * DAY) {
                  if (!marks[rg.id]) marks[rg.id] = ['seen', now]
                } else found++
              }
            }
            change({ ...state.doc, marks, artists: { ...state.doc.artists, [mbid]: { at: now, rel } } }, 60_000)
          }
          done++
          set({ sweeping: { total: targets.length, done, found, manual } })
        } catch (e) {
          if (gen !== generation) return
          if (e instanceof MbOffline) {
            set({ sweeping: null, offline: true })
            persist()
            return
          }
          if (e instanceof MbError && e.status === 404) {
            // the id was merged away on MusicBrainz: look the artist up again next time
            if (!t.mbid) continue
            change({ ...state.doc, resolved: { ...state.doc.resolved, [t.artistId]: { mbid: null, at: 0 } } }, 60_000)
            done++
            continue
          }
          const now = Date.now()
          set({
            sweeping: null,
            error: { status: e instanceof MbError ? e.status : 0, at: now, retryAt: now + RETRY_MS, reached: done, total: targets.length, manual },
          })
          persist()
          scheduleSync(2_000)
          retryTimer = window.setTimeout(() => releasesStore.retry(), RETRY_MS)
          return
        }
      }
      if (gen !== generation) return
      manualCutoff = null
      change({ ...prune(state.doc), sweep: { at: Date.now(), by: DEVICE } }, 1_000)
      set({ sweeping: null, error: null })
      emit({ kind: 'swept', manual, fresh: found, artists: targets.length, since: previousSweep })
      void releasesStore.fillDetails()
    })().finally(() => {
      sweepRun = null
      if (state.sweeping) set({ sweeping: null })
    })
    return sweepRun
  },

  /** Retry after a MusicBrainz error: carries on from the artist it stopped at. */
  retry() {
    window.clearTimeout(retryTimer)
    const manual = !!state.error?.manual
    set({ error: null })
    void releasesStore.sweep({ manual, resume: true })
  },

  /** Tracklist / label for one release (the open detail panel asks with a high priority). */
  async ensureDetail(id: string, priority = 0): Promise<void> {
    const d = state.doc.details[id]
    const rel = findRel(id)
    if (!rel) return
    const upcoming = isUpcoming(rel.date)
    // upcoming tracklists still change; released ones are fetched once
    if (d && (!upcoming || d.at > Date.now() - 3 * DAY)) return
    if (state.loadingDetail.includes(id)) return
    set({ loadingDetail: [...state.loadingDetail, id] })
    const gen = generation
    try {
      const detail = await releaseDetail(id, priority)
      if (gen !== generation) return
      change({ ...state.doc, details: { ...state.doc.details, [id]: detail } }, 30_000)
    } catch {
      /* offline / rate-limited: the panel shows what it has */
    } finally {
      if (gen === generation) set({ loadingDetail: state.loadingDetail.filter((x) => x !== id) })
    }
  },

  /** Homepage / Bandcamp links of an artist (cached 30 days). */
  async ensureLinks(mbid: string, priority = 5): Promise<void> {
    const l = state.doc.links[mbid]
    if (l && l.at > Date.now() - 30 * DAY) return
    const gen = generation
    try {
      const links = await artistLinks(mbid, priority)
      if (gen !== generation) return
      change({ ...state.doc, links: { ...state.doc.links, [mbid]: { ...links, at: Date.now() } } }, 30_000)
    } catch {
      /* best effort */
    }
  },

  /** Background: tracklists for the feed (track counts and lengths on the cards). */
  async fillDetails(): Promise<void> {
    const gen = generation
    for (;;) {
      if (gen !== generation || state.sweeping || !navigator.onLine) return
      const next = allRels().find((r) => {
        if (state.doc.marks[r.id]?.[0] === 'gone') return false
        const d = state.doc.details[r.id]
        return !d || (isUpcoming(r.date) && d.at < Date.now() - 3 * DAY)
      })
      if (!next || state.loadingDetail.includes(next.id)) return
      const before = state.doc.details[next.id]
      await releasesStore.ensureDetail(next.id, 0)
      // failed (offline / rate-limited): stop, the next sweep or page visit tries again
      if (state.doc.details[next.id] === before) return
    }
  },

  /* ── User actions (each one stamped, synced) ── */

  mark(id: string, mark: Mark) {
    change({ ...state.doc, marks: { ...state.doc.marks, [id]: [mark, Date.now()] } })
  },
  /** Mark several at once (e.g. "Bring everything back"). */
  markMany(ids: string[], mark: Mark) {
    if (!ids.length) return
    const now = Date.now()
    const marks = { ...state.doc.marks }
    for (const id of ids) marks[id] = [mark, now]
    change({ ...state.doc, marks })
  },
  setReminder(id: string, on: boolean) {
    change({ ...state.doc, remind: { ...state.doc.remind, [id]: [on, Date.now()] } })
  },
  setMuted(artistId: string, muted: boolean) {
    change({ ...state.doc, muted: { ...state.doc.muted, [artistId]: [muted, Date.now()] } })
  },
  setHideReissues(on: boolean) {
    change({ ...state.doc, hideReissues: [on, Date.now()] })
  },

  /* ── Local filters ── */

  setPrefs(patch: Partial<ReleasePrefs>) {
    const prefs = { ...state.prefs, ...patch, types: { ...state.prefs.types, ...patch.types } }
    savePrefs(prefs)
    set({ prefs })
  },

  reset() {
    generation++
    cancelAll()
    window.clearTimeout(syncTimer)
    window.clearTimeout(retryTimer)
    fileId = null
    version = null
    dirty = false
    inflight = null
    sweepRun = null
    manualCutoff = null
    loading = Promise.resolve()
    set({ doc: emptyDoc(), loaded: true, sweeping: null, error: null, offline: false, syncing: false, loadingDetail: [] })
  },

  /**
   * Boot: read the local copy, sync with Drive, sweep when due (a few seconds after launch, so it
   * doesn't compete with the app starting up), check reminders, and keep "acquired" releases
   * watching the catalogue.
   */
  init() {
    void releasesStore.load().then(checkReminders)
    let kickTimer = 0
    const kick = (ms: number) => {
      window.clearTimeout(kickTimer)
      kickTimer = window.setTimeout(() => {
        if (!libraryStore.get().data) return
        if (releasesStore.due()) void releasesStore.sweep()
        else void releasesStore.fillDetails()
        checkReminders()
      }, ms)
    }
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight) scheduleSync(2_500)
    })
    if (sessionStore.get().status === 'signed-in') scheduleSync(2_500)
    kick(8_000)
    let lastCatalogue: Catalogue | null = libraryStore.get().data
    libraryStore.subscribe(() => {
      const c = libraryStore.get().data
      if (c === lastCatalogue) return
      const prev = lastCatalogue
      lastCatalogue = c
      if (!c) return
      if (!prev) kick(8_000)
      else watchAcquired(prev, c)
    })
    window.addEventListener('online', () => {
      if (state.offline) set({ offline: false })
      kick(2_000)
    })
    window.addEventListener('offline', () => state.sweeping && set({ offline: true }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (dirty) void releasesStore.sync()
      } else kick(3_000)
    })
    // a new day while the app stays open
    window.setInterval(() => releasesStore.due() && kick(0), 15 * 60_000)
  },
}

/* ── Helpers used by the store ───────────────────────── */

function allRels(): Rel[] {
  const out: Rel[] = []
  const seen = new Set<string>()
  for (const e of Object.values(state.doc.artists))
    for (const r of e.rel)
      if (!seen.has(r.id)) {
        seen.add(r.id)
        out.push(r)
      }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
function findRel(id: string): Rel | undefined {
  for (const e of Object.values(state.doc.artists)) {
    const r = e.rel.find((x) => x.id === id)
    if (r) return r
  }
  return undefined
}

/** Local midnight of a (partial) release date. */
export function dayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).getTime()
}
const todayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export function isUpcoming(date: string): boolean {
  const [y, m] = date.split('-').map(Number)
  if (!m) return y > new Date().getFullYear()
  return dayOf(date) > todayStart()
}

/** Reminders whose day has come: one toast, then the reminder is spent (on every device). */
function checkReminders() {
  const due: Rel[] = []
  for (const [id, [on]] of Object.entries(state.doc.remind)) {
    if (!on) continue
    const r = findRel(id)
    if (r && !isUpcoming(r.date)) due.push(r)
  }
  if (!due.length) return
  const now = Date.now()
  const remind = { ...state.doc.remind }
  for (const r of due) remind[r.id] = [false, now]
  change({ ...state.doc, remind })
  for (const r of due) emit({ kind: 'reminder', id: r.id, title: r.t, artist: r.a })
}

/**
 * The catalogue changed: an "acquired" release whose album / single just appeared is now in the
 * library. Announce it once and drop the mark back to "seen" (the match itself is derived).
 */
let matcher: ((c: Catalogue, rel: Rel) => boolean) | null = null
export function setMatcher(fn: (c: Catalogue, rel: Rel) => boolean) {
  matcher = fn
}
function watchAcquired(prev: Catalogue, next: Catalogue) {
  if (!matcher) return
  const hits: Rel[] = []
  for (const [id, [m]] of Object.entries(state.doc.marks)) {
    if (m !== 'acq') continue
    const r = findRel(id)
    if (r && matcher(next, r) && !matcher(prev, r)) hits.push(r)
  }
  if (!hits.length) return
  releasesStore.markMany(
    hits.map((r) => r.id),
    'seen',
  )
  for (const r of hits) emit({ kind: 'matched', id: r.id, title: r.t })
}

onAccountReset(() => releasesStore.reset())

export function useReleases(): ReleasesState {
  return useSyncExternalStore(releasesStore.subscribe, releasesStore.get, releasesStore.get)
}
