# Handoff: Library + Search (merged)

## Overview
Search is removed as its own page. Library gains a search field directly under its header. With the field empty, Library browses (Artists / Albums / Playlists / Songs). Typing turns the same page into ranked results ("All"). Clearing returns to the tab the user was browsing.

Navigation changes:
- Desktop sidebar: remove the **Search** item. Order becomes Home · Library · New releases (badge) · Upload · Downloads.
- Android tab bar: remove the **SEARCH** tab. Tabs become HOME · LIBRARY · NEW · YOU.

## About the Design Files
The files here are **design references made in HTML**. They show the intended look and behaviour; they are not production code. Rebuild them in the Pelagic codebase using its existing components (sidebar, chips, album card, artist tile, search field, Top result card, song row, player bar, mini-player, tab bar) and patterns. Open `LibrarySearch.dc.html` in a browser to view them; it needs `support.js`, `pelagic-kit.js` and `art/` next to it.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and copy are final. Every element reuses an existing Pelagic component and its styling; there are no new styles.

## Screens

Desktop frame 1440 × 900: sidebar 232px wide, player bar 84px tall. The content column sits at left 232, padding `40px 56px 0`, as a flex column with `gap: 24px`. Every direct child must be `flex: none` so the 60px field and the chip rows can't be squeezed when the grid overflows.

Content column order, top to bottom:
1. **Header**: counts line in mono 10px / 0.16em / `#55555A`, `412 ALBUMS · 68 ARTISTS · 2,931 SONGS`; 10px gap; then "Library" in General Sans 40/400, −0.02em. The counts line sits **above** the title.
2. **Search field**: 60px tall, radius 16, padding 0 20, gap 14, background `rgba(255,255,255,0.03)`. Search icon 22px, text 22px.
3. *(Focused & empty only)* **Recent searches row**, 14px below the field.
4. **Chips row**: 34px pills, gap 8.
5. **Sort row**: mono 10px / 0.16em / `#8A8A8E`, with a 1px `rgba(255,255,255,0.08)` rule filling the space between the two labels.
6. **Content**: album grid or results.

### 1. Desktop, field empty (browsing)
- Field at rest: border `1.5px solid rgba(255,255,255,0.12)`. Icon `#8A8A8E`. Placeholder "Search your library" in `#55555A`.
- Right side of the field: a key cap (22×22, radius 6, border `1.5px rgba(255,255,255,0.18)`, "/" in mono 11px `#8A8A8E`), then `TO SEARCH` in mono 10px / 0.14em / `#55555A`.
- Chips: Artists · **Albums** (selected) · Playlists · Songs. **No "All" chip while browsing.**
  - Selected: `#EDEDED` background, `#0B0B0C` text, weight 500.
  - Unselected: border `1.5px rgba(255,255,255,0.12)`, text `#8A8A8E`, 14px.
- Sort row: `SORT · RECENTLY ADDED` + chevron-down 13px ─── `412 ALBUMS`.
- Album grid: 5 columns, gap `36px 28px`. Cover square, radius 10. Title 14/500; artist 13 `#8A8A8E`. An offline check icon shows where applicable.

### 2. Desktop, field focused and empty
- Focused field: border `2px solid rgba(255,255,255,0.45)`, glow `box-shadow: 0 0 32px -12px rgba(255,255,255,0.35)`. Caret is 1.5×26 `#FFFFFF` with `0 0 6px rgba(255,255,255,0.8)`, followed by the placeholder. Right side shows `ESC · CLOSE` (mono 10px `#55555A`).
- Recent searches row, 14px under the field:
  - `RECENT` label: mono 10px `#55555A`.
  - Chips: 34px, padding `0 14px 0 12px`, gap 8, clock icon 15px `#8A8A8E`, text 14px `#EDEDED`, border `1.5px rgba(255,255,255,0.12)`, background `rgba(255,255,255,0.02)`; hover border `rgba(255,255,255,0.3)`. Example chips: spiritbox · zanmu · periphery v · low tide.
  - `CLEAR` right-aligned: mono 10px `#8A8A8E`, `#FFFFFF` on hover.
- Chips, sort row and grid below are unchanged from state 1.

### 3. Desktop, typing ("tide")
- Field focused, as in state 2. Right side shows the query, the caret, `22 RESULTS · 2 MS` (mono 10px / 0.14em `#8A8A8E`), and a ✕ icon (18px `#8A8A8E`).
- Chips: **All** (selected, inserted first) · Artists · Albums · Playlists · Songs.
- Sort row: `RANKED BY MATCH` ─── `ESC · BACK TO ALBUMS`. The second label names the tab being browsed before typing.
- Content, the current Search "All" layout:
  - Row 1, a grid of `380px | 1fr`, gap 48:
    - **Top result** card: 252px tall, radius 16, `#121214`, border `1.5px rgba(255,255,255,0.08)`, padding 24. It holds a 96px monogram circle, a 36px name, mono meta `ARTIST · 2 RELEASES`, and a 48px play button (`#EDEDED`).
    - **Songs**: rows 60px tall, grid `44px | 1fr | 180px | 52px`, gap 14. Title 15px `#BDBDBD`; artist 12px `#8A8A8E`; like icon; album; duration in mono 11.
  - Row 2: **Albums**, **Playlists** and **Artists** side by side, gap 56; cards 128px wide, 20px apart.
    - Album cards show a mono "HAS RIPTIDE" match line.
    - Playlist cards use a 2×2 cover mosaic (2px gaps, radius 10).
    - Artist cards use 128px monogram circles.
  - Section headers: mono 11px / 0.16em label, a rule, and a mono 10px `#55555A` count (09 / 05 / 04 / 04).
- **Match highlight:** matched characters are `#FFFFFF` with `text-shadow: 0 0 14px rgba(255,255,255,0.45)` (18px / 0.4 on the Top result name). The rest of the string is `#BDBDBD` (titles) or `#8A8A8E` (Top result).

### 4. Android, browsing (412 × 915)
- Status bar 36px. The content column runs from 36 to bottom 166, padding `18px 20px 0`, gap 20, with all children `flex: none`.
- Header: mono `412 ALBUMS · 68 ARTISTS`, then "Library" 30/400. The old search icon button is removed.
- Field: 60px, radius 14, padding 0 16, icon 20, text 18, rest-state border. No "/" hint on touch devices.
- Chips: 36px, scroll sideways (`overflow-x: auto`, row bleeds to the right edge with `margin-right: -20px`).
- Sort row: `SORT · RECENTLY ADDED ▾ ─── 412`.
- Grid: 2 columns, gap `22px 14px`.
- Mini-player: unchanged; 62px, 96px from the bottom.
- Tab bar: 88px, HOME · LIBRARY (active) · NEW · YOU. The YOU icon is a 19px outlined circle with the user's initial; no new icon file is needed.

### 5. Android, typing
- Header counts line becomes `22 RESULTS · 2 MS`.
- Field focused (2px border + glow), "tide" and caret, then ✕ in a 44×44 tap target.
- Chips: **All** selected, then Artists · Albums · Playlists · Songs, scrolling sideways.
- Compact Top result row: padding 14, radius 16, `#121214`. It holds a 60px monogram, a 22px name with the highlight, `TOP RESULT · ARTIST`, and a 44px play button.
- Songs: header + 58px rows (42px cover, title with highlight, "Artist · Album", like icon, duration).
- Albums: a horizontal row of 120px cards, scrolling sideways.

## Interactions & Behaviour
- **Focus shortcuts:** `/` and `Ctrl+K` (`⌘K` on macOS) focus the Library field from any screen. If the user isn't on Library, the shortcut navigates there first, then focuses the field.
- **Focusing an empty field** shows the Recent row. CLEAR removes all recent searches; tapping a chip fills the field with that query.
- **Typing from any tab** inserts the "All" chip, selects it, and swaps the sort row and content for ranked results. Results update live as the user types.
- **Remember the browse context** when the first character is typed: the active tab, its sort, and its scroll position.
- **Clearing** (✕, Esc, or deleting all text) removes "All", restores the remembered tab, sort and scroll position, and puts back the album grid.
- **Esc on an empty focused field** blurs it (the Recent row hides).
- While typing, picking a type chip (e.g. Songs) filters the results to that type. The query stays.
- Commit a query to recent searches when the user opens a result or presses Enter.
- Field focus transition: border colour and glow use the existing field focus timing.

## State
- `query: string`
- `focused: boolean`
- `browseTab: 'artists' | 'albums' | 'playlists' | 'songs'`
- `browseSort` and `browseScroll`, kept per tab
- `resultTab: 'all' | 'artists' | 'albums' | 'playlists' | 'songs'`, set to `'all'` when the query goes from empty to non-empty
- `recents: string[]`, stored locally, most recent first
- Results come from the existing search endpoint. The count and the timing in ms are shown in the field (desktop) or the header (Android).

## Design Tokens (existing)
- **Backgrounds:** `#0B0B0C` (frame), `#121214` (card), `#151517` (mini-player), sidebar `rgba(11,11,12,0.7)`
- **Text:** `#FFFFFF`, `#EDEDED`, `#BDBDBD`, `#8A8A8E`, `#55555A`
- **Borders:** `rgba(255,255,255,0.12)` (chip / field at rest), `0.45` (focused field, 2px), `0.08` (rules / cards), `0.14` (monogram)
- **Radii:** field 16 (desktop) / 14 (Android); card 16; cover 10; pill 999; key cap 6
- **Type:** General Sans (UI), IBM Plex Mono (labels, uppercase, letter-spacing 0.1–0.16em), Noto Sans JP (fallback for Japanese)

## Assets
- Album art: `art/*.jpg` (existing library covers).
- Icons: `pelagic-kit.js` (search, x, clock, chevD, check, heart, play/pause, etc.), 1.25 stroke on a 24px grid.

## Sample data note
The "tide" results (Tidelines, Riptide, Tidewater, Low tide, etc.) are invented placeholder data to show the matching. Real results come from the user's library.

## Files
- `LibrarySearch.dc.html`: all five artboards
- `pelagic-kit.js`: icons and textures
- `support.js`: runtime that renders the HTML reference
- `art/`: album covers
