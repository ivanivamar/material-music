# Handoff: Pelagic — Android Home Screen Widget (Now Playing)

## Overview
A single resizable "Now playing" widget for the Android home screen. It shows the current track, transport controls and (at larger sizes) the queue. The layout switches at each grid size, from a 1×1 album tile up to a 4×4 player with queue.

## About the Design Files
The files in this bundle are **design references built in HTML** — prototypes of the intended look and behavior, not production code. Recreate them natively in the Android app, using **Jetpack Glance** (`GlanceAppWidget` + `SizeMode.Responsive` / `SizeMode.Exact`) or RemoteViews if the app doesn't use Glance yet. Open `Android Widgets.dc.html` in a browser to see every size, state and the live resize demo. `MusicWidget.dc.html` holds the widget itself (all layout logic is in its `renderVals()`).

## Fidelity
**High-fidelity.** Final colors, type, spacing and states. Match pixel values (given in dp, 1 css px = 1 dp).

## Grid & sizes
Cell = 80dp, gap = 16dp. Span(n) = n·80 + (n−1)·16.

| Span | dp |
|---|---|
| 1 | 80 |
| 2 | 176 |
| 3 | 272 |
| 4 | 368 |

Layout mode by (cols c, rows r):
- **c = 1** → Album tile (any rows)
- **c = 2, r = 1** → Compact
- **c = 2, r ≥ 2** → Cover
- **c ≥ 3, r = 1** → Bar (prev button only when c = 4)
- **c ≥ 3, r = 2** → Player (default size: 4×2, 368×176)
- **c ≥ 3, r ≥ 3** → Player + queue. Queue rows = `floor((H − 222) / 44)` → 4×3 shows 1 row, 4×4 shows 3.

Recommended `appwidget-provider`: `targetCellWidth=4`, `targetCellHeight=2`, `minResizeWidth/Height` = 1 cell, `maxResize` = 4×4, `resizeMode="horizontal|vertical"`. In Glance, map `LocalSize` to the modes above using the dp thresholds (≥272 wide = 3+ cols; height 80/176/272/368).

## Container (all sizes)
- Corner radius **24dp** (use `system_app_widget_background_radius` where available, fall back to 24).
- Inner hairline: 1dp `rgba(255,255,255,0.08)`. Drop shadow is canvas-only; launcher provides elevation.
- Overflow clipped.

### Background — "tinted" (default)
Layered, bottom to top:
1. Base fill `#0B0B0C` (same as app background).
2. **Album light**: the current cover image, blurred 48dp, saturation ×1.3, placed top-left (left −30%, top −60%, 110% × 160% of widget), opacity **0.42 playing / 0.22 paused** (fade 600ms on change).
3. Darkening scrim: radial gradient anchored bottom-right (120%×110%): `#0B0B0C` at 25% → `rgba(11,11,12,0.6)` at 60% → transparent at 100%. Light pools in the top-left, bottom-right stays app-dark.
4. App texture (same as app screens, from `pelagic-kit.js`): STONE noise @ 0.09 opacity (900dp tile), CONTOUR lines @ 0.075 (1600×1000dp tile, offset varies per widget), GRAIN @ 0.035 (220dp tile).

Implementation note: blur isn't available in RemoteViews. Pre-render the background as a bitmap when the track changes (blur the cover with RenderEffect/Toolkit, composite layers 1–4 at widget size) and set it as the widget background image. Cache per track + size bucket. Textures can be shipped as static PNG drawables.

### Background — "dark" (alternative theme)
Flat `#141416`, no light or texture.

## Layouts

### Album tile (1×1, 80×80)
- Cover full-bleed, `object-fit: cover`. Opacity 1 playing / 0.62 paused.
- Bottom scrim: linear 180° transparent 40% → `rgba(5,5,5,0.55)`.
- Playing: EQ badge top-left at (10,10), height 20, padding 0 6, radius 6, bg `rgba(5,5,5,0.8)`.
- Play/pause button: 36dp circle, bottom-right inset 8, bg `#EDEDED`, icon `#0B0B0C` 16dp.
- 1.5dp progress hairline along bottom (see Progress).

### Compact (2×1, 176×80)
- Row, padding 0 12 0 16, gap 10, vertically centered.
- Text column (flex 1, gap 4): status label (mono 9, tracking 0.14em, with EQ), title (14 / 500), artist (12, `#8A8A8E`). All single-line ellipsis.
- Play/pause 44dp circle.
- Bottom progress hairline.

### Cover (2×2+, 176×176)
- Cover full-bleed.
- Scrim: linear 180° `rgba(5,5,5,0.35)` 0% → transparent 30% → transparent 42% → `rgba(8,8,10,0.92)` 100%.
- Status chip top-left (12,12): height 22, padding 0 8, radius 7, bg `rgba(5,5,5,0.72)`, mono 9 / 0.14em, EQ + "PLAYING".
- Bottom row inset 14 left/bottom, 12 right: title (15 / 500), artist (12, `#BDBDBD`), play/pause 44dp at right, gap 10.
- Bottom progress hairline.

### Bar (3×1 / 4×1, ×80)
- Row, padding 0 10 0 16, gap 12.
- Cover 48dp, radius 10, hairline ring `rgba(255,255,255,0.08)`.
- Title (15 / 500) + EQ inline, artist (12, `#8A8A8E`).
- Controls (gap 2): prev (40×44, icon 20; 4-col only), play/pause 44 circle, next (40×44, icon 20).
- Bottom progress hairline.

### Player (4×2, 368×176)
- Padding 16, row gap 16.
- Cover: full inner height (144dp) square, radius 14, ring + glow shadow `0 20 40 -20 oklch(0.34 0.06 hue / 0.9)`.
- Right column, space-between:
  - Top (gap 6): status label mono 9 / 0.14em (EQ + "PLAYING"/"PAUSED"/"DJ · ON AIR"), title 18 / 400 / −0.01em, artist 13 `#8A8A8E`.
  - Bottom (gap 6): scrubber (see Progress), then controls row: like (40×44, icon 19) left; prev / play-pause 44 / next right.

### Player + queue (4×3, 4×4)
- Padding 16, column gap 12.
- Header row (align bottom, gap 14): cover 88dp radius 14 + glow; text: label (mono 9, full: "PLAYING FROM TSUNAMI SEA"), title 22 / 400 / −0.015em, artist 14 `#8A8A8E`.
- Scrubber + times row (mono 10, `#8A8A8E`, "01:14" / "03:46").
- Controls, space-between, 44 targets: shuffle, prev (icon 22), play/pause **52dp**, next, like.
- Queue: top border 1dp `rgba(255,255,255,0.08)`, padding-top 4. Rows 44 tall: 32dp art radius 6, title 13, artist 11 `#8A8A8E`, trailing mono 9 `#55555A` "NEXT" / "+2" / "+3". Tap a row to play it.

## Progress
- **Hairline** (small sizes): full-width 1.5dp at bottom, track `rgba(255,255,255,0.12)`, fill accent with `0 0 6 accentGlow`.
- **Scrubber** (player sizes): 1dp track `rgba(255,255,255,0.18)`, 1dp fill accent, 5dp dot at head with `0 0 8 2 accentGlow`.
- Widget doesn't need per-second updates; update on play/pause/track change and let the launcher show a static position, or use Glance with a ~30s refresh while playing. (The prototype ticks every second for demo purposes.)

## States
- **Playing**: cover opacity 1, album light 0.42, label `#BDBDBD`, EQ bars animate, pause icon.
- **Paused**: cover opacity 0.62, album light 0.22, label `#8A8A8E` "PAUSED", no EQ, play icon.
- **DJ on air**: accent switches to lilac `rgb(198,180,242)` — play button bg, progress fill/dot, label, EQ, active like/shuffle. Glow `rgba(198,180,242,0.6)`. Label "DJ · ON AIR" (full: "DJ · ON AIR · 3/7").
- **Like / shuffle active**: icon colored accent; inactive `#8A8A8E`. Like uses filled heart when on.
- **Reduced motion**: EQ bars static.
- **Nothing playing (idle)**: see the dedicated section below.

## Nothing playing (idle)
Shown when there is no active session (first run, queue cleared, or session expired). Background: tinted surface **without** the album light layer (layers 1, 3, 4 only — light opacity 0). No progress hairline. All layouts use the Pelagic mark (20dp: top half-ring 1.5dp `rgba(255,255,255,0.9)`, bottom half-ring 1.5dp `rgba(255,255,255,0.22)`, 1dp white horizon line extending 5dp past each side).

Tapping any start action begins playback and the widget switches to the Playing layout for its size.

- **1×1**: mark at 28dp centered (horizon line with `0 0 6 rgba(255,255,255,0.6)` glow); mono 8 / 0.16em "PLAY" `#8A8A8E` centered 10dp from bottom. Whole tile = resume last album.
- **2×1**: no mark. Text column (gap 4): mono 9 "NOT PLAYING" `#8A8A8E`, last album title 14 / 500 ("Tsunami Sea"), "Tap to resume" 12 `#8A8A8E`. Play button 44 `#EDEDED` → resume.
- **2×2**: padding 16, space-between. Top: mark + mono 9 / 0.16em "NOTHING PLAYING". Bottom: "Good evening" 17 / 400 (time-of-day greeting), "Resume Tsunami Sea" 12 `#8A8A8E`; row gap 8: play 44 (resume) + DJ pill (flex 1, 44 tall, radius 22, bg `rgba(198,180,242,0.1)`, inset ring 1dp `rgba(198,180,242,0.4)`, lilac 5dp dot with glow + mono 10 / 0.16em "DJ").
- **4×1 / 3×1**: 48dp box (radius 10, inset ring `rgba(255,255,255,0.12)`) holding the mark; "Nothing playing" 15 / 500, "Resume Tsunami Sea" 12 `#8A8A8E`; DJ pill (36 tall, padding 0 14, 4-col only) + play 44.
- **4×2**: padding 16, gap 10. Header: mark + mono "NOTHING PLAYING". Grid 3 cols, gap 8, square tiles radius 14: **Resume** (last album cover), **DJ**, **Daily Mix 1**. Cover tiles: art full-bleed + scrim (transparent 35% → `rgba(8,8,10,0.9)`), title 13 / 500, sub mono 8 / 0.14em `#BDBDBD` ("RESUME", "MADE FOR YOU"). DJ tile: bg radial `rgba(198,180,242,0.18)` → `0.04`, ring `rgba(198,180,242,0.35)`, 28dp lilac ring mark with glow at 38% height, title "DJ", sub "TAP TO START" in lilac.
- **4×3**: as 4×2 plus greeting "Good evening" 20 / 400 under the label, and a bottom **Shuffle library** row: 44 tall, radius 14, bg `rgba(255,255,255,0.04)`, ring `rgba(255,255,255,0.08)`, shuffle icon 18, label 14, trailing mono 9 "3,912 SONGS".
- **4×4**: six tiles (2 rows): Resume, DJ, Daily Mix 1, Ado Radio, Daily Mix 2, Rediscover (sub "LAST PLAYED JUN").

Data: last played album, today's daily mixes, a top-artist radio, a rediscover pick, library song count, all supplied by the app when the widget updates.

## Interactions
- Tap play/pause → toggle playback (PendingIntent / Glance `actionRunCallback` to the media service).
- Prev / next → skip. Like → toggle favourite. Shuffle → toggle.
- Tap anywhere else (cover, text) → open full-screen player.
- Tap queue row → play that track.
- EQ animation: 3 bars, `scaleY 0.3 → 1 → 0.3`, ease, staggered (see `home-kit.js` `eq()`); in a native widget, use an AnimatedVectorDrawable or omit.

## Design tokens
- Background `#0B0B0C`; alt surface `#141416`
- Text primary `#EDEDED`, white `#FFFFFF`, secondary `#BDBDBD`, muted `#8A8A8E`, faint `#55555A`
- Hairlines `rgba(255,255,255,0.08)` / `0.12` / `0.18`
- Play button `#EDEDED` with icon `#0B0B0C`
- Accent DJ lilac `rgb(198,180,242)`
- Cover glow `oklch(0.34 0.06 <cover hue> / 0.9)`
- Radii: widget 24, large art 14, small art 10, queue art 6, chips 6–7
- Type: **General Sans** (titles/body; Noto Sans JP fallback for Japanese titles), **IBM Plex Mono** (labels, times — uppercase, 9–10sp, tracking 0.14–0.16em)
- Touch targets ≥ 44dp (40×44 for secondary transport buttons)

## Assets
- Album art in `art/` (sample library covers used in the prototype).
- Icons: 24-grid line icons, 1.25 stroke, defined in `pelagic-kit.js` (`playF`, `pauseF`, `prev`, `next`, `shuffle`, `heart`, `heartF`). Convert to vector drawables.
- Textures (STONE, CONTOUR, GRAIN): SVG filter data URIs in `pelagic-kit.js`; export as PNG tiles.

## Files
- `Android Widgets.dc.html` — presentation board: home screen composition, resize demo, all sizes, states. Tweaks: theme (tinted/dark), motion.
- `MusicWidget.dc.html` — the widget. Props: `cols`, `rows`, `state` (playing/paused/dj/idle), `theme`, `track`, `motion`, `live`.
- `pelagic-kit.js`, `home-kit.js` — shared icons, textures, EQ animation.
- `support.js` — runtime needed to open the HTML files.
