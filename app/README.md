# Pelagic app

Vite + React + TypeScript. One codebase for the PC browser/PWA and Android (Capacitor, later).

```
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Design system (from `design_handoff_pelagic/`)

| File | What |
|---|---|
| `src/styles/tokens.css` | All design tokens as CSS variables: colour, glow, type, radii, spacing, layout, motion, atmosphere |
| `src/design/tokens.ts` | JS mirror for values used from code (eases, quality colours, tint clamps, particle counts) |
| `src/styles/fonts.css` | General Sans (self-hosted as "Pelagic Sans"); Plex Mono + Noto Sans JP come from `@fontsource` |
| `src/styles/base.css` | Reset, type helpers (`.t-hero`, `.t-page`, `.t-mono`…), shared keyframes, reduced-motion rules |
| `src/design/icons.tsx` | `<Icon name="…" />`: the 24-grid, 1.25-stroke icon set |
| `src/design/textures.ts` | `STONE`, `GRAIN`, `CONTOUR_SMOOTH`, `CONTOUR_LIVE` texture data URIs |
| `src/components/Logo.tsx` | Aperture mark, wordmark, lockup |
| `src/components/Atmosphere.tsx` | Background layers: stone, breathing contours, grain, light pools, marine snow. Follows the Motion / particles / texture settings |
| `src/components/ui/` | Core components: `Button`, `IconButton`, `PlayButton`, `Toggle`, `Segmented`, `Chip`, `Slider`, `SeekBar`, `Waveform`, `QualityBadge`, `ReleaseBadge`, `Eq`, `DownloadStatus`/`DownloadIcon`, `Skeleton`, `Rule`, `Sonar`, `OfflineBanner`, `EmptyState`, `TrackRow`, `AlbumCard`, toasts (`ToastProvider` + `useToast()`) |
| `src/state/settings.ts` | Settings store (`useSettings`, `settingsStore.set`), saved instantly to localStorage (Drive sync later) |
| `src/state/motion.ts` | `useMotion()`: the effective motion setting (in-app setting, else the system's reduced-motion preference) |
| `src/dev/` | Reference pages: `#/dev/components` and `#/dev/foundations` (work without signing in) |

No Liked songs list and no heart buttons (dropped Oct 2026).

## App shell (step 3c)

| File | What |
|---|---|
| `src/config.ts` | OAuth client ID (override with `VITE_GOOGLE_CLIENT_ID` in `.env.local`), Drive scope, `Pelagic/library.json` names |
| `src/state/session.ts` | Google sign-in via Google Identity Services (token model, no backend). ~1 h token kept in localStorage; when it runs out the session is `expired`, the cached library keeps working and one click signs in again |
| `src/lib/drive.ts` | Drive v3 over fetch: auth header, 429/5xx retry, 401 → expired session, download with progress |
| `src/state/library.ts` | Catalogue types + store. Boot: IndexedDB copy first, then checks Drive's file `version` and re-downloads only if it changed. Derived views: `albumsByAdded`, `tracksByAlbum`, `libraryStats` |
| `src/lib/covers.ts` | `useCover(driveFileId)`: fetches covers with the token, caches blobs in IndexedDB, serves object URLs |
| `src/lib/idb.ts` | Tiny IndexedDB key-value (`kv`, `covers`) |
| `src/state/player.ts` | Queue / transport / volume store the player bar binds to. Step 3d attaches the audio engine with `playerStore.attach()` |
| `src/shell/` | `AppShell` (grid: sidebar · main · player bar), `Sidebar` (circle-clip active animation + rings), `PlayerBar`, hash `routes` |
| `src/screens/` | Sign-in, Session expired, first sync ("Charting your library"), No library on Drive, library error |
| `src/pages/` | Home (greeting + Recently added from the real catalogue), placeholders for later steps |

Routes: `#/home` (default), `#/library[/artists|albums|songs]`, `#/album/<id>`, `#/artist/<id>`, `#/search`, `#/new`, `#/upload`, `#/downloads`.
Sign-out (avatar menu on Home) revokes the token and clears the cached catalogue and covers.

Motion: `<html data-motion="full|reduced">` overrides the OS reduced-motion setting. Leave it unset to follow the system. Animated elements use the class `pg-anim`, and particles use `pg-snow`.

## Player core (step 3d)

| File | What |
|---|---|
| `src/player/htmlEngine.ts` | `createHtmlAudioEngine()`: the PC `PlayerEngine` (one `<audio>` + Media Session), attached in `App.tsx`. Per track, first that works: local FLAC → Drive stream → Drive whole-file download. Lazy: a restored track resolves on the first Play press |
| `src/lib/localFolder.ts` | File System Access (Chrome/Edge). Link a folder from the avatar menu (“Play FLAC from a local folder…”): your music folder, the `Pelagic` folder in Google Drive for desktop, or its `library/` subfolder; the layout is detected from sample tracks. The handle lives in IndexedDB; after a reload Chrome asks once for read access on the first Play |
| `src/lib/driveStream.ts` + `public/sw.js` | Service worker that proxies `/__pelagic/drive/<fileId>` to the Drive API with the OAuth header (asked from the page per request), range requests included, so Drive FLAC streams and seeks without a full download |
| `src/state/player.ts` | + `source` (`local`/`drive`, shown as LOCAL/DRIVE next to the quality badge), `unload()`, `onPlayerNotice()` (auth / error / missing → toasts in `AppShell`), position saved at most once a second and on page hide |

Media Session: title/artist/album/cover, play/pause/stop, previous/next, seek to/back/forward (media keys, Windows media overlay).
Keyboard: Space plays/pauses (unless a control or text field has focus).
Errors: an unreadable local file retries from Drive; a failed track is skipped (up to 3 in a row); an expired Google token shows one “Sign in” toast that resumes playback.
Token caveat: a stream that is already running keeps going past the 1 h token, but seeking or the next Drive track needs a fresh sign-in. Linking the local folder avoids this for everything synced to the PC.

## Library (step 4)

| File | What |
|---|---|
| `src/pages/library/Library.tsx` | `#/library/artists · albums · songs` (chips; last tab remembered). Albums: grid with lazy covers, sort by added / title / artist / year. Artists: A–Z groups with a letter index, photo or mono monogram, sort by name / recently added / most albums. Songs: Play / Shuffle (whole list, current sort), then the whole catalogue in a virtualised table (sticky header, click a column to sort, double-click or ▶ to play the list from there) |
| `src/pages/library/AlbumPage.tsx` | `#/album/<id>`: cover-tinted wash (dominant hue clamped in OKLCH), hero title, artist link, tracks · length · quality badge, Play/Pause · Shuffle, tracklist with disc headers, “More by” shelf |
| `src/pages/library/ArtistPage.tsx` | `#/artist/<id>`: photo/monogram circle, banner (artist_background, else the photo blurred), Play · Shuffle, songs (first 10, show all), discography grouped as Albums / EPs / Singles / Live |
| `src/pages/library/common.tsx`, `playback.ts` | Lazy album card, artist avatar, breadcrumb, section head, sort menu; play album / artist / list, “is this context playing” |
| `src/state/views.ts` | Memoised derived views: album info (length, size, discs, best FLAC format, release type), artist info, sorting, monograms, formatting |
| `src/state/libraryPrefs.ts` | Last tab and sort orders (localStorage `pelagic.library.v1`) |
| `src/design/tint.ts` | Album-art tint: OKLCH maths, dominant colour from the cover, `sceneBackground()` |
| `src/lib/covers.ts` | + `useLazyCover()` / `useNearViewport()`: covers download only when within ~600px of the viewport |

Release type is inferred (the catalogue has none yet): a title hint (“EP”, “Live”, “Single”) wins, else 1–3 tracks under 30 min = single, 4–6 under 30 min = EP, otherwise album.
Navigation: Home cards and the player bar's title / artist link to the album and artist pages; Back returns to the previous page at the same scroll position.

## Search (step 5)

| File | What |
|---|---|
| `src/state/search.ts` | Client-side search over the cached catalogue (no Drive calls). Text folded once per catalogue (case, accents, full-width, apostrophes: “beyonce deja” finds “Beyoncé · Déjà Vu”); every query word must match the title, artist or album; title word-starts rank highest; artist initials (“bfmv”). Top result = best artist / album / song. No match → “Did you mean” (closest name by edit distance). `highlight()` for glowing matches. `searchStore`: query + filter (kept for the tab in sessionStorage), recent searches (localStorage `pelagic.search.v1`, cleared on sign-out) |
| `src/pages/search/Search.tsx` | `#/search`: 60px field with live `N RESULTS · MS`, All / Artists / Albums / Songs chips. All = Top result card + 4 songs, then one row each of albums and artists (“Show all N” switches the chip). Songs chip = virtualised list with Play all. Empty field → recent searches. Playing from search uses the `search` PlayContext |
| `src/pages/library/useWindow.ts` | Fixed-row windowing shared by Library Songs and Search songs |

Keys: `/` or Ctrl/⌘+K from anywhere focuses Search · Enter opens the top result · Esc clears · ↓/↑ move through results · Enter on a song plays it.

### General Sans (to do once)
Download the free web kit from https://www.fontshare.com/fonts/general-sans and copy
`GeneralSans-Variable.woff2` and `GeneralSans-VariableItalic.woff2` into `public/fonts/`.
Until then, the Fontshare CDN link in `index.html` loads the font online. On Android the font must be self-hosted to work offline.

## PWA (step 7)

| File | What |
|---|---|
| `public/manifest.webmanifest` + `public/icons/` | Install metadata: standalone window, `#0b0b0c` theme, 192/512 icons (+ maskable, apple-touch), Search / Library shortcuts, `launch_handler: focus-existing` (opening Pelagic again focuses the running window instead of starting a second player) |
| `public/sw.js` | Besides the Drive proxy: offline app shell. On install it precaches index.html, JS, CSS, icons and Latin fonts; other hashed assets (CJK font subsets…) are cached on first use; Fontshare CSS/fonts stale-while-revalidate. Navigations get the cached index.html, so the installed app opens offline (the cached library and covers already come from IndexedDB). In dev (`BUILD = null`) caching is off |
| `vite.config.ts` → `pelagic-sw` | After `vite build`, fills `BUILD` (hash of the precached files), `PRECACHE` and `ASSETS` into `dist/sw.js`. Also defines `__PELAGIC_VERSION__` (date · commit, shown at the bottom of the account menu) |
| `src/lib/pwa.ts` | `initPwa()` (App.tsx): watches for a waiting worker (checks hourly and when the window becomes visible) → `usePwa().updateReady` → shell toast “A new version of Pelagic is ready · Reload” (also in the account menu); keeps `beforeinstallprompt` for the menu's “Install Pelagic app”; applies the launch URL's #route when a launch is focused into the open window |

Update flow: a deploy changes `sw.js` → the browser installs it next to the running one and it **waits** → toast → Reload sends `pelagic:skip-waiting` → the page reloads on `controllerchange`. The first install takes over immediately. Ignoring the toast is fine: the new version starts the next time the app is opened with no Pelagic window left open.

Test the production build locally with `npm run build && npm run preview` (http://localhost:4173 is a different origin from dev, so sign-in there needs that origin on the OAuth client; the shell, offline reload and update toast can be checked with an expired/cached session).

## Android app (step 7)

Same web app inside Capacitor 8 (`capacitor.config.ts`, `android/`). The built `dist/` is bundled into the APK, so the UI opens offline.

| File | What |
|---|---|
| `src/native/bridge.ts` | `isNative` + the `PelagicNative` plugin interface |
| `android/app/src/main/java/com/ivan/pelagic/PelagicNativePlugin.java` | Google sign-in via Play services `AuthorizationClient` (Drive scope; silent token whenever needed, consent sheet only the first time), `clearToken`, `appInfo`, `openUrl` |
| `src/state/session.ts` | On Android: native sign-in; tokens renewed silently 5 min before expiry, on return to foreground and on a Drive 401 (`ensureToken()` / `refresh()`), so "Session expired" only appears if Google needs you |
| `src/native/updates.ts` | Checks GitHub Releases (`android-<versionCode>` + `pelagic.apk`) on launch / every 6 h in the foreground → toast "Pelagic 1.0.N is available · Install" (opens the APK in the browser) |
| `src/player/nativeEngine.ts` | Android `PlayerEngine` (phase C): sends the store's queue to the native player (rebuilt around the playing track on edits / shuffle), mirrors its state back (`playerStore.engineMoved` when it advances by itself), pushes the Drive token, adopts native playback on relaunch |
| `android/…/PelagicPlaybackService.java` | ExoPlayer in a `MediaSessionService`: background playback, notification + lock-screen / Bluetooth / headset controls, audio focus, pause on unplug, gapless. Streams the Opus copy (else FLAC) and covers from Drive with the OAuth header; 401 → new token + retry once; broken tracks skipped (max 3) |
| `android/…/PelagicPlayerPlugin.java` | JS bridge (`PelagicPlayer`): `setQueue`, `play`, `pause`, `seek`, `setRepeat`, `stop`, `getState`, `setAuth`; "state" / "error" events |
| `android/…/DriveAuth.java` | Drive tokens for native requests: the app's token, or silently from Play services (`GoogleAuthUtil`) when the app is asleep |
| `../.github/workflows/android.yml` | Push to main touching `app/` → build, sign, publish release `android-<run>` |

Signing: one release key for every build (debug too) so the Google OAuth client's SHA-1 always matches and updates install over the old app. The key lives in `D:\pelagic\secrets\` (`pelagic-release.jks` + `android-signing.properties`, gitignored) and as GitHub secrets `PELAGIC_KEYSTORE_BASE64` / `PELAGIC_KEYSTORE_PASSWORD`. **Never lose it** — a new key means uninstalling the app to update.

Local build (optional, needs Android Studio / JDK 21 + SDK): `npm run build && npx cap sync android`, then open `android/` in Android Studio or `cd android && gradlew assembleDebug`.

Edge-to-edge: Capacitor's SystemBars (`insetsHandling: 'native'`) keeps `env(safe-area-inset-*)` correct; `src/shell/phone.css` pads the top/bottom with it.
