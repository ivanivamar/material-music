/**
 * Desktop app shell: 232px sidebar · scrolling main area · 84px player bar,
 * over the Atmosphere layers. Keeps the library in sync and surfaces session / sync events as toasts.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { useToast } from '../components/ui'
import { libraryStore, onLibraryUpdated, useLibrary } from '../state/library'
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
