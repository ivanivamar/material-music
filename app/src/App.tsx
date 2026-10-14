import { useSyncExternalStore } from 'react'
import { Components } from './dev/Components'
import { Foundations } from './dev/Foundations'
import { ToastProvider } from './components/ui'
import { useMotionAttribute } from './state/motion'

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash

/**
 * Temporary root: until the app shell lands (step 3c) the app shows the dev
 * reference pages. #/dev/foundations · #/dev/components (default)
 */
export default function App() {
  useMotionAttribute()
  const hash = useSyncExternalStore(subscribeHash, getHash)
  return <ToastProvider>{hash === '#/dev/foundations' ? <Foundations /> : <Components />}</ToastProvider>
}
