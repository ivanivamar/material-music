/**
 * DJ panel (Material 3 Expressive redesign, DJMaterial.dc.html):
 * right-click / long-press on the DJ button or click the tune button while the DJ plays.
 * Desktop: 420px M3 popover 12px above the button. Phone: bottom sheet.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../design/icons'
import { registerBack } from '../native/backButton'
import { djLearned, djStore, useDj } from '../state/dj'
import { djUi, useDjUi, useDjView } from '../state/djUi'
import { isNative } from '../native/bridge'
import { usePlayer } from '../state/player'
import { DJ_TYPES, TYPE_LABEL, type DjType } from './engine'
import { LiveMark } from './DjIntro'
import { Chip, IconButton, Toggle, ValueSlider } from '../components/ui'

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
        <LiveMark item={item} size={44} active={view.intro} />
        <div className="djp-head-t">
          <div className="djp-name">DJ</div>
          <div className="djp-status">
            On · Session {s.n}
            {view.intro ? ' · Intro' : ''}
          </div>
        </div>
        <IconButton icon="x" label="Close" variant="soft" onClick={() => djUi.closePanel()} />
      </div>
      <div className="djp-sec">
        <div className="djp-k">Now</div>
        <div className="djp-now">{s.title}</div>
        <div className="djp-sub">{TYPE_LABEL[s.kind]}</div>
      </div>
      {view.next && (
        <div className="djp-sec is-tight">
          <div className="djp-k">Up next</div>
          <div className="djp-next">{view.next.title}</div>
          <div className="djp-sub">{TYPE_LABEL[view.next.kind]}</div>
        </div>
      )}
      <div className="djp-rule" />
      <div className="djp-sec">
        <div className="djp-row-h">
          <span className="djp-k">Session types</span>
          <span className="djp-sub">From the next session</span>
        </div>
        <div className="djp-chips">
          {DJ_TYPES.map((t) => {
            const on = types.includes(t)
            return (
              <Chip key={t} className="djp-chip" selected={on} onClick={() => toggleType(t)}>
                {TYPE_LABEL[t]}
              </Chip>
            )
          })}
        </div>
      </div>
      <div className="djp-rule" />
      <div className="djp-sec">
        <div className="djp-toggle-row">
          <div>
            <div className="djp-label">Voice intros</div>
            <div className="djp-note">{doc.prefs.voice ? 'Male English voice, over silence' : 'Intros appear as text for 5 seconds'}</div>
          </div>
          <Toggle checked={doc.prefs.voice} label="Voice intros" onChange={(v) => djStore.setPref('voice', v)} />
        </div>
        <ValueSlider className="djp-vol" icon="volume" label="Voice volume" value={doc.prefs.voiceVolume} shown={Math.round(doc.prefs.voiceVolume * 100)} disabled={!doc.prefs.voice} onChange={(v) => djStore.setPref('voiceVolume', v)} />
        {isNative && (
          <div className="djp-toggle-row">
            <div>
              <div className="djp-label">Only downloaded songs on mobile data</div>
              <div className="djp-note">Offline always uses downloaded songs</div>
            </div>
            <Toggle checked={doc.prefs.dataSaver} label="Only downloaded songs on mobile data" onChange={(v) => djStore.setPref('dataSaver', v)} />
          </div>
        )}
      </div>
      <div className="djp-rule" />
      <div className="djp-sec">
        <div className="djp-row-h">
          <span className="djp-label">What the DJ has learned</span>
          <button type="button" className="djp-small" disabled={!has && !confirmReset} onClick={() => (confirmReset ? (djStore.resetLearned(), setConfirmReset(false)) : setConfirmReset(true))}>
            {confirmReset ? 'Forget it' : 'Reset'}
          </button>
        </div>
        {confirmReset && <div className="djp-note">Forget what the DJ has learned? Sessions go back to an even mix.</div>}
        {has ? (
          <>
            <div className="djp-learned">
              <span className="djp-sub">{sheet ? 'More' : 'Plays more'}</span>
              <span className="djp-tags">
                {learned.more.map((l) => (
                  <span key={l} className="djp-tag">
                    {l}
                  </span>
                ))}
              </span>
              <span className="djp-sub">{sheet ? 'Less' : 'Plays less'}</span>
              <span className="djp-tags">
                {learned.less.map((l) => (
                  <span key={l} className="djp-tag is-less">
                    {l}
                  </span>
                ))}
              </span>
            </div>
            {!sheet && <div className="djp-sub">From what you skip and what you play through</div>}
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
        <Icon name="stopCircle" />
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
        style={shown.kind === 'popover' ? { left: shown.left, bottom: shown.bottom, maxHeight: `calc(100dvh - ${shown.bottom + 16}px)` } : undefined}
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
