/**
 * Tide-bar seek (full-screen Now Playing). A row of evenly spaced rounded bars, all
 * the same low height; played bars take the accent, the bar under the playhead stands
 * taller and its neighbours rise with it. Hovering (mouse) or dragging shows a mono
 * timestamp over the spot under the pointer. Replaced the jagged pseudo-waveform
 * (Oct 19, 2026); the component keeps its name and slot.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { formatTime } from './Controls'

interface WaveformProps {
  /** 0..1 */
  progress: number
  onSeek?: (fraction: number) => void
  /** seconds; enables the hover timestamp and aria-valuetext */
  duration?: number
  height?: number
  /** accent colour (white by default) */
  accent?: string
  glow?: string
}

const PITCH = 6 // px from one bar to the next
const BASE = 6 // resting bar height
const PEAK = 22 // bar height right under the playhead
const REACH = 4 // how many bars either side rise with the playhead

export function Waveform({
  progress,
  onSeek,
  duration = 0,
  height = 40,
  accent = '#FFFFFF',
  glow = 'rgba(255,255,255,0.7)',
}: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const p = Math.max(0, Math.min(1, drag ?? progress))
  const px = width * p
  const count = Math.max(0, Math.floor(width / PITCH))

  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  const tip = drag ?? hover
  const tipX = tip === null ? 0 : Math.max(20, Math.min(width - 20, tip * width))

  const bars = []
  for (let i = 0; i < count; i++) {
    const x = i * PITCH + PITCH / 2
    const lift = Math.max(0, 1 - Math.abs(x - px) / PITCH / REACH)
    const h = BASE + lift * lift * (PEAK - BASE)
    const lit = x <= px
    const style: CSSProperties = { left: x - 1.25, height: h, background: lit ? accent : undefined }
    if (lift > 0.7) style.boxShadow = `0 0 6px ${glow}`
    bars.push(<span key={i} className={'tide-bar' + (lit ? ' is-lit' : '')} style={style} />)
  }

  return (
    <div
      ref={ref}
      className={'tide pg-anim' + (drag !== null ? ' is-drag' : '')}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-valuetext={duration > 0 ? `${formatTime(p * duration)} of ${formatTime(duration)}` : undefined}
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
      {bars}
      {duration > 0 && (
        <span className={'tide-tip' + (tip !== null && onSeek ? ' is-on' : '')} style={{ left: tipX }} aria-hidden>
          {formatTime((tip ?? 0) * duration)}
        </span>
      )}
    </div>
  )
}
