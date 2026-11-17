/**
 * DJ panel (design "DjV2" settings panel): the DJ screen's settings button slides it in from the
 * right (phone: a card over the screen); right-click / long-press on a DJ button while the DJ plays
 * opens it as a popover above the button (desktop) or a bottom sheet (phone).
 *
 *   DJ · close
 *   NOW (lilac tile) · UP NEXT
 *   SESSION TYPES · FROM THE NEXT SESSION   a switch per type, at least one on (while it plays)
 *   Voice intros + voice volume · Only downloaded songs on mobile data (Android)
 *   What the DJ has learned   plays more / less chips, Forget it (asks once)
 *   Stop DJ (also what playing anything else does)
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design/icons'
import { registerBack } from '../native/backButton'
import { djLearned, djStore, useDj } from '../state/dj'
import { djUi, useDjUi, useDjView } from '../state/djUi'
import { isNative } from '../native/bridge'
import { DJ_TYPES, TYPE_LABEL, type DjType } from './engine'

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`djp-toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function VolumeSlider({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 100) / 100
  }
  return (
    <div className={`djp-vol ${disabled ? 'is-off' : ''}`}>
      <Icon name="volume" />
      <div
        ref={ref}
        className="djp-vol-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Voice volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(at(e.clientX))
        }}
        onPointerMove={(e) => {
          if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return
          onChange(at(e.clientX))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, Math.round((value - 0.05) * 100) / 100))
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(1, Math.round((value + 0.05) * 100) / 100))
        }}
      >
        <span className="djp-vol-line" />
        <span className="djp-vol-fill" style={{ width: `${value * 100}%` }} />
        <span className="djp-vol-knob" style={{ left: `${value * 100}%` }} />
      </div>
      <span className="djp-vol-n t-mono">{Math.round(value * 100)}</span>
    </div>
  )
}

function PanelBody({ kind }: { kind: 'popover' | 'sheet' | 'side' }) {
  const { run, doc } = useDj()
  const view = useDjView()
  const [confirmReset, setConfirmReset] = useState(false)
  const s = run ? view.session : null
  const types = run?.mode.types ?? []
  const learned = djLearned()
  const has = learned.more.length + learned.less.length > 0
  const toggleType = (t: DjType) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t]
    if (next.length) djStore.setTypes(next)
  }
  const voiceHint = doc.prefs.voice ? 'Male English voice, over silence. No crossfades.' : 'Intros appear as text for 5 seconds.'
  return (
    <>
      <div className="djp-head">
        <span className="djp-name">DJ</span>
        {kind !== 'sheet' && (
          <button type="button" className="djp-x" aria-label="Close" onClick={() => djUi.closePanel()}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="djp-tiles">
        <div className="djp-tile is-now">
          <div className="t-mono">NOW{s && view.intro ? ' · INTRO' : ''}</div>
          <div className="djp-tile-t">{s ? s.title : 'Not running'}</div>
        </div>
        <div className="djp-tile">
          <div className="t-mono">UP NEXT</div>
          <div className="djp-tile-t">{s ? (view.next?.title ?? 'Being picked…') : '—'}</div>
        </div>
      </div>
      {run && (
        <>
          <div className="djp-k t-mono">SESSION TYPES · FROM THE NEXT SESSION</div>
          {DJ_TYPES.map((t) => (
            <div key={t} className="djp-toggle-row is-type">
              <span className="djp-label">{TYPE_LABEL[t]}</span>
              <Toggle on={types.includes(t)} label={TYPE_LABEL[t]} onChange={() => toggleType(t)} />
            </div>
          ))}
        </>
      )}
      <div className="djp-rule" />
      <div className="djp-toggle-row">
        <div className="djp-toggle-text">
          <div className="djp-label">Voice intros</div>
          <div className="djp-note">{voiceHint}</div>
        </div>
        <Toggle on={doc.prefs.voice} label="Voice intros" onChange={(v) => djStore.setPref('voice', v)} />
      </div>
      <VolumeSlider value={doc.prefs.voiceVolume} disabled={!doc.prefs.voice} onChange={(v) => djStore.setPref('voiceVolume', v)} />
      {isNative && (
        <div className="djp-toggle-row">
          <div className="djp-label">Only downloaded songs on mobile data</div>
          <Toggle on={doc.prefs.dataSaver} label="Only downloaded songs on mobile data" onChange={(v) => djStore.setPref('dataSaver', v)} />
        </div>
      )}
      <div className="djp-rule" />
      <div className="djp-label is-strong">What the DJ has learned</div>
      <div className="djp-k t-mono">FROM WHAT YOU SKIP AND WHAT YOU PLAY THROUGH</div>
      <div className="djp-learned">
        {has ? (
          <>
            {learned.more.length > 0 && <span className="djp-lk t-mono">PLAYS MORE</span>}
            {learned.more.map((l) => (
              <span key={'m' + l} className="djp-tag">
                {l}
              </span>
            ))}
            {learned.less.length > 0 && <span className="djp-lk t-mono">PLAYS LESS</span>}
            {learned.less.map((l) => (
              <span key={'l' + l} className="djp-tag is-less">
                {l}
              </span>
            ))}
          </>
        ) : (
          <span className="djp-note">Nothing yet. It learns from what you skip and play through.</span>
        )}
      </div>
      {confirmReset && <div className="djp-note">Forget what the DJ has learned? Sessions go back to an even mix.</div>}
      <div className="djp-foot">
        <button type="button" className="djp-small" disabled={!has && !confirmReset} onClick={() => (confirmReset ? (djStore.resetLearned(), setConfirmReset(false)) : setConfirmReset(true))}>
          {confirmReset ? 'Yes, forget it' : 'Forget it'}
        </button>
        {run && (
          <button
            type="button"
            className="djp-small"
            onClick={() => {
              djUi.closePanel()
              djStore.stop()
            }}
          >
            Stop DJ
          </button>
        )}
      </div>
    </>
  )
}

/** Mounted once (AppShell): the popover or the sheet, whichever is open. */
export function DjPanelHost() {
  const ui = useDjUi()
  const panel = ui.panel
  const [shown, setShown] = useState(panel)
  const [entered, setEntered] = useState<typeof panel>(null)
  if (panel && panel !== shown) setShown(panel)
  // in on the frame after mounting (so it animates), out at once
  const on = !!panel && entered === panel

  useEffect(() => {
    if (!panel) {
      const t = window.setTimeout(() => setShown(null), 600)
      return () => window.clearTimeout(t)
    }
    const r = requestAnimationFrame(() => setEntered(panel))
    return () => cancelAnimationFrame(r)
  }, [panel])

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      djUi.closePanel()
    }
    window.addEventListener('keydown', onKey, true)
    const unBack = registerBack(() => {
      djUi.closePanel()
      return true
    }, 'top')
    return () => {
      window.removeEventListener('keydown', onKey, true)
      unBack()
    }
  }, [panel])

  if (!shown) return null
  const sheet = shown.kind === 'sheet'
  const side = shown.kind === 'side'
  return createPortal(
    <div className={`djp-layer ${sheet ? 'is-sheet' : ''} ${side ? 'is-side' : ''} ${side && shown.phone ? 'is-phone' : ''} ${on ? 'is-on' : ''}`}>
      <div
        className="djp-scrim pg-anim"
        onClick={() => djUi.closePanel()}
        onContextMenu={(e) => {
          e.preventDefault()
          djUi.closePanel()
        }}
      />
      <div
        className={`djp pg-anim ${sheet ? 'is-sheet' : side ? 'is-side' : 'is-pop'}`}
        role="dialog"
        aria-label="DJ"
        style={shown.kind === 'popover' ? { left: shown.left, bottom: shown.bottom, maxHeight: `calc(100dvh - ${shown.bottom + 16}px)` } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        {sheet && (
          <button type="button" className="djp-handle" aria-label="Close" onClick={() => djUi.closePanel()}>
            <span />
          </button>
        )}
        <PanelBody kind={shown.kind} />
      </div>
    </div>,
    document.body,
  )
}
