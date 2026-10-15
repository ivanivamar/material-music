/**
 * Library (handoff 06 Desktop Library): header with counts, Artists / Albums / Playlists / Songs chips,
 * sort row, then the tab's view. The tab lives in the URL (#/library/albums) and is remembered.
 */
import { isTouch } from '../../state/viewport'
import { useEffect, useMemo, useRef } from 'react'
import { Button, Chip, EmptyState, Eq } from '../../components/ui'
import { Icon } from '../../design/icons'
import { libraryStats, useLibrary, type Catalogue, type Track } from '../../state/library'
import { libraryPrefs, useLibraryPrefs, type ArtistSort } from '../../state/libraryPrefs'
import { LIBRARY_TABS, albumHref, artistHref, go, libraryHref, type LibraryTab } from '../../shell/routes'
import {
  ALBUM_SORTS,
  allAlbums,
  allTracks,
  artistsByName,
  byName,
  fmtAdded,
  fmtN,
  fmtTotal,
  initialOf,
  plural,
  sortAlbums,
  sortTracks,
  type ArtistInfo,
  type SongSort,
} from '../../state/views'
import { PageHeader } from '../PageHeader'
import { PlaylistsView } from '../playlists/PlaylistsView'
import { ArtistAvatar, LibAlbumCard, SortMenu } from './common'
import { playList, useContextState, useNowPlaying, usePlayingAlbumId } from './playback'
import { playerStore } from '../../state/player'
import { ROW_H, useWindow } from './useWindow'
import { actions, trackDrag } from '../../actions/actions'
import './library.css'

const TAB_LABEL: Record<LibraryTab, string> = { artists: 'Artists', albums: 'Albums', playlists: 'Playlists', songs: 'Songs' }

export function Library({ tab: routeTab }: { tab: LibraryTab | null }) {
  const { data } = useLibrary()
  const prefs = useLibraryPrefs()
  const tab = routeTab ?? prefs.tab

  useEffect(() => {
    if (routeTab && routeTab !== libraryPrefs.get().tab) libraryPrefs.set({ tab: routeTab })
  }, [routeTab])

  if (!data) return null
  const stats = libraryStats(data)

  return (
    <>
      <PageHeader
        meta={`${plural(stats.albums, 'ALBUM')} · ${plural(stats.artists, 'ARTIST')} · ${plural(stats.tracks, 'SONG')}`}
        title="Library"
        tools={
          <div className="lib-tabs" role="tablist" aria-label="Library view">
            {LIBRARY_TABS.map((t) => (
              <Chip key={t} selected={t === tab} onClick={() => go(libraryHref(t))}>
                {TAB_LABEL[t]}
              </Chip>
            ))}
          </div>
        }
      />
      {stats.tracks === 0 ? (
        <div className="placeholder">
          <EmptyState icon="library" title="Your library is empty." body="Run the importer on your PC (npm run import) to fill it." />
        </div>
      ) : tab === 'albums' ? (
        <AlbumsView c={data} />
      ) : tab === 'artists' ? (
        <ArtistsView c={data} />
      ) : tab === 'playlists' ? (
        <PlaylistsView c={data} />
      ) : (
        <SongsView c={data} />
      )}
    </>
  )
}

/* ── Albums ───────────────────────────────────────── */

function AlbumsView({ c }: { c: Catalogue }) {
  const { albumSort } = useLibraryPrefs()
  const albums = useMemo(() => sortAlbums(allAlbums(c), albumSort), [c, albumSort])
  const playingAlbum = usePlayingAlbumId(c)
  return (
    <>
      <div className="lib-bar">
        <SortMenu value={albumSort} options={ALBUM_SORTS} onChange={(v) => libraryPrefs.set({ albumSort: v })} />
        <span className="lib-bar-line" />
        <span className="lib-bar-meta">{plural(albums.length, 'ALBUM')}</span>
      </div>
      <div className="lib-grid">
        {albums.map((a) => (
          <LibAlbumCard
            key={a.id}
            c={c}
            album={a}
            subtitle={albumSort === 'year' && a.year ? `${a.artist} · ${a.year}` : a.artist}
            playingAlbumId={playingAlbum}
          />
        ))}
      </div>
    </>
  )
}

/* ── Artists ──────────────────────────────────────── */

const ARTIST_SORTS: { value: ArtistSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Recently added' },
  { value: 'albums', label: 'Most albums' },
]

function sortArtists(list: ArtistInfo[], sort: ArtistSort): ArtistInfo[] {
  if (sort === 'name') return list
  const out = list.slice()
  if (sort === 'albums') return out.sort((a, b) => b.albums.length - a.albums.length || b.tracks - a.tracks || byName(a.artist.name, b.artist.name))
  const latest = (i: ArtistInfo) => i.albums.reduce((m, a) => (a.addedAt > m ? a.addedAt : m), '')
  return out.sort((a, b) => latest(b).localeCompare(latest(a)) || byName(a.artist.name, b.artist.name))
}

function ArtistsView({ c }: { c: Catalogue }) {
  const { artistSort } = useLibraryPrefs()
  const artists = useMemo(() => sortArtists(artistsByName(c), artistSort), [c, artistSort])
  const groups = useMemo(() => {
    if (artistSort !== 'name') return [{ letter: null as string | null, items: artists }]
    const out: { letter: string | null; items: ArtistInfo[] }[] = []
    for (const a of artists) {
      const l = initialOf(a.artist.name)
      if (out.at(-1)?.letter !== l) out.push({ letter: l, items: [] })
      out.at(-1)!.items.push(a)
    }
    return out
  }, [artists, artistSort])

  return (
    <>
      <div className="lib-bar">
        <SortMenu value={artistSort} options={ARTIST_SORTS} onChange={(v) => libraryPrefs.set({ artistSort: v })} />
        <span className="lib-bar-line" />
        {artistSort === 'name' && groups.length > 6 && (
          <nav className="az" aria-label="Jump to letter">
            {groups.map((g) => (
              <a
                key={g.letter}
                href={`#az-${g.letter}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(`az-${g.letter}`)?.scrollIntoView({ block: 'start' })
                }}
              >
                {g.letter}
              </a>
            ))}
          </nav>
        )}
        <span className="lib-bar-meta">{plural(artists.length, 'ARTIST')}</span>
      </div>
      <div className="art-groups">
        {groups.map((g) => (
          <section key={g.letter ?? 'all'} className="art-group" id={g.letter ? `az-${g.letter}` : undefined}>
            {g.letter && <div className="art-letter">{g.letter}</div>}
            <div className="art-grid">
              {g.items.map((i) => (
                <a key={i.artist.id} className="art-tile" href={artistHref(i.artist.id)} onContextMenu={(e) => actions.menu({ kind: 'artist', artistId: i.artist.id }, e)}>
                  <ArtistAvatar artist={i.artist} size="100%" className="art-tile-img" />
                  <span className="art-tile-name">{i.artist.name}</span>
                  <span className="art-tile-meta">
                    {plural(i.albums.length, 'RELEASE')} · {plural(i.tracks, 'TRACK')}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

/* ── Songs (virtualised: the whole catalogue can be thousands of rows) ── */

const SONG_SORTS: { value: SongSort; label: string }[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'duration', label: 'Duration' },
]


function SongsView({ c }: { c: Catalogue }) {
  const { songSort, songDesc } = useLibraryPrefs()
  const tracks = useMemo(() => sortTracks(c, allTracks(c), songSort, songDesc), [c, songSort, songDesc])
  const listRef = useRef<HTMLDivElement>(null)
  const {
    range: [from, to],
    stuck,
  } = useWindow(listRef, tracks.length)
  const now = useNowPlaying()
  const ctx = useContextState('library', 'songs')
  const seconds = useMemo(() => tracks.reduce((s, t) => s + (t.duration ?? 0), 0), [tracks])

  const sortBy = (s: SongSort) => libraryPrefs.set(s === songSort ? { songDesc: !songDesc } : { songSort: s, songDesc: false })
  const context = { kind: 'library' as const, id: 'songs', label: 'Library · Songs' }
  const ids = () => tracks.map((t) => t.id)
  const play = (i: number) => playList(ids(), context, { start: i })
  // Play: from the top of the list in its current sort (Pause / Resume while it's the playing context)
  const onPlay = () => (ctx.active ? playerStore.toggle() : play(0))
  const onShuffle = () => playList(ids(), context, { shuffle: true })
  const head = (s: SongSort, label: string, cls = '') => (
    <button type="button" className={`songs-h ${cls} ${songSort === s ? 'is-on' : ''}`} onClick={() => sortBy(s)}>
      {label}
      {songSort === s && <Icon name={songDesc ? 'chevU' : 'chevD'} />}
    </button>
  )

  return (
    <>
      <div className="actions lib-actions">
        <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!tracks.length} className="actions-play">
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
        </Button>
        <Button variant="secondary" icon="shuffle" onClick={onShuffle} disabled={!tracks.length}>
          Shuffle
        </Button>
      </div>
      <div className="lib-bar">
        <SortMenu value={songSort} options={SONG_SORTS} onChange={(v) => libraryPrefs.set({ songSort: v, songDesc: false })} />
        <span className="lib-bar-line" />
        <span className="lib-bar-meta">
          {plural(tracks.length, 'SONG')} · {fmtTotal(seconds)}
        </span>
      </div>
      <div className="songs" role="table" aria-rowcount={tracks.length}>
        <div className={`songs-head ${stuck ? 'is-stuck' : ''}`} role="row">
          <span className="songs-h songs-h-n">#</span>
          {head('title', 'TITLE')}
          {head('album', 'ALBUM')}
          {head('added', 'ADDED', 'songs-h-r')}
          {head('duration', 'TIME', 'songs-h-r')}
        </div>
        <div ref={listRef} className="songs-body" style={{ height: tracks.length * ROW_H }}>
          {tracks.slice(from, to).map((t, k) => {
            const i = from + k
            return (
              <SongRow
                key={t.id}
                c={c}
                t={t}
                n={i + 1}
                top={i * ROW_H}
                playing={now.playing && now.id === t.id}
                current={now.id === t.id}
                onPlay={() => play(i)}
              />
            )
          })}
        </div>
      </div>
    </>
  )
}

function SongRow({ c, t, n, top, playing, current, onPlay }: { c: Catalogue; t: Track; n: number; top: number; playing: boolean; current: boolean; onPlay: () => void }) {
  const album = c.albums[t.albumId]
  return (
    <div
      className={`trow songs-row ${current ? 'is-playing' : ''}`}
      style={{ transform: `translateY(${top}px)` }}
      onContextMenu={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
      {...trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (isTouch() && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      role="row"
    >
      <div className="trow-num">
        {playing ? <Eq /> : <span className="trow-n">{fmtN(n)}</span>}
        <button type="button" className="trow-play" onClick={onPlay} aria-label={`Play ${t.title}`}>
          <Icon name="playF" />
        </button>
      </div>
      <div className="trow-text">
        <div className="trow-title">{t.title}</div>
        <div className="trow-sub">
          <a className="ln" href={artistHref(t.artistId)} onClick={(e) => e.stopPropagation()}>
            {t.artist}
          </a>
        </div>
      </div>
      <div className="songs-album">
        {album && (
          <a className="ln" href={albumHref(album.id)}>
            {album.title}
          </a>
        )}
      </div>
      <div className="trow-label">{fmtAdded(t.addedAt)}</div>
      <div className="trow-dur">{t.duration ? fmtTotal(t.duration) : '—'}</div>
    </div>
  )
}
