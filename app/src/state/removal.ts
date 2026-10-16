/**
 * Remove songs / albums / artists from the library altogether (Oct 16, 2026).
 *
 *   1. library.json: the entries move from `tracks` / `albums` / `artists` into `removed` (with the
 *      full entry, for Undo). An album goes when its last song goes, an artist when their last album
 *      goes. Written with the same read-merge-write as the Upload page (updateCatalogue).
 *   2. Drive: the FLAC + Opus copies (and the cover / artist photo + banner of whatever went
 *      entirely) are moved to the Drive trash — recoverable there for 30 days.
 *   3. This device: the removed songs leave the play queue. Other devices see the new library.json
 *      on their next check and do the same (see the library listener below); Android's offline
 *      copies go by themselves, because the download plan no longer lists them.
 *
 * Undo puts the entries back and takes the files out of the trash. The importer skips anything
 * listed in `removed` (by source path or track id) unless run with `--include-removed`; dropping the
 * same files on the Upload page brings them back too.
 */
import { DriveError, driveFetch } from '../lib/drive'
import { updateCatalogue } from '../upload/driveWrite'
import { libraryStore, tracksByAlbum, type Album, type Artist, type Catalogue, type Removed, type Track } from './library'
import { playerStore } from './player'
import { artistInfos } from './views'

export type RemoveTarget = { kind: 'track'; trackIds: string[] } | { kind: 'album'; albumId: string } | { kind: 'artist'; artistId: string }

/** What a removal will take out, as the catalogue stands now (for the confirm dialog). */
export interface RemovalPlan {
  trackIds: string[]
  /** albums that end up empty and go too */
  albumIds: string[]
  /** artists left without albums, who go too */
  artistIds: string[]
  /** FLAC bytes (what the library counts) */
  bytes: number
  /** Drive files that go to the trash */
  files: number
}

interface Ids {
  trackIds: string[]
  albumIds: string[]
  artistIds: string[]
}

function idsOf(c: Catalogue, t: RemoveTarget): Ids {
  if (t.kind === 'track') return { trackIds: t.trackIds.filter((id) => c.tracks[id]), albumIds: [], artistIds: [] }
  if (t.kind === 'album') {
    const album = c.albums[t.albumId]
    if (!album) return { trackIds: [], albumIds: [], artistIds: [] }
    return { trackIds: (tracksByAlbum(c).get(album.id) ?? []).map((x) => x.id), albumIds: [album.id], artistIds: [] }
  }
  const albums = artistInfos(c).get(t.artistId)?.albums ?? []
  const byAlbum = tracksByAlbum(c)
  return {
    trackIds: albums.flatMap((a) => (byAlbum.get(a.id) ?? []).map((x) => x.id)),
    albumIds: albums.map((a) => a.id),
    artistIds: c.artists[t.artistId] ? [t.artistId] : [],
  }
}

interface Applied {
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
}

/**
 * Move the entries into `c.removed` (mutates `c`). Albums in `albumIds` or holding a removed song
 * go only when nothing is left in them (another device may have added songs meanwhile); the same
 * for artists and their albums.
 */
function apply(c: Catalogue, ids: Ids, at: string): Applied {
  const removed: Removed = (c.removed ??= { tracks: {}, albums: {}, artists: {} })
  removed.tracks ??= {}
  removed.albums ??= {}
  removed.artists ??= {}
  const out: Applied = { tracks: [], albums: [], artists: [] }
  const albumIds = new Set(ids.albumIds)
  for (const id of ids.trackIds) {
    const t = c.tracks[id]
    if (!t) continue
    albumIds.add(t.albumId)
    removed.tracks[id] = { at, track: t }
    delete c.tracks[id]
    out.tracks.push(t)
  }
  const left = new Map<string, number>()
  for (const t of Object.values(c.tracks)) left.set(t.albumId, (left.get(t.albumId) ?? 0) + 1)
  const artistIds = new Set(ids.artistIds)
  for (const id of albumIds) {
    const a = c.albums[id]
    if (!a) continue
    a.trackCount = left.get(id) ?? 0
    if (a.trackCount) continue
    artistIds.add(a.artistId)
    removed.albums[id] = { at, album: a }
    delete c.albums[id]
    out.albums.push(a)
  }
  const withAlbums = new Set(Object.values(c.albums).map((a) => a.artistId))
  for (const id of artistIds) {
    const a = c.artists[id]
    if (!a || withAlbums.has(id)) continue
    removed.artists[id] = { at, artist: a }
    delete c.artists[id]
    out.artists.push(a)
  }
  return out
}

/** Put entries back from `c.removed` (mutates `c`). Returns what came back. */
function unapply(c: Catalogue, ids: Ids): Applied {
  const out: Applied = { tracks: [], albums: [], artists: [] }
  const r = c.removed
  if (!r) return out
  for (const id of ids.artistIds) {
    const e = r.artists?.[id]
    if (!e) continue
    c.artists[id] ??= e.artist
    delete r.artists[id]
    out.artists.push(e.artist)
  }
  for (const id of ids.albumIds) {
    const e = r.albums?.[id]
    if (!e) continue
    c.albums[id] ??= e.album
    delete r.albums[id]
    out.albums.push(e.album)
  }
  for (const id of ids.trackIds) {
    const e = r.tracks?.[id]
    if (!e) continue
    c.tracks[id] ??= e.track
    delete r.tracks[id]
    out.tracks.push(e.track)
    // an album that stayed (other songs in it) still needs its count back
    if (!c.albums[e.track.albumId] && r.albums?.[e.track.albumId]) {
      c.albums[e.track.albumId] = r.albums[e.track.albumId].album
      delete r.albums[e.track.albumId]
    }
    if (!c.artists[e.track.artistId] && r.artists?.[e.track.artistId]) {
      c.artists[e.track.artistId] = r.artists[e.track.artistId].artist
      delete r.artists[e.track.artistId]
    }
  }
  const counts = new Map<string, number>()
  for (const t of Object.values(c.tracks)) counts.set(t.albumId, (counts.get(t.albumId) ?? 0) + 1)
  for (const t of out.tracks) if (c.albums[t.albumId]) c.albums[t.albumId].trackCount = counts.get(t.albumId) ?? 0
  return out
}

const filesOf = (a: Applied): string[] => {
  const ids = new Set<string>()
  for (const t of a.tracks) {
    if (t.flac?.id) ids.add(t.flac.id)
    if (t.mobile?.id) ids.add(t.mobile.id)
  }
  for (const al of a.albums) if (al.cover) ids.add(al.cover)
  for (const ar of a.artists) {
    if (ar.image?.id) ids.add(ar.image.id)
    if (ar.background?.id) ids.add(ar.background.id)
  }
  return [...ids]
}

export function planRemoval(c: Catalogue, t: RemoveTarget): RemovalPlan {
  // apply() writes trackCount on the albums it looks at: give it copies
  const albums = Object.fromEntries(Object.entries(c.albums).map(([k, v]) => [k, { ...v }]))
  const copy: Catalogue = { ...c, tracks: { ...c.tracks }, albums, artists: { ...c.artists }, removed: { tracks: {}, albums: {}, artists: {} } }
  const done = apply(copy, idsOf(c, t), '')
  return {
    trackIds: done.tracks.map((x) => x.id),
    albumIds: done.albums.map((x) => x.id),
    artistIds: done.artists.map((x) => x.id),
    bytes: done.tracks.reduce((s, x) => s + (x.flac?.size ?? 0), 0),
    files: filesOf(done).length,
  }
}

/** Set `trashed` on Drive files, a few at a time. Files already gone count as done. Returns failures. */
async function setTrashed(ids: string[], trashed: boolean): Promise<number> {
  let failed = 0
  const queue = [...ids]
  await Promise.all(
    Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let id; (id = queue.shift()); ) {
        try {
          await driveFetch(`/files/${encodeURIComponent(id)}?fields=id`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed }),
          })
        } catch (e) {
          if (!(e instanceof DriveError && e.status === 404)) failed++
        }
      }
    }),
  )
  return failed
}

export interface RemovalResult {
  /** pass to undoRemoval */
  ids: Ids
  tracks: number
  albums: number
  artists: number
  /** files moved to the trash / that couldn't be */
  trashed: number
  trashFailed: number
}

/** Remove from library.json, then move the files to the Drive trash. Throws if library.json couldn't be written. */
export async function removeFromLibrary(t: RemoveTarget): Promise<RemovalResult> {
  const lib = libraryStore.get()
  if (!lib.data) throw new Error('The library isn’t loaded.')
  const ids = idsOf(lib.data, t)
  let done: Applied = { tracks: [], albums: [], artists: [] }
  const at = new Date().toISOString()
  const w = await updateCatalogue(
    (c) => {
      done = apply(c, ids, at)
    },
    { data: lib.data, version: lib.fileVersion },
  )
  libraryStore.adopt(w.data, w.fileId, w.version)
  dropFromQueue(w.data)
  const files = filesOf(done)
  const trashFailed = await setTrashed(files, true)
  return {
    ids: { trackIds: done.tracks.map((x) => x.id), albumIds: done.albums.map((x) => x.id), artistIds: done.artists.map((x) => x.id) },
    tracks: done.tracks.length,
    albums: done.albums.length,
    artists: done.artists.length,
    trashed: files.length - trashFailed,
    trashFailed,
  }
}

/** Undo: entries back into the library, files out of the trash. */
export async function undoRemoval(ids: Ids): Promise<{ tracks: number; untrashFailed: number }> {
  const lib = libraryStore.get()
  let back: Applied = { tracks: [], albums: [], artists: [] }
  // files first: the library shouldn't point at trashed files, even for a moment
  const pending = lib.data?.removed
  const preview: Applied = {
    tracks: ids.trackIds.map((id) => pending?.tracks?.[id]?.track).filter((x): x is Track => !!x),
    albums: ids.albumIds.map((id) => pending?.albums?.[id]?.album).filter((x): x is Album => !!x),
    artists: ids.artistIds.map((id) => pending?.artists?.[id]?.artist).filter((x): x is Artist => !!x),
  }
  const untrashFailed = await setTrashed(filesOf(preview), false)
  const w = await updateCatalogue(
    (c) => {
      back = unapply(c, ids)
    },
    { data: lib.data, version: lib.fileVersion },
  )
  libraryStore.adopt(w.data, w.fileId, w.version)
  return { tracks: back.tracks.length, untrashFailed }
}

/** Take songs listed as removed out of the play queue. */
function dropFromQueue(c: Catalogue) {
  const gone = c.removed?.tracks
  if (!gone) return
  const ids = new Set(playerStore.get().queue.filter((id) => gone[id] && !c.tracks[id]))
  if (ids.size) playerStore.dropTracks(ids)
}

// another device removed something: once its library.json arrives, the queue follows
let seen: Catalogue | null = null
libraryStore.subscribe(() => {
  const data = libraryStore.get().data
  if (data === seen) return
  seen = data
  if (data) dropFromQueue(data)
})
