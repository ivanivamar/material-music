/**
 * Home → New releases (Nov 2026 canvas, row 1): Out now releases of the last 30 days from your
 * artists (the New Releases sweep, followed Deezer artists included), new ones first. A card opens
 * the release on the New releases page. Not in the library → a preview button (30 s, Deezer); in
 * the library → Play; partly there → "4/11". The last card counts what's coming and opens the page.
 * Hidden when there's nothing.
 */
import { useEffect, useMemo } from 'react'
import { Icon } from '../../design/icons'
import { PreviewRing } from '../../components/list/PreviewRing'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import type { Catalogue } from '../../state/library'
import { useReleases } from '../../state/releases'
import { buildFeed, isOwned, type FeedItem } from '../../state/releaseViews'
import { stopPreview } from '../../state/preview'
import { go, href } from '../../shell/routes'
import { ReleaseCover, canPreview, ownedCount, playRelease } from '../releases/parts'
import { agoLabel, dayLabel, firstClip, typeWord } from '../releases/relText'

const DAY = 86_400_000
const MAX = 12

export interface HomeReleases {
  items: FeedItem[]
  upcoming: FeedItem[]
  fresh: number
}

export function useHomeReleases(c: Catalogue | null): HomeReleases {
  const rs = useReleases()
  const history = useHistory()
  const feed = c ? buildFeed(rs.doc, c, history.plays, rs.prefs) : null
  // a preview started here doesn't follow you off Home
  useEffect(() => () => stopPreview(), [])
  return useMemo(() => {
    if (!feed) return { items: [], upcoming: [], fresh: 0 }
    const cut = Date.now() - 30 * DAY
    const live = feed.all.filter((it) => it.status !== 'gone' && !it.muted)
    // complete in the library counts too here (isVisible hides those on the page)
    const out = live.filter((it) => !it.upcoming && it.day >= cut && (it.visible || it.status === 'lib'))
    out.sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || b.day - a.day)
    const upcoming = live.filter((it) => it.upcoming && it.visible).sort((a, b) => a.day - b.day)
    return { items: out.slice(0, MAX), upcoming, fresh: out.filter((it) => it.status === 'new').length }
  }, [feed])
}

const openRelease = (it: FeedItem) => go(`${href('new')}?rel=${encodeURIComponent(it.rel.id)}`)

export function ReleaseCard({ item, size }: { item: FeedItem; size: number }) {
  const online = useOnline()
  const owned = isOwned(item.status)
  const tag = item.status === 'lib' ? 'IN LIBRARY' : item.status === 'pre' || item.status === 'part' ? `${ownedCount(item, true)} IN LIBRARY` : item.status === 'acq' ? 'MATCHING' : null
  return (
    <div className={`hcard rs-card ${item.status === 'seen' ? 'is-seen' : ''}`} style={{ width: size }} role="link" tabIndex={0} onClick={() => openRelease(item)} onKeyDown={(e) => e.key === 'Enter' && openRelease(item)}>
      <div className="hcard-art rs-art" style={{ width: size, height: size }}>
        <span className="hcard-cover">
          <ReleaseCover item={item} size="sm" />
        </span>
        {item.status === 'new' && <span className="ax-dot rs-dot" aria-label="New" role="img" />}
        {tag && <span className={`rs-tag ${item.status === 'lib' ? 'is-on' : ''}`}>{tag}</span>}
        <span className="rs-btn" onClick={(e) => e.stopPropagation()}>
          {owned ? (
            <button type="button" className="hx-cplay rs-play" aria-label={`Play ${item.rel.t}`} onClick={() => playRelease(item)}>
              <Icon name="playF" />
            </button>
          ) : (
            canPreview(item) && online && <PreviewRing id={item.rel.id} load={() => firstClip(item)} label={`Preview ${item.rel.t}`} size={40} solid />
          )}
        </span>
      </div>
      <div className="hcard-text">
        <span className="hcard-t">{item.rel.t}</span>
        <span className="hcard-s">
          {item.owners[0]?.name ?? item.rel.a} · {typeWord(item)}
        </span>
        <span className="rs-when">{agoLabel(item)}</span>
      </div>
    </div>
  )
}

export function SoonCard({ upcoming, size }: { upcoming: FeedItem[]; size: number }) {
  const next = upcoming[0]
  const reminders = upcoming.filter((it) => it.reminded).length
  const s = Math.round(size * 0.42)
  return (
    <a className="hcard rs-soon" style={{ width: size }} href={href('new')}>
      <span className="rs-soon-art" style={{ width: size, height: size }}>
        {upcoming.slice(0, 3).map((it, i) => (
          <span key={it.rel.id} className="rs-soon-cover" style={{ width: s, height: s, left: 14 + i * Math.round(s * 0.42), top: 18 + i * 8 }}>
            <ReleaseCover item={it} size="xs" />
          </span>
        ))}
        {reminders > 0 && (
          <span className="rs-soon-rem">
            <Icon name="bellF" />
            {reminders} {reminders === 1 ? 'REMINDER' : 'REMINDERS'} ON
          </span>
        )}
      </span>
      <span className="hcard-text">
        <span className="hcard-t">{upcoming.length} coming soon</span>
        <span className="hcard-s">
          Next: {next.rel.t} · {dayLabel(next).replace(/^([A-Z]{3}) (\d+) ([A-Z]{3})$/, (_, w: string, d: string, m: string) => `${w[0]}${w.slice(1).toLowerCase()} ${d} ${m[0]}${m.slice(1).toLowerCase()}`)}
        </span>
        <span className="rs-when">SEE ALL</span>
      </span>
    </a>
  )
}

