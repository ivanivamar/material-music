/**
 * Discovery mix (Nov 2026): ~30 songs you don't have, played as 30 s previews. Refreshes every
 * Monday at 06:00.
 *
 *   ~40 % gaps   popular songs (Deezer top tracks) of the artists you play most that aren't in the
 *                library — "From Yorushika · not in your library"
 *   ~60 % new    artists related to several of your top artists (Deezer related, the radio's cache),
 *                plus artists followed from New releases → Discover; 1–2 songs each —
 *                "New to you · like A and B"
 *
 * Left out: songs you have (title match per artist, any script), live / remix / karaoke /
 * instrumental versions, anything shown in the last 4 weeks, artists marked Not for me (the same
 * list as Discover's "Not interested"), songs without a preview.
 *
 * The first device to open Home after the refresh builds it and writes it to Firestore
 * `state/discovery`; the other device reads that, so both have the same 30 songs. The Wishlist
 * ("Want it") is `state/wishlist`, merged per song by time; a song leaves it on its own once a
 * song with the same artist + title shows up in the library.
 *
 * Plays of previews never count (state/previews.ts).
 */
import { useSyncExternalStore } from 'react'
import { fetchDzTop, inLibrary, relatedLoaded, relatedRaw, requestRelated, type DzTopTrack } from '../lib/deezer'
import { idbGet, idbSet } from '../lib/idb'
import { hash, rngFor, type MixPlan } from '../lib/mixing'
import { whenCloud, onCloud, withTimeout, cloudFailed } from '../sync/cloud'
import type { SyncBackend } from '../sync/firebase'
import { historyStore } from './history'
import { libraryStore, type Catalogue } from './library'
import { likedIndex } from './likes'
import { playerStore } from './player'
import { isPreviewId, loadPreviews, previewId, previewsStore, refreshPreviews, type PreviewInfo } from './previews'
import { releasesStore } from './releases'
import { onAccountReset, sessionStore } from './session'

const DAY = 86_400_000
export const DISC_ID = 'discovery'
export const DISC_SIZE = 30
const GAP_SHARE = 0.4
const GAP_ARTISTS = 7
const SEED_ARTISTS = 10
const NEW_ARTISTS = 14
const SHOWN_WEEKS = 4
const VERSION = /\b(live|remix|remixed|karaoke|instrumental|acapella|a cappella|off vocal|inst\.?|demo|ver\.?|version|edit|mix)\b|（.*?(ver|inst|live|remix).*?）/i
const VARIOUS = /^(various artists?|va|soundtrack|unknown artist)$/i

/* ── Week ───────────────────────────────────────────── */

export interface DiscWeek {
  /** "2026-11-09" (the Monday) */
  key: string
  start: number
  next: number
}

/** Discovery weeks start on Monday 06:00 local time. */
export function discWeek(nowMs: number): DiscWeek {
  const d = new Date(nowMs)
  const dow = (d.getDay() + 6) % 7 // Monday 0
  d.setDate(d.getDate() - dow)
  d.setHours(6, 0, 0, 0)
  if (d.getTime() > nowMs) d.setDate(d.getDate() - 7)
  const next = new Date(d)
  next.setDate(next.getDate() + 7)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { key, start: d.getTime(), next: next.getTime() }
}

/* ── Docs ───────────────────────────────────────────── */

interface DiscDoc {
  week: string
  builtAt: number
  tracks: PreviewInfo[]
  /** Deezer track id → the week it was in (kept 8 weeks) */
  shown?: Record<string, string>
}

type WishEntry = Omit<PreviewInfo, 'url' | 'urlAt'> & { at: number }
interface WishDoc {
  /** Deezer track id → [entry | null (removed), stamp ms] */
  items: Record<string, [WishEntry | null, number]>
}

export interface DiscoveryState {
  doc: DiscDoc | null
  wish: WishDoc
  /** building this week's mix right now */
  building: boolean
  /** why there's nothing (offline, proxy down…) */
  error: string | null
  loaded: boolean
}

let state: DiscoveryState = { doc: null, wish: { items: {} }, building: false, error: null, loaded: false }
const listeners = new Set<() => void>()
function set(p: Partial<DiscoveryState>) {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

const CACHE = 'discovery'
const WISH_CACHE = 'wishlist'

function strip(p: PreviewInfo): PreviewInfo {
  return { ...p, url: null, urlAt: 0 }
}

function mergeWish(a: WishDoc, b: WishDoc): WishDoc {
  const items = { ...a.items }
  for (const [k, v] of Object.entries(b.items ?? {})) if (!items[k] || v[1] > items[k][1]) items[k] = v
  return { items }
}

let loading: Promise<void> | null = null
function load(): Promise<void> {
  loading ??= (async () => {
    await loadPreviews()
    const [doc, wish] = await Promise.all([idbGet<DiscDoc>('kv', CACHE).catch(() => null), idbGet<WishDoc>('kv', WISH_CACHE).catch(() => null)])
    if (doc && Array.isArray(doc.tracks)) {
      previewsStore.put(doc.tracks)
      set({ doc })
    }
    if (wish?.items) {
      set({ wish: mergeWish(state.wish, wish) })
      previewsStore.put(wishList().map(fromWish))
    }
    set({ loaded: true })
  })()
  return loading
}

const fromWish = (w: WishEntry): PreviewInfo => ({ ...w, url: null, urlAt: 0 })

function adoptDoc(doc: DiscDoc) {
  if (!doc || !Array.isArray(doc.tracks)) return
  if (state.doc && state.doc.week === doc.week && state.doc.builtAt === doc.builtAt) return
  previewsStore.put(doc.tracks)
  keepRegistry(doc)
  set({ doc })
  void idbSet('kv', CACHE, doc)
}

/** The registry keeps this week's songs, the wishlist, and whatever is in the queue. */
function keepRegistry(doc: DiscDoc | null) {
  const keep = new Set<string>()
  for (const t of doc?.tracks ?? []) keep.add(previewId(t.dz))
  for (const w of wishList()) keep.add(previewId(w.dz))
  for (const id of playerStore.get().queue) if (isPreviewId(id)) keep.add(id)
  previewsStore.keepOnly(keep)
}

/* ── Cloud ──────────────────────────────────────────── */

let attached = false
function attach() {
  if (attached) return
  attached = true
  // Follow / Not for me live in the releases doc: re-render on its changes
  releasesStore.subscribe(() => set({}))
  onCloud((b: SyncBackend) => {
    const u1 = b.watchAt<DiscDoc>(
      'state/discovery',
      (doc) => {
        if (doc && doc.week >= (state.doc?.week ?? '')) adoptDoc(doc)
      },
      (e) => cloudFailed(e),
    )
    const u2 = b.watchAt<WishDoc>(
      'state/wishlist',
      (doc) => {
        if (!doc?.items) return
        const merged = mergeWish(state.wish, doc)
        set({ wish: merged })
        previewsStore.put(wishList().map(fromWish))
        void idbSet('kv', WISH_CACHE, merged)
      },
      (e) => cloudFailed(e),
    )
    return () => {
      u1()
      u2()
    }
  })
}

async function saveWish(changed: Record<string, [WishEntry | null, number]>) {
  void idbSet('kv', WISH_CACHE, state.wish)
  const b = await whenCloud()
  if (!b) return
  try {
    await withTimeout(b.update<WishDoc>('state/wishlist', (cur) => mergeWish({ items: cur?.items ?? {} }, { items: changed })))
  } catch (e) {
    cloudFailed(e as Error)
  }
}

/* ── Building a week ────────────────────────────────── */

/** Folded title for "do I have this song?" (any script; drops brackets, feat., punctuation). */
export const foldTitle = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, '')
    .replace(/\s+[-–]\s+.*$/, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
const foldName = (s: string) => foldTitle(s)

/** Library artist id → weight (plays in 90 days + hearts × 3); the ones you play most first. */
function artistWeights(c: Catalogue, now: number): { id: string; w: number }[] {
  const w = new Map<string, number>()
  const since = (now - 90 * DAY) / 1000
  const artistOf = (trackId: string) => {
    const t = c.tracks[trackId]
    return t ? (c.albums[t.albumId]?.artistId ?? t.artistId) : null
  }
  for (const p of historyStore.get().plays) {
    if (p.at < since) continue
    const a = artistOf(p.trackId)
    if (a) w.set(a, (w.get(a) ?? 0) + 1)
  }
  for (const id of likedIndex().ids) {
    const a = artistOf(id)
    if (a) w.set(a, (w.get(a) ?? 0) + 3)
  }
  // no history yet: the artists with the most albums
  if (w.size < 4)
    for (const al of Object.values(c.albums)) w.set(al.artistId, (w.get(al.artistId) ?? 0) + 0.01)
  return [...w]
    .filter(([id]) => c.artists[id] && !VARIOUS.test(c.artists[id].name.trim()))
    .sort((a, b) => b[1] - a[1])
    .map(([id, w]) => ({ id, w }))
}

function ownedTitles(c: Catalogue): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const t of Object.values(c.tracks)) {
    const k = foldName(t.artist)
    let s = m.get(k)
    if (!s) m.set(k, (s = new Set()))
    s.add(foldTitle(t.title))
    const al = c.albums[t.albumId]
    if (al && foldName(al.artist) !== k) {
      const k2 = foldName(al.artist)
      let s2 = m.get(k2)
      if (!s2) m.set(k2, (s2 = new Set()))
      s2.add(foldTitle(t.title))
    }
  }
  return m
}

const toInfo = (t: DzTopTrack, kind: PreviewInfo['kind'], because: string[], libArtistId?: string): PreviewInfo => ({
  dz: t.id,
  title: t.t,
  artist: t.ar.n,
  artistDz: t.ar.id,
  album: t.al.t,
  albumDz: t.al.id,
  cover: t.al.c,
  url: t.p,
  urlAt: Date.now(),
  kind,
  because,
  libArtistId,
  link: t.link,
  duration: 30,
})

/** A few requests at a time (the proxy → Deezer allows ~50 per 5 s). */
async function inBatches<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))))
  return out
}

export async function buildWeek(c: Catalogue, week: DiscWeek, prev: DiscDoc | null): Promise<DiscDoc> {
  const rng = rngFor(week.key, DISC_ID)
  const releases = releasesStore.get().doc
  const shown = new Map<string, string>()
  const cutoff = new Date(week.start - SHOWN_WEEKS * 7 * DAY).toISOString().slice(0, 10)
  for (const [k, wk] of Object.entries(prev?.shown ?? {})) if (wk >= new Date(week.start - 8 * 7 * DAY).toISOString().slice(0, 10)) shown.set(k, wk)
  const recentlyShown = (dz: number) => (shown.get(String(dz)) ?? '') > cutoff
  const muted = (dz: number) => !!releases.dzMuted[String(dz)]?.[0]
  const wished = new Set(wishList().map((w) => w.dz))
  const owned = ownedTitles(c)
  const haveSong = (artist: string, title: string) => owned.get(foldName(artist))?.has(foldTitle(title)) ?? false
  const usable = (t: DzTopTrack) => !!t.p && !VERSION.test(t.t) && !recentlyShown(t.id) && !wished.has(t.id) && !haveSong(t.ar.n, t.t)

  const top = artistWeights(c, week.start)
  const nGap = Math.round(DISC_SIZE * GAP_SHARE)

  /* gaps: the artists you play most */
  const gapArtists = top.slice(0, GAP_ARTISTS)
  const gapLists = await inBatches(gapArtists, 3, async ({ id }) => {
    const a = c.artists[id]
    const titles = Object.values(c.albums)
      .filter((al) => al.artistId === id)
      .map((al) => al.title)
    try {
      const r = await fetchDzTop({ id: a.deezerId, name: a.name, titles, limit: 50 })
      return { id, name: a.name, tracks: (r?.tracks ?? []).filter((t) => usable(t) && (t.ar.id === r?.id || foldName(t.ar.n) === foldName(a.name))) }
    } catch {
      return { id, name: a.name, tracks: [] as DzTopTrack[] }
    }
  })
  const gaps: PreviewInfo[] = []
  for (let round = 0; round < 3 && gaps.length < nGap; round++)
    for (const g of gapLists) {
      if (gaps.length >= nGap) break
      // popular first, with a little chance so it isn't always the same hit
      const pickIdx = g.tracks.findIndex((_, i) => rng() < 0.55 || i === g.tracks.length - 1)
      if (pickIdx < 0) continue
      const [t] = g.tracks.splice(pickIdx, 1)
      gaps.push(toInfo(t, 'gap', [g.name], g.id))
    }

  /* new: related to several of your top artists (+ followed from Discover) */
  await relatedLoaded()
  const seeds = top.slice(0, SEED_ARTISTS)
  await inBatches(seeds, 3, ({ id }) => requestRelated(c, id).catch(() => false))
  const cands = new Map<number, { id: number; name: string; score: number; because: string[] }>()
  seeds.forEach(({ id, w }, si) => {
    const raw = relatedRaw(id)
    if (!raw) return
    const seedW = 1 + Math.log1p(w) * 0.25 - si * 0.03
    raw.slice(0, 25).forEach((a, i) => {
      if (inLibrary(c, a) || muted(a.id) || VARIOUS.test(a.name)) return
      const e = cands.get(a.id) ?? { id: a.id, name: a.name, score: 0, because: [] }
      e.score += (1 - i / 25) * seedW
      const name = c.artists[id].name
      if (!e.because.includes(name)) e.because.push(name)
      cands.set(a.id, e)
    })
  })
  for (const [k, [f]] of Object.entries(releases.follow)) {
    if (!f || !k.startsWith('dz:') || muted(f.dz) || inLibrary(c, { id: f.dz, name: f.name })) continue
    const e = cands.get(f.dz) ?? { id: f.dz, name: f.name, score: 0, because: [] }
    e.score += 1.2
    cands.set(f.dz, e)
  }
  const ranked = [...cands.values()]
    .map((e) => ({ ...e, s: e.score * (1 + 0.6 * (e.because.length - 1)) * (0.75 + rng() * 0.5) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, NEW_ARTISTS + 4)
  const newLists = await inBatches(ranked, 3, async (a) => {
    try {
      const r = await fetchDzTop({ id: a.id, limit: 10 })
      return { a, tracks: (r?.tracks ?? []).filter((t) => usable(t) && t.ar.id === a.id) }
    } catch {
      return { a, tracks: [] as DzTopTrack[] }
    }
  })
  const fresh: PreviewInfo[] = []
  const nNew = DISC_SIZE - gaps.length
  for (let round = 0; round < 2 && fresh.length < nNew; round++)
    for (const { a, tracks } of newLists) {
      if (fresh.length >= nNew) break
      if (round === 1 && a.because.length < 2 && fresh.length >= nNew * 0.8) continue
      const t = tracks.shift()
      if (t) fresh.push(toInfo(t, 'new', a.because.slice(0, 2)))
    }

  /* order: alternate, never the same artist back to back, a new artist first */
  const out: PreviewInfo[] = []
  const qa = [...fresh]
  const qb = [...gaps]
  while (qa.length || qb.length) {
    const wantNew = qa.length && (!qb.length || out.length % 5 !== 1)
    const q = wantNew ? qa : qb
    const last = out[out.length - 1]
    let i = q.findIndex((x) => !last || x.artistDz !== last.artistDz)
    if (i < 0) i = 0
    out.push(q.splice(i, 1)[0])
  }
  for (const t of out) shown.set(String(t.dz), week.key)
  return { week: week.key, builtAt: Date.now(), tracks: out, shown: Object.fromEntries(shown) }
}

let building: Promise<void> | null = null

/** Make sure this week's mix exists (cloud copy, else build it here). Safe to call often. */
export function ensureDiscovery(nowMs = Date.now()): Promise<void> {
  attach()
  if (building) return building
  building = (async () => {
    await load()
    const week = discWeek(nowMs)
    if (state.doc?.week === week.key) return
    const c = libraryStore.get().data
    if (!c || sessionStore.get().status !== 'signed-in') return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return set({ error: 'offline' })
    set({ building: true, error: null })
    try {
      const b = await whenCloud()
      const cloud = b ? await withTimeout(b.read<DiscDoc>('state/discovery')).catch(() => null) : null
      if (cloud?.week === week.key) return adoptDoc(cloud)
      const doc = await buildWeek(c, week, cloud ?? state.doc)
      if (doc.tracks.length < 8) {
        set({ error: 'empty' })
        return
      }
      const stored = { ...doc, tracks: doc.tracks.map(strip) }
      // another device may have built it meanwhile: keep theirs
      const saved = b ? await withTimeout(b.update<DiscDoc>('state/discovery', (cur) => (cur?.week === week.key ? null : stored))).catch(() => null) : null
      previewsStore.put(doc.tracks)
      adoptDoc(saved && saved.week === week.key ? saved : stored)
    } catch (e) {
      set({ error: (e as Error).message || 'failed' })
    } finally {
      set({ building: false })
    }
  })().finally(() => {
    building = null
  })
  return building
}

/* ── The mix as a MixPlan ───────────────────────────── */

export interface DiscoveryMix extends MixPlan {
  kind: 'disc'
  week: DiscWeek
  tracks: PreviewInfo[]
}

let planMemo: { doc: DiscDoc; plan: DiscoveryMix } | null = null

export function discoveryMix(nowMs = Date.now()): DiscoveryMix | null {
  const doc = state.doc
  const week = discWeek(nowMs)
  if (!doc || doc.week !== week.key || !doc.tracks.length) return null
  if (planMemo?.doc === doc) return planMemo.plan
  const gaps = doc.tracks.filter((t) => t.kind === 'gap').length
  const names = [...new Set(doc.tracks.filter((t) => t.kind === 'new').map((t) => t.artist))].slice(0, 3)
  const plan: DiscoveryMix = {
    id: DISC_ID,
    kind: 'disc',
    title: 'Discovery',
    sub: names.length ? `New to you: ${names.join(', ')}…` : 'Fresh this week · previews',
    why: `Songs you don't have: ${gaps ? `${gaps} from artists you play, ` : ''}${doc.tracks.length - gaps} from artists you might like. 30-second previews.`,
    hue: hash(doc.week) % 360,
    coverAlbums: [],
    trackIds: doc.tracks.map((t) => previewId(t.dz)),
    newCount: doc.tracks.length,
    week,
    tracks: doc.tracks,
  }
  planMemo = { doc, plan }
  return plan
}

/** Play the week's previews (fresh URLs first). */
export async function playDiscovery(m: DiscoveryMix, opts: { shuffle?: boolean; startId?: string; only?: string[] } = {}) {
  const ids = opts.only ?? m.trackIds
  if (!ids.length) return false
  try {
    await refreshPreviews(ids)
  } catch {
    /* offline: the URLs we have may still work */
  }
  const start = opts.startId ? Math.max(0, ids.indexOf(opts.startId)) : opts.shuffle ? Math.floor(Math.random() * ids.length) : 0
  playerStore.playQueue(ids, start, { kind: 'mix', id: DISC_ID, label: 'Discovery' }, { shuffle: opts.shuffle })
  return true
}

/* ── Wishlist / feedback ────────────────────────────── */

export function wishList(): WishEntry[] {
  return Object.values(state.wish.items)
    .map(([e]) => e)
    .filter((e): e is WishEntry => !!e)
    .sort((a, b) => b.at - a.at)
}
export const isWished = (dz: number) => !!state.wish.items[String(dz)]?.[0]

export function setWished(p: PreviewInfo, on: boolean) {
  const now = Date.now()
  const { url: _u, urlAt: _a, ...rest } = p
  const entry: [WishEntry | null, number] = [on ? { ...rest, at: now } : null, now]
  set({ wish: { items: { ...state.wish.items, [String(p.dz)]: entry } } })
  void saveWish({ [String(p.dz)]: entry })
}

/** A wished song that is now in the library leaves the list by itself. */
export function pruneWishlist(c: Catalogue) {
  const owned = ownedTitles(c)
  const changed: Record<string, [WishEntry | null, number]> = {}
  for (const w of wishList()) if (owned.get(foldName(w.artist))?.has(foldTitle(w.title))) changed[String(w.dz)] = [null, Date.now()]
  if (!Object.keys(changed).length) return
  set({ wish: { items: { ...state.wish.items, ...changed } } })
  void saveWish(changed)
}

export const isFollowed = (dz: number) => !!releasesStore.get().doc.follow[`dz:${dz}`]?.[0]
export function setFollowed(p: PreviewInfo, on: boolean) {
  releasesStore.follow(p.artistDz, on ? { name: p.artist, dz: p.artistDz, titles: p.album ? [p.album] : [] } : null)
}
/** Not for me: the artist leaves Discovery (and Discover in New releases). */
export function setNotForMe(p: PreviewInfo, on: boolean) {
  releasesStore.setDzMuted(p.artistDz, on)
  if (on && state.doc) {
    const drop = new Set(state.doc.tracks.filter((t) => t.artistDz === p.artistDz).map((t) => previewId(t.dz)))
    const cur = playerStore.get().queue[playerStore.get().index]
    playerStore.dropTracks(new Set([...drop].filter((id) => id !== cur)))
  }
}
export const isNotForMe = (artistDz: number) => !!releasesStore.get().doc.dzMuted[String(artistDz)]?.[0]

/* ── Store / hooks ──────────────────────────────────── */

export const discoveryStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useDiscovery(): DiscoveryState {
  return useSyncExternalStore(
    (l) => {
      void load()
      attach()
      return discoveryStore.subscribe(l)
    },
    () => state,
    () => state,
  )
}

/** Start-up: load the cache, follow the cloud copy, prune the wishlist when the library changes. */
export function initDiscovery() {
  void load()
  attach()
  let lastC: Catalogue | null = null
  libraryStore.subscribe(() => {
    const c = libraryStore.get().data
    if (c && c !== lastC) {
      lastC = c
      void load().then(() => pruneWishlist(c))
    }
  })
}

onAccountReset(() => {
  state = { doc: null, wish: { items: {} }, building: false, error: null, loaded: false }
  loading = null
  planMemo = null
  listeners.forEach((l) => l())
})
