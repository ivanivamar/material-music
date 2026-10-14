/**
 * Effective motion = in-app Motion setting, falling back to prefers-reduced-motion.
 * Also mirrors the setting onto <html data-motion> so CSS (.pg-anim / .pg-snow) follows it.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useSettings } from './settings'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribeSystem(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getSystemReduced = () => window.matchMedia(QUERY).matches

export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeSystem, getSystemReduced, () => false)
}

/** true when animations should run. */
export function useMotion(): boolean {
  const { motion } = useSettings()
  const systemReduced = useSystemReducedMotion()
  if (motion === 'full') return true
  if (motion === 'reduced') return false
  return !systemReduced
}

/** Mount once near the root. */
export function useMotionAttribute() {
  const { motion } = useSettings()
  useEffect(() => {
    const el = document.documentElement
    if (motion === 'system') el.removeAttribute('data-motion')
    else el.setAttribute('data-motion', motion)
  }, [motion])
}
