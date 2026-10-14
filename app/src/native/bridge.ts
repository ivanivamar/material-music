/**
 * Android app bridge (step 7). `isNative` is true inside the Capacitor APK; everything native goes
 * through one plugin, PelagicNative (android/app/src/main/java/com/ivan/pelagic/PelagicNativePlugin.java).
 *
 * In a browser `isNative` is false and none of these methods are called.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

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

/* ── Native player (phase C) ─────────────────────────── */

export interface NativeQueueItem {
  /** track id (the queue's entries) */
  id: string
  /** Drive alt=media URL of the audio file */
  uri: string
  title: string
  artist: string
  album: string
  /** Drive alt=media URL of the album cover */
  artworkUri?: string
}

export interface NativePlayerState {
  index: number
  mediaId: string | null
  positionMs: number
  durationMs: number
  playing: boolean
  playWhenReady: boolean
  buffering: boolean
  ended: boolean
  idle: boolean
  count: number
}

export interface NativePlayerError {
  index: number
  mediaId: string | null
  code: string
  message: string
}

interface PelagicPlayerPlugin {
  setAuth(opts: { email: string | null; token: string | null; expiresAt: number }): Promise<void>
  clearAuth(): Promise<void>
  setQueue(opts: { items: NativeQueueItem[]; index: number; positionMs?: number; play: boolean; keepCurrent: boolean; repeat: 'off' | 'all' | 'one' }): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(opts: { positionMs: number }): Promise<void>
  setRepeat(opts: { mode: 'off' | 'all' | 'one' }): Promise<void>
  setVolume(opts: { volume: number }): Promise<void>
  stop(): Promise<void>
  getState(): Promise<NativePlayerState & { ids: string[] }>
  addListener(event: 'state', cb: (s: NativePlayerState) => void): Promise<PluginListenerHandle>
  addListener(event: 'error', cb: (e: NativePlayerError) => void): Promise<PluginListenerHandle>
}

/** ExoPlayer + MediaSessionService (android/…/PelagicPlayerPlugin.java, PelagicPlaybackService.java). */
export const PelagicPlayer = registerPlugin<PelagicPlayerPlugin>('PelagicPlayer')
