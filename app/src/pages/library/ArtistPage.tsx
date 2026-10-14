/**
 * Artist (handoff 06 Desktop Artist): photo (or mono monogram) in a 180px circle, hero name,
 * release / track / length counts, Play + Shuffle; songs on the left, discography grouped by
 * release type on the right. The artist banner (artist_background, else the blurred photo)
 * sits faintly behind the header.
 */
import { useState, type CSSProperties } from 'react'
import { Button, EmptyState, TrackRow, formatTime } from '../../components/ui'
import { useCover } from '../../lib/covers'
import { likesStore, useLikes } from '../../state/likes'
import { useLibrary } from '../../state/library'
import { playerStore } from '../../state/player'
import { libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtTotal, plural, type ReleaseKind } from '../../state/views'
import { ArtistAvatar, Crumbs, LibAlbumCard, SectionHead } from './common'
import { playList, useContextState, useNowPlaying, usePlayingAlbumId } from './playback'
import './library.css'

const ORDER: ReleaseKind[] = ['album', 'ep', 'single', 'live']
const SONGS_COLLAPSED = 10
const heroSize = (t: string) => (t.length <= 16 ? 84 : t.length <= 26 ? 64 : t.length <= 40 ? 52 : 40)

export function ArtistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const likes = useLikes()
  const now = useNowPlaying()
  const ctx = useContextState('artist', id)
  const playingAlbum = usePlayingAlbumId(data)
  const [allSongs, setAllSongs] = useState(false)
  const info = data ? artistInfos(data).get(id) : undefined
  const artist = info?.artist
  // banner: artist_background, else the photo blurred (not the generated mosaic)
  const bgId = artist?.background?.id ?? (artist?.image && artist.image.source !== 'mosaic' ? artist.image.id : undefined)
  const bg = useCover(bgId, artist?.background ? artist.background.v : artist?.image?.v)
  const blurred = !artist?.background

  if (!data) return null
  if (!info || !artist) {
    return (
      <>
        <Crumbs fallback={libraryHref('artists')} parts={['LIBRARY', 'ARTISTS']} />
        <div className="placeholder">
          <EmptyState icon="library" title="This artist isn’t in your library." body="They may have been renamed in the last import." />
        </div>
      </>
    )
  }

  const infos = albumInfos(data)
  const groups = ORDER.map((k) => ({ kind: k, albums: info.albums.filter((a) => infos.get(a.id)?.kind === k) })).filter((g) => g.albums.length)
  const songs = info.albums.flatMap((a) => infos.get(a.id)?.tracks ?? [])
  const ids = songs.map((t) => t.id)
  const context = { kind: 'artist' as const, id: artist.id, label: artist.name }
  const shown = allSongs ? songs : songs.slice(0, SONGS_COLLAPSED)
  const meta = ['ARTIST', ...info.genres.slice(0, 2).map((g) => g.toUpperCase())].join(' · ')

  const onPlay = () => {
    if (ctx.active) playerStore.toggle()
    else playList(ids, context)
  }
  const playAt = (trackId: string) => {
    if (ctx.active && ctx.currentId === trackId) playerStore.toggle()
    else playList(ids, context, { start: Math.max(0, ids.indexOf(trackId)) })
  }

  return (
    <div className="artist-page">
      {bg && <div className={`artist-banner ${blurred ? 'is-blurred' : ''}`} style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
      <Crumbs fallback={libraryHref('artists')} parts={[<a key="l" href={libraryHref('artists')}>LIBRARY</a>, <a key="a" href={libraryHref('artists')}>ARTISTS</a>]} />

      <header className="hero hero-artist">
        <ArtistAvatar artist={artist} size={180} lazy={false} className="hero-avatar" />
        <div className="hero-text">
          <div className="hero-meta">{meta}</div>
          <h1 className="hero-title" style={{ '--hs': `${heroSize(artist.name)}px` } as CSSProperties} title={artist.name}>
            {artist.name}
          </h1>
          <div className="hero-stats">
            {plural(info.albums.length, 'RELEASE')} · {plural(info.tracks, 'TRACK')} · {fmtTotal(info.seconds)}
          </div>
        </div>
        <div className="hero-buttons">
          <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length}>
            {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
          </Button>
          <Button variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
            Shuffle
          </Button>
        </div>
      </header>

      <div className="artist-cols">
        <section className="artist-songs">
          <SectionHead label="SONGS" right={plural(songs.length, 'TRACK')} />
          <div>
            {shown.map((t, i) => {
              const album = data.albums[t.albumId]
              return (
                <TrackRow
                  key={t.id}
                  className="trow-artist"
                  n={i + 1}
                  title={t.title}
                  subtitle={album?.title}
                  duration={t.duration ? formatTime(t.duration) : '—'}
                  label={album?.year ?? ''}
                  playing={now.id === t.id}
                  liked={!!likes[t.id]}
                  onLike={(v) => likesStore.set(t.id, v)}
                  onPlay={() => playAt(t.id)}
                />
              )
            })}
          </div>
          {songs.length > SONGS_COLLAPSED && (
            <button type="button" className="more-btn" onClick={() => setAllSongs((v) => !v)}>
              {allSongs ? 'SHOW FEWER' : `SHOW ALL ${songs.length}`}
            </button>
          )}
        </section>

        <div className="artist-disco">
          {groups.map((g, gi) => (
            <section key={g.kind} className="disco-group">
              <SectionHead label={RELEASE_LABEL[g.kind].many} right={String(gi + 1).padStart(2, '0')} />
              <div className="disco-grid">
                {g.albums.map((a) => (
                  <div className="disco-card" key={a.id}>
                    <LibAlbumCard
                      c={data}
                      album={a}
                      subtitle={[a.year, plural(infos.get(a.id)?.tracks.length ?? 0, 'TRACK')].filter(Boolean).join(' · ')}
                      playingAlbumId={playingAlbum}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
