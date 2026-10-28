/**
 * Library (Material redesign, LibraryMaterial.dc.html):
 *
 *   Library · "21 albums · 15 artists · 3,912 songs"        [🔍 Search your library]  [Shuffle library]
 *   [✓ All 46] [Albums 21] [Artists 15] [Playlists 10] [Songs 3,912]      [Timeline | Grid]  ⇅ Recently added ▾
 *   ○ Added this week ─────────────────────────────── 10 items
 *   │ cards …
 *
 * All = albums, artists and playlists in one grid. Timeline groups by the sort (added → this week /
 * month / 3 months / earlier; A–Z / Artist → letters with an A–Z scrubber; Year → decades). Songs are
 * rows in surface cards (virtualised). Chip, sort and view are remembered (state/libraryPrefs.ts); the
 * chip is also in the URL (#/library/albums).
 *
 * Typing turns the page into results in place (pages/search/Search.tsx): the chips filter them, the bar
 * reads "10 results for ‘spi’". Clearing (✕, Esc, deleting the text) goes back to where you were.
 * Phone: the top bar's search button opens a search bar (back arrow · field) with Recent searches.
 *
 * Android app: "Offline only" narrows Albums / Artists / Songs (and All's albums / artists) to what plays
 * from the phone; without a connection the offline banner shows and unplayable albums dim.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Chip, IconButton, Button, EmptyState, OfflineBanner, Toggle, useToast } from '../../components/ui'
import { offlineIndex, useDownloads, useOnline, type OfflineIndex } from '../../state/downloads'
import { Icon, type IconName } from '../../design/icons'
import { actions } from '../../actions/actions'
import { libraryStats, tracksByAlbum, useLibrary, type Catalogue, type Track } from '../../state/library'
import { libraryPrefs, useLibraryPrefs, type ArtistSort, type LibraryView, type MixedSort } from '../../state/libraryPrefs'
import { usePlaylists } from '../../state/playlists'
import { LIBRARY_TABS, go, libraryHref, type LibraryTab } from '../../shell/routes'
import { ALBUM_SORTS, allAlbums, allTracks, artistsByName, byName, fmtN, sortAlbums, sortTracks, type AlbumSort, type ArtistInfo, type SongSort } from '../../state/views'
import { playList, useContextState } from './playback'
import { playerStore } from '../../state/player'
import { searchStore, useSearch, type SearchFilter } from '../../state/search'
import { useIsPhone, isTouch } from '../../state/viewport'
import { SearchResultsView } from '../search/Search'
import { firstResult, openTopResult, shownCount, useSearchResults } from '../search/results'
import { LibrarySearchField, RecentSearches } from './LibrarySearch'
import { forgetScrollBeforeFocus, noteScrollBeforeFocus, restoreBrowseScroll, setLibraryQuery } from './browseContext'
import { CardGroups, NewTile, Scrubber, SongGroups, albumItem, artistItem, groupItems, playlistItem, sortItems, type GroupBy, type LibItem } from './libgrid'
import './lib2.css'

const TAB_LABEL: Record<LibraryTab, string> = { all: 'All', artists: 'Artists', albums: 'Albums', playlists: 'Playlists', songs: 'Songs' }

export function Library({ tab: routeTab }: { tab: LibraryTab | null }) {
  const { data } = useLibrary()
  const prefs = useLibraryPrefs()
  const tab = routeTab ?? prefs.tab
  const phone = useIsPhone()
  const touch = isTouch()
  const toast = useToast()
  const { list: lists } = usePlaylists()

  useEffect(() => {
    if (routeTab && routeTab !== libraryPrefs.get().tab) libraryPrefs.set({ tab: routeTab })
  }, [routeTab])

  const dl = useDownloads()
  const online = useOnline()

  // ── search (Library + Search merge) ──
  const { query, filter, recent, focusTick } = useSearch()
  const [focused, setFocused] = useState(false)
  const [phSearch, setPhSearch] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const { results, suggestion } = useSearchResults(data, query)
  const typing = query.trim() !== ''
  const onQuery = (q: string) => setLibraryQuery(q, tab)
  const phoneSearching = phone && (phSearch || typing)

  // "/" / Ctrl+K / the top-bar search (state/search.ts focusLibrarySearch), also when it was pressed on another page
  const hasData = !!data
  useEffect(() => {
    if (!searchStore.takeFocus()) return
    if (phone) setPhSearch(true)
    noteScrollBeforeFocus(tab)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a focus request
  }, [focusTick, hasData])

  // the phone search bar mounts on demand: focus it once it's there
  useEffect(() => {
    if (phSearch && !typing) inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the bar opens
  }, [phSearch])

  // phone search bar replaces the top bar
  useEffect(() => {
    if (!phoneSearching) return
    document.documentElement.setAttribute('data-lib-search', '')
    return () => document.documentElement.removeAttribute('data-lib-search')
  }, [phoneSearching])

  // Clearing the query (✕, Esc, deleting the text) puts back the tab where it was scrolled
  const wasTyping = useRef(typing)
  useLayoutEffect(() => {
    if (wasTyping.current === typing) return
    wasTyping.current = typing
    if (!typing) restoreBrowseScroll(tab)
  }, [typing, tab])

  if (!data) return null
  const stats = libraryStats(data)
  // what plays from the phone (Android app); null in the browser
  const offline = dl.available ? offlineIndex(dl, data) : null
  const filterOffline = offline && prefs.offlineOnly ? offline : null
  const cut = !!offline && !online
  const empty = stats.tracks === 0
  const n = (v: number, one: string, many: string) => `${fmtN(v)} ${v === 1 ? one : many}`
  const headMeta = cut
    ? `${fmtN(offline.albums.size)} of ${n(stats.albums, 'album', 'albums')} playable offline`
    : `${n(stats.albums, 'album', 'albums')} · ${n(stats.artists, 'artist', 'artists')} · ${n(stats.tracks, 'song', 'songs')}`

  const counts: Record<LibraryTab, number> = typing && results
    ? { all: results.total, albums: results.albums.length, artists: results.artists.length, playlists: results.playlists.length, songs: results.tracks.length }
    : { all: stats.albums + stats.artists + lists.length, albums: stats.albums, artists: stats.artists, playlists: lists.length, songs: stats.tracks }

  const shuffleAll = () => {
    const ids = Object.keys(data.tracks)
    playList(ids, { kind: 'library', id: 'songs', label: 'Library · Songs' }, { shuffle: true })
    toast.show({ icon: 'shuffle', text: `Shuffling your library · ${fmtN(ids.length)} songs` })
  }
  const closePhoneSearch = () => {
    onQuery('')
    setPhSearch(false)
    inputRef.current?.blur()
  }
  const focusFirstResult = () => {
    const first = firstResult(resultsRef.current)
    first?.focus()
    return !!first
  }

  const field = (
    <LibrarySearchField
      ref={inputRef}
      query={query}
      focused={focused}
      touch={touch}
      phone={phone}
      onQuery={onQuery}
      onClear={() => {
        onQuery('')
        inputRef.current?.focus({ preventScroll: true })
      }}
      onFocused={(v) => {
        setFocused(v)
        if (v && phone) setPhSearch(true)
        if (!v) forgetScrollBeforeFocus()
      }}
      onEnter={() => openTopResult(results, query)}
      onDown={focusFirstResult}
      recent={!phone && focused && !query ? <RecentSearches recent={recent} onPick={onQuery} /> : null}
    />
  )

  const browseTab = tab
  const chip = typing ? filter : browseTab
  const pick = (t: LibraryTab) => {
    if (typing) searchStore.setFilter(t as SearchFilter)
    else go(libraryHref(t))
    document.getElementById('main')?.scrollTo({ top: 0 })
  }

  return (
    <div className={`lb ${phone ? 'is-phone' : ''}`}>
      {phone ? (
        phoneSearching && (
          <div className="lb-phsearch">
            <IconButton icon="back" label="Close search" size="lg" variant="strong" className="lb-phback" onClick={closePhoneSearch} />
            {field}
          </div>
        )
      ) : (
        <header className="lb-head">
          <div className="lb-head-text">
            <h1 className="lb-title">Library</h1>
            <div className="lb-meta">{headMeta}</div>
          </div>
          {!empty && field}
          <Button variant="filled" size="xl" className="shuffle-all lb-shuffle" onClick={shuffleAll} disabled={empty}>
            <Icon name="shuffle" />
            Shuffle library
          </Button>
        </header>
      )}

      {!empty && (
        <div className="lb-bar">
          <div className="lb-chips" role="tablist" aria-label={typing ? 'Show results' : 'Library view'}>
            {LIBRARY_TABS.map((t) => {
              const on = t === chip
              return (
                <Chip key={t} role="tab" selected={on} size={phone ? 'sm' : 'md'} count={phone ? undefined : fmtN(counts[t])} onClick={() => pick(t)}>
                  {TAB_LABEL[t]}
                </Chip>
              )
            })}
          </div>
          {typing ? (
            <div className="lb-bar-r lb-resl">{results ? `${fmtN(shownCount(results, filter))} ${shownCount(results, filter) === 1 ? 'result' : 'results'} for ‘${query.trim()}’` : ''}</div>
          ) : (
            !phoneSearching && <BrowseControls tab={browseTab} phone={phone} offline={offline} filter={filterOffline} count={counts[browseTab]} />
          )}
        </div>
      )}

      {cut && !typing && !phoneSearching && (
        <div className="lb-offline">
          <OfflineBanner />
        </div>
      )}

      {empty ? (
        <div className="placeholder">
          <EmptyState icon="library" title="Your library is empty." body="Run the importer on your PC (npm run import) to fill it." />
        </div>
      ) : typing ? (
        results && (
          <div ref={resultsRef}>
            <SearchResultsView c={data} r={results} filter={filter} suggestion={suggestion} query={query} onBackToField={() => inputRef.current?.focus()} onClear={() => onQuery('')} />
          </div>
        )
      ) : phoneSearching ? (
        <RecentSearches recent={recent} onPick={onQuery} phone />
      ) : browseTab === 'songs' ? (
        <SongsView c={data} filter={filterOffline} phone={phone} />
      ) : (
        <CardsView c={data} tab={browseTab} filter={filterOffline} phone={phone} />
      )}
    </div>
  )
}

/* ── Sort / view / offline controls ─────────────────── */

type SortOpt = { value: string; label: string }
const ALL_SORTS: SortOpt[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'name', label: 'A–Z' },
]
const ALBUM_SORT_OPTS: SortOpt[] = ALBUM_SORTS.map((o) => ({ value: o.value, label: o.value === 'title' ? 'A–Z' : o.value === 'year' ? 'Year' : o.label }))
const ARTIST_SORTS: SortOpt[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'name', label: 'A–Z' },
  { value: 'albums', label: 'Most albums' },
]
const SONG_SORTS: SortOpt[] = [
  { value: 'added', label: 'Recently added' },
  { value: 'title', label: 'A–Z' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'duration', label: 'Duration' },
]

function sortState(tab: LibraryTab, p: ReturnType<typeof libraryPrefs.get>): { value: string; opts: SortOpt[]; set: (v: string) => void } {
  switch (tab) {
    case 'all':
      return { value: p.allSort, opts: ALL_SORTS, set: (v) => libraryPrefs.set({ allSort: v as MixedSort }) }
    case 'albums':
      return { value: p.albumSort, opts: ALBUM_SORT_OPTS, set: (v) => libraryPrefs.set({ albumSort: v as AlbumSort }) }
    case 'artists':
      return { value: p.artistSort, opts: ARTIST_SORTS, set: (v) => libraryPrefs.set({ artistSort: v as ArtistSort }) }
    case 'playlists':
      return { value: p.playlistSort, opts: ALL_SORTS, set: (v) => libraryPrefs.set({ playlistSort: v as MixedSort }) }
    case 'songs':
      return { value: p.songSort, opts: SONG_SORTS, set: (v) => libraryPrefs.set({ songSort: v as SongSort, songDesc: false }) }
  }
}

const viewOf = (tab: LibraryTab, p: ReturnType<typeof libraryPrefs.get>): LibraryView => p.views[tab] ?? (tab === 'playlists' ? 'grid' : 'timeline')

function BrowseControls({ tab, phone, offline, filter, count }: { tab: LibraryTab; phone: boolean; offline: OfflineIndex | null; filter: OfflineIndex | null; count: number }) {
  const prefs = useLibraryPrefs()
  const s = sortState(tab, prefs)
  const view = viewOf(tab, prefs)
  const setView = (v: LibraryView) => libraryPrefs.set({ views: { ...prefs.views, [tab]: v } })
  const unit = tab === 'songs' ? ['song', 'songs'] : tab === 'albums' ? ['album', 'albums'] : tab === 'artists' ? ['artist', 'artists'] : tab === 'playlists' ? ['playlist', 'playlists'] : ['item', 'items']
  const views: { v: LibraryView; icon: IconName; label: string }[] = [
    { v: 'timeline', icon: 'timeline', label: 'Timeline' },
    { v: 'grid', icon: tab === 'songs' ? 'playlist' : 'grid', label: tab === 'songs' ? 'List' : 'Grid' },
  ]
  return (
    <div className="lb-bar-r">
      {offline && tab !== 'playlists' && (
        <label className={`lb-offl ${filter ? 'is-on' : ''}`}>
          <span className="lb-offl-l">Offline only</span>
          <Toggle checked={!!filter} onChange={(v) => libraryPrefs.set({ offlineOnly: v })} label="Show only music stored on this phone" />
        </label>
      )}
      {phone && <span className="lb-count">{`${fmtN(count)} ${count === 1 ? unit[0] : unit[1]}`}</span>}
      <div className="lb-views" role="group" aria-label="View">
        {views.map((x) => (
          <button
            key={x.v}
            type="button"
            className={`lb-view ${view === x.v ? 'is-on' : ''}`}
            aria-pressed={view === x.v}
            title={x.label}
            onPointerDown={(e) => {
              if (e.button === 0 && e.pointerType === 'mouse') setView(x.v)
            }}
            onClick={() => setView(x.v)}
          >
            <Icon name={x.icon} filled={view === x.v} />
            {!phone && x.label}
          </button>
        ))}
      </div>
      <SortMenu value={s.value} options={s.opts} onChange={s.set} desc={tab === 'songs' ? prefs.songDesc : undefined} onDesc={tab === 'songs' ? (d) => libraryPrefs.set({ songDesc: d }) : undefined} />
    </div>
  )
}

function SortMenu({ value, options, onChange, desc, onDesc }: { value: string; options: SortOpt[]; onChange: (v: string) => void; desc?: boolean; onDesc?: (d: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const label = options.find((o) => o.value === value)?.label ?? options[0].label
  return (
    <div className="lb-sort" ref={ref}>
      <button type="button" className={`lb-sort-btn ${open ? 'is-open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="sort" className="lb-sort-ic" />
        {label}
        <Icon name="chevD" className="lb-sort-ic" />
      </button>
      {open && (
        <div className="lb-sort-menu" role="menu">
          <div className="lb-sort-k">Sort by</div>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              className={`lb-sort-it ${o.value === value ? 'is-on' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              <Icon name="done" className="lb-sort-ck" />
              {o.label}
            </button>
          ))}
          {onDesc && (
            <>
              <div className="lb-sort-sep" />
              <button type="button" role="menuitemcheckbox" aria-checked={!!desc} className={`lb-sort-it ${desc ? 'is-on' : ''}`} onClick={() => onDesc(!desc)}>
                <Icon name="done" className="lb-sort-ck" />
                Reverse order
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Cards: All / Albums / Artists / Playlists ──────── */

function sortArtists(list: ArtistInfo[], sort: ArtistSort): ArtistInfo[] {
  if (sort === 'name') return list
  const out = list.slice()
  if (sort === 'albums') return out.sort((a, b) => b.albums.length - a.albums.length || b.tracks - a.tracks || byName(a.artist.name, b.artist.name))
  const latest = (i: ArtistInfo) => i.albums.reduce((m, a) => (a.addedAt > m ? a.addedAt : m), '')
  return out.sort((a, b) => latest(b).localeCompare(latest(a)) || byName(a.artist.name, b.artist.name))
}

function NothingOffline() {
  return (
    <div className="placeholder">
      <EmptyState
        icon="download"
        title="No music stored offline"
        body="Download an album, playlist or artist to play it without a connection."
        actions={
          <Button variant="secondary" onClick={() => libraryPrefs.set({ offlineOnly: false })}>
            Show everything
          </Button>
        }
      />
    </div>
  )
}

function CardsView({ c, tab, filter, phone }: { c: Catalogue; tab: Exclude<LibraryTab, 'songs'>; filter: OfflineIndex | null; phone: boolean }) {
  const prefs = useLibraryPrefs()
  const { list: lists, loaded } = usePlaylists()
  const view = viewOf(tab, prefs)

  const { items, by } = useMemo((): { items: LibItem[]; by: GroupBy } => {
    const albums = () => {
      const all = allAlbums(c)
      const list = filter ? all.filter((a) => filter.albums.has(a.id)) : all
      return list.map((a) => {
        if (!filter) return albumItem(a)
        const have = filter.albums.get(a.id) ?? 0
        const total = tracksByAlbum(c).get(a.id)?.length ?? a.trackCount ?? have
        return albumItem(a, have < total ? `${a.artist} · ${have}/${total} offline` : undefined)
      })
    }
    const artists = (list = artistsByName(c)) => (filter ? list.filter((a) => filter.artists.has(a.artist.id)) : list).map((i) => artistItem(i, filter ? `${filter.artists.get(i.artist.id) ?? 0} of ${i.albums.length} offline` : undefined))
    switch (tab) {
      case 'all':
        return { items: sortItems([...albums(), ...artists(), ...lists.map(playlistItem)], prefs.allSort), by: prefs.allSort === 'added' ? 'added' : 'name' }
      case 'albums': {
        const order = sortAlbums(allAlbums(c), prefs.albumSort)
        const pos = new Map(order.map((a, i) => [a.id, i]))
        const its = albums().sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
        const by: GroupBy = prefs.albumSort === 'added' ? 'added' : prefs.albumSort === 'title' ? 'name' : prefs.albumSort === 'artist' ? 'artist' : 'year'
        return { items: its, by }
      }
      case 'artists':
        return { items: artists(sortArtists(artistsByName(c), prefs.artistSort)), by: prefs.artistSort === 'added' ? 'added' : prefs.artistSort === 'name' ? 'name' : null }
      case 'playlists':
        return { items: sortItems(lists.map(playlistItem), prefs.playlistSort), by: prefs.playlistSort === 'added' ? 'added' : 'name' }
    }
  }, [c, tab, filter, lists, prefs.allSort, prefs.albumSort, prefs.artistSort, prefs.playlistSort])

  const groups = useMemo(() => groupItems(items, by, (i) => i), [items, by])
  const letters = by === 'name' || by === 'artist'
  const present = useMemo(() => new Set(letters ? groups.map((g) => g.label) : []), [groups, letters])

  if (tab === 'playlists' && !loaded) return null
  if (filter && tab !== 'playlists' && items.length === 0) return <NothingOffline />
  if (tab === 'playlists' && !lists.length)
    return (
      <div className="placeholder">
        <EmptyState
          icon="playlist"
          title="No playlists yet."
          body={phone ? 'Make one here, or long-press any song and choose Add to playlist.' : 'Make one here, or right-click any song or album and choose Add to playlist.'}
          actions={
            <>
              <Button icon="plus" onClick={() => actions_newPlaylist()}>
                New playlist
              </Button>
              <Button variant="secondary" icon="smart" onClick={() => actions_smart()}>
                Smart playlist
              </Button>
            </>
          }
        />
      </div>
    )
  const unit: [string, string] = tab === 'albums' ? ['album', 'albums'] : tab === 'artists' ? ['artist', 'artists'] : tab === 'playlists' ? ['playlist', 'playlists'] : ['item', 'items']
  return (
    <div className={letters ? 'lb-has-scrub' : undefined}>
      <CardGroups
        c={c}
        groups={groups}
        timeline={view === 'timeline'}
        phone={phone}
        unit={unit}
        opts={{ showType: tab === 'all', withYear: tab === 'albums' }}
        lead={
          tab === 'playlists'
            ? (S) => (
                <>
                  <NewTile size={S} />
                  <NewTile size={S} smart />
                </>
              )
            : undefined
        }
      />
      {letters && <Scrubber present={present} />}
    </div>
  )
}

const actions_newPlaylist = () => actions.newPlaylist([], '', true)
const actions_smart = () => actions.smartPlaylist()

/* ── Songs ──────────────────────────────────────────── */

function SongsView({ c, filter, phone }: { c: Catalogue; filter: OfflineIndex | null; phone: boolean }) {
  const prefs = useLibraryPrefs()
  const { songSort, songDesc } = prefs
  const view = viewOf('songs', prefs)
  const tracks = useMemo(() => {
    const list = sortTracks(c, allTracks(c), songSort, songDesc)
    return filter ? list.filter((t) => filter.tracks.has(t.id)) : list
  }, [c, songSort, songDesc, filter])
  const by: GroupBy = songSort === 'added' ? 'added' : songSort === 'title' ? 'name' : songSort === 'artist' ? 'artist' : null
  const groups = useMemo(() => groupItems<Track>(tracks, by, (t) => ({ title: t.title, artist: t.artist, added: Date.parse(t.addedAt ?? '') || 0, year: null })), [tracks, by])
  const index = useMemo(() => new Map(tracks.map((t, i) => [t.id, i])), [tracks])
  const ctx = useContextState('library', filter ? 'songs-offline' : 'songs')
  const context = filter ? { kind: 'library' as const, id: 'songs-offline', label: 'Library · Songs offline' } : { kind: 'library' as const, id: 'songs', label: 'Library · Songs' }
  const ids = () => tracks.map((t) => t.id)
  const play = (id: string) => playList(ids(), context, { start: index.get(id) ?? 0 })
  const letters = (by === 'name' || by === 'artist') && view === 'timeline'
  const present = useMemo(() => new Set(letters ? groups.map((g) => g.label) : []), [groups, letters])

  if (filter && tracks.length === 0) return <NothingOffline />
  return (
    <div className={letters ? 'lb-has-scrub' : undefined}>
      <div className="lb-actions">
        <Button variant="tonal" disabled={!tracks.length} onClick={() => (ctx.active ? playerStore.toggle() : playList(ids(), context, { start: 0 }))}>
          <Icon name={ctx.playing ? 'pauseF' : 'playF'} />
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
        </Button>
        <Button variant="outlined-ink" disabled={!tracks.length} onClick={() => playList(ids(), context, { shuffle: true })}>
          <Icon name="shuffle" />
          Shuffle
        </Button>
      </div>
      <SongGroups c={c} groups={groups} timeline={view === 'timeline'} phone={phone} onPlay={play} />
      {letters && <Scrubber present={present} />}
    </div>
  )
}

