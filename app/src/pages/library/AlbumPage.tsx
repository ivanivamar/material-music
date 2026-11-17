/**
 * Album (Nov 2026 list redesign, canvas "Album page"): tinted wash from the cover, then the list
 * header — 220px cover, KIND · YEAR · QUALITY · GENRE, title, artist, songs · length (and "heard
 * 10:06 · 38 min left" while it plays) — and Play / Shuffle / ♥ / ⋯ with the offline switch on the
 * right (Android app).
 *
 * Desktop: the tracklist (disc heads when there's more than one; plays, heart, time) beside "About
 * this album" (released, quality, added, your plays, last played, offline) and "More by".
 * Phone: back bar, the cover over the text, full-width buttons, the tracklist, then More by.
 */
import { useMemo, type CSSProperties } from 'react'
import { Button, EmptyState, IconButton, formatTime, qualityLabel, useToast } from '../../components/ui'
import { HeartButton, LikeButton } from '../../components/LikeButton'
import { ListHero } from '../../components/list/ListHero'
import { ListSection, SongRow } from '../../components/list/SongList'
import { fmtLeft, playsLabel, usePlayCounts, useTimeLeft, type ListSong } from '../../components/list/listUtils'
import { actions, trackDrag } from '../../actions/actions'
import { rgba, sceneBackground, useArtTint } from '../../design/tint'
import { useCover } from '../../lib/covers'
import { playerStore } from '../../state/player'
import { albumGenresOf, useGenres } from '../../state/genres'
import { useLibrary, type Track } from '../../state/library'
import { artistHref, back, libraryHref } from '../../shell/routes'
import { RELEASE_LABEL, albumInfos, artistInfos, fmtAdded, fmtBytes, fmtTotal } from '../../state/views'
import { Crumbs, SectionHead } from './common'
import { trackDownload } from './DownloadButton'
import { AlbumOfflineToggle } from './OfflineToggle'
import { albumOffline, useDownloadProgress, useDownloads } from '../../state/downloads'
import { playList, useContextState } from './playback'
import { LibCard, albumItem } from './libgrid'
import { useIsPhone } from '../../state/viewport'
import { useHistory } from '../../state/history'
import { useLikedIndex } from '../../state/likes'
import { LIKED_NAME, playlistsStore } from '../../state/playlists'
import { fmtAgo } from '../../state/playlistViews'
import { ArtistDisc } from '../home/art'

function released(date?: string, year?: number): string | null {
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const d = new Date(`${date.slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return year ? String(year) : null
}

export function AlbumPage({ id }: { id: string }) {
  const { data } = useLibrary()
  const info = data ? albumInfos(data).get(id) : undefined
  const album = info?.album
  const cover = useCover(album?.cover)
  const tint = useArtTint(cover)
  const ctx = useContextState('album', id)
  const dl = useDownloads()
  const dlNow = useDownloadProgress()
  const { doc: genreDoc } = useGenres()
  const phone = useIsPhone()
  const history = useHistory()
  const counts = usePlayCounts()
  const liked = useLikedIndex()
  const toast = useToast()
  const trackIds = info?.tracks.map((t) => t.id).join('|') ?? ''
  // the last song heard from this album (any context): "Last played"
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

  const onPlay = () => {
    if (ctx.active) playerStore.toggle()
    else playList(ids, context)
  }
  const playAt = (i: number) => {
    if (ctx.active && ctx.currentId === ids[i]) playerStore.toggle()
    else playList(ids, context, { start: i })
  }

  const current = ctx.active && ctx.currentId ? ids.indexOf(ctx.currentId) : -1
  const quality = info.tracks.length > 0 ? qualityLabel('flac', { bitDepth: info.bitDepth, sampleRate: info.sampleRate }) : null
  const songs: ListSong[] = info.tracks.map((t) => ({ id: t.id, len: t.duration || 0 }))
  const totalPlays = info.tracks.reduce((s, t) => s + (counts.get(t.id) ?? 0), 0)
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
  const lastText = lastHeard ? fmtAgo(new Date(lastHeard.at * 1000).toISOString()) : null

  const art = cover ? (
    <img src={cover} alt="" style={tint && phone ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 30px 60px -24px ${rgba(tint.glow, 0.9)}` } : undefined} />
  ) : (
    <div className="hero-cover-empty" />
  )
  // desktop (design): the cover glows from under itself (a blurred copy)
  const heroArt =
    !phone && cover ? (
      <span className="al-hero-art">
        <img className="al-hero-glow" src={cover} alt="" aria-hidden />
        {art}
      </span>
    ) : (
      art
    )
  const kicker = phone ? [kind, album.year, quality].filter(Boolean).join(' · ') : [kind, album.year, genres.slice(0, 2).join(' / ') || null].filter(Boolean).join(' · ')
  const artistRec = data.artists[album.artistId]
  const stats =
    current >= 0 ? (
      <HeardLine songs={songs} current={current} count={info.tracks.length} />
    ) : (
      `${info.tracks.length} ${info.tracks.length === 1 ? 'track' : 'tracks'} · ${fmtTotal(info.seconds)}`
    )
  // desktop line (design): avatar · artist · 12 TRACKS · 47:38 · quality badge
  const heroLine = phone ? (
    <a href={artistHref(album.artistId)} className="ln">
      {album.artist}
    </a>
  ) : (
    <span className="al-line">
      {artistRec && <ArtistDisc artist={artistRec} size={28} className="al-line-av" />}
      <a href={artistHref(album.artistId)} className="ln al-line-a">
        {album.artist}
      </a>
      <span className="al-line-dot">·</span>
      <span className="al-line-stats">{stats}</span>
      {quality && <span className="al-line-q">{quality}</span>}
    </span>
  )
  // ABOUT card: plays per day from the first play (or the add date) to today, 24 bars
  const tidSet = new Set(ids)
  const albumPlays = history.plays.filter((pl) => tidSet.has(pl.trackId))
  const nowS = Math.floor(Date.now() / 1000)
  const fromS = albumPlays.length ? albumPlays[0].at : album.addedAt ? Math.floor(new Date(album.addedAt).getTime() / 1000) : nowS - 86400 * 24
  const span = Math.max(86400, nowS - fromS)
  const spark = new Array(24).fill(0) as number[]
  for (const pl of albumPlays) spark[Math.min(23, Math.floor(((pl.at - fromS) / span) * 24))]++
  const sparkMax = Math.max(1, ...spark)
  const most = info.tracks.reduce<Track | null>((m, t) => ((counts.get(t.id) ?? 0) > (m ? (counts.get(m.id) ?? 0) : 0) ? t : m), null)
  const dayLabel = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  const maxPlays = Math.max(1, ...info.tracks.map((t) => counts.get(t.id) ?? 0))
  const buttons = (
    <>
      <Button icon={ctx.playing ? 'pauseF' : 'playF'} onClick={onPlay} disabled={!ids.length}>
        {ctx.playing ? 'Pause' : ctx.active ? 'Resume' : 'Play'}
      </Button>
      {phone ? (
        <IconButton icon="shuffle" label="Shuffle" shape="square" className="lh-sq" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length} />
      ) : (
        <Button variant="secondary" icon="shuffle" onClick={() => playList(ids, context, { shuffle: true })} disabled={!ids.length}>
          Shuffle
        </Button>
      )}
      <HeartButton liked={allLiked} onToggle={likeAlbum} size="md" className="al2-like" label={allLiked ? 'Unlike album' : 'Like album'} />
      {!phone && <IconButton icon="more" label="More" shape="square" className="lh-sq" onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />}
    </>
  )

  const tracklist = (
    <section className="lp-main" aria-label="Tracklist">
      {phone ? (
        <ListSection phone label="Tracklist" right={current >= 0 ? <LeftText songs={songs} current={current} /> : `${info.tracks.length} songs`} />
      ) : (
        /* design: a column header over the rows */
        <div className={`al-thead ${dl.available ? 'has-dl' : ''}`} aria-hidden>
          <span>#</span>
          <span>Tracklist{discs.length > 1 ? ` · ${discs.length} discs` : ''}</span>
          <span>Your plays</span>
          <span />
          {dl.available && <span />}
          <span className="is-r">Time</span>
          <span />
        </div>
      )}
      {info.tracks.length === 0 ? (
        <EmptyState icon="album" title="No tracks found." body={`Drive has no files for ${album.title} right now. Run the importer again, or upload the tracks.`} />
      ) : (
        <div className={`sl sl-album ${dl.available && !phone ? 'has-dl' : ''}`} role="list">
          {discs.map((d) => (
            <div key={d.disc} role="presentation">
              {discs.length > 1 && <ListSection phone={phone} label={`Disc ${d.disc}`} right={`${d.tracks.length} songs`} />}
              {d.tracks.map((t) => {
                const i = ids.indexOf(t.id)
                const plays = counts.get(t.id) ?? 0
                const sub = variousArtists || t.artist !== album.artist ? t.artist : undefined
                return (
                  <SongRow
                    key={t.id}
                    phone={phone}
                    n={String(t.track ?? i + 1)}
                    title={t.title}
                    sub={phone ? [sub, plays ? playsLabel(plays).toLowerCase() : null].filter(Boolean).join(' · ') || undefined : sub}
                    liked={liked.ids.has(t.id)}
                    colB={
                      phone ? (
                        playsLabel(plays)
                      ) : (
                        <span className="al-plays" title={playsLabel(plays)}>
                          <span className="al-plays-bar">
                            <span style={{ width: `${(plays / maxPlays) * 100}%` }} />
                          </span>
                          <span className="al-plays-n">{plays}</span>
                        </span>
                      )
                    }
                    like={<LikeButton trackId={t.id} size="xs" hover />}
                    download={dl.available && !phone ? (trackDownload(dl, t, dlNow) ?? null) : undefined}
                    time={t.duration ? formatTime(t.duration) : '—'}
                    meta={phone && t.duration ? formatTime(t.duration) : undefined}
                    current={i === current}
                    playing={ctx.playing}
                    played={current >= 0 && i < current}
                    onPlay={() => playAt(i)}
                    onMore={(e) => actions.menu({ kind: 'track', trackId: t.id }, e)}
                    rowProps={phone ? undefined : trackDrag(() => [t.id], `${t.title} · ${t.artist}`)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )

  const moreBy = (size: number) =>
    others.length > 0 && (
      <section className="lp-sec">
        {phone ? (
          <SectionHead label={`MORE BY ${album.artist.toUpperCase()}`} right={<a className="sect-link" href={artistHref(album.artistId)}>VIEW ARTIST</a>} />
        ) : (
          <div className="al-side-k">
            <span>More by {album.artist}</span>
            <a href={artistHref(album.artistId)}>View artist</a>
          </div>
        )}
        <div className="disco-grid more-by-grid">
          {others.slice(0, phone ? 12 : 4).map((a) => (
            <LibCard key={a.id} c={data} item={albumItem(a, a.year ? String(a.year) : a.artist)} size={size} />
          ))}
        </div>
      </section>
    )

  return (
    <div className={`album-page lp ${phone ? 'is-phone' : ''}`}>
      <div className={`scene-tint ${tint ? 'is-on' : ''}`} style={tint ? ({ background: sceneBackground(tint).replace(/, #0B0B0C$/, '') } as CSSProperties) : undefined} aria-hidden />
      {phone ? (
        <div className="alp-bar">
          <IconButton icon="chevL" label="Back" onClick={() => back(libraryHref('albums'))} />
          <span className="alp-flex" />
          <IconButton icon="more" label="More" onClick={(e) => actions.menu({ kind: 'album', albumId: album.id }, e)} />
        </div>
      ) : (
        crumbs
      )}
      <ListHero
        phone={phone}
        layout="stack"
        art={heroArt}
        kicker={kicker}
        title={album.title}
        titleText={album.title}
        titleMax={104}
        className="lh-album"
        line={heroLine}
        stats={phone ? stats : undefined}
        buttons={buttons}
        aside={dl.available && !phone ? <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} /> : undefined}
      />
      {phone ? (
        <>
          {tracklist}
          {dl.available && (
            <div className="al2-offline">
              <AlbumOfflineToggle c={data} albumId={album.id} name={album.title} />
            </div>
          )}
          {moreBy(150)}
        </>
      ) : (
        <div className="lp-cols">
          {tracklist}
          <aside className="lp-side">
            <section className="al-about">
              <div className="al-side-k">
                <span>About this album</span>
              </div>
              <div className="al-about-big">
                <span className="al-about-n">{totalPlays}</span>
                <span className="al-about-s">
                  {totalPlays === 1 ? 'play' : 'plays'}
                  {most && totalPlays > 0 ? ` · most: ${most.title}` : totalPlays ? '' : ' · not played yet'}
                </span>
              </div>
              <div className="al-spark" aria-hidden>
                {spark.map((v, i) => (
                  <span key={i} className={v ? 'is-on' : ''} style={{ height: v ? `${Math.max(12, (v / sparkMax) * 100)}%` : 3 }} />
                ))}
              </div>
              <div className="al-spark-k">
                <span>{dayLabel(fromS)}</span>
                <span>Plays per day</span>
                <span>Today</span>
              </div>
              <dl className="al-facts">
                {[
                  ['Released', released(album.date, album.year)],
                  ['Quality', quality],
                  ['Added', `${fmtAdded(album.addedAt)} · ${fmtBytes(info.bytes)}`],
                  ['Last played', current < 0 ? lastText : null],
                  ['On this phone', offlineText],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="al-fact">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
            {moreBy(Math.floor((320 - 14) / 2))}
          </aside>
        </div>
      )}
    </div>
  )
}

/** "Heard 10:06 · 27 min left" while this album plays. */
function HeardLine({ songs, current, count }: { songs: ListSong[]; current: number; count: number }) {
  const total = songs.reduce((a, x) => a + x.len, 0)
  const left = useTimeLeft(songs, current)
  return (
    <>
      {count} {count === 1 ? 'track' : 'tracks'} · <span className="is-on">heard {formatTime(Math.max(0, total - left))} · {fmtLeft(left)}</span>
    </>
  )
}

function LeftText({ songs, current }: { songs: ListSong[]; current: number }) {
  return <>{fmtLeft(useTimeLeft(songs, current))}</>
}
