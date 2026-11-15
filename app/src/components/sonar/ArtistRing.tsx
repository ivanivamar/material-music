/**
 * An artist's discography as a sonar screen (Nov 2026 mockup): the ring is their releases in order,
 * each arc sized by its length with a seam between songs; every song is a blip inside its release,
 * further out ("closer to the ring") the more you've played it. The five most played are named,
 * with a dashed spoke from the inner circle. The playing song glows white and the sweep points at
 * it. Desktop: release tags around the outside (open the release). Phone: short mono labels.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { arcPath, fmtClock, polar, rad } from './Sonar'
import { usePlayerPosition } from '../../state/player'

export interface RingAlbum {
  id: string
  title: string
  year?: number
  /** e.g. "album", "EP" */
  kind?: string
  href?: string
  tracks: { id: string; title: string; len: number }[]
}

interface Props {
  albums: RingAlbum[]
  counts: Map<string, number>
  /** the loaded track id (any context) */
  nowId: string | null
  playing: boolean
  /** box width and height */
  width: number
  height: number
  onPlay: (trackId: string) => void
  /** phone: short labels, no named blips */
  phone?: boolean
  /** shown in the centre when nothing of theirs plays */
  idle: string
}

export function ArtistRing(p: Props) {
  const live = !!p.nowId && p.albums.some((a) => a.tracks.some((t) => t.id === p.nowId))
  return live ? <Live {...p} /> : <Body {...p} pos={0} />
}

function Live(p: Props) {
  return <Body {...p} pos={usePlayerPosition()} />
}

function Body({ albums, counts, nowId, playing, width, height, onPlay, phone, idle, pos }: Props & { pos: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const cx = width / 2
  const cy = height / 2
  const R = Math.round(Math.min(width, height) * (phone ? 0.37 : 0.303))
  const RIN = Math.round(R * 0.47)
  const W = phone ? 9 : 12
  const GAP = albums.length > 12 ? 1.2 : phone ? 3 : 2.4

  const g = useMemo(() => {
    const lens = albums.map((a) => a.tracks.reduce((s, t) => s + (t.len || 180), 0) || 180)
    const total = lens.reduce((a, b) => a + b, 0) || 1
    const all = albums.flatMap((a) => a.tracks.map((t) => counts.get(t.id) ?? 0))
    const max = Math.max(1, ...all)
    const anyPlays = all.some((n) => n > 0)
    let acc = 0
    const arcs: { id: string; d: string; mid: number; album: RingAlbum }[] = []
    const seams: { x1: number; y1: number; x2: number; y2: number }[] = []
    const blips: { id: string; title: string; x: number; y: number; r: number; f: number; plays: number; a0: number; a1: number; mid: number; len: number; show: boolean }[] = []
    albums.forEach((a, ai) => {
      const a0 = (acc / total) * 360 + GAP / 2
      const a1 = Math.max(a0 + 0.5, ((acc + lens[ai]) / total) * 360 - GAP / 2)
      arcs.push({ id: a.id, d: arcPath(cx, cy, R, a0, a1), mid: (a0 + a1) / 2, album: a })
      let s = acc
      a.tracks.forEach((t, ti) => {
        const l = t.len || 180
        const t0 = (s / total) * 360
        const t1 = ((s + l) / total) * 360
        const prevPx = ti > 0 ? (rad(t0 - ((s - (a.tracks[ti - 1].len || 180)) / total) * 360) * R) : 0
        if (ti > 0 && prevPx >= 7 && rad(t1 - t0) * R >= 7) {
          const [x1, y1] = polar(cx, cy, R - W / 2 - 1, t0)
          const [x2, y2] = polar(cx, cy, R + W / 2 + 1, t0)
          seams.push({ x1, y1, x2, y2 })
        }
        const plays = counts.get(t.id) ?? 0
        // no plays yet: every song sits half-way, evenly
        const f = anyPlays ? Math.sqrt(plays / max) : 0.45
        const r = RIN + (R - (phone ? 18 : 26) - RIN) * f
        const mid = (t0 + t1) / 2
        const [x, y] = polar(cx, cy, r, mid)
        blips.push({ id: t.id, title: t.title, x, y, r, f, plays, a0: t0, a1: t1, mid, len: l, show: !anyPlays || plays > 0 || t.id === nowId })
        s += l
      })
      acc += lens[ai]
    })
    // ── labels without collisions ──
    const placed: Box[] = []
    const fits = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= width && b.y1 <= height && !placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)
    // release tags: biggest releases first, pushed outwards if they'd overlap, else dropped
    const tags: { id: string; x: number; y: number; right: boolean; vy: number; maxW: number }[] = []
    const order = arcs.map((a, k) => ({ a, k, len: lens[k] })).sort((p, q) => q.len - p.len)
    for (const { a } of order) {
      const right = Math.sin(rad(a.mid)) >= 0
      const vy = Math.cos(rad(a.mid))
      const meta = tagMeta(a.album)
      const label = phone ? shortLabel(a.album) : a.album.title
      const want = phone ? label.length * 6.4 + 6 : Math.max(Math.min(200, label.length * 8.2), meta.length * 8.8) + 16
      const h = phone ? 12 : 40
      for (const dr of phone ? [0, 14] : [0, 24, 48]) {
        const [x, y] = polar(cx, cy, (phone ? R + W / 2 + 12 : R + 30) + dr, a.mid)
        const centred = phone && Math.abs(Math.sin(rad(a.mid))) < 0.15
        // shorten the title to the room up to the edge (it ends in "…")
        const room = centred ? Math.min(x, width - x) * 2 : right ? width - x : x
        const w = Math.min(want, room)
        if (w < (phone ? 48 : 96)) continue
        const x0 = centred ? x - w / 2 : right ? x : x - w
        const y0 = phone ? y - h / 2 : vy > 0.6 ? y - h : vy < -0.6 ? y : y - h / 2
        const box = { x0, y0, x1: x0 + w, y1: y0 + h }
        if (fits(box)) {
          placed.push(box)
          tags.push({ id: a.id, x, y, right, vy, maxW: w })
          break
        }
      }
    }
    // the most played songs by name, as many of five as fit
    const named: string[] = []
    if (!phone && anyPlays)
      for (const b of blips.filter((x) => x.plays > 0).sort((p, q) => q.plays - p.plays)) {
        if (named.length >= 5) break
        const right = Math.sin(rad(b.mid)) >= 0
        const w = Math.min(220, b.title.length * 7.4) + 30
        const x0 = right ? b.x + 10 : b.x - 10 - w
        const box = { x0, y0: b.y - 10, x1: x0 + w, y1: b.y + 10 }
        if (fits(box)) {
          placed.push(box)
          named.push(b.id)
        }
      }
    const top = named.map((id) => blips.find((b) => b.id === id)!)
    return { arcs, seams, blips, top, tags }
  }, [albums, counts, cx, cy, R, RIN, W, GAP, phone, width, height, nowId])

  const cur = nowId ? g.blips.find((b) => b.id === nowId) : undefined
  const curAlbum = cur ? albums.find((a) => a.tracks.some((t) => t.id === cur.id))?.id : undefined
  const sweep = cur ? cur.a0 + (cur.a1 - cur.a0) * Math.min(1, pos / cur.len) : 0
  const hov = hover ? g.blips.find((b) => b.id === hover) : undefined
  const hand = R + 14

  return (
    <div className={`sn sn-artist-ring ${cur ? 'is-live' : ''} ${cur && !playing ? 'is-paused' : ''}`} style={{ width, height } as CSSProperties}>
      <div className="sn-sweep" aria-hidden style={{ left: cx, top: cy } as CSSProperties}>
        {!phone && <span className="sn-guide" style={{ width: R * 2.74, height: R * 2.74, left: -R * 1.37, top: -R * 1.37, opacity: 0.8 }} />}
        <span className="sn-guide" style={{ width: R * 1.56, height: R * 1.56, left: -R * 0.78, top: -R * 0.78 }} />
        <span className="sn-guide" style={{ width: RIN * 2, height: RIN * 2, left: -RIN, top: -RIN, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)' }} />
        {cur && (
          <>
            <span className="sn-trail" style={{ width: R * 1.94, height: R * 1.94, left: -R * 0.97, top: -R * 0.97, background: `conic-gradient(from ${(sweep - 70).toFixed(1)}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.08) 70deg, rgba(255,255,255,0) 70.2deg)` }} />
            <span className="sn-hand" style={{ height: hand, top: -hand, transformOrigin: `0 ${hand}px`, transform: `rotate(${sweep.toFixed(2)}deg)` }} />
          </>
        )}
      </div>
      <svg className="sn-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Releases around the ring; songs inside, closer to the ring the more you've played them">
        {g.arcs.map((a) => (
          <g key={a.id} className={`sn-seg ${a.id === curAlbum ? 'is-played' : 'is-idle'}`}>
            <path d={a.d} className="sn-arc" strokeWidth={W} style={a.id === curAlbum ? { stroke: 'rgba(255,255,255,.42)' } : { stroke: 'rgba(255,255,255,.16)' }} />
            <title>{a.album.title}</title>
          </g>
        ))}
        {g.seams.map((s, k) => (
          <line key={k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className="sn-seam" />
        ))}
        {!phone &&
          g.top.map((b) => {
            const [x1, y1] = polar(cx, cy, RIN - 12, b.mid)
            return <line key={b.id} x1={x1} y1={y1} x2={b.x} y2={b.y} className="sn-spoke" />
          })}
        {phone &&
          g.tags.map(({ id, x, y, maxW }) => {
            const a = g.arcs.find((r) => r.id === id)!
            const sx = Math.sin(rad(a.mid))
            const label = shortLabel(a.album)
            const fit = Math.max(4, Math.floor((maxW - 6) / 6.4))
            return (
              <text key={a.id} x={x} y={y} textAnchor={sx > 0.15 ? 'start' : sx < -0.15 ? 'end' : 'middle'} dominantBaseline="central" className={`sn-mlab ${a.id === curAlbum ? 'is-on' : ''}`}>
                {label.length > fit ? label.slice(0, fit - 1) + '…' : label}
              </text>
            )
          })}
        {g.blips.map((b) => {
          if (!b.show) return null
          const on = b.id === cur?.id
          const r = on ? (phone ? 5 : 6) : (phone ? 1.5 : 2) + (phone ? 3 : 3.5) * b.f
          return (
            <g key={b.id}>
              <circle cx={b.x} cy={b.y} r={r} className={on ? 'sn-dot' : 'sn-blip'} style={on ? { filter: 'drop-shadow(0 0 10px rgba(255,255,255,.7))' } : ({ opacity: hover === b.id ? 1 : 0.22 + 0.78 * b.f, filter: b.f > 0.45 ? `drop-shadow(0 0 5px rgba(255,255,255,${(b.f * 0.6).toFixed(2)}))` : undefined } as CSSProperties)} />
              <circle cx={b.x} cy={b.y} r={Math.max(9, r + 5)} className="sn-blip-hit" onPointerEnter={() => setHover(b.id)} onPointerLeave={() => setHover(null)} onClick={() => onPlay(b.id)}>
                <title>
                  {b.title} · {b.plays} {b.plays === 1 ? 'play' : 'plays'}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
      {!phone &&
        g.top.map((b) => {
          const right = Math.sin(rad(b.mid)) >= 0
          return (
            <span key={b.id} className={`sn-bl ${b.id === cur?.id ? 'is-on' : ''}`} style={{ left: b.x + (right ? 12 : -12), top: b.y, transform: `translate(${right ? '0' : '-100%'}, -50%)` } as CSSProperties}>
              {b.title} <span className="sn-bl-n">{b.plays}</span>
            </span>
          )
        })}
      {!phone &&
        g.tags.map(({ id, x, y, right, vy, maxW }) => {
          const a = g.arcs.find((r) => r.id === id)!
          const on = a.id === curAlbum
          const meta = tagMeta(a.album)
          return (
            <a
              key={a.id}
              href={a.album.href}
              className={`sn-alb ${on ? 'is-on' : ''}`}
              style={{ left: x, top: y, maxWidth: maxW, transform: `translate(${right ? '0' : '-100%'}, ${vy > 0.6 ? '-100%' : vy < -0.6 ? '0' : '-50%'})`, alignItems: right ? 'flex-start' : 'flex-end', textAlign: right ? 'left' : 'right' } as CSSProperties}
            >
              <span className="sn-tag-meta">{meta}</span>
              <span className="sn-alb-t" style={{ maxWidth: Math.min(200, maxW - 12) }}>
                {a.album.title}
              </span>
            </a>
          )
        })}
      <div className="sn-center" style={{ maxWidth: RIN * 1.7 }}>
        {hov ? (
          <>
            <div className="sn-now is-sm is-dim">{hov.title}</div>
            <div className="sn-mono">
              {hov.plays} {hov.plays === 1 ? 'play' : 'plays'}
            </div>
          </>
        ) : cur ? (
          <>
            <div className="sn-lab" style={{ color: 'var(--ink-secondary)' }}>
              {playing ? 'Now' : 'Paused'}
            </div>
            <div className="sn-now is-sm" style={{ fontSize: phone ? 16 : 21 }}>
              {cur.title}
            </div>
            <div className="sn-mono" style={{ color: 'var(--ink-primary)', fontSize: 10 }}>
              {fmtClock(pos)} <span style={{ color: 'var(--ink-tertiary)' }}>/ {fmtClock(cur.len)}</span>
            </div>
          </>
        ) : (
          <div className="sn-lab" style={{ whiteSpace: 'normal' }}>
            {idle}
          </div>
        )}
      </div>
    </div>
  )
}

/** The brightest blips by name (phone): dot sized and lit like its blip, title, plays. */
export function TopPlayed({ albums, counts, nowId, onPlay, n = 4 }: { albums: RingAlbum[]; counts: Map<string, number>; nowId: string | null; onPlay: (id: string) => void; n?: number }) {
  const all = albums.flatMap((a) => a.tracks)
  const max = Math.max(1, ...all.map((t) => counts.get(t.id) ?? 0))
  const top = all
    .map((t) => ({ t, plays: counts.get(t.id) ?? 0 }))
    .filter((x) => x.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, n)
  if (!top.length) return null
  return (
    <div className="sn-top" role="list" aria-label="Most played">
      <div className="snp-upnext">
        <span className="sn-lab" style={{ color: 'var(--ink-primary)' }}>
          Most played
        </span>
        <span className="sect-line" />
        <span className="sn-lab">Brightest blips</span>
      </div>
      {top.map(({ t, plays }) => {
        const f = Math.sqrt(plays / max)
        const on = t.id === nowId
        const d = Math.max(6, Math.round(3 + 6 * f))
        return (
          <button key={t.id} type="button" role="listitem" className={`sn-mrow ${on ? 'is-current' : ''}`} onClick={() => onPlay(t.id)}>
            <span className="sn-top-dot">
              <i style={{ width: d, height: d, opacity: on ? 1 : 0.22 + 0.78 * f, boxShadow: on ? '0 0 0 3px rgba(255,255,255,.12), 0 0 14px 3px rgba(255,255,255,.6)' : f > 0.45 ? `0 0 8px rgba(255,255,255,${(f * 0.6).toFixed(2)})` : 'none' }} />
            </span>
            <span className="sn-mrow-t">
              <span className="sn-mrow-title">{t.title}</span>
            </span>
            <span className="sn-mrow-d">{plays} plays</span>
          </button>
        )
      })}
    </div>
  )
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const tagMeta = (a: RingAlbum) => [a.year, a.kind, `${a.tracks.length} ${a.tracks.length === 1 ? 'song' : 'songs'}`].filter(Boolean).join(' · ')

function shortLabel(a: RingAlbum): string {
  const s = `${a.year ? String(a.year).slice(2) + ' ' : ''}${a.title}`.toUpperCase()
  return s.length > 16 ? s.slice(0, 15) + '…' : s
}
