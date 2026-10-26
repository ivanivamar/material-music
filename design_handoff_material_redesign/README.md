# Handoff: Neutral surfaces (Home tiles, player bar, Now playing)

## Overview
Removes the album-coloured gradient backgrounds from the Pelagic app. Surfaces that used to be tinted with the current album's hue (Jump back in tiles, the floating player bar on every screen, the Now playing screen and its queue/lyrics panels, the mix page header) now use the app's flat warm-neutral surfaces. Album colour survives only on small accents: the play button, progress bar, equaliser bars and small icons. Album artwork is now the main source of colour on screen.

The chosen direction is **neutral**. The design files also contain `tinted` (the previous look) and `mono` (no album colour at all, accents in white ink) for comparison only; implement `neutral`.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes showing intended look and behaviour, not production code to copy. Recreate the change in the app's existing codebase using its established patterns. In practice this is a theming change: find where the per-album scheme is applied to these surfaces and swap the values listed below.

## Fidelity
High-fidelity. Colours below are final.

## What changes

### 1. Jump back in tiles (Home, desktop and phone)
Before: `linear-gradient(100deg, oklch(0.29 0.05 H), oklch(0.225 0.02 H) 55%)` with hover/playing variants (H = album hue).
After, solid fills, no gradient:
- Rest: `oklch(0.20 0.007 40)` ≈ #221d1b
- Hover: `oklch(0.235 0.008 40)` ≈ #2b2624
- Currently playing: `oklch(0.25 0.01 40)` ≈ #302a27
- Title text: `oklch(0.94 0.006 40)` ≈ #efebe9
- Subtitle text: `oklch(0.79 0.014 40)` ≈ #c3bbb7
- Kind icon (album/playlist/radio…): stays album-tinted `oklch(0.80 0.09 H)`
- Equaliser (when playing): `oklch(0.86 0.10 H)`
- Hover play button: unchanged, `oklch(0.82 0.11 H)` fill, `oklch(0.26 0.06 H)` glyph
- Progress track: `oklch(0.36 0.01 40)`; fill `oklch(0.82 0.11 H)`
- Background transition: 200ms `cubic-bezier(0.31,0.94,0.34,1)` (unchanged)

DJ tile: same neutral fills as above (rest / hover / on air = playing value). The drifting violet blobs behind the on-air DJ tile are removed. Subtitle when on air stays lilac `oklch(0.84 0.09 290)`; title uses the neutral ink.

### 2. Floating player bar (desktop) and mini-player (phone)
Applies on every screen that shows it: Home, Library and search, New releases, Album, Artist, Playlist and Smart playlist. It is one shared component in the app; the design files each carry their own copy.
- Background: `oklch(0.20 0.007 40 / 0.86)` with the existing `backdrop-filter: blur(28px) saturate(1.5)`
- Rim (inset 1px): `oklch(0.34 0.01 40 / 0.7)` (was album-tinted)
- Title: `oklch(0.95 0.006 40)`; artist: `oklch(0.79 0.014 40)`
- Play/pause button and 3px progress line: unchanged album primary `oklch(0.82 0.11 H)`, glyph `oklch(0.26 0.06 H)`
- Outer shadow unchanged: `0 20px 48px -16px rgba(0,0,0,0.6)`

### 3. Now playing (full screen, desktop and phone)
- Screen background: `oklch(0.14 0.005 40 / 0.9)` with existing `backdrop-filter: blur(44px) saturate(1.4)`
- Rim: `oklch(0.34 0.01 40 / 0.6)`
- Text: on `oklch(0.95 0.006 40)`, secondary `oklch(0.80 0.014 40)`, dim `oklch(0.62 0.012 40)`
- Waveform track: `oklch(0.40 0.01 40 / 0.7)`; played portion stays `oklch(0.84 0.11 H)`
- Primary controls (play button, active toggles, quality chip): unchanged album primary
- Queue and lyrics panels: background `oklch(0.18 0.006 40 / 0.95)`, edge `oklch(0.40 0.01 40 / 0.4)`, hairlines `rgba(255,255,255,0.07)`
- "Now playing" row in the queue: was a tinted gradient; now solid `oklch(0.26 0.01 40)` (≈ #332d2a) with inset 1px `oklch(0.40 0.01 40 / 0.6)`. Shadow unchanged.
- Shade/scrim: `oklch(0.12 0.005 40 / 0.9)`; secondary bg `oklch(0.17 0.006 40)`; cards `oklch(0.22 0.008 40)`

### 4. Mix page header (Home → open a daily mix)
- Before: `linear-gradient(180deg, oklch(0.22 0.05 H), oklch(0.14 0.03 H))` plus three blurred drifting colour blobs.
- After: solid `oklch(0.145 0.005 40)`, blobs removed. Containers `oklch(0.26 0.01 40)`, tracks `oklch(0.36 0.01 40)`, text as in §3. Play button keeps album primary.

## Rule of thumb
Large areas: neutral warm-dark (hue 40, chroma ≤ 0.01). Album hue only on elements smaller than ~48px or 3px lines: play buttons, progress, equaliser, small icons. No gradients or blurred colour blobs behind content.

## Design Tokens (neutral)
- bg app `oklch(0.125 0.005 40)` · bg screen `oklch(0.14–0.145 0.005 40)`
- surface `oklch(0.20 0.007 40)` · hover `oklch(0.235 0.008 40)` · selected `oklch(0.25 0.01 40)` · raised `oklch(0.26 0.01 40)`
- outline `oklch(0.34 0.01 40)` · track `oklch(0.36–0.40 0.01 40)`
- ink `oklch(0.94–0.95 0.006 40)` · ink-2 `oklch(0.79–0.80 0.014 40)` · ink-3 `oklch(0.62 0.012 40)`
- album accents (unchanged): primary `oklch(0.82–0.84 0.11 H)`, on-primary `oklch(0.26 0.06 H)`

## Files
- `HomeMaterial.dc.html`: Home (tiles, player bar, mix page). See `surf()`, `flat()`, and the tile mapping in `renderVals()`.
- `NowPlayingMaterial.dc.html`: Now playing, queue, lyrics. See `flat()` and `scheme()`.
- `LibraryMaterial.dc.html`, `NewReleasesMaterial.dc.html`: player bar only (see the `Object.assign(ps, …)` override in `renderVals()`).
- `AlbumMaterial.dc.html`, `ArtistMaterial.dc.html`, `PlaylistMaterial.dc.html`, `SmartPlaylistMaterial.dc.html`: player bar only (override on `const ps = …`).

Not changed: the DJ screen. Its lilac DJ button tint is the DJ's identity colour and stays.
- `PlaylistDialog.dc.html`, `ripple.js`, `support.js`, `art/`: dependencies so the files open in a browser.

Open any `.dc.html` file directly in a browser. Home and Now playing take a `surface` prop (`tinted` | `neutral` | `mono`, default `neutral`).
