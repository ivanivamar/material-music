/**
 * Home v2 cards (handoff §5–8): mix cards, radio cards, artist avatars, smart playlist cards (+ the
 * "New smart playlist" card and the invite), and their loading placeholders.
 */
import { useSyncExternalStore, type ReactNode } from 'react'
import { Eq } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, trackDrag } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { artistHref, go, mixHref, playlistHref } from '../../shell/routes'
import type { Artist, Catalogue } from '../../state/library'
import { mixContext, playMix, type MixPlan, type RadioCard as Radio } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import { playlistInfo } from '../../state/playlistViews'
import type { Playlist } from '../../state/playlists'
import { radioStore } from '../../state/radio'
import { PHONE_QUERY } from '../../state/viewport'
import { plural } from '../../state/views'
import { PlaylistCover } from '../playlists/PlaylistCover'
import { artistTrackIds, playList } from '../library/playback'
import { ArtistDisc, MixCover, RadioArt, SparkIcon } from './art'

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
export const cardSize = (s: ReturnType<typeof useHomeSize>) => (s === 'desk' ? 168 : s === 'phone' ? 140 : 124)
export const avatarSize = (s: ReturnType<typeof useHomeSize>) => (s === 'desk' ? 132 : s === 'phone' ? 104 : 92)

/** Is the player on this context (and is it playing)? */
export function usePlayingContext(kind: string, id: string): { active: boolean; playing: boolean } {
  const p = usePlayer()
  const active = p.index >= 0 && p.context?.kind === kind && p.context.id === id
  return { active, playing: active && p.playing }
}

/* ── Shared card frame ──────────────────────────────── */

function CardFrame({
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
  round,
  extra,
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
  round?: boolean
  extra?: Record<string, unknown>
}) {
  return (
    <div
      {...extra}
      className={`hcard ${active ? 'is-active' : ''} ${playing ? 'is-playing' : ''} ${className ?? ''}`}
      style={{ width: size }}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className={`hcard-art ${round ? 'is-round' : ''}`} style={{ width: size, height: size }}>
        {art}
        <span className="hcard-scrim" aria-hidden />
        {active && (
          <span className="hcard-eq">
            <Eq playing={playing} />
          </span>
        )}
        <span className="hcard-btns">
          {onShuffle && (
            <button
              type="button"
              className="hcard-shuf"
              aria-label={`Shuffle ${title}`}
              onClick={(e) => {
                e.stopPropagation()
                onShuffle()
              }}
            >
              <Icon name="shuffle" />
            </button>
          )}
          <button
            type="button"
            className="hcard-play"
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            onClick={(e) => {
              e.stopPropagation()
              if (active) playerStore.toggle()
              else onPlay()
            }}
          >
            <Icon name={playing ? 'pauseF' : 'playF'} />
          </button>
        </span>
      </div>
      <div className="hcard-t" title={title}>
        {title}
      </div>
      <div className="hcard-s">{subtitle}</div>
    </div>
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
      extra={{ ...trackDrag(() => mix.trackIds, ctx.label), onContextMenu: (e: React.MouseEvent) => actions.menu({ kind: 'tracks', trackIds: mix.trackIds, label: mix.title }, e) }}
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
      art={<RadioArt seed={radioArtSeed(c, radio)} size={size} />}
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

/* ── Artist avatar ──────────────────────────────────── */

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
        <button
          type="button"
          className="hartist-play"
          aria-label={st.playing ? `Pause ${artist.name}` : `Play ${artist.name}`}
          onClick={(e) => {
            e.stopPropagation()
            if (st.active) playerStore.toggle()
            else playList(artistTrackIds(c, artist.id), ctx, { shuffle: true })
          }}
        >
          <Icon name={st.playing ? 'pauseF' : 'playF'} />
        </button>
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
      art={<PlaylistCover playlist={playlist} size={size} lazy className="hcard-plc" />}
      title={playlist.name}
      subtitle={<span className="hcard-mono">{plural(n, 'SONG')} · UPDATES ITSELF</span>}
      size={size}
      active={st.active}
      playing={st.playing}
      onOpen={() => go(playlistHref(playlist.id))}
      onPlay={() => playPlaylist(playlist.id)}
      extra={{ onContextMenu: (e: React.MouseEvent) => actions.menu({ kind: 'playlist', playlistId: playlist.id }, e) }}
    />
  )
}

export function NewSmartCard({ size }: { size: number }) {
  return (
    <button type="button" className="hnew" style={{ width: size }} onClick={() => actions.smartPlaylist()}>
      <span className="hnew-art" style={{ width: size, height: size }}>
        <span className="hnew-tile">
          <SparkIcon />
        </span>
      </span>
      <span className="hcard-t">New smart playlist</span>
      <span className="hcard-s hcard-mono">RULES · UPDATES ITSELF</span>
    </button>
  )
}

export function SmartInvite({ phone }: { phone: boolean }) {
  if (phone)
    return (
      <button type="button" className="hinvite is-phone" onClick={() => actions.smartPlaylist()}>
        <span className="hnew-tile is-sm">
          <SparkIcon />
        </span>
        <span className="hinvite-text">
          <span className="hinvite-t">New smart playlist</span>
          <span className="hinvite-b">Pick a few rules. It keeps itself up to date.</span>
        </span>
        <Icon name="chevR" className="hinvite-chev" />
      </button>
    )
  return (
    <div className="hinvite">
      <span className="hnew-tile">
        <SparkIcon />
      </span>
      <span className="hinvite-text">
        <span className="hinvite-t">Playlists that fill themselves</span>
        <span className="hinvite-b">Pick a few rules, like never played, added this month or longer than 6 minutes. The playlist keeps itself up to date.</span>
      </span>
      <button type="button" className="btn btn-secondary hinvite-btn" onClick={() => actions.smartPlaylist()}>
        New smart playlist
      </button>
    </div>
  )
}

/* ── Placeholders ───────────────────────────────────── */

export function SkelCard({ size, kind }: { size: number; kind: 'mix' | 'radio' }) {
  return (
    <div className="hcard hskel" style={{ width: size }} aria-hidden>
      {kind === 'mix' ? (
        <div className="hskel-mix" style={{ width: size, height: size }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="hskel-cell pg-anim" style={{ animationDelay: `${-i * 0.18}s` }} />
          ))}
        </div>
      ) : (
        <div className="hskel-radio" style={{ width: size, height: size }}>
          <span className="hskel-ring" style={{ width: size * 0.71, height: size * 0.71 }} />
          <span className="hskel-bar hskel-disc pg-anim" style={{ width: size * 0.54, height: size * 0.54 }} />
        </div>
      )}
      <span className="hskel-bar pg-anim" style={{ width: 120, height: 12, marginTop: 4 }} />
      <span className="hskel-bar pg-anim" style={{ width: 84, height: 10 }} />
    </div>
  )
}
