import { useLayoutEffect, useState } from 'react'

/** Library Songs row height. */
export const ROW_H = 52

/** Rows [from, to) of a fixed-height list inside the shell's scrolling <main> (also used by Search). */
export function useWindow(listRef: React.RefObject<HTMLElement | null>, count: number, rowH = ROW_H, overscan = 12) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 40)])
  const [stuck, setStuck] = useState(false)
  useLayoutEffect(() => {
    const main = document.getElementById('main')
    const list = listRef.current
    if (!main || !list) return
    let raf = 0
    const update = () => {
      raf = 0
      const top = list.getBoundingClientRect().top - main.getBoundingClientRect().top
      const from = Math.max(0, Math.floor(-top / rowH) - overscan)
      const to = Math.min(count, Math.ceil((main.clientHeight - top) / rowH) + overscan)
      setRange((r) => (r[0] === from && r[1] === to ? r : [from, Math.max(from, to)]))
      setStuck(top < 35) // the 34px header is pinned once the rows reach it
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    main.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      main.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [listRef, count, rowH, overscan])
  return { range, stuck }
}
