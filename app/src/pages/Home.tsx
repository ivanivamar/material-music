/**
 * Home v2 (step 26, design_handoff_home_v2), top to bottom:
 *
 *   greeting header
 *   Jump back in       DJ tile + the last things played from (synced PC ↔ phone, state/recent.ts)
 *   Your <year> recap  (step 21, Dec 18 – Jan 31 only)
 *   Made for you       Daily Mixes, Deep cuts, Rediscover (state/mixes.ts, computed after first paint)
 *   Radio for you      six stations from what's been played (or the artists with the most albums)
 *   Concerts near you  up to four shows near the home city (Concerts; only once a city is set)
 *   Recently added
 *   Your artists       most played album artists, 90 days (or most albums)
 *   Smart playlists    + "New smart playlist" (an invite while there are none)
 *   Rediscover         album shelf (step 8; hidden while history is thin)
 *
 * Everything but Made for you / Radio for you paints at once from the local catalogue; those two keep
 * their place with placeholder cards and fade in.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../design/icons'
import { useRelatedVersion } from '../lib/deezer'
import { mixDay } from '../lib/mixing'
import { libraryStats, useLibrary } from '../state/library'
import { historyStore, useHistory } from '../state/history'
import { homeShelves, monthYear, yourArtists } from '../state/homeViews'
import { prefetchRelated, radioSet, useMixSet } from '../state/mixes'
import { usePlaylists } from '../state/playlists'
import { recentStore, useRecent } from '../state/recent'
import { useSession } from '../state/session'
import { useGenres } from '../state/genres'
import { useDj } from '../state/dj'
import { fmtN, plural } from '../state/views'
import { href, libraryHref } from '../shell/routes'
import { usePlayingAlbumId } from './library/playback'
import { RecapShelf } from './stats/RecapShelf'
import { AlbumCardHome, ArtistCard, avatarSize, cardSize, MixCard, NewSmartCard, RadioCardView, SkelCard, SmartCard, SmartInvite, useHomeSize } from './home/cards'
import { JumpBackIn, jumpTiles } from './home/JumpBackIn'
import { ShelfCard, useConcertShelf } from './concerts/cards'
import './home/home.css'

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setTimeout(function tick() {
      setNow(new Date())
    }, 60_000 - (Date.now() % 60_000))
    return () => window.clearTimeout(id)
  }, [now])
  return now
}

const greeting = (h: number) => (h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')

/** Shelf: title + note (+ "See all" on desktop, an arrow on phone); cards scroll sideways. */
function Shelf({ label, sub, subHref, moreLabel = 'See all', phone, className, children, row = 'scroll', inline }: { label: string; sub?: ReactNode; subHref?: string; moreLabel?: string; phone?: boolean; className?: string; children: ReactNode; row?: 'scroll' | 'none'; inline?: boolean }) {
  return (
    <section className={`hs ${className ?? ''}`}>
      <div className="hs-head">
        <h2 className="hs-title">{label}</h2>
        {(!phone || inline) && sub != null && <span className="hs-sub">{sub}</span>}
        <span className="hs-flex" />
        {subHref &&
          (phone ? (
            <a className="hs-arrow" href={subHref} aria-label={`See all: ${label}`}>
              <Icon name="arrowR" />
            </a>
          ) : (
            <a className="hs-more" href={subHref}>
              {moreLabel}
            </a>
          ))}
      </div>
      {phone && !inline && sub != null && <div className="hs-sub is-below">{sub}</div>}
      {row === 'scroll' ? <div className="hs-row">{children}</div> : children}
    </section>
  )
}

const HAD_SMART = 'pelagic.home.hadSmart'
function hadSmart(now: boolean): boolean {
  try {
    if (now) localStorage.setItem(HAD_SMART, '1')
    return now || localStorage.getItem(HAD_SMART) === '1'
  } catch {
    return now
  }
}

export function Home() {
  const now = useMinuteClock()
  const { account } = useSession()
  const { data } = useLibrary()
  const history = useHistory()
  const recent = useRecent()
  const lists = usePlaylists()
  const genres = useGenres()
  const dj = useDj()
  const playing = usePlayingAlbumId(data)
  const size = useHomeSize()
  const phone = size !== 'desk'
  const relVersion = useRelatedVersion()
  const day = mixDay(now.getTime()).key
  const mixes = useMixSet([data, history.plays, genres.doc, dj.doc.songPenalties, day])
  const radios = mixes ? radioSet(relVersion, now.getTime()) : null
  const concerts = useConcertShelf()

  // pick up plays / recents from the other device (throttled; the stores also sync on focus / reconnect)
  useEffect(() => {
    void historyStore.sync({ minAge: 60_000 })
    void recentStore.sync({ minAge: 60_000 })
  }, [])
  // Deezer neighbours for the station subtitles (and the radios themselves), in the background
  useEffect(() => {
    if (radios) prefetchRelated(radios)
  }, [radios])

  if (!data) return null

  const stats = libraryStats(data)
  const shelves = homeShelves(data, history.plays, now.getTime())
  const artists = yourArtists(data, history.plays, now.getTime())
  const first = account?.name?.split(/\s+/)[0]
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')

  const cs = cardSize(size)
  const tiles = jumpTiles(data, recent.items, lists.byId, mixes, history.plays, phone ? 5 : 7)
  const smart = lists.list.filter((p) => p.smart)
  const showSmart = smart.length > 0 || !hadSmart(false) ? true : false
  hadSmart(smart.length > 0)
  const level = mixes?.level ?? null
  const fewMixes = mixes && mixes.level !== 'full'
  const mixSub = !mixes ? `Mixing from ${fmtN(stats.tracks)} songs` : fewMixes ? `${plural(mixes.dailyCount, 'daily mix', 'daily mixes')} for now · more as you listen` : 'Updated today · 06:00'
  const radioSub = !radios ? 'Tuning in' : radios.byPlays ? 'From what you play' : 'From the artists with the most albums'

  return (
    <div className="home2">
      <header className="h-greet">
        <div className="h-date">{date}</div>
        <h1 className="h-hello">{first ? `${greeting(now.getHours())}, ${first}` : greeting(now.getHours())}</h1>
      </header>
      <div className="h-shelves">
        <Shelf label="Jump back in" sub={phone ? (tiles.length + 1 < 6 ? 'Your last plays' : 'Synced with PC') : tiles.length + 1 < 8 ? 'Your last plays · PC and phone' : 'Synced · PC and phone'} phone={phone} row="none" inline className="hs-jbi">
          <JumpBackIn tiles={tiles} phone={phone} size={size === 'desk' ? 56 : 48} />
        </Shelf>

        {/* once a year: Dec 18 – Jan 31 (step 21) */}
        <RecapShelf c={data} plays={history.plays} now={now} playing={playing} />

        {(!mixes || mixes.items.length > 0) && (
          <Shelf label="Made for you" sub={mixSub} phone={phone}>
            {mixes ? mixes.items.map((m) => <MixCard key={m.id} c={data} mix={m} size={cs} />) : [0, 1, 2, 3, 4, 5, 6].map((i) => <SkelCard key={i} size={cs} />)}
          </Shelf>
        )}

        {(!radios || radios.items.length > 0) && (
          <Shelf label="Radio for you" sub={radioSub} phone={phone}>
            {radios ? radios.items.map((r) => <RadioCardView key={r.id} c={data} radio={r} size={cs} />) : [0, 1, 2, 3, 4, 5, 6].map((i) => <SkelCard key={i} size={cs} />)}
          </Shelf>
        )}

        {concerts && (
          <Shelf
            label="Concerts near you"
            sub={
              <>
                {concerts.city} · <span className="cx-mono">{concerts.radius} km</span>
              </>
            }
            subHref={href('concerts')}
            moreLabel={`See all ${concerts.total}`}
            phone={phone}
            row="none"
            className="hs-concerts"
          >
            <div className="hs-row cx-shelf-row">
              {concerts.shows.map((s) => (
                <ShelfCard key={s.key} c={data} show={s} width={phone ? 216 : 248} />
              ))}
            </div>
            <div className="cx-shelf-attrib">Ticket info from Ticketmaster</div>
          </Shelf>
        )}

        <Shelf
          label="Recently added"
          subHref={libraryHref('albums')}
          phone={phone}
          sub={shelves.addedThisWeek ? `${fmtN(shelves.addedThisWeek)} this week` : `${plural(stats.albums, 'album', 'albums')} · ${plural(stats.tracks, 'song', 'songs')}`}
        >
          {shelves.added.map((album) => (
            <AlbumCardHome key={album.id} c={data} album={album} size={cs} subtitle={album.year ? `${album.artist} · ${album.year}` : album.artist} />
          ))}
        </Shelf>

        {artists.items.length > 0 && (
          <Shelf label="Your artists" sub={artists.byPlays ? 'Most played · last 90 days' : 'Most albums in your library'} subHref={libraryHref('artists')} phone={phone} className="hs-artists">
            {artists.items.map(({ artistId, n }) => (
              <ArtistCard key={artistId} c={data} artist={data.artists[artistId]} size={avatarSize(size)} sub={artists.byPlays ? `${plural(n, 'play', 'plays')} · 90 days` : plural(n, 'album', 'albums')} />
            ))}
          </Shelf>
        )}

        {showSmart && (
          <Shelf label="Smart playlists" sub={smart.length ? `${smart.length} · ${smart.length === 1 ? 'updates itself' : 'update themselves'}` : 'None yet'} subHref={smart.length ? libraryHref('playlists') : undefined} phone={phone} row={smart.length ? 'scroll' : 'none'}>
            {smart.length ? (
              <>
                {smart.map((p) => (
                  <SmartCard key={p.id} c={data} playlist={p} size={cs} />
                ))}
                <NewSmartCard size={cs} />
              </>
            ) : (
              <SmartInvite phone={phone} />
            )}
          </Shelf>
        )}

        {level === 'full' && shelves.rediscover.length > 0 && (
          <Shelf label="Rediscover" sub={shelves.rediscover.some((r) => r.last) ? 'Not heard in a while' : 'Not played yet'} phone={phone}>
            {shelves.rediscover.map(({ album, last }) => (
              <AlbumCardHome key={album.id} c={data} album={album} size={cs} subtitle={last ? `Last played ${monthYear(last)}` : `${album.artist} · not played yet`} />
            ))}
          </Shelf>
        )}
      </div>
    </div>
  )
}
