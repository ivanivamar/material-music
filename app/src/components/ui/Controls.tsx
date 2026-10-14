import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

/* ── Toggle ─────────────────────────────────────────── */

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

/* ── Segmented control ──────────────────────────────── */

export interface SegOption<T extends string> {
  value: T
  label: ReactNode
  /** mono suffix, e.g. "74 MB" */
  meta?: ReactNode
}

interface SegmentedProps<T extends string> {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
  label: string
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onChange(options[Math.min(options.length - 1, i + 1)].value)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onChange(options[Math.max(0, i - 1)].value)
    else return
    e.preventDefault()
  }
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="seg-opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {o.meta != null && <span className="seg-meta">{o.meta}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ── Chips ──────────────────────────────────────────── */

interface ChipProps {
  selected: boolean
  onClick: () => void
  children: ReactNode
  size?: 'md' | 'lg'
}

/** Filter chip. Selected = solid #EDEDED with dark text. */
export function Chip({ selected, onClick, children, size = 'md' }: ChipProps) {
  return (
    <button type="button" className={`chip ${size === 'lg' ? 'chip-lg' : ''}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  )
}

/* ── Slider (seek / volume / settings) ───────────────── */

interface SliderProps {
  /** 0..1 */
  value: number
  /** fires continuously while dragging */
  onChange?: (v: number) => void
  /** fires once on release (use for seeking audio) */
  onCommit?: (v: number) => void
  label: string
  /** knob diameter: 7 seek, 5 player bar, 12 settings; 0 = no knob (volume) */
  knob?: number
  /** clickable height */
  height?: number
  variant?: 'seek' | 'volume'
  /** formats aria-valuetext */
  valueText?: (v: number) => string
  step?: number
  className?: string
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function Slider({
  value,
  onChange,
  onCommit,
  label,
  knob = 7,
  height = 14,
  variant = 'seek',
  valueText,
  step = 0.02,
  className,
}: SliderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? value

  const at = useCallback((e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return clamp01((e.clientX - r.left) / r.width)
  }, [])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const v = at(e)
    setDrag(v)
    onChange?.(v)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return
    const v = at(e)
    setDrag(v)
    onChange?.(v)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return
    const v = at(e)
    setDrag(null)
    onCommit?.(v)
  }
  const onKey = (e: KeyboardEvent) => {
    let v: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = clamp01(value + step)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = clamp01(value - step)
    else if (e.key === 'Home') v = 0
    else if (e.key === 'End') v = 1
    else return
    e.preventDefault()
    onChange?.(v)
    onCommit?.(v)
  }

  const pct = `${shown * 100}%`
  return (
    <div
      ref={ref}
      className={`slider slider-${variant} ${className ?? ''}`}
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={valueText?.(shown)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKey}
    >
      <div className="slider-track" />
      <div className="slider-fill" style={{ width: pct }} />
      {knob > 0 && <div className="slider-knob" style={{ left: pct, width: knob, height: knob }} />}
    </div>
  )
}

/** "01:36 ───●──── 04:11" */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface SeekBarProps {
  position: number
  duration: number
  onSeek: (sec: number) => void
  compact?: boolean
}

/** Waterline seek with times. compact = player bar (5px knob, 10px mono). */
export function SeekBar({ position, duration, onSeek, compact }: SeekBarProps) {
  const [preview, setPreview] = useState<number | null>(null)
  const frac = duration > 0 ? position / duration : 0
  return (
    <div className={`seekrow ${compact ? 'seekrow-sm' : ''}`}>
      <span className="time">{formatTime(preview ?? position)}</span>
      <Slider
        label="Seek"
        value={preview !== null && duration > 0 ? preview / duration : frac}
        knob={compact ? 5 : 7}
        height={compact ? 9 : 14}
        onChange={(v) => setPreview(v * duration)}
        onCommit={(v) => {
          setPreview(null)
          onSeek(v * duration)
        }}
        valueText={(v) => `${formatTime(v * duration)} of ${formatTime(duration)}`}
        step={duration > 0 ? 5 / duration : 0.02}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  )
}
