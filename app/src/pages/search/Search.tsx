/**
 * Search (handoff 06–07 Desktop Search "instant, grouped" + 11 "Search · no match").
 *
 * Instant over the cached catalogue (state/search.ts). Field with live "N RESULTS · 4 MS",
 * All / Artists / Albums / Songs chips, then: Top result + Songs, Albums, Artists (All), or the
 * full list for one kind. Matched query text glows. No match → "Did you mean …".
 * Empty field → recent searches.
 *
 * Keys: / or Ctrl+K anywhere focuses the field (AppShell) · Enter opens the top result ·
 * Esc clears · ↓ / ↑ move through the results · Enter on a song plays it.
 */
import { useDeferredValue, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button, Chip, EmptyState, Eq, PlayButton } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useLazyCover } from '../../lib/covers'
import { useLibrary, type Album, type Catalogue, type Track } from '../../state/library'
import { playerStore } from '../../state/player'
import { highlight, search, searchStore, suggest, useSearch, type SearchFilter, type SearchResults, type TopHit } from '../../state/search'
import { albumHref, artistHref, go } from '../../shell/routes'
import { albumInfos, artistInfos, fmtN, fmtTotal, plural, RELEASE_LABEL } from '../../state/views'
import { isTouch } from '../../state/viewport'
import { ArtistAvatar, LibAlbumCard, SectionHead } from '../library/common'
import { useWindow } from '../library/useWindow'
import { albumTrackIds, artistTrackIds, playList, useContextState, useNowPlaying, usePlayingAlbumId } from '../library/playback'
import '../library/library.css'
import './search.css'

const FILTERS: { value: SearchFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artists', label: 'Artists' },
  { value: 'albums', label: 'Albums' },
  { value: 'songs', label: 'Songs' },
]

/** Focusable results for ↑ / ↓ (album cards come from the shared AlbumCard). */
const NAV = '[data-nav], .acard'

const pad2 = (n: number) => (n < 100 ? String(n).padStart(2, '0') : fmtN(n))

/** Text with the matched parts glowing. */
function Hl({ text, tokens, className = 'hl' }: { text: string; tokens: string[]; className?: string }) {
  return (
    <>
      {highlight(text, tokens).map((s, i) =>
        s.hit ? (
          <span key={i} className={className}>
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

export function Search() {
  const { data } = useLibrary()
  const { query, filter, recent, focusTick } = useSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Typing stays responsive on big libraries: results follow a frame behind if needed.
  const deferred = useDeferredValue(query)
  const results = useMemo(() => (data && deferred.trim() ? search(data, deferred) : null), [data, deferred])
  const suggestion = useMemo(() => (data && results && results.total === 0 ? suggest(data, deferred) : null), [data, results, deferred])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusTick])

  if (!data) return null
  const remember = () => searchStore.remember(query)

  const openTop = () => {
    const top = results?.top
    if (!top) return
    remember()
    if (top.kind === 'artist') go(artistHref(top.item.id))
    else if (top.kind === 'album') go(albumHref(top.item.id))
    else playTracks(results.tracks.map((h) => h.item.id), 0, query)
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      openTop()
    } else if (e.key === 'Escape') {
      if (query) {
        e.preventDefault()
        searchStore.setQuery('')
      } else inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      const first = resultsRef.current?.querySelector<HTMLElement>(NAV)
      if (first) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // ↑ / ↓ between results (rows, cards, tiles); ↑ from the first goes back to the field.
  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>(NAV) ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    e.preventDefault()
    const next = at + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) inputRef.current?.focus()
    else items[Math.min(next, items.length - 1)]?.focus()
  }

  const shownCount = results ? (filter === 'artists' ? results.artists.length : filter === 'albums' ? results.albums.length : filter === 'songs' ? results.tracks.length : results.total) : 0

  return (
    <div className="srch">
      <h1 className="sr-only">Search</h1>
      <div className="srch-field">
        <span className="srch-ic" aria-hidden>
          <Icon name="search" />
        </span>
        <input
          ref={inputRef}
          className="srch-input"
          type="search"
          value={query}
          placeholder="Artists, albums, songs"
          aria-label="Search your library"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => searchStore.setQuery(e.target.value)}
          onKeyDown={onInputKey}
        />
        {results && (
          <span className="srch-meta" aria-live="polite">
            {plural(shownCount, 'RESULT')} · {results.ms < 1 ? '<1' : Math.round(results.ms)} MS
          </span>
        )}
        {query && (
          <button
            type="button"
            className="srch-clear"
            aria-label="Clear search"
            onClick={() => {
              searchStore.setQuery('')
              inputRef.current?.focus()
            }}
          >
            <Icon name="x" />
          </button>
        )}
      </div>

      <div className="srch-chips" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => searchStore.setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="srch-results" ref={resultsRef} onKeyDown={onResultsKey}>
        {!results ? (
          <Recent recent={recent} />
        ) : results.total === 0 ? (
          <NoMatch query={deferred.trim()} suggestion={suggestion} />
        ) : filter === 'all' ? (
          <AllView c={data} r={results} remember={remember} />
        ) : filter === 'artists' ? (
          <ArtistsList r={results} remember={remember} />
        ) : filter === 'albums' ? (
          <AlbumsList c={data} r={results} remember={remember} />
        ) : (
          <SongsList c={data} r={results} />
        )}
      </div>
    </div>
  )
}

/* ── Empty field: recent searches ─────────────────── */

function Recent({ recent }: { recent: string[] }) {
  if (!recent.length) {
    return (
      <div className="placeholder srch-empty">
        <EmptyState icon="search" title="Search your library" body="Artists, albums and songs, matched as you type." />
        <div className="srch-hint">
          <kbd>/</kbd> OR <kbd>CTRL K</kbd> TO SEARCH FROM ANYWHERE
        </div>
      </div>
    )
  }
  return (
    <section className="srch-sect">
      <SectionHead
        label="RECENT SEARCHES"
        right={
          <button type="button" className="srch-more" onClick={() => searchStore.clearRecent()}>
            CLEAR
          </button>
        }
      />
      <ul className="srch-recent">
        {recent.map((q) => (
          <li key={q} className="srch-recent-row">
            <button type="button" className="srch-recent-q" data-nav onClick={() => searchStore.setQuery(q)}>
              <span className="srch-recent-ic" aria-hidden>
                <Icon name="clock" />
              </span>
              {q}
            </button>
            <button type="button" className="ibtn ibtn-sm ibtn-bare srch-recent-x" aria-label={`Remove “${q}”`} onClick={() => searchStore.forget(q)}>
              <Icon name="x" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── No match ──────────────────────────────────────── */

function NoMatch({ query, suggestion }: { query: string; suggestion: string | null }) {
  return (
    <div className="placeholder">
      <EmptyState
        icon="search"
        title={`No results for “${query}”`}
        body={
          suggestion ? (
            <>
              Did you mean <span className="hl">{suggestion}</span>?
            </>
          ) : (
            'Check the spelling, or try fewer words.'
          )
        }
        actions={
          suggestion && (
            <Button variant="secondary" icon="search" onClick={() => searchStore.setQuery(suggestion)}>
              Search {suggestion}
            </Button>
          )
        }
      />
    </div>
  )
}

/* ── All: top result + songs, albums, artists ─────── */

const ALL_SONGS = 4
const ALL_CARDS = 12

function AllView({ c, r, remember }: { c: Catalogue; r: SearchResults; remember: () => void }) {
  const playingAlbum = usePlayingAlbumId(c)
  const songs = r.tracks.slice(0, ALL_SONGS)
  const albums = r.albums.slice(0, ALL_CARDS)
  // the top artist already has the big card; list the others
  const artists = r.artists.filter((h) => !(r.top?.kind === 'artist' && r.top.item.id === h.item.id)).slice(0, ALL_CARDS)
  const more = (f: SearchFilter, n: number, shown: number) =>
    n > shown ? (
      <button type="button" className="srch-more" onClick={() => searchStore.setFilter(f)}>
        SHOW ALL {fmtN(n)}
      </button>
    ) : (
      pad2(n)
    )

  return (
    <div className="srch-all">
      <div className={`srch-lead ${songs.length ? '' : 'is-solo'}`}>
        {r.top && (
          <section className="srch-sect">
            <SectionHead label="TOP RESULT" />
            <TopCard c={c} top={r.top} r={r} remember={remember} />
          </section>
        )}
        {songs.length > 0 && (
          <section className="srch-sect">
            <SectionHead label="SONGS" right={more('songs', r.tracks.length, songs.length)} />
            <div className="srow-list">
              {songs.map((h, i) => (
                <SongRow key={h.item.id} c={c} t={h.item} tokens={r.tokens} onPlay={() => playTracks(r.tracks.map((x) => x.item.id), i, r.query)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {albums.length > 0 && (
        <section className="srch-sect">
          <SectionHead label="ALBUMS" right={more('albums', r.albums.length, albums.length)} />
          <div className="lib-grid lib-grid-sm srch-row">
            {albums.map((h) => (
              <LibAlbumCard key={h.item.id} c={c} album={h.item} subtitle={<AlbumSub a={h.item} tokens={r.tokens} />} playingAlbumId={playingAlbum} onOpen={remember} />
            ))}
          </div>
        </section>
      )}

      {artists.length > 0 && (
        <section className="srch-sect">
          <SectionHead label="ARTISTS" right={more('artists', r.artists.length, artists.length + (r.top?.kind === 'artist' ? 1 : 0))} />
          <div className="art-grid srch-row">
            {artists.map((h) => (
              <ArtistTile key={h.item.id} c={c} id={h.item.id} tokens={r.tokens} remember={remember} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AlbumSub({ a, tokens }: { a: Album; tokens: string[] }) {
  return (
    <>
      <Hl text={a.artist} tokens={tokens} className="hl-soft" />
      {a.year ? ` · ${a.year}` : ''}
    </>
  )
}

/* ── Top result card ───────────────────────────────── */

function TopCard({ c, top, r, remember }: { c: Catalogue; top: TopHit; r: SearchResults; remember: () => void }) {
  const ctx = useContextState(top.kind === 'track' ? 'search' : top.kind, top.kind === 'track' ? r.query : top.item.id)
  const now = useNowPlaying()

  let name: string
  let meta: string
  let art: ReactNode
  let open: () => void
  let play: () => void
  let active = ctx.active
  let playing = ctx.playing
  if (top.kind === 'artist') {
    const info = artistInfos(c).get(top.item.id)
    name = top.item.name
    meta = `ARTIST · ${plural(info?.albums.length ?? 0, 'RELEASE')}`
    art = <ArtistAvatar artist={top.item} size={96} lazy={false} className="srch-top-avatar" />
    open = () => go(artistHref(top.item.id))
    play = () => playList(artistTrackIds(c, top.item.id), { kind: 'artist', id: top.item.id, label: top.item.name })
  } else if (top.kind === 'album') {
    const info = albumInfos(c).get(top.item.id)
    name = top.item.title
    meta = [info ? RELEASE_LABEL[info.kind].one : 'ALBUM', top.item.artist.toUpperCase(), top.item.year].filter(Boolean).join(' · ')
    art = <Cover id={top.item.cover} size={96} />
    open = () => go(albumHref(top.item.id))
    play = () => playList(albumTrackIds(c, top.item.id), { kind: 'album', id: top.item.id, label: top.item.title })
  } else {
    const album = c.albums[top.item.albumId]
    name = top.item.title
    meta = `SONG · ${top.item.artist.toUpperCase()}`
    art = <Cover id={album?.cover} size={96} />
    open = () => playTracks(r.tracks.map((h) => h.item.id), 0, r.query)
    play = open
    // the same song from elsewhere counts too
    active = now.id === top.item.id
    playing = active && now.playing
  }

  return (
    <div
      className={`srch-top ${active ? 'is-active' : ''}`}
      role="link"
      tabIndex={0}
      data-nav
      onClick={() => {
        remember()
        open()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          remember()
          open()
        }
      }}
    >
      {art}
      <div className="srch-top-foot">
        <div className="srch-top-text">
          <div className={`srch-top-name ${name.length > 22 ? 'is-long' : ''}`}>
            <Hl text={name} tokens={r.tokens} />
          </div>
          <div className="srch-top-meta">{meta}</div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <PlayButton
            size={48}
            state={playing ? 'playing' : 'paused'}
            onClick={() => {
              remember()
              if (active) playerStore.toggle()
              else play()
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Cover({ id, size }: { id: string | null | undefined; size: number }) {
  const [ref, url] = useLazyCover<HTMLDivElement>(id)
  return (
    <div ref={ref} className="srch-cover" style={{ width: size, height: size }}>
      {url && <img src={url} alt="" decoding="async" />}
    </div>
  )
}

/* ── Song row (handoff: 44px cover · title + artist · album · time) ── */

function playTracks(ids: string[], start: number, query: string) {
  searchStore.remember(query)
  playList(ids, { kind: 'search', id: query, label: `Search · “${query.trim()}”` }, { start })
}

function SongRow({ c, t, tokens, onPlay, style }: { c: Catalogue; t: Track; tokens: string[]; onPlay: () => void; style?: React.CSSProperties }) {
  const album = c.albums[t.albumId]
  const [ref, cover] = useLazyCover<HTMLDivElement>(album?.cover)
  const now = useNowPlaying()
  const current = now.id === t.id
  return (
    <div
      className={`srow ${current ? 'is-playing' : ''}`}
      style={style}
      tabIndex={0}
      data-nav
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (isTouch() && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onPlay()
      }}
    >
      <div ref={ref} className="srow-cover">
        {cover && <img src={cover} alt="" decoding="async" />}
        {current && now.playing ? (
          <span className="srow-eq">
            <Eq />
          </span>
        ) : (
          <button type="button" className="srow-play" tabIndex={-1} aria-label={`Play ${t.title}`} onClick={onPlay}>
            <Icon name="playF" />
          </button>
        )}
      </div>
      <div className="srow-main">
        <div className="srow-text">
          <div className="srow-title">
            <Hl text={t.title} tokens={tokens} />
          </div>
          <div className="srow-sub">
            <a className="ln" href={artistHref(t.artistId)} tabIndex={-1}>
              <Hl text={t.artist} tokens={tokens} className="hl-soft" />
            </a>
          </div>
        </div>
      </div>
      <div className="srow-album">
        {album && (
          <a className="ln" href={albumHref(album.id)} tabIndex={-1}>
            <Hl text={album.title} tokens={tokens} className="hl-soft" />
          </a>
        )}
      </div>
      <div className="srow-dur">{t.duration ? fmtTotal(t.duration) : '—'}</div>
    </div>
  )
}

/* ── Artist tile ───────────────────────────────────── */

function ArtistTile({ c, id, tokens, remember }: { c: Catalogue; id: string; tokens: string[]; remember: () => void }) {
  const info = artistInfos(c).get(id)
  if (!info) return null
  return (
    <a className="art-tile" href={artistHref(id)} data-nav onClick={remember}>
      <ArtistAvatar artist={info.artist} size="100%" className="art-tile-img" />
      <span className="art-tile-name">
        <Hl text={info.artist.name} tokens={tokens} />
      </span>
      <span className="art-tile-meta">
        {plural(info.albums.length, 'RELEASE')} · {plural(info.tracks, 'TRACK')}
      </span>
    </a>
  )
}

/* ── One kind: full lists ─────────────────────────── */

function ArtistsList({ r, remember }: { r: SearchResults; remember: () => void }) {
  const { data } = useLibrary()
  if (!r.artists.length || !data) return <NoneOfKind kind="artists" />
  return (
    <section className="srch-sect">
      <SectionHead label="ARTISTS" right={pad2(r.artists.length)} />
      <div className="art-grid">
        {r.artists.map((h) => (
          <ArtistTile key={h.item.id} c={data} id={h.item.id} tokens={r.tokens} remember={remember} />
        ))}
      </div>
    </section>
  )
}

function AlbumsList({ c, r, remember }: { c: Catalogue; r: SearchResults; remember: () => void }) {
  const playingAlbum = usePlayingAlbumId(c)
  if (!r.albums.length) return <NoneOfKind kind="albums" />
  return (
    <section className="srch-sect">
      <SectionHead label="ALBUMS" right={pad2(r.albums.length)} />
      <div className="lib-grid">
        {r.albums.map((h) => (
          <LibAlbumCard key={h.item.id} c={c} album={h.item} subtitle={<AlbumSub a={h.item} tokens={r.tokens} />} playingAlbumId={playingAlbum} onOpen={remember} />
        ))}
      </div>
    </section>
  )
}

const SROW_H = 60

function SongsList({ c, r }: { c: Catalogue; r: SearchResults }) {
  const listRef = useRef<HTMLDivElement>(null)
  const ids = useMemo(() => r.tracks.map((h) => h.item.id), [r])
  const {
    range: [from, to],
  } = useWindow(listRef, ids.length, SROW_H)
  const seconds = useMemo(() => r.tracks.reduce((s, h) => s + (h.item.duration ?? 0), 0), [r])
  const ctx = useContextState('search', r.query)
  if (!ids.length) return <NoneOfKind kind="songs" />
  return (
    <section className="srch-sect">
      <SectionHead
        label="SONGS"
        right={
          <>
            {plural(ids.length, 'SONG')} · {fmtTotal(seconds)}
          </>
        }
      />
      <div className="srch-songs-bar">
        <PlayButton
          size={44}
          state={ctx.playing ? 'playing' : 'paused'}
          onClick={() => (ctx.active ? playerStore.toggle() : playTracks(ids, 0, r.query))}
        />
        <span className="srch-songs-label">{ctx.active ? 'PLAYING FROM THIS SEARCH' : 'PLAY ALL'}</span>
      </div>
      <div ref={listRef} className="srow-list srow-virtual" style={{ height: ids.length * SROW_H }}>
        {r.tracks.slice(from, to).map((h, k) => {
          const i = from + k
          return <SongRow key={h.item.id} c={c} t={h.item} tokens={r.tokens} style={{ transform: `translateY(${i * SROW_H}px)` }} onPlay={() => playTracks(ids, i, r.query)} />
        })}
      </div>
    </section>
  )
}

function NoneOfKind({ kind }: { kind: 'artists' | 'albums' | 'songs' }) {
  return (
    <div className="placeholder">
      <EmptyState
        icon="search"
        title={`No ${kind} match.`}
        actions={
          <Button variant="secondary" onClick={() => searchStore.setFilter('all')}>
            Show all results
          </Button>
        }
      />
    </div>
  )
}
