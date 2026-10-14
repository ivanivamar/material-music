/**
 * PC / browser playback engine (step 3d): one HTMLAudioElement + the Media Session API.
 *
 * Source per track, first that works:
 *   1. local FLAC from the linked folder (File System Access)            → source 'local'
 *   2. Drive stream through the service worker (range requests, seekable) → source 'drive'
 *   3. Drive whole-file download (no service worker in control)           → source 'drive'
 *
 * Tracks resolve lazily: after a reload the restored track is only resolved on the first Play
 * press, which is also the click Chrome needs to re-grant folder access.
 *
 * Android replaces this with the native ExoPlayer engine (step 6); the store API stays the same.
 */
import { loadCover } from '../lib/covers'
import { AuthError, downloadBlob } from '../lib/drive'
import { streamUrl } from '../lib/driveStream'
import { localFolder } from '../lib/localFolder'
import { isNative } from '../native/bridge'
import { libraryStore, type Album, type Track } from '../state/library'
import { playerStore, type PlaybackSource, type PlayerEngine } from '../state/player'
import { sessionStore } from '../state/session'

class NeedsAuth extends Error {}

interface Loaded {
  trackId: string
  url: string
  /** object URL we must revoke */
  owned: boolean
  source: PlaybackSource
  /** a local file failed to decode once: next try goes to Drive */
  triedLocal: boolean
}

const SEEK_STEP = 10
const MAX_SKIPS = 3

export function createHtmlAudioEngine(): PlayerEngine {
  const audio = new Audio()
  audio.preload = 'auto'

  let seq = 0 // bumps on every load; stale async work checks it
  let trackId: string | null = null
  let loaded: Loaded | null = null
  let resolving: Promise<void> | null = null
  let startAt = 0 // position to apply once metadata is in
  let wantPlay = false
  /** between load() and the new source playing: ignore the old element's pause / timeupdate */
  let switching = false
  let failures = 0
  let lastTick = 0

  const lookup = (id: string): { track?: Track; album?: Album } => {
    const data = libraryStore.get().data
    const track = data?.tracks[id]
    return { track, album: track ? data?.albums[track.albumId] : undefined }
  }
  const gesture = () => navigator.userActivation?.isActive ?? true

  /* ── Media Session ─────────────────────────────── */

  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null

  function setMetadata(id: string) {
    if (!ms) return
    const { track, album } = lookup(id)
    if (!track) return
    const meta = { title: track.title, artist: track.artist, album: album?.title ?? '' }
    ms.metadata = new MediaMetadata(meta)
    if (album?.cover) {
      void loadCover(album.cover).then((src) => {
        if (src && trackId === id) ms.metadata = new MediaMetadata({ ...meta, artwork: [{ src, sizes: '600x600', type: 'image/jpeg' }] })
      })
    }
  }

  function syncPosition() {
    if (!ms?.setPositionState) return
    const duration = Number.isFinite(audio.duration) ? audio.duration : (trackId && lookup(trackId).track?.duration) || 0
    try {
      if (duration > 0) ms.setPositionState({ duration, position: Math.min(audio.currentTime || startAt, duration), playbackRate: audio.playbackRate || 1 })
      else ms.setPositionState()
    } catch {
      /* position > duration while metadata settles */
    }
  }

  if (ms) {
    const on = (action: MediaSessionAction, fn: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        /* action not supported by this browser */
      }
    }
    on('play', () => engine.play())
    on('pause', () => engine.pause())
    on('stop', () => {
      engine.pause()
      playerStore.seek(0)
    })
    on('previoustrack', () => playerStore.prev())
    on('nexttrack', () => playerStore.next())
    on('seekto', (d) => d.seekTime != null && playerStore.seek(d.seekTime))
    on('seekbackward', (d) => playerStore.seek(Math.max(0, playerStore.get().position - (d.seekOffset ?? SEEK_STEP))))
    on('seekforward', (d) => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity
      playerStore.seek(Math.min(dur, playerStore.get().position + (d.seekOffset ?? SEEK_STEP)))
    })
  }

  /* ── source resolution ─────────────────────────── */

  function release() {
    if (loaded?.owned) URL.revokeObjectURL(loaded.url)
    loaded = null
  }

  async function resolve(id: string, my: number, allowLocal: boolean): Promise<Loaded | null> {
    const { track, album } = lookup(id)
    if (!track) return null
    // 1. linked local folder (prompting for access only inside a click)
    if (allowLocal && localFolder.get().status !== 'none' && (await localFolder.ensurePermission(gesture()))) {
      const file = await localFolder.file(track, album)
      if (my !== seq) return null
      if (file) return { trackId: id, url: URL.createObjectURL(file), owned: true, source: 'local', triedLocal: false }
    }
    // 2. / 3. Google Drive. The Android app plays the Opus copy (small, whole-file download) until
    //    the native player (step 7, phase C) streams and caches on its own.
    const file = isNative && track.mobile?.id ? track.mobile : track.flac
    if (!file?.id) throw new Error('This track has no FLAC on Drive.')
    if (!(await sessionStore.ensureToken())) throw new NeedsAuth()
    if (my !== seq) return null
    const url = await streamUrl(file.id, file.size, file === track.flac ? 'audio/flac' : 'audio/ogg')
    if (my !== seq) return null
    if (url) return { trackId: id, url, owned: false, source: 'drive', triedLocal: !allowLocal }
    try {
      const blob = await downloadBlob(file.id)
      if (my !== seq) return null
      return { trackId: id, url: URL.createObjectURL(blob), owned: true, source: 'drive', triedLocal: !allowLocal }
    } catch (e) {
      if (e instanceof AuthError) throw new NeedsAuth()
      throw e
    }
  }

  /** Resolve the current track (if needed) and start it when `wantPlay`. */
  function start(allowLocal = true): Promise<void> {
    const id = trackId
    if (!id) return Promise.resolve()
    const my = seq
    playerStore.report({ buffering: wantPlay })
    resolving = (async () => {
      try {
        const next = await resolve(id, my, allowLocal)
        if (my !== seq) {
          if (next?.owned) URL.revokeObjectURL(next.url)
          return
        }
        if (!next) {
          wantPlay = switching = false
          playerStore.report({ playing: false, buffering: false })
          playerStore.notify({ kind: 'missing', trackId: id })
          return
        }
        release()
        loaded = next
        playerStore.report({ source: next.source })
        audio.src = next.url
        audio.load()
        if (wantPlay) await playNow()
        else {
          switching = false
          playerStore.report({ buffering: false })
        }
      } catch (e) {
        if (my !== seq) return
        wantPlay = switching = false
        playerStore.report({ playing: false, buffering: false })
        if (e instanceof NeedsAuth) playerStore.notify({ kind: 'auth', trackId: id })
        else fail(id, (e as Error).message || 'Could not load the track.')
      } finally {
        if (my === seq) resolving = null
      }
    })()
    return resolving
  }

  async function playNow() {
    try {
      await audio.play()
    } catch (e) {
      const name = (e as DOMException).name
      if (name === 'AbortError') return // superseded by another load
      wantPlay = switching = false
      playerStore.report({ playing: false, buffering: false })
      // NotAllowedError: autoplay policy (e.g. restored session, no click yet) — just stay paused
    }
  }

  function fail(id: string, message: string) {
    failures++
    const skip = failures <= MAX_SKIPS && playerStore.get().index < playerStore.get().queue.length - 1
    playerStore.notify({ kind: 'error', trackId: id, message, skipped: skip })
    if (skip) {
      wantPlay = true
      playerStore.report({ playing: true })
      playerStore.next()
    }
  }

  /* ── element events ────────────────────────────── */

  audio.addEventListener('playing', () => {
    switching = false
    failures = 0
    playerStore.report({ playing: true, buffering: false })
    if (ms) ms.playbackState = 'playing'
    syncPosition()
  })
  audio.addEventListener('pause', () => {
    if (switching || !audio.paused || audio.ended) return
    wantPlay = false
    playerStore.report({ playing: false, buffering: false, position: audio.currentTime })
    if (ms) ms.playbackState = 'paused'
    syncPosition()
  })
  audio.addEventListener('waiting', () => wantPlay && playerStore.report({ buffering: true }))
  audio.addEventListener('canplay', () => !switching && playerStore.report({ buffering: false }))
  audio.addEventListener('loadedmetadata', () => {
    if (startAt > 0 && startAt < audio.duration) audio.currentTime = startAt
    startAt = 0
    syncPosition()
  })
  audio.addEventListener('timeupdate', () => {
    if (switching || startAt > 0) return
    const now = performance.now()
    if (now - lastTick < 240) return
    lastTick = now
    playerStore.report({ position: audio.currentTime })
  })
  audio.addEventListener('seeked', () => {
    playerStore.report({ position: audio.currentTime })
    syncPosition()
  })
  audio.addEventListener('ended', () => {
    playerStore.report({ position: audio.duration || playerStore.get().position })
    playerStore.ended()
    if (!playerStore.get().playing) {
      wantPlay = false // end of the queue
      if (ms) ms.playbackState = 'paused'
    }
  })
  audio.addEventListener('error', () => {
    const cur = loaded
    if (!cur || !trackId || cur.trackId !== trackId || !audio.error) return
    const err = audio.error
    const pos = audio.currentTime
    // Local file unreadable (still syncing, cloud-only placeholder…): retry from Drive once.
    if (cur.source === 'local' && !cur.triedLocal) {
      seq++
      startAt = pos
      switching = true
      void start(false)
      return
    }
    if (sessionStore.get().status === 'expired') {
      wantPlay = switching = false
      startAt = pos // resume where it stopped after signing in
      release()
      playerStore.report({ playing: false, buffering: false })
      playerStore.notify({ kind: 'auth', trackId })
      return
    }
    switching = false
    playerStore.report({ playing: false, buffering: false })
    const why =
      err.code === MediaError.MEDIA_ERR_NETWORK
        ? 'Network error while streaming.'
        : err.code === MediaError.MEDIA_ERR_DECODE
          ? 'The file couldn’t be decoded.'
          : err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
            ? 'Drive refused the stream or the format isn’t supported.'
            : 'Playback failed.'
    release()
    fail(trackId, why)
  })

  /* ── PlayerEngine ──────────────────────────────── */

  const engine: PlayerEngine = {
    load(id, { autoplay, position }) {
      // repeat-one / replay of the loaded track: no need to re-resolve
      // (unless it streams from Drive and a local folder has been linked since)
      const localLinked = !['none', 'unsupported', 'denied'].includes(localFolder.get().status)
      if (id === trackId && loaded?.trackId === id && !resolving && (loaded.source === 'local' || !localLinked)) {
        startAt = 0
        audio.currentTime = position ?? 0
        if (autoplay) engine.play()
        return
      }
      seq++
      trackId = id
      startAt = position ?? 0
      wantPlay = autoplay
      switching = true
      if (!audio.paused) audio.pause()
      release()
      playerStore.report({ playing: autoplay, buffering: autoplay, source: null })
      setMetadata(id)
      if (ms) ms.playbackState = autoplay ? 'playing' : 'paused'
      if (autoplay) void start()
      else {
        switching = false
        syncPosition()
      }
    },

    play() {
      if (!trackId) return
      wantPlay = true
      playerStore.report({ playing: true })
      if (loaded?.trackId === trackId) void playNow()
      else if (!resolving) {
        switching = true
        void start()
      }
    },

    pause() {
      wantPlay = false
      if (!audio.paused) audio.pause()
      else playerStore.report({ playing: false, buffering: false })
      if (ms) ms.playbackState = 'paused'
    },

    seek(seconds) {
      if (loaded?.trackId === trackId && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        audio.currentTime = seconds
      } else {
        startAt = seconds
        syncPosition()
      }
    },

    setVolume(volume, muted) {
      // perceptual curve: the slider is linear, loudness isn't
      audio.volume = Math.max(0, Math.min(1, volume * volume))
      audio.muted = muted
    },

    unload() {
      seq++
      trackId = null
      wantPlay = switching = false
      startAt = 0
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      release()
      if (ms) {
        ms.metadata = null
        ms.playbackState = 'none'
      }
    },
  }
  return engine
}
