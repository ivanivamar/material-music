/**
 * Concerts near you (design_handoff_concerts, direction 1b "Posters + months"):
 *
 *   Concerts near you                                   [+ Add show]
 *   (📍 Near Barcelona · 50 km ▾)  9 upcoming shows · Updated today, 06:10
 *   [✓ All 9] [Next 30 days 5] [On sale now 5] [Artists I follow 5]
 *   ┌ poster ┐ ┌ poster ┐ ┌ poster ┐      next three shows you can buy tickets for
 *   November  │ card │ card │            the rest, by month (sticky month label)
 *   ⓘ Ticket info from Ticketmaster. Tickets open on their site.
 *
 * States: no home city (setup card), first refresh (skeleton), nothing nearby (clover + Widen /
 * Change city), couldn't update (amber banner over the cached list), Ticketmaster not set up.
 * Phone: a pushed page (back arrow), chips and posters scroll sideways, an extended Add show FAB.
 * Opening the page clears the sidebar badge; shows first seen since the last visit wear "New".
 */
import { useEffect, useMemo, useState } from 'react'
import { Chip, IconButton, Button, Skeleton, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { concertsStore, useConcerts, type City, type Radius } from '../../state/concerts'
import { FILTERS, buildShows, filterFn, lastUpdated, monthGroups, nearbyShows, statusLook, updatedLabel, type Show, type ShowFilter } from '../../state/concertViews'
import { useLibrary } from '../../state/library'
import { useReleases } from '../../state/releases'
import { useIsPhone } from '../../state/viewport'
import { back, href, replace } from '../../shell/routes'
import { PosterCard, ShowCard } from './cards'
import { Attribution, CitySearch, Clover, LocationPicker, RadiusSeg } from './parts'
import { ShowDialog, type DialogState } from './ShowDialog'
import './concerts.css'

const query = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '')

export function Concerts() {
  const phone = useIsPhone()
  const toast = useToast()
  const { data } = useLibrary()
  const st = useConcerts()
  const rel = useReleases()
  const home = st.doc.home[0]
  const radius = st.doc.radius[0]
  const [filter, setFilter] = useState<ShowFilter>('all')
  const [locOpen, setLocOpen] = useState(() => query().has('loc'))
  const [dialog, setDialog] = useState<DialogState | null>(() => (query().has('add') ? { mode: 'add' } : null))
  // "new" = first seen after the previous visit; the visit itself clears the badge
  const [seenBefore, setSeenBefore] = useState<number | null>(null)
  useEffect(() => {
    if (!st.loaded || seenBefore !== null) return
    setSeenBefore(st.doc.seenAt[0])
    concertsStore.markSeen()
  }, [st.loaded, seenBefore, st.doc.seenAt])
  // first visit after setting a city (or a new day): start the refresh now rather than in the background later
  useEffect(() => {
    if (concertsStore.due() && !concertsStore.get().sweeping) void concertsStore.sweep()
  }, [])
  // ?loc / ?add came from elsewhere (Home, Settings): drop them so Back doesn't reopen
  useEffect(() => {
    if (window.location.hash.includes('?')) replace(href('concerts'))
  }, [])

  const built = useMemo(() => (data ? buildShows(data, st, st.doc, rel.doc, seenBefore ?? Number.MAX_SAFE_INTEGER) : null), [data, st, rel.doc, seenBefore])
  const near = useMemo(() => (built ? nearbyShows(built, radius) : []), [built, radius])
  const shows = useMemo(() => near.filter(filterFn(filter)), [near, filter])
  if (!data || !built) return null

  const artistsN = Object.keys(data.artists).length
  const anyData = Object.keys(st.tours).length > 0
  const firstRun = !!home && !anyData && (!!st.sweeping || (!st.error && concertsStore.due()))
  const notSetUp = st.error === 'config' && !anyData
  const failed = !!home && !!st.error && st.error !== 'config' && anyData
  const updated = lastUpdated(st)
  const posters = shows.filter((s) => statusLook(s).buy).slice(0, 3)
  const rest = shows.filter((s) => !posters.includes(s))
  const months = monthGroups(rest)
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, near.filter(filterFn(f.id)).length])) as Record<ShowFilter, number>
  const openEdit = (s: Show) => s.manual && setDialog({ mode: 'edit', show: s.manual })
  const changeRadius = (r: Radius) => {
    concertsStore.setRadius(r)
    toast.show({ icon: 'radar', text: `Radius set to ${r} km` })
  }

  const metaSecond = st.sweeping ? `Checking tour dates · ${st.sweeping.done}/${st.sweeping.total}` : updated ? `Updated ${updatedLabel(updated)}` : 'Not checked yet'
  const header = (
    <header className="cx-head">
      <div className="cx-titlerow">
        <h1 className="cx-title">Concerts near you</h1>
        {home && !phone && (
          <button type="button" className="cx-add" onClick={() => setDialog({ mode: 'add' })}>
            <Icon name="plus" />
            Add show
          </button>
        )}
      </div>
      {home ? (
        <div className="cx-locrow">
          <div className="cx-locwrap">
            <button type="button" className={`cx-locpill ${locOpen ? 'is-open' : ''}`} onClick={() => setLocOpen((v) => !v)} aria-expanded={locOpen}>
              <Icon name="location" filled />
              <span>Near {home.name} ·</span>
              <span className="cx-mono">{radius} km</span>
              <Icon name="arrowDrop" className="cx-drop" />
            </button>
            {locOpen && <LocationPicker home={home} radius={radius} phone={phone} onClose={() => setLocOpen(false)} />}
          </div>
          <div className="cx-meta">
            {firstRun ? '— upcoming shows' : `${near.length} upcoming ${near.length === 1 ? 'show' : 'shows'}`}
            <span> · {failed ? `Updated ${updatedLabel(updated)}` : metaSecond}</span>
          </div>
        </div>
      ) : (
        <div className="cx-meta">Shows from the artists in your library, near where you live.</div>
      )}
    </header>
  )

  let body
  if (!home) body = <SetupCard phone={phone} artists={artistsN} />
  else if (notSetUp)
    body = (
      <div className="cx-empty">
        <Clover size={120} tone="surface" icon="concerts" iconSize={45} />
        <div className="cx-empty-title">Ticketmaster isn't connected yet</div>
        <div className="cx-empty-body">The concerts helper has no Ticketmaster key. Set the TICKETMASTER_API_KEY secret on the Firebase function and deploy it once from the PC.</div>
        <div className="cx-empty-acts">
          <Button variant="filled" size="lg" className="cx-btn" onClick={() => concertsStore.retry()}>
            <Icon name="refresh" />
            Try again
          </Button>
        </div>
      </div>
    )
  else if (firstRun) body = <ListSkeleton phone={phone} />
  else if (!near.length)
    body = (
      <div className="cx-empty">
        <Clover size={120} tone="surface" icon="eventBusy" iconSize={45} />
        <div className="cx-empty-title">No shows near you right now</div>
        <div className="cx-empty-body">
          None of your {artistsN} artists have dates within {radius} km of {home.name}. Material Music checks again tomorrow morning.
        </div>
        <div className="cx-empty-acts">
          {radius < 250 && (
            <Button variant="filled" size="lg" className="cx-btn" onClick={() => changeRadius(radius === 25 ? 50 : radius === 50 ? 100 : 250)}>
              <Icon name="radar" />
              Widen to {radius === 25 ? 50 : radius === 50 ? 100 : 250} km
            </Button>
          )}
          <Button
            variant="secondary" size="lg" className="cx-btn"
            onClick={(e) => {
              e.stopPropagation()
              setLocOpen(true)
            }}
          >
            Change city
          </Button>
        </div>
      </div>
    )
  else
    body = (
      <>
        <div className="cx-list">
          {posters.length > 0 && (
            <div className="cx-posters">
              {posters.map((s) => (
                <PosterCard key={s.key} c={data} show={s} phone={phone} />
              ))}
            </div>
          )}
          {months.length > 0 && (
            <div className="cx-months">
              {months.map((m) => (
                <section key={m.key} className="cx-month">
                  <div className="cx-month-head">
                    <h2 className="cx-month-label">{m.label}</h2>
                    <span className="cx-month-sub cx-mono">
                      {m.items.length} {m.items.length === 1 ? 'show' : 'shows'}
                    </span>
                  </div>
                  <div className="cx-month-grid">
                    {m.items.map((s) => (
                      <ShowCard key={s.key} c={data} show={s} phone={phone} onEdit={openEdit} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {!shows.length && <div className="cx-none">No shows match this filter.</div>}
        </div>
      </>
    )

  const ready = !!home && !notSetUp && !firstRun && near.length > 0
  return (
    <div className={`cx-page ${phone ? 'is-phone' : ''}`}>
      <div className="cx-glow" aria-hidden />
      {phone && (
        <div className="cx-backrow">
          <IconButton icon="back" label="Back" size="lg" variant="strong" onClick={() => back(href('home'))} />
        </div>
      )}
      {header}
      {failed && (
        <div className="cx-banner" role="status">
          <Icon name="offline" />
          <div className="cx-banner-text">
            <div className="cx-banner-title">Couldn't update concerts</div>
            <div className="cx-banner-body">
              {st.error === 'offline' ? "You're offline. " : 'Ticketmaster didn’t answer. '}
              Showing dates from {updatedLabel(updated)}. Check the status before you buy.
            </div>
          </div>
          <button type="button" className="cx-banner-btn" onClick={() => concertsStore.retry()}>
            Retry
          </button>
        </div>
      )}
      {ready && (
        <div className="cx-chips" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <Chip key={f.id} selected={filter === f.id} count={<span className="cx-mono">{counts[f.id]}</span>} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      )}
      {body}
      {(ready || (home && !notSetUp && !firstRun)) && <Attribution short={phone} />}
      {phone && home && !firstRun && !dialog && (
        <button type="button" className="cx-fab" onClick={() => setDialog({ mode: 'add' })}>
          <Icon name="plus" />
          Add show
        </button>
      )}
      {dialog && <ShowDialog state={dialog} phone={phone} homeCity={home?.name ?? ''} onClose={() => setDialog(null)} />}
    </div>
  )
}

/* ── First-time setup ───────────────────────────────── */

function SetupCard({ phone, artists }: { phone: boolean; artists: number }) {
  const toast = useToast()
  const [city, setCity] = useState<City | null>(null)
  const [radius, setRadius] = useState<Radius>(50)
  return (
    <div className="cx-setup">
      <Clover size={72} tone="tonal" icon="location" iconSize={34} filled />
      <div className="cx-setup-text">
        <div className="cx-setup-title">Where's home?</div>
        <div className="cx-setup-body">Pick a city and a radius. Once a day Material Music checks tour dates for {artists > 0 ? `all ${artists} artists` : 'every artist'} in your library and lists the ones inside that circle.</div>
      </div>
      <div className="cx-loc-group">
        <div className="cx-label">Home city</div>
        <CitySearch value={city} onPick={setCity} big icon="search" surface="high" />
      </div>
      <div className="cx-loc-group">
        <div className="cx-label">How far would you travel?</div>
        <RadiusSeg value={radius} onChange={setRadius} size={48} />
      </div>
      <div className="cx-setup-foot">
        <Button
          variant="filled" size="lg" className="cx-btn"
          disabled={!city}
          onClick={() => {
            if (!city) return
            concertsStore.setRadius(radius)
            concertsStore.setHome(city)
            toast.show({ icon: 'concerts', text: `Showing concerts near ${city.name} · ${radius} km` })
          }}
        >
          <Icon name="concerts" />
          Show concerts
        </Button>
        {!phone && <span className="cx-setup-note">You can change this in Settings.</span>}
      </div>
      {phone && <span className="cx-setup-note">You can change this in Settings.</span>}
    </div>
  )
}

/* ── Loading ────────────────────────────────────────── */

function ListSkeleton({ phone }: { phone: boolean }) {
  const rows: [string, string][] = [
    ['46%', '28%'],
    ['62%', '34%'],
    ['38%', '24%'],
    ['54%', '30%'],
    ['44%', '26%'],
  ]
  return (
    <div className="cx-skel" aria-label="Loading concerts">
      {rows.map(([w1, w2], i) => (
        <div key={i} className="cx-skel-row">
          <Skeleton width={phone ? 52 : 64} height={phone ? 58 : 64} radius={16} />
          <div className="cx-skel-main">
            <Skeleton width={phone ? 40 : 48} height={phone ? 40 : 48} radius={999} />
            <div className="cx-skel-lines">
              <Skeleton width={w1} height={14} radius={7} />
              <Skeleton width={w2} height={10} radius={5} />
            </div>
          </div>
          {!phone && <Skeleton width={96} height={28} radius={8} />}
          {!phone && <Skeleton width={112} height={40} radius={999} />}
        </div>
      ))}
    </div>
  )
}
