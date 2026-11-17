/**
 * Home v2 (step 26, design_handoff_home_v2), top to bottom:
 *
 *   greeting header
 *   Jump back in       DJ tile + the last things played from (synced PC ↔ phone, state/recent.ts)
 *   New releases       Out now from your artists, last 30 days + "n coming soon" (Nov 2026; hidden when empty)
 *   Your <year> recap  (step 21, Dec 18 – Jan 31 only)
 *   Made for you       Day mix + Discovery first (state/madeForYou.ts), then Daily Mixes, Deep cuts,
 *                      Rediscover (state/mixes.ts, computed after first paint)
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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../design/icons'
import { useRelatedVersion } from '../lib/deezer'
import { mixDay } from '../lib/mixing'
import { libraryStats, useLibrary } from '../state/library'
import { historyStore, useHistory } from '../state/history'
import { homeShelves, monthYear, yourArtists } from '../state/homeViews'
import { prefetchRelated, radioSet, useMixSet } from '../state/mixes'
import { useMadeForYou } from '../state/madeForYou'
import { usePlaylists } from '../state/playlists'
import { recentStore, useRecent } from '../state/recent'
import { useSession } from '../state/session'
import { useGenres } from '../state/genres'
import { useDj } from '../state/dj'
import { fmtN, plural } from '../state/views'
import { href, libraryHref } from '../shell/routes'
import { usePlayingAlbumId } from './library/playback'
import { useCurrent } from '../nowplaying/player'
import { RecapShelf } from './stats/RecapShelf'
import { AlbumCardHome, ArtistCard, avatarSize, cardSize, MixCard, NewSmartCard, RadioCardView, SkelCard, SmartCard, SmartInvite, useHomeSize } from './home/cards'
import { JumpBackIn, jumpTiles } from './home/JumpBackIn'
import { ShelfCard, useConcertShelf } from './concerts/cards'
import { ReleaseCard, SoonCard, useHomeReleases } from './home/ReleasesShelf'
import { ConcertTicket, DayMixHero, ReleasesSoon } from './home/HomeHero'

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

/** Desktop: the shelves' content width, so six cards fill a row exactly (design: 6 columns, 20px gaps). */
function useShelfWidth(on: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [on])
  return { ref, w }
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
  const today = useMixSet([data, history.plays, genres.doc, dj.doc.songPenalties, day])
  // the Day mix and Discovery always lead Made for you
  const made = useMadeForYou(today, now.getTime())
  const mixes = made.set
  const radios = today ? radioSet(relVersion, now.getTime()) : null
  const concerts = useConcertShelf()
  const rels = useHomeReleases(data)
  const cur = useCurrent()
  const { ref: shelfRef, w: shelfW } = useShelfWidth(!phone)

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

  // desktop: six cards per row (design grid); phone keeps its fixed sizes
  const GAP = 20
  /** card text under a cover: 8px gap + title 20 + 4 + sub 19 */
  const CARD_TEXT = 51
  const fit = !phone && shelfW > 0
  const cs = fit ? Math.floor((shelfW - GAP * 5) / 6) : cardSize(size)
  // Concerts + Your artists share a row (1 : 1.4); artists five across their column
  const pair = !phone && !!concerts && artists.items.length > 0
  const colA = fit ? Math.floor(((shelfW - GAP) * 1.4) / 2.4) : 0
  const colC = fit ? shelfW - GAP - colA : 248
  const av = pair && fit ? Math.floor((colA - 14 * 4) / 5) : fit ? cs : avatarSize(size)
  // the big Day mix + 4-across grid only reads right with enough mixes to fill its first row
  const madeGrid = fit && !!mixes && mixes.items.length >= 5
  const nowTitle = cur.track && cur.p.playing ? cur.track.title : null
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
        <div className="h-date">
          {date}
          {nowTitle && <span className="h-now"> · Now playing {nowTitle}</span>}
        </div>
        <h1 className="h-hello">{first ? `${greeting(now.getHours())}, ${first}` : greeting(now.getHours())}</h1>
      </header>
      <div className="h-shelves" ref={shelfRef}>
        <Shelf label="Jump back in" sub={phone ? (tiles.length + 1 < 6 ? 'Your last plays' : 'Synced with PC') : tiles.length + 1 < 8 ? 'Your last plays · PC and phone' : 'Synced · PC and phone'} phone={phone} row="none" inline className="hs-jbi">
          <JumpBackIn tiles={tiles} phone={phone} size={48} />
        </Shelf>

        {(rels.items.length > 0 || rels.upcoming.length > 0) && (
          <Shelf label="New releases" sub={`From your artists${rels.fresh ? ` · ${rels.fresh} new` : ''}`} subHref={href('new')} phone={phone} className="hs-releases" row={fit ? 'none' : 'scroll'}>
            {fit ? (
              <>
                {/* design: the next release counts down in a strip over the row */}
                {rels.upcoming.length > 0 && <ReleasesSoon upcoming={rels.upcoming} />}
                {rels.items.length > 0 && (
                  <div className="hs-row">
                    {rels.items.map((it) => (
                      <ReleaseCard key={it.rel.id} item={it} size={cs} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {rels.items.map((it) => (
                  <ReleaseCard key={it.rel.id} item={it} size={cs} />
                ))}
                {rels.upcoming.length > 0 && <SoonCard upcoming={rels.upcoming} size={cs} />}
              </>
            )}
          </Shelf>
        )}

        {/* once a year: Dec 18 – Jan 31 (step 21) */}
        <RecapShelf c={data} plays={history.plays} now={now} playing={playing} />

        {(!mixes || mixes.items.length > 0) && (
          <Shelf label="Made for you" sub={mixSub} phone={phone} row={madeGrid ? 'none' : 'scroll'} className={madeGrid ? 'hs-made' : undefined}>
            {madeGrid ? (
              /* design: the Day mix big on the left (two rows tall), the rest four across */
              <div className="hs-made-grid" style={{ gridTemplateColumns: `${cs * 2 + GAP}px repeat(4, ${cs}px)` }}>
                {mixes!.items.flatMap((m, i) => {
                  const card =
                    i === 0 && m.kind === 'day' ? (
                      <DayMixHero key={m.id} c={data} mix={m} width={cs * 2 + GAP} height={(cs + CARD_TEXT) * 2 + GAP} />
                    ) : (
                      <MixCard key={m.id} c={data} mix={m} size={i === 0 ? cs * 2 + GAP : cs} />
                    )
                  return i === 0 && made.discoveryBuilding ? [card, <SkelCard key="disc-skel" size={cs} />] : [card]
                })}
              </div>
            ) : mixes
              ? mixes.items.flatMap((m, i) => {
                  const card = <MixCard key={m.id} c={data} mix={m} size={cs} />
                  // Discovery is being put together for the week: keep its place (second)
                  return i === 0 && made.discoveryBuilding ? [card, <SkelCard key="disc-skel" size={cs} />] : [card]
                })
              : [0, 1, 2, 3, 4, 5, 6].map((i) => <SkelCard key={i} size={cs} />)}
          </Shelf>
        )}

        {(!radios || radios.items.length > 0) && (
          <Shelf label="Radio for you" sub={radioSub} phone={phone}>
            {radios ? radios.items.map((r) => <RadioCardView key={r.id} c={data} radio={r} size={cs} />) : [0, 1, 2, 3, 4, 5, 6].map((i) => <SkelCard key={i} size={cs} />)}
          </Shelf>
        )}

        {concerts &&
          (pair ? (
            <div className="hs-pair" style={{ gridTemplateColumns: `${colC}px ${colA}px` }}>
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
              <ConcertTicket c={data} show={concerts.shows[0]} now={now.getTime()} />
              <div className="cx-shelf-attrib">Ticket info from Ticketmaster</div>
            </Shelf>
            <Shelf label="Your artists" sub={artists.byPlays ? 'Most played · last 90 days' : 'Most albums in your library'} subHref={libraryHref('artists')} phone={phone} className="hs-artists">
              {artists.items.slice(0, 5).map(({ artistId, n }) => (
                <ArtistCard
                  key={artistId}
                  c={data}
                  artist={data.artists[artistId]}
                  size={av}
                  sub={artists.byPlays ? `${plural(n, 'play', 'plays')} · 90 days` : plural(n, 'album', 'albums')}
                  bar={artists.byPlays ? n / Math.max(1, artists.items[0].n) : undefined}
                  plays={n}
                />
              ))}
            </Shelf>
            </div>
          ) : (
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
                <ShelfCard key={s.key} c={data} show={s} width={phone ? 216 : pair ? colC : 248} />
              ))}
            </div>
            <div className="cx-shelf-attrib">Ticket info from Ticketmaster</div>
          </Shelf>
          ))}

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

        {!pair && artists.items.length > 0 && (
        <Shelf label="Your artists" sub={artists.byPlays ? 'Most played · last 90 days' : 'Most albums in your library'} subHref={libraryHref('artists')} phone={phone} className="hs-artists">
          {artists.items.map(({ artistId, n }) => (
            <ArtistCard
              key={artistId}
              c={data}
              artist={data.artists[artistId]}
              size={av}
              sub={artists.byPlays ? `${plural(n, 'play', 'plays')} · 90 days` : plural(n, 'album', 'albums')}
              bar={artists.byPlays ? n / Math.max(1, artists.items[0].n) : undefined}
              plays={n}
            />
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
