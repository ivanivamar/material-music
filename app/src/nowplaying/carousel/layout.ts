/**
 * Queue carousel geometry (pure, no DOM): the Material 3 multi-browse layout used by the player bar,
 * the phone mini player and the full-screen player, and the equal-slot strip / list used by reorder
 * mode. Kept free of React so `npm test` can pin it down (tests/carousel-layout.test.ts).
 */

/** Item sizes along the main axis (px). */
export interface CarouselSizes {
  /** the focused item (the playing song, or the one being browsed) */
  hero: number
  /** the item right after it: never narrower than this (it takes the leftover space) */
  med: number
  /** every other visible item: a thin pill */
  small: number
  gap: number
  /** how many items before the focused one to show as pills, when there is room */
  prev: number
  /** cap for the medium item: with too few items left to fill the row it stops here (the row ends
   *  short) instead of stretching across the whole width */
  medMax?: number
}

export type SlotKind = 'hero' | 'med' | 'small'

export interface Slot {
  /** queue row */
  index: number
  kind: SlotKind
  /** left edge and width inside the carousel (px) */
  x: number
  w: number
  /** an off-screen neighbour (withGhosts): mounted but invisible, so a browse step can slide it in */
  ghost?: boolean
}

/**
 * Multi-browse: [small × prev] · hero · medium · [small × n], sized so the row fills `width` exactly —
 * the medium item absorbs the leftover, so the last visible item is always a whole pill, never cut.
 * Items that don't fit are left out (the caller renders only the returned slots).
 */
export function multiBrowse(count: number, focus: number, width: number, s: CarouselSizes): Slot[] {
  if (count <= 0 || width <= 0) return []
  focus = Math.max(0, Math.min(count - 1, focus))
  const hero = Math.max(s.small, Math.min(s.hero, width))
  const room = (pn: number) => width - pn * (s.small + s.gap) - hero
  let prevN = Math.min(s.prev, focus)
  // previous pills only while the medium item after the hero still gets its minimum width
  while (prevN > 0 && room(prevN) < s.gap + s.med) prevN--
  const rest = room(prevN)

  let medW = 0
  let after = 0
  if (focus + 1 < count && rest - s.gap >= s.small) {
    medW = rest - s.gap
    while (focus + 2 + after < count && medW - (s.small + s.gap) >= s.med) {
      medW -= s.small + s.gap
      after++
    }
    if (s.medMax && medW > s.medMax) medW = s.medMax
  }

  const slots: Slot[] = []
  let x = 0
  const push = (index: number, kind: SlotKind, w: number) => {
    slots.push({ index, kind, x, w })
    x += w + s.gap
  }
  for (let i = focus - prevN; i < focus; i++) push(i, 'small', s.small)
  push(focus, 'hero', hero)
  if (medW > 0) {
    push(focus + 1, 'med', medW)
    for (let i = 0; i < after; i++) push(focus + 2 + i, 'small', s.small)
  }
  return slots
}

/**
 * The visible slots plus up to `n` invisible neighbours on each side, parked as pills just outside the
 * row (before its first card, after its last). They are already mounted when a browse step brings
 * them in — and the cards a step pushes out become ghosts instead of unmounting — so every card
 * slides to its new place whichever way the carousel moves, instead of popping in or out.
 */
export function withGhosts(slots: Slot[], count: number, s: CarouselSizes, n = 2): Slot[] {
  if (slots.length === 0 || n <= 0) return slots
  const pitch = s.small + s.gap
  const first = slots[0]
  const last = slots[slots.length - 1]
  const out: Slot[] = []
  for (let k = Math.min(n, first.index); k >= 1; k--) out.push({ index: first.index - k, kind: 'small', x: first.x - k * pitch, w: s.small, ghost: true })
  out.push(...slots)
  const right = last.x + last.w + s.gap
  for (let k = 0; k < n && last.index + 1 + k < count; k++) out.push({ index: last.index + 1 + k, kind: 'small', x: right + k * pitch, w: s.small, ghost: true })
  return out
}

/* ── Reorder mode: equal slots along one axis ─────────────────────────────── */

/**
 * Where row `i` sits while a row is being dragged: the dragged row is taken out, the others close up,
 * and a one-slot gap opens at `ins` (an index into the list without the dragged row).
 * Returns the slot number (multiply by size + gap for the offset), or -1 for the dragged row itself.
 */
export function reorderSlot(i: number, dragged: number | null, ins: number | null): number {
  if (dragged === null) return i
  if (i === dragged) return -1
  const k = i > dragged ? i - 1 : i
  return ins !== null && k >= ins ? k + 1 : k
}

/**
 * Insertion point for a pointer `pos` px along the strip (scroll included): how many of the
 * `remaining` rows (all but the dragged one) have their centre before it.
 */
export function insertionAt(pos: number, remaining: number, size: number, gap: number): number {
  const k = Math.floor((pos - size / 2) / (size + gap)) + 1
  return Math.max(0, Math.min(remaining, k))
}

/** Rows [from, to) whose slots overlap the visible range [offset, offset + extent), plus overscan. */
export function visibleRange(count: number, offset: number, extent: number, size: number, gap: number, overscan = 4): [number, number] {
  const pitch = size + gap
  const from = Math.min(count, Math.max(0, Math.floor(offset / pitch) - overscan))
  const to = Math.min(count, Math.ceil((offset + extent) / pitch) + overscan + 1)
  return [from, Math.max(from, to)]
}

/**
 * The furthest item that can be the focus while the row still fills its width (medium item within
 * `medMax`): browsing towards the end of a list stops there, like a scroller reaching its end, so the
 * last items show as a full row instead of stretching. Without `medMax` every item qualifies.
 */
export function lastFullFocus(count: number, width: number, s: CarouselSizes): number {
  if (count <= 0) return 0
  if (!s.medMax) return count - 1
  const open = { ...s, medMax: undefined }
  for (let f = count - 1; f >= 0; f--) {
    const med = multiBrowse(count, f, width, open).find((x) => x.kind === 'med')
    if (med && med.w <= s.medMax) return f
  }
  return 0
}
