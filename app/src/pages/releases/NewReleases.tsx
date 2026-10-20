/**
 * New Releases (step 11, handoff 12 → NewReleases.dc.html): the daily MusicBrainz sweep of every
 * artist in the library. Nothing here plays until it matches files you own; each release moves
 * new → seen → acquired → in library (or is dismissed).
 *
 * Desktop: header with the sonar line + Followed artists + refresh (sonar rings while sweeping),
 * type chips · Show seen · counts, a hero card (newest from your most played artist), then time
 * groups (Upcoming / This week / Earlier this month / Older) as a 4-column card grid. Clicking a
 * card opens the detail panel (460px); the gear opens Followed artists in the same panel.
 * Phone: compact hero, rows you drag right (seen) or left (dismiss), tap = bottom sheet.
 *
 * Data: state/releases.ts (sweep + Drive sync), state/releaseViews.ts (feed, matching).
 */
import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { Skeleton, Toggle } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import { nowPlayingStore } from '../../state/nowPlaying'
import { DEFAULT_TYPES, releasesStore, sweepTargets, useReleases, type ReleasesState } from '../../state/releases'
import { buildFeed, fmtClock, fmtStamp, nextSweepClock, type Feed, type FeedItem } from '../../state/releaseViews'
import { useIsPhone } from '../../state/viewport'
import { useMotion } from '../../state/motion'
import { artistHref, go, href, replace } from '../../shell/routes'
import { registerBack } from '../../native/backButton'
import type { RelType } from '../../lib/musicbrainz'
import { PageHeader } from '../PageHeader'
import { FollowedArtists, ReleaseDetail, ReleasePanel, type PanelState } from './ReleasePanel'
import {
  Countdown,
  Dot,
  MatchingVeil,
  ReleaseCover,
  Spinner,
  SwipeRow,
  TypeBadge,
  actionsFor,
  cardMeta,
  longMeta,
  phoneMeta,
  playRelease,
  typeLabel,
  useReleaseActions,
  type ReleaseActions,
} from './parts'
import './releases.css'

const TYPES: [RelType, string][] = [
  ['album', 'Albums'],
  ['ep', 'EPs'],
  ['single', 'Singles'],
  ['live', 'Live'],
  ['other', 'Other'],
]

export function NewReleases() {
  const { data } = useLibrary()
  if (!data) return null
  return <Page c={data} />
}

function Page({ c }: { c: Catalogue }) {
  const rs = useReleases()
  const history = useHistory()
  const phone = useIsPhone()
  const online = useOnline()
  const feed = buildFeed(rs.doc, c, history.plays, rs.prefs)
  const artistsN = useMemo(() => sweepTargets(c, rs.doc).length, [c, rs.doc])

  // #/new?artists (Settings → Followed artists) opens with the Followed artists panel
  const [panel, setPanelState] = useState<PanelState>(() => (window.location.hash.includes('?artists') ? { kind: 'artists' } : null))
  // the content stays while the panel slides out
  const [shown, setShown] = useState<PanelState>(panel)
  useEffect(() => {
    if (window.location.hash.includes('?artists')) replace(href('new'))
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
    else void releasesStore.fillDetails()
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
  const visibleCount = (feed.hero ? 1 : 0) + feed.groups.reduce((s, g) => s + g.items.length, 0)
  const caughtUp = !firstSweep && visibleCount === 0 && !rs.sweeping

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

      {(!firstSweep || feed.all.length > 0) && <Chips rs={rs} feed={feed} phone={phone} />}

      {feed.hero && <Hero item={feed.hero} line={phone ? feed.heroLine.phone : feed.heroLine.desktop} phone={phone} act={act} online={online} onOpen={open} />}

      {caughtUp && <CaughtUp rs={rs} feed={feed} artistsN={artistsN} />}

      {feed.groups.map((g) => (
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

      <ReleasePanel open={!!panel} phone={phone} onClose={close} contentKey={shown?.kind === 'rel' ? shown.id : (shown?.kind ?? '')}>
        {shown?.kind === 'artists' && <FollowedArtists c={c} phone={phone} onClose={close} />}
        {detailItem && <ReleaseDetail item={detailItem} c={c} phone={phone} online={online} act={act} onClose={close} />}
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

/* ── Chips · Show seen · counts ───────────────────────── */

function Chips({ rs, feed, phone }: { rs: ReleasesState; feed: Feed; phone: boolean }) {
  const { types, showSeen } = rs.prefs
  return (
    <div className="nr-chips">
      {TYPES.map(([t, label]) => (
        <button key={t} type="button" className="chip nr-chip" aria-pressed={types[t]} onClick={() => releasesStore.setPrefs({ types: { ...types, [t]: !types[t] } })}>
          {label}
          {!phone && <span className="nr-chip-n">{feed.typeCounts[t]}</span>}
        </button>
      ))}
      {phone ? (
        <button type="button" className="chip nr-chip" aria-pressed={showSeen} onClick={() => releasesStore.setPrefs({ showSeen: !showSeen })}>
          <span className="nr-chip-ic">
            <Icon name="eye" />
          </span>
          Seen
        </button>
      ) : (
        <>
          <span className="nr-chips-sep" />
          <label className="nr-seen" onClick={() => releasesStore.setPrefs({ showSeen: !showSeen })}>
            Show seen
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle checked={showSeen} onChange={(v) => releasesStore.setPrefs({ showSeen: v })} label="Show seen" />
            </span>
          </label>
          <span className="nr-chips-fill" />
          <span className="nr-mono nr-countline">
            {feed.counts.new} NEW · {feed.counts.seen} SEEN · {feed.counts.hidden} HIDDEN
          </span>
        </>
      )}
    </div>
  )
}

/* ── Hero ────────────────────────────────────────────── */

function Hero({ item, line, phone, act, online, onOpen }: { item: FeedItem; line: string; phone: boolean; act: ReleaseActions; online: boolean; onOpen: (it: FeedItem) => void }) {
  const lib = item.status === 'lib'
  const seen = item.status === 'seen'
  const toArtist = (e: MouseEvent) => {
    e.stopPropagation()
    go(artistHref(item.owners[0].id))
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
              {typeLabel(item)} · {phoneMeta(item)}
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
            <span className="nr-inlib">IN LIBRARY</span>
            <span className="nr-mono">{item.match?.quality}</span>
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
  const lib = item.status === 'lib'
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
        <button type="button" className={`nr-card-a ${seen ? 'is-seen' : ''}`} onClick={() => go(artistHref(item.owners[0].id))}>
          {item.rel.a}
        </button>
      </div>
      <div className="nr-card-meta">
        <TypeBadge item={item} />
        <span className={`nr-mono ${seen ? 'is-seen' : ''}`}>{cardMeta(item)}</span>
      </div>
      {lib ? (
        <div className="nr-card-lib">
          <span className="nr-inlib">IN LIBRARY</span>
          <span className="nr-mono">{item.match?.quality}</span>
          <button type="button" className="nr-sq is-end" title="Dismiss" aria-label="Dismiss" onClick={() => act.dismiss(item)}>
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
  const lib = item.status === 'lib'
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
          {typeLabel(item)} · {phoneMeta(item)}
        </span>
      </div>
      {item.upcoming && <Countdown item={item} short className="is-row" />}
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

function CaughtUp({ rs, feed, artistsN }: { rs: ReleasesState; feed: Feed; artistsN: number }) {
  const gone = feed.all.filter((it) => it.status === 'gone')
  const anyHidden = feed.counts.hidden > 0
  return (
    <div className="nr-caught">
      <BigSonar motion={false} />
      <div className="nr-caught-text">
        <div className="nr-caught-title">Nothing new on the sonar.</div>
        <div className="nr-caught-body">
          {anyHidden ? 'Every release has been sorted.' : `All ${artistsN} artists are quiet for now.`} The next sweep runs at {nextSweepClock()}.
        </div>
      </div>
      {rs.doc.sweep.at && (
        <span className="nr-mono">
          LAST SONAR · {fmtStamp(rs.doc.sweep.at)}
          {feed.counts.seen ? ` · ${feed.counts.seen} SEEN` : ''}
        </span>
      )}
      {anyHidden && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            releasesStore.setPrefs({ types: { ...DEFAULT_TYPES }, showSeen: true })
            releasesStore.markMany(
              gone.map((it) => it.rel.id),
              'seen',
            )
          }}
        >
          Bring everything back
        </button>
      )}
    </div>
  )
}
