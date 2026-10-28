/**
 * Devices (step 37): the speaker button in the player bar / Now Playing header and its panel —
 * this device and the other ones signed in to the same account, what they play, and
 *   "Play here"  (this device follows another one: take the playback over)
 *   "Play on …"  (hand what plays here to another online device)
 * Shown only while the sync runs and another device is (or was recently) around.
 * Desktop: a popover under / above the button. Phone: a bottom sheet.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../design/icons'
import { Button } from '../components/ui'
import { useLibrary } from '../state/library'
import { usePlayer, type RemoteDevice } from '../state/player'
import { useIsPhone } from '../state/viewport'
import { syncStore, useSync, type DeviceView } from './playerSync'
import './devices.css'

const iconOf = (d: Pick<RemoteDevice, 'platform'>): IconName => (d.platform === 'android' ? 'smartphone' : 'computer')

export function DevicesButton({ className, variant = 'bar' }: { className?: string; variant?: 'bar' | 'np' }) {
  const sync = useSync()
  const p = usePlayer()
  const [open, setOpen] = useState(false)
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null)
  const anyOnline = sync.devices.some((d) => d.online)
  if (sync.status === 'off' || (!anyOnline && !p.remote)) return null
  const label = p.remote ? `Playing on ${p.remote.name} · devices` : 'Devices'
  return (
    <>
      <button
        ref={setBtn}
        type="button"
        className={`dv-btn dv-btn-${variant} ${p.remote ? 'is-remote' : ''} ${open ? 'is-open' : ''} ${className ?? ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={p.remote ? 'speaker' : 'devices'} />
      </button>
      {open && <DevicesPanel anchor={btn} onClose={() => setOpen(false)} />}
    </>
  )
}

function DevicesPanel({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const sync = useSync()
  const p = usePlayer()
  const { data } = useLibrary()
  const phone = useIsPhone()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  useLayoutEffect(() => {
    if (phone || !anchor || !ref.current) return
    const r = anchor.getBoundingClientRect()
    const w = ref.current.offsetWidth
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w))
    // above the player bar when the button sits low, below it otherwise
    if (r.top > window.innerHeight / 2) setPos({ left, bottom: window.innerHeight - r.top + 10 })
    else setPos({ left, top: r.bottom + 10 })
  }, [anchor, phone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [anchor, onClose])

  const titleOf = (id: string | null) => (id ? data?.tracks[id]?.title : undefined)
  const hereId = p.index >= 0 ? p.queue[p.index] : null
  const canHand = !p.remote ? p.index >= 0 : true
  const others = sync.devices

  const statusOf = (d: DeviceView) => {
    if (!d.online) return 'Offline'
    if (p.remote?.id === d.id) return p.playing ? `Playing ${titleOf(hereId) ?? ''}`.trim() : 'Paused · you control it from here'
    if (d.following) return 'Online · following another device'
    if (d.playing) return `Playing ${titleOf(d.trackId) ?? ''}`.trim()
    return 'Online'
  }

  const panel = (
    <>
      {phone && <div className="dv-scrim" onClick={onClose} aria-hidden />}
      <div
        ref={ref}
        className={`dv-panel ${phone ? 'is-sheet' : ''}`}
        role="dialog"
        aria-label="Devices"
        style={phone ? undefined : pos ? { left: pos.left, top: pos.top, bottom: pos.bottom } : { visibility: 'hidden' }}
      >
        <div className="dv-head">
          <span className="dv-title">Devices</span>
          <span className="dv-meta">{sync.status === 'error' ? 'SYNC PROBLEM' : sync.status === 'connecting' ? 'CONNECTING…' : 'SYNCED'}</span>
        </div>

        <div className={`dv-row ${!p.remote ? 'is-current' : ''}`}>
          <span className="dv-ic">
            <Icon name={iconOf(sync.me)} />
          </span>
          <span className="dv-text">
            <span className="dv-name">
              {sync.me.name} <span className="dv-tag">This device</span>
            </span>
            <span className="dv-sub">{p.remote ? `Following ${p.remote.name}` : p.playing ? `Playing ${titleOf(hereId) ?? ''}`.trim() : hereId ? 'Paused' : 'Nothing loaded'}</span>
          </span>
          {p.remote && (
            <Button
              variant="filled"
              size="sm"
              icon="playF"
              onClick={() => {
                syncStore.playHere()
                onClose()
              }}
            >
              Play here
            </Button>
          )}
        </div>

        {others.map((d) => {
          const followed = p.remote?.id === d.id
          return (
            <div key={d.id} className={`dv-row ${followed ? 'is-current' : ''} ${!d.online ? 'is-off' : ''}`}>
              <span className="dv-ic">
                <Icon name={iconOf(d)} />
              </span>
              <span className="dv-text">
                <span className="dv-name">{d.name}</span>
                <span className="dv-sub">{statusOf(d)}</span>
              </span>
              {d.online && !followed && canHand && (
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={() => {
                    syncStore.playOn(d.id)
                    onClose()
                  }}
                >
                  Play on {d.name}
                </Button>
              )}
            </div>
          )
        })}

        {sync.status === 'error' && sync.error && <div className="dv-err">{sync.error}</div>}
        <div className="dv-foot">One device plays at a time. Starting music on one pauses the others.</div>
      </div>
    </>
  )
  return createPortal(panel, document.body)
}
