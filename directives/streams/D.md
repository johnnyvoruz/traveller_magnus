# Stream D — the store and the map's frame

Read `streams/README.md` first; it is the loop. Until Johnny stops you. Your entries go to
`reports/d_stream.md`; shots `findings/ui_design_shots/sd_<item>_*`; your ports as before (5341, 8941,
9941, 9541).

**Area:** `apps/web/src/workspace/market/`, `views/MapView.vue`, `shell/Rail.vue`, `map/MapRenderer.ts`
(not the route painting while Lane L claims it), the map's floating controls, tests under `tests/web/`.
The shared look is `design/base.css` ("The version-video look", Lane M's): use it; propose additions.

Decided 2026-10-17 on your `d_store_harden` questions: NEW stays "updated in the last 7 days"; cards
keep the date box (relative words as the tooltip); "Browse by kind" stays; the results bar sticks
below 1024 px.

## Queue
- [x] D1 **The package thumbnail is one column and one row off** (`market/place.ts` 171–173: no `-1`,
  per C's `archive/reports/c_own_sector_offset.md`). Use the map's `toGlobal` (`map/geometry.ts`) instead
  of a second formula; a test that the thumbnail and the map agree on Hollow Verge's six hexes.
- [x] D2 **The catalogue seen once:** keep the last catalogue answer in memory for the session, show
  it at once on a return to the store, refresh behind it, and swap without a shift (manifesto:
  "nothing seen before on this device shows a loading state again").
- [x] D3 **The map's floating controls in the look:** the search box, the date chip, the "YOUR MAP"
  banner, the first-visit hint, the hex hover tag ("2711 · empty"), the Column/Half/Full switch.
  Style and layout only.
- [x] D4 **"What's inside" shows the chart piece itself** (queued since kb26): the package's hexes
  drawn as the map draws them (world dots, names at a readable size), not empty outlines in a large
  panel; the box fits what it holds.
- [x] (answered 18:40, Johnny: crop at upload) D5 **Map covers at card size** (Hollow Verge reads as a few dots): for a map package without its
  own cover, the default art, or a crop that reads at 300 px. Show both in your entry; propose, don't
  pick, if it is a taste call.
- [x] D6 **The store at 390 px, every screen:** the sheet, the product page, the import panel, the
  Publish chooser, My packages; touch targets 44 px; nothing under the browser's bars.
- [x] D7 **The store's empty, error and slow states** in the look: no catalogue, a failed fetch
  (with Try again), a slow network (placeholders hold their size), a removed package's URL.
- [x] D8 (Z's report is in: `archive/reports/z_install_reservation.md`, contract F2; and decided 14:45: import `PACKAGE_KIND_FAMILIES` from `@voyage/shared` in place of `covers.ts`'s own copy) **Switch the store to Lane Z's `family=` and `author=` queries** once
  `reports/z_install_reservation.md` (or `done/`) says they are built; counts then come from the
  server. If Z's report isn't in when you get here, skip and come back.

- [x] D9 **Two sentences in `views/MapView.vue`** (from Lane E's E2): the chart failing to load shows a
  `TruthClient:` sentence: use "The chart could not be loaded."; "Loading N sector indexes." becomes
  "Loading N sectors.". Words only.

- [x] DT1 **T1, the Cargo and Ledger sections on a vessel** (Johnny: "trade first"; waits on Lane A's
  AT1 in `reports/a_stream.md`). Source: `directives/backlog_players_landing_trade.md`, Epic T, step
  T1 (your half): on the vessel's record page a **Cargo** section (rows, an "N of M t" gauge from the
  sheet's Cargo Capacity, "Add a lot": label, tons, paid, where, when from the clock) and a
  **Ledger** section (lines, balance, "Add a line": amount, memo, kind, date), in the shared look,
  money through A's `money.ts`. Saves ride the record save; no server. The ship sheet's sixteen Cargo and Passenger rows show and edit the same manifest through A's mapping (Johnny 15:30: yes); the sheet files are `SheetPanel.vue`/`SheetBox.vue` (claim; change only the binding of those rows, not the sheet's look). `RecordPage.vue` (claim; Lane N
  may hold it: wait). SSR tests of both sections; shots 1600 and 390.

- [x] DL5 **The map without a GPU, half resolution while moving** (Lane L's L5 proposal; Johnny's Edge has
  no GPU: every animated frame is 50 to 70 ms of main-thread rasterization at 4x CPU). While the
  camera moves, draw the map at half the device resolution and scale it up; one full-resolution
  frame when it settles. Only when the probe says WebGL is missing (`webglState()`, L5) or a frame
  budget is blown. Measure with `findings/kl_runtime/perf.mjs` before and after; see
  `findings/perf/stream_l_long_tasks.md`. `MapRenderer.ts` is yours.

- [x] DT2 **Refuel and "Post this month" on a vessel** (Lane A's AT2: `campaign/refuel.ts`): on the vessel's
  page, beside Cargo and Ledger (DT1), a **Refuel** control (refined or unrefined, the typed current
  level, the cost shown before posting, posts through `refuelLine`) and **Post this month** (posts
  `monthlyLines` from the sheet's seven cost boxes; shows what it will post first). Only where the ship
  is at a world with a starport, once the screen knows the world. No new rule.

- [x] DS5 **The subsector labels overlap at the top edge** (integration sweep finding 5): Jewell and Regina at the
  map's top edge, and the label cut at 390. `MapRenderer.ts` (claim it). Shots before and after.
- [x] DF18 **The publish form warns about a referee-only record** (players question 6, answered yes 18:40): when a
  chosen record is referee-only, one line under it: "This record is referee-only. Its "For players" text is published
  as it stands." No change to the data. Test the sentence appears and goes.
- [x] DS9 **"+ Publish" signed out** (sweep finding 9): shown to a visitor, first on the page at 390. Signed out it
  goes, or becomes "Sign in to publish" at the end of the row; your call, say which.
- [x] DU3 **"Where is everyone" on one card** (UX backlog U3, as written there): the Party tab's first card.
- [x] DU36 **The map's own help, in place** (U36, as written there).
- [x] DU4 **Phone pass on the five table screens** (U4, as written there): the party, the record page, the journal,
  the timeline, the dice; 390 shots of each; fix what doesn't fit.
- [x] DU27 **Portraits in rows** (U27, as written there).
- [x] DT1c **T1c on the vessel: Owners, Payment, Fuel, Upkeep** (after A's AT1c; backlog step T1c): on the vessel
  record beside Cargo and Ledger: an **Owners** list (holder, shares, share of the total; Add an owner from the
  campaign's people and organizations, or "The party"); a **Payment** line ("Cr12,000 every 28 days" only as typed,
  "Due in 5 days" / "Overdue by 3 days" in the look's warning colour, **Pay now** posts the ledger line); **Fuel**
  ("31 of 40 t" gauge, Refuel fills it); **Upkeep** (one monthly figure, its parts on hover or below). 390 px and
  1600 shots. Words by Google style.
- [x] DT3b **T3b on the vessel: Roll a passenger** (backlog step T3b): the button on the Passengers section, the dice and the result ("34 · Causes Trouble · 5: Violent"), **Keep** makes a person record linked as a passenger with the rolled skills in its summary, **Roll again**. After AT3b.
- [x] DF6 **Take half resolution out: the map always draws sharp** (Johnny 20:10, after seeing it in Edge without a GPU: "Oof, the half resolution pan looks terrible"; and 20:05, the dots doubling while zooming before the hexes appear) — **next, before anything else.** Remove DL5's half resolution while moving from `MapRenderer.ts` and `MapView.vue` (`setLowResWhileMoving`, `lowRes`, the slow-frame switch, `data-low-res`), and its test; full resolution on every frame, in every browser. Keep the settle logic only if something else needs it. If frames without a GPU are then slow, say by how much (your `findings/storefront/perf_d/` driver, Edge `--disable-gpu --disable-3d-apis`) and propose cheaper drawing that keeps every frame sharp (cached layers, fewer paths per frame, drawing less while moving but never blurrier); no proposal that lowers sharpness. Check by eye in that Edge at the dots tier and the hex tier, and say what you saw.
- [x] DF7 **The panel header at Column width** (Johnny 20:15: "we need to fix this header at the top of the sidebar ... it looks right on half"; shots `findings/johnny_shots_2026-10-17/header_column.png` and `header_half.png`) — right after DF6; you hold `shell/Panel.vue`. At Column the title, the hex badge, the Column/Half/Full switch and back/close fight for one row: the badge drops under the title and the switch crowds it. Make Column read as cleanly as Half: e.g. title and badge on the first row with back and close, the location line and the switch on the second; or a compact switch at Column. Same in every panel that uses the header (dossier, campaign, store). Shots at Column, Half and Full, at 1600 and 390, before and after.
- [x] DF8 **Hover on what can be clicked when zoomed out** (Johnny 20:20: "lets add hover effect when we're over a point we can click on in the zoomed out map, I didn't realize we could click on stuff so zoomed out, need hover to let the user know") — after DF7. At every tier below the hex tier, find what a click there opens today (an overview dot, a chart disc, a far label, a sector or subsector name, your own systems' dots, public tracks) and give each the same hover: the pointer cursor, a ring or lift on the thing under the pointer in the look (`design_reference.md`, tokens only), and a small data block with what the click opens (the system's name and hex where the loaded data has them; otherwise the sector and hex; never a fetch per hover). Hit-test on pointer move at most once a frame, on its own overlay so the chart never redraws for a hover; sharp at every frame (no half resolution: `decisions.md` 20:10); nothing on touch (a tap behaves as today). Test the hit-test per tier with a fixture; shots at the dots and subsector tiers in Edge without a GPU.
- [x] DF1 (found) **A product page seen once:** a return to a package's page shows "Loading the package"
  placeholders again, and "More by" asks for the whole catalogue each visit. Keep the page's answer for
  the session as D2 keeps the catalogue's; take "More by" from the kept catalogue; refresh behind.
- [x] DF2 (found) **The map's search said "No results match your search." for "Regi"** on my local
  state (sd_D3_search_before_1600.png). Find whether it is the local state's missing data or a fault.
- [x] DF3 (found) **The Build strip's notes** ("This map is your own copy…", "Select an empty hex…") in
  the look of the strip above them (frame edge and halo), style only.
- [x] DF4 (found) **The store's rail hides Build for a signed-in person on a cold visit:** the store
  offers Build only once a campaign is open, and only the map opens one, so the rail differs from the
  map's. Offer it whenever someone is signed in (it opens the map with Build on, and the map opens
  the campaign).
- [x] DF5 (found) **A card's kind badge is about 41 px of target at 390** (D6): it sits 8 px under the
  card's edge, which clips its hit area. Make the badge itself taller on touch so it reaches 44 px.
- [x] (approved 20:30) DF9 (found, proposal in d_stream.md DF6) **The galaxy dots batched and kept:** at the galaxy zoom `overviewPoints` draws every system on screen as its own 1 px `fillRect` each frame (71% of a frame; 33 fps at real speed without a GPU, 8 fps at 4x). Draw each sector's dots once per zoom step into a small bitmap and blit it while panning; skip sectors off screen. Same pixels, never blurrier. Half a day, `MapRenderer.ts`.
- [x] DU3b **A party member aboard no ship, one rule** (your DU3 question, decided 20:30 as you recommend): the people rows in `PartyPanel.vue` use the same rule as the card (the party's anchor when it has one, else the person's own record).
- [x] DF10 (found) **Lines painted over dots:** at the dots tier a subsector or sector line crossing a system's dot is drawn on top of it, and the dot reads as two halves (`sd_DF6_zoom_step2_crop.png`). Draw the dots after the lines. `MapRenderer.ts`.
- [x] LS3 **Living systems: the switches** (`spec_living_systems.md` §5 row LS3): `living` in campaign settings, the referee's two switches, "Quiet on this device" in the account menu. After A's LS1.
- [x] XD1 **X-boat ripples: the layer and the scrubber** (`spec_xboat_ripples.md` §5 "D1"), then **XD2** the dossier button, the hover block, the reverse mode ("D2"), then **XD3** "Spread this news" ("D3"). After A's XA2. Sharp at every frame (no half resolution).
- [x] DT2b **Naval or scout, on a party vessel** (Johnny 20:39: base fuel only for "ref named ships that players are attached to"): on a vessel in the party, a referee-only mark "Naval vessel" / "Scout ship"; the Refuel sheet shows the class's grade, and base fuel when the world has that base and the mark is set, with a typed price. After A's AT2b.
- [x] (decided 21:10: only if a real machine is slow) DF11 (found, proposal in d_stream.md) **The galaxy's polity fills and borders as one kept layer:** after DF9, a galaxy-zoom frame at 4x CPU without a GPU is still 117 ms, and 87% of it is the browser painting the large translucent polity fills and borders (the script is under 10 ms). At real speed it is already 17 ms (DF9). Propose only if a real machine is slow there.
- [x] (decided 21:10, built as AT2c and DF12b) DF12 (found, question in d_stream.md) **"Post this month" posts the Purchase Cost every month**, and its total disagrees with the Upkeep figure beside it (seven boxes against five).
- [x] DF12b **Post this month, the words** (your DF12, decided 21:10 as you recommend; A's AT2c changes the list): the button and its line say it posts the upkeep (the same figure as Upkeep). After AT2c.
- [x] DU7 **Quick capture** (UX backlog U7, as written there): `Ctrl+Shift+N` anywhere, a one-line note box; E may edit the words later.
- [x] (decided 21:45, built as DU18b) DU18 **Settings that are per device** (U18, as written there): one small sheet in the account pop-up; "Quiet on this device" (LS3) lives there too.
- [x] DU22b **The map's live region** (E's EU22 leftover, decided 21:10): a polite live region that names the selected system or hex when the selection changes by keyboard or click; nothing on hover.
DF11 (the kept galaxy layer): decided 21:10 as you recommend, only if a real machine is slow at the galaxy zoom; not queued.
- [x] LS3b **The settings screen reads `living/words.ts`** (E's LS2 question 1, decided 21:45): the living-systems switch sentences come from E's `words.ts`, not written out twice.
- [x] DU18b **"This device" in the account menu** (your DU18 proposal, decided 21:45 as you recommend: units keep Johnny's 2026-10-03 rule, Celsius first, both scales; date form is per campaign, a separate item; reduced motion stays the system's; density and sound out): a small "This device" group holding Quiet on this device, nothing more.
- [x] DU10 **The account menu becomes a Campaigns panel** (UX backlog U10, as written there).
- [x] DU13 **Keyboard help from the registry** (U13, as written there): the help screen lists the keys the registry holds, so Q (quick note) and the others appear without a hand-kept list.
DU7's key: **Q** (decided 21:45: Ctrl+Shift+N never reaches the page in Edge or Chrome).
- [x] DU2 **Jump-range ring** (UX backlog U2, as written there): with a party ship selected, the hexes within its jump number (the sheet's typed jump rating; one parsec a jump number, `rules/mgt2e_space_travel.json` `jump.parsecsPerJumpNumber`); sharp, on its own layer.
- [x] DU39 **Relationship web** (U39, as written there).
- [x] DU31 **Print and PDF** (U31, as written there): the character sheet, the ship sheet, a record page, through the browser's print with a print stylesheet; no server.
- [x] DF13 **Your in-progress map files are red in others' runs** (orchestrator 22:20): A saw `map/jump_ring.ts(84,17) TS1294` fail the build and `tests/web/party_ships_map.test.js` fail on a traffic-canvas rule in `MapView.vue`. Finish DU2 with both green. DU10's question decided: **My packages stays** in the account menu.
- [x] DF14 (found) **A vessel's place line ignores its track:** the record page header, the records list row and the relationship web say the stored anchor (Bright Ledger "Spinward Marches 1910") while the Where block and the record card follow the track to the campaign date (2007). One helper for the place a record is at now, used by all three.
Decided 23:10 (your questions): **XD3** hide "Spread this news" when the date is missing, show it unable (the why on hover) only when the date is there and the place isn't; **DU39** the web opens at Half; **DU2** the jump number is read from the sheet's Jump Drive Output box (a choice of field, not a rule). XD1's three deviations (rings, its own zoomed-out dots, drawing every frame) stand unless Johnny says otherwise.
- [x] XD3b **The Spread this news rule** as decided above. First.
- [x] DU40 **Org chart** (UX backlog U40, as written there).
- [x] DU6 **The timeline that fills itself, the screen** (U6, D's half), after A's AU6.
- [x] P5 **Players, the referee's screens** (`players_build_plan.md` step P5, as written; contract `contracts/b_players.md`) — after A's P3: the invite link (Make, Copy, Revoke, expiry), members in **Playing** and **Archived** with **Archive** / **Bring back** and "Which one" (their person), "This campaign has 255 players, the most it can have." only when full, **View as players** in the campaign panel header (runs `playersView` in the browser, with the banner "You're seeing what players see"), "Playing in" in the Campaigns panel.
- [x] (note 23:40, A's P3 question: P6 mounts `NOT_IN_CAMPAIGN` from `workspace/campaigns.ts` when the store's status is `'gone'`) P6 **Players, the player's campaign panel** (`players_build_plan.md` step P6, as written) — after P5 and A's P9: read-only records with "For players" as the body, Party read-only, Journal with **Add a note**, Timeline as today, no Build on the rail ("Build is the referee's"), **never a count of hidden things**.
Decided 23:32: DU40 **`commands` is the leader** (no new `leads` kind); DF14's choice lists keep the stored anchor; DU31's "print a subsector" proposal is parked until Johnny asks for printed maps.
- [x] DF15 **Scroll-wheel zoom lost on the surface map: blocks 1.3.0, before the freeze line** (Johnny 2026-10-18 11:25: "we lost scroll zoom on the surface map, can only zoom in and out with the buttons on the map"; it worked in 1.2.3). `dossier/SurfaceStage.vue` adds its wheel listener once, in `onMounted` (~1051: `stageEl.value?.addEventListener('wheel', onStageWheel, { passive: false })`), but the stage sits inside `<div v-if="mappable">` (~1071) and a `Teleport`, so if the target arrives after mount (CW1 and CS9 changed the dossier's loading and the stage) `stageEl` is null then and the wheel never attaches; the buttons are template bindings, so they still work. **Reproduce first** (a real page in Edge, the large map, a wheel over it), confirm or replace that cause, then fix it so it cannot recur: bind the wheel in the template (`@wheel="onStageWheel"`; Vue's listener is not passive, so `preventDefault` holds) or watch `stageEl` and attach and detach as it changes; remove the `onMounted`/`onBeforeUnmount` pair if the template binding replaces it. Check the small (in-panel) map too: whether the wheel zooms there was 1.2.6's behaviour; keep that as it was (the handler returns early when not large). A test that mounts the stage with the target arriving after mount and sees a wheel zoom change the view; the hover (CS9) still works. Claim the file (C is in the orbit view, not here). Small: do it now.
- [ ] **FREEZE for push 1.3.0 (orchestrator 2026-10-18 10:20): finish the item you are on, write its entry, release your claims, then start nothing new until the orchestrator removes this line.** (Not an item to tick.)
- [ ] DJ1 **A jump time advances the campaign clock** (Johnny 10:00: "when a user clicks on any of the 100D jump travel times, it will advance the time in their campaign by the amount on the jump time"): in `dossier/JourneyTimes.vue` the six tiles (1G to 6G) become buttons **only** for the referee with a campaign open and its clock set (signed out, a player, no campaign, or no clock: plain tiles as today). Click or Enter: the campaign clock advances by that tile's exact hours (the clock is days with a fraction: hours / 24), through the store's clock change (the same path the Time drawer uses: `ClockChange` with `baseRev`, conflicts as usual). Hover and focus in the look (tokens only), a label such as "Advance the campaign 24.3 hours"; after the click a toast with the new campaign date and "Advanced 24.3 hours" (no Undo: CRUD over undo; the Time drawer sets it back). The time only: no ship moves, no journal entry. Tests: a referee's click sends one clock change of hours/24 with the held rev; a player and a signed-out view render no buttons. Shots at Column and Half.
- [ ] (HOLD: after Z's SI6 and A's SI2) SI3 **Session ingest, the screens** (`spec_session_ingest.md` §5 SI3 as written, plus decisions 10:00): the Proposals section and cards (a conflict uses the existing conflict look), Agent access (token list and make), and **Copy for your AI** in the campaign panel's menu, referee only: a small sheet with the parts (All; Ships; Characters; People, places and things; Journal: decisions 10:40), each with its size, then **Copy** and **Download** (`<campaign>-for-your-ai.md`) from A's `aiSnapshot`; and **Paste your AI's reply** in the Proposals section (a text box and a file drop; errors name the proposal and the field), decisions 10:15. Never the word "snapshot" on screen.
