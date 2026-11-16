/**
 * Collapsing page header (album, playlist / Liked songs, mix, artist pages).
 *
 * As the page scrolls, the big art shrinks and fades towards the top and the title block lifts and
 * fades (scrubbed: it follows the scroll position, both ways). Once the title has gone under the top
 * edge, a compact bar (small art + title) fades in, stuck to the top of the scrolling area (desktop) or
 * just under the sticky search bar (phone, same surface colour as that bar once it is solid, so the
 * two read as one header). Scrolling back up reverses all of it.
 *
 * ScrollTrigger watches AppShell's <main> (pages scroll inside it, not the window). The bar is a
 * zero-height sticky element as the first child of the page (sticky only works in a tall parent); its
 * contents hang below it. Reduced motion: no scrubbed shrink, and the bar just appears / disappears.
 */
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { gsap, ScrollTrigger, scroller } from '../../lib/gsap'
import { motionOff } from '../../lib/drag'

export interface HeroParts {
  /** the big art, the text block that lifts away, and the title (the bar shows once it is gone) */
  art: string
  text: string
  title: string
}

export function useCollapsingHeader(heroRef: RefObject<HTMLElement | null>, barRef: RefObject<HTMLElement | null>, parts: HeroParts, deps: unknown[] = []) {
  const live = useRef(parts)
  live.current = parts
  useLayoutEffect(() => {
    const hero = heroRef.current
    const bar = barRef.current
    const sc = scroller()
    if (!hero || !bar || !sc) return
    const inner = bar.firstElementChild as HTMLElement | null
    const { art: artSel, text: textSel, title: titleSel } = live.current
    const art = hero.querySelector<HTMLElement>(artSel)
    const text = hero.querySelector<HTMLElement>(textSel)
    const title = hero.querySelector<HTMLElement>(titleSel) ?? text
    if (!inner || !title) return
    // the bar takes no room: cancel the page column's flex gap after it (pages use different gaps)
    const gap = bar.parentElement ? parseFloat(getComputedStyle(bar.parentElement).rowGap) || 0 : 0
    bar.style.marginBottom = gap ? `${-gap}px` : ''
    const still = motionOff()
    // where the bar's bottom edge is in the scroller (its sticky `top` + its height)
    const edge = () => (parseFloat(getComputedStyle(bar).top) || 0) + inner.offsetHeight

    const ctx = gsap.context(() => {
      if (!still) {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: hero, scroller: sc, start: () => `top top+=${edge()}`, end: () => `bottom top+=${edge()}`, scrub: 0.3, invalidateOnRefresh: true },
        })
        if (art) tl.to(art, { scale: 0.55, opacity: 0, transformOrigin: 'left top', ease: 'none' }, 0)
        if (text) tl.to(text, { y: -28, opacity: 0, ease: 'power1.in' }, 0)
      }

      let shown: boolean | null = null
      const show = (on: boolean, instant = false) => {
        if (on === shown) return
        shown = on
        bar.toggleAttribute('data-on', on)
        if (still || instant) gsap.set(inner, { autoAlpha: on ? 1 : 0, y: 0 })
        else gsap.to(inner, { autoAlpha: on ? 1 : 0, y: on ? 0 : -6, duration: on ? 0.32 : 0.2, ease: on ? 'power2.out' : 'power1.in', overwrite: true })
      }
      gsap.set(inner, { autoAlpha: 0, y: -6 })
      const st = ScrollTrigger.create({
        trigger: title,
        scroller: sc,
        start: () => `bottom top+=${edge()}`,
        invalidateOnRefresh: true,
        // shown from the start point on, however far down (the trigger's own end doesn't matter)
        onEnter: () => show(true),
        onLeaveBack: () => show(false),
        onRefresh: (self) => show(self.scroll() > self.start, true),
      })
      show(st.scroll() > st.start, true)
    }, hero)
    return () => {
      ctx.revert()
      bar.removeAttribute('data-on')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroRef, barRef, ...deps])
}

/** The compact bar: render it as the first child of the page (see above). */
export function CompactBar({ barRef, art, title, round }: { barRef: RefObject<HTMLDivElement | null>; art: ReactNode; title: string; round?: boolean }) {
  return (
    <div ref={barRef} className="ch" aria-hidden>
      <div className="ch-in">
        <span className={`ch-art ${round ? 'is-round' : ''}`}>{art}</span>
        <span className="ch-title">{title}</span>
      </div>
    </div>
  )
}
