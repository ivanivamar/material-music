/**
 * Playlist (handoff 09 Desktop Playlist): 200px cover (custom image or 2×2 mosaic),
 * PLAYLIST · BY YOU · UPDATED …, hero name, description, N TRACKS · length (· N OFFLINE),
 * Play · Shuffle · (Download, Android) · ⋯, then the table:
 *
 *   #  TITLE (cover · title / artist)   ALBUM   QUALITY   ADDED   🕒   ⋯
 *
 * Rows: double-click (tap on touch) plays the playlist from there, right-click / ⋯ = track menu
 * with "Remove from <playlist>", drag to reorder (desktop: the whole row, which can also be dropped
 * on another playlist in the sidebar; phone: the grip). Songs that left the library stay as dimmed
 * "not in your library" rows until removed.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Button, DownloadIcon, EmptyState, Eq, IconButton, QualityBadge, formatTime, qualityKind, qualityLabel, useToast, type DownloadState } from '../../components/ui'
import { Icon } from '../../design/icons'
import { useLazyCover } from '../../lib/covers'
import { actions, DRAG_MIME } from '../../actions/actions'
import { playPlaylist, removeFromPlaylist } from '../../actions/ops'
import { albumHref, artistHref, go, href, libraryHref } from '../../shell/routes'
import { downloadsStore, playlistOffline, useDownloadProgress, useDownloads } from '../../state/downloads'
import { useLibrary, type Catalogue } from '../../state/library'
import { playerStore } from '../../state/player'
import { fmtAgo, playlistInfo, type PlaylistRow } from '../../state/playlistViews'
import { playlistsStore, usePlaylists, type Playlist } from '../../state/playlists'
import { describeSmart, describeSort } from '../../state/smart'
import { isTouch, useIsPhone } from '../../state/viewport'
import { fmtTotal, plural } from '../../state/views'
import { Crumbs } from '../library/common'
import { DownloadButton, trackDownload } from '../library/DownloadButton'
import { useContextState, useNowPlaying } from '../library/playback'
import { PlaylistCover } from './PlaylistCover'
import '../library/library.css'
import './playlists.css'

const heroSize = (t: string) => (t.length <= 16 ? 72 : t.length <= 28 ? 60 : t.length <= 44 ? 48 : 40)
const ENTRY_MIME = 'application/x-pelagic-entry'

export function PlaylistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const { byId, loaded } = usePlaylists()
  const p = byId.get(id)
  if (!data) return null
  if (!p)
    return (
      <>
        <Crumbs fallback={libraryHref('playlists')} parts={[<a key="l" href={libraryHref('playlists')}>LIBRARY</a>, <a key="p" href={libraryHref('playlists')}>PLAYLISTS</a>]} />
        {loaded && (
          <div className="placeholder">
            <EmptyState icon="playlist" title="This playlist isn’t here." body="It may have been deleted on another device." />
          </div>
        )}
      </>
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
  const meta = (smart ? ['SMART PLAYLIST', 'UPDATES ITSELF'] : ['PLAYLIST', 'BY YOU', `UPDATED ${fmtAgo(p.updatedAt)}`]).join(' · ')
  const stats = [plural(info.ids.length, 'TRACK'), info.seconds ? fmtTotal(info.seconds) : null, off && off.done ? `${off.done} OFFLINE` : null, info.missing ? `${info.missing} NOT IN LIBRARY` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="pl-page">
      <Crumbs fallback={libraryHref('playlists')} parts={[<a key="l" href={libraryHref('playlists')}>LIBRARY</a>, <a key="p" href={libraryHref('playlists')}>PLAYLISTS</a>]} />

      <header className="pl-hero">
        <button type="button" className="pl-hero-cover" onClick={() => actions.editPlaylist(p.id)} aria-label="Edit cover and details" title="Edit details">
          <PlaylistCover playlist={p} className="pl-cover-200" />
        </button>
        <div className="pl-hero-text">
          <div className="hero-meta">{meta}</div>
          <h1 className="hero-title pl-title" style={{ '--hs': `${heroSize(p.name)}px` } as CSSProperties} title={p.name} onDoubleClick={() => actions.editPlaylist(p.id)}>
            {p.name}
          </h1>
          {p.description && <div className="pl-desc">{p.description}</div>}
          {smart && (
            <button type="button" className="pl-rules" onClick={() => actions.smartPlaylist(p.id)} title="Edit rules">
              <Icon name="smart" />
              <span className="pl-rules-t">
                {describeSmart(smart)}
                <span className="pl-rules-sort">
                  {' · '}
                  {describeSort(smart.sort)}
                  {smart.limit ? ` · first ${smart.limit}` : ''}
                </span>
              </span>
              <span className="pl-rules-edit">Edit rules</span>
            </button>
          )}
          <div className="hero-stats">{stats}</div>
        </div>
        <div className="pl-buttons">
          <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!info.ids.length} className="actions-play">
            {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
          </Button>
          <Button variant="secondary" icon="shuffle" onClick={() => playPlaylist(p.id, { shuffle: true })} disabled={!info.ids.length}>
            Shuffle
          </Button>
          {off && info.ids.length > 0 && (
            <DownloadButton state={off} name={p.name} onPin={() => downloadsStore.pin('playlist', p.id)} onRemove={() => downloadsStore.removePlaylist(p.id)} />
          )}
          <IconButton icon="more" label="More" shape="square" className="pl-more" onClick={(e) => actions.menu({ kind: 'playlist', playlistId: p.id }, e)} />
        </div>
      </header>

      {info.rows.length === 0 && smart ? (
        <div className="pl-empty">
          <div className="pl-empty-k">SMART PLAYLIST · NO TRACKS RIGHT NOW</div>
          <EmptyState
            icon="smart"
            title="Nothing matches yet."
            body="The list fills itself as you add music and listen. Loosen the rules to see more now."
            actions={
              <Button icon="smart" onClick={() => actions.smartPlaylist(p.id)}>
                Edit rules
              </Button>
            }
          />
        </div>
      ) : info.rows.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty-k">PLAYLIST · NO TRACKS</div>
          <EmptyState
            icon="playlist"
            title={`${p.name} is empty`}
            body={phone ? 'Add songs from any album: long-press a song or tap ⋯, then Add to playlist.' : 'Add songs from any album, or drag tracks onto the playlist in the sidebar.'}
            actions={
              <Button icon="search" onClick={() => go(href('search'))}>
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
          statLabel={info.statLabel ?? 'ADDED'}
          nowId={now.id}
          playing={now.playing}
          dl={dl.available ? (r) => (r.track ? trackDownload(dl, r.track, dlNow) : undefined) : null}
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
  statLabel,
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
  statLabel: string
  nowId: string | null
  playing: boolean
  dl: ((r: PlaylistRow) => ReturnType<typeof trackDownload>) | null
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.pl-row[data-i]')
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
    <div className={`pl-table ${dl ? 'has-dl' : ''} ${drag ? 'is-dragging' : ''}`} role="table" onDragOver={(e) => drag && e.preventDefault()} onDrop={(e) => {
      if (!e.dataTransfer.types.includes(ENTRY_MIME)) return
      e.preventDefault()
      drop(dragRef.current)
    }}>
      {!phone && (
        <div className="pl-head" role="row">
          <span className="pl-h-n">#</span>
          <span>TITLE</span>
          <span>ALBUM</span>
          <span>QUALITY</span>
          <span>{statLabel}</span>
          <span className="pl-h-r">
            <Icon name="clock" />
          </span>
          <span />
        </div>
      )}
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
  hasDl,
  download,
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
  const [ref, cover] = useLazyCover<HTMLDivElement>(album?.cover)
  const target = t ? (p.smart ? ({ kind: 'track', trackId: t.id } as const) : ({ kind: 'track', trackId: t.id, playlistId: p.id, entryId: r.entry.entryId } as const)) : null
  const added = useMemo(() => r.stat || fmtAgo(r.entry.addedAt), [r.stat, r.entry.addedAt])
  const missing = !t

  return (
    <div
      className={['pl-row', current && 'is-playing', missing && 'is-missing', dragging && 'is-drag', dropLine && `drop-${dropLine}`].filter(Boolean).join(' ')}
      data-i={i}
      role="row"
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (isTouch() && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
      onContextMenu={(e) => {
        if (target) actions.menu(target, e)
        else e.preventDefault()
      }}
      {...(dragProps ?? {})}
    >
      <div className="pl-n">
        {current && playing ? <Eq /> : <span className="pl-n-t">{String(i + 1).padStart(2, '0')}</span>}
        {t && (
          <button type="button" className="pl-play" onClick={onPlay} aria-label={`Play ${t.title}`}>
            <Icon name="playF" />
          </button>
        )}
      </div>
      <div className="pl-main">
        <div ref={ref} className="pl-cover">
          {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
        </div>
        <div className="pl-text">
          <div className="pl-t">{t?.title ?? r.entry.title}</div>
          <div className="pl-a">
            {t ? (
              <a className="ln" href={artistHref(t.artistId)} draggable={false}>
                {t.artist}
              </a>
            ) : (
              r.entry.artist
            )}
          </div>
        </div>
      </div>
      {!phone && (
        <>
          <div className="pl-album">
            {album ? (
              <a className="ln" href={albumHref(album.id)} draggable={false}>
                {album.title}
              </a>
            ) : (
              <span className="pl-gone">NOT IN YOUR LIBRARY</span>
            )}
          </div>
          <div className="pl-q">{t && <QualityBadge kind={qualityKind('flac', t.flac?.bitDepth, t.flac?.sampleRate)}>{qualityLabel('flac', { bitDepth: t.flac?.bitDepth, sampleRate: t.flac?.sampleRate })}</QualityBadge>}</div>
          <div className="pl-added">{added}</div>
        </>
      )}
      <div className="pl-d">{t?.duration ? formatTime(t.duration) : phone && missing ? '' : '—'}</div>
      {hasDl && <div className="pl-dl">{t && <DownloadIcon state={download ?? { kind: 'none' }} />}</div>}
      <div className="pl-act">
        {missing ? (
          <button type="button" className="pl-x" aria-label="Remove from playlist" title="Remove from playlist" onClick={onRemove}>
            <Icon name="x" />
          </button>
        ) : (
          <button type="button" className="pl-dots" aria-label="More" onClick={(e) => target && actions.menu(target, e)}>
            <Icon name="more" />
          </button>
        )}
        {phone && !p.smart && (
          <span className="pl-grip" aria-label="Drag to reorder" role="button" tabIndex={-1} onPointerDown={onGripDown}>
            <Icon name="drag" />
          </span>
        )}
      </div>
    </div>
  )
}
