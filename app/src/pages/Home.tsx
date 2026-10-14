/**
 * Home — for now: greeting header (handoff 04 Desktop Home) and the "Recently added" shelf from
 * the real catalogue. The full Home (recently played, most played, rediscover) is step 7.
 */
import { useEffect, useState } from 'react'
import { AlbumCard } from '../components/ui'
import { Icon } from '../design/icons'
import { useCover } from '../lib/covers'
import { albumsByAdded, libraryStats, tracksByAlbum, useLibrary, type Album } from '../state/library'
import { playerStore, usePlayer } from '../state/player'
import { useSession } from '../state/session'
import { albumHref, go, href, libraryHref } from '../shell/routes'
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
const fmtN = (n: number) => n.toLocaleString('en-US')

function AlbumTile({ album, playing }: { album: Album; playing: boolean }) {
  const cover = useCover(album.cover)
  const { data } = useLibrary()
  return (
    <AlbumCard
      title={album.title}
      subtitle={album.year ? `${album.artist} · ${album.year}` : album.artist}
      cover={cover ?? undefined}
      playing={playing}
      onOpen={() => go(albumHref(album.id))}
      onPlay={() => {
        const ids = data ? (tracksByAlbum(data).get(album.id) ?? []).map((t) => t.id) : []
        playerStore.playQueue(ids, 0, { kind: 'album', id: album.id, label: album.title })
      }}
    />
  )
}

export function Home() {
  const now = useMinuteClock()
  const { account } = useSession()
  const { data } = useLibrary()
  const player = usePlayer()
  if (!data) return null

  const stats = libraryStats(data)
  const recent = albumsByAdded(data).slice(0, 18)
  const playingAlbum = player.playing && player.index >= 0 ? data.tracks[player.queue[player.index]]?.albumId : undefined
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
        <section className="shelf">
          <div className="shelf-head">
            <span className="shelf-label">RECENTLY ADDED</span>
            <span className="shelf-line" />
            <a className="shelf-sub shelf-link" href={libraryHref('albums')}>
              {fmtN(stats.albums)} ALBUMS · {fmtN(stats.tracks)} TRACKS · {fmtN(stats.artists)} ARTISTS
            </a>
          </div>
          <div className="shelf-row">
            {recent.map((a) => (
              <AlbumTile key={a.id} album={a} playing={a.id === playingAlbum} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
