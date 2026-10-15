/**
 * Artist photo / banner for the Upload page — the same rules as tools/import/src/artists.js:
 *
 *   artist.jpg (.png/.webp)             → square 600×600 photo   covers/artists/<artistId>.jpg
 *   artist_background.jpg (…)           → banner, max 1920 wide  covers/artists/<artistId>_bg.jpg
 *   no artist.jpg and no photo yet      → Deezer photo (via the site's /api/deezer helper)
 *
 * A photo/banner from a dropped file is stored with `source: 'local'` and the file's mtime, exactly
 * like the importer does, so a later `npm run import` sees it as unchanged. Failures never block
 * the tracks: the artist just keeps its monogram until the importer (or a later upload) fills it in.
 */
import { idbSet } from '../lib/idb'
import { isNative } from '../native/bridge'
import type { Artist, ArtistImage } from '../state/library'
import { putFile } from './driveWrite'

const API = `${import.meta.env.BASE_URL}api/deezer/`
const HEADERS = { 'X-Pelagic': '1' }

export interface ArtistSources {
  photo?: File | null
  bg?: File | null
}

export interface ArtistPatch {
  image?: ArtistImage
  background?: NonNullable<Artist['background']>
  deezerId?: number
}

/** Cover-crop to size×size (ffmpeg: scale=…:force_original_aspect_ratio=increase,crop=…). */
async function cropSquare(img: Blob, size = 600): Promise<Blob> {
  const bmp = await createImageBitmap(img)
  const k = Math.max(size / bmp.width, size / bmp.height)
  const w = bmp.width * k
  const h = bmp.height * k
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h)
  bmp.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}

/** Banner: at most 1920 wide, aspect kept. */
async function wide(img: Blob, maxW = 1920): Promise<Blob> {
  const bmp = await createImageBitmap(img)
  const k = Math.min(1, maxW / bmp.width)
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
}

/** Deezer artist photo via the site's helper; null when there is none, or no helper (local dev, Android). */
async function deezerPhoto(name: string, albumTitles: string[]): Promise<{ id: number; blob: Blob } | null> {
  if (isNative) return null
  const q = new URLSearchParams({ name })
  for (const t of albumTitles.slice(0, 60)) q.append('a', t)
  const res = await fetch(`${API}artist?${q}`, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null
  const j = (await res.json()) as { found?: boolean; id?: number; pictureUrl?: string }
  if (!j.found || !j.pictureUrl || typeof j.id !== 'number') return null
  const img = await fetch(`${API}image?url=${encodeURIComponent(j.pictureUrl)}`, { headers: HEADERS })
  if (!img.ok) return null
  return { id: j.id, blob: await img.blob() }
}

async function put(name: string, blob: Blob) {
  const up = await putFile({ name, parts: ['covers', 'artists'], mime: 'image/jpeg', data: blob })
  const v = Date.now()
  void idbSet('covers', `${up.id}@${v}`, blob) // shows straight away, no download
  return { id: up.id, v }
}

/**
 * What to write into the catalogue's artist entry, uploading the images first.
 * `artist` = the entry as it is now (undefined for a brand-new artist).
 */
export async function prepareArtist(artist: Artist | undefined, artistId: string, name: string, albumTitles: string[], src: ArtistSources): Promise<ArtistPatch | null> {
  const patch: ArtistPatch = {}

  try {
    if (src.photo) {
      const same = artist?.image?.source === 'local' && artist.image.mtime === src.photo.lastModified
      if (!same) {
        const up = await put(`${artistId}.jpg`, await cropSquare(src.photo))
        patch.image = { ...up, source: 'local', mtime: src.photo.lastModified }
      }
    } else if (!artist?.image || artist.image.source === 'mosaic') {
      const dz = await deezerPhoto(name, albumTitles)
      if (dz) {
        const up = await put(`${artistId}.jpg`, await cropSquare(dz.blob))
        patch.image = { ...up, source: 'deezer' }
        patch.deezerId = dz.id
      }
    }
  } catch (e) {
    console.warn(`Artist photo for ${name}:`, e)
  }

  try {
    if (src.bg && artist?.background?.mtime !== src.bg.lastModified) {
      const up = await put(`${artistId}_bg.jpg`, await wide(src.bg))
      patch.background = { ...up, mtime: src.bg.lastModified }
    }
  } catch (e) {
    console.warn(`Artist banner for ${name}:`, e)
  }

  return Object.keys(patch).length ? patch : null
}
