/**
 * New Releases side panel (Material 3 Expressive redesign, handoff NewReleasesMaterial.dc.html).
 * Desktop: 460px right popover over a dark scrim.
 * Phone: the kit bottom Sheet (components/ui/Sheet.tsx).
 * Contents: release detail, or Followed artists settings.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Chip, IconButton, Sheet, Skeleton, Toggle, Button } from '../../components/ui'
import { Icon } from '../../design/icons'
import { bandcampSearchUrl, mbReleaseGroupUrl } from '../../lib/musicbrainz'
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { releasesStore, useReleases } from '../../state/releases'
import { countdown, fmtLength, fmtRelDate, fmtRelShort, followedArtists, isOwned, linkCandidates, trackMatches, type FeedItem } from '../../state/releaseViews'
import { artistHref, go } from '../../shell/routes'
import { ArtistAvatar } from '../library/common'
import { useNowPlaying } from '../library/playback'
import { togglePreview, usePreview } from '../../state/preview'
import {
  Countdown,
  Dot,
  MatchingVeil,
  ReleaseCover,
  Spinner,
  canPreview,
  mapPreviews,
  openExternal,
  ownedLabel,
  playRelease,
  typeLabel,
  useDzPreviews,
  type ReleaseActions,
} from './parts'

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
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: 0 })
  }, [open, contentKey])
  const isArtists = contentKey === 'artists'
  const label = isArtists ? 'Followed artists' : contentKey === 'artistFilter' ? 'Artists' : 'Release'

  // phone: the kit bottom Sheet (drag the handle down, or pull the content down from its top)
  if (phone)
    return (
      <Sheet open={open} onClose={onClose} label={label} bodyClassName={`nr-sheet ${isArtists ? 'is-artists' : ''}`}>
        {children}
      </Sheet>
    )

  return createPortal(
    <>
      <div className={`nr-scrim ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`nr-panel ${open ? 'is-open' : ''} ${isArtists ? 'is-artists' : ''}`} aria-hidden={!open} inert={!open} role="dialog" aria-modal="true" aria-label={label}>
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
          <IconButton icon="ext" label="Open on MusicBrainz" onClick={() => openExternal(externalUrl)} />
        )}
        <IconButton icon="x" label="Close" onClick={onClose} />
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

  // 30 s Deezer previews of songs you don't have yet (Out now only)
  const previews = useDzPreviews(item, online && canPreview(item))
  const mbTracks = item.detail?.tracks ?? []
  const pvMap = previews.state === 'ok' ? (mbTracks.length ? mapPreviews(mbTracks, previews.dz) : previews.dz.tracks.map((_, j) => j)) : []
  const previewAt = (i: number): Preview | null => {
    const j = pvMap[i]
    if (j == null || previews.state !== 'ok') return null
    const url = previews.dz.tracks[j]?.p
    return url ? { key: `${id}#${j}`, url } : null
  }
  const rows: [string, number | null][] = mbTracks.length ? mbTracks : previews.state === 'ok' ? previews.dz.tracks.map((t) => [t.t, t.d]) : []
  const pvTag = previews.state === 'ok' ? ' · PREVIEWS' : ''

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
        <div className="card card-raised card-sm nrp-match">
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
            <Button variant="dj" size="lg" className="nrp-acq-pill" title="Stop matching" onClick={() => act.got(item)}>
              <span className="btn-ic"><Spinner /></span>
              Matching your files…
            </Button>
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
                title={item.status === 'acq' ? 'Stop matching' : undefined}
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

      {item.status === 'acq' && <LinkPicker item={item} c={c} act={act} />}

      <div className="card card-raised card-sm nrp-card">
        {facts.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '32px', fontSize: '13px' }}>
            <span className="nr-mono" style={{ fontSize: '11px', color: 'oklch(0.62 0.014 40)' }}>{k}</span>
            <span style={{ color: 'oklch(0.94 0.006 40)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {linkList.map((l) => (
          <Chip key={l.label} selected={false} trailingIcon="ext" disabled={!online} onClick={() => openExternal(l.url)}>
            {l.label}
          </Chip>
        ))}
      </div>

      <div className="card card-raised card-sm nrp-card">
        <div className="nrp-card-head">
          <span>TRACKLIST</span>
          <span style={{ fontSize: '11px', color: 'oklch(0.62 0.014 40)' }}>
            {partial
              ? `${item.have} OF ${item.total} IN LIBRARY${pvTag}`
              : lib
              ? 'PLAYABLE'
              : rows.length
              ? `${rows.length} TRACKS${pvTag}`
              : item.detail
              ? 'NOT YET LISTED'
              : loading
              ? 'CHECKING MUSICBRAINZ'
              : ''}
          </span>
        </div>
        {partial
          ? item.detail!.tracks.map(([t, d], i) => {
              const m = matchById.get(i)
              if (!m)
                return (
                  <PreviewTrackRow
                    key={i}
                    n={i + 1}
                    title={t}
                    right={item.upcoming ? countdown(item, true) : 'MISSING'}
                    preview={previewAt(i)}
                    dim
                  />
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
          : rows.length
            ? rows.map(([t, d], i) => (
                <PreviewTrackRow
                  key={i}
                  n={i + 1}
                  title={t}
                  right={d ? fmtLength(d) : '—'}
                  preview={previewAt(i)}
                  extra={matchedIdx.has(i) && <Icon name="check" style={{ color: 'var(--brand)', fontSize: '16px' }} />}
                />
              ))
            : !item.detail &&
              loading &&
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

/* ── Tracklist row with a 30 s preview ───────────────── */

type Preview = { key: string; url: string }

function PreviewTrackRow({ n, title, right, preview, extra, dim }: { n: number; title: string; right: ReactNode; preview: Preview | null; extra?: ReactNode; dim?: boolean }) {
  const pv = usePreview()
  const num = <span className="nrp-trow-n">{String(n).padStart(2, '0')}</span>
  if (!preview)
    return (
      <div className="nrp-trow" style={dim ? { opacity: 0.6 } : undefined}>
        {num}
        <span className="nrp-trow-t">{title}</span>
        <span className="nrp-trow-d">{right}</span>
        {extra}
      </div>
    )
  const on = pv.key === preview.key
  return (
    <div
      className={`nrp-trow is-preview ${on ? 'is-on' : ''} ${dim ? 'is-dim' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`${on ? 'Stop preview of' : 'Preview'} ${title}`}
      onClick={() => togglePreview(preview.key, preview.url)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          togglePreview(preview.key, preview.url)
        }
      }}
    >
      {num}
      <span className="nrp-trow-t">{title}</span>
      <span className="nrp-trow-d">{right}</span>
      {extra}
      <span className="nrp-trow-pvic">{on && pv.loading ? <Spinner /> : <Icon name={on ? 'pauseF' : 'playF'} style={{ fontSize: '16px' }} />}</span>
      {on && <span className="nrp-trow-pv" style={{ transform: `scaleX(${pv.progress})` }} aria-hidden />}
    </div>
  )
}

/* ── "It's in my library as…" (MATCHING) ─────────────── */

/**
 * While a release is MATCHING: the album may already be in the library under another title (another
 * edition, a renamed folder) or another artist. Its artists' albums, newest first, or any album by
 * search; picking one links the release to it.
 */
function LinkPicker({ item, c, act }: { item: FeedItem; c: Catalogue; act: ReleaseActions }) {
  const [q, setQ] = useState('')
  const cands = useMemo(() => linkCandidates(c, item), [c, item])
  const fq = q.trim().toLowerCase()
  const shown = fq
    ? Object.values(c.albums)
        .filter((a) => a.title.toLowerCase().includes(fq) || a.artist.toLowerCase().includes(fq))
        .slice(0, 30)
    : cands.slice(0, 30)
  return (
    <div className="card card-raised card-sm nrp-card nrp-link">
      <div className="nrp-card-head">
        <span>ALREADY IN YOUR LIBRARY?</span>
      </div>
      <p className="nrp-link-note">
        Still looking for an album called {item.rel.t}. If you have it under another name, pick it:
      </p>
      <input
        className="nrp-link-q"
        type="search"
        placeholder="Search your albums"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search your albums"
      />
      {shown.length ? (
        shown.map((a) => (
          <button key={a.id} type="button" className="nrp-trow nrp-link-row" onClick={() => act.linkTo(item, a.id, a.title)}>
            <span className="nrp-trow-t">{a.title}</span>
            <span className="nrp-trow-d">{fq ? a.artist : (a.year ?? '')}</span>
            <Icon name="check" style={{ fontSize: '16px' }} />
          </button>
        ))
      ) : (
        <p className="nrp-link-note">{fq ? 'No album matches.' : 'No albums by this artist in your library. Search for it above.'}</p>
      )}
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

      <div className="card card-raised card-sm card-interactive nrp-reissues-card" onClick={() => releasesStore.setHideReissues(!hideRe)} style={{ cursor: 'pointer' }}>
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

      <div className="nrp-art-list" data-sheet-scroll>
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
