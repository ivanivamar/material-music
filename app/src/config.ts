/**
 * App-wide constants. The OAuth client ID is public (it identifies the app, it is not a secret);
 * override it with VITE_GOOGLE_CLIENT_ID in app/.env.local if the client is ever recreated.
 */
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '1053700895476-6jafnagm34rs2fpv87b9oh9oogbjvm3c.apps.googleusercontent.com'

/** Full Drive scope: the app reads the library and (later) writes playlists, history and settings. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

/** Folder in My Drive written by tools/import, and the catalogue inside it. */
export const DRIVE_ROOT = 'Pelagic'
export const CATALOGUE_NAME = 'library.json'
/** Play history in the same folder (step 8, state/history.ts). */
export const HISTORY_NAME = 'history.json'
/** New Releases feed + marks (step 11, state/releases.ts). */
export const RELEASES_NAME = 'releases.json'
/** Genres filled in from MusicBrainz / set in the app (step 20b, state/genres.ts). */
export const GENRES_NAME = 'genres.json'
/** One JSON file per playlist (+ optional <id>.jpg cover) in Pelagic/playlists/ (step 9, state/playlists.ts). */
export const PLAYLISTS_DIR = 'playlists'

/**
 * Firebase web app (step 37: player sync through Firestore). These values are public identifiers, not
 * secrets — paste them from Firebase console → Project settings → General → Your apps → the web app
 * (or set VITE_FIREBASE_API_KEY / VITE_FIREBASE_APP_ID in app/.env.local). While `apiKey` is empty the
 * sync stays off and the player works exactly as before.
 */
export const FIREBASE_CONFIG = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? 'AIzaSyBUNcghrujaMenmRHNwA8YgpDkhVG2-RN4',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? '1:1053700895476:web:6c8b8c8b8c8b8c8b8c8b8c',
  projectId: 'material-music-app',
  authDomain: 'material-music-app.firebaseapp.com',
}
