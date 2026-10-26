/**
 * New Releases side panel (Material 3 Expressive redesign, handoff NewReleasesMaterial.dc.html).
 * Desktop: 460px right popover over a dark scrim.
 * Phone: bottom sheet with swipe-down handle.
 * Contents: release detail, or Followed artists settings.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Skeleton, Toggle } from '../../components/ui'
import { Icon } from '../../design/icons'
import { bandcampSearchUrl, mbReleaseGroupUrl } from '../../lib/musicbrainz'
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { releasesStore, useReleases } from '../../state/releases'
import { countdown, fmtLength, fmtRelDate, fmtRelShort, followedArtists, isOwned, trackMatches, type FeedItem } from '../../state/releaseViews'
import { artistHref, go } from '../../shell/routes'
import { ArtistAvatar } from '../library/common'
import { useNowPlaying } from '../library/playback'
import { Countdown, Dot, MatchingVeil, ReleaseCover, Spinner, openExternal, ownedLabel, playRelease, typeLabel, type ReleaseActions } from './parts'

const niceDay = (date: string) => fmtRelShort(date).replace(/^0/, '').replace(/ ([A-Z])([A-Z]+)/, (_, a: string, b: string) => ` ${a}${b.toLowerCase()}`)

export type PanelState = { kind: 'rel'; id: string } | { kind: 'artists' } | { kind: 'artistFilter' } | null

/* ── Container ───────────────────────────────────────── */

export function ReleasePanel({
  open,
  phone,
  contentKey,
  onClose,
  children,
}: {
  open: boolean
  phone: boolean
  contentKey: string
  onClose: () => void
  children: ReactNode
}) {
  const [grabDy, setGrabDy] = useState<number | null>(null)
  const grab = useRef({ active: false, pid: -1, y0: 0, y: 0, t: 0, v: 0, moved: false, onHandle: false, fromBtn: false })
  const swallowClick = useRef(false)
  const panelRef = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: 0 })
    else {
      grab.current.active = false
      setGrabDy(null)
    }
  }, [open, contentKey])

  /* Phone bottom sheet drag (same gesture model as QueuePanel):
   * Dragging the handle or header area pulls the sheet down; a press on an interactive control
   * stays a tap unless the finger moves past BTN_SLOP. Also supports pulling down when an inner
   * scrollable list is at scrollTop === 0. */
  const BTN_SLOP = 8
  const isGrabZone = (target: HTMLElement) => {
    const scrollList = target.closest<HTMLElement>('.nrp-art-list')
    if (scrollList) return false
    if (contentKey !== 'artists') {
      // In detail / filter sheets, the top handle, header, and cover/title block are non-scrolling grab zones
      return !!target.closest('.nr-handle, .nrp-head, .nrp-top, .nrp-titles')
    }
    return true
  }

  const onGrabDown = (e: PointerEvent<HTMLElement>) => {
    if (!phone || !e.isPrimary) return
    const target = e.target as HTMLElement
    if (!isGrabZone(target)) return
    const fromBtn = !!target.closest('button, a, input, label, .nrp-reissues-card')
    if (!fromBtn) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    swallowClick.current = false
    grab.current = {
      active: true,
      pid: e.pointerId,
      y0: e.clientY,
      y: e.clientY,
      t: performance.now(),
      v: 0,
      moved: false,
      onHandle: !!target.closest('.nr-handle'),
      fromBtn,
    }
    setGrabDy(0)
  }

  const onGrabMove = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current
    if (!g.active || g.pid !== e.pointerId) return
    const now = performance.now()
    if (now > g.t) g.v = 0.7 * ((e.clientY - g.y) / (now - g.t)) + 0.3 * g.v
    g.y = e.clientY
    g.t = now
    const dy = e.clientY - g.y0
    if (!g.moved) {
      if (Math.abs(dy) <= (g.fromBtn ? BTN_SLOP : 4)) return
      if (dy < 0) {
        g.active = false
        setGrabDy(null)
        return
      }
      g.moved = true
      if (g.fromBtn) {
        swallowClick.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }
    setGrabDy(Math.max(0, dy))
  }

  const onGrabUp = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current
    if (!g.active || g.pid !== e.pointerId) return
    g.active = false
    const dy = Math.max(0, e.clientY - g.y0)
    const { v, moved, onHandle } = g
    setGrabDy(null)
    if (swallowClick.current) window.setTimeout(() => (swallowClick.current = false), 350)
    if (!moved) {
      if (onHandle) onClose()
      return
    }
    if (dy > 100 || v > 0.45) onClose()
  }

  const onGrabCancel = () => {
    grab.current.active = false
    setGrabDy(null)
  }

  const onGrabClickCapture = (e: ReactMouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  // Also allow pulling down to close when starting a touch inside the scrollable list at scrollTop === 0
  useEffect(() => {
    const el = panelRef.current
    if (!el || !phone || !open) return
    let tracking = false
    let dragging = false
    let y0 = 0
    let x0 = 0
    let lastY = 0
    let lastT = 0
    let v = 0
    let scrollEl: HTMLElement | null = null

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return
      const target = ev.target as HTMLElement
      if (isGrabZone(target)) return // handled by pointer events
      scrollEl = target.closest<HTMLElement>('.nrp-art-list') ?? scroller.current
      if (!scrollEl || scrollEl.scrollTop > 0) return
      const t = ev.touches[0]
      tracking = true
      dragging = false
      y0 = lastY = t.clientY
      x0 = t.clientX
      lastT = performance.now()
      v = 0
    }

    const onTouchMove = (ev: TouchEvent) => {
      if (!tracking || ev.touches.length !== 1) return
      const t = ev.touches[0]
      const dy = t.clientY - y0
      const dx = t.clientX - x0
      const now = performance.now()
      if (!dragging) {
        if (scrollEl && scrollEl.scrollTop > 0) {
          tracking = false
          return
        }
        if (dy < -4 || Math.abs(dx) > Math.abs(dy) + 4) {
          tracking = false
          return
        }
        if (dy <= 8) return
        dragging = true
        y0 = t.clientY
      }
      if (ev.cancelable) ev.preventDefault()
      if (now > lastT) v = 0.7 * ((t.clientY - lastY) / (now - lastT)) + 0.3 * v
      lastY = t.clientY
      lastT = now
      setGrabDy(Math.max(0, t.clientY - y0))
    }

    const onTouchEnd = () => {
      if (!tracking) return
      tracking = false
      if (!dragging) return
      dragging = false
      const dy = Math.max(0, lastY - y0)
      setGrabDy(null)
      if (dy > 100 || v > 0.45) onClose()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, open, contentKey])

  const isArtists = contentKey === 'artists'
  const pulling = grabDy !== null

  return createPortal(
    <>
      <div
        className={`nr-scrim ${open ? 'is-open' : ''} ${pulling ? 'is-grabbing' : ''}`}
        style={grabDy && grabDy > 0 ? { opacity: Math.max(0, 1 - grabDy / 420) } : undefined}
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        className={`nr-panel ${open ? 'is-open' : ''} ${phone ? 'is-phone' : ''} ${isArtists ? 'is-artists' : ''} ${pulling ? 'is-grabbing' : ''}`}
        style={grabDy !== null ? { transform: `translate3d(0, ${grabDy}px, 0)` } : undefined}
        aria-hidden={!open}
        inert={!open}
        role="dialog"
        aria-modal="true"
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabUp}
        onPointerCancel={onGrabCancel}
        onClickCapture={onGrabClickCapture}
      >
        {phone && (
          <div className="nr-handle" aria-label="Close" role="button">
            <span />
          </div>
        )}
        <div className={`nr-panel-scroll ${isArtists ? 'is-artists' : ''}`} ref={scroller}>
          {children}
        </div>
      </aside>
    </>,
    document.body,
  )
}

export function PanelHead({ kicker, externalUrl, onClose }: { kicker: string; externalUrl?: string; onClose: () => void }) {
  return (
    <div className="nrp-head">
      <span className="nrp-kicker">{kicker}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {externalUrl && (
          <button
            type="button"
            className="nrp-x"
            onClick={() => openExternal(externalUrl)}
            aria-label="Open on MusicBrainz"
            title="Open on MusicBrainz"
          >
            <Icon name="ext" />
          </button>
        )}
        <button type="button" className="nrp-x" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}

/* ── Release Detail ──────────────────────────────────── */

export function ReleaseDetail({
  item,
  c,
  phone,
  online,
  act,
  onClose,
}: {
  item: FeedItem
  c: Catalogue
  phone: boolean
  online: boolean
  act: ReleaseActions
  onClose: () => void
}) {
  const { doc, loadingDetail } = useReleases()
  const id = item.rel.id
  useEffect(() => {
    void releasesStore.ensureDetail(id, 10)
    void releasesStore.ensureLinks(item.mbid, 5)
  }, [id, item.mbid])

  const lib = isOwned(item.status)
  const partial = (item.status === 'pre' || item.status === 'part') && !!item.detail?.tracks.length
  const loading = !item.detail && loadingDetail.includes(id)
  const links = doc.links[item.mbid]
  const matches = useMemo(() => (lib && !partial ? [] : trackMatches(c, item)), [c, item, lib, partial])
  const matchedIdx = new Set(matches.map((m) => m.index))
  const owner = item.owners[0]
  const now = useNowPlaying()

  const n = item.detail?.tracks.length ?? 0
  const facts: [string, ReactNode][] = [
    ['RELEASED', item.upcoming ? `${fmtRelDate(item.rel.date)} · ${countdown(item)}` : fmtRelDate(item.rel.date)],
    ['LABEL', item.detail ? (item.detail.label ?? 'Unknown') : loading ? <Skeleton key="l" width="70%" height={12} /> : '—'],
    ['TYPE', typeLabel(item)],
    ['TRACKS', item.detail ? (n ? String(n) : 'Not yet listed') : loading ? <Skeleton key="t" width="30%" height={12} /> : '—'],
    ['LENGTH', item.detail?.length ? fmtLength(item.detail.length) : item.detail ? 'Unknown' : loading ? <Skeleton key="d" width="40%" height={12} /> : '—'],
  ]

  let matchText: string | null = null
  const album = item.match?.albumId ? c.albums[item.match.albumId] : null
  const as = album && album.title !== item.rel.t ? ` as ${album.title}` : ''
  if (item.status === 'pre') {
    const num = item.total ? `${item.have} of ${item.total} songs are` : `${item.have} song${item.have === 1 ? ' is' : 's are'}`
    matchText = `${num} already in your library${as}. The rest come out on ${niceDay(item.rel.date)}${item.reminded ? ', and you’ll be reminded that day' : ''}.`
  } else if (item.status === 'part') {
    const miss = item.total - item.have
    matchText = `${item.have} of ${item.total} songs are in your library${as}. ${miss} missing: moves to In library once they arrive.`
  } else if (lib && item.match) {
    matchText = album && album.title !== item.rel.t ? `In your library as ${album.title}, ${item.match.quality}.` : `In your library, ${item.match.quality}.`
  } else if (matches.length) {
    const m = matches[0]
    const mbTitle = item.detail!.tracks[m.index][0]
    matchText = `${mbTitle} ${mbTitle === m.title ? 'is' : `matches ${m.title}`} on ${m.album}, already in your library.`
  }

  const matchById = new Map(matches.map((m) => [m.index, m]))
  const partialIds = partial ? matches.map((m) => m.trackId) : []
  const libTracks = lib && item.match ? item.match.trackIds.map((tid) => c.tracks[tid]).filter(Boolean) : []
  const albumTracks = lib && item.match?.albumId ? (tracksByAlbum(c).get(item.match.albumId) ?? libTracks) : libTracks

  const linkList: { label: string; url: string }[] = [
    { label: 'MusicBrainz', url: mbReleaseGroupUrl(id) },
    { label: 'Bandcamp', url: links?.bandcamp ?? bandcampSearchUrl(owner?.name ?? item.rel.a, item.rel.t) },
    ...(links?.homepage ? [{ label: 'Artist site', url: links.homepage }] : []),
  ]

  const statusBadge = item.upcoming ? (
    <span className="badge badge-release is-new">{`IN ${item.daysTo} ${item.daysTo === 1 ? 'DAY' : 'DAYS'}`}</span>
  ) : item.status === 'acq' ? (
    <span className="badge badge-release" style={{ background: 'oklch(0.84 0.09 290)', color: 'oklch(0.28 0.08 292)' }}>MATCHING</span>
  ) : item.status === 'new' ? (
    <span className="badge badge-release is-new">NEW</span>
  ) : item.status === 'seen' ? (
    <span className="badge badge-release is-seen">SEEN</span>
  ) : isOwned(item.status) ? (
    <span className="badge badge-release is-lib">{ownedLabel(item)}</span>
  ) : null

  const titleNode = (
    <div className="nrp-titles">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {statusBadge}
        <span className="nr-mono">{typeLabel(item)}</span>
      </div>
      <div className="nrp-title-row">
        {item.status === 'new' && <Dot size="md" />}
        <h2 className="nrp-title">{item.rel.t}</h2>
      </div>
      <button type="button" className="nrp-artist" onClick={() => owner && !item.external && go(artistHref(owner.id))}>
        {item.rel.a}
      </button>
    </div>
  )

  return (
    <div className="nrp">
      <PanelHead
        kicker={item.upcoming ? 'UPCOMING · MUSICBRAINZ' : 'OUT NOW · MUSICBRAINZ'}
        externalUrl={mbReleaseGroupUrl(id)}
        onClose={onClose}
      />

      {phone ? (
        <div className="nrp-top">
          <div className="nrp-cover">
            <ReleaseCover item={item} size="lg" />
            {item.status === 'acq' && <MatchingVeil compact />}
          </div>
          {titleNode}
        </div>
      ) : (
        <>
          <div className="nrp-cover">
            <ReleaseCover item={item} size="lg" />
            {item.upcoming && <Countdown item={item} className="is-lg" />}
            {item.status === 'acq' && <MatchingVeil />}
          </div>
          {titleNode}
        </>
      )}

      {matchText && (
        <div className="nrp-match">
          <Icon name="check" style={{ color: 'var(--brand)' }} />
          <span>{matchText}</span>
        </div>
      )}

      <div className={phone ? 'nrp-acts-phone' : 'nrp-acts'}>
        {phone ? (
          item.upcoming ? (
            <button
              type="button"
              className={`btn ${item.reminded ? 'btn-primary' : 'btn-secondary'} nrp-pbtn-full`}
              onClick={() => act.remind(item)}
            >
              <span className="btn-ic"><Icon name={item.reminded ? 'bellF' : 'bell'} /></span>
              {item.reminded ? 'Reminder set' : 'Remind me'}
            </button>
          ) : lib ? (
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button type="button" className="btn btn-primary nrp-pbtn-flex" onClick={() => playRelease(item)}>
                <span className="btn-ic"><Icon name="playF" /></span>
                Play
              </button>
              <button
                type="button"
                className="btn btn-ghost nrp-sqbtn-48"
                title="Dismiss"
                aria-label="Dismiss"
                onClick={() => {
                  act.dismiss(item)
                  onClose()
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          ) : item.status === 'acq' ? (
            <div className="nrp-acq-pill">
              <span className="btn-ic"><Spinner /></span>
              Matching your files…
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button
                type="button"
                className="btn btn-primary nrp-pbtn-flex"
                onClick={() => act.got(item)}
              >
                <span className="btn-ic"><Icon name="check" /></span>
                I’ve got it
              </button>
              <button
                type="button"
                className="btn btn-ghost nrp-sqbtn-48"
                title={item.status === 'seen' ? 'Mark new' : 'Mark seen'}
                aria-label={item.status === 'seen' ? 'Mark new' : 'Mark seen'}
                onClick={() => act.toggleSeen(item)}
              >
                <Icon name="eye" />
              </button>
              <button
                type="button"
                className="btn btn-ghost nrp-sqbtn-48"
                title="Dismiss"
                aria-label="Dismiss"
                onClick={() => {
                  act.dismiss(item)
                  onClose()
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          )
        ) : (
          lib ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => playRelease(item)}>
                <span className="btn-ic"><Icon name="playF" /></span>
                Play
              </button>
              {item.status === 'pre' && (
                <button
                  type="button"
                  className={`btn ${item.reminded ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={item.reminded}
                  onClick={() => act.remind(item)}
                >
                  <span className="btn-ic"><Icon name={item.reminded ? 'bellF' : 'bell'} /></span>
                  {item.reminded ? 'Reminder set' : 'Remind me'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => act.dismiss(item)}>
                <span className="btn-ic"><Icon name="x" /></span>
                Dismiss
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${item.status === 'acq' ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => act.got(item)}
                disabled={item.status === 'acq'}
              >
                <span className="btn-ic">{item.status === 'acq' ? <Spinner /> : <Icon name="check" />}</span>
                {item.status === 'acq' ? 'Matching…' : "I’ve got it"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => act.toggleSeen(item)}>
                <span className="btn-ic"><Icon name="eye" /></span>
                {item.status === 'seen' ? 'Mark new' : 'Mark seen'}
              </button>
              {item.upcoming && (
                <button
                  type="button"
                  className={`btn ${item.reminded ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => act.remind(item)}
                >
                  <span className="btn-ic"><Icon name={item.reminded ? 'bellF' : 'bell'} /></span>
                  {item.reminded ? 'Reminder set' : 'Remind me'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => act.dismiss(item)}>
                <span className="btn-ic"><Icon name="x" /></span>
                Dismiss
              </button>
            </>
          )
        )}
      </div>

      <div className="nrp-card">
        {facts.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '32px', fontSize: '13px' }}>
            <span className="nr-mono" style={{ fontSize: '11px', color: 'oklch(0.62 0.014 40)' }}>{k}</span>
            <span style={{ color: 'oklch(0.94 0.006 40)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {linkList.map((l) => (
          <button
            key={l.label}
            type="button"
            className="chip nr-chip"
            disabled={!online}
            onClick={() => openExternal(l.url)}
            style={{ fontSize: '13px', height: '36px' }}
          >
            {l.label}
            <Icon name="ext" />
          </button>
        ))}
      </div>

      <div className="nrp-card">
        <div className="nrp-card-head">
          <span>TRACKLIST</span>
          <span style={{ fontSize: '11px', color: 'oklch(0.62 0.014 40)' }}>
            {partial ? `${item.have} OF ${item.total} IN LIBRARY` : lib ? 'PLAYABLE' : item.detail ? (n ? `${n} TRACKS` : 'NOT YET LISTED') : loading ? 'CHECKING MUSICBRAINZ' : ''}
          </span>
        </div>
        {partial
          ? item.detail!.tracks.map(([t, d], i) => {
              const m = matchById.get(i)
              if (!m)
                return (
                  <div key={i} className="nrp-trow" style={{ opacity: 0.6 }}>
                    <span className="nrp-trow-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="nrp-trow-t">{t}</span>
                    <span className="nrp-trow-d">{item.upcoming ? countdown(item, true) : 'MISSING'}</span>
                  </div>
                )
              const own = c.tracks[m.trackId]
              return (
                <div
                  key={i}
                  className="nrp-trow"
                  onClick={() => playRelease({ ...item, match: { ...item.match!, trackIds: partialIds } }, partialIds.indexOf(m.trackId))}
                  style={{ cursor: 'pointer', color: now.id === m.trackId ? 'var(--brand)' : undefined }}
                >
                  <span className="nrp-trow-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="nrp-trow-t">{t}</span>
                  <span className="nrp-trow-d">{own?.duration ? fmtLength(own.duration) : d ? fmtLength(d) : ''}</span>
                  <Icon name="playF" style={{ fontSize: '16px' }} />
                </div>
              )
            })
          : lib
          ? albumTracks.map((t, i) => (
              <div
                key={t.id}
                className="nrp-trow"
                onClick={() => playRelease({ ...item, match: { ...item.match!, trackIds: albumTracks.map((x) => x.id) } }, i)}
                style={{ cursor: 'pointer', color: now.id === t.id ? 'var(--brand)' : undefined }}
              >
                <span className="nrp-trow-n">{String(t.track ?? i + 1).padStart(2, '0')}</span>
                <span className="nrp-trow-t">{t.title}</span>
                <span className="nrp-trow-d">{t.duration ? fmtLength(t.duration) : ''}</span>
                <Icon name="playF" style={{ fontSize: '16px' }} />
              </div>
            ))
          : item.detail
            ? item.detail.tracks.map(([t, d], i) => (
                <div key={i} className="nrp-trow">
                  <span className="nrp-trow-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="nrp-trow-t">{t}</span>
                  <span className="nrp-trow-d">{d ? fmtLength(d) : '—'}</span>
                  {matchedIdx.has(i) && <Icon name="check" style={{ color: 'var(--brand)', fontSize: '16px' }} />}
                </div>
              ))
            : loading &&
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="nrp-trow">
                  <span className="nrp-trow-n">{String(i + 1).padStart(2, '0')}</span>
                  <Skeleton width={`${50 + ((i * 17) % 35)}%`} height={12} />
                </div>
              ))}
      </div>
    </div>
  )
}

/* ── Followed Artists ────────────────────────────────── */

export function FollowedArtists({ c, phone, onClose }: { c: Catalogue; phone: boolean; onClose: () => void }) {
  const { doc } = useReleases()
  const [q, setQ] = useState('')
  const rows = useMemo(() => followedArtists(c, doc), [c, doc])
  const mutedN = rows.filter((r) => r.muted).length
  const fq = q.trim().toLowerCase()
  const shown = fq ? rows.filter((r) => r.artist.name.toLowerCase().includes(fq)) : rows
  const hideRe = doc.hideReissues[0]

  return (
    <div className="nrp nrp-artists">
      <PanelHead kicker="NEW RELEASES · SETTINGS" onClose={onClose} />
      <div className="nrp-titles">
        <h2 className="nrp-title">Followed artists</h2>
        <span className="nrp-meta">
          {rows.length} ARTISTS · {mutedN} MUTED
        </span>
      </div>
      {!phone && (
        <p className="nrp-explain">
          Every artist in your library is followed automatically, plus artists added from Discover. Muted artists are still swept, just kept out of the feed.
        </p>
      )}

      <div className="nrp-reissues-card" onClick={() => releasesStore.setHideReissues(!hideRe)} style={{ cursor: 'pointer' }}>
        <div className="nrp-reissues-text">
          <span className="nrp-reissues-title">Hide reissues and deluxe editions</span>
          <span className="nrp-reissues-sub">Remasters, anniversary and expanded versions</span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={hideRe} onChange={(v) => releasesStore.setHideReissues(v)} label="Hide reissues and deluxe editions" />
        </span>
      </div>

      <div className="nrp-search-box">
        <Icon name="search" style={{ color: 'oklch(0.62 0.014 40)', fontSize: '20px' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${rows.length} artists`} aria-label="Filter artists" />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'oklch(0.79 0.014 40)' }}
          >
            <Icon name="x" />
          </button>
        )}
      </div>

      <div className="nrp-art-list">
        {shown.map((r) => (
          <div key={r.artist.id} className="nrp-art-row">
            <ArtistAvatar artist={r.artist} size={40} className="nrp-art-av" />
            <div className="nrp-art-info">
              <span className="nrp-art-name">{r.artist.name}</span>
              <span className="nrp-art-meta">
                {r.dz != null && <span style={{ color: 'var(--brand)' }}>NOT IN LIBRARY · </span>}
                {r.line}
              </span>
            </div>
            {r.dz != null && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: '36px', padding: '0 12px', fontSize: '13px' }}
                onClick={() => releasesStore.follow(r.dz!, null)}
              >
                Unfollow
              </button>
            )}
            <Toggle checked={!r.muted} onChange={(v) => releasesStore.setMuted(r.artist.id, !v)} label={`${r.muted ? 'Unmute' : 'Mute'} ${r.artist.name}`} />
          </div>
        ))}
        {!shown.length && <div style={{ padding: '24px', textAlign: 'center', color: 'oklch(0.62 0.014 40)' }}>No artist matches “{q.trim()}”.</div>}
      </div>
    </div>
  )
}
