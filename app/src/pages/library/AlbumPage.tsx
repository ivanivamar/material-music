/**
 * Album (handoff 04 Desktop Album): tinted wash from the cover, 264px cover, hero title,
 * artist · track count · length · quality badge, Play / Shuffle, tracklist
 * (disc headers when there's more than one), then more by the same artist.
 * Android app: "Available offline" toggle + Opus / FLAC switch for this album where the release info sits on PC.
 * Rows: the heart (Liked songs) shows on hover, or always once liked.
 */
import type { CSSProperties } from 'react'
import { Button, EmptyState, IconButton, QualityBadge, TrackRow, formatTime, qualityKind, qualityLabel } from '../../components/ui'
import { LikeButton } from '../../components/LikeButton'
import { actions, trackDrag } from '../../actions/actions'
import { rgba, sceneBackground, useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { playerStore } from '../../state/player'
import { albumGenresOf, useGenres } from '../../state/genres'
import { useLibrary, type Track } from '../../state/library'
import { artistHref, libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtAdded, fmtBytes, fmtTotal, plural } from '../../state/views'
import { Crumbs, SectionHead } from './common'
import { trackDownload } from './DownloadButton'
import { AlbumOfflineToggle } from './OfflineToggle'
import { useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying } from './playback'
import { LibCard, albumItem } from './libgrid'
import { AlbumSonar, SonarSwitch } from './AlbumSonar'
import { fmtLeft, useSonarMode, useTimeLeft, type SonarSong } from '../../components/sonar/Sonar'
import { useIsPhone } from '../../state/viewport'
import { useMemo } from 'react'
import { useHistory } from '../../state/history'
import { useLikedIndex } from '../../state/likes'
import { LIKED_NAME, playlistsStore } from '../../state/playlists'
import { albumOffline } from '../../state/downloads'
import { fmtAgo } from '../../state/playlistViews'
import { useToast } from '../../components/ui'
import { back } from '../../shell/routes'
import { HeartButton } from '../../components/LikeButton'

function released(date?: string, year?: number): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const d = new Date(`${date.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return `Released ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return year ? `Released ${year}` : 'In your library'
}

/** Hero size steps down for long titles so they stay on ≤ 2 lines. */
const heroSize = (t: string) => (t.length <= 18 ? 80 : t.length <= 30 ? 64 : t.length <= 48 ? 52 : 40)
/** the two-column page's title column is narrower: smaller steps */
const sideSize = (t: string) => (t.length <= 14 ? 56 : t.length <= 24 ? 48 : t.length <= 40 ? 40 : 32)

export function AlbumPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const info = data ? albumInfos(data).get(id) : undefined
  const album = info?.album
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
  const ctx = useContextState('album', id)
  const now = useNowPlaying()
  const dl = useDownloads()
  const dlNow = useDownloadProgress()
  const { doc: genreDoc } = useGenres()
  const [mode, setMode] = useSonarMode('album')
  const phone = useIsPhone()
  const history = useHistory()
  const liked = useLikedIndex()
  const toast = useToast()
  const trackIds = info?.tracks.map((t) => t.id).join('|') ?? ''
  // the last song heard from this album (any context): "Last played", "Resume …"
  const lastHeard = useMemo(() => {
    const set = new Set(trackIds.split('|'))
    for (let k = history.plays.length - 1; k >= 0; k--) if (set.has(history.plays[k].trackId)) return history.plays[k]
    return null
  }, [history.plays, trackIds])
  const genres = albumGenresOf(genreDoc, album).genres
  const crumbs = <Crumbs fallback={libraryHref('albums')} parts={[<a key="l" href={libraryHref('all')}>LIBRARY</a>, <a key="a" href={libraryHref('albums')}>ALBUMS</a>]} />

  if (!data) return null
  if (!info || !album) {
    return (
      <>
        {crumbs}
        <div className="placeholder">
          <EmptyState icon="album" title="This album isn’t in your library." body="It may have been renamed or removed in the last import." />
        </div>
      </>
    )
  }

  const ids = info.tracks.map((t) => t.id)
  const discs: { disc: number; tracks: Track[] }[] = []
  for (const t of info.tracks) {
    const d = t.disc || 1
    if (discs.at(-1)?.disc !== d) discs.push({ disc: d, tracks: [] })
    discs.at(-1)!.tracks.push(t)
  }
  const context = { kind: 'album' as const, id: album.id, label: album.title }
  const others = (artistInfos(data).get(album.artistId)?.albums ?? []).filter((a) => a.id !== album.id)
  const kind = RELEASE_LABEL[info.kind].one
  const variousArtists = info.tracks.some((t) => t.artist !== album.artist)
  const size = heroSize(album.title)

  const onPlay = () => {
    if (ctx.active) playerStore.toggle()
    else playList(ids, context)
  }
  const playAt = (i: number) => {
    if (ctx.active && ctx.currentId === ids[i]) playerStore.toggle()
    else playList(ids, context, { start: i })
  }

  const current = ctx.active && ctx.currentId ? ids.indexOf(ctx.currentId) : -1
  const tint2 = tint ? ({ background: sceneBackground(tint).replace(/, #0B0B0C$/, '') } as CSSProperties) : undefined
  const quality = info.tracks.length > 0 ? qualityLabel('flac', { bitDepth: info.bitDepth, sampleRate: info.sampleRate }) : null
  const resumeIndex = lastHeard ? ids.indexOf(lastHeard.trackId) : -1
  const allLiked = ids.length > 0 && ids.every((id) => liked.ids.has(id))
  const likeAlbum = (on: boolean) => {
    let n = 0
    for (const id of ids) {
      if (on && !liked.ids.has(id)) n += playlistsStore.setLiked(id, true).length ? 1 : 0
      if (!on && liked.ids.has(id)) n += playlistsStore.setLiked(id, false, liked.entries.get(id) ?? []).length ? 1 : 0
    }
    if (n) toast.show({ icon: on ? 'heartF' : 'heart', tone: on ? 'like' : undefined, mutedIcon: !on, text: `${on ? 'Added' : 'Removed'} ${n} ${n === 1 ? 'song' : 'songs'} ${on ? 'to' : 'from'} ${LIKED_NAME}.` })
  }
  const off = dl.available ? albumOffline(dl, album.id) : null
  const offlineText = off ? (off.complete ? `All ${info.tracks.length} songs` : off.done ? `${off.done} of ${off.count} songs` : 'Not downloaded') : null
  const lastText = lastHeard ? `${softAgo(lastHeard.at)} · stopped at track ${resumeIndex + 1}` : null
  const likeBtn = <HeartButton liked={allLiked} onToggle={likeAlbum} size="md" className="al2-like" label={allLiked ? 'Unlike album' : 'Like album'} />
  const sonar = (between?: React.ReactNode) => (
    <AlbumSonar
      tracks={info.tracks}
      current={current}
      playing={ctx.playing}
      variousArtists={variousArtists}
      onPlayAt={playAt}
      onPlay={onPlay}
      onMore={(trackId, e) => actions.menu({ kind: 'track', trackId }, e)}
      cover={cover}
      resume={resumeIndex >= 0 && current < 0 ? { index: resumeIndex } : null}
      between={between}
    />
  )

  // ring view on the phone (mockup: compact header, ring, buttons, numbered list)
  if (phone && mode === 'ring' && info.tracks.length > 0) {
    return (
      <div className="album-page is-phone-ring">
        <div className={`scene-tint ${tint ? 'is-on' : ''}`} style={tint2} aria-hidden />
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('albums'))} />
          <span className="alp-flex" />
          <IconButton icon="playlist" label="Show as list" onClick={() => setMode('list')} />
          <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />
        </div>
        <div className="alp-head">
          {cover ? <img className="alp-cover" src={cover} alt="" /> : <div className="alp-cover hero-cover-empty" />}
          <div className="alp-text">
            <h1 className="alp-title">{album.title}</h1>
            <a className="alp-artist ln" href={artistHref(album.artistId)}>
              {album.artist}
            </a>
            <div className="alp-lab">{[album.year, `${info.tracks.length} songs`, `${Math.round(info.seconds / 60)} min`, quality ? quality.replace(/^FLAC /, '') : null].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        {sonar(
          <div className="alp-btns">
            <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} className="alp-play">
              {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
            </Button>
            <IconButton icon="shuffle" label="Shuffle" shape="square" className="actions-more" onClick={() => playList(ids, context, { shuffle: true })} />
            {likeBtn}
          </div>,
        )}
        {dl.available && (
          <div className="al2-offline" style={{ marginTop: 20 }}>
            <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} />
          </div>
        )}
        {others.length > 0 && (
          <section className="more-by">
            <SectionHead label={`MORE BY ${album.artist.toUpperCase()}`} right={<a className="sect-link" href={artistHref(album.artistId)}>VIEW ARTIST</a>} />
            <div className="disco-grid more-by-grid">
              {others.slice(0, 12).map((a) => (
                <LibCard key={a.id} c={data} item={albumItem(a, a.year ? String(a.year) : a.artist)} size={150} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // ring view on a wide screen: the album on the left, its ring on the right (Nov 2026 mockup)
  if (!phone && mode === 'ring' && info.tracks.length > 0) {
    return (
      <div className="album-page is-2col">
        <div className={`scene-tint ${tint ? 'is-on' : ''}`} style={tint2} aria-hidden />
        <div className="al2">
          <aside className="al2-side">
            {crumbs}
            {cover ? (
              <img
                className="al2-cover"
                src={cover}
                alt=""
                style={tint ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 30px 60px -24px ${rgba(tint.glow, 0.9)}` } : undefined}
              />
            ) : (
              <div className="al2-cover hero-cover-empty" />
            )}
            <div className="al2-head">
              <div className="hero-meta">{[kind, album.year, genres.slice(0, 2).join(' / ').toUpperCase() || null].filter(Boolean).join(' · ')}</div>
              <h1 className="al2-title" style={{ '--hs': `${sideSize(album.title)}px` } as CSSProperties} title={album.title}>
                {album.title}
              </h1>
              <a className="al2-artist ln" href={artistHref(album.artistId)}>
                {album.artist}
              </a>
            </div>
            <div className="al2-btns">
              <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} className="actions-play">
                {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
              </Button>
              <IconButton icon="shuffle" label="Shuffle" shape="square" className="actions-more" onClick={() => playList(ids, context, { shuffle: true })} />
              {likeBtn}
              <IconButton icon="more" label="More" shape="square" className="actions-more" onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />
            </div>
            <div className="al2-facts">
              <div className="al2-fact">
                <span className="al2-k">Songs</span>
                <span className="al2-v">
                  {info.tracks.length} · {fmtTotal(info.seconds)}
                </span>
              </div>
              {current >= 0 ? (
                <HeardFact tracks={info.tracks} current={current} />
              ) : (
                lastText && (
                  <div className="al2-fact">
                    <span className="al2-k">Last played</span>
                    <span className="al2-v">{lastText}</span>
                  </div>
                )
              )}
              {quality && (
                <div className="al2-fact">
                  <span className="al2-k">Quality</span>
                  <span className="al2-v">{quality}</span>
                </div>
              )}
              {offlineText ? (
                <div className="al2-fact">
                  <span className="al2-k">Offline</span>
                  <span className="al2-v">{offlineText}</span>
                </div>
              ) : (
                <div className="al2-fact">
                  <span className="al2-k">Added</span>
                  <span className="al2-v">
                    {fmtAdded(album.addedAt)} · {fmtBytes(info.bytes)}
                  </span>
                </div>
              )}
            </div>
            {dl.available && (
              <div className="al2-offline">
                <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} />
              </div>
            )}
          </aside>

          <section className="al2-main" aria-label="Tracklist">
            <div className="sn-head">
              <span className="sect-label">TRACKLIST</span>
              <span className="sect-line" />
              <SonarSwitch mode={mode} onChange={setMode} />
            </div>
            {sonar()}
          </section>
        </div>

        {others.length > 0 && (
          <section className="more-by">
            <SectionHead label={`MORE BY ${album.artist.toUpperCase()}`} right={<a className="sect-link" href={artistHref(album.artistId)}>VIEW ARTIST</a>} />
            <div className="disco-grid more-by-grid">
              {others.slice(0, 12).map((a) => (
                <LibCard key={a.id} c={data} item={albumItem(a, a.year ? String(a.year) : a.artist)} size={150} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="album-page">
      <div
        className={`scene-tint ${tint ? 'is-on' : ''}`}
        style={tint ? ({ background: sceneBackground(tint).replace(/, #0B0B0C$/, '') } as CSSProperties) : undefined}
        aria-hidden
      />
      {crumbs}

      <header className="hero">
        {cover ? (
          <img
            className="hero-cover"
            src={cover}
            alt=""
            style={tint ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 40px 80px -30px ${rgba(tint.glow, 0.9)}` } : undefined}
          />
        ) : (
          <div className="hero-cover hero-cover-empty" />
        )}
        <div className="hero-text">
          <div className="hero-meta">{[kind, album.year, genres.slice(0, 2).join(' / ').toUpperCase() || null].filter(Boolean).join(' · ')}</div>
          <h1 className="hero-title" style={{ '--hs': `${size}px` } as CSSProperties} title={album.title}>
            {album.title}
          </h1>
          <div className="hero-line">
            <a className="hero-artist ln" href={artistHref(album.artistId)}>
              {album.artist}
            </a>
            <span className="hero-dash" />
            <span className="hero-stats">
              {plural(info.tracks.length, 'TRACK')} · {fmtTotal(info.seconds)}
            </span>
            {info.tracks.length > 0 && (
              <QualityBadge kind={qualityKind('flac', info.bitDepth, info.sampleRate)}>{qualityLabel('flac', { bitDepth: info.bitDepth, sampleRate: info.sampleRate })}</QualityBadge>
            )}
          </div>
        </div>
      </header>

      <div className="actions">
        <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length} className="actions-play">
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
        </Button>
        <Button variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
          Shuffle
        </Button>
        <IconButton icon="more" label="More" shape="square" className="actions-more" onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />
        <span className="actions-spacer" />
        {dl.available ? (
          <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} />
        ) : (
          <div className="actions-info">
            <div className="actions-info-main">{released(album.date, album.year)}</div>
            <div className="actions-info-meta">
              ADDED {fmtAdded(album.addedAt)} · {fmtBytes(info.bytes)} FLAC
            </div>
          </div>
        )}
      </div>

      {info.tracks.length > 0 && (
        <div className="sn-head">
          <span className="sect-label">TRACKLIST</span>
          <span className="sect-line" />
          <SonarSwitch mode={mode} onChange={setMode} />
        </div>
      )}

      {mode === 'ring' && info.tracks.length > 0 ? (
        <AlbumSonar
          tracks={info.tracks}
          current={ctx.active && ctx.currentId ? ids.indexOf(ctx.currentId) : -1}
          playing={ctx.playing}
          variousArtists={variousArtists}
          onPlayAt={playAt}
          onPlay={onPlay}
          onMore={(trackId, e) => actions.menu({ kind: 'track', trackId }, e)}
        />
      ) : (
      <div className={`tracklist ${dl.available ? 'has-dl' : ''}`} role="table">
        <div className="tl-head" role="row">
          <span className="tl-h-n">NO</span>
          <span>TITLE</span>
          {dl.available && <span />}
          <span className="tl-h-r">TIME</span>
        </div>
        {info.tracks.length === 0 ? (
          <div className="tl-empty">
            <EmptyState icon="album" title="No tracks found." body={`Drive has no files for ${album.title} right now. Run the importer again, or upload the tracks.`} />
          </div>
        ) : (
          discs.map((d) => (
            <div key={d.disc} role="rowgroup">
              {discs.length > 1 && <div className="tl-disc">DISC {d.disc}</div>}
              {d.tracks.map((t) => {
                const i = ids.indexOf(t.id)
                return (
                  <TrackRow
                    key={t.id}
                    className="trow-album"
                    n={t.track ?? i + 1}
                    title={t.title}
                    subtitle={variousArtists || t.artist !== album.artist ? t.artist : undefined}
                    duration={t.duration ? formatTime(t.duration) : '—'}
                    playing={now.id === t.id}
                    download={dl.available ? trackDownload(dl, t, dlNow) : undefined}
                    onPlay={() => playAt(i)}
                    onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                    like={<LikeButton trackId={t.id} size="xs" hover className="trow-like" />}
                    rowProps={trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>
      )}

      {others.length > 0 && (
        <section className="more-by">
          <SectionHead label={`MORE BY ${album.artist.toUpperCase()}`} right={<a className="sect-link" href={artistHref(album.artistId)}>VIEW ARTIST</a>} />
          <div className="disco-grid more-by-grid">
            {others.slice(0, 12).map((a) => (
              <LibCard key={a.id} c={data} item={albumItem(a, a.year ? String(a.year) : a.artist)} size={150} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** "Heard 10:06 · 27 min left" while this album plays. */
function HeardFact({ tracks, current }: { tracks: Track[]; current: number }) {
  const songs: SonarSong[] = tracks.map((t) => ({ id: t.id, len: t.duration || 0, title: t.title }))
  const total = songs.reduce((a, x) => a + x.len, 0)
  const left = useTimeLeft(songs, current)
  return (
    <div className="al2-fact">
      <span className="al2-k">Heard</span>
      <span className="al2-v is-on">
        {formatTime(Math.max(0, total - left))} · {fmtLeft(left)}
      </span>
    </div>
  )
}

/** "3 days ago" from a play's Unix seconds. */
function softAgo(at: number): string {
  return fmtAgo(new Date(at * 1000).toISOString()).toLowerCase()
}
