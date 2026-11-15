/**
 * Liked songs as a year ring: the last twelve months around the circle (equal arcs, this month just
 * before 12 o'clock), one blip per like on the day it happened, bigger and brighter the more the
 * song has been played. Tapping a month scrolls the list to the newest like in it.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { arcPath, polar } from './Sonar'

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface LikedRingRow {
  /** ms when it was liked */
  at: number
  trackId: string | null
  /** index of its row in the list */
  i: number
}

export function LikedRing({ rows, counts, nowId, size, onJump, compact }: { rows: LikedRingRow[]; counts: Map<string, number>; nowId: string | null; size: number; onJump: (rowIndex: number) => void; compact?: boolean }) {
  const [hover, setHover] = useState(-1)
  const cx = size / 2
  const cy = size / 2
  const R = Math.round((size / 2) * 0.8)
  const W = compact ? 8 : 11
  const GAP = 1.6
  const now = new Date()
  // slot 0 = 11 months ago … slot 11 = this month
  const months = useMemo(() => {
    const out: { y: number; m: number; start: number; end: number }[] = []
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      out.push({ y: d.getFullYear(), m: d.getMonth(), start: d.getTime(), end: e.getTime() })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.getFullYear(), now.getMonth()])

  const placed = useMemo(() => {
    const max = Math.max(1, ...rows.map((r) => (r.trackId ? (counts.get(r.trackId) ?? 0) : 0)))
    const inner = R * 0.42
    const outer = R - W / 2 - 12
    return rows
      .map((r) => {
        const slot = months.findIndex((m) => r.at >= m.start && r.at < m.end)
        if (slot < 0) return null
        const m = months[slot]
        const f = Math.sqrt((r.trackId ? (counts.get(r.trackId) ?? 0) : 0) / max)
        const deg = slot * 30 + GAP / 2 + ((r.at - m.start) / (m.end - m.start)) * (30 - GAP)
        // a little radial spread so likes on the same day don't stack exactly
        const jitter = ((r.i * 7919 + Math.floor(r.at / 864e5) * 31) % 17) / 16
        const [x, y] = polar(cx, cy, inner + (outer - inner) * Math.min(1, 0.08 + 0.5 * f + 0.42 * jitter), deg)
        return { x, y, f, slot, on: !!nowId && r.trackId === nowId, i: r.i }
      })
      .filter((b): b is NonNullable<typeof b> => !!b)
  }, [rows, counts, months, nowId, cx, cy, R, W])

  const perSlot = months.map((_, s) => placed.filter((b) => b.slot === s))
  const playingSlot = placed.find((b) => b.on)?.slot ?? -1
  const focus = hover >= 0 ? hover : playingSlot >= 0 ? playingSlot : 11
  const fm = months[focus]

  const jump = (slot: number) => {
    const first = perSlot[slot].reduce((best, b) => (best < 0 || b.i < best ? b.i : best), -1)
    if (first >= 0) onJump(first)
  }

  return (
    <div className="sn" style={{ width: size, height: size } as CSSProperties}>
      <svg className="sn-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Your likes over the last twelve months">
        {months.map((m, s) => {
          const a0 = s * 30 + GAP / 2
          const a1 = (s + 1) * 30 - GAP / 2
          const on = s === focus
          const [lx, ly] = polar(cx, cy, R + W / 2 + 13, s * 30 + 15)
          return (
            <g key={s} className={`sn-seg ${on ? 'is-played' : 'is-next'} ${hover === s ? 'is-hover' : ''}`}>
              <path d={arcPath(cx, cy, R, a0, a1)} className="sn-arc" strokeWidth={on ? W + 1 : W} />
              <path
                d={arcPath(cx, cy, R, a0, a1)}
                className="sn-hit"
                strokeWidth={W + 22}
                onPointerEnter={() => setHover(s)}
                onPointerLeave={() => setHover(-1)}
                onClick={() => jump(s)}
              >
                <title>
                  {MONTH_LONG[m.m]} {m.y} · {perSlot[s].length} liked
                </title>
              </path>
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className={`sn-mlab ${on ? 'is-on' : ''}`}>
                {MON[m.m]}
              </text>
            </g>
          )
        })}
        {placed.map((b, k) => (
          <circle
            key={k}
            cx={b.x}
            cy={b.y}
            r={b.on ? 4.5 : (compact ? 1 : 1.5) + (compact ? 2 : 2.5) * b.f}
            className={b.on ? 'sn-dot' : 'sn-blip'}
            style={b.on ? undefined : ({ opacity: 0.25 + 0.75 * b.f } as CSSProperties)}
          />
        ))}
      </svg>
      <div className="sn-center">
        <div className="sn-lab">{fm.y}</div>
        <div className="sn-now" style={{ fontSize: compact ? 28 : 40, lineHeight: 1 }}>
          {MONTH_LONG[fm.m].slice(0, 3)}
        </div>
        <div className="sn-mono">{perSlot[focus].length} liked</div>
      </div>
    </div>
  )
}
