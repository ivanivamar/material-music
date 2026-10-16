/**
 * Single-line text that scrolls when it doesn't fit (player bar, mini-player, lyrics strip, and the
 * full-screen player's title / artist lines).
 *
 * Fits → plain text. Too long → holds for a beat, glides left at a steady reading speed until a
 * second copy lands exactly where the first started, then holds again (seamless loop). Edges fade
 * through a mask, the left fade only while the text is moving. Pauses under a mouse pointer.
 * Reduced motion (in-app setting or system) → ellipsis, no movement.
 *
 * Content is `text`, or `children` (e.g. links) with `text` as the re-measure key. The second copy
 * is aria-hidden and inert. Gap and fade scale with the font (CSS --mq-gap / --mq-fade, in em), and
 * the speed scales with font size too, so a hero line doesn't crawl.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMotion } from '../state/motion'
import './marquee.css'

const SPEED = 34 // px per second at 15px text
const HOLD = 2600 // ms at rest between loops
const FADE_MS = 360

// lets the left-edge fade animate (unsupported → no left fade, everything else still works)
let registered = false
function registerFadeProp() {
  if (registered) return
  registered = true
  try {
    CSS.registerProperty({ name: '--mq-l', syntax: '<length>', inherits: false, initialValue: '0px' })
  } catch {
    /* already registered / unsupported */
  }
}

export function Marquee({ text, children, className = '' }: { text: string; children?: ReactNode; className?: string }) {
  const motion = useMotion()
  const outerRef = useRef<HTMLSpanElement>(null)
  const itemRef = useRef<HTMLSpanElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [fontKey, setFontKey] = useState(0)
  const on = motion && overflow

  // does it fit? (re-checked when the box or the text size changes, and once web fonts are in)
  useLayoutEffect(() => {
    const outer = outerRef.current
    const item = itemRef.current
    if (!outer || !item) return
    let size = getComputedStyle(outer).fontSize
    const measure = () => {
      setOverflow(item.scrollWidth > outer.clientWidth + 1)
      const s = getComputedStyle(outer).fontSize
      if (s !== size) {
        size = s
        setFontKey((k) => k + 1) // restart the loop with the new distance / speed
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(outer)
    ro.observe(item)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [text])

  // the loop
  useLayoutEffect(() => {
    const outer = outerRef.current
    const track = trackRef.current
    const item = itemRef.current
    if (!on || !outer || !track || !item) return
    registerFadeProp()
    const cs = getComputedStyle(outer)
    const fontPx = parseFloat(cs.fontSize) || 15
    const gap = parseFloat(getComputedStyle(track).columnGap) || 48
    const fadePx = fontPx * 0.95 // = --mq-fade
    const dist = item.offsetWidth + gap
    const speed = SPEED * Math.sqrt(fontPx / 15)
    const scroll = (dist / speed) * 1000
    const total = HOLD + scroll
    const start = HOLD / total
    const fadeIn = Math.min(start + FADE_MS / total, 1)
    const fadeOut = Math.max(1 - FADE_MS / total, fadeIn)
    const opts: KeyframeAnimationOptions = { duration: total, iterations: Infinity }
    const move = track.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: start, easing: 'cubic-bezier(.45, 0, .55, 1)' },
        { transform: `translateX(${-dist}px)`, offset: 1 },
      ],
      opts,
    )
    const fade = outer.animate(
      [
        { '--mq-l': '0px', offset: 0 },
        { '--mq-l': '0px', offset: start },
        { '--mq-l': `${fadePx}px`, offset: fadeIn },
        { '--mq-l': `${fadePx}px`, offset: fadeOut },
        { '--mq-l': '0px', offset: 1 },
      ] as Keyframe[],
      opts,
    )
    const pause = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      move.pause()
      fade.pause()
    }
    const resume = () => {
      move.play()
      fade.play()
    }
    outer.addEventListener('pointerenter', pause)
    outer.addEventListener('pointerleave', resume)
    return () => {
      move.cancel()
      fade.cancel()
      outer.removeEventListener('pointerenter', pause)
      outer.removeEventListener('pointerleave', resume)
    }
  }, [on, text, fontKey])

  const content = children ?? text
  return (
    <span ref={outerRef} className={`mq ${on ? 'is-on' : ''} ${className}`}>
      <span ref={trackRef} className="mq-track">
        <span ref={itemRef} className="mq-item">
          {content}
        </span>
        {on && (
          <span className="mq-item" aria-hidden inert>
            {content}
          </span>
        )}
      </span>
    </span>
  )
}
