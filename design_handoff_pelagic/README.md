# Handoff: Pelagic music player (desktop + Android)

## Overview
Pelagic is a single-listener music player for a personal FLAC library stored in Google Drive. On desktop, FLAC plays from a local Google Drive for desktop folder, and the app streams from Drive when that folder is missing. On Android it streams or uses downloaded Opus. The visual language is a calm "deep ocean": near-monochrome, textured near-blacks, grain, thin white line work. Colour comes only from album art.

Scope covered: sign-in, first-run setup, Home, Library (albums / artists / playlists), Album, Artist, Search, Queue, Now Playing + Lyrics (Japanese with romaji / English), Playlists, Liked Songs, New Releases (MusicBrainz feed), Upload, Downloads, Settings, track/album actions (context menus, add to playlist, track info), plus empty / offline / loading / error / toast states.

## About the design files
The files in this bundle are **design references created in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the target codebase's existing environment and patterns. If there is no codebase yet, pick a fitting stack; one reasonable choice is Tauri or Electron with React for desktop and Kotlin/Compose for Android, with one shared design-token source.

The `.dc.html` files run in a browser, with `support.js` as their runtime. Open `Pelagic.dc.html` to see everything on one pannable canvas. Sections 12–15 embed the other files.

## Fidelity
**High fidelity.** The colours, type, spacing, radii, motion timings and copy are final. Recreate them pixel-accurately. The data shown is sample data: release titles, dates, labels, the account `m.okafor@gmail.com`, paths, sizes and keyboard shortcuts are all placeholders.

## Canvases
- Desktop: **1440 × 900**. Left sidebar 232px, bottom player bar 84px, main area padded `40px 56px`.
- Android: **412 × 915**. Status bar 36px, bottom tab bar 88px (`HOME · LIBRARY · SEARCH · NEW`), mini-player 62px floating 8px from the edges, sitting above the tabs.

## Design tokens

### Colour
| Token | Value | Use |
|---|---|---|
| bg-0 | `#050505` / `#070708` | deepest canvas, sign-in |
| bg-1 | `#0B0B0C` | app background (never flat #000) |
| surface-1 | `#121214` | raised rows, skeleton base, inputs |
| surface-2 | `#1A1A1D` | toasts, hover, menus' active row |
| menu | `#161618` (menus), `#141416` (dialogs / sheets), `#0E0E10` (side panels) | |
| ink-primary | `#EDEDED` | text, primary button fill |
| ink-secondary | `#8A8A8E` | secondary text, inactive icons |
| ink-tertiary | `#55555A` | mono metadata only |
| ink-ghost | `#3A3A3E` | disabled, muted bars |
| line / glow | `#FFFFFF` | the single accent: 1px lines, progress, glowing dots |
| hairline | `rgba(255,255,255,0.04–0.10)` | separators (1px) |
| border | `rgba(255,255,255,0.12–0.18)` | control borders (1.5px) |
| danger | `rgb(230,150,140)`; border `rgba(230,150,140,0.35–0.4)`, bg `rgba(230,150,140,0.04)` | destructive, errors |

Quality badges use muted colours. Text is `rgb(c)`, border `rgba(c,0.5)`, background `rgba(c,0.08)`:
- FLAC 16/44.1 → `143,199,230`
- FLAC 24/48 → `198,180,242`
- OPUS 160 / 320 → `230,196,141`

Release-type badges (ALBUM, EP, SINGLE, LIVE, REISSUE) are neutral: border `rgba(255,255,255,0.18)`, text `#BDBDBD`.

**Album-art tint** (album / now-playing screens only): derive the cover's dominant hue, then clamp it in OKLCH so text stays readable. Wash L 0.20, C ≤ 0.035. Deep L 0.13, C ≤ 0.022. Glow L 0.34, C ≤ 0.06. Accent L 0.90, C ≤ 0.035. The background is two radial gradients (wash at 26%/60% on desktop, 50%/34% on Android; deep at the bottom) over `#0B0B0C`. Secondary text must stay at WCAG AA or better. The New Releases page uses **no** tint.

### Glow recipes
- Glowing dot / knob: `#FFFFFF`, `box-shadow: 0 0 8–12px 2–3px rgba(255,255,255,0.45–0.55)`
- Glowing line: 1px `#FFFFFF`, `box-shadow: 0 0 6–8px rgba(255,255,255,0.7)`
- Playing / matched ring: `0 0 0 1px rgba(255,255,255,0.5), 0 0 32px -6px rgba(255,255,255,0.35)`
- Primary button hover: `background:#FFFFFF; box-shadow:0 0 32px -6px rgba(255,255,255,0.5)`
- Elevation (menus, toasts): `0 18–28px 40–60px -14–18px rgba(0,0,0,0.7–0.85)`

### Typography
- **General Sans** (Fontshare) at 300, 400, 500 and 600. Used for all UI text.
- **IBM Plex Mono** at 400 and 500. Used for metadata, counters, labels and timestamps: always UPPERCASE with letter-spacing 0.10–0.18em, sizes 9–12px (34px for large counters).
- **Noto Sans JP** for Japanese lyrics and titles.
- Scale: hero titles 64–84px (letter-spacing −0.035em, line-height 0.95); page titles 40px desktop / 30px Android (−0.02em); section titles 22–32px; body 14–16px; secondary 13px.
- Wordmark: "PELAGIC" set at letter-spacing 0.42em. The logo is the "Aperture" mark: a circle whose top half is a 1.5px stroke at white 90% and whose bottom half is at 18–22%, crossed by a horizontal white line that fades out at both ends, with a glowing dot below it.

### Shape and spacing
- Borders 1.5px for controls; 1px for separators.
- Radii: buttons 12px (not pills); icon buttons 10–12px; menu items 9px; cards/covers 10–12px; panels 14–20px; Android device 32px, sheets 24px top; chips and segmented controls 999px.
- Icons are a custom 24-grid line set with 1.25px stroke (see `pelagic-kit.js`). They render at **21px** inside buttons, 17–20px in rows and nav, 22px in Android tabs.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Hit targets on Android are at least 44px; primary Android buttons are 54px tall.

### Buttons and controls
- Primary: height 46 (44–54 on Android), padding 0 24px, `#EDEDED` background, `#0B0B0C` text, 15px/500.
- Secondary: same size, transparent, 1.5px `rgba(255,255,255,0.18)` border.
- Toggle: 40×22 track, 14px knob. When on: border `rgba(255,255,255,0.7)`, knob white with glow. When off: border 0.18 and knob `#55555A`.
- Segmented control: pill container with a 1.5px border at 0.12 and 3px padding. The selected segment uses background `rgba(255,255,255,0.16)`, box-shadow `inset 0 0 0 1px rgba(255,255,255,0.28), 0 0 14px -4px rgba(255,255,255,0.35)` and white 500-weight text.
- Filter chip: 34–36px tall pill. Selected: `#EDEDED` background with dark text. Unselected: 1.5px border at 0.12 with `#8A8A8E` text.
- Slider: 1px track, white fill, 12px glowing knob.

### Atmosphere layers (behind every screen, pointer-events none)
1. "Stone" fractal-noise texture, 900px tile, opacity 0.09.
2. Contour rings: smooth topographic lines, opacity 0.075. They **breathe in place** on a 26s ease-in-out loop (path morph); they never drift.
3. Grain: noise at 220px, opacity 0.07, `mix-blend-mode: screen`.
4. Marine snow: 15 particles by default (user-adjustable Off / Few 6 / 15 / More 32). Dots are 1.4–3.6px, with occasional blurred bokeh of 4–9px. Each drifts on a 16–38s sway loop.

With reduced motion, the particles are hidden and the contours are static. The generators are in `pelagic-kit.js` (`GRAIN`, `STONE`, `CONTOUR_SMOOTH`, `CONTOUR_LIVE`).

## Motion
Default ease is `cubic-bezier(.16,1,.3,1)`. Every animation respects `prefers-reduced-motion` and the in-app Motion setting (Follow system / Full / Reduced).

- **Sidebar active item:** the white background clips in as a circle from the icon centre, `clip-path: circle(0 → 160% at 22px 50%)`, over 1.5s `cubic-bezier(.22,1,.36,1)`. The icon tile turns black, with a white icon, after a 0.3s delay. Two thin rings (1px, starting at 40% opacity) scale 1 → 2.6 over 0.8s, the second 0.18s after the first. On deactivation the background contracts over 1s `cubic-bezier(.55,0,.6,.4)` and fades, while one faint echo ring (18% opacity) scales 1 → 2.
- **Toasts:** bottom centre of the main area (Android: above the mini-player). They enter with opacity plus a 20px rise over 0.6s (default ease) and leave over 0.35s ease. They last 4–5s, with one action at most (Undo, View, Play, Retry).
- **Panels / sheets:** desktop right panel 460px slides in over 0.8s; Android bottom sheet slides up from translateY(105%). Both sit over a scrim of `rgba(5,5,5,0.55–0.6)`.
- **Context menu:** scales from 0.96 at the click point, with opacity over 0.18s and transform over 0.28s. The submenu slides 8px.
- **Sonar ping (refresh / loading):** a 1px white ring scales 1 → 7–9 and fades from 0.6–0.75 over 3.2s `cubic-bezier(.15,.6,.35,1)`, with two rings offset by 1.6s. With reduced motion it is a static ring plus a live counter.
- **Skeleton shimmer:** `linear-gradient(100deg, #121214 30%, #222226 50%, #121214 70%)` at 250% size, over 2.8s.
- **Like heart:** a pop to 1.28× using `cubic-bezier(.34,1.56,.64,1)` over 0.35s.
- **First-run step change:** the current step fades and rises 48px over 0.55s with an ease-in. The next step enters from 56px below over 1.2s while fading in over 1s. The surface-light gradient dims step by step, and a depth marker descends through the ocean zones: EPIPELAGIC 0 M → MESOPELAGIC 200 M → BATHYPELAGIC 1,000 M → ABYSSOPELAGIC 4,000 M.

## Screens (where to find each in `Pelagic.dc.html`)
- **01–03:** wordmark (Aperture chosen), foundations (tokens), core components and their states.
- **04–05:** Home, Album (tinted wash, tracklist with download status), Now Playing (waveform seek), Android equivalents and lyrics.
- **06–07 (pass 2):** Sign-in, Library (Albums on desktop; Artists with mono monograms on Android), Artist (discography grouped by release type), Search (matched query text glows), Queue (drag to reorder, "Playing from" context).
- **08:** clickable Now Playing / Lyrics demo using Ado's "Show". The Queue and Lyrics buttons both toggle, and both panels can be open together. Romaji / English chips only appear while lyrics are shown.
- **09–10:** Playlist detail (2×2 mosaic cover, quality badges, added date, offline status), Upload (drop zone, per-file progress, matched-album tag panel), Downloads (storage bar, Wi-Fi-only switch, Opus vs Original FLAC choice).
- **11:** empty states (concentric rings, one line, one action), offline library (playable albums at full contrast, others greyscale at 40% opacity with a cloud badge), loading skeletons, toasts.
- **12 → `NewReleases.dc.html`:** daily MusicBrainz feed. Releases move new → seen → acquired → in library. Unseen cards carry a glowing dot. Seen cards drop to low contrast. "I've got it" shows MATCHING, then IN LIBRARY, which brings a full-contrast cover, a white ring and a play button. Also: filter chips (Albums / EPs / Singles on by default; Live and Other off), Show seen, a hero card, time groups (Upcoming with countdown, This week, Earlier this month, Older), a detail panel with a greyed tracklist and library matches, Followed artists (mute per artist, hide reissues), Android swipe gestures (right = seen, left = dismiss, tap = sheet), a generated fallback cover, and states for caught up / first sweep / offline / MusicBrainz error.
- **13 → `FirstRun.dc.html`:** desktop is sign in → link local folder (or "Stream from Drive instead") → catalogue loading with live counters. Android is sign in → notifications → offline choice (download everything / Wi-Fi as I go / later, with a storage bar) → loading, then download progress. Also: the Local library disconnected banner, No library on Drive, and Session expired.
- **14 → `Settings.dc.html`:** Account, Library, Playback (streaming quality, gapless, ReplayGain, crossfade, output), Downloads, New Releases, Lyrics, Atmosphere (which changes the background live), About. Every change saves instantly. Destructive actions confirm inline in red.
- **15 → `Actions.dc.html`:** right-click / ⋯ menus for tracks and albums, an Add to playlist submenu with search, a New playlist dialog, Track / Album info, and the Android long-press bottom sheet.
- **Liked Songs:** a heart button on every track row (outline `#55555A` → solid white). The Liked Songs playlist always appears first in playlist lists, shown as a white tile with a black heart and marked AUTO.

## State management (minimum)
- **Session:** signed-in Google account; expired → Sign in again.
- **Library source:** local folder path plus its connected status; streaming fallback toggle; last scan time and an in-progress flag.
- **Player:** current track, position, playing, queue (ordered list plus "Playing from" context), view (now playing / lyrics), queue panel open, romaji and English toggles.
- **Likes:** a set of track IDs feeding the Liked Songs playlist.
- **Downloads:** per track/album state (none / downloading with progress / done), quality, Wi-Fi only.
- **New releases:** per-release status (`new | seen | acquired | in_library | dismissed`), reminders, filters, show-seen, muted artists, hide-reissues, last sweep time, sweep state (idle / sweeping n of N / error with retry time).
- **Settings:** everything persisted locally and synced between devices.
- **Data sources:** Google Drive (catalogue DB and files), MusicBrainz plus Cover Art Archive (new releases, fallback when no art exists), local FS (desktop).

## Assets
- `art/*.jpg`: sample album covers used as stand-ins. Replace them with the user's real artwork.
- Icons and textures: generated in code in `pelagic-kit.js` (an SVG path list and feTurbulence data URIs). Port the icon paths to your icon system.
- Fonts: General Sans (Fontshare, free licence), IBM Plex Mono and Noto Sans JP (Google Fonts, OFL).

## Files
- `Pelagic.dc.html`: the master canvas (sections 01–15)
- `NewReleases.dc.html`, `FirstRun.dc.html`, `Settings.dc.html`, `Actions.dc.html`: embedded features, each clickable on its own
- `pelagic-kit.js`: icons, textures and contour generator
- `support.js`: runtime needed only to open the HTML references
- `art/`: sample covers
