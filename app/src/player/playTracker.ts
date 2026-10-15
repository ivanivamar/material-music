/**
 * Counts plays for the history (step 8). Engine-agnostic: it watches the player store.
 *
 * A play = at least 30 s of a track actually heard (half the track when it is shorter than a
 * minute), once per time through the track. Seeking doesn't add listening time: position only
 * counts when it moved about as far as the clock did. Starting the track over (repeat one, Previous,
 * playing it again) after it was counted arms it for another play.
 *
 * Android with the screen off: the native player keeps advancing while the WebView's JS sleeps, so
 * on wake-up the store jumps several queue rows at once (`onEngineMoved`). The rows in between are
 * counted as played when their lengths fit in the time that passed (if they don't, some were skipped
 * from the lock screen and we can't tell which — none of them are counted).
 */
import { historyStore } from '../state/history'
import { libraryStore } from '../state/library'
import { onEngineMoved, playerStore } from '../state/player'

const MIN_SECONDS = 30

const durationOf = (id: string | null) => (id ? libraryStore.get().data?.tracks[id]?.duration : undefined)
const threshold = (id: string | null) => {
  const d = durationOf(id)
  return d && d > 0 ? Math.min(MIN_SECONDS, d / 2) : MIN_SECONDS
}

let started = false

export function initPlayTracker() {
  if (started) return
  started = true

  let curId: string | null = null
  let listened = 0
  let counted = false
  /** wall-clock ms when this time through the track started being heard */
  let startedAt = 0
  let lastPos = 0
  let lastWall = Date.now()
  let lastPlaying = false
  /** seconds the next track has already been playing (set by a native catch-up) */
  let carry = 0

  const restart = () => {
    listened = 0
    counted = false
    startedAt = 0
  }

  const add = (seconds: number, now: number) => {
    if (!curId || seconds <= 0) return
    if (!startedAt) startedAt = now - seconds * 1000
    listened += seconds
    if (!counted && listened >= threshold(curId)) {
      counted = true
      historyStore.record(curId, startedAt)
    }
  }

  const s0 = playerStore.get()
  curId = s0.index >= 0 ? (s0.queue[s0.index] ?? null) : null
  lastPos = s0.position

  playerStore.subscribe(() => {
    const s = playerStore.get()
    const id = s.index >= 0 ? (s.queue[s.index] ?? null) : null
    const now = Date.now()
    if (id !== curId) {
      curId = id
      restart()
      lastPos = s.position
      lastWall = now - carry * 1000
      lastPlaying = s.playing || carry > 0
      carry = 0
      return
    }
    const delta = s.position - lastPos
    const wall = (now - lastWall) / 1000
    if (delta < -5 && s.position < 3 && counted) restart()
    else if (lastPlaying && delta > 0 && delta <= wall * 1.25 + 1) add(delta, now)
    lastPos = s.position
    lastWall = now
    lastPlaying = s.playing
  })

  onEngineMoved((from, to) => {
    const s = playerStore.get()
    const now = Date.now()
    const elapsed = (now - lastWall) / 1000
    // JS was awake: the regular position reports already covered it
    if (elapsed < 15 || !lastPlaying || !s.queue.length) return
    let budget = elapsed + 5
    let at = lastWall
    // the row we last saw: assume it played to its end
    const fromId = s.queue[from] ?? null
    if (fromId && fromId === curId) {
      const rest = Math.max(0, (durationOf(fromId) ?? 0) - lastPos)
      add(Math.min(rest, budget), lastWall + rest * 1000)
      budget -= rest
      at += rest * 1000
    }
    // rows in between (wrapping around with repeat all)
    const gap: string[] = []
    for (let k = (from + 1) % s.queue.length; k !== to && gap.length < s.queue.length; k = (k + 1) % s.queue.length) gap.push(s.queue[k])
    const lengths = gap.map((id) => durationOf(id) ?? 0)
    const total = lengths.reduce((a, b) => a + b, 0)
    if (gap.length && lengths.every((d) => d > 0) && total <= budget) {
      gap.forEach((id, i) => {
        historyStore.record(id, at)
        at += lengths[i] * 1000
      })
    }
    // what's left of the elapsed time went to the track playing now
    carry = Math.max(0, Math.min(elapsed, (now - at) / 1000))
  })
}
