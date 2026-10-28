/**
 * Batch Upload — left column (Material 3 Expressive redesign, UploadMaterial.dc.html):
 * toolbar (filter chips, Upload / Pause all / Resume), phone summary card, the release
 * rows and the footer (overall progress + status line).
 */
import type { MouseEvent } from 'react'
import { Button } from '../../components/ui'
import { Icon, type IconName } from '../../design/icons'
import { useCover } from '../../lib/covers'
import type { Catalogue } from '../../state/library'
import { clearFinished, pause, resume, setChecked, setFilter, setFocus, start, toggleChecked, type UploadAlbum, type UploadFilter, type UploadState } from '../../state/upload'
import { inFilter, isActive, issueOf, missingOf, releasePct, statusOf, type BatchView, type RowStatus } from '../../state/uploadViews'
import { plural } from '../../state/views'

const FILTERS: [UploadFilter, string][] = [
  ['all', 'All'],
  ['need', 'Needs you'],
  ['prog', 'In progress'],
  ['added', 'Added'],
]

export function ReleaseList({ s, cat, view, phone = false, onInspect }: { s: UploadState; cat: Catalogue | null; view: BatchView; phone?: boolean; onInspect?: (key: string) => void }) {
  const shown = s.albums.filter((a) => inFilter(a, s, cat, s.filter))
  const checked = new Set(s.checked)
  const multi = s.checked.length >= 2
  const allOn = shown.length > 0 && shown.every((a) => checked.has(a.key))
  const some = shown.some((a) => checked.has(a.key))
  const focus = s.albums.some((a) => a.key === s.focus) ? s.focus : (s.albums[0]?.key ?? null)

  return (
    <section className="ub-list" aria-label="Releases">
      <div className="ub-toolbar">
        {!phone && <Checkbox state={allOn ? true : some ? 'mixed' : false} label="Select all shown" onClick={() => setChecked(allOn ? [] : shown.map((a) => a.key))} />}
        <div className="ub-pills" role="group" aria-label="Filter">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" className={`ub-pill ${k === 'need' && view.counts.need > 0 ? 'is-warn' : ''}`} aria-pressed={s.filter === k} onClick={() => setFilter(k)}>
              {label}
              <span className="ub-pill-n">{view.counts[k]}</span>
            </button>
          ))}
        </div>
        {!phone && (
          <>
            <span className="ub-grow" />
            <BatchButton view={view} />
          </>
        )}
      </div>

      {phone && (
        <div className="ub-phone-sum">
          <div className="ub-phone-sum-l">
            <div className="ub-foot-bar" aria-hidden>
              <span style={{ width: `${view.pct}%` }} />
            </div>
            <div className="ub-foot-meta" role="status">
              {view.foot}
            </div>
          </div>
          <BatchButton view={view} />
        </div>
      )}

      <div className="ub-rows" role="list">
        {shown.map((a) => (
          <Row key={a.key} a={a} s={s} cat={cat} focused={!multi && a.key === focus} checked={checked.has(a.key)} phone={phone} onInspect={onInspect} />
        ))}
        {!shown.length && <div className="ub-rows-none">Nothing here right now.</div>}
      </div>

      {(!phone || view.counts.added > 0 || s.skipped > 0 || s.unreadable > 0) && (
        <div className="ub-foot">
          {!phone && (
            <div className="ub-foot-bar" aria-hidden>
              <span style={{ width: `${view.pct}%` }} />
            </div>
          )}
          <div className="ub-foot-line">
            {!phone && (
              <span className="ub-foot-meta" role="status">
                {view.foot}
              </span>
            )}
            {(s.skipped > 0 || s.unreadable > 0) && (
              <span className="ub-foot-skip">
                {[s.skipped > 0 && `${plural(s.skipped, 'file', 'files')} skipped · not FLAC`, s.unreadable > 0 && `${plural(s.unreadable, 'file', 'files')} unreadable`].filter(Boolean).join(' · ')}
              </span>
            )}
            {view.counts.added > 0 && (
              <button type="button" className="ub-foot-clear" onClick={clearFinished}>
                Clear finished
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function BatchButton({ view }: { view: BatchView }) {
  if (view.button === 'upload')
    return (
      <Button variant="brand" onClick={start} disabled={!view.canUpload}>
        <Icon name="upload" />
        Upload
      </Button>
    )
  if (view.button === 'pause')
    return (
      <Button variant="outlined" onClick={pause}>
        <Icon name="pauseF" />
        Pause all
      </Button>
    )
  return (
    <Button variant="outlined" onClick={resume}>
      <Icon name="playF" />
      Resume
    </Button>
  )
}

export function Checkbox({ state, label, onClick }: { state: boolean | 'mixed'; label: string; onClick: (e: MouseEvent) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={state} aria-label={label} className={`ub-check ${state ? 'is-on' : ''}`} onClick={onClick}>
      {state === true ? <Icon name="done" size={14} /> : state === 'mixed' ? '–' : ''}
    </button>
  )
}

/** Cover art: dropped art, else the library's cover, else a neutral music-note placeholder. */
export function Thumb({ a, cat, size = 'sm', label }: { a: UploadAlbum; cat: Catalogue | null; size?: 'sm' | 'lg'; label?: string }) {
  const lib = useCover(a.coverUrl ? null : cat?.albums[a.albumId]?.cover)
  const art = a.coverUrl ?? lib
  return art ? (
    <img className={`ub-thumb ub-thumb-${size}`} src={art} alt="" />
  ) : (
    <span className={`ub-thumb ub-thumb-${size} ub-thumb-none`} aria-hidden>
      {label === '' ? null : <Icon name="song" size={size === 'lg' ? 28 : 20} />}
    </span>
  )
}

const STATUS_ICON: Record<RowStatus['tone'], IconName> = {
  warn: 'warning',
  added: 'checkCircle',
  ready: 'checkCircle',
  live: 'upload',
  queued: 'clock',
  skip: 'block',
}

export function StatusDot({ st, phone }: { st: RowStatus; phone?: boolean }) {
  return (
    <span className={`ub-st is-${st.tone} ${phone ? 'is-phone' : ''}`}>
      <Icon name={STATUS_ICON[st.tone]} filled={st.tone === 'warn' || st.tone === 'added' || st.tone === 'ready'} />
      <span className="ub-st-text">{phone ? st.word : st.label}</span>
    </span>
  )
}

function Row({
  a,
  s,
  cat,
  focused,
  checked,
  phone,
  onInspect,
}: {
  a: UploadAlbum
  s: UploadState
  cat: Catalogue | null
  focused: boolean
  checked: boolean
  phone?: boolean
  onInspect?: (key: string) => void
}) {
  const st = statusOf(a, s, cat)
  const issue = issueOf(a, s, cat)
  const m = missingOf(a, s)
  const total = Math.max(m.total, m.found)
  const pct = releasePct(a, s)
  const live = isActive(a, s)
  return (
    <div
      role="listitem"
      tabIndex={0}
      className={`ub-row ${focused ? 'is-focus' : ''} ${checked ? 'is-checked' : ''} ${a.skipped ? 'is-skipped' : ''} ${phone ? 'is-phone' : ''}`}
      aria-current={focused || undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          toggleChecked(a.key)
          return
        }
        setFocus(a.key)
        onInspect?.(a.key)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        setFocus(a.key)
        onInspect?.(a.key)
      }}
    >
      {!phone && (
        <Checkbox
          state={checked}
          label={`Select ${a.title}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleChecked(a.key)
          }}
        />
      )}
      <Thumb a={a} cat={cat} />
      {phone ? (
        <span className="ub-row-mid">
          <span className="ub-row-title">{a.title}</span>
          <span className="ub-row-sub">
            {a.artist} · <span className={m.found < total ? 'is-warn' : ''}>{m.found}/{total}</span>
          </span>
          <span className="ub-row-line" aria-hidden>
            <span className={`${issue ? 'is-warn' : ''} ${live ? 'is-live' : ''}`} style={{ width: `${a.skipped ? 0 : pct}%` }} />
          </span>
        </span>
      ) : (
        <>
          <span className="ub-row-names">
            <span className="ub-row-title">{a.title}</span>
            <span className="ub-row-sub">{a.artist}</span>
          </span>
          <span className={`ub-row-tracks ${m.found < total ? 'is-warn' : ''}`}>
            {m.found}/{total}
          </span>
          <span className="ub-row-line" aria-hidden>
            <span className={`${issue ? 'is-warn' : ''} ${live ? 'is-live' : ''}`} style={{ width: `${a.skipped ? 0 : pct}%` }} />
          </span>
        </>
      )}
      <StatusDot st={st} phone={phone} />
    </div>
  )
}
