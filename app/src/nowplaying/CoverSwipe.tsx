/**
 * Phone full-screen player: the queue as a horizontal row of covers (native scroll + scroll snap).
 *
 * One slot per queue row, each as wide as the scroller, the cover centred in it. The browser does
 * the dragging, flinging and snapping (`scroll-snap-stop: always`: one song per swipe). Nothing in
 * the player changes while the row moves; only when the scroll has settled on another slot does
 * the player switch (next / back / jump), and with it the title, tint and the rest of the screen.
 *
 * Slots are keyed by queue position and never move, so a song change never re-positions or swaps
 * an <img>: the row only scrolls. When the song changes from elsewhere (buttons, the track ending,
 * lock screen, queue edits) the row scrolls to it — smoothly for a neighbour, instantly for a jump —
 * once the index has been stable for a moment and no finger is on the row (a brief back-and-forth
 * of the store can't drag the row around).
 *
 * Only slots near what's on screen / playing get an image; the rest are empty boxes.
 * No wrap-around at the ends of the queue (repeat-all still wraps with the buttons).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCover } from '../lib/covers'
import { useArtTint } from '../design/tint'
import { useLibrary } from '../state/library'
import { useMotion } from '../state/motion'
import { playerStore } from '../state/player'
import { useCurrent } from './parts'

const NEAR = 2 // slots either side that get their cover
const SETTLE_MS = 140 // no scroll events for this long = settled (fallback when there's no scrollend)
const SYNC_MS = 180 // the store index must hold this long before the row follows it

export function CoverSwipe({ glow }: { cover: string | null; glow: string }) {
  const { p } = useCurrent()
  const motion = useMotion()
  const n = p.queue.length
  const scRef = useRef<HTMLDivElement>(null)
  /** slot under the centre of the scroller (follows the finger), drives which covers load */
  const [shown, setShown] = useState(p.index)
  const live = useRef({ motion, index: p.index })
  live.current = { motion, index: p.index }

  const touching = useRef(false)
  /** a finger moved the row since the last settle: only then does settling switch songs */
  const gesture = useRef(false)

  const slotWidth = () => scRef.current?.clientWidth || 1
  const scrollTo = (i: number, smooth: boolean) => {
    const sc = scRef.current
    if (!sc) return
    const left = i * slotWidth()
    if (Math.abs(sc.scrollLeft - left) < 1) return
    sc.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
  }

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
      if (!touching.current) sc.scrollLeft = live.current.index * slotWidth()
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
        if (at === p.index) return
        scrollTo(p.index, live.current.motion && !queueChanged && Math.abs(at - p.index) === 1)
      },
      queueChanged ? 0 : SYNC_MS,
    )
    return () => window.clearTimeout(t)
  }, [p.index, p.queue])

  useEffect(() => {
    const sc = scRef.current
    if (!sc) return
    let settleTimer = 0

    const settle = () => {
      window.clearTimeout(settleTimer)
      if (touching.current) return
      const k = Math.round(sc.scrollLeft / slotWidth())
      setShown(k)
      if (!gesture.current) return
      gesture.current = false
      const s = playerStore.get()
      if (k === s.index || k < 0 || k >= s.queue.length) return
      if (k === s.index + 1) playerStore.next()
      else if (k === s.index - 1) playerStore.back()
      else playerStore.jump(k)
    }
    const onScroll = () => {
      setShown(Math.round(sc.scrollLeft / slotWidth()))
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, SETTLE_MS)
    }
    const onStart = () => {
      touching.current = true
      gesture.current = true
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length) return
      touching.current = false
      // no scroll after the finger lifted (or it never moved): settle now / soon
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, SETTLE_MS)
    }
    const hasScrollEnd = 'onscrollend' in window
    sc.addEventListener('scroll', onScroll, { passive: true })
    if (hasScrollEnd) sc.addEventListener('scrollend', settle)
    sc.addEventListener('touchstart', onStart, { passive: true })
    sc.addEventListener('touchend', onEnd, { passive: true })
    sc.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.clearTimeout(settleTimer)
      sc.removeEventListener('scroll', onScroll)
      if (hasScrollEnd) sc.removeEventListener('scrollend', settle)
      sc.removeEventListener('touchstart', onStart)
      sc.removeEventListener('touchend', onEnd)
      sc.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const slots = []
  for (let i = 0; i < n; i++) {
    const near = Math.abs(i - shown) <= NEAR || Math.abs(i - p.index) <= NEAR
    slots.push(<Slot key={i} trackId={near ? p.queue[i] : null} glow={i === p.index ? glow : null} />)
  }

  return (
    <div ref={scRef} className="npc" data-motion={motion ? undefined : 'off'}>
      <div className="npc-track">{slots}</div>
    </div>
  )
}

const Slot = memo(function Slot({ trackId, glow }: { trackId: string | null; glow: string | null }) {
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
          style={glow ? { boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 60px 120px -40px ${glow}` } : undefined}
        />
      ) : (
        <span className="np-cover np-cover-empty" aria-hidden />
      )}
    </div>
  )
})
