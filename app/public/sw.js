/**
 * Pelagic service worker — Drive streaming proxy (step 3d).
 *
 * <audio src> can't send an Authorization header, so the player points it at
 *   /__pelagic/drive/<fileId>?size=<bytes>&type=<mime>
 * and this worker forwards each (range) request to the Drive API with the page's OAuth token.
 * The token is asked from the page on every request (MessageChannel), so it's never stale and
 * nothing is stored here. It does nothing else: every other request goes to the network untouched.
 */
const MARK = '/__pelagic/drive/'
const API = 'https://www.googleapis.com/drive/v3/files/'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('message', (e) => {
  // a hard reload leaves the page uncontrolled; the page asks us to take it over
  if (e.data && e.data.type === 'pelagic:claim') e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  const at = url.pathname.indexOf(MARK)
  if (at < 0) return
  e.respondWith(stream(e, decodeURIComponent(url.pathname.slice(at + MARK.length)), url.searchParams))
})

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
