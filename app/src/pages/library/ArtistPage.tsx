/**
 * Artist (handoff 06 Desktop Artist): photo (or mono monogram) in a 180px circle, hero name,
 * release / track / length counts, Play + Shuffle + Follow; songs on the left, discography grouped
 * by release type on the right. The artist banner (artist_background, else the blurred photo)
 * sits faintly behind the header.
 *
 * Added after the handoff, in its style:
 * - MOST PLAYED HERE: the songs ordered by your plays (state/history.ts), the count in the mono
 *   column; plain SONGS in album order while nothing was played yet.
 * - Follow / Following = new-release alerts for this artist (state/releases.ts: not muted).
 * - On tour (Concerts): top of the right column on desktop, under the header on the phone; a
 *   "playing near you" chip under the stats when a date is near home.
 * - Hearts on the rows (Liked songs), "· 7 OFFLINE" in the stats on the phone.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { Button, EmptyState, IconButton, TrackRow, formatTime } from '../../components/ui'
import { LikeButton } from '../../components/LikeButton'
import { actions, trackDrag } from '../../actions/actions'
import { useCover } from '../../lib/covers'
import { artistGenresOf, useGenres } from '../../state/genres'
import { useHistory } from '../../state/history'
import { useLibrary } from '../../state/library'
import { playerStore } from '../../state/player'
import { releasesStore, useReleases } from '../../state/releases'
import { libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtTotal, plural, type ReleaseKind } from '../../state/views'
import { ArtistAvatar, Crumbs, SectionHead } from './common'
import { DownloadButton, trackDownload } from './DownloadButton'
import { artistOffline, downloadsStore, useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying } from './playback'
import { LibCard, albumItem } from './libgrid'
import { useIsPhone } from '../../state/viewport'
import { HeroTourChip, OnTour, useTourNear } from '../concerts/OnTour'
import { useArtistLook } from '../concerts/parts'

const ORDER: ReleaseKind[] = ['album', 'ep', 'single', 'live']
const SONGS_COLLAPSED = 10
const heroSize = (t: string) => (t.length <= 16 ? 84 : t.length <= 26 ? 64 : t.length <= 40 ? 52 : 40)

export function ArtistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const now = useNowPlaying()
  const ctx = useContextState('artist', id)
  const [allSongs, setAllSongs] = useState(false)
  const dl = useDownloads()
  const dlNow = useDownloadProgress()
  const history = useHistory()
  const releases = useReleases()
  const { doc: genreDoc } = useGenres()
  const info = data ? artistInfos(data).get(id) : undefined
  const artist = info?.artist
  // banner: artist_background, else the photo blurred (not the generated mosaic)
  const bgId = artist?.background?.id ?? (artist?.image && artist.image.source !== 'mosaic' ? artist.image.id : undefined)
  const bg = useCover(bgId, artist?.background ? artist.background.v : artist?.image?.v)
  const blurred = !artist?.background
  const phone = useIsPhone()
  const tourNear = useTourNear(id)
  const tourHue = useArtistLook(artist).H
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of history.plays) m.set(p.trackId, (m.get(p.trackId) ?? 0) + 1)
    return m
  }, [history.plays])
  const crumbs = <Crumbs fallback={libraryHref('artists')} parts={[<a key="l" href={libraryHref('all')}>LIBRARY</a>, <a key="a" href={libraryHref('artists')}>ARTISTS</a>]} />

  if (!data) return null
  if (!info || !artist) {
    return (
      <>
        {crumbs}
        <div className="placeholder">
          <EmptyState icon="artist" title="This artist isn’t in your library." body="They may have been renamed in the last import." />
        </div>
      </>
    )
  }

  const infos = albumInfos(data)
  const groups = ORDER.map((k) => ({ kind: k, albums: info.albums.filter((a) => infos.get(a.id)?.kind === k) })).filter((g) => g.albums.length)
  const inOrder = info.albums.flatMap((a) => infos.get(a.id)?.tracks ?? [])
  const played = inOrder.some((t) => counts.get(t.id))
  const songs = played ? inOrder.map((t, i) => ({ t, i })).sort((a, b) => (counts.get(b.t.id) ?? 0) - (counts.get(a.t.id) ?? 0) || a.i - b.i).map((x) => x.t) : inOrder
  const ids = inOrder.map((t) => t.id)
  const context = { kind: 'artist' as const, id: artist.id, label: artist.name }
  const shown = allSongs ? songs : songs.slice(0, SONGS_COLLAPSED)
  const meta = ['ARTIST', ...artistGenresOf(genreDoc, data, artist.id).genres.slice(0, 2).map((g) => g.toUpperCase())].join(' · ')
  const off = dl.available ? artistOffline(dl, data, artist.id) : null
  const following = !releases.doc.muted[artist.id]?.[0]

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
      {crumbs}

      <header className="hero hero-artist">
        <ArtistAvatar artist={artist} size={180} lazy={false} className="hero-avatar" />
        <div className="hero-text">
          <div className="hero-meta">{meta}</div>
          <h1 className="hero-title" style={{ '--hs': `${heroSize(artist.name)}px` } as CSSProperties} title={artist.name}>
            {artist.name}
          </h1>
          <div className="hero-stats">
            {plural(info.albums.length, 'RELEASE')} · {plural(info.tracks, 'TRACK')} · {fmtTotal(info.seconds)}
            {off && off.done ? ` · ${off.done} OFFLINE` : ''}
          </div>
          {tourNear && (
            <div className="hero-tour">
              <HeroTourChip show={tourNear} />
            </div>
          )}
        </div>
        <div className="hero-buttons">
          <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length}>
            {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
          </Button>
          <Button variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
            Shuffle
          </Button>
          <Button
            variant="secondary"
            icon={following ? 'done' : 'bell'}
            className={`hero-follow ${following ? 'is-on' : ''}`}
            aria-pressed={following}
            title={following ? 'You get new-release alerts for this artist · click to stop' : 'Get new-release alerts for this artist'}
            onClick={() => releasesStore.setMuted(artist.id, following)}
          >
            <span className="hero-follow-l">{following ? 'Following' : 'Follow'}</span>
          </Button>
          {off && <DownloadButton state={off} name={artist.name} onPin={() => downloadsStore.pin('artist', artist.id)} onRemove={() => downloadsStore.removeArtist(artist.id)} />}
          <IconButton icon="more" label="More" shape="square" className="actions-more" onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
        </div>
      </header>

      {phone && <OnTour artistId={artist.id} H={tourHue} />}

      <div className="artist-cols">
        <section className={`artist-songs ${dl.available ? 'has-dl' : ''}`}>
          <SectionHead label={played ? 'MOST PLAYED HERE' : 'SONGS'} right={plural(songs.length, 'TRACK')} />
          <div>
            {shown.map((t, i) => {
              const album = data.albums[t.albumId]
              const c = counts.get(t.id) ?? 0
              return (
                <TrackRow
                  key={t.id}
                  className="trow-artist"
                  n={i + 1}
                  title={t.title}
                  subtitle={album?.title}
                  duration={t.duration ? formatTime(t.duration) : '—'}
                  label={played ? plural(c, 'PLAY') : (album?.year ?? '')}
                  playing={now.id === t.id}
                  download={dl.available ? trackDownload(dl, t, dlNow) : undefined}
                  onPlay={() => playAt(t.id)}
                  onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                  like={<LikeButton trackId={t.id} size="xs" hover className="trow-like" />}
                  rowProps={trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
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
          {!phone && <OnTour artistId={artist.id} H={tourHue} />}
          {groups.map((g, gi) => (
            <section key={g.kind} className="disco-group">
              <SectionHead label={RELEASE_LABEL[g.kind].many} right={String(gi + 1).padStart(2, '0')} />
              <div className="disco-grid">
                {g.albums.map((a) => (
                  <LibCard key={a.id} c={data} item={albumItem(a, [a.year, plural(infos.get(a.id)?.tracks.length ?? 0, 'TRACK')].filter(Boolean).join(' · '))} size={150} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
