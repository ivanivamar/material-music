/**
 * The full-screen player's hero title, made to survive any length.
 *
 * 1. Trailing qualifiers — "(Remastered 2011)", "[Live]", "- Radio Edit", "feat. X" — move off the
 *    hero line onto a small mono line under it ("—— REMASTERED 2011 · LIVE").
 * 2. The rest is fitted to the column by measurement, not by character count: the largest size
 *    that fits on ≤ 2 lines without breaking a word, else the largest on ≤ 3 lines, else the floor
 *    size clamped to 3 lines. Re-fits whenever the column width changes.
 * 3. Still too long → the last line ends in "…" and a tap/click expands the full title in place.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

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

interface Fit {
  lines: number
  size: number
  truncated: boolean
}

/** px sizes for the current viewport */
function scale(phone: boolean) {
  const vw = window.innerWidth
  if (phone) {
    const max = Math.max(26, Math.min(34, vw * 0.083))
    return { max, min2: 24, min3: 21, lh: 1.1 }
  }
  const max = Math.min(84, vw / 14.4)
  return { max, min2: Math.min(max, Math.max(32, vw * 0.031)), min3: Math.min(max, Math.max(32, vw * 0.031), Math.max(28, Math.min(36, vw * 0.024))), lh: 1.08 }
}

function useFit(ref: RefObject<HTMLElement | null>, text: string, phone: boolean, expanded: boolean): Fit {
  const [fit, setFit] = useState<Fit>({ lines: 1, size: 0, truncated: false })

  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return

    const run = () => {
      const { max, min2, min3, lh } = scale(phone)
      el.style.setProperty('--np-lh', String(lh))
      el.classList.add('is-measuring')
      const lineCount = (size: number) => {
        el.style.fontSize = `${size}px`
        return Math.round(el.getBoundingClientRect().height / (size * lh))
      }
      // whole words only while searching: a word wider than the column means "smaller"
      const fits = (size: number, lines: number) => lineCount(size) <= lines && el.scrollWidth <= el.clientWidth + 1
      const search = (lo: number, hi: number, lines: number): number | null => {
        if (fits(hi, lines)) return hi
        if (!fits(lo, lines)) return null
        let a = lo
        let b = hi
        while (b - a > 0.5) {
          const m = (a + b) / 2
          if (fits(m, lines)) a = m
          else b = m
        }
        return Math.floor(a)
      }
      let result: Fit
      const two = search(min2, max, 2)
      const three = two === null ? search(min3, min2, 3) : null
      if (two !== null) result = { size: two, lines: lineCount(two), truncated: false }
      else if (three !== null) result = { size: three, lines: lineCount(three), truncated: false }
      else {
        // floor size; long words may now break anywhere
        el.style.overflowWrap = 'anywhere'
        const n = lineCount(min3)
        el.style.overflowWrap = ''
        result = { size: min3, lines: n, truncated: n > 3 }
      }
      el.classList.remove('is-measuring')
      el.style.fontSize = `${result.size}px`
      el.style.setProperty('--np-clamp', expanded ? 'none' : String(Math.min(3, Math.max(2, result.lines))))
      setFit((f) => (f.size === result.size && f.lines === result.lines && f.truncated === result.truncated ? f : result))
    }

    run()
    let width = box.clientWidth
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      run()
    })
    ro.observe(box)
    let alive = true
    document.fonts?.ready.then(() => alive && run()).catch(() => {})
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [ref, text, phone, expanded])

  return fit
}

export function HeroTitle({ title, phone, onLines }: { title: string; phone: boolean; onLines?: (lines: number, hasExtra: boolean) => void }) {
  const { main, extra } = splitTitle(title)
  const ref = useRef<HTMLHeadingElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [lastTitle, setLastTitle] = useState(title)
  if (title !== lastTitle) {
    setLastTitle(title)
    setExpanded(false)
  }
  const fit = useFit(ref, main, phone, expanded)
  const shown = expanded ? Math.max(fit.lines, 3) : Math.min(fit.lines, 3)

  const onLinesRef = useRef(onLines)
  onLinesRef.current = onLines
  useLayoutEffect(() => {
    onLinesRef.current?.(shown, !!extra)
  }, [shown, extra])

  const toggle = fit.truncated || expanded
  return (
    <div className={`np-titles ${expanded ? 'is-expanded' : ''}`}>
      <h1
        ref={ref}
        className={`np-title ${toggle ? 'is-toggle' : ''}`}
        title={title}
        {...(toggle
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': expanded,
              onClick: () => setExpanded((v) => !v),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpanded((v) => !v)
                }
              },
            }
          : {})}
      >
        {main}
      </h1>
      {extra && (
        <div className="np-title-x t-mono">
          <span className="np-title-x-line" aria-hidden />
          <span className="np-title-x-t">{extra}</span>
        </div>
      )}
    </div>
  )
}
