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
 *
 * Data stores (step 39, sync/cloud.ts), also under users/<uid>/:
 *   history/<YYYY-MM>    plays: ["at|trackId|dev", …]    (arrayUnion, one doc per month)
 *   playlists/<id>       one playlist (state/playlists.ts), deleted ones stay as tombstones
 *   state/recent         items (Jump back in)
 *   state/dj             the DJ's learning + prefs + voice usage
 *   state/settings       values + stamps of the settings shared by every device
 *   meta/migration       devices that copied their Drive JSON into Firestore
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { indexedDBLocalPersistence, initializeAuth, inMemoryPersistence, signInWithCustomToken, signOut, type Auth } from 'firebase/auth'
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query,
  runTransaction,
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
  /* ── data stores (step 39) ── */
  /** every doc of a collection, live */
  watchCol<T>(path: string, cb: (docs: Docs<T>[]) => void, onError: (e: Error) => void): Unsubscribe
  /** one doc, live (null: missing) */
  watchAt<T>(path: string, cb: (data: T | null) => void, onError: (e: Error) => void): Unsubscribe
  read<T>(path: string): Promise<T | null>
  /** read → fn → write, in a transaction; fn returns null to leave the doc as it is */
  update<T>(path: string, fn: (cur: T | null) => T | null): Promise<T | null>
  /** add strings to an array field (creates the doc) */
  union(path: string, field: string, values: string[]): Promise<void>
}

let app: FirebaseApp | null = null
/** one sign-in at a time (the player sync and the data stores both connect) */
let connecting: { email: string; p: Promise<SyncBackend> } | null = null
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
export function connect(email: string, accessToken: () => Promise<string | null>): Promise<SyncBackend> {
  if (connecting?.email === email) return connecting.p
  const p = connectOnce(email, accessToken)
  connecting = { email, p }
  p.catch(() => {
    if (connecting?.p === p) connecting = null
  })
  return p
}

async function connectOnce(email: string, accessToken: () => Promise<string | null>): Promise<SyncBackend> {
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
    watchCol: (path, cb, onError) => onSnapshot(collection(d, `${base}/${path}`), (s) => cb(map(s)), onError),
    watchAt: (path, cb, onError) =>
      onSnapshot(
        doc(d, `${base}/${path}`),
        (s) => cb(s.exists() ? (s.data() as never) : null),
        onError,
      ),
    read: async (path) => {
      const s = await getDoc(doc(d, `${base}/${path}`))
      return s.exists() ? (s.data() as never) : null
    },
    update: (path, fn) =>
      runTransaction(d, async (tx) => {
        const ref = doc(d, `${base}/${path}`)
        const s = await tx.get(ref)
        const next = fn(s.exists() ? (s.data() as never) : null)
        if (next) tx.set(ref, next as Record<string, unknown>)
        return next
      }),
    union: (path, field, values) => setDoc(doc(d, `${base}/${path}`), { [field]: arrayUnion(...values) }, { merge: true }),
  }
}

/** The Firebase session's ID token (renewed by the SDK when it is about to run out); null when signed out. */
export async function idToken(): Promise<string | null> {
  return (await auth?.currentUser?.getIdToken()) ?? null
}

/** Account reset (sign-out / switch): drop the Firebase session too. */
export async function disconnect() {
  connecting = null
  if (auth) await signOut(auth).catch(() => {})
}
