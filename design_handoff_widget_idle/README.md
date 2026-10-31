# Handoff: Pelagic Android widget — Idle state

## Overview
Redesign of the home-screen widget's **idle state** (nothing playing). Goals: show more useful content (resume + quick-start actions + recents), keep the app identity visible, and leave a large tap area that opens the app normally.

## About the Design Files
The files here are **design references built in HTML**, not production code. Recreate them in the Android codebase using its existing widget stack (Jetpack Glance / RemoteViews, Material 3). `WidgetMaterial.dc.html` opens directly in a browser; use its `state` prop = `idle` and `cols`/`rows` props (1–4) to preview each size. Playing/paused/DJ states in that file are unchanged and out of scope.

## Fidelity
**High-fidelity.** Final colors, type, spacing, radii and interactions.

## Grid & sizing
- Cell unit 80dp, gutter 16dp → width = cols·80 + (cols−1)·16, height likewise (4×2 = 368×176dp).
- Container: radius 28dp, background `bg`, 1.5dp inner rim `rim` (55% alpha) + 1dp top highlight white 14%, drop shadow `0 18 40 −18 rgba(0,0,0,.7)`.
- Decoration (unchanged from other states): dot grid top-right (W ≥ 176), faint ring bottom-left (W ≥ 368 & H ≥ 176).

## Core interaction rule
- **The whole widget background opens the app** (launch main activity). Every element that isn't a button is part of that hit area.
- Buttons (play, DJ, Daily mix, Shuffle, search, recent rows) handle their own tap and must **not** also trigger open-app.
- Prototype shows a 1.1s "Opening Pelagic…" overlay (logo 28dp + label, 13sp/600 `onVar`) as tap feedback — on device the system launch animation replaces this.

## Layouts by size

### 1×1 (80×80)
- App icon 40dp, radius 12, at top-left (12,12).
- Play button 36×36, radius 12, `primary` / icon `onPrimary` 22dp, bottom-right inset 6 → resumes last session.

### 2×1 (176×80)
- Padding 12, row, gap 12.
- Album art 56dp radius 16 with glow, 28% black scrim, centered 32dp circular `primary` play badge (icon 20). **Whole art = resume button.**
- Text: tiny icon 14dp (radius 4) + "Pelagic" 11sp/600 `onVar`; title "Soft Spine" 14sp/600, 20 lh, ellipsize.

### 2×2 (176×176)
- Padding 14 top / 16 sides+bottom; column, space-between.
- Header (24 high): icon 22dp radius 6, gap 8, "Pelagic" 13sp/600.
- Middle row space-between, bottom-aligned: art 64dp radius 16 + glow; play button 56dp radius 16 `primary`, icon 28.
- Bottom: "Soft Spine" 14sp/600; "Resume · Spiritbox" 12sp `onVar`.

### 3×1 / 4×1 (272/368×80)
- Padding 12 / 12 / 12 / 16, row, gap 12.
- App icon 40dp radius 12.
- Text column (flex): "Resume" 11sp/600 +0.04em `primary`; "Soft Spine" 14sp/600; "Spiritbox" 12sp `onVar`.
- DJ button 48dp circle, bg `djBg`, 1dp inner `djRim` (45%), knob glyph 24dp `djKnob`.
- Play button 56dp radius 16 `primary`, icon 28.

### 3×2 / 4×2 (272/368×176) — primary size
Padding 14 top / 16 sides+bottom; column, gap 10.
1. **Header** (24 high): icon 22dp r6, gap 8, "Pelagic" 13sp/600, spacer, search icon button 32dp circle (outlined `search` 20dp, `onVar`, right margin −6) → opens app to search.
2. **Resume row** (gap 12): art 64dp r16 + glow · text column: "Resume · 2:29 left" 11sp/600 +0.04em `primary`; "Soft Spine" 16sp/600 lh22; "Spiritbox · Tsunami Sea" 12sp `onVar`; progress 3dp radius 2, track `track`, fill `primary` (34%), 6dp top margin · play button 56dp r16 `primary`.
3. **Chip row** (gap 8, each chip flex 1, height 40, pill, padding 0 12 0 8, gap 8, 13sp/600):
   - **DJ** — bg `djBg`, rim `djRim` 45%, text `djFg`, knob glyph 24dp `djKnob`. Hover/pressed `djBgHover`.
   - **Daily mix** — 4-col only. bg `high` (72% alpha), rim `rim2` (28%), 24dp circular cover art.
   - **Shuffle** — bg `high`, rim `rim2`, `shuffle` icon 20dp in `primary`.
   Tap = start that playback immediately.

### 3×3 / 4×3 / 3×4 / 4×4
Same as 4×2, plus a **Recents list** filling the rest: 1dp top divider `rim2`, 4dp top padding.
- Rows: height 44 (r=3) / 46 (r=4), extend 8dp past content edges with 8dp padding, radius 12, pressed bg `high`.
- Row: art 36dp r10 · title 14sp/500 · subtitle 12sp `onVar` · trailing `play_arrow` 22dp `onVar`.
- Items (r=3 shows first 2, r=4 shows 4): Ado radio / Radio · Daily mix 2 / Made for you · Rediscover / Last played in June · Under Blue / Eve · Album.

## Interactions & Behavior
- Resume / chip / recent row tap → start playback and switch widget to the playing state (existing layouts).
- DJ → start DJ session (widget switches to DJ/purple scheme).
- Shuffle → shuffle whole library.
- Background, header, text, art (except 2×1) → open app.
- Hit targets: all buttons ≥ 48dp touch area (1×1 play has 6dp extended touch slop).
- No like/favourite actions anywhere.

## State
- `idle` (no active session) chooses these layouts; any action sets playing state with the chosen track/source.
- Data needed: last session (track, artist, album, art, position → "x:xx left", progress %), daily mix art, recents list (2–4).

## Design Tokens (idle uses warm hue 38)
| token | oklch | hex |
|---|---|---|
| bg | 0.155 0.014 38 | #120a08 |
| high (×0.72 alpha) | 0.25 0.035 38 | #301c15 |
| on | 0.95 0.015 38 | #f8ebe7 |
| onVar | 0.80 0.03 38 | #d0b8b0 |
| primary | 0.84 0.09 38 | #ffb7a0 |
| onPrimary | 0.25 0.06 38 | #39160a |
| track | 0.40 0.05 38 | #5f3e34 |
| rim (×0.55) | 0.62 0.09 38 | #b5735e |
| rim2 (×0.28) | 0.60 0.07 38 | #a57262 |
| djBg | 0.30 0.07 290 | #2e274e |
| djBgHover | 0.34 0.08 290 | #382f5e |
| djRim (×0.45) | 0.60 0.10 290 | #7f75b8 |
| djFg | 0.95 0.02 290 | #eeedfb |
| djKnob | 0.84 0.09 290 | #c9c1ff |

- Art glow: `0 0 0 1px rgba(255,255,255,.1), 0 14 26 −12 oklch(0.55 0.12 38 / .9)` (#ab553a).
- Radii: 28 widget · 16 art/play · 12 small buttons/rows · 6 header icon · pill chips.
- Type: Google Sans Flex (fallback system sans) — 16/22 600, 14/20 600|500, 13/20 600, 12/16 400, 11/16 600 +0.04em.
- Icons: Material Symbols Rounded, filled (search outlined).

## Assets
- `art/pelagic-icon.svg` — app icon "Play & disc, dark" (the only approved logo).
- `art/*.jpg` — placeholder album covers.
- DJ knob glyph: 8-lobe rounded knob with notch, generated in `knob()` in the prototype logic; use the app's existing DJ glyph.

## Files
- `WidgetMaterial.dc.html` — prototype (all states/sizes; set `state: idle`).
- `support.js`, `ripple.js` — prototype runtime only.
