/**
 * Batch Upload — right column: the inspector card.
 *
 * Single mode (0 or 1 ticked: the focused release): kicker + quality badge, cover / title / artist, the
 * issue card (missing tracks · already in your library · failed tracks) with its actions, the FILES grid
 * (uploaded / pending / missing), ALBUM ARTIST · SIZE · UPLOADED, then Edit tags and Skip this release.
 * Multi mode (2+ ticked): N RELEASES SELECTED · CLEAR, a cover stack, "N releases", the "n of these need
 * you" strip (REVIEW focuses the first), ALBUM ARTIST · FORMAT ("Mixed" when they differ), then Edit
 * shared tags and Skip selected.
 */
import { useState, type FormEvent } from 'react'
import { TextField, Button, QualityBadge } from '../../components/ui'
import { Icon } from '../../design/icons'
import type { Catalogue } from '../../state/library'
import {
  addWithoutFailed,
  addWithoutMissing,
  editable,
  editAlbum,
  editShared,
  resolveDup,
  retryFailed,
  setChecked,
  setFocus,
  setSkipped,
  type UploadAlbum,
  type UploadState,
} from '../../state/upload'
import { slotLabel } from '../../state/uploadIssues'
import { issueCopy, issueOf, missingOf, releasePct, releaseQuality, statusOf, uploadable, type Issue } from '../../state/uploadViews'
import { fmtBytes, plural } from '../../state/views'
import { albumHref, go } from '../../shell/routes'
import { Thumb } from './ReleaseList'

interface Props {
  s: UploadState
  cat: Catalogue | null
  onPickMissing: (key: string) => void
}

export function Inspector({ s, cat, onPickMissing }: Props) {
  const multi = s.checked.length >= 2
  const a = s.albums.find((x) => x.key === s.focus) ?? s.albums[0]
  return (
    <aside className="ub-insp" aria-label={multi ? 'Selected releases' : 'Release'}>
      {multi ? <Multi s={s} cat={cat} /> : a ? <Single key={a.key} a={a} s={s} cat={cat} onPickMissing={onPickMissing} /> : null}
    </aside>
  )
}

const bytesOf = (a: UploadAlbum, s: UploadState) => uploadable(a, s).reduce((n, i) => n + i.size, 0)

/* ── Single ─────────────────────────────────────────── */

function Single({ a, s, cat, onPickMissing }: { a: UploadAlbum; s: UploadState; cat: Catalogue | null; onPickMissing: (key: string) => void }) {
  const [editing, setEditing] = useState(false)
  const st = statusOf(a, s, cat)
  const q = releaseQuality(a, s)
  const issue = issueOf(a, s, cat)
  const m = missingOf(a, s)
  const total = Math.max(m.total, m.found)
  const canEdit = editable(a, s)

  return (
    <>
      <div className="ub-insp-top">
        <span className="ub-kicker">
          {a.inLibrary && a.phase !== 'added' ? 'MATCHED ALBUM' : 'NEW ALBUM'} · {st.word}
        </span>
        <QualityBadge kind={q.kind}>{q.label}</QualityBadge>
      </div>
      <div className="ub-insp-head">
        <Thumb a={a} cat={cat} size="lg" />
        <div className="ub-insp-names">
          <div className="ub-insp-title">{a.title}</div>
          <div className="ub-insp-artist">{a.artist}</div>
        </div>
      </div>

      {issue && <IssueCard issue={issue} a={a} onPickMissing={onPickMissing} />}

      {editing ? (
        <EditTags a={a} s={s} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="ub-sec">
            <div className="ub-sec-head">
              <span>FILES</span>
              <span className={m.found < total ? 'is-warn' : ''}>
                {m.found} OF {total} FOUND
              </span>
            </div>
            <FileGrid a={a} s={s} />
          </div>

          <div className="ub-tags">
            <TagRow k="ALBUM ARTIST" v={a.artist} />
            <TagRow k="SIZE" v={fmtBytes(bytesOf(a, s))} />
            <TagRow k="UPLOADED" v={`${Math.floor(releasePct(a, s))}%`} />
          </div>

          <div className="ub-insp-btns">
            {a.phase === 'added' ? (
              <Button variant="secondary" className="ub-btn-42" onClick={() => go(albumHref(a.albumId))}>
                View album
              </Button>
            ) : (
              <>
                <Button variant="secondary" className="ub-btn-42" disabled={!canEdit} title={canEdit ? undefined : 'Tags can’t change once the release has started uploading'} onClick={() => setEditing(true)}>
                  Edit tags
                </Button>
                <button type="button" className="ub-textbtn" disabled={a.phase !== 'pending'} onClick={() => setSkipped([a.key], !a.skipped)}>
                  {a.skipped ? 'Include again' : 'Skip this release'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

function IssueCard({ issue, a, onPickMissing }: { issue: Issue; a: UploadAlbum; onPickMissing: (key: string) => void }) {
  const copy = issueCopy(issue)
  let acts: [string, () => void][] = []
  if (issue.kind === 'missing')
    acts = [
      ['Add missing file', () => onPickMissing(a.key)],
      ['Add without it', () => addWithoutMissing(a.key)],
    ]
  else if (issue.kind === 'dup')
    acts = [
      ['Replace', () => void resolveDup(a.key, 'replace')],
      ['Keep both', () => void resolveDup(a.key, 'both')],
      ['Skip', () => void resolveDup(a.key, 'skip')],
    ]
  else {
    acts = [['Retry', () => retryFailed(a.key)]]
    if (issue.anyUp) acts.push(['Add without them', () => addWithoutFailed(a.key)])
  }
  return (
    <div className="ub-issue" role="alert">
      <div className="ub-issue-msg">
        <span className="ub-issue-ic" aria-hidden>
          <Icon name="alert" />
        </span>
        <div className="ub-issue-text">
          <div className="ub-issue-title">{copy.title}</div>
          <div className="ub-issue-sub">{copy.text}</div>
        </div>
      </div>
      <div className="ub-issue-acts">
        {acts.map(([label, fn], i) => (
          <Button key={label} size="sm" variant={i === 0 ? 'primary' : 'secondary'} className="ub-act" onClick={fn}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

type CellKind = 'up' | 'pending' | 'missing' | 'failed'

/** 01…N per disc: uploaded, pending, failed, or missing (dashed). */
function FileGrid({ a, s }: { a: UploadAlbum; s: UploadState }) {
  const its = uploadable(a, s)
  const m = missingOf(a, s)
  const discs = [...new Set([...its.map((i) => i.meta?.disc ?? 1), ...m.slots.map(([d]) => d)])].sort((x, y) => x - y)
  const multi = discs.length > 1
  const at = new Map(its.filter((i) => i.meta?.track).map((i) => [`${i.meta!.disc}-${i.meta!.track}`, i]))
  const miss = new Set(m.slots.map(([d, n]) => `${d}-${n}`))
  const cells: { key: string; label: string; kind: CellKind }[] = []
  for (const d of discs) {
    const nums = [...its.filter((i) => (i.meta?.disc ?? 1) === d && i.meta?.track).map((i) => i.meta!.track!), ...m.slots.filter(([x]) => x === d).map(([, n]) => n)]
    const upto = nums.length ? Math.max(...nums) : 0
    for (let n = 1; n <= upto; n++) {
      const k = `${d}-${n}`
      const it = at.get(k)
      if (!it && !miss.has(k)) continue
      cells.push({ key: k, label: slotLabel(d, n, multi), kind: !it ? 'missing' : it.state === 'uploaded' || it.state === 'done' ? 'up' : it.state === 'error' ? 'failed' : 'pending' })
    }
  }
  for (const it of its.filter((i) => !i.meta?.track)) cells.push({ key: `x${it.id}`, label: '··', kind: it.state === 'uploaded' || it.state === 'done' ? 'up' : 'pending' })
  return (
    <div className="ub-cells">
      {cells.map((c) => (
        <span key={c.key} className={`ub-cell is-${c.kind}`}>
          {c.label}
        </span>
      ))}
    </div>
  )
}

function TagRow({ k, v, mixed }: { k: string; v: string; mixed?: boolean }) {
  return (
    <div className="ub-tag">
      <span className="ub-tag-k">{k}</span>
      <span className={`ub-tag-v ${mixed ? 'is-mixed' : ''}`}>{v}</span>
    </div>
  )
}

function EditTags({ a, s, onDone }: { a: UploadAlbum; s: UploadState; onDone: () => void }) {
  const first = a.itemIds.map((i) => s.items[i]).find((i) => i?.meta)?.meta
  const [artist, setArtist] = useState(a.artist)
  const [album, setAlbum] = useState(a.title)
  const [year, setYear] = useState(a.year ? String(a.year) : '')
  const [genre, setGenre] = useState(a.genre ?? '')
  const yearOk = year === '' || /^\d{4}$/.test(year.trim())
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!yearOk || !artist.trim() || !album.trim()) return
    await editAlbum(a.key, { albumArtist: artist, album, year: year.trim() ? Number(year) : null, genre: genre.trim() || null })
    onDone()
  }
  const reset = async () => {
    await editAlbum(a.key, { albumArtist: first?.albumArtist, album: first?.album, year: first?.year ?? null, genre: first?.genre ?? null })
    onDone()
  }
  return (
    <form className="ub-edit" onSubmit={save}>
      <TextField className="ub-tf" label="Album artist" value={artist} onChange={setArtist} inputProps={{ autoFocus: true, spellCheck: false }} />
      <TextField className="ub-tf" label="Album" value={album} onChange={setAlbum} inputProps={{ spellCheck: false }} />
      <div className="ub-field-pair">
        <TextField className="ub-tf" label="Year" value={year} onChange={setYear} error={!yearOk} inputProps={{ inputMode: 'numeric', maxLength: 4, placeholder: '—' }} />
        <TextField className="ub-tf" label="Genre" value={genre} onChange={setGenre} inputProps={{ placeholder: '—' }} />
      </div>
      <p className="ub-note">Changes go into your library and the Opus copies. The FLAC files keep the tags they have.</p>
      <div className="ub-insp-btns">
        <Button type="submit" className="ub-btn-42" disabled={!yearOk || !artist.trim() || !album.trim()}>
          Save
        </Button>
        <Button variant="secondary" className="ub-btn-42" onClick={onDone}>
          Cancel
        </Button>
        {Object.keys(a.edits).length > 0 && (
          <button type="button" className="ub-textbtn ub-mono-btn" onClick={() => void reset()}>
            USE FILE TAGS
          </button>
        )}
      </div>
    </form>
  )
}

/* ── Multi ──────────────────────────────────────────── */

function Multi({ s, cat }: { s: UploadState; cat: Catalogue | null }) {
  const [editing, setEditing] = useState(false)
  const checked = new Set(s.checked)
  const sel = s.albums.filter((a) => checked.has(a.key))
  const needs = sel.filter((a) => issueOf(a, s, cat))
  const artists = new Set(sel.map((a) => a.artist))
  const formats = new Set(sel.map((a) => releaseQuality(a, s).label))
  const tracks = sel.reduce((n, a) => n + uploadable(a, s).length, 0)
  const bytes = sel.reduce((n, a) => n + bytesOf(a, s), 0)

  return (
    <>
      <div className="ub-insp-top">
        <span className="ub-kicker">{sel.length} RELEASES SELECTED</span>
        <button type="button" className="ub-clear" onClick={() => setChecked([])}>
          CLEAR
        </button>
      </div>
      <div className="ub-insp-head">
        <div className="ub-stack" aria-hidden>
          {sel.slice(0, 5).map((a) => (
            <span key={a.key} className="ub-stack-item">
              <Thumb a={a} cat={cat} size="sm" label="" />
            </span>
          ))}
        </div>
        <div className="ub-insp-names ub-stack-names">
          <div className="ub-insp-title">{sel.length} releases</div>
          <div className="ub-insp-artist">
            {plural(tracks, 'track', 'tracks')} · {fmtBytes(bytes)}
          </div>
        </div>
      </div>

      {needs.length > 0 && (
        <button type="button" className="ub-needstrip" onClick={() => setFocus(needs[0].key)}>
          <span className="ub-issue-ic" aria-hidden>
            <Icon name="alert" />
          </span>
          <span className="ub-grow">{needs.length === 1 ? '1 of these needs you' : `${needs.length} of these need you`}</span>
          <span className="ub-needstrip-k">REVIEW</span>
        </button>
      )}

      {editing ? (
        <EditShared sel={sel} s={s} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="ub-tags">
            <TagRow k="ALBUM ARTIST" v={artists.size === 1 ? [...artists][0] : 'Mixed'} mixed={artists.size !== 1} />
            <TagRow k="FORMAT" v={formats.size === 1 ? [...formats][0] : 'Mixed'} mixed={formats.size !== 1} />
          </div>
          <div className="ub-insp-btns">
            <Button variant="secondary" className="ub-btn-42" disabled={!sel.some((a) => editable(a, s))} onClick={() => setEditing(true)}>
              Edit shared tags
            </Button>
            <button
              type="button"
              className="ub-textbtn"
              disabled={!sel.some((a) => a.phase === 'pending' && !a.skipped)}
              onClick={() => {
                setSkipped(
                  sel.map((a) => a.key),
                  true,
                )
                setChecked([])
              }}
            >
              Skip selected
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** Album artist / year / genre for every selected release that hasn't started uploading; blank = leave as is. */
function EditShared({ sel, s, onDone }: { sel: UploadAlbum[]; s: UploadState; onDone: () => void }) {
  const one = <T,>(vals: T[]) => (new Set(vals).size === 1 ? vals[0] : undefined)
  const artist0 = one(sel.map((a) => a.artist))
  const year0 = one(sel.map((a) => a.year))
  const genre0 = one(sel.map((a) => a.genre))
  const [artist, setArtist] = useState(artist0 ?? '')
  const [year, setYear] = useState(year0 ? String(year0) : '')
  const [genre, setGenre] = useState(genre0 ?? '')
  const yearOk = year === '' || /^\d{4}$/.test(year.trim())
  const locked = sel.filter((a) => !editable(a, s)).length
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!yearOk) return
    const edits: { albumArtist?: string; year?: number | null; genre?: string | null } = {}
    if (artist.trim() && artist.trim() !== artist0) edits.albumArtist = artist.trim()
    if (year.trim() && Number(year) !== year0) edits.year = Number(year)
    if (genre.trim() && genre.trim() !== genre0) edits.genre = genre.trim()
    await editShared(
      sel.map((a) => a.key),
      edits,
    )
    onDone()
  }
  return (
    <form className="ub-edit" onSubmit={save}>
      <TextField className="ub-tf" label="Album artist" value={artist} onChange={setArtist} inputProps={{ placeholder: artist0 === undefined ? 'Mixed' : '—', autoFocus: true, spellCheck: false }} />
      <div className="ub-field-pair">
        <TextField className="ub-tf" label="Year" value={year} onChange={setYear} error={!yearOk} inputProps={{ inputMode: 'numeric', maxLength: 4, placeholder: year0 === undefined ? 'Mixed' : '—' }} />
        <TextField className="ub-tf" label="Genre" value={genre} onChange={setGenre} inputProps={{ placeholder: genre0 === undefined ? 'Mixed' : '—' }} />
      </div>
      <p className="ub-note">
        Empty fields stay as they are. Album titles stay per release.
        {locked > 0 && ` ${plural(locked, 'release', 'releases')} already uploading ${locked === 1 ? 'keeps its' : 'keep their'} tags.`}
      </p>
      <div className="ub-insp-btns">
        <Button type="submit" className="ub-btn-42" disabled={!yearOk}>
          Save
        </Button>
        <Button variant="secondary" className="ub-btn-42" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
