/**
 * Android playback engine (phase C): drives the native ExoPlayer (PelagicPlaybackService) through
 * the PelagicPlayer plugin. Same PlayerEngine contract as the PC engine (htmlEngine.ts).
 *
 * The native side owns playback: it holds a copy of the queue (in the store's play order — shuffle
 * is already applied by the store), advances on its own with the screen off, and serves the
 * notification / lock screen / headset controls. This engine
 *   - sends the queue when a track is loaded, and again (keeping the current track playing) when the
 *     queue is edited, shuffled or the repeat mode changes;
 *   - mirrors native state into the store: position / playing / buffering, and the queue row when
 *     the native player moved by itself (playerStore.engineMoved);
 *   - pushes the Drive token + account to native (it also renews tokens itself in the background);
 *   - on launch adopts what the native player is already doing (music kept playing while the app
 *     was closed) instead of restarting it.
 *
 * Audio: the Opus copy (`track.mobile`) when the importer made one, else the FLAC, streamed from
 * Drive by ExoPlayer (seekable, starts immediately). Covers for the notification load natively too.
 */
import { isNative, PelagicPlayer, type NativePlayerState, type NativeQueueItem } from '../native/bridge'
import { libraryStore } from '../state/library'
import { playerStore, type PlayerEngine } from '../state/player'
import { onAccountReset, sessionStore } from '../state/session'

const DRIVE = 'https://www.googleapis.com/drive/v3/files/'
const media = (fileId: string) => `${DRIVE}${encodeURIComponent(fileId)}?alt=media`

function toItem(id: string): NativeQueueItem {
  const data = libraryStore.get().data
  const track = data?.tracks[id]
  const album = track ? data?.albums[track.albumId] : undefined
  const file = track?.mobile?.id ? track.mobile : track?.flac
  return {
    id,
    // a track gone from the catalogue gets a URL that fails, so the native player skips it.
    // #size: Drive sends no Content-Length; the native side needs the size to seek (KnownLengthDataSource)
    uri: media(file?.id || 'missing') + (file?.size ? `#size=${file.size}` : ''),
    title: track?.title ?? 'Unknown track',
    artist: track?.artist ?? '',
    album: album?.title ?? '',
    artworkUri: album?.cover ? media(album.cover) : undefined,
  }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function createNativeEngine(): PlayerEngine {
  if (!isNative) throw new Error('createNativeEngine is for the Android app')

  /** queue + repeat the native player currently has from us (null: nothing sent yet) */
  let sentQueue: string[] | null = null
  let sentRepeat = playerStore.get().repeat
  /** a load() waiting to be flushed (wins over a plain queue sync) */
  let loadReq: { autoplay: boolean; position?: number } | null = null
  let flushQueued = false

  /* ── launch: adopt what the native player is already doing ── */
  const ready: Promise<void> = PelagicPlayer.getState()
    .then((st) => {
      const s = playerStore.get()
      if (st.count > 0 && same(st.ids, s.queue) && st.index >= 0) {
        sentQueue = s.queue
        sentRepeat = s.repeat
        // keep playing where it is: don't let the restore's load() rewind it
        if (loadReq && !loadReq.autoplay) loadReq = null
        apply(st)
      }
    })
    .catch(() => {})

  function flush() {
    if (flushQueued) return
    flushQueued = true
    queueMicrotask(() => {
      flushQueued = false
      void ready.then(send)
    })
  }

  function send() {
    const s = playerStore.get()
    if (s.index < 0 || !s.queue.length) {
      if (sentQueue) void PelagicPlayer.stop().catch(() => {})
      sentQueue = null
      loadReq = null
      return
    }
    const req = loadReq
    loadReq = null
    if (!req && sentQueue === s.queue && sentRepeat === s.repeat) return
    if (!req && sentQueue === s.queue) {
      sentRepeat = s.repeat
      void PelagicPlayer.setRepeat({ mode: s.repeat }).catch(() => {})
      return
    }
    sentQueue = s.queue
    sentRepeat = s.repeat
    void PelagicPlayer.setQueue({
      items: s.queue.map(toItem),
      index: s.index,
      positionMs: req ? Math.round((req.position ?? 0) * 1000) : undefined,
      play: req?.autoplay ?? false,
      // a queue edit / shuffle: rebuild around the playing track without interrupting it
      keepCurrent: !req,
      repeat: s.repeat,
    }).catch(() => playerStore.report({ playing: false, buffering: false }))
  }

  // queue edits, shuffle, repeat
  playerStore.subscribe(() => {
    const s = playerStore.get()
    if (sentQueue === null && !loadReq) return
    if (s.queue !== sentQueue || s.repeat !== sentRepeat || (s.index < 0 && sentQueue)) flush()
  })

  /* ── native → store ── */
  function apply(st: NativePlayerState) {
    if (st.count === 0) return
    const s = playerStore.get()
    // moved by itself (auto-advance, lock screen): follow, but only if the row really matches
    if (st.index >= 0 && st.index !== s.index && s.queue[st.index] === st.mediaId) playerStore.engineMoved(st.index)
    const cur = playerStore.get()
    if (cur.queue[cur.index] !== st.mediaId) return // stale event from before a queue change
    const active = st.playWhenReady && !st.ended && !st.idle
    playerStore.report({
      playing: active,
      buffering: active && st.buffering,
      position: Math.max(0, st.positionMs / 1000),
      source: 'drive',
    })
  }
  void PelagicPlayer.addListener('state', apply)

  // The service retries a 401 once and skips broken tracks (max 3 in a row) by itself; wait a moment
  // to see how that went before telling the user.
  void PelagicPlayer.addListener('error', (e) => {
    window.setTimeout(() => {
      void PelagicPlayer.getState()
        .then((st) => {
          if (st.playing && st.mediaId === e.mediaId) return // recovered (fresh token)
          const trackId = e.mediaId ?? playerStore.currentId()
          if (!trackId) return
          if (sessionStore.get().status === 'expired') return playerStore.notify({ kind: 'auth', trackId })
          playerStore.notify({ kind: 'error', trackId, message: e.message, skipped: st.mediaId !== e.mediaId && st.playWhenReady })
        })
        .catch(() => {})
    }, 1500)
  })

  // back in the foreground: catch up with whatever happened while JS was asleep
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void PelagicPlayer.getState().then(apply).catch(() => {})
  })

  /* ── auth for native Drive requests ── */
  let lastToken: string | null = null
  const pushAuth = () => {
    const info = sessionStore.tokenInfo()
    const email = sessionStore.get().account?.email ?? null
    if (!info || info.token === lastToken) return
    lastToken = info.token
    void PelagicPlayer.setAuth({ email, token: info.token, expiresAt: info.expiresAt }).catch(() => {})
  }
  pushAuth()
  sessionStore.subscribe(pushAuth)
  onAccountReset(() => {
    lastToken = null
    void PelagicPlayer.clearAuth().catch(() => {})
  })

  /* ── PlayerEngine ── */
  const engine: PlayerEngine = {
    load(_id, { autoplay, position }) {
      loadReq = { autoplay, position }
      if (autoplay) playerStore.report({ playing: true, buffering: true, source: 'drive' })
      flush()
    },
    play() {
      playerStore.report({ playing: true })
      // nothing sent yet (fresh launch): send the queue and start
      if (!sentQueue) {
        loadReq = { autoplay: true, position: playerStore.get().position }
        flush()
        return
      }
      void ready.then(() => PelagicPlayer.play()).catch(() => playerStore.report({ playing: false }))
    },
    pause() {
      playerStore.report({ playing: false, buffering: false })
      void PelagicPlayer.pause().catch(() => {})
    },
    seek(seconds) {
      void PelagicPlayer.seek({ positionMs: Math.round(seconds * 1000) }).catch(() => {})
    },
    // the phone's volume buttons control the output; the in-app volume stays at full
    setVolume() {
      void PelagicPlayer.setVolume({ volume: 1 }).catch(() => {})
    },
    unload() {
      sentQueue = null
      loadReq = null
      void PelagicPlayer.stop().catch(() => {})
    },
  }
  return engine
}
