/**
 * Artist page extras (Nov 2026, "Releases on Home + artist page" canvas, row 2), from Deezer through
 * the site's proxy (no new server code):
 *
 * - Songs not in your library: the artist's most popular songs on Deezer (`/api/deezer/top`) minus
 *   what the library has (titles folded like the release previews: any script, brackets / " - Live"
 *   tails dropped, so live / remix / remaster versions of an owned song are left out too).
 * - Fans also like: Deezer's related artists of this artist (the radio's cache, lib/deezer.ts) who
 *   aren't in the library and weren't marked Not interested, each with its releases of the last
 *   ~6 months (`/api/deezer/releases`), else its top songs.
 *
 * Kept in memory only: top songs 10 min (their preview URLs are signed and expire), releases 6 h.
 * Releases are fetched one after another, a little apart (Deezer allows ~50 requests / 5 s).
 * Offline / no proxy (local dev) → the sections stay hidden.
 */
import { useEffect, useState } from 'react'
import { fetchDzPreviews, fetchDzReleases, fetchDzTop, inLibrary, relatedRaw, requestRelated, useRelatedVersion, type DzReleases, type DzTopTrack } from '../lib/deezer'
import type { PreviewClip } from '../components/list/PreviewRing'
import type { Artist, Catalogue } from './library'
import type { ReleasesDoc } from './releases'

/* ── Title folding ───────────────────────────────────── */

/** Same folding as the release previews: any script, full-width → normal, no spacing / punctuation / brackets. */
export const foldTitle = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, '')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')

/* ── Small async cache ───────────────────────────────── */

const memo = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>()
function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.p as Promise<T>
  const p = fn()
  memo.set(key, { at: Date.now(), ttl, p })
  // a failure isn't remembered: the next ask tries again
  p.catch(() => memo.get(key)?.p === p && memo.delete(key))
  return p
}

// releases one after another, ~350 ms apart
let chain: Promise<unknown> = Promise.resolve()
function spaced<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => new Promise((r) => setTimeout(r, 350))).then(fn)
  chain = run.catch(() => {})
  return run
}

const online = () => typeof navigator === 'undefined' || navigator.onLine

export function artistTop(c: Catalogue, a: Artist): Promise<{ id: number; name: string; tracks: DzTopTrack[] } | null> {
  const titles = Object.values(c.albums)
    .filter((al) => al.artistId === a.id)
    .map((al) => al.title)
  return cached(`top:${a.id}`, 10 * 60_000, () => fetchDzTop(a.deezerId ? { id: a.deezerId, limit: 50 } : { name: a.name, titles, limit: 50 }))
}

export const dzTop = (dz: number, limit = 10) => cached(`dztop:${dz}:${limit}`, 10 * 60_000, () => fetchDzTop({ id: dz, limit }))

export const dzReleases = (dz: number) => cached(`rel:${dz}`, 6 * 3_600_000, () => spaced(() => fetchDzReleases(dz, 183)))

/** A Deezer release's first song with a clip. */
export function dzReleaseClip(artist: { id: number; name: string }, r: DzReleases['releases'][number]): Promise<PreviewClip | null> {
  return fetchDzPreviews(`dzrel:${r.id}`, { artists: [artist.name], dz: [artist.id], title: r.t, date: r.date, n: 0, type: r.type === 'ep' || r.type === 'single' ? r.type : 'album' }).then((dz) => {
    const j = dz ? dz.tracks.findIndex((t) => t.p) : -1
    return dz && j >= 0 ? { key: `dzrel:${r.id}#${j}`, url: dz.tracks[j].p! } : null
  })
}

export type Load<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'none' }

/** Run `fn` when `key` changes (null = don't); the result as a Load. */
export function useLoad<T>(key: string | null, fn: () => Promise<T | null>): Load<T> {
  const [res, setRes] = useState<{ key: string; value: T | null } | null>(null)
  useEffect(() => {
    if (!key) return
    let live = true
    fn().then(
      (value) => live && setRes({ key, value }),
      () => live && setRes({ key, value: null }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!key) return { state: 'none' }
  if (!res || res.key !== key) return { state: 'loading' }
  return res.value === null ? { state: 'none' } : { state: 'ok', value: res.value }
}

/* ── Songs not in your library ───────────────────────── */

export function useArtistGaps(c: Catalogue, a: Artist, enabled: boolean): Load<DzTopTrack[]> {
  const res = useLoad(enabled && online() ? `gaps:${a.id}` : null, () => artistTop(c, a))
  if (res.state !== 'ok') return res
  const owned = new Set(
    Object.values(c.tracks)
      .filter((t) => t.artistId === a.id)
      .map((t) => foldTitle(t.title)),
  )
  const seen = new Set<string>()
  const gaps = res.value.tracks.filter((t) => {
    const k = foldTitle(t.t)
    if (!k || owned.has(k) || seen.has(k)) return false
    seen.add(k)
    return true
  })
  return gaps.length ? { state: 'ok', value: gaps } : { state: 'none' }
}

/* ── Fans also like ──────────────────────────────────── */

export interface RelatedCand {
  id: number
  name: string
  followed: boolean
}

/** Related artists of a library artist that aren't in the library (not Not interested), best first. */
export function useRelatedCands(c: Catalogue, artistId: string, doc: ReleasesDoc, enabled: boolean, max = 8): RelatedCand[] | null {
  useRelatedVersion()
  useEffect(() => {
    if (enabled) void requestRelated(c, artistId)
  }, [c, artistId, enabled])
  const raw = relatedRaw(artistId)
  if (!raw) return null
  return raw
    .filter((x) => !inLibrary(c, x) && !doc.dzMuted[String(x.id)]?.[0])
    .slice(0, max)
    .map((x) => ({ id: x.id, name: x.name, followed: !!doc.follow[`dz:${x.id}`]?.[0] }))
}
