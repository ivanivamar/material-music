/**
 * Player sync between the PC and the phone (step 37) through Firestore.
 *
 * Every device publishes what it plays (queue + track + position + shuffle / repeat) to
 * `users/<uid>/devices/<id>` and `queues/<id>`; `sync/active` names the device that plays. From that:
 *
 * - **One device plays.** Starting playback here makes this device the active one; a device that is
 *   playing and sees another one become active stops.
 * - **Follow / remote control.** While the active device is another one that is online and playing
 *   (or paused less than FOLLOW_PAUSED_MS ago), this device *follows* it: the player store mirrors it
 *   (`remote` set, local engine unloaded) and transport / queue calls go there as commands
 *   (`users/<uid>/commands`). "Play here" takes the playback over; "Play on …" hands it to another.
 * - **Handoff.** Otherwise, when another device has a newer queue (it changed more recently than this
 *   one's), this device takes it over — silently while it isn't playing (paused, at the other
 *   device's position, loaded on Play), or as an offer ("Continue from …") while it is.
 *
 * Stays off until FIREBASE_CONFIG has an API key, the setting is on and the Google session is signed
 * in. The Firebase SDK is loaded only then (sync/firebase.ts).
 *
 * Limits: the phone can only be followed / controlled while its app's JS runs (Android may put it to
 * sleep with the screen off — then it shows as offline after STALE_MS and the PC stops following it).
 * The DJ and a radio don't move between devices: what moves is their queue (DJ intros left out).
 */
import { useSyncExternalStore } from 'react'
import { FIREBASE_CONFIG } from '../config'
import { isNative } from '../native/bridge'
import { libraryStore } from '../state/library'
import {
  isIntroId,
  playerStore,
  REMOTE_OPS,
  type PlayContext,
  type PlayerState,
  type RemoteDevice,
  type RemoteOp,
  type RepeatMode,
  type SharedPlayerState,
} from '../state/player'
import { onAccountReset, sessionStore } from '../state/session'
import { settingsStore } from '../state/settings'
import type { Docs, SyncBackend } from './firebase'

/* ── Firestore shapes ───────────────────────────────── */

interface NowDoc {
  trackId: string | null
  index: number
  context: PlayContext | null
  playing: boolean
  /** seconds at `positionAt` (ms, sender's clock) */
  position: number
  positionAt: number
  shuffle: boolean
  repeat: RepeatMode
  /** ms: last time this device's queue / track / play state changed by itself (not position ticks) */
  changedAt: number
  /** whose clock `changedAt` is from (a taken-over state keeps the original device's time) */
  changedBy: string
  /** matches queues/<id>.rev when that doc belongs to this state */
  queueRev: string
}

interface DeviceDoc {
  name: string
  platform: 'pc' | 'android'
  seenAt: number
  online: boolean
  /** the device this one follows (then `now` is null) */
  following: string | null
  now: NowDoc | null
}

interface QueueDoc {
  rev: string
  queue: string[]
  unshuffled: string[] | null
}

interface ActiveDoc {
  deviceId: string
  at: number
}

interface CommandDoc {
  to: string
  from: string
  /** a RemoteOp, or 'pause' / 'takeOver' (sync's own) */
  op: string
  /** JSON array */
  args: string
  at: number
}

/* ── Timing ─────────────────────────────────────────── */

const HEARTBEAT_MS = 30_000
/** a device that hasn't been seen for this long is offline */
const STALE_MS = 150_000
/** keep following (remote control) a device that paused less than this long ago */
const FOLLOW_PAUSED_MS = 5 * 60_000
/** commands older than this are dropped (the device was asleep) */
const COMMAND_TTL_MS = 60_000
/** a newer queue must be at least this much newer (clock jitter between devices) */
const NEWER_MS = 1500
/** Firestore's document limit is 1 MiB; stay well under it */
const MAX_QUEUE_JSON = 800_000

/* ── This device ────────────────────────────────────── */

const DEVICE_KEY = 'pelagic.device.v1'
const SYNC_KEY = 'pelagic.sync.v1'

function defaultName(): string {
  if (isNative) return 'Phone'
  const ua = navigator.userAgent
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Android|iPhone|iPad/.test(ua)) return 'Phone browser'
  return 'PC'
}

function loadDevice(): { id: string; name: string } {
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as { id?: string; name?: string }
      if (d.id) return { id: d.id, name: d.name?.trim() || defaultName() }
    }
  } catch {
    /* ignore */
  }
  const d = { id: crypto.randomUUID(), name: defaultName() }
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}

const device = loadDevice()
const platform: 'pc' | 'android' = isNative ? 'android' : 'pc'

/** When this device's own queue last changed (or the time of the state it took over), and whose clock that is. */
let localChangedAt = 0
let localChangedBy = device.id
try {
  const j = JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') as { changedAt?: number; changedBy?: string }
  localChangedAt = Number(j.changedAt) || 0
  localChangedBy = j.changedBy || device.id
} catch {
  /* ignore */
}
function setChangedAt(t: number, by = device.id) {
  localChangedAt = t
  localChangedBy = by
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ changedAt: t, changedBy: by }))
  } catch {
    /* ignore */
  }
}
/** Is `n` newer than what this device holds? Same clock: strictly; another clock: by a margin. */
const isNewer = (n: NowDoc) => n.changedAt > localChangedAt + ((n.changedBy || '') === localChangedBy ? 0 : NEWER_MS)

/* ── Public state ───────────────────────────────────── */

export interface DeviceView extends RemoteDevice {
  online: boolean
  playing: boolean
  trackId: string | null
  following: string | null
}

export interface SyncState {
  status: 'off' | 'connecting' | 'on' | 'error'
  error: string | null
  me: RemoteDevice
  /** the other devices, most recently seen first */
  devices: DeviceView[]
  /** another device has a newer queue while this one plays */
  offer: { device: RemoteDevice; trackId: string | null; at: number } | null
}

let state: SyncState = { status: 'off', error: null, me: { id: device.id, name: device.name, platform }, devices: [], offer: null }
const listeners = new Set<() => void>()
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

/* ── Firestore mirrors ──────────────────────────────── */

let be: SyncBackend | null = null
let unsubs: (() => void)[] = []
let devices = new Map<string, DeviceDoc>()
let queues = new Map<string, QueueDoc>()
let active: ActiveDoc | null = null
/** >0 while this module changes the player store (those changes aren't "this device changed") */
let applying = 0
/** commands already handled (a snapshot can list one again before its delete lands) */
const handled = new Set<string>()

const fresh = (d: DeviceDoc | undefined, now = Date.now()) => !!d && d.online !== false && now - d.seenAt < STALE_MS
const view = (id: string, d: DeviceDoc): RemoteDevice => ({ id, name: d.name || 'Device', platform: d.platform === 'android' ? 'android' : 'pc' })
const durationOf = (id: string | null) => (id ? libraryStore.get().data?.tracks[id]?.duration : undefined)

/** Where a device's track is now: its reported position, moved on by the time since if it plays. */
function positionOf(d: DeviceDoc, now = Date.now()): number {
  const n = d.now!
  let pos = n.position
  if (n.playing && fresh(d, now)) pos += Math.max(0, now - n.positionAt) / 1000
  const dur = durationOf(n.trackId)
  return Math.max(0, dur ? Math.min(pos, Math.max(0, dur - 0.5)) : pos)
}

/** A device's full state, if its queue doc has caught up with its `now`. */
function sharedOf(id: string, d: DeviceDoc, now = Date.now()): SharedPlayerState | null {
  const n = d.now
  const q = queues.get(id)
  if (!n || !q || q.rev !== n.queueRev || !q.queue.length) return null
  const index = Math.max(0, Math.min(n.index, q.queue.length - 1))
  return { queue: q.queue, index, context: n.context, position: positionOf(d, now), shuffle: n.shuffle, unshuffled: q.unshuffled, repeat: n.repeat }
}

/* ── Publishing this device ─────────────────────────── */

let queueSrc: { queue: string[] | null; unshuffled: string[] | null } = { queue: null, unshuffled: null }
let queueRev = ''
let pubTimer = 0
let publishing: Promise<void> | null = null
let republish = false

/** The queue as other devices can use it: no DJ intros (their audio lives on this device), size-capped. */
function shareable(p: PlayerState): { queue: string[]; unshuffled: string[] | null; index: number } {
  let index = p.index
  const queue: string[] = []
  p.queue.forEach((id, i) => {
    if (isIntroId(id)) {
      if (i < p.index) index--
      return
    }
    queue.push(id)
  })
  if (p.index >= 0 && isIntroId(p.queue[p.index])) index = Math.min(index + 1, queue.length - 1) // on an intro: the song after it
  let unshuffled = p.unshuffled ? p.unshuffled.filter((id) => !isIntroId(id)) : null
  let out = { queue, unshuffled, index: queue.length ? Math.max(0, index) : -1 }
  if (JSON.stringify(out.queue).length + JSON.stringify(unshuffled ?? []).length > MAX_QUEUE_JSON) {
    unshuffled = null
    out = { ...out, unshuffled }
    if (JSON.stringify(queue).length > MAX_QUEUE_JSON) {
      // a huge list (library shuffle): what's around the current song
      const from = Math.max(0, out.index - 200)
      out = { queue: queue.slice(from, from + 8000), unshuffled: null, index: out.index - from }
    }
  }
  return out
}

function schedulePublish(ms = 300) {
  if (!be) return
  window.clearTimeout(pubTimer)
  pubTimer = window.setTimeout(() => void publish(), ms)
}

async function publish(): Promise<void> {
  if (!be) return
  if (publishing) {
    republish = true
    return publishing
  }
  const b = be
  publishing = (async () => {
    const p = playerStore.get()
    const now = Date.now()
    const base = { name: device.name, platform, seenAt: now, online: true }
    try {
      if (p.remote) {
        await b.set(`devices/${device.id}`, { ...base, following: p.remote.id, now: null } satisfies DeviceDoc)
        return
      }
      if (p.index < 0 || !p.queue.length) {
        await b.set(`devices/${device.id}`, { ...base, following: null, now: null } satisfies DeviceDoc)
        return
      }
      const sh = shareable(p)
      if (!sh.queue.length) return
      if (queueSrc.queue !== p.queue || queueSrc.unshuffled !== p.unshuffled || !queueRev) {
        queueSrc = { queue: p.queue, unshuffled: p.unshuffled }
        queueRev = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        await b.set(`queues/${device.id}`, { rev: queueRev, queue: sh.queue, unshuffled: sh.unshuffled } satisfies QueueDoc)
      }
      const nowDoc: NowDoc = {
        trackId: sh.queue[sh.index] ?? null,
        index: sh.index,
        context: p.context,
        playing: p.playing,
        position: p.position,
        positionAt: now,
        shuffle: p.shuffle,
        repeat: p.repeat,
        changedAt: localChangedAt,
        changedBy: localChangedBy,
        queueRev,
      }
      await b.set(`devices/${device.id}`, { ...base, following: null, now: nowDoc } satisfies DeviceDoc)
      if (state.status === 'error') setState({ status: 'on', error: null })
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message })
    }
  })().finally(() => {
    publishing = null
    if (republish) {
      republish = false
      schedulePublish(100)
    }
  })
  return publishing
}

/* ── Watching the player ────────────────────────────── */

let prev: PlayerState = playerStore.get()
let prevAt = Date.now()

function onPlayer() {
  const p = playerStore.get()
  const t = Date.now()
  const before = prev
  const beforeAt = prevAt
  prev = p
  prevAt = t
  if (!be || applying > 0 || p.remote) return
  const expected = before.position + (before.playing ? (t - beforeAt) / 1000 : 0)
  const changed =
    p.queue !== before.queue ||
    p.unshuffled !== before.unshuffled ||
    p.index !== before.index ||
    p.context !== before.context ||
    p.shuffle !== before.shuffle ||
    p.repeat !== before.repeat ||
    p.playing !== before.playing ||
    before.remote !== null ||
    Math.abs(p.position - expected) > 3
  if (!changed) return
  setChangedAt(t)
  if (p.playing && !before.playing) claimActive()
  if (state.offer && p.playing !== before.playing) setState({ offer: null })
  schedulePublish(p.playing !== before.playing || p.index !== before.index ? 150 : 350)
}

function claimActive() {
  if (!be || active?.deviceId === device.id) return
  active = { deviceId: device.id, at: Date.now() }
  void be.set('sync/active', { ...active }).catch((e: Error) => setState({ status: 'error', error: e.message }))
}

/* ── Deciding: follow, take over, offer ─────────────── */

let tickTimer = 0
/** what the store mirrors right now (to move the position on between updates) */
let mirrored: { id: string; doc: DeviceDoc } | null = null

function decide() {
  if (!be) return
  const now = Date.now()
  const p = playerStore.get()

  // 1. another device is the active one and is playing (or just paused): follow it
  const actId = active && active.deviceId !== device.id ? active.deviceId : null
  const act = actId ? devices.get(actId) : undefined
  if (actId && act && fresh(act, now) && act.now && !act.following && (act.now.playing || now - act.now.changedAt < FOLLOW_PAUSED_MS)) {
    const shared = sharedOf(actId, act, now)
    if (shared) {
      const was = p.remote?.id
      applying++
      try {
        playerStore.mirror(shared, act.now.playing, view(actId, act))
      } finally {
        applying--
      }
      mirrored = { id: actId, doc: act }
      setChangedAt(act.now.changedAt, act.now.changedBy || actId)
      if (state.offer) setState({ offer: null })
      if (was !== actId) schedulePublish(50) // tell the others this device follows now
      armTick()
      return
    }
    if (p.remote?.id === actId) return // its queue doc is on the way; keep following
  }

  // 2. not following (any more)
  mirrored = null
  armTick()
  if (p.remote) {
    applying++
    try {
      playerStore.unmirror()
    } finally {
      applying--
    }
    schedulePublish(50)
  }

  // 3. handoff: the newest queue among the other devices, if it is newer than ours
  let best: { id: string; doc: DeviceDoc; shared: SharedPlayerState } | null = null
  for (const [id, d] of devices) {
    if (id === device.id || !d.now || d.following) continue
    if (!isNewer(d.now)) continue
    if (best && best.doc.now!.changedAt >= d.now.changedAt) continue
    const shared = sharedOf(id, d, now)
    if (shared) best = { id, doc: d, shared }
  }
  const cur = playerStore.get()
  if (!best) {
    if (state.offer) setState({ offer: null })
    return
  }
  if (!cur.playing) {
    applying++
    try {
      playerStore.takeState(best.shared, false)
    } finally {
      applying--
    }
    setChangedAt(best.doc.now!.changedAt, best.doc.now!.changedBy || best.id)
    if (state.offer) setState({ offer: null })
    schedulePublish(200)
    return
  }
  // playing here: only offer it, from a device that is online and holds something else
  if (sameQueue(cur, best.shared)) {
    setChangedAt(best.doc.now!.changedAt, best.doc.now!.changedBy || best.id)
    if (state.offer) setState({ offer: null })
    return
  }
  if (fresh(best.doc, now) && state.offer?.device.id !== best.id) setState({ offer: { device: view(best.id, best.doc), trackId: best.doc.now!.trackId, at: best.doc.now!.changedAt } })
}

/** Same list and the same song (position aside)? */
function sameQueue(p: PlayerState, s: SharedPlayerState): boolean {
  const mine = p.queue.filter((id) => !isIntroId(id))
  if (mine.length !== s.queue.length || p.queue[p.index] !== s.queue[s.index]) return false
  return mine.every((id, i) => id === s.queue[i])
}

/** While following a playing device: move the mirrored position on every second. */
function armTick() {
  const want = !!mirrored?.doc.now?.playing
  if (want && !tickTimer) {
    tickTimer = window.setInterval(() => {
      if (!mirrored || !playerStore.get().remote) return
      const shared = sharedOf(mirrored.id, mirrored.doc)
      if (!shared) return
      applying++
      try {
        playerStore.mirror(shared, mirrored.doc.now!.playing, view(mirrored.id, mirrored.doc))
      } finally {
        applying--
      }
    }, 1000)
  } else if (!want && tickTimer) {
    window.clearInterval(tickTimer)
    tickTimer = 0
  }
}

function refreshDevices() {
  const now = Date.now()
  const list: DeviceView[] = []
  for (const [id, d] of devices) {
    if (id === device.id) continue
    // forget devices not seen for a month
    if (now - d.seenAt > 30 * 86_400_000) continue
    list.push({ ...view(id, d), online: fresh(d, now), playing: !!d.now?.playing && fresh(d, now), trackId: d.now?.trackId ?? null, following: d.following ?? null })
  }
  list.sort((a, b) => Number(b.online) - Number(a.online) || (devices.get(b.id)!.seenAt - devices.get(a.id)!.seenAt))
  setState({ devices: list })
}

/* ── Commands ───────────────────────────────────────── */

function send(to: string, op: string, args: unknown[] = []) {
  if (!be) return
  void be
    .add('commands', { to, from: device.id, op, args: JSON.stringify(args), at: Date.now() } satisfies CommandDoc)
    .catch((e: Error) => setState({ status: 'error', error: e.message }))
}

function onCommands(docs: Docs<CommandDoc>[]) {
  const b = be
  if (!b) return
  const now = Date.now()
  for (const { id, data } of docs.sort((x, y) => x.data.at - y.data.at)) {
    if (handled.has(id)) continue
    handled.add(id)
    void b.remove(`commands/${id}`).catch(() => {})
    if (now - data.at > COMMAND_TTL_MS) continue
    let args: unknown[] = []
    try {
      args = JSON.parse(data.args) as unknown[]
    } catch {
      continue
    }
    run(data.op, args)
  }
  if (handled.size > 500) handled.clear()
}

function run(op: string, args: unknown[]) {
  const p = playerStore.get()
  if (op === 'pause') {
    if (!p.remote && p.playing) playerStore.toggle()
    return
  }
  if (op === 'takeOver') {
    // another device hands its playback to this one
    const shared = args[0] as SharedPlayerState | undefined
    if (!shared?.queue?.length) return
    claimActive()
    applying++
    try {
      if (p.remote) playerStore.unmirror()
      playerStore.takeState(shared, true)
    } finally {
      applying--
    }
    mirrored = null
    armTick()
    setChangedAt(Date.now())
    schedulePublish(50)
    return
  }
  if (p.remote) return // a call meant for the device that plays; this one follows another
  if ((REMOTE_OPS as readonly string[]).includes(op)) playerStore.runRemote(op as RemoteOp, args)
}

/* ── Actions ────────────────────────────────────────── */

/** The current state as a snapshot to hand over (position moved on to now). */
function handoverState(): SharedPlayerState | null {
  const p = playerStore.get()
  if (p.index < 0) return null
  const sh = shareable(p)
  if (!sh.queue.length) return null
  return { queue: sh.queue, index: sh.index, context: p.context, position: p.position, shuffle: p.shuffle, unshuffled: sh.unshuffled, repeat: p.repeat }
}

export const syncStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  /** Is the sync built in (a Firebase API key is configured)? */
  available: () => !!FIREBASE_CONFIG.apiKey,

  /** Following another device: take the playback over and play here. */
  playHere() {
    const p = playerStore.get()
    const from = p.remote
    if (!from) return
    const shared: SharedPlayerState = { queue: p.queue, index: p.index, context: p.context, position: p.position, shuffle: p.shuffle, unshuffled: p.unshuffled, repeat: p.repeat }
    send(from.id, 'pause')
    claimActive()
    applying++
    try {
      playerStore.unmirror()
      playerStore.takeState(shared, true)
    } finally {
      applying--
    }
    mirrored = null
    armTick()
    setChangedAt(Date.now())
    schedulePublish(50)
  },

  /** Hand what plays here to another (online) device; this one pauses and follows it. */
  playOn(id: string) {
    const target = devices.get(id)
    if (!target || !fresh(target)) return
    const p = playerStore.get()
    if (p.remote) {
      // following someone: the target takes over from the device that plays
      if (p.remote.id === id) return
      const shared: SharedPlayerState = { queue: p.queue, index: p.index, context: p.context, position: p.position, shuffle: p.shuffle, unshuffled: p.unshuffled, repeat: p.repeat }
      send(p.remote.id, 'pause')
      send(id, 'takeOver', [shared])
      return
    }
    const shared = handoverState()
    if (!shared) return
    if (p.playing) playerStore.toggle()
    send(id, 'takeOver', [shared])
  },

  /** Offer accepted: take the other device's newer queue and keep playing, here. */
  acceptOffer() {
    const o = state.offer
    if (!o) return
    const d = devices.get(o.device.id)
    const shared = d ? sharedOf(o.device.id, d) : null
    setState({ offer: null })
    if (!d?.now || !shared) return
    if (d.now.playing && fresh(d)) send(o.device.id, 'pause')
    claimActive()
    applying++
    try {
      playerStore.takeState(shared, true)
    } finally {
      applying--
    }
    setChangedAt(Date.now())
    schedulePublish(50)
  },
  dismissOffer() {
    const o = state.offer
    if (!o) return
    // don't offer the same state again
    const d = devices.get(o.device.id)
    if (d?.now) setChangedAt(d.now.changedAt, d.now.changedBy || o.device.id)
    setState({ offer: null })
    schedulePublish(200)
  },

  /** Rename this device (Settings). */
  rename(name: string) {
    device.name = name.trim().slice(0, 40) || defaultName()
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(device))
    } catch {
      /* ignore */
    }
    setState({ me: { ...state.me, name: device.name } })
    schedulePublish(800)
  },
}

/** The DJ / a radio starts here while following: stop the other device and stop following, nothing more. */
function takeOverQuietly() {
  const from = playerStore.get().remote
  if (!from) return
  send(from.id, 'pause')
  claimActive()
  applying++
  try {
    playerStore.unmirror()
  } finally {
    applying--
  }
  mirrored = null
  armTick()
  setChangedAt(Date.now())
}

/* ── Start / stop ───────────────────────────────────── */

let gen = 0
let everConnected = false
let heartbeat = 0
let reconnectTimer = 0

function stop() {
  gen++
  for (const u of unsubs) u()
  unsubs = []
  window.clearInterval(heartbeat)
  window.clearTimeout(pubTimer)
  window.clearTimeout(reconnectTimer)
  heartbeat = 0
  if (tickTimer) window.clearInterval(tickTimer)
  tickTimer = 0
  mirrored = null
  be = null
  devices = new Map()
  queues = new Map()
  active = null
  queueRev = ''
  queueSrc = { queue: null, unshuffled: null }
  playerStore.setRemoteControl(null, null)
  if (playerStore.get().remote) {
    applying++
    try {
      playerStore.unmirror()
    } finally {
      applying--
    }
  }
  setState({ status: 'off', error: null, devices: [], offer: null })
}

async function start() {
  const my = ++gen
  const email = sessionStore.get().account?.email
  if (!email) return
  setState({ status: 'connecting', error: null })
  try {
    const { connect } = await import('./firebase')
    const b = await connect(email, () => sessionStore.ensureToken())
    if (my !== gen) return
    be = b
    everConnected = true
    const fail = (e: Error) => {
      if (my !== gen) return
      setState({ status: 'error', error: e.message })
      // listeners die on a permission / network error: start over in a minute
      window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(() => {
        if (my === gen && wanted()) {
          stop()
          void start()
        }
      }, 60_000)
    }
    unsubs.push(
      b.watch<DeviceDoc>(
        'devices',
        (docs) => {
          devices = new Map(docs.map((x) => [x.id, x.data]))
          if (mirrored) mirrored = devices.has(mirrored.id) ? { id: mirrored.id, doc: devices.get(mirrored.id)! } : null
          refreshDevices()
          decide()
        },
        fail,
      ),
      b.watch<QueueDoc>(
        'queues',
        (docs) => {
          queues = new Map(docs.map((x) => [x.id, x.data]))
          decide()
        },
        fail,
      ),
      b.watchDoc<ActiveDoc>(
        'sync/active',
        (a) => {
          // Firestore reports our own pending claim first, so this is never older than a local claim
          active = a
          decide()
        },
        fail,
      ),
      b.watchCommands<CommandDoc>(device.id, onCommands, fail),
    )
    playerStore.setRemoteControl(
      (op, args) => {
        const to = playerStore.get().remote?.id
        if (to) send(to, op, args)
      },
      () => takeOverQuietly(),
    )
    heartbeat = window.setInterval(() => {
      refreshDevices()
      decide()
      void publish()
    }, HEARTBEAT_MS)
    prev = playerStore.get()
    prevAt = Date.now()
    setState({ status: 'on', error: null })
    void publish()
  } catch (e) {
    if (my !== gen) return
    be = null
    setState({ status: 'error', error: (e as Error).message })
    window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => {
      if (my === gen && wanted()) void start()
    }, 120_000)
  }
}

const wanted = () => syncStore.available() && settingsStore.get().syncPlayback && sessionStore.get().status !== 'signed-out' && !!sessionStore.get().account

let started = false
export function initPlayerSync() {
  if (started) return
  started = true
  playerStore.subscribe(onPlayer)
  const reconcile = () => {
    const want = wanted()
    if (want && state.status === 'off') void start()
    else if (!want && state.status !== 'off') stop()
  }
  sessionStore.subscribe(reconcile)
  settingsStore.subscribe(reconcile)
  reconcile()
  // back in the foreground: say so at once and catch up (timers may have slept)
  document.addEventListener('visibilitychange', () => {
    if (!be) return
    if (document.visibilityState === 'visible') {
      refreshDevices()
      decide()
      void publish()
    }
  })
  // closing the tab / app: mark this device offline so the others stop following it at once
  window.addEventListener('pagehide', () => {
    if (!be) return
    void be.set(`devices/${device.id}`, { online: false, seenAt: Date.now() }, true).catch(() => {})
  })
}

onAccountReset(() => {
  stop()
  if (everConnected) void import('./firebase').then((m) => m.disconnect()).catch(() => {})
  // a new account starts fresh
  setChangedAt(0)
})

export function useSync(): SyncState {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.get)
}
