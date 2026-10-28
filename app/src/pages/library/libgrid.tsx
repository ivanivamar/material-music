/**
 * Library building blocks (Material redesign, LibraryMaterial.dc.html): the mixed item model
 * (albums · artists · playlists), sorting and grouping, the card grid with an optional timeline rail,
 * song rows (virtualised per group), and the A–Z scrubber.
 *
 * Grouping by sort: Recently added → This week / Earlier this month / one per month / one per year
 * (rail with a coral ring per group); A–Z / Artist → letters (tonal cookie per letter); Year → decades. Timeline
 * view shows the group heads and the rail; Grid view is one plain grid (letters still feed the scrubber).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { AlbumEq, IconButton, formatTime, qualityLabel } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { SHAPE_CLOVER, SHAPE_PLAYING } from '../../design/shapes'
import { actions, trackDrag } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { useLazyCover } from '../../lib/covers'
import { nameHue } from '../../lib/mixing'
import { albumHref, artistHref, go, playlistHref } from '../../shell/routes'
import { albumOffline, playlistOffline, useDownloads, useOnline } from '../../state/downloads'
import type { Album, Artist, Catalogue, Track } from '../../state/library'
import { playerStore } from '../../state/player'
import { playlistInfo } from '../../state/playlistViews'
import type { Playlist } from '../../state/playlists'
import { isTouch } from '../../state/viewport'
import { byName, initialOf, type ArtistInfo } from '../../state/views'
import { CardFrame, usePlayingContext } from '../home/cards'
import { initials, SmartArt } from '../home/art'
import { PlaylistCover } from '../playlists/PlaylistCover'
import { albumTrackIds, artistTrackIds, playList, useNowPlaying } from './playback'
import { useWindow } from './useWindow'
import '../home/home.css'

/* ── Items ──────────────────────────────────────────── */

export type ItemType = 'album' | 'artist' | 'playlist' | 'smart'

export interface LibItem {
  type: ItemType
  id: string
  key: string
  title: string
  /** sort / group by artist */
  artist: string
  /** ms, when it came into the library */
  added: number
  year: number | null
  album?: Album
  info?: ArtistInfo
  playlist?: Playlist
  /** subtitle override (offline counts…) */
  sub?: string
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0)

export const albumItem = (a: Album, sub?: string): LibItem => ({ type: 'album', id: a.id, key: 'al:' + a.id, title: a.title, artist: a.artist, added: ms(a.addedAt), year: a.year ?? null, album: a, sub })
export const artistItem = (i: ArtistInfo, sub?: string): LibItem => ({
  type: 'artist',
  id: i.artist.id,
  key: 'ar:' + i.artist.id,
  title: i.artist.name,
  artist: i.artist.name,
  added: i.albums.reduce((m, a) => Math.max(m, ms(a.addedAt)), 0),
  year: null,
  info: i,
  sub,
})
export const playlistItem = (p: Playlist): LibItem => ({ type: p.smart ? 'smart' : 'playlist', id: p.id, key: 'pl:' + p.id, title: p.name, artist: '', added: ms(p.createdAt), year: null, playlist: p })

/* ── Grouping ───────────────────────────────────────── */

export type GroupBy = 'added' | 'name' | 'artist' | 'year' | null

export interface Group<T> {
  label: string
  /** letter heads (A–Z / Artist): a cookie with the letter; else a ring + the label */
  letter: boolean
  items: T[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/**
 * Calendar sections (local time): This week (since Monday 00:00) → Earlier this month (since the 1st)
 * → one section per month for the last 12 months ("September"; "December 2025" for the previous year)
 * → one per year ("2024"). Items are sorted by date, so each label forms one consecutive group.
 */
export function addedBucket(t: number, now = Date.now()): string {
  if (!t) return 'Earlier'
  const today = new Date(now)
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7)).getTime()
  if (t >= monday) return 'This week'
  const d = new Date(t)
  const y = d.getFullYear()
  const m = d.getMonth()
  const back = (today.getFullYear() - y) * 12 + today.getMonth() - m
  if (back === 0) return 'Earlier this month'
  if (back < 12) return y === today.getFullYear() ? MONTHS[m] : `${MONTHS[m]} ${y}`
  return String(y)
}
/** A–Z or '#'. */
export const letterOf = (name: string) => {
  const l = initialOf(name)
  return /^[A-Z]$/.test(l) ? l : '#'
}

export function groupItems<T>(items: T[], by: GroupBy, key: (t: T) => { title: string; artist: string; added: number; year: number | null }): Group<T>[] {
  if (!by) return [{ label: '', letter: false, items }]
  const out: Group<T>[] = []
  const now = Date.now()
  for (const it of items) {
    const k = key(it)
    const label = by === 'added' ? addedBucket(k.added, now) : by === 'year' ? (k.year ? `${Math.floor(k.year / 10) * 10}s` : 'Unknown year') : letterOf(by === 'artist' ? k.artist : k.title)
    const last = out.at(-1)
    if (last && last.label === label) last.items.push(it)
    else out.push({ label, letter: by === 'name' || by === 'artist', items: [it] })
  }
  return out
}

export function sortItems(items: LibItem[], sort: 'added' | 'name'): LibItem[] {
  const out = items.slice()
  return sort === 'added' ? out.sort((a, b) => b.added - a.added || byName(a.title, b.title)) : out.sort((a, b) => byName(a.title, b.title))
}

/* ── Grid size: as many columns of ≥ 150px as fit ─── */

export function useGridSize(min: number, gap: number, phoneCols: number | null) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const cols = phoneCols ?? Math.max(2, Math.floor((w + gap) / (min + gap)))
  const S = w ? Math.floor((w - (cols - 1) * gap) / cols) : min
  return { ref, S, cols }
}

/* ── Highlight ──────────────────────────────────────── */

export function Hl({ parts }: { parts: { text: string; hit: boolean }[] }) {
  return (
    <>
      {parts.map((s, i) =>
        s.hit ? (
          <mark key={i} className="lb-hl">
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

/* ── Cards ──────────────────────────────────────────── */

const TYPE_ICON: Record<ItemType, IconName> = { album: 'album', artist: 'artist', playlist: 'playlist', smart: 'smart' }

function sub(icon: IconName | null, text: ReactNode) {
  return icon ? (
    <>
      <Icon name={icon} className="lb-sub-ic" />
      <span className="lb-sub-t">{text}</span>
    </>
  ) : (
    text
  )
}

function LazyArtist({ artist, size }: { artist: Artist; size: number }) {
  const [ref, url] = useLazyCover<HTMLSpanElement>(artist.image?.id, artist.image?.v)
  const H = nameHue(artist.name)
  return (
    <span ref={ref} className="lb-artist-art" style={url ? undefined : { background: `oklch(0.42 0.08 ${H})`, color: `oklch(0.92 0.04 ${H})`, fontSize: Math.round(size * 0.3) }}>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : initials(artist.name)}
    </span>
  )
}

function AlbumArt({ album }: { album: Album }) {
  const [ref, cover] = useLazyCover<HTMLSpanElement>(album.cover)
  return (
    <span ref={ref} className="hcard-cover">
      {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
    </span>
  )
}

export interface CardOpts {
  /** All chip: a small type icon before the subtitle */
  showType?: boolean
  /** Albums chip: "Artist · 2024" */
  withYear?: boolean
  title?: ReactNode
  letter?: string
  onOpen?: () => void
}

export function LibCard({ c, item, size, opts = {} }: { c: Catalogue; item: LibItem; size: number; opts?: CardOpts }) {
  const kind = item.type === 'album' ? 'album' : item.type === 'artist' ? 'artist' : 'playlist'
  const st = usePlayingContext(kind, item.id)
  const dl = useDownloads()
  const online = useOnline()
  const icon = opts.showType ? TYPE_ICON[item.type] : null
  const open = (href: string) => () => {
    opts.onOpen?.()
    go(href)
  }

  if (item.type === 'album' && item.album) {
    const a = item.album
    const off = dl.available ? albumOffline(dl, a.id) : null
    const saved = !!off?.complete && off.wanted
    // artist name links to the artist page (unless a caller overrides the line)
    const text =
      item.sub ?? (
        <span className="lb-sub-t">
          <a
            className="lb-ln"
            href={artistHref(a.artistId)}
            tabIndex={-1}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation()
              opts.onOpen?.()
            }}
          >
            {a.artist}
          </a>
          {opts.withYear && a.year ? ` · ${a.year}` : null}
        </span>
      )
    return (
      <CardFrame
        className="lb-card"
        letter={opts.letter}
        art={
          <span className="lb-art-wrap">
            <AlbumArt album={a} />
            {saved && <OfflineBadge />}
          </span>
        }
        title={a.title}
        titleNode={opts.title}
        subtitle={sub(icon, text)}
        size={size}
        active={st.active}
        playing={st.playing}
        dim={!!off && !online && off.done === 0}
        onOpen={open(albumHref(a.id))}
        onPlay={() => {
          opts.onOpen?.()
          playList(albumTrackIds(c, a.id), { kind: 'album', id: a.id, label: a.title })
        }}
        extra={{ onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'album', albumId: a.id }, e), ...trackDrag(() => albumTrackIds(c, a.id), a.title) }}
      />
    )
  }
  if (item.type === 'artist' && item.info) {
    const ar = item.info.artist
    const n = item.info.albums.length
    return (
      <CardFrame
        className="lb-card"
        round
        letter={opts.letter}
        art={<LazyArtist artist={ar} size={size} />}
        title={ar.name}
        titleNode={opts.title}
        subtitle={sub(icon, item.sub ?? `${n} ${n === 1 ? 'album' : 'albums'}`)}
        size={size}
        active={st.active}
        playing={st.playing}
        onOpen={open(artistHref(ar.id))}
        onPlay={() => {
          opts.onOpen?.()
          playList(artistTrackIds(c, ar.id), { kind: 'artist', id: ar.id, label: ar.name }, { shuffle: true })
        }}
        extra={{ onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'artist', artistId: ar.id }, e), ...trackDrag(() => artistTrackIds(c, ar.id), ar.name) }}
      />
    )
  }
  const p = item.playlist!
  const n = playlistInfo(c, p).ids.length
  const off = dl.available && !p.smart ? playlistOffline(dl, c, p) : null
  return (
    <CardFrame
      className="lb-card"
      letter={opts.letter}
      art={
        p.smart ? (
          <SmartArt playlist={p} size={size} />
        ) : (
          <span className="lb-art-wrap">
            <PlaylistCover playlist={p} size={size} lazy className="lb-plc" />
            {off?.complete && <OfflineBadge />}
          </span>
        )
      }
      title={p.name}
      titleNode={opts.title}
      subtitle={sub(icon, p.smart ? `${n} ${n === 1 ? 'song' : 'songs'} · updates itself` : `${n} ${n === 1 ? 'song' : 'songs'}`)}
      size={size}
      active={st.active}
      playing={st.playing}
      onOpen={open(playlistHref(p.id))}
      onPlay={() => {
        opts.onOpen?.()
        playPlaylist(p.id)
      }}
      extra={{ onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'playlist', playlistId: p.id }, e) }}
    />
  )
}

function OfflineBadge() {
  return (
    <span className="hcard-offline" title="Downloaded">
      <Icon name="downloaded" />
    </span>
  )
}

/** "New playlist" / "New smart playlist" tiles (Playlists chip). */
export function NewTile({ size, smart }: { size: number; smart?: boolean }) {
  return (
    <button type="button" className="hnew" style={{ width: size }} onClick={() => (smart ? actions.smartPlaylist() : actions.newPlaylist([], '', true))}>
      <span className="hnew-art" style={{ width: size, height: size, borderRadius: Math.max(8, Math.round((20 * size) / 168)) }}>
        <span className="hnew-tile" style={{ clipPath: SHAPE_PLAYING }}>
          <Icon name={smart ? 'smart' : 'plus'} size={28} />
        </span>
      </span>
      <span className="hcard-text">
        <span className="hcard-t">{smart ? 'New smart playlist' : 'New playlist'}</span>
        <span className="hcard-s">{smart ? 'Fills itself from rules' : 'Start empty, add songs later'}</span>
      </span>
    </button>
  )
}

/* ── Group head + rail ──────────────────────────────── */

export function GroupHead({ g, count }: { g: { label: string; letter: boolean }; count: string }) {
  return (
    <div className="lb-ghead" data-letter={g.letter ? g.label : undefined}>
      <span className="lb-gmark">{g.letter ? <span className="lb-gletter" style={{ clipPath: SHAPE_PLAYING }}>{g.label}</span> : <span className="lb-gring" />}</span>
      {!g.letter && <span className="lb-glabel">{g.label}</span>}
      <span className="lb-gline" />
      <span className="lb-gcount">{count}</span>
    </div>
  )
}

/** Groups of cards: Timeline (heads + rail) or one plain grid. */
export function CardGroups({ c, groups, timeline, phone, unit, opts, lead, titleOf }: { c: Catalogue; groups: Group<LibItem>[]; timeline: boolean; phone: boolean; unit: [string, string]; opts: CardOpts; lead?: (S: number) => ReactNode; titleOf?: (it: LibItem) => ReactNode }) {
  const gap = phone ? 12 : 20
  const { ref, S } = useGridSize(150, gap, phone ? 2 : null)
  const named = timeline && groups.length > 0 && groups[0].label !== ''
  const plain = !named
  const cardsOf = (items: LibItem[], letterFirst: (i: number) => string | undefined) =>
    items.map((it, i) => <LibCard key={it.key} c={c} item={it} size={S} opts={{ ...opts, letter: letterFirst(i), title: titleOf?.(it) }} />)
  return (
    <div className={`lb-groups ${named ? 'is-timeline' : ''}`}>
      {plain ? (
        <div ref={ref} className="lb-grid" style={{ ['--S' as string]: `${S}px`, gap: `28px ${gap}px` } as CSSProperties}>
          {lead?.(S)}
          {groups.flatMap((g) => cardsOf(g.items, (i) => (g.letter && i === 0 ? g.label : undefined)))}
        </div>
      ) : (
        groups.map((g, k) => (
          <section key={g.label} className={`lb-group ${k === groups.length - 1 ? 'is-last' : ''}`}>
            <GroupHead g={g} count={`${g.items.length} ${g.items.length === 1 ? unit[0] : unit[1]}`} />
            <div ref={k === 0 ? ref : undefined} className="lb-grid" style={{ ['--S' as string]: `${S}px`, gap: `28px ${gap}px` } as CSSProperties}>
              {k === 0 && lead?.(S)}
              {cardsOf(g.items, () => undefined)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/* ── Songs ──────────────────────────────────────────── */

export const SONG_ROW = 60
export const SONG_ROW_PHONE = 64

export function SongRowM({
  c,
  t,
  phone,
  top,
  title,
  sub,
  onPlay,
  onOpen,
  letter,
  compact,
}: {
  c: Catalogue
  t: Track
  phone: boolean
  /** search: cover · title / artist · album · time (no album / quality columns) */
  compact?: boolean
  top?: number
  title?: ReactNode
  /** phone / search: second line override */
  sub?: ReactNode
  onPlay: () => void
  onOpen?: () => void
  letter?: string
}) {
  const now = useNowPlaying()
  const current = now.id === t.id
  const playing = current && now.playing
  const album = c.albums[t.albumId]
  const [ref, cover] = useLazyCover<HTMLButtonElement>(album?.cover)
  const q24 = (t.flac?.bitDepth ?? 16) > 16 || (t.flac?.sampleRate ?? 44100) > 48000
  const target = { kind: 'track', trackId: t.id } as const
  return (
    <div
      className={`lb-srow ${current ? 'is-current' : ''} ${compact ? 'is-compact' : ''}`}
      style={top != null ? { transform: `translateY(${top}px)` } : undefined}
      role="row"
      tabIndex={0}
      data-nav
      data-letter={letter}
      onContextMenu={(e) => actions.menu(target, e)}
      {...trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
      onDoubleClick={onPlay}
      onClick={(e) => {
        if ((phone || isTouch()) && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onPlay()
      }}
    >
      <button
        ref={ref}
        type="button"
        tabIndex={-1}
        className="lb-scover"
        aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
        onClick={(e) => {
          e.stopPropagation()
          if (current) playerStore.toggle()
          else onPlay()
        }}
      >
        {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
        <span className="lb-sov">{playing ? <AlbumEq color="var(--brand)" /> : <Icon name={playing ? 'pauseF' : 'playF'} />}</span>
      </button>
      <div className="lb-stext">
        <div className="lb-st">{title ?? t.title}</div>
        <div className="lb-ss">
          {sub ?? (
            <a className="lb-ln" href={artistHref(t.artistId)} tabIndex={-1} onClick={(e) => (e.stopPropagation(), onOpen?.())}>
              {t.artist}
            </a>
          )}
        </div>
      </div>
      {!phone && compact && <div className="lb-sd">{t.duration ? formatTime(t.duration) : '—'}</div>}
      {!phone && !compact && (
        <>
          <div className="lb-salbum">
            {album && (
              <a className="lb-ln" href={albumHref(album.id)} tabIndex={-1} onClick={() => onOpen?.()}>
                {album.title}
              </a>
            )}
          </div>
          <div className="lb-sq">
            <span className={`mx-qpill ${q24 ? 'is-24' : ''}`}>{qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}</span>
          </div>
          <div className="lb-sd">{t.duration ? formatTime(t.duration) : '—'}</div>
        </>
      )}
      {phone && (
        <IconButton icon="more" label="More" className="lb-sdots" onClick={(e) => (e.stopPropagation(), actions.menu(target, e))} />
      )}
    </div>
  )
}

/** One surface card of song rows, virtualised (the whole catalogue can be thousands of songs). */
export function SongCard({ c, tracks, phone, onPlay, rowTitle, rowSub, onOpen, letter, compact }: { c: Catalogue; tracks: Track[]; phone: boolean; onPlay: (i: number) => void; rowTitle?: (t: Track) => ReactNode; rowSub?: (t: Track) => ReactNode; onOpen?: () => void; letter?: string; compact?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null)
  const rowH = phone ? SONG_ROW_PHONE : SONG_ROW
  const {
    range: [from, to],
  } = useWindow(listRef, tracks.length, rowH, 8)
  return (
    <div className="lb-scard" data-letter={letter}>
      <div ref={listRef} className="lb-slist" style={{ height: tracks.length * rowH }}>
        {tracks.slice(from, to).map((t, k) => {
          const i = from + k
          return <SongRowM key={t.id} c={c} t={t} phone={phone} top={i * rowH} title={rowTitle?.(t)} sub={rowSub?.(t)} onPlay={() => onPlay(i)} onOpen={onOpen} compact={compact} />
        })}
      </div>
    </div>
  )
}

export function SongGroups({ c, groups, timeline, phone, onPlay }: { c: Catalogue; groups: Group<Track>[]; timeline: boolean; phone: boolean; onPlay: (id: string) => void }) {
  const named = timeline && groups.length > 0 && groups[0].label !== ''
  const flat = useMemo(() => (named ? null : groups.flatMap((g) => g.items)), [groups, named])
  const phoneSub = (t: Track) => (
    <>
      {t.artist}
      {t.duration ? ` · ${formatTime(t.duration)}` : ''}
    </>
  )
  if (flat)
    return (
      <div className="lb-groups">
        <SongCard c={c} tracks={flat} phone={phone} onPlay={(i) => onPlay(flat[i].id)} rowSub={phone ? phoneSub : undefined} />
      </div>
    )
  return (
    <div className="lb-groups is-timeline">
      {groups.map((g, k) => (
        <section key={g.label} className={`lb-group ${k === groups.length - 1 ? 'is-last' : ''}`}>
          <GroupHead g={g} count={`${g.items.length} ${g.items.length === 1 ? 'song' : 'songs'}`} />
          <SongCard c={c} tracks={g.items} phone={phone} onPlay={(i) => onPlay(g.items[i].id)} rowSub={phone ? phoneSub : undefined} />
        </section>
      ))}
    </div>
  )
}

/* ── A–Z scrubber ───────────────────────────────────── */

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

/** Vertical A–Z strip on the right: tap / drag to jump; the letter at the top of the view is lit. */
export function Scrubber({ present }: { present: Set<string> }) {
  const [active, setActive] = useState<string | null>(null)
  const [bubble, setBubble] = useState<{ l: string; y: number } | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = main.getBoundingClientRect().top + 120
      let cur: string | null = null
      const all = main.querySelectorAll<HTMLElement>('[data-letter]')
      if (all.length) cur = all[0].dataset.letter ?? null
      for (const el of all) {
        if (el.getBoundingClientRect().top <= top) cur = el.dataset.letter ?? cur
        else break
      }
      setActive(cur)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    main.addEventListener('scroll', on, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      main.removeEventListener('scroll', on)
    }
  }, [present])

  const jump = (l: string) => {
    const main = document.getElementById('main')
    if (!main) return
    // the letter itself, else the next one that exists
    const order = LETTERS.slice(LETTERS.indexOf(l)).filter((x) => present.has(x))
    const want = order[0]
    if (!want) return
    const el = main.querySelector<HTMLElement>(`[data-letter="${CSS.escape(want)}"]`)
    if (!el) return
    main.scrollTo({ top: main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - 72 })
    setActive(want)
  }
  const at = (clientY: number) => {
    const r = stripRef.current?.getBoundingClientRect()
    if (!r) return
    const i = Math.max(0, Math.min(LETTERS.length - 1, Math.floor(((clientY - r.top - 8) / (r.height - 16)) * LETTERS.length)))
    const l = LETTERS[i]
    setBubble({ l, y: clientY - r.top })
    jump(l)
  }
  return (
    <div className="lb-scrub" aria-hidden>
      <div
        ref={stripRef}
        className="lb-scrub-strip"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          at(e.clientY)
        }}
        onPointerMove={(e) => dragging.current && at(e.clientY)}
        onPointerUp={() => {
          dragging.current = false
          setBubble(null)
        }}
        onPointerCancel={() => {
          dragging.current = false
          setBubble(null)
        }}
      >
        {LETTERS.map((l) => (
          <span key={l} className={`lb-scrub-l ${l === active ? 'is-on' : ''} ${present.has(l) ? 'has' : ''}`}>
            {l}
          </span>
        ))}
      </div>
      {bubble && (
        <span className="lb-scrub-bub" style={{ top: bubble.y - 28, clipPath: SHAPE_PLAYING }}>
          {bubble.l}
        </span>
      )}
    </div>
  )
}

/** Empty-results art: clover + search_off. */
export function NoResultsMark() {
  return (
    <span className="lb-nores-mark" aria-hidden>
      <span className="lb-nores-clover" style={{ clipPath: SHAPE_CLOVER }} />
      <Icon name="searchOff" size={45} className="lb-nores-ic" />
    </span>
  )
}
