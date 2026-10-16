/**
 * What the action menus do, with their toasts. Shared by the menus, the sidebar drop targets,
 * the playlist page and the dialogs.
 */
import type { useToast } from '../components/ui'
import { playList } from '../pages/library/playback'
import { albumHref, artistHref, go, playlistHref, libraryHref } from '../shell/routes'
import { AuthError } from '../lib/drive'
import { downloadsStore, trackOffline } from '../state/downloads'
import { removeFromLibrary, undoRemoval, type RemoveTarget } from '../state/removal'
import { libraryStore } from '../state/library'
import { nowPlayingStore } from '../state/nowPlaying'
import { playerStore } from '../state/player'
import { alreadyIn, playlistInfo } from '../state/playlistViews'
import { playlistsStore } from '../state/playlists'
import { fmtBytes, plural } from '../state/views'

type Toast = ReturnType<typeof useToast>

/** In-app link that also works from inside the full-screen player (closes it first). */
export function goTo(href: string) {
  if (nowPlayingStore.get().open) nowPlayingStore.closeAndGo(href)
  else go(href)
}

const what = (trackIds: string[]) => {
  const c = libraryStore.get().data
  return trackIds.length === 1 ? (c?.tracks[trackIds[0]]?.title ?? '1 song') : plural(trackIds.length, 'song', 'songs')
}

/**
 * Add tracks to a playlist. Songs already in it are skipped (duplicate warning in the toast);
 * if every song is already there, nothing is added and the toast offers "Add anyway".
 */
export function addToPlaylist(toast: Toast, playlistId: string, trackIds: string[]) {
  const c = libraryStore.get().data
  const p = playlistsStore.get().byId.get(playlistId)
  if (!c || !p || !trackIds.length) return
  const unique = [...new Set(trackIds)]
  const dup = alreadyIn(c, p, unique)
  const fresh = unique.filter((id) => !dup.has(id))
  if (!fresh.length) {
    toast.show({
      icon: 'playlist',
      mutedIcon: true,
      text: unique.length === 1 ? `${what(unique)} is already in ${p.name}.` : `All ${unique.length} songs are already in ${p.name}.`,
      action: {
        label: 'Add anyway',
        onClick: () => {
          const ids = playlistsStore.addTracks(playlistId, unique)
          toast.show({ icon: 'check', text: `Added ${what(unique)} to ${p.name} again.`, action: { label: 'Undo', onClick: () => playlistsStore.removeEntries(playlistId, ids) } })
        },
      },
    })
    return
  }
  const ids = playlistsStore.addTracks(playlistId, fresh)
  toast.show({
    icon: 'check',
    text: `Added ${what(fresh)} to ${p.name}.`,
    meta: dup.size ? `${dup.size} ALREADY IN IT · SKIPPED` : undefined,
    action: { label: 'Undo', onClick: () => playlistsStore.removeEntries(playlistId, ids) },
  })
}

export function createPlaylist(toast: Toast, name: string, trackIds: string[], open: boolean) {
  const id = playlistsStore.create(name, trackIds)
  const p = playlistsStore.get().byId.get(id)
  if (open) goTo(playlistHref(id))
  toast.show({
    icon: 'check',
    text: `Created ${p?.name ?? name}.`,
    meta: trackIds.length ? plural(trackIds.length, 'SONG') : undefined,
    action: open ? undefined : { label: 'View', onClick: () => goTo(playlistHref(id)) },
  })
  return id
}

export function removeFromPlaylist(toast: Toast, playlistId: string, entryIds: string[]) {
  const p = playlistsStore.get().byId.get(playlistId)
  const c = libraryStore.get().data
  if (!p) return
  const entry = entryIds.length === 1 ? p.entries.find((e) => e.entryId === entryIds[0]) : undefined
  playlistsStore.removeEntries(playlistId, entryIds)
  toast.show({
    icon: 'x',
    mutedIcon: true,
    text: `Removed ${entry ? (c?.tracks[entry.trackId]?.title ?? entry.title) : plural(entryIds.length, 'song', 'songs')} from ${p.name}.`,
    action: { label: 'Undo', onClick: () => playlistsStore.restoreEntries(playlistId, entryIds) },
  })
}

export function deletePlaylist(toast: Toast, playlistId: string) {
  const p = playlistsStore.get().byId.get(playlistId)
  if (!p) return
  playlistsStore.remove(playlistId)
  if (window.location.hash === playlistHref(playlistId)) goTo(libraryHref('playlists'))
  toast.show({
    icon: 'x',
    mutedIcon: true,
    text: `Deleted ${p.name}.`,
    action: { label: 'Undo', onClick: () => playlistsStore.restore(playlistId) },
    duration: 6000,
  })
}

export function playPlaylist(playlistId: string, opts: { shuffle?: boolean; start?: number } = {}) {
  const c = libraryStore.get().data
  const p = playlistsStore.get().byId.get(playlistId)
  if (!c || !p) return
  playList(playlistInfo(c, p).ids, { kind: 'playlist', id: p.id, label: p.name }, opts)
}

export function queueTracks(toast: Toast, trackIds: string[], next: boolean) {
  if (!trackIds.length) return
  if (next) playerStore.playNext(trackIds)
  else playerStore.addToQueue(trackIds)
  toast.show({ icon: next ? 'next' : 'queue', text: next ? `${what(trackIds)} plays next.` : `Added ${what(trackIds)} to the queue.` })
}

/** Keep one song on the phone (Android app; the track menu's Download), like an album's Download. */
export function downloadTrack(toast: Toast, trackId: string) {
  const t = libraryStore.get().data?.tracks[trackId]
  if (!t) return
  const before = downloadsStore.get().prefs
  downloadsStore.pin('track', trackId)
  const s = downloadsStore.get()
  const off = trackOffline(s, t)
  toast.show({
    icon: off.stored ? 'check' : 'download',
    text: off.stored ? `${t.title} is stored offline.` : `Downloading ${t.title}.`,
    meta: off.stored ? undefined : [off.bytes ? fmtBytes(off.bytes) : null, s.prefs.wifiOnly ? 'WI-FI ONLY' : 'ANY NETWORK'].filter(Boolean).join(' · '),
    action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
  })
}

/** Stop keeping a song pinned on its own (it stays if a playlist download wants it). */
export function removeTrackDownload(toast: Toast, trackId: string) {
  const t = libraryStore.get().data?.tracks[trackId]
  if (!t) return
  const before = downloadsStore.get().prefs
  downloadsStore.removeTrack(trackId)
  toast.show({
    icon: 'x',
    mutedIcon: true,
    text: `Removed ${t.title} from this phone.`,
    action: { label: 'Undo', onClick: () => downloadsStore.restore(before) },
  })
}

/** Name for toasts: the song / album / artist title. */
function removalName(t: RemoveTarget): string {
  const c = libraryStore.get().data
  if (t.kind === 'album') return c?.albums[t.albumId]?.title ?? 'the album'
  if (t.kind === 'artist') return c?.artists[t.artistId]?.name ?? 'the artist'
  return what(t.trackIds)
}

/**
 * Remove from the library (after the confirm dialog): library.json first, then the files to the
 * Drive trash. Leaves the album / artist page if that's what went. Undo in the toast.
 */
export async function removeFromLibraryOp(toast: Toast, target: RemoveTarget) {
  const name = removalName(target)
  const id = toast.show({ icon: 'refresh', mutedIcon: true, text: `Removing ${name}…`, duration: 0 })
  try {
    const r = await removeFromLibrary(target)
    const c = libraryStore.get().data
    const hash = window.location.hash
    const leftAlbum = r.ids.albumIds.find((a) => hash === albumHref(a))
    const leftArtist = r.ids.artistIds.find((a) => hash === artistHref(a))
    if (leftArtist) goTo(libraryHref('artists'))
    else if (leftAlbum) {
      const artistId = target.kind === 'album' ? c?.removed?.albums[target.albumId]?.album.artistId : undefined
      goTo(artistId && c?.artists[artistId] ? artistHref(artistId) : libraryHref('albums'))
    }
    const parts = [plural(r.tracks, 'SONG')]
    if (r.trashed) parts.push(`${plural(r.trashed, 'FILE')} TO DRIVE TRASH`)
    toast.update(id, {
      icon: 'check',
      mutedIcon: false,
      text: `Removed ${name} from your library.`,
      meta: r.trashFailed ? `${plural(r.trashFailed, 'FILE')} COULDN’T BE TRASHED — DELETE BY HAND` : parts.join(' · '),
      tone: r.trashFailed ? 'danger' : 'default',
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          const u = toast.show({ icon: 'refresh', mutedIcon: true, text: `Putting ${name} back…`, duration: 0 })
          undoRemoval(r.ids)
            .then((b) =>
              toast.update(u, {
                icon: 'check',
                mutedIcon: false,
                text: `${name} is back in your library.`,
                meta: b.untrashFailed ? `${plural(b.untrashFailed, 'FILE')} STILL IN DRIVE TRASH` : undefined,
                duration: 4500,
              }),
            )
            .catch((e) => toast.update(u, { icon: 'alert', tone: 'danger', text: `Couldn’t put ${name} back.`, meta: errText(e), duration: 6000 }))
        },
      },
    })
  } catch (e) {
    toast.update(id, { icon: 'alert', mutedIcon: false, tone: 'danger', text: `Couldn’t remove ${name}.`, meta: errText(e), duration: 6000 })
  }
}

const errText = (e: unknown) => (e instanceof AuthError ? 'SIGN IN AGAIN' : !navigator.onLine ? 'NO CONNECTION' : ((e as Error)?.message ?? 'DRIVE ERROR').toUpperCase().slice(0, 80))
