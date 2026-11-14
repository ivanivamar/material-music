/**
 * New Releases (Material 3 Expressive redesign, handoff NewReleasesMaterial.dc.html).
 * The daily MusicBrainz sweep of artists in the library.
 * Tabs:
 *   Upcoming: Weekly timeline with countdowns, rail node indicators and Remind me toggles.
 *   Out now:  Hero banner (newest from most played) + card grid (desktop) / swipe rows (phone).
 *   Discover: Related artist recommendations to follow for sweeps.
 */
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'
import { Chip, EmptyState, LinearProgress, Menu, MenuItem, Segmented, Tabs as KitTabs, Button, IconButton, Alert } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import { nowPlayingStore } from '../../state/nowPlaying'
import { releasesStore, sweepTargets, useReleases, type ReleasesState, type StatusFilter } from '../../state/releases'
import { TOP_ARTISTS, buildFeed, buildSuggestions, fmtRelDate, fmtStamp, isOwned, type Feed, type FeedItem, type UpWeek } from '../../state/releaseViews'
import { refreshDiscover } from '../../state/discover'
import { stopPreview } from '../../state/preview'
import { DiscoverTab } from './Discover'
import { useIsPhone } from '../../state/viewport'
import { artistHref, go, href, replace } from '../../shell/routes'
import { registerBack } from '../../native/backButton'
import { FollowedArtists, ReleaseDetail, ReleasePanel, type PanelState } from './ReleasePanel'
import {
  Countdown,
  Dot,
  MatchingVeil,
  OwnedTag,
  PreviewButton,
  ReleaseCover,
  Spinner,
  SwipeRow,
  TypeBadge,
  canPreview,
  cardMeta,
  longMeta,
  ownedCount,
  phoneMeta,
  playRelease,
  useReleaseActions,
  type ReleaseActions,
} from './parts'

type Tab = 'up' | 'out' | 'disc'
const TABS: [Tab, string, Parameters<typeof Icon>[0]['name']][] = [
  ['up', 'Upcoming', 'upcoming'],
  ['out', 'Out now', 'album'],
  ['disc', 'Discover', 'explore'],
]
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

  const [panel, setPanelState] = useState<PanelState>(() => panelFromHash())
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

  // a song preview doesn't follow you out of New Releases
  useEffect(() => () => stopPreview(), [])

  useEffect(() => {
    if (releasesStore.due()) void releasesStore.sweep()
    else {
      void releasesStore.fillDetails()
      void refreshDiscover()
    }
  }, [])

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const ui = nowPlayingStore.get()
      if (ui.open) return
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
    <div className={`nr is-legacy ${phone ? 'is-phone' : ''}`}>
      <Header rs={rs} artistsN={artistsN} phone={phone} online={online} onArtists={() => setPanel({ kind: 'artists' })} />

      {!online && (
        <Alert tone="info" icon="offline" actions={rs.doc.sweep.at && <span className="nr-mono">LAST CHECKED {fmtStamp(rs.doc.sweep.at)}</span>}>
          No signal. Showing the last sonar.
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
          Couldn’t complete the sweep.{' '}
          {rs.error.status === 503 || rs.error.status === 429 ? 'MusicBrainz rate limited. Retrying shortly.' : 'MusicBrainz request failed.'}
        </Alert>
      )}

      {showTabs && <ReleaseTabs tab={tab} counts={counts} phone={phone} onTab={setTab} />}
      {showTabs && tab !== 'disc' && (
        <Filters
          key={tab}
          tab={tab}
          rs={rs}
          feed={feed}
          c={c}
          phone={phone}
        />
      )}

      {tab === 'out' && feed.hero && (
        <Hero
          item={feed.hero}
          line={phone ? feed.heroLine.phone : feed.heroLine.desktop}
          phone={phone}
          act={act}
          online={online}
          onOpen={open}
        />
      )}

      {empty && (
        <EmptyState
          icon={filtered ? 'tune' : tab === 'up' ? 'upcoming' : 'album'}
          title={filtered ? 'No matching releases' : tab === 'up' ? 'No upcoming releases found' : 'All caught up'}
          body={
            filtered
              ? 'Your active filters hide everything on this tab.'
              : tab === 'up'
              ? 'MusicBrainz is checked daily for new announcements. The next sweep runs at 06:00.'
              : 'All recent releases from your artists are either in your library or marked as seen.'
          }
          actions={
            filtered ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => releasesStore.setPrefs({ status: 'all', artist: null })}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {tab === 'up' && feed.weeks.length > 0 && (
        <div className="nr-weeks">
          {feed.weeks.map((w) => (
            <UpcomingWeek key={w.key} week={w} phone={phone} act={act} onOpen={open} />
          ))}
        </div>
      )}

      {tab === 'out' && (
        <>
          {feed.groups.map((g) => (
            <section key={g.key} className="nr-group">
              <div className="nr-ghead">
                <span>{g.label}</span>
                <span className="nr-gline" />
                <span className="nr-gcount">{phone ? String(g.items.length).padStart(2, '0') : g.range}</span>
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
          {phone && feed.groups.length > 0 && (
            <div className="nr-swipe-hint">SWIPE RIGHT FOR SEEN · LEFT TO DISMISS</div>
          )}
        </>
      )}

      {tab === 'disc' && <DiscoverTab items={suggestions} phone={phone} online={online} topN={TOP_ARTISTS} />}

      <ReleasePanel open={!!panel} phone={phone} onClose={close} contentKey={shown?.kind === 'rel' ? shown.id : (shown?.kind ?? '')}>
        {shown?.kind === 'artists' && <FollowedArtists c={c} phone={phone} onClose={close} />}
        {detailItem && <ReleaseDetail item={detailItem} c={c} phone={phone} online={online} act={act} onClose={close} />}
      </ReleasePanel>
    </div>
  )
}

/* ── Header ──────────────────────────────────────────── */

function Header({
  rs,
  artistsN,
  phone,
  online,
  onArtists,
}: {
  rs: ReleasesState
  artistsN: number
  phone: boolean
  online: boolean
  onArtists: () => void
}) {
  const sw = rs.sweeping
  const at = rs.doc.sweep.at
  const line = sw
    ? phone
      ? `Sweep · ${sw.done} / ${sw.total}`
      : `Sonar sweep · ${sw.done} / ${sw.total} artists`
    : at
    ? phone
      ? `Last sonar · ${fmtStamp(at)}`
      : `Last sonar · ${fmtStamp(at)} · ${artistsN} artists`
    : phone
    ? 'No sonar yet'
    : `No sonar yet · ${artistsN} artists`

  const pct = sw && sw.total ? (sw.done / sw.total) * 100 : 0

  return (
    <>
      <div className="nr-head">
        <div className="nr-head-text">
          <div className={`nr-radar ${sw ? 'is-sweeping' : ''}`}>
            <Icon name="radar" />
            <span>{line}</span>
          </div>
          <h1 className="nr-title">New releases</h1>
        </div>
        <div className="nr-head-tools">
          {phone ? (
            <IconButton icon="gear" label="Followed artists" size="lg" variant="soft" onClick={onArtists} />
          ) : (
            <Button variant="outlined-ink" size="lg" icon="gear" onClick={onArtists} title="Followed artists">
              Followed artists
              <span className="nr-follow-n">{artistsN}</span>
            </Button>
          )}
          <IconButton
            icon="refresh"
            size="lg"
            variant="tonal"
            className={sw ? 'nr-sweeping' : undefined}
            label={sw ? 'Sweeping MusicBrainz' : 'Check MusicBrainz now'}
            title={sw ? 'Sweeping MusicBrainz…' : 'Check MusicBrainz now'}
            disabled={!online && !sw}
            onClick={() => !sw && void releasesStore.sweep({ manual: true })}
          />
        </div>
      </div>
      {sw && (
        <LinearProgress className="nr-progress" value={pct / 100} />
      )}
    </>
  )
}

/* ── Tabs ────────────────────────────────────────────── */

function ReleaseTabs({
  tab,
  counts,
  phone,
  onTab,
}: {
  tab: Tab
  counts: Record<Tab, number>
  phone: boolean
  onTab: (t: Tab) => void
}) {
  // the kit Tabs; full width (and a little shorter) on the phone
  const items = TABS.map(([id, label, icon]) => ({ value: id, label, icon: phone ? undefined : icon, count: counts[id] }))
  return (
    <div className="nr-tabs">
      <KitTabs label="New releases" value={tab} onChange={onTab} items={items} full={phone} size={phone ? 'sm' : 'md'} />
      {!phone && tab === 'disc' && <span className="nr-tab-right">From your {TOP_ARTISTS} most-played artists</span>}
    </div>
  )
}

/* ── Filters (Upcoming + Out now) ─────────────────────── */

function Filters({
  tab,
  rs,
  feed,
  c,
  phone,
}: {
  tab: Tab
  rs: ReleasesState
  feed: Feed
  c: Catalogue
  phone: boolean
}) {
  const { status, artist, reversed } = rs.prefs
  const hideRe = rs.doc.hideReissues[0]
  const [artistAt, setArtistAt] = useState<HTMLElement | null>(null)

  const artistName = artist ? (c.artists[artist]?.name ?? 'Artist') : 'All artists'
  const anyFilter = (tab === 'out' && status !== 'all') || artist !== null
  const set = (s: StatusFilter) => releasesStore.setPrefs({ status: s })

  const statusOpts: [StatusFilter, string, number][] = [
    ['all', 'All', feed.status.all],
    ['new', 'New', feed.status.new],
    ['seen', 'Seen', feed.status.seen],
  ]

  const artistChip = (
    <Chip selected={artist !== null} trailingIcon="arrowDrop" popup="listbox" expanded={!!artistAt} onClick={(e) => setArtistAt(artistAt ? null : e.currentTarget)}>
      {artistName}
    </Chip>
  )

  return (
    <div className="nr-filters">
      {tab === 'out' &&
        (phone ? (
          statusOpts.map(([id, label]) => (
            <Chip key={id} selected={status === id} role="radio" onClick={() => set(id)}>
              {label}
            </Chip>
          ))
        ) : (
          <Segmented label="Status" size={36} value={status} onChange={set} options={statusOpts.map(([id, label]) => ({ value: id, label }))} />
        ))}

      {artistChip}
      <Menu open={!!artistAt} anchor={artistAt} onClose={() => setArtistAt(null)} label="Filter by artist" role="listbox" width={300}>
        <MenuItem selected={artist === null} onSelect={() => releasesStore.setPrefs({ artist: null })}>
          All artists
        </MenuItem>
        {feed.artistOpts.map((o) => (
          <MenuItem key={o.id} selected={artist === o.id} trailing={o.plays > 0 ? `${o.plays.toLocaleString('en-US')} plays` : undefined} onSelect={() => releasesStore.setPrefs({ artist: o.id })}>
            {o.name}
          </MenuItem>
        ))}
      </Menu>

      <Chip selected={hideRe} onClick={() => releasesStore.setHideReissues(!hideRe)}>
        {phone ? 'No reissues' : 'Hide reissues & deluxe'}
      </Chip>

      {tab === 'up' && (
        <Chip selected={reversed} onClick={() => releasesStore.setPrefs({ reversed: !reversed })}>
          Furthest first
        </Chip>
      )}

      {anyFilter && (
        <Button variant="ghost" size="sm"
          className="nr-clear"
          onClick={() => releasesStore.setPrefs({ status: 'all', artist: null })}
        >
          Clear filters
        </Button>
      )}

      {!phone && (
        <span className="nr-countline">
          {tab === 'up'
            ? `${feed.upLine.upcoming} UPCOMING · ${feed.upLine.reminders} REMINDERS`
            : `${feed.status.new} NEW · ${feed.status.seen} SEEN`}
        </span>
      )}
    </div>
  )
}

/* ── Upcoming Timeline ───────────────────────────────── */

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const hasDay = (it: FeedItem) => it.rel.date.split('-').length >= 3

function whenLabel(it: FeedItem): string {
  if (!hasDay(it)) return fmtRelDate(it.rel.date)
  const d = fmtRelDate(it.rel.date).replace(/ \d{4}$/, '').replace(/^0/, '')
  return `${WEEKDAYS[new Date(it.day).getDay()]} ${d}`
}

function countParts(it: FeedItem): { n: string; u: string } {
  if (!hasDay(it)) {
    const [m, y] = fmtRelDate(it.rel.date).split(' ')
    return { n: m, u: y ?? '' }
  }
  return { n: String(it.daysTo), u: it.daysTo === 1 ? 'DAY' : 'DAYS' }
}

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

function UpcomingWeek({
  week,
  phone,
  act,
  onOpen,
}: {
  week: UpWeek
  phone: boolean
  act: ReleaseActions
  onOpen: (it: FeedItem) => void
}) {
  const n = String(week.items.length).padStart(2, '0')
  if (phone) {
    return (
      <section className="nr-week-phone">
        <div className="nr-week-head-phone">
          <span className="nr-week-ring" />
          <span className="nr-week-label">{week.label}</span>
          <span className="nr-week-range">{week.range}</span>
          <span className="nr-week-line" />
          <span className="nr-week-count">{n}</span>
        </div>
        <div className="nr-week-rows-phone">
          {week.items.map((it) => (
            <UpPhoneRow key={it.rel.id} item={it} act={act} onOpen={onOpen} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="nr-week">
      <div className="nr-week-head">
        <span className="nr-week-label">{week.label}</span>
        <span className="nr-week-node">
          <span />
        </span>
        <span className="nr-week-meta">
          <span>{week.range}</span>
          <span className="nr-week-line" />
          <span>{n}</span>
        </span>
      </div>
      <div className="nr-week-rows">
        <div className="nr-week-rail" />
        {week.items.map((it) => (
          <UpRow key={it.rel.id} item={it} act={act} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function RemindButton({
  item,
  act,
  icon,
}: {
  item: FeedItem
  act: ReleaseActions
  icon?: boolean
}) {
  const on = item.reminded
  const label = on ? 'Reminder set' : 'Remind me'
  const remind = (e: MouseEvent) => {
    e.stopPropagation()
    act.remind(item)
  }
  if (icon) return <IconButton icon={on ? 'bellF' : 'bell'} label={label} size="lg" variant={on ? 'tonal' : 'soft'} pressed={on} onClick={remind} />
  return (
    <Button variant={on ? 'tonal' : 'outlined-ink'} icon={on ? 'bellF' : 'bell'} aria-pressed={on} title={label} onClick={remind}>
      {label}
    </Button>
  )
}

function UpRow({
  item,
  act,
  onOpen,
}: {
  item: FeedItem
  act: ReleaseActions
  onOpen: (it: FeedItem) => void
}) {
  const near = hasDay(item) && item.daysTo <= 4
  const cd = countParts(item)
  const key = (e: ReactKeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onOpen(item)
    }
  }

  return (
    <div
      className={`nr-up ${near ? 'is-near' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={key}
    >
      <div className="nr-up-cd">
        <span className="nr-up-n">{cd.n}</span>
        <span className="nr-up-u">{cd.u}</span>
      </div>
      <div className="nr-up-node">
        <span />
      </div>
      <div className="nr-up-cover">
        <ReleaseCover item={item} />
      </div>
      <div className="nr-up-info">
        <div className="nr-up-trow">
          {item.status === 'new' && <Dot />}
          <span className="nr-up-t">{item.rel.t}</span>
        </div>
        <button
          type="button"
          className="nr-up-a"
          onClick={(e) => {
            e.stopPropagation()
            if (!item.external && item.owners[0]) go(artistHref(item.owners[0].id))
          }}
        >
          {item.rel.a}
        </button>
        <div className="nr-up-meta">
          <TypeBadge item={item} />
          <span>{upMeta(item, false)}</span>
        </div>
      </div>
      <RemindButton item={item} act={act} />
    </div>
  )
}

function UpPhoneRow({
  item,
  act,
  onOpen,
}: {
  item: FeedItem
  act: ReleaseActions
  onOpen: (it: FeedItem) => void
}) {
  const cd = countParts(item)
  const near = hasDay(item) && item.daysTo <= 4
  return (
    <div className={`nr-up-phone ${near ? 'is-near' : ''}`} onClick={() => onOpen(item)}>
      <div className="nr-up-cd">
        <span className={`nr-up-n ${near ? 'is-near' : ''}`}>{cd.n}</span>
        <span className="nr-up-u">{cd.u}</span>
      </div>
      <div className="nr-up-cover">
        <ReleaseCover item={item} />
      </div>
      <div className="nr-up-info">
        <div className="nr-up-trow">
          <span className="nr-up-t">{item.rel.t}</span>
          {item.status === 'new' && <span className="nr-dot" />}
        </div>
        <span className="nr-up-a">{item.rel.a}</span>
        <div className="nr-up-meta">
          <span>{upMeta(item, true)}</span>
        </div>
      </div>
      <RemindButton item={item} act={act} icon />
    </div>
  )
}

/* ── Out Now Hero ────────────────────────────────────── */

function Hero({
  item,
  line,
  phone,
  act,
  online,
  onOpen,
}: {
  item: FeedItem
  line: string
  phone: boolean
  act: ReleaseActions
  online: boolean
  onOpen: (it: FeedItem) => void
}) {
  const lib = isOwned(item.status)
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  const toArtist = stop(() => {
    if (!item.external && item.owners[0]) go(artistHref(item.owners[0].id))
  })

  if (phone) {
    return (
      <div className="card card-lg card-interactive nr-hero-phone" onClick={() => onOpen(item)}>
        <div className="nr-hero-phone-top">
          <div className="nr-hero-cover">
            <ReleaseCover item={item} size="sm" />
            {item.status === 'acq' && <MatchingVeil compact />}
          </div>
          <div className="nr-hero-text">
            <span className="nr-hero-line">{line}</span>
            <div className="nr-hero-t">{item.rel.t}</div>
            <span className="nr-hero-a">{item.rel.a}</span>
          </div>
        </div>
        <div className="nr-hero-acts">
          {lib ? (
            <button type="button" className="btn btn-primary nr-hero-pbtn" onClick={stop(() => playRelease(item))}>
              <span className="btn-ic"><Icon name="playF" /></span>
              Play
            </button>
          ) : item.status === 'acq' ? (
            <Button variant="secondary" className="nr-hero-acq-btn" title="Stop matching" onClick={stop(() => act.got(item))}>
              <span className="btn-ic"><Spinner /></span>
              Matching your files…
            </Button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary nr-hero-pbtn"
                onClick={stop(() => act.got(item))}
              >
                <span className="btn-ic"><Icon name="check" /></span>
                I’ve got it
              </button>
              {online && canPreview(item) && <PreviewButton item={item} variant="heroPhone" />}
              <button
                type="button"
                className="btn btn-ghost nr-hero-sqbtn"
                title={item.status === 'seen' ? 'Mark new' : 'Mark seen'}
                aria-label={item.status === 'seen' ? 'Mark new' : 'Mark seen'}
                onClick={stop(() => act.toggleSeen(item))}
              >
                <Icon name="eye" />
              </button>
              <button
                type="button"
                className="btn btn-ghost nr-hero-sqbtn"
                title="Dismiss"
                aria-label="Dismiss"
                onClick={stop(() => act.dismiss(item))}
              >
                <Icon name="x" />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const titleSize = item.rel.t.length > 26 ? 44 : item.rel.t.length > 16 ? 52 : 60

  return (
    <div className="card card-lg card-interactive nr-hero" onClick={() => onOpen(item)}>
      <div className="nr-hero-cover">
        <ReleaseCover item={item} size="lg" />
        {item.upcoming && <Countdown item={item} />}
        {item.status === 'acq' && <MatchingVeil />}
      </div>
      <div className="nr-hero-text">
        <span className="nr-hero-line">{line}</span>
        <button
          type="button"
          className="nr-hero-trow"
          onClick={stop(() => onOpen(item))}
          aria-label={`${item.rel.t}: details`}
        >
          {item.status === 'new' && <Dot size="lg" />}
          <span className="nr-hero-t" style={{ '--nr-hero-fs': `${titleSize}px` } as CSSProperties}>
            {item.rel.t}
          </span>
        </button>
        <button type="button" className="nr-hero-a" onClick={toArtist}>
          {item.rel.a}
        </button>
        <div className="nr-hero-meta">
          <TypeBadge item={item} />
          <span>{longMeta(item)}</span>
        </div>
        <div className="nr-hero-acts">
          {lib ? (
            <>
              <button type="button" className="btn btn-primary" onClick={stop(() => playRelease(item))}>
                <span className="btn-ic"><Icon name="playF" /></span>
                Play
              </button>
              <OwnedTag item={item} />
              <span className="nr-mono">{ownedCount(item)}</span>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${item.status === 'acq' ? 'btn-secondary' : 'btn-primary'}`}
                onClick={stop(() => act.got(item))}
                title={item.status === 'acq' ? 'Stop matching' : undefined}
              >
                <span className="btn-ic">{item.status === 'acq' ? <Spinner /> : <Icon name="check" />}</span>
                {item.status === 'acq' ? 'Matching…' : "I’ve got it"}
              </button>
              {online && canPreview(item) && <PreviewButton item={item} variant="hero" />}
              <button type="button" className="btn btn-secondary" onClick={stop(() => act.toggleSeen(item))}>
                <span className="btn-ic"><Icon name="eye" /></span>
                {item.status === 'seen' ? 'Mark new' : 'Mark seen'}
              </button>
              <Chip selected={false} trailingIcon="ext" disabled={!online} onClick={stop(() => act.external(item))}>
                MusicBrainz
              </Chip>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginLeft: 'auto' }}
                onClick={stop(() => act.dismiss(item))}
              >
                <span className="btn-ic"><Icon name="x" /></span>
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Out Now Card Grid ───────────────────────────────── */

function Card({
  item,
  act,
  online,
  onOpen,
}: {
  item: FeedItem
  act: ReleaseActions
  online: boolean
  onOpen: (it: FeedItem) => void
}) {
  const lib = isOwned(item.status)
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div className="card card-md card-interactive nr-card" onClick={() => onOpen(item)}>
      <div className="nr-card-art">
        <ReleaseCover item={item} size="sm" />
        {item.status === 'new' && <span className="nr-badge-tag is-new">NEW</span>}
        {item.status === 'acq' && <span className="nr-badge-tag is-acq">MATCHING</span>}
        {lib && <span className="nr-badge-tag is-lib">IN LIBRARY</span>}

        <div className="nr-card-acts">
          {lib ? (
            <button
              type="button"
              className="nr-card-btn is-primary"
              onClick={stop(() => playRelease(item))}
            >
              <Icon name="playF" />
              Play
            </button>
          ) : (
            <>
              <button
                type="button"
                className="nr-card-btn"
                onClick={stop(() => act.got(item))}
                title={item.status === 'acq' ? 'Stop matching' : undefined}
              >
                <Icon name="check" />
                <span className="nr-card-btn-label">{item.status === 'acq' ? 'Matching' : 'Got it'}</span>
              </button>
              {online && canPreview(item) && <PreviewButton item={item} variant="card" />}
              <button
                type="button"
                className="nr-card-btn is-icon"
                aria-label="Mark seen"
                onClick={stop(() => act.toggleSeen(item))}
              >
                <Icon name="eye" />
              </button>
              <button
                type="button"
                className="nr-card-btn is-icon"
                aria-label="Dismiss"
                onClick={stop(() => act.dismiss(item))}
              >
                <Icon name="x" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="nr-card-text">
        <div className="nr-card-title">{item.rel.t}</div>
        <div className="nr-card-artist">{item.rel.a}</div>
        <div className="nr-card-sub">{cardMeta(item)}</div>
      </div>
    </div>
  )
}

function PhoneRow({
  item,
  act,
  onOpen,
}: {
  item: FeedItem
  act: ReleaseActions
  onOpen: (it: FeedItem) => void
}) {
  return (
    <SwipeRow
      seenWord={item.status === 'seen' ? 'Mark new' : 'Mark seen'}
      onTap={() => onOpen(item)}
      onSeen={() => act.toggleSeen(item)}
      onDismiss={() => act.dismiss(item)}
    >
      <div className="nr-row-cover">
        <ReleaseCover item={item} size="xs" />
      </div>
      <div className="nr-row-info">
        <div className="nr-row-trow">
          <span className="nr-row-title">{item.rel.t}</span>
          {item.status === 'new' && <span className="nr-dot" />}
        </div>
        <div className="nr-row-artist">{item.rel.a}</div>
        <div className="nr-row-meta">{phoneMeta(item)}</div>
      </div>
      {item.status === 'acq' && (
        <span className="nr-matching-badge">MATCHING</span>
      )}
    </SwipeRow>
  )
}
