/**
 * Search results inside Library (Material redesign, LibraryMaterial.dc.html with a query).
 *
 *   All:  [Top result card (hue gradient, tilted art, big title, type chip, cookie play)] [Songs · 4 rows]
 *         Albums ▸ / Artists ▸ / Playlists ▸ (sideways rows, "See all" scopes the chips)
 *   One kind: the full grid (or the songs list, virtualised).
 *   Nothing: clover + search_off, "Nothing in your library matches ‘…’", Did you mean / Clear search.
 * Matched text is marked (coral tint). ↑ / ↓ move between results; ↑ from the first goes back to the field.
 */
import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Button, CookieButton } from '../../components/ui'
import { useCover } from '../../lib/covers'
import { useArtTint } from '../../design/tint'
import { nameHue } from '../../lib/mixing'
import type { Catalogue, Track } from '../../state/library'
import { playerStore } from '../../state/player'
import { playlistInfo } from '../../state/playlistViews'
import { playPlaylist } from '../../actions/ops'
import { PlaylistCover } from '../playlists/PlaylistCover'
import { highlight, searchStore, type SearchFilter, type SearchResults, type TopHit } from '../../state/search'
import { albumHref, artistHref, go, playlistHref } from '../../shell/routes'
import { artistInfos, fmtN } from '../../state/views'
import { useIsPhone } from '../../state/viewport'
import { albumTrackIds, artistTrackIds, playList, useContextState, useNowPlaying } from '../library/playback'
import { actions, type ActionTarget } from '../../actions/actions'
import { ArtistDisc } from '../home/art'
import { CardGroups, Hl, LibCard, NoResultsMark, SongCard, albumItem, artistItem, playlistItem, type LibItem } from '../library/libgrid'
import { NAV, playTracks } from './results'

const H = (text: string, tokens: string[]) => <Hl parts={highlight(text, tokens)} />

/**
 * The results for a typed query, shown in place of the Library chip's view.
 */
export function SearchResultsView({ c, r, filter, suggestion, query, onBackToField, onClear }: { c: Catalogue; r: SearchResults; filter: SearchFilter; suggestion: string | null; query: string; onBackToField: () => void; onClear: () => void }) {
  const resultsRef = useRef<HTMLDivElement>(null)
  const remember = () => searchStore.remember(query)
  const phone = useIsPhone()

  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(resultsRef.current?.querySelectorAll<HTMLElement>(NAV) ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    e.preventDefault()
    const next = at + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) onBackToField()
    else items[Math.min(next, items.length - 1)]?.focus()
  }

  const none = filter === 'all' ? r.total === 0 : filter === 'artists' ? !r.artists.length : filter === 'albums' ? !r.albums.length : filter === 'playlists' ? !r.playlists.length : !r.tracks.length

  return (
    <div className="sr" ref={resultsRef} onKeyDown={onResultsKey} data-search-results>
      {none ? (
        <NoMatch query={r.query.trim()} suggestion={r.total === 0 ? suggestion : null} scoped={filter !== 'all' && r.total > 0} onClear={onClear} />
      ) : filter === 'all' ? (
        <AllView c={c} r={r} remember={remember} phone={phone} />
      ) : filter === 'songs' ? (
        <SongsList c={c} r={r} phone={phone} />
      ) : (
        <CardsList c={c} r={r} kind={filter} remember={remember} phone={phone} />
      )}
    </div>
  )
}

/* ── No match ──────────────────────────────────────── */

function NoMatch({ query, suggestion, scoped, onClear }: { query: string; suggestion: string | null; scoped: boolean; onClear: () => void }) {
  return (
    <div className="sr-none">
      <NoResultsMark />
      <div className="sr-none-t">{scoped ? `No ${searchStore.get().filter} match ‘${query}’` : `Nothing in your library matches ‘${query}’`}</div>
      <div className="sr-none-b">
        {suggestion ? (
          <>
            Did you mean <mark className="lb-hl">{suggestion}</mark>?
          </>
        ) : (
          'Check the spelling, or try an artist or album name.'
        )}
      </div>
      <div className="sr-none-btns">
        {suggestion && (
          <Button variant="tonal" onClick={() => searchStore.setQuery(suggestion)}>
            Search {suggestion}
          </Button>
        )}
        {scoped ? (
          <Button variant="tonal" onClick={() => searchStore.setFilter('all')}>
            Show all results
          </Button>
        ) : (
          <Button variant={suggestion ? 'outlined-ink' : 'tonal'} onClick={onClear}>
            Clear search
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── All ────────────────────────────────────────────── */

const ALL_SONGS = 4
const ROW_CARDS = 6

function SectionTitle({ title, n, more }: { title: string; n: number; more?: () => void }) {
  return (
    <div className="hs-head">
      <h2 className="hs-title">{title}</h2>
      <span className="hs-sub">{fmtN(n)}</span>
      <span className="hs-flex" />
      {more && (
        <button type="button" className="hs-more sr-more" onClick={more}>
          See all
        </button>
      )}
    </div>
  )
}

function AllView({ c, r, remember, phone }: { c: Catalogue; r: SearchResults; remember: () => void; phone: boolean }) {
  const songs = r.tracks.slice(0, ALL_SONGS)
  const ids = useMemo(() => r.tracks.map((h) => h.item.id), [r])
  const RS = phone ? 120 : 152
  const rows: { kind: SearchFilter; title: string; items: LibItem[]; n: number }[] = [
    { kind: 'albums', title: 'Albums', n: r.albums.length, items: r.albums.slice(0, ROW_CARDS).map((h) => albumItem(h.item)) },
    { kind: 'artists', title: 'Artists', n: r.artists.length, items: r.artists.slice(0, ROW_CARDS).map((h) => artistInfos(c).get(h.item.id)).filter((x) => !!x).map((i) => artistItem(i!)) },
    { kind: 'playlists', title: 'Playlists', n: r.playlists.length, items: r.playlists.slice(0, ROW_CARDS).map((h) => playlistItem(h.item)) },
  ]
  return (
    <div className="sr-all">
      <div className={`sr-lead ${songs.length && r.top ? '' : 'is-solo'}`}>
        {r.top && (
          <section className="hs">
            {!phone && (
              <div className="hs-head">
                <h2 className="hs-title">Top result</h2>
              </div>
            )}
            <TopCard c={c} top={r.top} r={r} remember={remember} phone={phone} />
          </section>
        )}
        {songs.length > 0 && (
          <section className="hs">
            <SectionTitle title="Songs" n={r.tracks.length} more={r.tracks.length > songs.length ? () => searchStore.setFilter('songs') : undefined} />
            <SongCard
              c={c}
              tracks={songs.map((h) => h.item)}
              phone={phone}
              compact
              onOpen={remember}
              rowTitle={(t) => H(t.title, r.tokens)}
              rowSub={(t) => <SongSub c={c} t={t} tokens={r.tokens} phone={phone} />}
              onPlay={(i) => playTracks(ids, i, r.query)}
            />
          </section>
        )}
      </div>
      {rows
        .filter((x) => x.items.length)
        .map((x) => (
          <section key={x.kind} className="hs">
            <SectionTitle title={x.title} n={x.n} more={x.n > ROW_CARDS ? () => searchStore.setFilter(x.kind) : undefined} />
            <div className="hs-row">
              {x.items.map((it) => (
                <LibCard key={it.key} c={c} item={it} size={RS} opts={{ title: H(it.title, r.tokens), onOpen: remember }} />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}

function SongSub({ c, t, tokens, phone }: { c: Catalogue; t: Track; tokens: string[]; phone: boolean }) {
  const album = c.albums[t.albumId]
  if (phone)
    return (
      <>
        {H(t.artist, tokens)}
        {t.duration ? ` · ${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, '0')}` : ''}
      </>
    )
  return (
    <>
      {H(t.artist, tokens)}
      {album && <> · {H(album.title, tokens)}</>}
    </>
  )
}

/* ── Top result ─────────────────────────────────────── */

function TopCard({ c, top, r, remember, phone }: { c: Catalogue; top: TopHit; r: SearchResults; remember: () => void; phone: boolean }) {
  const ctx = useContextState(top.kind === 'track' ? 'search' : top.kind, top.kind === 'track' ? r.query : top.item.id)
  const now = useNowPlaying()
  const ts = phone ? 72 : 112
  const coverId = top.kind === 'album' ? top.item.cover : top.kind === 'track' ? c.albums[top.item.albumId]?.cover : top.kind === 'artist' ? top.item.image?.id : null
  const url = useCover(coverId, top.kind === 'artist' ? top.item.image?.v : undefined)
  // same colour rule as the player (design/tint.ts): white / grey / black art → neutral (hc 0)
  const tint = useArtTint(url)
  const hue = url ? (tint?.hue ?? 40) : nameHue(top.kind === 'artist' ? top.item.name : top.kind === 'playlist' ? top.item.name : top.kind === 'album' ? top.item.title : top.item.title)
  const hc = url ? (tint?.chroma ?? 0) : 1

  let name: string
  let typeL: string
  let by: string
  let art: ReactNode
  let open: () => void
  let play: () => void
  let active = ctx.active
  let playing = ctx.playing
  if (top.kind === 'artist') {
    const info = artistInfos(c).get(top.item.id)
    const n = info?.albums.length ?? 0
    name = top.item.name
    typeL = 'Artist'
    by = `${n} ${n === 1 ? 'album' : 'albums'}`
    art = <ArtistDisc artist={top.item} size={ts} />
    open = () => go(artistHref(top.item.id))
    play = () => playList(artistTrackIds(c, top.item.id), { kind: 'artist', id: top.item.id, label: top.item.name })
  } else if (top.kind === 'album') {
    name = top.item.title
    typeL = 'Album'
    by = [top.item.artist, top.item.year].filter(Boolean).join(' · ')
    art = <TopCover url={url} size={ts} />
    open = () => go(albumHref(top.item.id))
    play = () => playList(albumTrackIds(c, top.item.id), { kind: 'album', id: top.item.id, label: top.item.title })
  } else if (top.kind === 'playlist') {
    const n = playlistInfo(c, top.item).ids.length
    name = top.item.name
    typeL = top.item.smart ? 'Smart playlist' : 'Playlist'
    by = `${n} ${n === 1 ? 'song' : 'songs'}`
    art = <PlaylistCover playlist={top.item} size={ts} className="sr-top-plc" />
    open = () => go(playlistHref(top.item.id))
    play = () => playPlaylist(top.item.id)
  } else {
    const album = c.albums[top.item.albumId]
    name = top.item.title
    typeL = 'Song'
    by = [top.item.artist, album?.title].filter(Boolean).join(' · ')
    art = <TopCover url={url} size={ts} />
    open = () => playTracks(r.tracks.map((h) => h.item.id), 0, r.query)
    play = open
    active = now.id === top.item.id
    playing = active && now.playing
  }

  const menuTarget: ActionTarget =
    top.kind === 'artist' ? { kind: 'artist', artistId: top.item.id } : top.kind === 'album' ? { kind: 'album', albumId: top.item.id } : top.kind === 'playlist' ? { kind: 'playlist', playlistId: top.item.id } : { kind: 'track', trackId: top.item.id }

  return (
    <div
      className={`sr-top hue-scope ${phone ? 'is-phone' : ''} ${top.kind === 'artist' ? 'is-artist' : ''}`}
      style={{ '--h': hue, '--hc': hc } as CSSProperties}
      role="link"
      tabIndex={0}
      data-nav
      onContextMenu={(e) => actions.menu(menuTarget, e)}
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
      <div className="sr-top-art">{art}</div>
      <div className="sr-top-text">
        <div className="sr-top-name">{H(name, r.tokens)}</div>
        <div className="sr-top-by">
          <span className="sr-top-chip">{typeL}</span>
          <span className="sr-top-sub">{by}</span>
        </div>
      </div>
      <div className="sr-top-play" onClick={(e) => e.stopPropagation()}>
        <CookieButton
          size={phone ? 52 : 64}
          iconSize={phone ? 28 : 32}
          playing={playing}
          icon={playing ? 'pauseF' : 'playF'}
          label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            remember()
            if (active) playerStore.toggle()
            else play()
          }}
        />
      </div>
    </div>
  )
}

function TopCover({ url, size }: { url: string | null; size: number }) {
  return <span className="sr-top-cover" style={{ width: size, height: size }}>{url && <img src={url} alt="" decoding="async" />}</span>
}

/* ── One kind ───────────────────────────────────────── */

function CardsList({ c, r, kind, remember, phone }: { c: Catalogue; r: SearchResults; kind: 'albums' | 'artists' | 'playlists'; remember: () => void; phone: boolean }) {
  const items: LibItem[] =
    kind === 'albums'
      ? r.albums.map((h) => albumItem(h.item))
      : kind === 'artists'
        ? r.artists
            .map((h) => artistInfos(c).get(h.item.id))
            .filter((x) => !!x)
            .map((i) => artistItem(i!))
        : r.playlists.map((h) => playlistItem(h.item))
  const tokens = r.tokens
  return (
    <CardGroups
      c={c}
      groups={[{ label: '', letter: false, items }]}
      timeline={false}
      phone={phone}
      unit={['result', 'results']}
      opts={{ withYear: kind === 'albums', onOpen: remember }}
      titleOf={(it) => H(it.title, tokens)}
    />
  )
}

function SongsList({ c, r, phone }: { c: Catalogue; r: SearchResults; phone: boolean }) {
  const ids = useMemo(() => r.tracks.map((h) => h.item.id), [r])
  const ctx = useContextState('search', r.query)
  return (
    <div className="sr-songs">
      <div className="lb-actions">
        <Button variant="tonal" onClick={() => (ctx.active ? playerStore.toggle() : playTracks(ids, 0, r.query))}>
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play all'}
        </Button>
      </div>
      <SongCard
        c={c}
        tracks={r.tracks.map((h) => h.item)}
        phone={phone}
        rowTitle={(t) => H(t.title, r.tokens)}
        rowSub={(t) => <SongSub c={c} t={t} tokens={r.tokens} phone={phone} />}
        onPlay={(i) => playTracks(ids, i, r.query)}
        onOpen={() => searchStore.remember(r.query)}
      />
    </div>
  )
}
