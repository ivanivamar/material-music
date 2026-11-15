/**
 * Liked songs as a year ring: twelve months around the circle (equal arcs; the last twelve months
 * with this month just before 12 o'clock, or January–December of a chosen year), one blip per like
 * on the day it happened, bigger and brighter the more the song has been played. The sweep and a
 * bright edge follow the list as it scrolls; the centre names the month on screen. Tapping a month
 * scrolls the list to the newest like in it.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { arcPath, polar } from './Sonar'

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export interface LikedRingRow {
  /** ms when it was liked */
  at: number
  trackId: string | null
  /** index of its row in the list */
  i: number
}

interface Props {
  rows: LikedRingRow[]
  counts: Map<string, number>
  nowId: string | null
  size: number
  onJump: (rowIndex: number) => void
  compact?: boolean
  /** 'last' = the last twelve months, else that calendar year */
  year?: 'last' | number
  /** liked-at (ms) of the rows at the top and bottom of the screen */
  view?: [number, number] | null
}

export function monthSlots(year: 'last' | number, now = new Date()) {
  const out: { y: number; m: number; start: number; end: number }[] = []
  for (let k = 0; k < 12; k++) {
    const d = year === 'last' ? new Date(now.getFullYear(), now.getMonth() - 11 + k, 1) : new Date(year, k, 1)
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    out.push({ y: d.getFullYear(), m: d.getMonth(), start: d.getTime(), end: e.getTime() })
  }
  return out
}

export function LikedRing({ rows, counts, nowId, size, onJump, compact, year = 'last', view }: Props) {
  const [hover, setHover] = useState(-1)
  const cx = size / 2
  const cy = size / 2
  const R = Math.round((size / 2) * 0.8)
  const W = compact ? 8 : 11
  const GAP = 1.6
  const now = new Date()
  const ym = `${now.getFullYear()}-${now.getMonth()}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const months = useMemo(() => monthSlots(year), [year, ym])
  const angAt = (ms: number): number | null => {
    const s = months.findIndex((m) => ms >= m.start && ms < m.end)
    if (s < 0) return null
    const m = months[s]
    return s * 30 + GAP / 2 + ((ms - m.start) / (m.end - m.start)) * (30 - GAP)
  }

  const placed = useMemo(() => {
    const max = Math.max(1, ...rows.map((r) => (r.trackId ? (counts.get(r.trackId) ?? 0) : 0)))
    const inner = R * 0.42
    const outer = R - W / 2 - 12
    const out: { x: number; y: number; f: number; slot: number; on: boolean; i: number }[] = []
    for (const r of rows) {
      const slot = months.findIndex((m) => r.at >= m.start && r.at < m.end)
      if (slot < 0) continue
      const m = months[slot]
      const f = Math.sqrt((r.trackId ? (counts.get(r.trackId) ?? 0) : 0) / max)
      const deg = slot * 30 + GAP / 2 + ((r.at - m.start) / (m.end - m.start)) * (30 - GAP)
      // a little radial spread so likes on the same day don't stack exactly
      const jitter = ((r.i * 7919 + Math.floor(r.at / 864e5) * 31) % 17) / 16
      const [x, y] = polar(cx, cy, inner + (outer - inner) * Math.min(1, 0.08 + 0.5 * f + 0.42 * jitter), deg)
      out.push({ x, y, f, slot, on: !!nowId && r.trackId === nowId, i: r.i })
    }
    return out
  }, [rows, counts, months, nowId, cx, cy, R, W])

  const perSlot = months.map((_, s) => placed.filter((b) => b.slot === s))
  const viewSlot = view ? months.findIndex((m) => view[0] >= m.start && view[0] < m.end) : -1
  const playingSlot = placed.find((b) => b.on)?.slot ?? -1
  const focus = hover >= 0 ? hover : viewSlot >= 0 ? viewSlot : playingSlot >= 0 ? playingSlot : 11
  const fm = months[focus]
  const top = view ? angAt(view[0]) : null
  const bot = view ? angAt(view[1]) : null
  const edge = top != null || bot != null ? [Math.min(top ?? bot!, bot ?? top!), Math.max(top ?? bot!, bot ?? top!)] : null
  const hand = R + 10

  const jump = (slot: number) => {
    const first = perSlot[slot].reduce((best, b) => (best < 0 || b.i < best ? b.i : best), -1)
    if (first >= 0) onJump(first)
  }

  return (
    <div className="sn is-live" style={{ width: size, height: size } as CSSProperties}>
      {top != null && (
        <div className="sn-sweep" aria-hidden style={{ left: cx, top: cy } as CSSProperties}>
          <span className="sn-trail" style={{ width: R * 2, height: R * 2, left: -R, top: -R, background: `conic-gradient(from ${(top - 60).toFixed(1)}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.08) 60deg, rgba(255,255,255,0) 60.2deg)` }} />
          <span className="sn-hand" style={{ height: hand, top: -hand, transformOrigin: `0 ${hand}px`, transform: `rotate(${top.toFixed(2)}deg)` }} />
        </div>
      )}
      <svg className="sn-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Your likes month by month">
        {months.map((m, s) => {
          const a0 = s * 30 + GAP / 2
          const a1 = (s + 1) * 30 - GAP / 2
          const on = s === focus
          const [lx, ly] = polar(cx, cy, R + W / 2 + 14, s * 30 + 15)
          return (
            <g key={s} className={`sn-seg ${on ? 'is-played' : 'is-next'} ${hover === s ? 'is-hover' : ''}`}>
              <path d={arcPath(cx, cy, R, a0, a1)} className="sn-arc" strokeWidth={on ? W + 1 : W} style={on ? { filter: 'drop-shadow(0 0 6px rgba(255,255,255,.35))' } : undefined} />
              <path d={arcPath(cx, cy, R, a0, a1)} className="sn-hit" strokeWidth={W + 22} onPointerEnter={() => setHover(s)} onPointerLeave={() => setHover(-1)} onClick={() => jump(s)}>
                <title>
                  {MON[m.m]} {m.y} · {perSlot[s].length} liked
                </title>
              </path>
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className={`sn-mlab ${on ? 'is-on' : ''}`}>
                {MON[m.m]}
              </text>
            </g>
          )
        })}
        {edge && <path d={arcPath(cx, cy, R + W / 2 + 4, edge[0], Math.max(edge[0] + 0.8, edge[1]))} className="sn-win" />}
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
        <div className="sn-now" style={{ fontSize: compact ? 30 : 46, lineHeight: 1 }}>
          {MON[fm.m].charAt(0) + MON[fm.m].slice(1).toLowerCase()}
        </div>
        <div className="sn-mono">{perSlot[focus].length} liked</div>
      </div>
    </div>
  )
}
