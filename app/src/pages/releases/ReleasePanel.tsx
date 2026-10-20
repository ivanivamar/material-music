/**
 * New Releases side panel (desktop: 460px from the right over a scrim; phone: bottom sheet from
 * 64px under the top, handle + drag down to close). Two contents: a release's detail, or the
 * Followed artists settings.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Skeleton, Toggle } from '../../components/ui'
import { Icon } from '../../design/icons'
import { bandcampSearchUrl, mbReleaseGroupUrl } from '../../lib/musicbrainz'
import { tracksByAlbum, type Catalogue } from '../../state/library'
import { releasesStore, useReleases } from '../../state/releases'
import { countdown, fmtLength, fmtRelDate, fmtRelShort, followedArtists, isOwned, trackMatches, type FeedItem } from '../../state/releaseViews'
import { artistHref, go } from '../../shell/routes'
import { ArtistAvatar } from '../library/common'
import { useNowPlaying } from '../library/playback'
import { Countdown, Dot, MatchingVeil, ReleaseCover, actionsFor, openExternal, ownedCount, playRelease, typeLabel, type ReleaseActions } from './parts'

/** "14 Nov" */
const niceDay = (date: string) => fmtRelShort(date).replace(/^0/, '').replace(/ ([A-Z])([A-Z]+)/, (_, a: string, b: string) => ` ${a}${b.toLowerCase()}`)

export type PanelState = { kind: 'rel'; id: string } | { kind: 'dz'; key: string } | { kind: 'artists' } | null

/* ── Container ───────────────────────────────────────── */

export function ReleasePanel({ open, phone, contentKey, onClose, children }: { open: boolean; phone: boolean; contentKey: string; onClose: () => void; children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const grab = useRef<{ y: number; id: number; t: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // a new content starts at the top
  useEffect(() => {
    if (open) scroller.current?.scrollTo({ top: 0 })
  }, [open, contentKey])

  const down = (e: PointerEvent<HTMLDivElement>) => {
    grab.current = { y: e.clientY, id: e.pointerId, t: performance.now() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (grab.current?.id !== e.pointerId) return
    setPull(Math.max(0, e.clientY - grab.current.y))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current
    grab.current = null
    if (!g || g.id !== e.pointerId) return
    const dy = Math.max(0, e.clientY - g.y)
    const flick = dy > 30 && dy / (performance.now() - g.t) > 0.6
    setPull(0)
    if (dy < 6 || dy > 120 || flick) onClose()
  }

  return (
    <>
      <div className={`nr-scrim ${open ? 'is-open' : ''}`} style={pull ? { opacity: Math.max(0, 1 - pull / 400), transition: 'none' } : undefined} onClick={onClose} aria-hidden />
      <aside
        className={`nr-panel ${open ? 'is-open' : ''} ${pull ? 'is-grabbing' : ''}`}
        style={pull ? { transform: `translate3d(0, ${pull}px, 0)` } : undefined}
        aria-hidden={!open}
        inert={!open}
        role="dialog"
        aria-modal="true"
      >
        {phone && (
          <div className="nr-handle" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Close" role="button">
            <span />
          </div>
        )}
        <div className="nr-panel-scroll" ref={scroller}>
          {children}
        </div>
      </aside>
    </>
  )
}

function PanelHead({ kicker, onClose }: { kicker: string; onClose: () => void }) {
  return (
    <div className="nrp-head">
      <span className="nrp-kicker">{kicker}</span>
      <button type="button" className="nrp-x" onClick={onClose} aria-label="Close">
        <Icon name="x" />
      </button>
    </div>
  )
}

/* ── Release detail ──────────────────────────────────── */

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
    const n = item.total ? `${item.have} of ${item.total} songs are` : `${item.have} song${item.have === 1 ? ' is' : 's are'}`
    matchText = `${n} already in your library${as}. The rest come out on ${niceDay(item.rel.date)}${item.reminded ? ', and you’ll be reminded that day' : ''}.`
  } else if (item.status === 'part') {
    const miss = item.total - item.have
    matchText = `${item.have} of ${item.total} songs are in your library${as}. ${miss} missing: it moves to In library when ${miss === 1 ? 'it arrives' : 'they arrive'}.`
  } else if (lib && item.match) {
    const album = item.match.albumId ? c.albums[item.match.albumId] : null
    matchText = album && album.title !== item.rel.t ? `In your library as ${album.title}, ${item.match.quality}.` : `In your library, ${item.match.quality}.`
  } else if (matches.length) {
    const m = matches[0]
    const mbTitle = item.detail!.tracks[m.index][0]
    matchText = `${mbTitle} ${mbTitle === m.title ? 'is' : `matches ${m.title}`} on ${m.album}, already in your library.${matches.length > 1 ? ` ${matches.length - 1} more song${matches.length > 2 ? 's' : ''} too.` : ''}`
  }

  const acts = lib ? null : actionsFor(item, act, online)
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
      {!phone && <PanelHead kicker="RELEASE · FROM MUSICBRAINZ" onClose={onClose} />}
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
            <button type="button" className="nrp-act" onClick={() => act.dismiss(item)}>
              <Icon name="x" />
              Dismiss
            </button>
          </>
        ) : (
          acts!.map((a) => (
            <button key={a.key} type="button" className={`nrp-act ${a.on ? 'is-on' : ''}`} disabled={a.disabled} onClick={a.run} aria-pressed={a.key === 'ext' || a.key === 'dismiss' ? undefined : a.on}>
              <Icon name={a.icon} />
              {phone ? a.short : a.label}
            </button>
          ))
        )}
      </div>

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
          <span className="nrp-tl-note">{partial ? `${item.have} OF ${item.total} IN LIBRARY` : lib ? 'PLAYABLE · FROM YOUR FILES' : item.detail ? (n ? 'NOT IN LIBRARY · PREVIEW ONLY' : 'NOT YET LISTED') : loading ? 'ASKING MUSICBRAINZ' : online ? '' : 'NEEDS A CONNECTION'}</span>
        </div>
        {partial
          ? item.detail!.tracks.map(([t, d], i) => {
              const m = matchById.get(i)
              if (!m)
                return (
                  <div key={i} className="nrp-tr is-missing">
                    <span className="nrp-tr-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="nrp-tr-t">{t}</span>
                    <span className="nrp-tr-d">{item.upcoming ? countdown(item, true) : 'MISSING'}</span>
                    <span className="nrp-tr-ic" />
                  </div>
                )
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
          : item.detail
            ? item.detail.tracks.map(([t, d], i) => (
                <div key={i} className={`nrp-tr ${matchedIdx.has(i) ? 'is-on' : ''}`}>
                  <span className="nrp-tr-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="nrp-tr-t">{t}</span>
                  <span className="nrp-tr-d">{d ? fmtLength(d) : '—'}</span>
                  <span className="nrp-tr-ic">{matchedIdx.has(i) && <Icon name="check" />}</span>
                </div>
              ))
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

/* ── Followed artists ────────────────────────────────── */

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
      {!phone && <PanelHead kicker="NEW RELEASES · SETTINGS" onClose={onClose} />}
      <div className="nrp-titles">
        <h2 className="nrp-title">Followed artists</h2>
        <span className="nrp-meta">
          {rows.length} ARTISTS · {mutedN} MUTED
        </span>
      </div>
      {!phone && <p className="nrp-explain">Every artist in your library is followed automatically, plus the ones you follow from From artists like yours (NOT IN LIBRARY). Muted artists are still swept, just kept out of the feed.</p>}
      <div className="nrp-card" onClick={() => releasesStore.setHideReissues(!hideRe)}>
        <div className="nrp-card-text">
          <span>Hide reissues and deluxe editions</span>
          {!phone && <span className="nrp-card-meta">REMASTERS · ANNIVERSARY · EXPANDED</span>}
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={hideRe} onChange={(v) => releasesStore.setHideReissues(v)} label="Hide reissues and deluxe editions" />
        </span>
      </div>
      <label className="nrp-filter">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${rows.length} artists`} aria-label="Filter artists" />
      </label>
      <div className="nrp-arts">
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
