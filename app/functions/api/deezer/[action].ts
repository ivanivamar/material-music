/**
 * Deezer helper — a Cloudflare Pages Function on the app's own origin (`/api/deezer/*`).
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
 *
 * Needs the `X-Pelagic: 1` header (same as the sign-in helper), so other sites can't borrow it.
 * Nothing is stored.
 */

interface Ctx {
  request: Request
  params: { action?: string | string[] }
}

const UA = 'Pelagic/0.1 (personal music player)'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

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
    return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'private, max-age=86400' } })
  }

  return json({ error: 'not_found' }, 404)
}
