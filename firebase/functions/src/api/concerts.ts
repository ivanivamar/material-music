/**
 * Concerts (Ticketmaster) — `/api/concerts/*` on the app's own origin (Firebase Hosting → the `api` function).
 * Tour dates for the artists in the library, from the Ticketmaster Discovery API. The API key lives
 * only here (Firebase secret TICKETMASTER_API_KEY), never in the app.
 *
 *   GET /api/concerts/status → { configured }
 *   GET /api/concerts/artist?name=<artist>&mbid=<MusicBrainz id>&id=<Ticketmaster attraction id>
 *        → { found: true, id, name, events: [Ev…] } | { found: false }
 *        Without `id`, the attraction is looked up by name: same (normalised) name, music only; when
 *        several match, the one whose MusicBrainz link is `mbid` wins, else the one with the most
 *        upcoming events. Then all its upcoming events, worldwide, oldest first, in the shape below
 *        (the app works out distance, "new" and festivals' library line-up itself).
 *
 * Ev = { id, name, url, date: 'YYYY-MM-DD', end?, time?: 'HH:MM', status, saleStart?, presaleEnd?, movedFrom?,
 *        price?: { min, max?, cur }, venue: { name, city, country, cc, lat?, lon? }, lineup: [{ id, name }], festival? }
 * status: onsale | presale | notyet | soldout | cancelled | postponed | resched
 *
 * The app calls `artist` once a day per library artist, about one request a second (Ticketmaster
 * allows 5 a second and 5,000 a day on a free key). Needs the `X-Pelagic: 1` header like the other
 * helpers; the Android app calls it from https://localhost, so that origin gets CORS headers.
 *
 * Setup: developer.ticketmaster.com → My Apps → the Consumer Key →
 * `firebase functions:secrets:set TICKETMASTER_API_KEY` → deploy the function from the PC once.
 */

interface Env {
  TICKETMASTER_API_KEY?: string
}

interface Ctx {
  request: Request
  env: Env
  params: { action?: string | string[] }
}

const API = 'https://app.ticketmaster.com/discovery/v2'

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
  (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) } })

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

class TmError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function tm<T>(path: string, q: Record<string, string>, key: string): Promise<T> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v)
  url.searchParams.set('apikey', key)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    // 429: over the per-second limit — wait a moment once and try again
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1100))
      continue
    }
    if (!res.ok) throw new TmError(res.status, `Ticketmaster answered ${res.status}`)
    return (await res.json()) as T
  }
}

/* ── Ticketmaster shapes (only what we read) ─────────── */

interface TmAttraction {
  id: string
  name: string
  externalLinks?: { musicbrainz?: { id?: string }[] }
  upcomingEvents?: { _total?: number }
  classifications?: TmClass[]
}

interface TmClass {
  segment?: { name?: string }
  genre?: { name?: string }
  subGenre?: { name?: string }
  type?: { name?: string }
}

interface TmEvent {
  id: string
  name: string
  url?: string
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTBA?: boolean; timeTBA?: boolean; noSpecificTime?: boolean }
    end?: { localDate?: string }
    status?: { code?: string }
    initialStartDate?: { localDate?: string }
    spanMultipleDays?: boolean
  }
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string; startTBD?: boolean }
    presales?: { startDateTime?: string; endDateTime?: string; name?: string }[]
  }
  priceRanges?: { min?: number; max?: number; currency?: string }[]
  classifications?: TmClass[]
  _embedded?: {
    venues?: {
      name?: string
      city?: { name?: string }
      country?: { name?: string; countryCode?: string }
      location?: { latitude?: string; longitude?: string }
    }[]
    attractions?: { id: string; name: string }[]
  }
}

/* ── Attraction lookup ──────────────────────────────── */

async function findAttraction(name: string, mbid: string | null, key: string): Promise<TmAttraction | null> {
  const res = await tm<{ _embedded?: { attractions?: TmAttraction[] } }>('/attractions.json', { keyword: name, classificationName: 'music', size: '20', locale: '*' }, key)
  const all = res._embedded?.attractions ?? []
  if (mbid) {
    const byMb = all.find((a) => a.externalLinks?.musicbrainz?.some((m) => m.id === mbid))
    if (byMb) return byMb
  }
  const want = norm(name)
  const same = all.filter((a) => norm(a.name) === want && (a.classifications ?? []).every((c) => !c.segment?.name || c.segment.name === 'Music'))
  if (!same.length) return null
  // a MusicBrainz link that says it's someone else: not ours
  const usable = mbid ? same.filter((a) => !a.externalLinks?.musicbrainz?.length || a.externalLinks.musicbrainz.some((m) => m.id === mbid)) : same
  if (!usable.length) return null
  return usable.sort((a, b) => (b.upcomingEvents?._total ?? 0) - (a.upcomingEvents?._total ?? 0))[0]
}

/* ── Events ─────────────────────────────────────────── */

export type Status = 'onsale' | 'presale' | 'notyet' | 'soldout' | 'cancelled' | 'postponed' | 'resched'

export interface Ev {
  id: string
  name: string
  url: string
  date: string
  end?: string
  time?: string
  status: Status
  saleStart?: string
  presaleEnd?: string
  movedFrom?: string
  price?: { min: number; max?: number; cur: string }
  venue: { name: string; city: string; country: string; cc: string; lat?: number; lon?: number }
  lineup: { id: string; name: string }[]
  festival?: string
}

/** Add-ons Ticketmaster lists as their own events (parking, VIP packages…): not concerts. */
const ADDON = /\b(parking|vip|upgrade|package|hospitality|meet\s*(?:&|and)?\s*greet|soundcheck|lounge|shuttle|camping|locker)\b/i

function statusOf(e: TmEvent, now: number): Pick<Ev, 'status' | 'saleStart' | 'presaleEnd' | 'movedFrom'> {
  const code = (e.dates?.status?.code ?? 'onsale').toLowerCase()
  if (code === 'cancelled' || code === 'canceled') return { status: 'cancelled' }
  if (code === 'postponed') return { status: 'postponed' }
  if (code === 'rescheduled') {
    const from = e.dates?.initialStartDate?.localDate
    return { status: 'resched', movedFrom: from && from !== e.dates?.start?.localDate ? from : undefined }
  }
  const pub = e.sales?.public
  const start = pub?.startDateTime ? Date.parse(pub.startDateTime) : NaN
  const presale = (e.sales?.presales ?? []).find((p) => {
    const a = p.startDateTime ? Date.parse(p.startDateTime) : NaN
    const b = p.endDateTime ? Date.parse(p.endDateTime) : NaN
    return a <= now && (Number.isNaN(b) || now < b)
  })
  if (Number.isFinite(start) && start > now) {
    if (presale) return { status: 'presale', presaleEnd: presale.endDateTime, saleStart: pub?.startDateTime }
    return { status: 'notyet', saleStart: pub?.startDateTime }
  }
  if (code === 'offsale') return pub?.startTBD ? { status: 'notyet' } : { status: 'soldout' }
  return { status: 'onsale' }
}

function toEv(e: TmEvent, now: number): Ev | null {
  const date = e.dates?.start?.localDate
  if (!date || e.dates?.start?.dateTBA) return null
  if (ADDON.test(e.name)) return null
  const v = e._embedded?.venues?.[0]
  const lat = Number(v?.location?.latitude)
  const lon = Number(v?.location?.longitude)
  const lineup = (e._embedded?.attractions ?? []).map((a) => ({ id: a.id, name: a.name }))
  const cls = e.classifications ?? []
  const fest = lineup.length >= 3 || cls.some((c) => /festival/i.test(`${c.genre?.name ?? ''} ${c.subGenre?.name ?? ''} ${c.type?.name ?? ''}`)) || (/\bfest(ival)?\b/i.test(e.name) && lineup.length > 1)
  const end = e.dates?.end?.localDate
  const t = e.dates?.start?.localTime
  const pr = (e.priceRanges ?? []).find((p) => typeof p.min === 'number')
  return {
    id: e.id,
    name: e.name,
    url: e.url ?? `https://www.ticketmaster.com/event/${e.id}`,
    date,
    end: end && end > date ? end : undefined,
    time: t && !e.dates?.start?.timeTBA && !e.dates?.start?.noSpecificTime ? t.slice(0, 5) : undefined,
    ...statusOf(e, now),
    price: pr ? { min: pr.min!, max: pr.max && pr.max > pr.min! ? pr.max : undefined, cur: pr.currency ?? 'EUR' } : undefined,
    venue: {
      name: v?.name ?? '',
      city: v?.city?.name ?? '',
      country: v?.country?.name ?? '',
      cc: v?.country?.countryCode ?? '',
      ...(Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : {}),
    },
    lineup,
    festival: fest ? e.name : undefined,
  }
}

async function eventsOf(attractionId: string, key: string): Promise<Ev[]> {
  const res = await tm<{ _embedded?: { events?: TmEvent[] } }>('/events.json', { attractionId, size: '200', sort: 'date,asc', locale: '*' }, key)
  const now = Date.now()
  const out: Ev[] = []
  // one show per date + venue: Ticketmaster sometimes lists the same night twice (two ticket sellers)
  const seen = new Map<string, number>()
  for (const raw of res._embedded?.events ?? []) {
    const ev = toEv(raw, now)
    if (!ev) continue
    const k = `${ev.date}|${norm(ev.venue.name)}`
    const at = seen.get(k)
    if (at !== undefined) {
      // keep the one that can be bought
      if (out[at].status !== 'onsale' && ev.status === 'onsale') out[at] = ev
      continue
    }
    seen.set(k, out.length)
    out.push(ev)
  }
  return out
}

/* ── Handler ────────────────────────────────────────── */

export async function onRequest({ request, env, params }: Ctx): Promise<Response> {
  const action = Array.isArray(params.action) ? params.action[0] : params.action
  const origin = request.headers.get('origin')
  const json = jsonFor(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
  if (request.headers.get('x-pelagic') !== '1') return json({ error: 'forbidden' }, 403)
  const key = env.TICKETMASTER_API_KEY
  const url = new URL(request.url)

  if (action === 'status') return json({ configured: !!key })

  if (action === 'artist') {
    if (!key) return json({ error: 'not_configured' }, 503)
    const name = (url.searchParams.get('name') ?? '').trim().slice(0, 200)
    const mbid = (url.searchParams.get('mbid') ?? '').trim().slice(0, 64) || null
    let id = (url.searchParams.get('id') ?? '').trim().slice(0, 64) || null
    if (!name && !id) return json({ error: 'missing_name' }, 400)
    try {
      let found = name
      if (!id) {
        const a = await findAttraction(name, mbid, key)
        if (!a) return json({ found: false })
        id = a.id
        found = a.name
      }
      const events = await eventsOf(id, key)
      return json({ found: true, id, name: found, events })
    } catch (e) {
      const status = e instanceof TmError && e.status === 401 ? 503 : 502
      return json({ error: status === 503 ? 'bad_key' : 'ticketmaster_failed', message: (e as Error).message }, status)
    }
  }

  return json({ error: 'not_found' }, 404)
}
