/**
 * Artist (Material redesign, ArtistMaterial.dc.html):
 *
 *   ← Library › Artists
 *   (188 photo)  Artist · Metalcore (coral)
 *                Spiritbox (57px)
 *                3 releases · 20 tracks · 1:12:40 · 7 offline
 *                [▶ Play] [⤮ Shuffle] [✓ Following] (Download) ⋮
 *   Most played here (from your history; "Songs" in album order when nothing was played yet)   | Albums 1
 *   ┌ 1 [cover] Black Rainbow · Tsunami Sea ✓     64 plays  3:48 ⋮ ┐                          | EPs 2 …
 *   Show all 20
 *
 * Following = new-release alerts for this artist (state/releases.ts: not muted). The banner
 * (artist_background, else the blurred photo) sits faintly behind the header.
 */
import { useMemo, useState } from 'react'
import { EmptyState, formatTime } from '../../components/ui'
import { actions, trackDrag } from '../../actions/actions'
import { Icon } from '../../design/icons'
import { useCover } from '../../lib/covers'
import { artistGenresOf, useGenres } from '../../state/genres'
import { useHistory } from '../../state/history'
import { useLibrary } from '../../state/library'
import { playerStore } from '../../state/player'
import { releasesStore, useReleases } from '../../state/releases'
import { albumHref, libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtTotal, type ReleaseKind } from '../../state/views'
import { DownloadButton, trackDownload } from './DownloadButton'
import { artistOffline, downloadsStore, useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying } from './playback'
import { ActBtn, DetailBack, DtList, DtRow, MoreBtn, titleSize } from './detail'
import { LibCard, albumItem } from './libgrid'
import { initials } from '../home/art'
import { nameHue } from '../../lib/mixing'

const ORDER: ReleaseKind[] = ['album', 'ep', 'single', 'live']
const SONGS_COLLAPSED = 10
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

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
  const photo = useCover(artist?.image?.id, artist?.image?.v)
  // banner: artist_background, else the photo blurred (not the generated mosaic)
  const bgId = artist?.background?.id ?? (artist?.image && artist.image.source !== 'mosaic' ? artist.image.id : undefined)
  const bg = useCover(bgId, artist?.background ? artist.background.v : artist?.image?.v)
  const blurred = !artist?.background
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of history.plays) m.set(p.trackId, (m.get(p.trackId) ?? 0) + 1)
    return m
  }, [history.plays])
  const back = <DetailBack fallback={libraryHref('artists')} parts={[{ label: 'Library', href: libraryHref('all') }, { label: 'Artists', href: libraryHref('artists') }]} />

  if (!data) return null
  if (!info || !artist) {
    return (
      <div className="dt-page">
        {back}
        <div className="placeholder">
          <EmptyState icon="artist" title="This artist isn’t in your library." body="They may have been renamed in the last import." />
        </div>
      </div>
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
  const genres = artistGenresOf(genreDoc, data, artist.id).genres.slice(0, 2)
  const off = dl.available ? artistOffline(dl, data, artist.id) : null
  const following = !releases.doc.muted[artist.id]?.[0]
  const H = nameHue(artist.name)
  const stats = [
    `${info.albums.length} ${info.albums.length === 1 ? 'release' : 'releases'}`,
    `${info.tracks} ${info.tracks === 1 ? 'track' : 'tracks'}`,
    fmtTotal(info.seconds),
    off && off.done ? `${off.done} offline` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const onPlay = () => (ctx.active ? playerStore.toggle() : playList(ids, context))
  const playTrack = (trackId: string) => playList(ids, context, { start: Math.max(0, ids.indexOf(trackId)) })

  return (
    <div className="dt-page">
      {bg && <div className={`dt-banner ${blurred ? 'is-blurred' : ''}`} style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
      {back}

      <header className="dt-hero is-artist">
        <div className="dt-art">
          <div className="dt-avatar" style={photo ? undefined : { background: `oklch(0.42 0.08 ${H})`, color: `oklch(0.92 0.04 ${H})` }}>
            {photo ? <img src={photo} alt="" /> : initials(artist.name)}
          </div>
        </div>
        <div className="dt-hero-text">
          <div className="dt-kicker">{['Artist', ...genres.map(cap)].join(' · ')}</div>
          <h1 className="dt-title" style={{ '--ts': `${titleSize(artist.name)}px` } as React.CSSProperties} title={artist.name}>
            {artist.name}
          </h1>
          <div className="dt-line">
            <span className="dt-stats">{stats}</span>
          </div>
          <div className="dt-actions dt-artist-actions">
            <ActBtn kind="filled" icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length}>
              {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
            </ActBtn>
            <ActBtn kind="tonal" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
              Shuffle
            </ActBtn>
            <ActBtn
              kind="outlined"
              icon={following ? 'done' : 'bell'}
              className={following ? 'is-on' : undefined}
              title={following ? 'You get new-release alerts for this artist · click to stop' : 'Get new-release alerts for this artist'}
              onClick={() => releasesStore.setMuted(artist.id, following)}
            >
              {following ? 'Following' : 'Follow'}
            </ActBtn>
            {off && <DownloadButton state={off} name={artist.name} onPin={() => downloadsStore.pin('artist', artist.id)} onRemove={() => downloadsStore.removeArtist(artist.id)} />}
            <MoreBtn onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
          </div>
        </div>
      </header>

      <div className="dt-cols">
        <section className="dt-section">
          <div className="hs-head">
            <h2 className="hs-title">{played ? 'Most played here' : 'Songs'}</h2>
            <span className="hs-sub">{songs.length}</span>
          </div>
          <DtList className="has-cover">
            {shown.map((t, i) => {
              const album = data.albums[t.albumId]
              const d = dl.available ? trackDownload(dl, t, dlNow) : undefined
              const c = counts.get(t.id) ?? 0
              return (
                <DtRow
                  key={t.id}
                  n={i + 1}
                  showCover
                  cover={album?.cover}
                  title={t.title}
                  sub={
                    <>
                      {album && (
                        <a href={albumHref(album.id)} draggable={false}>
                          {album.title}
                        </a>
                      )}
                      {d?.kind === 'done' && <Icon name="checkCircle" filled />}
                    </>
                  }
                  stat={played ? `${c} ${c === 1 ? 'play' : 'plays'}` : album?.year ? String(album.year) : ''}
                  current={now.id === t.id}
                  playing={now.playing}
                  duration={t.duration ? formatTime(t.duration) : '—'}
                  onPlay={() => playTrack(t.id)}
                  onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                  rowProps={trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
                />
              )
            })}
          </DtList>
          {songs.length > SONGS_COLLAPSED && (
            <button type="button" className="btn btn-secondary dt-more-btn" onClick={() => setAllSongs((v) => !v)}>
              {allSongs ? 'Show fewer' : `Show all ${songs.length}`}
            </button>
          )}
        </section>

        <div className="dt-disco">
          {groups.map((g) => (
            <section key={g.kind} className="dt-section">
              <div className="hs-head">
                <h2 className="hs-title">{cap(RELEASE_LABEL[g.kind].many)}</h2>
                <span className="hs-sub">{g.albums.length}</span>
              </div>
              <div className="dt-disco-grid">
                {g.albums.map((a) => {
                  const ai = infos.get(a.id)
                  const nt = ai?.tracks.length ?? 0
                  return <LibCard key={a.id} c={data} item={albumItem(a, [a.year, cap(RELEASE_LABEL[g.kind].one), `${nt} ${nt === 1 ? 'track' : 'tracks'}`].filter(Boolean).join(' · '))} size={170} />
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
