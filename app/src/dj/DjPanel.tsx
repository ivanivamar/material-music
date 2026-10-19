/**
 * DJ panel (handoff_dj §7): right-click / long-press on the DJ button while the DJ plays.
 * Desktop: 400px popover 12px above the button (Esc / click outside closes). Phone: bottom sheet.
 *
 *   header      40px mark (speaking during the intro) · DJ · ON · SESSION 2 · INTRO
 *   NOW         session title, TYPE · n songs, segments
 *   UP NEXT     the prepared next session (updates live when the types change)
 *   SESSION TYPES  multi-select, at least one on, from the next session
 *   Voice intros   toggle + voice volume
 *   What the DJ has learned   plays more / less, Reset
 *   Stop DJ
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design/icons'
import { registerBack } from '../native/backButton'
import { djLearned, djStore, useDj } from '../state/dj'
import { djUi, useDjUi, useDjView } from '../state/djUi'
import { isNative } from '../native/bridge'
import { usePlayer } from '../state/player'
import { Segments } from './DjMark'
import { DJ_TYPES, TYPE_LABEL, TYPE_UPPER, type DjType } from './engine'
import { LiveMark } from './DjIntro'

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

function PanelBody({ sheet }: { sheet: boolean }) {
  const { run, doc } = useDj()
  const view = useDjView()
  const p = usePlayer()
  const [confirmReset, setConfirmReset] = useState(false)
  if (!run || !view.session) return null
  const s = view.session
  const types = run.mode.types
  const learned = djLearned()
  const has = learned.more.length + learned.less.length > 0
  const item = p.queue[p.index] ?? ''
  const toggleType = (t: DjType) => {
    const next = types.includes(t) ? types.filter((x) => x !== t) : [...types, t]
    if (next.length) djStore.setTypes(next)
  }
  return (
    <>
      <div className="djp-head">
        <LiveMark item={item} size={40} active={view.intro} />
        <div className="djp-head-t">
          <div className="djp-name">DJ</div>
          <div className="djp-status t-mono">
            ON · SESSION {s.n}
            {view.intro ? ' · INTRO' : ''}
          </div>
        </div>
        {!sheet && (
          <button type="button" className="djp-x" aria-label="Close" onClick={() => djUi.closePanel()}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="djp-sec">
        <div className="djp-k t-mono">NOW</div>
        <div className="djp-now">{s.title}</div>
        <div className="djp-now-row">
          {!sheet && (
            <span className="djp-mono t-mono">
              {TYPE_UPPER[s.kind]} · {view.songCount} SONGS
            </span>
          )}
          <Segments count={view.songCount} index={view.songIndex} fluid />
        </div>
      </div>
      {view.next && (
        <div className="djp-sec is-tight">
          <div className="djp-k t-mono">UP NEXT</div>
          <div className="djp-next">{view.next.title}</div>
          <div className="djp-mono t-mono">
            {TYPE_UPPER[view.next.kind]} · {view.next.songs.length + view.next.added.length} SONGS
          </div>
        </div>
      )}
      <div className="djp-rule" />
      <div className="djp-sec">
        {!sheet && (
          <div className="djp-row-h">
            <span className="djp-k t-mono">SESSION TYPES</span>
            <span className="djp-k t-mono">FROM THE NEXT SESSION</span>
          </div>
        )}
        <div className="djp-chips">
          {DJ_TYPES.map((t) => (
            <button key={t} type="button" className={`djp-chip ${types.includes(t) ? 'is-on' : ''}`} aria-pressed={types.includes(t)} onClick={() => toggleType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="djp-rule" />
      <div className="djp-sec">
        <div className="djp-toggle-row">
          <div>
            <div className="djp-label">Voice intros</div>
            {sheet && <div className="djp-note">{doc.prefs.voice ? 'Male English voice, over silence. No crossfades.' : 'Intros appear as text for 5 seconds.'}</div>}
          </div>
          <Toggle on={doc.prefs.voice} label="Voice intros" onChange={(v) => djStore.setPref('voice', v)} />
        </div>
        <VolumeSlider value={doc.prefs.voiceVolume} disabled={!doc.prefs.voice} onChange={(v) => djStore.setPref('voiceVolume', v)} />
        {!sheet && <div className="djp-note">{doc.prefs.voice ? 'Male English voice, over silence. No crossfades.' : 'Intros appear as text for 5 seconds.'}</div>}
        {isNative && (
          <div className="djp-toggle-row">
            <div>
              <div className="djp-label">Only downloaded songs on mobile data</div>
              <div className="djp-note">Offline always uses downloaded songs.</div>
            </div>
            <Toggle on={doc.prefs.dataSaver} label="Only downloaded songs on mobile data" onChange={(v) => djStore.setPref('dataSaver', v)} />
          </div>
        )}
      </div>
      <div className="djp-rule" />
      <div className="djp-sec">
        <div className="djp-row-h">
          <span className="djp-label is-strong">What the DJ has learned</span>
          <button type="button" className="djp-small" disabled={!has && !confirmReset} onClick={() => (confirmReset ? (djStore.resetLearned(), setConfirmReset(false)) : setConfirmReset(true))}>
            {confirmReset ? 'Forget it' : 'Reset'}
          </button>
        </div>
        {confirmReset && <div className="djp-note">Forget what the DJ has learned? Sessions go back to an even mix.</div>}
        {has ? (
          <>
            <div className="djp-learned">
              <span className="djp-k t-mono">{sheet ? 'MORE' : 'PLAYS MORE'}</span>
              <span className="djp-tags">
                {learned.more.map((l) => (
                  <span key={l} className="djp-tag">
                    {l}
                  </span>
                ))}
              </span>
              <span className="djp-k t-mono">{sheet ? 'LESS' : 'PLAYS LESS'}</span>
              <span className="djp-tags">
                {learned.less.map((l) => (
                  <span key={l} className="djp-tag is-less">
                    {l}
                  </span>
                ))}
              </span>
            </div>
            {!sheet && <div className="djp-k t-mono">FROM WHAT YOU SKIP AND WHAT YOU PLAY THROUGH</div>}
          </>
        ) : (
          <div className="djp-note">{sheet ? 'Nothing yet. It learns from what you skip and play through.' : 'Nothing yet. It starts again from the sessions you skip and the songs you play through.'}</div>
        )}
      </div>
      <button
        type="button"
        className="djp-stop"
        onClick={() => {
          djUi.closePanel()
          djStore.stop()
        }}
      >
        Stop DJ
      </button>
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
  return createPortal(
    <div className={`djp-layer ${sheet ? 'is-sheet' : ''} ${on ? 'is-on' : ''}`}>
      <div
        className="djp-scrim pg-anim"
        onClick={() => djUi.closePanel()}
        onContextMenu={(e) => {
          e.preventDefault()
          djUi.closePanel()
        }}
      />
      <div
        className={`djp pg-anim ${sheet ? 'is-sheet' : 'is-pop'}`}
        role="dialog"
        aria-label="DJ"
        style={shown.kind === 'popover' ? { left: shown.left, bottom: shown.bottom } : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        {sheet && (
          <button type="button" className="djp-handle" aria-label="Close" onClick={() => djUi.closePanel()}>
            <span />
          </button>
        )}
        <PanelBody sheet={sheet} />
      </div>
    </div>,
    document.body,
  )
}
