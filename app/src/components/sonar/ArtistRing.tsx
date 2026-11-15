/**
 * An artist's discography as a sonar ring: the outer ring is their releases in order, each arc sized
 * by its length; every song is a blip inside its release's arc, further out, bigger and brighter the
 * more you've played it. The playing song glows white and the sweep points at it.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { arcPath, fmtClock, polar, rad } from './Sonar'
import { usePlayerPosition } from '../../state/player'

export interface RingAlbum {
  id: string
  title: string
  year?: number
  tracks: { id: string; title: string; len: number }[]
}

interface Props {
  albums: RingAlbum[]
  counts: Map<string, number>
  /** the loaded track id (any context) */
  nowId: string | null
  playing: boolean
  size: number
  onPlay: (trackId: string) => void
  /** shown in the centre when nothing here is playing or hovered */
  idle: string
}

export function ArtistRing(p: Props) {
  const live = !!p.nowId && p.albums.some((a) => a.tracks.some((t) => t.id === p.nowId))
  return live ? <Live {...p} /> : <Body {...p} pos={0} live={false} />
}

function Live(p: Props) {
  return <Body {...p} pos={usePlayerPosition()} live />
}

function Body({ albums, counts, nowId, playing, size, onPlay, idle, pos, live }: Props & { pos: number; live: boolean }) {
  const [hover, setHover] = useState<string | null>(null)
  const cx = size / 2
  const cy = size / 2
  const R = Math.round((size / 2) * 0.76)
  const W = size < 360 ? 8 : 10
  const GAP = albums.length > 12 ? 1.2 : 3

  const g = useMemo(() => {
    const lens = albums.map((a) => a.tracks.reduce((s, t) => s + (t.len || 180), 0) || 180)
    const total = lens.reduce((a, b) => a + b, 0) || 1
    const all = albums.flatMap((a) => a.tracks.map((t) => counts.get(t.id) ?? 0))
    const max = Math.max(1, ...all)
    const anyPlays = all.some((n) => n > 0)
    const RIN = R * 0.4
    let acc = 0
    const arcs: { id: string; d: string; mid: number; a0: number; a1: number; label: string }[] = []
    const blips: { id: string; title: string; x: number; y: number; f: number; plays: number; a0: number; a1: number; len: number }[] = []
    albums.forEach((a, ai) => {
      const a0 = (acc / total) * 360 + GAP / 2
      const a1 = Math.max(a0 + 0.5, ((acc + lens[ai]) / total) * 360 - GAP / 2)
      arcs.push({ id: a.id, d: arcPath(cx, cy, R, a0, a1), mid: (a0 + a1) / 2, a0, a1, label: `${a.year ? String(a.year).slice(2) + ' ' : ''}${a.title}` })
      let s = acc
      for (const t of a.tracks) {
        const l = t.len || 180
        const t0 = (s / total) * 360
        const t1 = ((s + l) / total) * 360
        const plays = counts.get(t.id) ?? 0
        // no plays yet: every song sits mid-way, evenly
        const f = anyPlays ? Math.sqrt(plays / max) : 0.45
        const [x, y] = polar(cx, cy, RIN + (R - W / 2 - 14 - RIN) * f, (t0 + t1) / 2)
        blips.push({ id: t.id, title: t.title, x, y, f, plays, a0: t0, a1: t1, len: l })
        s += l
      }
      acc += lens[ai]
    })
    return { arcs, blips }
  }, [albums, counts, cx, cy, R, W, GAP])

  const cur = live ? g.blips.find((b) => b.id === nowId) : undefined
  const curAlbum = cur ? albums.find((a) => a.tracks.some((t) => t.id === cur.id))?.id : undefined
  const sweep = cur ? cur.a0 + (cur.a1 - cur.a0) * Math.min(1, pos / cur.len) : 0
  const hov = hover ? g.blips.find((b) => b.id === hover) : undefined
  const labelled = albums.length <= 10
  const hand = R + 10

  return (
    <div className={`sn ${cur ? 'is-live' : ''} ${cur && !playing ? 'is-paused' : ''}`} style={{ width: size, height: size } as CSSProperties}>
      {cur && (
        <div className="sn-sweep" aria-hidden style={{ left: cx, top: cy } as CSSProperties}>
          <span className="sn-trail" style={{ width: R * 2, height: R * 2, left: -R, top: -R, background: `conic-gradient(from ${(sweep - 70).toFixed(1)}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.08) 70deg, rgba(255,255,255,0) 70.2deg)` }} />
          <span className="sn-hand" style={{ height: hand, top: -hand, transformOrigin: `0 ${hand}px`, transform: `rotate(${sweep.toFixed(2)}deg)` }} />
        </div>
      )}
      <svg className="sn-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Releases around the ring; songs inside, brighter the more you've played them">
        <circle cx={cx} cy={cy} r={R * 0.4} className="sn-inner" />
        {g.arcs.map((a) => (
          <g key={a.id} className={`sn-seg ${a.id === curAlbum ? 'is-played' : 'is-idle'}`}>
            <path d={a.d} className="sn-arc" strokeWidth={W} />
            <title>{a.label}</title>
          </g>
        ))}
        {labelled &&
          g.arcs.map((a) => {
            const [x, y] = polar(cx, cy, R + W / 2 + 12, a.mid)
            const sx = Math.sin(rad(a.mid))
            return (
              <text key={a.id} x={x} y={y} textAnchor={sx > 0.15 ? 'start' : sx < -0.15 ? 'end' : 'middle'} dominantBaseline="central" className={`sn-mlab ${a.id === curAlbum ? 'is-on' : ''}`}>
                {a.label.length > 18 ? a.label.slice(0, 17).toUpperCase() + '…' : a.label.toUpperCase()}
              </text>
            )
          })}
        {g.blips.map((b) => {
          const on = b.id === cur?.id
          const r = on ? 5 : 1.5 + 3 * b.f
          return (
            <g key={b.id}>
              <circle cx={b.x} cy={b.y} r={r} className={on ? 'sn-dot' : 'sn-blip'} style={on ? undefined : ({ opacity: hover === b.id ? 1 : 0.22 + 0.78 * b.f } as CSSProperties)} />
              <circle
                cx={b.x}
                cy={b.y}
                r={Math.max(9, r + 5)}
                className="sn-blip-hit"
                onPointerEnter={() => setHover(b.id)}
                onPointerLeave={() => setHover(null)}
                onClick={() => onPlay(b.id)}
              >
                <title>
                  {b.title} · {b.plays} {b.plays === 1 ? 'play' : 'plays'}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
      <div className="sn-center" style={{ maxWidth: R * 0.74 }}>
        {hov ? (
          <>
            <div className="sn-now is-sm is-dim">{hov.title}</div>
            <div className="sn-mono">
              {hov.plays} {hov.plays === 1 ? 'play' : 'plays'}
            </div>
          </>
        ) : cur ? (
          <>
            <div className="sn-now is-sm">{cur.title}</div>
            <div className="sn-mono" style={{ color: 'var(--ink-primary)' }}>
              {fmtClock(pos)} <span style={{ color: 'var(--ink-tertiary)' }}>/ {fmtClock(cur.len)}</span>
            </div>
          </>
        ) : (
          <div className="sn-lab" style={{ whiteSpace: 'normal' }}>{idle}</div>
        )}
      </div>
    </div>
  )
}
