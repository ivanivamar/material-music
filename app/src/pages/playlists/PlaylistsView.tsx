/**
 * Library › Playlists. Desktop: a grid of mosaic cards after a "New playlist" tile. Phone (handoff
 * 07 Android Playlists): "New playlist" row, then one row per playlist — 52px cover, name,
 * N TRACKS · N OFFLINE, ✓ when all of it is on the phone, ›.
 */
import type { ReactNode } from 'react'
import { EmptyState, Eq, Button } from '../../components/ui'
import { Icon } from '../../design/icons'
import { actions } from '../../actions/actions'
import { playPlaylist } from '../../actions/ops'
import { go, playlistHref } from '../../shell/routes'
import { playlistOffline, useDownloads } from '../../state/downloads'
import { type Catalogue } from '../../state/library'
import { usePlayer } from '../../state/player'
import { playlistInfo } from '../../state/playlistViews'
import { usePlaylists, type Playlist } from '../../state/playlists'
import { useIsPhone } from '../../state/viewport'
import { plural } from '../../state/views'
import { PlaylistCover } from './PlaylistCover'
import './playlists.css'

export function PlaylistsView({ c }: { c: Catalogue }) {
  const { list, loaded } = usePlaylists()
  const phone = useIsPhone()
  const p = usePlayer()
  const playingId = p.playing && p.context?.kind === 'playlist' ? p.context.id : null
  const create = () => actions.newPlaylist([], '', true)

  if (!loaded) return null
  if (!list.length)
    return (
      <div className="placeholder">
        <EmptyState
          icon="playlist"
          title="No playlists yet."
          body={phone ? 'Make one here, or long-press any song and choose Add to playlist.' : 'Make one here, or right-click any song or album and choose Add to playlist.'}
          actions={
            <>
              <Button icon="plus" onClick={create}>
                New playlist
              </Button>
              <Button variant="secondary" icon="smart" onClick={() => actions.smartPlaylist()}>
                Smart playlist
              </Button>
            </>
          }
        />
      </div>
    )

  if (phone)
    return (
      <div className="pls-list">
        <button type="button" className="pls-row pls-new" onClick={create}>
          <span className="pls-new-box">
            <Icon name="plus" />
          </span>
          <span className="pls-name">New playlist</span>
        </button>
        <button type="button" className="pls-row pls-new" onClick={() => actions.smartPlaylist()}>
          <span className="pls-new-box">
            <Icon name="smart" />
          </span>
          <span className="pls-text">
            <span className="pls-name">New smart playlist</span>
            <span className="pls-meta">FILLS ITSELF FROM RULES</span>
          </span>
        </button>
        {list.map((pl) => (
          <PhoneRow key={pl.id} c={c} pl={pl} playing={playingId === pl.id} />
        ))}
      </div>
    )

  return (
    <>
      <div className="lib-bar">
        <span className="lib-bar-meta">A–Z</span>
        <span className="lib-bar-line" />
        <span className="lib-bar-meta">{plural(list.length, 'PLAYLIST')}</span>
      </div>
      <div className="lib-grid pls-grid">
        <button type="button" className="acard pls-new-card" onClick={create}>
          <span className="acard-cover pls-new-tile">
            <Icon name="plus" />
          </span>
          <span className="acard-meta">
            <span className="acard-text">
              <span className="acard-title">New playlist</span>
              <span className="acard-sub">Start empty, add songs later</span>
            </span>
          </span>
        </button>
        <button type="button" className="acard pls-new-card" onClick={() => actions.smartPlaylist()}>
          <span className="acard-cover pls-new-tile">
            <Icon name="smart" />
          </span>
          <span className="acard-meta">
            <span className="acard-text">
              <span className="acard-title">New smart playlist</span>
              <span className="acard-sub">Fills itself from rules</span>
            </span>
          </span>
        </button>
        {list.map((pl) => (
          <PlaylistCard key={pl.id} c={c} pl={pl} playing={playingId === pl.id} />
        ))}
      </div>
    </>
  )
}

export function PlaylistCard({ c, pl, playing, title, onOpen }: { c: Catalogue; pl: Playlist; playing: boolean; title?: ReactNode; onOpen?: () => void }) {
  const info = playlistInfo(c, pl)
  return (
    <div
      className={`acard pls-card ${playing ? 'is-playing' : ''}`}
      role="link"
      tabIndex={0}
      onClick={() => {
        onOpen?.()
        go(playlistHref(pl.id))
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        onOpen?.()
        go(playlistHref(pl.id))
      }}
      onContextMenu={(e) => actions.menu({ kind: 'playlist', playlistId: pl.id }, e)}
    >
      <div className="acard-cover">
        <PlaylistCover playlist={pl} lazy className="acard-img" />
        {playing ? (
          <div className="acard-eq">
            <Eq />
          </div>
        ) : (
          info.ids.length > 0 && (
            <button
              type="button"
              className="acard-play"
              aria-label={`Play ${pl.name}`}
              style={{ border: 0, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                playPlaylist(pl.id)
              }}
            >
              <Icon name="playF" />
            </button>
          )
        )}
      </div>
      <div className="acard-meta">
        <div className="acard-text">
          <div className="acard-title">{title ?? pl.name}</div>
          <div className="acard-sub">{pl.smart ? `Smart · ${plural(info.ids.length, 'track', 'tracks')}` : plural(info.ids.length, 'track', 'tracks')}</div>
        </div>
      </div>
    </div>
  )
}

function PhoneRow({ c, pl, playing }: { c: Catalogue; pl: Playlist; playing: boolean }) {
  const info = playlistInfo(c, pl)
  const dl = useDownloads()
  const off = dl.available ? playlistOffline(dl, c, pl) : null
  const meta = [pl.smart ? 'SMART' : null, plural(info.ids.length, 'TRACK'), off?.done ? `${off.done} OFFLINE` : null].filter(Boolean).join(' · ')
  return (
    <a
      className={`pls-row ${playing ? 'is-playing' : ''}`}
      href={playlistHref(pl.id)}
      onContextMenu={(e) => actions.menu({ kind: 'playlist', playlistId: pl.id }, e)}
    >
      <PlaylistCover playlist={pl} size={52} lazy className="pls-cover" />
      <span className="pls-text">
        <span className="pls-name">{pl.name}</span>
        <span className="pls-meta">{meta}</span>
      </span>
      {playing && <Eq />}
      {off?.complete && (
        <span className="pls-ok">
          <Icon name="check" />
        </span>
      )}
      <span className="pls-chev">
        <Icon name="chevR" />
      </span>
    </a>
  )
}
