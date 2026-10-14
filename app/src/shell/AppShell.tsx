/**
 * Desktop app shell: 232px sidebar · scrolling main area · 84px player bar,
 * over the Atmosphere layers. Keeps the library in sync and surfaces session / sync events as toasts.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { useToast } from '../components/ui'
import { libraryStore, onLibraryUpdated, useLibrary } from '../state/library'
import { onPlayerNotice, playerStore } from '../state/player'
import { sessionStore, useSession } from '../state/session'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import type { RouteKey } from './routes'
import './shell.css'

export function AppShell({ route, children }: { route: RouteKey; children: ReactNode }) {
  const toast = useToast()
  const session = useSession()
  const lib = useLibrary()
  const mainRef = useRef<HTMLElement>(null)

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

  // Background sync failure (first-load failures have their own screen)
  const lastError = useRef<string | null>(null)
  useEffect(() => {
    if (lib.error && lib.data && lib.error !== lastError.current) {
      toast.show({ icon: 'alert', tone: 'danger', text: 'Couldn’t check Drive for changes.', meta: 'USING CACHED LIBRARY', action: { label: 'Retry', onClick: () => void libraryStore.sync() } })
    }
    lastError.current = lib.error
  }, [lib.error, lib.data, toast])

  // New page starts at the top
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [route])

  return (
    <div className="shell">
      <Atmosphere fixed seed={17} />
      <Sidebar active={route} />
      <main className="shell-main" ref={mainRef} id="main" tabIndex={-1}>
        <div className="shell-page">{children}</div>
      </main>
      <PlayerBar />
    </div>
  )
}
