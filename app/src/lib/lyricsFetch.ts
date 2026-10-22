/**
 * Lyrics from LRCLIB (https://lrclib.net), a free public lyrics source with synced (LRC) and plain
 * lyrics, no key, CORS open — so the app asks it straight from the browser / the Android WebView.
 *
 *   GET /api/get?artist_name&track_name&album_name&duration   exact match (duration ±2 s)
 *   GET /api/search?track_name&artist_name                    fallback, we pick the best row
 *
 * Synced lyrics win over plain ones. The text is stored exactly like the FLAC tag text the importer
 * reads (`track.lyrics` = LRC text or plain text, `track.syncedLyrics`), so Now Playing needs no change.
 */

const BASE = 'https://lrclib.net/api'
/** seconds: a search hit counts when its length is this close to ours */
const DURATION_SLACK = 3

export type LyricsLookup =
  | { kind: 'found'; text: string; synced: boolean }
  /** LRCLIB knows the song and says it has no words */
  | { kind: 'instrumental' }
  | { kind: 'none' }

export class LyricsOffline extends Error {
  constructor(msg = 'Could not reach LRCLIB') {
    super(msg)
    this.name = 'LyricsOffline'
  }
}

interface Row {
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s+-\s+.*$/, ' ') // " - Remastered 2011", " - Live"
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, { signal, headers: { Accept: 'application/json' } })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new LyricsOffline()
  }
  if (res.status === 404) return null
  if (res.status === 429 || res.status >= 500) throw new LyricsOffline(`LRCLIB answered ${res.status}`)
  if (!res.ok) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

const hasText = (s: string | null | undefined): s is string => !!s && /\S/.test(s)

/** What a row gives us: synced first, else plain, else instrumental / nothing. */
function pick(r: Row): LyricsLookup | null {
  if (hasText(r.syncedLyrics) && /\[\d{1,3}:\d{2}/.test(r.syncedLyrics)) return { kind: 'found', text: r.syncedLyrics.trim(), synced: true }
  if (hasText(r.plainLyrics)) return { kind: 'found', text: r.plainLyrics.trim(), synced: false }
  if (r.instrumental) return { kind: 'instrumental' }
  return null
}

export interface LyricsQuery {
  title: string
  artist: string
  album?: string
  /** seconds */
  duration?: number
}

export async function lookupLyrics(q: LyricsQuery, signal?: AbortSignal): Promise<LyricsLookup> {
  const dur = q.duration && q.duration > 0 ? Math.round(q.duration) : null
  // 1. exact match
  const p = new URLSearchParams({ artist_name: q.artist, track_name: q.title })
  if (q.album) p.set('album_name', q.album)
  if (dur) p.set('duration', String(dur))
  const exact = await getJson<Row>(`get?${p}`, signal)
  const first = exact ? pick(exact) : null
  if (first?.kind === 'found' && first.synced) return first

  // 2. search: the best row for this song (same title + artist, length within a few seconds)
  const s = new URLSearchParams({ track_name: q.title, artist_name: q.artist })
  const rows = (await getJson<Row[]>(`search?${s}`, signal)) ?? []
  const title = fold(q.title)
  const artist = fold(q.artist)
  const scored = rows
    .filter((r) => fold(r.trackName ?? '') === title && (fold(r.artistName ?? '') === artist || fold(r.artistName ?? '').includes(artist) || artist.includes(fold(r.artistName ?? '') || '\0')))
    .filter((r) => !dur || r.duration == null || Math.abs(r.duration - dur) <= DURATION_SLACK)
    .map((r) => ({ r, got: pick(r), d: dur && r.duration != null ? Math.abs(r.duration - dur) : 0 }))
    .filter((x): x is { r: Row; got: LyricsLookup; d: number } => x.got !== null)
    .sort((a, b) => Number(b.got.kind === 'found' && b.got.synced) - Number(a.got.kind === 'found' && a.got.synced) || a.d - b.d)
  const best = scored.find((x) => x.got.kind === 'found')?.got ?? null
  if (best && (!first || first.kind !== 'found' || best.kind === 'found')) return best
  if (first) return first
  if (scored[0]) return scored[0].got
  return { kind: 'none' }
}
