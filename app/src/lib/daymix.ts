/**
 * Day mix (Nov 2026): one mix that changes through the day, like Spotify's daylist. Pure functions,
 * no stores — headless-testable like lib/mixing.ts.
 *
 * Only this mix uses the time-of-day learning (Ivan's rule): the DJ and the other mixes don't.
 *
 *   dayPart()     the six parts of the day (local time) and whether it's a weekend; the mix is
 *                 rebuilt when a part starts, from the plays before that moment, so PC and phone
 *                 (same catalogue + synced history) make the same mix without syncing it
 *   slotProfile() what you play at this time: per-song weights + genre / decade weights, learned
 *                 from play timestamps (recent plays count more), smoothed with the neighbouring
 *                 parts and the other kind of day, plus soft defaults while history is thin
 *   buildDayMix() 30 songs: ~55 % familiar at this time, ~30 % rarely played songs that fit,
 *                 ~15 % hearts that fit; a title like "mellow city pop tuesday evening"
 */
import type { DjLibrary, DjTrack } from '../dj/engine'
import { flowOrder, rngFor } from './mixing'

const DAY = 86_400_000
export const DAY_MIX_ID = 'daymix'
export const DAY_MIX_SIZE = 30

/* ── Parts of the day ───────────────────────────────── */

export type PartId = 'early' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late'

/** [id, start hour, label]; night runs past midnight to 01:00 */
export const PARTS: readonly { id: PartId; from: number; to: number; label: string }[] = [
  { id: 'early', from: 5, to: 9, label: 'early morning' },
  { id: 'morning', from: 9, to: 12, label: 'morning' },
  { id: 'afternoon', from: 12, to: 17, label: 'afternoon' },
  { id: 'evening', from: 17, to: 21, label: 'evening' },
  { id: 'night', from: 21, to: 25, label: 'night' },
  { id: 'late', from: 1, to: 5, label: 'late night' },
]
const ORDER: PartId[] = ['early', 'morning', 'afternoon', 'evening', 'night', 'late']
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface DaySlot {
  part: PartId
  weekend: boolean
  /** "2026-11-07|evening": changes when the part changes */
  key: string
  /** ms: when this part started (the mix only sees plays before it) */
  start: number
  /** ms: when the next part starts (the next refresh) */
  next: number
  /** "tuesday" (the day the part started on) */
  weekday: string
  /** "evening" / "late night" */
  label: string
}

/** Which part an hour (0–23) falls in. */
export function partOfHour(h: number): PartId {
  if (h >= 1 && h < 5) return 'late'
  if (h >= 5 && h < 9) return 'early'
  if (h >= 9 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}

/** Saturday, Sunday, and Friday from 17:00 (Sunday night counts too). */
function weekendAt(d: Date, part: PartId): boolean {
  const wd = d.getDay()
  if (wd === 6 || wd === 0) return true
  return wd === 5 && (part === 'evening' || part === 'night')
}

export function dayPart(nowMs: number): DaySlot {
  const d = new Date(nowMs)
  const h = d.getHours()
  const part = partOfHour(h)
  const p = PARTS.find((x) => x.id === part)!
  const start = new Date(d)
  // night after midnight started the evening before
  if (part === 'night' && h < 1) start.setDate(start.getDate() - 1)
  start.setHours(p.from % 24, 0, 0, 0)
  const next = new Date(start)
  next.setHours(start.getHours() + (p.to - p.from), 0, 0, 0)
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}|${part}`
  return { part, weekend: weekendAt(start, part), key, start: start.getTime(), next: next.getTime(), weekday: WEEKDAYS[start.getDay()], label: p.label }
}

/** Part + kind of day of a play (Unix seconds). */
function slotOfPlay(atSec: number): { part: PartId; weekend: boolean } {
  const d = new Date(atSec * 1000)
  const part = partOfHour(d.getHours())
  // a play at 00:30 belongs to the night that started the day before
  if (part === 'night' && d.getHours() < 1) d.setDate(d.getDate() - 1)
  return { part, weekend: weekendAt(d, part) }
}

const partIndex = (p: PartId) => ORDER.indexOf(p)
/** 0 same part, 1 neighbour, 2+ further (wraps: late night ↔ early morning are neighbours) */
function partDistance(a: PartId, b: PartId): number {
  const d = Math.abs(partIndex(a) - partIndex(b))
  return Math.min(d, ORDER.length - d)
}

/* ── Defaults per part (cold start) ─────────────────── */

const SOFT = /ambient|acoustic|jazz|lo.?fi|chill|ballad|piano|classical|folk|dream|shoegaze|downtempo|singer|soul|bossa|city pop|soundtrack|post.?rock|neo.?classical/
const LOUD = /metal|hardcore|punk|deathcore|screamo|djent|thrash|grind|edm|dubstep|drum|techno|trance|hard rock|industrial/

/** How well a song suits a part with no history (0.3 … 1.6). */
function priorFit(t: DjTrack, part: PartId): number {
  const g = t.gkeys.join(' ')
  const soft = SOFT.test(g)
  const loud = LOUD.test(g)
  const bpm = t.bpm ?? 0
  switch (part) {
    case 'late':
      return (soft ? 1.5 : 1) * (loud ? 0.35 : 1) * (bpm && bpm < 105 ? 1.25 : bpm > 135 ? 0.6 : 1)
    case 'night':
      return (soft ? 1.35 : 1) * (loud ? 0.6 : 1) * (bpm && bpm < 115 ? 1.15 : 1)
    case 'early':
      return (soft ? 1.25 : 1) * (loud ? 0.6 : 1) * (bpm >= 90 && bpm <= 125 ? 1.15 : 1)
    case 'morning':
      return (loud ? 0.85 : 1) * (bpm >= 100 && bpm <= 140 ? 1.2 : 1)
    case 'afternoon':
      return bpm >= 105 ? 1.15 : 1
    case 'evening':
      return (soft ? 1.1 : 1) * (bpm >= 95 && bpm <= 130 ? 1.1 : 1)
  }
}

/* ── Slot profile ───────────────────────────────────── */

export interface SlotProfile {
  /** track id → weight of its plays at this time (decayed, smoothed) */
  songs: Map<string, number>
  /** genre key → share of this slot's listening */
  genres: Map<string, number>
  /** genre key → this slot's share ÷ the all-day share (what makes this time different) */
  lift: Map<string, number>
  /** decade (1980) → share of this slot's listening */
  decades: Map<number, number>
  decadeLift: Map<number, number>
  /** plays that count for this slot (same part + kind of day, decayed) */
  n: number
}

const HALF_LIFE = 45 * DAY

export function slotProfile(lib: DjLibrary, plays: readonly { trackId: string; at: number }[], slot: Pick<DaySlot, 'part' | 'weekend' | 'start'>): SlotProfile {
  const songs = new Map<string, number>()
  const gSlot = new Map<string, number>()
  const gAll = new Map<string, number>()
  const dSlot = new Map<number, number>()
  const dAll = new Map<number, number>()
  let n = 0
  let slotTotal = 0
  let allTotal = 0
  for (const p of plays) {
    const ms = p.at * 1000
    if (ms >= slot.start) continue
    const t = lib.byId.get(p.trackId)
    if (!t) continue
    const decay = Math.pow(0.5, (slot.start - ms) / HALF_LIFE)
    const s = slotOfPlay(p.at)
    const dist = partDistance(s.part, slot.part)
    let w = dist === 0 ? 1 : dist === 1 ? 0.35 : 0
    if (s.weekend !== slot.weekend) w *= dist === 0 ? 0.3 : 0.15
    if (dist === 0 && s.weekend === slot.weekend) n += decay
    const sw = w * decay
    if (sw > 0) {
      songs.set(t.id, (songs.get(t.id) ?? 0) + sw)
      slotTotal += sw
      for (const k of t.gkeys) gSlot.set(k, (gSlot.get(k) ?? 0) + sw / t.gkeys.length)
      if (t.year) dSlot.set(dec(t.year), (dSlot.get(dec(t.year)) ?? 0) + sw)
    }
    allTotal += decay
    for (const k of t.gkeys) gAll.set(k, (gAll.get(k) ?? 0) + decay / t.gkeys.length)
    if (t.year) dAll.set(dec(t.year), (dAll.get(dec(t.year)) ?? 0) + decay)
  }
  const genres = new Map<string, number>()
  const lift = new Map<string, number>()
  for (const [k, v] of gSlot) {
    const share = v / slotTotal
    genres.set(k, share)
    lift.set(k, (share + 0.01) / ((gAll.get(k) ?? 0) / Math.max(allTotal, 1e-9) + 0.01))
  }
  const decades = new Map<number, number>()
  const decadeLift = new Map<number, number>()
  for (const [k, v] of dSlot) {
    const share = v / slotTotal
    decades.set(k, share)
    decadeLift.set(k, (share + 0.01) / ((dAll.get(k) ?? 0) / Math.max(allTotal, 1e-9) + 0.01))
  }
  return { songs, genres, lift, decades, decadeLift, n }
}

const dec = (y: number) => Math.floor(y / 10) * 10

/* ── Building the mix ───────────────────────────────── */

export interface DayMixInput {
  /** built with the plays before `slot.start` and now = slot.start */
  lib: DjLibrary
  plays: readonly { trackId: string; at: number }[]
  slot: DaySlot
  /** songs hidden from the Day mix (for this part) */
  hidden?: ReadonlySet<string>
  size?: number
}

export interface DayMixPlan {
  id: typeof DAY_MIX_ID
  slot: DaySlot
  /** "mellow city pop tuesday evening" */
  phrase: string
  mood: string
  /** the genre / decade words in the phrase (display), e.g. ["city pop", "80s"] */
  tags: { label: string; genre?: string; decade?: number }[]
  /** "What you usually play on weekday evenings: city pop, 80s, Yorushika and more." */
  why: string
  trackIds: string[]
  newCount: number
  /** how much it knows about this time: 'none' (defaults), 'some', 'good' */
  confidence: 'none' | 'some' | 'good'
}

interface Caps {
  album: number
  artist: number
}

function pick(pool: DjTrack[], size: number, score: (t: DjTrack) => number, caps: Caps, have: Set<string>, albums: Map<string, number>, artists: Map<string, number>): DjTrack[] {
  const out: DjTrack[] = []
  const scored = pool
    .filter((t) => !have.has(t.id))
    .map((t) => ({ t, s: score(t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
  for (const step of [caps, { album: caps.album + 1, artist: caps.artist + 2 }]) {
    for (const { t } of scored) {
      if (out.length >= size) return out
      if (have.has(t.id)) continue
      if ((albums.get(t.albumId) ?? 0) >= step.album || (artists.get(t.artistId) ?? 0) >= step.artist) continue
      out.push(t)
      have.add(t.id)
      albums.set(t.albumId, (albums.get(t.albumId) ?? 0) + 1)
      artists.set(t.artistId, (artists.get(t.artistId) ?? 0) + 1)
    }
  }
  return out
}

/** How well a song's genres / decade match the slot (0 … ~2), blended with the part's defaults. */
function tagFit(t: DjTrack, prof: SlotProfile, part: PartId, trust: number): number {
  let g = 0
  for (const k of t.gkeys) g = Math.max(g, (prof.genres.get(k) ?? 0) * Math.min(2.5, prof.lift.get(k) ?? 1))
  const d = t.year ? (prof.decades.get(dec(t.year)) ?? 0) : 0
  const learned = Math.min(1.6, g * 3 + d * 0.8)
  return trust * learned + (1 - trust) * 0.5 * priorFit(t, part) + 0.05
}

const MOODS: Record<PartId, [string, string, string, string]> = {
  // slow … fast
  early: ['slow', 'soft', 'easy', 'bright'],
  morning: ['easy', 'fresh', 'bright', 'upbeat'],
  afternoon: ['lazy', 'sunny', 'upbeat', 'loud'],
  evening: ['mellow', 'warm', 'golden', 'loud'],
  night: ['moody', 'mellow', 'electric', 'loud'],
  late: ['hazy', 'quiet', 'dreamy', 'restless'],
}

function moodOf(songs: DjTrack[], part: PartId): string {
  const bpms = songs.map((t) => t.bpm).filter((b): b is number => !!b)
  const loud = songs.filter((t) => LOUD.test(t.gkeys.join(' '))).length / Math.max(1, songs.length)
  const soft = songs.filter((t) => SOFT.test(t.gkeys.join(' '))).length / Math.max(1, songs.length)
  let band: number
  if (bpms.length >= songs.length / 3) {
    const avg = bpms.reduce((a, b) => a + b, 0) / bpms.length
    band = avg < 98 ? 0 : avg < 116 ? 1 : avg < 134 ? 2 : 3
  } else band = soft > 0.4 ? 0 : loud > 0.4 ? 3 : 1
  if (loud > 0.5) band = 3
  if (soft > 0.5) band = Math.min(band, 1)
  return MOODS[part][band]
}

const cap = (s: string) => s.toLowerCase()

export function buildDayMix(input: DayMixInput): DayMixPlan {
  const { lib, slot } = input
  const size = input.size ?? DAY_MIX_SIZE
  const rng = rngFor(slot.key, DAY_MIX_ID)
  const prof = slotProfile(lib, input.plays, slot)
  const trust = prof.n / (prof.n + 25)
  const hidden = input.hidden ?? new Set<string>()
  const recentCut = slot.start - 2 * DAY
  const ok = (t: DjTrack) => !hidden.has(t.id) && !(t.last > recentCut)
  const jitter = () => 0.6 + rng() * 0.8
  const pen = (t: DjTrack) => (t.penalty ? 0.3 : 1)

  const have = new Set<string>()
  const albums = new Map<string, number>()
  const artists = new Map<string, number>()
  const caps = { album: 2, artist: 3 }

  const pool = lib.tracks.filter(ok)
  const familiar = pool.filter((t) => (prof.songs.get(t.id) ?? 0) > 0)
  const nFam = Math.round(size * 0.55)
  const nLiked = Math.round(size * 0.15)
  const famPicked = pick(familiar, nFam, (t) => Math.sqrt(prof.songs.get(t.id)!) * tagFit(t, prof, slot.part, trust) * jitter() * pen(t), caps, have, albums, artists)
  const liked = pool.filter((t) => t.liked > 0)
  const likedPicked = pick(liked, nLiked, (t) => tagFit(t, prof, slot.part, trust) * jitter() * pen(t), caps, have, albums, artists)
  const rare = pool.filter((t) => t.plays <= 1)
  const fitPicked = pick(rare, size - famPicked.length - likedPicked.length, (t) => tagFit(t, prof, slot.part, trust) * jitter() * pen(t), caps, have, albums, artists)
  let songs = [...famPicked, ...likedPicked, ...fitPicked]
  // short (small library / everything heard in the last two days): anything that fits
  if (songs.length < size) songs.push(...pick(lib.tracks.filter((t) => !hidden.has(t.id)), size - songs.length, (t) => tagFit(t, prof, slot.part, trust) * jitter(), { album: 3, artist: 5 }, have, albums, artists))
  songs = flowOrder(songs, rng)

  // words for the title: the most "this time of day" genres among the picks, maybe a decade
  const count = new Map<string, number>()
  for (const t of songs) for (const k of t.gkeys) count.set(k, (count.get(k) ?? 0) + 1)
  const ranked = [...count]
    .filter(([, c]) => c >= Math.max(2, songs.length * 0.12))
    .map(([k, c]) => ({ k, s: (c / songs.length) * (trust > 0.15 ? Math.min(3, prof.lift.get(k) ?? 1) : 1) }))
    .sort((a, b) => b.s - a.s)
  const tags: DayMixPlan['tags'] = []
  for (const { k } of ranked) {
    if (tags.length >= 2) break
    const name = lib.genreByKey.get(k)?.name ?? songs.find((t) => t.gkeys.includes(k))?.genres[t_index(songs, k)] ?? k
    if (tags.some((x) => x.label === cap(name))) continue
    tags.push({ label: cap(name), genre: k })
  }
  const dcount = new Map<number, number>()
  for (const t of songs) if (t.year) dcount.set(dec(t.year), (dcount.get(dec(t.year)) ?? 0) + 1)
  const topDec = [...dcount].sort((a, b) => b[1] - a[1])[0]
  if (topDec && topDec[1] >= songs.length * 0.4 && tags.length < 2) tags.push({ label: `${String(topDec[0]).slice(2)}s`, decade: topDec[0] })

  const mood = moodOf(songs, slot.part)
  const when = `${slot.weekday} ${slot.label}`
  const phrase = [mood, tags.map((t) => t.label).join(' & '), when].filter(Boolean).join(' ')
  const artistsLine = topArtistNames(songs, 1)
  const kindOfDay = slot.weekend ? 'weekend' : 'weekday'
  const what = [...tags.map((t) => t.label), ...artistsLine].join(', ')
  const why =
    trust >= 0.15
      ? `What you usually play on ${kindOfDay} ${pluralPart(slot.label)}${what ? `: ${what} and more` : ''}.`
      : `Songs that suit a ${slot.label}. It learns what you play at this time as you listen.`
  return {
    id: DAY_MIX_ID,
    slot,
    phrase,
    mood,
    tags,
    why,
    trackIds: songs.map((t) => t.id),
    newCount: songs.filter((t) => t.plays === 0).length,
    confidence: trust < 0.15 ? 'none' : trust < 0.5 ? 'some' : 'good',
  }
}

function t_index(songs: DjTrack[], k: string): number {
  const t = songs.find((x) => x.gkeys.includes(k))
  return t ? t.gkeys.indexOf(k) : 0
}

function topArtistNames(songs: DjTrack[], n: number): string[] {
  const m = new Map<string, { n: number; name: string }>()
  for (const t of songs) {
    const e = m.get(t.artistId)
    if (e) e.n++
    else m.set(t.artistId, { n: 1, name: t.artist })
  }
  return [...m.values()]
    .filter((e) => e.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, n)
    .map((e) => e.name)
}

const pluralPart = (label: string) => (label === 'early morning' ? 'early mornings' : label === 'late night' ? 'late nights' : `${label}s`)
