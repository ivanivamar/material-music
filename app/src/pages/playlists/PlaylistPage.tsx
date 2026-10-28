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
import { IconButton, Button, EmptyState, formatTime, useToast, type DownloadState } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { actions, DRAG_MIME } from '../../actions/actions'
import { playPlaylist, removeFromPlaylist } from '../../actions/ops'
import { albumHref, artistHref, libraryHref } from '../../shell/routes'
import { downloadsStore, playlistOffline, useDownloadProgress, useDownloads } from '../../state/downloads'
import { useLibrary, type Catalogue } from '../../state/library'
import { playerStore } from '../../state/player'
import { fmtAgo, playlistInfo, type PlaylistRow } from '../../state/playlistViews'
import { playlistsStore, usePlaylists, type Playlist } from '../../state/playlists'
import { focusLibrarySearch } from '../../state/search'
import { describeRule, describeSort, type Rule } from '../../state/smart'
import { useIsPhone } from '../../state/viewport'
import { fmtTotal } from '../../state/views'
import { trackDownload } from '../library/DownloadButton'
import { PinOfflineToggle } from '../library/OfflineToggle'
import { ActBtn, DetailBack, DtList, DtRow, MoreBtn, softDate, titleSize } from '../library/detail'
import { useContextState, useNowPlaying } from '../library/playback'
import { PlaylistCover } from './PlaylistCover'
import './playlists.css'

const RULE_ICON: Record<Rule['field'], IconName> = { added: 'calendar', lastPlayed: 'history', plays: 'history', playsIn: 'stats', genre: 'label', artist: 'artist', album: 'album', title: 'song', decade: 'calendar', year: 'calendar' }
const ENTRY_MIME = 'application/x-pelagic-entry'

export function PlaylistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const { byId, loaded } = usePlaylists()
  const p = byId.get(id)
  if (!data) return null
  if (!p)
    return (
      <div className="dt-page">
        <DetailBack fallback={libraryHref('playlists')} parts={[{ label: 'Library', href: libraryHref('all') }, { label: 'Playlists', href: libraryHref('playlists') }]} />
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
  const dlNow = useDownloadProgress()
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
  const n = info.ids.length
  const stats = [`${n} ${n === 1 ? 'track' : 'tracks'}`, info.seconds ? fmtTotal(info.seconds) : null, off && off.done ? `${off.done} offline` : null, info.missing ? `${info.missing} not in your library` : null]
    .filter(Boolean)
    .join(' · ')
  const firstCover = info.rows.find((r) => r.track)?.track
  const coverUrl = useCover(p.cover ? null : firstCover ? c.albums[firstCover.albumId]?.cover : null)
  const tint = useArtTint(coverUrl)

  return (
    <div className="dt-page hue-scope" style={{ '--h': tint?.hue ?? 40, '--hc': tint?.chroma ?? 0 } as CSSProperties}>
      <div className="dt-wash" aria-hidden />
      <DetailBack fallback={libraryHref('playlists')} parts={[{ label: 'Library', href: libraryHref('all') }, { label: 'Playlists', href: libraryHref('playlists') }]} />

      <header className="dt-hero">
        <div className="dt-art">
          <button type="button" className="dt-art-btn" onClick={() => actions.editPlaylist(p.id)} aria-label="Edit cover and details" title="Edit details">
            <PlaylistCover playlist={p} className="dt-hero-cover" />
          </button>
        </div>
        <div className="dt-hero-text">
          {smart ? (
            <div className="dt-kicker is-smart">
              <Icon name="smart" />
              Smart playlist · Updates itself
            </div>
          ) : (
            <div className="dt-kicker">Playlist · By you · Updated {softDate(fmtAgo(p.updatedAt))}</div>
          )}
          <h1 className="dt-title" style={{ '--ts': `${titleSize(p.name)}px` } as CSSProperties} title={p.name} onDoubleClick={() => actions.editPlaylist(p.id)}>
            {p.name}
          </h1>
          {p.description && <div className="dt-desc">{p.description}</div>}
          <div className="dt-line">
            <span className="dt-stats">{stats}</span>
          </div>
        </div>
      </header>

      {smart && (
        <div className="dt-rules">
          <div className="dt-rules-k">
            <Icon name="sync" />
            Rules
          </div>
          <div className="dt-rules-list">
            {smart.rules.length === 0 && (
              <span className="dt-rule">
                <Icon name="library" />
                <span className="dt-rule-t">Your whole library</span>
              </span>
            )}
            {smart.rules.map((r, i) => (
              <span key={r.id} className="dt-rule">
                <Icon name={RULE_ICON[r.field] ?? 'tune'} />
                <span className="dt-rule-t">
                  {i > 0 && <span className="dt-rule-k">{smart.match === 'all' ? 'and ' : 'or '}</span>}
                  {describeRule(r)}
                </span>
              </span>
            ))}
            <span className="dt-rule">
              <Icon name="filter" />
              <span className="dt-rule-t">
                <span className="dt-rule-k">{smart.limit ? 'Limit ' : 'Sort '}</span>
                {smart.limit ? `${smart.limit} songs · ` : ''}
                {describeSort(smart.sort)}
              </span>
            </span>
          </div>
          <Button variant="secondary" icon="edit" onClick={() => actions.smartPlaylist(p.id)}>
            Edit rules
          </Button>
        </div>
      )}

      <div className="dt-actions">
        <ActBtn kind="filled" icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!n}>
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
        </ActBtn>
        <ActBtn kind="tonal" icon="shuffle" onClick={() => playPlaylist(p.id, { shuffle: true })} disabled={!n}>
          Shuffle
        </ActBtn>
        <MoreBtn onClick={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)} />
        <span className="dt-flex" />
        {off && n > 0 && <PinOfflineToggle state={off} name={p.name} onPin={() => downloadsStore.pin('playlist', p.id)} onRemove={() => downloadsStore.removePlaylist(p.id)} />}
      </div>

      {info.rows.length === 0 && smart ? (
        <div className="dt-empty">
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
      ) : info.rows.length === 0 ? (
        <div className="dt-empty">
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
      ) : (
        <Table
          c={c}
          p={p}
          rows={info.rows}
          showStat={(info.statLabel ?? 'ADDED') !== 'ADDED' || !phone}
          nowId={now.id}
          playing={now.playing}
          dl={dl.available ? (r) => (r.track ? (trackDownload(dl, r.track, dlNow) ?? { kind: 'none' }) : undefined) : null}
          onPlay={playRow}
          onRemove={(r) => removeFromPlaylist(toast, p.id, [r.entry.entryId])}
          phone={phone}
        />
      )}
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
  showStat,
  nowId,
  playing,
  dl,
  onPlay,
  onRemove,
  phone,
}: {
  c: Catalogue
  p: Playlist
  rows: PlaylistRow[]
  showStat: boolean
  nowId: string | null
  playing: boolean
  dl: ((r: PlaylistRow) => DownloadState | undefined) | null
  onPlay: (r: PlaylistRow, i: number) => void
  onRemove: (r: PlaylistRow) => void
  phone: boolean
}) {
  const [drag, setDragState] = useState<Drag | null>(null)
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.dt-row[data-i]')
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
    <DtList
      className={`has-cover ${drag ? 'is-dragging' : ''}`}
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(ENTRY_MIME)) return
        e.preventDefault()
        drop(dragRef.current)
      }}
    >
      {rows.map((r, i) => (
        <Row
          key={r.entry.entryId}
          c={c}
          p={p}
          r={r}
          i={i}
          current={!!r.track && nowId === r.track.id}
          playing={playing}
          hasDl={!!dl}
          download={dl?.(r)}
          showStat={showStat}
          dropLine={drag && drag.over === i && drag.from !== i ? (drag.after ? 'after' : 'before') : null}
          dragging={drag?.from === i}
          phone={phone}
          onPlay={() => onPlay(r, i)}
          onRemove={() => onRemove(r)}
          dragProps={
            p.smart
              ? // smart rows can't be reordered; they still drag onto a sidebar playlist
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
    </DtList>
  )
}

function Row({
  c,
  p,
  r,
  i,
  current,
  playing,
  hasDl,
  download,
  showStat,
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
  hasDl: boolean
  download: DownloadState | undefined
  showStat: boolean
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
  const stat = useMemo(() => r.stat || softDate(fmtAgo(r.entry.addedAt)), [r.stat, r.entry.addedAt])
  const missing = !t

  return (
    <DtRow
      n={i + 1}
      showCover
      cover={album?.cover}
      title={t?.title ?? r.entry.title}
      sub={
        t ? (
          <>
            <a href={artistHref(t.artistId)} draggable={false}>
              {t.artist}
            </a>
            {album && (
              <>
                <span>·</span>
                <a href={albumHref(album.id)} draggable={false}>
                  {album.title}
                </a>
              </>
            )}
          </>
        ) : (
          <>
            <span className="dt-s-t">{r.entry.artist}</span>
            <span className="dt-gone">· not in your library</span>
          </>
        )
      }
      current={current}
      playing={playing}
      dim={missing}
      hasDl={hasDl}
      dl={t ? download : undefined}
      stat={showStat && !phone ? stat : undefined}
      duration={t?.duration ? formatTime(t.duration) : phone && missing ? '' : '—'}
      onPlay={t ? onPlay : undefined}
      onMore={target ? (e) => actions.menu(target, e) : undefined}
      end={
        missing ? (
          <IconButton icon="x" label="Remove from playlist" onClick={(e) => (e.stopPropagation(), onRemove())} />
        ) : undefined
      }
      grip={
        phone && !p.smart ? (
          <span className="dt-grip" aria-label="Drag to reorder" role="button" tabIndex={-1} onPointerDown={onGripDown}>
            <Icon name="drag" />
          </span>
        ) : undefined
      }
      className={[dragging && 'is-drag', dropLine && `drop-${dropLine}`].filter(Boolean).join(' ')}
      rowProps={{ ...(dragProps ?? {}), 'data-i': i }}
    />
  )
}
