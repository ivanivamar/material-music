/**
 * Songs with several artists (16 Nov 2026, canvas "Artist picker for songs with several artists").
 *
 *   <ArtistLink track={t} …>  one artist: a plain link, as before. Several: the click opens the
 *                             picker (player bar, Now Playing). The href stays the main artist, so
 *                             middle-click / open in new tab still work.
 *   <ArtistLinks track={t} /> song rows: each name is its own link, "A, B, C".
 *   artistPicker.open(trackId, anchor?)  from anywhere (the ⋯ menu's Go to artist).
 *
 * The picker is the kit Menu: a popover on desktop, a bottom sheet on phone. Library artists first
 * (avatar · name · "4 ALBUMS · 61 SONGS"), then the ones not in the library, which open a Deezer
 * artist search. One host (<ArtistPickerHost />, mounted by AppShell) renders it.
 */
import { Fragment, useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Icon } from '../design/icons'
import { deezerArtistSearch, songArtists, type SongArtist } from '../lib/songArtists'
import { ArtistAvatar } from '../pages/library/common'
import { openExternal } from '../pages/releases/parts'
import { goTo } from '../actions/ops'
import { artistHref } from '../shell/routes'
import { useLibrary, type Catalogue, type Track } from '../state/library'
import { useIsPhone } from '../state/viewport'
import { artistInfos, monogram, plural } from '../state/views'
import { Menu, MenuItem, MenuLabel, MenuSeparator, type MenuAnchor, type MenuPlacement } from './ui/Menu'

/* ── store ── */

interface Open {
  trackId: string
  anchor: MenuAnchor
  placement: MenuPlacement
  key: number
}
let state: Open | null = null
let key = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
/** where the last press was: the anchor for a picker opened from a menu that has since closed */
let lastPress = { x: 0, y: 0 }

export const artistPicker = {
  open(trackId: string, anchor?: MenuAnchor, placement: MenuPlacement = 'bottom-start') {
    // pressing the same link again closes it (the menu leaves presses on its anchor to the owner)
    if (anchor && state?.anchor === anchor) return artistPicker.close()
    const at = anchor ?? (lastPress.x || lastPress.y ? lastPress : { x: window.innerWidth / 2, y: window.innerHeight / 3 })
    state = { trackId, anchor: at, placement, key: ++key }
    emit()
  },
  close() {
    if (!state) return
    state = null
    emit()
  },
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))
const get = () => state

/** The artists of a song, from the current library (one entry = a single-artist song). */
export function useSongArtists(t: Pick<Track, 'artist' | 'artistId'> | null | undefined): SongArtist[] {
  const c = useLibrary().data
  return t && c ? songArtists(t, c) : []
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

/* ── links ── */

/**
 * The song's artist line as one link. With several artists a plain click opens the picker against
 * the link (`placement`: the player bar opens it upwards). `onNavigate`: how a single-artist click
 * navigates (Now Playing closes itself first); default: the browser follows the href.
 */
export function ArtistLink({
  track,
  className,
  title,
  placement,
  onNavigate,
  children,
}: {
  track: Track
  className?: string
  title?: string
  placement?: MenuPlacement
  onNavigate?: (href: string) => void
  children: ReactNode
}) {
  const many = useSongArtists(track).length > 1
  const href = artistHref(track.artistId)
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return
    if (many) {
      e.preventDefault()
      e.stopPropagation()
      artistPicker.open(track.id, e.currentTarget, placement)
    } else if (onNavigate) {
      e.preventDefault()
      onNavigate(href)
    }
  }
  return (
    <a href={href} className={className} title={title ?? track.artist} onClick={onClick} aria-haspopup={many ? 'menu' : undefined}>
      {children}
    </a>
  )
}

/**
 * Song rows: every artist is its own link ("A, B, C"); an artist who isn't in the library is plain
 * text. Each link gets `linkProps` (className, tabIndex, onClick…) like the single link it replaces.
 */
export function ArtistLinks({ track, linkProps }: { track: Track; linkProps?: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> }) {
  const list = useSongArtists(track)
  if (list.length <= 1)
    return (
      <a href={artistHref(track.artistId)} draggable={false} {...linkProps}>
        {track.artist}
      </a>
    )
  return (
    <span className="al-list">
      {list.map((a, i) => (
        <Fragment key={a.id ?? a.name}>
          {i > 0 && ', '}
          {a.id ? (
            <a href={artistHref(a.id)} draggable={false} {...linkProps}>
              {a.name}
            </a>
          ) : (
            <span className="al-off">{a.name}</span>
          )}
        </Fragment>
      ))}
    </span>
  )
}

/* ── the picker ── */

export function ArtistPickerHost() {
  const open = useSyncExternalStore(subscribe, get, get)
  const c = useLibrary().data
  const phone = useIsPhone()

  useEffect(() => {
    const onDown = (e: PointerEvent) => void (lastPress = { x: e.clientX, y: e.clientY })
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])

  const track = open && c ? c.tracks[open.trackId] : undefined
  const list = track && c ? songArtists(track, c) : []
  // the library changed under it (song removed): nothing to show
  useEffect(() => {
    if (open && !track) artistPicker.close()
  }, [open, track])
  if (!open || !track || !c) return null

  const inLib = list.filter((a) => a.id && c.artists[a.id])
  const out = list.filter((a) => !(a.id && c.artists[a.id]))
  const label = `Artists on ${track.title}`
  return (
    <Menu
      key={open.key}
      open
      onClose={artistPicker.close}
      anchor={open.anchor}
      placement={open.placement}
      label={label}
      title="Artists"
      meta={`${track.title} · ${plural(list.length, 'artist', 'artists')}`.toUpperCase()}
      width={300}
      className="ap-menu"
    >
      {!phone && <MenuLabel>{plural(list.length, 'artist', 'artists')} on this song</MenuLabel>}
      {inLib.map((a) => (
        <LibraryRow key={a.id} c={c} id={a.id!} />
      ))}
      {out.length > 0 && inLib.length > 0 && <MenuSeparator />}
      {out.map((a) => (
        <MenuItem
          key={a.name}
          className="ap-item is-off"
          leading={
            <span className="ap-off-av" aria-hidden>
              {monogram(a.name)}
            </span>
          }
          description="Not in library · Deezer"
          trailing={<Icon name="ext" />}
          onSelect={() => openExternal(deezerArtistSearch(a.name))}
        >
          {a.name}
        </MenuItem>
      ))}
    </Menu>
  )
}

function LibraryRow({ c, id }: { c: Catalogue; id: string }) {
  const info = artistInfos(c).get(id)
  const artist = c.artists[id]
  const facts = info ? [info.albums.length ? plural(info.albums.length, 'album', 'albums') : null, plural(info.tracks, 'song', 'songs')].filter(Boolean).join(' · ') : ''
  return (
    <MenuItem className="ap-item" leading={<ArtistAvatar artist={artist} size={36} lazy={false} className="ap-av" />} description={facts} trailing={<Icon name="chevR" />} onSelect={() => goTo(artistHref(id))}>
      {artist.name}
    </MenuItem>
  )
}
