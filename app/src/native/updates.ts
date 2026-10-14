/**
 * Android APK update check (step 7). GitHub Actions publishes every Android build as a GitHub
 * Release tagged `android-<versionCode>` with `pelagic.apk` attached (.github/workflows/android.yml).
 * On launch (and when the app returns to the foreground, at most every 6 h) the app compares the
 * latest release with its own versionCode and offers the update; "Install" opens the APK download
 * in the browser and Android's installer takes it from there (same signing key → in-place update).
 */
import { useSyncExternalStore } from 'react'
import { isNative, PelagicNative, type NativeAppInfo } from './bridge'

const REPO = 'ivanivamar/pelagic'
const EVERY_MS = 6 * 60 * 60 * 1000

export interface AppRelease {
  versionCode: number
  versionName: string
  url: string
}

interface UpdateState {
  current: NativeAppInfo | null
  available: AppRelease | null
}

let state: UpdateState = { current: null, available: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let lastCheck = 0
let started = false

interface GhRelease {
  tag_name: string
  name?: string
  draft: boolean
  prerelease: boolean
  assets: { name: string; browser_download_url: string }[]
}

async function check() {
  lastCheck = Date.now()
  try {
    const current = state.current ?? (await PelagicNative.appInfo())
    if (!state.current) set({ current })
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return
    const releases = (await res.json()) as GhRelease[]
    let best: AppRelease | null = null
    for (const r of releases) {
      const m = /^android-(\d+)$/.exec(r.tag_name)
      const apk = r.assets.find((a) => a.name.endsWith('.apk'))
      if (!m || !apk || r.draft || r.prerelease) continue
      const code = Number(m[1])
      if (!best || code > best.versionCode) best = { versionCode: code, versionName: r.name || r.tag_name, url: apk.browser_download_url }
    }
    set({ available: best && best.versionCode > current.versionCode ? best : null })
  } catch {
    /* offline: try again later */
  }
}

export function initNativeUpdates() {
  if (!isNative || started) return
  started = true
  void check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > EVERY_MS) void check()
  })
}

export const nativeUpdates = {
  install() {
    if (state.available) void PelagicNative.openUrl({ url: state.available.url })
  },
}

export function useNativeUpdates(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}
