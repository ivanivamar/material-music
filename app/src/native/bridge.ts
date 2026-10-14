/**
 * Android app bridge (step 7). `isNative` is true inside the Capacitor APK; everything native goes
 * through one plugin, PelagicNative (android/app/src/main/java/com/ivan/pelagic/PelagicNativePlugin.java).
 *
 * In a browser `isNative` is false and none of these methods are called.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()

export interface NativeToken {
  accessToken: string
}

export interface NativeAppInfo {
  versionName: string
  versionCode: number
}

interface PelagicNativePlugin {
  /**
   * Google authorization for the Drive scope (Play services AuthorizationClient).
   * interactive=false never shows UI: it rejects with code "needs_consent" if the user must act.
   * interactive=true shows the account chooser / consent sheet when needed.
   */
  authorize(opts: { interactive: boolean }): Promise<NativeToken>
  /** Drop a token from Play services' cache (after a 401 or on sign-out). */
  clearToken(opts: { token: string }): Promise<void>
  appInfo(): Promise<NativeAppInfo>
  /** Open a URL outside the app (browser / downloads), e.g. the APK of an update. */
  openUrl(opts: { url: string }): Promise<void>
}

export const PelagicNative = registerPlugin<PelagicNativePlugin>('PelagicNative')
