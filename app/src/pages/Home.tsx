/**
 * Home (step 8, handoff 04 Desktop Home / 05 Android Home): greeting header and four album shelves —
 * Recently listened, Recently added, Most played, Rediscover — from the catalogue and the play
 * history (state/history.ts, synced through Drive `history.json`, so phone plays show on the PC).
 *
 * Desktop: each shelf is one row (as many cards as fit). Phone: rows scroll sideways.
 * Shelves that need history stay hidden until the first play is counted.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../design/icons'
import { libraryStats, useLibrary, type Album, type Catalogue } from '../state/library'
import { historyStore, useHistory } from '../state/history'
import { homeShelves, monthYear } from '../state/homeViews'
import { useSession } from '../state/session'
import { fmtN, plural } from '../state/views'
import { href, libraryHref } from '../shell/routes'
import { LibAlbumCard } from './library/common'
import { usePlayingAlbumId } from './library/playback'
import { AccountMenu } from './AccountMenu'
import { PageHeader } from './PageHeader'

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

function Shelf({ label, sub, subHref, children }: { label: string; sub?: ReactNode; subHref?: string; children: ReactNode }) {
  return (
    <section className="shelf">
      <div className="shelf-head">
        <span className="shelf-label">{label}</span>
        <span className="shelf-line" />
        {sub != null &&
          (subHref ? (
            <a className="shelf-sub shelf-link" href={subHref}>
              {sub}
            </a>
          ) : (
            <span className="shelf-sub">{sub}</span>
          ))}
      </div>
      <div className="shelf-row shelf-one">{children}</div>
    </section>
  )
}

function Card({ c, album, subtitle, playing }: { c: Catalogue; album: Album; subtitle: ReactNode; playing: string | null }) {
  return <LibAlbumCard c={c} album={album} subtitle={subtitle} playingAlbumId={playing} />
}

export function Home() {
  const now = useMinuteClock()
  const { account } = useSession()
  const { data } = useLibrary()
  const history = useHistory()
  const playing = usePlayingAlbumId(data)

  // pick up plays from the other device (throttled; the store also syncs on focus / reconnect)
  useEffect(() => {
    void historyStore.sync({ minAge: 60_000 })
  }, [])

  if (!data) return null

  const stats = libraryStats(data)
  const shelves = homeShelves(data, history.plays, now.getTime())
  const first = account?.name?.split(/\s+/)[0]
  const meta = `${now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).replace(',', '')} · ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <>
      <PageHeader
        meta={meta}
        title={first ? `${greeting(now.getHours())}, ${first}` : greeting(now.getHours())}
        tools={
          <>
            <a className="search-pill" href={href('search')}>
              <span className="sp-ic">
                <Icon name="search" />
              </span>
              Search your library
            </a>
            <AccountMenu />
          </>
        }
      />
      <div className="shelves">
        {shelves.listened.length > 0 && (
          <Shelf label="RECENTLY LISTENED" sub={shelves.playsThisWeek ? `${plural(shelves.playsThisWeek, 'PLAY')} · LAST 7 DAYS` : 'NOTHING THIS WEEK'}>
            {shelves.listened.map(({ album }) => (
              <Card key={album.id} c={data} album={album} subtitle={album.artist} playing={playing} />
            ))}
          </Shelf>
        )}

        <Shelf
          label="RECENTLY ADDED"
          subHref={libraryHref('albums')}
          sub={shelves.addedThisWeek ? `${fmtN(shelves.addedThisWeek)} THIS WEEK` : `${plural(stats.albums, 'ALBUM')} · ${plural(stats.tracks, 'TRACK')}`}
        >
          {shelves.added.map((album) => (
            <Card key={album.id} c={data} album={album} subtitle={album.year ? `${album.artist} · ${album.year}` : album.artist} playing={playing} />
          ))}
        </Shelf>

        {shelves.most.length > 0 && (
          <Shelf label="MOST PLAYED" sub="ALL TIME">
            {shelves.most.map(({ album, plays }) => (
              <Card
                key={album.id}
                c={data}
                album={album}
                playing={playing}
                subtitle={
                  <>
                    {album.artist}
                    <span className="acard-count"> · {plural(plays, 'play', 'plays')}</span>
                  </>
                }
              />
            ))}
          </Shelf>
        )}

        {shelves.rediscover.length > 0 && (
          <Shelf label="REDISCOVER" sub={shelves.rediscover.some((r) => r.last) ? 'NOT HEARD IN A WHILE' : 'NOT PLAYED YET'}>
            {shelves.rediscover.map(({ album, last }) => (
              <Card key={album.id} c={data} album={album} playing={playing} subtitle={last ? `Last played ${monthYear(last)}` : `${album.artist} · not played yet`} />
            ))}
          </Shelf>
        )}
      </div>
    </>
  )
}
