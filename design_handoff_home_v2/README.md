# Handoff: Pelagic Home v2 (Jump back in, Made for you, Radio)

## Overview
A redesign of Pelagic's Home, for the desktop PWA and Android, plus the new auto-generated mixes and radio. Everything is built from the listener's own library and play history. There is no streaming catalogue and there are no other users. There are no hearts or likes anywhere.

New Home order, top to bottom:
1. Greeting header (unchanged)
2. **Jump back in**
3. Yearly recap shelf (existing, unchanged, only 18 Dec – 31 Jan)
4. **Made for you** (mixes)
5. **Radio for you**
6. Recently added (existing)
7. **Your artists**
8. **Smart playlists**
9. Rediscover (existing album shelf)

The old "Recently listened" and "Most played" album shelves are removed.

New surfaces:
- Mix page `#/mix/…`
- "Start radio" in every ⋯ menu and action sheet
- Radio playback context
- Loading and early-history states

## About the design files
The files in this bundle are **design references created in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the target codebase's existing environment and patterns: the Pelagic desktop stack, and Kotlin/Compose on Android. Reuse the existing player, sidebar, tab bar, tokens, icon set, card styles, toasts and menus.

Open `Home v2.dc.html` in a browser. It needs every other file in this folder next to it.
- The **Motion** switch (Full / Reduced) at the top drives every frame.
- The four frames in 01–02 are clickable. Hover tiles and cards, play them, and tap the DJ tile to start it (intro, then on air).
- Every other frame is a static state.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, motion timings and copy are final. Songs, artists, counts, genre names and art are sample data. The artist photos are stand-ins taken from the sample album covers.

## Design tokens
Everything not listed here comes from the existing Pelagic tokens.

**Backgrounds and surfaces**
- bg `#0B0B0C`
- surfaces `#121214`, `#141416` (sheets), `#161618` (menus), `#1A1A1D` (toasts, hovered menu row)

**Ink**
- `#FFFFFF`, `#EDEDED`, `#BDBDBD`, `#8A8A8E`, `#55555A`, `#3A3A3E`

**Lines**
- Hairlines `rgba(255,255,255,0.04–0.10)`
- Control borders 1.5px `rgba(255,255,255,0.12–0.22)`

**Glow**
- Now playing ring: `0 0 0 1px rgba(255,255,255,0.5), 0 0 32px -6px rgba(255,255,255,0.35)`

**DJ lilac (new value; the DJ is back in the badge lilac)**
- lilac `rgb(198,180,242)`
- lilac-light `rgb(226,216,250)` (the mark's centre dot)
- `rgba(198,180,242,a)` for tints, rims and glows
- Lilac is used **only** for the DJ. It is the same value as the FLAC 24/48 badge, so keep the two apart on screen.
- Radio is **never** lilac. It is neutral white.

**Quality badges (unchanged)**
- FLAC 16/44.1 `143,199,230`
- FLAC 24/48 `198,180,242`
- OPUS `230,196,141`
- Styling: text `rgb(c)`, border 1.5px `rgba(c,0.5)`, bg `rgba(c,0.08)`, radius 6

**Type**
- General Sans 300/400/500.
- IBM Plex Mono uppercase, 9–11px, letter-spacing 0.12–0.18em.
- Sizes used: 40 (greeting desktop), 28 (greeting phone), 72 / 56 (mix title desktop), 34 / 30 (mix title phone), 26 / 22 (empty state), 15, 14, 13, 12.

**Radii**
- 6 (badges, 40px row covers)
- 8 (56px tile art)
- 10 (cards, menu icon buttons)
- 12 (tiles, buttons, menus)
- 14 (panels, invite card, mix header cover)
- 24 (sheet top)
- 50% (avatars, radio seeds)
- 999 (pills)

**Ease and spacing**
- Ease `cubic-bezier(.16,1,.3,1)`
- Spacing 4 / 8 / 12 / 16 / 24 / 32 / 44 / 48 / 64

## Shell (unchanged)
- **Desktop:** sidebar 232px, player bar 84px, main padding `40px 56px` at 1440 wide and `32px 40px` at 1180 wide. Search field 300px wide (240px at 1180).
- **Android:** status bar 36px, content padding `18px 20px` (16px side padding at 360 wide), mini-player 62px floating 8px from the edges at bottom 96, tab bar 88px.
- **Atmosphere** behind every screen: stone texture 0.09, contours 0.075, grain 0.07, marine snow.

## Screens

### 1. Home rhythm
**Desktop:**
- Vertical stack, 44px between blocks.
- Header to row inside a shelf: 16px.
- Shelf header: mono 11px `#EDEDED` label, then a flex:1 1px line `rgba(255,255,255,0.08)`, then a mono 10px `#8A8A8E` sub on the right.
- Card rows: flex, gap 24, `margin-right:-60px`, so the last card is cut off by the window edge (shows the row scrolls horizontally).

**Android:**
- Gap 30.
- Header: mono 10 label, a line, then a chevron-right icon (16px `#8A8A8E`).
- Rows: gap 14, bleeding off the right edge.

**Shelf subs (desktop):**

| Shelf | Sub |
|---|---|
| Jump back in | `SYNCED · PC AND PHONE` (`YOUR LAST PLAYS · PC AND PHONE` with fewer than 8 items) |
| Made for you | `UPDATED TODAY · 06:00` |
| Radio for you | `FROM WHAT YOU PLAY` |
| Recently added | `4 THIS WEEK` |
| Your artists | `MOST PLAYED · LAST 90 DAYS` |
| Smart playlists | `5 · UPDATE THEMSELVES` |
| Rediscover | `NOT HEARD IN A WHILE` |
| Recap | `YOUR 2026` · `UNTIL 31 JAN` |

The greeting date line reads `MON 19 OCT · 21:47` on desktop and `MON 19 OCT` on phone.

### 2. Jump back in
**Contents:**
- The DJ tile, always first.
- Then the last things played *from* (album, playlist, smart playlist, Daily Mix, radio, artist), most recent first, synced between PC and phone.
- Desktop shows 7 items + DJ in a **4 × 2** grid. Phone shows 5 + DJ in a **2 × 3** grid.

**Grid:**
- Desktop `repeat(4,minmax(0,1fr))`, gap 12. At 1440 tiles are about 265 wide, at 1180 about 208.
- Phone `repeat(2,minmax(0,1fr))`, gap 8.

**Tile, desktop:**
- Height 72, padding `8px 12px 8px 8px`, radius 12, gap 14.
- Art 56: radius 8, or round for artists.
- Text column (flex:1, gap 5): name 14/500 `#EDEDED` (single line, ellipsis), then the kind label in mono 9, 0.16em, `#8A8A8E`.
- Kind labels: `ALBUM · PLAYLIST · SMART · DAILY MIX · RADIO · ARTIST`.
- A 32px round play button on the right, always reserving its space.

**Tile, phone:**
- Height 64 (60 at 360 wide), padding `8px 10px 8px 8px`, gap 10.
- Art 48 (44 at 360 wide).
- Name 13/500.
- No play button.

**Tile art per kind:**
- Album: the cover.
- Playlist: the existing 2×2 mosaic.
- Smart: the mosaic plus an 18px ✦ badge at the bottom-right corner (offset −3px, bg `#161618`, 2px `#0B0B0C` ring, 11px icon).
- Daily Mix: the generated cover at 56.
- Radio: the radio art at 56.
- Artist: a round avatar.

**Tile states:**
- Default: bg `rgba(255,255,255,0.035)`, `inset 0 0 0 1px rgba(255,255,255,0.05)`.
- Hover (desktop): bg `rgba(255,255,255,0.075)`, inset ring 0.1. The play button (bg `#EDEDED`, icon `#0B0B0C` 14px) goes opacity 0→1 and scale 0.8→1 over 0.35s with the default ease. Background transitions over 0.25s.
- Now playing: bg `rgba(255,255,255,0.055)`, the now-playing glow ring (box-shadow transitions over 0.6s), name `#FFFFFF` with `0 0 18px rgba(255,255,255,0.4)`, and the existing eq (3 bars, 1.5px wide, 11px high) before the kind label. On hover the button shows pause.

**Click:** plays that context.

**Early use:**
- With fewer items the grid keeps its track and simply ends early. There are no placeholder tiles.
- With no plays at all, only the DJ tile shows.

### 3. DJ tile
Uses the DJ mark from the DJ handoff, recoloured lilac (see "DJ mark" below).

**Fill:** `linear-gradient(120deg, lilac(a), lilac(b) 60%), rgba(20,20,22,0.6)`.

| State | Fill a / b | Box-shadow | Mark | Name | Sub |
|---|---|---|---|---|---|
| Idle | 0.08 / 0.02 | `inset 0 0 0 1px lilac(.18)` | still | "DJ" 14/500 `#EDEDED` | "Endless · tap to start" (sans 12, `#8A8A8E`; 11 on phone) |
| Hover (desktop) | 0.14 / 0.04 | `inset 0 0 0 1px lilac(.42), 0 0 26px -8px lilac(.55)` | still | "DJ" | as idle, plus a 32px **lilac** play button (icon `#0B0B0C`) |
| Pressed | 0.30 / 0.10 | `inset 0 0 0 1px lilac(.6), 0 0 14px -2px lilac(.7)`, scale 0.98 (0.97 on phone) | — | — | — |
| Intro speaking | 0.15 / 0.05 | `inset 0 0 0 1px lilac(.42), 0 0 24px -6px lilac(.5)`, plus breathing glow | two sonar rings (as the mini-player) | session title, e.g. "Never played · 2010s post-punk", `#FFFFFF` | mono 9 lilac `ON AIR · DJ IS SPEAKING` (phone: `ON AIR · SPEAKING`) |
| On air | same as intro | same as intro | **one** slow ring | session title | lilac eq, then `ON AIR · SONG 3 OF 7` (phone: `ON AIR · 3/7`) |

**Breathing glow:** an absolutely positioned span at inset −1, radius 12, `box-shadow 0 0 26px -6px lilac(.55)`, opacity 0.3↔1 over 5.5s ease-in-out.

**Interactions:**
- Tap opens the full-screen player: the DJ start view when the DJ is off, or straight into the run when it's on.
- Right-click (desktop) or a 520ms long-press (phone) opens the DJ panel.
- The prototype simulates this: tap starts the intro, which hands over to on air after 7s; long-press and right-click show a toast.

### 4. DJ mark (lilac)
The geometry is unchanged from the DJ handoff (`djMark()` in `home-kit.js`). Every stroke and fill that was gold is now lilac; the centre dot is lilac-light.

- **Tile background:** `radial-gradient(85% 75% at 50% 64%, #1E1B27 0%, #111013 55%, #070708 100%)`.
- **Tile edge:** `0 0 0 1px lilac(.14)`, or lilac(.28) when on air or speaking.
- **Small mark (<100px):** 24-unit viewBox drawn at 76% of the tile, centre (12, 15.5). Horizon from 1 to 23. Arcs at r 4.5 / 8.5, opacity 1 / 0.5. One reflection at r 4.5, opacity 0.18. Dot r 1.7 over a blurred halo.
- **Speaking:** two rings grow r 4.5→12 and fade 0.65→0 over 3.2s with `cubic-bezier(.15,.6,.35,1)`; the second starts 1.6s after the first.
- **On air (new):** one ring grows r 4.5→11 and fades 0.42→0 over 6s, same curve; the halo is +0.15 brighter.
- **Reduced motion:** speaking shows one static ring at r 6.5, opacity 0.32. On air shows no ring.

The player bar and mini-player show a lilac `DJ · INTRO` or `DJ · 3/7` chip (mono 9, 1.5px border lilac(.5), text lilac), and the DJ icon in the bar turns lilac while the DJ is on.

### 5. Made for you: mix cards and the generated cover system
**Items:**
- Daily Mix 1–6, each built around 1–3 related genres. Title like "Darkwave · Post-punk", subtitle "Molchat Doma, Interpol and more".
- Deep cuts: never-played songs from artists you play a lot.
- Rediscover: songs you loved but haven't played lately.

**Card:**
- Desktop 168, phone 140 (124 at 360 wide). Radius 10.
- Title 14/500. Subtitle 13 `#8A8A8E` (12 on phone). Single line each, with ellipsis.
- Art to text: 12 (10 on phone).

**Cover generation** (`mixCover()` in `home-kit.js`), with no designer needed per mix:
1. **Mosaic:** 2×2 grid of the mix's top 4 albums, one per artist where possible. 1px seams at ≥100px, seam colour `oklch(0.12 0.03 H)`.
2. **Normalise:** each tile goes greyscale, then `brightness = target ÷ meanLuminance(tile)`, clamped to 0.4–2.4.
   - Targets: Daily 0.27, Deep cuts 0.22, Rediscover 0.36.
   - Contrast 1.08 (0.82 for Rediscover).
   - Compute the mean luminance once per cover on import.
   - This step is what makes very dark and very white art land in the same range. Section 05 of the prototype shows a stress test with inverted (white) covers.
3. **Genre tint:** a full-bleed layer `oklch(0.62 0.07 H)` (C 0.045 for Rediscover) with `mix-blend-mode: color`. H is the top genre's hue.
   - Examples: darkwave/post-punk 205, metalcore 25, J-rock 350, alt-metal 70, prog/djent 150, symphonic/gothic 255.
   - Deep cuts 230, Rediscover 45.
   - Isolate the cover (`isolation: isolate`).
4. **Kind overlay:**
   - Daily: `linear-gradient(170deg, oklch(0.15 0.035 H / .72) 0%, oklch(0.18 0.04 H / .12) 40%, oklch(0.10 0.03 H / .92) 100%)`.
   - Deep cuts, sunk from the top: `linear-gradient(180deg, oklch(0.07 0.02 H / .97) 0%, oklch(0.09 0.025 H / .84) 50%, oklch(0.13 0.035 H / .42) 100%)`, plus the contour texture at 0.16.
   - Rediscover, surface light: `radial-gradient(85% 62% at 84% -6%, oklch(0.93 0.035 H / .48), transparent 64%), linear-gradient(180deg, oklch(0.5 0.03 H / .12), oklch(0.14 0.03 H / .86))`.
   - Then grain at 0.09, screen blend, plus an inner edge `inset 0 0 0 1px rgba(255,255,255,0.07)`.
5. **Marks** (pad = size × 0.075):
   - At ≥100px, a mono label top-left: `DAILY MIX` / `DEEP CUTS` / `REDISCOVER`, max(9, size × 0.055) px, 0.18em, `rgba(255,255,255,.88)`.
   - Daily: the numeral bottom-left, 300 weight, size × 0.40 (× 0.44 below 100px), letter-spacing −0.04em, line-height 0.8, white.
   - Deep cuts: a 1px vertical line from 30% height down to the bottom pad, fading from white 0 to 0.7, ending in a 6px white dot with `0 0 10px 2px rgba(255,255,255,.5)`. Then mono `NEVER PLAYED` at white 0.72.
   - Rediscover: a 1px horizontal surface line fading at both ends, size × 0.1 above the bottom pad. Then mono `LOVED · NOT LATELY` at white 0.78.
   - At 56px only the numeral, the dot or the light remains.

**Hover (desktop):**
- A bottom scrim `linear-gradient(180deg, rgba(5,5,5,0) 45%, rgba(5,5,5,.62))` fades from 0 to 1.
- At the bottom-right (10px inset, gap 8) two buttons rise 6px into place, 0.3s default ease:
  - Shuffle: 36px round, bg `rgba(11,11,12,.72)`, border 1.5px `rgba(255,255,255,.22)`.
  - Play: 44px round, `#EDEDED`; on hover `#FFFFFF` with a glow.
- Clicking the art or title opens the mix page.

**Phone:** no hover. A tap opens the mix page.

**Now playing:** the white glow ring on the cover, and an eq chip bottom-left (22px tall, bg `rgba(5,5,5,.85)`, radius 6).

### 6. Radio for you: radio cards
**Items:**
- Seeded from an artist ("Interpol Radio") or from a song ("Radio from 'Evil'").
- Subtitle "With Editors, The National…".
- The card size, text and hover are the same as mix cards, with a play button only.

**Art** (`radioArt()`):
- **Ground:** `radial-gradient(75% 75% at 50% 50%, oklch(0.27 0.035 H) 0%, oklch(0.14 0.02 H) 55%, #0A0A0B 100%)`, with stone 0.10 and grain 0.08. H comes from the seed's art.
- **Seed, centred:**
  - Artist: a round photo at 54% of the card, or an initials disc when there's no photo.
  - Song: the album cover, square, at 46%, radius 6%.
  - Seed shadow: `0 0 0 1px rgba(255,255,255,.1), 0 12px 30px -10px rgba(0,0,0,.9)`.
- **Sonar rings:** three fixed white 1px circles at seed radius + 8.5% / 17% / 25.5% of the card, opacity 0.30 / 0.14 / 0.07. Under 70px, only one ring at +11%.
- **Satellite:** a white dot (r 2.4, or 1.7 when small) with a blurred halo, on the inner ring, starting at −52° (about 1 o'clock). It orbits continuously, **one turn per 36s, linear**, which reads as "this keeps going".
- **Label:** mono `RADIO` top-left, styled like the mix labels.

**Distinct from the DJ:** the DJ's rings leave a dot and fade (a voice). Radio's rings are fixed and only the satellite moves (a station). Radio is white, never lilac.

**Reduced motion:** the satellite stays parked at 1 o'clock.

**Radio icon** (24 grid, 1.25 stroke, round caps):
- `circle r 8` at 0.5 opacity
- `circle r 3.2`
- a filled `circle r 1.6` at (17.66, 6.34)

### 7. Your artists
**Avatars:** round, 132 desktop / 104 phone / 92 at 360 wide.

**Desktop row:** gap 28, items centred.
- Name 14/500 (13 on phone), single line.
- Mono sub 9px, 0.14em, `#8A8A8E`: `48 PLAYS · 90 DAYS` on desktop, `48 PLAYS` on phone.
- Avatar to text: 14 (10 on phone).

**Hover:** a 40px `#EDEDED` play button at the bottom-right with a 3px ring in the page bg colour, opacity 0→1, rising 6px.

**Playing:** the glow ring.

**No photo:**
- A disc with `radial-gradient(80% 80% at 35% 25%, oklch(0.30 0.035 H), oklch(0.16 0.02 H) 75%)`, where H is a hash of the artist name.
- Contour texture 0.12, grain 0.08, inset 1px ring 0.08.
- Initials: 1–2 letters, 300 weight, size × 0.30 (two letters) or × 0.38 (one), colour `oklch(0.90 0.03 H)`.

### 8. Smart playlists
- Existing 2×2 mosaic cards (168 / 140, radius 10, gap 2).
- Title 14/500. Sub mono 10, 0.12em: `46 SONGS · UPDATES ITSELF`.
- **The last card is "New smart playlist":**
  - 168 square, radius 10, 1.5px dashed `rgba(255,255,255,.22)`, bg `rgba(255,255,255,.02)`.
  - Hover: border 0.45, bg 0.04.
  - Centre: a 52px tile (radius 14, 1.5px border 0.18) with a 24px ✦ icon.
  - Title "New smart playlist", sub `RULES · UPDATES ITSELF`.
- **✦ icon path:** `M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z`.
- **No smart playlists (designer's call: an invite, not a hidden shelf):**
  - Shelf sub `NONE YET`.
  - One row, max-width 720, padding 20, radius 14, 1.5px dashed 0.2.
  - Contents: the ✦ tile; "Playlists that fill themselves" (15/500); body 13 `#8A8A8E` "Pick a few rules, like never played, added this month or longer than 6 minutes. The playlist keeps itself up to date."; an outline button "New smart playlist" (40 tall).
  - Phone version: "New smart playlist" / "Pick a few rules. It keeps itself up to date." with a chevron.
  - The invite goes away for good once the first smart playlist exists.

### 9. Mix page (`#/mix/<id>`)
Based on the existing playlist detail page. **Read-only**: no reorder, no remove, no drag.

**Background:** the mix's genre-hue wash.
- Desktop: `radial-gradient(55% 70% at 26% 40%, oklch(0.20 0.035 H), transparent 72%), radial-gradient(90% 50% at 50% 108%, oklch(0.13 0.022 H), transparent 80%), #0B0B0C`.
- Phone: centred at 50% / 22%.

**Desktop:**
- Back link: mono `HOME / MADE FOR YOU`.
- Header row (gap 40, aligned to the bottom):
  - Generated cover at 200 (168 at 1180 wide), radius 14, glow `0 40px 80px -30px oklch(0.34 0.06 H / .9)`.
  - Text column (gap 14):
    - Mono `DAILY MIX · MADE FOR YOU · REFRESHES DAILY`.
    - Title 72/400, −0.035em, line-height 0.95 (56 at 1180).
    - Why line 15 `#BDBDBD`: "Your most played genres lately, with 9 songs you haven't heard yet".
    - Mono 11: `50 SONGS · 3 HR 12 MIN · 9 NEW TO YOU`.
- Buttons (46 tall, radius 12, 21px icons):
  - **Play** (primary `#EDEDED`).
  - **Shuffle** (outline).
  - **Save as playlist** (outline; icon = list with a plus).
  - On the right, mono `READ-ONLY · NEXT REFRESH TOMORROW 06:00` in `#55555A`.
- Table:
  - Columns `32px minmax(0,1fr) 240px 130px 130px 56px`; at 1180: `32px minmax(0,1fr) 170px 110px 110px 48px`.
  - Gap 16, rows 58 tall, radius 10.
  - Headers: `# · TITLE · ALBUM · QUALITY · LAST PLAYED · ⏱`.
  - Row: number (or eq when playing, play icon on hover), a 40px cover with title 15 and artist 13, album 13, quality badge, LAST PLAYED in mono 10 (e.g. `2 DAYS AGO`), duration in mono 11.
  - Never-played songs show a neutral chip `NEW TO YOU` (mono 9, 1.5px border 0.18, `#EDEDED`).
  - Row hover bg `#121214`; the playing row bg `rgba(255,255,255,.03)`.
- **Save toast** (existing toast; bottom-centre of the main area, 108px from the bottom): check icon + "Saved as 'Darkwave · Post-punk · 19 Oct'" + an **Open** button (32 tall, outline). Saving copies today's songs into a normal playlist named `<mix title> · <d MMM>`.

**Phone:**
- Back and ⋯ (44px targets).
- Cover 228 centred (200 at 360 wide).
- Mono label 9. Title 34 (30 at 360). Why line 14. Mono count 10.
- Action row: Save (44), Download (44), spacer, Shuffle (44), Play (56 round, `#EDEDED`).
- Rows 60 tall: 40px cover, title 15, artist 12, `NEW` chip, ⋯.

**Phone offline:**
- A banner under the header: offline icon, "You're offline. Only downloaded songs play.", and mono `32 OF 50 OFFLINE`. Banner style: radius 12, bg 0.04, border 1.5px 0.1.
- The count line reads `50 SONGS · 3 HR 12 MIN · 32 OF 50 OFFLINE`.
- Songs that aren't downloaded: row opacity 0.4, greyscale cover, title `#8A8A8E`, cloud icon. Play skips them.

**Expired link** (mixes refresh daily at 06:00):
- Concentric rings (150px desktop / 120px phone; rings at 0.06 / 0.12 / 0.3) around the refresh icon.
- "This mix has been refreshed" (26 / 22).
- Body:
  - Desktop: "Daily Mixes are rebuilt every morning from what you've been playing. This link was for Daily Mix 1 from 17 Oct. Save a mix as a playlist to keep it."
  - Phone: "Daily Mixes are rebuilt every morning. This link was for Daily Mix 1 from 17 Oct."
- Then a `TODAY'S MIXES` shelf: a horizontal row on desktop, a 2-column grid on phone.

### 10. Start radio
A new item in every ⋯ menu and right-click menu, and in the Android long-press sheet. In the mock it is shown hovered (`#1A1A1D` bg, white icon and text). Each carries a mono 9 hint `#BDBDBD`.

Menus use the existing style: width 300, bg `#161618`, 1px border 0.09, radius 12, padding 6, rows 40 tall with radius 9, 18px icons in `#8A8A8E`, 14px labels, hints in mono 9 `#55555A`, dividers 1px 0.06.

| Menu | Items |
|---|---|
| Song | Play next `⇧ N` · Add to queue `Q` · **Start radio** `FROM THIS SONG` · — · Add to playlist › · Download · — · Go to album · Go to artist · Show lyrics · Track info |
| Album | Play · Shuffle · **Start radio** `FROM THIS ALBUM` · — · Play next · Add to queue · Add to playlist › · — · Download album · Go to artist · Album info |
| Artist | Play · Shuffle · **Start radio** `FROM THIS ARTIST` · — · Go to artist |
| Full-screen player ⋯ | header "Evil" · **Start radio** `FROM 'EVIL'` · — · Add to playlist › · Download · — · Go to album · Go to artist · Track info |

**Android sheet:**
- bg `#141416`, radius 24 at the top, handle, scrim `rgba(5,5,5,.6)`.
- Header: 48px cover, title 16/500, sub 13.
- Rows 52 tall, 22px icons, 16px labels.
- Song sheet: Play next · Add to queue · **Start radio** (`NEW · FROM THIS SONG`) · Add to playlist · Download · Go to album · Go to artist · Track info.
- Player ⋯ sheet: Start radio first, then Add to playlist · Download · Go to album · Go to artist · Show lyrics · Track info.

**Behaviour:**
- Starting a radio replaces the queue, like playing an album does, and stops the DJ if it's on (see the DJ handoff's stop rules).
- The queue shows the next 10 picks and refills itself.
- Shuffle and repeat are ghosted (`#3A3A3E`).

**Context line:**
- Full-screen player header: mono `PLAYING FROM RADIO` with the 14px radio icon, over the seed name (14/500 desktop, 13/500 phone): "Interpol", or the song title for a song seed.
- One-line places (queue panel, notification): `PLAYING FROM RADIO · INTERPOL`.
- The desktop player meta row adds mono `RADIO · KEEPS GOING · NEXT: MUNICH, EDITORS`.
- The phone player shows `RADIO KEEPS GOING · UP NEXT MUNICH, EDITORS` under the controls.
- The phone mini-player shows a neutral `RADIO` chip (border 0.22, `#BDBDBD`).

### 11. Loading and early history
**Home must feel instant.** These paint immediately from the local catalogue: greeting, Jump back in, Recently added, Your artists, Smart playlists and Rediscover.

Only **Made for you** and **Radio for you** wait on computation:
- Each shelf keeps its position and height while it waits.
- Mix placeholders: four shimmer cells in a 2×2 (gap 2, cell gradient `#121214 → #1E1E21 → #121214`, staggered −0.18s).
- Radio placeholders: a shimmer circle at 54% inside a faint ring.
- Each placeholder card has two shimmer text lines (120×12 and 84×10).
- Subs: `MIXING FROM 3,912 SONGS` and `TUNING IN`.
- Real cards replace the placeholders in place with a 0.6s fade and no reflow.
- Shimmer: `linear-gradient(100deg, #121214 30%, #222226 50%, #121214 70%)` at 250% size, 2.8s.

**Few plays:**
- Fewer Daily Mixes (one per genre cluster with enough plays; 2 in the mock) plus Deep cuts. Sub `2 DAILY MIXES FOR NOW · MORE AS YOU LISTEN` (on phone as a mono 9 note under the header).
- Rediscover is hidden, both the mix card and the album shelf.
- Radio is seeded from the artists with the most albums. Sub `FROM THE ARTISTS WITH THE MOST ALBUMS`.
- Your artists sorts by albums. Sub `MOST ALBUMS IN YOUR LIBRARY`, items `3 ALBUMS`.
- Jump back in shows whatever exists.
- Smart playlists shows the invite.

## Motion
Respect `prefers-reduced-motion` and the in-app Motion setting.

| Element | Full | Reduced |
|---|---|---|
| DJ tile, intro | 2 lilac rings, 3.2s, offset 1.6s; glow breathes 5.5s | 1 static ring, steady glow |
| DJ tile, on air | 1 ring every 6s; glow 5.5s; lilac eq | no ring; eq frozen |
| Radio satellite | orbit 36s, linear | parked at 1 o'clock |
| Now-playing ring | fades in 0.6s | instant |
| Card hover | scrim + buttons, rise 6px, 0.3s | instant |
| Tile play button | scale 0.8→1, 0.35s | instant |
| Skeletons | shimmer 2.8s; cards fade in 0.6s | flat blocks; instant swap |
| Toast | in 0.6s with a 20px rise, out 0.35s, shown 4.5s | instant |
| Atmosphere | breathing contours, marine snow | static, no snow |

## State and data
```
home: {
  jumpBackIn: [{ kind: 'album'|'playlist'|'smart'|'daily'|'radio'|'artist', id, name, lastPlayedAt }], // synced PC ↔ phone, max 7
  mixes: { status: 'computing'|'ready', generatedAt, items: [{ id, kind: 'daily'|'deep'|'redis', n?, title, sub, hue, coverAlbumIds[4], why, trackIds[], newCount }] },
  radios: { status, items: [{ id, seed: { type: 'artist'|'song', id }, title, sub, hue }] },
  artists: [{ id, name, photo|null, plays90d, albumCount }],
  smartPlaylists: [...], recap: { visible: date in 18 Dec – 31 Jan },
  historyLevel: 'none'|'early'|'full'
}
player.context: { type: 'album'|'playlist'|'mix'|'radio'|'dj', id, label }
dj: see DJ handoff (idle | intro | onair) — drives the DJ tile
```
- Mixes regenerate daily at 06:00. Old `#/mix/<id>` links resolve to the expired state.
- Per-cover mean luminance is computed once on import (used by step 2 of the cover system).
- Genre → hue is a fixed lookup.
- Artist hue for the no-photo disc is a stable hash of the name.

## Assets
- `art/*.jpg`: sample covers only. Artist photos in the mock are stand-ins.
- Icons come from `pelagic-kit.js`. New icons (radio, ✦, save-as-playlist) and the lilac DJ icon are in `home-kit.js` (`ICX`).
- The covers, radio art, avatars and the DJ mark are drawn in code (`home-kit.js`). Port the recipes above to the app's rendering (CSS / Compose).

## Files
- `Home v2.dc.html`: the canvas. Sections:
  - 01 desktop Home 1440 / 1180
  - 02 Android 412 / 360 / DJ intro
  - 03 full-length rhythm (22 Dec, with the recap)
  - 04 tiles and DJ tile states
  - 05 cover system
  - 06 radio / artists / smart
  - 07 mix page states
  - 08 Start radio menus, sheets, player
  - 09 loading / early history
  - 10 motion
- `DeskScreen.dc.html`, `PhoneScreen.dc.html`: the screens. Props: `page`, `data` (full / early / loading / noSmart), `dj`, `full`, `recap`, `toast`, `motion`, `live`.
- `home-kit.js`: generated art, sample data and new icons.
- `pelagic-kit.js`: base icons and textures.
- `support.js`: prototype runtime only; don't port it.
