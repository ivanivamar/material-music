/**
 * Listening stats / yearly recap (step 21): `#/stats`, `#/stats/2026`, `#/stats/2026-10`.
 *
 * Top artists, albums and songs, time listened, plays, the first play of the period and a month-by-
 * month (or day-by-day) chart — all computed from the play history (state/stats.ts). Opened from the
 * avatar menu ("Listening stats") any time, and from the once-a-year Home recap shelf.
 */
import { useEffect, useState } from 'react'
import { Button, Chip, EmptyState, TrackRow, formatTime } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useLazyCover } from '../../lib/covers'
import { actions, trackDrag } from '../../actions/actions'
import { historyStore, useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import {
  MONTHS,
  MONTHS_SHORT,
  fmtHours,
  fmtListen,
  fmtPlayedAt,
  parsePeriod,
  periodIndex,
  periodKey,
  periodStats,
  type Period,
  type PeriodStats,
} from '../../state/stats'
import { fmtN, plural } from '../../state/views'
import { albumHref, artistHref, replace, statsHref } from '../../shell/routes'
import { ArtistAvatar, LibAlbumCard, SectionHead } from '../library/common'
import { playList, useNowPlaying, usePlayingAlbumId } from '../library/playback'
import { PageHeader } from '../PageHeader'
import './stats.css'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** The period to show when the URL doesn't name one (or names one without plays). */
function defaultPeriod(years: number[], now: Date): Period {
  // early January: last year is the interesting one until this year has some weight
  if (now.getMonth() === 0 && years.includes(now.getFullYear() - 1)) return { year: now.getFullYear() - 1, month: null }
  return { year: years.includes(now.getFullYear()) ? now.getFullYear() : (years[0] ?? now.getFullYear()), month: null }
}

export function Stats({ period: raw }: { period: string | null }) {
  const { data } = useLibrary()
  const history = useHistory()
  // only the day matters here ("so far", future bars); a stats page isn't left open across midnight
  const [now] = useState(() => new Date())

  useEffect(() => {
    void historyStore.sync({ minAge: 60_000 })
  }, [])

  if (!data) return null
  const index = periodIndex(data, history.plays)
  const asked = parsePeriod(raw)
  const period = asked ?? defaultPeriod(index.years, now)
  const stats = periodStats(data, history.plays, period)
  const firstEver = history.plays.find((p) => data.tracks[p.trackId])?.at ?? null

  const go = (p: Period) => replace(statsHref(periodKey(p)))
  const label = period.month == null ? `${period.year}` : `${MONTHS[period.month]} ${period.year}`
  const isYear = period.month == null
  const current = period.year === now.getFullYear() && (isYear || period.month === now.getMonth())

  // years to offer: every year with plays, plus the one being shown
  const years = [...new Set([...index.years, period.year])].sort((a, b) => b - a)
  const months = index.months.get(period.year) ?? new Set<number>()

  const meta = [
    'LISTENING STATS',
    current ? (isYear ? 'SO FAR THIS YEAR' : 'SO FAR THIS MONTH') : null,
    firstEver && stats.plays && firstEver >= periodStart(period) ? `COUNTING SINCE ${new Date(firstEver * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="st">
      <PageHeader meta={meta} title={`Your ${label}`} />

      <div className="st-periods">
        <div className="st-years" role="group" aria-label="Year">
          {years.map((y) => (
            <Chip key={y} selected={y === period.year} onClick={() => go({ year: y, month: null })}>
              {y}
            </Chip>
          ))}
        </div>
        <div className="st-months" role="group" aria-label="Month">
          <button type="button" className="st-month st-month-all" aria-pressed={isYear} onClick={() => go({ year: period.year, month: null })}>
            WHOLE YEAR
          </button>
          {MONTHS_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              className="st-month"
              aria-pressed={period.month === i}
              disabled={!months.has(i) && period.month !== i}
              onClick={() => go({ year: period.year, month: i })}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {stats.plays === 0 ? (
        <EmptyState
          icon="clock"
          title={history.plays.length ? `No plays in ${label}` : 'Nothing counted yet'}
          body={
            history.plays.length
              ? 'Pick another month or year above.'
              : 'A song counts once you’ve heard 30 seconds of it, on any device. Your top artists, albums and songs show up here as you listen.'
          }
        />
      ) : (
        <StatsBody c={data} stats={stats} label={label} now={now} onPick={(m) => go({ year: period.year, month: m })} />
      )}
    </div>
  )
}

function periodStart(p: Period): number {
  return Math.floor(new Date(p.year, p.month ?? 0, 1).getTime() / 1000)
}

function StatsBody({ c, stats, label, now, onPick }: { c: Catalogue; stats: PeriodStats; label: string; now: Date; onPick: (month: number) => void }) {
  const isYear = stats.period.month == null
  return (
    <>
      <section className="st-counters" aria-label="Totals">
        <div className="st-counter st-counter-hero">
          <span className="st-num">{fmtHours(stats.seconds)}</span>
          <span className="st-cap">HOURS LISTENED</span>
        </div>
        <Counter n={stats.plays} cap={stats.plays === 1 ? 'PLAY' : 'PLAYS'} />
        <Counter n={stats.tracks} cap={stats.tracks === 1 ? 'SONG' : 'SONGS'} />
        <Counter n={stats.albums} cap={stats.albums === 1 ? 'ALBUM' : 'ALBUMS'} />
        <Counter n={stats.artists} cap={stats.artists === 1 ? 'ARTIST' : 'ARTISTS'} />
        <Counter n={stats.days} cap={stats.days === 1 ? 'DAY' : 'DAYS'} />
      </section>

      <div className="st-split">
        <section className="st-chart-wrap">
          <SectionHead
            label={isYear ? 'LISTENING BY MONTH' : 'LISTENING BY DAY'}
            right={stats.peak >= 0 ? `PEAK · ${isYear ? MONTHS[stats.peak]!.toUpperCase() : `${stats.peak + 1} ${MONTHS_SHORT[stats.period.month!]!.toUpperCase()}`}` : undefined}
          />
          <Chart stats={stats} now={now} onPick={isYear ? onPick : undefined} />
        </section>
        {stats.firstPlay && <FirstPlay c={c} stats={stats} label={label} />}
      </div>

      <TopArtists stats={stats} />
      <TopAlbums c={c} stats={stats} />
      <TopSongs c={c} stats={stats} label={label} />

      <p className="st-note">Time listened counts each play as the song’s full length. Plays from every device, counted after 30 seconds.</p>
    </>
  )
}

function Counter({ n, cap }: { n: number; cap: string }) {
  return (
    <div className="st-counter">
      <span className="st-num">{fmtN(n)}</span>
      <span className="st-cap">{cap}</span>
    </div>
  )
}

/* ── Bars: months of the year / days of the month ─── */

function Chart({ stats, now, onPick }: { stats: PeriodStats; now: Date; onPick?: (month: number) => void }) {
  const max = Math.max(1, ...stats.buckets.map((b) => b.seconds))
  const isYear = stats.period.month == null
  return (
    <div className={`st-chart ${isYear ? 'is-year' : 'is-month'}`}>
      {stats.buckets.map((b, i) => {
        const name = isYear ? MONTHS[i]! : `${i + 1} ${MONTHS[stats.period.month!]}`
        const future = isYear
          ? stats.period.year === now.getFullYear() && i > now.getMonth()
          : stats.period.year === now.getFullYear() && stats.period.month === now.getMonth() && i + 1 > now.getDate()
        const tick = isYear ? MONTHS_SHORT[i]![0] : i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''
        const title = b.plays ? `${name} · ${fmtListen(b.seconds)} · ${plural(b.plays, 'play', 'plays')}` : `${name} · no plays`
        const bar = (
          <>
            <span className="st-bar-track">
              <span className="st-bar-fill" style={{ height: b.seconds ? `${Math.max(3, (b.seconds / max) * 100)}%` : 0 }} />
            </span>
            <span className="st-bar-tick">{tick}</span>
          </>
        )
        const cls = ['st-bar', i === stats.peak && 'is-peak', !b.plays && 'is-empty', future && 'is-future'].filter(Boolean).join(' ')
        return onPick && b.plays ? (
          <button key={i} type="button" className={cls} title={title} aria-label={title} onClick={() => onPick(i)}>
            {bar}
          </button>
        ) : (
          <div key={i} className={cls} title={title}>
            {bar}
          </div>
        )
      })}
    </div>
  )
}

/* ── First play of the period ─────────────────────── */

function FirstPlay({ c, stats, label }: { c: Catalogue; stats: PeriodStats; label: string }) {
  const fp = stats.firstPlay!
  const album = c.albums[fp.track.albumId]
  const [ref, cover] = useLazyCover<HTMLDivElement>(album?.cover)
  const now = useNowPlaying()
  const which = stats.period.month == null ? label : MONTHS[stats.period.month]
  return (
    <section className="st-first">
      <SectionHead label={`FIRST PLAY OF ${which!.toUpperCase()}`} right={fmtPlayedAt(fp.at).toUpperCase()} />
      <div className={`st-first-card ${now.id === fp.track.id ? 'is-playing' : ''}`}>
        <div ref={ref} className="st-first-cover">
          {cover ? <img src={cover} alt="" /> : <span className="st-first-ph" />}
          <button
            type="button"
            className="st-first-play"
            aria-label={`Play ${fp.track.title}`}
            onClick={() => playList([fp.track.id], { kind: 'library', id: `stats-first-${periodKey(stats.period)}`, label: `Library · First play of ${which}` })}
          >
            <Icon name="playF" />
          </button>
        </div>
        <div className="st-first-text">
          <div className="st-first-title">{fp.track.title}</div>
          <div className="st-first-sub">
            {album ? (
              <>
                <a href={artistHref(album.artistId)}>{fp.track.artist}</a>
                <span className="st-dot">·</span>
                <a href={albumHref(album.id)}>{album.title}</a>
              </>
            ) : (
              fp.track.artist
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Top artists ──────────────────────────────────── */

function TopArtists({ stats }: { stats: PeriodStats }) {
  const [all, setAll] = useState(false)
  const list = stats.topArtists
  if (!list.length) return null
  const [top, ...rest] = list
  const shown = rest.slice(0, all ? 49 : 9)
  return (
    <section className="st-section">
      <SectionHead
        label="TOP ARTISTS"
        right={
          list.length > 10 ? (
            <button type="button" className="st-more" onClick={() => setAll((v) => !v)}>
              {all ? 'SHOW 10' : `SHOW ${Math.min(50, list.length)}`}
            </button>
          ) : undefined
        }
      />
      <div className="st-artists">
        <a className="st-artist-top" href={artistHref(top!.item.id)}>
          <ArtistAvatar artist={top!.item} size={148} lazy={false} className="st-artist-av" />
          <div className="st-artist-top-text">
            <span className="st-rank">01</span>
            <span className="st-artist-top-name">{top!.item.name}</span>
            <span className="st-artist-meta">
              {plural(top!.plays, 'PLAY')} · {fmtListen(top!.seconds).toUpperCase()}
            </span>
          </div>
        </a>
        <ol className="st-artist-list">
          {shown.map((r, i) => (
            <li key={r.item.id}>
              <a className="st-artist-row" href={artistHref(r.item.id)}>
                <span className="st-rank">{pad2(i + 2)}</span>
                <ArtistAvatar artist={r.item} size={40} />
                <span className="st-artist-name">{r.item.name}</span>
                <span className="st-artist-meta">{plural(r.plays, 'PLAY')}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── Top albums ───────────────────────────────────── */

function TopAlbums({ c, stats }: { c: Catalogue; stats: PeriodStats }) {
  const [all, setAll] = useState(false)
  const playing = usePlayingAlbumId(c)
  const list = stats.topAlbums
  if (!list.length) return null
  return (
    <section className="st-section">
      <SectionHead
        label="TOP ALBUMS"
        right={
          list.length > 10 ? (
            <button type="button" className="st-more" onClick={() => setAll((v) => !v)}>
              {all ? 'SHOW 10' : `SHOW ${Math.min(50, list.length)}`}
            </button>
          ) : undefined
        }
      />
      <div className="lib-grid lib-grid-sm st-albums">
        {list.slice(0, all ? 50 : 10).map((r, i) => (
          <div key={r.item.id} className="st-album">
            <span className="st-rank st-album-rank">{pad2(i + 1)}</span>
            <LibAlbumCard
              c={c}
              album={r.item}
              playingAlbumId={playing}
              subtitle={
                <>
                  {r.item.artist}
                  <span className="acard-count"> · {plural(r.plays, 'play', 'plays')}</span>
                </>
              }
            />
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Top songs ────────────────────────────────────── */

function TopSongs({ c, stats, label }: { c: Catalogue; stats: PeriodStats; label: string }) {
  const [all, setAll] = useState(false)
  const now = useNowPlaying()
  const list = stats.topTracks
  if (!list.length) return null
  const shown = list.slice(0, all ? 50 : 10)
  const ids = list.map((r) => r.item.id)
  const context = { kind: 'library' as const, id: `stats-${periodKey(stats.period)}`, label: `Library · Top songs of ${label}` }
  return (
    <section className="st-section">
      <SectionHead
        label="TOP SONGS"
        right={
          list.length > 10 ? (
            <button type="button" className="st-more" onClick={() => setAll((v) => !v)}>
              {all ? 'SHOW 10' : `SHOW ${Math.min(50, list.length)}`}
            </button>
          ) : undefined
        }
      />
      <div className="st-songs-tools">
        <Button size="sm" icon="playF" onClick={() => playList(ids, context)}>
          Play top {ids.length}
        </Button>
        <Button size="sm" variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })}>
          Shuffle
        </Button>
      </div>
      <div className="st-songs" role="list">
        {shown.map((r, i) => {
          const album = c.albums[r.item.albumId]
          return (
            <TrackRow
              key={r.item.id}
              className="trow-stats"
              n={pad2(i + 1)}
              title={r.item.title}
              subtitle={album ? `${r.item.artist} · ${album.title}` : r.item.artist}
              duration={r.item.duration ? formatTime(r.item.duration) : '—'}
              label={plural(r.plays, 'PLAY')}
              playing={now.id === r.item.id}
              onPlay={() => playList(ids, context, { start: i })}
              onMore={(e) => actions.menu({ kind: 'track', trackId: r.item.id }, e)}
              rowProps={trackDrag(() => [r.item.id], `${r.item.title} · ${r.item.artist}`)}
            />
          )
        })}
      </div>
    </section>
  )
}
