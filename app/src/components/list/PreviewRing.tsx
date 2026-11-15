/**
 * Round 30 s preview button (Deezer clips, state/preview.ts): a waveform glyph; while its preview
 * plays, a ring fills around a stop square. `load` finds the clip (key + URL) on the first click;
 * nothing found → a toast. One preview at a time; the player pauses and resumes around it.
 */
import { useState, type MouseEvent } from 'react'
import { LoadingShape, useToast } from '../ui'
import { Icon } from '../../design/icons'
import { stopPreview, togglePreview, usePreview } from '../../state/preview'

export interface PreviewClip {
  key: string
  url: string
}

export function PreviewRing({
  id,
  load,
  label,
  size = 36,
  className,
  solid,
}: {
  /** what this button previews; a playing key equal to it or starting with `${id}#` lights it */
  id: string
  load: () => Promise<PreviewClip | null>
  /** "Preview <title>" */
  label: string
  size?: number
  className?: string
  /** over a cover: darker fill */
  solid?: boolean
}) {
  const pv = usePreview()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const on = !!pv.key && (pv.key === id || pv.key.startsWith(`${id}#`))
  const click = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (on) return stopPreview()
    if (busy) return
    setBusy(true)
    load()
      .then((clip) => {
        if (clip) togglePreview(clip.key, clip.url)
        else toast.show({ icon: 'searchOff', mutedIcon: true, text: `No preview found for ${label.replace(/^Preview /, '')}.` })
      })
      .catch(() => toast.show({ icon: 'offline', mutedIcon: true, text: 'Couldn’t reach Deezer for a preview.' }))
      .finally(() => setBusy(false))
  }
  const c = 2 * Math.PI * 16
  return (
    <button
      type="button"
      className={['pvr', on ? 'is-on' : '', solid ? 'is-solid' : '', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-label={on ? 'Stop preview' : label}
      title={on ? 'Stop preview' : label}
      aria-pressed={on}
      onClick={click}
    >
      {on && (
        <svg className="pvr-ring" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r="16" className="pvr-track" />
          <circle cx="18" cy="18" r="16" className="pvr-fill" strokeDasharray={`${(c * pv.progress).toFixed(1)} ${c.toFixed(1)}`} />
        </svg>
      )}
      {busy || (on && pv.loading) ? <LoadingShape size={Math.round(size * 0.45)} /> : on ? <span className="pvr-stop" /> : <Icon name="graphicEq" />}
    </button>
  )
}
