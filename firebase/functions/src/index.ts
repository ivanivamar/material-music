/**
 * Pelagic's only server code: one Cloud Function, `api`, behind Firebase Hosting (`/api/**`).
 * It serves `/api/auth/*` (sign-in helper), `/api/deezer/*` (Deezer proxy), `/api/voice/*` (DJ voice)
 * `/api/concerts/*` (Ticketmaster tour dates) and `/api/sync/*` (Firebase sign-in for the player sync, step 37).
 * The handlers in ./api/ are plain Web Request → Response functions (they started life as
 * Cloudflare Pages Functions, moved here Oct 20, 2026); this file adapts Firebase's request/response
 * to them. build.mjs bundles everything into lib/index.js.
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
 *                                       firebase functions:secrets:set GOOGLE_TTS_API_KEY   (DJ voice)
 *                                       firebase functions:secrets:set TICKETMASTER_API_KEY (Concerts)
 * A new secret needs one deploy from the PC (`firebase deploy --only functions`): the CLI grants the
 * function access to it, which the CI account can't do.
 */
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as auth from './api/auth.ts'
import * as deezer from './api/deezer.ts'
import * as voice from './api/voice.ts'
import * as concerts from './api/concerts.ts'
import * as sync from './api/sync.ts'

const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET')
/** DJ voice (step 22c): Google Cloud Text-to-Speech API key */
const GOOGLE_TTS_API_KEY = defineSecret('GOOGLE_TTS_API_KEY')
/** Concerts: Ticketmaster Discovery API consumer key */
const TICKETMASTER_API_KEY = defineSecret('TICKETMASTER_API_KEY')

const APP_COOKIE = '__Host-pelagic_rt'
const FB_COOKIE = '__session'

const handlers = { auth, deezer, voice, concerts, sync } as const

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
    secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TTS_API_KEY, TICKETMASTER_API_KEY],
    memory: '256MiB',
    maxInstances: 3,
    invoker: 'public',
  },
  async (req, res) => {
    const url = new URL(req.originalUrl || req.url, `https://${siteHost(req.headers)}`)
    const m = /^\/api\/(auth|deezer|voice|concerts|sync)\/([^/]+)\/?$/.exec(url.pathname)
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
      GOOGLE_TTS_API_KEY: GOOGLE_TTS_API_KEY.value().trim() || undefined,
      TICKETMASTER_API_KEY: TICKETMASTER_API_KEY.value().trim() || undefined,
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
