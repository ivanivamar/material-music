/**
 * Phone layout switch. At ≤ 760px wide the app uses the Android layout from the handoff
 * (05 Android, 07 Android): bottom tabs, floating mini-player, one-column pages.
 * The same layout is what the Capacitor build will show.
 */
import { useSyncExternalStore } from 'react'

export const PHONE_QUERY = '(max-width: 760px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const get = () => window.matchMedia(PHONE_QUERY).matches

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, get, () => false)
}

/** No hover (touch screens): rows play on a single tap instead of a double click. */
export const isTouch = () => window.matchMedia('(hover: none)').matches
