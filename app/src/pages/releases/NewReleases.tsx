/**
 * New Releases (step 11, pass 2 = step 35 → design_handoff_new_releases): the daily MusicBrainz sweep
 * of every artist in the library. Nothing here plays until it matches files you own; a release that's
 * complete in the library never shows. Three tabs:
 *   Upcoming  a timeline by week with day countdowns; the one action is Remind me
 *   Out now   hero (newest from your most played) + groups, as a card grid (phone: swipe rows)
 *   Discover  artists related to your most played who aren't in the library: Add to sweep
 * Filters (Upcoming + Out now): status (Out now), artist, hide reissues, furthest first (Upcoming).
 * Clicking a release opens the detail panel (460px; phone: bottom sheet); the cog opens Followed artists.
 *
 * Data: state/releases.ts (sweep + Drive sync), state/releaseViews.ts (feed, matching, suggestions).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { Skeleton } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import { nowPlayingStore } from '../../state/nowPlaying'
import { releasesStore, sweepTargets, useReleases, type ReleasesState, type StatusFilter } from '../../state/releases'
import { TOP_ARTISTS, buildFeed, buildSuggestions, countdown, fmtClock, fmtRelDate, fmtStamp, isOwned, nextSweepClock, type ArtistOpt, type Feed, type FeedItem, type UpWeek } from '../../state/releaseViews'
import { refreshDiscover } from '../../state/discover'
import { DiscoverTab } from './Discover'
import { useIsPhone } from '../../state/viewport'
import { useMotion } from '../../state/motion'
import { artistHref, go, href, replace } from '../../shell/routes'
import { registerBack } from '../../native/backButton'
import { PageHeader } from '../PageHeader'
import { FollowedArtists, ReleaseDetail, ReleasePanel, type PanelState } from './ReleasePanel'
import {
  Countdown,
  Dot,
  MatchingVeil,
  OwnedTag,
  ReleaseCover,
  Spinner,
  SwipeRow,
  TypeBadge,
  actionsFor,
  cardMeta,
  longMeta,
  ownedCount,
  phoneMeta,
  playRelease,
  typeLabel,
  useReleaseActions,
  type ReleaseActions,
} from './parts'
import './releases.css'

type Tab = 'up' | 'out' | 'disc'
const TABS: [Tab, string][] = [
  ['up', 'Upcoming'],
  ['out', 'Out now'],
  ['disc', 'Discover'],
]
/** the selected tab lasts for the session (not across launches) */
let sessionTab: Tab = 'up'

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

function Page({ c }: { c: Catalogue }) {
  const rs = useReleases()
  const history = useHistory()
  const phone = useIsPhone()
  const online = useOnline()
  const feed = buildFeed(rs.doc, c, history.plays, rs.prefs)
  const suggestions = buildSuggestions(rs.doc, c, history.plays)
  const artistsN = useMemo(() => sweepTargets(c, rs.doc).length, [c, rs.doc])
  const [tab, setTabState] = useState<Tab>(sessionTab)
  const setTab = (t: Tab) => {
    sessionTab = t
    setTabState(t)
  }

  // #/new?artists (Settings → Followed artists) opens with the Followed artists panel;
  // #/new?rel=<id> (a reminder toast / notification) with that release's detail
  const [panel, setPanelState] = useState<PanelState>(() => panelFromHash())
  // the content stays while the panel slides out
  const [shown, setShown] = useState<PanelState>(panel)
  useEffect(() => {
    const take = () => {
      const p = panelFromHash()
      if (!p) return
      setPanelState(p)
      setShown(p)
      if (p.kind === 'rel' && releasesStore.get().doc.marks[p.id]?.[0] !== 'gone') {
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

  // a visit: fetch tracklists the cards don't have yet; sweep if one is due
  useEffect(() => {
    if (releasesStore.due()) void releasesStore.sweep()
    else {
      void releasesStore.fillDetails()
      void refreshDiscover()
    }
  }, [])

  // Esc / Android Back close the panel first
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const ui = nowPlayingStore.get()
      if (ui.open || ui.queue) return
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

  const open = (it: FeedItem) => {
    if (it.status === 'new') releasesStore.mark(it.rel.id, 'seen')
    setPanel({ kind: 'rel', id: it.rel.id })
  }
  const detailItem = shown?.kind === 'rel' ? feed.byId.get(shown.id) : undefined

  const firstSweep = !rs.doc.sweep.at
  const showTabs = !firstSweep || feed.all.length > 0
  const discN = suggestions.filter((s) => !s.followed).length
  const counts: Record<Tab, number> = { up: feed.tabs.up, out: feed.tabs.out, disc: discN }
  const filtered = (tab === 'out' && rs.prefs.status !== 'all') || rs.prefs.artist !== null
  const empty = showTabs && !rs.sweeping && ((tab === 'up' && !feed.weeks.length) || (tab === 'out' && !feed.outShown))

  return (
    <div className={`nr ${phone ? 'is-phone' : ''}`}>
      <Header rs={rs} artistsN={artistsN} phone={phone} online={online} onArtists={() => setPanel({ kind: 'artists' })} />

      {!online && (
        <div className="nr-offline">
          <Icon name="offline" />
          No signal. Showing the last sonar.
          {rs.doc.sweep.at && <span className="nr-mono">LAST CHECKED {fmtStamp(rs.doc.sweep.at)}</span>}
        </div>
      )}
      {rs.error && <SweepErrorPanel rs={rs} />}
      {firstSweep && (rs.sweeping || !rs.error) && <FirstSweep rs={rs} feed={feed} artistsN={artistsN} online={online} />}

      {showTabs && <Tabs tab={tab} counts={counts} phone={phone} onTab={setTab} />}
      {showTabs && tab !== 'disc' && <Filters key={tab} tab={tab} rs={rs} feed={feed} c={c} phone={phone} onArtistSheet={() => setPanel({ kind: 'artistFilter' })} />}

      {tab === 'out' && feed.hero && <Hero item={feed.hero} line={phone ? feed.heroLine.phone : feed.heroLine.desktop} phone={phone} act={act} online={online} onOpen={open} />}

      {empty && <CaughtUp rs={rs} tab={tab} artistsN={artistsN} filtered={filtered} />}

      {tab === 'up' && feed.weeks.length > 0 && (
        <div className="nr-weeks">
          {feed.weeks.map((w) => (
            <UpcomingWeek key={w.key} week={w} phone={phone} act={act} onOpen={open} />
          ))}
        </div>
      )}

      {tab === 'out' &&
        feed.groups.map((g) => (
          <section key={g.key} className="nr-group">
            <div className="nr-ghead">
              <span className="nr-gring" />
              <span className="nr-glabel">{g.label}</span>
              {!phone && <span className="nr-gcount">{String(g.items.length).padStart(2, '0')}</span>}
              <span className="nr-gline" />
              <span className="nr-grange">{phone ? String(g.items.length).padStart(2, '0') : g.range}</span>
            </div>
            {phone ? (
              <div className="nr-rows">
                {g.items.map((it) => (
                  <PhoneRow key={it.rel.id} item={it} act={act} onOpen={open} />
                ))}
              </div>
            ) : (
              <div className="nr-grid">
                {g.items.map((it) => (
                  <Card key={it.rel.id} item={it} act={act} online={online} onOpen={open} />
                ))}
              </div>
            )}
          </section>
        ))}

      {tab === 'disc' && <DiscoverTab items={suggestions} phone={phone} online={online} topN={TOP_ARTISTS} />}

      <ReleasePanel open={!!panel} phone={phone} onClose={close} contentKey={shown?.kind === 'rel' ? shown.id : (shown?.kind ?? '')}>
        {shown?.kind === 'artists' && <FollowedArtists c={c} phone={phone} onClose={close} />}
        {detailItem && <ReleaseDetail item={detailItem} c={c} phone={phone} online={online} act={act} onClose={close} />}
        {shown?.kind === 'artistFilter' && <ArtistSheet options={feed.artistOpts} current={rs.prefs.artist} onPick={(id) => { releasesStore.setPrefs({ artist: id }); close() }} />}
      </ReleasePanel>
    </div>
  )
}

/* ── Header: sonar line, Followed artists, refresh ───── */

function Header({ rs, artistsN, phone, online, onArtists }: { rs: ReleasesState; artistsN: number; phone: boolean; online: boolean; onArtists: () => void }) {
  const motion = useMotion()
  const sw = rs.sweeping
  const at = rs.doc.sweep.at
  const line = sw
    ? phone
      ? `SWEEP · ${sw.done} / ${sw.total}`
      : `SONAR SWEEP · ${sw.done} / ${sw.total} ARTISTS`
    : at
      ? phone
        ? `LAST SONAR · ${fmtStamp(at)}`
        : `LAST SONAR · ${fmtStamp(at)} · ${artistsN} ARTISTS`
      : phone
        ? 'NO SONAR YET'
        : `NO SONAR YET · ${artistsN} ARTISTS`
  const pct = sw && sw.total ? (sw.done / sw.total) * 100 : 0
  return (
    <>
      <PageHeader
        meta={<span className={sw ? 'nr-live' : undefined}>{line}</span>}
        title="New Releases"
        tools={
          <>
            <button type="button" className="nr-follow" onClick={onArtists} aria-label="Followed artists" title="Followed artists">
              <Icon name="gear" />
              {!phone && (
                <>
                  Followed artists<span className="nr-mono">{artistsN}</span>
                </>
              )}
            </button>
            <span className="nr-scan-wrap">
              {sw &&
                (motion ? (
                  <span className="nr-scan-rings" aria-hidden>
                    <span className="pg-anim" />
                    <span className="pg-anim" />
                  </span>
                ) : (
                  <span className="nr-scan-static" aria-hidden />
                ))}
              <button
                type="button"
                className={`nr-scan ${sw ? 'is-on' : ''}`}
                title={sw ? 'Sweeping MusicBrainz…' : 'Check MusicBrainz now'}
                aria-label={sw ? 'Sweeping MusicBrainz' : 'Check MusicBrainz now'}
                disabled={!online && !sw}
                onClick={() => !sw && void releasesStore.sweep({ manual: true })}
              >
                <Icon name="refresh" />
              </button>
            </span>
          </>
        }
      />
      <div className="nr-progress" aria-hidden>
        <span style={{ width: `${pct}%`, opacity: sw ? 1 : 0 }} />
      </div>
    </>
  )
}

/* ── Tabs ────────────────────────────────────────────── */

function Tabs({ tab, counts, phone, onTab }: { tab: Tab; counts: Record<Tab, number>; phone: boolean; onTab: (t: Tab) => void }) {
  if (phone)
    return (
      <div className="nr-seg" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`nr-seg-b ${tab === id ? 'is-on' : ''}`} onClick={() => onTab(id)}>
            {label}
            <span className="nr-mono">{counts[id]}</span>
          </button>
        ))}
      </div>
    )
  return (
    <div className="nr-tabs" role="tablist">
      {TABS.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} className={`nr-tab ${tab === id ? 'is-on' : ''}`} onClick={() => onTab(id)}>
          {label}
          <span className="nr-mono">{counts[id]}</span>
          <i />
        </button>
      ))}
      <span className="nr-chips-fill" />
      {tab === 'disc' && <span className="nr-mono nr-tabnote">FROM YOUR {TOP_ARTISTS} MOST-PLAYED ARTISTS</span>}
    </div>
  )
}

/* ── Filters (Upcoming + Out now) ─────────────────────── */

function Filters({ tab, rs, feed, c, phone, onArtistSheet }: { tab: Tab; rs: ReleasesState; feed: Feed; c: Catalogue; phone: boolean; onArtistSheet: () => void }) {
  const { status, artist, reversed } = rs.prefs
  const hideRe = rs.doc.hideReissues[0]
  const [pop, setPop] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pop) return
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPop(false)
    }
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPop(false)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [pop])

  const artistName = artist ? (c.artists[artist]?.name ?? 'Artist') : 'All artists'
  const anyFilter = (tab === 'out' && status !== 'all') || artist !== null
  const set = (s: StatusFilter) => releasesStore.setPrefs({ status: s })
  const statusOpts: [StatusFilter, string, number][] = [
    ['all', 'All', feed.status.all],
    ['new', 'New', feed.status.new],
    ['seen', 'Seen', feed.status.seen],
  ]

  const artistChip = (
    <button type="button" className="chip nr-chip nr-chip-art" aria-pressed={artist !== null} aria-haspopup="listbox" aria-expanded={pop} onClick={() => (phone ? onArtistSheet() : setPop((p) => !p))}>
      <span className="nr-chip-lbl">{artistName}</span>
      <span className="nr-chip-ic">
        <Icon name="chevD" />
      </span>
    </button>
  )

  return (
    <div className="nr-filters">
      {tab === 'out' &&
        (phone ? (
          statusOpts.map(([id, label]) => (
            <button key={id} type="button" className="chip nr-chip" aria-pressed={status === id} onClick={() => set(id)}>
              {label}
            </button>
          ))
        ) : (
          <>
            <div className="nr-segc" role="radiogroup" aria-label="Status">
              {statusOpts.map(([id, label, n]) => (
                <button key={id} type="button" role="radio" aria-checked={status === id} className={`nr-segc-b ${status === id ? 'is-on' : ''}`} onClick={() => set(id)}>
                  {label}
                  <span className="nr-mono">{n}</span>
                </button>
              ))}
            </div>
            <span className="nr-chips-sep" />
          </>
        ))}
      <div className="nr-artpop-wrap" ref={wrap}>
        {artistChip}
        {pop && !phone && (
          <div className="nr-artpop" role="listbox">
            <ArtistRows
              options={feed.artistOpts}
              current={artist}
              onPick={(id) => {
                releasesStore.setPrefs({ artist: id })
                setPop(false)
              }}
            />
          </div>
        )}
      </div>
      <button type="button" className="chip nr-chip" aria-pressed={hideRe} onClick={() => releasesStore.setHideReissues(!hideRe)}>
        {phone ? 'No reissues' : 'Hide reissues & deluxe'}
      </button>
      {tab === 'up' && (
        <button type="button" className="chip nr-chip" aria-pressed={reversed} onClick={() => releasesStore.setPrefs({ reversed: !reversed })}>
          Furthest first
        </button>
      )}
      {!phone && anyFilter && (
        <button type="button" className="nr-clear" onClick={() => releasesStore.setPrefs({ status: 'all', artist: null })}>
          Clear filters
        </button>
      )}
      {!phone && (
        <>
          <span className="nr-chips-fill" />
          <span className="nr-mono nr-countline">
            {tab === 'up' ? `${feed.upLine.upcoming} UPCOMING · ${feed.upLine.reminders} REMINDERS` : `${feed.status.new} NEW · ${feed.status.seen} SEEN`}
          </span>
        </>
      )}
    </div>
  )
}

function ArtistRows({ options, current, onPick }: { options: ArtistOpt[]; current: string | null; onPick: (id: string | null) => void }) {
  return (
    <>
      <button type="button" role="option" aria-selected={current === null} className="nr-artrow" onClick={() => onPick(null)}>
        <span className="nr-artrow-n">All artists</span>
        <span className="nr-artrow-ic">{current === null && <Icon name="check" />}</span>
      </button>
      {options.map((o) => (
        <button key={o.id} type="button" role="option" aria-selected={current === o.id} className="nr-artrow" onClick={() => onPick(o.id)}>
          <span className="nr-artrow-n">{o.name}</span>
          {o.plays > 0 && <span className="nr-mono nr-artrow-c">{o.plays.toLocaleString('en-US')} PLAYS</span>}
          <span className="nr-artrow-ic">{current === o.id && <Icon name="check" />}</span>
        </button>
      ))}
    </>
  )
}

/** Phone: "Filter by artist" bottom sheet. */
function ArtistSheet({ options, current, onPick }: { options: ArtistOpt[]; current: string | null; onPick: (id: string | null) => void }) {
  return (
    <div className="nrp nr-artsheet">
      <div className="nrp-titles">
        <h2 className="nrp-title">Filter by artist</h2>
      </div>
      <div className="nr-artsheet-list" role="listbox">
        <ArtistRows options={options} current={current} onPick={onPick} />
      </div>
    </div>
  )
}

/* ── Upcoming timeline ───────────────────────────────── */

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const hasDay = (it: FeedItem) => it.rel.date.split('-').length >= 3

/** "FRI 16 OCT" (exact day) · "NOV 2026" (month only) */
function whenLabel(it: FeedItem): string {
  if (!hasDay(it)) return fmtRelDate(it.rel.date)
  const d = fmtRelDate(it.rel.date).replace(/ \d{4}$/, '').replace(/^0/, '')
  return `${WEEKDAYS[new Date(it.day).getDay()]} ${d}`
}

/** The big countdown: days (exact day) or the month. */
function countParts(it: FeedItem): { n: string; u: string } {
  if (!hasDay(it)) {
    const [m, y] = fmtRelDate(it.rel.date).split(' ')
    return { n: m, u: y ?? '' }
  }
  return { n: String(it.daysTo), u: it.daysTo === 1 ? 'DAY' : 'DAYS' }
}

/** "FRI 16 OCT · 12 TRK · LABEL" (pre-release: with the songs you already have) */
function upMeta(it: FeedItem, phone: boolean): string {
  const n = it.detail?.tracks.length
  return [
    it.status === 'pre' ? `PRE-RELEASE ${ownedCount(it, true)}` : null,
    whenLabel(it),
    n ? `${n} TRK` : null,
    !phone && it.detail?.label ? it.detail.label.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function UpcomingWeek({ week, phone, act, onOpen }: { week: UpWeek; phone: boolean; act: ReleaseActions; onOpen: (it: FeedItem) => void }) {
  const n = String(week.items.length).padStart(2, '0')
  return (
    <section className="nr-week">
      <div className="nr-week-head">
        {phone ? (
          <>
            <span className="nr-gring" />
            <span className="nr-glabel">{week.label}</span>
            <span className="nr-mono nr-week-range">{week.range}</span>
            <span className="nr-gline" />
            <span className="nr-gcount">{n}</span>
          </>
        ) : (
          <>
            <span className="nr-week-label">{week.label}</span>
            <span className="nr-week-node">
              <span />
            </span>
            <span className="nr-week-meta">
              <span className="nr-mono">{week.range}</span>
              <span className="nr-gline" />
              <span className="nr-gcount">{n}</span>
            </span>
          </>
        )}
      </div>
      {week.items.map((it) => (phone ? <UpPhoneRow key={it.rel.id} item={it} act={act} onOpen={onOpen} /> : <UpRow key={it.rel.id} item={it} act={act} onOpen={onOpen} />))}
    </section>
  )
}

function RemindButton({ item, act, icon }: { item: FeedItem; act: ReleaseActions; icon?: boolean }) {
  const on = item.reminded
  const label = on ? 'Reminder set' : 'Remind me'
  return (
    <button
      type="button"
      className={`nr-rem ${on ? 'is-on' : ''} ${icon ? 'is-icon' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        act.remind(item)
      }}
    >
      <Icon name={on ? 'bellF' : 'bell'} />
      {!icon && label}
    </button>
  )
}

function UpRow({ item, act, onOpen }: { item: FeedItem; act: ReleaseActions; onOpen: (it: FeedItem) => void }) {
  const near = hasDay(item) && item.daysTo <= 4
  const seen = item.status === 'seen'
  const cd = countParts(item)
  const key = (e: ReactKeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onOpen(item)
    }
  }
  return (
    <div className={`nr-up ${near ? 'is-near' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={key}>
      <div className="nr-up-cd">
        <span className={`nr-up-n ${hasDay(item) ? '' : 'is-month'}`}>{cd.n}</span>
        <span className="nr-mono nr-up-u">{cd.u}</span>
      </div>
      <div className="nr-up-rail">
        <i />
        <span />
      </div>
      <div className="nr-up-cover">
        <ReleaseCover item={item} />
      </div>
      <div className="nr-up-info">
        <div className="nr-up-trow">
          {item.status === 'new' && <Dot />}
          <span className={`nr-up-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
        </div>
        <button
          type="button"
          className="nr-up-a"
          onClick={(e) => {
            e.stopPropagation()
            if (!item.external) go(artistHref(item.owners[0].id))
          }}
        >
          {item.rel.a}
        </button>
        <div className="nr-up-meta">
          <TypeBadge item={item} />
          <span className="nr-mono nr-up-m">{upMeta(item, false)}</span>
        </div>
      </div>
      <RemindButton item={item} act={act} />
    </div>
  )
}

function UpPhoneRow({ item, act, onOpen }: { item: FeedItem; act: ReleaseActions; onOpen: (it: FeedItem) => void }) {
  const seen = item.status === 'seen'
  const cd = countParts(item)
  const key = (e: ReactKeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onOpen(item)
    }
  }
  return (
    <div className="nr-uprow" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={key}>
      <div className="nr-uprow-cd">
        <span className={`nr-uprow-n ${hasDay(item) ? '' : 'is-month'}`}>{cd.n}</span>
        <span className="nr-mono">{cd.u}</span>
      </div>
      <div className="nr-uprow-cover">
        <ReleaseCover item={item} size="xs" />
      </div>
      <div className="nr-uprow-text">
        <div className="nr-uprow-trow">
          {item.status === 'new' && <Dot />}
          <span className={`nr-uprow-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
        </div>
        <span className="nr-uprow-a">{item.rel.a}</span>
        <span className="nr-mono nr-uprow-m">
          {typeLabel(item)} · {upMeta(item, true)}
        </span>
      </div>
      <RemindButton item={item} act={act} icon />
    </div>
  )
}


/* ── Hero ────────────────────────────────────────────── */

function Hero({ item, line, phone, act, online, onOpen }: { item: FeedItem; line: string; phone: boolean; act: ReleaseActions; online: boolean; onOpen: (it: FeedItem) => void }) {
  const lib = isOwned(item.status)
  const seen = item.status === 'seen'
  const toArtist = (e: MouseEvent) => {
    e.stopPropagation()
    if (!item.external) go(artistHref(item.owners[0].id))
  }
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  if (phone)
    return (
      <div className="nr-hero" onClick={() => onOpen(item)}>
        <div className="nr-hero-top">
          <div className={`nr-hero-cover ${lib ? 'is-lib' : ''}`}>
            <ReleaseCover item={item} size="sm" />
            {item.status === 'acq' && <MatchingVeil compact />}
            {lib && (
              <button type="button" className="nr-play nr-play-sm" aria-label={`Play ${item.rel.t}`} onClick={stop(() => playRelease(item))}>
                <Icon name="playF" />
              </button>
            )}
          </div>
          <div className="nr-hero-text">
            <span className="nr-mono nr-hero-line">{line}</span>
            <button type="button" className="nr-hero-trow" onClick={stop(() => onOpen(item))}>
              {item.status === 'new' && <Dot />}
              <span className={`nr-hero-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
            </button>
            <span className="nr-hero-a">{item.rel.a}</span>
            <span className="nr-mono nr-hero-meta">
              {item.status === 'pre' || item.status === 'part' ? `${item.status === 'pre' ? 'PRE-RELEASE' : 'INCOMPLETE'} · ${ownedCount(item, true)} SONGS` : `${typeLabel(item)} · ${phoneMeta(item)}`}
            </span>
          </div>
        </div>
        {!lib && (
          <div className="nr-hero-acts">
            <button type="button" className={`nr-hbtn nr-hbtn-primary ${item.status === 'acq' ? 'is-wait' : ''}`} onClick={stop(() => act.got(item))}>
              <Icon name="check" />
              {item.status === 'acq' ? 'Matching…' : 'I’ve got it'}
            </button>
            <button type="button" className={`nr-hbtn nr-hbtn-sq ${seen ? 'is-on' : ''}`} aria-label={seen ? 'Mark unseen' : 'Mark seen'} onClick={stop(() => act.toggleSeen(item))}>
              <Icon name="eye" />
            </button>
            <button type="button" className="nr-hbtn nr-hbtn-sq" aria-label="Open on MusicBrainz" disabled={!online} onClick={stop(() => act.external(item))}>
              <Icon name="ext" />
            </button>
          </div>
        )}
      </div>
    )

  const titleSize = item.rel.t.length > 26 ? 44 : item.rel.t.length > 16 ? 56 : 68
  return (
    <div className="nr-hero" onClick={() => onOpen(item)}>
      <div className={`nr-hero-cover ${lib ? 'is-lib' : ''}`}>
        <ReleaseCover item={item} size="lg" />
        {item.upcoming && <Countdown item={item} />}
        {item.status === 'acq' && <MatchingVeil />}
      </div>
      <div className="nr-hero-text">
        <span className="nr-mono nr-hero-line">{line}</span>
        <button type="button" className="nr-hero-trow" onClick={stop(() => onOpen(item))} aria-label={`${item.rel.t}: details`}>
          {item.status === 'new' && <Dot size="lg" />}
          <span className={`nr-hero-t ${seen ? 'is-seen' : ''}`} style={{ '--nr-hero-fs': `${titleSize}px` } as CSSProperties}>
            {item.rel.t}
          </span>
        </button>
        <button type="button" className="nr-hero-a" onClick={toArtist}>
          {item.rel.a}
        </button>
        <div className="nr-hero-meta">
          <TypeBadge item={item} />
          <span className="nr-mono">{longMeta(item)}</span>
        </div>
        {lib ? (
          <div className="nr-hero-acts">
            <button type="button" className="btn btn-primary nr-glow" onClick={stop(() => playRelease(item))}>
              <span className="btn-ic">
                <Icon name="playF" />
              </span>
              Play
            </button>
            <OwnedTag item={item} />
            <span className="nr-mono">{ownedCount(item)}</span>
            {item.status === 'pre' && (
              <button type="button" className={`nr-sq ${item.reminded ? 'is-on' : ''}`} aria-label={item.reminded ? 'Reminder set' : 'Remind me'} title={item.reminded ? 'Reminder set' : 'Remind me'} onClick={stop(() => act.remind(item))}>
                <Icon name={item.reminded ? 'bellF' : 'bell'} />
              </button>
            )}
          </div>
        ) : (
          <div className="nr-hero-acts">
            <button type="button" className="btn btn-primary" onClick={stop(() => act.got(item))}>
              <span className="btn-ic">{item.status === 'acq' ? <Spinner /> : <Icon name="check" />}</span>
              {item.status === 'acq' ? 'Matching…' : 'I’ve got it'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={stop(() => act.toggleSeen(item))}>
              <span className="btn-ic">
                <Icon name="eye" />
              </span>
              {seen ? 'Mark unseen' : 'Mark seen'}
            </button>
            <button type="button" className="nr-hero-link" disabled={!online} onClick={stop(() => act.external(item))}>
              MusicBrainz
              <Icon name="ext" />
            </button>
            {item.upcoming && (
              <button type="button" className={`nr-sq ${item.reminded ? 'is-on' : ''}`} aria-label={item.reminded ? 'Reminder set' : 'Remind me'} title={item.reminded ? 'Reminder set' : 'Remind me'} onClick={stop(() => act.remind(item))}>
                <Icon name={item.reminded ? 'bellF' : 'bell'} />
              </button>
            )}
            <span className="nr-chips-fill" />
            <button type="button" className="nr-sq nr-sq-lg" aria-label="Dismiss" title="Dismiss" onClick={stop(() => act.dismiss(item))}>
              <Icon name="x" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Desktop card ────────────────────────────────────── */

function Card({ item, act, online, onOpen }: { item: FeedItem; act: ReleaseActions; online: boolean; onOpen: (it: FeedItem) => void }) {
  const lib = isOwned(item.status)
  const seen = item.status === 'seen'
  return (
    <div className={`nr-card is-${item.status}`}>
      <button type="button" className={`nr-card-cover ${lib ? 'is-lib' : ''}`} onClick={() => onOpen(item)} aria-label={`${item.rel.t} by ${item.rel.a}: details`}>
        <ReleaseCover item={item} />
        {item.upcoming && <Countdown item={item} />}
        {item.status === 'acq' && <MatchingVeil />}
      </button>
      {lib && (
        <button type="button" className="nr-play" aria-label={`Play ${item.rel.t}`} title="Play" onClick={() => playRelease(item)}>
          <Icon name="playF" />
        </button>
      )}
      <div className="nr-card-text">
        <button type="button" className="nr-card-trow" onClick={() => onOpen(item)}>
          {item.status === 'new' && <Dot />}
          <span className={`nr-card-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
        </button>
        <button type="button" className={`nr-card-a ${seen ? 'is-seen' : ''}`} onClick={() => !item.external && go(artistHref(item.owners[0].id))}>
          {item.rel.a}
        </button>
      </div>
      <div className="nr-card-meta">
        <TypeBadge item={item} />
        <span className={`nr-mono ${seen ? 'is-seen' : ''}`}>{cardMeta(item)}</span>
      </div>
      {lib ? (
        <div className="nr-card-lib">
          <OwnedTag item={item} />
          <span className="nr-mono">{ownedCount(item, true)}</span>
          {item.status === 'pre' && (
            <button type="button" className={`nr-sq is-end ${item.reminded ? 'is-on' : ''}`} title={item.reminded ? 'Reminder set' : 'Remind me'} aria-label={item.reminded ? 'Reminder set' : 'Remind me'} onClick={() => act.remind(item)}>
              <Icon name={item.reminded ? 'bellF' : 'bell'} />
            </button>
          )}
          <button type="button" className={`nr-sq ${item.status === 'pre' ? '' : 'is-end'}`} title="Dismiss" aria-label="Dismiss" onClick={() => act.dismiss(item)}>
            <Icon name="x" />
          </button>
        </div>
      ) : (
        <div className="nr-card-acts">
          {actionsFor(item, act, online).map((a) => (
            <button key={a.key} type="button" className={`nr-sq ${a.on ? 'is-on' : ''} ${a.key === 'dismiss' ? 'is-end' : ''}`} title={a.label} aria-label={a.label} disabled={a.disabled} onClick={a.run}>
              <Icon name={a.icon} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Phone row ───────────────────────────────────────── */

function PhoneRow({ item, act, onOpen }: { item: FeedItem; act: ReleaseActions; onOpen: (it: FeedItem) => void }) {
  const lib = isOwned(item.status)
  const seen = item.status === 'seen'
  return (
    <SwipeRow seenWord={seen ? 'UNSEEN' : 'SEEN'} onTap={() => onOpen(item)} onSeen={() => act.toggleSeen(item)} onDismiss={() => act.dismiss(item)}>
      <div className={`nr-row-cover ${lib ? 'is-lib' : ''}`}>
        <ReleaseCover item={item} size="xs" />
        {item.status === 'acq' && <MatchingVeil compact />}
      </div>
      <div className="nr-row-text">
        <div className="nr-row-trow">
          {item.status === 'new' && <Dot />}
          <span className={`nr-row-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
        </div>
        <span className={`nr-row-a ${seen ? 'is-seen' : ''}`}>{item.rel.a}</span>
        <span className={`nr-mono nr-row-m ${seen ? 'is-seen' : ''}`}>
          {item.status === 'pre' ? `PRE-RELEASE · ${ownedCount(item, true)} · ${countdown(item, true)}` : item.status === 'part' ? `INCOMPLETE · ${ownedCount(item, true)}` : `${typeLabel(item)} · ${phoneMeta(item)}`}
        </span>
      </div>
      {item.upcoming && !lib && <Countdown item={item} short className="is-row" />}
      {lib && (
        <button
          type="button"
          className="nr-play nr-play-row"
          aria-label={`Play ${item.rel.t}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            playRelease(item)
          }}
        >
          <Icon name="playF" />
        </button>
      )}
    </SwipeRow>
  )
}

/* ── States ──────────────────────────────────────────── */

function FirstSweep({ rs, feed, artistsN, online }: { rs: ReleasesState; feed: Feed; artistsN: number; online: boolean }) {
  const motion = useMotion()
  const sw = rs.sweeping
  const found = feed.all.filter((it) => it.status !== 'gone').length
  if (!sw)
    return (
      <div className="nr-first is-idle">
        <BigSonar motion={false} />
        <div className="nr-first-text">
          <div className="nr-first-title">{online ? 'No sonar yet.' : 'Waiting for a connection.'}</div>
          <div className="nr-first-body">
            Pelagic checks MusicBrainz for every artist in your library ({artistsN}) once a day, after {nextSweepClock()}. Releases you don’t own yet surface here.
          </div>
          {online && !rs.error && (
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void releasesStore.sweep({ manual: true })}>
                <span className="btn-ic">
                  <Icon name="refresh" />
                </span>
                Check MusicBrainz now
              </button>
            </div>
          )}
        </div>
      </div>
    )
  return (
    <div className="nr-first">
      <div className="nr-first-row">
        <BigSonar motion={motion} />
        <div className="nr-first-text">
          <div className="nr-first-title">Sending out the first ping.</div>
          <div className="nr-first-body">Checking {sw.total} artists on MusicBrainz, about one per second. Releases surface here as they’re found.</div>
          <div className="nr-first-bar">
            <span style={{ width: `${sw.total ? (sw.done / sw.total) * 100 : 0}%` }} />
          </div>
          <span className="nr-mono">
            {sw.done} / {sw.total} ARTISTS · {found} RELEASE{found === 1 ? '' : 'S'} FOUND
          </span>
        </div>
      </div>
      {found === 0 && (
        <div className="nr-skel">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="nr-skel-card">
              <Skeleton width="100%" height="auto" radius={10} style={{ aspectRatio: '1' }} />
              <Skeleton width={['80%', '64%', '72%', '58%'][i]} height={11} />
              <Skeleton width="44%" height={9} radius={5} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BigSonar({ motion }: { motion: boolean }) {
  return (
    <div className="nr-bigsonar" aria-hidden>
      <span />
      <span />
      <span />
      {motion && (
        <>
          <i className="pg-anim" />
          <i className="pg-anim" />
        </>
      )}
      <b />
    </div>
  )
}

function SweepErrorPanel({ rs }: { rs: ReleasesState }) {
  const e = rs.error!
  const limited = e.status === 503 || e.status === 429
  return (
    <div className="nr-error" role="alert">
      <span className="nr-error-ic">
        <Icon name="alert" />
      </span>
      <div className="nr-error-text">
        <div className="nr-error-title">{limited ? 'MusicBrainz stopped answering.' : 'MusicBrainz isn’t answering.'}</div>
        <div className="nr-error-body">
          The sweep reached {e.reached} of {e.total} artists{limited ? ' before being rate-limited' : ''}. Results so far are below; the rest retry automatically.
        </div>
        <span className="nr-mono">
          {e.status ? `HTTP ${e.status} · ` : ''}RETRY {fmtClock(e.retryAt)}
          {rs.doc.sweep.at ? ` · LAST FULL SWEEP ${fmtStamp(rs.doc.sweep.at)}` : ''}
        </span>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => releasesStore.retry()}>
        <span className="btn-ic">
          <Icon name="refresh" />
        </span>
        Retry now
      </button>
    </div>
  )
}

function CaughtUp({ rs, tab, artistsN, filtered }: { rs: ReleasesState; tab: Tab; artistsN: number; filtered: boolean }) {
  return (
    <div className="nr-caught">
      <BigSonar motion={false} />
      <div className="nr-caught-text">
        <div className="nr-caught-title">Nothing new on the sonar.</div>
        <div className="nr-caught-body">
          {filtered
            ? 'Nothing matches these filters.'
            : tab === 'up'
              ? 'No announced releases from your artists right now.'
              : `All ${artistsN} artists are quiet for now.`}{' '}
          The next sweep runs at {nextSweepClock()}.
        </div>
      </div>
      {rs.doc.sweep.at && <span className="nr-mono">LAST SONAR · {fmtStamp(rs.doc.sweep.at)}</span>}
      {filtered && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => releasesStore.setPrefs({ status: 'all', artist: null })}>
          Clear filters
        </button>
      )}
    </div>
  )
}
