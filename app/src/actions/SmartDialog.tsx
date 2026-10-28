/**
 * New smart playlist / Edit rules (step 20). Same dialog shell as New / Edit playlist (actions/Dialogs.tsx):
 *
 *   NEW SMART PLAYLIST                                         ×
 *   [Recently added] [Never played] [Not played in a year] …     ← starting points (new only)
 *   [mosaic]  [ Name it                    ]
 *             128 SONGS · 9 H 12 MIN                             ← live, from this device's data
 *   MATCH [All | Any] OF THESE RULES
 *   [Date added ▾] [is in the last ▾] [30] [days ▾]          ×
 *   + Add rule
 *   SORT BY [Recently added ▾]        [ ] LIMIT TO [50] SONGS
 *                                             Cancel  [Create]
 */
import { useMemo, useState } from 'react'
import { Chip, IconButton, Button, Dropdown, Segmented, TextField, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { CoverMosaic } from '../pages/playlists/PlaylistCover'
import { useGenres } from '../state/genres'
import { GenreCombo } from './GenreCombo'
import { useHistory } from '../state/history'
import { useLibrary } from '../state/library'
import { usePlaylists } from '../state/playlists'
import {
  COUNT_OPS,
  DECADE_OPS,
  FIELDS,
  PRESETS,
  SORTS,
  TEXT_OPS,
  TIME_OPS,
  UNITS,
  YEAR_OPS,
  defaultRule,
  evaluateSmart,
  libraryFacets,
  type Facets,
  presetName,
  type Field,
  type Rule,
  type SmartRules,
  type SortBy,
  type Unit,
} from '../state/smart'
import { fmtTotal, plural } from '../state/views'
import { actions } from './actions'
import { Shell } from './Dialogs'
import { createSmartPlaylist, saveSmartRules } from './ops'

const BLANK: SmartRules = { match: 'all', rules: [], sort: { by: 'added' }, limit: null }


export function SmartDialog({ playlistId }: { playlistId?: string }) {
  const toast = useToast()
  const { data } = useLibrary()
  const { plays } = useHistory()
  const { doc: genreDoc, pass } = useGenres()
  const facets = useMemo(() => (data ? libraryFacets(data, genreDoc) : null), [data, genreDoc])
  const { byId } = usePlaylists()
  const editing = playlistId ? byId.get(playlistId) : undefined
  const [draft, setDraft] = useState<SmartRules>(() => editing?.smart ?? PRESETS[0].make(data ? libraryFacets(data, genreDoc) : null))
  const [preset, setPreset] = useState<string | null>(editing ? null : PRESETS[0].key)
  const [typed, setName] = useState(editing?.name ?? '')
  /** the name still follows the chosen starting point (until typed over) */
  const [autoName, setAutoName] = useState(!editing)
  // a genre / decade starting point names the playlist after the value picked
  const name = autoName && preset ? presetName(preset, draft) : typed

  const result = useMemo(() => (data ? evaluateSmart(data, plays, genreDoc, draft) : null), [data, plays, genreDoc, draft])
  const seconds = useMemo(() => (data && result ? result.ids.reduce((s, id) => s + (data.tracks[id]?.duration ?? 0), 0) : 0), [data, result])
  const covers = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const id of result?.ids ?? []) {
      const t = data?.tracks[id]
      if (!t || seen.has(t.albumId)) continue
      seen.add(t.albumId)
      const c = data?.albums[t.albumId]?.cover
      if (c) out.push(c)
      if (out.length === 4) break
    }
    return out
  }, [data, result])

  if (playlistId && !editing?.smart) return null

  const setRule = (id: string, r: Rule) => setDraft((d) => ({ ...d, rules: d.rules.map((x) => (x.id === id ? r : x)) }))
  const dropRule = (id: string) => setDraft((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== id) }))
  const addRule = () => setDraft((d) => ({ ...d, rules: [...d.rules, defaultRule(d.rules.some((r) => r.field === 'genre') ? 'decade' : 'genre', facets)] }))
  const pickPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key)
    if (!p) return
    setPreset(key)
    setDraft(p.make(facets))
  }

  const ok = !!name.trim()
  const save = () => {
    if (!ok) return
    actions.closeDialog()
    if (editing) saveSmartRules(toast, editing.id, draft)
    else {
      const desc = preset && !draft.rules.some((r) => r.field === 'genre' || r.field === 'decade') ? (PRESETS.find((p) => p.key === preset)?.description ?? '') : ''
      createSmartPlaylist(toast, name, draft, desc)
    }
  }

  const count = result?.ids.length ?? 0
  return (
    <Shell label={editing ? `Rules · ${editing.name}` : 'New smart playlist'} onClose={() => actions.closeDialog()} wide>
      <form
        className="dlg-new sm"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {!editing && (
          <div className="sm-presets" role="radiogroup" aria-label="Start from">
            {PRESETS.map((p) => (
              <Chip key={p.key} role="radio" check={false} selected={preset === p.key} onClick={() => pickPreset(p.key)}>
                {p.name}
              </Chip>
            ))}
            <Chip
              role="radio"
              check={false}
              selected={preset === null}
              onClick={() => {
                setPreset(null)
                setDraft({ ...BLANK, rules: [defaultRule('genre', facets)] })
                if (autoName) setName('')
                setAutoName(false)
              }}
            >
              Custom
            </Chip>
          </div>
        )}

        <div className="dlg-new-row">
          <CoverMosaic className="dlg-new-cover" covers={covers} icon="smart" />
          <div className="dlg-new-field">
            {editing ? (
              <div className="sm-name">{editing.name}</div>
            ) : (
<TextField
                label="Name"
                value={name}
                onChange={(v) => {
                  setName(v)
                  setAutoName(false)
                }}
                inputProps={{ maxLength: 120, enterKeyHint: 'done' }}
              />
            )}
            <div className="dlg-hint sm-count" aria-live="polite">
              {count ? `${plural(count, 'song', 'songs')}${seconds ? ` · ${fmtTotal(seconds)}` : ''} · right now` : 'No songs match right now'}
            </div>
          </div>
        </div>

        <div className="sm-block">
          <div className="sm-match">
            <span className="dlg-hint">Songs must match</span>
            <Segmented
              label="Match"
              value={draft.match}
              options={[
                { value: 'all', label: 'All' },
                { value: 'any', label: 'Any' },
              ]}
              onChange={(v) => setDraft((d) => ({ ...d, match: v }))}
            />
            <span className="dlg-hint">of these rules</span>
          </div>
          <div className="sm-rules">
            {draft.rules.map((r) => (
              <RuleRow key={r.id} r={r} f={facets} onChange={(x) => setRule(r.id, x)} onRemove={() => dropRule(r.id)} />
            ))}
            {!draft.rules.length && <div className="sm-none">No rules: every song in your library.</div>}
          </div>
          {pass && draft.rules.some((r) => r.field === 'genre') && (
            <div className="dlg-hint">
              FILLING IN GENRES FROM MUSICBRAINZ · {pass.done}/{pass.total} ARTISTS
            </div>
          )}
          <Button variant="tonal" className="sm-add" onClick={addRule}>
            <Icon name="plus" /> Add rule
          </Button>
        </div>

        <div className="sm-block sm-order">
          <label className="sm-sort">
            <span className="dlg-hint">Sort by</span>
            <Select
              value={draft.sort.by}
              options={SORTS}
              label="Sort by"
              onChange={(by: SortBy) => setDraft((d) => ({ ...d, sort: by === 'playsIn' ? { by, amount: d.sort.amount ?? 1, unit: d.sort.unit ?? 'months' } : { by } }))}
            />
            {draft.sort.by === 'playsIn' && (
              <Period amount={draft.sort.amount ?? 1} unit={draft.sort.unit ?? 'months'} onChange={(amount, unit) => setDraft((d) => ({ ...d, sort: { ...d.sort, amount, unit } }))} />
            )}
          </label>
          <label className="sm-limit">
            <input type="checkbox" checked={draft.limit !== null} onChange={(e) => setDraft((d) => ({ ...d, limit: e.target.checked ? 50 : null }))} />
            <span className="dlg-hint">Limit to</span>
            <input
              className="dlg-input sm-num"
              type="number"
              min={1}
              max={9999}
              inputMode="numeric"
              disabled={draft.limit === null}
              value={draft.limit ?? 50}
              onChange={(e) => setDraft((d) => ({ ...d, limit: Math.max(1, Math.min(9999, Number(e.target.value) || 1)) }))}
            />
            <span className="dlg-hint">songs</span>
          </label>
        </div>

        <div className="dlg-buttons">
          <Button variant="ghost" onClick={() => actions.closeDialog()}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" disabled={!ok}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Shell>
  )
}

/* ── Pieces ─────────────────────────────────────────── */

function Select<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return <Dropdown compact value={value} options={options} onChange={onChange} label={label} className="sm-dd" />
}

function Num({ value, onChange, min = 0, label }: { value: number; onChange: (n: number) => void; min?: number; label: string }) {
  return (
    <input
      className="dlg-input sm-num"
      type="number"
      aria-label={label}
      min={min}
      max={9999}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(9999, Math.round(Number(e.target.value) || 0))))}
    />
  )
}

function Period({ amount, unit, onChange }: { amount: number; unit: Unit; onChange: (amount: number, unit: Unit) => void }) {
  return (
    <>
      <Num value={amount} min={1} label="How many" onChange={(n) => onChange(n, unit)} />
      <Select value={unit} label="Unit" options={UNITS.map((u) => ({ value: u.value, label: amount === 1 ? u.one : u.many }))} onChange={(u) => onChange(amount, u)} />
    </>
  )
}

function RuleRow({ r, f, onChange, onRemove }: { r: Rule; f: Facets | null; onChange: (r: Rule) => void; onRemove: () => void }) {
  const genres = f?.genres ?? []
  const decades = f?.decades ?? []

  let rest: React.ReactNode = null
  switch (r.field) {
    case 'added':
    case 'lastPlayed':
      rest = (
        <>
          <Select value={r.op} options={TIME_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          <Period amount={r.amount} unit={r.unit} onChange={(amount, unit) => onChange({ ...r, amount, unit })} />
        </>
      )
      break
    case 'plays':
      rest = (
        <>
          <Select value={r.op} options={COUNT_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          <Num value={r.value} label="Plays" onChange={(value) => onChange({ ...r, value })} />
          <span className="sm-word">{r.value === 1 ? 'play' : 'plays'}</span>
        </>
      )
      break
    case 'playsIn':
      rest = (
        <>
          <Period amount={r.amount} unit={r.unit} onChange={(amount, unit) => onChange({ ...r, amount, unit })} />
          <Select value={r.op} options={COUNT_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          <Num value={r.value} label="Plays" onChange={(value) => onChange({ ...r, value })} />
        </>
      )
      break
    case 'decade':
      rest = (
        <>
          <Select value={r.op} options={DECADE_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          <Select
            value={r.value}
            label="Decade"
            options={[...new Set([...decades, r.value])].sort((a, b) => b - a).map((d) => ({ value: d, label: `${d}s` }))}
            onChange={(value) => onChange({ ...r, value })}
          />
        </>
      )
      break
    case 'year':
      rest = (
        <>
          <Select value={r.op} options={YEAR_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          <Num value={r.value} min={1900} label="Year" onChange={(value) => onChange({ ...r, value })} />
        </>
      )
      break
    default:
      rest = (
        <>
          <Select value={r.op} options={TEXT_OPS} label="Condition" onChange={(op) => onChange({ ...r, op })} />
          {r.field === 'genre' ? (
            <GenreCombo
              className="sm-combo"
              inputClassName="dlg-input sm-text"
              value={r.value}
              genres={genres}
              counts={f?.genreSongs}
              closeOnPick
              onChange={(value) => onChange({ ...r, value })}
              onPick={(value) => onChange({ ...r, value })}
              inputProps={{ 'aria-label': 'Genre', placeholder: 'Genre' }}
            />
          ) : (
            <input
              className="dlg-input sm-text"
              value={r.value}
              aria-label="Value"
              placeholder={r.field === 'artist' ? 'Artist name' : r.field === 'album' ? 'Album title' : 'Song title'}
              onChange={(e) => onChange({ ...r, value: e.target.value })}
            />
          )}
        </>
      )
  }

  return (
    <div className="sm-rule">
      <Select
        value={r.field}
        options={FIELDS}
        label="Field"
        onChange={(field: Field) => {
          if (field !== r.field) onChange({ ...defaultRule(field, f), id: r.id })
        }}
      />
      {rest}
      <IconButton icon="x" label="Remove rule" className="sm-x" onClick={onRemove} />
    </div>
  )
}
