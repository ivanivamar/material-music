/**
 * Listening stats / yearly recap (step 21): `#/stats`, `#/stats/2026`, `#/stats/2026-10`.
 *
 * Top artists, albums and songs, time listened, plays, the first play of the period and a month-by-
 * month (or day-by-day) chart — all computed from the play history (state/stats.ts). Opened from the
 * avatar menu ("Listening stats") any time, and from the once-a-year Home recap shelf.
 *
 * Material 3 Expressive (neutral surfaces, hue 40): a 57px title, filter chips for the year and a
 * connected button group for the month; a hero card (time listened, washed in the top album's hue, its
 * covers fanned and tilted) beside four counter tiles that each carry a different expressive shape; the
 * chart and first play on 28px surface cards (pill bars that morph on hover, the peak in coral with its
 * value); a top-artist feature card (photo cut into a 12-cookie, clover rank badge); top albums as Home
 * cards with rank badges; and top songs on the detail-page segmented list.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { AlbumEq, EmptyState, formatTime } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { SHAPE_BURST, SHAPE_CLOVER, cookie } from '../../design/shapes'
import { useArtTint } from '../../design/tint'
import { useLazyCover } from '../../lib/covers'
import { actions, trackDrag } from '../../actions/actions'
import { historyStore, useHistory } from '../../state/history'
import { useLibrary, type Catalogue } from '../../state/library'
import { playerStore } from '../../state/player'
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
import { ArtistDisc, CookiePlay, useArtistHue } from '../home/art'
import { AlbumCardHome, cardSize, useHomeSize } from '../home/cards'
import { ActBtn, DtList, DtRow } from '../library/detail'
import { playList, useNowPlaying } from '../library/playback'
import '../home/home.css'
import './stats.css'

/* M3 Expressive shapes for the counter tiles and the artist photo (same point count as the others) */
const SHAPE_SUNNY = cookie(8, 0.05)
const SHAPE_PENTA = cookie(5, 0.1)
const SHAPE_LEAF4 = cookie(4, 0.15)
const SHAPE_COOKIE12 = cookie(12, 0.07)
const SHAPE_SOFT9 = cookie(9, 0.1)

const enDate = (sec: number, opts: Intl.DateTimeFormatOptions) => new Date(sec * 1000).toLocaleDateString('en-GB', opts)

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
  const since = firstEver && stats.plays && firstEver >= periodStart(period) ? enDate(firstEver, { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <div className="stats-page">
      <header className="stats-head">
        <div className="stats-kicker">
          <Icon name="stats" />
          <span>Listening stats</span>
          {current && <span className="stats-live">{isYear ? 'So far this year' : 'So far this month'}</span>}
        </div>
        <h1 className="stats-title">Your {label}</h1>
        {since && <div className="stats-since">Counting since {since}</div>}
      </header>

      <div className="stats-periods">
        <div className="stats-years" role="group" aria-label="Year">
          {years.map((y) => {
            const on = y === period.year
            return (
              <button key={y} type="button" className={`stats-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => go({ year: y, month: null })}>
                {on && <Icon name="done" className="stats-chip-ck" />}
                {y}
              </button>
            )
          })}
        </div>
        <div className="stats-months" role="group" aria-label="Month">
          <button type="button" className="stats-month stats-month-all" aria-pressed={isYear} onClick={() => go({ year: period.year, month: null })}>
            {isYear && <Icon name="done" className="stats-chip-ck" />}
            Whole year
          </button>
          <div className="stats-mgroup">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className="stats-month"
                aria-pressed={period.month === i}
                aria-label={MONTHS[i]}
                disabled={!months.has(i) && period.month !== i}
                onClick={() => go({ year: period.year, month: i })}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats.plays === 0 ? (
        <div className="stats-empty">
          <EmptyState
            icon="clock"
            title={history.plays.length ? `No plays in ${label}` : 'Nothing counted yet'}
            body={
              history.plays.length
                ? 'Pick another month or year above.'
                : 'A song counts once you’ve heard 30 seconds of it, on any device. Your top artists, albums and songs show up here as you listen.'
            }
          />
        </div>
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
  const peakName = stats.peak < 0 ? null : isYear ? MONTHS[stats.peak] : `${stats.peak + 1} ${MONTHS_SHORT[stats.period.month!]}`
  return (
    <>
      <section className="stats-top" aria-label="Totals">
        <HeroCard stats={stats} />
        <div className="stats-tiles">
          <Tile n={stats.tracks} one="song" many="songs" icon="song" shape={SHAPE_LEAF4} />
          <Tile n={stats.albums} one="album" many="albums" icon="album" shape={SHAPE_SOFT9} />
          <Tile n={stats.artists} one="artist" many="artists" icon="artist" shape={SHAPE_PENTA} />
          <Tile n={stats.days} one="day with music" many="days with music" icon="today" shape={SHAPE_SUNNY} />
        </div>
      </section>

      <div className="stats-split">
        <section className="stats-card stats-chart-card">
          <div className="stats-card-head">
            <div className="stats-card-head-left">
              <h2 className="stats-h2">{isYear ? 'Listening by month' : 'Listening by day'}</h2>
              {isYear && <span className="stats-card-sub">Tap a month to open it</span>}
            </div>
            {peakName && (
              <span className="stats-peak">
                <Icon name="spark" filled />
                Peak · {peakName}
              </span>
            )}
          </div>
          <Chart stats={stats} now={now} onPick={isYear ? onPick : undefined} />
        </section>
        {stats.firstPlay && <FirstPlay c={c} stats={stats} label={label} />}
      </div>

      <TopArtists stats={stats} />
      <TopAlbums c={c} stats={stats} />
      <TopSongs c={c} stats={stats} label={label} />

      <p className="stats-note">
        <Icon name="info" />
        Time listened counts each play as the song’s full length. Plays from every device, counted after 30 seconds.
      </p>
    </>
  )
}

/* ── Hero: time listened ────────────────────────────── */

/** `--h` / `--hc` from a cover tint, so a card follows its art (neutral art → near-white accents). */
const hueStyle = (t: { hue: number; chroma: number } | null): CSSProperties => (t ? ({ '--h': t.hue, '--hc': t.chroma } as CSSProperties) : {})

function HeroCard({ stats }: { stats: PeriodStats }) {
  const albums = stats.topAlbums.slice(0, 3).map((r) => r.item)
  const [ref, url] = useLazyCover<HTMLDivElement>(albums[0]?.cover)
  const tint = useArtTint(url)
  const top = stats.topAlbums[0]
  return (
    <div ref={ref} className="stats-hero hue-scope" style={hueStyle(tint)}>
      <span className="stats-hero-wash" aria-hidden />
      <span className="stats-hero-burst" style={{ clipPath: SHAPE_BURST }} aria-hidden />
      <div className="stats-hero-text">
        <span className="stats-hero-k">
          <Icon name="clock" />
          Time listened
        </span>
        <span className="stats-hero-num">
          <span className="stats-hero-n">{fmtHours(stats.seconds)}</span>
          <span className="stats-hero-u">{fmtHours(stats.seconds) === '1' ? 'hour' : 'hours'}</span>
        </span>
        <span className="stats-hero-sub">
          <b>{fmtN(stats.plays)}</b> {stats.plays === 1 ? 'play' : 'plays'}
          {stats.days > 1 && <> · about {fmtListen(stats.seconds / stats.days)} on a listening day</>}
        </span>
        {top && (
          <a className="stats-hero-top" href={albumHref(top.item.id)}>
            <Icon name="album" />
            <span className="stats-hero-top-t">
              Most played album · <b>{top.item.title}</b>
            </span>
          </a>
        )}
      </div>
      {albums.length > 0 && (
        <div className={`stats-fan n${albums.length}`} aria-hidden>
          {albums
            .map((a, i) => <FanCover key={a.id} id={a.cover} i={i} />)
            .reverse()}
        </div>
      )}
    </div>
  )
}

function FanCover({ id, i }: { id: string | null | undefined; i: number }) {
  const [ref, url] = useLazyCover<HTMLSpanElement>(id)
  return (
    <span ref={ref} className={`stats-fan-cover is-${i}`}>
      {url && <img src={url} alt="" draggable={false} decoding="async" />}
    </span>
  )
}

function Tile({ n, one, many, icon, shape }: { n: number; one: string; many: string; icon: IconName; shape: string }) {
  return (
    <div className="stats-tile">
      <span className="stats-tile-mark" aria-hidden>
        <span className="stats-tile-shape" style={{ clipPath: shape }} />
        <Icon name={icon} filled />
      </span>
      <span className="stats-tile-n">{fmtN(n)}</span>
      <span className="stats-tile-cap">{n === 1 ? one : many}</span>
    </div>
  )
}

/* ── Bars: months of the year / days of the month ─── */

function Chart({ stats, now, onPick }: { stats: PeriodStats; now: Date; onPick?: (month: number) => void }) {
  const max = Math.max(1, ...stats.buckets.map((b) => b.seconds))
  const isYear = stats.period.month == null
  return (
    <div className={`stats-chart ${isYear ? 'is-year' : 'is-month'}`}>
      {stats.buckets.map((b, i) => {
        const name = isYear ? MONTHS[i]! : `${i + 1} ${MONTHS[stats.period.month!]}`
        const future = isYear
          ? stats.period.year === now.getFullYear() && i > now.getMonth()
          : stats.period.year === now.getFullYear() && stats.period.month === now.getMonth() && i + 1 > now.getDate()
        const tick = isYear ? MONTHS_SHORT[i]![0] : i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''
        const title = b.plays ? `${name} · ${fmtListen(b.seconds)} · ${plural(b.plays, 'play', 'plays')}` : `${name} · no plays`
        const pct = b.seconds ? Math.max(4, (b.seconds / max) * 100) : 0
        const peak = i === stats.peak
        const bar = (
          <>
            <span className="stats-bar-track">
              {b.seconds > 0 && <span className="stats-bar-fill" style={{ height: `${pct}%` }} />}
              {peak && (
                <span className="stats-bar-val" style={{ bottom: `calc(${pct}% + 8px)` }}>
                  {fmtHours(b.seconds)} h
                </span>
              )}
            </span>
            <span className="stats-bar-tick">{tick}</span>
          </>
        )
        const cls = ['stats-bar', peak && 'is-peak', !b.plays && 'is-empty', future && 'is-future'].filter(Boolean).join(' ')
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
  const tint = useArtTint(cover)
  const now = useNowPlaying()
  const which = stats.period.month == null ? label : MONTHS[stats.period.month]
  const current = now.id === fp.track.id
  const play = () =>
    current ? playerStore.toggle() : playList([fp.track.id], { kind: 'library', id: `stats-first-${periodKey(stats.period)}`, label: `Library · First play of ${which}` })
  return (
    <section className={`stats-card stats-first hue-scope ${current ? 'is-current' : ''}`} style={hueStyle(tint)}>
      <div className="stats-card-head">
        <h2 className="stats-h2">First play of {which}</h2>
      </div>
      <div className="stats-first-body">
        <div ref={ref} className="stats-first-cover">
          {cover ? <img src={cover} alt="" draggable={false} /> : <span className="stats-first-ph" />}
          {current && (
            <span className="stats-first-eq">
              <AlbumEq height={14} on={now.playing} />
            </span>
          )}
        </div>
        <div className="stats-first-text">
          <span className="stats-first-when">
            <Icon name="history" />
            {fmtPlayedAt(fp.at)}
          </span>
          <div className="stats-first-title">{fp.track.title}</div>
          <div className="stats-first-sub">
            {album ? (
              <>
                <a href={artistHref(album.artistId)}>{fp.track.artist}</a>
                <span className="stats-dot">·</span>
                <a href={albumHref(album.id)}>{album.title}</a>
              </>
            ) : (
              fp.track.artist
            )}
          </div>
        </div>
        <CookiePlay size={56} playing={current && now.playing} label={current && now.playing ? `Pause ${fp.track.title}` : `Play ${fp.track.title}`} onClick={play} className="stats-first-play" />
      </div>
    </section>
  )
}

/* ── Section head (Home shelf type: 22px title, note, coral text action) ── */

function SecHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="hs-head stats-sec-head">
      <h2 className="hs-title">{title}</h2>
      {sub != null && <span className="hs-sub">{sub}</span>}
      <span className="hs-flex" />
      {right}
    </div>
  )
}

function MoreToggle({ all, total, onToggle }: { all: boolean; total: number; onToggle: () => void }) {
  if (total <= 10) return null
  return (
    <button type="button" className="stats-more" onClick={onToggle}>
      {all ? 'Show top 10' : `Show all ${Math.min(50, total)}`}
      <Icon name={all ? 'chevU' : 'chevD'} />
    </button>
  )
}

/* ── Top artists ──────────────────────────────────── */

function TopArtists({ stats }: { stats: PeriodStats }) {
  const [all, setAll] = useState(false)
  const list = stats.topArtists
  const top = list[0]
  const hue = useArtistHue(top?.item)
  if (!top) return null
  const rest = list.slice(1, all ? 50 : 10)
  return (
    <section className="stats-section">
      <SecHead title="Top artists" sub={plural(stats.artists, 'artist', 'artists')} right={<MoreToggle all={all} total={list.length} onToggle={() => setAll((v) => !v)} />} />
      <div className="stats-artists">
        <a className="stats-artist-top hue-scope" href={artistHref(top.item.id)} style={hue == null ? ({ '--hc': 0 } as CSSProperties) : ({ '--h': hue } as CSSProperties)}>
          <span className="stats-artist-wash" aria-hidden />
          <span className="stats-artist-art">
            <span className="stats-artist-back" style={{ clipPath: SHAPE_COOKIE12 }} aria-hidden />
            <span className="stats-artist-photo" style={{ clipPath: SHAPE_COOKIE12 }}>
              <ArtistDisc artist={top.item} size={176} />
            </span>
            <span className="stats-badge is-1" style={{ clipPath: SHAPE_CLOVER }} aria-label="Number 1">
              1
            </span>
          </span>
          <span className="stats-artist-top-text">
            <span className="stats-artist-k">Your top artist</span>
            <span className="stats-artist-top-name">{top.item.name}</span>
            <span className="stats-artist-top-meta">
              {plural(top.plays, 'play', 'plays')} · {fmtListen(top.seconds)}
            </span>
          </span>
        </a>
        {rest.length > 0 && (
          <ol className="stats-artist-list" start={2}>
            {rest.map((r, i) => (
              <li key={r.item.id}>
                <a className="stats-arow" href={artistHref(r.item.id)}>
                  <span className={`stats-arank ${i < 2 ? 'is-podium' : ''}`}>{i + 2}</span>
                  <ArtistDisc artist={r.item} size={44} />
                  <span className="stats-arow-text">
                    <span className="stats-arow-name">{r.item.name}</span>
                    <span className="stats-arow-meta">{fmtListen(r.seconds)}</span>
                  </span>
                  <span className="stats-arow-plays">{plural(r.plays, 'play', 'plays')}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/* ── Top albums ───────────────────────────────────── */

function TopAlbums({ c, stats }: { c: Catalogue; stats: PeriodStats }) {
  const [all, setAll] = useState(false)
  const size = useHomeSize()
  const list = stats.topAlbums
  if (!list.length) return null
  return (
    <section className="stats-section">
      <SecHead title="Top albums" sub={plural(stats.albums, 'album', 'albums')} right={<MoreToggle all={all} total={list.length} onToggle={() => setAll((v) => !v)} />} />
      <div className="stats-albums">
        {list.slice(0, all ? 50 : 10).map((r, i) => (
          <div key={r.item.id} className="stats-album">
            <AlbumCardHome
              c={c}
              album={r.item}
              size={cardSize(size)}
              subtitle={
                <>
                  {r.item.artist} · {plural(r.plays, 'play', 'plays')}
                </>
              }
            />
            <span className={`stats-badge ${i < 3 ? `is-${i + 1}` : ''}`} style={i < 3 ? { clipPath: SHAPE_CLOVER } : undefined} aria-label={`Number ${i + 1}`}>
              {i + 1}
            </span>
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
    <section className="stats-section">
      <SecHead title="Top songs" sub={plural(stats.tracks, 'song', 'songs')} right={<MoreToggle all={all} total={list.length} onToggle={() => setAll((v) => !v)} />} />
      <div className="stats-songs-tools">
        <ActBtn kind="filled" icon="playF" filled onClick={() => playList(ids, context)}>
          Play top {ids.length}
        </ActBtn>
        <ActBtn kind="tonal" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })}>
          Shuffle
        </ActBtn>
      </div>
      <DtList className="has-cover stats-songs">
        {shown.map((r, i) => {
          const album = c.albums[r.item.albumId]
          return (
            <DtRow
              key={r.item.id}
              n={i + 1}
              className={i < 3 ? 'stats-podium' : undefined}
              title={r.item.title}
              sub={
                album ? (
                  <>
                    <a href={artistHref(album.artistId)}>{r.item.artist}</a>
                    <span>·</span>
                    <a href={albumHref(album.id)}>{album.title}</a>
                  </>
                ) : (
                  <span className="dt-s-t">{r.item.artist}</span>
                )
              }
              cover={album?.cover}
              showCover
              current={now.id === r.item.id}
              playing={now.playing}
              stat={plural(r.plays, 'play', 'plays')}
              duration={r.item.duration ? formatTime(r.item.duration) : '—'}
              onPlay={() => playList(ids, context, { start: i })}
              onMore={(e) => actions.menu({ kind: 'track', trackId: r.item.id }, e)}
              rowProps={trackDrag(() => [r.item.id], `${r.item.title} · ${r.item.artist}`)}
            />
          )
        })}
      </DtList>
    </section>
  )
}
