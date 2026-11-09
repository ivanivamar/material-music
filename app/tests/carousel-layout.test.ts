/**
 * Queue carousel geometry (src/nowplaying/carousel/layout.ts). Run with `npm test`.
 * Pins the promises the player UI relies on: the row fills its width exactly (no cut-off pill),
 * the focused item is the hero, and reorder mode's gap / insertion maths line up.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { multiBrowse, reorderSlot, insertionAt, visibleRange, type CarouselSizes } from '../src/nowplaying/carousel/layout.ts'

const BAR: CarouselSizes = { hero: 280, med: 136, small: 48, gap: 8, prev: 0 }
const FULL: CarouselSizes = { hero: 600, med: 300, small: 88, gap: 8, prev: 2 }

const end = (slots: ReturnType<typeof multiBrowse>) => {
  const last = slots[slots.length - 1]
  return last.x + last.w
}

describe('multiBrowse', () => {
  test('player bar: hero, medium, one pill, filling 480px exactly', () => {
    const s = multiBrowse(12, 2, 480, BAR)
    assert.deepEqual(
      s.map((x) => [x.index, x.kind, x.w]),
      [
        [2, 'hero', 280],
        [3, 'med', 136],
        [4, 'small', 48],
      ],
    )
    assert.equal(end(s), 480)
  })

  test('always ends flush with the width (no cut item) for many widths', () => {
    for (let w = 1000; w <= 1700; w += 37) {
      const s = multiBrowse(40, 10, w, FULL)
      assert.equal(end(s), w, `width ${w}`)
      assert.ok(s.find((x) => x.kind === 'med')!.w >= FULL.med, `medium never below its minimum at ${w}`)
    }
  })

  test('shows up to `prev` played pills before the hero when there is room', () => {
    const s = multiBrowse(40, 10, 1360, FULL)
    assert.deepEqual(s.slice(0, 3).map((x) => [x.index, x.kind]), [
      [8, 'small'],
      [9, 'small'],
      [10, 'hero'],
    ])
    assert.equal(multiBrowse(40, 1, 1360, FULL)[0].index, 0, 'only as many as exist')
  })

  test('drops the previous pills before squeezing out the medium item', () => {
    const s = multiBrowse(40, 10, 828, FULL)
    assert.equal(s[0].kind, 'hero')
    assert.equal(s[1].kind, 'med')
  })

  test('last song: just the hero', () => {
    const s = multiBrowse(5, 4, 480, BAR)
    assert.deepEqual(s.map((x) => x.kind), ['hero'])
  })

  test('focus is clamped and empty input gives nothing', () => {
    assert.equal(multiBrowse(3, 99, 480, BAR)[0].index, 2)
    assert.deepEqual(multiBrowse(0, 0, 480, BAR), [])
  })
})

describe('reorder slots', () => {
  test('no drag: rows keep their slots', () => {
    assert.equal(reorderSlot(3, null, null), 3)
  })

  test('the dragged row leaves, the rest close up and open a gap at the insertion point', () => {
    // rows 0..5, dragging 1, gap at insertion 3 (list without row 1: 0,2,3,[gap],4,5)
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => reorderSlot(i, 1, 3)), [0, -1, 1, 2, 4, 5])
  })

  test('insertion point follows the pointer centre by centre', () => {
    // 120px items, 8px gap → centres at 60, 188, 316
    assert.equal(insertionAt(0, 3, 120, 8), 0)
    assert.equal(insertionAt(61, 3, 120, 8), 1)
    assert.equal(insertionAt(200, 3, 120, 8), 2)
    assert.equal(insertionAt(9999, 3, 120, 8), 3)
  })

  test('visible range covers the viewport with overscan, clamped to the list', () => {
    assert.deepEqual(visibleRange(100, 0, 500, 120, 8, 2), [0, 7])
    assert.deepEqual(visibleRange(10, 5000, 500, 120, 8, 2), [10, 10])
  })
})
