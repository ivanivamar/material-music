# Handoff: Queue panel (desktop popover + phone sheet)

## Overview
A redesign of the Pelagic play queue. On desktop it is a floating popover that opens from the Queue button, either in the bottom player bar or in the full-screen player. On phone it is a floating bottom sheet. Both show one continuous list: **Played → Now playing → Next up**.

Problems this fixes in the current implementation:
- The panel was stuck to the right and bottom edges (and the top edge under the bottom player). It now floats with margins on every side.
- The "PLAYING FROM …" label was truncated by the header buttons. It now has its own row.
- Played and Next up each had their own scroll area. There is now one scroll area holding both lists and the current song.

## About the design files
`Pelagic.dc.html` is a **design reference built in HTML**, not production code. Recreate it in the app's existing stack and component patterns. Open the file in a browser to see it (`support.js` and `art/` must sit next to it).
- Desktop: section **08 "Click-through demo"**. Click **Queue** under the transport controls.
- Phone: section **07 "Android"**, frame **"QUEUE / SHEET OVER NOW PLAYING"**.

## Fidelity
High fidelity. Match the colours, type, spacing and radii below exactly.

## Desktop popover
**Container**
- Position: `top: header height + 12px` (84 + 12 = 96px in the full-screen player). When opened from the bottom player bar, use `top: 12px` below the app's top edge or header and `bottom: player bar height + 12px`. Use `right: 20px` and `bottom: 20px`.
- Size: width 432px; height fills the space between those margins.
- Style: background `rgba(20,20,22,0.92)` + `backdrop-filter: blur(28px) saturate(1.2)`; border 1px `rgba(255,255,255,0.09)`; radius 22px.
- Shadow: `0 40px 100px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.05)`; `overflow: hidden`.
- Scrim: covers the whole player, `rgba(5,5,5,0.35)`. Clicking it closes the popover.
- Open/close: opacity 0→1, translateY −10px→0 and scale 0.98→1, with `transform-origin: top right`. Use the app's "slow" duration (~0.6s ease).

**Header** (padding 22px 22px 14px; 1px bottom divider `rgba(255,255,255,0.06)`; 14px gap between rows)
- Row 1 has "Queue" on the left (24px / 400, letter-spacing −0.015em) with the upcoming count beside it (IBM Plex Mono 11px, `#55555A`, zero-padded, e.g. `07`).
- Row 1 has the actions on the right, 8px apart (unchanged from the current design):
  - Shuffle: 40×40, radius 12, 1.5px border `rgba(255,255,255,0.18)`, icon 20px, hover bg `#1A1A1D`.
  - Clear: height 40, padding 0 14px, same border, 13px, `#8A8A8E`; on hover bg `#1A1A1D` and text `#EDEDED`.
  - Close: 40×40, radius 12, no border, hover bg `#1A1A1D`.
- Row 2 is the source line:
  - A 22×22 source cover (radius 5).
  - "PLAYING FROM ALBUM" (Mono 10px, letter-spacing 0.16em, `#8A8A8E`, no shrink).
  - The source name (13px `#EDEDED`, truncates with ellipsis). Only the name may truncate.

**Scroll area**: flex 1, `overflow-y: auto`, padding 14px 12px 16px, thin scrollbar `rgba(255,255,255,0.14)`. Section headers are **not sticky**. When the popover opens, set the scroll position so the Now playing card sits ~12px from the top.

**Section header** (Played / Next up): height 40, padding 0 10px, 12px gap.
- Label: Mono 10px, letter-spacing 0.18em, `#EDEDED`.
- Then a 1px rule `rgba(255,255,255,0.07)` that fills the space.
- Then meta (Mono 10px `#55555A`): `count · total duration`, e.g. `03 · 11:50`.

**Played row**: height 54, padding 0 10px, radius 12, gap 12, opacity 0.5. On hover: opacity 1 and bg `rgba(255,255,255,0.04)`. Contents left to right:
- Index (Mono 10px `#55555A`, 18px wide).
- 38×38 cover (radius 7, `grayscale(0.4)`).
- Title (14px) and artist · album (12px `#8A8A8E`), both truncating.
- Duration (Mono 11px `#8A8A8E`).
- A 14px play icon. Clicking the row plays that song again.

**Now playing card**: margin 10px 0 6px; padding 12px; radius 16; gap 14; `overflow: hidden`.
- Background: `linear-gradient(120deg, rgba(198,180,242,0.16), rgba(198,180,242,0.04) 60%), #1A1A1D`.
- Border: 1px `rgba(198,180,242,0.28)`. Shadow: `0 18px 40px -20px rgba(0,0,0,0.9)`.
- 52×52 cover (radius 10, 1px ring `rgba(255,255,255,0.08)`).
- Text block, stacked:
  - Eyebrow: animated EQ bars + "NOW PLAYING" (Mono 9px, letter-spacing 0.18em, `rgb(198,180,242)`).
  - Title: 15px `#FFFFFF`.
  - Artist · album: 12px `#8A8A8E`.
- Right side, bottom-aligned: `elapsed / total` (Mono 11px; elapsed `#BDBDBD`, total `#55555A`).
- Progress: a 2px bar along the bottom edge, width = progress %, `rgb(198,180,242)`, glow `0 0 10px rgba(198,180,242,0.7)`.

**Next up row**: height 56, padding 0 6px 0 4px, radius 12, gap 12, hover bg `rgba(255,255,255,0.05)`, cursor grab. Contents left to right:
- Drag handle (16px icon `#3A3A3F`, 22px wide).
- 40×40 cover (radius 8).
- Title (14px) and artist · album (12px `#8A8A8E`), both truncating.
- Like heart (28×28; liked `#FFFFFF`, unliked `#8A8A8E`; pops to 1.25× with a spring).
- Duration (Mono 11px `#8A8A8E`, 40px wide, right-aligned).
- Play next (chevron up) and Remove (×) buttons: 30×30, radius 8, `#55555A`; on hover bg `rgba(255,255,255,0.08)` and icon `#FFFFFF`.

While dragging, the dragged row gets bg `#1A1A1D`, border `rgba(255,255,255,0.16)` and opacity 0.45. The drop indicator is a 2px lilac line `rgb(198,180,242)` with glow, shown above or below the target row depending on which half the pointer is over.

**Empty state** (no upcoming songs): centred, padding 48px 0 32px.
- "Still water after this one." (16px).
- "Nothing is queued. When {song} ends, playback continues through {source}." (13px `#8A8A8E`, max-width 260).
- "Restore queue" button: height 38, radius 12, 1px border.

**Footer**: "DRAG TO REORDER · ↑ PLAY NEXT · × REMOVE" in Mono 9px, letter-spacing 0.14em, `#55555A`, centred; padding 12px 0 14px; 1px top divider.

## Phone sheet (412×915 reference)
- Floating sheet: left/right/bottom 8px; top 200px (the now-playing art stays faintly visible above it); radius 28px. Same glass background, border and scrim as desktop.
- Header padding 10px 18px 14px. A 36×4 grab handle sits at the top.
- Shuffle and Clear are 44px tall (touch targets), with the same outlined style. Close by swiping the sheet down.
- Source line: 20px cover; "PLAYING FROM PLAYLIST" Mono 9px.
- Scroll area padding 12px 10px. Section headers are 36px tall.
- Played rows are 56px tall with 40px covers (no index).
- The Now playing card is identical to desktop, except it shows elapsed time only.
- Next up rows: 60px tall, 42px covers, 24px drag handle, 44×44 like target. There are no inline play-next or remove buttons: hold and drag to reorder, swipe left to remove.
- Footer: "HOLD AND DRAG TO REORDER · SWIPE LEFT TO REMOVE".

## State
- `queueOpen: boolean`
- `history: Track[]` (played this session, oldest first)
- `current: Track`
- `upcoming: Track[]`
- `drag: { from, over } | null`
- `liked: Record<id, boolean>`
- Actions:
  - Reorder: `move(from, to)`.
  - Play next: move the song to index 0.
  - Remove: `upcoming.splice(i, 1)`.
  - Clear: `upcoming = []`.
  - Shuffle: shuffle `upcoming` only.
  - Replay: tap a played song to play it again.
- Section meta: the count is zero-padded to 2 digits; total duration is `mm:ss`, or `h:mm:ss` past an hour.

## Tokens
- Text: `#FFFFFF`, `#EDEDED`, `#BDBDBD`, `#8A8A8E`, `#55555A`, `#3A3A3F`
- Surfaces: panel `rgba(20,20,22,0.92)`; `#1A1A1D`; `#121214`
- Hairlines: `rgba(255,255,255,0.06–0.09)`
- Accent (lilac): `rgb(198,180,242)`
- Fonts: the app's sans for UI text, IBM Plex Mono for labels and times
- Radii: 22 (desktop panel), 28 (phone sheet), 16 (now-playing card), 12 (rows and buttons), 8–10 (covers)

## Files
- `Pelagic.dc.html`: full design file. The queue markup is in section 08 (desktop) and section 07 (phone); the logic is in `queueVals()` and `Q_PLAYED` / `Q_ALL`.
- `support.js`: runtime that lets the HTML preview run in a browser.
- `art/`: album covers (placeholder content).
