/**
 * Writing to Drive for the Upload page (step 10): folders under Pelagic/, resumable uploads with
 * progress (FLAC files are 30–70 MB), and library.json written back with a merge.
 *
 * Same layout and rules as tools/import/src/stores.js: a file with the same name in the same folder
 * is replaced in place (keeps its id), folders are created on demand and cached.
 */
import { CATALOGUE_NAME, DRIVE_ROOT } from '../config'
import { AuthError, DriveError, FOLDER_MIME, download, driveFetch, findChild } from '../lib/drive'
import { sessionStore } from '../state/session'
import type { Catalogue } from '../state/library'

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── Folders ────────────────────────────────────────── */

const folders = new Map<string, Promise<string>>()

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const found = await findChild(name, parentId, true)
  if (found) return found.id
  const res = await driveFetch('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  return ((await res.json()) as { id: string }).id
}

/** Folder id for Pelagic/<parts…>, creating what's missing. Shared by concurrent callers. */
export function folder(parts: string[]): Promise<string> {
  const key = parts.join('/')
  let p = folders.get(key)
  if (!p) {
    p = parts.length === 0 ? findOrCreateFolder(DRIVE_ROOT, 'root') : folder(parts.slice(0, -1)).then((parent) => findOrCreateFolder(parts.at(-1)!, parent))
    p.catch(() => folders.delete(key))
    folders.set(key, p)
  }
  return p
}

/** Forget cached folder ids (sign-out, or after an error that might mean one was deleted). */
export function resetFolders() {
  folders.clear()
}

/* ── Uploads ────────────────────────────────────────── */

export interface Uploaded {
  id: string
  size: number
}

export interface PutOptions {
  name: string
  /** Pelagic/<parts…> */
  parts: string[]
  mime: string
  data: Blob
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
  /** a resumable session URL from an earlier, interrupted call (Pause → Resume): continue it */
  resume?: string | null
  /** gets the session URL as soon as it exists, so a paused upload can be resumed */
  onSession?: (url: string) => void
}

/** Create or replace Pelagic/<parts>/<name>. Resumable, so a dropped connection picks up where it stopped. */
export async function putFile(o: PutOptions): Promise<Uploaded> {
  if (o.resume) {
    try {
      return await sendResumable(o.resume, o, true)
    } catch (e) {
      // the session is gone (expired, or Drive forgot it): start a new one below
      if (!(e instanceof DriveError && (e.status === 404 || e.status === 410))) throw e
    }
  }
  const parentId = await folder(o.parts)
  const existing = await findChild(o.name, parentId, false)
  const session = await startSession(o, parentId, existing?.id ?? null)
  // no readable Location header (shouldn't happen: Drive exposes it to CORS) → one multipart request
  if (session) o.onSession?.(session)
  return session ? sendResumable(session, o) : sendMultipart(o, parentId, existing?.id ?? null)
}

async function token(): Promise<string> {
  const t = await sessionStore.ensureToken()
  if (!t) throw new AuthError()
  return t
}

async function startSession(o: PutOptions, parentId: string, existingId: string | null): Promise<string | null> {
  const url = existingId ? `${UPLOAD}/${existingId}?uploadType=resumable&fields=id,size` : `${UPLOAD}?uploadType=resumable&fields=id,size`
  const res = await driveFetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': o.mime,
      'X-Upload-Content-Length': String(o.data.size),
    },
    body: JSON.stringify(existingId ? {} : { name: o.name, parents: [parentId] }),
    signal: o.signal,
  })
  return res.headers.get('location')
}

async function sendMultipart(o: PutOptions, parentId: string, existingId: string | null): Promise<Uploaded> {
  const boundary = `pelagic${Math.random().toString(36).slice(2)}`
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(existingId ? {} : { name: o.name, parents: [parentId] })}\r\n`,
    `--${boundary}\r\nContent-Type: ${o.mime}\r\n\r\n`,
    o.data,
    `\r\n--${boundary}--`,
  ])
  const extra = body.size - o.data.size
  for (let attempt = 1; ; attempt++) {
    const url = existingId ? `${UPLOAD}/${existingId}?uploadType=multipart&fields=id,size` : `${UPLOAD}?uploadType=multipart&fields=id,size`
    const r = await xhrSend(existingId ? 'PATCH' : 'POST', url, await token(), body, { 'Content-Type': `multipart/related; boundary=${boundary}` }, (n) => o.onProgress?.(Math.max(0, n - extra), o.data.size), o.signal)
    if (r.status === 200 || r.status === 201) {
      const j = JSON.parse(r.body) as { id: string; size?: string }
      return { id: j.id, size: Number(j.size ?? o.data.size) }
    }
    if (r.status === 401 && attempt === 1 && (await sessionStore.refresh())) continue
    if (r.status === 401) {
      sessionStore.expire()
      throw new AuthError()
    }
    if ((r.status === 0 || r.status === 429 || r.status >= 500) && attempt < 4) {
      await sleep(1000 * 2 ** attempt)
      continue
    }
    throw new DriveError(r.status, r.status ? `Drive answered ${r.status}` : 'Lost the connection to Drive')
  }
}

interface XhrResult {
  status: number
  body: string
  range: string | null
}

const xhrPut = (url: string, auth: string, body: Blob | null, headers: Record<string, string>, onProgress: ((n: number) => void) | null, signal?: AbortSignal) =>
  xhrSend('PUT', url, auth, body, headers, onProgress, signal)

function xhrSend(method: string, url: string, auth: string, body: Blob | null, headers: Record<string, string>, onProgress: ((n: number) => void) | null, signal?: AbortSignal): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open(method, url)
    x.setRequestHeader('Authorization', `Bearer ${auth}`)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    if (onProgress) x.upload.onprogress = (e) => onProgress(e.loaded)
    x.onload = () => resolve({ status: x.status, body: x.responseText, range: x.getResponseHeader('Range') })
    x.onerror = () => resolve({ status: 0, body: '', range: null })
    x.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    const abort = () => x.abort()
    signal?.addEventListener('abort', abort, { once: true })
    x.onloadend = () => signal?.removeEventListener('abort', abort)
    x.send(body)
  })
}

async function sendResumable(url: string, o: PutOptions, resuming = false): Promise<Uploaded> {
  const total = o.data.size
  let offset = 0
  if (resuming) {
    const q = await queryOffset(url, total, o.signal, true)
    if (typeof q !== 'number') {
      o.onProgress?.(total, total)
      return q
    }
    offset = q
  }
  for (let attempt = 1; ; attempt++) {
    o.signal?.throwIfAborted()
    const chunk = offset ? o.data.slice(offset) : o.data
    const headers: Record<string, string> = { 'Content-Type': o.mime }
    if (offset) headers['Content-Range'] = `bytes ${offset}-${total - 1}/${total}`
    const base = offset
    const r = total === 0 ? await xhrPut(url, await token(), o.data, headers, null, o.signal) : await xhrPut(url, await token(), chunk, headers, (n) => o.onProgress?.(base + n, total), o.signal)
    if (r.status === 200 || r.status === 201) {
      o.onProgress?.(total, total)
      const j = JSON.parse(r.body) as { id: string; size?: string }
      return { id: j.id, size: Number(j.size ?? total) }
    }
    if (r.status === 401) {
      if (!(await sessionStore.refresh())) {
        sessionStore.expire()
        throw new AuthError()
      }
    } else if (r.status === 404 || r.status === 410) {
      throw new DriveError(r.status, 'The upload session expired — retry the track')
    } else if (r.status !== 0 && r.status !== 308 && r.status < 500 && r.status !== 429) {
      let msg = `${r.status}`
      try {
        msg = (JSON.parse(r.body) as { error?: { message?: string } }).error?.message ?? msg
      } catch {
        /* not JSON */
      }
      throw new DriveError(r.status, msg)
    }
    if (attempt >= 6) throw new DriveError(r.status, r.status ? `Drive answered ${r.status}` : 'Lost the connection to Drive')
    await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500)
    offset = (await queryOffset(url, total, o.signal)) as number
  }
}

/**
 * Ask the session how much arrived (308 + Range: bytes=0-N). Unknown → start over.
 * `strict` (resuming a paused upload): a finished session returns the file, a dead one throws 404/410.
 */
async function queryOffset(url: string, total: number, signal?: AbortSignal, strict = false): Promise<number | Uploaded> {
  const r = await xhrPut(url, await token(), null, { 'Content-Range': `bytes */${total}` }, null, signal)
  if (r.status === 308) {
    const m = r.range?.match(/bytes=0-(\d+)/)
    return m ? Number(m[1]) + 1 : 0
  }
  if (strict && (r.status === 200 || r.status === 201)) {
    const j = JSON.parse(r.body) as { id: string; size?: string }
    return { id: j.id, size: Number(j.size ?? total) }
  }
  if (strict && (r.status === 404 || r.status === 410)) throw new DriveError(r.status, 'The upload session expired')
  if (strict && r.status === 401) {
    if (!(await sessionStore.refresh())) {
      sessionStore.expire()
      throw new AuthError()
    }
    return queryOffset(url, total, signal, strict)
  }
  return 0
}

/* ── Catalogue ──────────────────────────────────────── */

export interface CatalogueWrite {
  data: Catalogue
  fileId: string
  version: string | null
}

/**
 * Read the newest library.json, apply `change`, write it back. Starts from `cached` when Drive's
 * version still matches it, otherwise downloads (the importer or another device may have written).
 * If Drive's version moved while we were writing, does it again on top of the newer copy.
 */
export async function updateCatalogue(
  change: (c: Catalogue) => void,
  cached: { data: Catalogue | null; version: string | null },
): Promise<CatalogueWrite> {
  const rootId = await folder([])
  for (let attempt = 1; ; attempt++) {
    const meta = await findChild(CATALOGUE_NAME, rootId, false)
    if (!meta) throw new DriveError(404, 'Pelagic/library.json is missing on Drive')
    let base: Catalogue
    if (cached.data && meta.version && meta.version === cached.version) base = structuredClone(cached.data)
    else base = JSON.parse(new TextDecoder().decode(await download(meta.id))) as Catalogue
    change(base)
    base.updatedAt = new Date().toISOString()
    // check right before writing: someone else wrote in the meantime → merge again
    const now = await findChild(CATALOGUE_NAME, rootId, false)
    if (now?.version && meta.version && now.version !== meta.version && attempt < 4) continue
    const res = await driveFetch(`${UPLOAD}/${meta.id}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(base),
    })
    const j = (await res.json()) as { id: string; version?: string }
    return { data: base, fileId: j.id, version: j.version ?? null }
  }
}
