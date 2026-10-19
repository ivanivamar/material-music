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
 * Audio: a downloaded copy when there is one (phase D — the service plays the stored file for its
 * Drive URL), else the Opus copy (`track.mobile`) when the importer made one, else the FLAC, streamed
 * from Drive by ExoPlayer (seekable, starts immediately). Covers for the notification load natively too.
 */
import { isNative, PelagicPlayer, type NativePlayerState, type NativeQueueItem } from '../native/bridge'
import { downloadsStore, storedFileOf } from '../state/downloads'
import { libraryStore } from '../state/library'
import { isIntroId, playerStore, type PlayerEngine } from '../state/player'
import { djIntroInfo } from '../state/dj'
import { djVoice } from '../dj/voice'
import { onAccountReset, sessionStore } from '../state/session'

const DRIVE = 'https://www.googleapis.com/drive/v3/files/'
const media = (fileId: string) => `${DRIVE}${encodeURIComponent(fileId)}?alt=media`

/** intro item → its prepared file on the phone (filled by prepIntros before a send) */
const introFiles = new Map<string, string | null>()
let markArt: string | null = null

/** Write the DJ intros in the queue to the phone first (prepared one session ahead, so usually instant). */
async function prepIntros(queue: readonly string[]) {
  const todo = queue.filter((id) => isIntroId(id) && !introFiles.has(id))
  if (!todo.length) return
  markArt ??= await djVoice.nativeArt()
  await Promise.all(
    todo.map(async (id) => {
      const info = djIntroInfo(id)
      introFiles.set(id, info ? await djVoice.nativeFile(info.sessionId, info.line) : null)
    }),
  )
  // forget files of intros that left the queue
  for (const k of [...introFiles.keys()]) if (!queue.includes(k)) introFiles.delete(k)
}

function toItem(id: string, dj: boolean): NativeQueueItem {
  if (isIntroId(id)) {
    const info = djIntroInfo(id)
    return {
      id,
      uri: introFiles.get(id) ?? 'https://www.googleapis.com/drive/v3/files/missing?alt=media',
      title: info?.title ?? 'DJ',
      artist: `Pelagic DJ · intro${info ? ` · ${info.songs} songs` : ''}`,
      album: 'Pelagic DJ',
      artworkUri: markArt ?? undefined,
      dj: true,
      intro: true,
      volume: info?.gain ?? 0.7,
    }
  }
  const data = libraryStore.get().data
  const track = data?.tracks[id]
  const album = track ? data?.albums[track.albumId] : undefined
  // a downloaded copy (either quality) first: the native side plays it from the phone
  const stored = storedFileOf(downloadsStore.get(), track)
  const file = stored ? [track!.mobile, track!.flac].find((f) => f?.id === stored) : track?.mobile?.id ? track.mobile : track?.flac
  return {
    id,
    // a track gone from the catalogue gets a URL that fails, so the native player skips it.
    // #size: Drive sends no Content-Length; the native side needs the size to seek (KnownLengthDataSource)
    uri: media(file?.id || 'missing') + (file?.size ? `#size=${file.size}` : ''),
    title: track?.title ?? 'Unknown track',
    artist: track?.artist ?? '',
    album: album?.title ?? '',
    artworkUri: album?.cover ? media(album.cover) : undefined,
    dj: dj || undefined,
  }
}

const isStored = (trackId: string | null) => !!trackId && !!storedFileOf(downloadsStore.get(), libraryStore.get().data?.tracks[trackId])

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function createNativeEngine(): PlayerEngine {
  if (!isNative) throw new Error('createNativeEngine is for the Android app')

  /** queue + repeat the native player currently has from us (null: nothing sent yet) */
  let sentQueue: string[] | null = null
  let sentRepeat = playerStore.get().repeat
  /** a load() waiting to be flushed (wins over a plain queue sync) */
  let loadReq: { autoplay: boolean; position?: number } | null = null
  let flushQueued = false
  /**
   * After a load() (Next, Previous, cover swipe, tapping a row) the store is already on the new
   * track, but the native player keeps reporting the old one until it has processed setQueue. Those
   * late events must not count as "native moved by itself" — engineMoved() would jump the store back
   * to the old track for a beat (the cover / title flicker on swipe). Ignore events until one shows
   * the track we asked for; give up after EXPECT_MS (e.g. native skipped a broken track).
   */
  let expect: { id: string; until: number } | null = null
  const EXPECT_MS = 4000
  /**
   * The track we just left with a load(). Even after native has reported the new track, a late /
   * queued event can still carry the old one (seen on the phone: the old cover kept flashing in and
   * out after a swipe). Events naming it are dropped for LEFT_MS.
   */
  let left: { id: string; until: number } | null = null
  const LEFT_MS = 2500
  /** what native last reported (accepted events only) */
  let nativeId: string | null = null
  /**
   * "Native moved by itself" must be seen twice in a row before the store follows, so one stray
   * event can never jump the store. When it is first seen, a getState() 350 ms later confirms it
   * (native may not send another event while paused).
   */
  let candidate: { index: number; mediaId: string } | null = null
  let confirmTimer = 0

  /* ── launch: adopt what the native player is already doing ── */
  const ready: Promise<void> = PelagicPlayer.getState()
    .then((st) => {
      const s = playerStore.get()
      if (st.count > 0 && same(st.ids, s.queue) && st.index >= 0) {
        sentQueue = s.queue
        sentRepeat = s.repeat
        // keep playing where it is: don't let the restore's load() rewind it
        if (loadReq && !loadReq.autoplay) loadReq = null
        // native may have moved on while the app was closed: follow it now, not the restored track
        if (!loadReq) {
          expect = null
          if (st.index !== s.index && s.queue[st.index] === st.mediaId) playerStore.engineMoved(st.index)
        }
        apply(st)
      }
    })
    .catch(() => {})

  function flush() {
    if (flushQueued) return
    flushQueued = true
    queueMicrotask(() => {
      flushQueued = false
      void ready
        .then(() => prepIntros(playerStore.get().queue))
        .then(() => prepIntros(playerStore.get().queue)) // the queue may have grown meanwhile
        .then(send)
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
      items: s.queue.map((id) => toItem(id, s.context?.kind === 'dj')),
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
    const now = performance.now()
    if (expect) {
      if (st.mediaId === expect.id || now > expect.until) {
        expect = null
        if (left) left.until = now + LEFT_MS // the echo window starts once native is on the new track
      } else return // still the track from before our load(): stale
    }
    if (left && (now > left.until || left.id === playerStore.currentId())) left = null
    if (left && st.mediaId === left.id) return // late echo of the track we just left
    nativeId = st.mediaId ?? null
    const s = playerStore.get()
    // moved by itself (auto-advance, lock screen): follow, but only if the row really matches and
    // a second report agrees
    if (st.index >= 0 && st.index !== s.index && st.mediaId && s.queue[st.index] === st.mediaId) {
      if (candidate && candidate.index === st.index && candidate.mediaId === st.mediaId) {
        candidate = null
        window.clearTimeout(confirmTimer)
        playerStore.engineMoved(st.index)
      } else {
        candidate = { index: st.index, mediaId: st.mediaId }
        window.clearTimeout(confirmTimer)
        confirmTimer = window.setTimeout(() => void PelagicPlayer.getState().then(apply).catch(() => {}), 350)
        return
      }
    } else candidate = null
    const cur = playerStore.get()
    if (cur.queue[cur.index] !== st.mediaId) return // stale event from before a queue change
    const active = st.playWhenReady && !st.ended && !st.idle
    playerStore.report({
      playing: active,
      buffering: active && st.buffering,
      position: Math.max(0, st.positionMs / 1000),
      source: isStored(st.mediaId) ? 'local' : 'drive',
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
      const now = performance.now()
      expect = { id: _id, until: now + EXPECT_MS }
      left = nativeId && nativeId !== _id ? { id: nativeId, until: now + EXPECT_MS + LEFT_MS } : null
      candidate = null
      window.clearTimeout(confirmTimer)
      if (autoplay) playerStore.report({ playing: true, buffering: true, source: isStored(_id) ? 'local' : 'drive' })
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
