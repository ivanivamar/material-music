/**
 * Library + Search merge (design_handoff_library_search): the search field under the Library header,
 * the recent-searches row (focused and empty), and the browse context kept while a query is typed.
 *
 * Field at rest: "/" key cap + TO SEARCH (no hint on touch). Focused and empty: ESC · CLOSE.
 * Typing: "22 RESULTS · 2 MS" (desktop; the phone shows it in the header) and ✕.
 * Keys: Enter opens the top result · Esc clears (then blurs) · ↓ moves into the results.
 */
import { forwardRef, type KeyboardEvent } from 'react'
import { Icon } from '../../design/icons'
import { searchStore } from '../../state/search'

/** Clicks on these keep the field focused (the Recent row would otherwise hide before the click lands). */
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

interface FieldProps {
  query: string
  focused: boolean
  /** "22 RESULTS · 2 MS", or null while empty */
  meta: string | null
  touch: boolean
  onQuery: (q: string) => void
  /** ✕: clear and keep the field focused */
  onClear: () => void
  onFocused: (v: boolean) => void
  onEnter: () => void
  /** ↓: focus the first result; false when there is none */
  onDown: () => boolean
}

export const LibrarySearchField = forwardRef<HTMLInputElement, FieldProps>(function LibrarySearchField({ query, focused, meta, touch, onQuery, onClear, onFocused, onEnter, onDown }, ref) {
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
    <div className={`srch-field lib-field ${focused ? 'is-focused' : ''}`}>
      <span className="srch-ic" aria-hidden>
        <Icon name="search" />
      </span>
      <input
        ref={ref}
        className="srch-input"
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
      {query ? (
        <>
          {meta && (
            <span className="srch-meta" aria-live="polite">
              {meta}
            </span>
          )}
          <button type="button" className="srch-clear lib-field-clear" aria-label="Clear search" onMouseDown={keepFocus} onClick={onClear}>
            <Icon name="x" />
          </button>
        </>
      ) : touch ? null : focused ? (
        <span className="lib-field-hint">ESC · CLOSE</span>
      ) : (
        <span className="lib-field-hint" aria-hidden>
          <kbd className="lib-kbd">/</kbd>
          TO SEARCH
        </span>
      )}
    </div>
  )
})

/** RECENT · chips · CLEAR, under the focused empty field. */
export function RecentSearches({ recent, onPick }: { recent: string[]; onPick: (q: string) => void }) {
  if (!recent.length) return null
  return (
    <div className="lib-recent" role="group" aria-label="Recent searches">
      <span className="lib-recent-k">RECENT</span>
      <div className="lib-recent-list">
        {recent.map((q) => (
          <button key={q} type="button" className="lib-recent-chip" onMouseDown={keepFocus} onClick={() => onPick(q)}>
            <span className="lib-recent-ic" aria-hidden>
              <Icon name="clock" />
            </span>
            {q}
          </button>
        ))}
      </div>
      <button type="button" className="lib-recent-clear" onMouseDown={keepFocus} onClick={() => searchStore.clearRecent()}>
        CLEAR
      </button>
    </div>
  )
}
