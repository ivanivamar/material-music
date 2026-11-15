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
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type React from 'react'
import { IconButton, Button, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { mixDay } from '../../lib/mixing'
import { artistHref, back, go, href, playlistHref } from '../../shell/routes'
import { useDj } from '../../state/dj'
import { useDownloads } from '../../state/downloads'
import { useGenres } from '../../state/genres'
import { useHistory, type Play } from '../../state/history'
import { useLibrary, type Catalogue, type Track } from '../../state/library'
import { mixContext, playableSet, playMix, seenMix, useMixSet, type MixPlan, type MixSet } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import { playlistsStore } from '../../state/playlists'
import { useLikedIndex } from '../../state/likes'
import { useIsPhone } from '../../state/viewport'
import { plural } from '../../state/views'
import { MixCover } from '../home/art'
import { MixCard, cardSize, useHomeSize } from '../home/cards'
import { useMadeForYou } from '../../state/madeForYou'
import { hideFromDayMix, nextUpdateLabel, type DayMix } from '../../state/daymix'
import { DISC_ID, type DiscoveryMix } from '../../state/discovery'
import { ListRing } from '../../components/sonar/ListRing'
import { fmtClock, usePlayCounts, type SonarSong } from '../../components/sonar/Sonar'
import { SnHead, SnRow, UpNext } from '../../components/sonar/SnList'
import { Crumbs } from '../library/common'
import { DiscoveryPending, DiscoveryView } from './DiscoveryView'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86_400_000



export function useTodayMixes(): MixSet | null {
  const { data } = useLibrary()
  const history = useHistory()
  const genres = useGenres()
  const dj = useDj()
  const today = useMixSet([data, history.plays, genres.doc, dj.doc.songPenalties, mixDay(Date.now()).key])
  // the Day mix and Discovery lead, as on Home
  return useMadeForYou(today).set
}

export function MixPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const set = useTodayMixes()
  const phone = useIsPhone()
  if (!data) return null
  const backBtn = (
    phone ? (
      <IconButton icon="back" label="Back to Home" size="lg" variant="strong" className="mx-back" onClick={() => back(href('home'))} />
    ) : (
      <Button variant="plain" icon="back" className="mx-back" onClick={() => back(href('home'))} aria-label="Back to Home">
        Home · Made for you
      </Button>
    )
  )
  if (!set)
    return (
      <div className="mx-page">
        {backBtn}
        <div className="mx-loading">Mixing…</div>
      </div>
    )
  const mix = set.items.find((m) => m.id === id)
  if (mix?.kind === 'disc') return <DiscoveryView c={data} mix={mix as DiscoveryMix} backBtn={backBtn} />
  if (!mix && id === DISC_ID) return <DiscoveryPending backBtn={backBtn} />
  if (!mix) return <Expired c={data} id={id} set={set} backBtn={backBtn} />
  return <MixView c={data} mix={mix} />
}

const KIND_KICKER = { daily: 'DAILY MIX', deep: 'DEEP CUTS · NEVER PLAYED', redis: 'REDISCOVER · LOVED, NOT LATELY', day: 'DAY MIX · UPDATES THROUGH THE DAY', disc: 'DISCOVERY · PREVIEWS · REFRESHES MONDAY' } as const

function MixView({ c, mix }: { c: Catalogue; mix: MixPlan }) {
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
  const dayPlan = mix.kind === 'day' ? (mix as DayMix).day : null
  const nextRefresh = dayPlan ? nextUpdateLabel(dayPlan.slot) : new Date(day.next).toDateString() === new Date(Date.now() + DAY).toDateString() ? 'tomorrow 06:00' : 'today 06:00'
  const [saved, setSaved] = useState(false)
  const counts = usePlayCounts()
  const likedIx = useLikedIndex()
  const songs: SonarSong[] = useMemo(() => {
    const max = Math.max(1, ...tracks.map((t) => counts.get(t.id) ?? 0))
    return tracks.map((t) => ({ id: t.id, len: t.duration || 0, title: t.title, isNew: mix.kind !== 'redis' && !last.has(t.id), weight: (counts.get(t.id) ?? 0) / max }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mix.trackIds.join('|'), counts, last])
  const ringCurrent = curId ? tracks.findIndex((t) => t.id === curId) : -1
  const ring = (size: number, compactRing: boolean) => (
    <ListRing
      songs={songs}
      current={ringCurrent}
      playing={playing}
      size={size}
      onPick={(i) => playFrom(tracks[i])}
      onPlay={playAll}
      blips
      legend={songs.some((x) => x.isNew) ? ['length', 'new', 'blip'] : ['length', 'blip']}
      label={`${mix.title} as a ring: solid arcs are songs you know, hatched arcs are new to you`}
      compact={compactRing}
    />
  )

  const save = () => {
    const d = new Date()
    const name = dayPlan ? `Day mix · ${dayPlan.slot.weekday} ${dayPlan.slot.label} · ${d.getDate()} ${MONTHS[d.getMonth()]}` : `${mix.title} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
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
  const hideRow = (t: Track) => {
    hideFromDayMix(t.id)
    toast.show({ icon: 'check', text: `‘${t.title}’ won’t be in your Day mix for a month.`, action: { label: 'Undo', onClick: () => hideFromDayMix(t.id, false) } })
  }
  const menu = (e: React.MouseEvent) => actions.menu({ kind: 'tracks', trackIds: tracks.map((t) => t.id), label: mix.title }, e)

  const kicker = mix.kind === 'daily' ? `DAILY MIX ${mix.n ?? ''} · REFRESHES DAILY` : KIND_KICKER[mix.kind]

  const fmtHM = (sec: number) => {
    const m = Math.round(sec / 60)
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
  }
  const title = dayPlan ? dayPlan.phrase : mix.title
  const newCount = songs.filter((x) => x.isNew).length
  const expires = dayPlan ? `Next update ${nextRefresh}` : `Refreshes ${nextRefresh}`
  const why = (t: Track) => {
    if (mix.kind !== 'redis' && !last.has(t.id)) return 'New to you'
    if (likedIx.ids.has(t.id)) return 'Liked'
    const n = counts.get(t.id) ?? 0
    return n === 1 ? 'Played once' : `Played ${n} times`
  }
  const playBtn = (cls: string) => (
    <Button icon={playing ? 'pauseF' : 'playF'} onClick={playAll} className={cls}>
      {playing ? 'Pause' : active ? 'Resume' : 'Play'}
    </Button>
  )
  const shuffleBtn = <IconButton icon="shuffle" label="Shuffle" shape="square" className="snp-sq" onClick={() => playMix(mix, { shuffle: true })} />
  const saveBtn = (
    <Button variant="secondary" onClick={save} className="snp-edit">
      {saved ? 'Saved' : phone ? 'Save' : 'Save as playlist'}
    </Button>
  )
  const list = (
    <div className="snl snl-mix" role="list">
      {!phone && <SnHead cols={['#', null, 'Title', 'Artist', 'Why it’s here', 'Time']} />}
      {tracks.map((t, i) => {
        const fresh = mix.kind !== 'redis' && !last.has(t.id)
        const unavailable = !!allowed && !allowed.has(t.id)
        const artist = (
          <a href={artistHref(t.artistId)} draggable={false} onClick={(e) => e.stopPropagation()}>
            {t.artist}
          </a>
        )
        return (
          <SnRow
            key={t.id}
            phone={phone}
            n={String(i + 1).padStart(2, '0')}
            len={t.duration ?? 0}
            isNew={fresh}
            title={t.title}
            colA={artist}
            colB={why(t)}
            sub={artist}
            time={t.duration ? fmtClock(t.duration) : '—'}
            meta={t.duration ? fmtClock(t.duration) : ''}
            current={curId === t.id}
            playing={playing}
            played={ringCurrent >= 0 && i < ringCurrent}
            dim={unavailable}
            onPlay={() => playFrom(t)}
            onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
            end={dayPlan && !phone ? <IconButton icon="hide" label="Not in my Day mix" size="sm" onClick={(e) => (e.stopPropagation(), hideRow(t))} /> : undefined}
            rowProps={phone ? undefined : (trackDrag(() => [t.id], `${t.title} · ${t.artist}`) as never)}
          />
        )
      })}
    </div>
  )

  if (phone)
    return (
      <div className="mx-page hue-scope snpage is-phone" style={{ '--h': mix.hue, '--hc': 1 } as CSSProperties}>
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(href('home'))} />
          <span className="alp-flex" />
          <IconButton icon="more" label="More" onClick={menu} />
        </div>
        <div className="alp-head">
          <MixCover c={c} mix={mix} size={56} radius={10} />
          <div className="alp-text">
            <h1 className="alp-title" style={{ fontSize: 26 }}>
              {title}
            </h1>
            <div className="alp-lab">{[KIND_SHORT[mix.kind], newCount ? `${newCount} new` : null, dayPlan ? `next ${nextRefresh}` : `refreshes ${nextRefresh}`].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="alp-btns" style={{ marginTop: 14 }}>
          {playBtn('alp-play')}
          {shuffleBtn}
          {saveBtn}
        </div>
        {offline !== null && (
          <div className="mx-offline">
            <Icon name="offline" />
            <span className="mx-offline-t">You’re offline. Only downloaded songs play.</span>
            <span className="mx-offline-m">
              {offline} of {tracks.length}
            </span>
          </div>
        )}
        <div className="sn-phone-ring">{ring(300, true)}</div>
        <UpNext songs={songs} current={ringCurrent} />
        {list}
      </div>
    )

  return (
    <div className="mx-page hue-scope snpage" style={{ '--h': mix.hue, '--hc': 1 } as CSSProperties}>
      <div className="snp">
        <aside className="snp-side">
          <Crumbs fallback={href('home')} parts={[<a key="h" href={href('home')}>HOME</a>, <span key="m">MIXES</span>]} />
          <div className="snp-mixhead">
            <MixCover c={c} mix={mix} size={76} radius={12} />
            <div className="snp-mixtext">
              <span className="sn-lab" style={{ color: 'var(--ink-secondary)' }}>
                {kicker}
              </span>
              <h1 className="snp-title" style={{ '--ts': title.length > 24 ? '32px' : '40px' } as CSSProperties} title={title}>
                {title}
              </h1>
            </div>
          </div>
          {mix.why && <div className="snp-desc">{mix.why}</div>}
          {dayPlan && dayPlan.tags.some((t) => t.genre) && (
            <div className="snp-chips">
              {dayPlan.tags
                .filter((t) => t.genre)
                .map((t) => (
                  <span key={t.label} className="snp-chip is-static">
                    {t.label}
                  </span>
                ))}
            </div>
          )}
          <div className="snp-ring">{ring(380, false)}</div>
          <div className="al2-facts">
            <div className="al2-fact">
              <span className="al2-k">{dayPlan ? 'Updates' : 'Expires'}</span>
              <span className="al2-v is-on">{dayPlan ? expires : `${expires} · save it to keep it`}</span>
            </div>
          </div>
        </aside>
        <section className="snp-main">
          <div className="snp-bar">
            {playBtn('snp-play')}
            {shuffleBtn}
            {saveBtn}
            <IconButton icon="more" label="More" shape="square" className="snp-sq" onClick={menu} />
            <span className="snp-flex" />
            <span className="snp-sorted">
              {tracks.length} songs · {fmtHM(seconds)}
            </span>
          </div>
          {list}
          <div className="mx-foot">
            {mixContext(mix).label} · {plural(tracks.length, 'song', 'songs')}
          </div>
        </section>
      </div>
    </div>
  )
}

const KIND_SHORT = { daily: 'Daily mix', deep: 'Deep cuts', redis: 'Rediscover', day: 'Day mix', disc: 'Discovery' } as const

function lastPlays(plays: readonly Play[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of plays) if (p.at > (m.get(p.trackId) ?? 0)) m.set(p.trackId, p.at)
  return m
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
