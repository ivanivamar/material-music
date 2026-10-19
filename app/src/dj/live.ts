/**
 * The intro "now" (step 22c): where the spoken line is, how loud the voice is, which word is being
 * said — for the ripple, the level bars and the subtitle. One clock for PC and Android: the player
 * position (reported a few times a second) extrapolated with the wall clock, read against the
 * intro's loudness envelope and word times (dj/voice.ts). Nothing taps the audio itself, so it
 * works the same when the Android native player plays the intro.
 *
 * Also drives the PC system-voice fallback: speaks the line over the silent intro item, follows
 * Play / Pause, pulses on word boundaries and ends the intro when the voice is done.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { isIntroId, playerStore } from '../state/player'
import { djIntroInfo, sessionIdOf } from '../state/dj'
import { djVoice, ENV_RATE, type IntroAudio } from './voice'

/* ── Clock ──────────────────────────────────────────── */

let anchor = { id: null as string | null, pos: 0, at: 0, playing: false }
/** the last time handed out for `anchor.id` (the clock never runs backwards within an item) */
let shown = { id: null as string | null, t: 0 }

function syncAnchor() {
  const p = playerStore.get()
  const id = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  if (id !== anchor.id || Math.abs(p.position - anchor.pos) > 0.001 || p.playing !== anchor.playing) {
    anchor = { id, pos: p.position, at: performance.now(), playing: p.playing && !p.buffering }
  }
}

/**
 * Seconds into the current item, between position reports (never more than 1 s ahead).
 *
 * Monotonic: the Android player reports twice a second and each report arrives a little late, so
 * the raw extrapolation stepped back a few tens of ms every 500 ms — the lit word, the level bars and
 * the ripple jumped back and forth (the intro flicker on the phone). Small steps back (< 0.75 s) now
 * just hold the clock until the reports catch up; real seeks (bigger jumps) still go through.
 */
export function liveTime(): number {
  const ahead = anchor.playing ? Math.min(1, (performance.now() - anchor.at) / 1000) : 0
  const raw = anchor.pos + ahead
  if (shown.id === anchor.id && raw < shown.t && shown.t - raw < 0.75) return shown.t
  shown = { id: anchor.id, t: raw }
  return raw
}

/* ── Frame ticker (only while something is watching) ── */

let frame = 0
let raf = 0
let watchers = 0
let lastEmit = 0
const frameListeners = new Set<() => void>()

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  if (document.visibilityState === 'hidden') return
  if (now - lastEmit < 32) return // ~30 fps is plenty for the ripple
  lastEmit = now
  frame++
  frameListeners.forEach((l) => l())
}

/** Run `cb` on every live frame (~30 fps) while subscribed; nothing re-renders. */
export function onFrame(cb: () => void): () => void {
  const unwatch = watch()
  frameListeners.add(cb)
  return () => {
    frameListeners.delete(cb)
    unwatch()
  }
}

function watch() {
  watchers++
  if (watchers === 1) raf = requestAnimationFrame(tick)
  return () => {
    watchers--
    if (!watchers) cancelAnimationFrame(raf)
  }
}

/* ── System voice (PC fallback) ─────────────────────── */

let sys: { item: string; word: number; pulseAt: number; speaking: boolean; paused: boolean } | null = null

function words(line: string) {
  return line.split(/\s+/).filter(Boolean)
}

function wordAt(line: string, charIndex: number): number {
  let n = 0
  for (const m of line.matchAll(/\S+/g)) {
    if ((m.index ?? 0) + m[0].length > charIndex) return n
    n++
  }
  return n - 1
}

function manageSystemVoice() {
  if (typeof speechSynthesis === 'undefined') return
  const p = playerStore.get()
  const id = p.index >= 0 ? (p.queue[p.index] ?? null) : null
  const audio = id && isIntroId(id) ? djVoice.get(sessionIdOf(id)) : null
  if (!id || !audio || audio.kind !== 'system') {
    if (sys) {
      speechSynthesis.cancel()
      sys = null
    }
    return
  }
  if (sys && sys.item !== id) {
    speechSynthesis.cancel()
    sys = null
  }
  const playing = p.playing && !p.buffering
  if (!sys && playing) {
    const info = djIntroInfo(id)
    const u = new SpeechSynthesisUtterance(audio.line)
    const v = speechSynthesis.getVoices().find((x) => x.name === audio.systemVoice)
    if (v) u.voice = v
    u.lang = v?.lang ?? 'en-GB'
    u.volume = Math.max(0, Math.min(1, (info?.gain ?? 0.7) * (p.muted ? 0 : p.volume)))
    const me = { item: id, word: -1, pulseAt: 0, speaking: true, paused: false }
    sys = me
    u.onboundary = (e) => {
      if (sys !== me || e.name !== 'word') return
      me.word = wordAt(audio.line, e.charIndex)
      me.pulseAt = performance.now()
    }
    u.onend = () => {
      if (sys !== me) return
      me.speaking = false
      me.word = words(audio.line).length
      // done speaking: hand over to the first song instead of waiting out the silence
      const cur = playerStore.get()
      if (cur.queue[cur.index] === id && cur.playing) playerStore.next()
    }
    speechSynthesis.speak(u)
  } else if (sys && !playing && !sys.paused) {
    speechSynthesis.pause()
    sys.paused = true
  } else if (sys && playing && sys.paused) {
    speechSynthesis.resume()
    sys.paused = false
  }
}

let started = false
export function initDjLive() {
  if (started) return
  started = true
  syncAnchor()
  playerStore.subscribe(() => {
    syncAnchor()
    manageSystemVoice()
  })
  djVoice.subscribe(manageSystemVoice)
}

/* ── Reading it ─────────────────────────────────────── */

export interface IntroLive {
  /** seconds into the intro */
  t: number
  duration: number
  /** 0..1 voice loudness now */
  level: number
  /** index of the word being said; words.length = all said; -1 = not started */
  word: number
  /** the voice is talking right now */
  speaking: boolean
  kind: IntroAudio['kind'] | null
  audio: IntroAudio | null
}

const EMPTY: IntroLive = { t: 0, duration: 0, level: 0, word: -1, speaking: false, kind: null, audio: null }

export function introLive(audio: IntroAudio | null, item: string | null): IntroLive {
  if (!audio || !item) return EMPTY
  const t = anchor.id === item ? liveTime() : 0
  const duration = audio.duration
  const n = audio.words.length
  if (audio.kind === 'silent') return { t, duration, level: 0, word: n, speaking: false, kind: 'silent', audio }
  if (audio.kind === 'system') {
    const s = sys?.item === item ? sys : null
    const since = s ? performance.now() - s.pulseAt : Infinity
    const speaking = !!s && s.speaking && !s.paused
    const level = speaking ? 0.2 + 0.7 * Math.exp(-since / 180) : 0
    return { t, duration, level, word: s ? s.word : -1, speaking, kind: 'system', audio }
  }
  const i = Math.floor(t * ENV_RATE)
  const level = anchor.playing ? (audio.env[i] ?? 0) : 0
  let word = -1
  for (let k = 0; k < n; k++) if (audio.words[k] <= t + 0.05) word = k
  const lastWord = audio.words[n - 1] ?? 0
  if (t > lastWord + 0.8) word = n
  const speaking = anchor.playing && t >= (audio.words[0] ?? 0) - 0.1 && t <= lastWord + 0.8
  return { t, duration, level, word, speaking, kind: 'voice', audio }
}

const subscribeFrame = (l: () => void) => {
  frameListeners.add(l)
  return () => {
    frameListeners.delete(l)
  }
}
const getFrame = () => frame

/** Live intro values, re-rendering ~30×/s while `active`. */
export function useIntroLive(item: string | null, active: boolean): IntroLive {
  useEffect(() => (active ? watch() : undefined), [active])
  useSyncExternalStore(active ? subscribeFrame : noopSub, getFrame, getFrame)
  const audio = useSyncExternalStore(djVoice.subscribe, () => (item ? djVoice.get(sessionIdOf(item)) : null), () => null)
  return introLive(audio, item)
}
const noopSub = () => () => {}

/** Live intro progress 0..1 (mini-player progress line, lyrics-view seek line). */
export function useIntroProgress(item: string | null): { frac: number; t: number; duration: number } {
  const live = useIntroLive(item, !!item)
  return { frac: live.duration ? Math.min(1, live.t / live.duration) : 0, t: live.t, duration: live.duration }
}

/** Is the DJ talking right now (re-renders only when that flips, not every frame). */
export function useIntroSpeaking(item: string | null, active: boolean): boolean {
  const audio = useSyncExternalStore(djVoice.subscribe, () => (item ? djVoice.get(sessionIdOf(item)) : null), () => null)
  useEffect(() => (active ? watch() : undefined), [active])
  return useSyncExternalStore(
    active ? subscribeFrame : noopSub,
    () => {
      const l = introLive(audio, item)
      return l.kind !== 'silent' && !!l.kind && l.speaking
    },
    () => false,
  )
}

/** The voice level now, for code that paints outside React (the mark, the light pool). */
export function introLevel(item: string): number {
  return introLive(djVoice.get(sessionIdOf(item)), item).level
}
