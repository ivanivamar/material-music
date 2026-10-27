/**
 * Concerts views: the Ticketmaster cache + the hand-added shows turned into what the screens list.
 * One `Show` per event (a festival with three library artists is one show, under the first artist
 * you follow, the others as "+ 2 artists you have"), with its distance from the home city and its
 * status chip text. "In library" is never stored; it's matched here from the catalogue.
 */
import type { IconName } from '../design/icons'
import type { Catalogue } from './library'
import type { ReleasesDoc } from './releases'
import { isoDay, kmBetween, type ConcertsDoc, type ConcertsState, type Ev, type ManualShow, type TmStatus } from './concerts'

export type ShowStatus = TmStatus | 'mine'
export type ShowFilter = 'all' | 'next30' | 'onsale' | 'following'

export interface Show {
  key: string
  /** primary library artist */
  artistId: string
  /** other library artists on the bill (festivals) */
  others: string[]
  date: string
  end?: string
  time?: string
  status: ShowStatus
  venue: string
  city: string
  country: string
  /** km from the home city; null = unknown (or a show added by hand) */
  km: number | null
  price?: string
  url?: string
  festival?: string
  isNew: boolean
  followed: boolean
  ev?: Ev
  manual?: ManualShow
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/* ── Formatting ─────────────────────────────────────── */

export function fmtPrice(p: Ev['price']): string | undefined {
  if (!p) return undefined
  try {
    const f = new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.cur || 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 })
    const lo = f.format(Math.round(p.min))
    return p.max ? `${lo}–${Math.round(p.max)}` : lo
  } catch {
    return p.max ? `${Math.round(p.min)}–${Math.round(p.max)}` : String(Math.round(p.min))
  }
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Date block parts: OCT · 29 · Thu (festivals: 5–6 · Sat–Sun). */
export function dateParts(s: Pick<Show, 'date' | 'end'>): { mon: string; day: string; dow: string; two: boolean } {
  const a = day(s.date)
  const b = s.end ? day(s.end) : null
  const two = !!b && b.getTime() !== a.getTime()
  return {
    mon: MON[a.getMonth()].toUpperCase(),
    day: two ? `${a.getDate()}–${b!.getDate()}` : String(a.getDate()),
    dow: two ? `${DOW[a.getDay()]}–${DOW[b!.getDay()]}` : DOW[a.getDay()],
    two,
  }
}

/** Mono date line: SAT 21 NOV · 19:00 (two days: SAT 5 – SUN 6 DEC). */
export function dateLine(s: Pick<Show, 'date' | 'end' | 'time'>): string {
  const a = day(s.date)
  const b = s.end ? day(s.end) : null
  let t: string
  if (b && b.getTime() !== a.getTime()) {
    t = b.getMonth() === a.getMonth() ? `${DOW[a.getDay()]} ${a.getDate()} – ${DOW[b.getDay()]} ${b.getDate()} ${MON[b.getMonth()]}` : `${DOW[a.getDay()]} ${a.getDate()} ${MON[a.getMonth()]} – ${DOW[b.getDay()]} ${b.getDate()} ${MON[b.getMonth()]}`
  } else t = `${DOW[a.getDay()]} ${a.getDate()} ${MON[a.getMonth()]}`
  return (t + (s.time ? ` · ${s.time}` : '')).toUpperCase()
}

/** Short date: "Thu 29 Oct". */
export function shortDate(iso: string): string {
  const d = day(iso)
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`
}

/** "Thu 29 Oct, 10:00" from an ISO instant (local time). */
function instant(iso: string): string {
  const d = new Date(iso)
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}, ${clock(d)}`
}

export const timeLabel = (s: Pick<Show, 'time'>) => s.time ?? 'Time TBA'
export const kmLabel = (km: number | null) => (km == null ? '' : `${Math.max(1, Math.round(km))} km`)

/** Meta line: 20:30 · 3 km · €38–52 */
export function metaLine(s: Show, withPrice = true): string {
  return [timeLabel(s), kmLabel(s.km), withPrice ? s.price : undefined].filter(Boolean).join(' · ')
}

/* ── Status chips ───────────────────────────────────── */

export interface StatusLook {
  label: string
  icon: IconName
  /** small note next to the chip ("Presale until …") */
  note?: string
  /** Tickets button style; none = no button */
  tk: 'tonal' | 'outlined' | 'none'
  /** "On sale now" filter + posters */
  buy: boolean
}

export function statusLook(s: Show): StatusLook {
  const ev = s.ev
  switch (s.status) {
    case 'onsale':
      return { label: 'On sale', icon: 'ticket', tk: 'tonal', buy: true }
    case 'presale':
      return { label: 'Presale', icon: 'key', note: ev?.presaleEnd ? `Presale until ${instant(ev.presaleEnd)}` : undefined, tk: 'tonal', buy: true }
    case 'resched':
      return { label: 'Rescheduled', icon: 'eventRepeat', note: ev?.movedFrom ? `Moved from ${shortDate(ev.movedFrom)}` : undefined, tk: 'tonal', buy: true }
    case 'notyet': {
      const at = ev?.saleStart ? new Date(ev.saleStart) : null
      return { label: at ? `On sale ${at.getDate()} ${MON[at.getMonth()]}` : 'Not on sale yet', icon: 'upcoming', note: ev?.saleStart ? instant(ev.saleStart) : undefined, tk: 'outlined', buy: false }
    }
    case 'soldout':
      return { label: 'Sold out', icon: 'block', tk: 'outlined', buy: false }
    case 'postponed':
      return { label: 'Postponed', icon: 'postponed', note: 'New date to be announced', tk: 'outlined', buy: false }
    case 'cancelled':
      return { label: 'Cancelled', icon: 'eventBusy', tk: 'none', buy: false }
    case 'mine':
      return { label: 'Added by you', icon: 'edit', tk: s.url ? 'tonal' : 'none', buy: false }
  }
}

export const FILTERS: { id: ShowFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'next30', label: 'Next 30 days' },
  { id: 'onsale', label: 'On sale now' },
  { id: 'following', label: 'Artists I follow' },
]

export function filterFn(f: ShowFilter, now = Date.now()): (s: Show) => boolean {
  const limit = isoDay(now + 30 * 86_400_000)
  switch (f) {
    case 'all':
      return () => true
    case 'next30':
      return (s) => s.date <= limit
    case 'onsale':
      return (s) => statusLook(s).buy
    case 'following':
      return (s) => s.followed
  }
}

/* ── Building the lists ─────────────────────────────── */

/** Library artist ids by folded name, for matching festival line-ups. */
function nameIndex(c: Catalogue): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of Object.values(c.artists)) if (!m.has(norm(a.name))) m.set(norm(a.name), a.id)
  return m
}

interface Built {
  /** every upcoming show (Ticketmaster + by hand), any distance, by date */
  all: Show[]
  byArtist: Map<string, Show[]>
}

/**
 * Every upcoming show, deduplicated by event. `seenAt`: Concerts was last opened before this visit
 * (events first seen after it are "new").
 */
export function buildShows(c: Catalogue, st: ConcertsState, doc: ConcertsDoc, rel: ReleasesDoc, seenAt: number, now = Date.now()): Built {
  const today = isoDay(now)
  const home = doc.home[0]
  const names = nameIndex(c)
  const following = (id: string) => !rel.muted[id]?.[0]
  // event id → the event + the library artists whose tour lists it
  const evs = new Map<string, { ev: Ev; artists: string[] }>()
  for (const [artistId, tour] of Object.entries(st.tours)) {
    if (!c.artists[artistId]) continue
    for (const ev of tour.events) {
      if ((ev.end ?? ev.date) < today) continue
      const hit = evs.get(ev.id)
      if (hit) {
        if (!hit.artists.includes(artistId)) hit.artists.push(artistId)
      } else evs.set(ev.id, { ev, artists: [artistId] })
    }
  }
  const all: Show[] = []
  for (const { ev, artists } of evs.values()) {
    // line-up order (headliner first), plus library artists named on the bill we haven't swept
    const ids: string[] = []
    for (const l of ev.lineup) {
      const byName = names.get(norm(l.name))
      const id = artists.find((a) => norm(c.artists[a].name) === norm(l.name)) ?? byName
      if (id && !ids.includes(id)) ids.push(id)
    }
    for (const a of artists) if (!ids.includes(a)) ids.push(a)
    const primary = ids.find(following) ?? ids[0]
    const km = home && ev.venue.lat != null && ev.venue.lon != null ? kmBetween(home, { lat: ev.venue.lat, lon: ev.venue.lon }) : home && norm(ev.venue.city) === norm(home.name) ? 0 : null
    const fs = st.firstSeen[ev.id] ?? 0
    all.push({
      key: ev.id,
      artistId: primary,
      others: ids.filter((x) => x !== primary),
      date: ev.date,
      end: ev.end,
      time: ev.time,
      status: ev.status,
      venue: ev.venue.name,
      city: ev.venue.city,
      country: ev.venue.country,
      km,
      price: fmtPrice(ev.price),
      url: ev.url,
      festival: ev.festival,
      isNew: fs > 0 && fs > seenAt,
      followed: ids.some(following),
      ev,
    })
  }
  for (const [id, [m]] of Object.entries(doc.manual)) {
    if (!m || m.date < today || !c.artists[m.artistId]) continue
    all.push({
      key: `m:${id}`,
      artistId: m.artistId,
      others: [],
      date: m.date,
      time: m.time || undefined,
      status: 'mine',
      venue: m.venue,
      city: m.city,
      country: '',
      km: null,
      url: m.link ? (/^https?:\/\//i.test(m.link) ? m.link : `https://${m.link}`) : undefined,
      isNew: false,
      followed: following(m.artistId),
      manual: m,
    })
  }
  all.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.key.localeCompare(b.key))
  const byArtist = new Map<string, Show[]>()
  for (const s of all)
    for (const id of [s.artistId, ...s.others]) {
      const l = byArtist.get(id)
      if (l) l.push(s)
      else byArtist.set(id, [s])
    }
  return { all, byArtist }
}

/** Inside the circle: known distance ≤ radius, or added by hand. */
export const isNear = (s: Show, radius: number) => s.status === 'mine' || (s.km != null && s.km <= radius)

export function nearbyShows(b: Built, radius: number): Show[] {
  return b.all.filter((s) => isNear(s, radius))
}

/** Month groups for the list under the posters ("January 2027" outside this year). */
export function monthGroups(shows: Show[], now = Date.now()): { key: string; label: string; items: Show[] }[] {
  const out: { key: string; label: string; items: Show[] }[] = []
  const year = new Date(now).getFullYear()
  for (const s of shows) {
    const d = day(s.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = out[out.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: MONTH[d.getMonth()] + (d.getFullYear() !== year ? ` ${d.getFullYear()}` : ''), items: [] }
      out.push(g)
    }
    g.items.push(s)
  }
  return out
}

/** "in Europe and North America" for the far dates of a tour. */
export function regionsLabel(shows: Show[]): string {
  const regions: string[] = []
  for (const s of shows) {
    const r = region(s.ev?.venue.cc ?? '')
    if (r && !regions.includes(r)) regions.push(r)
  }
  if (!regions.length) return ''
  if (regions.length === 1) return `in ${regions[0]}`
  if (regions.length === 2) return `in ${regions[0]} and ${regions[1]}`
  return `in ${regions.slice(0, -1).join(', ')} and ${regions[regions.length - 1]}`
}

const EU = new Set('AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK'.split(' '))
const NA = new Set('US CA MX'.split(' '))
const SA = new Set('AR BO BR CL CO EC PE PY UY VE'.split(' '))
const AS = new Set('JP KR CN TW HK SG TH MY ID PH VN IN AE QA SA IL TR'.split(' '))
const OC = new Set('AU NZ'.split(' '))
function region(cc: string): string | null {
  const c = cc.toUpperCase()
  if (EU.has(c)) return 'Europe'
  if (NA.has(c)) return 'North America'
  if (SA.has(c)) return 'South America'
  if (AS.has(c)) return 'Asia'
  if (OC.has(c)) return 'Oceania'
  if (c) return 'other places'
  return null
}

/** "Updated today, 06:10" / "yesterday, 06:10" / "Mon 26 Oct, 06:10". */
export function updatedLabel(ms: number | null, now = Date.now()): string {
  if (!ms) return 'Not checked yet'
  const d = new Date(ms)
  const t = isoDay(ms)
  const when = t === isoDay(now) ? 'today' : t === isoDay(now - 86_400_000) ? 'yesterday' : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`
  return `${when}, ${clock(d)}`
}

/** When the dates on screen are from: the last full refresh, else the newest artist fetch. */
export function lastUpdated(st: ConcertsState): number | null {
  if (st.sweptAt) return st.sweptAt
  let best = 0
  for (const t of Object.values(st.tours)) if (t.at > best) best = t.at
  return best || null
}

/** Library artists for "Add a show": name match, most releases first. */
export function artistMatches(c: Catalogue, q: string, max = 4): { id: string; name: string; releases: number }[] {
  const f = norm(q)
  if (!f) return []
  const counts = new Map<string, number>()
  for (const al of Object.values(c.albums)) counts.set(al.artistId, (counts.get(al.artistId) ?? 0) + 1)
  return Object.values(c.artists)
    .filter((a) => norm(a.name).includes(f))
    .map((a) => ({ id: a.id, name: a.name, releases: counts.get(a.id) ?? 0, starts: norm(a.name).startsWith(f) }))
    .sort((a, b) => Number(b.starts) - Number(a.starts) || b.releases - a.releases || a.name.localeCompare(b.name))
    .slice(0, max)
}

export const radiusHint = (r: number) => (r <= 25 ? 'Only shows in and right around the city' : r <= 50 ? 'City and nearby towns' : r <= 100 ? 'Day trips by train or car' : 'Worth a weekend away')

export const cityLabel = (c: { name: string; country: string }) => (c.country ? `${c.name}, ${c.country}` : c.name)
