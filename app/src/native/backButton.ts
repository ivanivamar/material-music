/**
 * Android system Back button (gesture or button). Without a handler Android finishes the activity,
 * i.e. Back closed the app from anywhere. Now, in order:
 *   0. a page overlay (New Releases panel / sheet) → close it
 *   1. account menu open      → close it
 *   2. queue panel open       → close it
 *   3. full-screen player     → close it
 *   4. an in-app page to go back to (album → library …) → go back
 *   5. any page but Home      → Home
 *   6. Home                   → send the app to the background (like Home; music keeps playing,
 *                               the app resumes where it was)
 *
 * Uses @capacitor/app's `backButton` event: while a listener is registered the plugin hands every
 * Back press to us instead of doing its own WebView-history / finish.
 */
import { App } from '@capacitor/app'
import { back, canGoBack, href, replace } from '../shell/routes'
import { nowPlayingStore } from '../state/nowPlaying'
import { isNative } from './bridge'

/** Page overlays that close on Back (latest first). The handler returns true when it handled it. */
const overlays: (() => boolean)[] = []
export function registerBack(fn: () => boolean): () => void {
  overlays.push(fn)
  return () => {
    const i = overlays.lastIndexOf(fn)
    if (i >= 0) overlays.splice(i, 1)
  }
}

export function handleBack(): void {
  // Popover menus close on Escape (AccountMenu listens on document; not bubbling to window keeps
  // AppShell's Esc handler out of it).
  if (document.querySelector('.avatar-wrap .menu[role="menu"]')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    return
  }
  const ui = nowPlayingStore.get()
  if (ui.queue) return nowPlayingStore.closeQueue()
  if (ui.open) return nowPlayingStore.close()
  for (let i = overlays.length - 1; i >= 0; i--) if (overlays[i]()) return
  if (canGoBack()) return back(href('home'))
  const path = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (path && path !== 'home') return replace(href('home'))
  void App.minimizeApp()
}

export function initBackButton(): void {
  if (!isNative) return
  void App.addListener('backButton', handleBack)
}
