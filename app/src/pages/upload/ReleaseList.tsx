/**
 * Batch Upload — left column: toolbar (select-all, filter pills, Upload / Pause all / Resume), the release
 * rows and the footer (overall progress + status line).
 *
 * Row: checkbox · 44px cover · title / artist · tracks found/total · progress line · status.
 * Click a row = focus it (clears the ticks); click its checkbox = tick it (focus unchanged).
 */
import type { MouseEvent } from 'react'
import { Button } from '../../components/ui'
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

export function ReleaseList({ s, cat, view }: { s: UploadState; cat: Catalogue | null; view: BatchView }) {
  const shown = s.albums.filter((a) => inFilter(a, s, cat, s.filter))
  const checked = new Set(s.checked)
  const multi = s.checked.length >= 2
  const allOn = shown.length > 0 && shown.every((a) => checked.has(a.key))
  const some = shown.some((a) => checked.has(a.key))
  const focus = s.albums.some((a) => a.key === s.focus) ? s.focus : (s.albums[0]?.key ?? null)

  return (
    <section className="ub-list" aria-label="Releases">
      <div className="ub-toolbar">
        <Checkbox state={allOn ? true : some ? 'mixed' : false} label="Select all shown" onClick={() => setChecked(allOn ? [] : shown.map((a) => a.key))} />
        <div className="ub-pills" role="group" aria-label="Filter">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" className={`ub-pill ${k === 'need' && view.counts.need > 0 ? 'is-warn' : ''}`} aria-pressed={s.filter === k} onClick={() => setFilter(k)}>
              {label}
              <span className="ub-pill-n">{view.counts[k]}</span>
            </button>
          ))}
        </div>
        <span className="ub-grow" />
        <BatchButton view={view} />
      </div>

      <div className="ub-rows" role="list">
        {shown.map((a) => (
          <Row key={a.key} a={a} s={s} cat={cat} focused={!multi && a.key === focus} checked={checked.has(a.key)} />
        ))}
        {!shown.length && <div className="ub-rows-none">Nothing here right now.</div>}
      </div>

      <div className="ub-foot">
        <div className="ub-foot-bar" aria-hidden>
          <span style={{ width: `${view.pct}%` }} />
        </div>
        <div className="ub-foot-line">
          <span className="ub-foot-meta" role="status">
            {view.foot}
          </span>
          {(s.skipped > 0 || s.unreadable > 0) && (
            <span className="ub-foot-skip">
              {[s.skipped > 0 && `${plural(s.skipped, 'FILE')} SKIPPED · NOT FLAC`, s.unreadable > 0 && `${plural(s.unreadable, 'FILE')} UNREADABLE`].filter(Boolean).join(' · ')}
            </span>
          )}
          {view.counts.added > 0 && (
            <button type="button" className="ub-foot-clear" onClick={clearFinished}>
              CLEAR FINISHED
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function BatchButton({ view }: { view: BatchView }) {
  if (view.button === 'upload')
    return (
      <Button size="sm" icon="upload" className="ub-batch" onClick={start} disabled={!view.canUpload}>
        Upload
      </Button>
    )
  if (view.button === 'pause')
    return (
      <Button size="sm" variant="secondary" icon="pauseF" className="ub-batch" onClick={pause}>
        Pause all
      </Button>
    )
  return (
    <Button size="sm" variant="secondary" icon="playF" className="ub-batch" onClick={resume}>
      Resume
    </Button>
  )
}

export function Checkbox({ state, label, onClick }: { state: boolean | 'mixed'; label: string; onClick: (e: MouseEvent) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={state} aria-label={label} className="ub-check" onClick={onClick}>
      {state === true ? '✓' : state === 'mixed' ? '–' : ''}
    </button>
  )
}

/** 44px cover: the dropped art, else the library's cover, else a striped placeholder. */
export function Thumb({ a, cat, size = 'sm', label = 'NO ART' }: { a: UploadAlbum; cat: Catalogue | null; size?: 'sm' | 'lg'; label?: string }) {
  const lib = useCover(a.coverUrl ? null : cat?.albums[a.albumId]?.cover)
  const art = a.coverUrl ?? lib
  return art ? <img className={`ub-thumb ub-thumb-${size}`} src={art} alt="" /> : <span className={`ub-thumb ub-thumb-${size} ub-thumb-none`}>{label}</span>
}

export function StatusDot({ st }: { st: RowStatus }) {
  return (
    <span className={`ub-st is-${st.tone}`}>
      <span className="ub-st-dot" aria-hidden />
      {st.label}
    </span>
  )
}

function Row({ a, s, cat, focused, checked }: { a: UploadAlbum; s: UploadState; cat: Catalogue | null; focused: boolean; checked: boolean }) {
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
      className={`ub-row ${focused ? 'is-focus' : ''} ${checked ? 'is-checked' : ''} ${a.skipped ? 'is-skipped' : ''}`}
      aria-current={focused || undefined}
      onClick={() => setFocus(a.key)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        setFocus(a.key)
      }}
    >
      <Checkbox
        state={checked}
        label={`Select ${a.title}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleChecked(a.key)
        }}
      />
      <Thumb a={a} cat={cat} />
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
      <StatusDot st={st} />
    </div>
  )
}
