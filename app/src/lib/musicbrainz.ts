/**
 * MusicBrainz web service (ws/2, JSON) for New Releases (step 11), straight from the app — the
 * service sends CORS headers, so no backend. Cover Art Archive images are plain <img> URLs.
 *
 * One queue for every request, at most one per 1.1 s (MusicBrainz allows ~1/s per IP; the PC and
 * the phone usually share one). The open detail panel's requests go before the sweep's.
 * HTTP 503 = rate-limited: back off 4 → 8 → 16 s, then give up with an MbError the sweep reports.
 */

const WS = 'https://musicbrainz.org/ws/2'
const GAP_MS = 1100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MbError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'MbError'
    this.status = status
  }
}
/** fetch failed outright (offline, DNS): the sweep pauses until the connection is back */
export class MbOffline extends Error {
  constructor() {
    super('No connection to MusicBrainz')
    this.name = 'MbOffline'
  }
}

/* ── Rate-limited queue ─────────────────────────────── */

interface Job {
  url: string
  priority: number
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
  gen: number
}

const queue: Job[] = []
let running = false
let last = 0
let generation = 0

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      queue.sort((a, b) => b.priority - a.priority)
      const job = queue.shift()!
      if (job.gen !== generation) {
        job.reject(new DOMException('cancelled', 'AbortError'))
        continue
      }
      try {
        job.resolve(await getWithBackoff(job.url))
      } catch (e) {
        job.reject(e)
      }
    }
  } finally {
    running = false
  }
}

async function getWithBackoff(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const wait = last + GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch {
      throw new MbOffline()
    }
    if (res.ok) return res.json()
    if (res.status === 404) throw new MbError(404, 'Not found on MusicBrainz')
    if ((res.status === 503 || res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(4000 * 2 ** attempt)
      continue
    }
    throw new MbError(res.status, `MusicBrainz answered ${res.status}`)
  }
}

function mbGet<T>(path: string, priority = 0): Promise<T> {
  const url = `${WS}/${path}${path.includes('?') ? '&' : '?'}fmt=json`
  return new Promise<T>((resolve, reject) => {
    queue.push({ url, priority, resolve: resolve as (v: unknown) => void, reject, gen: generation })
    void pump()
  })
}

/** Drop everything queued (sign-out). */
export function cancelAll() {
  generation++
}

/* ── Release groups ─────────────────────────────────── */

export type RelType = 'album' | 'ep' | 'single' | 'live' | 'other'

export interface MbReleaseGroup {
  id: string
  title: string
  'primary-type'?: string | null
  'secondary-types'?: string[]
  'first-release-date'?: string
  'artist-credit'?: { name: string; joinphrase?: string; artist?: { id: string; name: string } }[]
}

/** Remasters, anniversary / deluxe / expanded editions (the "Hide reissues" switch). */
export const REISSUE_RE = /\b(remaster(ed)?|anniversary|deluxe|expanded|reissue|re-issue|special edition|collector'?s edition|redux)\b/i

export function classify(rg: MbReleaseGroup): { type: RelType; reissue: boolean } {
  const sec = (rg['secondary-types'] ?? []).map((s) => s.toLowerCase())
  const prim = (rg['primary-type'] ?? '').toLowerCase()
  const reissue = REISSUE_RE.test(rg.title)
  if (sec.includes('live')) return { type: 'live', reissue }
  if (reissue || sec.some((s) => ['compilation', 'remix', 'dj-mix', 'mixtape/street', 'demo', 'soundtrack', 'spokenword', 'interview', 'audiobook', 'audio drama'].includes(s)))
    return { type: 'other', reissue }
  if (prim === 'album') return { type: 'album', reissue }
  if (prim === 'ep') return { type: 'ep', reissue }
  if (prim === 'single') return { type: 'single', reissue }
  return { type: 'other', reissue }
}

export const creditOf = (rg: MbReleaseGroup, fallback: string) =>
  rg['artist-credit']?.length ? rg['artist-credit'].map((c) => c.name + (c.joinphrase ?? '')).join('').trim() : fallback

/** Every release group the artist is credited on (paged, up to `maxPages` × 100). */
export async function browseReleaseGroups(mbid: string, maxPages = 5): Promise<MbReleaseGroup[]> {
  const out: MbReleaseGroup[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await mbGet<{ 'release-group-count': number; 'release-groups': MbReleaseGroup[] }>(
      `release-group?artist=${mbid}&inc=artist-credits&limit=100&offset=${page * 100}`,
    )
    out.push(...(r['release-groups'] ?? []))
    if (out.length >= (r['release-group-count'] ?? 0) || !(r['release-groups'] ?? []).length) break
  }
  return out
}

/* ── Genres (step 20b: albums without a GENRE tag) ── */

export interface MbGenre {
  name: string
  count?: number
}

/** The artist's genres (with vote counts). */
export async function artistGenres(mbid: string): Promise<MbGenre[]> {
  const r = await mbGet<{ genres?: MbGenre[] }>(`artist/${mbid}?inc=genres`)
  return r.genres ?? []
}

/** Every release group of the artist with its genres (paged, up to `maxPages` × 100). */
export async function browseReleaseGroupGenres(mbid: string, maxPages = 3): Promise<{ id: string; title: string; genres?: MbGenre[] }[]> {
  const out: { id: string; title: string; genres?: MbGenre[] }[] = []
  for (let page = 0; page < maxPages; page++) {
    const r = await mbGet<{ 'release-group-count': number; 'release-groups': { id: string; title: string; genres?: MbGenre[] }[] }>(
      `release-group?artist=${mbid}&inc=genres&limit=100&offset=${page * 100}`,
    )
    out.push(...(r['release-groups'] ?? []))
    if (out.length >= (r['release-group-count'] ?? 0) || !(r['release-groups'] ?? []).length) break
  }
  return out
}

/* ── Artist lookup (artists the importer couldn't identify) ── */

export const foldTitle = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s+-\s+(single|ep)$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * Same rule as tools/import (lookupMbid): exact-name candidates, the one whose release groups share
 * the most titles with our albums; no overlap and several candidates → don't guess (null).
 */
export async function findArtist(name: string, albumTitles: string[]): Promise<string | null> {
  const ours = new Set(albumTitles.map(foldTitle))
  const res = await mbGet<{ artists?: { id: string; name: string }[] }>(`artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=5`)
  const cands = (res.artists ?? []).filter((a) => foldTitle(a.name) === foldTitle(name)).slice(0, 3)
  let best: { id: string; score: number } | null = null
  for (const a of cands) {
    const rgs = await browseReleaseGroups(a.id, 1)
    const score = rgs.filter((r) => ours.has(foldTitle(r.title))).length
    if (!best || score > best.score) best = { id: a.id, score }
  }
  if (!best || (best.score === 0 && cands.length > 1)) return null
  return best.id
}

/* ── Detail: tracklist, label, links ────────────────── */

export interface RelDetail {
  /** fetched (ms) */
  at: number
  /** the release the tracklist comes from */
  release: string | null
  label: string | null
  /** [title, seconds | null] */
  tracks: [string, number | null][]
  /** total seconds (null when any length is unknown) */
  length: number | null
}

interface MbRelease {
  id: string
  date?: string
  country?: string
  status?: string
  'label-info'?: { label?: { name: string } | null }[]
  media?: { position?: number; tracks?: { title: string; length?: number | null; position?: number }[] }[]
}

/** Tracklist of the earliest official release of the group (worldwide / digital edition first). */
export async function releaseDetail(rgId: string, priority = 0): Promise<RelDetail> {
  const r = await mbGet<{ releases?: MbRelease[] }>(`release?release-group=${rgId}&inc=recordings+labels&limit=10`, priority)
  const rels = (r.releases ?? []).filter((x) => (x.status ?? 'Official') === 'Official')
  const pool = rels.length ? rels : (r.releases ?? [])
  pool.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || Number(b.country === 'XW') - Number(a.country === 'XW'))
  const rel = pool[0]
  if (!rel) return { at: Date.now(), release: null, label: null, tracks: [], length: null }
  const tracks: [string, number | null][] = []
  for (const m of rel.media ?? []) for (const t of m.tracks ?? []) tracks.push([t.title, t.length ? Math.round(t.length / 1000) : null])
  const known = tracks.every(([, s]) => s !== null)
  const label = rel['label-info']?.map((l) => l.label?.name).find(Boolean) ?? null
  return {
    at: Date.now(),
    release: rel.id,
    label: label && !/^\[no label\]$/i.test(label) ? label : 'Self-released',
    tracks,
    length: tracks.length && known ? tracks.reduce((s, [, x]) => s + (x ?? 0), 0) : null,
  }
}

export interface ArtistLinks {
  homepage: string | null
  bandcamp: string | null
}

export async function artistLinks(mbid: string, priority = 0): Promise<ArtistLinks> {
  const r = await mbGet<{ relations?: { type: string; url?: { resource: string } }[] }>(`artist/${mbid}?inc=url-rels`, priority)
  const rel = r.relations ?? []
  const find = (pred: (type: string, url: string) => boolean) => rel.find((x) => x.url && pred(x.type, x.url.resource))?.url?.resource ?? null
  return {
    homepage: find((t) => t === 'official homepage'),
    bandcamp: find((t, u) => t === 'bandcamp' || /bandcamp\.com/.test(u)),
  }
}

/* ── URLs ───────────────────────────────────────────── */

export const coverUrl = (rgId: string, size: 250 | 500 = 250) => `https://coverartarchive.org/release-group/${rgId}/front-${size}`
export const mbReleaseGroupUrl = (rgId: string) => `https://musicbrainz.org/release-group/${rgId}`
export const bandcampSearchUrl = (artist: string, title: string) => `https://bandcamp.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`

/** MusicBrainz's "Various Artists" and other placeholders: never swept. */
export const SPECIAL_ARTISTS = new Set(['89ad4ac3-39f7-470e-963a-56509c546377', 'f731ccc4-e22a-43af-a747-64213329e088', '33cf029c-63b0-41a0-9855-be2a3665fb3b'])

/* ── Library health: find an album's year / cover ───── */

export interface MbAlbumHit {
  id: string
  title: string
  artist: string
  /** year of the first release, when MusicBrainz knows it */
  year: number | null
  /** search score 0–100 */
  score: number
}

const lucene = (s: string) => s.replace(/(["\\])/g, '\\$1')

/** Release groups matching an artist + title (best first). Titles are compared by the caller. */
export async function searchReleaseGroups(artist: string, title: string, priority = 2): Promise<MbAlbumHit[]> {
  const q = `releasegroup:"${lucene(title)}" AND artist:"${lucene(artist)}"`
  const r = await mbGet<{ 'release-groups'?: { id: string; title: string; score?: number; 'first-release-date'?: string; 'artist-credit'?: { name?: string }[] }[] }>(
    `release-group?query=${encodeURIComponent(q)}&limit=6`,
    priority,
  )
  return (r['release-groups'] ?? []).map((g) => {
    const y = Number((g['first-release-date'] ?? '').slice(0, 4))
    return { id: g.id, title: g.title, artist: (g['artist-credit'] ?? []).map((a) => a.name ?? '').join(''), year: y >= 1900 && y < 2100 ? y : null, score: g.score ?? 0 }
  })
}
