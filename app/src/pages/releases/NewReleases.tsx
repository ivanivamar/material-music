/**
 * New releases (Nov 2026 canvas "New releases page"): one page, your artists only — the daily
 * MusicBrainz sweep of the library artists plus the Deezer artists you follow. Related artists live
 * on the artist pages now (Fans also like), so there is no Discover tab, no hero and no tabs.
 *
 *   FROM 142 ARTISTS YOU FOLLOW · CHECKED TODAY 06:12
 *   New releases                                              ⟳  [⚙ Followed artists]
 *   (All) (Albums) (Singles & EPs)                     2 NEW · 3 SEEN   (Show seen)
 *   COMING SOON ——— n          compact cards, bell = remind me (notification at 09:00 on Android)
 *   THIS WEEK ———               rows: cover · title / artist / facts · status · Preview | Play · ✓ 👁 ✕
 *   EARLIER THIS MONTH ———
 *   OLDER ———
 *
 * A row opens the release panel (tracklist with previews, links, match), or the album when it's
 * already in the library (all or some songs; desktop rows keep an ⓘ for the panel). Phone: swipe a row right for
 * seen, left to dismiss. `#/new?rel=<id>` (Home, notifications) opens a release; `?artists` the list.
 */
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Alert, Button, EmptyState, IconButton, LinearProgress } from '../../components/ui'
import { Icon } from '../../design/icons'
import { PreviewRing } from '../../components/list/PreviewRing'
import { ListSection } from '../../components/list/SongList'
import { SectionHead } from '../library/common'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import { nowPlayingStore } from '../../state/nowPlaying'
import { releasesStore, sweepTargets, useReleases, type ReleasesState } from '../../state/releases'
import { buildFeed, fmtStamp, isOwned, type FeedItem } from '../../state/releaseViews'
import { stopPreview, usePreview } from '../../state/preview'
import { useIsPhone } from '../../state/viewport'
import { go, href, replace } from '../../shell/routes'
import { registerBack } from '../../native/backButton'
import { FollowedArtists, ReleaseDetail, ReleasePanel, type PanelState } from './ReleasePanel'
import { MatchingVeil, OwnedTag, PreviewButton, ReleaseCover, SwipeRow, canPreview, ownedCount, playRelease, useReleaseActions, type ReleaseActions } from './parts'
import { agoLabel, dayLabel, firstClip, ownedAlbumHref, relFacts } from './relText'

type TypeFilter = 'all' | 'album' | 'short'
const TYPES: [TypeFilter, string][] = [
  ['all', 'All'],
  ['album', 'Albums'],
  ['short', 'Singles & EPs'],
]
let sessionType: TypeFilter = 'all'
const DAY = 86_400_000
const SOON_SHOWN = 6

export function NewReleases() {
  const { data } = useLibrary()
  if (!data) return null
  return <Page c={data} />
}

function panelFromHash(): PanelState {
  const h = window.location.hash
  if (h.includes('?artists')) return { kind: 'artists' }
  const m = /\?rel=([^&]+)/.exec(h)
  if (m) {
    try {
      return { kind: 'rel', id: decodeURIComponent(m[1]) }
    } catch {
      return null
    }
  }
  return null
}

/** Seen by the user (a release that's partly in the library follows its stored mark). */
const isSeen = (it: FeedItem) => it.status === 'seen' || (isOwned(it.status) && it.mark === 'seen')

function Page({ c }: { c: Catalogue }) {
  const rs = useReleases()
  const history = useHistory()
  const phone = useIsPhone()
  const online = useOnline()
  const feed = buildFeed(rs.doc, c, history.plays, rs.prefs)
  const artistsN = useMemo(() => sweepTargets(c, rs.doc).length, [c, rs.doc])
  const [type, setTypeState] = useState<TypeFilter>(sessionType)
  const setType = (t: TypeFilter) => {
    sessionType = t
    setTypeState(t)
  }
  const showSeen = rs.prefs.status !== 'new'
  const [allSoon, setAllSoon] = useState(false)

  const [panel, setPanelState] = useState<PanelState>(() => panelFromHash())
  const [shown, setShown] = useState<PanelState>(panel)
  useEffect(() => {
    const take = () => {
      const p = panelFromHash()
      if (!p) return
      setPanelState(p)
      setShown(p)
      if (p.kind === 'rel') {
        const m = releasesStore.get().doc.marks[p.id]?.[0]
        if (!m || m === 'new') releasesStore.mark(p.id, 'seen')
      }
      replace(href('new'))
    }
    take()
    window.addEventListener('hashchange', take)
    return () => window.removeEventListener('hashchange', take)
  }, [])

  const setPanel = (p: PanelState | ((prev: PanelState) => PanelState)) =>
    setPanelState((prev) => {
      const next = typeof p === 'function' ? p(prev) : p
      if (next) setShown(next)
      return next
    })
  const close = () => setPanelState(null)
  const act = useReleaseActions({ onDismissed: (id) => setPanel((p) => (p?.kind === 'rel' && p.id === id ? null : p)) })

  // a song preview doesn't follow you out of New releases
  useEffect(() => () => stopPreview(), [])

  useEffect(() => {
    if (releasesStore.due()) void releasesStore.sweep()
    else void releasesStore.fillDetails()
  }, [])

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (nowPlayingStore.get().open) return
      e.preventDefault()
      setPanelState(null)
    }
    window.addEventListener('keydown', onKey)
    const unBack = registerBack(() => {
      setPanelState(null)
      return true
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unBack()
    }
  }, [panel])

  const details = (it: FeedItem) => {
    if (it.status === 'new') releasesStore.mark(it.rel.id, 'seen')
    setPanel({ kind: 'rel', id: it.rel.id })
  }
  // in the library (all or some songs) → its album; else the panel
  const open = (it: FeedItem) => {
    const lib = ownedAlbumHref(it)
    if (!lib) return details(it)
    if (it.status === 'new' || it.mark === 'new') releasesStore.mark(it.rel.id, 'seen')
    go(lib)
  }
  const detailItem = shown?.kind === 'rel' ? feed.byId.get(shown.id) : undefined

  // what the page shows: visible releases (not dismissed, not complete in the library, artist followed)
  const view = useMemo(() => {
    const byType = (it: FeedItem) => type === 'all' || (type === 'album' ? it.rel.type === 'album' : it.rel.type === 'ep' || it.rel.type === 'single')
    const live = feed.all.filter((it) => it.visible && byType(it))
    const soon = live.filter((it) => it.upcoming).sort((a, b) => a.day - b.day)
    const out = live.filter((it) => !it.upcoming)
    const counts = { fresh: out.filter((it) => !isSeen(it)).length, seen: out.filter(isSeen).length }
    const list = showSeen ? out : out.filter((it) => it.status === 'acq' || !isSeen(it))
    const t0 = new Date()
    t0.setHours(0, 0, 0, 0)
    const weekStart = t0.getTime() - 6 * DAY
    const monthStart = new Date(t0.getFullYear(), t0.getMonth(), 1).getTime()
    const groups = [
      { key: 'week', label: 'This week', items: list.filter((it) => it.day >= weekStart) },
      { key: 'month', label: 'Earlier this month', items: list.filter((it) => it.day < weekStart && it.day >= monthStart) },
      { key: 'older', label: 'Older', items: list.filter((it) => it.day < Math.min(weekStart, monthStart)) },
    ].filter((g) => g.items.length)
    return { soon, counts, groups, any: live.length > 0 }
  }, [feed, type, showSeen])

  const firstSweep = !rs.doc.sweep.at
  const soonShown = allSoon ? view.soon : view.soon.slice(0, phone ? 12 : SOON_SHOWN)

  return (
    <div className={`rl ${phone ? 'is-phone' : ''}`}>
      <Header rs={rs} artistsN={artistsN} phone={phone} online={online} onArtists={() => setPanel({ kind: 'artists' })} />

      {!online && (
        <Alert tone="info" icon="offline" actions={rs.doc.sweep.at && <span className="nr-mono">LAST CHECKED {fmtStamp(rs.doc.sweep.at)}</span>}>
          No signal. Showing the last check. Previews need a connection.
        </Alert>
      )}
      {rs.error && (
        <Alert
          tone="danger"
          icon="alert"
          role="alert"
          actions={
            <Button variant="ghost" size="sm" onClick={() => void releasesStore.sweep({ manual: true })}>
              Retry
            </Button>
          }
        >
          Couldn’t complete the check. {rs.error.status === 503 || rs.error.status === 429 ? 'MusicBrainz rate limited. Retrying shortly.' : 'MusicBrainz request failed.'}
        </Alert>
      )}

      {(view.any || type !== 'all' || !firstSweep) && (
        <div className="sl-tools rl-tools">
          {TYPES.map(([k, label]) => (
            <button key={k} type="button" className={`sl-chip ${type === k ? 'is-on' : ''}`} aria-pressed={type === k} onClick={() => setType(k)}>
              {label}
            </button>
          ))}
          <span className="lh-flex" />
          {!phone && (
            <span className="lh-sorted">
              {view.counts.fresh} new · {view.counts.seen} seen
            </span>
          )}
          <button type="button" className={`sl-chip ${showSeen ? 'is-on' : ''}`} aria-pressed={showSeen} onClick={() => releasesStore.setPrefs({ status: showSeen ? 'new' : 'all' })}>
            <Icon name="eye" />
            Show seen
          </button>
        </div>
      )}

      {view.soon.length > 0 && (
        <section className="lp-sec rl-soon">
          {phone ? <ListSection phone label="Coming soon" right={String(view.soon.length)} /> : <SectionHead label="COMING SOON" right={`${view.soon.length} · REMIND ME = A NOTIFICATION AT 09:00`} />}
          <div className={phone ? 'rl-soon-row' : 'rl-soon-grid'}>
            {soonShown.map((it) => (
              <SoonCard key={it.rel.id} item={it} act={act} onOpen={open} />
            ))}
          </div>
          {!phone && view.soon.length > SOON_SHOWN && (
            <button type="button" className="more-btn" onClick={() => setAllSoon((v) => !v)}>
              {allSoon ? 'SHOW FEWER' : `SHOW ALL ${view.soon.length}`}
            </button>
          )}
        </section>
      )}

      {view.groups.map((g) => (
        <section key={g.key} className="lp-sec rl-group">
          {phone ? <ListSection phone label={g.label} right={String(g.items.length)} /> : <SectionHead label={g.label.toUpperCase()} right={`${g.items.length}`} />}
          <div className="rl-rows">
            {g.items.map((it) =>
              phone ? (
                <SwipeRow key={it.rel.id} seenWord={it.status === 'seen' ? 'Unseen' : 'Seen'} onTap={() => open(it)} onSeen={() => act.toggleSeen(it)} onDismiss={() => act.dismiss(it)}>
                  <PhoneRow item={it} online={online} />
                </SwipeRow>
              ) : (
                <Row key={it.rel.id} item={it} act={act} online={online} onOpen={open} onDetails={details} />
              ),
            )}
          </div>
        </section>
      ))}
      {phone && view.groups.length > 0 && <div className="nr-swipe-hint">SWIPE RIGHT FOR SEEN · LEFT TO DISMISS</div>}

      {!rs.sweeping && view.groups.length === 0 && view.soon.length === 0 && (
        <EmptyState
          icon={firstSweep ? 'radar' : 'album'}
          title={firstSweep ? 'Nothing checked yet' : type !== 'all' || !showSeen ? 'Nothing here with these filters' : 'All caught up'}
          body={
            firstSweep
              ? 'Your artists are checked on MusicBrainz once a day. The first check starts when you’re online.'
              : type !== 'all' || !showSeen
                ? 'Try All, or turn on Show seen.'
                : 'Recent releases from your artists are in your library or dismissed. The next check runs at 06:00.'
          }
        />
      )}

      <ReleasePanel open={!!panel} phone={phone} onClose={close} contentKey={shown?.kind === 'rel' ? shown.id : (shown?.kind ?? '')}>
        {shown?.kind === 'artists' && <FollowedArtists c={c} phone={phone} onClose={close} />}
        {detailItem && <ReleaseDetail item={detailItem} c={c} phone={phone} online={online} act={act} onClose={close} />}
      </ReleasePanel>
    </div>
  )
}

/* ── Header ──────────────────────────────────────────── */

function Header({ rs, artistsN, phone, online, onArtists }: { rs: ReleasesState; artistsN: number; phone: boolean; online: boolean; onArtists: () => void }) {
  const sw = rs.sweeping
  const at = rs.doc.sweep.at
  const line = sw ? `Checking · ${sw.done} / ${sw.total} artists` : at ? `${phone ? '' : `From ${artistsN} artists you follow · `}checked ${fmtStamp(at).toLowerCase()}` : `${artistsN} artists · not checked yet`
  const pct = sw && sw.total ? sw.done / sw.total : 0
  return (
    <>
      <header className="rl-head">
        <div className="rl-head-text">
          <span className="lh-kicker">{line}</span>
          <h1 className="rl-title">New releases</h1>
        </div>
        <IconButton
          icon="refresh"
          className={sw ? 'nr-sweeping' : undefined}
          label={sw ? 'Checking MusicBrainz' : 'Check now'}
          disabled={!online && !sw}
          onClick={() => !sw && void releasesStore.sweep({ manual: true })}
        />
        {phone ? (
          <IconButton icon="gear" label="Followed artists" onClick={onArtists} />
        ) : (
          <Button variant="secondary" size="sm" icon="gear" onClick={onArtists}>
            Followed artists
          </Button>
        )}
      </header>
      {sw && <LinearProgress className="nr-progress" value={pct} />}
    </>
  )
}

/* ── Coming soon card ────────────────────────────────── */

function SoonCard({ item, act, onOpen }: { item: FeedItem; act: ReleaseActions; onOpen: (it: FeedItem) => void }) {
  const remind = (e: MouseEvent) => {
    e.stopPropagation()
    act.remind(item)
  }
  return (
    <div className="rl-sc" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}>
      <span className="rl-sc-art">
        <ReleaseCover item={item} size="xs" />
      </span>
      <span className="rl-sc-text">
        <span className={`ax-mono ${item.reminded ? 'is-on' : ''}`}>
          {item.daysTo <= 1 ? 'Tomorrow' : `In ${item.daysTo} days`} · {dayLabel(item).toLowerCase()}
        </span>
        <span className="rl-sc-t">{item.rel.t}</span>
        <span className="rl-sc-a">{item.owners[0]?.name ?? item.rel.a}</span>
      </span>
      <IconButton icon={item.reminded ? 'bellF' : 'bell'} label={item.reminded ? 'Reminder set' : 'Remind me'} pressed={item.reminded} className={item.reminded ? 'is-on' : undefined} onClick={remind} />
    </div>
  )
}

/* ── Rows ────────────────────────────────────────────── */

function StatusTag({ item }: { item: FeedItem }) {
  if (isOwned(item.status))
    return (
      <span className={`rl-tag ${item.status === 'lib' ? 'is-on' : ''}`}>
        <OwnedTag item={item} /> {ownedCount(item)}
      </span>
    )
  if (item.status === 'acq') return <span className="rl-tag">MATCHING</span>
  if (item.status === 'seen') return <span className="rl-tag is-dim">SEEN</span>
  return <span />
}

function PreviewLine({ item }: { item: FeedItem }) {
  const pv = usePreview()
  if (!pv.key || !pv.key.startsWith(`${item.rel.id}#`)) return null
  const n = Number(pv.key.split('#')[1]) + 1
  return (
    <div className="rl-pv">
      <span className="ax-mono is-on">Preview · song {n}</span>
      <span className="rl-pv-bar">
        <span style={{ width: `${Math.round(pv.progress * 100)}%` }} />
      </span>
      <span className="ax-mono">{Math.round(pv.progress * 30)} s / 30 s</span>
    </div>
  )
}

function Row({ item, act, online, onOpen, onDetails }: { item: FeedItem; act: ReleaseActions; online: boolean; onOpen: (it: FeedItem) => void; onDetails: (it: FeedItem) => void }) {
  const owned = isOwned(item.status)
  const seen = item.status === 'seen'
  const stop = (e: MouseEvent) => e.stopPropagation()
  return (
    <div className={`rl-row ${seen ? 'is-seen' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}>
      <span className="rl-art">
        <ReleaseCover item={item} size="sm" />
        {item.status === 'acq' && <MatchingVeil compact />}
      </span>
      <span className="rl-text">
        <span className="rl-t">
          {item.status === 'new' && <span className="ax-dot" aria-label="New" role="img" />}
          <span className="rl-tt">{item.rel.t}</span>
        </span>
        <span className="rl-a">{item.owners.map((a) => a.name).join(', ') || item.rel.a}</span>
        <span className="ax-mono">
          {relFacts(item)} · {agoLabel(item).toLowerCase()}
        </span>
      </span>
      <StatusTag item={item} />
      <span className="rl-acts" onClick={stop}>
        {owned ? (
          <Button size="sm" icon="playF" onClick={() => playRelease(item)}>
            Play
          </Button>
        ) : (
          canPreview(item) && online && <PreviewButton item={item} variant="hero" />
        )}
        <span className="rl-more">
          {!owned && <IconButton icon="done" label={item.status === 'acq' ? 'Stop matching' : 'I’ve got it'} pressed={item.status === 'acq'} onClick={() => act.got(item)} />}
          {!owned && <IconButton icon="eye" label={seen ? 'Mark unseen' : 'Mark seen'} pressed={seen} onClick={() => act.toggleSeen(item)} />}
          {owned && <IconButton icon="info" label="Release details" onClick={() => onDetails(item)} />}
          <IconButton icon="x" label="Dismiss" onClick={() => act.dismiss(item)} />
        </span>
      </span>
      <PreviewLine item={item} />
    </div>
  )
}

function PhoneRow({ item, online }: { item: FeedItem; online: boolean }) {
  const owned = isOwned(item.status)
  const tag = item.status === 'lib' ? 'IN LIBRARY' : owned ? ownedCount(item, true) : item.status === 'acq' ? 'MATCHING' : null
  return (
    <span className={`rl-prow ${item.status === 'seen' ? 'is-seen' : ''}`}>
      <span className="rl-art">
        <ReleaseCover item={item} size="sm" />
        {item.status === 'acq' && <MatchingVeil compact />}
      </span>
      <span className="rl-text">
        <span className="rl-t">
          {item.status === 'new' && <span className="ax-dot" aria-label="New" role="img" />}
          <span className="rl-tt">{item.rel.t}</span>
        </span>
        <span className="rl-a">{item.owners[0]?.name ?? item.rel.a}</span>
        <span className="rl-pmeta">
          <span className="ax-mono">
            {relFacts(item).split(' · ')[0]} · {agoLabel(item).toLowerCase()}
          </span>
          {tag && <span className={`rl-tag ${item.status === 'lib' ? 'is-on' : ''}`}>{tag}</span>}
        </span>
      </span>
      <span className="rl-pbtn" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        {owned ? (
          <button type="button" className="hx-cplay rs-play" aria-label={`Play ${item.rel.t}`} onClick={() => playRelease(item)}>
            <Icon name="playF" />
          </button>
        ) : (
          canPreview(item) && online && <PreviewRing id={item.rel.id} load={() => firstClip(item)} label={`Preview ${item.rel.t}`} size={40} />
        )}
      </span>
    </span>
  )
}
