/**
 * Who is calling — the gate for every helper that spends a quota or a paid key
 * (`/api/deezer`, `/api/voice`, `/api/concerts`, `/api/romaji`).
 *
 * The app is already signed in to Firebase Auth for the player sync (`/api/sync/token` swaps its Google
 * session for a Firebase one), so it sends that session's ID token as `Authorization: Bearer <token>`
 * and this checks the signature. Checked locally against Google's public keys (cached by the Admin
 * SDK): no extra network call per request. The `X-Pelagic: 1` header alone is not a login — anyone
 * can send it.
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

export interface Caller {
  uid: string
  email: string | null
}

/** The signed-in caller, or null when the `Authorization` header has no valid Firebase ID token. */
export async function caller(authorization: string | null | undefined): Promise<Caller | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')
  if (!m) return null
  if (!getApps().length) initializeApp()
  try {
    const t = await getAuth().verifyIdToken(m[1])
    return { uid: t.uid, email: typeof t.email === 'string' ? t.email : null }
  } catch {
    return null
  }
}
