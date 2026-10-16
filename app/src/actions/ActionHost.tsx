/**
 * Renders the open action menu / sheet / dialog (state in actions/actions.ts). Mounted once by
 * AppShell, outside the inert shell layer, so it also works over the full-screen player and queue.
 *
 * Desktop (handoff 15 "Desktop Actions"): 268px menu at the pointer — header (cover · title ·
 * mono line), items 36px, separators; "Add to playlist ›" opens a 256px submenu on hover with
 * "Find a playlist", the playlists (✓ IN when the song is already there) and "New playlist…".
 * Phone ("Android Actions"): bottom sheet; "Add to playlist" turns the sheet into the picker
 * (back · title, new playlist name + Create, the list).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { QualityBadge, qualityKind, qualityLabel, useToast } from '../components/ui'
import { Icon, type IconName } from '../design/icons'
import { useSheetDrag } from '../components/useSheetDrag'
import { useCover } from '../lib/covers'
import { registerBack } from '../native/backButton'
import { albumTrackIds, artistTrackIds } from '../pages/library/playback'
import { PlaylistCover } from '../pages/playlists/PlaylistCover'
import { albumHref, artistHref } from '../shell/routes'
import { downloadsStore, playlistOffline, trackOffline, useDownloads } from '../state/downloads'
import { useLibrary, type Catalogue } from '../state/library'
import { downloadM3u, playlistInfo, playlistsWith } from '../state/playlistViews'
import { usePlaylists, type Playlist } from '../state/playlists'
import { useIsPhone } from '../state/viewport'
import { artistInfos, fmtBytes, fmtTotal, plural } from '../state/views'
import { actions, useActions, type ActionTarget } from './actions'
import { EditPlaylistDialog, NewPlaylistDialog, RemoveDialog } from './Dialogs'
import { SmartDialog } from './SmartDialog'
import { addToPlaylist, createPlaylist, deletePlaylist, downloadTrack, goTo, playPlaylist, queueTracks, removeFromPlaylist, removeTrackDownload } from './ops'
import { playList } from '../pages/library/playback'
import './actions.css'

type Toast = ReturnType<typeof useToast>

interface Item {
  icon: IconName
  label: string
  hint?: string
  danger?: boolean
  /** opens the Add to playlist list */
  picker?: boolean
  run?: () => void
}
type Row = Item | 'div'

interface Described {
  title: string
  sub: string
  /** album cover file id for the header */
  cover: string | null | undefined
  playlist?: Playlist
  badge?: { kind: ReturnType<typeof qualityKind>; label: string }
  /** the tracks this target stands for (Add to playlist / queue) */
  trackIds: () => string[]
  /** "STARTS WITH …" in the New playlist dialog */
  hint: string
  rows: Row[]
}

function describe(t: ActionTarget, c: Catalogue, toast: Toast, lists: Map<string, Playlist>, dl: ReturnType<typeof useDownloads>): Described | null {
  const div = 'div' as const
  if (t.kind === 'track') {
    const tr = c.tracks[t.trackId]
    if (!tr) return null
    const album = c.albums[tr.albumId]
    const ids = () => [tr.id]
    const pl = t.playlistId ? lists.get(t.playlistId) : undefined
    const rows: Row[] = [
      { icon: 'next', label: 'Play next', run: () => queueTracks(toast, ids(), true) },
      { icon: 'queue', label: 'Add to queue', run: () => queueTracks(toast, ids(), false) },
      { icon: 'playlist', label: 'Add to playlist', picker: true },
    ]
    // Android app: keep this one song offline, like an album's Download. Nothing to offer when its
    // whole album (or artist / library) is downloaded anyway — that's removed from the album page.
    if (dl.available) {
      const off = trackOffline(dl, tr)
      if (off.pinned) rows.push({ icon: 'x', label: 'Remove download', danger: true, run: () => removeTrackDownload(toast, tr.id) })
      else if (!off.viaAlbum) rows.push({ icon: 'download', label: 'Download', hint: off.bytes ? fmtBytes(off.bytes) : undefined, run: () => downloadTrack(toast, tr.id) })
    }
    rows.push(
      div,
      { icon: 'library', label: 'Go to album', run: () => goTo(albumHref(tr.albumId)) },
      { icon: 'library', label: 'Go to artist', run: () => goTo(artistHref(album?.artistId ?? tr.artistId)) },
      div,
    )
    if (pl && t.entryId) rows.push({ icon: 'x', label: `Remove from ${pl.name}`, danger: true, run: () => removeFromPlaylist(toast, pl.id, [t.entryId!]) })
    rows.push({ icon: 'x', label: 'Remove from library…', danger: true, run: () => actions.confirmRemove({ kind: 'track', trackIds: [tr.id] }) })
    return {
      title: tr.title,
      sub: ['TRACK', tr.artist, tr.duration ? fmtTotal(tr.duration) : null].filter(Boolean).join(' · ').toUpperCase(),
      cover: album?.cover,
      badge: { kind: qualityKind('flac', tr.flac?.bitDepth, tr.flac?.sampleRate), label: qualityLabel('flac', { bitDepth: tr.flac?.bitDepth, sampleRate: tr.flac?.sampleRate }) },
      trackIds: ids,
      hint: `STARTS WITH ${tr.title.toUpperCase()}`,
      rows,
    }
  }
  if (t.kind === 'album') {
    const album = c.albums[t.albumId]
    if (!album) return null
    const ids = () => albumTrackIds(c, album.id)
    const ctx = { kind: 'album' as const, id: album.id, label: album.title }
    const n = ids().length
    return {
      title: album.title,
      sub: ['ALBUM', album.artist, album.year].filter(Boolean).join(' · ').toUpperCase(),
      cover: album.cover,
      trackIds: ids,
      hint: `STARTS WITH ${plural(n, 'TRACK')} FROM ${album.title.toUpperCase()}`,
      rows: [
        { icon: 'playF', label: 'Play', run: () => playList(ids(), ctx) },
        { icon: 'shuffle', label: 'Shuffle', run: () => playList(ids(), ctx, { shuffle: true }) },
        div,
        { icon: 'next', label: 'Play next', run: () => queueTracks(toast, ids(), true) },
        { icon: 'queue', label: 'Add to queue', run: () => queueTracks(toast, ids(), false) },
        { icon: 'playlist', label: 'Add to playlist', picker: true },
        div,
        { icon: 'library', label: 'Go to artist', run: () => goTo(artistHref(album.artistId)) },
        div,
        { icon: 'x', label: 'Remove from library…', danger: true, run: () => actions.confirmRemove({ kind: 'album', albumId: album.id }) },
      ],
    }
  }
  if (t.kind === 'artist') {
    const info = artistInfos(c).get(t.artistId)
    if (!info) return null
    const ids = () => artistTrackIds(c, t.artistId)
    const ctx = { kind: 'artist' as const, id: t.artistId, label: info.artist.name }
    return {
      title: info.artist.name,
      sub: `ARTIST · ${plural(info.tracks, 'TRACK')}`,
      cover: info.albums[0]?.cover,
      trackIds: ids,
      hint: `STARTS WITH ${plural(info.tracks, 'TRACK')} BY ${info.artist.name.toUpperCase()}`,
      rows: [
        { icon: 'playF', label: 'Play', run: () => playList(ids(), ctx) },
        { icon: 'shuffle', label: 'Shuffle', run: () => playList(ids(), ctx, { shuffle: true }) },
        div,
        { icon: 'next', label: 'Play next', run: () => queueTracks(toast, ids(), true) },
        { icon: 'queue', label: 'Add to queue', run: () => queueTracks(toast, ids(), false) },
        { icon: 'playlist', label: 'Add to playlist', picker: true },
        div,
        { icon: 'x', label: 'Remove from library…', danger: true, run: () => actions.confirmRemove({ kind: 'artist', artistId: t.artistId }) },
      ],
    }
  }
  if (t.kind === 'tracks') {
    return {
      title: t.label,
      sub: plural(t.trackIds.length, 'TRACK'),
      cover: c.albums[c.tracks[t.trackIds[0]]?.albumId ?? '']?.cover,
      trackIds: () => t.trackIds,
      hint: `STARTS WITH ${plural(t.trackIds.length, 'TRACK')} FROM THE ${t.label.toUpperCase()}`,
      rows: [{ icon: 'playlist', label: 'Add to playlist', picker: true }],
    }
  }
  const p = lists.get(t.playlistId)
  if (!p) return null
  const info = playlistInfo(c, p)
  const ids = () => info.ids
  const rows: Row[] = [
    { icon: 'playF', label: 'Play', run: () => playPlaylist(p.id) },
    { icon: 'shuffle', label: 'Shuffle', run: () => playPlaylist(p.id, { shuffle: true }) },
    div,
    { icon: 'next', label: 'Play next', run: () => queueTracks(toast, ids(), true) },
    { icon: 'queue', label: 'Add to queue', run: () => queueTracks(toast, ids(), false) },
    { icon: 'playlist', label: 'Add to another playlist', picker: true },
    div,
    ...(p.smart ? [{ icon: 'smart', label: 'Edit rules', run: () => actions.smartPlaylist(p.id) } satisfies Item] : []),
    { icon: 'gear', label: 'Edit details', run: () => actions.editPlaylist(p.id) },
  ]
  if (dl.available) {
    const off = playlistOffline(dl, c, p)
    rows.push(
      off.wanted
        ? { icon: 'x', label: 'Remove download', danger: true, run: () => downloadsStore.removePlaylist(p.id) }
        : { icon: 'download', label: 'Download', run: () => downloadsStore.pin('playlist', p.id) },
    )
  } else rows.push({ icon: 'ext', label: 'Export as M3U', run: () => downloadM3u(c, p) })
  rows.push(div, { icon: 'x', label: 'Delete playlist', danger: true, run: () => deletePlaylist(toast, p.id) })
  return {
    title: p.name,
    sub: `${p.smart ? 'SMART PLAYLIST' : 'PLAYLIST'} · ${plural(info.ids.length, 'TRACK')}`,
    cover: null,
    playlist: p,
    trackIds: ids,
    hint: `STARTS WITH ${plural(info.ids.length, 'TRACK')} FROM ${p.name.toUpperCase()}`,
    rows: rows.filter((r) => r === 'div' || !(r.picker && !info.ids.length)),
  }
}

/* ── Host ───────────────────────────────────────────── */

export function ActionHost() {
  const { menu, dialog } = useActions()
  const phone = useIsPhone()

  // Esc closes the top-most thing (before the queue / full-screen player handlers see it)
  useEffect(() => {
    if (!menu && !dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      actions.closeTop()
    }
    window.addEventListener('keydown', onKey, true)
    // Android Back
    const off = registerBack(() => actions.closeTop(), 'top')
    return () => {
      window.removeEventListener('keydown', onKey, true)
      off()
    }
  }, [menu, dialog])

  // routes change / window resized → menus go. Only a width change counts as a resize: on phones the
  // soft keyboard shrinks the viewport height and fires `resize`, which would close the sheet the
  // moment its "New playlist name" field is focused.
  useEffect(() => {
    const close = () => actions.closeMenu()
    let w = window.innerWidth
    const onResize = () => {
      if (window.innerWidth === w) return
      w = window.innerWidth
      close()
    }
    window.addEventListener('hashchange', close)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('hashchange', close)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      {menu && (phone ? <Sheet key={menu.key} target={menu.target} picker={menu.picker} /> : <Menu key={menu.key} target={menu.target} at={menu.at} picker={menu.picker} />)}
      {dialog?.kind === 'new' && <NewPlaylistDialog trackIds={dialog.trackIds} hint={dialog.hint} open={!!dialog.open} name={dialog.name} />}
      {dialog?.kind === 'edit' && <EditPlaylistDialog playlistId={dialog.playlistId} />}
      {dialog?.kind === 'remove' && <RemoveDialog target={dialog.target} />}
      {dialog?.kind === 'smart' && <SmartDialog key={dialog.playlistId ?? 'new'} playlistId={dialog.playlistId} />}
    </>
  )
}

function useDescribed(target: ActionTarget): Described | null {
  const { data } = useLibrary()
  const toast = useToast()
  const { byId } = usePlaylists()
  const dl = useDownloads()
  return useMemo(() => (data ? describe(target, data, toast, byId, dl) : null), [data, target, toast, byId, dl])
}

function HeadCover({ d, size }: { d: Described; size: number }) {
  const url = useCover(d.playlist ? null : d.cover)
  if (d.playlist) return <PlaylistCover playlist={d.playlist} size={size} className="am-head-cover" />
  return url ? <img className="am-head-cover" src={url} alt="" style={{ width: size, height: size }} /> : <span className="am-head-cover is-empty" style={{ width: size, height: size }} />
}

/* ── Desktop menu ───────────────────────────────────── */

const MENU_W = 268
const SUB_W = 256

function Menu({ target, at, picker }: { target: ActionTarget; at: { x: number; y: number }; picker: boolean }) {
  const d = useDescribed(target)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; origin: string } | null>(null)
  const [sub, setSub] = useState<{ top: number; left: boolean } | null>(picker ? { top: 0, left: false } : null)
  const subRef = useRef<HTMLDivElement>(null)

  // clamp into the window; open upwards / leftwards when there's no room
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = picker ? SUB_W : MENU_W
    const h = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = at.x
    let y = at.y
    let ox = 'left'
    let oy = 'top'
    if (x + w > vw - 8) {
      x = Math.max(8, at.x - w)
      ox = 'right'
    }
    if (y + h > vh - 8) {
      y = Math.max(8, Math.min(at.y - h, vh - 8 - h))
      oy = 'bottom'
    }
    setPos({ x, y, origin: `${oy} ${ox}` })
  }, [at, picker])

  // click / right-click anywhere else closes
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || subRef.current?.contains(t)) return
      actions.closeMenu()
    }
    const onCtx = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || subRef.current?.contains(t)) e.preventDefault()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('contextmenu', onCtx)
    const onScroll = (e: Event) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || subRef.current?.contains(t)) return
      actions.closeMenu()
    }
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [])

  // keep the submenu inside the window (it opens level with "Add to playlist")
  const subTop = sub?.top
  useLayoutEffect(() => {
    const el = subRef.current?.parentElement
    if (subTop === undefined || !el || picker) return
    const r = el.getBoundingClientRect()
    const over = r.bottom - (window.innerHeight - 8)
    if (over > 0) el.style.top = `${Math.max(-(ref.current?.getBoundingClientRect().top ?? 0) + 8, (subTop ?? 0) - over)}px`
  }, [subTop, picker])

  // focus the first item for the keyboard
  useEffect(() => {
    if (!pos || picker) return
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
  }, [pos, picker])

  if (!d) return null

  const openSub = (el: HTMLElement) => {
    const box = ref.current!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const left = box.right + SUB_W + 8 > window.innerWidth
    setSub({ top: r.top - box.top - 52, left })
  }

  const onKey = (e: ReactKeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = items.length
      items[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n]?.focus()
    } else if (e.key === 'ArrowRight' && (document.activeElement as HTMLElement)?.dataset.picker) {
      e.preventDefault()
      openSub(document.activeElement as HTMLElement)
      requestAnimationFrame(() => subRef.current?.querySelector('input')?.focus())
    } else if (e.key === 'ArrowLeft' && sub) {
      e.preventDefault()
      setSub(null)
      ref.current?.querySelector<HTMLElement>('[data-picker]')?.focus()
    }
  }

  const style: CSSProperties = pos ? { left: pos.x, top: pos.y, transformOrigin: pos.origin } : { left: at.x, top: at.y, visibility: 'hidden' }

  if (picker)
    return (
      <div className="am am-only-picker pg-anim" ref={ref} style={style} onKeyDown={onKey}>
        <Picker d={d} target={target} subRef={subRef} autoFocus />
      </div>
    )

  return (
    <div className="am pg-anim" ref={ref} style={style} role="menu" aria-label={d.title} onKeyDown={onKey}>
      <div className="am-panel">
        <div className="am-head">
          <HeadCover d={d} size={32} />
          <div className="am-head-text">
            <div className="am-head-title">{d.title}</div>
            <div className="am-head-sub">{d.sub}</div>
          </div>
        </div>
        {d.rows.map((r, i) =>
          r === 'div' ? (
            <div key={i} className="am-div" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`am-item ${r.danger ? 'is-danger' : ''} ${r.picker && sub ? 'is-open' : ''}`}
              data-picker={r.picker ? '1' : undefined}
              onMouseEnter={(e) => (r.picker ? openSub(e.currentTarget) : setSub(null))}
              onFocus={(e) => !r.picker && sub && e.currentTarget.matches(':focus-visible') && setSub(null)}
              onClick={(e) => {
                if (r.picker) return openSub(e.currentTarget)
                actions.closeMenu()
                r.run?.()
              }}
            >
              <span className="am-ic">
                <Icon name={r.icon} />
              </span>
              <span className="am-label">{r.label}</span>
              {r.hint && <span className="am-hint">{r.hint}</span>}
              {r.picker && (
                <span className="am-chev">
                  <Icon name="chevR" />
                </span>
              )}
            </button>
          ),
        )}
      </div>
      {sub && (
        <div className={`am-sub pg-anim ${sub.left ? 'is-left' : ''}`} style={{ top: Math.max(0, sub.top) }}>
          <Picker d={d} target={target} subRef={subRef} />
        </div>
      )}
    </div>
  )
}

function Picker({ d, target, subRef, autoFocus }: { d: Described; target: ActionTarget; subRef: React.RefObject<HTMLDivElement | null>; autoFocus?: boolean }) {
  const { list } = usePlaylists()
  const { data } = useLibrary()
  const toast = useToast()
  const [q, setQ] = useState('')
  const own = target.kind === 'playlist' ? target.playlistId : null
  const shown = list.filter((p) => p.id !== own && !p.smart && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())))
  const has = useMemo(() => (data && target.kind === 'track' ? playlistsWith(data, list, target.trackId) : new Set<string>()), [data, list, target])

  return (
    <div className="am-panel am-picker" ref={subRef} role="menu" aria-label="Add to playlist">
      <label className="am-find">
        <Icon name="search" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a playlist"
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) {
              actions.closeMenu()
              addToPlaylist(toast, shown[0].id, d.trackIds())
            }
          }}
        />
      </label>
      <div className="am-pl-list">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            className="am-pl"
            onClick={() => {
              actions.closeMenu()
              addToPlaylist(toast, p.id, d.trackIds())
            }}
          >
            <PlaylistCover playlist={p} size={26} className="am-pl-cover" />
            <span className="am-pl-name">{p.name}</span>
            {has.has(p.id) && (
              <span className="am-pl-in">
                <Icon name="check" />
                IN
              </span>
            )}
          </button>
        ))}
        {!shown.length && q.trim() && <div className="am-pl-none">No playlist called “{q.trim()}”.</div>}
      </div>
      <div className="am-div" />
      <button type="button" role="menuitem" className="am-pl" onClick={() => actions.newPlaylist(d.trackIds(), d.hint, false, q.trim())}>
        <span className="am-pl-new">
          <Icon name="plus" />
        </span>
        <span className="am-pl-name">{q.trim() ? `New playlist “${q.trim()}”…` : 'New playlist…'}</span>
      </button>
    </div>
  )
}

/* ── Phone sheet ────────────────────────────────────── */

function Sheet({ target, picker }: { target: ActionTarget; picker: boolean }) {
  const d = useDescribed(target)
  const [page, setPage] = useState<'main' | 'pl'>(picker ? 'pl' : 'main')
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [])
  const close = (then?: () => void) => {
    setClosing(true)
    window.setTimeout(() => {
      actions.closeMenu()
      then?.()
    }, 260)
  }
  // drag the handle / header (or a list scrolled to the top) down to close
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  useSheetDrag(sheetRef, scrimRef, () => close(), !!d)
  if (!d) return null
  const open = shown && !closing
  return (
    <>
      <div ref={scrimRef} className={`as-scrim pg-anim ${open ? 'is-on' : ''}`} onClick={() => close()} />
      <div ref={sheetRef} className={`as pg-anim ${open ? 'is-on' : ''}`} role="dialog" aria-label={d.title}>
        <button type="button" className="as-handle" aria-label="Close" onClick={() => close()}>
          <span />
        </button>
        {page === 'main' ? (
          <>
            <div className="as-head">
              <HeadCover d={d} size={52} />
              <div className="as-head-text">
                <div className="as-head-title">{d.title}</div>
                <div className="as-head-sub">{d.sub}</div>
              </div>
              {d.badge && <QualityBadge kind={d.badge.kind}>{d.badge.label}</QualityBadge>}
            </div>
            <div className="as-items">
              {d.rows.map((r, i) =>
                r === 'div' ? (
                  <div key={i} className="as-div" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    className={`as-item ${r.danger ? 'is-danger' : ''}`}
                    onClick={() => {
                      if (r.picker) return setPage('pl')
                      close(r.run)
                    }}
                  >
                    <span className="as-ic">
                      <Icon name={r.icon} />
                    </span>
                    <span className="as-label">{r.label}</span>
                    {r.picker && (
                      <span className="as-chev">
                        <Icon name="chevR" />
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <SheetPicker d={d} target={target} onBack={picker ? undefined : () => setPage('main')} onDone={close} />
        )}
      </div>
    </>
  )
}

function SheetPicker({ d, target, onBack, onDone }: { d: Described; target: ActionTarget; onBack?: () => void; onDone: (then?: () => void) => void }) {
  const { list } = usePlaylists()
  const { data } = useLibrary()
  const toast = useToast()
  const [name, setName] = useState('')
  const own = target.kind === 'playlist' ? target.playlistId : null
  const has = useMemo(() => (data && target.kind === 'track' ? playlistsWith(data, list, target.trackId) : new Set<string>()), [data, list, target])
  const create = () => {
    if (!name.trim()) return
    const ids = d.trackIds()
    onDone(() => createPlaylist(toast, name, ids, false))
  }
  return (
    <>
      <div className="as-pl-head">
        {onBack ? (
          <button type="button" className="as-back" aria-label="Back" onClick={onBack}>
            <Icon name="chevL" />
          </button>
        ) : (
          <span className="as-back-sp" />
        )}
        <div className="as-pl-title">Add to playlist</div>
      </div>
      <form
        className="as-new"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" enterKeyHint="done" />
        <button type="submit" className="as-create" disabled={!name.trim()}>
          Create
        </button>
      </form>
      <div className="as-pl-list">
        {list
          .filter((p) => p.id !== own && !p.smart)
          .map((p) => {
            const info = data ? playlistInfo(data, p) : null
            return (
              <button key={p.id} type="button" className="as-pl" onClick={() => onDone(() => addToPlaylist(toast, p.id, d.trackIds()))}>
                <PlaylistCover playlist={p} size={40} className="as-pl-cover" />
                <span className="as-pl-text">
                  <span className="as-pl-name">{p.name}</span>
                  <span className="as-pl-meta">{plural(info?.ids.length ?? 0, 'TRACK')}</span>
                </span>
                {has.has(p.id) && (
                  <span className="as-pl-in">
                    <Icon name="check" />
                  </span>
                )}
              </button>
            )
          })}
        {!list.some((p) => !p.smart) && <div className="as-pl-none">No playlists yet. Name one above.</div>}
      </div>
    </>
  )
}

