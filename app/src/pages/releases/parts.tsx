/** New Releases pieces shared by the feed, the hero and the detail panel / sheet. */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { LoadingShape, useToast } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { cookie } from '../../design/shapes'
import { coverUrl, mbReleaseGroupUrl } from '../../lib/musicbrainz'
import { PelagicNative, isNative } from '../../native/bridge'
import { libraryStore } from '../../state/library'
import { releasesStore } from '../../state/releases'
import { countdown, fmtLength, fmtRelDate, fmtRelShort, isOwned, type FeedItem } from '../../state/releaseViews'
import { playList } from '../library/playback'

/* ── Labels ──────────────────────────────────────────── */

export const typeLabel = (it: FeedItem) =>
  ({ album: 'ALBUM', ep: 'EP', single: 'SINGLE', live: 'LIVE', other: it.rel.re ? 'REISSUE' : 'OTHER' })[it.rel.type]

export function TypeBadge({ item, className }: { item: FeedItem; className?: string }) {
  return <span className={`badge badge-release nr-type ${item.status === 'seen' ? 'is-seen' : ''} ${className ?? ''}`}>{typeLabel(item)}</span>
}

const trackCount = (it: FeedItem) => it.detail?.tracks.length || 0

/* ── In the library: complete, pre-release, incomplete ── */

/** IN LIBRARY · PRE-RELEASE · INCOMPLETE */
export const ownedLabel = (it: FeedItem) => (it.status === 'pre' ? 'PRE-RELEASE' : it.status === 'part' ? 'INCOMPLETE' : 'IN LIBRARY')

/** "4 OF 11 SONGS" (pre-release / incomplete), else the quality ("FLAC 16/44.1") */
export function ownedCount(it: FeedItem, short = false): string {
  if (it.status === 'lib') return it.match?.quality ?? ''
  if (it.total) return short ? `${it.have}/${it.total}` : `${it.have} OF ${it.total} SONGS`
  return short ? `${it.have}` : `${it.have} SONG${it.have === 1 ? '' : 'S'} IN LIBRARY`
}

export function OwnedTag({ item }: { item: FeedItem }) {
  return <span className={`nr-inlib is-${item.status}`}>{ownedLabel(item)}</span>
}

/** "10 OCT · 11 TRK · 44:18" (card) */
export function cardMeta(it: FeedItem): string {
  const n = trackCount(it)
  return [fmtRelShort(it.rel.date), n ? `${n} TRK` : null, it.detail?.length ? fmtLength(it.detail.length) : null].filter(Boolean).join(' · ')
}
/** "10 OCT 2026 · 11 TRACKS · 44:18" (hero) */
export function longMeta(it: FeedItem): string {
  const n = trackCount(it)
  return [fmtRelDate(it.rel.date), n ? `${n} TRACK${n === 1 ? '' : 'S'}` : null, it.detail?.length ? fmtLength(it.detail.length) : null].filter(Boolean).join(' · ')
}
/** "10 OCT · 44:18" (phone rows) */
export function phoneMeta(it: FeedItem): string {
  const n = trackCount(it)
  return [fmtRelShort(it.rel.date), it.detail?.length ? fmtLength(it.detail.length) : n ? `${n} TRK` : null].filter(Boolean).join(' · ')
}

/* ── Covers (Cover Art Archive, else a generated sleeve) ── */

const failed = new Set<string>()

function artistHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/**
 * Release cover (Cover Art Archive, else M3 Expressive gradient sleeve with artist hue and cookie burst).
 */
export function ReleaseCover({ item, size = 'sm' }: { item: FeedItem; size?: 'xs' | 'sm' | 'lg' }) {
  const id = item.rel.id
  // the same component instance can be handed another release (detail panel): read the set each render
  const [, rerender] = useState(0)
  const broken = failed.has(id)
  const cls = `nr-cover is-${item.status === 'gone' ? 'seen' : item.status}`
  if (!broken)
    return (
      <img
        className={cls}
        src={coverUrl(id, size === 'lg' ? 500 : 250)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => {
          failed.add(id)
          rerender((n) => n + 1)
        }}
      />
    )
  const h = artistHue(item.rel.a)
  return (
    <div className={`${cls} nr-fb nr-fb-${size}`} style={{ background: `linear-gradient(160deg, oklch(0.56 0.11 ${h}), oklch(0.28 0.07 ${h}))` }} aria-hidden>
      <div className="nr-fb-burst" style={{ background: `oklch(0.82 0.10 ${h} / 0.35)`, clipPath: cookie(9, 0.06) }} />
      {size !== 'xs' && (
        <>
          <span className="nr-fb-a">{item.rel.a}</span>
          <span className="nr-fb-t">{item.rel.t}</span>
        </>
      )}
    </div>
  )
}

/** Small inline busy mark (buttons, veils): the shared M3 loading indicator. */
export function Spinner() {
  return <LoadingShape size={16} />
}

/** Cover overlay while "I've got it" waits for the album to show up. */
export function MatchingVeil({ compact }: { compact?: boolean }) {
  return (
    <div className={`nr-veil ${compact ? 'is-compact' : ''}`}>
      {compact ? (
        <Spinner />
      ) : (
        <div className="nr-veil-pill">
          <Spinner />
          MATCHING
        </div>
      )}
    </div>
  )
}

export const Dot = ({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) => <span className={`nr-dot nr-dot-${size}`} aria-label="New" role="img" />

/* ── Actions ─────────────────────────────────────────── */

export function openExternal(url: string) {
  if (isNative) void PelagicNative.openUrl({ url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}

export function playRelease(it: FeedItem, start = 0) {
  if (!it.match?.trackIds.length) return
  playList(it.match.trackIds, { kind: 'album', id: it.match.albumId ?? undefined, label: it.rel.t }, { start })
}

const dayMonth = (date: string) => {
  const s = fmtRelShort(date)
  return /^\d/.test(s) ? s.replace(/^0/, '').replace(/ ([A-Z]{3})/, (_, m: string) => ` ${m[0]}${m.slice(1).toLowerCase()}`) : s
}

export function useReleaseActions(opts: { onDismissed?: (id: string) => void } = {}) {
  const toast = useToast()
  const onDismissed = useRef(opts.onDismissed)
  useLayoutEffect(() => {
    onDismissed.current = opts.onDismissed
  })
  return useMemo(
    () => ({
      toggleSeen(it: FeedItem) {
        releasesStore.mark(it.rel.id, it.status === 'seen' ? 'new' : 'seen')
      },
      got(it: FeedItem) {
        if (isOwned(it.status)) return
        const prev = releasesStore.get().doc.marks[it.rel.id]?.[0] ?? 'new'
        // tapping MATCHING again stops watching
        if (it.status === 'acq') {
          releasesStore.mark(it.rel.id, 'seen')
          toast.show({
            icon: 'x',
            mutedIcon: true,
            text: `Stopped matching ${it.rel.t}.`,
            action: { label: 'Undo', onClick: () => releasesStore.mark(it.rel.id, 'acq') },
          })
          return
        }
        const album = releasesStore.acquire(it.rel.id)
        const title = album ? libraryStore.get().data?.albums[album]?.title : null
        if (album)
          toast.show({
            icon: 'check',
            text: title && title !== it.rel.t ? `${it.rel.t} is in your library as ${title}.` : `${it.rel.t} is in your library.`,
            action: { label: 'Undo', onClick: () => releasesStore.link(it.rel.id, null, prev === 'acq' ? 'seen' : prev) },
          })
        else toast.show({ icon: 'check', text: `Watching your library for ${it.rel.t}.`, meta: 'OR PICK THE ALBUM IN ITS DETAILS' })
      },
      /** Link by hand to a library album (the panel's "It's in my library as…" list). */
      linkTo(it: FeedItem, albumId: string, albumTitle: string) {
        const prev = releasesStore.get().doc.marks[it.rel.id]?.[0] ?? 'new'
        releasesStore.link(it.rel.id, albumId)
        toast.show({
          icon: 'check',
          text: `Linked ${it.rel.t} to ${albumTitle}.`,
          action: { label: 'Undo', onClick: () => releasesStore.link(it.rel.id, null, prev) },
        })
      },
      remind(it: FeedItem) {
        const on = !it.reminded
        releasesStore.setReminder(it.rel.id, on)
        if (on)
          toast.show({
            icon: 'bellF',
            text: `Reminder set for ${dayMonth(it.rel.date)}.`,
            action: { label: 'Undo', onClick: () => releasesStore.setReminder(it.rel.id, false) },
          })
      },
      dismiss(it: FeedItem) {
        const prev = releasesStore.get().doc.marks[it.rel.id]?.[0] ?? 'new'
        releasesStore.mark(it.rel.id, 'gone')
        onDismissed.current?.(it.rel.id)
        toast.show({
          icon: 'x',
          mutedIcon: true,
          text: `Dismissed ${it.rel.t}.`,
          action: { label: 'Undo', onClick: () => releasesStore.mark(it.rel.id, prev === 'gone' ? 'new' : prev) },
        })
      },
      external(it: FeedItem) {
        openExternal(mbReleaseGroupUrl(it.rel.id))
      },
    }),
    [toast],
  )
}
export type ReleaseActions = ReturnType<typeof useReleaseActions>

export interface ActionDef {
  key: 'seen' | 'got' | 'ext' | 'remind' | 'dismiss'
  icon: IconName
  label: string
  short: string
  on: boolean
  disabled?: boolean
  run: () => void
}

/** Card / panel actions for a release that isn't in the library. */
export function actionsFor(it: FeedItem, act: ReleaseActions, online: boolean): ActionDef[] {
  const seen = it.status === 'seen'
  const acq = it.status === 'acq'
  const out: ActionDef[] = [
    { key: 'seen', icon: 'eye', label: seen ? 'Mark unseen' : 'Mark seen', short: seen ? 'Unseen' : 'Seen', on: seen, run: () => act.toggleSeen(it) },
    { key: 'got', icon: 'check', label: acq ? 'Stop matching' : 'I’ve got it', short: acq ? 'Matching' : 'Got it', on: acq, run: () => act.got(it) },
    { key: 'ext', icon: 'ext', label: 'Open on MusicBrainz', short: 'Open', on: false, disabled: !online, run: () => act.external(it) },
  ]
  if (it.upcoming)
    out.push({ key: 'remind', icon: it.reminded ? 'bellF' : 'bell', label: it.reminded ? 'Reminder set' : 'Remind me', short: it.reminded ? 'Set' : 'Remind', on: it.reminded, run: () => act.remind(it) })
  out.push({ key: 'dismiss', icon: 'x', label: 'Dismiss', short: 'Dismiss', on: false, run: () => act.dismiss(it) })
  return out
}

/** Countdown chip on upcoming covers. */
export const Countdown = ({ item, short, className }: { item: FeedItem; short?: boolean; className?: string }) => (
  <span className={`nr-count ${className ?? ''}`}>{countdown(item, short)}</span>
)

/* ── Phone row: drag right = seen, left = dismiss, tap = sheet ── */

const SWIPE = 90

export function SwipeRow({
  children,
  seenWord,
  onTap,
  onSeen,
  onDismiss,
}: {
  children: ReactNode
  seenWord: string
  onTap: () => void
  onSeen: () => void
  onDismiss: () => void
}) {
  const [dx, setDx] = useState(0)
  const [drag, setDrag] = useState(false)
  const g = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null; dx: number } | null>(null)

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, dx: 0 }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (!s.axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
      if (s.axis === 'x') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        setDrag(true)
      }
    }
    if (s.axis !== 'x') return
    s.dx = Math.max(-170, Math.min(170, mx))
    setDx(s.dx)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current
    g.current = null
    if (!s || s.id !== e.pointerId) return
    setDrag(false)
    if (!s.axis) {
      if (e.type === 'pointerup') onTap()
      return
    }
    if (s.axis !== 'x') return
    if (s.dx < -SWIPE) {
      setDx(-480)
      window.setTimeout(() => {
        onDismiss()
        setDx(0)
      }, 260)
      return
    }
    if (s.dx > SWIPE) onSeen()
    setDx(0)
  }

  return (
    <div className="nr-swipe">
      <div
        className="nr-swipe-under"
        aria-hidden
        style={{
          background: dx > 0 ? 'oklch(0.36 0.035 38)' : 'oklch(0.55 0.17 25)',
          color: dx > 0 ? 'oklch(0.92 0.025 38)' : 'oklch(0.97 0.02 25)',
          opacity: Math.min(1, Math.abs(dx) / 30),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: dx > 0 ? 1 : 0 }}>
          <Icon name="eye" />
          <span>{seenWord}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: dx < 0 ? 1 : 0 }}>
          <span>Dismiss</span>
          <Icon name="x" />
        </div>
      </div>
      <div
        className={`nr-row ${drag ? 'is-drag' : ''}`}
        style={{ transform: dx ? `translate3d(${dx}px,0,0)` : undefined }}
        role="button"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onTap()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
