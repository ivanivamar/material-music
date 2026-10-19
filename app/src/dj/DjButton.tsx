/**
 * DJ button (handoff_dj §2): after Lyrics and Queue in the full-screen player (42px, lyrics view
 * 40px), the player bar (40×40 icon) and the phone player (40px, Lyrics · DJ · Queue).
 *
 * A rim layer (a slowly turning gold conic gradient, clipped to the button) under a fill inset by
 * 1.5px, then the content. Off → click opens the DJ start view. On → click skips the session
 * straight to the next intro (no Undo); right-click / long-press (520 ms) opens the DJ panel.
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

  const counter = on ? (view.intro ? 'INTRO' : `${view.songIndex + 1}/${view.songCount}`) : null
  const labelled = variant !== 'bar'
  const tip = variant === 'phone' ? null : on ? ['Skip this session', 'RIGHT-CLICK · DJ PANEL'] : variant === 'bar' ? ['DJ', 'ENDLESS SESSIONS FROM YOUR LIBRARY'] : null

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
      <span className="djb-rim pg-anim" aria-hidden>
        <span />
      </span>
      <span className="djb-fill" aria-hidden />
      <span className="djb-ic">
        <DjIcon on={on} alive={on} />
      </span>
      {labelled && <span className="djb-l">DJ</span>}
      {labelled && counter && <span className="djb-n t-mono">{counter}</span>}
      {tip && (
        <span className="djb-tip" role="tooltip">
          <span className="djb-tip-t">{tip[0]}</span>
          <span className="djb-tip-m t-mono">{tip[1]}</span>
        </span>
      )}
    </button>
  )
}
