/**
 * Shared settings in Firestore (step 39): `users/<uid>/state/settings` = `{ values, stamps }` for the
 * keys in SHARED_SETTINGS (state/settings.ts). Per key, the latest change wins (its stamp, ms).
 *
 * The first device to connect puts its current values up; settings it never changed carry stamp
 * 1, so the other device takes them unless it changed that setting itself.
 */
import { SHARED_SETTINGS, settingsStore } from '../state/settings'
import { cloudFailed, onCloud, whenCloud, withTimeout } from './cloud'
import type { SyncBackend } from './firebase'

interface SettingsDoc {
  values: Record<string, unknown>
  stamps: Record<string, number>
}

let timer = 0
let inflight = false

function mergeIn(cur: SettingsDoc | null): SettingsDoc | null {
  const mine = settingsStore.shared()
  const values: Record<string, unknown> = { ...cur?.values }
  const stamps: Record<string, number> = { ...cur?.stamps }
  let changed = !cur
  for (const k of SHARED_SETTINGS) {
    const t = Math.max(mine.stamps[k] ?? 0, 1)
    if (!(k in values) || t > (stamps[k] ?? 0)) {
      if (values[k] !== mine.values[k] || stamps[k] !== t) changed = true
      values[k] = mine.values[k]
      stamps[k] = t
    }
  }
  return changed ? { values, stamps } : null
}

async function push() {
  if (inflight) return
  inflight = true
  try {
    const b = await whenCloud()
    if (!b) return
    await withTimeout(b.update<SettingsDoc>('state/settings', mergeIn))
  } catch {
    schedule(120_000)
  } finally {
    inflight = false
  }
}

function schedule(ms: number) {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void push(), ms)
}

function listen(b: SyncBackend) {
  return b.watchAt<SettingsDoc>(
    'state/settings',
    (doc) => {
      if (doc) settingsStore.applyShared(doc.values ?? {}, doc.stamps ?? {})
      // missing, or ours is newer somewhere → put ours up
      if (mergeIn(doc)) schedule(1_500)
    },
    (e) => cloudFailed(e),
  )
}

let started = false
export function initSettingsSync() {
  if (started) return
  started = true
  onCloud((b) => listen(b))
  settingsStore.onSharedChange(() => schedule(1_500))
}
