/**
 * Batch Upload (step 24): pure helpers to find a release's problems from its files' tags.
 * No store access here, so this is easy to check on its own.
 *
 * Missing tracks, per disc: first from the track total (TRACKTOTAL / TOTALTRACKS, or the "7/13" form of
 * TRACKNUMBER — `TrackMeta.trackTotal`), else from gaps in the track numbers (1…highest). With no total
 * and no gap nothing is flagged; a missing *last* track can only be seen through the total.
 */

export interface TrackNo {
  disc: number
  track?: number
  trackTotal?: number
}

export interface MissingInfo {
  /** "07", or "2-07" when the release has several discs */
  labels: string[]
  /** missing as [disc, track] */
  slots: [number, number][]
  /** expected track count (found + missing) */
  total: number
  /** the total came from a tag (else from the gaps) */
  fromTag: boolean
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** Cell / issue label for disc `d`, track `n`. */
export const slotLabel = (d: number, n: number, multiDisc: boolean) => (multiDisc ? `${d}-${pad2(n)}` : pad2(n))

export function findMissing(tracks: TrackNo[]): MissingInfo {
  const byDisc = new Map<number, { nums: Set<number>; total?: number }>()
  for (const t of tracks) {
    const d = byDisc.get(t.disc) ?? { nums: new Set<number>() }
    if (t.track) d.nums.add(t.track)
    if (t.trackTotal && (!d.total || t.trackTotal > d.total)) d.total = t.trackTotal
    byDisc.set(t.disc, d)
  }
  const multi = byDisc.size > 1
  const slots: [number, number][] = []
  let total = 0
  let fromTag = false
  for (const [disc, d] of [...byDisc].sort((a, b) => a[0] - b[0])) {
    const max = d.nums.size ? Math.max(...d.nums) : 0
    const upto = d.total ? Math.max(d.total, max) : max
    if (d.total) fromTag = true
    let present = 0
    for (let n = 1; n <= upto; n++) {
      if (d.nums.has(n)) present++
      else slots.push([disc, n])
    }
    // tracks without a number still count as found
    const unnumbered = tracks.filter((t) => t.disc === disc && !t.track).length
    total += Math.max(upto, present) + unnumbered
  }
  return { slots, labels: slots.map(([d, n]) => slotLabel(d, n, multi)), total, fromTag }
}

/** "07" · "07 and 09" · "03, 07 and 09" */
export function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}
