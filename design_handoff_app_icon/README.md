# Handoff: Pelagic app icon ("Porthole")

## Overview
New app icon for Pelagic, replacing the "Aperture" icon. It shows a submarine porthole: a bevelled metal rim with rivets, a dark glass window, and a glowing white equaliser with its reflection inside. It stays grayscale like the rest of the app, with white glow as the only accent and light coming from the top left.

The Aperture mark stays as the in-app wordmark logo. This handoff covers only the launcher, dock and store icon.

## About the design files
The files here are **design references made in HTML**. They show what the icon should look like, but they are not production assets. Produce the real assets from them in the target pipeline: export SVG/PNG masters, then build the platform icon sets (Android adaptive icon, Windows/macOS/Linux desktop icons, favicon). `PortholeIcon.dc.html` is a parametric SVG and is the source of truth for geometry. Open it in a browser (it needs `support.js` next to it) or read the SVG markup and logic directly.

## Fidelity
**High fidelity.** All geometry is integer on a 1024 × 1024 canvas. Copy the coordinates, radii, colours and opacities exactly.

## Variants
- **Full**: for 64 px and above (store listing, desktop, Android launcher at xxhdpi and up).
- **Small**: for 48 px and below (favicon, taskbar, small launcher densities, notification contexts). It has 8 larger rivets and 5 wider bars, drops the particles, second light ray and second glass highlight, and uses a thicker highlight stroke.
- **Shape**: squircle (`rx 236` on 1024) or circle (`rx 512`, for Android round masks). The artwork is the same in both. The rim fits inside the 904 px safe area, so it also survives Android adaptive masks.

## Geometry (1024 canvas, centre 512,512)
Layers listed bottom to top:

1. **Tile**: rect 1024, rx 236 (circle: 512). Vertical linear gradient `#17171A` → `#08080A`.
2. **Rim cast shadow**: circle r 452 centred at (512, 522), stroke `#000` 55% opacity, width 20, Gaussian blur 10.
3. **Rim**: circle r 405, stroke width 94, so the rim runs from r 358 to r 452. Diagonal gradient from top left (0.15, 0.1) to bottom right (0.85, 0.9): `#7C7C82` 0, `#2E2E32` 0.45, `#232326` 0.72, `#505056` 1.
4. **Outer bevel**: circle r 450, stroke width 4, same diagonal: white 50% → white 0% at 0.5 → white 14%.
5. **Inner bevel**: circle r 360, stroke width 4: black 70% → black 20% at 0.5 → white 22%.
6. **Rivets (full)**: 12 circles of r 17, centred on r 405, starting at 12 o'clock (−90°) every 30°, centres rounded to integers.
   - Shadow: the same circles translated (0, +5), `#000` 55%.
   - Body: `#6C6C72`.
   - Highlight: a circle of r round(0.36·r) offset by (−round(0.32·r), −round(0.32·r)), white 55%.
   - Small variant: 8 rivets, r 26.
7. **Gasket**: circle r 343, stroke `#050506`, width 30 (r 328 to r 358).
8. **Glass** (clipped to circle r 328):
   - Fill: vertical gradient across y 184 → 840: `#35373C` 0, `#131416` 0.55, `#060607` 1.
   - Light ray 1: polygon (392,184) (470,184) (410,840) (300,840). Gradient white 11% → 0% top to bottom.
   - Light ray 2 (full only): polygon (560,184) (596,184) (640,840) (540,840), same gradient at 70% opacity.
   - Particles (full only): dot (362,332) r 6 white 45%; dot (676,404) r 5 white 35%; bubble ring (664,700) r 10 stroke 4 white 30%; bubble ring (684,660) r 6 stroke 3 white 22%.
   - **Equaliser bars**: pure white with a glow filter (Gaussian blur 11 merged over the source).
     - Full: 9 bars, each 28 wide, 20 gap, spanning x 306–718. They rise from baseline y 596 with heights 64, 112, 176, 256, 320, 240, 160, 104, 56.
     - Small: 5 bars, 56 wide, 36 gap, spanning x 300–724. Baseline y 600, heights 128, 232, 320, 208, 112.
   - **Reflection**: one rect per bar, same x and width, starting at baseline + 16 (small: + 20), height round(h × 0.42) (small: × 0.35). Fill is a vertical gradient across y 608 → 760, white 42% → 0%.
   - **Inner shadow**: circle r 328, stroke `#000` 75%, width 40, blur 10.
9. **Glass highlight**: arc r 296 from 200° to 250°, path `M234 411 A296 296 0 0 1 411 234`. Stroke white 32%, width 16 (small: 28), round caps.
   - Second highlight (full only): `M451 223 A296 296 0 0 1 491 217`, white 20%, width 16, round caps.
10. **Tile edge**: rect inset 2, 1020 × 1020, rx 234 (circle: 510), stroke white 8%, width 4.

## Export checklist
- Masters: 1024 SVG and PNG for both variants and both shapes.
- Android: adaptive icon on a 108 dp canvas with the inner 72 dp visible. Put the tile gradient in the background layer and everything else in the foreground layer. Also make a monochrome themed icon: rim ring, rivets and bars as one flat white silhouette.
- Raster sizes: use Full at 64 px and above and Small at 48 px and below. Check the 32 px and 16 px favicons by eye: the bars must stay separate.
- Blur filters scale with the canvas. When rasterising at small sizes, render from the vector rather than downscaling the 1024 PNG, so the glow stays proportional.

## Colour tokens used
`#17171A`, `#08080A` (tile) · `#7C7C82`, `#2E2E32`, `#232326`, `#505056` (rim) · `#6C6C72` (rivet) · `#050506` (gasket) · `#35373C`, `#131416`, `#060607` (glass) · `#FFFFFF` (bars, highlights, glow). These come from Pelagic's near-black and ink ramps. There is no hue.

## Files
- `PortholeIcon.dc.html`: parametric icon. Props are `size` (px), `variant` (`full` | `small`) and `shape` (`squircle` | `circle`). Path generation for rivets and bars is in its logic class.
- `App Icon.dc.html`: the exploration canvas. Section **6a** at the top shows the final icon with its construction overlay, spec table and a size ladder on dark and light wallpapers. Older passes sit below it for context.
- `support.js`: runtime needed to open the `.dc.html` files in a browser.
