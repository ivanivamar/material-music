/**
 * Waveform seek (Now Playing). Played part drawn in the accent, rest at 20% white,
 * a faint playhead line and a glowing knob. Until real peaks are computed from the
 * audio, a deterministic pseudo-waveform (same generator as the handoff) is drawn
 * from a per-track seed.
 */
import { useId, useMemo, useRef, useState, type PointerEvent } from 'react'

function wavePath(w: number, h: number, seed: number): string {
  let s = seed
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
  const mid = h / 2
  let d = `M0 ${mid}`
  let v = 0
  for (let x = 2; x <= w; x += 2) {
    v = v * 0.72 + (rnd() - 0.5) * 0.9
    const env = 0.35 + 0.65 * Math.abs(Math.sin((x / w) * Math.PI * 3.2 + 0.6))
    d += ` L${x} ${(mid + v * mid * 1.3 * env).toFixed(1)}`
  }
  return d
}

/** Stable small integer from any string (e.g. a trackId). */
export function seedFrom(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 233280
  return h || 1
}

interface WaveformProps {
  /** 0..1 */
  progress: number
  onSeek?: (fraction: number) => void
  seed: number
  height?: number
  /** accent colour (album tint accent on Now Playing; white elsewhere) */
  accent?: string
  glow?: string
}

const VW = 640

export function Waveform({
  progress,
  onSeek,
  seed,
  height = 40,
  accent = '#FFFFFF',
  glow = '0 0 12px 3px rgba(255,255,255,0.45)',
}: WaveformProps) {
  const id = useId()
  const d = useMemo(() => wavePath(VW, height, seed), [height, seed])
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const p = Math.max(0, Math.min(1, drag ?? progress))
  const px = VW * p

  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      style={{ position: 'relative', width: '100%', height, cursor: onSeek ? 'pointer' : 'default', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!onSeek) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(at(e))
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag === null) return
        setDrag(null)
        onSeek?.(at(e))
      }}
      onKeyDown={(e) => {
        if (!onSeek) return
        if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.02))
        else if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.02))
      }}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${VW} ${height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={id}>
            <rect x={0} y={-10} width={px} height={height + 20} />
          </clipPath>
        </defs>
        <path d={d} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke={accent} strokeWidth={1} vectorEffect="non-scaling-stroke" clipPath={`url(#${id})`} />
        <line x1={px} x2={px} y1={0} y2={height} stroke="rgba(255,255,255,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: `${p * 100}%`,
          top: height / 2 - 3.5,
          width: 7,
          height: 7,
          marginLeft: -3.5,
          borderRadius: '50%',
          background: accent,
          boxShadow: glow,
        }}
      />
    </div>
  )
}
