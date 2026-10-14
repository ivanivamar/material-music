/**
 * App-wide constants. The OAuth client ID is public (it identifies the app, it is not a secret);
 * override it with VITE_GOOGLE_CLIENT_ID in app/.env.local if the client is ever recreated.
 */
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '807400953813-0rf6g4jn7ompfise7pkgn6pou2dmofrh.apps.googleusercontent.com'

/** Full Drive scope: the app reads the library and (later) writes playlists, history and settings. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

/** Folder in My Drive written by tools/import, and the catalogue inside it. */
export const DRIVE_ROOT = 'Pelagic'
export const CATALOGUE_NAME = 'library.json'
