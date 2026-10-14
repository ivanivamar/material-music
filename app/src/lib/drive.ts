/**
 * Thin Google Drive v3 client over fetch. Adds the OAuth header, retries 429/5xx with backoff,
 * and turns 401 into an expired session (AuthError) instead of a generic failure.
 */
import { CATALOGUE_NAME, DRIVE_ROOT } from '../config'
import { sessionStore } from '../state/session'

const API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class AuthError extends Error {
  constructor() {
    super('Google session expired')
    this.name = 'AuthError'
  }
}
export class DriveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'DriveError'
    this.status = status
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function driveFetch(path: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    const token = sessionStore.token()
    if (!token) throw new AuthError()
    let res: Response
    try {
      res = await fetch(path.startsWith('http') ? path : API + path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      })
    } catch (e) {
      // network down / CORS abort: retry, then surface
      if (i >= tries || init.signal?.aborted) throw e
      await sleep(800 * 2 ** (i - 1))
      continue
    }
    if (res.status === 401) {
      sessionStore.expire()
      throw new AuthError()
    }
    if ((res.status === 429 || res.status >= 500) && i < tries) {
      await sleep(1000 * 2 ** (i - 1) + Math.random() * 400)
      continue
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body.error?.message) msg = body.error.message
      } catch {
        /* not JSON */
      }
      throw new DriveError(res.status, msg)
    }
    return res
  }
}

export interface DriveFile {
  id: string
  name: string
  size?: string
  modifiedTime?: string
  version?: string
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const FIELDS = 'id,name,size,modifiedTime,version'

async function findChild(name: string, parentId: string, folder: boolean): Promise<DriveFile | null> {
  const mime = folder ? `mimeType = '${FOLDER_MIME}'` : `mimeType != '${FOLDER_MIME}'`
  const params = new URLSearchParams({
    q: `name = '${q(name)}' and '${parentId}' in parents and ${mime} and trashed = false`,
    fields: `files(${FIELDS})`,
    spaces: 'drive',
    pageSize: '1',
    orderBy: 'modifiedTime desc',
  })
  const res = await driveFetch(`/files?${params}`)
  const { files } = (await res.json()) as { files: DriveFile[] }
  return files[0] ?? null
}

/** Pelagic/library.json metadata, or null when the folder or file doesn't exist. */
export async function findCatalogue(): Promise<DriveFile | null> {
  const root = await findChild(DRIVE_ROOT, 'root', true)
  if (!root) return null
  return findChild(CATALOGUE_NAME, root.id, false)
}

export async function getMeta(fileId: string): Promise<DriveFile> {
  const res = await driveFetch(`/files/${fileId}?fields=${FIELDS}`)
  return (await res.json()) as DriveFile
}

/**
 * Download a file's bytes, reporting progress. `total` falls back to the Drive size because
 * Content-Length is missing when the response is gzip-encoded.
 */
export async function download(
  fileId: string,
  opts: { total?: number; onProgress?: (received: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const res = await driveFetch(`/files/${fileId}?alt=media`, { signal: opts.signal })
  const total = Number(res.headers.get('content-length')) || opts.total || 0
  if (!res.body || !opts.onProgress) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    opts.onProgress(received, Math.max(total, received))
  }
  const out = new Uint8Array(received)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.byteLength
  }
  return out
}

export async function downloadBlob(fileId: string, signal?: AbortSignal): Promise<Blob> {
  const res = await driveFetch(`/files/${fileId}?alt=media`, { signal })
  return res.blob()
}
