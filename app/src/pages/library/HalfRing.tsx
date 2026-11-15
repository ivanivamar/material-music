/**
 * Phone A–Z scrubber as a half-ring (Nov 2026, sonar lists). At rest: a slim handle on the right
 * edge with the current letter. Hold the edge and a half-ring of letters swings out around the
 * thumb: letters evenly spaced from A at the top to Z at the bottom, a tick beside each sized by how
 * many items it has, the letters near the thumb magnified, and a big bubble with the letter and its
 * count. Slide along it to jump; let go to close.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { LETTERS, jumpToLetter, useActiveLetter } from './libgrid'

const SPAN = 136 // degrees of arc used
const A0 = 270 - SPAN / 2 // bottom end (Z)
const A1 = 270 + SPAN / 2 // top end (A)
const rad = (d: number) => (d * Math.PI) / 180

export function HalfRingScrubber({
  present,
  counts,
  unit = 'songs',
  active: activeIn,
  onJump,
}: {
  present: Set<string>
  counts: Map<string, number>
  unit?: string
  /** for windowed lists: the letter on screen and how to jump (the heads may not be in the DOM) */
  active?: string | null
  onJump?: (l: string) => string | null
}) {
  const [activeDom, setActiveDom] = useActiveLetter(present)
  const active = activeIn !== undefined ? activeIn : activeDom
  const setActive = (l: string | null) => (activeIn !== undefined ? undefined : setActiveDom(l))
  const [touch, setTouch] = useState<{ deg: number } | null>(null)
  const [recent, setRecent] = useState(false)
  const last = useRef<string | null>(null)
  const idle = useRef(0)

  // show the handle's letter while the list scrolls
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    const on = () => {
      setRecent(true)
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => setRecent(false), 1400)
    }
    main.addEventListener('scroll', on, { passive: true })
    return () => {
      main.removeEventListener('scroll', on)
      window.clearTimeout(idle.current)
    }
  }, [])

  const vw = window.innerWidth
  const vh = window.innerHeight
  const R = Math.min(232, vh * 0.3)
  const CX = vw + R * 0.42
  const CY = vh * 0.5
  const n = LETTERS.length
  const angOf = (i: number) => A1 - ((i + 0.5) / n) * SPAN
  const pt = (r: number, d: number): [number, number] => [CX + r * Math.sin(rad(d)), CY - r * Math.cos(rad(d))]
  const maxC = Math.max(1, ...LETTERS.map((l) => counts.get(l) ?? 0))

  const pick = (clientX: number, clientY: number) => {
    let deg = (Math.atan2(clientX - CX, -(clientY - CY)) * 180) / Math.PI
    if (deg < 0) deg += 360
    deg = Math.max(A0, Math.min(A1, deg))
    setTouch({ deg })
    const i = Math.max(0, Math.min(n - 1, Math.floor(((A1 - deg) / SPAN) * n)))
    const want = LETTERS[i]
    if (want !== last.current) {
      last.current = want
      const got = onJump ? onJump(want) : jumpToLetter(want, present)
      if (got) {
        setActive(got)
        navigator.vibrate?.(4)
      }
    }
  }
  const down = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = null
    pick(e.clientX, e.clientY)
  }
  const end = () => {
    setTouch(null)
    last.current = null
  }

  const ai = active ? LETTERS.indexOf(active) : -1
  const handleY = ai >= 0 ? pt(R, angOf(ai))[1] : CY

  return (
    <>
      <div
        className={`hr-edge ${touch ? 'is-held' : ''}`}
        onPointerDown={down}
        onPointerMove={(e) => touch && pick(e.clientX, e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
        role="slider"
        aria-label="Jump to letter"
        aria-valuetext={active ?? ''}
        style={{ top: CY - R, height: R * 2 } as CSSProperties}
      >
        <span className={`hr-handle ${recent ? 'is-on' : ''}`} style={{ top: handleY - (CY - R) } as CSSProperties}>
          {active && <span className="hr-handle-l">{active}</span>}
        </span>
      </div>
      {touch &&
        createPortal(
          <div className="hr" aria-hidden>
            <div className="hr-dim" style={{ background: `radial-gradient(${R * 1.3}px ${R * 1.6}px at 100% ${CY}px, rgba(11,11,12,.92), rgba(11,11,12,0) 100%)` }} />
            <svg className="hr-svg" width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}>
              <path d={arc(CX, CY, R, A0 - 3, A1 + 3)} className="hr-track" />
              {LETTERS.map((l, i) => {
                const a = angOf(i)
                const d = Math.abs(i - ai)
                const on = d === 0
                const c = counts.get(l) ?? 0
                const [x0, y0] = pt(R, a)
                const [x1, y1] = pt(R - 4 - 18 * (c / maxC), a)
                const [lx, ly] = pt(R + (on ? 26 : d <= 2 ? 18 : 14), a)
                return (
                  <g key={l} className={`${on ? 'is-on' : d <= 2 ? 'is-near' : ''} ${present.has(l) ? '' : 'is-empty'}`}>
                    {c > 0 && <line x1={x0} y1={y0} x2={x1} y2={y1} className="hr-tick" />}
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="hr-l" style={{ fontSize: on ? 15 : d <= 2 ? 11 : 9 }}>
                      {l}
                    </text>
                  </g>
                )
              })}
              {ai >= 0 && <line {...line(pt(R - 30, angOf(ai)), pt(R + 8, angOf(ai)))} className="hr-arm" />}
            </svg>
            {(() => {
              const [tx, ty] = pt(R + 2, touch.deg)
              return (
                <>
                  <span className="hr-thumb" style={{ left: tx - 23, top: ty - 23 } as CSSProperties} />
                  {active && (
                    <span className="hr-bub" style={{ left: tx - 168, top: ty - 52 } as CSSProperties}>
                      <span className="hr-bub-l">{active}</span>
                      <span className="hr-bub-n">
                        {counts.get(active) ?? 0} {unit}
                      </span>
                    </span>
                  )}
                </>
              )
            })()}
          </div>,
          document.body,
        )}
    </>
  )
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (d: number) => [cx + r * Math.sin(rad(d)), cy - r * Math.cos(rad(d))]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}
const line = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => ({ x1, y1, x2, y2 })
