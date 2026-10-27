# Handoff: Pelagic Concerts (On tour + Concerts near you)

## Overview
Adds live-music discovery to Pelagic, the personal music player (desktop PWA + Android). There are four pieces:
1. An **On tour** section on the Artist page.
2. A new top-level **Concerts near you** page. Direction **1b, "Posters + months"**, is the chosen layout.
3. **Add a show yourself**, for shows Ticketmaster doesn't list.
4. Entry points: a sidebar nav item with a badge, a Home shelf, and Settings rows.

Data comes from the Ticketmaster Discovery API, refreshed once a day. Location is a home city plus a radius set in Settings. There is no GPS.

Start with `Pelagic Concerts.dc.html`. It shows every screen and state in sections 01–05.

## About the design files
The files in this bundle are **design references created in HTML**. They are prototypes that show intended look and behaviour, not production code to copy. Recreate them in the app's existing codebase, using its framework, component library and patterns. This is the same codebase that implements the Pelagic Material 3 redesign (`design_handoff_pelagic_material`). Reuse its existing primitives: segmented row lists, pill buttons, chips, the timeline rail, cookie/clover shapes, the sidebar, the player bar, toasts, dialogs and sheets.

Each `.dc.html` opens directly in a browser. Keep `support.js`, `ripple.js` and `art/` next to them. Layout and copy live in the template. Data, state and computed colours live in the `renderVals()` logic of each file.

## Fidelity
High-fidelity. Colours, type, spacing, radii, copy and interactions are final. Sample data is fictional: the shows, venues and "Mar de Fons Festival" are invented.

## Rules (carry over from the main system)
- There is no like / favourite feature. Never add heart or like buttons.
- The logo is always the "Ink on coral" icon (2b).
- Neutral surfaces: artist hue appears only on small accents (date-block tint, photo ring, festival label). It never tints large surfaces.

---

## Data model (per event)
| field | notes |
|---|---|
| artist | Must be in the user's library. Photo, hue and the following flag come from the library artist. |
| date | Local date. Festivals can span two days (`5–6 Dec`). |
| time | Local start time. May be missing; show "Time TBA". |
| venue, city, country | |
| km | Distance from the home city, computed on the client or server. |
| status | `onsale`, `presale` (with until-date), `notyet` (with on-sale date/time), `soldout`, `cancelled`, `postponed`, `resched` (with "moved from" date), plus local-only `mine`. |
| price | Optional range, e.g. `€38–52`. |
| url | External ticket link. |
| festival | Optional. Festival name plus lineup. Mark the lineup artists that are in the library. |
| isNew | Added since the user last opened Concerts. Drives the sidebar badge and the "New" pill. |

Nearby means `km <= radius`. Everything outside the radius counts as "elsewhere".

### Status chips
Each chip is 24–28px tall with an 8px radius, 11–12px/700 text, and a 14–16px Material Symbols Rounded icon.

| status | label | icon | bg | fg | Tickets button |
|---|---|---|---|---|---|
| onsale | On sale | confirmation_number | `oklch(0.31 0.05 150)` | `oklch(0.88 0.08 150)` | tonal |
| presale | Presale (+ note "Presale until Thu 29 Oct, 10:00") | key | `oklch(0.33 0.06 38)` | `oklch(0.90 0.07 38)` | tonal |
| resched | Rescheduled (+ note "Moved from Sat 24 Oct") | event_repeat | `oklch(0.31 0.05 75)` | `oklch(0.88 0.09 80)` | tonal |
| notyet | On sale 6 Nov (+ note "Fri 6 Nov, 10:00") | event_upcoming | transparent, 1px inset `oklch(0.40 0.012 40)` | `oklch(0.86 0.01 40)` | outlined |
| soldout | Sold out | block | `oklch(0.27 0.01 40)` | `oklch(0.78 0.014 40)` | outlined |
| postponed | Postponed (+ note "New date to be announced") | update | `oklch(0.31 0.05 75)` | `oklch(0.88 0.09 80)` | outlined |
| cancelled | Cancelled | event_busy | `oklch(0.32 0.07 25)` | `oklch(0.88 0.08 25)` | none |
| mine | Added by you | edit | `oklch(0.25 0.009 40)`, 1px inset `oklch(0.40 0.012 40)` | `oklch(0.90 0.01 40)` | tonal, only if a link was saved |

How a cancelled show looks:
- The date block drops to 55% opacity.
- The day number and the venue line are struck through (`text-decoration: line-through`).
- The artist photo is greyscale.
- There is no Tickets button.

Tickets buttons are 40px tall with a 999px radius. The label is "Tickets" followed by an `open_in_new` 18px icon.
- **Tonal:** bg `oklch(0.36 0.035 38)`, fg `oklch(0.92 0.025 38)`.
- **Outlined:** transparent bg, 1px inset `oklch(0.40 0.012 40)`, fg `oklch(0.86 0.01 40)`.
- **Filled** (posters only): bg `oklch(0.80 0.115 38)`, fg `oklch(0.30 0.08 38)`.
- **Compact variant:** a 40–44px round icon button with the `local_activity` icon.

Tickets always opens the external `url` in the browser.

### Date block (calendar style)
The block is 64×64px on desktop rows and 52×58–60px on phone, with a 16px radius.
- **Background:** `oklch(0.25 0.03 H)`, where H is the artist hue.
- **Month:** "OCT", 10–11px/700, letter-spacing 0.08em, colour `oklch(0.84 0.09 H)`.
- **Day:** 20–24px/700, line-height 1.05. Two-day festivals use 16–19px.
- **Weekday:** 10–11px, `oklch(0.79 0.014 40)`.
- **On poster photos:** solid `oklch(0.17 0.006 40)` background with shadow `0 8px 20px -8px rgba(0,0,0,0.7)`.

### Artist photo (hue scope)
The photo is round. It has a 2px ring in the surface colour, then a 2px ring in `oklch(0.70 0.10 H)`:
`box-shadow: 0 0 0 2px <surface>, 0 0 0 4px oklch(0.70 0.10 H)`

Tapping the artist photo or name opens that artist's page.

---

## Screens

### 1. Concerts near you: direction 1b "Posters + months" (chosen)
File: `ConcertsMaterial.dc.html`, props `view="page"` and `dir="b"`, with `form="desk"` (1440×900, also 1180×760) or `form="phone"` (412×892).

**Desktop shell.** The 272px sidebar is unchanged. The main panel has a 10px margin, a 28px radius, bg `oklch(0.17 0.006 40)`, and a 1px ring `oklch(0.24 0.008 40)`.
- **Header background:** coral radial glow `radial-gradient(85% 520px at 8% -14%, oklch(0.36 0.07 38 / 0.32), transparent 72%)`, plus the coral dot texture and concentric rings used on the other top-level pages.
- **Content:** padding `28px 36px 170px`, vertical gap 28.
- **Player bar:** floats as on the other pages, left 290, right 28, bottom 28.

**Header**
- **Title row:** "Concerts near you", 45px/700, letter-spacing -0.025em. The **Add show** button sits on the right: 48px tall, 16px radius, bg `oklch(0.30 0.012 40)`, `add` icon. On hover the radius morphs to 24px.
- **Location pill:** 40px tall, 12px radius, bg `oklch(0.225 0.008 40)`, 1px inset `oklch(0.34 0.01 40)` (coral when open). It reads `location_on` (coral, filled) + "Near Barcelona ·" + "50 km" in JetBrains Mono + `arrow_drop_down`.
- **Meta line:** "9 upcoming shows · Updated today, 06:10", 14px, with the second half tertiary.
- **Filter chips:** All · Next 30 days · On sale now · Artists I follow, each with a JetBrains Mono count.
  - Chips are 36px tall with a 12px radius.
  - Selected: bg `oklch(0.36 0.035 38)`, fg `oklch(0.92 0.025 38)`, leading `check`.
  - Unselected: 1px inset `oklch(0.38 0.012 40)`.
  - "On sale now" = onsale + presale + resched. "Artists I follow" = artists with release alerts on.
  - The brief said "This month", but it was renamed "Next 30 days". In late October, "this month" would only cover this week.

**Location popover (desktop) / bottom sheet (phone)**
- **Size:** desktop 380px wide, 20px radius, bg `oklch(0.26 0.009 40)`, padding 20.
- **Home city field:** 52px tall, 14px radius, bg `oklch(0.21 0.008 40)`, 2px coral inset when focused, `location_city` icon, country shown as a trailing hint.
- **Radius segmented control:** 25 / 50 / 100 / 250 km, 40px tall, 2px gaps.
  - Selected: coral `oklch(0.80 0.115 38)` with ink `oklch(0.30 0.08 38)` and a 999px radius.
  - Unselected: `oklch(0.28 0.01 40)`. The outer ends are `999px 8px 8px 999px` / `8px 999px 999px 8px`, inner segments 8px. Radius morphs over 350ms with `cubic-bezier(0.42,1.67,0.21,0.9)`.
- **Hint:** "No GPS. Shows are matched to this city and refreshed once a day."
- **Done:** coral filled pill.

**Posters (next 3 buyable shows)**
- **Layout:** 3-column grid with 20px gaps on desktop. On phone, a horizontal snap carousel of 288px cards with 12px gaps.
- **Card:** 28px radius, bg `oklch(0.205 0.008 40)`, 1px inset `oklch(0.27 0.01 40)`. Hover lifts it -3px with `cubic-bezier(0.42,1.67,0.21,0.9)`, 350ms.
- **Photo:** 210px tall (168px on phone), object-fit cover, no gradient scrim.
  - Date block top-left, inset 14px.
  - Status chip top-right on a solid surface.
- **Body:** padding `18px 20px 20px`.
  - Festival label: `festival` icon + name, 12px/600, in the artist hue.
  - Artist name: 24px/700 (20px on phone).
  - "Venue · City": 14px secondary.
  - For festivals, a stack of lineup avatars (22px, -6px overlap, 2px surface ring) + "+ 2 artists you have: Periphery, Wing".
  - Bottom row: JetBrains Mono meta "20:30 · 3 km · €38–52" (12px) and a **filled** Tickets pill.

**Months (the rest of the shows)**
- **Desktop:** each month is a row with a 1px top border `oklch(0.27 0.01 40)` and 24px top padding.
  - The grid is `150px | 1fr`, gap 24.
  - Left column is sticky: month label "November" (28px/700; adds the year when it isn't the current year) over "3 shows" (12px mono tertiary).
  - Right column is a 2-column card grid with 12px gaps.
- **Card:** 24px radius, bg `oklch(0.205 0.008 40)` (hover `0.235`), padding 16, gap 16.
  - 56px round photo with the hue ring.
  - Mono date line "SAT 21 NOV · 19:00", 12px/600, in the artist hue (struck through if cancelled).
  - Artist 16px/600, with a "New" pill (coral) if new.
  - "Venue · City · 4 km", 12px.
  - For festivals: "Name · + N artists you have: …".
  - Status chip + price (mono 11px tertiary) + note.
  - 40px round Tickets icon button on the right.
- **Phone:** the month header is inline ("November" 22px/700 + mono count). Cards are full width with 14px padding, a 48px photo and a 44px icon button.

**Attribution.** "Ticket info from Ticketmaster. Tickets open on their site.", 12px, `oklch(0.62 0.014 40)`, with an `info` icon. It sits below the list on desktop. Phone shows "Ticket info from Ticketmaster", centred.

**Phone shell**
- Status bar, then a top bar with a back arrow (Concerts is a pushed page), then the title at 32px/700.
- The location pill and meta line stack under the title. The chips scroll horizontally.
- Mini player at bottom 104px. Bottom nav (Home · Library · New · Downloads) with Home selected.
- **Add show FAB:** extended, right 16 / bottom 188, 56px tall, 16px radius, bg `oklch(0.42 0.10 38)`, fg `oklch(0.93 0.04 38)`.

**States**
- **Loading:** shimmer skeleton rows (`pm-shim` 1.4s linear: gradient `oklch(0.23 0.008 40)` → `0.29` → `0.23`, size 200%). The rows use the segmented radii: first `24 24 8 8`, middle 8, last `8 8 24 24`.
- **Empty:**
  - Clover EmptyState: 120px clover (`cookie(10, 0.09)`) in `oklch(0.225 0.008 40)` with a coral `event_busy` icon.
  - Title: "No shows near you right now".
  - Body: "None of your 214 artists have dates within 50 km of Barcelona. Pelagic checks again tomorrow morning."
  - Actions: **Widen to 100 km** (filled `oklch(0.42 0.10 38)`, `radar` icon) and **Change city** (tonal `oklch(0.30 0.012 40)`, opens the location picker).
- **Home city not set (first-time setup card):**
  - Card: max 620px, 28px radius, padding 32, bg `oklch(0.205 0.008 40)`.
  - 72px clover with a `location_on` icon.
  - Title: "Where's home?"
  - Body: "Pick a city and a radius. Once a day Pelagic checks tour dates for every artist in your library and lists the ones inside that circle."
  - City search field.
  - "How far would you travel?" with the 25/50/100/250 km segmented control (48px tall).
  - **Show concerts** filled button.
  - "You can change this in Settings."
  - No chips or count are shown in this state.
- **Offline / couldn't update:**
  - Amber banner: bg `oklch(0.27 0.045 75)`, inset `oklch(0.62 0.09 75 / 0.4)`, `cloud_off` icon.
  - Title: "Couldn't update concerts".
  - Body: "You're offline. Showing dates from yesterday, 06:10. Check the status before you buy."
  - **Retry** button.
  - The cached list stays visible. The meta line reads "Updated yesterday, 06:10".
- **Cancelled, postponed and rescheduled** shows appear inline in the list, styled as in the status table.

### 1a. Timeline agenda (not chosen, kept for reference)
Set `dir="a"`. A single agenda on the Library timeline rail:
- 2px rail `oklch(0.30 0.01 40)` at left 17.
- 16px ring headers. The first is coral, the rest `oklch(0.50 0.02 40)`.
- Groups: This week / November / December / Later.
- Rows are segmented, with grid `64px | 1fr | 96px | 232px | 124px` (narrow below 1300px: `64 | 1fr | 76 | 168 | 108`, gap 14).

### 2. Artist page: On tour
File: `ArtistTourMaterial.dc.html`. This is a copy of the Artist page with the section added. Prop `tour`: `nearby | one | far | none | loading | nocity | error`. Also `tourOpen`.

**Placement**
- **Desktop:** top of the right column, above Albums. The column is 360px wide, or 280px below 1300px. Most played stays the dominant block.
- **Phone:** between the action buttons and Most played.

**Section header**
- "On tour" 22px/600 + count "14 dates".
- Sub-line: `location_on` (coral) + "Near Barcelona · 50 km" (mono).

**Nearby rows** (segmented list, bg `oklch(0.21 0.008 40)`, padding 12, gap 14)
- 52px date block.
- "Venue · City" 14px/600.
- Mono meta "20:30 · 3 km · €38–52".
- For festivals: a festival label and "With Periphery and Wing from your library".
- Status chip + tonal **Tickets** pill (36px).

**Elsewhere**
- A single collapsible row, bg `oklch(0.21 0.008 40)`, min-height 52, with a `public` icon.
  - Collapsed: "12 more dates in Europe and North America". With no nearby dates: "N dates in Europe and North America".
  - The `expand_more` chevron rotates 180° over 350ms (`cubic-bezier(0.38,1.21,0.22,1)`).
- **Expanded:** compact rows, bg `oklch(0.195 0.007 40)`, min-height 56.
  - Grid: `76px mono date | city / venue | chip + 40px icon Tickets`.
  - Rows show no distance.
  - Only non-default statuses get a chip (sold out, postponed, not yet on sale).

**Hero chip.** Shown only when a nearby date exists. It reads "Playing near you · Thu 29 Oct": 28px tall, 999px radius, green tonal (`oklch(0.31 0.05 150)` / `oklch(0.88 0.08 150)`), filled `location_on` icon. It sits next to the "Artist · Metalcore" label on desktop and below the stats on phone. Tapping it scrolls to On tour.

**States**
- **loading:** a skeleton of one row plus the collapsed row.
- **none:** the section is hidden entirely.
- **far:** a note "Nothing within 50 km of Barcelona. Closest is Madrid on Sat 31 Oct.", then the collapsed list.
- **nocity:** an inline prompt row: 40px tonal tile + "See which dates are near you" / "14 upcoming dates · set a home city" + coral **Set city** pill. Set city opens Settings → Home city.
- **error:** an outlined row (1px inset `oklch(0.30 0.01 40)`) with `cloud_off` + "Couldn't load tour dates" + **Retry**.

**Attribution.** "Ticket info from Ticketmaster", 11px tertiary, at the end of the section.

### 3. Add a show yourself
In `ConcertsMaterial.dc.html`. Props `addDemo` (`empty | suggest | filled`) and `mine` (seeds one manual show).

**Entry points.** The **Add show** button in the desktop header, or the phone extended FAB.

**Dialog (desktop)**
- Scrim `rgba(0,0,0,0.55)`.
- Card: 560px wide, 28px radius, bg `oklch(0.225 0.008 40)`, padding 24, gap 20, shadow `0 24px 64px -16px rgba(0,0,0,0.8)`.
- Header: 48px tonal tile with `edit_calendar` + "Add a show" (24px/600) + "Only you see it. Ticketmaster updates won't change it."

**Full-screen form (phone)**
- Close (X) button, the title (22px/600), and a Save pill in the top bar.
- Intro line: "For shows Ticketmaster doesn't list. Only you see it, and daily updates won't change it."

**Fields.** All fields are 56px tall, 16px radius, bg `oklch(0.26 0.009 40)`, 1px inset `oklch(0.38 0.012 40)`, with a leading icon.
- **Artist** (required):
  - Searches artists in the library only.
  - The suggestion list (max 4) shows a 32px photo, the name and a release count. The menu is bg `oklch(0.29 0.01 40)`, 16px radius.
  - When nothing matches it shows "No artist in your library matches."
  - Once picked, the field shows the photo with the hue ring, the name, and an X to change it.
- **Date** (required, mono). Past dates are an error: red border `oklch(0.70 0.12 25)` and "Pick today or a later date".
- **Start time** (optional, mono).
- **Venue** (required, placeholder "e.g. Razzmatazz").
- **City** (defaults to the home city).
- **Ticket link** (optional, full width).

**Footer.** Delete (edit mode only, red `oklch(0.82 0.10 25)`), Cancel (coral text), and **Add show / Save**. The primary button is coral when the form is valid. Disabled: `oklch(0.30 0.01 40)` / `oklch(0.62 0.014 40)`.

**Result**
- The show is inserted by date into the same list, with the "Added by you" chip and no distance.
- Tapping the chip reopens the form in edit mode ("Edit show", Save, Delete).
- Tickets appears only if a link was saved.
- Toasts: "Added Wing · Fri 27 Nov", "Saved …", "Removed Wing at Sala Upload".

Store manual shows locally/server-side per user. The daily Ticketmaster sync must never modify or delete them.

### 4. Where it lives
- **Desktop sidebar:**
  - A **Concerts** item in Browse, below New releases. Icon `local_activity` (filled when active).
  - Coral count badge: 20px, `oklch(0.80 0.115 38)` / `oklch(0.30 0.08 38)`, 11px/700. It counts `isNew` shows since the last visit and clears when the page is opened.
- **Phone:** the bottom nav stays at 4 tabs. Concerts is a pushed page, reached from:
  - the Home shelf's "See all"
  - the Artist hero chip
  - the Settings row
- **Home shelf** (`view="shelf"`):
  - Header: "Concerts near you" 22px/600 + "Barcelona · 50 km" + coral "See all 9".
  - Up to 4 cards (248px wide on desktop, 216px on phone, horizontal scroll). Card: 24px radius, padding 16, 56px photo + date block, artist, venue, mono meta, chip, 40px Tickets icon.
  - "Ticket info from Ticketmaster" below the cards.
- **Settings** (`view="settings"`). A **Concerts** section (note "Ticketmaster · checked daily") in the standard Settings card (28px radius, bg `oklch(0.205 0.008 40)`, rows min 72px, 1px dividers `oklch(0.27 0.01 40)`):
  - **Home city:** "Barcelona, Spain ›". Hint "Used for Concerts near you. No GPS."
  - **Radius:** 25/50/100/250 km segmented control. The hint changes with the value: "Only shows in and right around the city", "City and nearby towns", "Day trips by train or car", "Worth a weekend away". On phone the control stacks below the label.
  - **Concerts near you:** "9 upcoming ›". Hint "Last checked today, 06:10".
  - Footer: "Ticket info from Ticketmaster."

## Interactions & behaviour
- Chips filter client-side. Counts reflect the full set, not the current filter.
- Tapping the artist photo or name opens the Artist page. Tickets opens the external URL. Neither navigates within the card.
- Changing city or radius refetches. Show the loading state, and persist the values to Settings.
- Data refreshes once a day. "Updated today, 06:10" shows the last successful sync. If a sync fails, keep the cached data and show the offline banner.
- Motion: standard easing `cubic-bezier(0.31,0.94,0.34,1)`, about 200ms for surfaces. Press ripple comes from `ripple.js`. Respect reduced motion.
- Toast: `oklch(0.90 0.01 40)` bg, `oklch(0.22 0.01 40)` text, 12px radius, min-height 48. It appears for 2.8s, entering from +16px over 500ms with `cubic-bezier(0.38,1.21,0.22,1)`.

## State
- `homeCity`, `radiusKm` (25|50|100|250), from Settings.
- `events[]` (Ticketmaster cache + `lastUpdated`), `manualShows[]`, `lastSeenAt` (drives `isNew` and the badge).
- Page: `filter` (all|next30|onsale|following), `locationOpen`, `dialog` (null | {mode: add|edit, id, fields}), `loadState` (loading|ready|empty|error).
- Artist page: `tourState` and `tourExpanded`.

## Design tokens
These are the same as the main handoff. Key values:
- **Neutrals (hue 40):**
  - app bg `oklch(0.12 0.004 40)`
  - panel `oklch(0.17 0.006 40)`
  - card `oklch(0.205 0.008 40)`
  - row `oklch(0.21 0.008 40)`
  - hover `oklch(0.235–0.25 0.009 40)`
  - raised `oklch(0.225–0.26 0.009 40)`
  - outline `oklch(0.34–0.40 0.012 40)`
- **Ink:** `oklch(0.94 0.006 40)`, secondary `oklch(0.79 0.014 40)`, tertiary `oklch(0.62 0.014 40)`.
- **Coral:** `oklch(0.80 0.115 38)` (ink `oklch(0.30 0.08 38)`); filled CTA `oklch(0.42 0.10 38)` / `oklch(0.93 0.04 38)`; tonal `oklch(0.36 0.035 38)` / `oklch(0.92 0.025 38)`.
- **Artist hues used in samples:**

  | Artist | Hue |
  |---|---|
  | Spiritbox | 215 |
  | Periphery | 30 |
  | Ado | 330 |
  | Evanescence | 285 |
  | BFMV | 20 |
  | BVB | 0 |
  | Eve | 245 |
  | Wing | 150 |

  Derive the hue from the artist photo in production.
- **Type:** Google Sans Flex 400–700 (UI). JetBrains Mono 400–600 for times, distances, prices, counts and mono date lines.
- **Icons:** Material Symbols Rounded (opsz 24, wght 400, FILL 0/1).
- **Radii:**
  - cards and panels 28
  - list cards 24
  - date blocks 16
  - fields 16
  - chips 12 (filter) / 8 (status)
  - pills 999
  - segmented row lists `24 24 8 8` / `8` / `8 8 24 24`, with 2px gaps between rows

## Assets
- `art/`: sample album covers, used as stand-in artist photos.
- Icons are Material Symbols Rounded (Google Fonts).
- The logo is the Ink on coral icon, as in the main handoff.

## Files
- `Pelagic Concerts.dc.html`: the overview of every screen and state (sections 01–05).
- `ConcertsMaterial.dc.html`: the Concerts page (1b default, 1a via `dir`), states, add-show dialog/form, Home shelf, and Settings rows. Props: `view`, `form`, `dir`, `state`, `chip`, `locDemo`, `addDemo`, `mine`, `w`, `h`.
- `ArtistTourMaterial.dc.html`: the Artist page with On tour, the hero chip and the Concerts nav item. Props: `form`, `tour`, `tourOpen`, plus the existing Artist props.
- `support.js` and `ripple.js` are the runtime, and `art/` holds the images.
