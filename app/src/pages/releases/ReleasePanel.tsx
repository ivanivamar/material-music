/**
 * New Releases side panel (original Pelagic design). Desktop: 460px panel from the right over a scrim.
 * Phone: the kit bottom Sheet (components/ui/Sheet.tsx).
 * Contents: release detail, or Followed artists settings.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Sheet, Skeleton, Toggle } from '../../components/ui'
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
  actionsFor,
  canPreview,
  mapPreviews,
  openExternal,
  ownedCount,
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
      <span className="nrp-head-btns">
        {externalUrl && (
          <button type="button" className="nrp-x" onClick={() => openExternal(externalUrl)} aria-label="Open on MusicBrainz" title="Open on MusicBrainz">
            <Icon name="ext" />
          </button>
        )}
        <button type="button" className="nrp-x" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </span>
    </div>
  )
}

/* ── Release detail (original Pelagic layout) ────────── */

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
  // pre-release / incomplete with a tracklist: the MusicBrainz tracklist, your songs playable, the rest marked
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
  const pvTag = previews.state === 'ok' ? ' · TAP TO PREVIEW' : ''

  const status = {
    new: 'New',
    seen: 'Seen',
    acq: 'Acquired · matching',
    lib: 'In library',
    pre: `Pre-release · ${ownedCount(item).toLowerCase()}`,
    part: `Incomplete · ${ownedCount(item).toLowerCase()}`,
    gone: 'Dismissed',
  }[item.status]
  const n = item.detail?.tracks.length ?? 0
  const facts: [string, ReactNode][] = [
    ['RELEASED', item.upcoming ? `${fmtRelDate(item.rel.date)} · ${countdown(item)}` : fmtRelDate(item.rel.date)],
    ['LABEL', item.detail ? (item.detail.label ?? 'Unknown') : loading ? <Skeleton key="l" width="70%" height={12} /> : '—'],
    ['TYPE', typeLabel(item)],
    ['TRACKS', item.detail ? (n ? String(n) : 'Not yet listed') : loading ? <Skeleton key="t" width="30%" height={12} /> : '—'],
    ['LENGTH', item.detail?.length ? fmtLength(item.detail.length) : item.detail ? 'Unknown' : loading ? <Skeleton key="d" width="40%" height={12} /> : '—'],
    ['STATUS', status],
  ]

  let matchText: string | null = null
  const album = item.match?.albumId ? c.albums[item.match.albumId] : null
  const as = album && album.title !== item.rel.t ? ` as ${album.title}` : ''
  if (item.status === 'pre') {
    const num = item.total ? `${item.have} of ${item.total} songs are` : `${item.have} song${item.have === 1 ? ' is' : 's are'}`
    matchText = `${num} already in your library${as}. The rest come out on ${niceDay(item.rel.date)}${item.reminded ? ', and you’ll be reminded that day' : ''}.`
  } else if (item.status === 'part') {
    const miss = item.total - item.have
    matchText = `${item.have} of ${item.total} songs are in your library${as}. ${miss} missing: it moves to In library when ${miss === 1 ? 'it arrives' : 'they arrive'}.`
  } else if (lib && item.match) {
    matchText = album && album.title !== item.rel.t ? `In your library as ${album.title}, ${item.match.quality}.` : `In your library, ${item.match.quality}.`
  } else if (matches.length) {
    const m = matches[0]
    const mbTitle = item.detail!.tracks[m.index][0]
    matchText = `${mbTitle} ${mbTitle === m.title ? 'is' : `matches ${m.title}`} on ${m.album}, already in your library.${matches.length > 1 ? ` ${matches.length - 1} more song${matches.length > 2 ? 's' : ''} too.` : ''}`
  }

  // the MusicBrainz link sits in the panel head, so the action row leaves it out
  const acts = lib ? null : actionsFor(item, act, online).filter((a) => a.key !== 'ext')
  const matchById = new Map(matches.map((m) => [m.index, m]))
  const partialIds = partial ? matches.map((m) => m.trackId) : []
  const libTracks = lib && item.match ? item.match.trackIds.map((tid) => c.tracks[tid]).filter(Boolean) : []
  const albumTracks = lib && item.match?.albumId ? (tracksByAlbum(c).get(item.match.albumId) ?? libTracks) : libTracks

  const linkList: { label: string; url: string }[] = [
    { label: 'MusicBrainz', url: mbReleaseGroupUrl(id) },
    { label: 'Bandcamp', url: links?.bandcamp ?? bandcampSearchUrl(owner?.name ?? item.rel.a, item.rel.t) },
    ...(links?.homepage ? [{ label: 'Artist site', url: links.homepage }] : []),
  ]

  const title = (
    <div className="nrp-titles">
      {phone && (
        <span className="nrp-sub">
          {typeLabel(item)} · {fmtRelDate(item.rel.date)}
        </span>
      )}
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
      <PanelHead kicker={item.upcoming ? 'UPCOMING · FROM MUSICBRAINZ' : 'RELEASE · FROM MUSICBRAINZ'} externalUrl={online ? mbReleaseGroupUrl(id) : undefined} onClose={onClose} />
      {phone ? (
        <div className="nrp-top">
          <div className={`nrp-cover ${lib ? 'is-lib' : ''}`}>
            <ReleaseCover item={item} size="lg" />
            {item.status === 'acq' && <MatchingVeil compact />}
          </div>
          {title}
        </div>
      ) : (
        <>
          <div className={`nrp-cover ${lib ? 'is-lib' : ''}`}>
            <ReleaseCover item={item} size="lg" />
            {item.upcoming && <Countdown item={item} className="is-lg" />}
            {item.status === 'acq' && <MatchingVeil />}
          </div>
          {title}
        </>
      )}

      {matchText && (
        <div className={`nrp-match ${lib ? 'is-lib' : ''}`}>
          <Icon name="check" />
          <span>{matchText}</span>
        </div>
      )}

      <div className={phone ? 'nrp-tiles' : 'nrp-acts'}>
        {lib ? (
          <>
            <button type="button" className="nrp-act is-on" onClick={() => playRelease(item)}>
              <Icon name="playF" />
              Play
            </button>
            {item.status === 'pre' && (
              <button type="button" className={`nrp-act ${item.reminded ? 'is-on' : ''}`} aria-pressed={item.reminded} onClick={() => act.remind(item)}>
                <Icon name={item.reminded ? 'bellF' : 'bell'} />
                {item.reminded ? (phone ? 'Set' : 'Reminder set') : phone ? 'Remind' : 'Remind me'}
              </button>
            )}
            <button
              type="button"
              className="nrp-act"
              onClick={() => {
                act.dismiss(item)
                onClose()
              }}
            >
              <Icon name="x" />
              Dismiss
            </button>
          </>
        ) : (
          acts!.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`nrp-act ${a.on ? 'is-on' : ''}`}
              disabled={a.disabled}
              onClick={() => {
                a.run()
                if (a.key === 'dismiss') onClose()
              }}
              aria-pressed={a.key === 'dismiss' ? undefined : a.on}
            >
              {a.key === 'got' && item.status === 'acq' ? <Spinner /> : <Icon name={a.icon} />}
              {phone ? a.short : a.label}
            </button>
          ))
        )}
      </div>

      {item.status === 'acq' && <LinkPicker item={item} c={c} act={act} />}

      <div className="nrp-facts">
        {facts.map(([k, v]) => (
          <div key={k} className="nrp-fact">
            <span className="nrp-fact-k">{k}</span>
            <span className="nrp-fact-v">{v}</span>
          </div>
        ))}
      </div>

      <div className="nrp-links">
        {linkList.map((l) => (
          <button key={l.label} type="button" className="nrp-link" disabled={!online} onClick={() => openExternal(l.url)}>
            {l.label}
            <Icon name="ext" />
          </button>
        ))}
      </div>

      <div className="nrp-tl">
        <div className="nrp-tl-head">
          <span>TRACKLIST</span>
          <span className="nrp-tl-note">
            {partial
              ? `${item.have} OF ${item.total} IN LIBRARY${pvTag}`
              : lib
                ? 'PLAYABLE · FROM YOUR FILES'
                : rows.length
                  ? `NOT IN LIBRARY${pvTag || ' · PREVIEW ONLY'}`
                  : item.detail
                    ? 'NOT YET LISTED'
                    : loading
                      ? 'ASKING MUSICBRAINZ'
                      : online
                        ? ''
                        : 'NEEDS A CONNECTION'}
          </span>
        </div>
        {partial
          ? item.detail!.tracks.map(([t, d], i) => {
              const m = matchById.get(i)
              if (!m) return <PreviewTrackRow key={i} n={i + 1} title={t} right={item.upcoming ? countdown(item, true) : 'MISSING'} preview={previewAt(i)} missing />
              const own = c.tracks[m.trackId]
              return (
                <button key={i} type="button" className={`nrp-tr is-on ${now.id === m.trackId ? 'is-now' : ''}`} onClick={() => playRelease({ ...item, match: { ...item.match!, trackIds: partialIds } }, partialIds.indexOf(m.trackId))}>
                  <span className="nrp-tr-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="nrp-tr-t">{t}</span>
                  <span className="nrp-tr-d">{own?.duration ? fmtLength(own.duration) : d ? fmtLength(d) : ''}</span>
                  <span className="nrp-tr-ic">
                    <Icon name="playF" />
                  </span>
                </button>
              )
            })
          : lib
            ? albumTracks.map((t, i) => (
                <button key={t.id} type="button" className={`nrp-tr is-on ${now.id === t.id ? 'is-now' : ''}`} onClick={() => playRelease({ ...item, match: { ...item.match!, trackIds: albumTracks.map((x) => x.id) } }, i)}>
                  <span className="nrp-tr-n">{String(t.track ?? i + 1).padStart(2, '0')}</span>
                  <span className="nrp-tr-t">{t.title}</span>
                  <span className="nrp-tr-d">{t.duration ? fmtLength(t.duration) : ''}</span>
                  <span className="nrp-tr-ic">
                    <Icon name="playF" />
                  </span>
                </button>
              ))
            : rows.length
              ? rows.map(([t, d], i) => <PreviewTrackRow key={i} n={i + 1} title={t} right={d ? fmtLength(d) : '—'} preview={previewAt(i)} owned={matchedIdx.has(i)} />)
              : loading &&
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="nrp-tr">
                    <span className="nrp-tr-n">{String(i + 1).padStart(2, '0')}</span>
                    <Skeleton width={`${50 + ((i * 17) % 35)}%`} height={12} />
                    <span />
                    <span />
                  </div>
                ))}
      </div>
    </div>
  )
}

/* ── Tracklist row with a 30 s preview ───────────────── */

type Preview = { key: string; url: string }

function PreviewTrackRow({ n, title, right, preview, owned, missing }: { n: number; title: string; right: ReactNode; preview: Preview | null; owned?: boolean; missing?: boolean }) {
  const pv = usePreview()
  const cls = `nrp-tr ${owned ? 'is-on' : ''} ${missing ? 'is-missing' : ''}`
  const num = <span className="nrp-tr-n">{String(n).padStart(2, '0')}</span>
  if (!preview)
    return (
      <div className={cls}>
        {num}
        <span className="nrp-tr-t">{title}</span>
        <span className="nrp-tr-d">{right}</span>
        <span className="nrp-tr-ic">{owned && <Icon name="check" />}</span>
      </div>
    )
  const on = pv.key === preview.key
  return (
    <button type="button" className={`${cls} is-preview ${on ? 'is-pv' : ''}`} aria-pressed={on} aria-label={`${on ? 'Stop preview of' : 'Preview'} ${title}`} onClick={() => togglePreview(preview.key, preview.url)}>
      {num}
      <span className="nrp-tr-t">{title}</span>
      <span className="nrp-tr-d">{right}</span>
      <span className="nrp-tr-ic">{on && pv.loading ? <Spinner /> : owned && !on ? <Icon name="check" /> : <Icon name={on ? 'pauseF' : 'playF'} />}</span>
      {on && <span className="nrp-tr-pv" style={{ transform: `scaleX(${pv.progress})` }} aria-hidden />}
    </button>
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
    <div className="nrp-lk">
      <div className="nrp-tl-head">
        <span>ALREADY IN YOUR LIBRARY?</span>
      </div>
      <p className="nrp-lk-note">Still looking for an album called {item.rel.t}. If you have it under another name, pick it:</p>
      <label className="nrp-filter">
        <Icon name="search" />
        <input type="search" placeholder="Search your albums" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your albums" />
      </label>
      {shown.length ? (
        <div className="nrp-lk-list">
          {shown.map((a) => (
            <button key={a.id} type="button" className="nrp-tr nrp-lk-row" onClick={() => act.linkTo(item, a.id, a.title)}>
              <span className="nrp-tr-t">{a.title}</span>
              <span className="nrp-tr-d">{fq ? a.artist : (a.year ?? '')}</span>
              <span className="nrp-tr-ic">
                <Icon name="check" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="nrp-lk-note">{fq ? 'No album matches.' : 'No albums by this artist in your library. Search for it above.'}</p>
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
          Every artist in your library is followed automatically, plus the ones you added from Discover (NOT IN LIBRARY). Muted artists are still swept, just kept out of the feed.
        </p>
      )}
      <div className="nrp-opt" onClick={() => releasesStore.setHideReissues(!hideRe)}>
        <div className="nrp-opt-text">
          <span>Hide reissues and deluxe editions</span>
          <span className="nrp-opt-meta">REMASTERS · ANNIVERSARY · EXPANDED</span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={hideRe} onChange={(v) => releasesStore.setHideReissues(v)} label="Hide reissues and deluxe editions" />
        </span>
      </div>
      <label className="nrp-filter">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${rows.length} artists`} aria-label="Filter artists" />
        {q && (
          <button type="button" className="nrp-filter-x" aria-label="Clear filter" onClick={() => setQ('')}>
            <Icon name="x" />
          </button>
        )}
      </label>
      <div className="nrp-arts" data-sheet-scroll>
        {shown.map((r) => (
          <div key={r.artist.id} className={`nrp-art ${r.muted ? 'is-muted' : ''}`} onClick={() => releasesStore.setMuted(r.artist.id, !r.muted)}>
            <ArtistAvatar artist={r.artist} size={40} className="nrp-art-av" />
            <div className="nrp-art-text">
              <span className="nrp-art-n">{r.artist.name}</span>
              <span className="nrp-art-c">
                {r.dz != null && <span className="nrp-art-ext">NOT IN LIBRARY · </span>}
                {r.line}
              </span>
            </div>
            {r.dz != null && (
              <button
                type="button"
                className="nrp-unfollow"
                onClick={(e) => {
                  e.stopPropagation()
                  releasesStore.follow(r.dz!, null)
                }}
              >
                Unfollow
              </button>
            )}
            {r.muted && !phone && <span className="nrp-art-word">MUTED</span>}
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle checked={!r.muted} onChange={(v) => releasesStore.setMuted(r.artist.id, !v)} label={`${r.muted ? 'Unmute' : 'Mute'} ${r.artist.name}`} />
            </span>
          </div>
        ))}
        {!shown.length && <div className="nrp-none">No artist matches “{q.trim()}”.</div>}
      </div>
    </div>
  )
}
