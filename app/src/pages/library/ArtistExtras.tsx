/**
 * Artist page extras (Nov 2026 canvas, "Artist page" row):
 *
 * - LatestRelease: the newest release of the last ~4 months from the New Releases sweep (Preview or
 *   Play, I've got it, details) and the next upcoming one with its reminder.
 * - ArtistGaps: "Not in your library" — the artist's popular songs you don't have, 30 s previews.
 * - FansAlsoLike: related artists who aren't in the library, each with Follow / Not interested and a
 *   small row of their recent releases (else top songs), all previewable. A name opens
 *   RelatedArtistDetail in the side panel (desktop) / bottom sheet (phone).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, IconButton, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { PreviewRing } from '../../components/list/PreviewRing'
import { ListSection } from '../../components/list/SongList'
import { fmtClock } from '../../components/list/listUtils'
import { listersOf, type DzReleases, type DzTopTrack } from '../../lib/deezer'
import { useNearViewport } from '../../lib/covers'
import { dzReleaseClip, dzReleases, dzTop, useArtistGaps, useLoad, useRelatedCands, type RelatedCand } from '../../state/artistExtras'
import { useOnline } from '../../state/downloads'
import { useHistory } from '../../state/history'
import type { Artist, Catalogue } from '../../state/library'
import { releasesStore, useReleases } from '../../state/releases'
import { buildFeed, isOwned, type FeedItem } from '../../state/releaseViews'
import { SectionHead } from './common'
import { ReleaseCover, canPreview as canPreviewItem, openExternal, playRelease, useReleaseActions } from '../releases/parts'
import { agoLabel, dayLabel, firstClip, relFacts, typeWord } from '../releases/relText'
import { ReleaseDetail, ReleasePanel } from '../releases/ReleasePanel'
import { nowPlayingStore } from '../../state/nowPlaying'
import { registerBack } from '../../native/backButton'

const DAY = 86_400_000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dzArtistUrl = (id: number) => `https://www.deezer.com/artist/${id}`
const shortMonth = (date: string) => {
  const m = Number(date.split('-')[1])
  return m ? MON[m - 1] : date.slice(0, 4)
}
const DZ_TYPE: Record<string, string> = { album: 'Album', ep: 'EP', single: 'Single', compile: 'Compilation' }

function Head({ phone, label, right }: { phone: boolean; label: string; right?: string }) {
  return phone ? <ListSection phone label={label} right={right} /> : <SectionHead label={label.toUpperCase()} right={right?.toUpperCase()} />
}

/* ── Latest release ──────────────────────────────────── */

/** The artist's newest release (≤ 120 days) and next upcoming one, from the New Releases sweep. */
export function useArtistReleases(c: Catalogue, artistId: string): { latest: FeedItem | null; next: FeedItem | null } {
  const rs = useReleases()
  const history = useHistory()
  const feed = buildFeed(rs.doc, c, history.plays, rs.prefs)
  return useMemo(() => {
    const mine = feed.all.filter((it) => it.status !== 'gone' && it.owners.some((a) => a.id === artistId))
    const cut = Date.now() - 120 * DAY
    const latest = mine.filter((it) => !it.upcoming && it.day >= cut).sort((a, b) => b.day - a.day)[0] ?? null
    const next = mine.filter((it) => it.upcoming).sort((a, b) => a.day - b.day)[0] ?? null
    return { latest, next }
  }, [feed, artistId])
}

export function LatestRelease({ c, artistId, phone, onOpen }: { c: Catalogue; artistId: string; phone: boolean; onOpen: (it: FeedItem) => void }) {
  const { latest, next } = useArtistReleases(c, artistId)
  const act = useReleaseActions()
  const online = useOnline()
  if (!latest && !next) return null
  const owned = latest ? isOwned(latest.status) : false
  const kicker = latest ? [latest.status === 'new' ? 'New' : owned ? 'In your library' : null, agoLabel(latest).toLowerCase()].filter(Boolean).join(' · ') : ''
  return (
    <section className="lp-sec ax-latest">
      <Head phone={phone} label={latest ? 'Latest release' : 'Coming soon'} />
      <div className={`ax-card ${phone ? 'is-phone' : ''}`}>
        {latest && (
          <div className="ax-lr" role="button" tabIndex={0} onClick={() => onOpen(latest)} onKeyDown={(e) => e.key === 'Enter' && onOpen(latest)}>
            <div className="ax-lr-art">
              <ReleaseCover item={latest} size="sm" />
              {latest.status === 'new' && <span className="ax-dot" aria-label="New" role="img" />}
            </div>
            <div className="ax-lr-text">
              <span className="ax-mono is-on">{kicker}</span>
              <span className="ax-lr-title">{latest.rel.t}</span>
              <span className="ax-sub">{relFacts(latest)}</span>
              {!phone && (
                <div className="ax-lr-btns" onClick={(e) => e.stopPropagation()}>
                  {owned ? (
                    <Button size="sm" icon="playF" onClick={() => playRelease(latest)}>
                      Play
                    </Button>
                  ) : (
                    canPreviewItem(latest) && online && <PreviewRing id={latest.rel.id} load={() => firstClip(latest)} label={`Preview ${latest.rel.t}`} size={40} />
                  )}
                  {!owned && <IconButton icon="done" label={latest.status === 'acq' ? 'Stop matching' : 'I’ve got it'} onClick={() => act.got(latest)} />}
                  <IconButton icon="chevR" label="Details" onClick={() => onOpen(latest)} />
                </div>
              )}
            </div>
            {phone && (
              <div className="ax-lr-pbtn" onClick={(e) => e.stopPropagation()}>
                {owned ? (
                  <IconButton icon="playF" label="Play" variant="tonal" onClick={() => playRelease(latest)} />
                ) : (
                  canPreviewItem(latest) && online && <PreviewRing id={latest.rel.id} load={() => firstClip(latest)} label={`Preview ${latest.rel.t}`} size={44} />
                )}
              </div>
            )}
          </div>
        )}
        {latest && next && <div className="ax-sep" />}
        {next && (
          <div className="ax-next" role="button" tabIndex={0} onClick={() => onOpen(next)} onKeyDown={(e) => e.key === 'Enter' && onOpen(next)}>
            <div className="ax-next-art">
              <ReleaseCover item={next} size="xs" />
            </div>
            <div className="ax-next-text">
              <span className={`ax-mono ${next.reminded ? 'is-on' : ''}`}>
                Out {dayLabel(next).toLowerCase()} · {next.daysTo <= 1 ? 'tomorrow' : `in ${next.daysTo} days`}
              </span>
              <span className="ax-next-title">
                {next.rel.t} · {typeWord(next)}
              </span>
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              {phone ? (
                <IconButton icon={next.reminded ? 'bellF' : 'bell'} label={next.reminded ? 'Reminder set' : 'Remind me'} aria-pressed={next.reminded} onClick={() => act.remind(next)} />
              ) : (
                <Button size="sm" variant="secondary" icon={next.reminded ? 'bellF' : 'bell'} aria-pressed={next.reminded} onClick={() => act.remind(next)}>
                  {next.reminded ? 'Reminder on' : 'Remind me'}
                </Button>
              )}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Songs not in your library ───────────────────────── */

const GAPS_SHOWN = 5

export function ArtistGaps({ c, artist, phone }: { c: Catalogue; artist: Artist; phone: boolean }) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const online = useOnline()
  const gaps = useArtistGaps(c, artist, near && online)
  const [all, setAll] = useState(false)
  if (gaps.state !== 'ok') return <div ref={ref} className="ax-probe" aria-hidden />
  const list = gaps.value
  const shown = all ? list : list.slice(0, GAPS_SHOWN)
  return (
    <section ref={ref} className="lp-sec ax-gaps">
      <Head phone={phone} label="Not in your library" right={`${list.length} ${list.length === 1 ? 'song' : 'songs'} · 30 s previews`} />
      <div className="ax-rows">
        {shown.map((t) => (
          <SongPreviewRow key={t.id} t={t} phone={phone} sub={t.al.t} />
        ))}
      </div>
      {list.length > GAPS_SHOWN && (
        <button type="button" className="more-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'SHOW FEWER' : `SHOW ${list.length - GAPS_SHOWN} MORE`}
        </button>
      )}
    </section>
  )
}

/** A Deezer song: preview ring · title / sub · 0:30 · Deezer. */
function SongPreviewRow({ t, phone, sub }: { t: DzTopTrack; phone: boolean; sub: ReactNode }) {
  return (
    <div className={`ax-row ${phone ? 'is-phone' : ''}`}>
      <PreviewRing id={`dz:${t.id}`} load={() => Promise.resolve(t.p ? { key: `dz:${t.id}`, url: t.p } : null)} label={`Preview ${t.t}`} />
      <span className="ax-row-text">
        <span className="ax-row-t">{t.t}</span>
        <span className="ax-row-s">{sub}</span>
      </span>
      {!phone && <span className="ax-row-d">{t.d ? fmtClock(t.d) : '0:30'}</span>}
      {t.link && <IconButton icon="ext" label="Open in Deezer" size="sm" onClick={() => openExternal(t.link!)} />}
    </div>
  )
}

/* ── Fans also like ──────────────────────────────────── */

export function useFollowToggle() {
  const toast = useToast()
  return {
    follow(cand: { id: number; name: string }, titles: string[], on: boolean) {
      if (on) {
        releasesStore.follow(cand.id, { name: cand.name, dz: cand.id, titles })
        toast.show({ icon: 'check', text: `Following ${cand.name}.`, meta: 'NEW RELEASES WILL SHOW UP', action: { label: 'Undo', onClick: () => releasesStore.follow(cand.id, null) } })
      } else {
        releasesStore.follow(cand.id, null)
        toast.show({ icon: 'x', mutedIcon: true, text: `Stopped following ${cand.name}.`, action: { label: 'Undo', onClick: () => releasesStore.follow(cand.id, { name: cand.name, dz: cand.id, titles }) } })
      }
    },
    mute(cand: { id: number; name: string }) {
      releasesStore.setDzMuted(cand.id, true)
      toast.show({ icon: 'x', mutedIcon: true, text: `Won’t suggest ${cand.name} again.`, action: { label: 'Undo', onClick: () => releasesStore.setDzMuted(cand.id, false) } })
    },
  }
}

/** "Also like Night Tide" (another library artist lists them too), else "Like Hollow Coast". */
function whyLine(c: Catalogue, cand: RelatedCand, artist: Artist): string {
  const other = listersOf(cand.id)
    .filter((id) => id !== artist.id)
    .map((id) => c.artists[id]?.name)
    .filter(Boolean)
  return other.length ? `Also like ${other.slice(0, 2).join(' and ')}` : `Like ${artist.name}`
}

export function FansAlsoLike({ c, artist, phone, onOpen }: { c: Catalogue; artist: Artist; phone: boolean; onOpen: (cand: RelatedCand) => void }) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const online = useOnline()
  const { doc } = useReleases()
  const cands = useRelatedCands(c, artist.id, doc, near && online)
  if (!online || !cands || !cands.length) return <div ref={ref} className="ax-probe" aria-hidden />
  return (
    <section ref={ref} className="lp-sec ax-fans">
      <Head phone={phone} label="Fans also like" right={phone ? 'Not in library' : 'Not in your library · from Deezer'} />
      <div className="ax-fans-row">
        {cands.map((x) => (
          <RelCard key={x.id} cand={x} why={whyLine(c, x, artist)} phone={phone} onOpen={() => onOpen(x)} />
        ))}
      </div>
    </section>
  )
}

function Avatar({ pic, name, size }: { pic: string | null | undefined; name: string; size: number }) {
  const mono = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="ax-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }} aria-hidden>
      {pic ? <img src={pic} alt="" loading="lazy" decoding="async" /> : mono}
    </span>
  )
}

function RelCard({ cand, why, phone, onOpen }: { cand: RelatedCand; why: string; phone: boolean; onOpen: () => void }) {
  const rel = useLoad<DzReleases>(`rel:${cand.id}`, () => dzReleases(cand.id))
  const r = rel.state === 'ok' ? rel.value : null
  const recent = r?.releases.slice(0, 3) ?? []
  const top = useLoad(rel.state === 'none' || (r && !recent.length) ? `top3:${cand.id}` : null, () => dzTop(cand.id, 3))
  const fol = useFollowToggle()
  return (
    <div className={`ax-rc ${phone ? 'is-phone' : ''}`}>
      <div className="ax-rc-head">
        <button type="button" className="ax-rc-who" onClick={onOpen}>
          <Avatar pic={r?.picture} name={cand.name} size={44} />
          <span className="ax-rc-text">
            <span className="ax-rc-name">{cand.name}</span>
            <span className="ax-mono">{why}</span>
          </span>
        </button>
        <IconButton
          icon={cand.followed ? 'done' : 'plus'}
          label={cand.followed ? `Following ${cand.name}` : `Follow ${cand.name}`}
          aria-pressed={cand.followed}
          className={`ax-rc-follow ${cand.followed ? 'is-on' : ''}`}
          onClick={() => fol.follow(cand, r?.titles ?? [], !cand.followed)}
        />
        <IconButton icon="x" label={`Not interested in ${cand.name}`} className="ax-rc-x" onClick={() => fol.mute(cand)} />
      </div>
      {rel.state === 'loading' ? (
        <div className="ax-rc-skel" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : recent.length ? (
        <>
          <span className="ax-mono ax-rc-lab">Recent releases</span>
          <div className="ax-rc-rels">
            {recent.map((x) => (
              <div key={x.id} className="ax-rc-rel">
                <div className="ax-rc-cover">
                  {x.cover ? <img src={x.cover} alt="" loading="lazy" decoding="async" /> : <span className="ax-rc-nocover" />}
                  <PreviewRing id={`dzrel:${x.id}`} load={() => dzReleaseClip({ id: cand.id, name: cand.name }, x)} label={`Preview ${x.t}`} size={30} solid className="ax-rc-pv" />
                </div>
                <span className="ax-rc-t">{x.t}</span>
                <span className="ax-mono">
                  {DZ_TYPE[x.type] ?? 'Album'} · {shortMonth(x.date)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : top.state === 'ok' && top.value.tracks.length ? (
        <>
          <span className="ax-mono ax-rc-lab">No releases lately · top songs</span>
          <div className="ax-rc-top">
            {top.value.tracks.slice(0, 3).map((t) => (
              <div key={t.id} className="ax-rc-song">
                <PreviewRing id={`dz:${t.id}`} load={() => Promise.resolve(t.p ? { key: `dz:${t.id}`, url: t.p } : null)} label={`Preview ${t.t}`} size={30} />
                <span className="ax-rc-st">{t.t}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/* ── Related artist: side panel / bottom sheet ───────── */

export function RelatedArtistDetail({ c, cand, artist, onClose }: { c: Catalogue; cand: RelatedCand; artist: Artist; onClose: () => void }) {
  const rel = useLoad<DzReleases>(`rel:${cand.id}`, () => dzReleases(cand.id))
  const top = useLoad(`top8:${cand.id}`, () => dzTop(cand.id, 8))
  const { doc } = useReleases()
  const followed = !!doc.follow[`dz:${cand.id}`]?.[0]
  const fol = useFollowToggle()
  const r = rel.state === 'ok' ? rel.value : null
  const releases = r?.releases.slice(0, 6) ?? []
  const why = whyLine(c, cand, artist)
  return (
    <div className="nrp ax-pd">
      <div className="nrp-head">
        <span className="nrp-kicker">FANS ALSO LIKE</span>
        <span className="nrp-head-btns">
          <button type="button" className="nrp-x" onClick={() => openExternal(dzArtistUrl(cand.id))} aria-label="Open in Deezer" title="Open in Deezer">
            <Icon name="ext" />
          </button>
          <button type="button" className="nrp-x" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </span>
      </div>
      <div className="ax-pd-hero">
        <Avatar pic={r?.picture} name={cand.name} size={96} />
        <span className="ax-mono">Not in your library · on Deezer</span>
        <h2 className="ax-pd-name">{cand.name}</h2>
        <span className="ax-sub">{why}</span>
        <div className="ax-pd-btns">
          <Button icon={followed ? 'done' : 'plus'} variant={followed ? 'secondary' : undefined} aria-pressed={followed} onClick={() => fol.follow(cand, r?.titles ?? [], !followed)}>
            {followed ? 'Following' : 'Follow'}
          </Button>
          <Button
            variant="secondary"
            icon="x"
            onClick={() => {
              fol.mute(cand)
              onClose()
            }}
          >
            Not interested
          </Button>
        </div>
      </div>
      {releases.length > 0 && (
        <section className="ax-pd-sec">
          <ListSection label="Recent releases" right="Last 6 months" />
          {releases.map((x) => (
            <div key={x.id} className="ax-pd-rel">
              <span className="ax-pd-cover">{x.cover ? <img src={x.cover} alt="" loading="lazy" decoding="async" /> : null}</span>
              <span className="ax-row-text">
                <span className="ax-row-t">{x.t}</span>
                <span className="ax-mono">
                  {DZ_TYPE[x.type] ?? 'Album'} · {shortMonth(x.date)} {x.date.slice(0, 4)}
                </span>
              </span>
              <PreviewRing id={`dzrel:${x.id}`} load={() => dzReleaseClip({ id: cand.id, name: cand.name }, x)} label={`Preview ${x.t}`} />
            </div>
          ))}
        </section>
      )}
      {top.state === 'ok' && top.value.tracks.length > 0 && (
        <section className="ax-pd-sec">
          <ListSection label="Top songs" right="Previews · 30 s" />
          <div className="ax-rows">
            {top.value.tracks.map((t) => (
              <SongPreviewRow key={t.id} t={t} phone={false} sub={t.al.t} />
            ))}
          </div>
        </section>
      )}
      {(rel.state === 'loading' || top.state === 'loading') && <div className="ax-pd-wait">Looking on Deezer…</div>}
    </div>
  )
}

/* ── The panel (desktop) / sheet (phone) on the artist page ── */

export type ArtistPanelState = { kind: 'rel'; id: string } | { kind: 'dz'; cand: RelatedCand } | null

export function ArtistPanel({ c, artist, phone, panel, onClose }: { c: Catalogue; artist: Artist; phone: boolean; panel: ArtistPanelState; onClose: () => void }) {
  // keep the content while the panel slides out
  const [shown, setShown] = useState<ArtistPanelState>(panel)
  if (panel && panel !== shown) setShown(panel)
  const rs = useReleases()
  const history = useHistory()
  const online = useOnline()
  const act = useReleaseActions({ onDismissed: () => onClose() })
  const feed = buildFeed(rs.doc, c, history.plays, rs.prefs)

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || nowPlayingStore.get().open) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const unBack = registerBack(() => {
      onClose()
      return true
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unBack()
    }
  }, [panel, onClose])

  const item = shown?.kind === 'rel' ? feed.byId.get(shown.id) : undefined
  const key = shown?.kind === 'rel' ? shown.id : shown?.kind === 'dz' ? `dz:${shown.cand.id}` : ''
  return (
    <ReleasePanel open={!!panel} phone={phone} onClose={onClose} contentKey={key}>
      {item && <ReleaseDetail item={item} c={c} phone={phone} online={online} act={act} onClose={onClose} />}
      {shown?.kind === 'dz' && <RelatedArtistDetail c={c} cand={shown.cand} artist={artist} onClose={onClose} />}
    </ReleasePanel>
  )
}
