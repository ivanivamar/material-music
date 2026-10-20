/**
 * Lyrics parsing for Now Playing (step 6).
 *
 * `track.lyrics` holds what the importer read from the FLAC tags: LRC text when
 * `track.syncedLyrics`, otherwise plain lyrics. The parser accepts the usual LRC variants:
 *   [mm:ss.xx] / [mm:ss:xx] / [mm:ss] / [h:mm:ss.xxx] stamps, several stamps on one line,
 *   [offset:±ms], ID tags ([ar:], [ti:], …) ignored, enhanced word stamps <mm:ss.xx> stripped.
 */

export interface LyricLine {
  /** seconds; -1 for unsynced lyrics */
  time: number
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
}

const STAMP = /\[(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?(?:[.:](\d{1,3}))?\]/g
const LINE_STAMPS = /^(\s*\[\d{1,3}:\d{1,2}(?::\d{1,2})?(?:[.:]\d{1,3})?\])+/
const ID_TAG = /^\s*\[([a-z#]+):(.*)\]\s*$/i
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g
/** seconds: a blank stamp shorter than this before the next line isn't shown as a break */
const MIN_BREAK = 4

function stampSeconds(a: string, b: string, c: string | undefined, frac: string | undefined): number {
  // [mm:ss(.xx)] or [h:mm:ss(.xx)]
  const [h, m, s] = c !== undefined ? [+a, +b, +c] : [0, +a, +b]
  const f = frac ? +frac / 10 ** frac.length : 0
  return h * 3600 + m * 60 + s + f
}

export function parseLyrics(raw: string | undefined | null): Lyrics | null {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  if (!text.trim()) return null

  const rows = text.split('\n')
  const looksSynced = rows.some((r) => LINE_STAMPS.test(r))
  // Stamps decide, not the flag: a track tagged synced without stamps is shown plain,
  // and LRC text in a plain lyrics tag still scrolls.
  if (!looksSynced) {
    const lines = rows.map((r) => ({ time: -1, text: r.trim() }))
    // trim leading / trailing blank lines, collapse runs of blanks to one
    const out: LyricLine[] = []
    for (const l of lines) {
      if (!l.text && (!out.length || !out[out.length - 1].text)) continue
      out.push(l)
    }
    while (out.length && !out[out.length - 1].text) out.pop()
    return out.length ? { synced: false, lines: out } : null
  }

  let offset = 0
  const lines: LyricLine[] = []
  for (const row of rows) {
    const stamps = row.match(LINE_STAMPS)
    if (!stamps) {
      const tag = row.match(ID_TAG)
      if (tag && tag[1].toLowerCase() === 'offset') offset = (Number(tag[2].trim()) || 0) / 1000
      continue
    }
    const body = row.slice(stamps[0].length).replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim()
    for (const m of stamps[0].matchAll(STAMP)) lines.push({ time: stampSeconds(m[1], m[2], m[3], m[4]), text: body })
  }
  if (!lines.length) return null
  // LRC offset: positive = lyrics come sooner
  for (const l of lines) l.time = Math.max(0, l.time - offset)
  lines.sort((a, b) => a.time - b.time)
  // drop leading blank stamps and consecutive duplicate blanks
  const deduped: LyricLine[] = []
  for (const l of lines) {
    if (!l.text && (!deduped.length || !deduped[deduped.length - 1].text)) continue
    deduped.push(l)
  }
  // Some sources put a blank stamp after every line (end-of-line marker). Only keep a blank
  // ("· · ·") when the pause before the next line is a real break; short gaps keep the
  // previous line lit.
  const out = deduped.filter((l, i) => {
    if (l.text) return true
    const next = deduped[i + 1]
    return !next || next.time - l.time >= MIN_BREAK
  })
  return out.length ? { synced: true, lines: out } : null
}

/** Index of the line being sung at `t` seconds (-1 before the first line). Binary search. */
export function lineAt(lines: LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}
