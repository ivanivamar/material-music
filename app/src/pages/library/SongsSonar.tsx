/**
 * Library → Songs as the sonar mockup draws it. Desktop: on the left the title, the library map
 * (one arc per group, sized by its songs; blips for your most played; the sweep and a bright edge
 * follow the scroll) and "Ring by" chips; on the right the toolbar (Play all, Shuffle, search,
 * A–Z / Plays / Added) and the grouped list with plays. Phone: a compact header with a mini dial,
 * the list, and the half-ring scrubber on the right edge.
 */
import { useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { SongsRing } from '../../components/sonar/SongsRing'
import { SnHead, SnRow, SnSection, SnWindow, fmtHoursMin, type SnGroup, type SnWindowApi } from '../../components/sonar/SnList'
import { fmtClock, usePlayCounts } from '../../components/sonar/Sonar'
import { albumHref, artistHref, libraryHref } from '../../shell/routes'
import { albumGenresOf, useGenres } from '../../state/genres'
import type { Catalogue, Track } from '../../state/library'
import { libraryPrefs, useLibraryPrefs, type SongOrder, type SongRing } from '../../state/libraryPrefs'
import { playerStore } from '../../state/player'
import { focusLibrarySearch } from '../../state/search'
import { Crumbs } from './common'
import { HalfRingScrubber } from './HalfRing'
import { LETTERS, letterOf } from './libgrid'
import { playList, useContextState, useNowPlaying } from './playback'

const RING_LABEL: Record<SongRing, string> = { letter: 'Letter', artist: 'Artist', genre: 'Genre', year: 'Year' }
const ORDER_LABEL: Record<SongOrder, string> = { az: 'A–Z', plays: 'Plays', added: 'Added' }
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function SongsSonar({ c, tracks: all, phone }: { c: Catalogue; tracks: Track[]; phone: boolean }) {
  const prefs = useLibraryPrefs()
  const ringBy = prefs.songRing
  const order = prefs.songOrder
  const counts = usePlayCounts()
  const { doc: genreDoc } = useGenres()
  const now = useNowPlaying()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<[number, number]>([0, 0])
  const win = useRef<SnWindowApi | null>(null)

  const groups: SnGroup<Track>[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? all.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q)) : all
    const keyOf = (t: Track): string => {
      if (ringBy === 'letter') return letterOf(t.title)
      if (ringBy === 'artist') return letterOf(t.artist)
      if (ringBy === 'genre') return albumGenresOf(genreDoc, c.albums[t.albumId]).genres[0] ?? 'Unknown genre'
      const y = c.albums[t.albumId]?.year
      return y ? `${Math.floor(y / 10) * 10}s` : 'Unknown year'
    }
    const added = (t: Track) => Date.parse(t.addedAt ?? '') || 0
    const inner = (a: Track, b: Track) =>
      order === 'plays'
        ? (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || collator.compare(a.title, b.title)
        : order === 'added'
          ? added(b) - added(a) || collator.compare(a.title, b.title)
          : ringBy === 'artist'
            ? collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title)
            : collator.compare(a.title, b.title)
    const by = new Map<string, Track[]>()
    for (const t of list) {
      const k = keyOf(t)
      const arr = by.get(k)
      if (arr) arr.push(t)
      else by.set(k, [t])
    }
    const keys = [...by.keys()]
    keys.sort((a, b) => {
      if (ringBy === 'letter' || ringBy === 'artist') return LETTERS.indexOf(a) - LETTERS.indexOf(b)
      if (ringBy === 'year') return a.startsWith('Unknown') ? 1 : b.startsWith('Unknown') ? -1 : b.localeCompare(a)
      return a.startsWith('Unknown') ? 1 : b.startsWith('Unknown') ? -1 : collator.compare(a, b)
    })
    return keys.map((k) => ({ key: k, label: k, letter: ringBy === 'letter' || ringBy === 'artist' ? k : undefined, items: by.get(k)!.sort(inner) }))
  }, [all, query, ringBy, order, counts, genreDoc, c])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const index = useMemo(() => new Map(flat.map((t, i) => [t.id, i])), [flat])
  const ids = () => flat.map((t) => t.id)
  const context = { kind: 'library' as const, id: 'songs', label: 'Library · Songs' }
  const ctx = useContextState('library', 'songs')
  const play = (id: string) => playList(ids(), context, { start: index.get(id) ?? 0 })
  const total = flat.reduce((s, t) => s + (t.duration ?? 0), 0)
  const max = useMemo(() => Math.max(1, ...flat.map((t) => counts.get(t.id) ?? 0)), [flat, counts])
  const ringGroups = useMemo(() => groups.map((g) => ({ label: g.label, count: g.items.length, letter: !!g.letter })), [groups])
  const blips = useMemo(() => {
    const top = flat
      .map((t, i) => ({ i, n: counts.get(t.id) ?? 0, title: t.title }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 40)
    const m = top[0]?.n ?? 1
    return top.map((x) => ({ at: x.i + 0.5, w: x.n / m, title: x.title }))
  }, [flat, counts])
  const nowAt = now.id ? (index.get(now.id) ?? -1) : -1
  const letters = ringBy === 'letter' || ringBy === 'artist'
  const present = useMemo(() => new Set(letters ? groups.map((g) => g.label) : []), [groups, letters])
  const letterCounts = useMemo(() => new Map(groups.map((g) => [g.label, g.items.length])), [groups])
  const starts = useMemo(() => groups.map((_, k) => groups.slice(0, k).reduce((a, g) => a + g.items.length, 0)), [groups])
  const groupAt = (pos: number) => Math.max(0, starts.findIndex((s, k) => pos >= s && pos < s + groups[k].items.length))
  const activeLetter = letters && groups.length ? groups[groupAt(view[0])].label : null

  const playBtn = (
    <Button icon={ctx.playing ? 'pauseF' : 'playF'} disabled={!flat.length} className="snp-play" onClick={() => (ctx.active ? playerStore.toggle() : playList(ids(), context, { start: 0 }))}>
      {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play all'}
    </Button>
  )
  const shuffle = () => playList(ids(), context, { shuffle: true })

  const listEl = (
    <div className="snl snl-songs">
      {!phone && <SnHead cols={['#', null, 'Title', 'Artist', 'Album', 'Time', 'Plays']} />}
      <SnWindow
        groups={groups}
        rowH={phone ? 56 : 48}
        headH={phone ? 40 : 44}
        apiRef={win}
        topOffset={phone ? 150 : 120}
        onView={(a, b) => setView((v) => (v[0] === a && v[1] === b ? v : [a, b]))}
        renderHead={(g) => (
          <SnSection phone={phone} label={g.label} letter={g.letter} right={phone ? `${g.items.length}` : `${g.items.length.toLocaleString('en')} songs · ${fmtHoursMin(g.items.reduce((s, t) => s + (t.duration ?? 0), 0))}`} />
        )}
        renderRow={(t, i) => {
          const album = c.albums[t.albumId]
          const artist = (
            <a href={artistHref(t.artistId)} draggable={false}>
              {t.artist}
            </a>
          )
          return (
            <SnRow
              phone={phone}
              n={phone ? null : (i + 1).toLocaleString('en')}
              len={t.duration ?? 0}
              title={t.title}
              colA={artist}
              colB={
                album ? (
                  <a href={albumHref(album.id)} draggable={false}>
                    {album.title}
                  </a>
                ) : null
              }
              sub={artist}
              time={t.duration ? fmtClock(t.duration) : '—'}
              plays={counts.get(t.id) ?? 0}
              maxPlays={max}
              current={t.id === now.id}
              playing={now.playing}
              onPlay={() => play(t.id)}
              onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
              rowProps={phone ? undefined : (trackDrag(() => [t.id], `${t.title} · ${t.artist}`) as never)}
            />
          )
        }}
      />
      {!flat.length && <div className="snp-none">No songs match ‘{query.trim()}’.</div>}
    </div>
  )

  if (phone)
    return (
      <div className="sns-page is-phone">
        <div className="snp-sohead">
          <SongsRing groups={ringGroups} blips={[]} nowAt={-1} size={40} onJump={() => {}} view={view} mini />
          <div className="snp-sotext">
            <div className="snp-sotitle">Songs</div>
            <button
              type="button"
              className="snp-plab snp-cycle"
              onClick={() => libraryPrefs.set({ songOrder: order === 'az' ? 'plays' : order === 'plays' ? 'added' : 'az' })}
              aria-label="Change the order"
            >
              {flat.length.toLocaleString('en')} · {ORDER_LABEL[order]}
            </button>
          </div>
          <IconButton icon="search" label="Search" onClick={focusLibrarySearch} />
          <IconButton icon="shuffle" label="Shuffle all" onClick={shuffle} />
        </div>
        {listEl}
        {letters && (
          <HalfRingScrubber
            present={present}
            counts={letterCounts}
            active={activeLetter}
            onJump={(l) => {
              const want = LETTERS.slice(Math.max(0, LETTERS.indexOf(l))).find((x) => present.has(x)) ?? [...LETTERS].reverse().find((x) => present.has(x))
              if (!want) return null
              win.current?.jump(groups.findIndex((g) => g.label === want))
              return want
            }}
          />
        )}
      </div>
    )

  return (
    <div className="snp sns-page">
      <aside className="snp-side">
        <Crumbs fallback={libraryHref('all')} parts={[<a key="l" href={libraryHref('all')}>LIBRARY</a>, <span key="s">SONGS</span>]} />
        <div className="snp-head is-row">
          <h1 className="snp-title">Songs</h1>
          <span className="snp-meta">
            {flat.length.toLocaleString('en')} · {Math.round(total / 3600)} h
          </span>
        </div>
        <div className="snp-ring">
          <SongsRing groups={ringGroups} blips={blips} nowAt={nowAt} size={380} onJump={(k) => win.current?.jump(k)} view={view} />
        </div>
        <div className="snp-chips-w">
          <div className="sn-lab" style={{ color: 'var(--ink-secondary)' }}>
            Ring by
          </div>
          <div className="snp-chips">
            {(Object.keys(RING_LABEL) as SongRing[]).map((k) => (
              <button key={k} type="button" className={`snp-chip ${ringBy === k ? 'is-on' : ''}`} onClick={() => libraryPrefs.set({ songRing: k })}>
                {RING_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="sn-legend">
          <div className="sn-legend-row">
            <span className="sn-legend-sw">
              <i />
            </span>
            Arc · {letters ? 'a letter' : ringBy === 'genre' ? 'a genre' : 'a decade'}, sized by songs
          </div>
          <div className="sn-legend-row">
            <span className="sn-legend-sw">
              <i className="is-dot" />
            </span>
            Blip · one of your 40 most played
          </div>
          <div className="sn-legend-row">
            <span className="sn-legend-sw">
              <i className="is-win" />
            </span>
            Bright edge · rows on screen
          </div>
          <div className="sn-legend-row" style={{ color: 'var(--ink-secondary)', marginTop: 6 }}>
            Tap an arc to jump
          </div>
        </div>
      </aside>
      <section className="snp-main">
        <div className="snp-bar">
          {playBtn}
          <IconButton icon="shuffle" label="Shuffle" shape="square" className="snp-sq" onClick={shuffle} disabled={!flat.length} />
          <span className="snp-flex" />
          <label className="snp-search">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" aria-label="Search songs" />
          </label>
          {(Object.keys(ORDER_LABEL) as SongOrder[]).map((k) => (
            <button key={k} type="button" className={`snp-chip ${order === k ? 'is-on' : ''}`} onClick={() => libraryPrefs.set({ songOrder: k })}>
              {ORDER_LABEL[k]}
            </button>
          ))}
        </div>
        {listEl}
      </section>
    </div>
  )
}
