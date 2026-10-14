/**
 * Drive streaming for <audio>: registers public/sw.js, answers its token requests and turns a
 * Drive file into a same-origin URL the worker proxies with the OAuth header (range requests
 * included, so seeking works without downloading the whole file).
 *
 * Without a controlling service worker (unsupported, or blocked) streamUrl() returns null and the
 * player falls back to downloading the whole file with driveFetch.
 */
import { sessionStore } from '../state/session'

const BASE = import.meta.env.BASE_URL
let ready: Promise<boolean> | null = null

function listen() {
  const sw = navigator.serviceWorker
  sw.addEventListener('message', (e: MessageEvent) => {
    const type = (e.data as { type?: string } | null)?.type
    if (type === 'pelagic:token') e.ports[0]?.postMessage({ token: sessionStore.token() })
    else if (type === 'pelagic:drive-401') sessionStore.expire()
  })
  sw.startMessages()
}

function waitForController(ms: number): Promise<boolean> {
  const sw = navigator.serviceWorker
  if (sw.controller) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(t)
      sw.removeEventListener('controllerchange', done)
      resolve(!!sw.controller)
    }
    const t = window.setTimeout(done, ms)
    sw.addEventListener('controllerchange', done)
  })
}

/** Register the worker (idempotent). Resolves true once it controls this page. */
export function initDriveStream(): Promise<boolean> {
  ready ??= (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false
    try {
      listen()
      await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
      const reg = await navigator.serviceWorker.ready
      // After a hard reload the page starts uncontrolled: ask the active worker to claim it.
      if (!navigator.serviceWorker.controller) reg.active?.postMessage({ type: 'pelagic:claim' })
      return await waitForController(4000)
    } catch (e) {
      console.warn('[pelagic] service worker unavailable, Drive playback will download whole files', e)
      return false
    }
  })()
  return ready
}

/** Same-origin streaming URL for a Drive file, or null when the worker isn't in control. */
export async function streamUrl(fileId: string, size: number, type = 'audio/flac'): Promise<string | null> {
  if (!(await initDriveStream())) return null
  if (!navigator.serviceWorker.controller) return null
  const q = new URLSearchParams({ size: String(size || 0), type })
  return `${BASE}__pelagic/drive/${encodeURIComponent(fileId)}?${q}`
}
