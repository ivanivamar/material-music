/**
 * DJ button (Material 3 Expressive redesign, DJMaterial.dc.html):
 * Off → tonal violet outline pill (`border-radius: 20px`, phone `24px`); click opens the DJ start view.
 * On → solid violet M3 tight pill (`border-radius: 12px`, phone `15px`); click skips the session
 * straight to the next intro; right-click / long-press (520 ms) or the adjacent tune button opens the DJ panel.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { djStore } from '../state/dj'
import { djUi, useDjView } from '../state/djUi'
import { isTouch } from '../state/viewport'
import { DjIcon } from './DjMark'

type Variant = 'np' | 'ly' | 'bar' | 'phone'

const LONG_PRESS = 520

export function DjButton({ variant, className }: { variant: Variant; className?: string }) {
  const view = useDjView()
  const on = view.on
  const ref = useRef<HTMLButtonElement>(null)
  const [pressed, setPressed] = useState(false)
  const timer = useRef(0)
  const fired = useRef(false)
  const touch = useRef(false)

  const click = () => {
    if (!djStore.get().run || !on) return djUi.openStart()
    djStore.skip()
  }
  const panel = () => {
    if (!on) return djUi.openStart()
    djUi.openPanel(ref.current, variant === 'phone' || isTouch())
  }

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    setPressed(true)
    fired.current = false
    touch.current = e.pointerType !== 'mouse'
    window.clearTimeout(timer.current)
    if (touch.current)
      timer.current = window.setTimeout(() => {
        fired.current = true
        setPressed(false)
        panel()
      }, LONG_PRESS)
  }
  const up = () => {
    window.clearTimeout(timer.current)
    setPressed(false)
  }

  const counter = on && view.intro ? 'Intro' : null
  const labelled = variant !== 'bar'
  const tip =
    variant === 'phone'
      ? null
      : on
        ? ['Skip this session', 'Right-click or tune · DJ panel']
        : variant === 'bar'
          ? ['DJ', 'Endless sessions from your library']
          : null

  return (
    <button
      ref={ref}
      type="button"
      className={`djb djb-${variant} ${on ? 'is-on' : ''} ${pressed ? 'is-pressed' : ''} ${className ?? ''}`}
      aria-label={on ? 'DJ: skip this session (right-click or hold for the DJ panel)' : 'DJ'}
      aria-pressed={on}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        click()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!touch.current) panel()
      }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
    >
      <span className="djb-ic">
        <DjIcon on={on} alive={on} />
      </span>
      {labelled && <span className="djb-l">DJ</span>}
      {labelled && counter && <span className="djb-n">{counter}</span>}
      {tip && (
        <span className="djb-tip" role="tooltip">
          <span className="djb-tip-t">{tip[0]}</span>
          <span className="djb-tip-m">{tip[1]}</span>
        </span>
      )}
    </button>
  )
}
