/**
 * Pelagic on Firebase — the same `/api/auth/*` (sign-in helper) and `/api/deezer/*` (Deezer proxy)
 * as the Cloudflare Pages Functions, so the Firebase copy of the site works exactly like the
 * Cloudflare one. The handlers themselves are NOT copied: build.mjs bundles app/functions/api/…
 * into this function, and this file only adapts Firebase's request/response to the Web
 * Request/Response the handlers expect.
 *
 * Two Firebase specifics:
 * - Firebase Hosting forwards only ONE cookie to functions, and it must be named `__session`.
 *   The handlers use `__Host-pelagic_rt`, so the name is swapped on the way in and out
 *   (still HttpOnly, Secure, SameSite=Strict).
 * - The function runs on its own host behind Hosting; the site's address comes from
 *   `x-forwarded-host`, so the handlers' same-origin (CSRF) check compares against the site.
 *
 * Secrets (once, from the repo root):  firebase functions:secrets:set GOOGLE_CLIENT_ID
 *                                       firebase functions:secrets:set GOOGLE_CLIENT_SECRET
 */
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as auth from '../../../app/functions/api/auth/[action].ts'
import * as deezer from '../../../app/functions/api/deezer/[action].ts'

const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET')

const APP_COOKIE = '__Host-pelagic_rt'
const FB_COOKIE = '__session'

const handlers = { auth, deezer } as const

/** The site's own host (what the browser sees), not the function's. */
function siteHost(headers: Record<string, string | string[] | undefined>): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || ''
  const fwd = first(headers['x-forwarded-host'])
  if (fwd) return fwd
  // fallback: trust the Origin only when it is a Firebase Hosting address
  const origin = first(headers['origin'])
  if (origin) {
    try {
      const h = new URL(origin).host
      if (/\.(web\.app|firebaseapp\.com)$/.test(h)) return h
    } catch {
      /* ignore */
    }
  }
  return first(headers['host'])
}

export const api = onRequest(
  {
    region: 'europe-west1',
    secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
    memory: '256MiB',
    maxInstances: 3,
    invoker: 'public',
  },
  async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `https://${siteHost(req.headers)}`)
    const m = /^\/api\/(auth|deezer)\/([^/]+)\/?$/.exec(url.pathname)
    if (!m) {
      res.status(404).set('cache-control', 'no-store').json({ error: 'not_found' })
      return
    }

    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue
      if (k === 'cookie') {
        // __session=<token>  →  __Host-pelagic_rt=<token>
        const val = (Array.isArray(v) ? v.join('; ') : v)
          .split(/;\s*/)
          .map((p) => (p.startsWith(`${FB_COOKIE}=`) ? APP_COOKIE + p.slice(FB_COOKIE.length) : p))
          .join('; ')
        headers.set('cookie', val)
      } else {
        headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, { method: req.method, headers, body: hasBody ? new Uint8Array(req.rawBody ?? []) : undefined })
    const env = {
      GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID.value().trim() || undefined,
      GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET.value().trim() || undefined,
    }

    const handler = handlers[m[1] as keyof typeof handlers]
    let response: Response
    try {
      response = await handler.onRequest({ request, env, params: { action: decodeURIComponent(m[2]) } })
    } catch (e) {
      console.error('api handler failed', e)
      res.status(500).set('cache-control', 'no-store').json({ error: 'internal' })
      return
    }

    res.status(response.status)
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie().map((c) => (c.startsWith(`${APP_COOKIE}=`) ? FB_COOKIE + c.slice(APP_COOKIE.length) : c))
    if (cookies.length) res.setHeader('set-cookie', cookies)
    res.send(Buffer.from(await response.arrayBuffer()))
  },
)
