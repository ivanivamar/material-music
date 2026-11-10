/**
 * Deezer helper — `/api/deezer/*` on the app's own origin (Firebase Hosting → the `api` function).
 *
 * The Upload page uses it to find an artist photo for a new artist (same rule as tools/import):
 * browsers can't call Deezer directly (no CORS), so the lookups run here.
 *
 *   GET /api/deezer/artist?name=<artist>&a=<album title>&a=<album title>…
 *        → { found: true, id, pictureUrl } | { found: false }
 *        The Deezer artist must have the same (normalised) name; when several do, the one whose
 *        albums overlap our album titles wins (an ambiguous guess with no overlap is dropped).
 *   GET /api/deezer/previews?artist=<name>[&artist=<alt name>][&dz=<deezer artist id>]&title=<release>&date=<YYYY-MM-DD>&n=<track count>&type=<album|ep|single>
 *        → { found: true, id, link, tracks: [{ t, d, p }] } | { found: false }   (New Releases → Out now)
 *        The release on Deezer and its tracks with their 30 s preview MP3 URLs (p; signed, they expire).
 *   GET /api/deezer/image?url=<picture url>
 *        → the image bytes (only https://….dzcdn.net/… URLs)
 *   GET /api/deezer/related?id=<deezer artist id>   (or ?name=<artist>&a=<album title>… to look it up)
 *        → { found: true, id, artists: [{ id, name }] } | { found: false }   (radio, step 26)
 *        Deezer's related artists, most related first; the app keeps the ones in the library.
 *   GET /api/deezer/top?id=<deezer artist id>&limit=<n>   (or ?name=<artist>&a=<album title>… to look it up)
 *        → { found: true, id, name, tracks: [{ id, t, d, p, al: { id, t, c }, ar: { id, n }, link }] } | { found: false }
 *        The artist's most popular songs with their 30 s previews (Discovery mix).
 *   GET /api/deezer/tracks?id=<deezer track id>&id=…   (up to 40)
 *        → { tracks: [{ id, p }] }   fresh preview URLs (they expire) for the Discovery mix.
 *   GET /api/deezer/releases?id=<deezer artist id>&days=<n>   (New Releases → Discover)
 *        → { found: true, id, name, picture, releases: [{ id, t, type, date, cover }], titles: [...] }
 *        The artist's albums / EPs / singles released in the last `days` (default 183, max 400),
 *        newest first, and all their album titles (the app uses them to find the artist on MusicBrainz).
 *
 * The Android app calls it on https://material-music-app.web.app from https://localhost, so that origin gets CORS headers.
 *
 * Needs the `X-Pelagic: 1` header (same as the sign-in helper), so other sites can't borrow it.
 * Nothing is stored.
 */
import { caller } from './guard.ts'

interface Ctx {
  request: Request
  params: { action?: string | string[] }
}

const UA = 'Pelagic/0.1 (personal music player)'

const NATIVE_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost'])
function cors(origin: string | null): Record<string, string> {
  if (!origin || !NATIVE_ORIGINS.has(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'x-pelagic, authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

const jsonFor =
  (origin: string | null) =>
  (body: unknown, status = 200, cache = 'no-store') =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache, ...cors(origin) } })

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Deezer answered ${res.status}`)
  return (await res.json()) as T
}

interface DzArtist {
  id: number
  name: string
  nb_fan?: number
  picture_xl?: string
}

interface DzAlbum {
  id: number
  title: string
  release_date?: string
  record_type?: 'album' | 'ep' | 'single' | 'compile'
  cover_medium?: string
}

interface DzTopRow {
  id: number
  title: string
  duration?: number
  preview?: string
  readable?: boolean
  link?: string
  album?: { id: number; title: string; cover_medium?: string; cover_big?: string }
  artist?: { id: number; name: string }
}

async function lookup(name: string, titles: string[]) {
  const ours = new Set(titles.map(norm))
  const res = await getJson<{ data?: DzArtist[] }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=10`)
  const cands = (res.data ?? []).filter((a) => norm(a.name) === norm(name))
  let best: { id: number; score: number; fans: number; pic?: string } | null = null
  for (const a of cands.slice(0, 3)) {
    const albums = await getJson<{ data?: { title: string }[] }>(`https://api.deezer.com/artist/${a.id}/albums?limit=200`)
    const score = (albums.data ?? []).filter((x) => ours.has(norm(x.title))).length
    const fans = a.nb_fan ?? 0
    if (!best || score > best.score || (score === best.score && fans > best.fans)) best = { id: a.id, score, fans, pic: a.picture_xl }
  }
  if (!best || (best.score === 0 && cands.length > 1)) return null
  // Deezer's placeholder for artists without a photo has an empty hash in the URL
  if (!best.pic || /\/artist\/\//.test(best.pic)) return null
  return { id: best.id, pictureUrl: best.pic }
}

/* ── Previews (New Releases → Out now) ───────────────── */

/**
 * Like `norm`, but keeps letters of any script (Japanese titles would fold to nothing otherwise),
 * folds full-width / half-width forms (NFKC) and drops spacing and punctuation entirely, since
 * Japanese titles are written with or without spaces, 「」, ・, 〜 and so on.
 */
const normU = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

const sameArtist = (a: string, b: string) => {
  const x = normU(a)
  const y = normU(b)
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x))
}

/** 100 same title, 40 one starts with the other ("Title" vs "Title - EP"), 0 otherwise. */
const titleScore = (want: string, got: string) => {
  const g = normU(got)
  if (!want || !g) return 0
  return g === want ? 100 : g.startsWith(want) || want.startsWith(g) ? 40 : 0
}

/** Days between two dates (YYYY-MM-DD; a bare year or month only compares that far). */
function dayGap(a: string | undefined, b: string): number | null {
  if (!a || !b) return null
  if (b.length < 10) return a.startsWith(b) ? 0 : null
  const d = Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
  return Number.isFinite(d) ? d : null
}

interface DzAlbumHit {
  id: number
  title: string
  nb_tracks?: number
  link?: string
  release_date?: string
  record_type?: string
  artist?: { id: number; name: string }
}

interface DzTrack {
  id: number
  title: string
  duration?: number
  preview?: string
  link?: string
  artist?: { id?: number; name: string }
  album?: { id: number; title: string }
}

type PreviewOut = { id: number; link: string | null; tracks: { t: string; d: number | null; p: string | null }[] }

const toOut = (t: DzTrack) => ({ t: t.title, d: t.duration ?? null, p: t.preview || null })

interface PreviewQuery {
  artists: string[]
  /** Deezer artist ids we already know (library catalogue / Discover follows) */
  dz: number[]
  title: string
  /** MusicBrainz first-release date */
  date: string
  n: number
  single: boolean
}

/**
 * The release on Deezer and its tracks with their 30 s preview URLs. Preview URLs are signed and
 * expire, so nothing is cached for long.
 *
 * Japanese (and other non-Latin) releases are the hard case: Deezer often writes the artist in
 * romaji ("Yorushika" for ヨルシカ) and sometimes the title too. So, in order:
 *   1. the known Deezer artist(s): their album list, by title, else by release date + type;
 *   2. a plain search (Deezer's `artist:"…" album:"…"` syntax misses CJK) for artist + title and
 *      for the title alone; a hit whose artist name differs is only taken when its release date
 *      matches MusicBrainz's;
 *   3. singles: the same for songs.
 */
async function findPreviews(q: PreviewQuery): Promise<PreviewOut | null> {
  const want = normU(q.title)
  const dzSet = new Set(q.dz)
  const typeOk = (t?: string) => !t || (q.single ? t === 'single' : t !== 'single' || q.n <= 3)

  const tracksOf = async (a: DzAlbumHit): Promise<PreviewOut | null> => {
    const tr = await getJson<{ data?: DzTrack[] }>(`https://api.deezer.com/album/${a.id}/tracks?limit=200`)
    const tracks = (tr.data ?? []).map(toOut)
    return tracks.length ? { id: a.id, link: a.link ?? `https://www.deezer.com/album/${a.id}`, tracks } : null
  }

  // 1. the artist's own album list
  for (const id of q.dz.slice(0, 2)) {
    const res = await getJson<{ data?: DzAlbumHit[] }>(`https://api.deezer.com/artist/${id}/albums?limit=300`)
    let best: { a: DzAlbumHit; score: number } | null = null
    for (const a of res.data ?? []) {
      const ts = titleScore(want, a.title)
      const gap = dayGap(a.release_date, q.date)
      const ds = gap === null ? 0 : gap === 0 ? 30 : gap <= 7 ? 20 : 0
      // a romanised / translated title still counts when the date and the type agree
      const score = ts ? ts + ds : ds >= 30 && typeOk(a.record_type) ? 60 : 0
      if (score && (!best || score > best.score)) best = { a, score }
    }
    if (best && best.score >= 60) {
      const out = await tracksOf(best.a)
      if (out) return out
    }
  }

  // 2. search
  const searches = [...q.artists.map((a) => `${a} ${q.title}`), q.title]
  const seen = new Set<number>()
  const cands: { a: DzAlbumHit; score: number; needDate: boolean }[] = []
  for (const s of searches) {
    const res = await getJson<{ data?: DzAlbumHit[] }>(`https://api.deezer.com/search/album?q=${encodeURIComponent(s)}&limit=25`)
    for (const a of res.data ?? []) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      const ts = titleScore(want, a.title)
      if (!ts) continue
      const known = !!a.artist && (dzSet.has(a.artist.id) || q.artists.some((x) => sameArtist(a.artist!.name, x)))
      const tc = q.n && a.nb_tracks ? Math.min(30, Math.abs(a.nb_tracks - q.n) * 3) : 0
      cands.push({ a, score: ts - tc + (known ? 50 : 0), needDate: !known })
    }
    if (cands.some((c) => !c.needDate && c.score >= 120)) break
  }
  cands.sort((x, y) => y.score - x.score)
  let checked = 0
  for (const c of cands) {
    if (!c.needDate) {
      if (c.score < 90) continue
      const out = await tracksOf(c.a)
      if (out) return out
      continue
    }
    // artist written differently (romaji, kanji…): trust it only when the release date agrees
    if (c.a.title && titleScore(want, c.a.title) < 100) continue
    if (checked++ >= 3) break
    const full = await getJson<DzAlbumHit & { error?: unknown }>(`https://api.deezer.com/album/${c.a.id}`)
    const gap = dayGap(full.release_date, q.date)
    if (gap !== null && gap <= 7) {
      const out = await tracksOf(c.a)
      if (out) return out
    }
  }

  // 3. singles: the song itself
  if (!q.single) return null
  for (const s of searches) {
    const res = await getJson<{ data?: DzTrack[] }>(`https://api.deezer.com/search/track?q=${encodeURIComponent(s)}&limit=25`)
    const t = (res.data ?? []).find(
      (x) => x.preview && titleScore(want, x.title) === 100 && !!x.artist && ((x.artist.id && dzSet.has(x.artist.id)) || q.artists.some((a) => sameArtist(x.artist!.name, a))),
    )
    if (t) return { id: t.album?.id ?? t.id, link: t.link ?? null, tracks: [toOut(t)] }
  }
  return null
}

export async function onRequest({ request, params }: Ctx): Promise<Response> {
  const action = Array.isArray(params.action) ? params.action[0] : params.action
  const origin = request.headers.get('origin')
  const json = jsonFor(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  if (request.headers.get('x-pelagic') !== '1') return json({ error: 'forbidden' }, 403)
  if (!(await caller(request.headers.get('authorization')))) return json({ error: 'unauthorized' }, 401)
  const url = new URL(request.url)

  if (action === 'artist') {
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, 200)
    if (!name) return json({ error: 'missing_name' }, 400)
    const titles = url.searchParams.getAll('a').slice(0, 100).map((t) => t.slice(0, 200))
    try {
      const hit = await lookup(name, titles)
      return json(hit ? { found: true, ...hit } : { found: false })
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'related') {
    try {
      let id = Number(url.searchParams.get('id'))
      if (!Number.isFinite(id) || id <= 0) {
        const name = (url.searchParams.get('name') ?? '').trim().slice(0, 200)
        if (!name) return json({ error: 'missing_id' }, 400)
        const hit = await lookup(name, url.searchParams.getAll('a').slice(0, 100).map((t) => t.slice(0, 200)))
        if (!hit) return json({ found: false }, 200, 'private, max-age=86400')
        id = hit.id
      }
      const res = await getJson<{ data?: { id: number; name: string }[] }>(`https://api.deezer.com/artist/${id}/related?limit=60`)
      const artists = (res.data ?? []).map((a) => ({ id: a.id, name: a.name }))
      return json({ found: true, id, artists }, 200, 'private, max-age=86400')
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'releases') {
    const id = Number(url.searchParams.get('id'))
    if (!Number.isFinite(id) || id <= 0) return json({ error: 'missing_id' }, 400)
    const days = Math.min(400, Math.max(1, Number(url.searchParams.get('days')) || 183))
    try {
      const artist = await getJson<DzArtist & { error?: unknown; picture_medium?: string }>(`https://api.deezer.com/artist/${id}`)
      if (!artist || artist.error || !artist.id) return json({ found: false }, 200, 'private, max-age=86400')
      const albums = await getJson<{ data?: DzAlbum[] }>(`https://api.deezer.com/artist/${id}/albums?limit=100`)
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
      const list = albums.data ?? []
      const releases = list
        .filter((a) => a.release_date && a.release_date >= since)
        .sort((a, b) => b.release_date!.localeCompare(a.release_date!))
        .slice(0, 30)
        .map((a) => ({ id: a.id, t: a.title, type: a.record_type ?? 'album', date: a.release_date, cover: a.cover_medium ?? null }))
      const pic = artist.picture_medium && !/\/artist\/\//.test(artist.picture_medium) ? artist.picture_medium : null
      const titles = [...new Set(list.map((a) => a.title))].slice(0, 100)
      return json({ found: true, id: artist.id, name: artist.name, picture: pic, releases, titles }, 200, 'private, max-age=21600')
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'previews') {
    const artists = [...new Set(url.searchParams.getAll('artist').map((a) => a.trim().slice(0, 200)).filter(Boolean))].slice(0, 3)
    const title = (url.searchParams.get('title') ?? '').trim().slice(0, 300)
    if (!artists.length || !title) return json({ error: 'missing_query' }, 400)
    const dz = [...new Set(url.searchParams.getAll('dz').map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 3)
    const date = (url.searchParams.get('date') ?? '').trim()
    try {
      const hit = await findPreviews({
        artists,
        dz,
        title,
        date: /^\d{4}(-\d{2}){0,2}$/.test(date) ? date : '',
        n: Number(url.searchParams.get('n')) || 0,
        single: url.searchParams.get('type') === 'single',
      })
      return json(hit ? { found: true, ...hit } : { found: false }, 200, 'private, max-age=600')
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'top') {
    try {
      let id = Number(url.searchParams.get('id'))
      let name = ''
      if (!Number.isFinite(id) || id <= 0) {
        name = (url.searchParams.get('name') ?? '').trim().slice(0, 200)
        if (!name) return json({ error: 'missing_id' }, 400)
        const hit = await lookup(name, url.searchParams.getAll('a').slice(0, 100).map((t) => t.slice(0, 200)))
        if (!hit) return json({ found: false }, 200, 'private, max-age=86400')
        id = hit.id
      }
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40))
      const res = await getJson<{ data?: DzTopRow[]; error?: unknown }>(`https://api.deezer.com/artist/${id}/top?limit=${limit}`)
      const rows = res.data ?? []
      if (!name) name = rows[0]?.artist?.name ?? ''
      const tracks = rows
        .filter((t) => t.preview && t.readable !== false)
        .map((t) => ({
          id: t.id,
          t: t.title,
          d: t.duration ?? null,
          p: t.preview || null,
          al: { id: t.album?.id ?? 0, t: t.album?.title ?? '', c: t.album?.cover_medium ?? t.album?.cover_big ?? null },
          ar: { id: t.artist?.id ?? id, n: t.artist?.name ?? name },
          link: t.link ?? null,
        }))
      return json({ found: true, id, name, tracks }, 200, 'private, max-age=600')
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'tracks') {
    const ids = [...new Set(url.searchParams.getAll('id').map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 40)
    if (!ids.length) return json({ error: 'missing_id' }, 400)
    try {
      const out: { id: number; p: string | null }[] = []
      // a few at a time: Deezer allows about 50 requests per 5 s
      for (let i = 0; i < ids.length; i += 8) {
        const got = await Promise.all(
          ids.slice(i, i + 8).map((id) =>
            getJson<{ id?: number; preview?: string; error?: unknown }>(`https://api.deezer.com/track/${id}`)
              .then((t) => ({ id, p: t && !t.error && t.preview ? t.preview : null }))
              .catch(() => ({ id, p: null })),
          ),
        )
        out.push(...got)
      }
      return json({ tracks: out }, 200, 'private, max-age=300')
    } catch (e) {
      return json({ error: 'deezer_failed', message: (e as Error).message }, 502)
    }
  }

  if (action === 'image') {
    let target: URL
    try {
      target = new URL(url.searchParams.get('url') ?? '')
    } catch {
      return json({ error: 'bad_url' }, 400)
    }
    if (target.protocol !== 'https:' || !(target.hostname === 'dzcdn.net' || target.hostname.endsWith('.dzcdn.net'))) return json({ error: 'host_not_allowed' }, 400)
    const res = await fetch(target.toString(), { headers: { 'User-Agent': UA } })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return json({ error: 'image_failed' }, 502)
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > 10_000_000) return json({ error: 'too_big' }, 502)
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'private, max-age=86400', ...cors(origin) } })
  }

  return json({ error: 'not_found' }, 404)
}
