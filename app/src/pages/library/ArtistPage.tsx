/**
 * Artist (handoff 06 Desktop Artist; rows in the Nov 2026 list style, components/list): photo (or mono monogram) in a 180px circle, hero name,
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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Button, EmptyState, IconButton, formatTime } from '../../components/ui'
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
import type { FeedItem } from '../../state/releaseViews'
import { ownedAlbumHref } from '../releases/relText'
import { ArtistAvatar, Crumbs, SectionHead } from './common'
import { DownloadButton, trackDownload } from './DownloadButton'
import { artistOffline, downloadsStore, useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying } from './playback'
import { LibCard, albumItem } from './libgrid'
import { useIsPhone } from '../../state/viewport'
import { HeroTourChip, OnTour, useTourNear } from '../concerts/OnTour'
import { useArtistLook } from '../concerts/parts'
import { ListSection, SongRow } from '../../components/list/SongList'
import { CompactBar, useCollapsingHeader } from '../../components/list/CompactBar'
import { playsLabel } from '../../components/list/listUtils'
import { useLikedIndex } from '../../state/likes'
import { radioStore } from '../../state/radio'
import { back, go } from '../../shell/routes'
import { useToast } from '../../components/ui'
import { stopPreview } from '../../state/preview'
import { ArtistGaps, ArtistPanel, FansAlsoLike, LatestRelease, type ArtistPanelState } from './ArtistExtras'
import { releasesStore as relStore } from '../../state/releases'

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
  const toast = useToast()
  const likedIx = useLikedIndex()
  const [panel, setPanel] = useState<ArtistPanelState>(null)
  const closePanel = useCallback(() => setPanel(null), [])
  // a song preview doesn't follow you off the artist page
  useEffect(() => () => stopPreview(), [])
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
  // scrolling collapses the header into a compact bar (components/list/CompactBar.tsx)
  const heroRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const heroParts = phone ? { art: ':scope > :first-child', text: '.alp-text', title: '.alp-title' } : { art: '.hero-avatar', text: '.hero-text', title: '.hero-title' }
  useCollapsingHeader(heroRef, barRef, heroParts, [phone, id, !!artist])
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

  const totalPlays = inOrder.reduce((s, t) => s + (counts.get(t.id) ?? 0), 0)
  const radio = () => {
    if (!radioStore.start({ type: 'artist', id: artist.id })) toast.show({ icon: 'radio', mutedIcon: true, text: 'Nothing to play for this radio right now.' })
  }
  const playBtn = (
    <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length} className={phone ? 'alp-play' : undefined}>
      {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
    </Button>
  )
  const followBtn = (
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
  )
  const radioBtn = (
    <Button variant="secondary" icon="radio" onClick={radio}>
      Radio
    </Button>
  )

  const songList = (
    <section className={`artist-songs lp-sec ${dl.available ? 'has-dl' : ''}`}>
      {phone ? (
        <ListSection phone label={played ? 'Most played here' : 'Songs'} right={`${songs.length} songs`} />
      ) : (
        <SectionHead label={played ? 'MOST PLAYED HERE' : 'SONGS'} right={plural(songs.length, 'TRACK')} />
      )}
      <div className={`sl sl-artist ${dl.available && !phone ? 'has-dl' : ''}`} role="list">
        {shown.map((t, i) => {
          const album = data.albums[t.albumId]
          const c = counts.get(t.id) ?? 0
          return (
            <SongRow
              key={t.id}
              phone={phone}
              n={String(i + 1)}
              title={t.title}
              sub={phone ? [album?.title, played ? playsLabel(c).toLowerCase() : null].filter(Boolean).join(' · ') : album?.title}
              liked={likedIx.ids.has(t.id)}
              colB={played ? playsLabel(c) : String(album?.year ?? '')}
              like={<LikeButton trackId={t.id} size="xs" hover />}
              download={dl.available && !phone ? (trackDownload(dl, t, dlNow) ?? null) : undefined}
              time={t.duration ? formatTime(t.duration) : '—'}
              current={now.id === t.id}
              playing={now.playing}
              onPlay={() => playAt(t.id)}
              onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
              rowProps={phone ? undefined : trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
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
  )
  const disco = groups.map((g, gi) => (
    <section key={g.kind} className="disco-group">
      <SectionHead label={RELEASE_LABEL[g.kind].many} right={String(gi + 1).padStart(2, '0')} />
      <div className="disco-grid">
        {g.albums.map((a) => (
          <LibCard key={a.id} c={data} item={albumItem(a, [a.year, plural(infos.get(a.id)?.tracks.length ?? 0, 'TRACK')].filter(Boolean).join(' · '))} size={150} />
        ))}
      </div>
    </section>
  ))

  // in the library → its album; else the release panel
  const openRel = (it: FeedItem) => {
    if (it.status === 'new' || it.mark === 'new') relStore.mark(it.rel.id, 'seen')
    const lib = ownedAlbumHref(it)
    if (lib) go(lib)
    else setPanel({ kind: 'rel', id: it.rel.id })
  }
  const latest = <LatestRelease c={data} artistId={artist.id} phone={phone} onOpen={openRel} />
  const gaps = <ArtistGaps c={data} artist={artist} phone={phone} />
  const fans = <FansAlsoLike c={data} artist={artist} phone={phone} onOpen={(cand) => setPanel({ kind: 'dz', cand })} />
  const panelEl = <ArtistPanel c={data} artist={artist} phone={phone} panel={panel} onClose={closePanel} />

  if (phone)
    return (
      <div className="artist-page lp is-phone">
        {bg && <div className={`artist-banner ${blurred ? 'is-blurred' : ''}`} style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('artists'))} />
          <span className="alp-flex" />
          <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
        </div>
        <CompactBar barRef={barRef} art={<ArtistAvatar artist={artist} size={32} lazy={false} />} title={artist.name} round />
        <div ref={heroRef as RefObject<HTMLDivElement | null>} className="alp-head">
          <ArtistAvatar artist={artist} size={64} lazy={false} />
          <div className="alp-text">
            <h1 className="alp-title" style={{ fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {artist.name}
            </h1>
            <div className="alp-lab">
              {cnt(info.albums.length, 'release')} · {cnt(info.tracks, 'song')} · {cnt(totalPlays, 'play')}
              {off && off.done ? ` · ${off.done} offline` : ''}
            </div>
          </div>
        </div>
        <div className="lh-btns is-phone">
          {playBtn}
          {radioBtn}
          {followBtn}
        </div>
        {tourNear && (
          <div className="hero-tour">
            <HeroTourChip show={tourNear} />
          </div>
        )}
        {latest}
        <OnTour artistId={artist.id} H={tourHue} />
        {songList}
        {gaps}
        {fans}
        {off && <DownloadButton state={off} name={artist.name} onPin={() => downloadsStore.pin('artist', artist.id)} onRemove={() => downloadsStore.removeArtist(artist.id)} />}
        <div className="artist-disco">{disco}</div>
        {panelEl}
      </div>
    )

  return (
    <div className="artist-page">
      {bg && <div className={`artist-banner ${blurred ? 'is-blurred' : ''}`} style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
      {crumbs}

      <CompactBar barRef={barRef} art={<ArtistAvatar artist={artist} size={36} lazy={false} />} title={artist.name} round />
      <header ref={heroRef} className="hero hero-artist">
        <ArtistAvatar artist={artist} size={180} lazy={false} className="hero-avatar" />
        <div className="hero-text">
          <div className="hero-meta">{meta}</div>
          <h1 className="hero-title" style={{ '--hs': `${heroSize(artist.name)}px` } as CSSProperties} title={artist.name}>
            {artist.name}
          </h1>
          <div className="hero-stats">
            {plural(info.albums.length, 'RELEASE')} · {plural(info.tracks, 'TRACK')} · {fmtTotal(info.seconds)}
            {totalPlays ? ` · ${plural(totalPlays, 'PLAY')}` : ''}
            {off && off.done ? ` · ${off.done} OFFLINE` : ''}
          </div>
          {tourNear && (
            <div className="hero-tour">
              <HeroTourChip show={tourNear} />
            </div>
          )}
        </div>
      </header>
      <div className="lh-btns artist-btns">
        {playBtn}
        <Button variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
          Shuffle
        </Button>
        {radioBtn}
        {followBtn}
        {off && <DownloadButton state={off} name={artist.name} onPin={() => downloadsStore.pin('artist', artist.id)} onRemove={() => downloadsStore.removeArtist(artist.id)} />}
        <IconButton icon="more" label="More" shape="square" className="actions-more" onClick={(e) => actions.menu({ kind: 'artist', artistId: artist.id }, e)} />
      </div>

      <div className="artist-cols">
        <div className="artist-left">
          {songList}
          {gaps}
        </div>
        <div className="artist-disco">
          {latest}
          <OnTour artistId={artist.id} H={tourHue} />
          {disco}
        </div>
      </div>
      {fans}
      {panelEl}
    </div>
  )
}
