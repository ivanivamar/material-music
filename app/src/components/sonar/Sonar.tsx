/**
 * Sonar ring (Nov 2026 list redesign): a list of songs drawn as a circle, one arc per song, sized
 * by its length. Played songs are brighter, the playing one fills as it plays and a sweep hand
 * points at the exact position. Variants add an inner artist band (playlists), hatched arcs for
 * songs that are new to you (mixes), play-count blips inside the ring, and time ticks outside it.
 *
 * Also the two row marks used by long lists: LenGlyph (a song's length as a small arc) and PlaysDot
 * (play count as a dot's size and brightness).
 *
 * Geometry: angles are degrees clockwise from 12 o'clock.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useHistory } from '../../state/history'
import { usePlayerPosition } from '../../state/player'

export const rad = (d: number) => (d * Math.PI) / 180
export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))]
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (a1 - a0 >= 359.99) a1 = a0 + 359.99
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Width of an element, kept up to date. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    setW(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** trackId → how many times it was played (all devices, all time). */
export function usePlayCounts(): Map<string, number> {
  const { plays } = useHistory()
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const p of plays) m.set(p.trackId, (m.get(p.trackId) ?? 0) + 1)
    return m
  }, [plays])
}

export interface SonarSong {
  id: string
  /** seconds; 0 / missing counts as 3 minutes so the arc still shows */
  len: number
  title: string
  /** e.g. track number, shown in tags */
  num?: string
  /** a group key (artist) for the inner band */
  group?: string
  /** new to you (mixes): hatched arc */
  isNew?: boolean
  /** 0..1 play weight for a blip inside the ring (omit for none) */
  weight?: number
}

export interface Span {
  a0: number
  a1: number
  mid: number
}

/** Angles for each song; `gap` degrees between arcs. */
export function layoutSpans(songs: SonarSong[], gap: number): Span[] {
  const lens = songs.map((s) => (s.len > 0 ? s.len : 180))
  const total = lens.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  return lens.map((l) => {
    const g = songs.length > 1 ? gap : 0
    const a0 = (acc / total) * 360 + g / 2
    acc += l
    const a1 = Math.max(a0 + 0.3, (acc / total) * 360 - g / 2)
    return { a0, a1, mid: (a0 + a1) / 2 }
  })
}

export interface SonarRingProps {
  songs: SonarSong[]
  /** index of the loaded song in `songs`, or -1 when nothing here is loaded */
  current: number
  /** the loaded song is playing (else paused) */
  playing?: boolean
  /** diameter of the box the ring is drawn in (px) */
  size: number
  /** ring radius as a share of size/2 (room for labels outside) */
  radius?: number
  /** arc thickness */
  width?: number
  gap?: number
  /** time ticks outside the ring (every 10 min, longer every 30) */
  ticks?: boolean
  /** inner band: runs of the same `group` */
  bands?: boolean
  /** play-count blips inside the ring (uses song.weight) */
  blips?: boolean
  hover?: number
  onHover?: (i: number) => void
  onPick?: (i: number) => void
  /** drawn in the middle */
  children?: ReactNode
  /** extra absolutely-positioned things (tags), given the geometry */
  overlay?: (g: { cx: number; cy: number; R: number; spans: Span[] }) => ReactNode
  label: string
}

/** The ring itself. Re-renders with the playback position only while a song here is loaded. */
export function SonarRing(p: SonarRingProps) {
  return p.current >= 0 ? <LiveRing {...p} /> : <RingBody {...p} pos={0} />
}

function LiveRing(p: SonarRingProps) {
  const pos = usePlayerPosition()
  return <RingBody {...p} pos={pos} />
}

function RingBody({ songs, current, playing, size, radius = 0.78, width = 12, gap = 1.6, ticks, bands, blips, hover = -1, onHover, onPick, children, overlay, label, pos }: SonarRingProps & { pos: number }) {
  const cx = size / 2
  const cy = size / 2
  const R = Math.round((size / 2) * radius)
  const spans = useMemo(() => layoutSpans(songs, gap), [songs, gap])
  const total = useMemo(() => songs.reduce((a, s) => a + (s.len > 0 ? s.len : 180), 0), [songs])
  const live = current >= 0 && current < songs.length
  const curLen = live ? songs[current].len || 180 : 1
  const frac = live ? Math.min(1, Math.max(0, pos / curLen)) : 0
  const sweep = live ? spans[current].a0 + (spans[current].a1 - spans[current].a0) * frac : 0

  const tickEls = useMemo(() => {
    if (!ticks) return null
    const out: ReactNode[] = []
    for (let s = 0; s <= total; s += 600) {
      const a = (s / total) * 360
      const big = s % 1800 === 0
      const [x0, y0] = polar(cx, cy, R + width / 2 + 4, a)
      const [x1, y1] = polar(cx, cy, R + width / 2 + (big ? 11 : 7), a)
      out.push(<line key={s} x1={x0} y1={y0} x2={x1} y2={y1} className={big ? 'sn-tick is-big' : 'sn-tick'} />)
    }
    return out
  }, [ticks, total, cx, cy, R, width])

  const bandEls = useMemo(() => {
    if (!bands) return null
    const out: ReactNode[] = []
    let i = 0
    while (i < songs.length) {
      let j = i
      while (j + 1 < songs.length && songs[j + 1].group && songs[j + 1].group === songs[i].group) j++
      const run = j - i + 1
      out.push(<path key={i} d={arcPath(cx, cy, R - width / 2 - 7, spans[i].a0, spans[j].a1)} className={`sn-band ${run >= 3 ? 'is-run' : run === 2 ? 'is-pair' : ''}`} />)
      i = j + 1
    }
    return out
  }, [bands, songs, spans, cx, cy, R, width])

  const blipEls = useMemo(() => {
    if (!blips) return null
    const inner = R * 0.42
    const outer = R - width / 2 - 14
    return songs.map((s, i) => {
      if (s.weight == null || s.isNew || i === current) return null
      const f = Math.max(0, Math.min(1, s.weight))
      const [x, y] = polar(cx, cy, inner + (outer - inner) * Math.sqrt(f), spans[i].mid)
      const d = 2 + 5 * f
      return <circle key={s.id} cx={x} cy={y} r={d / 2} className="sn-blip" style={{ opacity: 0.2 + 0.8 * f } as CSSProperties} />
    })
  }, [blips, songs, spans, current, cx, cy, R, width])

  const [dx, dy] = live ? polar(cx, cy, R, sweep) : [0, 0]
  const hand = R + 14

  return (
    <div className={`sn ${live ? 'is-live' : ''} ${live && !playing ? 'is-paused' : ''}`} style={{ width: size, height: size } as CSSProperties}>
      {live && (
        <div className="sn-sweep" aria-hidden style={{ left: cx, top: cy } as CSSProperties}>
          <span className="sn-trail" style={{ width: R * 2, height: R * 2, left: -R, top: -R, background: `conic-gradient(from ${(sweep - 70).toFixed(1)}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.08) 70deg, rgba(255,255,255,0) 70.2deg)` }} />
          <span className="sn-hand" style={{ height: hand, top: -hand, transformOrigin: `0 ${hand}px`, transform: `rotate(${sweep.toFixed(2)}deg)` }} />
        </div>
      )}
      <svg className="sn-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        {tickEls}
        {songs.map((s, i) => {
          const sp = spans[i]
          const state = !live ? 'idle' : i < current ? 'played' : i === current ? 'current' : 'next'
          return (
            <g key={s.id + ':' + i} className={`sn-seg is-${state} ${s.isNew ? 'is-new' : ''} ${hover === i ? 'is-hover' : ''}`}>
              <path d={arcPath(cx, cy, R, sp.a0, sp.a1)} className="sn-arc" strokeWidth={hover === i ? width + 4 : width} />
              {i === current && frac > 0.002 && <path d={arcPath(cx, cy, R, sp.a0, sweep)} className="sn-fill" strokeWidth={width + 2} />}
              <path
                d={arcPath(cx, cy, R, sp.a0, sp.a1)}
                className="sn-hit"
                strokeWidth={width + 18}
                onPointerEnter={() => onHover?.(i)}
                onPointerLeave={() => onHover?.(-1)}
                onClick={() => onPick?.(i)}
              >
                <title>{s.title}</title>
              </path>
            </g>
          )
        })}
        {bandEls}
        {blipEls}
        {live && <circle cx={dx} cy={dy} r={4.5} className="sn-dot" />}
      </svg>
      {overlay?.({ cx, cy, R, spans })}
      {children && <div className="sn-center">{children}</div>}
    </div>
  )
}

/** A song's length as a small arc (a full circle = 8 minutes). */
export function LenGlyph({ seconds, active, isNew }: { seconds: number; active?: boolean; isNew?: boolean }) {
  const a = Math.min(359.9, ((seconds || 0) / 480) * 360)
  const [x, y] = polar(9, 9, 7, a)
  return (
    <svg className={`sn-glyph ${active ? 'is-on' : ''} ${isNew ? 'is-new' : ''}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7" className="sn-glyph-bg" />
      {a > 1 && <path d={`M9 2 A7 7 0 ${a > 180 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} className="sn-glyph-arc" />}
    </svg>
  )
}

/** A play count as a dot: bigger and brighter the more it's been played (`max` = the brightest). */
export function PlaysDot({ plays, max, active }: { plays: number; max: number; active?: boolean }) {
  const f = max > 0 ? Math.sqrt(Math.min(1, plays / max)) : 0
  const d = Math.round(3 + 5 * f)
  return (
    <i
      className={`sn-pdot ${active ? 'is-on' : ''} ${f > 0.55 ? 'is-glow' : ''}`}
      style={{ width: d, height: d, opacity: active ? 1 : 0.2 + 0.8 * f } as CSSProperties}
      aria-hidden
    />
  )
}

/** "ring" or "list" for a kind of page, remembered on this device. */
export function useSonarMode(key: string, fallback: 'ring' | 'list' = 'ring'): ['ring' | 'list', (m: 'ring' | 'list') => void] {
  const k = `pelagic.sonar.${key}`
  const [mode, setMode] = useState<'ring' | 'list'>(() => {
    try {
      const v = localStorage.getItem(k)
      return v === 'ring' || v === 'list' ? v : fallback
    } catch {
      return fallback
    }
  })
  const set = (m: 'ring' | 'list') => {
    setMode(m)
    try {
      localStorage.setItem(k, m)
    } catch {
      /* private mode */
    }
  }
  return [mode, set]
}

export const fmtClock = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function fmtLeft(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60))
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min left` : `${m} min left`
}

/** Seconds left in the list from the playing song's position. */
export function useTimeLeft(songs: SonarSong[], current: number): number {
  const pos = usePlayerPosition()
  if (current < 0) return songs.reduce((a, s) => a + (s.len || 0), 0)
  let left = Math.max(0, (songs[current]?.len || 0) - pos)
  for (let i = current + 1; i < songs.length; i++) left += songs[i].len || 0
  return left
}
