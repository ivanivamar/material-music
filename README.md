# Pelagic

A personal music player for my own FLAC library. The same library plays on PC and Android, with no server and no PC that needs to stay on.

## How it works

```
 C:\Users\ivani\Music  ──(import script)──▶  Google Drive /Pelagic  ◀──▶  Pelagic app
   FLAC originals                              FLAC + Opus + covers        PC: installed web app (PWA)
                                               + library.json              Android: APK (Capacitor)
```

- **Google Drive is the master copy.** It holds the FLAC originals, 160 kbps Opus phone copies (about 5× smaller), album and artist art, and a `library.json` catalogue.
- **There is no backend.** The app talks to the Google Drive API directly with the signed-in user's token. All data stays in my Drive. The only server-side code is two tiny Cloudflare Pages Functions: a sign-in helper (`app/functions/api/auth`) that keeps the OAuth client secret and the refresh token, so the PC app stays signed in instead of asking every hour, and a Deezer proxy (`app/functions/api/deezer`) that fetches artist photos for the Upload page (the browser can't call Deezer directly).
- **On PC,** Pelagic is a web app installed from Chrome or Edge. It plays FLAC from a linked local folder (the Google Drive for desktop `Pelagic` folder or the music folder) and streams from Drive for anything that isn't there.
- **On Android,** the same app is wrapped with Capacitor. A native player (Media3 / ExoPlayer) streams the Opus copies from Drive, keeps playing in the background, and shows lock-screen and notification controls.
- **Playlists, history and settings** are small JSON files in Drive, so both devices stay in sync.

## Features

- [x] Library import to Drive (tags, covers, artist images, Opus phone copies, synced lyrics)
- [x] Player: queue, shuffle / repeat, seek, media keys (PC) and lock-screen controls (Android)
- [x] Library: artists, albums, songs, album and artist pages
- [x] Search (my library only, accent-insensitive, instant; artists, albums, playlists and songs)
- [x] Full-screen player, editable queue, synced lyrics
- [x] Phone layout (bottom tabs, mini-player, bottom-sheet queue, swipe to close)
- [x] PC: installable app (PWA) that opens offline, update prompt
- [x] Android app: native Google sign-in, background playback, in-app update check
- [x] Android offline downloads (Opus, or FLAC per album)
- [x] PC stays signed in (sign-in helper on Cloudflare renews the Google session silently)
- [x] Playlists
- [x] Home: recently listened, most played, rediscover
- [x] Upload new music from the app (artist photo and banner taken from the dropped artist folder, or the photo from Deezer)
- [x] Search bar and account menu on every page on PC; on the phone the account sits in the bottom tab bar and opens as a bottom sheet
- [x] New releases from my artists (MusicBrainz)
- [x] DJ: endless themed sessions from the library with spoken intros (Google Cloud TTS, free allowance)
- [ ] Android home screen widget: now playing, controls and queue, 1×1 to 4×4 (built, not yet tested on the phone)

## Status

Everything above is built and tested on the real setup (real Drive library, PC app, Android app, Cloudflare hosting, MusicBrainz). The PC sign-in helper keeps the session alive with silent renewal. Everything is committed and pushed.

## Repo layout

| Path | What |
|---|---|
| `tools/import/` | Node script that syncs the local library to Drive. See its [README](tools/import/README.md) |
| `app/` | The Pelagic app: Vite + React + TypeScript, plus the Capacitor Android project in `app/android/`. See its [README](app/README.md) |
| `.github/workflows/android.yml` | Builds, signs and publishes the Android APK as a GitHub Release |
| `.github/workflows/firebase.yml`, `firebase.json`, `firebase/functions/` | Backup copy of the web app on Firebase Hosting + the `/api` function |
| `design_handoff_pelagic/` | Design reference (tokens, screens, motion) |
| `secrets/` | Google OAuth client and the Android signing key. Git-ignored, never committed |

## Drive layout

```
Pelagic/
  library/Artist/Album/NN - Title.flac   # originals
  mobile/Artist/Album/NN - Title.opus    # phone copies
  covers/<albumId>.jpg                   # 600px album art
  covers/artists/<artistId>.jpg          # artist photos (+ _bg banners)
  library.json                           # catalogue
```

## Distribution

- **Web / PC:** Cloudflare Pages is linked to this repo and builds `app/` on every push to `main` (root `app`, command `npm run build`, output `dist`; `app/functions/` deploys as Pages Functions). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the Pelagic Web client's id and secret, the secret encrypted) under Settings → Variables and secrets, then redeploy — that turns on stay-signed-in. Paste both values with no leading or trailing spaces: a stray space in the client id makes the sign-in popup finish but leaves the app signed out. To check, open `<site>/api/auth/status`; it should answer `{"configured":true,...}`. Because the app is unverified, Google shows a "Google hasn't verified this app" warning at sign-in; choose Continue and tick the Drive box. Install it from Chrome or Edge with the install icon or the account menu. The installed app shows "A new version of Pelagic is ready · Reload" after each deploy.
- **Web / PC, backup address (Firebase Hosting):** the same build also goes to Firebase Hosting (`<project>.web.app`), so the app stays reachable when Spanish ISPs block Cloudflare IPs during LaLiga matches. `firebase.json` serves `app/dist` and sends `/api/**` to one Cloud Function, `api` (`firebase/functions`, europe-west1), which bundles the same `app/functions/api` handlers (esbuild) — no second copy of the code. Firebase Hosting only forwards a cookie named `__session`, so the function renames the refresh-token cookie on the way in and out. The **Firebase Hosting** workflow deploys Hosting on every push to `main` that touches `app/` (secret `FIREBASE_SERVICE_ACCOUNT`); the function is deployed from the PC with `firebase deploy --only functions` (needs the Blaze plan; secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` via `firebase functions:secrets:set`). The Firebase address must be in the Pelagic Web client's JavaScript origins. It is a separate origin: install it as its own PWA, sign in once and link the music folder again (Drive data is shared).
- **Android:** every push to `main` that touches `app/` runs the **Android APK** workflow. It builds the web app, syncs it into the Capacitor project, builds a signed APK and publishes it as a GitHub Release (`android-<run number>`, asset `pelagic.apk`). The first time, install it from the Releases page. After that, the app checks Releases on launch and offers "Install" for newer builds.
  - Repository secrets: `PELAGIC_KEYSTORE_BASE64` (the release keystore, base64) and `PELAGIC_KEYSTORE_PASSWORD`.
  - Every build is signed with the same release key so updates install over the old app. Keep the key in `secrets/` and backed up; losing it means uninstalling the app to update.

## Getting started

1. Google Cloud project with the **Drive API** enabled, the OAuth consent screen published ("In production", unverified is fine for personal use), and three OAuth clients:
   - **Pelagic Import** (Desktop): JSON saved as `secrets/client_desktop.json`
   - **Pelagic Web** (Web application): JavaScript origins `http://localhost:5173`, the Cloudflare Pages address and the Firebase Hosting address (`https://<project>.web.app`)
   - **Pelagic Android** (Android): package `com.ivan.pelagic` + the SHA-1 of the release signing key
2. Install **Node.js 22+**.
3. Import the library:
   ```
   cd tools/import
   npm install
   npm run dry-run
   npm run import
   ```
   Re-run `npm run import` whenever new music is added. Unchanged files are skipped and nothing is ever deleted from Drive.
4. Run the app locally:
   ```
   cd app
   npm install
   npm run dev      # http://localhost:5173
   ```
   Android builds normally come from GitHub Actions. To build locally you need JDK 21 and the Android SDK: `npm run build && npx cap sync android`, then open `app/android/` in Android Studio.

## Tech

Vite · React · TypeScript · Capacitor (Android) · Media3 / ExoPlayer · Google Drive API · Google Identity Services / Play services auth · service worker (Drive streaming + offline shell) · music-metadata · ffmpeg (Opus encoding) · MusicBrainz API · GitHub Actions · Cloudflare Pages · Firebase Hosting + Cloud Functions
