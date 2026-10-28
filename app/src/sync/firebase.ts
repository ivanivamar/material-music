/**
 * Firebase for the player sync (step 37). Loaded lazily (dynamic import from sync/playerSync.ts) so
 * the SDK stays out of the main bundle and nothing loads while the sync is off.
 *
 * Sign-in: the app's Google session is Drive-only, so `/api/sync/token` (firebase/functions) swaps the
 * Drive access token for a Firebase custom token once; Firebase Auth then keeps its own session in
 * IndexedDB and renews it by itself. A different Google account → sign out of Firebase and swap again.
 *
 * Firestore layout, all under users/<uid>/ (rules: only the owner):
 *   devices/<deviceId>   name, platform, seenAt, online, following, now { what's playing here }
 *   queues/<deviceId>    rev, queue, unshuffled         (written only when the queue changes)
 *   sync/active          deviceId, at                   (the device that plays; others pause)
 *   commands/<auto id>   to, from, op, args (JSON), at  (remote control; the target deletes it)
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { indexedDBLocalPersistence, initializeAuth, inMemoryPersistence, signInWithCustomToken, signOut, type Auth } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import { FIREBASE_CONFIG } from '../config'
import { isNative } from '../native/bridge'

const API_BASE: string = isNative ? ((import.meta.env.VITE_PELAGIC_API as string | undefined) ?? 'https://material-music-app.web.app/') : import.meta.env.BASE_URL

export interface Docs<T> {
  id: string
  data: T
}

export interface SyncBackend {
  uid: string
  watch<T>(path: 'devices' | 'queues', cb: (docs: Docs<T>[]) => void, onError: (e: Error) => void): Unsubscribe
  watchDoc<T>(path: 'sync/active', cb: (data: T | null) => void, onError: (e: Error) => void): Unsubscribe
  watchCommands<T>(to: string, cb: (docs: Docs<T>[]) => void, onError: (e: Error) => void): Unsubscribe
  set(path: string, data: Record<string, unknown>, merge?: boolean): Promise<void>
  add(path: 'commands', data: Record<string, unknown>): Promise<void>
  remove(path: string): Promise<void>
  signOut(): Promise<void>
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function init() {
  if (app) return
  app = initializeApp(FIREBASE_CONFIG, 'pelagic-sync')
  // IndexedDB keeps the Firebase session across reloads (WebView too); fall back to memory if it fails
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, inMemoryPersistence] })
  db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true })
}

async function customToken(accessToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}api/sync/token`, {
    method: 'POST',
    headers: { 'X-Pelagic': '1', Authorization: `Bearer ${accessToken}` },
  })
  const j = (await res.json().catch(() => ({}))) as { token?: string; message?: string; error?: string }
  if (!res.ok || !j.token) throw new Error(j.message || j.error || `Sync sign-in answered ${res.status}`)
  return j.token
}

/**
 * Signed-in backend for `email`'s account. `accessToken` gives a fresh Google token when Firebase
 * needs a new sign-in (first time on this device, or another account).
 */
export async function connect(email: string, accessToken: () => Promise<string | null>): Promise<SyncBackend> {
  init()
  const a = auth!
  const d = db!
  await a.authStateReady()
  let user = a.currentUser
  if (user) {
    const claims = (await user.getIdTokenResult().catch(() => null))?.claims
    if (!claims || claims.email !== email) {
      await signOut(a)
      user = null
    }
  }
  if (!user) {
    const t = await accessToken()
    if (!t) throw new Error('Not signed in to Google.')
    user = (await signInWithCustomToken(a, await customToken(t))).user
  }
  const base = `users/${user.uid}`
  const map = <T>(snap: { docs: { id: string; data(): unknown }[] }): Docs<T>[] => snap.docs.map((x) => ({ id: x.id, data: x.data() as T }))

  return {
    uid: user.uid,
    watch: (path, cb, onError) => onSnapshot(collection(d, `${base}/${path}`), (s) => cb(map(s)), onError),
    watchDoc: (path, cb, onError) =>
      onSnapshot(
        doc(d, `${base}/${path}`),
        (s) => cb(s.exists() ? (s.data() as never) : null),
        onError,
      ),
    watchCommands: (to, cb, onError) => onSnapshot(query(collection(d, `${base}/commands`), where('to', '==', to)), (s) => cb(map(s)), onError),
    set: (path, data, merge = false) => setDoc(doc(d, `${base}/${path}`), data, { merge }),
    add: async (path, data) => {
      await addDoc(collection(d, `${base}/${path}`), data)
    },
    remove: (path) => deleteDoc(doc(d, `${base}/${path}`)),
    signOut: () => signOut(a),
  }
}

/** Account reset (sign-out / switch): drop the Firebase session too. */
export async function disconnect() {
  if (auth) await signOut(auth).catch(() => {})
}
