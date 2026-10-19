/**
 * Home v2 (step 26, design_handoff_home_v2), top to bottom:
 *
 *   greeting header
 *   Jump back in       DJ tile + the last things played from (synced PC ↔ phone, state/recent.ts)
 *   Your <year> recap  (step 21, Dec 18 – Jan 31 only)
 *   Made for you       Daily Mixes, Deep cuts, Rediscover (state/mixes.ts, computed after first paint)
 *   Radio for you      six stations from what's been played (or the artists with the most albums)
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
import { libraryStats, useLibrary, type Album, type Catalogue } from '../state/library'
import { historyStore, useHistory } from '../state/history'
import { homeShelves, monthYear, yourArtists } from '../state/homeViews'
import { prefetchRelated, radioSet, useMixSet } from '../state/mixes'
import { usePlaylists } from '../state/playlists'
import { recentStore, useRecent } from '../state/recent'
import { useSession } from '../state/session'
import { useGenres } from '../state/genres'
import { useDj } from '../state/dj'
import { fmtN, plural } from '../state/views'
import { libraryHref } from '../shell/routes'
import { LibAlbumCard } from './library/common'
import { usePlayingAlbumId } from './library/playback'
import { PageHeader } from './PageHeader'
import { RecapShelf } from './stats/RecapShelf'
import { ArtistCard, avatarSize, cardSize, MixCard, NewSmartCard, RadioCardView, SkelCard, SmartCard, SmartInvite, useHomeSize } from './home/cards'
import { JumpBackIn, jumpTiles } from './home/JumpBackIn'
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

function Shelf({ label, sub, subHref, note, phone, className, children, row = 'one' }: { label: string; sub?: ReactNode; subHref?: string; note?: ReactNode; phone?: boolean; className?: string; children: ReactNode; row?: 'one' | 'scroll' | 'none' }) {
  return (
    <section className={`shelf ${className ?? ''}`}>
      <div className="shelf-head">
        <span className="shelf-label">{label}</span>
        <span className="shelf-line" />
        {phone ? (
          subHref && (
            <a className="shelf-chev" href={subHref} aria-label={`All: ${label.toLowerCase()}`}>
              <Icon name="chevR" />
            </a>
          )
        ) : sub != null ? (
          subHref ? (
            <a className="shelf-sub shelf-link" href={subHref}>
              {sub}
            </a>
          ) : (
            <span className="shelf-sub">{sub}</span>
          )
        ) : null}
      </div>
      {phone && note && <div className="shelf-note">{note}</div>}
      {row === 'one' ? <div className="shelf-row shelf-one">{children}</div> : row === 'scroll' ? <div className="hrow">{children}</div> : children}
    </section>
  )
}

function Card({ c, album, subtitle, playing }: { c: Catalogue; album: Album; subtitle: ReactNode; playing: string | null }) {
  return <LibAlbumCard c={c} album={album} subtitle={subtitle} playingAlbumId={playing} />
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
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).replace(',', '')
  const meta = phone ? date : `${date} · ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  const cs = cardSize(size)
  const tiles = jumpTiles(data, recent.items, lists.byId, mixes, history.plays, phone ? 5 : 7)
  const smart = lists.list.filter((p) => p.smart)
  const showSmart = smart.length > 0 || !hadSmart(false) ? true : false
  hadSmart(smart.length > 0)
  const level = mixes?.level ?? null
  const fewMixes = mixes && mixes.level !== 'full'
  const mixSub = !mixes ? `MIXING FROM ${fmtN(stats.tracks)} SONGS` : fewMixes ? `${plural(mixes.dailyCount, 'DAILY MIX', 'DAILY MIXES')} FOR NOW · MORE AS YOU LISTEN` : 'UPDATED TODAY · 06:00'
  const radioSub = !radios ? 'TUNING IN' : radios.byPlays ? 'FROM WHAT YOU PLAY' : 'FROM THE ARTISTS WITH THE MOST ALBUMS'

  return (
    <div className="home2">
      <PageHeader meta={meta} title={first ? `${greeting(now.getHours())}, ${first}` : greeting(now.getHours())} />
      <div className="shelves">
        <Shelf label="JUMP BACK IN" sub={tiles.length + 1 < 8 ? 'YOUR LAST PLAYS · PC AND PHONE' : 'SYNCED · PC AND PHONE'} phone={phone} row="none">
          <JumpBackIn tiles={tiles} phone={phone} size={size === 'desk' ? 56 : size === 'phone' ? 48 : 44} />
        </Shelf>

        {/* once a year: Dec 18 – Jan 31 (step 21) */}
        <RecapShelf c={data} plays={history.plays} now={now} playing={playing} />

        {(!mixes || mixes.items.length > 0) && (
          <Shelf label="MADE FOR YOU" sub={mixSub} note={!mixes ? mixSub : fewMixes ? mixSub : undefined} phone={phone} row="scroll">
            {mixes ? mixes.items.map((m) => <MixCard key={m.id} c={data} mix={m} size={cs} />) : [0, 1, 2, 3, 4, 5].map((i) => <SkelCard key={i} size={cs} kind="mix" />)}
          </Shelf>
        )}

        {(!radios || radios.items.length > 0) && (
          <Shelf label="RADIO FOR YOU" sub={radioSub} note={radios && !radios.byPlays ? radioSub : undefined} phone={phone} row="scroll">
            {radios ? radios.items.map((r) => <RadioCardView key={r.id} c={data} radio={r} size={cs} />) : [0, 1, 2, 3, 4, 5].map((i) => <SkelCard key={i} size={cs} kind="radio" />)}
          </Shelf>
        )}

        <Shelf
          label="RECENTLY ADDED"
          subHref={libraryHref('albums')}
          phone={phone}
          sub={shelves.addedThisWeek ? `${fmtN(shelves.addedThisWeek)} THIS WEEK` : `${plural(stats.albums, 'ALBUM')} · ${plural(stats.tracks, 'TRACK')}`}
        >
          {shelves.added.map((album) => (
            <Card key={album.id} c={data} album={album} subtitle={album.year ? `${album.artist} · ${album.year}` : album.artist} playing={playing} />
          ))}
        </Shelf>

        {artists.items.length > 0 && (
          <Shelf label="YOUR ARTISTS" sub={artists.byPlays ? 'MOST PLAYED · LAST 90 DAYS' : 'MOST ALBUMS IN YOUR LIBRARY'} subHref={libraryHref('artists')} phone={phone} row="scroll" className="shelf-artists">
            {artists.items.map(({ artistId, n }) => (
              <ArtistCard
                key={artistId}
                c={data}
                artist={data.artists[artistId]}
                size={avatarSize(size)}
                sub={artists.byPlays ? (phone ? plural(n, 'PLAY') : `${plural(n, 'PLAY')} · 90 DAYS`) : plural(n, 'ALBUM')}
              />
            ))}
          </Shelf>
        )}

        {showSmart && (
          <Shelf label="SMART PLAYLISTS" sub={smart.length ? `${smart.length} · ${smart.length === 1 ? 'UPDATES ITSELF' : 'UPDATE THEMSELVES'}` : 'NONE YET'} subHref={smart.length ? libraryHref('playlists') : undefined} phone={phone} row={smart.length ? 'scroll' : 'none'}>
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
          <Shelf label="REDISCOVER" sub={shelves.rediscover.some((r) => r.last) ? 'NOT HEARD IN A WHILE' : 'NOT PLAYED YET'} phone={phone}>
            {shelves.rediscover.map(({ album, last }) => (
              <Card key={album.id} c={data} album={album} playing={playing} subtitle={last ? `Last played ${monthYear(last)}` : `${album.artist} · not played yet`} />
            ))}
          </Shelf>
        )}
      </div>
    </div>
  )
}
