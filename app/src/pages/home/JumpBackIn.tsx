/**
 * Jump back in (handoff §2–3): the DJ tile first, then the last things played *from* (synced PC ↔
 * phone through Drive recent.json, state/recent.ts), newest first. Desktop 4 × 2 (DJ + 7), phone
 * 2 × 3 (DJ + 5). With few items the grid just ends early; with no plays only the DJ shows.
 *
 * Click plays that context (again: pause / resume when it's the one playing). The DJ tile opens the
 * full-screen player in its DJ start view (or back into the run); right-click / long-press opens the
 * DJ panel.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Eq } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions, type ActionTarget } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { DjMark } from '../../dj/DjMark'
import { useCover } from '../../lib/covers'
import { parseRadioId } from '../../lib/mixing'
import { djUi, useDjView } from '../../state/djUi'
import { nowPlayingStore } from '../../state/nowPlaying'
import { albumPlays } from '../../state/homeViews'
import type { Play } from '../../state/history'
import type { Catalogue } from '../../state/library'
import { playMix, radioTitle, type MixSet } from '../../state/mixes'
import { playerStore, usePlayer } from '../../state/player'
import type { Playlist } from '../../state/playlists'
import { radioStore } from '../../state/radio'
import type { RecentItem } from '../../state/recent'
import { isTouch } from '../../state/viewport'
import { albumTrackIds, artistTrackIds, playList } from '../library/playback'
import { ArtistDisc, MixCover, RadioArt, SmartArt } from './art'
import { radioArtSeed } from './cards'
import { PlaylistCover } from '../playlists/PlaylistCover'

const KIND_LABEL = { album: 'ALBUM', playlist: 'PLAYLIST', smart: 'SMART', daily: 'DAILY MIX', mix: 'MIX', radio: 'RADIO', artist: 'ARTIST' } as const

interface Tile {
  key: string
  label: string
  name: string
  art: (size: number) => ReactNode
  /** player context this tile stands for */
  ctxKind: string
  ctxId: string
  play: () => void
  menu?: ActionTarget
}

function AlbumArt({ cover, size }: { cover: string | null; size: number }) {
  const url = useCover(cover)
  return <span className="jt-cover" style={{ width: size, height: size }}>{url && <img src={url} alt="" draggable={false} />}</span>
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
        label: KIND_LABEL.album,
        name: a.title,
        art: (s) => <AlbumArt cover={a.cover} size={s} />,
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
      return {
        key: `playlist|${p.id}`,
        label: p.smart ? KIND_LABEL.smart : KIND_LABEL.playlist,
        name: p.name,
        art: (s) => (p.smart ? <SmartArt playlist={p} size={s} /> : <PlaylistCover playlist={p} size={s} className="jt-plc" />),
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
        label: KIND_LABEL.artist,
        name: a.name,
        art: (s) => <ArtistDisc artist={a} size={s} />,
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
      return {
        key: `mix|${r.id}`,
        label: r.id.startsWith('daily-') ? KIND_LABEL.daily : KIND_LABEL.mix,
        name: m?.title ?? r.label ?? 'Mix',
        art: (s) => (m ? <MixCover c={c} mix={m} size={s} radius={8} /> : <span className="jt-cover hskel-bar" style={{ width: s, height: s }} />),
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
      return {
        key: `radio|${r.id}`,
        label: KIND_LABEL.radio,
        name: t.title,
        art: (s) => <RadioArt seed={radioArtSeed(c, { seed, artistId: t.artistId, albumId: t.albumId, name: t.name })} size={s} radius={8} />,
        ctxKind: 'radio',
        ctxId: r.id,
        play: () => radioStore.start(seed),
      }
    }
  }
}

function TileView({ t, size, phone }: { t: Tile; size: number; phone: boolean }) {
  const p = usePlayer()
  const active = p.index >= 0 && p.context?.kind === t.ctxKind && p.context.id === t.ctxId
  const playing = active && p.playing
  const click = () => (active ? playerStore.toggle() : t.play())
  return (
    <div
      className={`jt ${active ? 'is-active' : ''}`}
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
        <span className="jt-kind">
          {active && <Eq playing={playing} />}
          {t.label}
        </span>
      </span>
      {!phone && (
        <span className="jt-play" aria-hidden>
          <Icon name={playing ? 'pauseF' : 'playF'} />
        </span>
      )}
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
  return (
    <div
      ref={ref}
      className={`jt jt-dj ${on ? 'is-air' : ''} ${speaking ? 'is-speaking' : ''} ${pressed ? 'is-pressed' : ''}`}
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
      {on && <span className="jt-breathe pg-anim" aria-hidden />}
      <span className="jt-art">
        <DjMark size={size} speaking={speaking} onAir={on && !speaking} radius={8} shadow={`0 0 0 1px rgba(198,180,242,${on ? 0.28 : 0.14})`} />
      </span>
      <span className="jt-text">
        <span className="jt-name">{on ? (view.session?.title ?? 'DJ') : 'DJ'}</span>
        {on ? (
          <span className="jt-kind jt-air">
            {!speaking && <Eq playing={playerStore.get().playing} />}
            {speaking ? (phone ? 'ON AIR · SPEAKING' : 'ON AIR · DJ IS SPEAKING') : 'ON AIR'}
          </span>
        ) : (
          <span className="jt-sub">Endless · tap to start</span>
        )}
      </span>
      {!phone && (
        <span className="jt-play is-dj" aria-hidden>
          <Icon name="playF" />
        </span>
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
