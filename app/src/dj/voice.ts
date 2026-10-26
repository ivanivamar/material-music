/**
 * DJ intros (step 22c): the audio of each session's spoken line, prepared when the session is
 * built (one ahead), so an intro starts with no gap and plays offline once prepared.
 *
 * Every intro is an audio item the engines play like a track (PC: a blob URL in htmlEngine;
 * Android: a file the native player plays from the phone, with the DJ mark as art):
 *
 *   voice   Google Cloud Text-to-Speech through /api/voice (male English voice). Decoded once to a
 *           loudness envelope (30 values a second, smoothed: fast attack, slow release) that drives
 *           the ripple and the level bars on PC and Android alike, plus word start times for the
 *           subtitle (exact from SSML marks when the voice gives them, else estimated from the
 *           voiced parts of the envelope).
 *   system  PC fallback when the service can't be used: a male English system voice from an
 *           allow-list (Edge / Windows natural voices, Google UK English Male) speaks over a
 *           silent item; word-boundary events pulse the mark. Never a robotic default voice.
 *   silent  Voice off, offline with nothing prepared, over the monthly cap, or no allowed voice:
 *           the line shows as text for 5 seconds over silence.
 *
 * Cache: memory + IndexedDB `kv` (`dj-intro:<sessionId>`), dropped when the session leaves the queue.
 */
import { useSyncExternalStore } from 'react'
import { idbGet, idbSet } from '../lib/idb'
import { isNative, PelagicPlayer } from '../native/bridge'
import { markPng } from './mark'

export type IntroKind = 'voice' | 'system' | 'silent'
export type SilentReason = 'off' | 'unavailable' | 'offline' | 'cap'

export interface IntroAudio {
  sessionId: string
  line: string
  kind: IntroKind
  reason: SilentReason | null
  /** audio/mpeg (voice) or audio/wav (silence) */
  blob: Blob
  /** seconds */
  duration: number
  /** loudness 0..1 at ENV_RATE per second (empty for system / silent) */
  env: number[]
  /** start time of each word of `line` (seconds) */
  words: number[]
  /** system voice name (kind 'system') */
  systemVoice?: string
}

export const ENV_RATE = 30
export const TEXT_INTRO_SECONDS = 5

/** Hooks into the DJ store (usage counter, prefs) without an import cycle. */
export interface VoiceHost {
  voiceOn(): boolean
  allowed(chars: number): boolean
  spend(chars: number): void
}
let host: VoiceHost = { voiceOn: () => true, allowed: () => true, spend: () => {} }
export const setVoiceHost = (h: VoiceHost) => {
  host = h
}

/** Where /api lives: the site itself on PC; the Firebase copy of the site from the Android app. */
const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://material-music-app.web.app/') : import.meta.env.BASE_URL

const words = (line: string) => line.split(/\s+/).filter(Boolean)

/* ── State ──────────────────────────────────────────── */

const ready = new Map<string, IntroAudio>()
const pending = new Map<string, Promise<IntroAudio>>()
const urls = new Map<string, string>()
const files = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
/** the voice service said it isn't set up: don't ask again for a while */
let unconfiguredUntil = 0

/* ── Audio helpers ──────────────────────────────────── */

/** A silent 8 kHz mono WAV of `seconds`. */
export function silentWav(seconds: number): Blob {
  const rate = 8000
  const n = Math.round(rate * seconds)
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128) // 8-bit PCM silence
  return new Blob([buf], { type: 'audio/wav' })
}

/** Loudness envelope of decoded audio: RMS per frame, normalised, attack ~40 ms / release ~200 ms. */
export function envelopeOf(samples: Float32Array, sampleRate: number): number[] {
  const hop = Math.max(1, Math.round(sampleRate / ENV_RATE))
  const raw: number[] = []
  for (let i = 0; i < samples.length; i += hop) {
    let s = 0
    const end = Math.min(samples.length, i + hop)
    for (let k = i; k < end; k++) s += samples[k] * samples[k]
    raw.push(Math.sqrt(s / Math.max(1, end - i)))
  }
  const sorted = [...raw].sort((a, b) => a - b)
  const ref = sorted[Math.floor(sorted.length * 0.95)] || 1
  const dt = 1 / ENV_RATE
  const att = 1 - Math.exp(-dt / 0.04)
  const rel = 1 - Math.exp(-dt / 0.2)
  let y = 0
  return raw.map((x) => {
    const t = Math.min(1, x / ref)
    y += (t - y) * (t > y ? att : rel)
    return Math.round(y * 1000) / 1000
  })
}

/** Word start times from the voiced parts of the envelope (no marks from the voice). */
export function estimateWords(line: string, env: number[], duration: number): number[] {
  const ws = words(line)
  if (!ws.length) return []
  const voiced: number[] = []
  env.forEach((v, i) => v > 0.12 && voiced.push(i / ENV_RATE))
  if (voiced.length < ws.length) {
    const lead = 0.3
    const span = Math.max(0.5, duration - lead - 0.3)
    const total = ws.reduce((a, w) => a + w.length + 1, 0)
    let acc = 0
    return ws.map((w) => {
      const t = lead + (acc / total) * span
      acc += w.length + 1
      return t
    })
  }
  const total = ws.reduce((a, w) => a + w.length + 1, 0)
  let acc = 0
  return ws.map((w) => {
    const t = voiced[Math.min(voiced.length - 1, Math.floor((acc / total) * voiced.length))]
    acc += w.length + 1
    return t
  })
}

async function decode(blob: Blob): Promise<{ env: number[]; duration: number }> {
  const Ctx = (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext) as typeof OfflineAudioContext | undefined
  if (!Ctx) throw new Error('No Web Audio')
  const ctx = new Ctx(1, 1, 44100)
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
  return { env: envelopeOf(audio.getChannelData(0), audio.sampleRate), duration: audio.duration }
}

const b64ToBlob = (b64: string, type: string) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/* ── System voice (PC fallback) ─────────────────────── */

const ALLOWED_SYSTEM = /(Microsoft (Guy|Ryan|Christopher|Eric|Andrew|Brian|Davis|Roger|Steffan|Thomas|William|Liam).*(Natural|Online))|Google UK English Male/i

export function systemVoice(): SpeechSynthesisVoice | null {
  if (isNative || typeof speechSynthesis === 'undefined') return null
  return speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang) && ALLOWED_SYSTEM.test(v.name)) ?? null
}

/* ── Preparing ──────────────────────────────────────── */

function silent(sessionId: string, line: string, reason: SilentReason): IntroAudio {
  const ws = words(line)
  // the whole line is on screen at once; words light up evenly only as a gentle cue
  return { sessionId, line, kind: 'silent', reason, blob: silentWav(TEXT_INTRO_SECONDS), duration: TEXT_INTRO_SECONDS, env: [], words: ws.map(() => 0) }
}

function system(sessionId: string, line: string, v: SpeechSynthesisVoice): IntroAudio {
  const ws = words(line)
  // generous: the item is cut short when the voice finishes (dj/live.ts)
  const duration = Math.min(30, 1.5 + ws.length * 0.42)
  const est = estimateWords(line, [], duration)
  return { sessionId, line, kind: 'system', reason: null, blob: silentWav(duration), duration, env: [], words: est, systemVoice: v.name }
}

interface Stored {
  line: string
  kind: IntroKind
  reason: SilentReason | null
  blob: Blob
  duration: number
  env: number[]
  words: number[]
}

async function speak(line: string): Promise<{ blob: Blob; timepoints: { i: number; t: number }[] } | 'unconfigured' | 'cap' | null> {
  if (Date.now() < unconfiguredUntil) return 'unconfigured'
  if (!host.allowed(line.length)) return 'cap'
  try {
    const res = await fetch(`${API_BASE}api/voice/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pelagic': '1' },
      body: JSON.stringify({ text: line }),
    })
    if (res.status === 503 || res.status === 404) {
      unconfiguredUntil = Date.now() + 10 * 60_000
      return 'unconfigured'
    }
    if (!res.ok) return null
    const j = (await res.json()) as { audio?: string; timepoints?: { i: number; t: number }[]; chars?: number }
    if (!j.audio) return null
    host.spend(j.chars ?? line.length)
    return { blob: b64ToBlob(j.audio, 'audio/mpeg'), timepoints: j.timepoints ?? [] }
  } catch {
    return null
  }
}

async function build(sessionId: string, line: string): Promise<IntroAudio> {
  if (!host.voiceOn()) return silent(sessionId, line, 'off')
  const cached = await idbGet<Stored>('kv', `dj-intro:${sessionId}`)
  if (cached && cached.line === line && cached.kind === 'voice') return { sessionId, ...cached }
  const online = typeof navigator === 'undefined' || navigator.onLine
  const r = online ? await speak(line) : null
  if (r && typeof r === 'object') {
    try {
      const { env, duration } = await decode(r.blob)
      const ws = words(line)
      const exact = r.timepoints.length >= ws.length * 0.8 ? ws.map((_, i) => r.timepoints.find((p) => p.i === i)?.t ?? NaN) : null
      const timing = exact && exact.every(Number.isFinite) ? exact : estimateWords(line, env, duration)
      const audio: IntroAudio = { sessionId, line, kind: 'voice', reason: null, blob: r.blob, duration, env, words: timing }
      void idbSet('kv', `dj-intro:${sessionId}`, { line, kind: 'voice', reason: null, blob: r.blob, duration, env, words: timing } satisfies Stored)
      return audio
    } catch {
      /* undecodable: fall through */
    }
  }
  const sys = systemVoice()
  if (sys && online) return system(sessionId, line, sys)
  return silent(sessionId, line, !online ? 'offline' : r === 'cap' ? 'cap' : 'unavailable')
}

/* ── Public ─────────────────────────────────────────── */

export const djVoice = {
  /** Start preparing a session's intro (idempotent). */
  prepare(session: { id: string; line: string }): Promise<IntroAudio> {
    const have = ready.get(session.id)
    if (have && have.line === session.line) return Promise.resolve(have)
    let p = pending.get(session.id)
    if (!p) {
      p = build(session.id, session.line)
        .catch(() => silent(session.id, session.line, 'unavailable'))
        .then((a) => {
          if (pending.get(session.id) === p) {
            ready.set(session.id, a)
            pending.delete(session.id)
            emit()
          }
          return a
        })
      pending.set(session.id, p)
    }
    return p
  },
  get: (sessionId: string): IntroAudio | null => ready.get(sessionId) ?? null,
  /** The intro of a session, waiting at most `ms` (then a text intro). */
  async wait(sessionId: string, line: string, ms = 8000): Promise<IntroAudio> {
    const have = ready.get(sessionId)
    if (have) return have
    const p = pending.get(sessionId) ?? djVoice.prepare({ id: sessionId, line })
    const timeout = new Promise<IntroAudio>((r) => window.setTimeout(() => r(silent(sessionId, line, 'unavailable')), ms))
    return Promise.race([p, timeout])
  },
  forget(sessionIds: string[]) {
    for (const id of sessionIds) {
      ready.delete(id)
      pending.delete(id)
      const u = urls.get(id)
      if (u) URL.revokeObjectURL(u)
      urls.delete(id)
      files.delete(id)
      void idbSet('kv', `dj-intro:${id}`, null)
    }
    if (sessionIds.length) emit()
  },
  /** PC engine: an object URL for the intro (kept until the session is forgotten). */
  async url(sessionId: string, line: string): Promise<{ url: string; audio: IntroAudio }> {
    const audio = await djVoice.wait(sessionId, line)
    let u = urls.get(sessionId)
    if (!u) urls.set(sessionId, (u = URL.createObjectURL(audio.blob)))
    return { url: u, audio }
  },
  /** Android: the intro written to the phone as a file the native player can play. */
  nativeFile(sessionId: string, line: string): Promise<string | null> {
    let f = files.get(sessionId)
    if (!f) {
      f = (async () => {
        const audio = await djVoice.wait(sessionId, line)
        const ext = audio.blob.type === 'audio/wav' ? 'wav' : 'mp3'
        const r = await PelagicPlayer.putFile({ name: `dj-${sessionId}.${ext}`, base64: await blobToB64(audio.blob) })
        return r.uri
      })().catch(() => null)
      files.set(sessionId, f)
    }
    return f
  },
  /** Android: the DJ mark as a PNG file (lock-screen art), once. */
  nativeArt: (() => {
    let p: Promise<string | null> | null = null
    return () =>
      (p ??= markPng()
        .then((png) => (png ? PelagicPlayer.putFile({ name: 'dj-mark.png', base64: png.slice(png.indexOf(',') + 1) }) : null))
        .then((r) => r?.uri ?? null)
        .catch(() => null))
  })(),
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  version: () => version,
}

/** Re-render when intros become ready. */
export function useIntroAudio(sessionId: string | null | undefined): IntroAudio | null {
  useSyncExternalStore(djVoice.subscribe, djVoice.version, djVoice.version)
  return sessionId ? djVoice.get(sessionId) : null
}
