/**
 * Cover images live in Drive (`Pelagic/covers/`) and need the OAuth header, so <img src> can't
 * load them directly. useCover() fetches each one once, keeps the blob in IndexedDB, and hands
 * out an object URL (shared, kept for the session).
 */
import { useEffect, useState } from 'react'
import { downloadBlob } from './drive'
import { idbGet, idbSet } from './idb'
import { onAccountReset, sessionStore } from '../state/session'

const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
const MAX_PARALLEL = 6
let active = 0
const waiting: (() => void)[] = []

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/** key = Drive file id, plus a version suffix for images that are replaced in place (artist photos). */
export function loadCover(fileId: string, v?: number): Promise<string | null> {
  const key = v ? `${fileId}@${v}` : fileId
  const hit = urls.get(key)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(key)
  if (!p) {
    p = (async () => {
      let blob = await idbGet<Blob>('covers', key)
      if (!blob) {
        if (!sessionStore.token()) return null // expired / offline: try again next time
        blob = await slot(() => downloadBlob(fileId))
        void idbSet('covers', key, blob)
      }
      const url = URL.createObjectURL(blob)
      urls.set(key, url)
      return url
    })()
      .catch(() => null)
      .finally(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}

/** Synchronous peek so already-loaded covers render on the first frame (no flash). */
export const peekCover = (fileId: string, v?: number) => urls.get(v ? `${fileId}@${v}` : fileId) ?? null

export function useCover(fileId: string | null | undefined, v?: number): string | null {
  const [url, setUrl] = useState<string | null>(() => (fileId ? peekCover(fileId, v) : null))
  const [prevKey, setPrevKey] = useState(fileId)
  if (prevKey !== fileId) {
    setPrevKey(fileId)
    setUrl(fileId ? peekCover(fileId, v) : null)
  }
  useEffect(() => {
    if (!fileId || peekCover(fileId, v)) return
    let live = true
    void loadCover(fileId, v).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [fileId, v])
  return url
}

onAccountReset(() => {
  urls.forEach((u) => URL.revokeObjectURL(u))
  urls.clear()
})

/* ── Lazy covers (Library grids: hundreds of covers, fetch only what's near the viewport) ── */

const seen = new WeakMap<Element, () => void>()
let observer: IntersectionObserver | null = null
function observe(el: Element, onSeen: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        seen.get(e.target)?.()
        seen.delete(e.target)
        observer?.unobserve(e.target)
      }
    },
    { rootMargin: '600px 0px' },
  )
  seen.set(el, onSeen)
  observer.observe(el)
  return () => {
    seen.delete(el)
    observer?.unobserve(el)
  }
}

/** Becomes true once the element has come within ~600px of the viewport (and stays true). */
export function useNearViewport<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (!el || near) return
    return observe(el, () => setNear(true))
  }, [el, near])
  return [setEl, near]
}

/** useCover() that waits until its element is near the viewport (already-cached covers show at once). */
export function useLazyCover<T extends Element>(fileId: string | null | undefined, v?: number): [(el: T | null) => void, string | null] {
  const [ref, near] = useNearViewport<T>()
  const cached = fileId ? peekCover(fileId, v) : null
  const url = useCover(near || cached ? fileId : null, v)
  return [ref, url ?? cached]
}
