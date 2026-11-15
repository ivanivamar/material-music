/**
 * Liked songs as the sonar mockup lists them: newest first, grouped by the month they were liked
 * ("August ——— 23 liked · 1 h 31 min"), each row with its length arc, artist, the day it was liked,
 * time and plays. Other orders (Plays, A–Z) and a search are one flat list. Windowed, since a
 * library can have thousands of hearts.
 */
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { actions, trackDrag } from '../../actions/actions'
import { SnHead, SnRow, SnSection, SnWindow, fmtHoursMin, type SnGroup, type SnWindowApi } from '../../components/sonar/SnList'
import { fmtClock } from '../../components/sonar/Sonar'
import { artistHref } from '../../shell/routes'
import type { Catalogue } from '../../state/library'
import type { PlaylistRow } from '../../state/playlistViews'
import { LIKED_ID, type Playlist } from '../../state/playlists'

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export type LikedSort = 'newest' | 'plays' | 'az'

export interface LikedListApi {
  /** scroll to the month of row `i` (index in the playlist's own order, newest first) */
  jumpToRow: (i: number) => void
}

interface Item {
  r: PlaylistRow
  /** index in the playlist's order (newest first) */
  i: number
  at: number
}

export function LikedList({
  rows,
  counts,
  nowId,
  playing,
  phone,
  sort = 'newest',
  query = '',
  onView,
  apiRef,
  onPlayIds,
}: {
  c: Catalogue
  p: Playlist
  rows: PlaylistRow[]
  counts: Map<string, number>
  nowId: string | null
  playing: boolean
  phone: boolean
  sort?: LikedSort
  query?: string
  onView?: (v: [number, number] | null) => void
  apiRef?: RefObject<LikedListApi | null>
  onPlayIds: (ids: string[], start: number) => void
}) {
  const win = useRef<SnWindowApi | null>(null)
  const items = useMemo(() => {
    let list: Item[] = rows.map((r, i) => ({ r, i, at: Date.parse(r.entry.addedAt) || 0 }))
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((x) => `${x.r.track?.title ?? x.r.entry.title} ${x.r.track?.artist ?? x.r.entry.artist}`.toLowerCase().includes(q))
    if (sort === 'newest') list = list.slice().sort((a, b) => b.at - a.at || a.i - b.i)
    if (sort === 'plays') list = list.slice().sort((a, b) => (counts.get(b.r.track?.id ?? '') ?? 0) - (counts.get(a.r.track?.id ?? '') ?? 0) || a.i - b.i)
    if (sort === 'az') list = list.slice().sort((a, b) => (a.r.track?.title ?? a.r.entry.title).localeCompare(b.r.track?.title ?? b.r.entry.title))
    return list
  }, [rows, query, sort, counts])
  const grouped = sort === 'newest' && !query.trim()
  const thisYear = new Date().getFullYear()
  const groups: SnGroup<Item>[] = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: '', items }]
    const out: SnGroup<Item>[] = []
    for (const it of items) {
      const d = new Date(it.at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const last = out.at(-1)
      if (last && last.key === key) last.items.push(it)
      else out.push({ key, label: d.getFullYear() === thisYear ? MONTH[d.getMonth()] : `${MONTH[d.getMonth()]} ${d.getFullYear()}`, items: [it] })
    }
    return out
  }, [items, grouped, thisYear])
  const max = useMemo(() => Math.max(1, ...items.map((x) => counts.get(x.r.track?.id ?? '') ?? 0)), [items, counts])
  const playable = useMemo(() => items.filter((x) => x.r.track).map((x) => x.r.track!.id), [items])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useLayoutEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      jumpToRow: (i) => {
        const k = groups.findIndex((g) => g.items.some((x) => x.i === i))
        if (k >= 0) win.current?.jump(k)
      },
    }
  })

  const today = new Date()
  const dayLabel = (at: number) => {
    const d = new Date(at)
    if (d.toDateString() === today.toDateString()) return 'TODAY'
    return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}${d.getFullYear() === thisYear ? '' : ` ${String(d.getFullYear()).slice(2)}`}`
  }

  return (
    <div className="snl snl-liked">
      {!phone && <SnHead cols={['#', null, 'Title', 'Artist', 'Liked', 'Time', 'Plays']} />}
      <SnWindow
        groups={groups}
        rowH={phone ? 56 : 48}
        headH={phone ? 40 : 44}
        apiRef={win}
        topOffset={phone ? 90 : 24}
        onView={
          onView &&
          ((a, b) => {
            const x = flat[a]
            const y = flat[b]
            onView(grouped && x ? [x.at, (y ?? x).at] : null)
          })
        }
        renderHead={(g) => {
          const secs = g.items.reduce((s, x) => s + (x.r.track?.duration ?? 0), 0)
          return <SnSection phone={phone} label={g.label} right={`${g.items.length} liked${phone ? '' : ` · ${fmtHoursMin(secs)}`}`} />
        }}
        renderRow={(x) => {
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
            <SnRow
              phone={phone}
              n={phone ? null : String(x.i + 1)}
              len={t?.duration ?? 0}
              title={t?.title ?? x.r.entry.title}
              colA={artist}
              colB={<span className="snr-mono">{dayLabel(x.at)}</span>}
              sub={artist}
              time={t?.duration ? fmtClock(t.duration) : '—'}
              meta={dayLabel(x.at)}
              plays={plays}
              maxPlays={max}
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
