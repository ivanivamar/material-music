/**
 * Songs with several artists (16 Nov 2026). A track keeps one `artistId` (the main artist) and a
 * display string such as "Night Tide, Kiri no Oto feat. Mira Vell". `songArtists()` turns that
 * string into the list of artists, each linked to the library artist with the same name when there
 * is one, so the player bar, Now Playing, song rows and the ⋯ menu can offer each of them.
 *
 * Splitting: on ", " ";" "&" "feat." "ft." "featuring" "vs." " x " "×" "、" and brackets. Names that
 * contain a separator ("Tyler, The Creator", "Earth, Wind & Fire") stay whole when the library has
 * an artist by that name: at each position the longest run of pieces that is a known name wins.
 * An unknown multi-word piece is kept as one name. Names are matched folded (case, accents,
 * apostrophes, width / NFKC), so "Beyonce" finds "Beyoncé".
 *
 * Only type imports, so tests can load it with node --experimental-strip-types.
 */
import type { Catalogue, Track } from '../state/library'

export interface SongArtist {
  /** as written in the song's artist string (or the library name for the main artist) */
  name: string
  /** library artist id; absent = not in the library */
  id?: string
}

const SEP = /(\s*(?:,|;|&|×|、|\(|\)|\[|\]|\s(?:feat\.?|ft\.?|featuring|vs\.?|x)\s)\s*)/i

/** Folded key for matching names: lower case, no accents / apostrophes, one space between words. */
export function nameKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const indexes = new WeakMap<Catalogue, Map<string, string>>()

/** folded artist name → library artist id (first one wins on a clash). */
function nameIndex(c: Catalogue): Map<string, string> {
  let m = indexes.get(c)
  if (!m) {
    m = new Map()
    for (const a of Object.values(c.artists)) {
      const k = nameKey(a.name)
      if (k && !m.has(k)) m.set(k, a.id)
    }
    indexes.set(c, m)
  }
  return m
}

const cache = new WeakMap<Catalogue, Map<string, SongArtist[]>>()

/** The artists of a song, main artist first. One entry for a single-artist song. */
export function songArtists(t: Pick<Track, 'artist' | 'artistId'>, c: Catalogue): SongArtist[] {
  let byKey = cache.get(c)
  if (!byKey) cache.set(c, (byKey = new Map()))
  const key = `${t.artistId}\u0000${t.artist}`
  let out = byKey.get(key)
  if (!out) byKey.set(key, (out = compute(t, c)))
  return out
}

function compute(t: Pick<Track, 'artist' | 'artistId'>, c: Catalogue): SongArtist[] {
  const index = nameIndex(c)
  const main = c.artists[t.artistId]
  const whole = (t.artist ?? '').trim()
  const one = (): SongArtist[] => [main ? { name: whole || main.name, id: main.id } : { name: whole }]
  if (!whole) return main ? [{ name: main.name, id: main.id }] : []
  // the whole string is one artist (or names the main artist): nothing to split
  const wk = nameKey(whole)
  if (index.has(wk) || (main && nameKey(main.name) === wk)) return one()

  // pieces and the separators between them: [p0, s0, p1, s1, p2 …]
  // ("A (feat. B)" / "A feat. B" at the start of a piece: the feat. word goes, the comma splits)
  const raw = whole.replace(/[([]\s*(?:feat\.?|ft\.?|featuring)\s+/gi, ', ').split(SEP)
  const parts: string[] = []
  const seps: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (i % 2 === 0) parts.push(raw[i])
    else seps.push(raw[i])
  }
  const joined = (a: number, b: number) => {
    let s = parts[a]
    for (let k = a; k < b; k++) s += seps[k] + parts[k + 1]
    return s.trim()
  }

  const found: SongArtist[] = []
  let i = 0
  while (i < parts.length) {
    if (!parts[i].trim()) {
      i++
      continue
    }
    let taken = false
    for (let j = parts.length - 1; j > i; j--) {
      if (!parts[j].trim()) continue // a run never ends on an empty piece ("…Oto)" + "")
      const name = joined(i, j)
      const id = index.get(nameKey(name))
      if (id) {
        found.push({ name, id })
        i = j + 1
        taken = true
        break
      }
    }
    if (taken) continue
    const name = parts[i].trim()
    const k = nameKey(name)
    if (k) found.push({ name, id: index.get(k) ?? (main && nameKey(main.name) === k ? main.id : undefined) })
    i++
  }

  // one entry per artist
  const seen = new Set<string>()
  const list = found.filter((a) => {
    const k = a.id ?? `?${nameKey(a.name)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (list.length <= 1) return one()

  // the main artist first; if no piece matched it, it's the first name spelled another way
  if (main) {
    const at = list.findIndex((a) => a.id === main.id)
    if (at > 0) list.unshift(...list.splice(at, 1))
    else if (at < 0) {
      if (!list[0].id) list[0] = { name: list[0].name, id: main.id }
      else list.unshift({ name: main.name, id: main.id })
    }
  }
  return list
}

/** Deezer artist search, for an artist who isn't in the library. */
export const deezerArtistSearch = (name: string) => `https://www.deezer.com/search/${encodeURIComponent(name)}/artist`
