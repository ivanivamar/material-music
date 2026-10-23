# Handoff: New Releases (pass 2)

## Overview
New Releases is Pelagic's feed of releases found by a daily MusicBrainz sweep of every artist in the user's library. Nothing in it is playable until it is matched to files the user owns. Pass 2 splits the page into three tabs:

- **Upcoming**: announced, not yet out. Vertical timeline grouped by week with day countdowns. The only action is "Remind me".
- **Out now**: released, not yet in the library. Hero plus a cover grid grouped by time.
- **Discover**: similar artists who are **not** in the library, based on the user's most-played artists. "Add to sweep" starts following them.

The old type filters (Albums / EPs / Singles / Live / Other) are removed. **Anything already in the library is never shown on this page**, including the hero.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes showing the intended look and behavior, not production code. Recreate them in the target codebase's existing environment (desktop app + Android) using its established patterns, components and libraries. `support.js` is only the prototype runtime; ignore it.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and interactions are final. Match them using the app's existing Pelagic components (sidebar, player bar, toasts, detail panel/sheet, Followed artists panel). Those are unchanged from pass 1 except where noted below.

## Screens / Views

### Shared page header (desktop: content column, 56px side padding, 40px top)
- Mono status line above the title: `LAST SONAR · 14 OCT 06:12 · 212 ARTISTS`. During a sweep it becomes `SONAR SWEEP · n / 212 ARTISTS` (#EDEDED), otherwise #55555A. IBM Plex Mono 10px, letter-spacing 0.16em.
- Title "New Releases": General Sans 40px / 400, letter-spacing −0.02em (Android 30px).
- Right side: "Followed artists" link with a **settings cog icon** (`cog` in pelagic-kit) plus the count `212`, then the 46×46 refresh button (radius 12, 1.5px border rgba(255,255,255,.18)). Android: 44×44 cog button + refresh button.
- 1px progress hairline under the header (white fill = sweep %, glow 0 0 6px rgba(255,255,255,.7)).

### Tabs
**Desktop:** a row of text tabs. gap 36px, height 54px, border-bottom 1px rgba(255,255,255,.08).
- Label: General Sans 17px / 500. Active #EDEDED, inactive #8A8A8E, hover #EDEDED, color transition .3s.
- Count after the label: Plex Mono 10px, 0.12em. Active #8A8A8E, inactive #55555A.
- Active indicator: a 1.5px white line on the bottom border, glow 0 0 8px rgba(255,255,255,.7), opacity transition .4s.
- Right-aligned note (Discover only): `FROM YOUR 5 MOST-PLAYED ARTISTS`, mono 10px #55555A.
- Count meanings: Upcoming = visible upcoming releases; Out now = releases with status *new*; Discover = suggestions not yet added.

**Android:** a full-width segmented control, 20px side margin. Container padding 3px, gap 2px, radius 14, border 1.5px rgba(255,255,255,.1). Segments are 40px tall, radius 11, 14px / 500. Active segment: #EDEDED background with #0B0B0C text; inactive: transparent with #8A8A8E text. The count is mono 10px #55555A.

### Filter bar (Upcoming and Out now; hidden on Discover)
Desktop: a wrapping flex row, gap 10px, with the count line pushed to the right (`n NEW · n SEEN` or `n UPCOMING · n REMINDERS`, mono 10px #55555A, 0.14em). Android: a horizontally scrolling chip row with 20px side padding.

1. **Status** (Out now only). Options: All · New · Seen, each with a count. Desktop: segmented group, padding 3, radius 12, border 1.5px rgba(255,255,255,.1); items 30px tall, radius 9, 13px / 500; selected item #EDEDED background with #0B0B0C text. A 1×20 divider follows it. Android: separate chips. Status never includes "In library", because library items are excluded from the page.
2. **Artist**. A chip showing "All artists" or the chosen artist's name, plus a chevron-down icon. Desktop opens a 300px popover below the chip (top 44px; #141416; radius 14; border 1.5px rgba(255,255,255,.1); shadow 0 24px 50px -16px rgba(0,0,0,.85); 6px padding). Rows are 40px with name, mono play count (`412 PLAYS`) and a check on the selected row; hover background rgba(255,255,255,.05). The first row is "All artists". Android opens a bottom sheet, "Filter by artist", with 56px rows.
3. **Hide reissues & deluxe** toggle chip (Android label "No reissues"). On by default. It's the same setting as the toggle in the Followed artists panel.
4. **Furthest first** toggle chip (Upcoming only). Reverses the timeline: week groups and the rows inside them.
5. "Clear filters" text link (13px #8A8A8E), shown when status ≠ All or an artist is set.

Chip style: height 36, horizontal padding 14, pill radius, 14px / 500, border 1.5px. Off: transparent background, #8A8A8E text, rgba(255,255,255,.12) border. On: #EDEDED background, #0B0B0C text, #EDEDED border.

### Upcoming: timeline
**Desktop.** Week groups are stacked with a 36px gap. Group order: THIS WEEK (15 – 18 OCT), NEXT WEEK (19 – 25 OCT), LATER IN OCT (26 – 31 OCT), NOVEMBER. Groups are computed from the release date relative to today. Empty groups are hidden.

- **Week header:** grid `96px 28px 1fr`, gap 20, height 32.
  - Right-aligned label: mono 11px #EDEDED, 0.16em.
  - An 11px ring node (1.5px border rgba(255,255,255,.7)) centred in the 28px rail column.
  - Then the date range (mono 10px #55555A), a flexible 1px rule (rgba(255,255,255,.08)) and a zero-padded count.
- **Release row:** grid `96px 28px 104px 1fr auto`, gap 20, padding 14px 16px 14px 0, radius 14. Hover background rgba(255,255,255,.025). Clicking the row opens the detail panel.
  - **Countdown** (right-aligned): the number of days in General Sans 42px / 400, −0.03em, line-height 1, with `DAYS` (or `DAY`) below in mono 10px #8A8A8E. Releases 4 days out or fewer use #FFFFFF for the number; later ones use #BDBDBD.
  - **Rail:** a 1px vertical line (rgba(255,255,255,.1)) running through every row, with a 7px node. Near releases (4 days or fewer) get a white node with glow 0 0 10px 2px rgba(255,255,255,.55); others get a #55555A node.
  - **Cover:** 104×104, radius 10. Use the pelagic fallback cover when there is no Cover Art Archive art.
  - **Info:**
    - Title: 22px, with the new-dot (6px white, glow) when status is new.
    - Artist: 15px #BDBDBD, hover underline, links to the artist.
    - Type badge plus meta `FRI 16 OCT · 12 TRK · LABEL`.
  - **Remind me button:** height 44, padding 0 18px, radius 12, 14px / 500, bell icon.
    - Off: transparent, #EDEDED text, border rgba(255,255,255,.18).
    - On: "Reminder set", filled bell, #EDEDED background with #0B0B0C text.
    - Setting a reminder shows the toast "Reminder set for 23 Oct." with an Undo action.

**Android.**
- Group header as in pass 1 (8px ring, label, range, rule, count).
- Rows: grid `40px 60px 1fr 44px`, gap 12, padding 10px 16px 10px 20px.
  - Countdown: 26px number above a 9px mono unit.
  - Cover: 60px, radius 8.
  - Info: title 16px, artist 13px #8A8A8E, mono meta `SINGLE · FRI 16 OCT · 2 TRK`.
  - Bell button: 44×44, icon only, same on/off colors as desktop.
- Tapping a row opens the detail sheet.

### Out now
Unchanged from pass 1 apart from the following:
- **Hero** ("NEWEST FROM YOUR MOST PLAYED"):
  - Shown only on this tab.
  - Hidden if the release is in the library, dismissed, or excluded by an active filter.
  - In the prototype the hero is hard-coded to the top artist's newest release. Real rule: the newest out-now release from the user's most-played artist that isn't in the library.
- **Grid:** groups THIS WEEK / EARLIER THIS MONTH / OLDER, 4 columns on desktop (gap 36 × 28). Android uses swipe rows: drag right = seen/unseen, left = dismiss, tap = detail.
- Upcoming releases no longer appear here.
- After "I've got it", the release shows MATCHING. Once matched it leaves the page and the toast "X is in your library." offers Play.

### Discover
**Desktop.**
- Intro copy (15px #8A8A8E, max-width 660): "Artists close to your most played who aren’t in your library. Adding one puts them on the daily sweep, so their releases show up in Upcoming and Out now."
- Then a vertical list of cards, gap 12. Card: grid `64px 1fr 340px 188px`, gap 32, padding 22px 24px, radius 18, background rgba(18,18,20,.72).
  - Border: 1.5px rgba(255,255,255,.07); once added, rgba(255,255,255,.24) (transition .5s).
  - **Avatar:** 64px circle, #121214, border 1.5px rgba(255,255,255,.14), mono monogram 13px.
  - **Info:**
    - Name: 24px, −0.02em.
    - "Because you play Spiritbox and Periphery": 14px #BDBDBD.
    - Row with plays (`412 + 266 PLAYS`, mono 10px #55555A) and MusicBrainz / Bandcamp external links (13px #8A8A8E, ext icon).
  - **Top releases:** mono label `TOP RELEASES`, then 3 rows of 30px. Each row has a top border rgba(255,255,255,.05), the title in 14px (ellipsis) and the year in mono 10px #8A8A8E.
  - **Actions:**
    - "Add to sweep" (plus icon): primary, 44px tall, #EDEDED background with #0B0B0C text. Once added it becomes "In the sweep" (check icon): outlined, border rgba(255,255,255,.6). Adding shows the toast "Added X to the sweep." with meta `FIRST SWEEP AT 06:00` and Undo.
    - "Not interested": 36px ghost button. Removes the card and shows "Won’t suggest X again." with Undo.

**Android.** Stacked cards, padding 16, radius 18:
- 48px avatar beside name (19px), because-line (13px) and plays.
- The 3 release rows (32px).
- Action row: Add to sweep (flex 1, 44px), Not interested (44×44, x icon), Open on MusicBrainz (44×44, ext icon).

**Suggestion source:** similar artists (MusicBrainz/ListenBrainz similarity) to the user's **most-played** artists only. In the prototype that means the top 5, the artists with ≥150 plays. Exclude artists already in the library and artists marked "not interested".

### Desktop sidebar
Search has been removed from the nav. Items: Home, Library, New releases (badge = new count), Upload, Downloads. The Android bottom bar is unchanged.

## Interactions & Behavior
- Switching tabs closes the artist popover. Filters are shared across Upcoming and Out now. Desktop and Android keep separate tab state in the prototype; in the app the selected tab should persist per session.
- The detail panel (desktop, 460px from the right) and the bottom sheet (Android) are as in pass 1. Opening a *new* release marks it seen. Upcoming releases show "IN n DAYS" and a Remind action there.
- Motion:
  - Panel and sheet slide: 0.8s cubic-bezier(.16,1,.3,1).
  - Toasts: 0.6s in, 0.35s out, auto-hide after 5s.
  - Respect prefers-reduced-motion: no transitions, no particles.
- Empty state, "Nothing new on the sonar.": shown when the current tab has nothing to display after filters. The offline, error and first-sweep states are unchanged; see section 03 of the file.

## State Management
- `tab`: `'up' | 'out' | 'disc'`. Default: Upcoming (the prototype prop `startTab`).
- `status` per release: `new | seen | acq (matching) | lib | gone (dismissed)`. Releases with `lib` or `gone` are always excluded from the page.
- Filters:
  - `statusFilter`: `all | new | seen`. Applies to Out now only.
  - `artistFilter`: an artist, or none.
  - `hideReissues`: boolean, default true.
  - `upcomingReversed`: boolean.
- `reminders`: set of release IDs. Fire a notification on release day.
- `followedSuggestions` and `dismissedSuggestions`: sets of artist IDs. Following one adds the artist to the sweep list.
- Data:
  - Sweep results: MusicBrainz release groups, each with a date, type, label, track count and cover from Cover Art Archive.
  - Play counts per artist.
  - Similar-artist lookup for the top artists.
- A release is *upcoming* when its date is after today. Countdown = whole days until release.

## Design Tokens
- Backgrounds:
  - App: #0B0B0C. Canvas: #030303.
  - Panel: #0E0E10. Raised: #121214, #141416, #1A1A1D (hover and toasts).
  - Cards: rgba(18,18,20,.72).
- Text: #FFFFFF (emphasis), #EDEDED (primary), #BDBDBD (secondary), #8A8A8E (muted), #55555A (faint), #3A3A3E (disabled).
- Borders: rgba(255,255,255,.05 / .07 / .08 / .1 / .12 / .14 / .18), plus .6–.7 for active states.
- Glow: 0 0 8px 2px rgba(255,255,255,.55) (dots); 0 0 32px -6px rgba(255,255,255,.5) (primary hover).
- Error: rgb(230,150,140).
- Type:
  - General Sans 300–600: titles 40 / 30, hero 68, row titles 22, body 14–17.
  - IBM Plex Mono 400/500: labels at 9–11px, letter-spacing 0.1–0.16em, uppercase.
- Radii: 6 (badges), 8–10 (covers), 12 (buttons), 14 (popover, segmented control, rows), 18–20 (cards), 999 (chips).
- Spacing: page padding 40 / 56 (desktop) and 20 (Android); section gap 32; card gaps 8–12.

## Assets
- `pelagic-kit.js`: icon set (stroke SVG paths) and texture generators (grain, stone, contour). New in this pass: the `cog` icon, used for Followed artists.
- `art/*.jpg`: placeholder album covers for the mock only. Use real Cover Art Archive images, and the generated fallback cover when none exist (see section 03 of the file).
- Fonts: General Sans (Fontshare), IBM Plex Mono and Noto Sans JP (Google Fonts).

## Files
- `NewReleases v2.dc.html`: the full design. Section 01 is the desktop prototype, 02 is Android plus a card-states legend, 03 shows states (fallback cover, caught up, first sweep, offline, error, toasts). The data and logic are in the script block at the bottom.
- `pelagic-kit.js`, `art/`: the assets the file loads.
- `support.js`: prototype runtime only; don't port it.
