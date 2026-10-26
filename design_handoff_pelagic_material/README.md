# Handoff: Pelagic, Material 3 Expressive redesign (desktop + Android)

## Overview
Full redesign of the Pelagic music player in Material 3 Expressive, for desktop (1440 × 900, down to 1180 × 760) and Android phones (412 × 892, down to 360 × 780). It covers every screen: first run and sign-in, Home, Library and search, Artist / Album / Playlist / Smart playlist, playlist dialogs, New releases, Now playing (player, queue, lyrics), DJ, Upload, Downloads, Settings, the Android widget, and the app icon.

Start with `Pelagic Overview.dc.html`: it shows every screen and state in the order people meet them, grouped into sections 01–10. Every screen is interactive.

## About the design files
The files in this bundle are **design references created in HTML**: prototypes showing intended look and behaviour, not production code to copy. Recreate them in the app's existing codebase (its framework, component library and patterns). If there is no codebase yet, pick the most suitable framework and implement the designs there. Each `.dc.html` opens directly in a browser (keep `support.js`, `ripple.js` and `art/` next to them). Layout and copy live in the template; data, state and computed colours live in the `renderVals()` logic of each file.

## Fidelity
High-fidelity. Colours, type, spacing, radii, copy and interactions are final.

## Screens (section → file)
- **01 First run**: `FirstRunMaterial.dc.html`. Desktop and phone setup flow (Sign in with Google, pick library folder, scan), no library yet, session expired.
- **02 Home**: `HomeMaterial.dc.html`. Greeting, Jump back in tiles, DJ tile, Made for you (daily mixes), Radio for you, Recently added, Your artists, Smart playlists, Rediscover; yearly recap shelf (`recap` prop, 18 Dec – 31 Jan). States: loading, early history, DJ on air, right-click menu / long-press sheet, mix page, expired mix link, saved toast. Contains the shared sidebar, top bar and floating player bar.
- **03 Library and search**: `LibraryMaterial.dc.html`. One mixed grid with filter chips (All, Albums, Artists, Songs), sort menu / sheet, grid and timeline views, search (recent, live results, scoped, no matches).
- **03 Detail pages**: `ArtistMaterial.dc.html`, `AlbumMaterial.dc.html`, `PlaylistMaterial.dc.html`, `SmartPlaylistMaterial.dc.html`. Each with loading, empty and offline states on phone.
- **04 Playlists**: `PlaylistDialog.dc.html`. New playlist, Add to playlist (dialog on desktop, sheet on phone), smart playlist rule builder with limit.
- **05 New releases**: `NewReleasesMaterial.dc.html`. Upcoming (countdowns), Out now (swipe rows on phone), Discover.
- **06 Now playing**: `NowPlayingMaterial.dc.html`. Player, queue panel / sheet, lyrics (romaji and English translation).
- **07 DJ**: `DJMaterial.dc.html`. Start, intro while speaking, song in a session, player with DJ off. DJ colour is violet (hue 290).
- **08 Upload and downloads**: `UploadMaterial.dc.html` (batch upload sorted by tags, drop overlay, empty) and `DownloadsMaterial.dc.html`.
- **09 Settings**: `SettingsMaterial.dc.html`. Account (sign in / out), Library (local folder, Drive fallback, rescan), Playback (streaming quality, gapless, normalisation, crossfade, output, lock-screen controls), Downloads (quality, Wi-Fi only, storage, clear), New releases (MusicBrainz sweep, notifications, followed artists), Lyrics, DJ (voice intros, volume, session types, what the DJ has learned), Atmosphere (motion, texture), About.
- **10 Android widgets**: `WidgetMaterial.dc.html`. One resizable widget, 1×1 to 4×4, playing / nothing playing / paused / DJ on air. Build with Jetpack Glance (`SizeMode.Responsive`). Colour comes from the playing album, violet while the DJ is on.
- **App icon**: `Pelagic Icon v2.dc.html`, option **2b "Ink on coral"** is the chosen icon. Coral gradient tile `oklch(0.82 0.11 40)` → `oklch(0.75 0.13 34)`, lighter burst `oklch(0.86 0.09 42)` rotated 10°, dark-ink note `oklch(0.24 0.04 35)`. Use it wherever the logo appears (desktop sidebar, phone top bar, launcher, store). Do not use the older coral square with a cookie shape.

## Neutral surfaces (latest change)
Album colour no longer tints large surfaces. Jump back in tiles, the floating player bar on every screen, Now playing with its queue and lyrics panels, and the mix page header use flat warm neutrals. Album hue stays only on small accents: play buttons, progress lines, equaliser bars, small icons. No gradients or blurred colour blobs behind album-driven content.

- Jump back in / DJ tile: rest `oklch(0.20 0.007 40)`, hover `oklch(0.235 0.008 40)`, playing / on air `oklch(0.25 0.01 40)`. Title `oklch(0.94 0.006 40)`, subtitle `oklch(0.79 0.014 40)`. Kind icon `oklch(0.80 0.09 H)`, equaliser `oklch(0.86 0.10 H)`, play button `oklch(0.82 0.11 H)` with glyph `oklch(0.26 0.06 H)`. No violet blobs behind the on-air DJ tile.
- Player bar / mini-player: `oklch(0.20 0.007 40 / 0.86)` + `backdrop-filter: blur(28px) saturate(1.5)`, inset 1px rim `oklch(0.34 0.01 40 / 0.7)`. Play button and 3px progress keep album primary.
- Now playing: background `oklch(0.14 0.005 40 / 0.9)` + `blur(44px) saturate(1.4)`, rim `oklch(0.34 0.01 40 / 0.6)`; text `oklch(0.95 0.006 40)` / `oklch(0.80 0.014 40)` / `oklch(0.62 0.012 40)`; waveform track `oklch(0.40 0.01 40 / 0.7)`, played part `oklch(0.84 0.11 H)`. Queue / lyrics panels `oklch(0.18 0.006 40 / 0.95)`, edge `oklch(0.40 0.01 40 / 0.4)`. Queue "now playing" row solid `oklch(0.26 0.01 40)`.
- Mix page header: solid `oklch(0.145 0.005 40)`, no blobs.

H = the playing album's hue. Home and Now playing take a `surface` prop (`tinted` | `neutral` | `mono`) for comparison; implement `neutral`.

## Design tokens
- **Type**: Google Sans Flex 400/500/600/700 (UI), JetBrains Mono 400/500 (technical labels, formats like "FLAC 16/44.1"). Icons: Material Symbols Rounded (opsz 24, wght 400, FILL 0/1).
- **Neutrals (hue 40)**: app bg `oklch(0.12 0.004 40)`, screen `oklch(0.14–0.145 0.005 40)`, surface `oklch(0.20 0.007 40)`, hover `oklch(0.235 0.008 40)`, selected `oklch(0.25 0.01 40)`, raised `oklch(0.26 0.01 40)`, outline `oklch(0.34–0.38 0.01 40)`, track `oklch(0.36–0.40 0.01 40)`.
- **Ink**: `oklch(0.94–0.95 0.006 40)`, secondary `oklch(0.79–0.80 0.014 40)`, tertiary `oklch(0.62 0.012 40)`.
- **Brand coral**: `oklch(0.80 0.115 38)` (links, brand accents, Settings / Downloads / Upload / First run header glow and dot texture), hover `oklch(0.88 0.08 38)`.
- **Album accents**: primary `oklch(0.82–0.84 0.11 H)`, on-primary `oklch(0.26 0.06 H)`, container `oklch(0.30 0.06 H)`.
- **DJ violet**: hue 290, e.g. container `oklch(0.34 0.08 290)`, light `oklch(0.84 0.09 290)`.
- **Shape**: Material 3 Expressive rounded shapes; cards and panels 28px radius, player bar 28px, pills 999px. Read exact radii from each file.
- **Motion**: standard easing `cubic-bezier(0.31,0.94,0.34,1)`, ~200ms surface transitions; ripple on press (`ripple.js`). Respect reduced motion (Settings → Atmosphere → Motion).

## Rules
- There is no like / favourite feature. Never add heart or like buttons.
- Logo is always the "Ink on coral" icon (2b).

## Files
`Pelagic Overview.dc.html` (index), the screen files listed above, `PlaylistDialog.dc.html`, `ripple.js`, `support.js` (runtime for opening the files), `art/` (sample album covers).
