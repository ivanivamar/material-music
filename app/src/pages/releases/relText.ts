/** Short texts for a release in the new list layouts (Home shelf, releases page, artist page). */
import { fmtLength, fmtRelShort, isOwned, type FeedItem } from '../../state/releaseViews'
import { albumHref } from '../../shell/routes'

const DAY = 86_400_000
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** "TODAY" · "YESTERDAY" · "3 DAYS AGO" · "08 NOV" */
export function agoLabel(it: FeedItem, now = Date.now()): string {
  const t = new Date(now)
  t.setHours(0, 0, 0, 0)
  const d = Math.round((t.getTime() - it.day) / DAY)
  if (d <= 0) return 'TODAY'
  if (d === 1) return 'YESTERDAY'
  if (d < 14) return `${d} DAYS AGO`
  return fmtRelShort(it.rel.date)
}

/** "FRI 21 NOV" (exact day), else "NOV 2026" */
export function dayLabel(it: FeedItem): string {
  const parts = it.rel.date.split('-')
  if (parts.length < 3) return fmtRelShort(it.rel.date)
  return `${WEEKDAYS[new Date(it.day).getDay()]} ${fmtRelShort(it.rel.date).replace(/^0/, '')}`
}

/** "Album" · "EP" · "Single" · "Live" · "Reissue" */
export function typeWord(it: FeedItem): string {
  return ({ album: 'Album', ep: 'EP', single: 'Single', live: 'Live', other: it.rel.re ? 'Reissue' : 'Other' } as const)[it.rel.type]
}

/** "Album · 11 tracks · 44:18" */
export function relFacts(it: FeedItem): string {
  const n = it.detail?.tracks.length ?? 0
  return [typeWord(it), n ? `${n} ${n === 1 ? 'track' : 'tracks'}` : null, it.detail?.length ? fmtLength(it.detail.length) : null].filter(Boolean).join(' · ')
}

/** A release's first song with a Deezer clip, for PreviewRing. */
export { firstClip } from './clip'

/** A release you already have (all or some of its songs): its album page in the library, else null. */
export function ownedAlbumHref(it: FeedItem): string | null {
  return isOwned(it.status) && it.match?.albumId ? albumHref(it.match.albumId) : null
}
