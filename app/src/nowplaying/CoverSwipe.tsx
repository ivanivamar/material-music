/**
 * Phone full-screen player: the queue as a horizontal row of covers.
 *
 * One slot per queue row, each as wide as the row, the cover centred in it. Slots are keyed by
 * queue position and never move: a song change only changes the row's scroll position — no
 * transforms on covers, no swapping of <img>s (that was the flicker in the first versions).
 *
 * The row is an overflow-hidden scroller moved only by this component (no native momentum or snap
 * to fight with): it follows the finger while dragging (`touch-action: pan-y`, so vertical drags
 * still scroll / swipe the player down), and on release glides to the target slot with a short,
 * gentle ease-out. Target: the flick direction (finger speed past FLICK), else the nearest slot;
 * never more than one song from where the touch started. The song switches at COMMIT_AT of the
 * glide — slightly before the cover lands — and with it the title, tint and the rest of the screen.
 *
 * When the song changes elsewhere (buttons, the track ending, lock screen, queue edits) the row
 * glides to it once the index has held for SYNC_MS and no finger is on it (instant for jumps), so a
 * brief back-and-forth of the store can't drag the row around.
 *
 * Only slots near what's on screen / playing get an image; the rest are empty boxes.
 * No wrap-around at the ends of the queue (repeat-all still wraps with the buttons).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCover } from '../lib/covers'
import { useArtTint } from '../design/tint'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { isIntroId, playerStore } from '../state/player'
import { LiveMark } from '../dj/DjIntro'
import { useCurrent } from './parts'

const NEAR = 2 // slots either side that get their cover
const SYNC_MS = 180 // the store index must hold this long before the row follows it
const DEAD_ZONE = 8 // px before a touch counts as a horizontal drag
const FLICK = 0.3 // px per ms: a release this fast goes to the next slot that way
const EDGE = 0.28 // drag resistance past the first / last song
const GLIDE_MIN = 170 // ms, glide duration for a short distance…
const GLIDE_MAX = 280 // …up to this for a whole slot
const COMMIT_AT = 0.45 // share of the glide after which the song switches
/** gentle ease-out (quadratic): quick to start, short tail */
const ease = (t: number) => t * (2 - t)

export function CoverSwipe({ glow }: { cover: string | null; glow: string }) {
  const { p } = useCurrent()
  const motion = useMotion()
  const n = p.queue.length
  const scRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  /** slot under the centre of the row (follows the finger), drives which covers load */
  const [shown, setShown] = useState(p.index)
  const live = useRef({ motion, index: p.index })
  live.current = { motion, index: p.index }

  /** finger on the row (horizontal drag decided or not) */
  const touching = useRef(false)
  /** shared with the sync effect: start / stop a glide */
  const glideRef = useRef<{ to: (k: number, onCommit?: () => void) => void; stop: () => void } | null>(null)

  const slotWidth = () => scRef.current?.clientWidth || 1

  // first paint: already on the current song
  useLayoutEffect(() => {
    const sc = scRef.current
    if (sc) sc.scrollLeft = live.current.index * slotWidth()
  }, [])

  // keep the slot in place when the width changes (rotation, window resize)
  useEffect(() => {
    const sc = scRef.current
    if (!sc || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (touching.current) return
      glideRef.current?.stop()
      sc.scrollLeft = live.current.index * slotWidth()
    })
    ro.observe(sc)
    return () => ro.disconnect()
  }, [])

  // the song changed elsewhere: follow once it holds still (and not under a finger)
  const queueRef = useRef(p.queue)
  useEffect(() => {
    const sc = scRef.current
    if (!sc || p.index < 0) return
    const queueChanged = queueRef.current !== p.queue
    queueRef.current = p.queue
    const t = window.setTimeout(
      () => {
        if (touching.current) return
        const at = Math.round(sc.scrollLeft / slotWidth())
        if (at === p.index && Math.abs(sc.scrollLeft - p.index * slotWidth()) < 1) return
        if (live.current.motion && !queueChanged && Math.abs(at - p.index) <= 1) glideRef.current?.to(p.index)
        else {
          glideRef.current?.stop()
          sc.scrollLeft = p.index * slotWidth()
          setShown(p.index)
        }
      },
      queueChanged ? 0 : SYNC_MS,
    )
    return () => window.clearTimeout(t)
  }, [p.index, p.queue])

  useEffect(() => {
    const sc = scRef.current
    const track = trackRef.current
    if (!sc || !track) return
    let raf = 0
    let gliding = false
    // touch
    let armed = false
    let decided = false
    let dragging = false
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startSlot = 0
    let lastX = 0
    let lastT = 0
    let velocity = 0 // px/ms of the finger, + = moving right (row going back)
    let over = 0 // rubber-band offset past the ends (scrollLeft can't go there)

    const maxLeft = () => Math.max(0, (playerStore.get().queue.length - 1) * slotWidth())
    const setPos = (x: number) => {
      const clamped = Math.max(0, Math.min(maxLeft(), x))
      sc.scrollLeft = clamped
      over = x - clamped
      track.style.transform = over ? `translate3d(${-over}px, 0, 0)` : ''
    }
    const pos = () => sc.scrollLeft + over

    const commit = (k: number) => {
      const s = playerStore.get()
      if (k === s.index || k < 0 || k >= s.queue.length) return
      if (k === s.index + 1) playerStore.next()
      else if (k === s.index - 1) playerStore.back()
      else playerStore.jump(k)
    }

    const stop = () => {
      if (!gliding) return
      cancelAnimationFrame(raf)
      gliding = false
    }

    const to = (k: number, onCommit?: () => void) => {
      stop()
      const w = slotWidth()
      const from = pos()
      const target = k * w
      const dist = Math.abs(target - from)
      if (dist < 1 || !live.current.motion) {
        setPos(target)
        setShown(k)
        onCommit?.()
        return
      }
      const ms = GLIDE_MIN + (GLIDE_MAX - GLIDE_MIN) * Math.min(1, dist / w)
      const t0 = performance.now()
      let committed = !onCommit
      gliding = true
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        setPos(from + (target - from) * ease(t))
        if (!committed && t >= COMMIT_AT) {
          committed = true
          onCommit?.()
        }
        if (t < 1) raf = requestAnimationFrame(step)
        else {
          gliding = false
          setPos(target)
        }
      }
      raf = requestAnimationFrame(step)
    }
    glideRef.current = { to, stop }

    const onScroll = () => setShown(Math.round(sc.scrollLeft / slotWidth()))

    const onStart = (e: TouchEvent) => {
      armed = decided = dragging = false
      if (e.touches.length !== 1) return
      armed = true
      startX = lastX = e.touches[0].clientX
      startY = e.touches[0].clientY
      lastT = e.timeStamp
      velocity = 0
      touching.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      if (!decided) {
        const ddx = x - startX
        const ddy = y - startY
        if (Math.abs(ddx) < DEAD_ZONE && Math.abs(ddy) < DEAD_ZONE) return
        decided = true
        // mostly vertical: leave it to scrolling / swipe-down-to-close
        if (Math.abs(ddx) < Math.abs(ddy) * 1.2) {
          armed = false
          return
        }
        dragging = true
        // grabbed mid-glide: carry on from where the row is; one song at most from the playing one
        const wasGliding = gliding
        stop()
        startLeft = pos()
        startSlot = wasGliding ? playerStore.get().index : Math.round(startLeft / slotWidth())
        startX = lastX = x // no jump by the dead zone
        lastT = e.timeStamp
      }
      if (!dragging) return
      const dt = e.timeStamp - lastT
      if (dt > 0) velocity = 0.7 * ((x - lastX) / dt) + 0.3 * velocity
      lastX = x
      lastT = e.timeStamp
      let left = startLeft - (x - startX)
      const max = maxLeft()
      if (left < 0) left *= EDGE
      else if (left > max) left = max + (left - max) * EDGE
      setPos(left)
    }

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length) return
      touching.current = false
      const was = dragging
      armed = decided = dragging = false
      if (!was) return
      // a pause before lifting = no flick
      if (e.timeStamp - lastT > 80) velocity = 0
      const w = slotWidth()
      const n = playerStore.get().queue.length
      const at = pos() / w
      let k = Math.round(at)
      if (velocity < -FLICK) k = Math.ceil(at - 0.02)
      else if (velocity > FLICK) k = Math.floor(at + 0.02)
      k = Math.max(Math.max(0, startSlot - 1), Math.min(Math.min(n - 1, startSlot + 1), k))
      to(k, () => {
        setShown(k)
        commit(k)
      })
    }

    sc.addEventListener('scroll', onScroll, { passive: true })
    sc.addEventListener('touchstart', onStart, { passive: true })
    sc.addEventListener('touchmove', onMove, { passive: true })
    sc.addEventListener('touchend', onEnd, { passive: true })
    sc.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      stop()
      glideRef.current = null
      touching.current = false
      sc.removeEventListener('scroll', onScroll)
      sc.removeEventListener('touchstart', onStart)
      sc.removeEventListener('touchmove', onMove)
      sc.removeEventListener('touchend', onEnd)
      sc.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const slots = []
  for (let i = 0; i < n; i++) {
    const near = Math.abs(i - shown) <= NEAR || Math.abs(i - p.index) <= NEAR
    // DJ: upcoming rows stay blank, so swiping ahead can't show where a session ends
    const hidden = p.context?.kind === 'dj' && i > p.index
    slots.push(<Slot key={i} trackId={near && !hidden ? p.queue[i] : null} glow={i === p.index ? glow : null} />)
  }

  return (
    <div ref={scRef} className="npc">
      <div ref={trackRef} className="npc-track">
        {slots}
      </div>
    </div>
  )
}

const Slot = memo(function Slot({ trackId, glow }: { trackId: string | null; glow: string | null }) {
  if (isIntroId(trackId)) return <IntroSlot item={trackId} current={!!glow} />
  return <CoverSlot trackId={trackId} glow={glow} />
})

/** DJ intro row: the mark stands in for a cover (speaking while it is the current row). */
function IntroSlot({ item, current }: { item: string; current: boolean }) {
  return (
    <div className="npc-slot">
      <div className="np-cover">
        <LiveMark item={item} size={364} fluid active={current} />
      </div>
    </div>
  )
}

const CoverSlot = memo(function CoverSlot({ trackId }: { trackId: string | null; glow: string | null }) {
  const { data } = useLibrary()
  const t = trackId ? data?.tracks[trackId] : undefined
  const src = useCover(t ? data?.albums[t.albumId]?.cover : null)
  // warm the tint cache, so the scene colour is ready the moment the song switches
  useArtTint(src)
  return (
    <div className="npc-slot">
      {src ? (
        <img
          className="np-cover"
          src={src}
          alt=""
          draggable={false}
          decoding="async"
        />
      ) : (
        <span className="np-cover np-cover-empty" aria-hidden />
      )}
    </div>
  )
})
