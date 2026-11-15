/**
 * Liked songs (Nov 2026 list redesign): one flat list, no month heads — newest first by default,
 * or by plays / A–Z, filtered by the search. Each row: cover, title / artist, the day it was liked,
 * plays, the heart, time. Windowed, since a library can have thousands of hearts.
 */
import { useMemo } from 'react'
import { actions, trackDrag } from '../../actions/actions'
import { LikeButton } from '../../components/LikeButton'
import { ListHead, ListWindow, RowCover, SongRow, type ListGroup } from '../../components/list/SongList'
import { fmtClock, playsLabel } from '../../components/list/listUtils'
import { artistHref } from '../../shell/routes'
import type { Catalogue } from '../../state/library'
import type { PlaylistRow } from '../../state/playlistViews'
import { LIKED_ID } from '../../state/playlists'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type LikedSort = 'newest' | 'plays' | 'az'

interface Item {
  r: PlaylistRow
  /** index in the playlist's order (newest first) */
  i: number
  at: number
}

export function LikedList({
  c,
  rows,
  counts,
  nowId,
  playing,
  phone,
  sort = 'newest',
  query = '',
  onPlayIds,
}: {
  c: Catalogue
  rows: PlaylistRow[]
  counts: Map<string, number>
  nowId: string | null
  playing: boolean
  phone: boolean
  sort?: LikedSort
  query?: string
  onPlayIds: (ids: string[], start: number) => void
}) {
  const items = useMemo(() => {
    let list: Item[] = rows.map((r, i) => ({ r, i, at: Date.parse(r.entry.addedAt) || 0 }))
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((x) => `${x.r.track?.title ?? x.r.entry.title} ${x.r.track?.artist ?? x.r.entry.artist}`.toLowerCase().includes(q))
    if (sort === 'newest') list = list.slice().sort((a, b) => b.at - a.at || a.i - b.i)
    if (sort === 'plays') list = list.slice().sort((a, b) => (counts.get(b.r.track?.id ?? '') ?? 0) - (counts.get(a.r.track?.id ?? '') ?? 0) || a.i - b.i)
    if (sort === 'az') list = list.slice().sort((a, b) => (a.r.track?.title ?? a.r.entry.title).localeCompare(b.r.track?.title ?? b.r.entry.title))
    return list
  }, [rows, query, sort, counts])
  const groups: ListGroup<Item>[] = useMemo(() => [{ key: 'all', label: '', items }], [items])
  const playable = useMemo(() => items.filter((x) => x.r.track).map((x) => x.r.track!.id), [items])

  const thisYear = new Date().getFullYear()
  const today = new Date().toDateString()
  const dayLabel = (at: number) => {
    const d = new Date(at)
    if (d.toDateString() === today) return 'today'
    return `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === thisYear ? '' : ` ${d.getFullYear()}`}`
  }

  return (
    <div className="sl sl-liked">
      {!phone && <ListHead cols={['#', null, 'Title', 'Liked', 'Plays', null, 'Time', null]} />}
      <ListWindow
        groups={groups}
        rowH={phone ? 64 : 56}
        headH={0}
        topOffset={phone ? 90 : 24}
        renderHead={() => null}
        renderRow={(x, k) => {
          const t = x.r.track
          const plays = t ? (counts.get(t.id) ?? 0) : 0
          const artist = t ? (
            <a href={artistHref(t.artistId)} draggable={false}>
              {t.artist}
            </a>
          ) : (
            x.r.entry.artist
          )
          return (
            <SongRow
              phone={phone}
              n={String(k + 1)}
              art={<RowCover fileId={t ? c.albums[t.albumId]?.cover : null} />}
              title={t?.title ?? x.r.entry.title}
              sub={
                phone ? (
                  <>
                    {artist} · liked {dayLabel(x.at)}
                  </>
                ) : (
                  artist
                )
              }
              colA={`Liked ${dayLabel(x.at)}`}
              colB={playsLabel(plays)}
              like={t ? <LikeButton trackId={t.id} size="xs" /> : null}
              time={t?.duration ? fmtClock(t.duration) : '—'}
              current={!!t && t.id === nowId}
              playing={playing}
              dim={!t}
              onPlay={t ? () => onPlayIds(playable, Math.max(0, playable.indexOf(t.id))) : undefined}
              onMore={t ? (e) => actions.menu({ kind: 'track', trackId: t.id, playlistId: LIKED_ID, entryId: x.r.entry.entryId }, e) : undefined}
              rowProps={t && !phone ? (trackDrag(() => [t.id], `${t.title} · ${t.artist}`) as never) : undefined}
            />
          )
        }}
      />
    </div>
  )
}
