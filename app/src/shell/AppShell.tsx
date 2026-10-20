/**
 * Desktop app shell: 232px sidebar · scrolling main area · 84px player bar,
 * over the Atmosphere layers. Keeps the library in sync and surfaces session / sync events as toasts.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { Icon } from '../design/icons'
import { AccountMenu } from '../pages/AccountMenu'
import { useToast } from '../components/ui'
import { libraryStore, onLibraryUpdated, useLibrary } from '../state/library'
import { NowPlaying } from '../nowplaying/NowPlaying'
import { QueuePanel } from '../nowplaying/QueuePanel'
import { nowPlayingStore, useNowPlayingUi } from '../state/nowPlaying'
import { onPlayerNotice, playerStore, usePlayer } from '../state/player'
import { focusLibrarySearch } from '../state/search'
import { sessionStore, useSession } from '../state/session'
import { PlayerBar } from './PlayerBar'
import { MiniPlayer, TabBar } from './PhoneBars'
import { useIsPhone } from '../state/viewport'
import { appUpdate, usePwa } from '../lib/pwa'
import { nativeUpdates, useNativeUpdates } from '../native/updates'

import { Sidebar } from './Sidebar'
import { ActionHost } from '../actions/ActionHost'
import { DjPanelHost } from '../dj/DjPanel'
import { djStore } from '../state/dj'
import { albumHref, go, href, navKeyOf, type Route } from './routes'
import { albumOffline, downloadsStore, qualityOf, trackOffline } from '../state/downloads'
import { fmtBytes, plural } from '../state/views'
import { onAlbumAdded, useUpload } from '../state/upload'
import { uploadSummary } from '../state/uploadViews'
import { onReleasesEvent, releasesStore, useReleases } from '../state/releases'
import { buildFeed, fmtClock } from '../state/releaseViews'
import { historyStore, useHistory } from '../state/history'
import { playRelease } from '../pages/releases/parts'
import './shell.css'
import './phone.css'

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const toast = useToast()
  const session = useSession()
  const lib = useLibrary()
  const mainRef = useRef<HTMLElement>(null)
  const np = useNowPlayingUi()
  const phone = useIsPhone()
  const hasTrack = usePlayer().index >= 0

  // phone layout flag for CSS that lives outside the shell (toasts)
  useEffect(() => {
    if (!phone) return
    document.documentElement.setAttribute('data-phone', '')
    return () => document.documentElement.removeAttribute('data-phone')
  }, [phone])

  // Check Drive for a newer library.json whenever we (re)gain a valid session.
  useEffect(() => {
    if (session.status === 'signed-in') void libraryStore.sync()
  }, [session.status])

  // "Library updated" after a background refresh
  useEffect(
    () =>
      onLibraryUpdated(({ added }) => {
        const parts = [added.albums && `${added.albums} ALBUM${added.albums > 1 ? 'S' : ''}`, added.tracks && `${added.tracks} TRACK${added.tracks > 1 ? 'S' : ''}`].filter(Boolean)
        toast.show({ icon: 'check', text: 'Library updated from Drive.', meta: parts.length ? `+ ${parts.join(' · ')}` : 'TAGS CHANGED' })
      }),
    [toast],
  )

  // Android (phase D): an album finished downloading.
  useEffect(
    () =>
      downloadsStore.onAlbumDone((albumId) => {
        const s = downloadsStore.get()
        const album = libraryStore.get().data?.albums[albumId]
        const off = albumOffline(s, albumId)
        if (!album) return
        toast.show({
          icon: 'check',
          text: `${album.title} is stored offline.`,
          meta: `${fmtBytes(off.bytesDone)} · ${s.prefs.quality === 'flac' ? 'FLAC' : 'OPUS 160'}`,
          action: { label: 'View', onClick: () => go(albumHref(albumId)) },
        })
      }),
    [toast],
  )

  // Android: a song downloaded on its own (track menu → Download) finished.
  useEffect(
    () =>
      downloadsStore.onTrackDone((trackId) => {
        const s = downloadsStore.get()
        const t = libraryStore.get().data?.tracks[trackId]
        if (!t) return
        const off = trackOffline(s, t)
        toast.show({
          icon: 'check',
          text: `${t.title} is stored offline.`,
          meta: `${fmtBytes(off.bytes)} · ${qualityOf(s.prefs, t.albumId) === 'flac' || !t.mobile?.id ? 'FLAC' : 'OPUS 160'}`,
          action: { label: 'View', onClick: () => go(albumHref(t.albumId)) },
        })
      }),
    [toast],
  )

  // Upload (steps 10, 24): progress toast while away from the Upload page, "added" toast per release,
  // nav badge "4 !" while releases need you (else "n/m" while uploading).
  const up = useUpload()
  const upRun = uploadSummary(up, lib.data)
  const onUploadPage = route.kind === 'app' && route.key === 'upload'
  const upToast = useRef<number | null>(null)
  const upAlbum = upRun.active
  useEffect(() => {
    if (!upRun.running || onUploadPage || !upAlbum) {
      if (upToast.current !== null) toast.dismiss(upToast.current)
      upToast.current = null
      return
    }
    const t = {
      icon: 'upload' as const,
      text: `Uploading ${upAlbum.title}`,
      meta: `${Math.min(upRun.total, upRun.done + 1)} OF ${upRun.total}`,
      progress: upRun.ratio,
      action: { label: 'Show', onClick: () => go(href('upload')) },
      duration: 0,
    }
    if (upToast.current === null) upToast.current = toast.show(t)
    else toast.update(upToast.current, t)
  }, [upRun.running, onUploadPage, upAlbum, upRun.done, upRun.total, upRun.ratio, toast])
  useEffect(
    () =>
      onAlbumAdded((r) => {
        toast.show({
          icon: 'check',
          text: `${r.title} is in your library.`,
          meta: r.failed ? `${plural(r.added, 'TRACK')} · ${r.failed} FAILED` : `${plural(r.added, 'TRACK')} ADDED`,
          action: { label: 'View', onClick: () => go(albumHref(r.albumId)) },
        })
      }),
    [toast],
  )

  // New releases (step 11): sidebar count / tab dot, and the feed's toasts from anywhere in the app.
  const rs = useReleases()
  const plays = useHistory().plays
  const newReleases = lib.data && rs.doc.sweep.at !== null ? buildFeed(rs.doc, lib.data, plays, rs.prefs).counts.new : 0
  useEffect(
    () =>
      onReleasesEvent((e) => {
        if (e.kind === 'swept') {
          if (!e.manual) return
          toast.show({
            icon: 'refresh',
            text: e.fresh ? `Sweep finished. ${e.fresh} new release${e.fresh === 1 ? '' : 's'}.` : e.since ? `Sweep finished. Nothing new since ${fmtClock(e.since)}.` : 'Sweep finished. Nothing new.',
            meta: `${e.artists} ARTISTS`,
          })
        } else if (e.kind === 'matched') {
          const c = libraryStore.get().data
          const st = releasesStore.get()
          const item = c ? buildFeed(st.doc, c, historyStore.get().plays, st.prefs).byId.get(e.id) : undefined
          toast.show({
            icon: 'playF',
            text: `${e.title} is in your library.`,
            meta: item?.match?.quality,
            action: item?.match ? { label: 'Play', onClick: () => playRelease(item) } : undefined,
          })
        } else if (e.kind === 'reminder') {
          toast.show({ icon: 'bellF', text: `${e.title} by ${e.artist} is out today.`, meta: 'NEW RELEASE', action: { label: 'View', onClick: () => go(href('new')) }, duration: 8000 })
        }
      }),
    [toast],
  )

  // A new deploy is installed and waiting (PWA, step 7): one toast that stays until used.
  const { updateReady } = usePwa()
  useEffect(() => {
    if (!updateReady) return
    const id = toast.show({
      icon: 'refresh',
      text: 'A new version of Pelagic is ready.',
      meta: 'UPDATE',
      action: { label: 'Reload', onClick: () => appUpdate.apply() },
      duration: 0,
    })
    return () => toast.dismiss(id)
  }, [updateReady, toast])

  // Android: a newer APK is on GitHub Releases.
  const apk = useNativeUpdates().available
  useEffect(() => {
    if (!apk) return
    const id = toast.show({
      icon: 'download',
      text: `Pelagic ${apk.versionName} is available.`,
      meta: 'ANDROID UPDATE',
      action: { label: 'Install', onClick: () => nativeUpdates.install() },
      duration: 0,
    })
    return () => toast.dismiss(id)
  }, [apk, toast])

  // Session expired while the shell is up: keep browsing the cached library, offer one-click sign-in.
  const expiredToast = useRef<number | null>(null)
  useEffect(() => {
    if (session.status === 'expired' && expiredToast.current === null) {
      expiredToast.current = toast.show({
        icon: 'alert',
        mutedIcon: true,
        text: 'Google session expired.',
        meta: 'CACHED LIBRARY STILL WORKS',
        action: { label: 'Sign in', onClick: () => void sessionStore.signIn() },
        duration: 0,
      })
    } else if (session.status !== 'expired' && expiredToast.current !== null) {
      toast.dismiss(expiredToast.current)
      expiredToast.current = null
    }
  }, [session.status, toast])
  useEffect(
    () => () => {
      // leaving the shell (sign-out): take the toast with it
      if (expiredToast.current !== null) toast.dismiss(expiredToast.current)
      expiredToast.current = null
    },
    [toast],
  )

  // Player notices (3d): Drive needs a fresh token, a track failed, a track left the catalogue
  useEffect(
    () =>
      onPlayerNotice((n) => {
        const title = libraryStore.get().data?.tracks[n.trackId]?.title
        if (n.kind === 'auth') {
          // One "sign in" toast: reuse the session-expired one; signing in from it resumes playback.
          const t = {
            icon: 'alert' as const,
            mutedIcon: true,
            text: 'Sign in again to stream from Drive.',
            meta: title ? title.toUpperCase() : 'GOOGLE SESSION EXPIRED',
            action: {
              label: 'Sign in',
              onClick: () =>
                void sessionStore.signIn().then(() => {
                  if (sessionStore.get().status === 'signed-in') playerStore.toggle()
                }),
            },
            duration: 0,
          }
          if (expiredToast.current !== null) toast.dismiss(expiredToast.current)
          expiredToast.current = toast.show(t)
        } else if (n.kind === 'missing') {
          toast.show({ icon: 'alert', mutedIcon: true, text: 'That track is no longer in your library.', meta: 'QUEUE' })
        } else {
          toast.show({
            icon: 'alert',
            tone: 'danger',
            text: title ? `Couldn’t play “${title}”. ${n.message}` : n.message,
            meta: n.skipped ? 'SKIPPED' : 'STOPPED',
          })
        }
      }),
    [toast],
  )

  // DJ stopped (step 22): by Stop DJ, or because something else was played
  useEffect(
    () =>
      djStore.onNotice((n) => {
        if (n.reason === 'user')
          toast.show({
            icon: 'dj',
            tone: 'dj',
            text: n.label ? `DJ stopped. Back to ${n.label}, where you left off.` : 'DJ stopped.',
            action: { label: 'Start again', onClick: () => void djStore.start() },
          })
        else if (n.reason === 'replaced')
          toast.show({
            icon: 'dj',
            tone: 'dj',
            text: n.label ? `DJ stopped because you played ${n.label}.` : 'DJ stopped.',
            action: { label: 'Resume DJ', onClick: () => void djStore.start(n.mode ?? {}) },
          })
      }),
    [toast],
  )

  // Space toggles playback (unless typing or a control has focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="menuitem"], [role="link"]')) return
      if (playerStore.get().index < 0) return
      e.preventDefault()
      playerStore.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // "/" or Ctrl/⌘+K: focus the Library search field, going to Library first (from anywhere, unless typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey
      const k = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k'
      if (!slash && !k) return
      const el = e.target as HTMLElement | null
      if (slash && el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      focusLibrarySearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Esc closes the queue panel first, then the full-screen player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const ui = nowPlayingStore.get()
      if (!ui.queue && !ui.open) return
      const el = e.target as HTMLElement | null
      if (!ui.open && el?.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      if (ui.queue) nowPlayingStore.closeQueue()
      else nowPlayingStore.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Any navigation (e.g. "/" to Library search) takes the full-screen player and queue panel down with it
  const npPath = useRef(route.path)
  useEffect(() => {
    if (npPath.current === route.path) return
    npPath.current = route.path
    const ui = nowPlayingStore.get()
    if (ui.open) nowPlayingStore.close()
    else if (ui.queue) nowPlayingStore.closeQueue()
  }, [route.path])

  // Background sync failure (first-load failures have their own screen)
  const lastError = useRef<string | null>(null)
  useEffect(() => {
    if (lib.error && lib.data && lib.error !== lastError.current) {
      toast.show({ icon: 'alert', tone: 'danger', text: 'Couldn’t check Drive for changes.', meta: 'USING CACHED LIBRARY', action: { label: 'Retry', onClick: () => void libraryStore.sync() } })
    }
    lastError.current = lib.error
  }, [lib.error, lib.data, toast])

  // New page starts at the top; going back to a page restores where it was scrolled to.
  // Positions are recorded while scrolling: by the time the route changes the new page has
  // already replaced the old one (and clamped scrollTop).
  const scrolls = useRef(new Map<string, number>())
  const pathRef = useRef(route.path)
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const onScroll = () => scrolls.current.set(pathRef.current, main.scrollTop)
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main || pathRef.current === route.path) return
    pathRef.current = route.path
    const y = scrolls.current.get(route.path) ?? 0
    main.scrollTo({ top: y })
    // grids may still be laying out (lazy covers keep their size, but be safe)
    if (y) requestAnimationFrame(() => main.scrollTo({ top: y }))
  }, [route.path])

  return (
    <div className={`shell ${phone ? 'is-phone' : ''} ${phone && hasTrack ? 'has-mini' : ''}`}>
      {/* frozen while the full-screen player (with its own atmosphere) covers the shell */}
      <Atmosphere fixed seed={17} paused={np.open} />
      {/* the full-screen player is modal: everything behind it is inert */}
      <div className="shell-layer" inert={np.open}>
        {!phone && (
          <Sidebar
            active={navKeyOf(route)}
            activePlaylist={route.kind === 'app' && route.key === 'playlist' ? route.id : null}
            badges={{
              ...(upRun.badge ? { upload: upRun.badge } : {}),
              ...(newReleases ? { new: String(newReleases) } : {}),
            }}
          />
        )}
        <main className="shell-main" ref={mainRef} id="main" tabIndex={-1}>
          {!phone && (
            <div className="topbar">
              {!(route.kind === 'app' && route.key === 'library') && (
                <button
                  type="button"
                  className="search-pill"
                  onClick={focusLibrarySearch}
                >
                  <span className="sp-ic">
                    <Icon name="search" />
                  </span>
                  <span className="sp-text">Search your library</span>
                  <kbd className="sp-kbd">/</kbd>
                </button>
              )}
              <AccountMenu />
            </div>
          )}
          <div className="shell-page">{children}</div>
        </main>
        {phone ? (
          <>
            <MiniPlayer />
            <TabBar active={navKeyOf(route)} dots={{ new: newReleases > 0 }} />
          </>
        ) : (
          <PlayerBar />
        )}
      </div>
      <NowPlaying />
      <QueuePanel />
      <ActionHost />
      <DjPanelHost />
    </div>
  )
}
