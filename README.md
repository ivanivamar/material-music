# Pelagic

A personal music player for my own FLAC library. The same library plays on PC and Android, with no server and no PC that needs to stay on.

## How it works

```
 C:\Users\ivani\Music  ──(import script)──▶  Google Drive /Pelagic  ◀──▶  Pelagic app
   FLAC originals                              FLAC + Opus + covers        PC: installed web app (PWA)
                                               + library.json              Android: APK (Capacitor)
```

- **Google Drive is the master copy.** It holds the FLAC originals, 160 kbps Opus phone copies (about 5× smaller), album and artist art, and a `library.json` catalogue.
- **There is no backend.** The app talks to the Google Drive API directly with the signed-in user's token. All data stays in my Drive.
- **On PC,** Pelagic is a web app installed from Chrome or Edge. It plays FLAC from a linked local folder (the Google Drive for desktop `Pelagic` folder or the music folder) and streams from Drive for anything that isn't there.
- **On Android,** the same app is wrapped with Capacitor. A native player (Media3 / ExoPlayer) streams the Opus copies from Drive, keeps playing in the background, and shows lock-screen and notification controls.
- **Playlists, history and settings** will be small JSON files in Drive, so both devices stay in sync.

## Features

- [x] Library import to Drive (tags, covers, artist images, Opus phone copies, synced lyrics)
- [x] Player: queue, shuffle / repeat, seek, media keys (PC) and lock-screen controls (Android)
- [x] Library: artists, albums, songs, album and artist pages
- [x] Search (my library only, accent-insensitive, instant)
- [x] Full-screen player, editable queue, synced lyrics
- [x] Phone layout (bottom tabs, mini-player, bottom-sheet queue, swipe to close)
- [x] PC: installable app (PWA) that opens offline, update prompt
- [x] Android app: native Google sign-in, background playback, in-app update check
- [ ] Android offline downloads (Opus, or FLAC per album)
- [ ] Home: recently listened, most played, rediscover
- [ ] Playlists
- [ ] Upload new music from the app
- [ ] New releases from my artists (MusicBrainz)

## Repo layout

| Path | What |
|---|---|
| `tools/import/` | Node script that syncs the local library to Drive. See its [README](tools/import/README.md) |
| `app/` | The Pelagic app: Vite + React + TypeScript, plus the Capacitor Android project in `app/android/`. See its [README](app/README.md) |
| `.github/workflows/android.yml` | Builds, signs and publishes the Android APK as a GitHub Release |
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

- **Web / PC:** Cloudflare Pages is linked to this repo and builds `app/` on every push to `main` (root `app`, command `npm run build`, output `dist`). Install it from Chrome or Edge with the install icon or the account menu. The installed app shows "A new version of Pelagic is ready · Reload" after each deploy.
- **Android:** every push to `main` that touches `app/` runs the **Android APK** workflow. It builds the web app, syncs it into the Capacitor project, builds a signed APK and publishes it as a GitHub Release (`android-<run number>`, asset `pelagic.apk`). The first time, install it from the Releases page. After that, the app checks Releases on launch and offers "Install" for newer builds.
  - Repository secrets: `PELAGIC_KEYSTORE_BASE64` (the release keystore, base64) and `PELAGIC_KEYSTORE_PASSWORD`.
  - Every build is signed with the same release key so updates install over the old app. Keep the key in `secrets/` and backed up; losing it means uninstalling the app to update.

## Getting started

1. Google Cloud project with the **Drive API** enabled, the OAuth consent screen published ("In production", unverified is fine for personal use), and three OAuth clients:
   - **Pelagic Import** (Desktop): JSON saved as `secrets/client_desktop.json`
   - **Pelagic Web** (Web application): JavaScript origins `http://localhost:5173` and the Cloudflare Pages address
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

Vite · React · TypeScript · Capacitor (Android) · Media3 / ExoPlayer · Google Drive API · Google Identity Services / Play services auth · service worker (Drive streaming + offline shell) · music-metadata · ffmpeg (Opus encoding) · MusicBrainz API · GitHub Actions · Cloudflare Pages
