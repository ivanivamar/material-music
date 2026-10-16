/**
 * Album (handoff 04 Desktop Album): tinted wash from the cover, 264px cover, hero title,
 * artist · track count · length · quality badge, Play / Shuffle, tracklist
 * (disc headers when there's more than one), then more by the same artist.
 * Android app: "Available offline" toggle + Opus / FLAC switch for this album where the release info sits on PC.
 */
import type { CSSProperties } from 'react'
import { Button, EmptyState, IconButton, QualityBadge, TrackRow, qualityKind, qualityLabel } from '../../components/ui'
import { actions, trackDrag } from '../../actions/actions'
import { rgba, sceneBackground, useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { playerStore } from '../../state/player'
import { albumGenresOf, useGenres } from '../../state/genres'
import { useLibrary, type Track } from '../../state/library'
import { artistHref, libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtAdded, fmtBytes, fmtTotal, plural } from '../../state/views'
import { formatTime } from '../../components/ui'
import { Crumbs, LibAlbumCard, SectionHead } from './common'
import { trackDownload } from './DownloadButton'
import { AlbumOfflineToggle } from './OfflineToggle'
import { useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying, usePlayingAlbumId } from './playback'
import './library.css'

/** Hero size steps down for long titles so they stay on ≤ 2 lines. */
function released(date?: string, year?: number): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const d = new Date(`${date.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return `Released ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return year ? `Released ${year}` : 'In your library'
}

const heroSize = (t: string) => (t.length <= 18 ? 80 : t.length <= 30 ? 64 : t.length <= 48 ? 52 : 40)

export function AlbumPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const info = data ? albumInfos(data).get(id) : undefined
  const album = info?.album
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
  const ctx = useContextState('album', id)
  const now = useNowPlaying()
  const playingAlbum = usePlayingAlbumId(data)
  const dl = useDownloads()
  const dlNow = useDownloadProgress()
  const { doc: genreDoc } = useGenres()
  const genres = albumGenresOf(genreDoc, album).genres

  if (!data) return null
  if (!info || !album) {
    return (
      <>
        <Crumbs fallback={libraryHref('albums')} parts={['LIBRARY', 'ALBUMS']} />
        <div className="placeholder">
          <EmptyState icon="library" title="This album isn’t in your library." body="It may have been renamed or removed in the last import." />
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

  return (
    <div className="album-page">
      <div
        className={`scene-tint ${tint ? 'is-on' : ''}`}
        style={tint ? ({ background: sceneBackground(tint).replace(/, #0B0B0C$/, '') } as CSSProperties) : undefined}
        aria-hidden
      />
      <Crumbs fallback={libraryHref('albums')} parts={[<a key="l" href={libraryHref('albums')}>LIBRARY</a>, <a key="a" href={libraryHref('albums')}>ALBUMS</a>]} />

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

      <div className={`tracklist ${dl.available ? 'has-dl' : ''}`} role="table">
        <div className="tl-head" role="row">
          <span className="tl-h-n">NO</span>
          <span>TITLE</span>
          {dl.available && <span />}
          <span className="tl-h-r">TIME</span>
        </div>
        {discs.map((d) => (
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
                  rowProps={trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
                />
              )
            })}
          </div>
        ))}
      </div>

      {others.length > 0 && (
        <section className="more-by">
          <SectionHead label={`MORE BY ${album.artist.toUpperCase()}`} right={<a className="sect-link" href={artistHref(album.artistId)}>VIEW ARTIST</a>} />
          <div className="lib-grid lib-grid-sm">
            {others.slice(0, 12).map((a) => (
              <LibAlbumCard key={a.id} c={data} album={a} subtitle={a.year ? String(a.year) : a.artist} playingAlbumId={playingAlbum} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
