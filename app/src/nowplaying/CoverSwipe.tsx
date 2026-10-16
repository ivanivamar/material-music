/**
 * Phone full-screen player: drag the cover left / right to switch songs.
 *
 * The cover sits on a track with the previous and next queue rows' covers parked one cover-width
 * (+ GAP) either side, just off screen; they only become visible while a drag is on. The track
 * follows the finger. On release past COMMIT of the cover width (or on a flick) it slides the
 * neighbour into place and then moves the player there — left = next, right = previous track
 * (`back()`, which never just restarts the song like the ⏮ button). No neighbour that way
 * (start / end of the queue without repeat-all): the drag rubber-bands and springs back.
 *
 * The slid-over transform is held until the track id actually changes and cleared in a layout
 * effect, so the frame in between never shows the old cover centred again.
 *
 * Touch events, like swipe.ts: the gesture is taken only once it is clearly horizontal, so a
 * vertical drag on the cover still scrolls / swipes the player down to close.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCover } from '../lib/covers'
import { useArtTint } from '../design/tint'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { playerStore } from '../state/player'
import { useCurrent } from './parts'

const GAP = 24 // px between covers; matches the phone player's side padding
const COMMIT = 0.28 // share of the cover width
const FLICK = 0.45 // px per ms
const RUBBER = 0.28
const SLIDE_MS = 240

export function CoverSwipe({ cover, glow }: { cover: string | null; glow: string }) {
  const { p, id } = useCurrent()
  const { data } = useLibrary()
  const motion = useMotion()

  const len = p.queue.length
  const prevIdx = p.index > 0 ? p.index - 1 : p.repeat === 'all' && len > 1 ? len - 1 : -1
  const nextIdx = p.index >= 0 && p.index + 1 < len ? p.index + 1 : p.repeat === 'all' && len > 1 ? 0 : -1
  const prevT = prevIdx >= 0 ? data?.tracks[p.queue[prevIdx]] : undefined
  const nextT = nextIdx >= 0 ? data?.tracks[p.queue[nextIdx]] : undefined
  const prevCover = useCover(prevT ? data?.albums[prevT.albumId]?.cover : null)
  const nextCover = useCover(nextT ? data?.albums[nextT.albumId]?.cover : null)
  // work out the neighbours' tints now, so the scene colour is ready the moment the song switches
  // (otherwise the background drops to neutral for a beat, then pops to the new tint)
  useArtTint(prevCover)
  useArtTint(nextCover)

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // latest values for the (mounted-once) touch handlers
  const live = useRef({ hasPrev: false, hasNext: false, motion: true })
  useLayoutEffect(() => {
    live.current = { hasPrev: !!prevT, hasNext: !!nextT, motion }
  })
  /** set while the slide-over waits for the player to move to the neighbour */
  const pending = useRef<{ timer: number } | null>(null)

  // the song changed (our swipe, a button, or the track ending): put the track back, instantly
  useLayoutEffect(() => {
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = null
    track.style.transition = 'none'
    track.style.transform = ''
    delete root.dataset.drag
  }, [id, p.index])

  useEffect(() => {
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return

    let armed = false
    let decided = false
    let dragging = false
    let startX = 0
    let startY = 0
    let dx = 0
    let lastX = 0
    let lastT = 0
    let velocity = 0
    let width = 0
    let settleTimer = 0

    const place = (x: number, ms: number) => {
      track.style.transition = ms > 0 ? `transform ${ms}ms cubic-bezier(.2, .7, .2, 1)` : 'none'
      track.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''
    }

    const springBack = () => {
      const ms = live.current.motion ? 300 : 0
      place(0, ms)
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (!pending.current) delete root.dataset.drag
      }, ms)
    }

    const onStart = (e: TouchEvent) => {
      armed = decided = dragging = false
      if (e.touches.length !== 1 || pending.current) return
      armed = true
      startX = lastX = e.touches[0].clientX
      startY = e.touches[0].clientY
      lastT = e.timeStamp
      dx = velocity = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      if (!decided) {
        const ddx = x - startX
        const ddy = y - startY
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return
        decided = true
        // only a mostly-horizontal drag; vertical ones stay with scrolling / swipe-down-to-close
        if (Math.abs(ddx) < Math.abs(ddy) * 1.2) {
          armed = false
          return
        }
        dragging = true
        width = root.offsetWidth
        window.clearTimeout(settleTimer)
        root.dataset.drag = ''
        // start from where the finger is now, so the cover doesn't jump by the 8px dead zone
        startX = x
      }
      if (!dragging) return
      if (e.cancelable) e.preventDefault()
      const raw = x - startX
      const blocked = (raw > 0 && !live.current.hasPrev) || (raw < 0 && !live.current.hasNext)
      dx = blocked ? raw * RUBBER : raw
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = 0.8 * ((x - lastX) / dt) + 0.2 * velocity
      lastX = x
      lastT = e.timeStamp
      place(dx, 0)
    }

    const onEnd = () => {
      if (!dragging) {
        armed = false
        return
      }
      armed = dragging = false
      const dir = dx < 0 ? 1 : -1 // 1 = next, -1 = previous
      const can = dir === 1 ? live.current.hasNext : live.current.hasPrev
      const far = Math.abs(dx) > width * COMMIT
      const flick = Math.abs(velocity) > FLICK && Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) > 24
      if (!can || !(far || flick)) return springBack()

      const ms = live.current.motion ? SLIDE_MS : 0
      place(-dir * (width + GAP), ms)
      const go = () => {
        // the id change resets the track (layout effect above); if the player didn't move, spring back
        const timer = window.setTimeout(() => {
          if (!pending.current) return
          pending.current = null
          springBack()
        }, 500)
        pending.current = { timer }
        if (dir === 1) playerStore.next()
        else playerStore.back()
      }
      if (ms) {
        pending.current = { timer: 0 }
        settleTimer = window.setTimeout(go, ms)
      } else go()
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: false })
    root.addEventListener('touchend', onEnd)
    root.addEventListener('touchcancel', onEnd)
    return () => {
      window.clearTimeout(settleTimer)
      if (pending.current) window.clearTimeout(pending.current.timer)
      pending.current = null
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // Keyed by queue row, not by slot: after a swipe the neighbour's <img> element itself becomes the
  // main cover (only its class / position change). Swapping the src on a fixed element instead made
  // the browser re-decode it and show a blank / stale frame — the flicker on every swipe.
  const img = (key: string, src: string | null, cls: string, main = false) =>
    src ? (
      <img
        key={key}
        className={`np-cover ${cls}`}
        src={src}
        alt=""
        draggable={false}
        decoding="sync"
        style={main ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px ${glow}` } : undefined}
      />
    ) : (
      <span key={key} className={`np-cover np-cover-empty ${cls}`} aria-hidden />
    )

  return (
    <div ref={rootRef} className="npc">
      <div ref={trackRef} className="npc-track">
        {/* queue of two with repeat-all: previous and next are the same row */}
        {prevT && img(prevIdx === nextIdx ? `q${prevIdx}p` : `q${prevIdx}`, prevCover, 'npc-side is-prev')}
        {img(`q${p.index}`, cover, 'npc-main', true)}
        {nextT && img(`q${nextIdx}`, nextCover, 'npc-side is-next')}
      </div>
    </div>
  )
}
