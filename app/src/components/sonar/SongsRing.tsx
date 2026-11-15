/**
 * The library map for long lists (Songs): each group of the list (a letter, an artist, a period)
 * is an arc sized by how many songs it has; blips inside are your most played songs at their place
 * in the list. The sweep and a bright edge follow the scroll position: the rows on screen. Tapping
 * an arc jumps there.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { arcPath, polar } from './Sonar'

export interface RingGroup {
  label: string
  count: number
  letter: boolean
}

interface Props {
  groups: RingGroup[]
  /** positions in the whole list (0..total) of the most played songs, with a 0..1 weight */
  blips: { at: number; w: number; title: string }[]
  /** index in the whole list of the playing song, or -1 */
  nowAt: number
  size: number
  /** scroll so group k's head sits under the sticky bar */
  onJump: (k: number) => void
  /** the group sections, in order (for scroll tracking) */
  sectionSelector: string
}

export function SongsRing({ groups, blips, nowAt, size, onJump, sectionSelector }: Props) {
  const total = groups.reduce((a, g) => a + g.count, 0) || 1
  const starts = useMemo(() => groups.map((_, k) => groups.slice(0, k).reduce((a, g) => a + g.count, 0)), [groups])
  const [view, setView] = useState<[number, number]>([0, 0])
  const [hover, setHover] = useState(-1)

  // where the list is scrolled to, in songs
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    let raf = 0
    const posAt = (y: number, secs: HTMLElement[]) => {
      for (let k = 0; k < secs.length; k++) {
        const r = secs[k].getBoundingClientRect()
        if (y < r.bottom || k === secs.length - 1) {
          const f = Math.max(0, Math.min(1, (y - r.top) / Math.max(1, r.height)))
          return (starts[k] ?? 0) + f * (groups[k]?.count ?? 0)
        }
      }
      return 0
    }
    const update = () => {
      raf = 0
      const secs = [...main.querySelectorAll<HTMLElement>(sectionSelector)]
      if (!secs.length) return
      const box = main.getBoundingClientRect()
      const a = posAt(box.top + 140, secs)
      const b = posAt(box.bottom - 100, secs)
      setView((v) => (Math.abs(v[0] - a) < 0.2 && Math.abs(v[1] - b) < 0.2 ? v : [a, Math.max(a, b)]))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    main.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      main.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [groups, starts, sectionSelector])

  const cx = size / 2
  const cy = size / 2
  const R = Math.round((size / 2) * 0.78)
  const W = 10
  const GAP = groups.length > 40 ? 0.5 : 1.2
  const ang = (n: number) => (n / total) * 360
  const focus = hover >= 0 ? hover : Math.max(0, starts.findIndex((s, k) => view[0] >= s && view[0] < s + groups[k].count))
  const sweep = ang(view[0])
  const hand = R + 10
  const labelled = groups.every((g) => g.letter)
  const g = groups[focus]

  return (
    <div className="sn is-live" style={{ width: size, height: size } as CSSProperties}>
      <div className="sn-sweep" aria-hidden style={{ left: cx, top: cy } as CSSProperties}>
        <span className="sn-trail" style={{ width: R * 2, height: R * 2, left: -R, top: -R, background: `conic-gradient(from ${(sweep - 60).toFixed(1)}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.07) 60deg, rgba(255,255,255,0) 60.2deg)` }} />
        <span className="sn-hand" style={{ height: hand, top: -hand, transformOrigin: `0 ${hand}px`, transform: `rotate(${sweep.toFixed(2)}deg)` }} />
      </div>
      <svg className="sn-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Your songs as a map: one arc per group, sized by how many songs it has">
        {groups.map((gr, k) => {
          let a0 = ang(starts[k]) + GAP / 2
          let a1 = ang(starts[k] + gr.count) - GAP / 2
          if (a1 - a0 < 0.4) a1 = a0 + 0.4
          if (groups.length === 1) {
            a0 = 0
            a1 = 359.99
          }
          const on = k === focus
          return (
            <g key={gr.label + k} className={`sn-seg ${on ? 'is-played' : 'is-idle'} ${hover === k ? 'is-hover' : ''}`}>
              <path d={arcPath(cx, cy, R, a0, a1)} className="sn-arc" strokeWidth={on ? W + 2 : W} />
              <path d={arcPath(cx, cy, R, a0, a1)} className="sn-hit" strokeWidth={W + 20} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(-1)} onClick={() => onJump(k)}>
                <title>
                  {gr.label} · {gr.count} {gr.count === 1 ? 'song' : 'songs'}
                </title>
              </path>
              {labelled && a1 - a0 >= 3 && (
                <text {...xy(polar(cx, cy, R + W / 2 + 12, (a0 + a1) / 2))} textAnchor="middle" dominantBaseline="central" className={`sn-mlab ${on ? 'is-on' : ''}`} style={{ fontSize: 10 }}>
                  {gr.label}
                </text>
              )}
            </g>
          )
        })}
        <path d={arcPath(cx, cy, R + W / 2 + 4, ang(view[0]), Math.max(ang(view[0]) + 0.6, ang(view[1])))} className="sn-win" />
        {blips.map((b, k) => {
          const [x, y] = polar(cx, cy, R * 0.42 + (R - W / 2 - 14 - R * 0.42) * Math.sqrt(b.w), ang(b.at))
          return (
            <circle key={k} cx={x} cy={y} r={1.5 + 3 * b.w} className="sn-blip" style={{ opacity: 0.25 + 0.75 * b.w } as CSSProperties}>
              <title>{b.title}</title>
            </circle>
          )
        })}
        {nowAt >= 0 && <circle {...cxy(polar(cx, cy, R, ang(nowAt + 0.5)))} r={4} className="sn-dot" />}
      </svg>
      {g && (
        <div className="sn-center" style={{ maxWidth: R * 0.9 }}>
          <div className={g.letter ? 'sn-now' : 'sn-now is-sm'} style={g.letter ? { fontSize: 56, lineHeight: 1 } : undefined}>
            {g.label}
          </div>
          <div className="sn-mono">
            {g.count} {g.count === 1 ? 'song' : 'songs'}
          </div>
        </div>
      )}
    </div>
  )
}

const xy = ([x, y]: [number, number]) => ({ x, y })
const cxy = ([x, y]: [number, number]) => ({ cx: x, cy: y })
