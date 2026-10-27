/**
 * Home: the once-a-year recap shelf (step 21). Shown Dec 18–31 (the year so far) and through January
 * (the finished year) — `recapYear()` in state/stats.ts — when that year has plays.
 *
 * Material 3 Expressive redesign:
 * - Uses Home's standard `<Shelf>` wrapper with "Open recap" CTA
 * - The Recap card is an expressive surface card washed in the top album's hue, with morphing shapes,
 *   a tilted cover preview, and a prominent cookie play button.
 * - Top albums render using standard `AlbumCardHome` with rank badges.
 */
import type { CSSProperties } from 'react'
import { useLazyCover } from '../../lib/covers'
import { useArtTint } from '../../design/tint'
import { Icon } from '../../design/icons'
import { SHAPE_BURST, SHAPE_CLOVER } from '../../design/shapes'
import type { Catalogue } from '../../state/library'
import type { Play } from '../../state/history'
import { fmtHours, periodStats, recapYear, type PeriodStats } from '../../state/stats'
import { fmtN, plural } from '../../state/views'
import { go, statsHref } from '../../shell/routes'
import { AlbumCardHome, cardSize, useHomeSize } from '../home/cards'
import { CookiePlay } from '../home/art'
import { playList } from '../library/playback'
import './recap.css'

export function RecapShelf({ c, plays, now }: { c: Catalogue; plays: readonly Play[]; now: Date; playing?: string | null }) {
  const year = recapYear(now)
  if (year == null) return null
  const stats = periodStats(c, plays, { year, month: null })
  if (!stats.plays) return null
  const done = year < now.getFullYear()
  const size = useHomeSize()
  const cs = cardSize(size)
  const phone = size !== 'desk'

  return (
    <section className="hs hs-recap">
      <div className="hs-head">
        <h2 className="hs-title">Your {year} in music</h2>
        <span className="hs-sub">{done ? 'Your year, wrapped up' : 'The year so far'}</span>
        <span className="hs-flex" />
        <a className="hs-more" href={statsHref(String(year))}>
          Open recap {phone ? '' : '→'}
        </a>
      </div>
      <div className="hs-row">
        <RecapCard stats={stats} year={year} />
        {stats.topAlbums.slice(0, 10).map((r, i) => (
          <div key={r.item.id} className="recap-album-item">
            <AlbumCardHome
              c={c}
              album={r.item}
              size={cs}
              subtitle={
                <>
                  {r.item.artist} · {plural(r.plays, 'play', 'plays')}
                </>
              }
            />
            <span className={`stats-badge ${i < 3 ? `is-${i + 1}` : ''}`} style={i < 3 ? { clipPath: SHAPE_CLOVER } : undefined}>
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecapCard({ stats, year }: { stats: PeriodStats; year: number }) {
  const topAlbum = stats.topAlbums[0]?.item
  const [ref, cover] = useLazyCover<HTMLDivElement>(topAlbum?.cover)
  const tint = useArtTint(cover)
  const artist = stats.topArtists[0]
  const song = stats.topTracks[0]
  const topTrackIds = stats.topTracks.slice(0, 50).map((t) => t.item.id)

  const onPlayTop = () => {
    if (topTrackIds.length) {
      playList(topTrackIds, { kind: 'library', id: `recap-${year}`, label: `Your ${year} Recap` })
    }
  }

  const hueStyle = tint ? ({ '--h': tint.hue, '--hc': tint.chroma } as CSSProperties) : {}

  return (
    <div
      ref={ref}
      className="recap-card hue-scope"
      style={hueStyle}
      role="link"
      tabIndex={0}
      onClick={() => go(statsHref(String(year)))}
      onKeyDown={(e) => e.key === 'Enter' && go(statsHref(String(year)))}
    >
      <span className="recap-wash" aria-hidden />
      <span className="recap-burst" style={{ clipPath: SHAPE_BURST }} aria-hidden />

      <div className="recap-head">
        <span className="recap-kicker">
          <Icon name="spark" filled />
          {year} Recap
        </span>
        <span className="recap-counts">
          {plural(stats.artists, 'artist', 'artists')} · {plural(stats.albums, 'album', 'albums')}
        </span>
      </div>

      <div className="recap-main">
        <div className="recap-stat">
          <span className="recap-hours-num">{fmtHours(stats.seconds)}</span>
          <span className="recap-hours-lbl">Hours · {fmtN(stats.plays)} plays</span>
        </div>

        {topAlbum && (
          <div className="recap-art-preview">
            <span className="recap-cover-tilt">
              {cover && <img src={cover} alt="" draggable={false} />}
            </span>
          </div>
        )}
      </div>

      <div className="recap-highlights">
        {artist && (
          <div className="recap-hl-row">
            <span className="recap-hl-k">Top artist</span>
            <span className="recap-hl-v">{artist.item.name}</span>
          </div>
        )}
        {song && (
          <div className="recap-hl-row">
            <span className="recap-hl-k">Top song</span>
            <span className="recap-hl-v">
              {song.item.title} <span className="recap-hl-dim">· {plural(song.plays, 'play', 'plays')}</span>
            </span>
          </div>
        )}
      </div>

      <div className="recap-footer">
        <span className="recap-cta">
          Explore recap
          <Icon name="arrowR" />
        </span>
        {topTrackIds.length > 0 && (
          <CookiePlay
            size={44}
            tone="brand"
            playing={false}
            label={`Play top songs of ${year}`}
            onClick={(e) => {
              e.stopPropagation()
              onPlayTop()
            }}
          />
        )}
      </div>
    </div>
  )
}
