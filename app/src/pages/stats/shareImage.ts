/**
 * Yearly recap as a shareable image (Nov 2026): a 1080×1920 PNG (story format) drawn on a canvas from
 * the year's stats — hours, listening by month, the top artist, top 5 songs, top genres. Colours
 * come from the #1 album's cover, with the same fine grain as the mix covers.
 *
 * Sharing: the Android app writes the PNG to its cache and opens the share sheet (Capacitor Share +
 * Filesystem); a browser uses the Web Share API when it can share files, else downloads the file.
 */
import { Capacitor } from '@capacitor/core'
import { loadCover } from '../../lib/covers'
import { genreHue } from '../../lib/mixing'
import { dominantColor, fromOklch, rgba, tintFrom, toOklch } from '../../design/tint'

type RGB = ReturnType<typeof dominantColor>
import type { Catalogue } from '../../state/library'
import { fmtHours, MONTHS, type GenreShare, type PeriodStats } from '../../state/stats'

const W = 1080
const H = 1920
const PAD = 88
const SANS = `'Google Sans Flex Variable', 'Noto Sans JP', system-ui, sans-serif`
const font = (weight: number, px: number) => `${weight} ${px}px ${SANS}`

const INK = '#f4eeea'
const INK2 = 'rgba(244,238,234,0.72)'
const INK3 = 'rgba(244,238,234,0.5)'
const CORAL = '#F39A7D'

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((done) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => done(img)
    img.onerror = () => done(null)
    img.src = src
  })
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, radius: number) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, radius)
  ctx.clip()
  const s = Math.min(img.naturalWidth, img.naturalHeight)
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, size, size)
  ctx.restore()
}

function grain(ctx: CanvasRenderingContext2D, amount: number) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  let s = 1234567
  for (let i = 0; i < d.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const n = ((s >>> 24) - 128) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

export interface RecapImageInput {
  c: Catalogue
  stats: PeriodStats
  genres: GenreShare[]
  year: number
  /** the year isn't over yet ("so far") */
  partial: boolean
  /** "Counting since 15 Oct 2026" when history started inside the year */
  since: string | null
}

export async function renderRecapImage({ c, stats, genres, year, partial, since }: RecapImageInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await Promise.all([document.fonts.load(font(700, 100)), document.fonts.load(font(500, 40)), document.fonts.load(`500 40px 'Noto Sans JP'`)]).catch(() => {})

  const topAlbum = stats.topAlbums[0]?.item
  const topArtist = stats.topArtists[0]
  const songs = stats.topTracks.slice(0, 5)
  const [albumImg, artistImg, ...songImgs] = await Promise.all([
    topAlbum?.cover ? loadCover(topAlbum.cover).then(loadImage) : Promise.resolve(null),
    topArtist?.item.image ? loadCover(topArtist.item.image.id, topArtist.item.image.v).then(loadImage) : Promise.resolve(null),
    ...songs.map((s) => {
      const cv = c.albums[s.item.albumId]?.cover
      return cv ? loadCover(cv).then(loadImage) : Promise.resolve(null)
    }),
  ])

  const rgb: RGB = albumImg ? dominantColor(albumImg) : [243, 154, 125]
  const t = tintFrom(rgb)
  // a light accent in the cover's hue (coral for grey / missing covers), readable on the dark ground
  const [, C, Hh] = toOklch(rgb)
  const accent = C < 0.04 ? CORAL : rgba(fromOklch(0.82, Math.min(Math.max(C, 0.08), 0.13), Hh), 1)

  /* background */
  ctx.fillStyle = '#141110'
  ctx.fillRect(0, 0, W, H)
  const g1 = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, W * 1.0)
  g1.addColorStop(0, rgba(t.wash, 0.85))
  g1.addColorStop(1, rgba(t.wash, 0))
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)
  const g2 = ctx.createRadialGradient(W * 0.1, H * 0.95, 0, W * 0.1, H * 0.95, W * 1.1)
  g2.addColorStop(0, rgba(t.deep, 0.9))
  g2.addColorStop(1, rgba(t.deep, 0))
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)
  // the #1 album, big and tilted in the top-right corner
  if (albumImg) {
    ctx.save()
    ctx.translate(W - 196, 330)
    ctx.rotate((8 * Math.PI) / 180)
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 60
    ctx.shadowOffsetY = 24
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.roundRect(-125, -125, 250, 250, 32)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    cover(ctx, albumImg, -125, -125, 250, 32)
    ctx.restore()
  }

  /* header */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = accent
  ctx.font = font(700, 30)
  ctx.letterSpacing = '4px'
  ctx.fillText('MATERIAL MUSIC', PAD, 150)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = INK
  ctx.font = font(750, 150)
  ctx.fillText(`My ${year}`, PAD - 6, 310)
  ctx.fillStyle = INK2
  ctx.font = font(500, 60)
  ctx.fillText(partial ? 'in music, so far' : 'in music', PAD, 390)

  /* hours */
  ctx.fillStyle = accent
  ctx.font = font(800, 210)
  const hours = fmtHours(stats.seconds)
  ctx.fillText(hours, PAD - 8, 640)
  const hw = ctx.measureText(hours).width
  ctx.fillStyle = INK
  ctx.font = font(600, 44)
  ctx.fillText(stats.seconds / 3600 < 1.05 ? 'hour of music' : 'hours of music', PAD + hw + 24, 640)
  ctx.fillStyle = INK2
  ctx.font = font(500, 34)
  const counts = [`${stats.plays.toLocaleString('en-US')} plays`, `${stats.tracks.toLocaleString('en-US')} songs`, `${stats.artists.toLocaleString('en-US')} artists`, `${stats.days} days`].join('  ·  ')
  ctx.fillText(ellipsize(ctx, counts, W - PAD * 2), PAD, 710)

  /* listening by month */
  const max = Math.max(1, ...stats.buckets.map((b) => b.seconds))
  const gap = 14
  const bw = (W - PAD * 2 - gap * 11) / 12
  const base = 860
  stats.buckets.forEach((b, i) => {
    const h = b.seconds ? Math.max(8, (b.seconds / max) * 96) : 4
    const x = PAD + i * (bw + gap)
    ctx.fillStyle = i === stats.peak ? accent : b.seconds ? 'rgba(244,238,234,0.28)' : 'rgba(244,238,234,0.1)'
    ctx.beginPath()
    ctx.roundRect(x, base - h, bw, h, 8)
    ctx.fill()
    ctx.fillStyle = i === stats.peak ? INK : INK3
    ctx.font = font(i === stats.peak ? 700 : 500, 22)
    ctx.textAlign = 'center'
    ctx.fillText(MONTHS[i][0], x + bw / 2, base + 34)
    ctx.textAlign = 'left'
  })

  /* top artist */
  let y = 980
  const label = (text: string, at: number) => {
    ctx.fillStyle = INK3
    ctx.font = font(700, 26)
    ctx.letterSpacing = '3px'
    ctx.fillText(text, PAD, at)
    ctx.letterSpacing = '0px'
  }
  if (topArtist) {
    label('TOP ARTIST', y)
    const d = 150
    const ay = y + 24
    ctx.save()
    ctx.beginPath()
    ctx.arc(PAD + d / 2, ay + d / 2, d / 2, 0, Math.PI * 2)
    ctx.clip()
    if (artistImg) cover(ctx, artistImg, PAD, ay, d, 0)
    else {
      ctx.fillStyle = `oklch(0.5 0.1 ${genreHue(topArtist.item.name)})`
      ctx.fillRect(PAD, ay, d, d)
      ctx.fillStyle = INK
      ctx.font = font(700, 64)
      ctx.textAlign = 'center'
      ctx.fillText(topArtist.item.name.slice(0, 1).toUpperCase(), PAD + d / 2, ay + d / 2 + 22)
      ctx.textAlign = 'left'
    }
    ctx.restore()
    ctx.fillStyle = INK
    ctx.font = font(700, 64)
    ctx.fillText(ellipsize(ctx, topArtist.item.name, W - PAD * 2 - d - 36), PAD + d + 36, ay + 82)
    ctx.fillStyle = INK2
    ctx.font = font(500, 32)
    ctx.fillText(`${topArtist.plays.toLocaleString('en-US')} plays · ${fmtHours(topArtist.seconds)} h`, PAD + d + 36, ay + 132)
    y = ay + d + 70
  }

  /* top songs */
  label('TOP SONGS', y)
  let ry = y + 28
  const row = 92
  songs.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? accent : INK3
    ctx.font = font(700, 40)
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), PAD + 18, ry + 52)
    ctx.textAlign = 'left'
    const img = songImgs[i]
    const cx = PAD + 56
    if (img) cover(ctx, img, cx, ry + 6, 72, 14)
    else {
      ctx.fillStyle = 'rgba(244,238,234,0.12)'
      ctx.beginPath()
      ctx.roundRect(cx, ry + 6, 72, 72, 14)
      ctx.fill()
    }
    const tx = cx + 96
    const playsTxt = `${s.plays}`
    ctx.font = font(600, 30)
    const pw = ctx.measureText(playsTxt).width
    ctx.fillStyle = INK
    ctx.font = font(600, 38)
    ctx.fillText(ellipsize(ctx, s.item.title, W - PAD - tx - pw - 40), tx, ry + 38)
    ctx.fillStyle = INK2
    ctx.font = font(500, 28)
    ctx.fillText(ellipsize(ctx, s.item.artist, W - PAD - tx - pw - 40), tx, ry + 76)
    ctx.fillStyle = INK3
    ctx.font = font(600, 30)
    ctx.textAlign = 'right'
    ctx.fillText(playsTxt, W - PAD, ry + 52)
    ctx.textAlign = 'left'
    ry += row
  })
  if (songs.length) {
    ctx.fillStyle = INK3
    ctx.font = font(500, 22)
    ctx.textAlign = 'right'
    ctx.fillText('PLAYS', W - PAD, y)
    ctx.textAlign = 'left'
  }

  /* top genres */
  const gl = genres.slice(0, 4)
  if (gl.length) {
    const gy = ry + 56
    label('TOP GENRES', gy)
    let gx = PAD
    const cy = gy + 26
    for (const gs of gl) {
      const pct = `${Math.max(1, Math.round(gs.share * 100))}%`
      ctx.font = font(600, 32)
      const nameW = ctx.measureText(gs.name).width
      ctx.font = font(500, 28)
      const pctW = ctx.measureText(pct).width
      const w = Math.min(nameW, 360) + pctW + 66
      if (gx + w > W - PAD) break
      const hue = genreHue(gs.name)
      ctx.fillStyle = `oklch(0.42 0.09 ${hue} / 0.85)`
      ctx.beginPath()
      ctx.roundRect(gx, cy, w, 64, 22)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.font = font(600, 32)
      ctx.fillText(ellipsize(ctx, gs.name, 360), gx + 26, cy + 43)
      ctx.fillStyle = `oklch(0.88 0.06 ${hue})`
      ctx.font = font(500, 28)
      ctx.fillText(pct, gx + w - 26 - pctW, cy + 43)
      gx += w + 14
    }
  }

  /* when history started inside the year: say so, under the title */
  if (since) {
    ctx.fillStyle = INK3
    ctx.font = font(500, 26)
    ctx.fillText(`Counting since ${since}`, PAD, 440)
  }

  grain(ctx, 0.09)
  return await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('Couldn’t make the image'))), 'image/png'))
}

/* ── Sharing ────────────────────────────────────────── */

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export const canSaveFile = () => !Capacitor.isNativePlatform()

/** Open the share sheet with the image. Returns false when nothing could share it (then offer Save). */
export async function shareImage(blob: Blob, name: string, title: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const { uri } = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache })
    try {
      await Share.share({ title, files: [uri], dialogTitle: title })
    } catch (e) {
      // closing the share sheet without picking anything isn't an error
      if (!/cancel/i.test((e as Error).message ?? '')) throw e
    }
    return true
  }
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e
    }
    return true
  }
  return false
}

/** Browser: save the PNG (a download). */
export function saveImage(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
