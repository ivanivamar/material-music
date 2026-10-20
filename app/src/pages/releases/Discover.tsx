/**
 * New Releases → Discover ("From artists like yours"): recent releases by artists who aren't in the
 * library but are related to several that are (state/discover.ts). Shown after the feed groups,
 * following the type chips and Show seen; its own chip hides it.
 *
 * Card: cover (Deezer), title, artist, BECAUSE YOU HAVE …, type · date, then Follow · Deezer ·
 * Not interested · Dismiss. Follow = the artist is swept on MusicBrainz like a library artist (their
 * releases move to the main feed, they're listed under Followed artists as NOT IN LIBRARY).
 * Phone: rows (drag right = seen, left = dismiss), tap = the detail sheet.
 */
import { useMemo, type CSSProperties, type MouseEvent } from 'react'
import { useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { GRAIN } from '../../design/textures'
import { bandcampSearchUrl } from '../../lib/musicbrainz'
import type { Catalogue } from '../../state/library'
import { useDiscover } from '../../state/discover'
import { releasesStore, type ReleasesState } from '../../state/releases'
import { becauseLine, fmtRelDate, fmtRelShort, type DiscoverItem } from '../../state/releaseViews'
import { artistHref, go } from '../../shell/routes'
import { Dot, SwipeRow, openExternal } from './parts'

const TYPE: Record<DiscoverItem['type'], string> = { album: 'ALBUM', ep: 'EP', single: 'SINGLE', live: 'LIVE', other: 'COMPILATION' }
const deezerUrl = (it: DiscoverItem) => `https://www.deezer.com/album/${it.rel.id}`

/* ── Actions ─────────────────────────────────────────── */

export function useDiscoverActions(onGone?: (key: string) => void) {
  const toast = useToast()
  return useMemo(
    () => ({
      toggleSeen(it: DiscoverItem) {
        releasesStore.mark(it.key, it.status === 'seen' ? 'new' : 'seen')
      },
      seen(it: DiscoverItem) {
        if (it.status === 'new') releasesStore.mark(it.key, 'seen')
      },
      follow(it: DiscoverItem) {
        releasesStore.follow(it.dz, { name: it.artist, dz: it.dz, titles: it.titles })
        onGone?.(it.key)
        toast.show({
          icon: 'plus',
          text: `Following ${it.artist}.`,
          meta: 'NEW RELEASES FROM THE NEXT CHECK',
          action: { label: 'Undo', onClick: () => releasesStore.follow(it.dz, null) },
        })
      },
      notInterested(it: DiscoverItem) {
        releasesStore.setDzMuted(it.dz, true)
        onGone?.(it.key)
        toast.show({ icon: 'x', mutedIcon: true, text: `No more suggestions from ${it.artist}.`, action: { label: 'Undo', onClick: () => releasesStore.setDzMuted(it.dz, false) } })
      },
      dismiss(it: DiscoverItem) {
        const prev = releasesStore.get().doc.marks[it.key]?.[0]
        releasesStore.mark(it.key, 'gone')
        onGone?.(it.key)
        toast.show({ icon: 'x', mutedIcon: true, text: `Dismissed ${it.rel.t}.`, action: { label: 'Undo', onClick: () => releasesStore.mark(it.key, prev && prev !== 'gone' ? prev : 'new') } })
      },
      deezer(it: DiscoverItem) {
        openExternal(deezerUrl(it))
      },
      bandcamp(it: DiscoverItem) {
        openExternal(bandcampSearchUrl(it.artist, it.rel.t))
      },
    }),
    [toast, onGone],
  )
}
export type DiscoverActions = ReturnType<typeof useDiscoverActions>

/* ── Cover ───────────────────────────────────────────── */

export function DzCover({ item, size = 'sm' }: { item: DiscoverItem; size?: 'xs' | 'sm' | 'lg' }) {
  const url = item.rel.cover ? (size === 'lg' ? item.rel.cover.replace(/\/\d+x\d+(-[^/]*)?\.jpg$/, '/500x500$1.jpg') : item.rel.cover) : null
  const cls = `nr-cover is-${item.status === 'seen' ? 'seen' : 'new'}`
  if (url) return <img className={cls} src={url} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" />
  return (
    <div className={`${cls} nr-fb nr-fb-${size}`} style={{ '--nr-grain': GRAIN } as CSSProperties} aria-hidden>
      <span className="nr-fb-line" />
      {size !== 'xs' && (
        <>
          <span className="nr-fb-a">{item.artist}</span>
          <span className="nr-fb-t">{item.rel.t}</span>
          <span className="nr-fb-tag">NO COVER ART</span>
        </>
      )}
    </div>
  )
}

/* ── Section ─────────────────────────────────────────── */

export function DiscoverSection({ items, rs, phone, online, onOpen }: { items: DiscoverItem[]; rs: ReleasesState; phone: boolean; online: boolean; onOpen: (it: DiscoverItem) => void }) {
  const ds = useDiscover()
  const act = useDiscoverActions()
  if (!rs.prefs.discover) return null
  const first = !Object.keys(rs.doc.discover).length
  if (!items.length && !(ds.running && first)) return null
  const n = String(items.length).padStart(2, '0')
  return (
    <section className="nr-group nr-disc">
      <div className="nr-ghead">
        <span className="nr-gring nr-gring-dash" />
        <span className="nr-glabel">FROM ARTISTS LIKE YOURS</span>
        {!phone && <span className="nr-gcount">{n}</span>}
        <span className="nr-gline" />
        <span className="nr-grange">{phone ? n : ds.running ? `LOOKING · ${ds.done} / ${ds.total}` : 'NOT IN YOUR LIBRARY · LAST 6 MONTHS'}</span>
      </div>
      {!items.length ? (
        <div className="nr-disc-wait nr-mono">FINDING ARTISTS RELATED TO YOURS · {ds.done} / {ds.total}</div>
      ) : phone ? (
        <div className="nr-rows">
          {items.map((it) => (
            <SwipeRow key={it.key} seenWord={it.status === 'seen' ? 'UNSEEN' : 'SEEN'} onTap={() => onOpen(it)} onSeen={() => act.toggleSeen(it)} onDismiss={() => act.dismiss(it)}>
              <div className="nr-row-cover">
                <DzCover item={it} size="xs" />
              </div>
              <div className="nr-row-text">
                <div className="nr-row-trow">
                  {it.status === 'new' && <Dot />}
                  <span className={`nr-row-t ${it.status === 'seen' ? 'is-seen' : ''}`}>{it.rel.t}</span>
                </div>
                <span className="nr-row-a">{it.artist}</span>
                <span className="nr-mono nr-row-m nr-because">{becauseLine(it, 1)}</span>
              </div>
            </SwipeRow>
          ))}
        </div>
      ) : (
        <div className="nr-grid">
          {items.map((it) => (
            <DiscoverCard key={it.key} item={it} act={act} online={online} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
}

function DiscoverCard({ item, act, online, onOpen }: { item: DiscoverItem; act: DiscoverActions; online: boolean; onOpen: (it: DiscoverItem) => void }) {
  const seen = item.status === 'seen'
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  return (
    <div className={`nr-card is-${item.status} is-disc`}>
      <button type="button" className="nr-card-cover" onClick={() => onOpen(item)} aria-label={`${item.rel.t} by ${item.artist}: details`}>
        <DzCover item={item} />
      </button>
      <div className="nr-card-text">
        <button type="button" className="nr-card-trow" onClick={() => onOpen(item)}>
          {item.status === 'new' && <Dot />}
          <span className={`nr-card-t ${seen ? 'is-seen' : ''}`}>{item.rel.t}</span>
        </button>
        <span className={`nr-card-a nr-card-a-plain ${seen ? 'is-seen' : ''}`}>{item.artist}</span>
        <span className="nr-mono nr-because" title={item.because.map((a) => a.name).join(', ')}>
          {becauseLine(item)}
        </span>
      </div>
      <div className="nr-card-meta">
        <span className={`badge badge-release nr-type ${seen ? 'is-seen' : ''}`}>{TYPE[item.type]}</span>
        <span className={`nr-mono ${seen ? 'is-seen' : ''}`}>{fmtRelShort(item.rel.date)}</span>
      </div>
      <div className="nr-card-acts">
        <button type="button" className="nr-sq" title={`Follow ${item.artist}`} aria-label={`Follow ${item.artist}`} onClick={stop(() => act.follow(item))}>
          <Icon name="plus" />
        </button>
        <button type="button" className="nr-sq" title="Open on Deezer" aria-label="Open on Deezer" disabled={!online} onClick={stop(() => act.deezer(item))}>
          <Icon name="ext" />
        </button>
        <button type="button" className="nr-sq nr-sq-word is-end" title={`Not interested in ${item.artist}`} aria-label={`Not interested in ${item.artist}`} onClick={stop(() => act.notInterested(item))}>
          NOT FOR ME
        </button>
        <button type="button" className="nr-sq" title="Dismiss" aria-label="Dismiss" onClick={stop(() => act.dismiss(item))}>
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}

/* ── Detail panel / sheet ────────────────────────────── */

export function DiscoverDetail({ item, phone, online, act, onClose }: { item: DiscoverItem; c: Catalogue; phone: boolean; online: boolean; act: DiscoverActions; onClose: () => void }) {
  const facts: [string, string][] = [
    ['RELEASED', fmtRelDate(item.rel.date)],
    ['TYPE', TYPE[item.type]],
    ['ARTIST', `${item.artist} · not in your library`],
    ['STATUS', item.status === 'seen' ? 'Seen' : 'New'],
  ]
  return (
    <div className="nrp">
      {!phone && (
        <div className="nrp-head">
          <span className="nrp-kicker">FROM ARTISTS LIKE YOURS · DEEZER</span>
          <button type="button" className="nrp-x" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
      )}
      <div className={phone ? 'nrp-top' : undefined}>
        <div className="nrp-cover">
          <DzCover item={item} size="lg" />
        </div>
        <div className="nrp-titles">
          {phone && (
            <span className="nrp-sub">
              {TYPE[item.type]} · {fmtRelDate(item.rel.date)}
            </span>
          )}
          <div className="nrp-title-row">
            {item.status === 'new' && <Dot size="md" />}
            <h2 className="nrp-title">{item.rel.t}</h2>
          </div>
          <span className="nrp-artist nrp-artist-plain">{item.artist}</span>
        </div>
      </div>

      <div className="nrp-match is-disc">
        <Icon name="radio" />
        <span>
          Related to{' '}
          {item.because.slice(0, 4).map((a, i, list) => (
            <span key={a.id}>
              <button
                type="button"
                className="nrp-inline"
                onClick={() => {
                  onClose()
                  go(artistHref(a.id))
                }}
              >
                {a.name}
              </button>
              {i < list.length - 2 ? ', ' : i === list.length - 2 ? ' and ' : ''}
            </span>
          ))}
          {item.because.length > 4 ? ` and ${item.because.length - 4} more` : ''} in your library.
        </span>
      </div>

      <div className={phone ? 'nrp-tiles' : 'nrp-acts'}>
        <button type="button" className="nrp-act is-on" onClick={() => act.follow(item)}>
          <Icon name="plus" />
          {phone ? 'Follow' : `Follow ${item.artist}`}
        </button>
        <button type="button" className={`nrp-act ${item.status === 'seen' ? 'is-on' : ''}`} aria-pressed={item.status === 'seen'} onClick={() => act.toggleSeen(item)}>
          <Icon name="eye" />
          {item.status === 'seen' ? (phone ? 'Unseen' : 'Mark unseen') : phone ? 'Seen' : 'Mark seen'}
        </button>
        <button type="button" className="nrp-act" onClick={() => act.notInterested(item)}>
          <Icon name="mute" />
          {phone ? 'Not for me' : 'Not interested'}
        </button>
        <button type="button" className="nrp-act" onClick={() => act.dismiss(item)}>
          <Icon name="x" />
          Dismiss
        </button>
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
        <button type="button" className="nrp-link" disabled={!online} onClick={() => act.deezer(item)}>
          Deezer
          <Icon name="ext" />
        </button>
        <button type="button" className="nrp-link" disabled={!online} onClick={() => act.bandcamp(item)}>
          Bandcamp
          <Icon name="ext" />
        </button>
      </div>
      {!phone && <p className="nrp-explain">Follow adds {item.artist} to the daily MusicBrainz check without adding them to your library. Not interested stops suggesting them.</p>}
    </div>
  )
}
