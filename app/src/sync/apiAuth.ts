/**
 * Headers for the site's own helpers (`/api/deezer`, `/api/voice`, `/api/concerts`, `/api/romaji`).
 * They only answer a signed-in user: the Firebase session's ID token goes along as
 * `Authorization: Bearer …` (checked in firebase/functions/src/api/guard.ts).
 *
 * The token comes from the same Firebase sign-in the cloud data uses (sync/cloud.ts), so this
 * connects it when it isn't yet. With no session (signed out, offline, Firebase not set up) the
 * request goes out without the token and the helper answers 401, which every caller already
 * treats as "not available right now".
 */
import { whenCloud } from './cloud'

export async function apiHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'X-Pelagic': '1', ...extra }
  try {
    if (!(await whenCloud())) return headers
    const { idToken } = await import('./firebase')
    const token = await idToken()
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    /* no token: the helper answers 401 */
  }
  return headers
}
