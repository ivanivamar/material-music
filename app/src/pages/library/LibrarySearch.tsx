/**
 * Library search field + Recent searches.
 *
 * Desktop: a compact search field in the Library header. Focused and empty:
 * a Recent searches panel drops below it (each with ✕, Clear all, "Matches titles, artists and albums.
 * Esc clears."). Phone: a 48px field in the search bar (back arrow on its left), Recent searches as a list.
 * Keys: Enter opens the top result · Esc clears (then blurs) · ↓ moves into the results.
 */
import { forwardRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton, Button } from '../../components/ui'
import { Icon } from '../../design/icons'
import { searchStore } from '../../state/search'
import { djStore } from '../../state/dj'
import { href } from '../../shell/routes'

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
          <span className="lb-field-ic" aria-hidden>
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
          <IconButton icon="x" label="Clear search" onMouseDown={keepFocus} onClick={onClear} />
        )}
      </div>
      {recent}
    </div>
  )
})

/** Desktop dropdown (redesign, SearchBar): RECENT as chips, then JUMP TO rows (Liked songs, New releases, Start DJ). */
const JUMPS: { label: string; icon: Parameters<typeof Icon>[0]['name']; hue: number; go: () => void }[] = [
  { label: 'Liked songs', icon: 'heart', hue: 290, go: () => (location.hash = '#/playlist/liked') },
  { label: 'New releases', icon: 'newr', hue: 200, go: () => (location.hash = href('new')) },
  { label: 'Start DJ', icon: 'dj', hue: 290, go: () => void djStore.start() },
]

function SearchDropdown({ recent, onPick }: { recent: string[]; onPick: (q: string) => void }) {
  return (
    <div className="lb-recent sdd" role="group" aria-label="Search suggestions" onMouseDown={keepFocus}>
      <div className="sdd-k">
        Recent
        {recent.length > 0 && (
          <button type="button" className="sdd-clear" onClick={() => searchStore.clearRecent()}>
            Clear
          </button>
        )}
      </div>
      {recent.length ? (
        <div className="sdd-chips">
          {recent.map((q, i) => (
            <span key={q} className="sdd-chip" style={{ animationDelay: `${i * 35}ms` } as CSSProperties}>
              <button type="button" className="sdd-chip-pick" onClick={() => onPick(q)}>
                <Icon name="history" />
                {q}
              </button>
              <button type="button" className="sdd-chip-x" aria-label={`Remove ${q}`} onClick={() => searchStore.forget(q)}>
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="sdd-none">Your searches will show up here.</div>
      )}
      <div className="sdd-k sdd-k2">Jump to</div>
      {JUMPS.map((j, i) => (
        <button key={j.label} type="button" className="sdd-row" style={{ '--jh': j.hue, animationDelay: `${(recent.length + i) * 35}ms` } as CSSProperties} onClick={() => {
            j.go()
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}>
          <span className="sdd-ic">
            <Icon name={j.icon} />
          </span>
          <span className="sdd-t">{j.label}</span>
          <Icon name="arrowR" className="sdd-go" />
        </button>
      ))}
    </div>
  )
}

/** Recent searches: the dropdown under the desktop field, a list on the phone. */
export function RecentSearches({ recent, onPick, phone }: { recent: string[]; onPick: (q: string) => void; phone?: boolean }) {
  if (!phone) return <SearchDropdown recent={recent} onPick={onPick} />
  return (
    <div className={phone ? 'lb-recent is-phone' : 'lb-recent'} role="group" aria-label="Recent searches" onMouseDown={phone ? undefined : keepFocus}>
      <div className="lb-recent-head">
        <span className="lb-recent-k">Recent searches</span>
        {recent.length > 0 && (
          <Button variant="ghost" size="sm" className="lb-recent-clear" onClick={() => searchStore.clearRecent()}>
            Clear all
          </Button>
        )}
      </div>
      {recent.map((q) => (
        <div key={q} className="lb-recent-it" role="button" tabIndex={0} onClick={() => onPick(q)} onKeyDown={(e) => e.key === 'Enter' && onPick(q)}>
          <Icon name="history" className="lb-recent-ic" />
          <span className="lb-recent-t">{q}</span>
          <IconButton icon="x" label={`Remove ${q}`} size="sm"
            className="lb-recent-x"
           
            onClick={(e) => {
              e.stopPropagation()
              searchStore.forget(q)
            }} />
        </div>
      ))}
      {!recent.length && <div className="lb-recent-none">Your searches will show up here.</div>}
      {!phone && <div className="lb-recent-sep" />}
      <div className="lb-recent-help">{phone ? 'Matches titles, artists and albums in your library.' : 'Matches titles, artists and albums. Esc clears.'}</div>
    </div>
  )
}
