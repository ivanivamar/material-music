/**
 * Playlist + smart playlist (Material redesign, PlaylistMaterial / SmartPlaylistMaterial.dc.html):
 *
 *   ← Library › Playlists
 *   [264 cover / mosaic, click = edit]   Playlist · By you · Updated 2 days ago (coral; smart: ✦ yellow)
 *                                        Heavy water (57px, double-click = edit) · description
 *                                        42 tracks · 2:51:10 · 38 offline
 *   (smart) [⟳ Rules  (history Never played) (calendar Added in the last 3 months) …      ✎ Edit rules]
 *   [▶ Play] [⤮ Shuffle] ⋮                                        Available offline ⏽ (Android)
 *   ┌ 1 [cover] Wildfire · Periphery · Periphery V            ✓  6:59 ⋮ ┐ (segmented rows)
 *
 * Rows: click plays the playlist from there, right-click / ⋮ = track menu with "Remove from …",
 * drag to reorder (desktop: the whole row, which can also be dropped on a sidebar playlist; phone:
 * the grip). Songs that left the library stay as dimmed rows with ✕ until removed.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { IconButton, Button, EmptyState, useToast } from '../../components/ui'
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
import { focusLibrarySearch } from '../../state/search'
import { describeRule, describeSort } from '../../state/smart'
import { useIsPhone } from '../../state/viewport'
import { PinOfflineToggle } from '../library/OfflineToggle'
import { softDate, titleSize } from '../library/detail'
import { Crumbs } from '../library/common'
import { back } from '../../shell/routes'
import { SnHead, SnRow, SnSection } from '../../components/sonar/SnList'
import { LikedList, type LikedListApi, type LikedSort } from './LikedList'
import { useContextState, useNowPlaying } from '../library/playback'
import { ListRing } from '../../components/sonar/ListRing'
import { LikedRing } from '../../components/sonar/LikedRing'
import { fmtClock, fmtLeft, usePlayCounts, useTimeLeft, type SonarSong } from '../../components/sonar/Sonar'

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

function PlaylistView({ c, p }: { c: Catalogue; p: Playlist }) {
  const info = playlistInfo(c, p)
  const ctx = useContextState('playlist', p.id)
  const now = useNowPlaying()
  const dl = useDownloads()
  const phone = useIsPhone()
  const toast = useToast()
  const off = dl.available ? playlistOffline(dl, c, p) : null

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
  const counts = usePlayCounts()

  // the ring beside the list: playable rows in order (while a row is dragged, in the order it would drop in)
  const [held, setPreview] = useState<{ from: number; to: number; rows: PlaylistRow[] } | null>(null)
  // after a drop the new order arrives a moment later: hold the preview until it does (or 800 ms,
  // for a cancelled drag) so the ring doesn't snap back and forward again
  const holdTimer = useRef(0)
  const onDragChange = (d: { from: number; to: number } | null) => {
    window.clearTimeout(holdTimer.current)
    if (d) setPreview({ ...d, rows: info.rows })
    else holdTimer.current = window.setTimeout(() => setPreview(null), 800)
  }
  // only while the rows it was made for are on screen: once the new order lands it's spent
  const preview = held && held.rows === info.rows ? held : null
  const songs: SonarSong[] = useMemo(() => {
    const rows = info.rows.map((r, i) => ({ r, lifted: !!preview && i === preview.from }))
    if (preview && preview.from !== preview.to) {
      const [moved] = rows.splice(preview.from, 1)
      rows.splice(preview.to, 0, moved)
    }
    return rows.filter(({ r }) => r.track).map(({ r, lifted }) => ({ id: r.track!.id, len: r.track!.duration || 0, title: r.track!.title, group: r.track!.artistId, lifted }))
  }, [info.rows, preview])
  const ringCurrent = ctx.active && ctx.currentId ? songs.findIndex((x) => x.id === ctx.currentId) : -1
  const pickSong = (i: number) => {
    if (ctx.active && ctx.currentId === info.ids[i]) return playerStore.toggle()
    playerStore.playQueue(info.ids, i, context)
  }
  const likedRows = useMemo(
    () => (liked ? info.rows.map((r, i) => ({ at: Date.parse(r.entry.addedAt) || 0, trackId: r.track?.id ?? null, i })) : []),
    [liked, info.rows],
  )
  // Liked: which year the ring shows, and which likes are on screen (the sweep follows the list)
  const [likedYear, setLikedYear] = useState<'last' | number>('last')
  const likedYears = useMemo(() => {
    if (!liked) return [] as ('last' | number)[]
    const cut = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).getTime()
    const ys = new Set<number>()
    for (const r of likedRows) if (r.at && r.at < cut) ys.add(new Date(r.at).getFullYear())
    return ['last' as const, ...[...ys].sort((a, b) => b - a).slice(0, 3)]
  }, [liked, likedRows])
  const [likedView, setLikedView] = useState<[number, number] | null>(null)
  const [likedSort, setLikedSort] = useState<LikedSort>('newest')
  const [likedQuery, setLikedQuery] = useState('')
  const likedApi = useRef<LikedListApi | null>(null)
  const jumpTo = (i: number) => likedApi.current?.jumpToRow(i)
  const ring = (size: number, compact: boolean) =>
    liked ? (
      <LikedRing rows={likedRows} counts={counts} nowId={now.id} size={size} onJump={jumpTo} compact={compact} year={likedYear} view={likedView} />
    ) : (
      <ListRing
        songs={songs}
        current={ringCurrent}
        playing={ctx.playing}
        size={size}
        onPick={pickSong}
        onPlay={onPlay}
        bands={!smart}
        legend={compact ? undefined : smart ? ['length', 'ticks'] : ['length', 'band', 'ticks']}
        label={`${p.name} as a ring: one arc per song, sized by its length`}
        compact={compact}
      />
    )

  const reorderable = !smart && !liked
  const currentRow = ctx.active && ctx.currentId ? info.rows.findIndex((r) => r.track?.id === ctx.currentId) : -1
  const fmtHM = (sec: number) => {
    const m = Math.round(sec / 60)
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
  }
  const meta = liked
    ? `${n} · ${Math.round(info.seconds / 3600)} h`
    : [`${n} ${n === 1 ? 'song' : 'songs'}`, info.seconds ? fmtHM(info.seconds) : null, smart ? 'smart · updates itself' : 'yours', smart ? null : `edited ${softDate(fmtAgo(p.updatedAt)).toLowerCase()}`].filter(Boolean).join(' · ')
  const crumbs = (
    <Crumbs
      fallback={libraryHref('playlists')}
      parts={[
        <a key="l" href={libraryHref('all')}>
          LIBRARY
        </a>,
        liked ? (
          <span key="p">LIKED</span>
        ) : (
          <a key="p" href={libraryHref('playlists')}>
            PLAYLISTS
          </a>
        ),
      ]}
    />
  )
  const title = liked ? 'Liked' : p.name
  const onEdit = smart ? () => actions.smartPlaylist(p.id) : () => actions.editPlaylist(p.id)
  const playBtn = (cls?: string) => (
    <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!n} className={cls}>
      {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : liked ? 'Play all' : 'Play'}
    </Button>
  )
  const shuffleBtn = <IconButton icon="shuffle" label="Shuffle" shape="square" className="snp-sq" onClick={() => playPlaylist(p.id, { shuffle: true })} disabled={!n} />
  const moreBtn = <IconButton icon="more" label="More" shape="square" className="snp-sq" onClick={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)} />
  const offline = off && n > 0 ? <PinOfflineToggle state={off} name={p.name} onPin={() => downloadsStore.pin('playlist', p.id)} onRemove={() => downloadsStore.removePlaylist(p.id)} /> : null

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

  const list = liked ? (
    <LikedList c={c} p={p} rows={info.rows} counts={counts} nowId={now.id} playing={now.playing} phone={phone} sort={likedSort} query={likedQuery} onView={setLikedView} apiRef={likedApi} onPlayIds={(ids, start) => playerStore.playQueue(ids, start, context)} />
  ) : (
    <Table
      c={c}
      p={p}
      rows={info.rows}
      nowId={now.id}
      playing={now.playing}
      currentRow={currentRow}
      onPlay={playRow}
      onRemove={(r) => removeFromPlaylist(toast, p.id, [r.entry.entryId])}
      phone={phone}
      onDragChange={reorderable ? onDragChange : undefined}
    />
  )

  const rules = smart && (
    <div className="snp-rules">
      {smart.rules.length === 0 && <span className="snp-rule">Your whole library</span>}
      {smart.rules.map((r, i) => (
        <span key={r.id} className="snp-rule">
          {i > 0 && <span className="snp-rule-k">{smart.match === 'all' ? 'and ' : 'or '}</span>}
          {describeRule(r)}
        </span>
      ))}
      <span className="snp-rule">
        <span className="snp-rule-k">{smart.limit ? 'Limit ' : 'Sort '}</span>
        {smart.limit ? `${smart.limit} songs · ` : ''}
        {describeSort(smart.sort)}
      </span>
    </div>
  )

  if (phone)
    return (
      <div className="dt-page hue-scope is-legacy-playlist snpage is-phone" style={{ '--h': tint?.hue ?? 40, '--hc': tint?.chroma ?? 0 } as CSSProperties}>
        <div className="dt-wash" aria-hidden />
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('playlists'))} />
          <span className="alp-flex" />
          {liked ? <IconButton icon="search" label="Search" onClick={focusLibrarySearch} /> : moreBtn}
        </div>
        <div className="snp-phead">
          <div className="snp-ptext">
            <h1 className="snp-ptitle">{title}</h1>
            <div className="snp-plab">{liked ? `${n} songs · ${Math.round(info.seconds / 3600)} h · newest first` : [`${n} songs`, info.seconds ? fmtHM(info.seconds) : null, smart ? 'smart' : 'yours'].filter(Boolean).join(' · ')}</div>
          </div>
          {liked && (
            <div className="snp-pbtns">
              {shuffleBtn}
              <IconButton icon={ctx.playing ? 'pauseF' : 'playF'} label={ctx.playing ? 'Pause' : 'Play all'} shape="square" className="snp-sq is-filled" onClick={onPlay} disabled={!n} />
            </div>
          )}
        </div>
        {!liked && (
          <div className="alp-btns" style={{ marginTop: 14 }}>
            {playBtn('alp-play')}
            {shuffleBtn}
            <Button variant="secondary" onClick={onEdit} className="snp-edit">
              Edit
            </Button>
          </div>
        )}
        {rules}
        {empty ?? (
          <>
            <div className="sn-phone-ring">{ring(liked ? 300 : 300, true)}</div>
            {!liked && <UpNext songs={songs} current={ringCurrent} />}
            {list}
          </>
        )}
        {offline && <div className="snp-poff">{offline}</div>}
      </div>
    )

  return (
    <div className="dt-page hue-scope is-legacy-playlist snpage" style={{ '--h': tint?.hue ?? 40, '--hc': tint?.chroma ?? 0 } as CSSProperties}>
      <div className="dt-wash" aria-hidden />
      <div className="snp">
        <aside className="snp-side">
          {crumbs}
          <div className={`snp-head ${liked ? 'is-row' : ''}`}>
            <h1 className="snp-title" style={{ '--ts': `${Math.min(52, titleSize(title))}px` } as CSSProperties} title={p.name} onDoubleClick={liked ? undefined : onEdit}>
              {title}
            </h1>
            <span className="snp-meta">{meta}</span>
          </div>
          {p.description && !liked && <div className="snp-desc">{p.description}</div>}
          {rules}
          {info.rows.length > 0 && (
            <div className="snp-ring">
              {ring(380, false)}
            </div>
          )}
          {liked && info.rows.length > 0 && (
            <>
              <div className="snp-chips-w">
                <div className="sn-lab" style={{ color: 'var(--ink-secondary)' }}>
                  Year on the ring
                </div>
                <div className="snp-chips">
                  {likedYears.map((y) => (
                    <button key={y} type="button" className={`snp-chip ${likedYear === y ? 'is-on' : ''}`} onClick={() => setLikedYear(y)}>
                      {y === 'last' ? 'Last 12 months' : y}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sn-legend">
                <div className="sn-legend-row">
                  <span className="sn-legend-sw">
                    <i />
                  </span>
                  Arc · a month, all the same size
                </div>
                <div className="sn-legend-row">
                  <span className="sn-legend-sw">
                    <i className="is-dot" />
                  </span>
                  Blip · a like · brighter = more plays
                </div>
                <div className="sn-legend-row">
                  <span className="sn-legend-sw">
                    <i className="is-win" />
                  </span>
                  Bright edge · the likes on screen
                </div>
                <div className="sn-legend-row" style={{ color: 'var(--ink-secondary)', marginTop: 6 }}>
                  Drag the sweep or tap a month to jump
                </div>
              </div>
            </>
          )}
          {reorderable && info.rows.length > 1 && <div className="sn-legend-row" style={{ color: 'var(--ink-secondary)' }}>Drag a row and its arc moves with it</div>}
        </aside>

        <section className="snp-main">
          <div className="snp-bar">
            {playBtn('snp-play')}
            {shuffleBtn}
            {!liked && (
              <Button variant="secondary" onClick={onEdit} className="snp-edit">
                {smart ? 'Edit rules' : 'Edit'}
              </Button>
            )}
            {moreBtn}
            <span className="snp-flex" />
            {offline}
            {!liked && <span className="snp-sorted">Sorted by · {smart ? describeSort(smart.sort).toLowerCase() : 'your order'}</span>}
            {liked && (
              <>
                <label className="snp-search">
                  <Icon name="search" />
                  <input value={likedQuery} onChange={(e) => setLikedQuery(e.target.value)} placeholder="Search liked" aria-label="Search liked songs" />
                </label>
                {(['newest', 'plays', 'az'] as const).map((k) => (
                  <button key={k} type="button" className={`snp-chip ${likedSort === k ? 'is-on' : ''}`} onClick={() => setLikedSort(k)}>
                    {k === 'newest' ? 'Newest' : k === 'plays' ? 'Plays' : 'A–Z'}
                  </button>
                ))}
              </>
            )}
          </div>
          {empty ?? list}
        </section>
      </div>
    </div>
  )
}

/** "Up next ——— 1 h 44 min left" over a phone list. */
function UpNext({ songs, current }: { songs: SonarSong[]; current: number }) {
  if (current < 0) return <SnSection label="Songs" phone right={`${songs.length}`} />
  return <UpNextLive songs={songs} current={current} />
}
function UpNextLive({ songs, current }: { songs: SonarSong[]; current: number }) {
  const left = useTimeLeft(songs, current)
  return (
    <div className="snp-upnext">
      <span className="sn-lab" style={{ color: 'var(--ink-primary)' }}>
        Up next
      </span>
      <span className="sect-line" />
      <span className="sn-lab">{fmtLeft(left)}</span>
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
  onDragChange,
}: {
  c: Catalogue
  p: Playlist
  rows: PlaylistRow[]
  nowId: string | null
  playing: boolean
  /** the row playing from this playlist, or -1 */
  currentRow: number
  onPlay: (r: PlaylistRow, i: number) => void
  onRemove: (r: PlaylistRow) => void
  phone: boolean
  /** the row being dragged and where it would land (row indices), for the ring's preview */
  onDragChange?: (d: { from: number; to: number } | null) => void
}) {
  const [drag, setDragState] = useState<Drag | null>(null)
  useEffect(() => {
    if (!onDragChange) return
    if (!drag) return onDragChange(null)
    let to = drag.over == null ? drag.from : drag.over + (drag.after ? 1 : 0)
    if (to > drag.from) to -= 1
    onDragChange({ from: drag.from, to })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.from, drag?.over, drag?.after, drag == null])
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.snr[data-i]')
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
      className={`snl snl-pl ${drag ? 'is-dragging' : ''}`}
      role="list"
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(ENTRY_MIME)) return
        e.preventDefault()
        drop(dragRef.current)
      }}
    >
      {!phone && <SnHead grip cols={['#', null, 'Title', 'Artist', 'Album', 'Time']} />}
      {rows.map((r, i) => (
        <Row
          key={r.entry.entryId}
          c={c}
          p={p}
          r={r}
          i={i}
          current={!!r.track && nowId === r.track.id}
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
  return (
    <SnRow
      phone={phone}
      n={String(i + 1).padStart(2, '0')}
      len={t?.duration ?? 0}
      title={t?.title ?? r.entry.title}
      colA={artist}
      colB={album ? (
        <a href={albumHref(album.id)} draggable={false}>
          {album.title}
        </a>
      ) : missing ? (
        'not in your library'
      ) : null}
      sub={missing ? `${r.entry.artist} · not in your library` : artist}
      time={t?.duration ? fmtClock(t.duration) : '—'}
      meta={t?.duration ? fmtClock(t.duration) : ''}
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
