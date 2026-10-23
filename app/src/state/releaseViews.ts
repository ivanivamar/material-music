/**
 * New Releases views (step 11, pass 2 = step 35): the feed as the page shows it, derived from the
 * synced releases doc, the catalogue (what's already in the library), the play history (hero pick,
 * Discover) and this device's filters. Memoised on those inputs. Tabs: Upcoming (a weekly timeline),
 * Out now (hero + groups), Discover (artists related to your most played). A release that's complete
 * in the library is never shown.
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
import { foldTitle, type RelDetail } from '../lib/musicbrainz'
import { qualityLabel } from '../components/ui/Status'
import { albumTrackIds } from '../pages/library/playback'
import type { Play } from './history'
import { tracksByAlbum, type Artist, type Catalogue } from './library'
import { SHOWN_TYPES, dayOf, followedExternal, isUpcoming, nextSweepAt, setMatcher, sweepTargets, releasesStore, type Mark, type Rel, type ReleasePrefs, type ReleasesDoc } from './releases'
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
  key: 'week' | 'month' | 'older'
  label: string
  range: string
  items: FeedItem[]
}

/** One week (or month) of the Upcoming timeline. */
export interface UpWeek {
  key: string
  label: string
  range: string
  items: FeedItem[]
}

export interface ArtistOpt {
  id: string
  name: string
  plays: number
}

export interface Feed {
  /** every release in the window, dismissed included */
  all: FeedItem[]
  byId: Map<string, FeedItem>
  /** Out now only */
  hero: FeedItem | null
  heroLine: { desktop: string; phone: string }
  /** Out now groups, after the filters (hero excluded) */
  groups: FeedGroup[]
  /** Upcoming timeline, after the filters */
  weeks: UpWeek[]
  /** the sidebar / tab badge: Out now releases still marked new */
  counts: { new: number }
  /** tab counts: visible upcoming · Out now new */
  tabs: { up: number; out: number }
  /** Out now status filter counts (after the artist filter) */
  status: { all: number; new: number; seen: number }
  /** "n UPCOMING · n REMINDERS" */
  upLine: { upcoming: number; reminders: number }
  /** artists with a release on either tab, most played first */
  artistOpts: ArtistOpt[]
  /** Out now releases passing the filters (hero included) */
  outShown: number
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

/** In the feed unless dismissed, muted, complete in the library, or filtered out by type / reissue. */
export function isVisible(item: Pick<FeedItem, 'status' | 'rel' | 'muted'>, hideReissues: boolean): boolean {
  if (item.status === 'gone' || item.status === 'lib') return false // in the library: never on this page
  if (item.muted) return false
  if (item.status === 'acq' || item.status === 'pre' || item.status === 'part') return true
  if (!SHOWN_TYPES[item.rel.type]) return false
  return !(hideReissues && item.rel.re)
}

/** Seen by the user (a release that's partly in the library follows its stored mark). */
const isSeen = (it: Pick<FeedItem, 'status' | 'mark'>) => it.status === 'seen' || (isOwned(it.status) && it.mark === 'seen')

let playsCache: { c: Catalogue; plays: readonly Play[]; out: Map<string, number> } | null = null
export function artistPlays(c: Catalogue, plays: readonly Play[]): Map<string, number> {
  if (playsCache && playsCache.c === c && playsCache.plays === plays) return playsCache.out
  const out = new Map<string, number>()
  for (const p of plays) {
    const a = c.tracks[p.trackId]?.artistId
    if (a) out.set(a, (out.get(a) ?? 0) + 1)
  }
  playsCache = { c, plays, out }
  return out
}

/** How many of the most played artists Discover is based on. */
export const TOP_ARTISTS = 5

/** The artists you play most (with at least one play), most played first. */
export function topPlayedArtists(c: Catalogue, plays: readonly Play[], n = TOP_ARTISTS): { artist: Artist; plays: number }[] {
  return [...artistPlays(c, plays)]
    .filter(([id]) => c.artists[id])
    .sort((a, b) => b[1] - a[1] || c.artists[a[0]].name.localeCompare(c.artists[b[0]].name))
    .slice(0, n)
    .map(([id, n]) => ({ artist: c.artists[id], plays: n }))
}

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
/** "19 – 25 OCT" · "29 OCT – 1 NOV" · "26 OCT" */
function span(a: number, b: number): string {
  const x = new Date(a)
  const y = new Date(b)
  const m = (d: Date) => MONTHS[d.getMonth()]
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return a === b ? `${x.getDate()} ${m(x)}` : `${x.getDate()} – ${y.getDate()} ${m(y)}`
  return `${x.getDate()} ${m(x)} – ${y.getDate()} ${m(y)}`
}

/** Upcoming timeline: THIS WEEK · NEXT WEEK · LATER IN OCT · NOVEMBER … (weeks run Monday to Sunday). */
function upcomingWeeks(items: FeedItem[], t0: number, reversed: boolean): UpWeek[] {
  const today = new Date(t0)
  const dow = (today.getDay() + 6) % 7
  const endThis = t0 + (6 - dow) * DAY
  const endNext = endThis + 7 * DAY
  const weeks = new Map<string, UpWeek & { sort: number }>()
  const put = (key: string, sort: number, label: string, range: string, it: FeedItem) => {
    const w = weeks.get(key)
    if (w) w.items.push(it)
    else weeks.set(key, { key, sort, label, range, items: [it], })
  }
  for (const it of [...items].sort((a, b) => a.day - b.day || a.rel.t.localeCompare(b.rel.t))) {
    const d = new Date(it.day)
    if (it.day <= endThis) put('this', 0, 'THIS WEEK', span(t0 + DAY, endThis), it)
    else if (it.day <= endNext) put('next', 1, 'NEXT WEEK', span(endThis + DAY, endNext), it)
    else if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth())
      put('later', 2, `LATER IN ${MONTHS[d.getMonth()]}`, span(endNext + DAY, new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime()), it)
    else {
      const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      const label = d.getFullYear() === today.getFullYear() ? MONTH_NAMES[d.getMonth()] : `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      put(`m${d.getFullYear()}-${d.getMonth()}`, 3 + first / DAY / 1000, label, span(first, new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime()), it)
    }
  }
  const out = [...weeks.values()].sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...w }) => w)
  if (reversed) {
    out.reverse()
    for (const w of out) w.items.reverse()
  }
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
    it.visible = isVisible(it, hideRe)
  }
  const all = [...items.values()].sort((a, b) => b.day - a.day || a.rel.t.localeCompare(b.rel.t))

  // what the page can show at all, before the artist / status filters
  const base = all.filter((it) => it.visible)
  const upBase = base.filter((it) => it.upcoming)
  const outBase = base.filter((it) => !it.upcoming)
  const byArtist = (it: FeedItem) => !prefs.artist || it.owners.some((a) => a.id === prefs.artist)
  const upShown = upBase.filter(byArtist)
  const outArtist = outBase.filter(byArtist)
  const status = {
    all: outArtist.length,
    new: outArtist.filter((it) => !isSeen(it)).length,
    seen: outArtist.filter(isSeen).length,
  }
  const outShown = outArtist.filter((it) => it.status === 'acq' || prefs.status === 'all' || (prefs.status === 'seen') === isSeen(it))

  // hero (Out now only): the newest release (last 30 days) from the artist you play most
  const plays_ = artistPlays(c, plays)
  const playsOf = (it: FeedItem) => it.owners.reduce((s, a) => s + (plays_.get(a.id) ?? 0), 0)
  const recent = outShown.filter((it) => it.day >= t0 - 30 * DAY)
  const ranked = [...recent].sort((a, b) => playsOf(b) - playsOf(a) || Number(b.status === 'new') - Number(a.status === 'new') || b.day - a.day)
  const hero = ranked[0] ?? null
  const heroPlays = hero ? playsOf(hero) : 0
  const heroArtist = hero ? hero.owners[0].name.toUpperCase() : ''
  const heroLine = hero
    ? heroPlays > 0
      ? { desktop: `NEWEST FROM YOUR MOST PLAYED · ${heroArtist} · ${heroPlays.toLocaleString('en-US')} PLAYS`, phone: 'NEWEST · MOST PLAYED' }
      : { desktop: `NEWEST ON THE SONAR · ${heroArtist}`, phone: 'NEWEST' }
    : { desktop: '', phone: '' }

  // Out now groups (the hero isn't repeated below)
  const weekStart = t0 - 6 * DAY
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
  const d = (ms: number) => {
    const x = new Date(ms)
    return `${pad(x.getDate())} ${MONTHS[x.getMonth()]}`
  }
  const feed = outShown.filter((it) => it !== hero)
  const week = feed.filter((it) => it.day >= weekStart)
  const month = feed.filter((it) => it.day < weekStart && it.day >= monthStart)
  const older = feed.filter((it) => it.day < Math.min(weekStart, monthStart))
  const groups: FeedGroup[] = [
    { key: 'week' as const, label: 'THIS WEEK', range: `${d(weekStart)} – ${d(t0)}`, items: week },
    { key: 'month' as const, label: 'EARLIER THIS MONTH', range: `${d(monthStart)} – ${d(weekStart - DAY)}`, items: month },
    { key: 'older' as const, label: 'OLDER', range: `BEFORE ${monthStart < weekStart ? MONTHS[today.getMonth()] : d(weekStart)}`, items: older },
  ].filter((g) => g.items.length)

  // artists for the filter: whoever has a release on either tab, most played first
  const owners = new Map<string, ArtistOpt>()
  for (const it of base)
    for (const a of it.owners)
      if (!owners.has(a.id)) owners.set(a.id, { id: a.id, name: a.name, plays: plays_.get(a.id) ?? 0 })
  const artistOpts = [...owners.values()].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))

  const out: Feed = {
    all,
    byId: items,
    hero,
    heroLine,
    groups,
    weeks: upcomingWeeks(upShown, t0, prefs.reversed),
    counts: { new: outBase.filter((it) => it.status === 'new').length },
    tabs: { up: upBase.length, out: outBase.filter((it) => it.status === 'new').length },
    status,
    upLine: { upcoming: upShown.length, reminders: upShown.filter((it) => it.reminded).length },
    artistOpts,
    outShown: outShown.length,
  }
  feedCache = { doc, c, plays, prefs, day: t0, out }
  return out
}

/* ── Discover: artists like your most played ─────────── */

export interface Suggestion {
  /** Deezer artist id */
  dz: number
  name: string
  /** your most played artists this one is related to (most related first) */
  because: Artist[]
  /** their play counts, same order */
  plays: number[]
  /** up to three recent releases (year) — or, when the last 6 months are empty, popular songs (no year) */
  rel: { t: string; y: string }[]
  /** `rel` are songs, not releases */
  songs: boolean
  /** in the sweep (Add to sweep) */
  followed: boolean
  /** all their Deezer album titles (kept when added to the sweep, to verify the MusicBrainz match) */
  titles: string[]
}

let suggestCache: { doc: ReleasesDoc; c: Catalogue; plays: readonly Play[]; out: Suggestion[] } | null = null

/**
 * Suggestions: artists who aren't in the library, related to your most played ones. Not-interested
 * artists are out; ones you added stay (as "In the sweep") until their entry ages out.
 */
export function buildSuggestions(doc: ReleasesDoc, c: Catalogue, plays: readonly Play[]): Suggestion[] {
  if (suggestCache && suggestCache.doc === doc && suggestCache.c === c && suggestCache.plays === plays) return suggestCache.out
  const top = new Map(topPlayedArtists(c, plays).map((t) => [t.artist.id, t.plays]))
  const out: (Suggestion & { score: number })[] = []
  for (const [k, e] of Object.entries(doc.discover)) {
    if (doc.dzMuted[k]?.[0]) continue
    const because = e.because.filter((id) => top.has(id) && c.artists[id])
    if (!because.length) continue
    const rel = [...e.rel].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    const songs = !rel.length
    out.push({
      dz: Number(k),
      name: e.name,
      because: because.map((id) => c.artists[id]),
      plays: because.map((id) => top.get(id) ?? 0),
      rel: songs ? e.titles.slice(0, 3).map((t) => ({ t, y: '' })) : rel.map((r) => ({ t: r.t, y: r.date.slice(0, 4) })),
      songs,
      followed: !!doc.follow[`dz:${k}`]?.[0],
      titles: e.titles,
      score: e.score,
    })
  }
  out.sort((a, b) => b.because.length - a.because.length || b.score - a.score || a.name.localeCompare(b.name))
  const res = out.map(({ score: _s, ...s }) => s)
  suggestCache = { doc, c, plays, out: res }
  return res
}

/** "Spiritbox", "Spiritbox and Periphery", "A, B and C" */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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
