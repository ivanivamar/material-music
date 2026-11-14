/**
 * Batch Upload (step 24): everything derived from the upload store — which tracks of a release go up,
 * its issue, row status, filter buckets and counts, header / footer totals, the nav badge.
 * Pure functions of the state (plus the catalogue for "already in your library").
 */
import { qualityKind, qualityLabel } from '../components/ui/Status'
import type { Catalogue } from './library'
import { type UploadAlbum, type UploadFilter, type UploadItem, type UploadState } from './upload'
import { findMissing, listLabels, pad2, slotLabel, type MissingInfo } from './uploadIssues'
import { fmtBytes, plural } from './views'

/** Tracks of the release that are part of it (not a batch duplicate, not a skipped library duplicate). */
export function uploadable(a: UploadAlbum, s: UploadState): UploadItem[] {
  const out: UploadItem[] = []
  for (const i of a.itemIds) {
    const it = s.items[i]
    if (!it || it.state === 'dup') continue
    if (it.inLibrary && a.resolved.dup === 'skip') continue
    out.push(it)
  }
  return out
}

/** "Already in your library" without an answer: the release waits before uploading anything. */
export function hasHeldDup(a: UploadAlbum, s: UploadState): boolean {
  return !a.resolved.dup && uploadable(a, s).some((it) => it.inLibrary && (it.state === 'ready' || it.state === 'reading'))
}

export interface Quality {
  kind: ReturnType<typeof qualityKind>
  label: string
}
function qualityOf(bits: number[], rates: number[]): Quality {
  const bitDepth = Math.max(16, ...bits)
  const sampleRate = Math.max(44100, ...rates)
  return { kind: qualityKind('flac', bitDepth, sampleRate), label: qualityLabel('flac', { bitDepth, sampleRate }) }
}
export function releaseQuality(a: UploadAlbum, s: UploadState): Quality {
  const its = uploadable(a, s)
  return qualityOf(
    its.map((i) => i.meta?.bitDepth ?? 16),
    its.map((i) => i.meta?.sampleRate ?? 44100),
  )
}

/* ── Issues ─────────────────────────────────────────── */

export type Issue =
  | { kind: 'failed'; count: number; labels: string[]; message: string; anyUp: boolean }
  | { kind: 'dup'; count: number; of: number; lib: Quality; mine: Quality }
  | { kind: 'missing'; info: MissingInfo; found: number }

export function missingOf(a: UploadAlbum, s: UploadState): MissingInfo & { found: number } {
  const its = uploadable(a, s).filter((i) => i.meta)
  const info = findMissing(its.map((i) => ({ disc: i.meta!.disc, track: i.meta!.track, trackTotal: i.meta!.trackTotal })))
  return { ...info, found: uploadable(a, s).length }
}

/** The release's open issue (the first of: failed tracks, already in the library, missing tracks), or null. */
export function issueOf(a: UploadAlbum, s: UploadState, cat: Catalogue | null): Issue | null {
  if (a.skipped || a.phase === 'added') return null
  const its = uploadable(a, s)
  const failed = its.filter((i) => i.state === 'error')
  if (failed.length && !a.resolved.failed) {
    const multi = new Set(its.map((i) => i.meta?.disc ?? 1)).size > 1
    return {
      kind: 'failed',
      count: failed.length,
      labels: failed.map((i) => (i.meta?.track ? slotLabel(i.meta.disc, i.meta.track, multi) : i.name)),
      message: failed[0].error ?? 'Upload failed',
      anyUp: its.some((i) => i.state === 'uploaded' || i.state === 'done'),
    }
  }
  if (!a.resolved.dup) {
    const dups = its.filter((i) => i.inLibrary && i.state !== 'done')
    if (dups.length) {
      const libTracks = dups.map((i) => cat?.tracks[i.trackId!]).filter((t) => !!t)
      return {
        kind: 'dup',
        count: dups.length,
        of: its.length,
        lib: qualityOf(
          libTracks.map((t) => t.flac?.bitDepth ?? 16),
          libTracks.map((t) => t.flac?.sampleRate ?? 44100),
        ),
        mine: releaseQuality(a, s),
      }
    }
  }
  if (!a.resolved.missing && s.reading === 0) {
    const m = missingOf(a, s)
    if (m.slots.length) return { kind: 'missing', info: m, found: m.found }
  }
  return null
}

export interface IssueCopy {
  title: string
  text: string
}
/** Card copy (README "Issue types", plus variants for several tracks / same quality / failures). */
export function issueCopy(i: Issue): IssueCopy {
  switch (i.kind) {
    case 'missing': {
      const n = i.info.labels.length
      const title = n === 1 ? `Track ${i.info.labels[0]} is missing.` : `Tracks ${listLabels(i.info.labels)} are missing.`
      const lead = i.info.fromTag
        ? `The files are tagged as ${i.info.total} tracks, but only ${i.found} were uploaded.`
        : `The track numbers go up to ${i.info.total}, but only ${i.found} files were found.`
      return { title, text: `${lead} The rest keep uploading. Add the missing file now, or add the album without it and drop the file in later.` }
    }
    case 'dup': {
      const title = i.count >= i.of ? `Already in your library as ${i.lib.label}.` : `${i.count} of these ${i.of} tracks are already in your library as ${i.lib.label}.`
      const copy = i.mine.label === i.lib.label ? `This copy is also ${i.mine.label}.` : `This copy is ${i.mine.label}.`
      return { title, text: `${copy} Replacing keeps your plays, likes and playlist positions.` }
    }
    case 'failed': {
      const title = i.count === 1 ? `Track ${i.labels[0]} didn’t upload.` : `${i.count} tracks didn’t upload.`
      return { title, text: i.anyUp ? `${i.message}. The rest of the release is on the server. Try again, or add the release without them.` : `${i.message}.` }
    }
  }
}

/* ── Progress, status, buckets ──────────────────────── */

const doneish = (it: UploadItem) => it.state === 'uploaded' || it.state === 'done'

/** 0..100 over the release's tracks (by size). */
export function releasePct(a: UploadAlbum, s: UploadState): number {
  const its = uploadable(a, s)
  const total = its.reduce((n, i) => n + i.size, 0)
  if (!total) return a.phase === 'added' ? 100 : 0
  const done = its.reduce((n, i) => n + i.size * (doneish(i) ? 1 : i.state === 'error' ? 0 : i.progress), 0)
  return Math.min(100, (done / total) * 100)
}
export const onServer = (a: UploadAlbum, s: UploadState) => {
  const its = uploadable(a, s)
  return a.phase === 'added' || (its.length > 0 && its.every(doneish))
}
/** A track of the release is being encoded / sent right now. */
export const isActive = (a: UploadAlbum, s: UploadState) => a.itemIds.some((i) => s.items[i]?.state === 'encoding' || s.items[i]?.state === 'uploading')

/** All files up and nothing open: add it to the library. */
export function canCommit(a: UploadAlbum, s: UploadState, cat: Catalogue | null): boolean {
  if (a.skipped || a.phase !== 'pending' || s.reading > 0) return false
  const its = uploadable(a, s)
  if (!its.some((i) => i.state === 'uploaded')) return false
  if (!its.every((i) => doneish(i) || (i.state === 'error' && a.resolved.failed))) return false
  return !issueOf(a, s, cat)
}

export type Bucket = 'need' | 'prog' | 'added' | 'skip'
export function bucketOf(a: UploadAlbum, s: UploadState, cat: Catalogue | null): Bucket {
  if (a.skipped) return 'skip'
  if (issueOf(a, s, cat)) return 'need'
  if (a.phase === 'added') return 'added'
  return 'prog'
}

export type Tone = 'queued' | 'live' | 'warn' | 'added' | 'skip' | 'ready'
export interface RowStatus {
  label: string
  /** short form for the inspector kicker (no %) */
  word: string
  tone: Tone
}
export function statusOf(a: UploadAlbum, s: UploadState, cat: Catalogue | null): RowStatus {
  if (a.skipped) return { label: 'SKIPPED', word: 'SKIPPED', tone: 'skip' }
  const issue = issueOf(a, s, cat)
  if (issue) return issue.kind === 'failed' ? { label: 'FAILED', word: 'FAILED', tone: 'warn' } : { label: 'NEEDS YOU', word: 'NEEDS YOU', tone: 'warn' }
  if (a.phase === 'added') return { label: 'ADDED', word: 'ADDED', tone: 'added' }
  if (a.phase === 'adding' || onServer(a, s)) return { label: 'ADDING', word: 'ADDING', tone: 'ready' }
  if (isActive(a, s)) return { label: `UPLOADING ${Math.floor(releasePct(a, s))}%`, word: 'UPLOADING', tone: 'live' }
  return { label: 'QUEUED', word: 'QUEUED', tone: 'queued' }
}

/* ── Page totals ────────────────────────────────────── */

export interface BatchView {
  counts: Record<UploadFilter, number>
  /** header kicker: 9 RELEASES · 62 TRACKS · 2.9 GB */
  head: string
  /** footer: overall 0..100 and the status line */
  pct: number
  foot: string
  /** primary batch button */
  button: 'upload' | 'pause' | 'resume'
  canUpload: boolean
  needs: number
}

export function batchView(s: UploadState, cat: Catalogue | null): BatchView {
  const counts: Record<UploadFilter, number> = { all: s.albums.length, need: 0, prog: 0, added: 0 }
  for (const a of s.albums) {
    const b = bucketOf(a, s, cat)
    if (b !== 'skip') counts[b]++
  }
  const live = s.albums.filter((a) => !a.skipped)
  let tracks = 0
  let bytes = 0
  let total = 0
  let sent = 0
  for (const a of live) {
    for (const it of uploadable(a, s)) {
      tracks++
      bytes += it.size
      // FLAC bytes (the Opus copy is ~8% on top; leaving it out keeps the figures in step with the header)
      const e = it.size
      total += e
      sent += e * (doneish(it) ? 1 : it.state === 'error' ? 0 : it.progress)
    }
  }
  const left = Math.max(0, total - sent)
  const up = live.filter((a) => onServer(a, s)).length
  const allUp = live.length > 0 && up === live.length
  let tail: string
  if (allUp || (s.started && left < 1e6 && !s.paused)) tail = 'ALL FILES ON SERVER'
  else if (!s.started) tail = `${fmtBytes(left)} READY TO UPLOAD`
  else if (s.paused) tail = s.authError ? 'GOOGLE SESSION EXPIRED · SIGN IN, THEN RESUME' : `${fmtBytes(left)} LEFT · PAUSED`
  else {
    const eta = s.speed && s.speed > 0 ? left / s.speed : null
    tail = `${fmtBytes(left)} LEFT${eta == null ? '' : ` · ABOUT ${eta >= 5400 ? `${Math.round(eta / 3600)} H` : eta >= 60 ? `${Math.ceil(eta / 60)} MIN` : `${Math.max(1, Math.ceil(eta))} S`}`}`
  }
  if (s.reading > 0) tail = `READING ${plural(s.reading, 'FILE')}… · ${tail}`
  const pending = live.some((a) => a.phase === 'pending' && !hasHeldDup(a, s) && uploadable(a, s).some((i) => i.state === 'ready'))
  return {
    counts,
    head: `${plural(live.length, 'RELEASE')} · ${plural(tracks, 'TRACK')} · ${fmtBytes(bytes)}`,
    pct: total ? (sent / total) * 100 : 0,
    foot: `${up} OF ${live.length} ON SERVER · ${tail}`,
    button: !s.started ? 'upload' : s.paused ? 'resume' : 'pause',
    canUpload: pending && s.reading === 0,
    needs: counts.need,
  }
}

export const inFilter = (a: UploadAlbum, s: UploadState, cat: Catalogue | null, f: UploadFilter) => f === 'all' || bucketOf(a, s, cat) === f

/** For the shell: nav badge and the "uploading" toast while away from the page. */
export function uploadSummary(s: UploadState, cat: Catalogue | null) {
  const live = s.albums.filter((a) => !a.skipped)
  const needs = s.albums.filter((a) => bucketOf(a, s, cat) === 'need').length
  const active = live.find((a) => isActive(a, s)) ?? null
  const inRun = live.filter((a) => a.phase !== 'added' || s.started)
  return {
    needs,
    running: s.started && !s.paused,
    active,
    done: inRun.filter((a) => onServer(a, s)).length,
    total: inRun.length,
    ratio: batchView(s, cat).pct / 100,
    badge: needs > 0 ? `${needs} !` : s.started && !s.paused && inRun.length ? `${inRun.filter((a) => onServer(a, s)).length}/${inRun.length}` : undefined,
  }
}

export { pad2 }
