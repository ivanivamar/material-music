/**
 * Google sign-in (Google Identity Services, token model — no backend).
 *
 * The browser gets a ~1 hour access token. There is no refresh token in this model, so when it
 * runs out the session becomes `expired`: the cached library keeps working and one click on
 * "Sign in again" gets a fresh token (Google skips the consent screen once it has been granted).
 *
 * Persisted in localStorage `pelagic.session.v1` so a reload inside the hour stays signed in.
 *
 * Android app (step 7): Google blocks this web flow inside a WebView, so the APK signs in natively
 * (Play services AuthorizationClient via PelagicNative). Play services can hand out a fresh token
 * silently at any time, so on Android the session never shows "expired" in normal use: tokens are
 * renewed 5 min before they run out, when the app comes back to the foreground, and on a 401.
 */
import { useSyncExternalStore } from 'react'
import { DRIVE_SCOPE, GOOGLE_CLIENT_ID } from '../config'
import { isNative, PelagicNative } from '../native/bridge'

export interface Account {
  email: string
  name: string
  photo?: string
}

export type SessionStatus = 'signed-out' | 'signed-in' | 'expired'

export interface Session {
  status: SessionStatus
  account: Account | null
  /** true while the Google popup is open */
  pending: boolean
  /** last sign-in failure, shown under the button */
  error: string | null
}

interface Stored {
  token: string
  expiresAt: number
  account: Account | null
}

const KEY = 'pelagic.session.v1'
/** treat the token as expired a minute early so in-flight requests don't race the deadline */
const SKEW_MS = 60_000

let stored: Stored | null = readStored()
let state: Session = {
  // Android: a stale token is renewed silently right after boot (see the end of this file)
  status: !stored ? 'signed-out' : isLive(stored) || (isNative && !!stored.account) ? 'signed-in' : 'expired',
  account: stored?.account ?? null,
  pending: false,
  error: null,
}
const listeners = new Set<() => void>()
let expiryTimer = 0

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}
function writeStored(s: Stored | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: session lasts until reload */
  }
}
function isLive(s: Stored) {
  return Date.now() < s.expiresAt - SKEW_MS
}

function set(patch: Partial<Session>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

/** Android: renew this long before the token runs out */
const NATIVE_RENEW_MS = 5 * 60_000

function armExpiry() {
  window.clearTimeout(expiryTimer)
  if (!stored || !stored.token) return
  const ms = stored.expiresAt - SKEW_MS - Date.now()
  // setTimeout can't take more than ~24 days; tokens last an hour, so this is fine
  if (isNative) expiryTimer = window.setTimeout(() => void sessionStore.refresh(), Math.max(0, ms - NATIVE_RENEW_MS))
  else if (ms > 0) expiryTimer = window.setTimeout(() => sessionStore.expire(), ms)
}
armExpiry()

/* ── Google Identity Services loader ───────────────── */

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Could not reach Google. Check the connection and try again.'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}
/** Start loading early (sign-in screen mount) so the popup opens inside the click's user gesture. */
export const preloadGoogle = () => {
  if (!isNative) void loadGis().catch(() => {})
}

let client: google.accounts.oauth2.TokenClient | null = null
let pendingResolve: ((r: google.accounts.oauth2.TokenResponse) => void) | null = null
let pendingReject: ((e: Error) => void) | null = null

function tokenClient() {
  client ??= google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    include_granted_scopes: true,
    callback: (resp) => {
      if (resp.error) pendingReject?.(new Error(resp.error_description || resp.error))
      else pendingResolve?.(resp)
    },
    error_callback: (err) => {
      const msg =
        err.type === 'popup_closed'
          ? 'The Google window was closed before signing in.'
          : err.type === 'popup_failed_to_open'
            ? 'The browser blocked the Google window. Allow pop-ups for this site.'
            : err.message || 'Sign-in failed.'
      pendingReject?.(new Error(msg))
    },
  })
  return client
}

async function fetchAccount(token: string): Promise<Account | null> {
  // Drive's about endpoint returns the user without needing extra (profile/email) scopes
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const { user } = (await res.json()) as { user: { displayName?: string; emailAddress?: string; photoLink?: string } }
  return { email: user.emailAddress ?? '', name: user.displayName ?? '', photo: user.photoLink }
}

/** Seconds left on a token, from Google's tokeninfo (a cached Play services token may be part-used). */
async function tokenLifetimeMs(token: string): Promise<number> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    if (res.ok) {
      const s = Number(((await res.json()) as { expires_in?: string | number }).expires_in)
      if (s > 0) return s * 1000
    }
  } catch {
    /* offline or blocked: assume a conservative lifetime */
  }
  return 30 * 60_000
}

/** Store a fresh token (both platforms) and announce an account switch. */
async function adopt(token: string, expiresAt: number, withAccount: boolean) {
  const account = (withAccount ? await fetchAccount(token).catch(() => null) : null) ?? state.account
  const switched = !!state.account && !!account && state.account.email !== account.email
  stored = { token, expiresAt, account }
  writeStored(stored)
  armExpiry()
  set({ status: 'signed-in', account, pending: false, error: null })
  if (switched) accountSwitchListeners.forEach((l) => l())
}

function revokeRemote(token: string) {
  // fire-and-forget; works from any origin (no-cors POST)
  void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', mode: 'no-cors' }).catch(() => {})
}

function nativeError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'cancelled') return 'Sign-in was cancelled.'
  return err?.message || 'Sign-in failed.'
}

let refreshing: Promise<boolean> | null = null

/* ── Public API ─────────────────────────────────────── */

export const sessionStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },

  /** Current access token, or null when signed out / expired. */
  token(): string | null {
    if (!stored) return null
    if (!isLive(stored)) {
      if (state.status === 'signed-in') sessionStore.expire()
      return null
    }
    return stored.token
  },

  /** Token + expiry for the native player (null when signed out / expired). */
  tokenInfo(): { token: string; expiresAt: number } | null {
    return stored?.token && isLive(stored) ? { token: stored.token, expiresAt: stored.expiresAt } : null
  },

  /** A usable token, renewing it first on Android if needed (web: same as token()). */
  async ensureToken(): Promise<string | null> {
    const t = sessionStore.token()
    if (t || !isNative) return t
    return (await sessionStore.refresh()) ? sessionStore.token() : null
  },

  /**
   * Android only: get a new token from Play services without any UI. Resolves false on the web,
   * when signed out, or if Google needs the user (then the session shows "expired" as on the web).
   */
  refresh(): Promise<boolean> {
    if (!isNative || !stored?.account) return Promise.resolve(false)
    refreshing ??= (async () => {
      try {
        // drop the cached (old or rejected) token so Play services mints a full-length one
        if (stored?.token) await PelagicNative.clearToken({ token: stored.token }).catch(() => {})
        const { accessToken } = await PelagicNative.authorize({ interactive: false })
        await adopt(accessToken, Date.now() + (await tokenLifetimeMs(accessToken)), false)
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  },

  /**
   * Opens the Google popup. Call from a click handler (pop-up blockers need the user gesture).
   * `switchAccount` forces the account chooser.
   */
  async signIn(opts: { switchAccount?: boolean } = {}) {
    set({ pending: true, error: null })
    if (isNative) {
      try {
        if (opts.switchAccount && stored?.token) {
          // revoking makes Google ask again, which shows the account chooser
          revokeRemote(stored.token)
          await PelagicNative.clearToken({ token: stored.token }).catch(() => {})
        }
        const { accessToken } = await PelagicNative.authorize({ interactive: true })
        await adopt(accessToken, Date.now() + (await tokenLifetimeMs(accessToken)), true)
      } catch (e) {
        set({ pending: false, error: nativeError(e) })
      }
      return
    }
    try {
      await loadGis()
      const resp = await new Promise<google.accounts.oauth2.TokenResponse>((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject
        const hint = opts.switchAccount ? undefined : state.account?.email
        tokenClient().requestAccessToken({
          prompt: opts.switchAccount ? 'select_account' : '',
          ...(hint ? { login_hint: hint } : {}),
        })
      })
      if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
        throw new Error('Pelagic needs access to Google Drive to read your library. Tick the Drive box when Google asks.')
      }
      await adopt(resp.access_token, Date.now() + Number(resp.expires_in) * 1000, true)
    } catch (e) {
      set({ pending: false, error: (e as Error).message })
    } finally {
      pendingResolve = pendingReject = null
    }
  },

  /** Token ran out or Drive answered 401. Keeps the account so "Sign in again" can hint it. */
  expire() {
    if (!stored) return
    if (isNative && state.status === 'signed-in') {
      // try a silent renewal first; only show "expired" if Google needs the user
      void sessionStore.refresh().then((ok) => ok || sessionStore.markExpired())
      return
    }
    sessionStore.markExpired()
  },

  markExpired() {
    if (!stored) return
    stored = { ...stored, token: '', expiresAt: 0 }
    writeStored(stored)
    window.clearTimeout(expiryTimer)
    if (state.status !== 'expired') set({ status: 'expired' })
  },

  signOut() {
    const token = stored?.token
    if (token && isNative) {
      revokeRemote(token)
      void PelagicNative.clearToken({ token }).catch(() => {})
    } else if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token)
    stored = null
    writeStored(null)
    window.clearTimeout(expiryTimer)
    set({ status: 'signed-out', account: null, pending: false, error: null })
    signOutListeners.forEach((l) => l())
  },
}

const signOutListeners = new Set<() => void>()
const accountSwitchListeners = new Set<() => void>()
/** Library / caches clear themselves on sign-out or when a different Google account signs in. */
export function onAccountReset(l: () => void) {
  signOutListeners.add(l)
  accountSwitchListeners.add(l)
  return () => {
    signOutListeners.delete(l)
    accountSwitchListeners.delete(l)
  }
}

export function useSession(): Session {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get)
}

declare global {
  interface Window {
    google?: typeof google
  }
}

// Android: renew a stale token right after boot and whenever the app comes back to the foreground
// (timers don't run while the app is in the background).
if (isNative) {
  const renewIfNeeded = () => {
    if (state.status !== 'signed-in' || !stored) return
    if (!stored.token || stored.expiresAt - SKEW_MS - Date.now() < NATIVE_RENEW_MS) {
      void sessionStore.refresh().then((ok) => ok || sessionStore.markExpired())
    }
  }
  renewIfNeeded()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && renewIfNeeded())
}
