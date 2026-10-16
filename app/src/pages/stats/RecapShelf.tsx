/**
 * Home: the once-a-year recap shelf (step 21). Shown Dec 18–31 (the year so far) and through January
 * (the finished year) — `recapYear()` in state/stats.ts — when that year has plays. A wide recap card
 * (time listened, top artist / song, first play; opens `#/stats/<year>`) followed by the year's top
 * albums.
 */
import { useLazyCover } from '../../lib/covers'
import { Icon } from '../../design/icons'
import type { Catalogue } from '../../state/library'
import type { Play } from '../../state/history'
import { fmtHours, periodStats, recapYear, type PeriodStats } from '../../state/stats'
import { fmtN, plural } from '../../state/views'
import { statsHref } from '../../shell/routes'
import { LibAlbumCard } from '../library/common'
import './stats.css'

export function RecapShelf({ c, plays, now, playing }: { c: Catalogue; plays: readonly Play[]; now: Date; playing: string | null }) {
  const year = recapYear(now)
  if (year == null) return null
  const stats = periodStats(c, plays, { year, month: null })
  if (!stats.plays) return null
  const done = year < now.getFullYear()
  return (
    <section className="shelf shelf-recap">
      <div className="shelf-head">
        <span className="shelf-label">YOUR {year} IN MUSIC</span>
        <span className="shelf-line" />
        <a className="shelf-sub shelf-link" href={statsHref(String(year))}>
          {done ? 'YOUR YEAR, WRAPPED UP' : 'THE YEAR SO FAR'} · OPEN RECAP
        </a>
      </div>
      <div className="shelf-row shelf-one">
        <RecapCard stats={stats} year={year} />
        {stats.topAlbums.slice(0, 10).map((r, i) => (
          <LibAlbumCard
            key={r.item.id}
            c={c}
            album={r.item}
            playingAlbumId={playing}
            subtitle={
              <>
                <span className="recap-rank">#{i + 1}</span> {r.item.artist}
                <span className="acard-count"> · {plural(r.plays, 'play', 'plays')}</span>
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
  const [ref, cover] = useLazyCover<HTMLAnchorElement>(topAlbum?.cover)
  const artist = stats.topArtists[0]
  const song = stats.topTracks[0]
  const first = stats.firstPlay
  const firstDate = first ? new Date(first.at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
  return (
    <a ref={ref} className="recap-card" href={statsHref(String(year))} aria-label={`Open your ${year} recap`}>
      {cover && <img className="recap-bg" src={cover} alt="" aria-hidden />}
      <span className="recap-shade" aria-hidden />
      <span className="recap-body">
        <span className="recap-kicker">{year} · RECAP</span>
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
      <span className="recap-count" aria-hidden>
        {plural(stats.artists, 'ARTIST')} · {plural(stats.albums, 'ALBUM')}
      </span>
    </a>
  )
}
