/**
 * PWA glue (step 7): app updates, the install prompt and launches into an already-open window.
 *
 * Updates: a deploy ships a new public/sw.js (its BUILD changes). The browser installs it next to the
 * running one and it waits; `appUpdate.available` turns true and the shell shows "New version ·
 * Reload". `apply()` lets the waiting worker take over and reloads the page once it has.
 * A long-running window also checks for a new worker every hour and whenever it becomes visible.
 *
 * Install: Chrome/Edge fire `beforeinstallprompt` when the app can be installed; we keep the event
 * so the account menu can offer "Install Pelagic app". Already installed → `installed` is true.
 *
 * Launches: the manifest asks for `focus-existing`, so opening Pelagic (or a shortcut) while a window
 * is open focuses it instead of starting a second player; the launch URL's #route is applied here.
 */
import { useSyncExternalStore } from 'react'
import { initDriveStream } from './driveStream'

declare global {
  /** "YYYY-MM-DD · <commit>", set in vite.config.ts */
  const __PELAGIC_VERSION__: string
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
  interface Window {
    launchQueue?: { setConsumer(consumer: (params: { targetURL?: string }) => void): void }
  }
}

export const APP_VERSION = __PELAGIC_VERSION__

interface PwaState {
  /** a new version is installed and waiting for a reload */
  updateReady: boolean
  /** the browser offered installation (Chrome/Edge, not yet installed) */
  canInstall: boolean
  /** running as the installed app (own window) */
  installed: boolean
}

const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches)

let state: PwaState = { updateReady: false, canInstall: false, installed: standalone() }
const listeners = new Set<() => void>()
const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let waiting: ServiceWorker | null = null
let installEvent: BeforeInstallPromptEvent | null = null
let reloading = false
let started = false

function track(reg: ServiceWorkerRegistration) {
  const markWaiting = (w: ServiceWorker | null) => {
    // only an *update* waits; the first install takes over straight away
    if (!w || !navigator.serviceWorker.controller) return
    waiting = w
    set({ updateReady: true })
  }
  markWaiting(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const w = reg.installing
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed') markWaiting(reg.waiting ?? w)
    })
  })
  const check = () => void reg.update().catch(() => {})
  window.setInterval(check, 60 * 60 * 1000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
}

/** Call once at boot (after the service worker is registered by initDriveStream). */
export function initPwa() {
  if (started || typeof window === 'undefined') return
  started = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for the account menu instead of Chrome's mini-infobar
    installEvent = e
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    set({ canInstall: false })
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => set({ installed: standalone() }))

  window.launchQueue?.setConsumer(({ targetURL }) => {
    if (!targetURL) return
    const hash = new URL(targetURL).hash
    if (hash && hash !== location.hash) location.hash = hash
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // only reload for an update the user asked for (the first install also changes controller)
      if (!reloading) return
      window.location.reload()
    })
    void initDriveStream().then(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) track(reg)
    })
  }
}

export const appUpdate = {
  /** Activate the waiting version and reload into it. */
  apply() {
    if (!waiting) return window.location.reload()
    reloading = true
    waiting.postMessage({ type: 'pelagic:skip-waiting' })
  },
  /** Show the browser's install dialog. Resolves true if the user installed. */
  async install(): Promise<boolean> {
    const e = installEvent
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    installEvent = null
    set({ canInstall: false })
    return outcome === 'accepted'
  },
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
