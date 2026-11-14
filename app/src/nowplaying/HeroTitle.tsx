/**
 * The full-screen player's title block, one line per row whatever the length.
 *
 * 1. Trailing qualifiers — "(Remastered 2011)", "[Live]", "- Radio Edit", "feat. X" — move off the
 *    hero line onto a small mono line under it ("—— REMASTERED 2011 · LIVE").
 * 2. The hero title is sized to fit its column on one line, between a max and a floor size. Past
 *    the floor it stays at the floor and auto-scrolls (Marquee). Re-fits when the column resizes.
 * 3. "Artist · Album" (HeroSub) is one line too, auto-scrolling when it doesn't fit.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Marquee } from '../components/Marquee'

const QUALIFIER =
  /\b(remaster(ed)?|live|version|ver\.|mix|remix|edit|mono|stereo|demo|acoustic|instrumental|feat\.?|ft\.|featuring|radio|extended|original|bonus|session|reprise|deluxe|anniversary|unplugged|bootleg|outtake|alternate|alt\.|from|soundtrack|ost|interlude|intro|outro|re-?recorded|taylor'?s|vip|rework|sped up|slowed)(?!\w)/i

/** "Song (feat. A) [Live] - 2011 Remaster" → { main: "Song", extra: "feat. A · Live · 2011 Remaster" } */
export function splitTitle(title: string): { main: string; extra?: string } {
  let main = title.trim()
  const extras: string[] = []
  for (let guard = 0; guard < 6; guard++) {
    const bracket = main.match(/^(.+?)\s*[([]([^()[\]]+)[)\]]\s*$/)
    if (bracket) {
      main = bracket[1].trim()
      extras.unshift(bracket[2].trim())
      continue
    }
    const dash = main.match(/^(.+?)\s+[-–—]\s+([^-–—]+)$/)
    if (dash && QUALIFIER.test(dash[2])) {
      main = dash[1].trim()
      extras.unshift(dash[2].trim())
      continue
    }
    const feat = main.match(/^(.+?)\s+((?:feat\.?|ft\.|featuring)\s+.+)$/i)
    if (feat) {
      main = feat[1].trim()
      extras.unshift(feat[2].trim())
      continue
    }
    break
  }
  // never leave the hero line empty or a lone symbol
  if (main.replace(/[^\p{L}\p{N}]/gu, '').length === 0) return { main: title.trim() }
  return extras.length ? { main, extra: extras.join(' · ') } : { main }
}

/** px sizes for the current viewport */
function scale(phone: boolean) {
  const vw = window.innerWidth
  if (phone) {
    const max = Math.max(26, Math.min(34, vw * 0.083))
    return { max, floor: Math.min(max, 28) }
  }
  const max = Math.min(84, vw / 14.4)
  return { max, floor: Math.min(max, Math.max(40, vw * 0.033)) }
}

export function HeroTitle({ title, phone }: { title: string; phone: boolean }) {
  const { main, extra } = splitTitle(title)
  const ref = useRef<HTMLHeadingElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)

  // largest size that fits on one line (text width scales linearly with font size)
  useLayoutEffect(() => {
    const el = ref.current
    const probe = probeRef.current
    if (!el || !probe) return
    const run = () => {
      const { max, floor } = scale(phone)
      const w100 = probe.getBoundingClientRect().width // probe is set at 100px
      const avail = el.clientWidth
      const fit = w100 > 0 && avail > 0 ? (avail / w100) * 100 * 0.985 : max
      el.style.fontSize = `${Math.floor(Math.max(floor, Math.min(max, fit)))}px`
    }
    run()
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      run()
    })
    ro.observe(el)
    let alive = true
    document.fonts?.ready.then(() => alive && run()).catch(() => {})
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [main, phone])

  return (
    <div className="np-titles">
      <h1 ref={ref} className="np-title" title={title}>
        <span ref={probeRef} className="np-title-probe" aria-hidden>
          {main}
        </span>
        <Marquee text={main} />
      </h1>
      {extra && (
        <div className="np-title-x t-mono">
          <span className="np-title-x-line" aria-hidden />
          <Marquee className="np-title-x-t" text={extra} />
        </div>
      )}
    </div>
  )
}

/** "Artist · Album" under the hero title — one line, auto-scrolling when it doesn't fit. */
export function HeroSub({ artist, album, text }: { artist: ReactNode; album?: ReactNode; /** re-measure when this changes */ text: string }) {
  return (
    <div className="np-sub">
      <Marquee text={text}>
        {artist}
        {album && (
          <>
            <span className="np-sub-dot" aria-hidden>
              {' · '}
            </span>
            {album}
          </>
        )}
      </Marquee>
    </div>
  )
}
