\# Material Music — Step 3: building the redesign (Oct 26, 2026)

&#x20;

\*\*Handoff:\*\* `D:\\pelagic\\design\_handoff\_pelagic\_material`, the full set. Start with `Pelagic Overview.dc.html`. It covers First run, Home, Library + search, Artist / Album / Playlist / Smart playlist, playlist dialogs, New releases, Now playing (queue, lyrics), DJ, Upload, Downloads, Settings, the Android widget, and the icon (option \*\*2b "Ink on coral"\*\*). Implement `surface=neutral`. The older `design\_handoff\_material\_redesign` is a subset of it; `LibraryMaterial.dc.html` and the Album / Artist / Playlist / Smart playlist / PlaylistDialog / New releases files are only in that older folder.

&#x20;

Rendering the `.dc.html` files needs React 18.3.1 and Babel standalone 7.29.0 from unpkg. Claude serves them from npm and patches the `data-props` defaults (form=phone, page=mix…) to render each state.

&#x20;

\## Decisions (Ivan, Oct 26)

\- Stats/Recap and Library health are \*\*not designed yet\*\*. They keep their current screens with the new tokens; they get designed later.

\- App name \*\*Material Music\*\*. Greet with the Google account name (the designs show "pelagic" / "Kast").

\- Features in the designs that the app doesn't have are \*\*hidden for now\*\*: lyrics romaji/translation, normalisation, crossfade, output device, lock-screen toggle. They get built later as separate steps.

\- Widget: \*\*restyle the existing Java RemoteViews widget\*\*. No Glance/Kotlin rewrite.

\- No like/favourite anywhere (handoff rule).

\- Now playing gets a blurred-cover background (Ivan's ask, not in the handoff). White / grey covers get near-white accents, not coral, everywhere (player, Jump back in tiles, search Top result, detail pages): one rule, `design/tint.ts` `useArtTint`.

\- Work happens on git branch \*\*`redesign`\*\* (created by Ivan). To preview: `cd app \&\& npm run build \&\& firebase hosting:channel:deploy redesign`.

\## How Claude works on it

There is no shell on the PC. Claude stages `app/` into the cloud (`/home/claude/app`), runs `npm ci`, `tsc -b` and `vite build`, then commits the changed files back to `D:\\pelagic\\app`. Ivan commits to `redesign`.

&#x20;

Visual check: `vite preview` plus Playwright (`/home/claude/test/shots2.cjs`). It seeds a fake catalogue into IndexedDB (`pelagic` / `kv` / `catalogue`), canvas covers in `covers`, `history`, `recent` and two `playlists` (pl1 normal with a missing song, pl2 smart), a session in `pelagic.session.v1`, and a queue in `pelagic.player.v1` (via addInitScript). Then it screenshots `#/<route>` on desktop (1440×900) or phone (`PHONE=1`, 412×892). Env options: `CLICK='sel|sel'`, `WAIT=ms`, `SCROLL=y`, `TYPE=text` (typed into `.lb-input`), `WHITE=1` (white cover), `HANG=1` (Drive requests hang).

&#x20;

\## Phases

1\. \*\*Foundation: done Oct 26.\*\*

&#x20;  - Tokens remapped in `styles/tokens.css`. The variable names are kept, so every screen picks up the warm neutrals at hue 40. New tokens: `--screen`, `--surface-sel`, `--surface-raised`, `--outline`, `--track`, `--brand` (coral), album accents `--album`/`--on-album`/`--album-container`/`--album-icon`/`--album-eq` driven by `--h` and `--hc`, DJ `--dj\*`, glass `--glass-\*`, `--ease-std`, `--ease-shape`. Album vars live on `:root, .hue-scope`, so a page or tile can set its own `--h` (and `--hc`, which defaults to 1 on `.hue-scope`).

&#x20;  - Fonts are self-hosted: Google Sans Flex variable, JetBrains Mono 400/500, Material Symbols Rounded variable (fill.css). IBM Plex and General Sans were removed; Noto Sans JP stays.

&#x20;  - `design/icons.tsx`: `<Icon>` = Material Symbols with the same names, plus new ones and a `filled` prop; the DJ is a drawn burst.

&#x20;  - `design/shapes.ts`, `design/albumHue.ts`, `design/NowPlayingHue.tsx` (sets `--h` / `--hc` from the playing cover), `design/tint.ts` (+hue, +chroma), `design/ripple.ts`.

&#x20;  - `components/ui/Material.tsx`: `CookieButton`, `WaveProgress`, `AlbumEq`, `LoadingShape`.

&#x20;  - `components/Logo.tsx`: `AppMark` (Ink on coral).

&#x20;  - `Atmosphere` renders nothing.

2\. \*\*Shell: done Oct 26.\*\*

&#x20;  - Desktop: sidebar 272px (240 under 1300px) on the app background. It has the brand row (AppMark, "Material Music", "Local library" / "Google Drive"), Browse nav (38px rows, active = `oklch(0.36 0.035 38)` + filled icon, coral count badge), Playlists (44px rows, 28px covers, drag/drop and reorder kept), and the \*\*account chip\*\* at the bottom (avatar, first name, "Synced x min ago", unfold → account menu above). Settings and Stats live in the account menu.

&#x20;  - Main panel: inset 10px, radius 28, `--panel`, coral dot grid + 3 rings decoration. Top bar (search pill with coral cookie icon + Ctrl K; \*\*Shuffle all\*\* on Home) on home / new / upload / downloads / stats / settings / health.

&#x20;  - Floating glass player bar (96px, 28px from the panel edges): tilted 64px cover, `ModeToggle` shuffle / repeat, `CookieButton` 46, `WaveSeek`, FLAC pill, lyrics / DJ / queue, `ThinSlider` volume.

&#x20;  - Phone: `PhoneTopBar` on home (logo) / library / new / downloads (title, which hides the page's own `.ph-title`), search + \*\*avatar → account sheet\*\*. Tab bar with 4 tabs: Home · Library · New (count) · Downloads, coral pill. Glass mini player 68px with a 48px album-colour play, next, and a 3px progress line.

&#x20;  - Snackbars (`material.css`): light inverse surface, coral action. Action menus / sheets / dialog base restyled in `actions.css` (appended overrides).

&#x20;  - New primitives: `WaveSeek`, `ThinSlider`, `ModeToggle`. `AccountMenu.tsx` now exports `Avatar`, `AccountChip`, `AccountButton`.

3\. \*\*Now playing + queue + lyrics: done Oct 26.\*\*

&#x20;  - `NowPlaying.tsx` rewritten: glass sheet. Header: round close, PLAYING FROM / source label, more. Tilted cover (`coverEl()`, the DJ stack is kept). Info column: FLAC/OPUS pill + DJ/Radio chip, title clamped to 2 lines (Marquee on phone), "artist · album" links, `WaveSeek below` (times under the wave, remaining as "-m:ss"), `Transport`, then Lyrics · DJ · Queue chips + volume `ThinSlider knob` (132px). The old "NEXT" line, HeroTitle, Atmosphere and tint scene are gone.

&#x20;  - `parts.tsx`: `Transport({compact, phone})` = `.np-mode` toggles (76→56 desktop, 64→48 phone), `.np-skip`, `CookieButton` (96 desktop / 80 phone / 64 compact). `ViewButtons({phone})` = Lyrics, DjButton, Queue chips (`is-sq` squares on phone).

&#x20;  - Lyrics are now a \*\*panel\*\* inside Now playing (`.np-panel.np-ly-panel` + `.np-scrim`; desktop right popover `min(432px, 36vw)` from top 96; phone sheet from top 200). The sung line is in the album colour.

&#x20;  - Phone: CoverSwipe row (tilt on `.npc-slot .np-cover`, glow removed), 80px play, bottom row `np-phone-actions`.

&#x20;  - Queue: Material overrides appended to `queue.css` (glass panel, raised now-playing card, album-colour lines). From the player bar it sits at top 20 / right 38 / bottom 146; over Now playing at top 96 / right 20. \*\*Like button removed\*\* from queue rows.

&#x20;  - \*\*Fixes after review (Oct 26):\*\* the wave mask path now overruns its 24px tile (no cut between waves). Now playing has a \*\*background\*\*, which is Ivan's ask and not in the handoff: the cover blurred 72px, drifting slowly, under an album-hue wash and a dark scrim (`.np-bg`). The queue's now-playing bars and the shared `Eq` use `--album-eq`. \*\*Loading indicator:\*\* `LoadingShape`, an M3 Expressive shape that morphs through 6 cookies (`LOADING\_SHAPES`) while it turns, replaces the icon in `CookieButton loading` (player bar, Now playing) and in the mini player while buffering. \*\*Neutral covers:\*\* `--hc` (0..1, `@property`) scales the album chroma. White/grey/black covers get `--hc 0`, a near-white accent, instead of falling back to coral (`tint.ts` → `chroma`; mostly grey covers stay neutral unless their colour part is big).

4\. \*\*Home + mix page + DJ tile + expired link: done Oct 26.\*\*

&#x20;  - `Home.tsx`: greeting (date line + 57px / phone 32px). New `Shelf` (`.hs\*`): 22px title + 12px note + coral "See all" (phone: arrow, note below; Jump back in keeps its note inline). Labels are sentence case.

&#x20;  - `home/JumpBackIn.tsx`: neutral tiles (0.20 / hover 0.235 / playing 0.25). 80px tall with radius 20 on desktop, 64px on phone. Art is tilted −4° and straightens on hover. Each tile is a `.hue-scope` with its own hue (cover / artist / mix / station), which colours the kind icon, the eq and the cookie play (hover on desktop, always shown on phone). The sub line reads "Album · 2 days ago". DJ tile: `DjKnobMark` (violet dial that swings while on air). The sub is "Endless · tap to start" / "On air · DJ is speaking" / "On air · song n of m" in violet.

&#x20;  - `home/art.tsx` rewritten: `MixCover` (hue gradient, clover burst, two tilted covers, "Daily mix" + numeral / explore / history), `RadioArt` (rings, cookie-clipped seed over a lighter cookie that spins while playing, "Artist/Song/Album radio" chip, sensors mark), initials discs, `SmartArt` + yellow clover badge, `CookiePlay`, `DjKnobMark`, `useArtistHue`, `useRadioHue`.

&#x20;  - `home/cards.tsx`: `CardFrame` (168 / 132 / 120, radius 20·S/168; `round` for artists, `titleNode`, `letter`). Hover tilts −3° with a drop shadow, and the tonal Shuffle + coral cookie Play slide in. Playing shows a coral eq pill and a coral title. `AlbumCardHome` (Recently added / Rediscover, with the downloaded badge and dimmed when unavailable offline). Artists are 136/104 circles with a cookie play. New smart card + invite use the clover marks. The skeleton is a neutral shimmer.

&#x20;  - `mix/MixPage.tsx` + `mix.css` rewritten (own `mx-\*` classes, no longer the playlist table). The page is a `.hue-scope` on the mix hue. Layout: "← Home · Made for you" pill, a neutral header card (0.26, radius 32) with the tilted cover 208/176, the kicker in the mix colour, a 60px title, the why line, stats and `CookieButton` 80. Then Shuffle (tonal), Save as playlist (outlined, becomes "Saved"), more, and "🔒 Read-only · next refresh…". The list sits on a surface (radius 28) with rows of 60, # → eq / hover play, quality pill (230 / 295 hue), "New to you" yellow tag, and the current row in coral. On phone the header is stacked with icon actions and a 64px cookie; rows are 64. Expired: clover + cookie mark with autorenew, "This mix has been refreshed", and Today's mixes.

&#x20;  - New icons: today, explore, history, lock, autorenew, arrowR, sensors. `SHAPE\_CLOVER` in `shapes.ts`.

&#x20;  - The yearly recap shelf (`RecapShelf`) is unchanged, as decided.

5\. \*\*Library + search: done Oct 26.\*\*

&#x20;  - New \*\*All\*\* chip: albums, artists and playlists in one grid. `LibraryTab` now includes `'all'` (`#/library/all`, the new default); chips are All · Albums · Artists · Playlists · Songs with counts (search counts while typing).

&#x20;  - `library/Library.tsx` rewritten. Desktop header: 45px "Library" + counts, the 56px search pill (coral cookie mark), and Shuffle library. A sticky bar holds the chips, Timeline | Grid (List for songs) and a sort menu ("Sort by", check marks; Songs also has "Reverse order"). Phone: the top bar has shuffle + search. Search opens a search bar (back arrow · field) that hides the top bar (`html\[data-lib-search]`); the chips scroll, with a second row for sort · count · view icons.

&#x20;  - Sorts per chip (`libraryPrefs`: `allSort`, `playlistSort`, `views` per chip, plus the existing album / artist / song sorts). All / Playlists: Recently added, A–Z. Albums: Recently added, A–Z, Artist, Year. Artists: Recently added, A–Z, Most albums. Songs: Recently added, A–Z, Artist, Album, Duration.

&#x20;  - \*\*Timeline\*\* groups by the sort: added → Added this week / this month / Last 3 months / Earlier (ring + rail); A–Z / Artist → letters (tonal cookie heads) with an \*\*A–Z scrubber\*\* on the right (drag / tap, coral bubble); Year → decades. Grid is one plain grid.

&#x20;  - `library/libgrid.tsx` (new): `LibItem` model, `groupItems`, `useGridSize` (columns ≥150px, 2 on phone), `LibCard` (album / round artist / playlist / smart; type icon before the subtitle on All; offline badge and dim kept), `NewTile` (New playlist / New smart playlist on the Playlists chip), `CardGroups`, `SongRowM` + `SongCard` (surface card, 60px rows, cover with play / eq overlay, album, quality pill, time; virtualised per group with `useWindow`), `Scrubber`, `Hl`, `NoResultsMark`. Styles are in `library/lib2.css`; the old `library.css` stays for Stats (`lib-grid`).

&#x20;  - Search (`search/Search.tsx` rewritten). All: a Top result card (hue gradient, tilted art, 32px title, type chip, cookie play; compact row on phone) next to Songs (4 rows, See all), then Albums / Artists / Playlists rows (152 / 120 cards, See all scopes the chip). The other chips show the full grid or song list. No match: clover + search\_off, "Nothing in your library matches ‘…’", with Did you mean / Clear search. Matches are marked in coral.

&#x20;  - `LibrarySearch.tsx`: field + Recent searches (a panel under the desktop field when it's focused and empty, a list on phone; remove each, Clear all). Enter / Esc / ↓ behave as before.

&#x20;  - Kept: Offline only switch (Android), the offline banner, partial "n/m offline" counts, Play / Shuffle on Songs, drag to playlists, context menus, and scroll restore after clearing a search.

6\. \*\*Album, Artist, Playlist, Smart playlist + dialogs: done Oct 26.\*\*

&#x20;  - `library/detail.tsx` + `detail.css` (new kit): `DetailBack` (← Library › Albums), `DetailHero` (art · coral kicker · 57px title, smaller for long names), `ActBtn` (56px filled coral / tonal / outlined, radius 16 → 28 on hover), `MoreBtn`, `OfflineBlock` (Available offline + status + switch), `DtList` / `DtRow` (segmented list: 64px rows on 0.21, 2px apart, 24px outer corners; playing row 0.33 coral with 20px corners; # → eq / hover play; optional cover, stat, offline mark, time, ⋮), `DiscHead`, `DlMark`, `softDate`. Rows play on click (again: pause / resume).

&#x20;  - \*\*Album\*\*: hue-scope from the cover (a faint wash at the top, the cover glow in its colour), artist chip with photo, "8 tracks · 31:48", quality pill. Play / Shuffle / ⋮; right side: Available offline + Opus/FLAC (Android) or "Released … · Added … · size" (browser). Disc headers. "More by …" row of cards.

&#x20;  - \*\*Artist\*\*: 188 round photo, "Artist · genres", stats, Play / Shuffle / \*\*Following\*\* (new-release alerts = not muted in `releases`; icon-only on phone) / Download (Android) / ⋮. Left: \*\*Most played here\*\* (plays from history; "Songs" in album order when none) with covers and "n plays", Show all. Right: Albums / EPs / Singles cards (170). Banner kept.

&#x20;  - \*\*Playlist\*\*: cover (click = edit), "Playlist · By you · Updated …", description, stats, Play / Shuffle / ⋮, Available offline switch (Android, Undo on remove). Rows: cover, "artist · album" links, added / plays stat, offline mark, time, ⋮; songs that left the library are dimmed with ✕. Drag to reorder kept (desktop rows, phone grip).

&#x20;  - \*\*Smart playlist\*\*: yellow "✦ Smart playlist · Updates itself" kicker and a \*\*Rules\*\* card (a chip per rule with an icon, plus the sort / limit chip, Edit rules).

&#x20;  - `OfflineToggle.tsx`: `AlbumOfflineToggle` uses `OfflineBlock` (sentence-case status); new `PinOfflineToggle` for playlists.

&#x20;  - \*\*App-wide primitives\*\* (appended to `components/ui/material.css`): `.btn` M3 (40px pill; primary = coral container, secondary = tonal, ghost = coral text; `.btn-xl` 56px), `.ibtn` round, \*\*switch\*\* (52×32, coral with a check knob), \*\*segmented\*\* (outlined pill, picked = tonal coral + check), quality badge pill, download marks (✓ circle coral, coral ring, cloud), \*\*EmptyState\*\* with the clover mark. `ProgressRing` coral.

&#x20;  - \*\*Dialogs\*\* (`actions.css` appended + `Dialogs.tsx` / `SmartDialog.tsx`): 24px headline, outlined 56px fields (coral focus), coral text Cancel + coral filled OK; smart dialog presets as chips, rule rows as rounded cards, tonal selects, "Add rule" tonal, sentence-case labels. The Add to playlist picker stays the menu / sheet (restyled in phase 2), not the handoff's checkbox dialog.

7\. \*\*New releases: done Oct 26.\*\*

&#x20;  - `pages/releases/NewReleases.tsx`, `Discover.tsx`, `ReleasePanel.tsx`, `parts.tsx`, `releases.css` rewritten to match `NewReleasesMaterial.dc.html`.

&#x20;  - Header: radar status line + 45px (phone 28px) "New releases", Followed artists pill (icon-only 44px round on phone) + tonal coral Sweep button (48px / 44px radius 16) + 4px sweep progress bar. Desktop tabs (Upcoming, Out now, Discover) with pill active indicator and counts; phone 3-way segmented pill (`0.36 0.035 38` active). Filter chips (All / Unseen / Matching, artist popover / sheet, No reissues, Furthest first).

&#x20;  - \*\*Upcoming\*\*: weekly timeline with coral ring nodes + vertical rail (compact header row on phone), tabular countdowns (coral when ≤ 4 days), 64px / 60px covers, new dot, Remind me pill (44px round bell on phone).

&#x20;  - \*\*Out now\*\*: hero card with tilted cover (−4°), "NEWEST FROM YOUR MOST PLAYED" kicker, "I've got it" / "Play" / "Matching your files…" + Mark seen + MusicBrainz + Dismiss; desktop card grid with hover actions and status pills (`NEW` coral, `MATCHING` violet 290, `IN LIBRARY`); phone 76px swipe rows (swipe right = seen in coral, swipe left = dismiss) + swipe hint.

&#x20;  - \*\*Discover\*\*: full-width cards with 9-lobe cookie avatar, "Because you play …" + play counts, recent releases / top songs preview, "Add to sweep" / "In the sweep" + Not interested + MusicBrainz / Bandcamp links.

&#x20;  - \*\*Release detail & Followed artists panel\*\*: portalled to `document.body`; desktop 460px right popover clearing the floating player bar (`bottom: 140px`); phone full-width bottom sheet (`height: 86vh` for Followed artists) with `QueuePanel`-style swipe-down to close on the handle, pinned header, and top of the list. Followed artists pins the header, reissues card, and search box while only `.nrp-art-list` scrolls.

&#x20;  - Phone shell (`AppShell.tsx`, `phone.css`): single header on New releases (no duplicate `PhoneTopBar`) and `.shell-deco` coral dot grid + rings enabled on phone.

8\. \*\*DJ, Upload, Downloads, Settings, First run / sign-in / no library / expired: done Oct 26.\*\*

&#x20;  - \*\*DJ\*\* (`dj/DjMark.tsx`, `dj/mark.ts`, `dj/DjButton.tsx`, `dj/DjStart.tsx`, `dj/DjIntro.tsx`, `dj/DjPanel.tsx`, `dj/dj.css`, `nowplaying/parts.tsx`, `nowplaying/NowPlaying.tsx`): scalloped violet dial knob (`hue=290`, `MATERIAL MUSIC DJ` artwork label), M3 violet pill/tight-pill `DjButton` + adjacent `tune` panel button, 2-column desktop / compact phone `DjStart` with 28px Genre card and type cards/rows, `DjIntro` with `DJ` chip + `INTRO · Session N` pill + live violet word highlight + level bars, and 420px desktop popover / phone bottom sheet `DjPanel` on `oklch(0.22 0.012 60)`.

&#x20;  - \*\*Upload\*\* (`pages/upload/Upload.tsx`, `ReleaseList.tsx`, `Inspector.tsx`, `upload.css`, `state/uploadViews.ts`, `pages/PageHeader.tsx`): 45px/36px bold title above sentence-case subtitle, 56px rounded pill drop strip on desktop (`upload_file` + coral "Choose folders") and coral "Add" pill on phone, M3 filter chips, 68px/72px release rows with 4px/3px progress bars and Material Symbol status icons, 28px Inspector card (and phone bottom sheet) with amber issue card (`oklch(0.30 0.045 95)`), 8-column file slot grid, and tag editor.

&#x20;  - \*\*Downloads\*\* (`pages/downloads/Downloads.tsx`, `downloads.css`): M3 connected button group for quality (`Opus 160` | `Original FLAC`), 3-segment 10px storage bar (`Material Music`, `Other`, `Free`), phone settings card, `In progress` cards (`BusyRow`) with 4px coral progress bars and tonal pause/resume buttons, `On this device` rows (`DoneRow`) with tonal quality badges and `more_vert` remove menu, and 28px empty state card.

&#x20;  - \*\*Settings\*\* (`pages/settings/Settings.tsx`, `settings.css`): sticky 200px desktop sidebar (`45px` bold "Settings" + "Saved automatically" + coral active pill nav) and phone sticky top bar (`← Settings · Saved`), 28px rounded section cards (`oklch(0.205 0.008 40)`) with 44×44 tonal coral icon tiles, sentence-case hints with coral status dots, M3 connected button groups (`20px 8px 8px 20px` / `8px 20px 20px 8px` / `20px` active), vertical-thumb slider, and inline danger confirmations; unbuilt features remain hidden.

&#x20;  - \*\*First run / Sign-in / No library / Expired\*\* (`screens/SignIn.tsx`, `screens/LibraryStatus.tsx`, `screens/screens.css`): 28px panel frame with radial coral glow and `.shell-deco` coral dot grid + 3 rings, `SignIn` (`AppMark` 96px, "Material Music", coral "Continue with Google" pill), `expired` session view (88×88 amber `lock_clock` tile), `LoadingLibrary` (top 4px progress bar, coral sonar animation, 3-card/3-row counters, "Go to Home" CTA), `NoLibrary` (128px concentric coral rings + `folder_off` tile), and `LibraryError`.

&#x20;  - \*\*Button groups & ripple polish\*\* (`design/ripple.ts`, `styles/base.css`, `components/ui/Controls.tsx`, `components/ui/material.css`, `pages/library/lib2.css`, `pages/releases/releases.css`): connected button groups use exact half-height outer radii (`20px` / `22px` / `18px`) with `8px` inner radii so CSS corner-overlap scaling never flattens inner corners; `.mm-ripple` uses `border-radius: inherit` and a `ResizeObserver` so ripples track live button size and corner morphing.

9\. \*\*Android widget restyle, app icon + splash + favicon, in-app "Pelagic" text → Material Music: done Oct 26.\*\*

&#x20;  - \*\*Android widget (`WidgetArt.java`, `WidgetRenderer.java`, `res/layout/widget_*.xml`, `res/drawable/ic_wg_*.xml`, `res/values/widget.xml`)\*\*: restyled the existing Java `RemoteViews` widget to match `WidgetMaterial.dc.html` (no Glance/Kotlin rewrite; no like/favourite button). Added OKLCH palette scheme (`Scheme`) driven by album hue, brand coral (`38`) when idle, DJ violet (`290`) when DJ is active, and near-white (`hc=0`) for monochrome covers; 28dp outer corner radius with blurred cover light, radial scrim, dot grid, ring decoration, and 1.5dp rim; morphing squircle play/pause button (`12/18dp`, `16/24dp`, `16/28dp` radii); 4dp rounded progress bar; 8-lobe scalloped DJ knob (`ic_dj.xml` & `knobBitmap()`); Material Symbols Rounded transport icons; sentence-case status labels; `Up next` surface card on 3×3+/4×3+; and idle modes (`iTiny` 1×1, `iPill` 2×1, `iDual` Resume + Start DJ cards on 2×2/3×1/4×1/3×2, and `iGrid` 3/6 quick-start cards + 56dp "Shuffle library" pill on 4×2+/3×3+/4×3+).

&#x20;  - \*\*App icon, splash, favicon & widget preview\*\*: implemented Option 2b "Ink on coral" (`#FFAC8E` → `#F48E76` tile gradient, `#FFBEA3` 10-point burst rotated 10°, `#301812` eighth-note) across `app/public/favicon.svg`, `app/public/icons/*.png` (`apple-touch-icon`, `icon-192`, `icon-512`, `icon-maskable-192`, `icon-maskable-512`), `app/public/manifest.webmanifest` (`#141110`), `app/capacitor.config.ts` (`#141110` background, `#FEA387` notification colour), Android adaptive/launcher mipmaps (`ic_launcher`, `ic_launcher_round`, `ic_launcher_foreground`, `ic_launcher_monochrome`, `ic_launcher_bg_gradient.xml`, `ic_launcher_background.xml`), Android 12+ vector splash icon (`ic_splash_icon.xml` in `styles.xml`) + all `drawable*/splash.png` screens, status bar notification mark (`ic_wg_mark.xml`), and widget picker preview (`wg_preview.png`).

&#x20;  - \*\*User-visible "Pelagic" → "Material Music" sweep\*\*: updated remaining user-visible strings across `htmlEngine.ts`, `nativeEngine.ts`, `voice.ts`, `session.ts`, `smart.ts`, `library.ts`, `opus.ts`, `dev/Components.tsx`, `dev/Foundations.tsx`, `public/privacy.html`, `WidgetRenderer.java`, `PelagicNativePlugin.java`, `PelagicPlaybackService.java`, and `DownloadWorker.java`, while preserving all internal storage keys (`pelagic.*`), IndexedDB database name (`pelagic`), Google Drive folder name (`Pelagic`), and Java package/plugin names (`com.ivan.pelagic`, `Pelagic*Plugin`).

\## Design system notes (from the files)

\- Neutrals (hue 40): app bg `0.12–0.125`, screen `0.14–0.145`, surface `0.20 0.007`, list rows `0.21 0.008`, hover `0.235`/`0.26`, selected `0.25`, raised `0.26`, outline `0.34–0.38`, track `0.36–0.40`. Ink `0.94`, ink-2 `0.79`, ink-3 `0.62`.

\- Brand coral `oklch(0.80 0.115 38)`, on-coral `oklch(0.30 0.08 38)`, coral button container `oklch(0.42 0.10 38)` / `oklch(0.93 0.04 38)`, nav active / tonal `oklch(0.36 0.035 38)` / `oklch(0.92 0.025 38)`, tonal neutral button `0.30 0.012 40`. DJ violet: `lil 0.84 0.09 290`, `onLil 0.28 0.08 292`, `lilC 0.34 0.07 290`, `onLilC 0.93 0.04 290`. Yellow tags (smart, "New to you"): `0.82 0.08 95` / `0.30 0.05 95`.

\- Album: primary `0.82 0.11 H`, on-primary `0.26 0.06 H`, container `0.30 0.06 H`. Album colour only on elements under about 48px or 3px lines.

\- Toggles (shuffle / repeat): off = 46px transparent, radius 17; on = 34px, radius 11, album primary.

\- Chips: 36px radius 12 (phone 32 / 8), off = 0.20 + 1px 0.38 outline, on = tonal coral with a check.

\- Radii: cards/panels/player bar 28px, pills 999px, shelf cards 20·S/168. Motion: `cubic-bezier(0.31,0.94,0.34,1)` about 200ms; shape morph 520ms `cubic-bezier(0.38,1.21,0.22,1)`; spring `cubic-bezier(0.42,1.67,0.21,0.9)` 350ms for hover pops; play cookie spins 14s while playing.

