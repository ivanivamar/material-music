/**
 * PWA glue (step 7): app updates, the install prompt and launches into an already-open window.
 *
 * Updates: a deploy ships a new public/sw.js (its BUILD changes). The browser installs it next to the
 * running one and it waits; `appUpdate.available` turns true and the shell shows "New version ·
 * Reload". `apply()` lets the waiting worker take over and reloads the page once it has.
 * A long-running window also checks for a new worker every hour and whenever it becomes visible.
 *
 * Chrome only hands over once the old worker has no requests in flight, and the Drive audio stream
 * runs through it (open even while paused), so `apply()` first closes the player's streams
 * (position saved). If the hand-over still hasn't happened after a few seconds the page reloads
 * anyway with a flag in sessionStorage; the next boot finishes the job (activate + one more reload),
 * so the user never ends up on old code whose assets the new worker has already dropped.
 *
 * Install: Chrome/Edge fire `beforeinstallprompt` when the app can be installed; we keep the event
 * so the account menu can offer "Install Pelagic app". Already installed → `installed` is true.
 *
 * Launches: the manifest asks for `focus-existing`, so opening Pelagic (or a shortcut) while a window
 * is open focuses it instead of starting a second player; the launch URL's #route is applied here.
 */
import { useSyncExternalStore } from 'react'
import { initDriveStream } from './driveStream'
import { isNative } from '../native/bridge'
import { playerStore } from '../state/player'

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
let registration: ServiceWorkerRegistration | null = null
const PENDING = 'pelagic:update-pending'
/** how long apply() waits for the new worker before reloading anyway */
const FALLBACK_MS = 6000

function takePending(): boolean {
  try {
    const v = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    return v === '1'
  } catch {
    return false
  }
}

function reloadPending() {
  try {
    sessionStorage.setItem(PENDING, '1')
  } catch {
    /* ignore: plain reload */
  }
  window.location.reload()
}

function track(reg: ServiceWorkerRegistration) {
  registration = reg
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
  if (started || typeof window === 'undefined' || isNative) return // the APK updates itself (native/updates.ts)
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
    const pending = takePending()
    void initDriveStream().then(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return
      track(reg)
      if (!pending) return
      // a Reload whose hand-over timed out: nothing is playing yet on this fresh page, so finish it now
      if (reg.waiting && navigator.serviceWorker.controller) {
        reloading = true
        reg.waiting.postMessage({ type: 'pelagic:skip-waiting' })
      } else if (reg.active) {
        // the new worker took over while this page was loading (maybe from the old cache): reload once more
        window.location.reload()
      }
    })
  }
}

export const appUpdate = {
  /** Activate the waiting version and reload into it. */
  apply() {
    if (reloading) return
    // a newer deploy may have replaced the worker we saw first
    const w = registration?.waiting ?? (waiting?.state === 'installed' ? waiting : null)
    if (!w) return window.location.reload()
    reloading = true
    playerStore.suspendForReload()
    w.postMessage({ type: 'pelagic:skip-waiting' })
    window.setTimeout(reloadPending, FALLBACK_MS)
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
