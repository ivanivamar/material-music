/**
 * Library search field + Recent searches (Material redesign, LibraryMaterial.dc.html).
 *
 * Desktop: a 56px pill in the Library header (coral cookie search mark · input · ✕). Focused and empty:
 * a Recent searches panel drops below it (each with ✕, Clear all, "Matches titles, artists and albums.
 * Esc clears."). Phone: a 48px pill in the search bar (back arrow on its left), Recent searches as a list.
 * Keys: Enter opens the top result · Esc clears (then blurs) · ↓ moves into the results.
 */
import { forwardRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../../design/icons'
import { SHAPE_PLAYING } from '../../design/shapes'
import { searchStore } from '../../state/search'

/** Clicks on these keep the field focused (the Recent panel would otherwise hide before the click lands). */
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

interface FieldProps {
  query: string
  focused: boolean
  touch: boolean
  phone: boolean
  onQuery: (q: string) => void
  /** ✕: clear and keep the field focused */
  onClear: () => void
  onFocused: (v: boolean) => void
  onEnter: () => void
  /** ↓: focus the first result; false when there is none */
  onDown: () => boolean
  /** the Recent searches panel (desktop, focused + empty) */
  recent?: ReactNode
}

export const LibrarySearchField = forwardRef<HTMLInputElement, FieldProps>(function LibrarySearchField({ query, focused, phone, onQuery, onClear, onFocused, onEnter, onDown, recent }, ref) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (query) onQuery('')
      else e.currentTarget.blur()
    } else if (e.key === 'ArrowDown') {
      if (onDown()) e.preventDefault()
    }
  }
  return (
    <div className={`lb-field-wrap ${phone ? 'is-phone' : ''}`}>
      <div className={`lb-field ${focused ? 'is-focused' : ''}`}>
        {!phone && (
          <span className="lb-field-ic" style={{ clipPath: SHAPE_PLAYING }} aria-hidden>
            <Icon name="search" />
          </span>
        )}
        <input
          ref={ref}
          className="lb-input"
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder="Search your library"
          aria-label="Search your library"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => onFocused(true)}
          onBlur={() => onFocused(false)}
        />
        {query && (
          <button type="button" className="lb-field-x" aria-label="Clear search" onMouseDown={keepFocus} onClick={onClear}>
            <Icon name="x" />
          </button>
        )}
      </div>
      {recent}
    </div>
  )
})

/** Recent searches: a panel under the desktop field, a list on the phone. */
export function RecentSearches({ recent, onPick, phone }: { recent: string[]; onPick: (q: string) => void; phone?: boolean }) {
  return (
    <div className={phone ? 'lb-recent is-phone' : 'lb-recent'} role="group" aria-label="Recent searches" onMouseDown={phone ? undefined : keepFocus}>
      <div className="lb-recent-head">
        <span className="lb-recent-k">Recent searches</span>
        {recent.length > 0 && (
          <button type="button" className="lb-recent-clear" onClick={() => searchStore.clearRecent()}>
            Clear all
          </button>
        )}
      </div>
      {recent.map((q) => (
        <div key={q} className="lb-recent-it" role="button" tabIndex={0} onClick={() => onPick(q)} onKeyDown={(e) => e.key === 'Enter' && onPick(q)}>
          <Icon name="history" className="lb-recent-ic" />
          <span className="lb-recent-t">{q}</span>
          <button
            type="button"
            className="lb-recent-x"
            aria-label={`Remove ${q}`}
            onClick={(e) => {
              e.stopPropagation()
              searchStore.forget(q)
            }}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
      {!recent.length && <div className="lb-recent-none">Your searches will show up here.</div>}
      {!phone && <div className="lb-recent-sep" />}
      <div className="lb-recent-help">{phone ? 'Matches titles, artists and albums in your library.' : 'Matches titles, artists and albums. Esc clears.'}</div>
    </div>
  )
}
