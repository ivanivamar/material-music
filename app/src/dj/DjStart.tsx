/**
 * DJ start view of the full-screen player (Material 3 Expressive redesign, DJMaterial.dc.html):
 * what opens when the DJ is off and the DJ button is pressed. Start DJ (Endless, all types) or
 * one type: Genre (multi-select chips), Never played, Forgotten, New additions — each with the songs available.
 */
import { useMemo, useState } from 'react'
import { useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { djLibrary, djStore, downloadedOnly, typeCounts, useDj } from '../state/dj'
import { useDownloads, useOnline } from '../state/downloads'
import { useGenres } from '../state/genres'
import { useHistory } from '../state/history'
import { useLibrary } from '../state/library'
import { DjMark } from './DjMark'
import { MIN_SIZE, genreSongCount, type DjType } from './engine'

const fmt = (n: number) => n.toLocaleString('en-US')

interface TypeCard {
  type: Exclude<DjType, 'genre'>
  label: string
  sub: string
  n: number
  /** what fills in when it runs short */
  low: string
  /** songs a session of this type could use at all (own + fallback) */
  usable: number
}

export function DjStart({ phone }: { phone: boolean; onBack?: () => void }) {
  const toast = useToast()
  useLibrary()
  useHistory()
  const genres = useGenres()
  useDownloads()
  const online = useOnline()
  const { starting } = useDj()
  const lib = djLibrary()
  const counts = useMemo(() => (lib ? typeCounts(lib) : null), [lib])
  const [picked, setPicked] = useState<string[]>([])
  const offline = downloadedOnly()
  const reading = !!genres.pass
  const chips = useMemo(() => (lib ? lib.genres.slice(0, phone ? 9 : 12) : []), [lib, phone])
  const pickedCount = useMemo(() => (lib ? genreSongCount(lib, picked) : 0), [lib, picked])

  if (!lib || !counts) return null

  const cards: TypeCard[] = [
    { type: 'never', label: 'Never played', sub: 'In your library, never played through', n: counts.never, low: 'Sessions will mix in forgotten songs.', usable: counts.total },
    {
      type: 'forgotten',
      label: 'Forgotten',
      sub: counts.forgotten ? 'Not played in over six months' : 'Nothing forgotten yet: sessions use songs you’ve never played',
      n: counts.forgotten,
      low: 'Sessions will mix in never-played songs.',
      usable: counts.forgotten + counts.never,
    },
    { type: 'new', label: 'New additions', sub: 'Added in the last 30 days', n: counts.new, low: 'Sessions will mix in older songs.', usable: counts.total },
  ]

  const start = async (type?: DjType, gs?: string[]) => {
    const ok = await djStore.start({ type, genres: gs })
    if (!ok) toast.show({ icon: 'alert', mutedIcon: true, text: 'Nothing the DJ can play here yet.', meta: offline ? 'Downloaded songs only' : 'Library' })
  }
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  const gSum = picked.length ? `${picked.length} ${picked.length === 1 ? 'genre' : 'genres'} · ${fmt(pickedCount)} songs` : 'No genre picked'
  const libLine = offline ? `${fmt(counts.total)} downloaded` : `${fmt(counts.total)} songs in your library`

  const genreCard = (
    <div className="djs-card djs-genre">
      <div className="djs-card-h">
        <div className="djs-card-t">Genre</div>
        <div className="djs-sub">{reading ? `Reading genres · ${fmt(lib.withGenre)} of ${fmt(counts.total)}` : 'Pick one or more'}</div>
      </div>
      {reading && (
        <div className="djs-progress" aria-hidden>
          <span style={{ width: `${(lib.withGenre / Math.max(1, counts.total)) * 100}%` }} />
        </div>
      )}
      <div className="djs-chips">
        {chips.map((g) => {
          const on = picked.includes(g.key)
          return (
            <button key={g.key} type="button" className={`djs-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggle(g.key)}>
              {on && <Icon name="done" size={16} />}
              {g.name}
              <span className="djs-chip-n">{reading ? `${fmt(g.count)} so far` : fmt(g.count)}</span>
            </button>
          )
        })}
        {reading && [120, 96, 140, 84].map((w, i) => <span key={i} className="djs-chip is-skel pg-anim" style={{ width: w }} aria-hidden />)}
        {!chips.length && !reading && <div className="djs-note">No genres yet. Endless mode and the other types already work.</div>}
      </div>
      {reading && <div className="djs-note">Counts so far. Endless mode and the other types already work; genre sessions pick from tagged songs only.</div>}
      {phone ? (
        <button type="button" className="djs-genre-go" disabled={!picked.length || starting} onClick={() => void start('genre', picked)}>
          <span>Start with genre</span>
          <span className="djs-genre-sum">{gSum}</span>
        </button>
      ) : (
        <div className="djs-card-f">
          <div className="djs-sub is-sum">{gSum}</div>
          <button type="button" className="djs-genre-go" disabled={!picked.length || starting} onClick={() => void start('genre', picked)}>
            Start with genre
          </button>
        </div>
      )}
    </div>
  )

  const typeEl = (c: TypeCard) => {
    const low = c.n < MIN_SIZE && c.usable >= 1
    const disabled = c.usable === 0 || starting
    const n = c.n === 0 && c.type === 'forgotten' && c.usable ? '0 yet' : low ? `${fmt(c.n)} left` : fmt(c.n)
    const sub = c.usable === 0 ? (offline ? 'None downloaded yet' : 'Nothing to play yet') : low && c.type !== 'forgotten' ? c.low : c.sub
    return phone ? (
      <button key={c.type} type="button" className="djs-row" disabled={disabled} onClick={() => void start(c.type)}>
        <span className="djs-row-text">
          <span className="djs-row-t">{c.label}</span>
          <span className="djs-row-s">{sub}</span>
        </span>
        <span className="djs-row-n">{n}</span>
        <Icon name="chevR" />
      </button>
    ) : (
      <button key={c.type} type="button" className="djs-type" disabled={disabled} onClick={() => void start(c.type)}>
        <span className="djs-type-h">
          <span className="djs-type-t">{c.label}</span>
          <Icon name="chevR" />
        </span>
        <span className="djs-type-n">{n}</span>
        <span className="djs-type-s">{sub}</span>
      </button>
    )
  }

  const banner = offline && (
    <div className="djs-banner">
      <Icon name="offline" />
      <span>
        <b>{online ? 'On mobile data' : 'You’re offline'}</b> · The DJ plays only downloaded songs.{online ? '' : ' Intros are text until you’re back online.'}
      </span>
    </div>
  )

  if (phone)
    return (
      <section className="djs is-phone pg-anim">
        <div className="djs-hero">
          <DjMark size={104} idle />
          <div className="djs-hero-t">
            <div className="djs-kicker">Material Music DJ</div>
            <div className="djs-title">DJ</div>
          </div>
        </div>
        <p className="djs-body">Endless themed sessions from your library, each with a short spoken intro. The queue waits until you stop.</p>
        {banner}
        <button type="button" className="djs-go" disabled={starting} onClick={() => void start()}>
          <Icon name="podcasts" filled />
          Start DJ
          <span className="djs-go-sub">{offline ? `${fmt(counts.total)} downloaded` : 'Endless'}</span>
        </button>
        <div className="djs-sec-label">Or start with one type</div>
        {genreCard}
        <div className="djs-rows">{cards.map(typeEl)}</div>
      </section>
    )

  return (
    <section className="djs pg-anim">
      <div className="djs-left">
        <DjMark size={420} idle fluid />
        <div className="djs-caption">Sessions of 6–9 songs, with a short spoken intro before each.</div>
      </div>
      <div className="djs-right">
        <div className="djs-head">
          <div className="djs-kicker">Material Music DJ · {libLine}</div>
          <div className="djs-title">DJ</div>
          <p className="djs-body">Plays an endless chain of sessions from your library and introduces each one. Pause, skip and lyrics work as usual; the queue waits until you stop the DJ.</p>
        </div>
        {banner}
        <button type="button" className="djs-go" disabled={starting} onClick={() => void start()}>
          <Icon name="podcasts" filled />
          Start DJ
          <span className="djs-go-sub">{offline ? `${fmt(counts.total)} downloaded` : 'Endless · all types'}</span>
        </button>
        <div className="djs-sec-label">Or start with one type</div>
        {genreCard}
        <div className="djs-types">{cards.map(typeEl)}</div>
      </div>
    </section>
  )
}
