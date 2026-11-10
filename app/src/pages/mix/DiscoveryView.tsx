/**
 * Discovery mix page `#/mix/discovery` (Nov 2026): this week's 30 previews of songs you don't have.
 *
 *   ← Home · Made for you
 *   [header: tilted light-leak cover · DISCOVERY · PREVIEWS · REFRESHES MONDAY · Discovery · why ·
 *    30 previews · 15 min · cookie Play]
 *   Shuffle                                    All · From your artists · New artists   ⟳ next Monday 06:00
 *   [list: cover · title · "From X · not in your library" / "New to you · like A and B" ·
 *    Want it · Follow · Not for me · Deezer · 0:30]
 *   Wishlist (n): songs saved with Want it, until they're in the library
 *
 * Rows play from that song (the whole week, in order). Previews never count as plays.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Chip, CookieButton, IconButton, AlbumEq, useToast } from '../../components/ui'
import { Icon } from '../../design/icons'
import { artistHref, back, href } from '../../shell/routes'
import { isFollowed, isNotForMe, isWished, playDiscovery, setFollowed, setNotForMe, setWished, useDiscovery, wishList, type DiscoveryMix } from '../../state/discovery'
import type { Catalogue } from '../../state/library'
import { playerStore, usePlayer } from '../../state/player'
import { previewId, previewsStore, usePreviewsVersion, type PreviewInfo } from '../../state/previews'
import { useIsPhone } from '../../state/viewport'
import { plural } from '../../state/views'
import { MixCover } from '../home/art'

type Filter = 'all' | 'gap' | 'new'

const fmtNext = (ms: number) => {
  const d = new Date(ms)
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} 06:00`
}

export function DiscoveryView({ c, mix, backBtn }: { c: Catalogue; mix: DiscoveryMix; backBtn: ReactNode }) {
  const phone = useIsPhone()
  const toast = useToast()
  const p = usePlayer()
  useDiscovery()
  usePreviewsVersion()
  const [filter, setFilter] = useState<Filter>('all')
  const active = p.index >= 0 && p.context?.kind === 'mix' && p.context.id === mix.id
  const playing = active && p.playing
  const curId = active ? p.queue[p.index] : null
  const tracks = mix.tracks.filter((t) => !isNotForMe(t.artistDz))
  const shown = filter === 'all' ? tracks : tracks.filter((t) => t.kind === filter)
  const gaps = tracks.filter((t) => t.kind === 'gap').length
  const ids = shown.map((t) => previewId(t.dz))
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  const start = async (opts: { shuffle?: boolean; startId?: string } = {}) => {
    if (offline) return toast.show({ icon: 'offline', mutedIcon: true, text: 'Previews need the internet.' })
    const ok = await playDiscovery(mix, { ...opts, only: ids })
    if (!ok) toast.show({ icon: 'alert', mutedIcon: true, text: 'Nothing to play here right now.' })
  }
  const playAll = () => (active ? playerStore.toggle() : void start())
  const playFrom = (t: PreviewInfo) => {
    const id = previewId(t.dz)
    if (curId === id) return playerStore.toggle()
    void start({ startId: id })
  }
  const want = (t: PreviewInfo) => {
    const on = !isWished(t.dz)
    setWished(t, on)
    if (on) toast.show({ icon: 'check', text: `‘${t.title}’ is on your wishlist.`, action: { label: 'Undo', onClick: () => setWished(t, false) } })
  }
  const follow = (t: PreviewInfo) => {
    const on = !isFollowed(t.artistDz)
    setFollowed(t, on)
    toast.show({ icon: on ? 'following' : 'check', text: on ? `Following ${t.artist}. Their new releases show up in New releases.` : `Not following ${t.artist}.` })
  }
  const notForMe = (t: PreviewInfo) => {
    setNotForMe(t, true)
    toast.show({ icon: 'check', text: `${t.artist} won’t come up in Discovery again.`, action: { label: 'Undo', onClick: () => setNotForMe(t, false) } })
  }

  const minutes = Math.round((tracks.length * 30) / 60)
  const stats = [plural(tracks.length, 'preview', 'previews'), `${minutes} min`, gaps ? `${gaps} from artists you have` : null].filter(Boolean).join(' · ')
  const coverSize = phone ? 200 : 208

  return (
    <div className={`mx-page dsc-page hue-scope ${phone ? 'is-phone' : ''}`} style={{ '--h': 20, '--hc': 1 } as CSSProperties}>
      {backBtn}
      <header className="card card-raised card-lg mx-hero">
        <div className="mx-cover">
          <MixCover c={c} mix={mix} size={coverSize} />
        </div>
        <div className="mx-hero-text">
          <div className="mx-kicker">DISCOVERY · PREVIEWS · REFRESHES MONDAY</div>
          <h1 className="mx-title">Discovery</h1>
          <div className="mx-why">{mix.why}</div>
          <div className="mx-stats">{stats}</div>
        </div>
        {!phone && <CookieButton size={80} iconSize={40} playing={playing} icon={playing ? 'pauseF' : 'playF'} label={playing ? 'Pause' : 'Play'} className="mx-play" onClick={playAll} />}
      </header>

      <div className={phone ? 'mx-actions dsc-actions' : 'mx-buttons dsc-actions'}>
        {phone ? (
          <IconButton icon="shuffle" label="Shuffle" size="lg" variant="strong" className="mx-ib" onClick={() => void start({ shuffle: true })} />
        ) : (
          <Button variant="tonal" onClick={() => void start({ shuffle: true })}>
            <Icon name="shuffle" />
            Shuffle
          </Button>
        )}
        <div className="dsc-chips" role="radiogroup" aria-label="Show">
          <Chip role="radio" size={phone ? 'sm' : 'md'} selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          <Chip role="radio" size={phone ? 'sm' : 'md'} selected={filter === 'gap'} count={gaps} onClick={() => setFilter('gap')}>
            From your artists
          </Chip>
          <Chip role="radio" size={phone ? 'sm' : 'md'} selected={filter === 'new'} count={tracks.length - gaps} onClick={() => setFilter('new')}>
            New artists
          </Chip>
        </div>
        <span className="mx-flex" />
        {phone ? (
          <CookieButton size={64} iconSize={32} playing={playing} icon={playing ? 'pauseF' : 'playF'} label={playing ? 'Pause' : 'Play'} onClick={playAll} />
        ) : (
          <span className="mx-ro">
            <Icon name="autorenew" />
            New songs {fmtNext(mix.week.next)}
          </span>
        )}
      </div>

      {offline && (
        <div className="mx-offline">
          <Icon name="offline" />
          <span className="mx-offline-t">You’re offline. Previews need the internet.</span>
        </div>
      )}

      <div className="card card-filled card-lg mx-list dsc-list" role="list">
        {shown.map((t, i) => (
          <PreviewRow
            key={t.dz}
            t={t}
            i={i}
            phone={phone}
            current={curId === previewId(t.dz)}
            playing={playing}
            wished={isWished(t.dz)}
            followed={isFollowed(t.artistDz)}
            onPlay={() => playFrom(t)}
            onWant={() => want(t)}
            onFollow={() => follow(t)}
            onNotForMe={() => notForMe(t)}
          />
        ))}
      </div>

      <Wishlist phone={phone} />
      <div className="mx-foot">Previews from Deezer · they don’t count as plays</div>
    </div>
  )
}

function PreviewRow({ t, i, phone, current, playing, wished, followed, onPlay, onWant, onFollow, onNotForMe }: { t: PreviewInfo; i: number; phone: boolean; current: boolean; playing: boolean; wished: boolean; followed: boolean; onPlay: () => void; onWant: () => void; onFollow: () => void; onNotForMe: () => void }) {
  const label =
    t.kind === 'gap' ? (
      <>
        <span className="dsc-from">From</span>
        {t.libArtistId ? (
          <a className="mx-ln" href={artistHref(t.libArtistId)} onClick={(e) => e.stopPropagation()}>
            {t.artist}
          </a>
        ) : (
          <span>{t.artist}</span>
        )}
        <span className="dsc-dim">· not in your library</span>
      </>
    ) : (
      <>
        <span className="mx-new is-sm">NEW</span>
        <span>{t.artist}</span>
        {t.because.length > 0 && <span className="dsc-dim">· like {t.because.join(' and ')}</span>}
      </>
    )
  return (
    <div
      className={['mx-row', 'dsc-row', current && 'is-current'].filter(Boolean).join(' ')}
      role="listitem"
      onDoubleClick={onPlay}
      onClick={(e) => {
        if (phone && !(e.target as HTMLElement).closest('a, button')) onPlay()
      }}
    >
      {!phone && (
        <div className="mx-c-n">
          {current ? <AlbumEq color={playing ? 'var(--brand)' : 'var(--ink-secondary)'} on={playing} /> : <span className="mx-n">{i + 1}</span>}
          <IconButton icon={current && playing ? 'pauseF' : 'playF'} label={`Play ${t.title}`} size="sm" className="mx-rplay" onClick={onPlay} />
        </div>
      )}
      <div className="mx-main">
        <div className="mx-rcover">
          {t.cover && <img src={t.cover} alt="" decoding="async" loading="lazy" draggable={false} />}
          {phone && current && (
            <span className="mx-rcover-eq">
              <AlbumEq color="oklch(0.93 0.04 38)" on={playing} />
            </span>
          )}
        </div>
        <div className="mx-text">
          <div className="mx-t">{t.title}</div>
          <div className="mx-a dsc-a">{label}</div>
        </div>
      </div>
      <div className="dsc-acts">
        <IconButton icon={wished ? 'wished' : 'wish'} filled={wished} pressed={wished} label={wished ? 'On your wishlist' : 'Want it'} size="sm" className={wished ? 'dsc-on' : ''} onClick={(e) => (e.stopPropagation(), onWant())} />
        {t.kind === 'new' && <IconButton icon={followed ? 'following' : 'person_add'} pressed={followed} label={followed ? `Following ${t.artist}` : `Follow ${t.artist}`} size="sm" className={followed ? 'dsc-on' : ''} onClick={(e) => (e.stopPropagation(), onFollow())} />}
        {t.kind === 'new' && !phone && <IconButton icon="thumbDown" label={`Not for me: ${t.artist}`} size="sm" onClick={(e) => (e.stopPropagation(), onNotForMe())} />}
        {t.link && !phone && (
          <a className="ibtn ibtn-sm" href={t.link} target="_blank" rel="noreferrer" aria-label="Open in Deezer" title="Open in Deezer" onClick={(e) => e.stopPropagation()}>
            <Icon name="ext" />
          </a>
        )}
      </div>
      {!phone && <div className="mx-c-d">0:30</div>}
    </div>
  )
}

function Wishlist({ phone }: { phone: boolean }) {
  const toast = useToast()
  const list = wishList()
  if (!list.length) return null
  return (
    <section className="dsc-wish">
      <div className="hs-head">
        <h2 className="hs-title">Wishlist</h2>
        <span className="hs-sub">{plural(list.length, 'song', 'songs')} to get · leaves the list once it’s in your library</span>
      </div>
      <div className="card card-filled card-lg mx-list dsc-list" role="list">
        {list.map((w) => {
          const pv = previewsStore.get(previewId(w.dz))
          return (
            <div key={w.dz} className="mx-row dsc-row" role="listitem">
              {!phone && <div className="mx-c-n" />}
              <div className="mx-main">
                <div className="mx-rcover">{w.cover && <img src={w.cover} alt="" loading="lazy" draggable={false} />}</div>
                <div className="mx-text">
                  <div className="mx-t">{w.title}</div>
                  <div className="mx-a dsc-a">
                    <span>{w.artist}</span>
                    {w.album && <span className="dsc-dim">· {w.album}</span>}
                  </div>
                </div>
              </div>
              <div className="dsc-acts">
                {w.link && (
                  <a className="ibtn ibtn-sm" href={w.link} target="_blank" rel="noreferrer" aria-label="Open in Deezer" title="Open in Deezer">
                    <Icon name="ext" />
                  </a>
                )}
                <IconButton
                  icon="x"
                  label="Remove from wishlist"
                  size="sm"
                  onClick={() => {
                    const info = pv ?? { ...w, url: null, urlAt: 0 }
                    setWished(info, false)
                    toast.show({ icon: 'check', text: `Removed ‘${w.title}’ from your wishlist.`, action: { label: 'Undo', onClick: () => setWished(info, true) } })
                  }}
                />
              </div>
              {!phone && <div className="mx-c-d" />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** #/mix/discovery before this week's songs are in (building, offline, nothing found). */
export function DiscoveryPending({ backBtn }: { backBtn: ReactNode }) {
  const d = useDiscovery()
  const text = d.building ? 'Finding new music for this week…' : d.error === 'offline' ? 'Discovery needs the internet to find new music.' : d.error ? 'Couldn’t put Discovery together right now. Try again later.' : 'Finding new music for this week…'
  return (
    <div className="mx-page">
      {backBtn}
      <div className="mx-loading">{text}</div>
      {!d.building && (
        <Button variant="tonal" onClick={() => back(href('home'))}>
          Back to Home
        </Button>
      )}
    </div>
  )
}
