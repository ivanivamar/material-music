/** Library + Search merge: the browse tab's scroll is kept while a query is typed, put back when cleared. */
import { searchStore } from '../../state/search'

/** Scroll position of each Library tab when a query started, put back when it's cleared. */
const browseScroll = new Map<string, number>()

const main = () => document.getElementById('main')

/** Where the tab was scrolled when "/" or Ctrl+K focused the field (focusing scrolls the field into view). */
let beforeFocus: { tab: string; y: number } | null = null
export function noteScrollBeforeFocus(tab: string) {
  beforeFocus = { tab, y: main()?.scrollTop ?? 0 }
}
export function forgetScrollBeforeFocus() {
  beforeFocus = null
}

/** Set the query; the first character remembers where the tab was scrolled and starts on "All". */
export function setLibraryQuery(next: string, tab: string) {
  const prev = searchStore.get().query
  if (!prev.trim() && next.trim()) {
    browseScroll.set(tab, beforeFocus?.tab === tab ? beforeFocus.y : (main()?.scrollTop ?? 0))
    beforeFocus = null
    searchStore.setFilter('all')
  }
  searchStore.setQuery(next)
}

/** After a query is cleared: back to where the tab was scrolled (grids may still be laying out). */
export function restoreBrowseScroll(tab: string) {
  const m = main()
  const y = browseScroll.get(tab)
  if (!m || y == null) return
  browseScroll.delete(tab)
  m.scrollTo({ top: y })
  if (y) requestAnimationFrame(() => m.scrollTo({ top: y }))
}

