/**
 * Album (Material redesign, AlbumMaterial.dc.html):
 *
 *   ← Library › Albums
 *   [264 cover, album-hue glow]   Album · 2025 · Metalcore (coral)
 *                                 Tsunami Sea (57px)
 *                                 (●) Spiritbox   11 tracks · 41:18   (FLAC 16/44.1)
 *   [▶ Play] [⤮ Shuffle] ⋮                       Available offline ⏽  (✓ Opus 160 74 MB | FLAC 286 MB)
 *   ┌ 1  Fata Morgana                                              ✓   3:50  ⋮ ┐  (segmented list,
 *   │ …                                                                        │   playing row coral)
 *   More by Spiritbox ▸
 *
 * Browser: the right side shows when it was released / added and the size. Rows: click plays from
 * there (again: pause / resume), right-click / ⋮ = track menu, drag onto a sidebar playlist.
 */
import type { CSSProperties } from 'react'
import { EmptyState, formatTime, qualityLabel } from '../../components/ui'
import { actions, trackDrag } from '../../actions/actions'
import { useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { playerStore } from '../../state/player'
import { albumGenresOf, useGenres } from '../../state/genres'
import { useLibrary, type Track } from '../../state/library'
import { artistHref, libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtAdded, fmtBytes, fmtTotal } from '../../state/views'
import { trackDownload } from './DownloadButton'
import { AlbumOfflineToggle } from './OfflineToggle'
import { useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState, useNowPlaying } from './playback'
import { ActBtn, DetailBack, DetailHero, DiscHead, DtList, DtRow, MoreBtn, softDate } from './detail'
import { LibCard, albumItem } from './libgrid'
import { initials } from '../home/art'

function released(date?: string, year?: number): string {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const d = new Date(`${date.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return `Released ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  return year ? `Released ${year}` : 'In your library'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

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
  const genres = albumGenresOf(genreDoc, album).genres
  const artist = album && data ? data.artists[album.artistId] : undefined
  const artistImg = useCover(artist?.image?.id, artist?.image?.v)
  const back = <DetailBack fallback={libraryHref('albums')} parts={[{ label: 'Library', href: libraryHref('all') }, { label: 'Albums', href: libraryHref('albums') }]} />

  if (!data) return null
  if (!info || !album) {
    return (
      <div className="dt-page">
        {back}
        <div className="placeholder">
          <EmptyState icon="album" title="This album isn’t in your library." body="It may have been renamed or removed in the last import." />
        </div>
      </div>
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
  const kind = cap(RELEASE_LABEL[info.kind].one)
  const variousArtists = info.tracks.some((t) => t.artist !== album.artist)
  const n = info.tracks.length

  const onPlay = () => (ctx.active ? playerStore.toggle() : playList(ids, context))
  const playAt = (i: number) => playList(ids, context, { start: i })
  const hue = tint ? tint.hue : 40
  const hc = tint ? tint.chroma : 0

  return (
    <div className="dt-page hue-scope" style={{ '--h': hue, '--hc': hc } as CSSProperties}>
      <div className="dt-wash" aria-hidden />
      {back}

      <DetailHero
        art={cover ? <img className="dt-hero-cover" src={cover} alt="" /> : <div className="dt-hero-cover" />}
        kicker={[kind, album.year, genres.slice(0, 2).join(' / ') || null].filter(Boolean).join(' · ')}
        title={album.title}
      >
        <div className="dt-line">
          <a className="dt-artist" href={artistHref(album.artistId)}>
            <span className="dt-artist-img">{artistImg ? <img src={artistImg} alt="" /> : initials(album.artist)}</span>
            {album.artist}
          </a>
          <span className="dt-stats">
            {n} {n === 1 ? 'track' : 'tracks'} · {fmtTotal(info.seconds)}
          </span>
          {n > 0 && <span className="dt-qpill">{qualityLabel('flac', { bitDepth: info.bitDepth, sampleRate: info.sampleRate })}</span>}
        </div>
      </DetailHero>

      <div className="dt-actions">
        <ActBtn kind="filled" icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length}>
          {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
        </ActBtn>
        <ActBtn kind="tonal" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
          Shuffle
        </ActBtn>
        <MoreBtn onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />
        <span className="dt-flex" />
        {dl.available ? (
          <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} />
        ) : (
          <div className="dt-info">
            <div className="dt-info-t">{released(album.date, album.year)}</div>
            <div className="dt-info-s">
              Added {softDate(fmtAdded(album.addedAt))} · {fmtBytes(info.bytes)} FLAC
            </div>
          </div>
        )}
      </div>

      {n === 0 ? (
        <div className="dt-empty">
          <EmptyState icon="album" title="No tracks found" body={`Drive has no files for ${album.title} right now. Run the importer again, or upload the tracks.`} />
        </div>
      ) : (
        discs.map((d) => (
          <div key={d.disc}>
            {discs.length > 1 && <DiscHead label={`Disc ${d.disc}`} />}
            <DtList>
              {d.tracks.map((t) => {
                const i = ids.indexOf(t.id)
                return (
                  <DtRow
                    key={t.id}
                    n={t.track ?? i + 1}
                    title={t.title}
                    sub={variousArtists || t.artist !== album.artist ? <span className="dt-s-t">{t.artist}</span> : undefined}
                    current={now.id === t.id}
                    playing={now.playing}
                    hasDl={dl.available}
                    dl={dl.available ? (trackDownload(dl, t, dlNow) ?? { kind: 'none' }) : undefined}
                    duration={t.duration ? formatTime(t.duration) : '—'}
                    onPlay={() => playAt(i)}
                    onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                    rowProps={trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
                  />
                )
              })}
            </DtList>
          </div>
        ))
      )}

      {others.length > 0 && (
        <section className="hs dt-section">
          <div className="hs-head">
            <h2 className="hs-title">More by {album.artist}</h2>
            <span className="hs-flex" />
            <a className="hs-more" href={artistHref(album.artistId)}>
              View artist
            </a>
          </div>
          <div className="hs-row">
            {others.slice(0, 12).map((a) => (
              <LibCard key={a.id} c={data} item={albumItem(a, a.year ? `${a.year}` : a.artist)} size={168} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
