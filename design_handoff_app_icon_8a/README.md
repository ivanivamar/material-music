# Pelagic app icon — 8a "Play & disc, dark"

The final Pelagic app icon. Use it everywhere the app logo appears (launcher icon, desktop sidebar, phone top bar, splash, notifications fallback). It replaces all earlier icons (the "Ink on coral" burst/note and the cookie/porthole marks) — remove those.

## About the design files
The files here are design references. `Icon Preview.dc.html` is an HTML preview of the icon at several sizes. The SVGs are production-ready vector sources. Recreate the icon in the target codebase's native format (Android adaptive icon / VectorDrawable, iOS asset catalog, web favicon/PWA icons) using these SVGs; don't ship the HTML.

## Fidelity
High-fidelity. Geometry and colours below are final.

## Files
- `pelagic-icon.svg` — full icon including the dark tile background (square, unmasked; the platform applies the corner shape).
- `pelagic-icon-foreground.svg` — same artwork without the tile, for adaptive-icon foreground layers.
- `Icon Preview.dc.html` — visual reference at 376 / 96 (circle) / 64 / 40 px.

## Construction (100 × 100 grid)
Layers, back to front. Every layer except the tile has the same soft drop shadow.

1. **Tile** — vertical linear gradient, top `oklch(0.23 0.014 40)` #231b18 → bottom `oklch(0.16 0.01 40)` #110c0a.
2. **Play triangle** — points (24,16), (24,84), (84,50), corners rounded with radius 9 (quadratic curves). Fill `oklch(0.64 0.18 30)` #e55745.
3. **Amber ring** — circle centre (43,50), r 21. Fill `oklch(0.86 0.14 80)` #ffc65a.
4. **Coral disc** — circle centre (43,50), r 15. Fill `oklch(0.75 0.15 42)` #fc8b5d.
5. **Note** — group at translate(43,49) scale(0.8), fill `oklch(0.98 0.008 70)` #fcf8f3:
   - head: circle (-2.5, 9) r 6
   - stem: rect x -0.5, y -12, w 4, h 21, rx 1
   - flag: rect x -0.5, y -12, w 10, h 5.5, rx 1

**Shadow** — offset (0, 1.4), blur stdDeviation 1.3, #000 at 55% opacity (grid units; scale with icon size). On platforms without per-layer shadows (e.g. VectorDrawable), bake the shadows into a raster or drop them; the icon still reads correctly flat.

## Colour tokens
| Token | oklch | Hex (sRGB) |
|---|---|---|
| tile-top | oklch(0.23 0.014 40) | #231b18 |
| tile-bottom | oklch(0.16 0.01 40) | #110c0a |
| play-red | oklch(0.64 0.18 30) | #e55745 |
| ring-amber | oklch(0.86 0.14 80) | #ffc65a |
| disc-coral | oklch(0.75 0.15 42) | #fc8b5d |
| note-white | oklch(0.98 0.008 70) | #fcf8f3 |

## Masks & sizes
- Launcher: square artwork; the OS mask (squircle, circle, rounded square) is applied by the platform. In-app logo uses a 30% corner radius.
- Android adaptive icon: background = tile gradient, foreground = `pelagic-icon-foreground.svg`. The artwork already sits within the central ~66% safe zone.
- Export PNGs from `pelagic-icon.svg` at 1024, 512, 192, 180, 48, 32 px as needed.
- Small sizes (≤ 40 px): keep the note; don't simplify.

## Don'ts
- No heart/like or other extra glyphs.
- Don't recolour layers or swap the light (cream) tile in; the dark tile is the chosen version.
