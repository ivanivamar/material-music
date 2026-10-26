/**
 * New Releases → Discover tab (Material 3 Expressive redesign, handoff NewReleasesMaterial.dc.html).
 * Artists related to your most-played who aren't in your library yet.
 */
import { useMemo, useState } from 'react'
import { useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { cookie } from '../../design/shapes'
import { useDiscover } from '../../state/discover'
import { releasesStore } from '../../state/releases'
import { listNames, nextSweepClock, type Suggestion } from '../../state/releaseViews'
import { openExternal } from './parts'

const monogram = (name: string) => {
  const w = name.replace(/[^\p{L}\p{N} ]+/gu, '').split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase()
}
const mbUrl = (name: string) => `https://musicbrainz.org/search?query=${encodeURIComponent(name)}&type=artist&method=indexed`
const bcUrl = (name: string) => `https://bandcamp.com/search?q=${encodeURIComponent(name)}&item_type=b`

export function useSuggestionActions() {
  const toast = useToast()
  return useMemo(() => {
    const add = (s: Suggestion) => {
      releasesStore.follow(s.dz, { name: s.name, dz: s.dz, titles: s.titles })
      toast.show({
        icon: 'plus',
        text: `Added ${s.name} to the sweep.`,
        meta: typeof navigator !== 'undefined' && navigator.onLine ? 'CHECKING THEM NOW' : `FIRST SWEEP AT ${nextSweepClock()}`,
        action: { label: 'Undo', onClick: () => releasesStore.follow(s.dz, null) },
      })
    }
    return {
      add,
      toggle(s: Suggestion) {
        if (!s.followed) return add(s)
        releasesStore.follow(s.dz, null)
        toast.show({
          icon: 'x',
          mutedIcon: true,
          text: `Removed ${s.name} from the sweep.`,
          action: { label: 'Undo', onClick: () => add(s) },
        })
      },
      notInterested(s: Suggestion) {
        releasesStore.setDzMuted(s.dz, true)
        toast.show({
          icon: 'x',
          mutedIcon: true,
          text: `Won’t suggest ${s.name} again.`,
          action: { label: 'Undo', onClick: () => releasesStore.setDzMuted(s.dz, false) },
        })
      },
      musicbrainz: (s: Suggestion) => openExternal(mbUrl(s.name)),
      bandcamp: (s: Suggestion) => openExternal(bcUrl(s.name)),
    }
  }, [toast])
}
export type SuggestionActions = ReturnType<typeof useSuggestionActions>

function Avatar({ s }: { s: Suggestion }) {
  const [bad, setBad] = useState(false)
  return (
    <div className="nr-sg-av" style={{ clipPath: cookie(9, 0.08) }}>
      {s.pic && !bad ? (
        <img src={s.pic} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />
      ) : (
        monogram(s.name)
      )}
    </div>
  )
}

function Releases({ s }: { s: Suggestion }) {
  return (
    <>
      {s.rel.map((r, i) => (
        <div key={`${r.t}-${i}`} className="nr-sg-r">
          <span className="nr-sg-rt">{r.t}</span>
          {r.y && <span className="nr-sg-ry">{r.y}</span>}
        </div>
      ))}
    </>
  )
}

export function DiscoverTab({ items, phone, online, topN }: { items: Suggestion[]; phone: boolean; online: boolean; topN: number }) {
  const ds = useDiscover()
  const act = useSuggestionActions()
  const looking = ds.running && !items.length

  return (
    <div className="nr-disc">
      <p className="nr-disc-intro">
        {phone
          ? 'Close to your most played, not in your library yet. Adding one puts them on the daily sweep.'
          : 'Artists close to your most played who aren’t in your library. Adding one puts them on the daily sweep, so their releases show up in Upcoming and Out now.'}
      </p>

      {looking && (
        <div className="nr-mono nr-disc-wait">
          FINDING ARTISTS RELATED TO YOUR {topN} MOST PLAYED{ds.total ? ` · ${ds.done} / ${ds.total}` : ''}
        </div>
      )}
      {!items.length && !ds.running && (
        <div className="nr-mono nr-disc-wait">
          NO SUGGESTIONS YET. PLAY A FEW ARTISTS, THEN CHECK BACK AFTER THE NEXT SWEEP.
        </div>
      )}

      {items.map((s) => {
        const because = `Because you play ${listNames(s.because.map((a) => a.name))}`
        const plays = `${s.plays.map((n) => n.toLocaleString('en-US')).join(' + ')} PLAYS`
        const label = s.songs ? 'TOP SONGS' : 'RECENT RELEASES'

        const addBtn = (
          <button
            type="button"
            className={`btn ${s.followed ? 'btn-secondary' : 'btn-primary'}`}
            style={{ height: '44px' }}
            aria-pressed={s.followed}
            onClick={() => act.toggle(s)}
          >
            <span className="btn-ic"><Icon name={s.followed ? 'check' : 'plus'} /></span>
            {s.followed ? 'In the sweep' : 'Add to sweep'}
          </button>
        )

        return phone ? (
          <div key={s.dz} className="nr-disc-card is-phone">
            <div className="nr-disc-phone-top">
              <Avatar s={s} />
              <div className="nr-sg-main">
                <div className="nr-sg-name">{s.name}</div>
                <div className="nr-sg-because">{because}</div>
                <div className="nr-mono" style={{ fontSize: '11px', marginTop: '2px' }}>{plays}</div>
              </div>
            </div>
            <div className="nr-sg-rel">
              <Releases s={s} />
            </div>
            <div className="nr-sg-acts is-phone">
              {addBtn}
              <button
                type="button"
                className="btn btn-ghost nr-disc-sqbtn"
                aria-label="Not interested"
                title="Not interested"
                onClick={() => act.notInterested(s)}
              >
                <Icon name="x" />
              </button>
              <button
                type="button"
                className="btn btn-ghost nr-disc-sqbtn"
                aria-label="Open on MusicBrainz"
                title="Open on MusicBrainz"
                disabled={!online}
                onClick={() => act.musicbrainz(s)}
              >
                <Icon name="ext" />
              </button>
            </div>
          </div>
        ) : (
          <div key={s.dz} className="nr-disc-card">
            <Avatar s={s} />
            <div className="nr-sg-main">
              <div className="nr-sg-name">{s.name}</div>
              <div className="nr-sg-because">{because}</div>
              <div className="nr-sg-links">
                <span className="nr-mono" style={{ fontSize: '11px' }}>{plays}</span>
                <button type="button" className="nr-sg-link" disabled={!online} onClick={() => act.musicbrainz(s)}>
                  MusicBrainz
                  <Icon name="ext" />
                </button>
                <button type="button" className="nr-sg-link" disabled={!online} onClick={() => act.bandcamp(s)}>
                  Bandcamp
                  <Icon name="ext" />
                </button>
              </div>
            </div>
            <div className="nr-sg-rel">
              <span className="nr-mono" style={{ fontSize: '11px', marginBottom: '4px' }}>{label}</span>
              <Releases s={s} />
            </div>
            <div className="nr-sg-acts">
              {addBtn}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: '44px', color: 'oklch(0.79 0.014 40)', padding: '0 12px', fontSize: '13px' }}
                onClick={() => act.notInterested(s)}
              >
                Not interested
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
