/**
 * Library → Songs (Nov 2026 list redesign, canvas "Library → Songs"): under the Library chips, a bar
 * with Play all / Shuffle and the song count, then the order (A–Z / Plays / Added), the grouping
 * (Letter / Artist / Genre / Year) and a filter; the songs grouped with a head per group
 * ("A ——— 214 songs · 12 h"), windowed for big libraries. Letter groups get the A–Z strip on the
 * right edge (desktop and phone).
 */
import { useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { LikeButton } from '../../components/LikeButton'
import { ListHead, ListSection, ListWindow, RowCover, SongRow, type ListGroup, type ListWindowApi } from '../../components/list/SongList'
import { fmtClock, fmtHoursMin, playsLabel, usePlayCounts } from '../../components/list/listUtils'
import { albumHref } from '../../shell/routes'
import { albumGenresOf, useGenres } from '../../state/genres'
import type { Catalogue, Track } from '../../state/library'
import { libraryPrefs, useLibraryPrefs, type SongOrder, type SongRing } from '../../state/libraryPrefs'
import { useLikedIndex } from '../../state/likes'
import { playerStore } from '../../state/player'
import { LETTERS, Scrubber, letterOf } from './libgrid'
import { playList, useContextState, useNowPlaying } from './playback'
import { ArtistLinks } from '../../components/ArtistPicker'

const GROUP_LABEL: Record<SongRing, string> = { letter: 'Title', artist: 'Artist', genre: 'Genre', year: 'Year' }
const ORDER_LABEL: Record<SongOrder, string> = { az: 'A–Z', plays: 'Plays', added: 'Added' }
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export function SongsList({ c, tracks: all, phone }: { c: Catalogue; tracks: Track[]; phone: boolean }) {
  const prefs = useLibraryPrefs()
  const groupBy = prefs.songRing
  const order = prefs.songOrder
  const counts = usePlayCounts()
  const liked = useLikedIndex()
  const { doc: genreDoc } = useGenres()
  const now = useNowPlaying()
  const [query, setQuery] = useState('')
  const [view, setView] = useState(0)
  const win = useRef<ListWindowApi | null>(null)

  const groups: ListGroup<Track>[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? all.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q)) : all
    const keyOf = (t: Track): string => {
      if (groupBy === 'letter') return letterOf(t.title)
      if (groupBy === 'artist') return letterOf(t.artist)
      if (groupBy === 'genre') return albumGenresOf(genreDoc, c.albums[t.albumId]).genres[0] ?? 'Unknown genre'
      const y = c.albums[t.albumId]?.year
      return y ? `${Math.floor(y / 10) * 10}s` : 'Unknown year'
    }
    const added = (t: Track) => Date.parse(t.addedAt ?? '') || 0
    const inner = (a: Track, b: Track) =>
      order === 'plays'
        ? (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || collator.compare(a.title, b.title)
        : order === 'added'
          ? added(b) - added(a) || collator.compare(a.title, b.title)
          : groupBy === 'artist'
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
      if (groupBy === 'letter' || groupBy === 'artist') return LETTERS.indexOf(a) - LETTERS.indexOf(b)
      if (groupBy === 'year') return a.startsWith('Unknown') ? 1 : b.startsWith('Unknown') ? -1 : b.localeCompare(a)
      return a.startsWith('Unknown') ? 1 : b.startsWith('Unknown') ? -1 : collator.compare(a, b)
    })
    return keys.map((k) => ({ key: k, label: k, letter: groupBy === 'letter' || groupBy === 'artist' ? k : undefined, items: by.get(k)!.sort(inner) }))
  }, [all, query, groupBy, order, counts, genreDoc, c])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const index = useMemo(() => new Map(flat.map((t, i) => [t.id, i])), [flat])
  const ids = () => flat.map((t) => t.id)
  const context = { kind: 'library' as const, id: 'songs', label: 'Library · Songs' }
  const ctx = useContextState('library', 'songs')
  const play = (id: string) => playList(ids(), context, { start: index.get(id) ?? 0 })
  const total = flat.reduce((s, t) => s + (t.duration ?? 0), 0)
  const letters = groupBy === 'letter' || groupBy === 'artist'
  const present = useMemo(() => new Set(letters ? groups.map((g) => g.label) : []), [groups, letters])
  const starts = useMemo(() => groups.map((_, k) => groups.slice(0, k).reduce((a, g) => a + g.items.length, 0)), [groups])
  const groupAt = (pos: number) => Math.max(0, starts.findIndex((s, k) => pos >= s && pos < s + groups[k].items.length))
  const activeLetter = letters && groups.length ? groups[groupAt(view)].label : null
  const shuffle = () => playList(ids(), context, { shuffle: true })

  const chips = (
    <>
      {(Object.keys(ORDER_LABEL) as SongOrder[]).map((k) => (
        <button key={k} type="button" className={`sl-chip ${order === k ? 'is-on' : ''}`} aria-pressed={order === k} onClick={() => libraryPrefs.set({ songOrder: k })}>
          {ORDER_LABEL[k]}
        </button>
      ))}
      <span className="sl-chip-lab">Group</span>
      {(Object.keys(GROUP_LABEL) as SongRing[]).map((k) => (
        <button key={k} type="button" className={`sl-chip ${groupBy === k ? 'is-on' : ''}`} aria-pressed={groupBy === k} onClick={() => libraryPrefs.set({ songRing: k })}>
          {GROUP_LABEL[k]}
        </button>
      ))}
    </>
  )

  return (
    <div className={`lp sl-songs-page ${phone ? 'is-phone' : ''} ${letters ? 'lb-has-scrub' : ''}`}>
      <div className={`lh-btns ${phone ? 'is-phone' : ''}`}>
        <Button icon={ctx.playing ? 'pauseF' : 'playF'} disabled={!flat.length} onClick={() => (ctx.active ? playerStore.toggle() : playList(ids(), context, { start: 0 }))}>
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play all'}
        </Button>
        {phone ? (
          <IconButton icon="shuffle" label="Shuffle" shape="square" className="lh-sq" onClick={shuffle} disabled={!flat.length} />
        ) : (
          <Button variant="secondary" icon="shuffle" onClick={shuffle} disabled={!flat.length}>
            Shuffle
          </Button>
        )}
        {!phone && (
          <span className="lh-sorted" style={{ marginLeft: 8 }}>
            {flat.length.toLocaleString('en')} songs · {fmtHoursMin(total)}
          </span>
        )}
      </div>
      <div className="sl-tools">
        {chips}
        {!phone && (
          <>
            <span className="lh-flex" />
            <label className="sl-search">
              <Icon name="search" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter songs" aria-label="Filter songs" />
            </label>
          </>
        )}
      </div>
      <div className="sl sl-songs">
        {!phone && <ListHead cols={[null, 'Title', 'Album', 'Plays', null, 'Time', null]} />}
        <ListWindow
          groups={groups}
          rowH={phone ? 64 : 56}
          headH={44}
          apiRef={win}
          topOffset={phone ? 150 : 120}
          onView={(a) => setView((v) => (v === a ? v : a))}
          renderHead={(g) => (
            <ListSection phone={phone} label={g.label} letter={g.letter} right={phone ? `${g.items.length.toLocaleString('en')}` : `${g.items.length.toLocaleString('en')} songs · ${fmtHoursMin(g.items.reduce((s, t) => s + (t.duration ?? 0), 0))}`} />
          )}
          renderRow={(t) => {
            const album = c.albums[t.albumId]
            const artist = <ArtistLinks track={t} />
            const albumLink = album ? (
              <a href={albumHref(album.id)} draggable={false}>
                {album.title}
              </a>
            ) : null
            return (
              <SongRow
                phone={phone}
                art={<RowCover fileId={album?.cover} />}
                title={t.title}
                sub={
                  phone ? (
                    <>
                      {artist}
                      {album ? ' · ' : ''}
                      {albumLink}
                    </>
                  ) : (
                    artist
                  )
                }
                liked={liked.ids.has(t.id)}
                colA={albumLink}
                colB={playsLabel(counts.get(t.id) ?? 0)}
                like={<LikeButton trackId={t.id} size="xs" hover />}
                time={t.duration ? fmtClock(t.duration) : '—'}
                current={t.id === now.id}
                playing={now.playing}
                onPlay={() => play(t.id)}
                onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                rowProps={phone ? undefined : (trackDrag(() => [t.id], `${t.title} · ${t.artist}`) as never)}
              />
            )
          }}
        />
        {!flat.length && <div className="lp-none">No songs match ‘{query.trim()}’.</div>}
      </div>
      {letters && (
        <Scrubber
          present={present}
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
}
