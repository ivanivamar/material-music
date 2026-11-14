/**
 * Home: the once-a-year recap shelf (step 21). Shown Dec 18–31 (the year so far) and through January
 * (the finished year) — `recapYear()` in state/stats.ts — when that year has plays. A wide recap card
 * (time listened, top artist / song, first play; opens `#/stats/<year>`, Share makes the recap image)
 * followed by the year's top albums. Original Pelagic card inside Home's shelf.
 */
import { useLazyCover } from '../../lib/covers'
import { Icon } from '../../design/icons'
import type { Catalogue } from '../../state/library'
import type { Play } from '../../state/history'
import { fmtHours, periodStats, recapYear, type PeriodStats } from '../../state/stats'
import { fmtN, plural } from '../../state/views'
import { go, statsHref } from '../../shell/routes'
import { AlbumCardHome, cardSize, useHomeSize } from '../home/cards'
import { ShareRecapButton } from './ShareRecap'

export function RecapShelf({ c, plays, now }: { c: Catalogue; plays: readonly Play[]; now: Date; playing?: string | null }) {
  // hooks first: the early returns below must not change how many hooks run between renders
  const size = useHomeSize()
  const year = recapYear(now)
  if (year == null) return null
  const stats = periodStats(c, plays, { year, month: null })
  if (!stats.plays) return null
  const done = year < now.getFullYear()
  const cs = cardSize(size)

  return (
    <section className="hs hs-recap">
      <div className="hs-head">
        <h2 className="hs-title">Your {year} in music</h2>
        <span className="hs-sub">{done ? 'Your year, wrapped up' : 'The year so far'}</span>
        <span className="hs-flex" />
        <a className="hs-more" href={statsHref(String(year))}>
          Open recap
        </a>
      </div>
      <div className="hs-row">
        <RecapCard stats={stats} year={year} />
        {stats.topAlbums.slice(0, 10).map((r, i) => (
          <AlbumCardHome
            key={r.item.id}
            c={c}
            album={r.item}
            size={cs}
            subtitle={
              <>
                <span className="recap-rank">#{i + 1}</span> {r.item.artist} · {plural(r.plays, 'play', 'plays')}
              </>
            }
          />
        ))}
      </div>
    </section>
  )
}

function RecapCard({ stats, year }: { stats: PeriodStats; year: number }) {
  const topAlbum = stats.topAlbums[0]?.item
  const [ref, cover] = useLazyCover<HTMLDivElement>(topAlbum?.cover)
  const artist = stats.topArtists[0]
  const song = stats.topTracks[0]
  const first = stats.firstPlay
  const firstDate = first ? new Date(first.at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
  const open = () => go(statsHref(String(year)))
  return (
    <div
      ref={ref}
      className="recap-card"
      role="link"
      tabIndex={0}
      aria-label={`Open your ${year} recap`}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open()}
    >
      {cover && <img className="recap-bg" src={cover} alt="" aria-hidden />}
      <span className="recap-shade" aria-hidden />
      <span className="recap-body">
        <span className="recap-top">
          <span className="recap-kicker">{year} · RECAP</span>
          <span className="recap-count" aria-hidden>
            {plural(stats.artists, 'ARTIST')} · {plural(stats.albums, 'ALBUM')}
          </span>
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <ShareRecapButton year={year} compact className="recap-share" />
          </span>
        </span>
        <span className="recap-hours">
          <span className="recap-num">{fmtHours(stats.seconds)}</span>
          <span className="recap-unit">HOURS · {fmtN(stats.plays)} PLAYS</span>
        </span>
        <span className="recap-lines">
          {artist && (
            <span className="recap-line">
              <span className="recap-k">TOP ARTIST</span>
              <span className="recap-v">{artist.item.name}</span>
            </span>
          )}
          {song && (
            <span className="recap-line">
              <span className="recap-k">TOP SONG</span>
              <span className="recap-v">
                {song.item.title}
                <span className="recap-dim"> · {plural(song.plays, 'play', 'plays')}</span>
              </span>
            </span>
          )}
          {first && (
            <span className="recap-line">
              <span className="recap-k">FIRST PLAY</span>
              <span className="recap-v">
                {first.track.title}
                <span className="recap-dim"> · {firstDate}</span>
              </span>
            </span>
          )}
        </span>
        <span className="recap-open">
          OPEN RECAP <Icon name="chevR" />
        </span>
      </span>
    </div>
  )
}
