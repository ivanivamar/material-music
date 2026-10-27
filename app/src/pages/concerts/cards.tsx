/**
 * Concert cards: the poster (next three shows you can buy for), the month-list card, and the Home
 * shelf card. Tapping the artist photo or name opens the Artist page; Tickets opens Ticketmaster (or
 * the saved link) in the browser; the "Added by you" chip reopens the form.
 */
import { useMemo, type MouseEvent } from 'react'
import { Icon } from '../../design/icons'
import { useCover } from '../../lib/covers'
import { useLibrary, type Catalogue } from '../../state/library'
import { buildShows, dateLine, kmLabel, metaLine, nearbyShows, statusLook, timeLabel, type Show } from '../../state/concertViews'
import { useConcerts } from '../../state/concerts'
import { useReleases } from '../../state/releases'
import { ArtistPhoto, DateBlock, StatusChip, TicketsIcon, TicketsPill, hueVars, openArtist, useArtistLook } from './parts'

const othersLabel = (c: Catalogue, s: Show) => {
  const names = s.others.map((id) => c.artists[id]?.name).filter(Boolean)
  return names.length ? `+ ${names.length} ${names.length === 1 ? 'artist' : 'artists'} you have: ${names.join(', ')}` : ''
}

function LineupFace({ id }: { id: string }) {
  const { data } = useLibrary()
  const a = data?.artists[id]
  const photo = useCover(a?.image?.id, a?.image?.v) ?? null
  return <ArtistPhoto artist={a} photo={photo} size={22} className="cx-face" title={a?.name} />
}

/* ── Poster ─────────────────────────────────────────── */

export function PosterCard({ c, show, phone }: { c: Catalogue; show: Show; phone: boolean }) {
  const a = c.artists[show.artistId]
  const look = useArtistLook(a)
  // the artist background when there is one (wider), else the photo
  const bg = useCover(a?.background?.id, a?.background?.v) ?? look.photo
  const sl = statusLook(show)
  const others = othersLabel(c, show)
  return (
    <article className="cx-poster" style={hueVars(look.H)} onClick={openArtist(show.artistId)}>
      <div className="cx-poster-art">
        {bg ? <img src={bg} alt="" draggable={false} /> : <span className="cx-poster-none">{a?.name.slice(0, 1)}</span>}
        <DateBlock show={show} kind={phone ? 'poster-sm' : 'poster'} className="cx-poster-date" />
        <span className="cx-poster-chip">
          <StatusChip show={show} size={phone ? 'md' : 'lg'} solid label={sl.label} />
        </span>
      </div>
      <div className="cx-poster-body">
        <div className="cx-poster-text">
          {show.festival && (
            <div className="cx-fest">
              {!phone && <Icon name="festival" />}
              {show.festival}
            </div>
          )}
          <button type="button" className="cx-poster-name" onClick={openArtist(show.artistId)}>
            {a?.name}
          </button>
          <div className="cx-poster-place">
            {show.venue} · {show.city}
          </div>
          {show.festival && others && (
            <div className="cx-lineup">
              {!phone && (
                <span className="cx-faces">
                  {show.others.slice(0, 4).map((id) => (
                    <LineupFace key={id} id={id} />
                  ))}
                </span>
              )}
              <span className="cx-lineup-l">{others}</span>
            </div>
          )}
        </div>
        <div className="cx-flex" />
        <div className="cx-poster-foot">
          <span className="cx-mono cx-poster-meta">{phone ? metaLine(show, false) : metaLine(show)}</span>
          <TicketsPill show={show} filled size={phone ? 44 : 40} />
        </div>
      </div>
    </article>
  )
}

/* ── Month card ─────────────────────────────────────── */

export function ShowCard({ c, show, phone, onEdit }: { c: Catalogue; show: Show; phone: boolean; onEdit: (s: Show) => void }) {
  const a = c.artists[show.artistId]
  const look = useArtistLook(a)
  const sl = statusLook(show)
  const cancelled = show.status === 'cancelled'
  const others = othersLabel(c, show)
  const place = [show.venue, show.city, kmLabel(show.km)].filter(Boolean).join(' · ')
  const chipClick = show.manual ? (e: MouseEvent) => (e.stopPropagation(), onEdit(show)) : undefined
  return (
    <article className={`cx-card ${cancelled ? 'is-cancelled' : ''}`} style={hueVars(look.H)} onClick={openArtist(show.artistId)}>
      <ArtistPhoto artist={a} photo={look.photo} size={phone ? 48 : 56} grey={cancelled} className="has-ring" />
      <div className="cx-card-text">
        <div className="cx-dl cx-mono">{dateLine(show)}</div>
        <div className="cx-card-name">
          <button type="button" className="cx-name-btn" onClick={openArtist(show.artistId)}>
            {a?.name}
          </button>
          {show.isNew && !phone && <span className="cx-new">New</span>}
        </div>
        <div className="cx-card-place">{place}</div>
        {show.festival && others && !phone && (
          <div className="cx-card-fest">
            {show.festival} · {others}
          </div>
        )}
        <div className="cx-card-status">
          <StatusChip show={show} onClick={chipClick} />
          {show.price && !phone && <span className="cx-mono cx-price">{show.price}</span>}
          {sl.note && <span className="cx-note">{sl.note}</span>}
        </div>
      </div>
      <TicketsIcon show={show} size={phone ? 44 : 40} />
    </article>
  )
}

/* ── Home shelf card ────────────────────────────────── */

export function ShelfCard({ c, show, width }: { c: Catalogue; show: Show; width: number }) {
  const a = c.artists[show.artistId]
  const look = useArtistLook(a)
  return (
    <article className="cx-shelf-card" style={{ ...hueVars(look.H), width }} onClick={openArtist(show.artistId)}>
      <div className="cx-shelf-top">
        <ArtistPhoto artist={a} photo={look.photo} size={56} className="has-ring" />
        <DateBlock show={show} kind="small" />
      </div>
      <div className="cx-shelf-text">
        <div className="cx-shelf-name">{a?.name}</div>
        <div className="cx-shelf-place">
          {show.venue} · {show.city}
        </div>
        <div className="cx-mono cx-shelf-meta">{[timeLabel(show), kmLabel(show.km)].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="cx-shelf-foot">
        <StatusChip show={show} size="sm" />
        <TicketsIcon show={show} />
      </div>
    </article>
  )
}

/* ── Home shelf data ────────────────────────────────── */

/** Up to four nearby shows you can buy (or soon) for the Home shelf, and the total for "See all". */
export function useConcertShelf(): { shows: Show[]; total: number; city: string; radius: number } | null {
  const { data } = useLibrary()
  const st = useConcerts()
  const rel = useReleases()
  return useMemo(() => {
    const home = st.doc.home[0]
    if (!data || !home) return null
    const near = nearbyShows(buildShows(data, st, st.doc, rel.doc, st.doc.seenAt[0]), st.doc.radius[0])
    const shows = near.filter((s) => statusLook(s).buy || s.status === 'notyet').slice(0, 4)
    return shows.length ? { shows, total: near.length, city: home.name, radius: st.doc.radius[0] } : null
  }, [data, st, rel.doc])
}
