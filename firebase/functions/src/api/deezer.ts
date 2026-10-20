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
 *   GET /api/deezer/image?url=<picture url>
 *        → the image bytes (only https://….dzcdn.net/… URLs)
 *   GET /api/deezer/related?id=<deezer artist id>   (or ?name=<artist>&a=<album title>… to look it up)
 *        → { found: true, id, artists: [{ id, name }] } | { found: false }   (radio, step 26)
 *        Deezer's related artists, most related first; the app keeps the ones in the library.
 *   GET /api/deezer/releases?id=<deezer artist id>&days=<n>   (New Releases → Discover)
 *        → { found: true, id, name, picture, releases: [{ id, t, type, date, cover }], titles: [...] }
 *        The artist's albums / EPs / singles released in the last `days` (default 183, max 400),
 *        newest first, and all their album titles (the app uses them to find the artist on MusicBrainz).
 *
 * The Android app calls it on https://pelagic-sound.web.app from https://localhost, so that origin gets CORS headers.
 *
 * Needs the `X-Pelagic: 1` header (same as the sign-in helper), so other sites can't borrow it.
 * Nothing is stored.
 */

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
    'access-control-allow-headers': 'x-pelagic',
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

export async function onRequest({ request, params }: Ctx): Promise<Response> {
  const action = Array.isArray(params.action) ? params.action[0] : params.action
  const origin = request.headers.get('origin')
  const json = jsonFor(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  if (request.headers.get('x-pelagic') !== '1') return json({ error: 'forbidden' }, 403)
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
