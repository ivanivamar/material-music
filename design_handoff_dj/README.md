# Handoff: Pelagic DJ

## Overview
The DJ is a mode of the existing Pelagic player (desktop PWA 1440×900, Android 412×915). It plays an endless chain of **sessions**: themed blocks of 6–9 songs, for example "Never played · 2010s metalcore", "New arrivals", "Metalcore × J-rock" or "Forgotten · spring 2023". Before each session the DJ speaks a short line (male English voice, played over silence, **no crossfades**). During that line the cover spot shows the **DJ mark** instead of album art; then each song shows its own cover as usual. The DJ lives inside the player, not on its own page. While it is on, Play/Pause, Next/Previous and Lyrics work as usual, the **queue panel is unavailable**, and shuffle and repeat are ghosted.

## About the design files
The files in this bundle are **design references created in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the target codebase's existing environment and patterns (for Pelagic, the app's desktop stack and Kotlin/Compose on Android), reusing the existing player, tokens and icon set.

Open `DJ.dc.html` in a browser (it needs `support.js` and `pelagic-kit.js` next to it). Sections 03 and 04 are clickable and share one DJ state, so the desktop player, player bar, phone player, mini-player, lock screen and notification all stay in sync. `Settings.dc.html` contains the new **DJ** settings section.

## Fidelity
**High fidelity.** The colours, type, spacing, radii, motion timings and copy are final. Session titles, spoken lines, songs, counts and genres are sample data.

## Tokens (DJ-specific; everything else uses the existing Pelagic tokens)
| Token | Value | Use |
|---|---|---|
| dj-gold | `rgb(226,186,96)` | everything that belongs to the DJ |
| dj-gold-hover | `rgb(238,204,128)` | Start DJ hover |
| dj-gold-light | `rgb(242,218,160)` | label on the active DJ button, the current spoken word, the mark's centre dot |
| dj-gold-a(x) | `rgba(226,186,96,x)` | tints, rims, glows |
| dj scene | wash `oklch(0.20 0.022 238)`, deep `oklch(0.13 0.014 238)`, the usual two radial gradients over `#0B0B0C` | background during the intro and the start view |
| mark tile | `radial-gradient(85% 75% at 50% 64%, #221E17 0%, #111011 55%, #070708 100%)` | |

Gold is the only UI colour that does not come from album art. Do not use it for anything that is not the DJ. It is close to the OPUS quality badge (`230,196,141`); keep the two apart on screen.

Existing tokens used here: bg `#0B0B0C`; surfaces `#121214`, `#141416`, `#161618`, `#1A1A1D`; ink `#EDEDED`, `#BDBDBD`, `#8A8A8E`, `#55555A`, `#3A3A3E`; hairlines `rgba(255,255,255,0.06–0.09)`; borders 1.5px `rgba(255,255,255,0.12–0.18)`; General Sans 300/400/500; IBM Plex Mono 9–11px uppercase with 0.10–0.18em letter-spacing; ease `cubic-bezier(.16,1,.3,1)`.

## 1. DJ mark
A horizon line that fades at both ends, a glowing dot on it, and arcs rising above it at falling opacity, with a faint reflection below. All strokes and fills are dj-gold.

- **Large (≥100px), viewBox 0 0 100 100.** Centre (50, 60).
  - Horizon: x 4–96, with a gradient stroke (gold at 0 → 0.75 → 0).
  - Arcs (upper semicircles): r 9 / 18 / 27 / 36 / 45 at opacity 0.95 / 0.6 / 0.34 / 0.17 / 0.08.
  - Reflection (lower semicircles): r 9 / 18 / 27 at 0.16 / 0.08 / 0.04.
  - Dot: r 2.2 in gold-light, over a halo of r 6 at 0.4 opacity, blurred 2.4.
  - Strokes: 1.5px, non-scaling.
  - Overlays on the tile: stone 0.10, contour 0.08, grain 0.07 (screen).
  - Radius 10px.
  - At ≥200px, a `PELAGIC DJ` mono label sits bottom-left (size ≈ 2.2% of the tile, letter-spacing 0.42em, `#8A8A8E`). While speaking, a gold `SPEAKING` label sits bottom-right.
- **Small (<100px), viewBox 0 0 24 24, drawn at 76% of the tile.** Centre (12, 15.5).
  - Horizon 1–23.
  - Arcs r 4.5 / 8.5 at opacity 1 / 0.5; one reflection at r 4.5, 0.18.
  - Dot r 1.7.
  - Radius 10px at ≥60px, 8px at ≥40px, otherwise round(size × 0.24).
- **Sizes:** 500 (desktop cover spot), 420 (desktop start view), 364 (phone cover spot), 272 (lyrics view), 120 (phone start view), 96 (lock-screen card, radius 12), 72 (notification), 52 (player bar), 46 (mini-player), 40 (panel header), 18 (badge on the mini-player cover, with a 2px `#161618` ring).
- **Idle (optional):** the two outer arcs breathe in opacity (×2.4) on a 9s ease-in-out loop, offset per arc.
- **Speaking:** two sonar circles (1px, gold) grow from r 9 to 62 and fade from 0.65 to 0 over 3.2s with `cubic-bezier(.15,.6,.35,1)`; the second starts 1.6s after the first. Arcs 2–5 brighten with the voice level (opacity × (1 + level × 1.4)), and the halo grows by level × 3.
- **Reduced motion:** no sonar or breathing. Instead, one static ring at r 15, 0.32 opacity, plus the SPEAKING label.
- **DJ icon (24 grid, 1.25 stroke, round caps):** `M2 16.5h20` at 0.45 opacity, `M7.5 16.5a4.5 4.5 0 0 1 9 0`, `M3.5 16.5a8.5 8.5 0 0 1 17 0` (0.55 opacity when off), and a filled dot at (12, 16.5) r 1.7. When on, the dot gets a gold drop-shadow and the outer arc breathes 0.35↔1 over 4.8s.

## 2. DJ button
It sits after Lyrics and Queue in the full-screen player (Now Playing: 42px tall, padding 0 20px 0 16px; Lyrics view: 40px), in the player bar (40×40 icon button) and in the phone full-screen player (40px, in the bottom row: Lyrics · DJ · Queue).

- **Shape:** radius 12px for the labelled buttons, 10px for the 40px icon button. Gap 8, label 14/500 "DJ", icon 21px.
- **Construction** (keep the sizes the same as the neighbouring buttons):
  1. A rim layer: the button's own area, `overflow:hidden`, holding a 260×260 conic gradient that rotates: `conic-gradient(from 0deg, gold .15, gold 1 18%, gold .35 34%, gold .15 50%, gold .9 68%, gold .3 84%, gold .15)`.
  2. A fill layer inset 1.5px, the same radius: `linear-gradient(120deg, rgba(gold,a), rgba(gold,b) 60%), #141416`.
  3. The content on top.

| State | Fill a / b | Rim opacity | Rim turn | Label | Glow |
|---|---|---|---|---|---|
| Off | 0.08 / 0.02 | 0.55 | 16s | gold | none |
| Hover (off) | 0.14 / 0.04 | 1 | 16s | gold-light | `0 0 26px -8px rgba(gold,.6)` |
| On | 0.22 / 0.06 | 1 | 5s | gold-light | `0 0 24px -6px rgba(gold,.55)` |
| On + hover | 0.30 / 0.08 | 1 | 5s | gold-light | `0 0 30px -4px rgba(gold,.65)` |
| Pressed | 0.42 / 0.14 | 1 | 5s | gold-light | `0 0 14px -2px rgba(gold,.75)`, scale 0.96 |

- **Counter:** when on, the button shows a mono counter after the label (10px, 0.75 opacity): `INTRO` during the intro, otherwise `3/7`.
- **Tooltip (desktop, on + hover):** sits 52px above the button, on `#1A1A1D` with radius 10 and padding 9×12. It reads "Skip this session" (13/500) over `RIGHT-CLICK · DJ PANEL` (mono 9). When the DJ is off, the player-bar tooltip reads "DJ" over `ENDLESS SESSIONS FROM YOUR LIBRARY`.
- **Phone:** there is no tooltip. While on, a mono line under the bottom row reads `TAP DJ TO SKIP THIS SESSION · HOLD FOR THE DJ PANEL`. A long-press is 520ms.
- **Click:** when off, opens the DJ start view. When on, **skips the session straight to the next intro, with no Undo**. There is **no keyboard shortcut** for skipping.
- **Right-click / long-press:** when on, opens the DJ panel. When off, it does the same as a click.
- **Reduced motion:** the rim is static; everything else is unchanged.
- **Queue while the DJ is on:** colour `#3A3A3E`, border `rgba(255,255,255,0.07)`, `cursor:not-allowed`, no count. Hovering shows the tooltip "Not available while the DJ plays".
- **Shuffle / repeat while the DJ is on:** `#3A3A3E`, title "Not used by the DJ".

## 3. Start view (full-screen player, DJ off → DJ clicked)
- **Desktop.** Inset 84 128 64; grid `420px | 1fr`, gap 96, vertically centred; the DJ scene behind it.
  - **Left column:** the mark at 420 (idle), with the caption `SESSIONS OF 6–9 SONGS · A SHORT SPOKEN INTRO BEFORE EACH` (mono 10, `#55555A`) below it.
  - **Right column:**
    - Eyebrow `PELAGIC DJ · 3,912 SONGS IN YOUR LIBRARY`.
    - "DJ" at 64/300, letter-spacing −0.035em.
    - Body 16px `#8A8A8E`, max-width 560: "Plays an endless chain of sessions from your library and introduces each one. Pause, skip and lyrics work as usual; the queue waits until you stop the DJ."
    - **Start DJ** button: 56 tall, padding 0 28, radius 12, gold fill, `#0B0B0C` text 16/500, dark DJ icon, then mono `ENDLESS · ALL TYPES` in `#55555A`. Hover: gold-hover fill with a gold glow.
    - The label `OR START WITH ONE TYPE`, then the Genre card and the type cards below.
  - **Genre card:** radius 14, 1.5px `rgba(255,255,255,0.1)` border, `rgba(18,18,20,0.6)` background, padding 18.
    - Header: "Genre" on the left, `PICK ONE OR MORE` on the right.
    - Multi-select chips (34 tall, pill): a label plus a mono count. Selected: gold fill, `#0B0B0C` text, count in `rgba(11,11,12,0.6)`. Unselected: border 0.12, `#8A8A8E` text, count `#55555A`.
    - Footer: a summary such as `2 GENRES · 608 SONGS`, and a secondary "Start with genre" button (38 tall; 0.35 opacity when nothing is picked).
  - **Type cards:** a 3-column grid with gap 12: Never played 1,284 ("In your library, never played through"), Forgotten 2,031 ("Not played in over a year"), New additions 46 ("Added in the last 30 days"). Title 15/500, count in mono 28, sub 13 `#8A8A8E`, chevron on the right. Hover: border 0.3. Clicking starts the DJ with that type only.
- **Phone.** A scrolling column with padding 0 20:
  - A back link (`NOW PLAYING`), the mark at 120 next to "DJ" (40/300), and a short body.
  - A full-width Start DJ button (54 tall, gold).
  - The same Genre card, with a full-width "Start with genre" button that shows the summary.
  - The three types as 64px list rows: title and sub on the left, mono count and chevron on the right.

## 4. Intro
- **Cover spot:** the mark (speaking) at the cover size. Under it, the light pool: a `radial-gradient(closest-side, rgba(gold,.09), transparent)` disc of about 920×860 behind the cover, opacity 0.35 + level × 0.65.
- **Right column (desktop):**
  - Meta row: a DJ chip (gold border 0.5 / bg 0.08 / text gold), then `INTRO`, `SESSION n`, and, after a skip, `SKIPPED · <PREVIOUS TITLE>`.
  - Session title 56/300 (−0.03em).
  - "7 songs" 22px `#BDBDBD`, plus the type in mono.
  - **Subtitle:** the spoken line at 26px, line-height 1.4, max-width 580. Words already spoken are `#EDEDED`; the current word is gold-light with `0 0 18px rgba(gold,.6)`; upcoming words are `#8A8A8E`. Colour transitions take 0.35s.
  - **Voice level:** 60 bars, 2px wide, gap 5, in a 40px-tall row, gold 0.9 (0.3 when silent). Heights follow a bell-shaped envelope × the live level (updated about every 120ms, with a 0.12s height transition).
  - Under it in mono: `DJ · SPEAKING` on the left, `FIRST SONG IN 6S` on the right.
- **Phone:** title 26px, mono `7 songs · TYPE`, subtitle 17px, 36 bars in a 24px row.
- **Lyrics view during the intro:** the spoken line is split into sentences and shown as lyric lines (34px). The current sentence is gold-light with a gold glow. The label reads `DJ INTRO · SPOKEN, IN STEP WITH THE VOICE`.
- **Hand-over:** when the line ends, the mark fades out (opacity, 1.2s) and scales 1 → 0.96, while the first cover fades in and scales 1.03 → 1 (transform 1.4s, default ease). The info column dips to 0 for about 0.9s (0.45s fade), then shows the song. The audio has no crossfade. **Reduced motion:** an instant cut.
- **Compact, player bar:** the 52px mark in place of the art. Title = session title, followed by a gold `DJ · INTRO` chip (mono 9, 1.5px gold border at 0.5). Sub: 10 small level bars plus "DJ is speaking · 7 songs".
- **Compact, mini-player:** the 46px mark, the session title, and a sub with level bars plus "DJ is speaking" and the gold chip. The 1px progress line at the bottom tracks the intro.
- **Previous on song 1** (in its first 3s) replays the intro. **Next** during the intro skips it and starts song 1.

## 5. Song inside a session
- This is the normal Now Playing screen.
  - The header reads `PLAYING FROM DJ` with a gold DJ icon, over the session title.
  - The meta row has the quality badge plus 7 session segments (12×1.5px, gap 3). Played segments are gold 0.6, the current one is gold with a glow, and upcoming ones are white 0.14.
  - There is **no "song X of N" text**.
- **Added by you:** the meta row also shows a neutral `ADDED BY YOU` chip, and the header reads `PLAYING FROM DJ · ADDED BY YOU`.
- **Player bar:** a gold `DJ · 3/7` chip next to the title.
- **Mini-player:** an 18px gold mark badge on the cover corner, and a gold `DJ · 3/7` after the artist.

## 6. Adding songs while the DJ plays
The DJ session is a normal queue.
- The track ⋯ menu / right-click keeps **Play next** and **Add to queue**. While the DJ is on, each carries a gold mono hint: `INSIDE THIS DJ SESSION` / `END OF THIS DJ SESSION`.
- **Play next** inserts the song right after the current one (during the intro: before song 1). **Add to queue** appends it to the end of the current session, before the next intro.
- The session count grows (for example 7 → 8 songs).
- A toast confirms the add, with Undo: "Wildfire plays next, inside this DJ session." / "Added Wildfire to the end of this DJ session."
- **Playing an album, playlist or single song** (rather than adding one) stops the DJ, depending on the setting below.

## 7. DJ panel (right-click / long-press on the DJ button)
- **Desktop popover:** 400 wide, anchored 12px above the button, left-aligned with it and clamped inside the window. Background `#161618`, 1px `rgba(255,255,255,0.09)` border, radius 16, shadow `0 28px 60px -18px rgba(0,0,0,.85)`, padding 18 20 20, gap 16. It opens from scale 0.96 and translateY 8 (opacity 0.2s, transform 0.35s ease). A click outside or Esc closes it.
- **Phone bottom sheet:** `#141416`, radius 24 at the top, a handle, over a `rgba(5,5,5,.6)` scrim. It slides in from translateY(105%) over 0.6s.
- **Contents, top to bottom:**
  1. **Header:** the 40px mark (speaking during the intro), "DJ" 17/500, and the status `ON · SESSION 2 · INTRO` (mono). There is a close button on desktop.
  2. **NOW:** the session title (16/500), `TYPE · 7 songs`, and full-width session segments.
  3. **UP NEXT:** the next session's title (15, `#BDBDBD`) and `TYPE · 8 SONGS`.
  4. **SESSION TYPES:** multi-select chips (Genre, Never played, Forgotten, New additions), selected in gold, with at least one always on. The note `FROM THE NEXT SESSION` sits on the right, and Up next updates live.
  5. **Voice intros:** a toggle (on: gold border 0.7, gold knob with glow) and a volume slider (1px track, gold fill, 12px gold knob). The slider drops to 0.35 opacity and is disabled when the voice is off. The note reads "Male English voice, over silence. No crossfades." / "Intros appear as text for 5 seconds."
  6. **What the DJ has learned:** a small Reset button, then `PLAYS MORE` chips (filled `rgba(255,255,255,.08)`) and `PLAYS LESS` chips (outlined), with the footnote `FROM WHAT YOU SKIP AND WHAT YOU PLAY THROUGH`. After a reset: "Nothing yet. It starts again from the sessions you skip and the songs you play through."
  7. **Stop DJ:** a secondary full-width button (44 tall; 54 on the phone). It returns to normal playback and shows the toast "DJ stopped. Back to Soft Spine, where you left off." with the action Start again.

## 8. Android media controls
While the DJ is on, the media notification and the lock-screen card get one custom action, **Skip session**, before Previous.
- **Notification:** a 44-tall chip with the gold icon and "Skip session" (13/500), gold text, `rgba(gold,.1)` fill and a 1.5px gold inset ring at 0.4.
- **Lock-screen card:** a 44×44 icon-only version.
- **Art:** the mark during the intro (96 on the lock card, 72 on the notification); the cover during songs.
- **App line:** `PELAGIC · DJ`.
- The action disappears when the DJ is off.

## 9. Edge states
- **Not enough songs for a type.** The intro says so ("Only three of these left that you've never played, so I've filled the rest with ones you've forgotten."). An alert line under the subtitle reads "Only 3 never-played songs left, mixing in forgotten ones." On the start view the count shows as `3 LEFT` with "Sessions will mix in forgotten songs." At 0 the card is disabled.
- **Offline (phone).** A banner reads "You're offline · The DJ plays only downloaded songs. Intros are text until you're back online." The counts switch to downloaded songs only (Start DJ shows `412 DOWNLOADED`). Genres or types with 0 downloaded songs are ghosted `#3A3A3E` and disabled ("None downloaded yet").
- **Genres still being filled in.** The Genre card header reads `READING GENRES · 2,140 OF 3,912`, with a 1px progress line. Known chips show counts with `SO FAR`, and the rest are skeleton chips (the existing shimmer). Body: "Counts so far. Endless mode and the other types already work; genre sessions pick from tagged songs only."
- **Voice unavailable / voice off.** The whole line appears at once with no rings and no level. A gold 1px line counts down 5s, labelled `TEXT INTRO` or `VOICE OFF · TEXT INTRO`, with `FIRST SONG IN 3S`.
- **DJ stopped.** By Stop DJ: "DJ stopped. Back to Soft Spine, where you left off." [Start again]. By playing an album: "DJ stopped because you played Tsunami Sea." [Resume DJ, which starts a new intro]. The DJ button returns to off and the queue comes back; what the DJ has learned is kept. The toast icon is the gold DJ icon.

## 10. Settings → DJ (`Settings.dc.html`, between Lyrics and Atmosphere)
- **Section note:** `SESSIONS AND VOICE`.
- **Voice intros:** a toggle. Hint `MALE ENGLISH VOICE BEFORE EACH SESSION`, or `INTROS APPEAR AS TEXT FOR 5 SECONDS` when off.
- **Voice volume:** a slider, hint `RELATIVE TO THE MUSIC`, value `70%` (`OFF` when the voice is off).
- **Session types:** a value row, "Genre, Never played, Forgotten, New", which opens the picker.
- **Stop the DJ when I play an album or playlist:** a toggle, default on. Hint `SONGS ADDED WITH PLAY NEXT OR ADD TO QUEUE JOIN THE SESSION INSTEAD`.
- **Android only — Only downloaded songs on mobile data:** a toggle. Hint `OFFLINE ALWAYS USES DOWNLOADED SONGS`.
- **What the DJ has learned:** the hint lists more and less, and a red Reset button confirms inline: "Forget what the DJ has learned? Sessions go back to an even mix."

## Motion summary
| Element | Motion | Reduced |
|---|---|---|
| Sonar rings | r 9→62, opacity .65→0, 3.2s `cubic-bezier(.15,.6,.35,1)`, two rings offset 1.6s | one static ring + label |
| Mark idle | outer arcs breathe, 9s | static |
| Button rim | conic rotate, 16s off / 5s on, linear | static |
| Icon outer arc (on) | opacity .35↔1, 4.8s | static |
| Voice bars | live heights, 0.12s | still bell shape |
| Words | colour 0.35s | instant (timing still follows the voice) |
| Hand-over | mark out 1.2s, cover in 1.2s / scale 1.4s | cut |
| Panel | opacity .2s, transform .35s | instant |
| Sheet | translateY .6s | instant |
| Toast | in .6s (rise 20px), out .35s, shown 4.5s | instant |

Marine snow and the breathing contours follow the existing atmosphere rules.

## State
```
dj: {
  mode: 'off' | 'intro' | 'song',      // 'hand' is only visual (≈0.9s)
  session: { id, type: 'genre'|'never'|'forgotten'|'new', title, line, songs: [{ id, addedByUser }] },
  songIndex, sessionCount, skippedFrom: title | null,
  types: Set<type>, genres: Set<genre>,
  voice: { on, volume, available },
  learned: { more: string[], less: string[] },
  stopReason: 'user' | 'album_played' | null,
  offline: boolean
}
```
**Transitions:**
- Start(type?) → intro.
- Intro end → song 0.
- Next on the last song → next session's intro.
- DJ click / Skip session → next session's intro (skippedFrom set).
- Previous in the first 3s of song 0 → intro.
- Stop → off, plus a toast.
- Playing an album (with the setting on) → off, plus a toast.

**Data needed:** play counts / last-played dates per song, date added, genre tags (with tagging progress), download state, and TTS for the spoken line. Generate the line ahead of time so the intro starts with no gap.

## Assets
- `art/*.jpg`: sample covers only.
- The DJ mark and icon are drawn in code (`mark()` and `djIcon()` in `DJ.dc.html`). Port the geometry above to SVG / Compose vectors.
- Textures and the base icons come from `pelagic-kit.js`.

## Files
- `DJ.dc.html`: all DJ screens and states (01 mark, 02 button states, 03 desktop prototype, 04 Android prototype with mini-player, lock screen and notification, 05 edge states, 06 reduced-motion notes).
- `Settings.dc.html`: Settings including the DJ section.
- `pelagic-kit.js`: icons, textures, contours.
- `support.js`: the runtime, needed only to open the HTML references.
- `art/`: sample covers.
