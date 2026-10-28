/**
 * DJ (step 22): the run, its sessions, and what the DJ has learned.
 *
 * A run plays through the normal player queue. Each session is an intro item
 * (`dj:intro:<sessionId>`, audio prepared by dj/voice.ts) followed by its songs:
 *
 *   [ … previous session … ][ intro · songs of the current session ][ intro · songs of the next one ]
 *
 * The queue is the truth: the session at the player's index is the nearest intro before it, the
 * "song 3/7" counter is the row distance from that intro, and songs added with Play next / Add to
 * queue simply become rows of the session (flagged "added by you", left out of the learning). The
 * next session is always built one ahead, so skipping is instant and its intro audio is ready.
 * Rows older than the previous session are trimmed as the run moves on.
 *
 * Ends: Stop DJ (back to what played before, paused), or anything that replaces the queue (an
 * album, a playlist, a song from a list), or sign-out. Play / pause, Next / Previous and Lyrics
 * work as normal; shuffle, repeat and the queue panel are off while the DJ plays.
 *
 * Learning (session level) and voice usage live in Drive `Pelagic/dj.json` (local copy IndexedDB
 * `kv.dj`): outcomes are merged by id (newest 500 kept), song penalties and the monthly voice
 * character count by max, prefs latest-wins per field. Scores are recomputed from the outcomes,
 * so the PC and the phone agree.
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_ROOT } from '../config'
import { AuthError, download, driveFetch, findChild } from '../lib/drive'
import { idbGet, idbSet } from '../lib/idb'
import { isNative } from '../native/bridge'
import {
  buildLibrary,
  buildSession,
  DJ_TYPES,
  featureScores,
  learnedChips,
  typeCounts,
  type DjLibrary,
  type DjType,
  type Mode,
  type Outcome,
  type Theme,
  type ThemeKind,
} from '../dj/engine'
import { djVoice, setVoiceHost } from '../dj/voice'
import { downloadsStore, offlineIndex } from './downloads'
import { genreResolver, genresStore } from './genres'
import { historyStore } from './history'
import { libraryStore } from './library'
import { isIntroId, playerStore, type PlayerSnapshot, type PlayerState } from './player'
import { onAccountReset, sessionStore } from './session'

export const DJ_NAME = 'dj.json'
const RUN_KEY = 'pelagic.dj.run.v1'
const CACHE_KEY = 'dj'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const MAX_OUTCOMES = 500
const PENALTY_MS = 30 * 86_400_000
/** a song left before this many seconds counts as skipped early */
const EARLY_SKIP = 30
/** stop asking for voice above this many characters in a month (free allowance: 1M) */
export const VOICE_MONTHLY_CAP = 500_000

/* ── Types ──────────────────────────────────────────── */

export interface DjSession {
  id: string
  /** number in the run, 1-based */
  n: number
  kind: ThemeKind
  theme: Theme
  title: string
  line: string
  note: string | null
  /** the DJ's songs (rows added by Ivan are in `added`) */
  songs: string[]
  added: string[]
  features: string[]
}

export interface DjRun {
  id: string
  startedAt: number
  mode: Mode
  /** sessions still in the queue, oldest first */
  sessions: DjSession[]
  /** sessions created so far */
  count: number
  /** the session the player is in (set when it is entered) */
  current: string | null
  /** title of the session skipped to get here (intro meta "SKIPPED · …") */
  skippedFrom: string | null
  /** songs used in this run (never twice) */
  used: string[]
  /** songs skipped early in this run */
  skippedEarly: string[]
  /** the queue from before the DJ, for Stop DJ */
  before: PlayerSnapshot | null
  /** a session skip in flight: which session and on which row (-1 = intro) */
  pendingSkip: { sessionId: string; at: number } | null
  /** per session: songs played through / skipped early / saved to a playlist */
  tally: Record<string, { played: number; skipped: number; saved: number }>
  /** sessions whose outcome was already written */
  recorded: string[]
}

export interface DjPrefs {
  voice: boolean
  /** 0..1, relative to the music */
  voiceVolume: number
  /** Android: only downloaded songs on mobile data */
  dataSaver: boolean
  /** Settings → DJ → Session types: what a plain Start DJ (endless) mixes; at least one */
  types: DjType[]
}

export interface DjDoc {
  outcomes: Outcome[]
  /** trackId → ms until which an early skip counts against it */
  songPenalties: Record<string, number>
  /** "2026-10" → characters sent to the voice service */
  voiceUsage: Record<string, number>
  prefs: DjPrefs
  prefsAt: Partial<Record<keyof DjPrefs, number>>
  /** ms of the last Reset (outcomes before it are ignored on merge) */
  resetAt: number
}

interface DjFile extends DjDoc {
  format: 'pelagic-dj'
  v: 1
  updatedAt: string
}

export type DjStopReason = 'user' | 'replaced' | 'cleared' | 'empty'

export interface DjNotice {
  kind: 'stopped'
  reason: DjStopReason
  /** what plays now / what was played instead */
  label: string | null
  /** how the run was started (Resume DJ starts the same way) */
  mode?: { type?: DjType; genres?: string[] }
}

const startOpts = (m: Mode): { type?: DjType; genres?: string[] } => (m.endless ? {} : { type: m.types[0], genres: m.genres })

export interface DjState {
  run: DjRun | null
  doc: DjDoc
  loaded: boolean
  /** building the first session */
  starting: boolean
}

const DEFAULT_PREFS: DjPrefs = { voice: true, voiceVolume: 0.7, dataSaver: false, types: [...DJ_TYPES] }
const emptyDoc = (): DjDoc => ({ outcomes: [], songPenalties: {}, voiceUsage: {}, prefs: { ...DEFAULT_PREFS }, prefsAt: {}, resetAt: 0 })

/* ── Store ──────────────────────────────────────────── */

function loadRun(): DjRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as DjRun
    return r && Array.isArray(r.sessions) ? r : null
  } catch {
    return null
  }
}

let state: DjState = { run: loadRun(), doc: emptyDoc(), loaded: false, starting: false }
const listeners = new Set<() => void>()
const noticeListeners = new Set<(n: DjNotice) => void>()

function set(patch: Partial<DjState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let runTimer = 0
function saveRun() {
  window.clearTimeout(runTimer)
  runTimer = window.setTimeout(() => {
    try {
      if (state.run) localStorage.setItem(RUN_KEY, JSON.stringify(state.run))
      else localStorage.removeItem(RUN_KEY)
    } catch {
      /* ignore */
    }
  }, 200)
}
window.addEventListener('pagehide', () => {
  try {
    if (state.run) localStorage.setItem(RUN_KEY, JSON.stringify(state.run))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    /* ignore */
  }
})

function setRun(run: DjRun | null) {
  set({ run })
  saveRun()
}

/* ── Queue helpers ──────────────────────────────────── */

/** `dj:intro:<sessionId>` (+ `~<rev>` when the intro was re-made, e.g. voice turned off) */
export const introId = (sessionId: string, rev = 0) => `dj:intro:${sessionId}${rev ? `~${rev}` : ''}`
export const sessionIdOf = (introItem: string) => introItem.slice('dj:intro:'.length).split('~')[0]

/** What the engines need to play an intro item. */
export function djIntroInfo(introItem: string): { sessionId: string; line: string; title: string; songs: number; gain: number } | null {
  const sid = sessionIdOf(introItem)
  const s = state.run?.sessions.find((x) => x.id === sid)
  if (!s) return null
  return { sessionId: sid, line: s.line, title: s.title, songs: s.songs.length + s.added.length, gain: state.doc.prefs.voiceVolume }
}

/** Index of the intro of the session at `index` (searching back), or -1. */
export function introIndexAt(queue: readonly string[], index: number): number {
  for (let i = Math.min(index, queue.length - 1); i >= 0; i--) if (isIntroId(queue[i])) return i
  return -1
}
/** Index of the next intro after `index`, or -1. */
export function nextIntroIndex(queue: readonly string[], index: number): number {
  for (let i = index + 1; i < queue.length; i++) if (isIntroId(queue[i])) return i
  return -1
}

export interface DjView {
  on: boolean
  /** the player is on an intro */
  intro: boolean
  session: DjSession | null
  /** 0-based song in the session; -1 during the intro */
  songIndex: number
  /** songs in the session, including added ones */
  songCount: number
  next: DjSession | null
  /** the current song was added by Ivan */
  addedByUser: boolean
  skippedFrom: string | null
}

const OFF: DjView = { on: false, intro: false, session: null, songIndex: -1, songCount: 0, next: null, addedByUser: false, skippedFrom: null }

/** Where the run is, from the player's queue. */
export function djViewOf(run: DjRun | null, p: Pick<PlayerState, 'queue' | 'index' | 'context'>): DjView {
  if (!run || p.context?.kind !== 'dj' || p.index < 0) return OFF
  const at = introIndexAt(p.queue, p.index)
  const sid = at >= 0 ? sessionIdOf(p.queue[at]) : run.sessions[0]?.id
  const session = run.sessions.find((s) => s.id === sid) ?? null
  const end = nextIntroIndex(p.queue, Math.max(at, 0))
  const songCount = (end < 0 ? p.queue.length : end) - (at + 1)
  const songIndex = p.index - (at + 1)
  const cur = p.queue[p.index]
  const nextSid = end >= 0 ? sessionIdOf(p.queue[end]) : null
  return {
    on: true,
    intro: isIntroId(cur),
    session,
    songIndex,
    songCount: Math.max(0, songCount),
    next: nextSid ? (run.sessions.find((s) => s.id === nextSid) ?? null) : null,
    addedByUser: !!session && !isIntroId(cur) && session.added.includes(cur) && !session.songs.includes(cur),
    skippedFrom: run.skippedFrom,
  }
}

/* ── Library for the engine ─────────────────────────── */

let libMemo: { key: unknown[]; lib: DjLibrary } | null = null
const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine)

/** Offline on the phone (or mobile data with the saver on): only downloaded songs. */
export function downloadedOnly(): boolean {
  if (!isNative) return false
  if (!online()) return true
  return state.doc.prefs.dataSaver && downloadsStore.get().native?.network === 'cellular'
}

export function djLibrary(): DjLibrary | null {
  const c = libraryStore.get().data
  if (!c) return null
  const plays = historyStore.get().plays
  const gdoc = genresStore.get().doc
  const dl = downloadsStore.get()
  const restrict = downloadedOnly()
  const day = Math.floor(Date.now() / 3_600_000) // re-evaluate "new" / "forgotten" hourly
  const key = [c, plays, gdoc, restrict ? dl.stored : null, state.doc.songPenalties, day]
  if (libMemo && libMemo.key.every((k, i) => k === key[i])) return libMemo.lib
  const lib = buildLibrary({
    tracks: Object.values(c.tracks),
    albums: c.albums,
    genreOf: genreResolver(gdoc, c),
    plays,
    allowed: restrict ? offlineIndex(dl, c).tracks : null,
    penalties: state.doc.songPenalties,
    now: Date.now(),
  })
  libMemo = { key, lib }
  return lib
}

export { typeCounts }

/* ── Learning ───────────────────────────────────────── */

let scoreMemo: { outcomes: Outcome[]; scores: Map<string, number> } | null = null
export function djScores(): Map<string, number> {
  const o = state.doc.outcomes
  if (scoreMemo?.outcomes !== o) scoreMemo = { outcomes: o, scores: featureScores(o, Date.now()) }
  return scoreMemo.scores
}

export function djLearned(): { more: string[]; less: string[] } {
  const lib = djLibrary()
  return learnedChips(djScores(), (k) => lib?.genreByKey.get(k)?.name)
}

function recordOutcome(run: DjRun, session: DjSession, sessionSkip: number | null): DjRun {
  if (run.recorded.includes(session.id)) return run
  const t = run.tally[session.id] ?? { played: 0, skipped: 0, saved: 0 }
  const o: Outcome = { id: `${run.id}.${session.id}`, at: Date.now(), kind: session.kind, features: session.features, played: t.played, skipped: t.skipped, sessionSkip, saved: t.saved }
  const outcomes = [...state.doc.outcomes, o].slice(-MAX_OUTCOMES)
  setDoc({ ...state.doc, outcomes })
  return { ...run, recorded: [...run.recorded, session.id].slice(-50) }
}

/* ── Building sessions ──────────────────────────────── */

const rid = () => Math.random().toString(36).slice(2, 9)

function plan(run: Pick<DjRun, 'mode' | 'used' | 'skippedEarly' | 'count'>, last: DjSession | null, lastSkipped: boolean): DjSession | null {
  const lib = djLibrary()
  if (!lib) return null
  const p = buildSession(lib, run.mode, {
    used: new Set(run.used),
    skipped: new Set(run.skippedEarly),
    last: last?.theme ?? null,
    lastSkipped,
    scores: djScores(),
    n: run.count + 1,
  })
  if (!p) return null
  return { id: rid(), n: run.count + 1, kind: p.theme.kind, theme: p.theme, title: p.title, line: p.line, note: p.note, songs: p.songs, added: [], features: p.features }
}

const rows = (s: DjSession) => [introId(s.id), ...s.songs]

/** The prepared next session (after `afterIndex`), building it if there is none. */
function ensureAhead(run: DjRun): DjRun {
  const p = playerStore.get()
  if (nextIntroIndex(p.queue, p.index) >= 0) return run
  const cur = run.sessions.find((s) => s.id === run.current) ?? run.sessions[run.sessions.length - 1] ?? null
  const next = plan(run, cur, false)
  if (!next) return run
  playerStore.splice(p.queue.length, p.queue.length, rows(next))
  djVoice.prepare(next)
  return { ...run, sessions: [...run.sessions, next], count: run.count + 1, used: [...run.used, ...next.songs] }
}

/** Keep the previous session (Previous still works), drop anything older. */
function trimOld(run: DjRun): DjRun {
  const p = playerStore.get()
  const curIntro = introIndexAt(p.queue, p.index)
  if (curIntro <= 0) return run
  const prevIntro = introIndexAt(p.queue, curIntro - 1)
  const cut = prevIntro > 0 ? prevIntro : 0
  if (cut <= 0) return run
  const dropped = new Set(p.queue.slice(0, cut).filter(isIntroId).map(sessionIdOf))
  playerStore.splice(0, cut, [])
  djVoice.forget([...dropped])
  return { ...run, sessions: run.sessions.filter((s) => !dropped.has(s.id)) }
}

/* ── Following the player ───────────────────────────── */

let lastId: string | null = null
let lastPos = 0
let lastIndex = -1
/** onPlayer edits the queue itself (trim, next session): its own changes don't re-enter it */
let busy = false

function onPlayer() {
  if (busy) return
  busy = true
  try {
    follow()
  } finally {
    busy = false
    lastIndex = playerStore.get().index
  }
}

function follow() {
  const run = state.run
  if (!run || state.starting) return
  const p = playerStore.get()
  // another device took over (step 37): the run here is over, quietly
  if (p.remote) return endRun('cleared', null)
  if (p.context?.kind !== 'dj' || p.index < 0) {
    endRun(p.index < 0 ? 'cleared' : 'replaced', p.index < 0 ? null : (p.context?.label ?? null))
    return
  }
  const id = p.queue[p.index] ?? null
  const fromIndex = lastIndex
  let next = run
  if (id !== lastId) {
    // the song we left: played through or skipped early (DJ songs only, forward moves only)
    if (lastId && !isIntroId(lastId)) {
      const sess = run.sessions.find((s) => s.songs.includes(lastId!))
      const dur = libraryStore.get().data?.tracks[lastId]?.duration ?? 0
      const forward = p.index > lastIndex || (lastIndex >= 0 && p.queue[lastIndex] !== lastId)
      if (sess && forward) {
        const t = { ...(next.tally[sess.id] ?? { played: 0, skipped: 0, saved: 0 }) }
        const heard = lastPos >= Math.min(EARLY_SKIP, dur / 2) || (dur > 0 && lastPos >= dur - 3)
        if (heard) t.played++
        else {
          t.skipped++
          if (lastPos < EARLY_SKIP && dur > EARLY_SKIP) {
            next = { ...next, skippedEarly: [...next.skippedEarly, lastId].slice(-200) }
            setDoc({ ...state.doc, songPenalties: { ...prunePenalties(state.doc.songPenalties), [lastId]: Date.now() + PENALTY_MS } })
          }
        }
        next = { ...next, tally: { ...next.tally, [sess.id]: t } }
      }
    }
    lastId = id
  }
  lastPos = p.position

  const view = djViewOf(next, p)
  const sid = view.session?.id ?? null
  if (sid && sid !== next.current) next = enterSession(next, sid, fromIndex)
  if (next !== run) setRun(next)
}

function prunePenalties(m: Record<string, number>): Record<string, number> {
  const now = Date.now()
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(m)) if (v > now) out[k] = v
  return out
}

function enterSession(run: DjRun, sid: string, fromIndex: number): DjRun {
  const prev = run.sessions.find((s) => s.id === run.current) ?? null
  const now = run.sessions.find((s) => s.id === sid)
  if (!now) return run
  let next = run
  // moving forward: the previous session is finished (played through, or skipped with the button —
  // here or from the lock screen, which shows up as a jump from before the session's last row)
  if (prev && now.n > prev.n) {
    const q = playerStore.get().queue
    const newIntro = q.indexOf(q.find((x) => isIntroId(x) && sessionIdOf(x) === sid) ?? '')
    const prevIntro = q.findIndex((x) => isIntroId(x) && sessionIdOf(x) === prev.id)
    const inferred = newIntro > 0 && prevIntro >= 0 && fromIndex >= prevIntro && fromIndex < newIntro - 1 ? fromIndex - prevIntro - 1 : null
    const skip = run.pendingSkip?.sessionId === prev.id ? run.pendingSkip.at : inferred
    next = recordOutcome(next, prev, skip)
    next = { ...next, skippedFrom: skip !== null ? prev.title : null }
  } else if (prev) next = { ...next, skippedFrom: null }
  next = { ...next, current: sid, pendingSkip: null }
  playerStore.setContext({ kind: 'dj', id: run.id, label: now.title })
  next = trimOld(next)
  next = ensureAhead(next)
  return next
}

/** Voice turned on / off: the prepared next intro is made again (new row id, so engines reload it). */
function remakeNextIntro() {
  const run = state.run
  if (!run) return
  const p = playerStore.get()
  const at = nextIntroIndex(p.queue, p.index)
  if (at < 0) return
  const item = p.queue[at]
  const sid = sessionIdOf(item)
  const sess = run.sessions.find((x) => x.id === sid)
  if (!sess) return
  const rev = Number(item.split('~')[1] ?? 0) + 1
  djVoice.forget([sid])
  djVoice.prepare(sess)
  playerStore.splice(at, at + 1, [introId(sid, rev)])
}

/* ── Ending ─────────────────────────────────────────── */

function stripIntros() {
  const p = playerStore.get()
  if (!p.queue.some(isIntroId)) return
  // drop intro rows (never the one playing: that one is replaced by its first song, or the queue cleared)
  const cur = p.queue[p.index]
  if (isIntroId(cur)) {
    const keep = p.queue.filter((id) => !isIntroId(id))
    if (!keep.length) return playerStore.clear()
    playerStore.restore({ queue: keep, index: Math.min(keep.length - 1, p.queue.slice(0, p.index).filter((id) => !isIntroId(id)).length), context: { kind: 'queue', label: 'Queue' }, position: 0, shuffle: false, unshuffled: null, repeat: 'off' })
    return
  }
  playerStore.dropTracks(new Set(p.queue.filter(isIntroId)))
}

function endRun(reason: DjStopReason, label: string | null) {
  const run = state.run
  if (!run) return
  // the session playing counts as played as far as it got (no skip)
  setRun(null)
  djVoice.forget(run.sessions.map((s) => s.id))
  lastId = null
  // a new list replaced the queue, so normally nothing of the DJ is left in it; just in case
  stripIntros()
  noticeListeners.forEach((l) => l({ kind: 'stopped', reason, label: label?.replace(/^(Library|Search) · /, '') ?? null, mode: startOpts(run.mode) }))
}

/* ── Drive sync (dj.json) ───────────────────────────── */

let fileId: string | null = null
let version: string | null = null
let dirty = false
let syncTimer = 0
let inflight: Promise<void> | null = null
let generation = 0

function setDoc(doc: DjDoc, markDirty = true) {
  set({ doc })
  if (markDirty) dirty = true
  persistDoc()
  if (markDirty) scheduleSync(15_000)
}

let docTimer = 0
function persistDoc() {
  window.clearTimeout(docTimer)
  docTimer = window.setTimeout(() => {
    void idbSet('kv', CACHE_KEY, { email: sessionStore.get().account?.email ?? null, doc: state.doc, fileId, version, dirty })
  }, 300)
}

function scheduleSync(ms: number) {
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void djStore.sync(), ms)
}

/** Session types from an older / other file: known ones only, never none. */
function cleanPrefs(p: DjPrefs): DjPrefs {
  const types = Array.isArray(p.types) ? DJ_TYPES.filter((t) => p.types.includes(t)) : []
  return { ...p, types: types.length ? types : [...DJ_TYPES] }
}

function normalise(raw: Partial<DjDoc> | undefined): DjDoc {
  const d = emptyDoc()
  if (!raw) return d
  return {
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes.filter((o) => o && typeof o.id === 'string' && Array.isArray(o.features)) : [],
    songPenalties: raw.songPenalties && typeof raw.songPenalties === 'object' ? raw.songPenalties : {},
    voiceUsage: raw.voiceUsage && typeof raw.voiceUsage === 'object' ? raw.voiceUsage : {},
    prefs: cleanPrefs({ ...d.prefs, ...(raw.prefs ?? {}) }),
    prefsAt: raw.prefsAt ?? {},
    resetAt: typeof raw.resetAt === 'number' ? raw.resetAt : 0,
  }
}

export function mergeDj(a: DjDoc, b: DjDoc): DjDoc {
  const resetAt = Math.max(a.resetAt, b.resetAt)
  const byId = new Map<string, Outcome>()
  for (const o of [...a.outcomes, ...b.outcomes]) if (o.at > resetAt) byId.set(o.id, o)
  const outcomes = [...byId.values()].sort((x, y) => x.at - y.at).slice(-MAX_OUTCOMES)
  const maxMap = (x: Record<string, number>, y: Record<string, number>) => {
    const out = { ...x }
    for (const [k, v] of Object.entries(y)) out[k] = Math.max(out[k] ?? 0, v)
    return out
  }
  const prefs = { ...a.prefs }
  const prefsAt = { ...a.prefsAt }
  for (const k of Object.keys(b.prefs) as (keyof DjPrefs)[]) {
    if ((b.prefsAt[k] ?? 0) > (a.prefsAt[k] ?? 0)) {
      ;(prefs as Record<string, unknown>)[k] = b.prefs[k]
      prefsAt[k] = b.prefsAt[k]
    }
  }
  return { outcomes, songPenalties: prunePenalties(maxMap(a.songPenalties, b.songPenalties)), voiceUsage: maxMap(a.voiceUsage, b.voiceUsage), prefs, prefsAt, resetAt }
}

async function writeFile(doc: DjDoc, parent: string, existingId: string | null): Promise<{ id: string; version: string | null }> {
  const body = JSON.stringify({ format: 'pelagic-dj', v: 1, updatedAt: new Date().toISOString(), ...doc } satisfies DjFile)
  let res: Response
  if (existingId) {
    res = await driveFetch(`${UPLOAD}/${existingId}?uploadType=media&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body })
  } else {
    const boundary = `pelagic${Math.random().toString(36).slice(2)}`
    res = await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DJ_NAME, parents: [parent], mimeType: 'application/json' })}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    })
  }
  const j = (await res.json()) as { id: string; version?: string }
  return { id: j.id, version: j.version ?? null }
}

/* ── Public API ─────────────────────────────────────── */

const monthKey = () => new Date().toISOString().slice(0, 7)

export const djStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  onNotice(l: (n: DjNotice) => void) {
    noticeListeners.add(l)
    return () => {
      noticeListeners.delete(l)
    }
  },
  view: () => djViewOf(state.run, playerStore.get()),
  active: () => !!state.run && playerStore.get().context?.kind === 'dj',

  /** Start a run: Endless (no type), one type, or Genre with picked genre keys. */
  async start(opts: { type?: DjType; genres?: string[] } = {}): Promise<boolean> {
    if (state.starting) return false
    const lib = djLibrary()
    if (!lib || !lib.tracks.length) return false
    const prevRun = state.run
    const before = prevRun?.before ?? (playerStore.get().context?.kind === 'dj' ? null : playerStore.snapshot())
    const mode: Mode = opts.type ? { types: [opts.type], genres: opts.type === 'genre' ? (opts.genres ?? []) : [], endless: false } : { types: [...state.doc.prefs.types], genres: [], endless: true }
    const base: DjRun = { id: rid(), startedAt: Date.now(), mode, sessions: [], count: 0, current: null, skippedFrom: null, used: [], skippedEarly: [], before, pendingSkip: null, tally: {}, recorded: [] }
    const first = plan(base, null, false)
    if (!first) return false
    const withFirst = { ...base, sessions: [first], count: 1, used: first.songs }
    const second = plan(withFirst, first, false)
    const run: DjRun = second ? { ...withFirst, sessions: [first, second], count: 2, used: [...first.songs, ...second.songs] } : withFirst
    if (prevRun) djVoice.forget(prevRun.sessions.map((s) => s.id))
    djVoice.prepare(first)
    if (second) djVoice.prepare(second)
    set({ starting: true })
    setRun(run)
    lastId = null
    try {
      playerStore.playDj([...rows(first), ...(second ? rows(second) : [])], { kind: 'dj', id: run.id, label: first.title })
    } finally {
      set({ starting: false })
    }
    onPlayer()
    return true
  },

  /** DJ button while on: straight to the next intro (no Undo). */
  skip() {
    const run = state.run
    if (!run) return
    const p = playerStore.get()
    const view = djViewOf(run, p)
    if (!view.session) return
    let at = nextIntroIndex(p.queue, p.index)
    if (at < 0) {
      setRun(ensureAhead(run))
      at = nextIntroIndex(playerStore.get().queue, p.index)
      if (at < 0) return
    }
    setRun({ ...state.run!, pendingSkip: { sessionId: view.session.id, at: view.songIndex } })
    playerStore.jump(at)
    if (!playerStore.get().playing) playerStore.toggle()
  },

  /** Stop DJ: stop at once, back to what played before (paused, where it was). */
  stop() {
    const run = state.run
    if (!run) return
    const before = run.before
    setRun(null)
    djVoice.forget(run.sessions.map((s) => s.id))
    lastId = null
    let label: string | null = null
    if (before && before.queue.length) {
      const c = libraryStore.get().data
      const id = before.queue[before.index]
      label = (id && c?.tracks[id]?.title) || null
      playerStore.restore(before)
    } else {
      // nothing before: keep the current song, paused, as a plain queue
      const p = playerStore.get()
      const cur = p.queue[p.index]
      const songs = p.queue.filter((x) => !isIntroId(x))
      if (!songs.length) playerStore.clear()
      else {
        const index = isIntroId(cur) ? Math.min(songs.length - 1, p.queue.slice(0, p.index).filter((x) => !isIntroId(x)).length) : songs.indexOf(cur)
        playerStore.restore({ queue: songs, index: Math.max(0, index), context: { kind: 'queue', label: 'Queue' }, position: isIntroId(cur) ? 0 : p.position, shuffle: false, unshuffled: null, repeat: 'off' })
      }
    }
    noticeListeners.forEach((l) => l({ kind: 'stopped', reason: 'user', label, mode: startOpts(run.mode) }))
  },

  /** Session types for the run (from the next session); at least one stays on. */
  setTypes(types: DjType[]) {
    const run = state.run
    if (!run || !types.length) return
    const mode: Mode = { ...run.mode, types: DJ_TYPES.filter((t) => types.includes(t)), endless: run.mode.endless || types.length === DJ_TYPES.length }
    let next: DjRun = { ...run, mode }
    // rebuild the prepared next session with the new types
    const p = playerStore.get()
    const at = nextIntroIndex(p.queue, p.index)
    if (at >= 0) {
      const old = next.sessions.find((s) => s.id === sessionIdOf(p.queue[at]))
      const end = nextIntroIndex(p.queue, at)
      const cur = next.sessions.find((s) => s.id === next.current) ?? null
      const used = next.used.filter((id) => !old?.songs.includes(id))
      const fresh = plan({ ...next, used, count: next.count - 1 }, cur, false)
      if (fresh) {
        playerStore.splice(at, end < 0 ? p.queue.length : end, rows(fresh))
        if (old) djVoice.forget([old.id])
        djVoice.prepare(fresh)
        next = { ...next, used: [...used, ...fresh.songs], sessions: [...next.sessions.filter((s) => s.id !== old?.id), fresh] }
      }
    }
    setRun(next)
  },

  /**
   * Play next / Add to queue while the DJ plays: right after the current song (during the intro:
   * before song 1), or at the end of this session, before the next intro. Returns an Undo.
   */
  add(ids: string[], playNext: boolean): (() => void) | null {
    const run = state.run
    if (!run || !ids.length) return null
    const p = playerStore.get()
    const view = djViewOf(run, p)
    if (!view.session) return null
    const at = playNext ? p.index + 1 : (() => {
      const n = nextIntroIndex(p.queue, p.index)
      return n < 0 ? p.queue.length : n
    })()
    playerStore.splice(at, at, ids)
    const sid = view.session.id
    setRun({ ...run, sessions: run.sessions.map((s) => (s.id === sid ? { ...s, added: [...s.added, ...ids] } : s)) })
    return () => {
      // take the added rows out again (never the one playing)
      for (const id of ids) {
        const q = playerStore.get()
        const k = q.queue.indexOf(id, Math.max(0, introIndexAt(q.queue, q.index)))
        if (k >= 0 && k !== q.index) playerStore.remove(k)
      }
      const r = state.run
      if (r) setRun({ ...r, sessions: r.sessions.map((s) => (s.id === sid ? { ...s, added: s.added.filter((x) => !ids.includes(x)) } : s)) })
    }
  },

  /** A song was saved to a playlist (learning +0.3 for its session). */
  noteSaved(trackIds: string[]) {
    const run = state.run
    if (!run) return
    const sess = run.sessions.find((s) => s.songs.some((id) => trackIds.includes(id)))
    if (!sess) return
    const t = run.tally[sess.id] ?? { played: 0, skipped: 0, saved: 0 }
    setRun({ ...run, tally: { ...run.tally, [sess.id]: { ...t, saved: t.saved + 1 } } })
  },

  setPref<K extends keyof DjPrefs>(key: K, value: DjPrefs[K]) {
    if (state.doc.prefs[key] === value) return
    setDoc({ ...state.doc, prefs: { ...state.doc.prefs, [key]: value }, prefsAt: { ...state.doc.prefsAt, [key]: Date.now() } })
    if (key === 'voice') remakeNextIntro()
  },

  resetLearned() {
    setDoc({ ...state.doc, outcomes: [], songPenalties: {}, resetAt: Date.now() })
  },

  /* voice usage (dj/voice.ts) */
  voiceUsed: () => state.doc.voiceUsage[monthKey()] ?? 0,
  voiceAllowed: (chars: number) => (state.doc.voiceUsage[monthKey()] ?? 0) + chars <= VOICE_MONTHLY_CAP,
  addVoiceUsage(chars: number) {
    const k = monthKey()
    setDoc({ ...state.doc, voiceUsage: { ...state.doc.voiceUsage, [k]: (state.doc.voiceUsage[k] ?? 0) + chars } })
  },

  /* ── persistence ── */
  load(): Promise<void> {
    loadPromise ??= (async () => {
      const gen = generation
      const rec = await idbGet<{ email: string | null; doc: DjDoc; fileId: string | null; version: string | null; dirty: boolean }>('kv', CACHE_KEY)
      if (gen !== generation) return
      const email = sessionStore.get().account?.email ?? null
      if (rec?.doc && (!email || !rec.email || rec.email === email)) {
        fileId = rec.fileId
        version = rec.version
        dirty = rec.dirty || dirty
        set({ doc: mergeDj(normalise(rec.doc), state.doc), loaded: true })
      } else set({ loaded: true })
    })()
    return loadPromise
  },

  sync(): Promise<void> {
    if (inflight) return inflight
    if (sessionStore.get().status !== 'signed-in') return Promise.resolve()
    window.clearTimeout(syncTimer)
    const gen = generation
    inflight = (async () => {
      await djStore.load()
      try {
        const parent = (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
        if (gen !== generation || !parent) return
        for (let attempt = 1; ; attempt++) {
          const meta = await findChild(DJ_NAME, parent, false)
          if (gen !== generation) return
          if (!meta) {
            fileId = null
            version = null
            dirty = true
          } else if (meta.id !== fileId || meta.version !== version) {
            const raw = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Partial<DjFile>
            if (gen !== generation) return
            const merged = mergeDj(state.doc, normalise(raw))
            const remote = normalise(raw)
            if (JSON.stringify(merged) !== JSON.stringify(mergeDj(remote, remote))) dirty = true
            fileId = meta.id
            version = meta.version ?? null
            set({ doc: merged })
          }
          if (!dirty) break
          if (meta && attempt < 4) {
            const again = await findChild(DJ_NAME, parent, false)
            if (again && again.version !== meta.version) continue
          }
          const w = await writeFile(state.doc, parent, meta?.id ?? null)
          if (gen !== generation) return
          fileId = w.id
          version = w.version
          dirty = false
          break
        }
        persistDoc()
      } catch (e) {
        if (gen !== generation) return
        if (!(e instanceof AuthError)) scheduleSync(120_000)
      }
    })().finally(() => {
      inflight = null
    })
    return inflight
  },

  init() {
    setVoiceHost({ voiceOn: () => state.doc.prefs.voice, allowed: (n) => djStore.voiceAllowed(n), spend: (n) => djStore.addVoiceUsage(n) })
    void djStore.load()
    if (sessionStore.get().status === 'signed-in') scheduleSync(4_000)
    sessionStore.subscribe(() => {
      if (sessionStore.get().status === 'signed-in' && !inflight && !version) scheduleSync(4_000)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) void djStore.sync()
    })
    // a restored run whose queue is gone (or another context) ends quietly
    const p = playerStore.get()
    if (state.run && (p.context?.kind !== 'dj' || p.index < 0)) setRun(null)
    else if (state.run) {
      for (const s of state.run.sessions) djVoice.prepare(s)
      lastId = p.queue[p.index] ?? null
    }
    playerStore.subscribe(onPlayer)
  },
}

let loadPromise: Promise<void> | null = null

onAccountReset(() => {
  generation++
  window.clearTimeout(syncTimer)
  fileId = null
  version = null
  dirty = false
  inflight = null
  loadPromise = null
  if (state.run) djVoice.forget(state.run.sessions.map((s) => s.id))
  setRun(null)
  set({ doc: emptyDoc(), loaded: false })
})

export function useDj(): DjState {
  return useSyncExternalStore(djStore.subscribe, djStore.get, djStore.get)
}
