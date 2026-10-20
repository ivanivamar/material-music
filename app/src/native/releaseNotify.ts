/**
 * Android: release-day notifications for New Releases reminders (Library + New releases v2).
 *
 * Every reminder that's on (bell lit, or a pre-release's default one) and has an exact day is
 * scheduled as a local notification for 09:00 that day, so it arrives even when the app is closed
 * (the in-app toast still shows when the app is next opened). The schedule follows releases.json:
 * a reminder turned off, dismissed, spent or moved to another date is cancelled / rescheduled
 * whenever the doc changes. Inexact alarms (Android may deliver a few minutes late; no "Alarms &
 * reminders" permission needed). Tapping one opens the release on the New releases page.
 *
 * The browser keeps the in-app toast only.
 */
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { allReleases, matchProgressOf, releasesStore, type Rel } from '../state/releases'
import { go, releaseHref } from '../shell/routes'
import { isNative } from './bridge'

const HOUR = 9
const KIND = 'pelagic-release'

/** Stable 31-bit id from the release id. */
function idOf(relId: string): number {
  let h = 2166136261
  for (let i = 0; i < relId.length; i++) h = Math.imul(h ^ relId.charCodeAt(i), 16777619)
  return (h >>> 1) || 1
}

/** 09:00 local on the release day (null: no exact day). */
function fireAt(rel: Rel): number | null {
  const [y, m, d] = rel.date.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, HOUR, 0, 0, 0).getTime()
}

function wanted(): Map<number, LocalNotificationSchema> {
  const { doc } = releasesStore.get()
  const out = new Map<number, LocalNotificationSchema>()
  const now = Date.now()
  for (const rel of allReleases()) {
    if (!doc.remind[rel.id]?.[0] || doc.marks[rel.id]?.[0] === 'gone') continue
    const at = fireAt(rel)
    if (!at || at < now + 60_000) continue
    const p = matchProgressOf(rel)
    const have = p ? (p.total ? ` · You have ${p.have} of ${p.total} songs` : p.have ? ` · You have ${p.have} song${p.have === 1 ? '' : 's'}` : '') : ''
    const id = idOf(rel.id)
    out.set(id, {
      id,
      title: `${rel.t} is out today`,
      body: `${rel.a}${have}`,
      schedule: { at: new Date(at), allowWhileIdle: true },
      isExactNotification: false,
      extra: { kind: KIND, rel: rel.id, at },
    })
  }
  return out
}

let asked = false
let running = false
let again = false

async function reconcile() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    const want = wanted()
    let perm = (await LocalNotifications.checkPermissions()).display
    if (perm !== 'granted' && want.size && !asked) {
      asked = true
      perm = (await LocalNotifications.requestPermissions()).display
    }
    if (perm !== 'granted') return
    const pending = (await LocalNotifications.getPending()).notifications.filter((n) => (n.extra as { kind?: string } | undefined)?.kind === KIND)
    const have = new Map(pending.map((n) => [n.id, n]))
    const cancel = pending.filter((n) => {
      const w = want.get(n.id)
      return !w || (w.extra as { at: number }).at !== (n.extra as { at?: number }).at || w.body !== n.body
    })
    if (cancel.length) await LocalNotifications.cancel({ notifications: cancel.map((n) => ({ id: n.id })) })
    const cancelled = new Set(cancel.map((n) => n.id))
    const add = [...want.values()].filter((w) => !have.has(w.id) || cancelled.has(w.id))
    if (add.length) await LocalNotifications.schedule({ notifications: add })
  } catch {
    /* plugin missing (old APK) or notifications off: the in-app toast still works */
  } finally {
    running = false
    if (again) {
      again = false
      void reconcile()
    }
  }
}

export function initReleaseNotifications() {
  if (!isNative) return
  let timer = 0
  let lastDoc = releasesStore.get().doc
  releasesStore.subscribe(() => {
    const st = releasesStore.get()
    if (!st.loaded || st.doc === lastDoc) return
    lastDoc = st.doc
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void reconcile(), 3_000)
  })
  void releasesStore.load().then(() => window.setTimeout(() => void reconcile(), 10_000))
  void LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const x = e.notification.extra as { kind?: string; rel?: string } | undefined
    if (x?.kind === KIND && x.rel) go(releaseHref(x.rel))
  }).catch(() => undefined)
}
