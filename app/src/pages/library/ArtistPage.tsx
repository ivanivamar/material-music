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
import { ArtistRing, TopPlayed, type RingAlbum } from '../../components/sonar/ArtistRing'
import { radioStore } from '../../state/radio'
import { albumHref, back } from '../../shell/routes'
import { shortDate } from '../../state/concertViews'
import { useToast } from '../../components/ui'
import { useSonarMode, useWidth } from '../../components/sonar/Sonar'
import { SonarSwitch } from './AlbumSonar'

const ORDER: ReleaseKind[] = ['album', 'ep', 'single', 'live']
const SONGS_COLLAPSED = 10
/** "3 releases" (plural() upper-cases its suffix for the mono labels) */
const cnt = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const heroSize = (t: string) => (t.length <= 16 ? 84 : t.length <= 26 ? 64 : t.length <= 40 ? 52 : 40)

export function ArtistPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const now = useNowPlaying()
  const ctx = useContextState('artist', id)
  const [allSongs, setAllSongs] = useState(false)
  const [mode, setMode] = useSonarMode('artist')
  const toast = useToast()
  const [ringRef, ringW] = useWidth<HTMLDivElement>()
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

  const ringAlbums: RingAlbum[] = info.albums
    .slice()
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
    .map((a) => {
      const k = infos.get(a.id)?.kind
      return { id: a.id, title: a.title, year: a.year, kind: k ? RELEASE_LABEL[k].one.toLowerCase() : undefined, href: albumHref(a.id), tracks: (infos.get(a.id)?.tracks ?? []).map((t) => ({ id: t.id, title: t.title, len: t.duration || 0 })) }
    })
  const totalPlays = inOrder.reduce((s, t) => s + (counts.get(t.id) ?? 0), 0)
  const playedHours = Math.round(inOrder.reduce((s, t) => s + (counts.get(t.id) ?? 0) * (t.duration ?? 0), 0) / 3600)
  const top1 = played ? songs[0] : null
  const since = info.albums.reduce((m, a) => (a.year && a.year < m ? a.year : m), 9999)
  const radio = () => {
    if (!radioStore.start({ type: 'artist', id: artist.id })) toast.show({ icon: 'radio', mutedIcon: true, text: 'Nothing to play for this radio right now.' })
  }
  const playBtn = (cls?: string) => (
    <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length} className={cls}>
      {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
    </Button>
  )
  const followBtn = (
    <Button
      variant="secondary"
      className={`hero-follow ${following ? 'is-on' : ''}`}
      aria-pressed={following}
      title={following ? 'You get new-release alerts for this artist · click to stop' : 'Get new-release alerts for this artist'}
      onClick={() => releasesStore.setMuted(artist.id, following)}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
  const radioBtn = (
    <Button variant="secondary" onClick={radio}>
      Radio
    </Button>
  )
  const disco = (
    <div className="ar2-disco">
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
  )

  if (mode === 'ring' && inOrder.length > 0 && phone)
    return (
      <div className="artist-page is-phone-ring">
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('artists'))} />
          <span className="alp-flex" />
          <IconButton icon="playlist" label="Show as list" onClick={() => setMode('list')} />
          <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
        </div>
        <div className="alp-head">
          <ArtistAvatar artist={artist} size={64} lazy={false} />
          <div className="alp-text">
            <h1 className="alp-title" style={{ fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {artist.name}
            </h1>
            <div className="alp-lab">
              {cnt(info.albums.length, 'release')} · {cnt(info.tracks, 'song')} · {cnt(totalPlays, 'play')}
            </div>
          </div>
        </div>
        <div className="alp-btns" style={{ marginTop: 16 }}>
          {playBtn('alp-play')}
          {radioBtn}
          {followBtn}
        </div>
        <div ref={ringRef} className="ar2-pring">
          {ringW > 0 && <ArtistRing albums={ringAlbums} counts={counts} nowId={now.id} playing={now.playing} width={ringW} height={Math.round(ringW * 0.94)} onPlay={playAt} phone idle={`${cnt(info.albums.length, 'release')} · ${cnt(totalPlays, 'play')}`} />}
        </div>
        <TopPlayed albums={ringAlbums} counts={counts} nowId={now.id} onPlay={playAt} />
        <OnTour artistId={artist.id} H={tourHue} />
        {disco}
      </div>
    )

  if (mode === 'ring' && inOrder.length > 0)
    return (
      <div className="artist-page is-2col">
        {bg && <div className={`artist-banner ${blurred ? 'is-blurred' : ''}`} style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
        <div className="ar2">
          <aside className="al2-side ar2-side">
            {crumbs}
            <ArtistAvatar artist={artist} size={180} lazy={false} className="hero-avatar" />
            <div className="al2-head">
              <div className="hero-meta">{['ARTIST', since < 9999 ? `SINCE ${since}` : null, ...artistGenresOf(genreDoc, data, artist.id).genres.slice(0, 1).map((g) => g.toUpperCase())].filter(Boolean).join(' · ')}</div>
              <h1 className="al2-title" style={{ '--hs': `${artist.name.length <= 14 ? 60 : artist.name.length <= 24 ? 48 : 38}px` } as CSSProperties} title={artist.name}>
                {artist.name}
              </h1>
            </div>
            <div className="al2-btns">
              {playBtn('actions-play')}
              {radioBtn}
              {followBtn}
              <IconButton icon="more" label="More" shape="square" className="actions-more" onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
            </div>
            <div className="al2-facts">
              <div className="al2-fact">
                <span className="al2-k">In your library</span>
                <span className="al2-v">
                  {cnt(info.albums.length, 'release')} · {cnt(info.tracks, 'song')}
                </span>
              </div>
              <div className="al2-fact">
                <span className="al2-k">Your plays</span>
                <span className="al2-v is-on">
                  {totalPlays} · {playedHours} h
                </span>
              </div>
              {top1 && (
                <div className="al2-fact">
                  <span className="al2-k">Most played</span>
                  <span className="al2-v">
                    {top1.title} · {counts.get(top1.id) ?? 0}
                  </span>
                </div>
              )}
              {tourNear && (
                <div className="al2-fact">
                  <span className="al2-k">On tour</span>
                  <span className="al2-v">
                    {tourNear.city} · {shortDate(tourNear.date)}
                  </span>
                </div>
              )}
              {off && off.done > 0 && (
                <div className="al2-fact">
                  <span className="al2-k">Offline</span>
                  <span className="al2-v">{off.done} songs</span>
                </div>
              )}
            </div>
            {off && <DownloadButton state={off} name={artist.name} onPin={() => downloadsStore.pin('artist', artist.id)} onRemove={() => downloadsStore.removeArtist(artist.id)} />}
          </aside>
          <section className="al2-main" aria-label="Discography and your plays">
            <div className="sn-head">
              <span className="sect-label">DISCOGRAPHY · YOUR PLAYS</span>
              <span className="sect-line" />
              <span className="sect-right">CLOSER TO THE RING = PLAYED MORE</span>
              <SonarSwitch mode={mode} onChange={setMode} />
            </div>
            <div ref={ringRef} className="ar2-ring">
              {ringW > 0 && <ArtistRing albums={ringAlbums} counts={counts} nowId={now.id} playing={now.playing} width={ringW} height={Math.min(700, Math.round(ringW * 0.96))} onPlay={playAt} idle={`${cnt(info.albums.length, 'release')} · ${cnt(totalPlays, 'play')}`} />}
            </div>
          </section>
        </div>
        <OnTour artistId={artist.id} H={tourHue} />
        {disco}
      </div>
    )

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
          <div className="sn-head">
            <span className="sect-label">{played ? 'MOST PLAYED HERE' : 'SONGS'}</span>
            <span className="sect-line" />
            <span className="sect-right">{plural(songs.length, 'TRACK')}</span>
            {inOrder.length > 0 && <SonarSwitch mode={mode} onChange={setMode} />}
          </div>
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
