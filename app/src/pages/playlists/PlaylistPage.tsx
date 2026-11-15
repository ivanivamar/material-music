/**
 * Playlist, smart playlist and Liked songs (Nov 2026 list redesign, canvas "Playlist page" /
 * "Smart playlist" / "Liked songs"):
 *
 *   ← Library › Playlists
 *   [220 cover]  PLAYLIST · BY YOU · EDITED 2 DAYS AGO
 *                Heavy water (double-click = edit) · description
 *                42 SONGS · 2 H 51 MIN · 38 OFFLINE · (smart) rules as chips
 *   [▶ Play] [⤮ Shuffle] [Edit] ⋮                                 Available offline (Android) · sorted by
 *   (Liked) Newest · Plays · A–Z                                                       [Search liked]
 *   # [cover] Title / artist · album · added · ♥ · 6:59 · ⋮
 *
 * Rows: double-click (tap on the phone) plays the playlist from there, right-click / ⋮ = track menu
 * with "Remove from …", drag to reorder (desktop: the whole row, which can also be dropped on a
 * sidebar playlist; phone: the grip). Songs that left the library stay as dimmed rows with ✕ until
 * removed. Liked songs is one flat list, newest first (LikedList).
 */
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { IconButton, Button, EmptyState, useToast } from '../../components/ui'
import { LikeButton } from '../../components/LikeButton'
import { Icon } from '../../design/icons'
import { useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { actions, DRAG_MIME } from '../../actions/actions'
import { playPlaylist, removeFromPlaylist } from '../../actions/ops'
import { albumHref, artistHref, libraryHref } from '../../shell/routes'
import { downloadsStore, playlistOffline, useDownloads } from '../../state/downloads'
import { useLibrary, type Catalogue } from '../../state/library'
import { playerStore } from '../../state/player'
import { fmtAgo, playlistInfo, type PlaylistRow } from '../../state/playlistViews'
import { LIKED_ID, playlistsStore, usePlaylists, type Playlist } from '../../state/playlists'
import { useLikedIndex } from '../../state/likes'
import { focusLibrarySearch } from '../../state/search'
import { describeRule, describeSort } from '../../state/smart'
import { useIsPhone } from '../../state/viewport'
import { PinOfflineToggle } from '../library/OfflineToggle'
import { softDate } from '../library/detail'
import { Crumbs } from '../library/common'
import { back } from '../../shell/routes'
import { ListHero } from '../../components/list/ListHero'
import { ListHead, RowCover, SongRow, UpNext } from '../../components/list/SongList'
import { fmtClock, playsLabel, usePlayCounts, type ListSong } from '../../components/list/listUtils'
import { LikedList, type LikedSort } from './LikedList'
import { PlaylistCover } from './PlaylistCover'
import { useContextState, useNowPlaying } from '../library/playback'

const ENTRY_MIME = 'application/x-pelagic-entry'

export function PlaylistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const { byId, loaded } = usePlaylists()
  const p = byId.get(id)
  if (!data) return null
  if (!p)
    return (
      <div className="dt-page">
        <Crumbs fallback={libraryHref('playlists')} parts={[<a key="l" href={libraryHref('all')}>LIBRARY</a>, <a key="p" href={libraryHref('playlists')}>PLAYLISTS</a>]} />
        {loaded && (
          <div className="placeholder">
            <EmptyState icon="playlist" title="This playlist isn’t here." body="It may have been deleted on another device." />
          </div>
        )}
      </div>
    )
  return <PlaylistView c={data} p={p} />
}

const LIKED_SORTS: { k: LikedSort; label: string }[] = [
  { k: 'newest', label: 'Recent' },
  { k: 'plays', label: 'Plays' },
  { k: 'az', label: 'A–Z' },
]

function PlaylistView({ c, p }: { c: Catalogue; p: Playlist }) {
  const info = playlistInfo(c, p)
  const ctx = useContextState('playlist', p.id)
  const now = useNowPlaying()
  const dl = useDownloads()
  const phone = useIsPhone()
  const toast = useToast()
  const counts = usePlayCounts()
  const off = dl.available ? playlistOffline(dl, c, p) : null
  const [likedSort, setLikedSort] = useState<LikedSort>('newest')
  const [likedQuery, setLikedQuery] = useState('')

  // a song whose id changed after a tag edit was found again: remember its new id
  useEffect(() => {
    for (const r of info.rows) if (r.relinked && r.track) playlistsStore.relink(p.id, r.entry.entryId, r.track)
  }, [info, p.id])

  const context = { kind: 'playlist' as const, id: p.id, label: p.name }
  const onPlay = () => (ctx.active ? playerStore.toggle() : playPlaylist(p.id))
  const playRow = (row: PlaylistRow, i: number) => {
    if (!row.track) return
    if (ctx.active && ctx.currentId === row.track.id) return playerStore.toggle()
    // its place among the playable rows
    const start = info.rows.slice(0, i).filter((r) => r.track).length
    playerStore.playQueue(info.ids, start, context)
  }

  const smart = p.smart ?? null
  const liked = p.id === LIKED_ID
  const n = info.ids.length
  const firstCover = info.rows.find((r) => r.track)?.track
  const coverUrl = useCover(p.cover || p.id === LIKED_ID ? null : firstCover ? c.albums[firstCover.albumId]?.cover : null)
  // Liked songs: the rose of its cover, not the first album's colour
  const tint = useArtTint(coverUrl) ?? (p.id === LIKED_ID ? { hue: 12, chroma: 0.9 } : null)

  const songs: ListSong[] = info.rows.filter((r) => r.track).map((r) => ({ id: r.track!.id, len: r.track!.duration || 0 }))
  const current = ctx.active && ctx.currentId ? songs.findIndex((x) => x.id === ctx.currentId) : -1
  const currentRow = ctx.active && ctx.currentId ? info.rows.findIndex((r) => r.track?.id === ctx.currentId) : -1
  const fmtHM = (sec: number) => {
    const m = Math.round(sec / 60)
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
  }
  const kicker = phone ? (smart ? 'Smart playlist' : 'Playlist') : liked ? 'Playlist · updates itself' : smart ? 'Smart playlist · updates itself' : `Playlist · by you · edited ${softDate(fmtAgo(p.updatedAt)).toLowerCase()}`
  const stats = [`${n} ${n === 1 ? 'song' : 'songs'}`, info.seconds ? fmtHM(info.seconds) : null, off && off.done ? `${off.done} offline` : null].filter(Boolean).join(' · ')
  const crumbs = (
    <Crumbs
      fallback={libraryHref('playlists')}
      parts={[
        <a key="l" href={libraryHref('all')}>
          LIBRARY
        </a>,
        <a key="p" href={libraryHref('playlists')}>
          PLAYLISTS
        </a>,
      ]}
    />
  )
  const title = liked ? 'Liked songs' : p.name
  const onEdit = smart ? () => actions.smartPlaylist(p.id) : () => actions.editPlaylist(p.id)
  const offline = off && n > 0 ? <PinOfflineToggle state={off} name={p.name} onPin={() => downloadsStore.pin('playlist', p.id)} onRemove={() => downloadsStore.removePlaylist(p.id)} /> : null

  const buttons = (
    <>
      <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!n}>
        {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
      </Button>
      {phone ? (
        <IconButton icon="shuffle" label="Shuffle" shape="square" className="lh-sq" onClick={() => playPlaylist(p.id, { shuffle: true })} disabled={!n} />
      ) : (
        <Button variant="secondary" icon="shuffle" onClick={() => playPlaylist(p.id, { shuffle: true })} disabled={!n}>
          Shuffle
        </Button>
      )}
      {!liked && (
        <Button variant="secondary" icon={smart ? 'tune' : 'edit'} onClick={onEdit}>
          {smart ? 'Rules' : 'Edit'}
        </Button>
      )}
      {!phone && <IconButton icon="more" label="More" shape="square" className="lh-sq" onClick={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)} />}
    </>
  )

  const rules = smart && (
    <div className="lh-rules">
      {smart.rules.length === 0 && <span className="lh-rule">Your whole library</span>}
      {smart.rules.map((r, i) => (
        <span key={r.id} className="lh-rule">
          {i > 0 && <span className="lh-rule-k">{smart.match === 'all' ? 'and' : 'or'}</span>}
          {describeRule(r)}
        </span>
      ))}
      <span className="lh-rule">
        <span className="lh-rule-k">{smart.limit ? 'Limit' : 'Sort'}</span>
        {smart.limit ? `${smart.limit} songs · ` : ''}
        {describeSort(smart.sort)}
      </span>
    </div>
  )

  const empty =
    info.rows.length === 0 && smart ? (
      <div className="card card-lg card-flush dt-empty">
        <EmptyState
          icon="smart"
          title="Nothing matches yet"
          body="The list fills itself as you add music and listen. Loosen the rules to see more now."
          actions={
            <Button icon="tune" onClick={() => actions.smartPlaylist(p.id)}>
              Edit rules
            </Button>
          }
        />
      </div>
    ) : info.rows.length === 0 && liked ? (
      <div className="card card-lg card-flush dt-empty">
        <EmptyState
          icon="heart"
          title="No liked songs yet"
          body={phone ? 'Tap the heart on any song, or in the player, and it lands here.' : 'Click the heart on any song, or in the player bar, and it lands here. Newest on top.'}
          actions={
            <Button icon="search" onClick={focusLibrarySearch}>
              Find songs
            </Button>
          }
        />
      </div>
    ) : info.rows.length === 0 ? (
      <div className="card card-lg card-flush dt-empty">
        <EmptyState
          icon="playlist"
          title={`${p.name} is empty`}
          body={phone ? 'Add songs from any album: long-press a song or tap ⋮, then Add to playlist.' : 'Add songs from any album, or drag tracks onto the playlist in the sidebar.'}
          actions={
            <Button icon="search" onClick={focusLibrarySearch}>
              Find songs
            </Button>
          }
        />
      </div>
    ) : null

  const likedTools = liked && info.rows.length > 0 && (
    <div className="sl-tools">
      {LIKED_SORTS.map(({ k, label }) => (
        <button key={k} type="button" className={`sl-chip ${likedSort === k ? 'is-on' : ''}`} aria-pressed={likedSort === k} onClick={() => setLikedSort(k)}>
          {label}
        </button>
      ))}
      {!phone && (
        <>
          <span className="lh-flex" />
          <label className="sl-search">
            <Icon name="search" />
            <input value={likedQuery} onChange={(e) => setLikedQuery(e.target.value)} placeholder="Search liked" aria-label="Search liked songs" />
          </label>
        </>
      )}
    </div>
  )

  const list = liked ? (
    <LikedList c={c} rows={info.rows} counts={counts} nowId={now.id} playing={now.playing} phone={phone} sort={likedSort} query={likedQuery} onPlayIds={(ids, start) => playerStore.playQueue(ids, start, context)} />
  ) : (
    <Table c={c} p={p} rows={info.rows} counts={counts} nowId={now.id} playing={now.playing} currentRow={currentRow} onPlay={playRow} onRemove={(r) => removeFromPlaylist(toast, p.id, [r.entry.entryId])} phone={phone} />
  )

  const art = <PlaylistCover playlist={p} size={phone ? 120 : 220} />
  const style = { '--h': tint?.hue ?? 40, '--hc': tint?.chroma ?? 0 } as CSSProperties

  return (
    <div className={`dt-page hue-scope is-legacy-playlist lp ${phone ? 'is-phone' : ''}`} style={style}>
      <div className="dt-wash" aria-hidden />
      {phone ? (
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('playlists'))} />
          <span className="alp-flex" />
          {liked ? <IconButton icon="search" label="Search" onClick={focusLibrarySearch} /> : <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)} />}
        </div>
      ) : (
        crumbs
      )}
      <ListHero
        phone={phone}
        art={art}
        kicker={kicker}
        title={title}
        titleText={title}
        onTitleDoubleClick={liked ? undefined : onEdit}
        line={p.description && !liked ? <span className="lh-desc">{p.description}</span> : undefined}
        stats={stats}
        extra={rules || undefined}
        buttons={buttons}
        aside={!phone && (offline || !liked) ? (
          <>
            {offline}
            {!liked && <span className="lh-sorted">Sorted by · {smart ? describeSort(smart.sort).toLowerCase() : 'your order'}</span>}
          </>
        ) : undefined}
      />
      {likedTools}
      {empty ?? (
        <section className="lp-main">
          {phone && !liked && <UpNext phone songs={songs} current={current} />}
          {list}
        </section>
      )}
      {phone && offline && <div className="lp-off">{offline}</div>}
    </div>
  )
}

/* ── Table ──────────────────────────────────────────── */

interface Drag {
  entryId: string
  from: number
  over: number | null
  after: boolean
}

function Table({
  c,
  p,
  rows,
  nowId,
  playing,
  currentRow,
  onPlay,
  onRemove,
  phone,
  counts,
}: {
  c: Catalogue
  p: Playlist
  rows: PlaylistRow[]
  counts: Map<string, number>
  nowId: string | null
  playing: boolean
  /** the row playing from this playlist, or -1 */
  currentRow: number
  onPlay: (r: PlaylistRow, i: number) => void
  onRemove: (r: PlaylistRow) => void
  phone: boolean
}) {
  const [drag, setDragState] = useState<Drag | null>(null)
  const likedIx = useLikedIndex()
  const dragRef = useRef<Drag | null>(null)
  /** state for rendering, ref for the event handlers (they run before a re-render) */
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }

  const drop = (d: Drag | null) => {
    setDrag(null)
    if (!d || d.over === null) return
    let to = d.over + (d.after ? 1 : 0)
    if (d.from < to) to--
    if (to !== d.from) playlistsStore.moveEntry(p.id, d.entryId, to)
  }

  /* desktop: HTML drag and drop on the whole row (also carries the track to the sidebar) */
  const onDragStart = (r: PlaylistRow, i: number) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData(ENTRY_MIME, r.entry.entryId)
    if (r.track) e.dataTransfer.setData(DRAG_MIME, JSON.stringify([r.track.id]))
    e.dataTransfer.setData('text/plain', r.track ? `${r.track.title} · ${r.track.artist}` : r.entry.title)
    document.documentElement.setAttribute('data-dragging-tracks', '')
    setDrag({ entryId: r.entry.entryId, from: i, over: null, after: false })
  }
  const onDragOver = (i: number) => (e: DragEvent) => {
    if (!dragRef.current || !e.dataTransfer.types.includes(ENTRY_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > box.top + box.height / 2
    const d = dragRef.current
    if (d.over !== i || d.after !== after) setDrag({ ...d, over: i, after })
  }
  const onDragEnd = () => {
    document.documentElement.removeAttribute('data-dragging-tracks')
    setDrag(null)
  }

  /* phone: drag from the grip (pointer events), auto-scroll near the edges */
  const onGripDown = (r: PlaylistRow, i: number) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const start: Drag = { entryId: r.entry.entryId, from: i, over: i, after: false }
    setDrag(start)
    const main = document.getElementById('main')
    let raf = 0
    let lastY = e.clientY
    const tick = () => {
      raf = 0
      if (!main) return
      const edge = 90
      const bottomEdge = window.innerHeight - 220
      const v = lastY < edge ? -(edge - lastY) / 6 : lastY > bottomEdge ? (lastY - bottomEdge) / 6 : 0
      if (v) {
        main.scrollTop += v
        raf = requestAnimationFrame(tick)
      }
    }
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.slr[data-i]')
      if (el) {
        const box = el.getBoundingClientRect()
        const over = Number(el.dataset.i)
        const after = ev.clientY > box.top + box.height / 2
        const d = dragRef.current
        if (d && (d.over !== over || d.after !== after)) setDrag({ ...d, over, after })
      }
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cancelAnimationFrame(raf)
      drop(dragRef.current)
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cancelAnimationFrame(raf)
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  return (
    <div
      className={`sl sl-pl ${p.smart || p.id === LIKED_ID ? 'is-fixed' : ''} ${drag ? 'is-dragging' : ''}`}
      role="list"
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(ENTRY_MIME)) return
        e.preventDefault()
        drop(dragRef.current)
      }}
    >
      {!phone && <ListHead cols={[...(p.smart || p.id === LIKED_ID ? [] : [null]), '#', null, 'Title', 'Album', p.smart ? 'Plays' : 'Added', null, 'Time', null]} />}
      {rows.map((r, i) => (
        <Row
          key={r.entry.entryId}
          c={c}
          p={p}
          r={r}
          i={i}
          current={!!r.track && nowId === r.track.id}
          plays={r.track ? (counts.get(r.track.id) ?? 0) : 0}
          liked={!!r.track && likedIx.ids.has(r.track.id)}
          playing={playing}
          played={currentRow >= 0 && i < currentRow}
          dropLine={drag && drag.over === i && drag.from !== i ? (drag.after ? 'after' : 'before') : null}
          dragging={drag?.from === i}
          phone={phone}
          onPlay={() => onPlay(r, i)}
          onRemove={() => onRemove(r)}
          dragProps={
            p.smart || p.id === LIKED_ID
              ? // smart rows / Liked songs (newest first) can't be reordered; they still drag onto a sidebar playlist
                phone
                ? null
                : { draggable: true, onDragStart: onDragStart(r, i), onDragOver: () => {}, onDragEnd }
              : phone
                ? null
                : { draggable: true, onDragStart: onDragStart(r, i), onDragOver: onDragOver(i), onDragEnd }
          }
          onGripDown={onGripDown(r, i)}
        />
      ))}
    </div>
  )
}

function Row({
  c,
  p,
  r,
  i,
  current,
  plays,
  liked,
  playing,
  played,
  dropLine,
  dragging,
  phone,
  onPlay,
  onRemove,
  dragProps,
  onGripDown,
}: {
  c: Catalogue
  p: Playlist
  r: PlaylistRow
  i: number
  current: boolean
  plays: number
  liked: boolean
  playing: boolean
  played: boolean
  dropLine: 'before' | 'after' | null
  dragging: boolean
  phone: boolean
  onPlay: () => void
  onRemove: () => void
  dragProps: { draggable: boolean; onDragStart: (e: DragEvent) => void; onDragOver: (e: DragEvent) => void; onDragEnd: () => void } | null
  onGripDown: (e: ReactPointerEvent) => void
}) {
  const t = r.track
  const album = t ? c.albums[t.albumId] : undefined
  const target = t ? (p.smart ? ({ kind: 'track', trackId: t.id } as const) : ({ kind: 'track', trackId: t.id, playlistId: p.id, entryId: r.entry.entryId } as const)) : null
  const missing = !t
  const reorder = !p.smart && p.id !== LIKED_ID
  const artist = t ? (
    <a href={artistHref(t.artistId)} draggable={false}>
      {t.artist}
    </a>
  ) : (
    r.entry.artist
  )
  const albumLink = album ? (
    <a href={albumHref(album.id)} draggable={false}>
      {album.title}
    </a>
  ) : null
  return (
    <SongRow
      phone={phone}
      n={String(i + 1)}
      art={<RowCover fileId={album?.cover} />}
      title={t?.title ?? r.entry.title}
      sub={
        missing ? (
          `${r.entry.artist} · not in your library`
        ) : phone ? (
          <>
            {artist}
            {album ? ' · ' : ''}
            {albumLink}
          </>
        ) : (
          artist
        )
      }
      liked={liked}
      colA={missing ? 'Not in your library' : albumLink}
      colB={p.smart ? playsLabel(plays) : softAdded(r.entry.addedAt)}
      like={t ? <LikeButton trackId={t.id} size="xs" hover /> : null}
      time={t?.duration ? fmtClock(t.duration) : '—'}
      current={current}
      playing={playing}
      played={played}
      dim={missing}
      onPlay={t ? onPlay : undefined}
      onMore={target ? (e) => actions.menu(target, e) : undefined}
      end={missing ? <IconButton icon="x" label="Remove from playlist" size="sm" onClick={(e) => (e.stopPropagation(), onRemove())} /> : undefined}
      grip={
        !reorder ? undefined : phone ? (
          <span className="dt-grip" aria-label="Drag to reorder" role="button" tabIndex={-1} onPointerDown={onGripDown}>
            <Icon name="drag" />
          </span>
        ) : (
          <span aria-hidden>⠿</span>
        )
      }
      className={[dragging && 'is-drag', dropLine && `drop-${dropLine}`].filter(Boolean).join(' ')}
      rowProps={{ ...(dragProps ?? {}), 'data-i': i }}
    />
  )
}

/** "2 DAYS AGO" / "12 MAR" for the Added column. */
function softAdded(iso: string): string {
  return iso ? fmtAgo(iso) : ''
}
