/**
 * Artist page → On tour (design_handoff_concerts §2). Desktop: top of the right column, above
 * Albums. Phone: between the action buttons and Most played.
 *
 *   On tour  14 dates
 *   📍 Near Barcelona · 50 km
 *   ┌ [OCT 29] Razzmatazz · Barcelona / 20:30 · 3 km · €38–52 / [On sale]        [Tickets ↗] ┐
 *   🌐 12 more dates in Europe and North America                                         ⌄
 *      SAT 31 OCT  Madrid, Spain / La Riviera                                      [Sold out] ↗
 *   Ticket info from Ticketmaster
 *
 * States: loading (skeleton), no dates (section hidden), nothing nearby (a note, then the far
 * dates), no home city (prompt → Settings), couldn't load (outlined row + Retry).
 * `useTourNear` feeds the hero chip "Playing near you · Thu 29 Oct".
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Skeleton } from '../../components/ui'
import { Icon } from '../../design/icons'
import { concertsStore, useConcerts } from '../../state/concerts'
import { buildShows, dateLine, isNear, metaLine, regionsLabel, shortDate, statusLook, type Show } from '../../state/concertViews'
import { useLibrary } from '../../state/library'
import { useReleases } from '../../state/releases'
import { go } from '../../shell/routes'
import { DateBlock, StatusChip, TicketsIcon, TicketsPill, hueVars } from './parts'
import './concerts.css'

export const ON_TOUR_ID = 'on-tour'

/** The artist's upcoming shows, split by the home circle. */
function useArtistShows(artistId: string) {
  const { data } = useLibrary()
  const st = useConcerts()
  const rel = useReleases()
  return useMemo(() => {
    if (!data) return null
    const b = buildShows(data, st, st.doc, rel.doc, Number.MAX_SAFE_INTEGER)
    const all = b.byArtist.get(artistId) ?? []
    const radius = st.doc.radius[0]
    const home = st.doc.home[0]
    const near = home ? all.filter((s) => isNear(s, radius)) : []
    const far = home ? all.filter((s) => !isNear(s, radius)) : all
    return { all, near, far, home, radius }
  }, [data, st, rel.doc, artistId])
}

/** First show near home, for the hero chip. */
export function useTourNear(artistId: string): Show | null {
  const s = useArtistShows(artistId)
  return s?.near.find((x) => x.status !== 'cancelled') ?? null
}

export function HeroTourChip({ show }: { show: Show }) {
  return (
    <button
      type="button"
      className="ot-hero-chip"
      onClick={() => document.getElementById(ON_TOUR_ID)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
    >
      <Icon name="location" filled />
      Playing near you · {shortDate(show.date)}
    </button>
  )
}

function NearRow({ show, artistId, H }: { show: Show; artistId: string; H: number }) {
  const { data } = useLibrary()
  const sl = statusLook(show)
  const with_ = [show.artistId, ...show.others].filter((id) => id !== artistId).map((id) => data?.artists[id]?.name).filter(Boolean) as string[]
  const withL = with_.length ? `With ${with_.length === 1 ? with_[0] : `${with_.slice(0, -1).join(', ')} and ${with_[with_.length - 1]}`} from your library` : ''
  return (
    <div className={`ot-row ${show.status === 'cancelled' ? 'is-cancelled' : ''}`} style={hueVars(H)}>
      <DateBlock show={show} kind="tour" />
      <div className="ot-row-text">
        {show.festival && (
          <div className="ot-fest">
            <Icon name="festival" />
            {show.festival}
          </div>
        )}
        <div className="ot-place">
          {show.venue} · {show.city}
        </div>
        <div className="ot-meta cx-mono">{metaLine(show)}</div>
        {withL && <div className="ot-with">{withL}</div>}
        {sl.note && <div className="ot-note">{sl.note}</div>}
        <div className="ot-actions">
          <StatusChip show={show} size="sm" />
          <span className="cx-flex" />
          <TicketsPill show={show} size={36} />
        </div>
      </div>
    </div>
  )
}

const DEFAULT_STATUS = new Set(['onsale', 'presale', 'resched'])

function FarRow({ show }: { show: Show }) {
  const place = [show.city, show.country].filter(Boolean).join(', ')
  return (
    <div className={`ot-far ${show.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <div className="ot-far-date cx-mono">{dateLine({ date: show.date, end: show.end })}</div>
      <div className="ot-far-text">
        <div className="ot-far-city">{place || show.venue}</div>
        {place && <div className="ot-far-venue">{show.venue}</div>}
      </div>
      <div className="ot-far-side">
        {!DEFAULT_STATUS.has(show.status) && <StatusChip show={show} size="sm" />}
        <TicketsIcon show={show} plain />
      </div>
    </div>
  )
}

export function OnTour({ artistId, H }: { artistId: string; H: number }) {
  const st = useConcerts()
  const shows = useArtistShows(artistId)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void concertsStore.ensureArtist(artistId)
  }, [artistId])
  if (!shows) return null
  const tour = st.tours[artistId]
  const loading = !tour && (st.fetching.includes(artistId) || (!!st.sweeping && !st.artistErrors.includes(artistId)))
  const error = !tour && st.artistErrors.includes(artistId)
  if (!loading && !error && !shows.all.length) return null
  const { home, radius, near, far, all } = shows
  const count = `${all.length} ${all.length === 1 ? 'date' : 'dates'}`

  let body
  if (loading)
    body = (
      <div className="ot-skel">
        <div className="ot-skel-row">
          <Skeleton width={52} height={56} radius={16} />
          <div className="ot-skel-lines">
            <Skeleton width="60%" height={14} radius={7} />
            <Skeleton width="40%" height={10} radius={5} />
          </div>
        </div>
        <Skeleton height={52} radius="8px 8px 24px 24px" />
      </div>
    )
  else if (error)
    body = (
      <div className="ot-error">
        <Icon name="offline" />
        <div className="ot-error-l">Couldn't load tour dates</div>
        <Button variant="ghost" onClick={() => void concertsStore.ensureArtist(artistId, true)}>
          Retry
        </Button>
      </div>
    )
  else if (!home)
    body = (
      <div className="ot-prompt">
        <span className="ot-prompt-tile">
          <Icon name="location" />
        </span>
        <div className="ot-prompt-text">
          <div className="ot-prompt-title">See which dates are near you</div>
          <div className="ot-prompt-sub">{`${all.length} upcoming ${all.length === 1 ? 'date' : 'dates'}`} · set a home city</div>
        </div>
        <Button variant="brand" className="cx-btn" onClick={() => go('#/settings?city')}>
          Set city
        </Button>
      </div>
    )
  else {
    const closest = !near.length ? [...far].filter((s) => s.km != null).sort((a, b) => a.km! - b.km!)[0] : null
    const regions = regionsLabel(far)
    const moreL = open ? 'Hide dates elsewhere' : near.length ? `${far.length} more ${far.length === 1 ? 'date' : 'dates'} ${regions}`.trim() : `${far.length} ${far.length === 1 ? 'date' : 'dates'} ${regions}`.trim()
    body = (
      <>
        {!near.length && (
          <div className="ot-farnote">
            Nothing within {radius} km of {home.name}.{closest ? ` Closest is ${closest.city} on ${shortDate(closest.date)}.` : ''}
          </div>
        )}
        <div className="ot-list">
          {near.map((s) => (
            <NearRow key={s.key} show={s} artistId={artistId} H={H} />
          ))}
          {far.length > 0 && (
            <button type="button" className={`ot-more ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <Icon name="globe" />
              <span className="ot-more-l">{moreL}</span>
              <Icon name="chevD" className="ot-chev" />
            </button>
          )}
          {open && far.map((s) => <FarRow key={s.key} show={s} />)}
        </div>
      </>
    )
  }

  return (
    <section className="ot" id={ON_TOUR_ID} aria-label="On tour">
      <div className="ot-head">
        <div className="ot-titlerow">
          <h2 className="ot-title">On tour</h2>
          {!loading && !error && <span className="ot-count">{count}</span>}
        </div>
        {home && (
          <div className="ot-sub">
            <Icon name="location" filled />
            Near {home.name} · <span className="cx-mono">{radius} km</span>
          </div>
        )}
      </div>
      {body}
      <div className="ot-attrib">Ticket info from Ticketmaster</div>
    </section>
  )
}
