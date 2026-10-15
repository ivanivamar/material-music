/**
 * PC / browser playback engine (step 3d): HTMLAudioElements + the Media Session API.
 *
 * Source per track, first that works:
 *   1. local FLAC from the linked folder (File System Access)            → source 'local'
 *   2. Drive stream through the service worker (range requests, seekable) → source 'drive'
 *   3. Drive whole-file download (no service worker in control)           → source 'drive'
 *
 * Tracks resolve lazily: after a reload the restored track is only resolved on the first Play
 * press, which is also the click Chrome needs to re-grant folder access.
 *
 * Gapless / preload: two "decks". The active `<audio>` plays; a spare one resolves and buffers
 * the next queue track a couple of seconds after the current one starts. A few tens of
 * milliseconds before the active element ends (`lead`, learned from how long `play()` really
 * takes) the spare starts and becomes the active deck, and the store is told the track
 * advanced. FLAC has no encoder padding, so the only gap left is scheduling jitter. Skipping
 * to the preloaded track by hand also takes it over instantly. If the spare isn't ready in
 * time, the old path (natural `ended` → load) still works.
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
/** wait this long after a track starts before preloading the next one (fast skipping stays cheap) */
const PRELOAD_DELAY = 2500
/** starting guess for how early the spare must be told to play (seconds) */
const DEFAULT_LEAD = 0.06

export function createHtmlAudioEngine(): PlayerEngine {
  let volume = 1
  let muted = false
  const all = new Set<HTMLAudioElement>()
  /** cleaned elements ready for reuse */
  const idle: HTMLAudioElement[] = []

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

  /* spare deck (next track) */
  let spare: HTMLAudioElement | null = null
  let spareLoaded: Loaded | null = null
  /** track the spare is (being) prepared for; set while it resolves, before `spare` exists */
  let spareId: string | null = null
  let spareReady = false
  let wantedNext: string | null = null
  /** next track whose preload failed: not retried until the wanted track changes */
  let failedNext: string | null = null
  let pseq = 0 // bumps whenever the spare is dropped; stale preload work checks it
  let preloadTimer = 0
  let swapTimer = 0
  /** set while the store is told a gapless swap happened, so its load() call is a no-op */
  let swappedId: string | null = null
  let lead = DEFAULT_LEAD
  let playCalledAt = 0

  const lookup = (id: string): { track?: Track; album?: Album } => {
    const data = libraryStore.get().data
    const track = data?.tracks[id]
    return { track, album: track ? data?.albums[track.albumId] : undefined }
  }
  const gesture = () => navigator.userActivation?.isActive ?? true

  function makeAudio(): HTMLAudioElement {
    const a = new Audio()
    a.preload = 'auto'
    a.volume = volume
    a.muted = muted
    all.add(a)
    bind(a)
    return a
  }
  let audio = makeAudio()

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

  /** Empty an element and free what it held. */
  function clean(el: HTMLAudioElement, l: Loaded | null) {
    el.pause()
    el.removeAttribute('src')
    el.load()
    if (l?.owned) URL.revokeObjectURL(l.url)
  }

  /**
   * @param prompt  may ask for folder access (only true inside a user click); a preload never prompts
   */
  async function resolve(id: string, stale: () => boolean, allowLocal: boolean, prompt: boolean): Promise<Loaded | null> {
    const { track, album } = lookup(id)
    if (!track) return null
    // 1. linked local folder (prompting for access only inside a click)
    if (allowLocal && localFolder.get().status !== 'none' && (await localFolder.ensurePermission(prompt && gesture()))) {
      const file = await localFolder.file(track, album)
      if (stale()) return null
      if (file) return { trackId: id, url: URL.createObjectURL(file), owned: true, source: 'local', triedLocal: false }
    }
    // 2. / 3. Google Drive. The Android app plays the Opus copy (small, whole-file download) until
    //    the native player (step 7, phase C) streams and caches on its own.
    const file = isNative && track.mobile?.id ? track.mobile : track.flac
    if (!file?.id) throw new Error('This track has no FLAC on Drive.')
    if (!(await sessionStore.ensureToken())) throw new NeedsAuth()
    if (stale()) return null
    const url = await streamUrl(file.id, file.size, file === track.flac ? 'audio/flac' : 'audio/ogg')
    if (stale()) return null
    if (url) return { trackId: id, url, owned: false, source: 'drive', triedLocal: !allowLocal }
    try {
      const blob = await downloadBlob(file.id)
      if (stale()) return null
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
        const next = await resolve(id, () => my !== seq, allowLocal, true)
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

  /* ── spare deck: preload + gapless hand-over ───── */

  function dropSpare() {
    pseq++
    window.clearTimeout(preloadTimer)
    window.clearTimeout(swapTimer)
    if (spare) {
      clean(spare, spareLoaded)
      idle.push(spare)
    }
    spare = null
    spareLoaded = null
    spareId = null
    spareReady = false
  }

  function schedulePreload() {
    window.clearTimeout(preloadTimer)
    if (!wantedNext || wantedNext === spareId || wantedNext === failedNext) return
    preloadTimer = window.setTimeout(() => void runPreload(), PRELOAD_DELAY)
  }

  async function runPreload() {
    const id = wantedNext
    // the current track must be up and running first; 'playing' schedules this again
    if (!id || id === spareId || !loaded || loaded.trackId !== trackId) return
    const my = ++pseq
    const stale = () => my !== pseq
    spareId = id
    try {
      const next = await resolve(id, stale, true, false)
      if (stale()) {
        if (next?.owned) URL.revokeObjectURL(next.url)
        return
      }
      if (!next) {
        spareId = null
        failedNext = id
        return
      }
      const el = idle.pop() ?? makeAudio()
      spare = el
      spareLoaded = next
      spareReady = false
      el.src = next.url
      el.load()
    } catch {
      if (!stale()) {
        spareId = null
        failedNext = id
      }
    }
  }

  /** Re-arm the timer that hands over to the spare shortly before the active track ends. */
  function armSwap() {
    window.clearTimeout(swapTimer)
    if (!spare || !spareReady || audio.paused || switching) return
    const remaining = audio.duration - audio.currentTime
    if (!Number.isFinite(remaining) || audio.duration <= 0) return
    const wait = (remaining - lead) * 1000
    if (wait > 2000) return // the next timeupdate (4 Hz) re-arms
    swapTimer = window.setTimeout(fireSwap, Math.max(0, wait))
  }

  function fireSwap() {
    if (!spare || !spareLoaded || !spareReady || audio.paused || switching) return
    if (playerStore.nextId() !== spareId) return // queue changed; preload() is about to replace the spare
    const remaining = audio.duration - audio.currentTime
    if (remaining - lead > 0.05) return armSwap() // woke early
    takeOver(false)
    // tell the store the queue advanced; its load() call for this id finds `swappedId` and does nothing
    swappedId = trackId
    try {
      playerStore.ended()
    } finally {
      swappedId = null
    }
  }

  /**
   * The spare becomes the active deck and starts playing. `skipped`: the user jumped to it, so the
   * old track stops at once (instead of playing out its last few milliseconds).
   */
  function takeOver(skipped: boolean) {
    const el = spare!
    const next = spareLoaded!
    const oldEl = audio
    const oldLoaded = loaded
    window.clearTimeout(swapTimer)
    audio = el
    loaded = next
    trackId = next.trackId
    spare = null
    spareLoaded = null
    spareId = null
    spareReady = false
    seq++ // anything resolving for the old track is stale now
    resolving = null
    wantPlay = true
    startAt = 0
    switching = false
    failures = 0
    // time-critical bit first
    playCalledAt = performance.now()
    el.currentTime = 0
    void el.play().catch((e: DOMException) => {
      if (e.name === 'AbortError') return
      wantPlay = false
      playerStore.report({ playing: false, buffering: false })
    })
    retire(oldEl, oldLoaded, skipped)
    playerStore.report({ playing: true, buffering: false, source: next.source, position: 0 })
    setMetadata(next.trackId)
    if (ms) ms.playbackState = 'playing'
    syncPosition()
  }

  /** Let the old deck finish its last milliseconds, then empty it and put it back in the pool. */
  function retire(el: HTMLAudioElement, l: Loaded | null, now: boolean) {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clean(el, l)
      idle.push(el)
    }
    if (now || el.paused || el.ended) return finish()
    el.addEventListener('ended', finish, { once: true })
    window.setTimeout(finish, 1500)
  }

  /* ── element events ────────────────────────────── */

  function bind(el: HTMLAudioElement) {
    el.addEventListener('playing', () => {
      if (el !== audio) return
      switching = false
      failures = 0
      if (playCalledAt) {
        // how long play() really took: start the next hand-over that much earlier
        const took = (performance.now() - playCalledAt) / 1000
        playCalledAt = 0
        lead = Math.min(0.25, Math.max(0.02, lead * 0.5 + took * 0.5))
      }
      playerStore.report({ playing: true, buffering: false })
      if (ms) ms.playbackState = 'playing'
      syncPosition()
      schedulePreload()
      armSwap()
    })
    el.addEventListener('pause', () => {
      if (el !== audio || switching || !el.paused || el.ended) return
      wantPlay = false
      window.clearTimeout(swapTimer)
      playerStore.report({ playing: false, buffering: false, position: el.currentTime })
      if (ms) ms.playbackState = 'paused'
      syncPosition()
    })
    el.addEventListener('waiting', () => el === audio && wantPlay && playerStore.report({ buffering: true }))
    el.addEventListener('canplay', () => {
      if (el === spare) {
        spareReady = true
        armSwap()
      } else if (el === audio && !switching) playerStore.report({ buffering: false })
    })
    el.addEventListener('loadedmetadata', () => {
      if (el !== audio) return
      if (startAt > 0 && startAt < el.duration) el.currentTime = startAt
      startAt = 0
      syncPosition()
      armSwap()
    })
    el.addEventListener('timeupdate', () => {
      if (el !== audio || switching || startAt > 0) return
      armSwap()
      const now = performance.now()
      if (now - lastTick < 240) return
      lastTick = now
      playerStore.report({ position: el.currentTime })
    })
    el.addEventListener('seeked', () => {
      if (el !== audio) return
      playerStore.report({ position: el.currentTime })
      syncPosition()
      armSwap()
    })
    el.addEventListener('ended', () => {
      if (el !== audio) return // a retired deck finishing; retire() cleans it
      playerStore.report({ position: el.duration || playerStore.get().position })
      playerStore.ended()
      if (!playerStore.get().playing) {
        wantPlay = false // end of the queue
        if (ms) ms.playbackState = 'paused'
      }
    })
    el.addEventListener('error', () => {
      if (el === spare) {
        // preloading failed: forget it, play the normal way when its turn comes
        const id = spareId
        dropSpare()
        failedNext = id
        return
      }
      if (el !== audio) return
      const cur = loaded
      if (!cur || !trackId || cur.trackId !== trackId || !el.error) return
      const err = el.error
      const pos = el.currentTime
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
  }

  /* ── PlayerEngine ──────────────────────────────── */

  const engine: PlayerEngine = {
    load(id, { autoplay, position }) {
      // the gapless hand-over already started this track: nothing to do
      if (swappedId === id) return
      // repeat-one / replay of the loaded track: no need to re-resolve
      // (unless it streams from Drive and a local folder has been linked since)
      const localLinked = !['none', 'unsupported', 'denied'].includes(localFolder.get().status)
      if (id === trackId && loaded?.trackId === id && !resolving && (loaded.source === 'local' || !localLinked)) {
        startAt = 0
        audio.currentTime = position ?? 0
        if (autoplay) engine.play()
        return
      }
      // skipping / jumping to the track that's already preloaded: switch decks, no waiting
      if (autoplay && !position && spare && spareLoaded && spareId === id) {
        takeOver(true)
        return
      }
      seq++
      trackId = id
      startAt = position ?? 0
      wantPlay = autoplay
      switching = true
      if (spareId === id) dropSpare() // a spare for this very track can't be used now
      window.clearTimeout(swapTimer)
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
      window.clearTimeout(swapTimer)
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

    setVolume(v, m) {
      // perceptual curve: the slider is linear, loudness isn't
      volume = Math.max(0, Math.min(1, v * v))
      muted = m
      for (const a of all) {
        a.volume = volume
        a.muted = muted
      }
    },

    preload(id) {
      wantedNext = id
      if (id !== failedNext) failedNext = null
      if (id && id === spareId) return // already (being) prepared
      dropSpare()
      schedulePreload()
    },

    unload() {
      seq++
      trackId = null
      wantPlay = switching = false
      startAt = 0
      wantedNext = null
      failedNext = null
      swappedId = null
      dropSpare()
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
