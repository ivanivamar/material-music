/**
 * Jump back in (Material redesign, HomeMaterial.dc.html): the DJ tile first, then the last things
 * played *from* (synced PC ↔ phone through Drive recent.json, state/recent.ts), newest first.
 * Desktop 4 columns (3 under 1300px) × 2 rows (DJ + 7), phone 2 × 3 (DJ + 5).
 *
 * Tiles are flat warm neutrals (rest / hover / playing); the tile's own album hue only colours the kind
 * icon, the equaliser and the cookie play button (shown on hover; always on phone). Art sits tilted
 * −4° and straightens on hover.
 *
 * Click plays that context (again: pause / resume when it's the one playing). The DJ tile opens the
 * DJ start view (or the player while on air); right-click / long-press opens the DJ panel.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AlbumEq } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { actions, type ActionTarget } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { useCover } from '../../lib/covers'
import { useArtStats } from '../../lib/artStats'
import { parseRadioId } from '../../lib/mixing'
import { djUi, useDjView } from '../../state/djUi'
import { nowPlayingStore } from '../../state/nowPlaying'
import { albumPlays } from '../../state/homeViews'
import type { Play } from '../../state/history'
import type { Artist, Catalogue } from '../../state/library'
import { playMix, radioTitle, type MixSet } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import type { Playlist } from '../../state/playlists'
import { radioStore } from '../../state/radio'
import type { RecentItem } from '../../state/recent'
import { isTouch } from '../../state/viewport'
import { albumTrackIds, artistTrackIds, playList } from '../library/playback'
import { ArtistDisc, CookiePlay, DjKnobMark, MixCover, RadioArt, SmartArt, radiusFor, useArtistHue, useRadioHue, type RadioArtSeed } from './art'
import { radioArtSeed } from './cards'
import { PlaylistCover } from '../playlists/PlaylistCover'

/** Where a tile's accent hue comes from. */
type HueSrc = { cover: string | null | undefined } | { hue: number } | { artist: Artist } | { radio: RadioArtSeed } | null

interface Tile {
  key: string
  label: string
  icon: IconName
  name: string
  /** Unix seconds, last played from */
  at: number
  art: (size: number) => ReactNode
  hue: HueSrc
  /** player context this tile stands for */
  ctxKind: string
  ctxId: string
  play: () => void
  menu?: ActionTarget
}

function AlbumArt({ cover, size }: { cover: string | null; size: number }) {
  const url = useCover(cover)
  return (
    <span className="jt-cover" style={{ width: size, height: size, borderRadius: radiusFor(size) }}>
      {url && <img src={url} alt="" draggable={false} />}
    </span>
  )
}

/** Recent items → tiles (gone ones skipped; a mix not in today's set is skipped). */
export function jumpTiles(c: Catalogue, items: RecentItem[], lists: Map<string, Playlist>, mixes: MixSet | null, plays: readonly Play[], max: number): Tile[] {
  const out: Tile[] = []
  const add = (t: Tile | null) => t && out.length < max && !out.some((x) => x.key === t.key) && out.push(t)
  for (const r of items) {
    if (out.length >= max) break
    add(tileOf(c, r, lists, mixes))
  }
  // nothing synced yet (first run / the other device on an older version): history-derived albums
  if (!items.length) {
    const byLast = [...albumPlays(c, plays).values()].sort((a, b) => b.last - a.last)
    for (const s of byLast) add(tileOf(c, { kind: 'album', id: s.album.id, at: s.last, dev: '' }, lists, mixes))
  }
  return out
}

function tileOf(c: Catalogue, r: RecentItem, lists: Map<string, Playlist>, mixes: MixSet | null): Tile | null {
  switch (r.kind) {
    case 'album': {
      const a = c.albums[r.id]
      if (!a) return null
      return {
        key: `album|${a.id}`,
        label: 'Album',
        icon: 'album',
        name: a.title,
        at: r.at,
        art: (s) => <AlbumArt cover={a.cover} size={s} />,
        hue: { cover: a.cover },
        ctxKind: 'album',
        ctxId: a.id,
        play: () => playList(albumTrackIds(c, a.id), { kind: 'album', id: a.id, label: a.title }),
        menu: { kind: 'album', albumId: a.id },
      }
    }
    case 'playlist':
    case 'smart': {
      const p = lists.get(r.id)
      if (!p) return null
      const first = p.smart ? null : c.tracks[p.entries[0]?.trackId ?? '']
      return {
        key: `playlist|${p.id}`,
        label: p.smart ? 'Smart playlist' : 'Playlist',
        icon: p.smart ? 'smart' : 'playlist',
        name: p.name,
        at: r.at,
        art: (s) => (p.smart ? <SmartArt playlist={p} size={s} /> : <PlaylistCover playlist={p} size={s} className="jt-plc" />),
        hue: first ? { cover: c.albums[first.albumId]?.cover } : { hue: 38 },
        ctxKind: 'playlist',
        ctxId: p.id,
        play: () => playPlaylist(p.id),
        menu: { kind: 'playlist', playlistId: p.id },
      }
    }
    case 'artist': {
      const a = c.artists[r.id]
      if (!a) return null
      return {
        key: `artist|${a.id}`,
        label: 'Artist',
        icon: 'artist',
        name: a.name,
        at: r.at,
        art: (s) => <ArtistDisc artist={a} size={s} />,
        hue: { artist: a },
        ctxKind: 'artist',
        ctxId: a.id,
        play: () => playList(artistTrackIds(c, a.id), { kind: 'artist', id: a.id, label: a.name }, { shuffle: true }),
        menu: { kind: 'artist', artistId: a.id },
      }
    }
    case 'mix': {
      // today's version of that mix; still computing → the saved name and a plain tile
      const m = mixes?.items.find((x) => x.id === r.id)
      if (mixes && !m) return null
      const daily = r.id.startsWith('daily-')
      return {
        key: `mix|${r.id}`,
        label: daily ? 'Daily mix' : 'Mix',
        icon: daily ? 'today' : r.id === 'deepcuts' ? 'explore' : 'history',
        name: m?.title ?? r.label ?? 'Mix',
        at: r.at,
        art: (s) => (m ? <MixCover c={c} mix={m} size={s} /> : <span className="jt-cover hskel-bar" style={{ width: s, height: s, borderRadius: radiusFor(s) }} />),
        hue: m ? { hue: m.hue } : null,
        ctxKind: 'mix',
        ctxId: r.id,
        play: () => m && playMix(m),
        menu: m ? { kind: 'tracks', trackIds: m.trackIds, label: m.title } : undefined,
      }
    }
    case 'radio': {
      const seed = parseRadioId(r.id)
      const t = seed ? radioTitle(c, seed) : null
      if (!seed || !t) return null
      const art = radioArtSeed(c, { seed, artistId: t.artistId, albumId: t.albumId, name: t.name })
      return {
        key: `radio|${r.id}`,
        label: 'Radio',
        icon: 'radio',
        name: t.title,
        at: r.at,
        art: (s) => <RadioArt seed={art} size={s} />,
        hue: { radio: art },
        ctxKind: 'radio',
        ctxId: r.id,
        play: () => radioStore.start(seed),
      }
    }
  }
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "Mar 2025". */
export function agoLabel(sec: number, nowMs = Date.now()): string {
  if (!sec) return ''
  const days = Math.floor((new Date(nowMs).setHours(0, 0, 0, 0) - new Date(sec * 1000).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return new Date(sec * 1000).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** The tile's accent hue (null → neutral, near-white accents). */
function useTileHue(src: HueSrc): number | null {
  const coverId = src && 'cover' in src ? src.cover : null
  const url = useCover(coverId)
  const stats = useArtStats(coverId, url)
  const artistHue = useArtistHue(src && 'artist' in src ? src.artist : null)
  const radioHue = useRadioHue(src && 'radio' in src ? src.radio : { type: 'song', artist: null, cover: null, name: '' })
  if (!src) return null
  if ('hue' in src) return src.hue
  if ('artist' in src) return artistHue
  if ('radio' in src) return radioHue
  return stats ? stats.hue : null
}

const hueStyle = (h: number | null) => ({ '--h': h ?? 40, '--hc': h == null ? 0 : 1 }) as CSSProperties

function TileView({ t, size, phone }: { t: Tile; size: number; phone: boolean }) {
  const p = usePlayer()
  const hue = useTileHue(t.hue)
  const active = p.index >= 0 && p.context?.kind === t.ctxKind && p.context.id === t.ctxId
  const playing = active && p.playing
  const click = () => (active ? playerStore.toggle() : t.play())
  return (
    <div
      className={`jt hue-scope ${active ? 'is-active' : ''}`}
      style={hueStyle(hue)}
      role="button"
      tabIndex={0}
      onClick={click}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), click())}
      onContextMenu={(e) => t.menu && actions.menu(t.menu, e)}
      aria-label={`${playing ? 'Pause' : 'Play'} ${t.name}`}
    >
      <span className="jt-art">{t.art(size)}</span>
      <span className="jt-text">
        <span className="jt-name">{t.name}</span>
        <span className="jt-sub">
          {playing ? <AlbumEq height={12} /> : <Icon name={t.icon} className="jt-ic" />}
          <span className="jt-sub-t">
            {t.label}
            {t.at ? ` · ${agoLabel(t.at)}` : ''}
          </span>
        </span>
      </span>
      <CookiePlay
        size={phone ? 32 : 40}
        className="jt-play"
        playing={playing}
        label={playing ? `Pause ${t.name}` : `Play ${t.name}`}
        onClick={(e) => {
          e.stopPropagation()
          click()
        }}
      />
    </div>
  )
}

const LONG_PRESS = 520

/** Always the first tile. */
export function DjTile({ size, phone }: { size: number; phone: boolean }) {
  const view = useDjView()
  const ref = useRef<HTMLDivElement>(null)
  const [pressed, setPressed] = useState(false)
  const timer = useRef(0)
  const fired = useRef(false)
  const on = view.on
  const speaking = on && view.intro
  const open = () => {
    if (on) nowPlayingStore.open('np')
    else djUi.openStart()
  }
  const panel = () => {
    if (!on) return djUi.openStart()
    djUi.openPanel(ref.current, phone || isTouch())
  }
  const sub = !on
    ? 'Endless · tap to start'
    : speaking
      ? phone
        ? 'On air · speaking'
        : 'On air · DJ is speaking'
      : view.songCount > 0 && view.songIndex >= 0
        ? `On air · song ${view.songIndex + 1} of ${view.songCount}`
        : 'On air'
  return (
    <div
      ref={ref}
      className={`jt jt-dj ${on ? 'is-air' : ''} ${pressed ? 'is-pressed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={on ? `DJ on air: ${view.session?.title ?? ''}. Open the player.` : 'DJ: endless sessions from your library'}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        open()
      }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!isTouch()) panel()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        setPressed(true)
        fired.current = false
        window.clearTimeout(timer.current)
        if (e.pointerType !== 'mouse')
          timer.current = window.setTimeout(() => {
            fired.current = true
            setPressed(false)
            panel()
          }, LONG_PRESS)
      }}
      onPointerUp={() => {
        window.clearTimeout(timer.current)
        setPressed(false)
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current)
        setPressed(false)
      }}
      onPointerCancel={() => {
        window.clearTimeout(timer.current)
        setPressed(false)
      }}
    >
      <span className="jt-art">
        <DjKnobMark size={size} on={on} />
      </span>
      <span className="jt-text">
        <span className="jt-name">{on ? (view.session?.title ?? 'DJ') : 'DJ'}</span>
        <span className="jt-sub">
          {on && !speaking && <AlbumEq color="var(--dj)" height={12} on={playerStore.get().playing} />}
          <span className="jt-sub-t">{sub}</span>
        </span>
      </span>
      {!on && (
        <CookiePlay
          size={phone ? 32 : 40}
          tone="dj"
          className="jt-play"
          playing={false}
          label="Start the DJ"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
        />
      )}
    </div>
  )
}

export function JumpBackIn({ tiles, phone, size }: { tiles: Tile[]; phone: boolean; size: number }) {
  return (
    <div className="jbi">
      <DjTile size={size} phone={phone} />
      {tiles.map((t) => (
        <TileView key={t.key} t={t} size={size} phone={phone} />
      ))}
    </div>
  )
}
