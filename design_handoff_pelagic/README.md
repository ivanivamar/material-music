# Handoff: Pelagic — Batch Upload

## Overview
A redesign of Pelagic's desktop Upload screen so users can upload many albums, EPs and singles in a single pass. Everything the user drops (folders and loose files) joins one batch and is sorted into releases. Releases with no problems are added to the library automatically once they finish uploading. Releases with a problem are flagged "Needs you". They keep uploading in the background but aren't added to the library until the user resolves them in the inspector panel.

## About the Design Files
The files in this bundle are **design references created in HTML**. They are prototypes that show the intended look and behavior, not production code to copy. The task is to **recreate them in the target codebase's existing environment** (React, Vue, native, etc.) using its established patterns and component library. Open `Upload Batch.dc.html` in a browser to interact with the prototype; it needs `support.js`, `pelagic-kit.js` (icon set) and `art/` beside it.

## Fidelity
**High-fidelity.** Final colors, type, spacing and interactions. Match them exactly, using the codebase's existing Pelagic components (sidebar, player bar, toggles, quality badges) where they already exist.

## Screens

### 01 — Upload, active batch (1440 × 900 desktop frame)
**Shell:** sidebar 232px wide on the left (Upload nav item active: bg `#EDEDED`, text `#0B0B0C`, icon tile `#0B0B0C` with white icon), player bar 84px high at the bottom. These are the existing app shell.

**Content area:** left 232 → right edge, top 0 → bottom 84. Padding 36px 48px 28px. Vertical flex, gap 24px.

1. **Header row** (flex, space-between, align bottom, gap 32px)
   - Left: mono kicker `9 RELEASES · 62 TRACKS · 2.9 GB` (computed from the batch), then the title "Upload" (40px, weight 400, letter-spacing -0.02em).
   - Right: a compact drop strip. flex:1, max-width 560px, 56px high, radius 14px, 1.5px dashed `rgba(255,255,255,0.22)`, bg `rgba(255,255,255,0.02)`. It holds an upload icon, the text "Drop more folders or files. They join this batch." (14px, `#8A8A8E`) and a "Choose folders" button (38px high, radius 10px, 1.5px border `rgba(255,255,255,0.18)`). On hover the border goes to `rgba(255,255,255,0.4)`. Dropping anywhere on the content area shows a full overlay (see Drop overlay).

2. **Body grid:** `minmax(0,1fr) 380px`, gap 32px, fills the remaining height.

**Left column: release list**
- **Toolbar** (padding-bottom 12px, bottom border `rgba(255,255,255,0.08)`, gap 16px):
  - Select-all checkbox: 18px, radius 5px. Its mark is ✓ when all are selected and – when some are.
  - Filter pills, each with a count: All · Needs you · In progress · Added. Pills are 30px high and fully rounded. Active pill: bg `rgba(255,255,255,0.12)`, border `rgba(255,255,255,0.28)`, text `#FFFFFF`. Inactive: border `rgba(255,255,255,0.1)`, text `#8A8A8E`. The count is mono 10px and turns warn-coloured on "Needs you" when it's above 0.
  - **Primary batch button, aligned right:** 36px high, radius 12px, 16px icon + label, 14px weight 500.
    - Not started: label "Upload" with the upload icon, filled (bg `#EDEDED`, text `#0B0B0C`).
    - Running: "Pause all" with the pause icon, outline (border `rgba(255,255,255,0.18)`, transparent background).
    - Paused: "Resume" with the play icon, outline.
- **Rows** (scrollable, 64px high, bottom border `rgba(255,255,255,0.04)`). Grid columns: `18px 44px minmax(0,1fr) 64px 56px 120px 128px`, gap 16px.
  - Columns: checkbox · 44px cover (radius 6px; with no art, a striped placeholder with a mono label such as "NO ART" or "3 FILES") · title (15px) over subtitle (13px, `#8A8A8E`) · type (mono 10px uppercase: ALBUM / EP / SINGLE / —) · tracks `found/total` (mono 11px, warn-coloured when found < total) · progress line (1px track `rgba(255,255,255,0.12)`, fill `#FFFFFF`, warn fill at 0.8 alpha if the release has an issue, glow `0 0 6px rgba(255,255,255,0.7)` while it's actively uploading) · status (mono 10px, 6px dot).
  - Hover bg `rgba(255,255,255,0.035)`. Focused row: bg `rgba(255,255,255,0.05)` plus a 2px white inset bar on the left (`inset 2px 0 0 #FFFFFF`). Checked rows use the same bg. Skipped rows sit at opacity 0.45.
  - Status values:
    - `QUEUED`: dot hollow with a `#55555A` ring, text `#8A8A8E`.
    - `UPLOADING 64%`: white dot with glow, text `#EDEDED`.
    - `NEEDS YOU`: warn dot with glow, warn text.
    - `ADDED`: `#8A8A8E`.
    - `SKIPPED`: `#55555A`.
- **Footer** (top border, padding-top 16px, gap 14px):
  - Overall progress bar: 2px high, white fill with glow `0 0 8px rgba(255,255,255,0.6)`.
  - Mono status line: `N OF M ON SERVER · 1.4 GB LEFT · ABOUT 2 MIN`. Variants: `… READY TO UPLOAD` before starting, `… LEFT · PAUSED` while paused, and `ALL FILES ON SERVER` when done.

**Right column: inspector** (card bg `#121214`, 1.5px border `rgba(255,255,255,0.07)`, radius 18px, padding 24px, gap 20px, scrolls). It has two modes.

*Single mode* (when 0 or 1 releases are checked; shows the focused row):
- Kicker `ALBUM · NEEDS YOU` with a quality badge on the right. Badges: FLAC 16/44.1 = `143,199,230`; FLAC 24/48 = `198,180,242`. Badge styling: text `rgb(c)`, border `rgba(c,0.5)`, bg `rgba(c,0.08)`, radius 6px, padding 4px 7px, mono 10px.
- Cover 80px (radius 10px), title 21px, artist 14px `#8A8A8E`.
- **Issue card** (only when there's an issue): radius 14px, 1.5px border `rgba(230,150,140,0.35)`, bg `rgba(230,150,140,0.06)`, padding 16px. It contains an alert icon, a title (14px), a description (13px `#8A8A8E`) and action buttons (36px high, radius 10px; the first one is primary filled `#EDEDED`, the rest are outline). The copy is listed under Issue types below.
- TYPE: segmented control Album / EP / Single, fully rounded, 28px items. Selected item: bg `rgba(255,255,255,0.16)`, inset ring `rgba(255,255,255,0.28)`.
- FILES: header `12 OF 13 FOUND`, then an 8-column grid of 30px cells numbered 01…N (radius 7px). Uploaded cells: bg `rgba(255,255,255,0.08)`, border `rgba(255,255,255,0.14)`, text `#EDEDED`. Pending cells: border `rgba(255,255,255,0.08)`, text `#55555A`. Missing cells: dashed warn border at 0.6 alpha, warn text.
- Tag rows, 42px each: ALBUM ARTIST, SIZE, UPLOADED %.
- Toggle "Also download for offline", then the buttons "Edit tags" (outline) and "Skip this release" / "Include again" (text button).

*Multi mode* (when 2 or more are checked):
- Kicker `N RELEASES SELECTED` with CLEAR on the right.
- A stack of up to 5 overlapping 56px covers (-18px overlap, 2px ring `#121214`), the title "N releases", and the sub line "X tracks · Y MB".
- If any selected release has an issue, a warn strip reads "2 of these need you". Clicking REVIEW focuses the first one.
- "SET TYPE FOR ALL": a segmented control with no selection when the types are mixed.
- Tag rows: ALBUM ARTIST, TYPE and FORMAT, each showing "Mixed" (`#8A8A8E`) when the values differ.
- Toggle "Download all for offline" (label "· some on" when the selection is mixed), then the buttons "Edit shared tags" and "Skip selected".

### Drop overlay
Covers the content area: bg `rgba(11,11,12,0.86)`, padding 40px. Inside is a dashed 1.5px `rgba(255,255,255,0.5)` box, radius 22px, with inner glow `inset 0 0 80px -30px rgba(255,255,255,0.25)`. Content: a 64px upload icon tile, "Drop 6 folders and 2 files" (26px, built from the counts of what's being dragged) and the line "They’ll be sorted into releases and added to the batch below."

### 02 — Upload, empty state
The same shell (the Upload nav item has no badge). Content: the kicker `FLAC · ALAC · OPUS · UP TO 2 GB PER FILE` and the title "Upload", then a drop zone filling the remaining height. The zone has radius 22px, a dashed 1.5px `rgba(255,255,255,0.22)` border, bg `rgba(255,255,255,0.02)`, and its content is centred with gap 28px:
- 64px icon tile.
- Heading: "Drop albums, EPs and singles" (26px).
- Body: "Drop as many folders or files as you like. They’re sorted into releases using their tags, and releases with no problems are added to your library automatically." (15px, `#8A8A8E`, max-width 520px).
- Buttons: "Choose folders" (primary) and "Choose files" (outline), both 44px high.
- Hint line: `ONE FOLDER PER RELEASE WORKS BEST · LOOSE FILES ARE GROUPED BY TAGS` (mono 10px `#55555A`).

## Interactions & Behavior
- **Grouping:** files are grouped into releases by their album artist and album tags. Files in the same folder that share an artist but have no album tag become an "ungrouped" release with the `loose` issue.
- **Start:** the batch doesn't upload until the user presses Upload. While it's idle, every row shows QUEUED or NEEDS YOU.
- **Upload order:** two releases upload at a time, in list order. Skipped releases don't upload.
- **Auto-add:** when a release reaches 100% and has no issue, it's added to the library and its status becomes ADDED. There is no setting for this.
- **Issues don't block uploading.** A flagged release keeps uploading and is added once its issue is resolved (immediately if it's already at 100%).
- **Pause all / Resume** pauses or resumes every transfer.
- **Selection:** clicking a row focuses it and clears the checkboxes. Clicking a checkbox toggles that release (and doesn't change focus). With 2 or more checked, the inspector switches to multi mode. Select-all applies to the rows the current filter shows.
- **Filters:** All · Needs you (issue present) · In progress (uploading, queued or ready, without issue) · Added. The counts update live.
- **Nav badge:** while any release needs attention, the Upload nav item shows a count, e.g. `4 !`.

### Issue types (exact copy)
| id | Title | Description | Actions |
|---|---|---|---|
| missing | Track 07 is missing. | The files are tagged as 13 tracks, but only 12 were uploaded. The rest keep uploading. Add the missing file now, or add the album without it and drop the file in later. | **Add missing file** · Add without it |
| loose | These 3 files share an artist but have no album tag. | Their track numbers and length match Rotoscope (2021), a 3-track EP. | **Group as EP · Rotoscope** (becomes one EP release with cover) · Keep as 3 singles (splits into 3 Single rows) |
| dup | Already in your library as FLAC 16/44.1. | This copy is FLAC 24/48. Replacing keeps your plays, likes and playlist positions. | **Replace** · Keep both · Skip |
| cover | No cover art in the file or folder. | A matching cover was found online at 1200 × 1200. | **Use found cover** · Add without cover |

**How a missing track is detected:** first from the track-total tag (TRACKTOTAL/TOTALTRACKS, or the "7/13" form of TRACKNUMBER), then from gaps in the track numbers. An online metadata lookup is optional and also catches a missing final track. With no total tag and no gaps, nothing is flagged.

### Motion
- Progress widths animate with `width .4s linear`.
- Toggle knobs move with `left .25s`.
- Row backgrounds change with `background .2s`.
- Respect `prefers-reduced-motion` (no glow pulses are used here).

## State
```
releases: [{ id, title, artist, cover|null, type: 'Album'|'EP'|'Single'|'—',
             total, found, missing[], quality: 'f16'|'f24', sizeMB, pct,
             issue: null|'missing'|'loose'|'dup'|'cover',
             offline: bool, added: bool, skipped: bool }]
focusId, checkedIds[], filter: 'all'|'need'|'prog'|'added',
started: bool, paused: bool
```
Derived values: the per-row status, filter counts, totals, MB left, ETA, active uploads and the nav badge.

## Design Tokens
- Backgrounds: frame `#0B0B0C`, page `#030303`, card `#121214`, toast/raised `#1A1A1D`.
- Text: primary `#EDEDED`, pure `#FFFFFF`, secondary `#8A8A8E`, tertiary `#55555A`, disabled `#3A3A3E`.
- Lines: `rgba(255,255,255,0.04 / 0.06 / 0.08 / 0.12 / 0.18 / 0.22)`.
- Warn: `rgb(230,150,140)` (border 0.35, bg 0.06, dot glow 0.6).
- Quality: FLAC 16 `rgb(143,199,230)`, FLAC 24 `rgb(198,180,242)`, Opus `rgb(230,196,141)`.
- Type: General Sans (Fontshare) 400/500 for UI. IBM Plex Mono 400/500 at 10–11px, letter-spacing 0.12–0.16em, uppercase, for labels and metadata. Sizes used: 40 / 26 / 21 / 15 / 14 / 13.
- Radii: 5 (checkbox), 6 (small cover, badge), 7 (file cell), 10, 12 (buttons), 14, 18 (cards), 22 (drop zones), 999 (pills).
- Primary button glow: none. Active and glowing elements use `0 0 8px rgba(255,255,255,0.6)`.

## Assets
- `art/*.jpg`: sample album covers, for the prototype only.
- Icons come from `pelagic-kit.js` (`IC.upload`, `alert`, `pauseF`, `playF`, …): 24px viewBox, 1.25 stroke, round caps. Use the codebase's existing Pelagic icon set.

## Files
- `Upload Batch.dc.html`: the prototype (frame 01 is interactive; frame 02 is the empty state). The logic class at the bottom of the file holds the sample data, the status rules and the issue copy.
- `pelagic-kit.js`: icon paths.
- `support.js`: prototype runtime only. Don't port it.
