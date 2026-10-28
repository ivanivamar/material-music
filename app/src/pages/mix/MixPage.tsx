/**
 * Mix page `#/mix/<id>` (Material redesign, HomeMaterial.dc.html page=mix): read-only (no reorder, no
 * remove; rows still drag onto a sidebar playlist).
 *
 *   ← Home · Made for you
 *   [neutral header card: tilted mix cover · DAILY MIX 1 · REFRESHES DAILY (mix hue) · title · the "why"
 *    line · 50 songs · 3 hr 12 min · 9 new to you · cookie Play 80]
 *   Shuffle · Save as playlist                         🔒 Read-only · next refresh tomorrow 06:00
 *   [surface list: #  Title  Album  Quality  Last played  ⏱]
 *
 * Save as playlist copies today's songs into a normal playlist "<title> · 19 Oct".
 * Phone offline: only downloaded songs play; the others are greyed (cloud icon), the count line says
 * "32 OF 50 OFFLINE". An id that isn't in today's set (mixes refresh at 06:00) → "This mix has been
 * refreshed" + today's mixes.
 */
import { useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type React from 'react'
import { IconButton, Button, AlbumEq, CookieButton, formatTime, qualityLabel, useToast } from '../../components/ui'
import { SHAPE_CLOVER, SHAPE_PLAYING } from '../../design/shapes'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { useLazyCover } from '../../lib/covers'
import { mixDay } from '../../lib/mixing'
import { albumHref, artistHref, back, go, href, playlistHref } from '../../shell/routes'
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
import { MixCover } from '../home/art'
import { MixCard, cardSize, useHomeSize } from '../home/cards'
import '../home/home.css'
import './mix.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86_400_000

function lastPlayedLabel(sec: number | undefined, nowMs: number): string {
  if (!sec) return '—'
  const days = Math.floor((nowMs - sec * 1000) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 60) return '1 month ago'
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return days < 730 ? '1 year ago' : `${Math.floor(days / 365)} years ago`
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
  const phone = useIsPhone()
  if (!data) return null
  const backBtn = (
    <button type="button" className={`mx-back ${phone ? 'is-phone' : ''}`} onClick={() => back(href('home'))} aria-label="Back to Home">
      <Icon name="back" />
      {!phone && 'Home · Made for you'}
    </button>
  )
  if (!set)
    return (
      <div className="mx-page">
        {backBtn}
        <div className="mx-loading">Mixing…</div>
      </div>
    )
  const mix = set.items.find((m) => m.id === id)
  if (!mix) return <Expired c={data} id={id} set={set} backBtn={backBtn} />
  return <MixView c={data} mix={mix} backBtn={backBtn} />
}

const KIND_KICKER = { daily: 'DAILY MIX', deep: 'DEEP CUTS · NEVER PLAYED', redis: 'REDISCOVER · LOVED, NOT LATELY' } as const

function MixView({ c, mix, backBtn }: { c: Catalogue; mix: MixPlan; backBtn: ReactNode }) {
  const phone = useIsPhone()
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
  const nextRefresh = new Date(day.next).toDateString() === new Date(Date.now() + DAY).toDateString() ? 'tomorrow 06:00' : 'today 06:00'
  const compact = useCompact()
  const [saved, setSaved] = useState(false)

  const save = () => {
    const d = new Date()
    const name = `${mix.title} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
    const pid = playlistsStore.create(name, tracks.map((t) => t.id))
    setSaved(true)
    toast.show({ icon: 'check', text: `Saved as ‘${name}’`, action: { label: 'Open', onClick: () => go(playlistHref(pid)) } })
  }
  const playFrom = (t: Track) => {
    if (allowed && !allowed.has(t.id)) return
    if (curId === t.id) return playerStore.toggle()
    playMix(mix, { startId: t.id })
  }
  const playAll = () => (active ? playerStore.toggle() : playMix(mix))
  const menu = (e: React.MouseEvent) => actions.menu({ kind: 'tracks', trackIds: tracks.map((t) => t.id), label: mix.title }, e)

  const stats = [plural(tracks.length, 'song', 'songs'), seconds ? fmtTotal(seconds).toLowerCase() : null, offline !== null ? `${offline} of ${tracks.length} offline` : mix.newCount ? `${mix.newCount} new to you` : null].filter(Boolean).join(' · ')
  const kicker = mix.kind === 'daily' ? `DAILY MIX ${mix.n ?? ''} · REFRESHES DAILY` : KIND_KICKER[mix.kind]
  const coverSize = phone ? 200 : compact ? 176 : 208

  return (
    <div className={`mx-page hue-scope ${phone ? 'is-phone' : ''}`} style={{ '--h': mix.hue, '--hc': 1 } as CSSProperties}>
      {backBtn}
      <header className="mx-hero">
        <div className="mx-cover">
          <MixCover c={c} mix={mix} size={coverSize} />
        </div>
        <div className="mx-hero-text">
          <div className="mx-kicker">{kicker}</div>
          <h1 className="mx-title" title={mix.title}>
            {mix.title}
          </h1>
          <div className="mx-why">{mix.why}</div>
          <div className="mx-stats">{stats}</div>
        </div>
        {!phone && <CookieButton size={80} iconSize={40} playing={playing} icon={playing ? 'pauseF' : 'playF'} label={playing ? 'Pause' : 'Play'} className="mx-play" onClick={playAll} />}
      </header>

      {phone ? (
        <div className="mx-actions">
          <IconButton icon="shuffle" label="Shuffle" size="lg" variant="strong" className="mx-ib" onClick={() => playMix(mix, { shuffle: true })} />
          <IconButton icon={saved ? 'bookmarked' : 'bookmark'} label={saved ? 'Saved as playlist' : 'Save as playlist'} size="lg" variant="strong" className="mx-ib" filled={saved} onClick={save} />
          <IconButton icon="more" label="More" size="lg" variant="strong" className="mx-ib" onClick={menu} />
          <span className="mx-flex" />
          <CookieButton size={64} iconSize={32} playing={playing} icon={playing ? 'pauseF' : 'playF'} label={playing ? 'Pause' : 'Play'} onClick={playAll} />
        </div>
      ) : (
        <div className="mx-buttons">
          <Button variant="tonal" onClick={() => playMix(mix, { shuffle: true })}>
            <Icon name="shuffle" />
            Shuffle
          </Button>
          <Button variant="outlined-ink" onClick={save}>
            <Icon name={saved ? 'bookmarked' : 'bookmark'} filled={saved} />
            {saved ? 'Saved as playlist' : 'Save as playlist'}
          </Button>
          <IconButton icon="moreH" label="More" onClick={menu} />
          <span className="mx-flex" />
          <span className="mx-ro">
            <Icon name="lock" />
            Read-only · next refresh {nextRefresh}
          </span>
        </div>
      )}

      {phone && offline !== null && (
        <div className="mx-offline">
          <Icon name="offline" />
          <span className="mx-offline-t">You’re offline. Only downloaded songs play.</span>
          <span className="mx-offline-m">
            {offline} of {tracks.length}
          </span>
        </div>
      )}

      <div className="mx-list" role="table">
        {!phone && (
          <div className="mx-head" role="row">
            <span className="mx-c-n">#</span>
            <span>Title</span>
            <span>Album</span>
            <span>Quality</span>
            <span>Last played</span>
            <span className="mx-c-d">
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
      <div className="mx-foot">
        {mixContext(mix).label} · {plural(tracks.length, 'song', 'songs')}
      </div>
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
  const q24 = (t.flac?.bitDepth ?? 16) > 16 || (t.flac?.sampleRate ?? 44100) > 48000
  return (
    <div
      className={['mx-row', current && 'is-current', unavailable && 'is-unavailable'].filter(Boolean).join(' ')}
      role="row"
      onDoubleClick={onPlay}
      onClick={(e) => {
        if ((phone || isTouch()) && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      onContextMenu={(e) => actions.menu(target, e)}
      {...trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
    >
      {!phone && (
        <div className="mx-c-n">
          {current ? <AlbumEq color={playing ? 'var(--brand)' : 'var(--ink-secondary)'} on={playing} /> : <span className="mx-n">{i + 1}</span>}
          <button type="button" className="mx-rplay" onClick={onPlay} aria-label={`Play ${t.title}`}>
            <Icon name={current && playing ? 'pauseF' : 'playF'} />
          </button>
        </div>
      )}
      <div className="mx-main">
        <div ref={ref} className="mx-rcover">
          {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
          {phone && current && (
            <span className="mx-rcover-eq">
              <AlbumEq color="oklch(0.93 0.04 38)" on={playing} />
            </span>
          )}
        </div>
        <div className="mx-text">
          <div className="mx-t">{t.title}</div>
          <div className="mx-a">
            {phone && fresh && <span className="mx-new is-sm">NEW</span>}
            <a className="mx-ln" href={artistHref(t.artistId)} draggable={false} onClick={(e) => e.stopPropagation()}>
              {t.artist}
            </a>
            {phone && t.duration ? <span className="mx-a-d">· {formatTime(t.duration)}</span> : null}
          </div>
        </div>
      </div>
      {!phone && (
        <>
          <div className="mx-album">
            {album && (
              <a className="mx-ln" href={albumHref(album.id)} draggable={false}>
                {album.title}
              </a>
            )}
          </div>
          <div className="mx-q">
            <span className={`mx-qpill ${q24 ? 'is-24' : ''}`}>{qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}</span>
          </div>
          <div className="mx-last">{fresh ? <span className="mx-new">New to you</span> : lastLabel}</div>
          <div className="mx-c-d">{unavailable ? <Icon name="cloud" /> : t.duration ? formatTime(t.duration) : '—'}</div>
        </>
      )}
      {phone && (
        <button type="button" className="mx-dots" aria-label="More" onClick={(e) => (e.stopPropagation(), actions.menu(target, e))}>
          {unavailable ? <Icon name="cloud" /> : <Icon name="more" />}
        </button>
      )}
    </div>
  )
}

function Expired({ c, id, set, backBtn }: { c: Catalogue; id: string; set: MixSet; backBtn: ReactNode }) {
  const phone = useIsPhone()
  const size = useHomeSize()
  const seen = seenMix(id)
  const was = seen ? `${seen.kind === 'daily' && seen.n ? `Daily Mix ${seen.n}` : seen.title} from ${fmtDay(seen.day)}` : null
  const body = `Daily Mixes are rebuilt every morning from what you've been playing.${was ? ` This link was for ${was}.` : ''} Save a mix as a playlist to keep it.`
  const S = phone ? 140 : 160
  return (
    <div className={`mx-page mx-exp-page ${phone ? 'is-phone' : ''}`}>
      {backBtn}
      <div className="mx-expired">
        <div className="mx-exp-mark" style={{ width: S, height: S }} aria-hidden>
          <span className="mx-exp-clover" style={{ clipPath: SHAPE_CLOVER }} />
          <span className="mx-exp-cookie" style={{ inset: phone ? 22 : 26, clipPath: SHAPE_PLAYING }} />
          <Icon name="autorenew" size={phone ? 36 : 45} className="mx-exp-ic" />
        </div>
        <h2 className="mx-exp-t">This mix has been refreshed</h2>
        <p className="mx-exp-b">{body}</p>
      </div>
      {set.items.length > 0 && (
        <section className="hs mx-today">
          <div className="hs-head">
            <h2 className="hs-title">Today's mixes</h2>
            {!phone && <span className="hs-sub">Updated today · 06:00</span>}
          </div>
          <div className="hs-row">
            {set.items.map((m) => (
              <MixCard key={m.id} c={c} mix={m} size={cardSize(size)} />
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
