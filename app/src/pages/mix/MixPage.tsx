/**
 * Mix page `#/mix/<id>` (step 26, handoff §9): the playlist page layout, read-only (no reorder, no
 * remove, no drag-to-reorder; rows still drag onto a sidebar playlist).
 *
 *   genre-hue wash · HOME / MADE FOR YOU · generated cover (200, glow) · DAILY MIX · MADE FOR YOU ·
 *   REFRESHES DAILY · title · the "why" line · 50 SONGS · 3 HR 12 MIN · 9 NEW TO YOU
 *   Play · Shuffle · Save as playlist                    READ-ONLY · NEXT REFRESH TOMORROW 06:00
 *   #  TITLE  ALBUM  QUALITY  LAST PLAYED  ⏱
 *
 * Save as playlist copies today's songs into a normal playlist "<title> · 19 Oct".
 * Phone offline: only downloaded songs play; the others are greyed (cloud icon), the count line says
 * "32 OF 50 OFFLINE". An id that isn't in today's set (mixes refresh at 06:00) → "This mix has been
 * refreshed" + today's mixes.
 */
import { useMemo, useSyncExternalStore, type CSSProperties } from 'react'
import { Button, Eq, IconButton, QualityBadge, formatTime, qualityKind, qualityLabel, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { useLazyCover } from '../../lib/covers'
import { mixDay } from '../../lib/mixing'
import { albumHref, artistHref, go, href, playlistHref } from '../../shell/routes'
import { useDj } from '../../state/dj'
import { useDownloads } from '../../state/downloads'
import { useGenres } from '../../state/genres'
import { useHistory, type Play } from '../../state/history'
import { useLibrary, type Catalogue, type Track } from '../../state/library'
import { mixContext, playableSet, playMix, seenMix, useMixSet, type MixPlan, type MixSet } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import { playlistsStore } from '../../state/playlists'
import { isTouch, useIsPhone } from '../../state/viewport'
import { fmtTotal, plural } from '../../state/views'
import { Crumbs } from '../library/common'
import { MixCover } from '../home/art'
import { MixCard, cardSize, useHomeSize } from '../home/cards'
import '../library/library.css'
import '../playlists/playlists.css'
import '../home/home.css'
import './mix.css'

const KIND_UPPER = { daily: 'DAILY MIX', deep: 'DEEP CUTS', redis: 'REDISCOVER' } as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86_400_000

function lastPlayedLabel(sec: number | undefined, nowMs: number): string {
  if (!sec) return '—'
  const days = Math.floor((nowMs - sec * 1000) / DAY)
  if (days <= 0) return 'TODAY'
  if (days === 1) return 'YESTERDAY'
  if (days < 7) return `${days} DAYS AGO`
  if (days < 14) return '1 WEEK AGO'
  if (days < 30) return `${Math.floor(days / 7)} WEEKS AGO`
  if (days < 60) return '1 MONTH AGO'
  if (days < 365) return `${Math.floor(days / 30)} MONTHS AGO`
  return days < 730 ? '1 YEAR AGO' : `${Math.floor(days / 365)} YEARS AGO`
}

const COMPACT = '(max-width: 1240px)'
const subCompact = (cb: () => void) => {
  const mq = window.matchMedia(COMPACT)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useCompact = () => useSyncExternalStore(subCompact, () => window.matchMedia(COMPACT).matches, () => false)

export function useTodayMixes(): MixSet | null {
  const { data } = useLibrary()
  const history = useHistory()
  const genres = useGenres()
  const dj = useDj()
  return useMixSet([data, history.plays, genres.doc, dj.doc.songPenalties, mixDay(Date.now()).key])
}

export function MixPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const set = useTodayMixes()
  if (!data) return null
  const crumbs = <Crumbs fallback={href('home')} parts={[<a key="h" href={href('home')}>HOME</a>, <span key="m">MADE FOR YOU</span>]} />
  if (!set)
    return (
      <div className="pl-page mx-page">
        {crumbs}
        <div className="mx-loading t-mono">MIXING…</div>
      </div>
    )
  const mix = set.items.find((m) => m.id === id)
  if (!mix) return <Expired c={data} id={id} set={set} crumbs={crumbs} />
  return <MixView c={data} mix={mix} crumbs={crumbs} />
}

function MixView({ c, mix, crumbs }: { c: Catalogue; mix: MixPlan; crumbs: React.ReactNode }) {
  const phone = useIsPhone()
  const size = useHomeSize()
  const toast = useToast()
  const p = usePlayer()
  const history = useHistory()
  useDownloads() // offline state changes re-render
  const allowed = playableSet(c)
  const tracks = mix.trackIds.map((id) => c.tracks[id]).filter((t): t is Track => !!t)
  const seconds = tracks.reduce((s, t) => s + (t.duration ?? 0), 0)
  const offline = allowed ? tracks.filter((t) => allowed.has(t.id)).length : null
  const last = useMemo(() => lastPlays(history.plays), [history.plays])
  const active = p.index >= 0 && p.context?.kind === 'mix' && p.context.id === mix.id
  const playing = active && p.playing
  const curId = active ? p.queue[p.index] : null
  const day = mixDay(Date.now())
  const nextRefresh = new Date(day.next).toDateString() === new Date(Date.now() + DAY).toDateString() ? 'TOMORROW 06:00' : 'TODAY 06:00'
  const H = mix.hue

  const save = () => {
    const d = new Date()
    const name = `${mix.title} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
    const pid = playlistsStore.create(name, tracks.map((t) => t.id))
    toast.show({ icon: 'check', text: `Saved as ‘${name}’`, action: { label: 'Open', onClick: () => go(playlistHref(pid)) } })
  }
  const playFrom = (t: Track) => {
    if (allowed && !allowed.has(t.id)) return
    if (curId === t.id) return playerStore.toggle()
    playMix(mix, { startId: t.id })
  }

  const stats = [plural(tracks.length, 'SONG'), seconds ? fmtTotal(seconds) : null, offline !== null ? `${offline} OF ${tracks.length} OFFLINE` : mix.newCount ? `${mix.newCount} NEW TO YOU` : null].filter(Boolean).join(' · ')
  const wash = phone
    ? `radial-gradient(55% 70% at 50% 22%, oklch(0.20 0.035 ${H}), transparent 72%), radial-gradient(90% 50% at 50% 108%, oklch(0.13 0.022 ${H}), transparent 80%)`
    : `radial-gradient(55% 70% at 26% 40%, oklch(0.20 0.035 ${H}), transparent 72%), radial-gradient(90% 50% at 50% 108%, oklch(0.13 0.022 ${H}), transparent 80%)`
  const compact = useCompact()
  const cover = phone ? (size === 'narrow' ? 200 : 228) : compact ? 168 : 200

  return (
    <div className="pl-page mx-page">
      <div className="mx-wash" style={{ background: wash }} aria-hidden />
      {crumbs}
      <header className="pl-hero mx-hero">
        <div className="mx-cover" style={{ boxShadow: `0 40px 80px -30px oklch(0.34 0.06 ${H} / 0.9)` }}>
          <MixCover c={c} mix={mix} size={cover} radius={14} />
        </div>
        <div className="pl-hero-text">
          <div className="hero-meta">{KIND_UPPER[mix.kind]} · MADE FOR YOU · REFRESHES DAILY</div>
          <h1 className="hero-title mx-title" title={mix.title}>
            {mix.title}
          </h1>
          <div className="mx-why">{mix.why}</div>
          <div className="hero-stats">{stats}</div>
        </div>
      </header>

      {phone ? (
        <div className="mx-actions">
          <IconButton icon="saveList" label="Save as playlist" onClick={save} className="mx-ib" />
          <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'tracks', trackIds: tracks.map((t) => t.id), label: mix.title }, e)} className="mx-ib" />
          <span className="mx-flex" />
          <IconButton icon="shuffle" label="Shuffle" onClick={() => playMix(mix, { shuffle: true })} className="mx-ib" />
          <button type="button" className="mx-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (active ? playerStore.toggle() : playMix(mix))}>
            <Icon name={playing ? 'pauseF' : 'playF'} />
          </button>
        </div>
      ) : (
        <div className="mx-buttons">
          <Button icon={playing ? 'pauseF' : 'playF'} onClick={() => (active ? playerStore.toggle() : playMix(mix))} className="actions-play">
            {playing ? 'Pause' : active ? 'Resume' : 'Play'}
          </Button>
          <Button variant="secondary" icon="shuffle" onClick={() => playMix(mix, { shuffle: true })}>
            Shuffle
          </Button>
          <Button variant="secondary" icon="saveList" onClick={save}>
            Save as playlist
          </Button>
          <span className="mx-flex" />
          <span className="mx-ro t-mono">READ-ONLY · NEXT REFRESH {nextRefresh}</span>
        </div>
      )}

      {phone && offline !== null && (
        <div className="mx-offline">
          <Icon name="offline" />
          <span className="mx-offline-t">You’re offline. Only downloaded songs play.</span>
          <span className="mx-offline-m t-mono">
            {offline} OF {tracks.length} OFFLINE
          </span>
        </div>
      )}

      <div className="pl-table mx-table" role="table">
        {!phone && (
          <div className="pl-head" role="row">
            <span className="pl-h-n">#</span>
            <span>TITLE</span>
            <span>ALBUM</span>
            <span>QUALITY</span>
            <span>LAST PLAYED</span>
            <span className="pl-h-r">
              <Icon name="clock" />
            </span>
          </div>
        )}
        {tracks.map((t, i) => (
          <Row
            key={t.id}
            c={c}
            t={t}
            i={i}
            phone={phone}
            current={curId === t.id}
            playing={playing}
            fresh={mix.kind !== 'redis' && !last.has(t.id)}
            lastLabel={lastPlayedLabel(last.get(t.id), Date.now())}
            unavailable={!!allowed && !allowed.has(t.id)}
            onPlay={() => playFrom(t)}
          />
        ))}
      </div>
      <div className="mx-foot t-mono">{mixContext(mix).label.toUpperCase()} · {plural(tracks.length, 'SONG')}</div>
    </div>
  )
}

function lastPlays(plays: readonly Play[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of plays) if (p.at > (m.get(p.trackId) ?? 0)) m.set(p.trackId, p.at)
  return m
}

function Row({ c, t, i, phone, current, playing, fresh, lastLabel, unavailable, onPlay }: { c: Catalogue; t: Track; i: number; phone: boolean; current: boolean; playing: boolean; fresh: boolean; lastLabel: string; unavailable: boolean; onPlay: () => void }) {
  const album = c.albums[t.albumId]
  const [ref, cover] = useLazyCover<HTMLDivElement>(album?.cover)
  const target = { kind: 'track', trackId: t.id } as const
  return (
    <div
      className={['pl-row', 'mx-row', current && 'is-playing', unavailable && 'is-unavailable'].filter(Boolean).join(' ')}
      role="row"
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (isTouch() && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      onContextMenu={(e) => actions.menu(target, e)}
      {...trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
    >
      <div className="pl-n">
        {current && playing ? <Eq /> : <span className="pl-n-t">{String(i + 1).padStart(2, '0')}</span>}
        <button type="button" className="pl-play" onClick={onPlay} aria-label={`Play ${t.title}`}>
          <Icon name="playF" />
        </button>
      </div>
      <div className="pl-main">
        <div ref={ref} className="pl-cover">
          {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
        </div>
        <div className="pl-text">
          <div className="pl-t">{t.title}</div>
          <div className="pl-a">
            <a className="ln" href={artistHref(t.artistId)} draggable={false}>
              {t.artist}
            </a>
            {phone && fresh && <span className="mx-new is-sm">NEW</span>}
          </div>
        </div>
        {!phone && fresh && <span className="mx-new">NEW TO YOU</span>}
      </div>
      {!phone && (
        <>
          <div className="pl-album">
            {album && (
              <a className="ln" href={albumHref(album.id)} draggable={false}>
                {album.title}
              </a>
            )}
          </div>
          <div className="pl-q">
            <QualityBadge kind={qualityKind('flac', t.flac?.bitDepth, t.flac?.sampleRate)}>{qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}</QualityBadge>
          </div>
          <div className="pl-added">{lastLabel}</div>
        </>
      )}
      <div className="pl-d">{unavailable ? <Icon name="cloud" /> : t.duration ? formatTime(t.duration) : '—'}</div>
      {phone && (
        <div className="pl-act">
          <button type="button" className="pl-dots" aria-label="More" onClick={(e) => actions.menu(target, e)}>
            <Icon name="more" />
          </button>
        </div>
      )}
    </div>
  )
}

function Expired({ c, id, set, crumbs }: { c: Catalogue; id: string; set: MixSet; crumbs: React.ReactNode }) {
  const phone = useIsPhone()
  const size = useHomeSize()
  const seen = seenMix(id)
  const was = seen ? `${seen.kind === 'daily' && seen.n ? `Daily Mix ${seen.n}` : seen.title} from ${fmtDay(seen.day)}` : null
  const body = phone
    ? `Daily Mixes are rebuilt every morning.${was ? ` This link was for ${was}.` : ''}`
    : `Daily Mixes are rebuilt every morning from what you've been playing.${was ? ` This link was for ${was}.` : ''} Save a mix as a playlist to keep it.`
  const ring = phone ? 120 : 150
  return (
    <div className="pl-page mx-page">
      {crumbs}
      <div className="mx-expired">
        <div className="mx-rings" style={{ width: ring, height: ring } as CSSProperties} aria-hidden>
          <span style={{ inset: 0, opacity: 0.06 }} />
          <span style={{ inset: '18%', opacity: 0.12 }} />
          <span style={{ inset: '34%', opacity: 0.3 }} />
          <Icon name="refresh" className="mx-rings-ic" />
        </div>
        <h2 className="mx-exp-t">This mix has been refreshed</h2>
        <p className="mx-exp-b">{body}</p>
      </div>
      {set.items.length > 0 && (
        <section className="shelf mx-today">
          <div className="shelf-head">
            <span className="shelf-label">TODAY'S MIXES</span>
            <span className="shelf-line" />
          </div>
          <div className={phone ? 'mx-today-grid' : 'hrow'}>
            {set.items.map((m) => (
              <MixCard key={m.id} c={c} mix={m} size={phone ? Math.floor((Math.min(window.innerWidth, 760) - (size === 'narrow' ? 32 : 40) - 14) / 2) : cardSize(size)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function fmtDay(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1]}`
}

