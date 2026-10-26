/**
 * FLAC → Opus 160 (Ogg) in the browser, for the phone copy (step 10, Upload).
 *
 * The browser decodes the FLAC (Web Audio, resampled to 48 kHz), WebCodecs' AudioEncoder runs
 * libopus, and a small Ogg muxer writes the file (RFC 7845): OpusHead, OpusTags with the FLAC's
 * Vorbis comments (lyrics included, pictures dropped — like the importer's ffmpeg -map_metadata 0),
 * then the audio pages. The last page's granule trims the encoder's end padding.
 */

export const OPUS_BITRATE = 160_000
const RATE = 48_000

let support: Promise<boolean> | null = null
/** Chrome / Edge (94+) and recent Firefox have it; Safari does not encode Opus. */
export function canEncodeOpus(): Promise<boolean> {
  support ??= (async () => {
    try {
      if (typeof AudioEncoder === 'undefined' || typeof OfflineAudioContext === 'undefined') return false
      const r = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: RATE, numberOfChannels: 2, bitrate: OPUS_BITRATE })
      return !!r.supported
    } catch {
      return false
    }
  })()
  return support
}

export interface EncodeOptions {
  /** Vorbis comments to carry over (KEY, value); pictures are skipped */
  comments: [string, string][]
  /** written to OpusHead as the original input rate */
  inputRate?: number
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

export async function flacToOpus(file: Blob, opts: EncodeOptions): Promise<Blob> {
  const buf = await decode(file)
  opts.signal?.throwIfAborted()
  return encode(buf, opts)
}

async function decode(file: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: RATE })
  let buf: AudioBuffer
  try {
    buf = await ctx.decodeAudioData(await file.arrayBuffer())
  } catch {
    throw new Error('The browser couldn’t decode this FLAC')
  }
  if (buf.numberOfChannels <= 2) return buf
  // surround → stereo with Web Audio's standard down-mix
  const mix = new OfflineAudioContext({ numberOfChannels: 2, length: buf.length, sampleRate: RATE })
  const src = mix.createBufferSource()
  src.buffer = buf
  src.connect(mix.destination)
  src.start()
  return mix.startRendering()
}

async function encode(buf: AudioBuffer, opts: EncodeOptions): Promise<Blob> {
  const channels = buf.numberOfChannels
  const total = buf.length
  const packets: { data: Uint8Array; samples: number }[] = []
  const got: { head: Uint8Array | null } = { head: null }
  let failure: unknown = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      packets.push({ data, samples: Math.round(((chunk.duration ?? 20_000) * RATE) / 1e6) })
      const d = meta?.decoderConfig?.description
      if (d && !got.head) got.head = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array((d as ArrayBufferView).buffer, (d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteLength).slice()
    },
    error: (e) => {
      failure = e
    },
  })
  enc.configure({ codec: 'opus', sampleRate: RATE, numberOfChannels: channels, bitrate: OPUS_BITRATE, bitrateMode: 'variable' })

  const planes = Array.from({ length: channels }, (_, c) => buf.getChannelData(c))
  const STEP = RATE // 1 s per AudioData
  try {
    for (let at = 0; at < total; at += STEP) {
      if (failure) throw failure
      opts.signal?.throwIfAborted()
      const n = Math.min(STEP, total - at)
      const data = new Float32Array(n * channels)
      for (let c = 0; c < channels; c++) data.set(planes[c].subarray(at, at + n), c * n)
      enc.encode(new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((at / RATE) * 1e6), data }))
      // keep the encoder's queue short (memory) and report progress
      while (enc.encodeQueueSize > 8) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }))
      opts.onProgress?.((at + n) / total)
    }
    await enc.flush()
    if (failure) throw failure
  } finally {
    if (enc.state !== 'closed') enc.close()
  }

  const h = got.head
  const preSkip = h && h.length >= 19 && String.fromCharCode(...h.subarray(0, 8)) === 'OpusHead' ? new DataView(h.buffer).getUint16(10, true) : 312
  return muxOgg({ channels, preSkip, inputRate: opts.inputRate ?? 44_100, total, packets, comments: opts.comments })
}

/* ── Ogg ─────────────────────────────────────────────── */

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()
function crc32(b: Uint8Array): number {
  let c = 0
  for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 0xff]) >>> 0
  return c
}

interface MuxInput {
  channels: number
  preSkip: number
  inputRate: number
  total: number
  packets: { data: Uint8Array; samples: number }[]
  comments: [string, string][]
}

export function muxOgg(m: MuxInput): Blob {
  const serial = (Math.random() * 0xffffffff) >>> 0
  const pages: Uint8Array[] = []
  let seq = 0

  const page = (segs: number[], body: Uint8Array[], granule: number, flags: number) => {
    const size = body.reduce((s, b) => s + b.length, 0)
    const p = new Uint8Array(27 + segs.length + size)
    const v = new DataView(p.buffer)
    p.set([0x4f, 0x67, 0x67, 0x53]) // OggS
    p[4] = 0
    p[5] = flags
    v.setUint32(6, granule % 2 ** 32, true)
    v.setUint32(10, Math.floor(granule / 2 ** 32), true)
    v.setUint32(14, serial, true)
    v.setUint32(18, seq++, true)
    p[26] = segs.length
    p.set(segs, 27)
    let o = 27 + segs.length
    for (const b of body) {
      p.set(b, o)
      o += b.length
    }
    v.setUint32(22, crc32(p), true)
    pages.push(p)
  }

  /** a header packet on its own page(s) */
  const headerPacket = (data: Uint8Array, first: boolean) => {
    let at = 0
    let cont = false
    for (;;) {
      const segs: number[] = []
      const start = at
      while (segs.length < 255) {
        const n = Math.min(255, data.length - at)
        segs.push(n)
        at += n
        if (n < 255) break
      }
      const done = segs[segs.length - 1] < 255
      page(segs, [data.subarray(start, at)], 0, (first && !cont ? 0x02 : 0) | (cont ? 0x01 : 0))
      if (done) return
      cont = true
    }
  }

  // OpusHead
  const head = new Uint8Array(19)
  const hv = new DataView(head.buffer)
  head.set(new TextEncoder().encode('OpusHead'))
  head[8] = 1
  head[9] = m.channels
  hv.setUint16(10, m.preSkip, true)
  hv.setUint32(12, m.inputRate, true)
  hv.setInt16(16, 0, true)
  head[18] = 0
  headerPacket(head, true)
  headerPacket(opusTags(m.comments), false)

  // audio: ~1 s of packets per page; a packet never spans pages (Opus packets are < 255·255 bytes)
  const end = m.preSkip + m.total
  let granule = 0 // samples (48 kHz, pre-skip included) of the packets that end on this page
  let segs: number[] = []
  let body: Uint8Array[] = []
  let samples = 0
  const flush = (last: boolean) => {
    if (!segs.length) return
    granule += samples
    page(segs, body, last ? Math.min(granule, end) : granule, last ? 0x04 : 0)
    segs = []
    body = []
    samples = 0
  }
  m.packets.forEach((p, i) => {
    const lace: number[] = []
    let n = p.data.length
    while (n >= 255) {
      lace.push(255)
      n -= 255
    }
    lace.push(n)
    if (segs.length + lace.length > 255 || samples >= RATE) flush(false)
    segs.push(...lace)
    body.push(p.data)
    samples += p.samples
    if (i === m.packets.length - 1) flush(true)
  })
  return new Blob(pages as BlobPart[], { type: 'audio/ogg' })
}

function opusTags(comments: [string, string][]): Uint8Array {
  const enc = new TextEncoder()
  const vendor = enc.encode('Material Music (WebCodecs libopus)')
  const list = comments
    .filter(([k]) => k !== 'METADATA_BLOCK_PICTURE' && k !== 'COVERART' && k !== 'COVERARTMIME')
    .map(([k, v]) => enc.encode(`${k}=${v}`))
  const size = 8 + 4 + vendor.length + 4 + list.reduce((s, c) => s + 4 + c.length, 0)
  const out = new Uint8Array(size)
  const v = new DataView(out.buffer)
  out.set(enc.encode('OpusTags'))
  let o = 8
  v.setUint32(o, vendor.length, true)
  out.set(vendor, (o += 4))
  o += vendor.length
  v.setUint32(o, list.length, true)
  o += 4
  for (const c of list) {
    v.setUint32(o, c.length, true)
    out.set(c, (o += 4))
    o += c.length
  }
  return out
}
