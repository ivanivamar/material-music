/**
 * Swell seek (full-screen Now Playing). The played part is a smooth standing wave:
 * while music plays, every crest sinks to an equally deep trough as the troughs rise
 * into crests, and back, continuously. The part ahead is a flat line. On pause the
 * wave settles flat; on play it swells back. A small glowing pill marks the playhead.
 * Hovering (mouse) or dragging shows a mono timestamp over the spot under the pointer.
 * Replaced the tide bars (Oct 20, 2026), which replaced the jagged pseudo-waveform;
 * the component keeps its name and slot.
 *
 * Drawn in an rAF loop that writes SVG attributes directly (no React render per
 * frame). The loop only runs while playing or while the wave is settling.
 * Reduced motion only drops the pause/play easing and the playhead glide; the wave
 * still rises and falls while playing.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { useMotion } from '../../state/motion'
import { formatTime } from './Controls'

interface WaveformProps {
  /** 0..1 */
  progress: number
  onSeek?: (fraction: number) => void
  /** seconds; enables the hover timestamp and aria-valuetext */
  duration?: number
  /** rises and falls while true, settles flat while false */
  playing?: boolean
  height?: number
  /** accent colour */
  accent?: string
  glow?: string
}

const AMP = 5 // wave amplitude, px
const WAVELENGTH = 34 // px
const SPEED = 2.4 // rad/s: one full rise-and-fall every ~2.6 s
const FADE_IN = 24 // wave grows from flat over the first 24px
const FADE_OUT = 18 // and eases back to flat into the playhead

export function Waveform({
  progress,
  onSeek,
  duration = 0,
  playing = false,
  height = 40,
  accent = '#C6B4F2',
  glow = 'rgba(198,180,242,.5)',
}: WaveformProps) {
  const motion = useMotion()
  const ref = useRef<HTMLDivElement>(null)
  const waveRef = useRef<SVGPathElement>(null)
  const restRef = useRef<SVGLineElement>(null)
  const headRef = useRef<SVGRectElement>(null)
  const [width, setWidth] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const target = Math.max(0, Math.min(1, drag ?? progress))
  const live = useRef({ target, shown: target, amp: playing ? 1 : 0, phase: 0, width: 0, jump: false })
  live.current.target = target
  live.current.width = width
  live.current.jump = drag !== null || !motion

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const draw = () => {
    const s = live.current
    const w = s.width
    const mid = height / 2
    const px = w * s.shown
    const a = AMP * s.amp
    let d = `M0 ${mid}`
    if (a > 0.05) {
      for (let x = 2; x <= px; x += 2) {
        const env = Math.min(1, x / FADE_IN) * Math.min(1, (px - x) / FADE_OUT)
        // standing wave: crests and troughs stay where they are; every crest sinks to an
        // equally deep trough while the troughs next to it rise into crests, and back
        const y = Math.sin((x / WAVELENGTH) * Math.PI * 2) * Math.cos(s.phase)
        d += ` L${x} ${(mid + y * a * env).toFixed(2)}`
      }
    }
    d += ` L${px.toFixed(1)} ${mid}`
    waveRef.current?.setAttribute('d', d)
    restRef.current?.setAttribute('x1', String(px))
    restRef.current?.setAttribute('x2', String(Math.max(px, w)))
    headRef.current?.setAttribute('x', String(px - 2))
  }

  // Redraw after every render (progress tick, resize, drag).
  useLayoutEffect(() => {
    const s = live.current
    // big jumps (seek, track change) and drags snap; the ~4 Hz position ticks glide
    if (s.jump || Math.abs(s.target - s.shown) > 0.02) s.shown = s.target
    if (!motion) s.amp = playing ? 1 : 0
    draw()
  })

  // Animation loop while playing or settling.
  useEffect(() => {
    // The wave moves whenever music plays, even with reduced motion on (Ivan, Oct 20).
    if (!motion && !playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const s = live.current
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playing) s.phase += dt * SPEED
      s.amp = motion ? s.amp + ((playing ? 1 : 0) - s.amp) * Math.min(1, dt * 4) : playing ? 1 : 0
      s.shown = s.jump ? s.target : s.shown + (s.target - s.shown) * Math.min(1, dt * 8)
      draw()
      const settled = !playing && s.amp < 0.01 && Math.abs(s.target - s.shown) < 1e-4
      if (settled) {
        s.amp = 0
        s.shown = s.target
        draw()
      } else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, motion, height])

  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  const tip = drag ?? hover
  const tipX = tip === null ? 0 : Math.max(20, Math.min(width - 20, tip * width))
  const mid = height / 2

  return (
    <div
      ref={ref}
      className={'swell' + (drag !== null ? ' is-drag' : '')}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(target * 100)}
      aria-valuetext={duration > 0 ? `${formatTime(target * duration)} of ${formatTime(duration)}` : undefined}
      style={{ height, cursor: onSeek ? 'pointer' : 'default' }}
      onPointerDown={(e) => {
        if (!onSeek) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(at(e))
      }}
      onPointerMove={(e) => {
        if (drag !== null) setDrag(at(e))
        else if (e.pointerType === 'mouse') setHover(at(e))
      }}
      onPointerUp={(e) => {
        if (drag === null) return
        setDrag(null)
        onSeek?.(at(e))
      }}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (!onSeek) return
        if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.02))
        else if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.02))
      }}
    >
      <svg width="100%" height={height} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
        <line ref={restRef} y1={mid} y2={mid} className="swell-rest" />
        <path ref={waveRef} className="swell-wave" stroke={accent} style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
        <rect ref={headRef} y={mid - 8} width={4} height={16} rx={2} className="swell-head" style={{ filter: `drop-shadow(0 0 6px ${glow})` }} />
      </svg>
      {duration > 0 && (
        <span className={'swell-tip' + (tip !== null && onSeek ? ' is-on' : '')} style={{ left: tipX }} aria-hidden>
          {formatTime((tip ?? 0) * duration)}
        </span>
      )}
    </div>
  )
}
