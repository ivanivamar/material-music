import { createContext } from 'react'

/** Desktop: the sticky top bar's search slot. Library portals its live search field into it (in place of the pill). */
export const TopbarSlot = createContext<HTMLElement | null>(null)
