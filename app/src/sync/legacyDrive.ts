/**
 * The Drive JSON files the cloud stores replaced (step 39): read once per device to migrate
 * (sync/cloud.ts → migrateOnce), then moved to the Drive trash from Settings → Cloud data.
 *
 *   Pelagic/history.json · recent.json · dj.json · playlists/<id>.json
 *
 * Playlist covers (`playlists/<id>.jpg`) stay: the playlists still point at them.
 */
import { DRIVE_ROOT, HISTORY_NAME, PLAYLISTS_DIR } from '../config'
import { download, driveFetch, findChild, FOLDER_MIME } from '../lib/drive'

export const LEGACY_ROOT_FILES = [HISTORY_NAME, 'recent.json', 'dj.json'] as const

async function rootId(): Promise<string | null> {
  return (await findChild(DRIVE_ROOT, 'root', true))?.id ?? null
}

/** Parsed `Pelagic/<name>`, or null when it isn't there. */
export async function readRootJson<T>(name: string): Promise<T | null> {
  const root = await rootId()
  if (!root) return null
  const meta = await findChild(name, root, false)
  if (!meta) return null
  return JSON.parse(new TextDecoder().decode(await download(meta.id))) as T
}

interface Listed {
  id: string
  name: string
  trashed?: boolean
}

async function listJson(parent: string, includeTrashed: boolean): Promise<Listed[]> {
  const out: Listed[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${parent}' in parents and mimeType != '${FOLDER_MIME}'${includeTrashed ? '' : ' and trashed = false'}`,
      fields: 'nextPageToken,files(id,name,trashed)',
      spaces: 'drive',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(`/files?${params}`)
    const j = (await res.json()) as { files: Listed[]; nextPageToken?: string }
    out.push(...j.files.filter((f) => f.name.endsWith('.json')))
    pageToken = j.nextPageToken
  } while (pageToken)
  return out
}

async function playlistsFolder(): Promise<string | null> {
  const root = await rootId()
  if (!root) return null
  return (await findChild(PLAYLISTS_DIR, root, true))?.id ?? null
}

/** Every playlists/<id>.json (trashed ones too: they were deleted playlists), parsed. */
export async function readPlaylistFiles(): Promise<{ id: string; trashed: boolean; raw: unknown }[]> {
  const folder = await playlistsFolder()
  if (!folder) return []
  const out: { id: string; trashed: boolean; raw: unknown }[] = []
  for (const f of await listJson(folder, true)) {
    try {
      const raw: unknown = JSON.parse(new TextDecoder().decode(await download(f.id)))
      out.push({ id: f.name.replace(/\.json$/, ''), trashed: !!f.trashed, raw })
    } catch {
      /* unreadable file: skip it */
    }
  }
  return out
}

export interface LegacyFile {
  id: string
  name: string
}

/** The old JSON files still in Drive (not trashed). */
export async function listLegacyFiles(): Promise<LegacyFile[]> {
  const root = await rootId()
  if (!root) return []
  const out: LegacyFile[] = []
  for (const name of LEGACY_ROOT_FILES) {
    const f = await findChild(name, root, false)
    if (f) out.push({ id: f.id, name })
  }
  const folder = await findChild(PLAYLISTS_DIR, root, true)
  if (folder) for (const f of await listJson(folder.id, false)) out.push({ id: f.id, name: `${PLAYLISTS_DIR}/${f.name}` })
  return out
}

/** Move them to the Drive trash (recoverable there for 30 days). Returns how many moved. */
export async function trashLegacyFiles(files: LegacyFile[]): Promise<number> {
  let n = 0
  for (const f of files) {
    await driveFetch(`/files/${f.id}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) })
    n++
  }
  return n
}
