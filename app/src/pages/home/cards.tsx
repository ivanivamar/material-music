/**
 * Home cards (Material redesign, HomeMaterial.dc.html shelves): album / mix / radio / smart playlist
 * squares (168 desktop, 132 phone), artist circles (136 / 104), the "New smart playlist" card and invite,
 * and their loading placeholders.
 *
 * Hover (desktop): the art tilts −3° and lifts, Shuffle (tonal) + a coral cookie Play slide in.
 * Playing context: a coral pill with the equaliser on the art, the title in coral.
 */
import { useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { AlbumEq } from '../../components/ui'
import { Icon } from '../../design/icons'
import { SHAPE_CLOVER } from '../../design/shapes'
import { actions, trackDrag } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { useLazyCover } from '../../lib/covers'
import { albumHref, artistHref, go, mixHref, playlistHref } from '../../shell/routes'
import type { Album, Artist, Catalogue } from '../../state/library'
import { mixContext, playMix, type MixPlan, type RadioCard as Radio } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import { playlistInfo } from '../../state/playlistViews'
import type { Playlist } from '../../state/playlists'
import { radioStore } from '../../state/radio'
import { albumOffline, useDownloads, useOnline } from '../../state/downloads'
import { PHONE_QUERY } from '../../state/viewport'
import { plural } from '../../state/views'
import { albumTrackIds, artistTrackIds, playList } from '../library/playback'
import { ArtistDisc, CookiePlay, MixCover, RadioArt, SmartArt, radiusFor } from './art'

/* ── Sizes ──────────────────────────────────────────── */

const NARROW = '(max-width: 380px)'
const sub = (q: string) => (cb: () => void) => {
  const mq = window.matchMedia(q)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const subPhone = sub(PHONE_QUERY)
const subNarrow = sub(NARROW)
/** 'desk' | 'phone' (412) | 'narrow' (360) */
export function useHomeSize(): 'desk' | 'phone' | 'narrow' {
  const phone = useSyncExternalStore(subPhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)
  const narrow = useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW).matches, () => false)
  return phone ? (narrow ? 'narrow' : 'phone') : 'desk'
}
export const cardSize = (s: ReturnType<typeof useHomeSize>) => (s === 'desk' ? 168 : s === 'phone' ? 132 : 120)
export const avatarSize = (s: ReturnType<typeof useHomeSize>) => (s === 'desk' ? 136 : s === 'phone' ? 104 : 96)

/** Is the player on this context (and is it playing)? */
export function usePlayingContext(kind: string, id: string): { active: boolean; playing: boolean } {
  const p = usePlayer()
  const active = p.index >= 0 && p.context?.kind === kind && p.context.id === id
  return { active, playing: active && p.playing }
}

const stop = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

/* ── Shared card frame ──────────────────────────────── */

export function CardFrame({
  art,
  title,
  subtitle,
  size,
  active,
  playing,
  onOpen,
  onPlay,
  onShuffle,
  className,
  extra,
  dim,
}: {
  art: ReactNode
  title: string
  subtitle: ReactNode
  size: number
  active: boolean
  playing: boolean
  onOpen: () => void
  onPlay: () => void
  onShuffle?: () => void
  className?: string
  extra?: Record<string, unknown>
  dim?: boolean
}) {
  return (
    <div
      {...extra}
      className={`hcard ${active ? 'is-active' : ''} ${dim ? 'is-dim' : ''} ${className ?? ''}`}
      style={{ width: size }}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="hcard-art" style={{ width: size, height: size, borderRadius: radiusFor(size) }}>
        {art}
        {active && (
          <span className="hcard-badge">
            <AlbumEq color="oklch(0.93 0.04 38)" height={12} on={playing} />
          </span>
        )}
        <span className="hcard-btns">
          {onShuffle && (
            <button type="button" className="hcard-shuf" aria-label={`Shuffle ${title}`} title="Shuffle" onClick={stop(onShuffle)}>
              <Icon name="shuffle" />
            </button>
          )}
          <CookiePlay size={48} tone="brand" playing={playing} label={playing ? `Pause ${title}` : `Play ${title}`} onClick={stop(() => (active ? playerStore.toggle() : onPlay()))} />
        </span>
      </div>
      <div className="hcard-text">
        <div className="hcard-t" title={title}>
          {title}
        </div>
        <div className="hcard-s">{subtitle}</div>
      </div>
    </div>
  )
}

/* ── Album card ─────────────────────────────────────── */

export function AlbumCardHome({ c, album, subtitle, size }: { c: Catalogue; album: Album; subtitle: ReactNode; size: number }) {
  const [ref, cover] = useLazyCover<HTMLSpanElement>(album.cover)
  const st = usePlayingContext('album', album.id)
  const dl = useDownloads()
  const online = useOnline()
  const off = dl.available ? albumOffline(dl, album.id) : null
  const saved = !!off?.complete && off.wanted
  return (
    <CardFrame
      className="hcard-album"
      art={
        <span ref={ref} className="hcard-cover">
          {cover && <img src={cover} alt="" decoding="async" draggable={false} />}
          {saved && (
            <span className="hcard-offline" title="Downloaded">
              <Icon name="downloaded" />
            </span>
          )}
        </span>
      }
      title={album.title}
      subtitle={subtitle}
      size={size}
      active={st.active}
      playing={st.playing}
      dim={!!off && !online && off.done === 0}
      onOpen={() => go(albumHref(album.id))}
      onPlay={() => playList(albumTrackIds(c, album.id), { kind: 'album', id: album.id, label: album.title })}
      extra={{ onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'album', albumId: album.id }, e), ...trackDrag(() => albumTrackIds(c, album.id), album.title) }}
    />
  )
}

/* ── Mix card ───────────────────────────────────────── */

export function MixCard({ c, mix, size }: { c: Catalogue; mix: MixPlan; size: number }) {
  const ctx = mixContext(mix)
  const st = usePlayingContext('mix', mix.id)
  return (
    <CardFrame
      className="hcard-mix pg-fade"
      art={<MixCover c={c} mix={mix} size={size} />}
      title={mix.title}
      subtitle={mix.sub}
      size={size}
      active={st.active}
      playing={st.playing}
      onOpen={() => go(mixHref(mix.id))}
      onPlay={() => playMix(mix)}
      onShuffle={() => playMix(mix, { shuffle: true })}
      extra={{ ...trackDrag(() => mix.trackIds, ctx.label), onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'tracks', trackIds: mix.trackIds, label: mix.title }, e) }}
    />
  )
}

/* ── Radio card ─────────────────────────────────────── */

export function radioArtSeed(c: Catalogue, r: Pick<Radio, 'seed' | 'artistId' | 'albumId' | 'name'>) {
  return {
    type: r.seed.type,
    artist: r.seed.type === 'artist' ? (c.artists[r.artistId] ?? null) : null,
    cover: r.albumId ? c.albums[r.albumId]?.cover : null,
    name: r.seed.type === 'artist' ? (c.artists[r.artistId]?.name ?? r.name) : r.name,
  }
}

export function RadioCardView({ c, radio, size }: { c: Catalogue; radio: Radio; size: number }) {
  const st = usePlayingContext('radio', radio.id)
  const start = () => (st.active ? playerStore.toggle() : radioStore.start(radio.seed))
  return (
    <CardFrame
      className="hcard-radio pg-fade"
      art={<RadioArt seed={radioArtSeed(c, radio)} size={size} playing={st.playing} />}
      title={radio.title}
      subtitle={radio.sub}
      size={size}
      active={st.active}
      playing={st.playing}
      onOpen={start}
      onPlay={start}
    />
  )
}

/* ── Artist circle ──────────────────────────────────── */

export function ArtistCard({ c, artist, size, sub }: { c: Catalogue; artist: Artist; size: number; sub: string }) {
  const st = usePlayingContext('artist', artist.id)
  const ctx = { kind: 'artist' as const, id: artist.id, label: artist.name }
  return (
    <div
      className={`hartist ${st.active ? 'is-active' : ''}`}
      style={{ width: size }}
      role="link"
      tabIndex={0}
      onClick={() => go(artistHref(artist.id))}
      onKeyDown={(e) => e.key === 'Enter' && go(artistHref(artist.id))}
      onContextMenu={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)}
      {...trackDrag(() => artistTrackIds(c, artist.id), artist.name)}
    >
      <div className="hartist-art" style={{ width: size, height: size }}>
        <ArtistDisc artist={artist} size={size} />
        <CookiePlay
          size={44}
          tone="brand"
          className="hartist-play"
          playing={st.playing}
          label={st.playing ? `Pause ${artist.name}` : `Play ${artist.name}`}
          onClick={stop(() => (st.active ? playerStore.toggle() : playList(artistTrackIds(c, artist.id), ctx, { shuffle: true })))}
        />
      </div>
      <div className="hartist-n" title={artist.name}>
        {artist.name}
      </div>
      <div className="hartist-s">{sub}</div>
    </div>
  )
}

/* ── Smart playlists ────────────────────────────────── */

export function SmartCard({ c, playlist, size }: { c: Catalogue; playlist: Playlist; size: number }) {
  const st = usePlayingContext('playlist', playlist.id)
  const n = playlistInfo(c, playlist).ids.length
  return (
    <CardFrame
      className="hcard-smart"
      art={<SmartArt playlist={playlist} size={size} />}
      title={playlist.name}
      subtitle={`${plural(n, 'song', 'songs')} · updates itself`}
      size={size}
      active={st.active}
      playing={st.playing}
      onOpen={() => go(playlistHref(playlist.id))}
      onPlay={() => playPlaylist(playlist.id)}
      extra={{ onContextMenu: (e: MouseEvent) => actions.menu({ kind: 'playlist', playlistId: playlist.id }, e) }}
    />
  )
}

export function NewSmartCard({ size }: { size: number }) {
  return (
    <button type="button" className="hnew" style={{ width: size }} onClick={() => actions.smartPlaylist()}>
      <span className="hnew-art" style={{ width: size, height: size, borderRadius: radiusFor(size) }}>
        <span className="hnew-tile" style={{ clipPath: SHAPE_CLOVER }}>
          <Icon name="plus" size={28} />
        </span>
      </span>
      <span className="hcard-text">
        <span className="hcard-t">New smart playlist</span>
        <span className="hcard-s">Rules · updates itself</span>
      </span>
    </button>
  )
}

export function SmartInvite({ phone }: { phone: boolean }) {
  const btn = (
    <button type="button" className="hinvite-btn" onClick={() => actions.smartPlaylist()}>
      <Icon name="plus" size={22} />
      New smart playlist
    </button>
  )
  const mark = (s: number) => (
    <span className="hinvite-mark" style={{ width: s, height: s, clipPath: SHAPE_CLOVER }}>
      <Icon name="smart" size={s / 2} />
    </span>
  )
  const body = 'Pick a few rules, like never played, added this month or longer than 6 minutes. The playlist keeps itself up to date.'
  if (phone)
    return (
      <div className="hinvite is-phone">
        <span className="hinvite-head">
          {mark(48)}
          <span className="hinvite-t">Playlists that fill themselves</span>
        </span>
        <span className="hinvite-b">{body}</span>
        {btn}
      </div>
    )
  return (
    <div className="hinvite">
      {mark(56)}
      <span className="hinvite-text">
        <span className="hinvite-t">Playlists that fill themselves</span>
        <span className="hinvite-b">{body}</span>
      </span>
      {btn}
    </div>
  )
}

/* ── Placeholders ───────────────────────────────────── */

export function SkelCard({ size }: { size: number; kind?: 'mix' | 'radio' }) {
  return (
    <div className="hcard hskel" style={{ width: size }} aria-hidden>
      <span className="hskel-bar mm-anim" style={{ width: size, height: size, borderRadius: radiusFor(size) }} />
      <span className="hskel-lines">
        <span className="hskel-bar mm-anim" style={{ width: Math.round(size * 0.72), height: 12 }} />
        <span className="hskel-bar mm-anim" style={{ width: Math.round(size * 0.5), height: 10 }} />
      </span>
    </div>
  )
}
