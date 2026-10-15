/**
 * Pelagic service worker.
 *
 * 1. Drive streaming proxy (step 3d). <audio src> can't send an Authorization header, so the player
 *    points it at
 *      /__pelagic/drive/<fileId>?size=<bytes>&type=<mime>
 *    and this worker forwards each (range) request to the Drive API with the page's OAuth token.
 *    The token is asked from the page on every request (MessageChannel), so it's never stale and
 *    nothing is stored here.
 *
 * 2. Offline app shell (step 7, PWA). The build (vite.config.ts → pelagic-sw) fills BUILD, PRECACHE
 *    and ASSETS below. index.html, JS, CSS, icons and Latin fonts are cached on install, so the
 *    installed app opens without a network; other hashed assets are cached on first use.
 *    A new deploy installs alongside and WAITS: the page shows "New version · Reload", which sends
 *    `pelagic:skip-waiting`. (The very first install activates immediately.)
 *    In dev BUILD is null and none of this runs.
 *
 * Drive API, Google sign-in and other cross-origin requests always go to the network,
 * except the Fontshare CSS/fonts (General Sans fallback), which are kept for offline use.
 */
const BUILD = /*BUILD*/null
const PRECACHE = /*PRECACHE*/[]
const ASSETS = /*ASSETS*/[]

const MARK = '/__pelagic/drive/'
const API = 'https://www.googleapis.com/drive/v3/files/'
const SHELL = `pelagic-shell-${BUILD}`
const RUNTIME = 'pelagic-runtime'
const FONTSHARE = 'pelagic-fontshare'
const SCOPE = new URL(self.registration.scope)
const at = (path) => new URL(path, SCOPE).href

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      if (BUILD) {
        const cache = await caches.open(SHELL)
        // cache: 'reload' skips the HTTP cache so a deploy never precaches a stale file
        await cache.addAll(PRECACHE.map((p) => new Request(at(p), { cache: 'reload' })))
      }
      // First install (nothing to replace) or dev: take over now. Updates wait for the page.
      if (!BUILD || !self.registration.active) await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      if (BUILD) {
        for (const key of await caches.keys()) {
          if (key.startsWith('pelagic-shell-') && key !== SHELL) await caches.delete(key)
        }
        // drop runtime copies of assets the current build no longer ships
        const known = new Set(ASSETS.map(at))
        const runtime = await caches.open(RUNTIME)
        for (const req of await runtime.keys()) if (!known.has(req.url)) await runtime.delete(req)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (e) => {
  const type = e.data && e.data.type
  // a hard reload leaves the page uncontrolled; the page asks us to take it over
  if (type === 'pelagic:claim') e.waitUntil(self.clients.claim())
  // the user pressed "Reload" on the update toast
  else if (type === 'pelagic:skip-waiting') e.waitUntil(self.skipWaiting())
  else if (type === 'pelagic:build' && e.ports[0]) e.ports[0].postMessage({ build: BUILD })
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (url.origin === self.location.origin) {
    const mark = url.pathname.indexOf(MARK)
    if (mark >= 0) {
      e.respondWith(stream(e, decodeURIComponent(url.pathname.slice(mark + MARK.length)), url.searchParams))
      return
    }
    if (!BUILD || req.method !== 'GET' || !url.href.startsWith(SCOPE.href)) return
    // the sign-in helper (Cloudflare Pages Function) always goes to the network
    if (url.pathname.startsWith(`${SCOPE.pathname}api/`)) return
    if (req.mode === 'navigate') e.respondWith(appShell(req))
    else e.respondWith(cacheFirst(req, url))
    return
  }
  if (BUILD && req.method === 'GET' && (url.hostname === 'api.fontshare.com' || url.hostname === 'cdn.fontshare.com')) {
    e.respondWith(staleWhileRevalidate(req, FONTSHARE))
  }
})

/** Navigations get this build's index.html (hash routes: every page is index.html). */
async function appShell(req) {
  const cached = await caches.match(at('index.html'), { cacheName: SHELL })
  if (cached) return cached
  return fetch(req)
}

/** Hashed assets never change: cache first, network once, keep it. */
async function cacheFirst(req, url) {
  const hit = (await caches.match(req, { cacheName: SHELL })) || (await caches.match(req, { cacheName: RUNTIME }))
  if (hit) return hit
  const res = await fetch(req)
  const rel = url.pathname.slice(SCOPE.pathname.length)
  if (res.ok && (rel.startsWith('assets/') || rel.startsWith('fonts/'))) {
    const copy = res.clone()
    caches.open(RUNTIME).then((c) => c.put(req, copy))
  }
  return res
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  const net = fetch(req)
    .then((res) => {
      // the Fontshare stylesheet is a no-cors (opaque) response: status 0 is expected
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
      return res
    })
    .catch(() => null)
  if (hit) return hit
  return (await net) || new Response(null, { status: 504, statusText: 'Offline' })
}

async function askToken(clientId) {
  let clients = []
  if (clientId) {
    const c = await self.clients.get(clientId)
    if (c) clients = [c]
  }
  if (!clients.length) clients = await self.clients.matchAll({ type: 'window' })
  for (const c of clients) {
    const token = await new Promise((resolve) => {
      const ch = new MessageChannel()
      const timer = setTimeout(() => resolve(null), 3000)
      ch.port1.onmessage = (m) => {
        clearTimeout(timer)
        resolve((m.data && m.data.token) || null)
      }
      c.postMessage({ type: 'pelagic:token' }, [ch.port2])
    })
    if (token) return token
  }
  return null
}

async function broadcast(msg) {
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage(msg)
}

/** Parse a single `bytes=a-b` / `bytes=a-` / `bytes=-n` range against a known size. */
function parseRange(header, size) {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2])) return { start: 0, end: size - 1, partial: false }
  if (!m[1]) {
    const n = Math.min(Number(m[2]), size)
    return { start: size - n, end: size - 1, partial: true }
  }
  const start = Number(m[1])
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  return { start, end, partial: true }
}

async function stream(e, fileId, params) {
  const size = Number(params.get('size')) || 0
  const type = params.get('type') || 'audio/flac'
  const token = await askToken(e.clientId || e.resultingClientId)
  if (!token) {
    await broadcast({ type: 'pelagic:drive-401' })
    return new Response(null, { status: 401 })
  }

  const range = size ? parseRange(e.request.headers.get('range'), size) : null
  if (range && range.start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const headers = { Authorization: `Bearer ${token}` }
  if (range) headers.Range = `bytes=${range.start}-${range.end}`
  else if (e.request.headers.get('range')) headers.Range = e.request.headers.get('range')

  let res
  try {
    res = await fetch(`${API}${encodeURIComponent(fileId)}?alt=media`, { headers, signal: e.request.signal })
  } catch (err) {
    if (err && err.name === 'AbortError') throw err
    return new Response(null, { status: 502, statusText: 'Drive unreachable' })
  }
  if (res.status === 401) {
    await broadcast({ type: 'pelagic:drive-401' })
    return new Response(null, { status: 401 })
  }
  if (!res.ok) return new Response(null, { status: res.status, statusText: res.statusText })

  // Rebuild the response as a same-origin one with headers we control (Drive's CORS doesn't
  // necessarily expose Content-Range, and media elements need it to seek).
  const out = new Headers({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
  if (res.status === 206 && range) {
    const upstream = res.headers.get('content-range')
    const total = (upstream && Number(upstream.split('/')[1])) || size
    out.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
    out.set('Content-Length', String(range.end - range.start + 1))
    return new Response(res.body, { status: 206, headers: out })
  }
  // Range ignored upstream: hand over the whole file
  if (size) out.set('Content-Length', String(size))
  return new Response(res.body, { status: 200, headers: out })
}
