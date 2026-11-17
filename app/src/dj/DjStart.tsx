/**
 * DJ start view (design "DjV2", start state): the right column of the DJ screen while the DJ is off.
 * PELAGIC DJ · DJ · the white Start DJ pill (Endless, all types) · or one type: three cards
 * (Never played, New additions, Forgotten, with the songs each has) and the Genre box (pick one or
 * more, Start appears once one is picked).
 *
 * Edge states (handoff_dj §9): types running low ("3 LEFT"), offline on the phone (downloaded songs
 * only), genres still being read (counts so far + skeleton chips).
 */
import { useMemo, useState } from 'react'
import { useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { djLibrary, djStore, downloadedOnly, typeCounts, useDj } from '../state/dj'
import { useDownloads, useOnline } from '../state/downloads'
import { useGenres } from '../state/genres'
import { useHistory } from '../state/history'
import { useLibrary } from '../state/library'
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

export function DjStart({ phone }: { phone: boolean }) {
  const toast = useToast()
  // re-evaluate with the catalogue, history, genres and downloads
  useLibrary()
  useHistory()
  const genres = useGenres()
  useDownloads()
  const online = useOnline()
  const { starting } = useDj()
  // memoised inside on (catalogue, plays, genres, downloads, penalties)
  const lib = djLibrary()
  const counts = useMemo(() => (lib ? typeCounts(lib) : null), [lib])
  const [picked, setPicked] = useState<string[]>([])
  const offline = downloadedOnly()
  const reading = !!genres.pass
  const chips = useMemo(() => (lib ? lib.genres.slice(0, phone ? 10 : 12) : []), [lib, phone])
  const pickedCount = useMemo(() => (lib ? genreSongCount(lib, picked) : 0), [lib, picked])

  if (!lib || !counts) return null

  const cards: TypeCard[] = [
    { type: 'never', label: 'Never played', sub: 'In your library, never played through', n: counts.never, low: 'Sessions will mix in forgotten songs.', usable: counts.total },
    { type: 'new', label: 'New additions', sub: 'Added in the last 30 days', n: counts.new, low: 'Sessions will mix in older songs.', usable: counts.total },
    {
      type: 'forgotten',
      label: 'Forgotten',
      sub: counts.forgotten ? 'Not played in over six months' : 'Nothing forgotten yet: sessions use songs you’ve never played',
      n: counts.forgotten,
      low: 'Sessions will mix in never-played songs.',
      usable: counts.forgotten + counts.never,
    },
  ]

  const start = async (type?: DjType, gs?: string[]) => {
    const ok = await djStore.start({ type, genres: gs })
    if (!ok) toast.show({ icon: 'alert', mutedIcon: true, text: 'Nothing the DJ can play here yet.', meta: offline ? 'DOWNLOADED SONGS ONLY' : 'LIBRARY' })
  }
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  const hint = reading
    ? `READING GENRES · ${fmt(lib.withGenre)} OF ${fmt(counts.total)}`
    : picked.length
      ? `${picked.length} PICKED · ${fmt(pickedCount)} SONGS`
      : 'PICK ONE OR MORE'

  return (
    <div className="djv djv-start" key="start">
      <div className="djv-k t-mono">PELAGIC DJ</div>
      <h1 className="djv-dj">DJ</h1>
      <div className="djv-sub t-mono">{offline ? `${fmt(counts.total)} DOWNLOADED SONGS · A SHORT SPOKEN INTRO BEFORE EACH` : 'THEMED SESSIONS · A SHORT SPOKEN INTRO BEFORE EACH'}</div>
      {offline && (
        <div className="djv-banner">
          <Icon name="offline" />
          <span>
            <b>{online ? 'On mobile data' : 'You’re offline'}</b> · The DJ plays only downloaded songs.{online ? '' : ' Intros are text until you’re back online.'}
          </span>
        </div>
      )}
      <button type="button" className="djv-start-go" disabled={starting} onClick={() => void start()}>
        <span className="djv-start-ic" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="oklch(0.9 0.06 290)">
            <path d="M7 4l13 8-13 8z" />
          </svg>
        </span>
        <span className="djv-start-t">
          <span>Start DJ</span>
          <span className="t-mono">ENDLESS · ALL TYPES</span>
        </span>
      </button>
      <div className="djv-or t-mono">OR START WITH ONE TYPE</div>
      <div className="djv-types">
        {cards.map((c, i) => {
          const low = c.n < MIN_SIZE && c.usable >= 1
          const disabled = c.usable === 0 || starting
          const n = c.n === 0 && c.type === 'forgotten' && c.usable ? '0 YET' : low ? `${fmt(c.n)} LEFT` : `${fmt(c.n)} ${c.n === 1 ? 'SONG' : 'SONGS'}`
          const sub = c.usable === 0 ? (offline ? 'None downloaded yet' : 'Nothing to play yet') : low && c.type !== 'forgotten' ? c.low : c.sub
          return (
            <button key={c.type} type="button" className="djv-type" disabled={disabled} style={{ animationDelay: `${200 + i * 60}ms` }} onClick={() => void start(c.type)}>
              <span className="djv-type-t">{c.label}</span>
              <span className="djv-type-s">{sub}</span>
              <span className="djv-type-n t-mono">{n}</span>
              <span className="djv-go" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="oklch(0.25 0.08 292)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          )
        })}
      </div>
      <div className="djv-genre">
        <div className="djv-genre-h">
          <span className="djv-genre-t">Genre</span>
          <span className="djv-genre-m t-mono">{hint}</span>
          <button type="button" className={`djv-btn djv-genre-go ${picked.length ? 'is-on' : ''}`} disabled={!picked.length || starting} tabIndex={picked.length ? 0 : -1} onClick={() => void start('genre', picked)}>
            Start
          </button>
        </div>
        {reading && (
          <div className="djv-progress" aria-hidden>
            <span style={{ width: `${(lib.withGenre / Math.max(1, counts.total)) * 100}%` }} />
          </div>
        )}
        <div className="djv-chips">
          {chips.map((g) => {
            const on = picked.includes(g.key)
            return (
              <button key={g.key} type="button" className={`djv-chip ${on ? 'is-on' : ''}`} aria-pressed={on} title={`${fmt(g.count)} ${reading ? 'so far' : 'songs'}`} onClick={() => toggle(g.key)}>
                {g.name}
              </button>
            )
          })}
          {reading && [120, 96, 140, 84].map((w, i) => <span key={i} className="djv-chip is-skel pg-anim" style={{ width: w }} aria-hidden />)}
          {!chips.length && !reading && <div className="djv-note">No genres yet. Endless mode and the other types already work.</div>}
        </div>
        {reading && <div className="djv-note">Counts so far. Endless mode and the other types already work; genre sessions pick from tagged songs only.</div>}
      </div>
    </div>
  )
}
