/**
 * Track / album / artist / playlist actions (handoff 15 Actions) — the right-click / ⋯ menus, the
 * "Add to playlist" picker, and the New playlist / Edit details dialogs. One host
 * (actions/ActionHost.tsx, mounted by AppShell) renders whatever is open here:
 *
 *   desktop  context menu at the pointer (scales in from 0.96), Add to playlist submenu with search
 *   phone    bottom sheet (long-press a row or tap ⋯), Add to playlist as the sheet's second page
 *
 * Opening something from anywhere: `actions.menu(target, event)`, `actions.addTo(target, event)`,
 * `actions.newPlaylist(trackIds)`, `actions.editPlaylist(id)`, `actions.smartPlaylist(id?)`.
 */
import { useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react'
import type { RemoveTarget } from '../state/removal'
import { onAccountReset } from '../state/session'
import { isTouch } from '../state/viewport'

export type ActionTarget =
  /** one track; inside a playlist (`entryId`) the menu also offers "Remove from <playlist>" */
  | { kind: 'track'; trackId: string; playlistId?: string; entryId?: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'artist'; artistId: string }
  /** a list of tracks (the queue, a search result list) */
  | { kind: 'tracks'; trackIds: string[]; label: string }
  | { kind: 'playlist'; playlistId: string }

export interface MenuAt {
  x: number
  y: number
}

export type Dialog =
  | { kind: 'new'; trackIds: string[]; hint: string; /** go to the playlist once created */ open?: boolean; /** prefilled name */ name?: string }
  | { kind: 'edit'; playlistId: string }
  /** New smart playlist (no id) or Edit rules of one (step 20) */
  | { kind: 'smart'; playlistId?: string }
  /** Edit an album's / artist's genres (step 20b) */
  | { kind: 'genre'; target: 'album' | 'artist'; id: string }
  /** "Remove from library" confirmation */
  | { kind: 'remove'; target: RemoveTarget }

export interface ActionsState {
  menu: { target: ActionTarget; at: MenuAt; /** open straight on the Add to playlist list */ picker: boolean; key: number } | null
  dialog: Dialog | null
}

let state: ActionsState = { menu: null, dialog: null }
const listeners = new Set<() => void>()
function set(patch: Partial<ActionsState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
let seq = 0

type AtSource = ReactMouseEvent | MouseEvent | MenuAt | HTMLElement | null | undefined

/** Where to open: the pointer for a right-click, under the button for a click on ⋯. */
function pointOf(src: AtSource): MenuAt {
  if (!src) return { x: window.innerWidth / 2, y: window.innerHeight / 3 }
  if (src instanceof HTMLElement) {
    const r = src.getBoundingClientRect()
    return { x: r.right, y: r.bottom + 6 }
  }
  if ('currentTarget' in src && src.type === 'click' && src.currentTarget instanceof HTMLElement) {
    const r = src.currentTarget.getBoundingClientRect()
    return { x: r.right, y: r.bottom + 6 }
  }
  if ('clientX' in src) return { x: src.clientX, y: src.clientY }
  return src as MenuAt
}

export const actions = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  /** The full menu for a track / album / artist / playlist. */
  menu(target: ActionTarget, at?: AtSource) {
    if (at && 'preventDefault' in at) at.preventDefault()
    set({ menu: { target, at: pointOf(at), picker: false, key: ++seq } })
  },
  /** Straight to the Add to playlist list (buttons that only add). */
  addTo(target: ActionTarget, at?: AtSource) {
    if (at && 'preventDefault' in at) at.preventDefault()
    set({ menu: { target, at: pointOf(at), picker: true, key: ++seq } })
  },
  closeMenu() {
    if (state.menu) set({ menu: null })
  },
  newPlaylist(trackIds: string[] = [], hint = '', open = false, name = '') {
    set({ menu: null, dialog: { kind: 'new', trackIds, hint, open, name } })
  },
  /** New smart playlist, or edit the rules of one. */
  smartPlaylist(playlistId?: string) {
    set({ menu: null, dialog: { kind: 'smart', playlistId } })
  },
  editGenre(target: 'album' | 'artist', id: string) {
    set({ menu: null, dialog: { kind: 'genre', target, id } })
  },
  editPlaylist(playlistId: string) {
    set({ menu: null, dialog: { kind: 'edit', playlistId } })
  },
  /** Ask before removing songs / an album / an artist from the library (files go to the Drive trash). */
  confirmRemove(target: RemoveTarget) {
    set({ menu: null, dialog: { kind: 'remove', target } })
  },
  closeDialog() {
    if (state.dialog) set({ dialog: null })
  },
  /** Anything open? (Android Back, Esc) */
  isOpen: () => !!(state.menu || state.dialog),
  closeTop(): boolean {
    if (state.dialog) {
      set({ dialog: null })
      return true
    }
    if (state.menu) {
      set({ menu: null })
      return true
    }
    return false
  },
}

onAccountReset(() => set({ menu: null, dialog: null }))

export function useActions(): ActionsState {
  return useSyncExternalStore(actions.subscribe, actions.get, actions.get)
}

/* ── Drag tracks onto a sidebar playlist ───────────── */

export const DRAG_MIME = 'application/x-pelagic-tracks'

/** Props for a draggable row / card carrying track ids (desktop only: nothing on touch screens). */
export function trackDrag(ids: () => string[], label: string) {
  if (isTouch()) return {}
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      const list = ids()
      if (!list.length) return
      e.dataTransfer.effectAllowed = 'copyMove'
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(list))
      e.dataTransfer.setData('text/plain', label)
      document.documentElement.setAttribute('data-dragging-tracks', '')
    },
    onDragEnd: () => document.documentElement.removeAttribute('data-dragging-tracks'),
  }
}

export function draggedTracks(e: React.DragEvent): string[] | null {
  if (!e.dataTransfer.types.includes(DRAG_MIME)) return null
  try {
    const v = JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}
