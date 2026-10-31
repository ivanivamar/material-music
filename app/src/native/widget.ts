/**
 * Home screen widget (design_handoff_android_widget) — the app's side. The widget itself is native
 * (android/…/PelagicWidget.java + WidgetRenderer / WidgetArt / WidgetState): it reads the native
 * player for what's playing and handles play / pause, previous / next, a queue row and Resume by
 * itself, also with the app closed.
 *
 * Here:
 *  - setInfo: what only the app knows — the "playing from" label, shuffle (and whether it applies),
 *    the DJ's "3/7", the library size and the picks of the "nothing playing" widget
 *    (design_handoff_widget_idle: the Daily mix chip, recents = a radio, Daily mix 2, Rediscover, the
 *    last album). Sent when it changes (at most every 1.5 s).
 *  - widget taps the app performs: open (full-screen player), search (Library's field), shuffle,
 *    repeat, dj, mix:<id>, radio:<id>, album:<id>, shuffle-all. When the tap launched the app, it
 *    waits for the catalogue first.
 */
import { isNative, PelagicWidget, type WidgetInfo, type WidgetPick } from './bridge'
import { albumTrackIds, playList } from '../pages/library/playback'
import { djStore, djViewOf } from '../state/dj'
import { libraryStore, libraryStats, type Catalogue } from '../state/library'
import { findMix, mixSet, playMix, radioSet } from '../state/mixes'
import { nowPlayingStore } from '../state/nowPlaying'
import { playerStore } from '../state/player'
import { radioStore } from '../state/radio'
import { recentStore } from '../state/recent'
import { focusLibrarySearch } from '../state/search'

const DRIVE = 'https://www.googleapis.com/drive/v3/files/'
const media = (fileId: string) => `${DRIVE}${encodeURIComponent(fileId)}?alt=media`

function albumArt(c: Catalogue, albumId: string | null | undefined): string | undefined {
  const cover = albumId ? c.albums[albumId]?.cover : undefined
  return cover ? media(cover) : undefined
}

/**
 * The "nothing playing" widget's picks (design_handoff_widget_idle): the Daily mix chip (Daily mix 1)
 * and the recents list — a radio, Daily mix 2, Rediscover, the last album played (as there are, at most 4).
 */
function picks(c: Catalogue): WidgetPick[] {
  const out: WidgetPick[] = []
  const list: WidgetPick[] = []
  const set = mixSet()
  if (set) {
    const daily = set.items.filter((m) => m.kind === 'daily')
    const redis = set.items.find((m) => m.kind === 'redis')
    const radio = radioSet(0)?.items[0]
    const mixPick = (m: (typeof set.items)[number], title: string, sub: string, slot: WidgetPick['slot']): WidgetPick => ({ action: `mix:${m.id}`, title, sub, art: albumArt(c, m.coverAlbums[0]), slot })
    if (daily[0]) out.push(mixPick(daily[0], 'Daily mix', 'Made for you', 'chip'))
    if (radio) {
      const albumId = radio.albumId ?? Object.values(c.albums).find((a) => a.artistId === radio.artistId)?.id
      list.push({ action: `radio:${radio.id}`, title: radio.title, sub: 'Radio', art: albumArt(c, albumId), slot: 'list' })
    }
    if (daily[1]) list.push(mixPick(daily[1], `Daily mix ${daily[1].n ?? 2}`, 'Made for you', 'list'))
    if (redis) {
      const season = /loved in (.+)$/i.exec(redis.sub)?.[1]
      list.push(mixPick(redis, 'Rediscover', season ? `Loved in ${season}` : 'Rediscover', 'list'))
    }
  }
  const album = recentStore
    .get()
    .items.filter((r) => r.kind === 'album')
    .map((r) => c.albums[r.id])
    .find((a) => !!a)
  if (album) {
    const artist = c.artists[album.artistId]?.name
    list.push({ action: `album:${album.id}`, title: album.title, sub: artist ? `${artist} · Album` : 'Album', art: albumArt(c, album.id), slot: 'list' })
  }
  if (set) for (const m of set.items.filter((x) => x.kind === 'daily').slice(2)) if (list.length < 4) list.push({ action: `mix:${m.id}`, title: `Daily mix ${m.n ?? ''}`.trim(), sub: 'Made for you', art: albumArt(c, m.coverAlbums[0]), slot: 'list' })
  return [...out, ...list.slice(0, 4)]
}

function buildInfo(): WidgetInfo {
  const p = playerStore.get()
  const c = libraryStore.get().data
  const kind = p.context?.kind
  const dj = djViewOf(djStore.get().run, p)
  let mixesAndRadio: WidgetPick[] = []
  try {
    mixesAndRadio = c ? picks(c) : []
  } catch {
    /* mixes not ready: the widget shows Resume, DJ and Shuffle */
  }
  return {
    context: p.context?.label ?? '',
    shuffleOk: kind !== 'dj' && kind !== 'radio',
    shuffle: p.shuffle,
    djStep: dj.on && dj.songIndex >= 0 && dj.songCount > 0 ? `${dj.songIndex + 1}/${dj.songCount}` : '',
    songs: c ? libraryStats(c).tracks : 0,
    picks: mixesAndRadio,
  }
}

/** Wait (up to `ms`) until the catalogue is loaded — a tap that launched the app arrives first. */
function whenLibrary(ms = 15_000): Promise<Catalogue | null> {
  const now = libraryStore.get().data
  if (now) return Promise.resolve(now)
  return new Promise((resolve) => {
    const stop = libraryStore.subscribe(() => {
      const c = libraryStore.get().data
      if (c) {
        stop()
        window.clearTimeout(t)
        resolve(c)
      }
    })
    const t = window.setTimeout(() => {
      stop()
      resolve(null)
    }, ms)
  })
}

async function run(action: string) {
  if (action === 'open') {
    if (playerStore.get().index >= 0) nowPlayingStore.open('np')
    return
  }
  if (action === 'search') return focusLibrarySearch()
  if (action === 'shuffle') return playerStore.toggleShuffle()
  if (action === 'repeat') return playerStore.cycleRepeat()
  const c = await whenLibrary()
  if (!c) return
  if (action === 'dj') {
    void djStore.start()
  } else if (action === 'shuffle-all') {
    playList(Object.keys(c.tracks), { kind: 'library', id: 'songs', label: 'Library · Songs' }, { shuffle: true })
  } else if (action.startsWith('mix:')) {
    const m = findMix(action.slice(4))
    if (m) playMix(m)
  } else if (action.startsWith('radio:')) {
    radioStore.startById(action.slice(6))
  } else if (action.startsWith('album:')) {
    const album = c.albums[action.slice(6)]
    if (album) playList(albumTrackIds(c, album.id), { kind: 'album', id: album.id, label: album.title })
  }
}

export function initWidget() {
  if (!isNative) return
  void PelagicWidget.addListener('action', (e) => void run(e.action))

  let last = ''
  let timer = 0
  const flush = () => {
    timer = 0
    const info = buildInfo()
    const json = JSON.stringify(info)
    if (json === last) return
    last = json
    void PelagicWidget.setInfo(info).catch(() => {
      last = ''
    })
  }
  // throttled: the player store changes several times a second while playing
  const changed = () => {
    if (!timer) timer = window.setTimeout(flush, 1500)
  }
  playerStore.subscribe(changed)
  libraryStore.subscribe(changed)
  djStore.subscribe(changed)
  recentStore.subscribe(changed)
  changed()
}
