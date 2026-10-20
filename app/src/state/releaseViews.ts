/**
 * New Releases views (step 11): the feed as the page shows it, derived from the synced releases doc,
 * the catalogue (what's already in the library), the play history (hero pick) and this device's
 * filters. Memoised on those inputs.
 *
 * A release's status:
 *   gone  — dismissed
 *   lib   — its album (or, for a single, its song) is in the catalogue, complete: playable, never stored
 *   pre   — upcoming, but an album of that name is already in the catalogue (the singles released so
 *           far): playable, PRE-RELEASE · 4 OF 11 SONGS, reminder on by default (state/releases.ts)
 *   part  — out and in the catalogue, but with fewer songs than the MusicBrainz tracklist (INCOMPLETE)
 *   acq   — "I've got it": watching the catalogue for it (MATCHING)
 *   seen / new
 */
import { foldTitle, type RelDetail, type RelType } from '../lib/musicbrainz'
import { qualityLabel } from '../components/ui/Status'
import { albumTrackIds } from '../pages/library/playback'
import type { Play } from './history'
import { tracksByAlbum, type Artist, type Catalogue } from './library'
import { dayOf, followedExternal, inWindow, isUpcoming, nextSweepAt, setMatcher, sweepTargets, releasesStore, type DzRel, type Mark, type Rel, type ReleasePrefs, type ReleasesDoc } from './releases'
import { artistInfos } from './views'

export type RelStatus = 'new' | 'seen' | 'acq' | 'lib' | 'pre' | 'part' | 'gone'

/** In the catalogue (complete or not): playable. */
export const isOwned = (s: RelStatus) => s === 'lib' || s === 'pre' || s === 'part'

export interface Match {
  albumId: string | null
  trackIds: string[]
  /** "FLAC 16/44.1" */
  quality: string
}

export interface FeedItem {
  rel: Rel
  status: RelStatus
  /** the stored mark (status without the library match) */
  mark: Mark
  /** library artists it was found under */
  owners: Artist[]
  /** MusicBrainz id it was found under (links) */
  mbid: string
  match: Match | null
  /** songs of the release in the library / on its tracklist (total 0 = tracklist unknown) */
  have: number
  total: number
  /** found under a followed artist who isn't in the library (Discover → Follow) */
  external: boolean
  detail: RelDetail | null
  /** local midnight of the release date */
  day: number
  upcoming: boolean
  /** days until release (upcoming only) */
  daysTo: number
  reminded: boolean
  muted: boolean
  visible: boolean
}

export interface FeedGroup {
  key: 'upcoming' | 'week' | 'month' | 'older'
  label: string
  range: string
  items: FeedItem[]
}

export interface Feed {
  /** every release in the window, dismissed included */
  all: FeedItem[]
  byId: Map<string, FeedItem>
  hero: FeedItem | null
  heroLine: { desktop: string; phone: string }
  groups: FeedGroup[]
  counts: { new: number; seen: number; hidden: number }
  typeCounts: Record<RelType, number>
}

const DAY = 86_400_000
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const pad = (n: number) => String(n).padStart(2, '0')

/* ── Dates ───────────────────────────────────────────── */

/** "10 OCT 2026" · "OCT 2026" (month only) · "2027" */
export function fmtRelDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!m) return String(y)
  if (!d) return `${MONTHS[m - 1]} ${y}`
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`
}
/** "10 OCT" (this year), else as fmtRelDate */
export function fmtRelShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!m || !d) return fmtRelDate(date)
  return y === new Date().getFullYear() ? `${pad(d)} ${MONTHS[m - 1]}` : `${pad(d)} ${MONTHS[m - 1]} ${y}`
}
/** "IN 9 DAYS" · "TOMORROW" · "NOV 2026" (no exact day yet) */
export function countdown(item: Pick<FeedItem, 'rel' | 'daysTo'>, short = false): string {
  if (item.rel.date.split('-').length < 3) return fmtRelDate(item.rel.date)
  if (item.daysTo <= 1) return 'TOMORROW'
  return short ? `IN ${item.daysTo} D` : `IN ${item.daysTo} DAYS`
}
/** "14 OCT 06:12" */
export function fmtStamp(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fmtClock = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const nextSweepClock = () => fmtClock(nextSweepAt())

export function fmtLength(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${pad(h)}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/* ── Library match ───────────────────────────────────── */

const strict = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
/** Same title, ignoring case, accents, punctuation and bracketed suffixes ("(Deluxe)", "- Single"). */
const same = (a: string, b: string) => {
  const fa = foldTitle(a)
  return (fa !== '' && fa === foldTitle(b)) || strict(a) === strict(b)
}
/** A reissue / anniversary edition only matches itself, not the original album. */
const sameRelease = (libTitle: string, rel: Rel) => (rel.re ? strict(libTitle) === strict(rel.t) : same(libTitle, rel.t))

function bestQuality(c: Catalogue, ids: string[]): string {
  let bd = 0
  let sr = 0
  for (const id of ids) {
    const f = c.tracks[id]?.flac
    if ((f?.bitDepth ?? 0) > bd) bd = f!.bitDepth!
    if ((f?.sampleRate ?? 0) > sr) sr = f!.sampleRate!
  }
  return qualityLabel('flac', { bitDepth: bd || undefined, sampleRate: sr || undefined })
}

/** Is the release already in the library? Album title by one of its artists; a single also by song. */
export function matchRelease(c: Catalogue, rel: Rel, ownerIds: string[]): Match | null {
  const infos = artistInfos(c)
  for (const aid of ownerIds) {
    const album = infos.get(aid)?.albums.find((a) => sameRelease(a.title, rel))
    if (album) {
      const ids = albumTrackIds(c, album.id)
      return { albumId: album.id, trackIds: ids, quality: bestQuality(c, ids) }
    }
  }
  if (rel.type === 'single') {
    const owners = new Set(ownerIds)
    const tracks = Object.values(c.tracks).filter((t) => owners.has(t.artistId) && same(t.title, rel.t))
    if (tracks.length) {
      const ids = [tracks[0].id]
      return { albumId: tracks[0].albumId, trackIds: ids, quality: bestQuality(c, ids) }
    }
  }
  return null
}

/**
 * How much of a matched release the library has: tracklist songs found on the matched album or among
 * the owners' other tracks (total 0 while the tracklist isn't known).
 */
export function releaseProgress(c: Catalogue, match: Match, detail: RelDetail | null, ownerIds: string[]): { have: number; total: number } {
  const tl = detail?.tracks
  if (!tl?.length) return { have: match.trackIds.length, total: 0 }
  const owners = new Set(ownerIds)
  const mine = match.albumId ? (tracksByAlbum(c).get(match.albumId) ?? []) : []
  const others = Object.values(c.tracks).filter((t) => owners.has(t.artistId))
  let have = 0
  for (const [title] of tl) if (mine.some((t) => same(t.title, title)) || others.some((t) => same(t.title, title))) have++
  return { have, total: tl.length }
}

/** Status of a matched release: upcoming → pre-release; out with songs missing → incomplete. */
export function ownedStatus(upcoming: boolean, p: { have: number; total: number }): 'lib' | 'pre' | 'part' {
  if (upcoming) return 'pre'
  return p.total && p.have < p.total ? 'part' : 'lib'
}

/** MusicBrainz artist id → catalogue artist ids (importer's mbid, else the app's name lookup). */
function mbidMap(c: Catalogue, doc: ReleasesDoc): Map<string, string[]> {
  const m = new Map<string, string[]>()
  const add = (mbid: string, id: string) => {
    const list = m.get(mbid)
    if (list) list.push(id)
    else m.set(mbid, [id])
  }
  for (const a of Object.values(c.artists)) {
    const mbid = a.mbid ?? doc.resolved[a.id]?.mbid
    if (mbid) add(mbid, a.id)
  }
  // followed from Discover (not in the library): "dz:<deezer id>", resolved on MusicBrainz by name
  for (const f of followedExternal(doc)) {
    const mbid = doc.resolved[f.id]?.mbid
    if (mbid && !m.has(mbid)) add(mbid, f.id)
  }
  return m
}

/** A catalogue artist, or a followed Discover artist as a bare Artist. */
function ownerOf(c: Catalogue, doc: ReleasesDoc, id: string): Artist | undefined {
  if (c.artists[id]) return c.artists[id]
  const f = doc.follow[id]?.[0]
  return f ? { id, name: f.name, addedAt: '' } : undefined
}

// The store asks this when the catalogue changes ("acquired" → in library, incomplete → complete),
// for reminders (pre-releases are reminded by default) and for the reminder's "4 of 11 songs".
setMatcher((c, rel) => {
  const doc = releasesStore.get().doc
  const map = mbidMap(c, doc)
  const owners = Object.entries(doc.artists)
    .filter(([, e]) => e.rel.some((r) => r.id === rel.id))
    .flatMap(([mbid]) => map.get(mbid) ?? [])
  const match = matchRelease(c, rel, owners)
  if (!match) return null
  const p = releaseProgress(c, match, doc.details[rel.id] ?? null, owners)
  return { ...p, complete: !p.total || p.have >= p.total }
})

/* ── Per-track matches in the detail panel ───────────── */

export interface TrackMatch {
  /** index into the MusicBrainz tracklist */
  index: number
  trackId: string
  title: string
  album: string
}

export function trackMatches(c: Catalogue, item: FeedItem): TrackMatch[] {
  const tl = item.detail?.tracks
  if (!tl?.length) return []
  const owners = new Set(item.owners.map((a) => a.id))
  const mine = Object.values(c.tracks).filter((t) => owners.has(t.artistId))
  const out: TrackMatch[] = []
  tl.forEach(([title], index) => {
    const hit = mine.find((t) => same(t.title, title))
    if (hit) out.push({ index, trackId: hit.id, title: hit.title, album: c.albums[hit.albumId]?.title ?? '' })
  })
  return out
}

/* ── Feed ────────────────────────────────────────────── */

export function isVisible(item: Pick<FeedItem, 'status' | 'mark' | 'rel' | 'muted'>, prefs: ReleasePrefs, hideReissues: boolean): boolean {
  if (item.status === 'gone') return false
  if (item.muted) return false
  if (item.status === 'acq') return true
  // in the library: past the type filters, but a seen one still follows Show seen
  if (isOwned(item.status)) return prefs.showSeen || item.mark !== 'seen'
  if (!prefs.types[item.rel.type]) return false
  if (hideReissues && item.rel.re) return false
  return prefs.showSeen || item.status !== 'seen'
}

let playsCache: { c: Catalogue; plays: readonly Play[]; out: Map<string, number> } | null = null
function artistPlays(c: Catalogue, plays: readonly Play[]): Map<string, number> {
  if (playsCache && playsCache.c === c && playsCache.plays === plays) return playsCache.out
  const out = new Map<string, number>()
  for (const p of plays) {
    const a = c.tracks[p.trackId]?.artistId
    if (a) out.set(a, (out.get(a) ?? 0) + 1)
  }
  playsCache = { c, plays, out }
  return out
}

let feedCache: { doc: ReleasesDoc; c: Catalogue; plays: readonly Play[]; prefs: ReleasePrefs; day: number; out: Feed } | null = null

export function buildFeed(doc: ReleasesDoc, c: Catalogue, plays: readonly Play[], prefs: ReleasePrefs, now = Date.now()): Feed {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const t0 = today.getTime()
  if (feedCache && feedCache.doc === doc && feedCache.c === c && feedCache.plays === plays && feedCache.prefs === prefs && feedCache.day === t0) return feedCache.out

  const map = mbidMap(c, doc)
  const hideRe = doc.hideReissues[0]
  const items = new Map<string, FeedItem>()
  for (const [mbid, entry] of Object.entries(doc.artists)) {
    const ownerIds = map.get(mbid)
    if (!ownerIds) continue // artist no longer in the library
    for (const rel of entry.rel) {
      const prev = items.get(rel.id)
      if (prev) {
        for (const id of ownerIds) {
          const a = ownerOf(c, doc, id)
          if (a && !prev.owners.some((x) => x.id === id)) prev.owners.push(a)
        }
        continue
      }
      const owners = ownerIds.map((id) => ownerOf(c, doc, id)).filter((a): a is Artist => !!a)
      if (!owners.length) continue
      const day = dayOf(rel.date)
      const upcoming = isUpcoming(rel.date)
      items.set(rel.id, {
        rel,
        status: 'new',
        mark: 'new',
        owners,
        mbid,
        match: null,
        have: 0,
        total: 0,
        external: false,
        detail: doc.details[rel.id] ?? null,
        day,
        upcoming,
        daysTo: upcoming ? Math.max(1, Math.round((day - t0) / DAY)) : 0,
        reminded: !!doc.remind[rel.id]?.[0],
        muted: false,
        visible: false,
      })
    }
  }
  for (const it of items.values()) {
    const ids = it.owners.map((a) => a.id)
    it.muted = ids.every((id) => doc.muted[id]?.[0])
    const mark = doc.marks[it.rel.id]?.[0] ?? 'new'
    it.mark = mark
    it.external = it.owners.every((a) => !c.artists[a.id])
    it.match = mark === 'gone' ? null : matchRelease(c, it.rel, ids)
    if (it.match) {
      const p = releaseProgress(c, it.match, it.detail, ids)
      it.have = p.have
      it.total = p.total
    }
    it.status = mark === 'gone' ? 'gone' : it.match ? ownedStatus(it.upcoming, it) : mark
    it.visible = isVisible(it, prefs, hideRe)
  }
  const all = [...items.values()].sort((a, b) => b.day - a.day || a.rel.t.localeCompare(b.rel.t))

  // hero: the newest release (last 30 days) from the artist you play most
  const plays_ = artistPlays(c, plays)
  const playsOf = (it: FeedItem) => it.owners.reduce((s, a) => s + (plays_.get(a.id) ?? 0), 0)
  const recent = all.filter((it) => it.visible && !it.upcoming && it.day >= t0 - 30 * DAY)
  const ranked = [...recent].sort((a, b) => playsOf(b) - playsOf(a) || Number(b.status === 'new') - Number(a.status === 'new') || b.day - a.day)
  const hero = ranked[0] ?? null
  const heroPlays = hero ? playsOf(hero) : 0
  const heroArtist = hero ? hero.owners[0].name.toUpperCase() : ''
  const heroLine = hero
    ? heroPlays > 0
      ? { desktop: `NEWEST FROM YOUR MOST PLAYED · ${heroArtist} · ${heroPlays.toLocaleString('en-US')} PLAYS`, phone: 'NEWEST · MOST PLAYED' }
      : { desktop: `NEWEST ON THE SONAR · ${heroArtist}`, phone: 'NEWEST' }
    : { desktop: '', phone: '' }

  // time groups (the hero isn't repeated below)
  const weekStart = t0 - 6 * DAY
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const d = (ms: number) => {
    const x = new Date(ms)
    return `${pad(x.getDate())} ${MONTHS[x.getMonth()]}`
  }
  const feed = all.filter((it) => it.visible && it !== hero)
  const upcoming = feed.filter((it) => it.upcoming).sort((a, b) => a.day - b.day)
  const week = feed.filter((it) => !it.upcoming && it.day >= weekStart)
  const month = feed.filter((it) => !it.upcoming && it.day < weekStart && it.day >= monthStart)
  const older = feed.filter((it) => !it.upcoming && it.day < Math.min(weekStart, monthStart))
  const groups: FeedGroup[] = [
    { key: 'upcoming' as const, label: 'UPCOMING', range: `FROM ${d(t0 + DAY)}`, items: upcoming },
    { key: 'week' as const, label: 'THIS WEEK', range: `${d(weekStart)} – ${d(t0)}`, items: week },
    { key: 'month' as const, label: 'EARLIER THIS MONTH', range: `${d(monthStart)} – ${d(weekStart - DAY)}`, items: month },
    { key: 'older' as const, label: 'OLDER', range: `BEFORE ${monthStart < weekStart ? MONTHS[today.getMonth()] : d(weekStart)}`, items: older },
  ].filter((g) => g.items.length)

  const live = all.filter((it) => it.status !== 'gone')
  const typeCounts: Record<RelType, number> = { album: 0, ep: 0, single: 0, live: 0, other: 0 }
  for (const it of live) typeCounts[it.rel.type]++
  const out: Feed = {
    all,
    byId: items,
    hero,
    heroLine,
    groups,
    counts: {
      new: live.filter((it) => it.visible && it.status === 'new').length,
      seen: live.filter((it) => it.status === 'seen').length,
      hidden: live.filter((it) => !it.visible).length,
    },
    typeCounts,
  }
  feedCache = { doc, c, plays, prefs, day: t0, out }
  return out
}

/* ── Discover: from artists like yours ───────────────── */

export interface DiscoverItem {
  /** mark key: "dz:<deezer album id>" */
  key: string
  rel: DzRel
  /** the Discover artist */
  dz: number
  artist: string
  pic: string | null
  /** library artists it's related to (most related first) */
  because: Artist[]
  status: 'new' | 'seen' | 'gone'
  /** RelType for the type chips (Deezer "compile" → other) */
  type: RelType
  day: number
  titles: string[]
}

let discoverCache: { doc: ReleasesDoc; c: Catalogue; prefs: ReleasePrefs; out: DiscoverItem[] } | null = null

/** Discover releases, newest first, following the type chips and Show seen (dismissed ones out). */
export function buildDiscover(doc: ReleasesDoc, c: Catalogue, prefs: ReleasePrefs, now = Date.now()): DiscoverItem[] {
  if (discoverCache && discoverCache.doc === doc && discoverCache.c === c && discoverCache.prefs === prefs) return discoverCache.out
  const out: DiscoverItem[] = []
  const seenIds = new Set<number>()
  for (const [k, e] of Object.entries(doc.discover)) {
    const dz = Number(k)
    if (doc.dzMuted[k]?.[0] || doc.follow[`dz:${k}`]?.[0]) continue
    const because = e.because.map((id) => c.artists[id]).filter((a): a is Artist => !!a)
    if (!because.length) continue
    for (const rel of e.rel) {
      if (seenIds.has(rel.id) || !inWindow(rel.date, now)) continue
      seenIds.add(rel.id)
      const key = `dz:${rel.id}`
      const day = dayOf(rel.date)
      const mark = doc.marks[key]?.[0]
      const status = mark === 'gone' ? 'gone' : mark === 'seen' || mark === 'acq' ? 'seen' : day < now - 30 * DAY ? 'seen' : 'new'
      const type: RelType = rel.type === 'compile' ? 'other' : rel.type
      out.push({ key, rel, dz, artist: e.name, pic: e.pic, because, status, type, day, titles: e.titles })
    }
  }
  const shown = out
    .filter((it) => it.status !== 'gone' && prefs.types[it.type] && (prefs.showSeen || it.status !== 'seen'))
    .sort((a, b) => b.day - a.day || a.rel.t.localeCompare(b.rel.t))
  discoverCache = { doc, c, prefs, out: shown }
  return shown
}

/** "BECAUSE YOU HAVE SPIRITBOX, PERIPHERY" (+ N) */
export function becauseLine(it: DiscoverItem, max = 2): string {
  const names = it.because.slice(0, max).map((a) => a.name.toUpperCase())
  const more = it.because.length - names.length
  return `BECAUSE YOU HAVE ${names.join(', ')}${more > 0 ? ` +${more}` : ''}`
}

/* ── Followed artists ────────────────────────────────── */

export interface FollowedRow {
  artist: Artist
  mbid: string | null
  muted: boolean
  line: string
  /** followed from Discover, not in the library: its Deezer id (Unfollow) */
  dz: number | null
}

export function followedArtists(c: Catalogue, doc: ReleasesDoc): FollowedRow[] {
  return sweepTargets(c, doc).map((t) => {
    const artist = c.artists[t.artistId] ?? { id: t.artistId, name: t.name, addedAt: '' }
    const dz = t.external ? (doc.follow[t.artistId]?.[0]?.dz ?? null) : null
    const muted = !!doc.muted[t.artistId]?.[0]
    let line: string
    if (!t.mbid) line = doc.resolved[t.artistId] ? 'NOT ON MUSICBRAINZ' : 'NOT CHECKED YET'
    else {
      const e = doc.artists[t.mbid]
      if (!e) line = 'NOT CHECKED YET'
      else {
        const next = e.rel.filter((r) => isUpcoming(r.date)).sort((a, b) => a.date.localeCompare(b.date))[0]
        const last = e.rel.filter((r) => !isUpcoming(r.date)).sort((a, b) => b.date.localeCompare(a.date))[0]
        line = next ? `NEXT · ${fmtRelDate(next.date)}` : last ? `LAST · ${fmtRelDate(last.date)}` : 'QUIET · NOTHING IN 6 MONTHS'
      }
    }
    return { artist, mbid: t.mbid, muted, line, dz }
  })
}
