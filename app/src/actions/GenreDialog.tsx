/**
 * Edit genre (step 20b) — album or artist ⋯ menu. Chips + a field with suggestions from the
 * library (GenreCombo dropdown). Saving an empty list (or "Use automatic") goes back to tags / MusicBrainz.
 *
 *   GENRE · RINGS OF SATURN                                ×
 *   [Metalcore ×] [Post-hardcore ×] [ Add a genre      ]
 *   AUTOMATIC: METALCORE · FROM MUSICBRAINZ
 *                         Use automatic   Cancel  [Save]
 */
import { useMemo, useState } from 'react'
import { Button, useToast } from '../components/ui'
import { Icon } from '../design/icons'
import { albumGenresOf, artistGenresOf, cleanGenres, genresStore, SOURCE_LABEL, useGenres, type GenresDoc } from '../state/genres'
import { useLibrary } from '../state/library'
import { libraryFacets } from '../state/smart'
import { actions } from './actions'
import { Shell } from './Dialogs'
import { GenreCombo } from './GenreCombo'

export function GenreDialog({ target, id }: { target: 'album' | 'artist'; id: string }) {
  const toast = useToast()
  const { data } = useLibrary()
  const { doc } = useGenres()
  const album = target === 'album' ? data?.albums[id] : undefined
  const artist = target === 'artist' ? data?.artists[id] : undefined
  const name = album?.title ?? artist?.name ?? ''

  const current = useMemo(() => (!data ? null : album ? albumGenresOf(doc, album) : artistGenresOf(doc, data, id)), [data, doc, album, id])
  /** what it would be without a choice made here */
  const automatic = useMemo(() => {
    if (!data) return null
    const entries = target === 'album' ? doc.albums : doc.artists
    const without: GenresDoc = { ...doc, [target === 'album' ? 'albums' : 'artists']: { ...entries, [id]: { ...entries[id], user: null } } }
    return album ? albumGenresOf(without, album) : artistGenresOf(without, data, id)
  }, [data, doc, album, target, id])
  const own = (target === 'album' ? doc.albums[id] : doc.artists[id])?.user ?? null

  const [list, setList] = useState<string[]>(() => current?.genres ?? [])
  const [text, setText] = useState('')
  const facets = useMemo(() => (data ? libraryFacets(data, doc) : null), [data, doc])
  const suggestions = facets?.genres ?? []
  const counts = facets?.genreSongs

  if (!data || (!album && !artist)) return null

  const add = (v: string) => {
    const parts = v.split(/[;,/|]/).map((x) => x.trim()).filter(Boolean)
    if (parts.length) setList((l) => cleanGenres([...l, ...parts]))
    setText('')
  }
  const save = (value: string[] | null) => {
    const prev = own
    const next = value && value.length ? cleanGenres(value) : null
    actions.closeDialog()
    if (JSON.stringify(prev) === JSON.stringify(next)) return
    // nothing chosen before and the list wasn't touched: keep it automatic
    if (!prev && next && JSON.stringify(next) === JSON.stringify(current?.genres ?? [])) return
    const apply = (v: string[] | null) => (target === 'album' ? genresStore.setAlbum(id, v) : genresStore.setArtist(id, v))
    apply(next)
    toast.show({
      icon: 'check',
      text: next ? `${name}: ${next.join(', ')}.` : `${name} uses automatic genres again.`,
      action: { label: 'Undo', onClick: () => apply(prev) },
    })
  }

  return (
    <Shell label={`Genre · ${name}`} onClose={() => actions.closeDialog()}>
      <form
        className="dlg-new gd"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) add(text)
          else save(list)
        }}
      >
        <div className="gd-chips">
          {list.map((g) => (
            <span key={g} className="gd-chip">
              {g}
              <button type="button" aria-label={`Remove ${g}`} onClick={() => setList((l) => l.filter((x) => x !== g))}>
                <Icon name="x" />
              </button>
            </span>
          ))}
          <GenreCombo
            className="gd-combo"
            inputClassName="gd-input"
            value={text}
            genres={suggestions}
            counts={counts}
            exclude={list}
            allowNew
            onChange={(v) => {
              if (/[;,]$/.test(v)) add(v)
              else setText(v)
            }}
            onPick={(g) => add(g)}
            inputProps={{
              placeholder: list.length ? 'Add another' : 'Add a genre',
              autoFocus: true,
              enterKeyHint: 'done',
              maxLength: 60,
              'aria-label': 'Add a genre',
              onKeyDown: (e) => {
                if (e.key === 'Backspace' && !text && list.length) setList((l) => l.slice(0, -1))
              },
            }}
          />
        </div>
        <div className="gd-info">
          <div className="dlg-hint">NOW · {current?.genres.length ? `${current.genres.join(' · ').toUpperCase()} · ${SOURCE_LABEL[current.source]}` : 'NONE'}</div>
          <div className="dlg-hint">
            AUTOMATIC · {automatic?.genres.length ? `${automatic.genres.join(' · ').toUpperCase()} · ${SOURCE_LABEL[automatic.source]}` : 'NOTHING FOUND YET'}
          </div>
          <p className="gd-note">
            {target === 'album'
              ? 'Set here, it wins over the file tags and MusicBrainz. Synced to your other devices; your files aren’t changed.'
              : 'Used for this artist’s albums that have no genre in their tags (an album’s own choice still wins). Your files aren’t changed.'}
          </p>
        </div>
        <div className="dlg-buttons">
          {own && (
            <Button variant="ghost" size="sm" className="gd-auto" onClick={() => save(null)}>
              Use automatic
            </Button>
          )}
          <Button variant="ghost" onClick={() => actions.closeDialog()}>
            Cancel
          </Button>
          <Button type="submit" variant="brand">
            Save
          </Button>
        </div>
      </form>
    </Shell>
  )
}
