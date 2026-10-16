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
| `src/state/session.ts` | Google sign-in via Google Identity Services. On the hosted site it uses the authorization-code flow through the token helper below: you sign in once and the 1 h access token (localStorage) is renewed silently 5 min before it runs out, on wake-up, on reconnect and on a Drive 401. Without the helper (`npm run dev`, or the secret not set) it falls back to the token model: when the token runs out the session is `expired`, the cached library keeps working and one click signs in again |
| `functions/api/auth/[action].ts` | **Token helper** — a Cloudflare Pages Function on the same origin (the only server-side code). `exchange` swaps the sign-in code for tokens with the OAuth client secret, `refresh` hands out a new access token, `logout` revokes; `status` says whether it's configured. The refresh token lives only in an HttpOnly `__Host-pelagic_rt` cookie (Secure, SameSite=Strict, 180 days, slid forward on each use); POSTs need `X-Pelagic: 1` + same origin. Needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the Pelagic Web client) in Cloudflare Pages → Settings → Variables and secrets |
| `src/lib/drive.ts` | Drive v3 over fetch: auth header, 429/5xx retry, 401 → expired session, download with progress |
| `src/state/library.ts` | Catalogue types + store. Boot: IndexedDB copy first, then checks Drive's file `version` and re-downloads only if it changed. Derived views: `albumsByAdded`, `tracksByAlbum`, `libraryStats` |
| `src/lib/covers.ts` | `useCover(driveFileId)`: fetches covers with the token, caches blobs in IndexedDB, serves object URLs |
| `src/lib/idb.ts` | Tiny IndexedDB key-value (`kv`, `covers`) |
| `src/state/player.ts` | Queue / transport / volume store the player bar binds to. Step 3d attaches the audio engine with `playerStore.attach()` |
| `src/shell/` | `AppShell` (grid: sidebar · main · player bar), `Sidebar` (circle-clip active animation + rings), `PlayerBar`, hash `routes` |
| `src/screens/` | Sign-in, Session expired, first sync ("Charting your library"), No library on Drive, library error |
| `src/pages/` | Home (step 8), New releases (step 11), placeholders for later steps |

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

## Home + play history (step 8)

| File | What |
|---|---|
| `src/pages/Home.tsx` | Greeting header + four album shelves: **Recently listened** (played in the last 30 days, newest first), **Recently added**, **Most played** (all time, with play counts), **Rediscover** (heard before but not for 30+ days — favourites first — then albums never played; the pick changes once a day). Desktop: one row per shelf (as many cards as fit). Phone: rows scroll sideways. Shelves that need history appear after the first counted play |
| `src/state/homeViews.ts` | The shelf logic (`homeShelves`, `albumPlays`), memoised per catalogue + history + day |
| `src/player/playTracker.ts` | Counts plays from the player store (any engine): ≥ 30 s actually heard (half the track if shorter than a minute), seeking doesn't count, starting over re-arms. Android screen off: when the native player jumped several rows while JS slept, the rows in between count if their lengths fit in the elapsed time |
| `src/state/history.ts` | Play history store. Rows `[unixSeconds, trackId, deviceId]` (device `w-…` browser / `a-…` Android, localStorage `pelagic.device.v1`). Local copy in IndexedDB `kv.history`; Drive `Pelagic/history.json` merged by union (rows never change, so devices can't conflict). Downloads only when Drive's `version` moved, writes only when this device has new plays (20 s after a play, on leaving the app, on reconnect), re-checks the version right before writing. Syncs on sign-in, Home open (≥ 60 s apart), focus, “Check Drive for changes” |

## Playlists (step 9)

No Liked songs playlist and no hearts (see the plan).

| File | What |
|---|---|
| `src/state/playlists.ts` | Store + Drive sync. One file per playlist, `Pelagic/playlists/<id>.json` (+ `<id>.jpg` custom cover). Offline-first: edits land in IndexedDB `kv.playlists` at once and go up 2 s later (or on reconnect / leaving the app). Merge per entry: adds from both devices survive, removals are tombstones (`removed` + `removedAt`, Undo flips them back with a newer stamp), order is a fractional `pos` where the latest move wins (`movedAt`); name / description / cover / deleted: latest edit per field wins (`stamps`). Deleting writes `deleted: true` and moves the file to the Drive trash (Undo / restore untrashes); once the trash is emptied the file is gone and the playlist is dropped locally. Downloads a file only when its Drive `version` moved, writes only playlists changed here, re-checks the version right before writing |
| `src/state/playlistViews.ts` | Entries resolved against the catalogue (track id → ISRC → artist + title, so a tag edit doesn't lose songs; missing ones stay as "not in your library" rows), totals, mosaic covers, duplicate check, M3U export (`.m3u8`, paths relative to the music folder from `source.path`) |
| `src/pages/playlists/PlaylistPage.tsx` | `#/playlist/<id>` (handoff 09): 200px cover (custom or 2×2 mosaic; click = Edit details), PLAYLIST · BY YOU · UPDATED …, name, description, tracks · length (· offline), Play / Shuffle / Download (Android) / ⋯. Table # · title · album · quality · added · time · ⋯; double-click plays, drag rows to reorder (desktop: whole row, also onto a sidebar playlist; phone: the grip), right-click / ⋯ = track menu with Remove from playlist. Empty: "… is empty · Find songs" |
| `src/pages/playlists/PlaylistsView.tsx` | Library › Playlists tab (A–Z): desktop grid with a New playlist tile; phone list (handoff 07 Android Playlists) |
| `src/pages/playlists/PlaylistCover.tsx` | Custom image or mosaic (1 album → full tile, 2–3 repeat) |
| `src/actions/` | Handoff 15 Actions. `actions.ts` (what's open), `ActionHost.tsx` (desktop context menu + Add to playlist submenu with search / phone bottom sheet with a picker page), `Dialogs.tsx` (New playlist, Edit playlist: name, description, cover image → 600px JPEG on Drive or back to the mosaic), `ops.ts` (add with duplicate warning — songs already in it are skipped, all already there → "Add anyway"; create, remove, delete, all with Undo toasts) |

Entry points: right-click or ⋯ on any song row (album, artist, playlist, Library › Songs, Search, queue rows, full-screen player header), album cards / album ⋯, artist tiles / artist ⋯, sidebar playlists (+ to create; drop songs or album cards onto one to add them), queue panel "Save the queue as a playlist". Phone: long-press or ⋯ opens the sheet. Esc and Android Back close menus and dialogs first. Android: a playlist can be downloaded (a `playlist` pin — only its tracks, filed under their albums as partial album plans).

## Smart playlists (step 20)

Playlists that fill themselves from rules. New from the sidebar's ✦ button, the Library › Playlists
"New smart playlist" tile/row, or the empty state. Starting points: Recently added, Never played,
Not played in a year, Most played this month, Genre, Decade, Custom.

- Rules (`src/state/smart.ts`): date added / last played (in the last N days·weeks·months·years, or
  not), play count, plays in a period, genre, decade, year, artist, album, title — match all or any.
  Sort (also picks what's kept with a limit) + optional "limit to N songs".
- Stored in the playlist's own Drive file as `smart` (+ `stamps.smart`, latest edit wins), so the
  rules sync like the name; `entries` stays empty. Songs are worked out on each device from the
  catalogue + `history.json`; views recompute after every counted play and once an hour.
- Same UI as playlists (`playlistInfo()` returns the computed rows): page shows the rules line
  (click = Edit rules) and a PLAYS / LAST PLAYED / ADDED column depending on the sort. No reorder,
  no "Remove from", not offered in Add to playlist pickers or as a sidebar drop target.
- Android download of a smart playlist follows it (files come and go with the rules); it waits until
  the history was read from Drive once so "Never played" never briefly means the whole library.

## Genres (step 20b)

Most albums have no GENRE tag, so `src/state/genres.ts` fills the gaps. An album's genres, first that
has any: set on the album in the app → its GENRE tag → set on its artist in the app → MusicBrainz
release group → MusicBrainz artist genres. Stored in Drive `Pelagic/genres.json` (`albums` / `artists`
entries with `mb` + `user` values, each stamped; `checked` per artist) — never in the FLAC tags or
library.json. A MusicBrainz pass runs ~20 s after launch for artists with untagged albums not checked
in 90 days (a week if nothing was found): 2 requests per artist through the shared 1/s queue
(`artistGenres`, `browseReleaseGroupGenres` in `lib/musicbrainz.ts`), synced before and after so
devices share it. "Edit genre…" in the album and artist ⋯ menus (`actions/GenreDialog.tsx`); album /
artist page headers, smart playlist genre rules and their suggestions all use the resolved genres.

## Listening stats + yearly recap (step 21)

Top artists, albums and songs, hours listened, plays, the first play of the period and a listening chart, per calendar year or month — computed on each device from the catalogue + `history.json` (nothing new is stored in Drive).

| File | What |
|---|---|
| `src/state/stats.ts` | `periodStats(c, plays, {year, month})` (memoised per period; reset when history / catalogue change), `periodIndex` (years / months with plays), `recapYear(now)` (Dec 18–31 → this year, January → last year, else null), formatting. Time listened = plays × track length (an estimate: rows only store when a play started). Artists = album artists |
| `src/pages/stats/Stats.tsx` | `#/stats` (latest year; in January the previous one), `#/stats/2026`, `#/stats/2026-10`. Year chips + month row (months without plays disabled; changing period replaces the history entry). Counters (hours, plays, songs, albums, artists, days), bars by month (click → that month) or by day, peak, first play (play button), top artists (#1 feature + 2–10, show 50), top albums (cards, show 50), top songs (Play top N / Shuffle, track menu, drag). Empty states |
| `src/pages/stats/RecapShelf.tsx` | Home: "YOUR 2026 IN MUSIC" shelf on top, only Dec 18 – Jan 31 and when that year has plays: wide recap card (hours, plays, top artist / song, first play → `#/stats/<year>`) + the year's top albums |
| `src/pages/stats/stats.css` | Desktop styles; phone rules in `src/shell/phone.css` |
| `src/pages/AccountMenu.tsx` | "Listening stats" item (desktop avatar menu + phone account sheet), any time of year |

## New releases (step 11)

| File | What |
|---|---|
| `src/pages/releases/NewReleases.tsx` | `#/new` (handoff 12, `NewReleases.dc.html`). Header: sonar line (`LAST SONAR · 15 OCT 06:12 · N ARTISTS` / `SONAR SWEEP · n / N` while sweeping, progress hairline), Followed artists, refresh (Check MusicBrainz now, sonar rings while sweeping). Type chips (Albums / EPs / Singles on, Live / Other off) · Show seen · `N NEW · N SEEN · N HIDDEN`. Hero = newest release (last 30 days) from the artist you play most. Groups Upcoming (countdown) / This week / Earlier this month / Older; desktop cards with seen / I've got it / MusicBrainz / remind (upcoming) / dismiss; phone rows: drag right = seen, left = dismiss, tap = sheet. States: first sweep, no sonar yet, caught up (Bring everything back), offline pill, MusicBrainz error with Retry now |
| `src/pages/releases/ReleasePanel.tsx` | Right panel (desktop) / bottom sheet (phone, handle drag closes): release detail (cover, library match, actions, facts, MusicBrainz / Bandcamp / artist site links, tracklist — greyed preview, or your own tracks playable once in the library) and Followed artists (hide reissues, filter, mute per artist) |
| `src/pages/releases/parts.tsx` | Cover (Cover Art Archive `front-250/500`, else a generated NO COVER ART sleeve seeded by the release id), badges, actions + toasts, swipe row |
| `src/state/releases.ts` | Store + sweep + Drive `Pelagic/releases.json`. Daily sweep after 06:00 (also from the page and the refresh button): every library artist with a MusicBrainz id (importer's `mbid`, else a name search verified by album titles), release groups from the last ~6 months + upcoming. Each artist is stamped when checked, so a cut-short sweep resumes and an artist the other device already checked today is skipped. First sight of a release older than 30 days → starts as seen. Marks (new / seen / acq / gone), reminders, muted artists, hide reissues and fetched tracklists are timestamped entries merged entry by entry between devices (latest wins), same version-check pattern as history.json. Filters per device in localStorage `pelagic.releases.v1` |
| `src/state/releaseViews.ts` | Feed (memoised): status (`lib` = album title — or for a single, the song — by that artist is in the catalogue; derived, never stored), visibility, hero, groups, counts; per-track matches for the panel; Followed artists rows |
| `src/lib/musicbrainz.ts` | ws/2 JSON client from the browser (CORS), one request per 1.1 s, panel requests first, 503 back-off 4/8/16 s then error (auto retry after 30 min). Release-group browse, artist search, release tracklist + label, artist URL relations |

"I've got it" marks a release *acquired* (MATCHING) until it shows up in the catalogue (upload or import); then toast "… is in your library · Play". Sidebar badge = new releases in the feed; phone NEW tab gets a dot. Reminders: on the release day, toast "… is out today · View" (once, on either device). Back (Android) / Esc close the panel first.

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
