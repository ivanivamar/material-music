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
  /** Drive alt=media URL of the album cover (DJ intro: the mark, a file on the phone) */
  artworkUri?: string
  /** part of a DJ run: the notification / lock screen get "Skip session" (step 22) */
  dj?: boolean
  /** a DJ intro item ("Skip session" jumps to the next one) */
  intro?: boolean
  /** player volume while this item plays (DJ voice volume); default 1 */
  volume?: number
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
  /** Write a small file (DJ intro audio, the DJ mark) into the app's cache → its file:// URI. */
  putFile(opts: { name: string; base64: string }): Promise<{ uri: string }>
  addListener(event: 'state', cb: (s: NativePlayerState) => void): Promise<PluginListenerHandle>
  addListener(event: 'error', cb: (e: NativePlayerError) => void): Promise<PluginListenerHandle>
}

/** ExoPlayer + MediaSessionService (android/…/PelagicPlayerPlugin.java, PelagicPlaybackService.java). */
export const PelagicPlayer = registerPlugin<PelagicPlayerPlugin>('PelagicPlayer')

/* ── Offline downloads (phase D) ─────────────────────── */

export interface NativeDownloadItem {
  /** Drive file id */
  id: string
  /** bytes (from the catalogue; 0 = unknown, e.g. covers) */
  size: number
  /** shown in the download notification */
  title: string
}

export interface NativeDownloadProgress {
  id: string
  title: string | null
  bytes: number
  total: number
}

export interface NativeDownloadState {
  /** complete files on the phone */
  stored: { id: string; size: number }[]
  /** wanted files not stored yet (excluding failed) */
  pending: number
  /** files Drive refused: skipped until retryFailed() */
  failed: { id: string; reason: 'missing' | 'forbidden' }[]
  current: NativeDownloadProgress | null
  running: boolean
  paused: boolean
  wifiOnly: boolean
  network: 'wifi' | 'cellular' | 'none'
  /** the worker stopped: no space left, or no Drive token */
  error: 'storage' | 'auth' | null
  /** bytes: Pelagic's files, free and total on the phone's storage */
  used: number
  free: number
  total: number
}

interface PelagicDownloadsPlugin {
  /** The complete list of Drive files to keep offline: the rest is deleted, missing ones downloaded. */
  sync(opts: { items: NativeDownloadItem[]; wifiOnly: boolean }): Promise<NativeDownloadState>
  state(): Promise<NativeDownloadState>
  setPaused(opts: { paused: boolean }): Promise<NativeDownloadState>
  retryFailed(): Promise<NativeDownloadState>
  askNotifications(): Promise<void>
  addListener(event: 'progress', cb: (p: NativeDownloadProgress) => void): Promise<PluginListenerHandle>
  addListener(event: 'changed', cb: () => void): Promise<PluginListenerHandle>
}

/** WorkManager downloads into the app's storage (android/…/Offline.java, DownloadWorker.java). */
export const PelagicDownloads = registerPlugin<PelagicDownloadsPlugin>('PelagicDownloads')

/* ── Home screen widget ──────────────────────────────── */

export interface WidgetPick {
  /** what tapping it does (handled in native/widget.ts): "mix:<id>", "radio:<id>" */
  action: string
  title: string
  /** mono sub line, e.g. MADE FOR YOU */
  sub: string
  /** Drive alt=media URL of a cover (the widget loads it itself) */
  art?: string
}

export interface WidgetInfo {
  /** "playing from" label (the context's label) */
  context: string
  /** shuffle / repeat can be changed (not for the DJ or a radio) */
  shuffleOk: boolean
  shuffle: boolean
  /** "3/7" while the DJ plays a session's songs */
  djStep: string
  /** library size, for Shuffle library */
  songs: number
  /** the "nothing playing" grid after Resume and DJ: Daily Mix 1, a radio, Daily Mix 2, Rediscover */
  picks: WidgetPick[]
}

interface PelagicWidgetPlugin {
  setInfo(info: WidgetInfo): Promise<void>
  /** a widget tap the app performs: open, shuffle, repeat, dj, mix:<id>, radio:<id>, shuffle-all */
  addListener(event: 'action', cb: (e: { action: string }) => void): Promise<PluginListenerHandle>
}

/** The "Now playing" home screen widget (android/…/PelagicWidget*.java, Widget*.java). */
export const PelagicWidget = registerPlugin<PelagicWidgetPlugin>('PelagicWidget')
