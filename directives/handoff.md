# Handoff — orchestrator log

One section per orchestrator turn, newest last; the next section is 298. Sections 1 to 290 are in
`archive/handoff_sections_1_to_290.md` (history, never read at session start).
The state is `orchestrator_state.md` and `board.md`; a new orchestrator session starts at `ORCHESTRATOR.md`.
Decisions live in `decisions.md`, not here.

## 291. Six reports; 1.2.3 called without B's course; Z's covers ready to seed (2026-10-15 22:25)

- **D `d_store_scroll` accepted:** `.mk-scroll` full-window scroller in `PackagesView.vue` (the account page's pattern), reset to top on a new path; proof at 1600/768/390 with wheel over the margins. D's question decided: Back restores the store's scroll (in `d_store_2` 4c).
- **E `e_uwp_dots` accepted:** `bare` CodeNote on the ribbon tiles, hover lift; orchestrator looked at `kb27_uwp_1600_hover`.
- **C `c_surface_zoom` accepted:** `HEX_READ_PX` 320, a sharp window past the bake, fine grain octaves 3 and 4; parity script exit 0 (its `ok: false` is the pinned known differences, as in `c_surface_map_2`). Orchestrator looked at temperate 48 and 320 and vanilla ice 320. A full window on a large stage paints in seconds (chunked, bake shown meanwhile).
- **B `b_public_course` accepted, held:** shipping it alone would publish courses before the checkbox exists. D's `d_store_2` now draws `course` and adds the checkbox; B's paths ride with that push. B's question (old example cards keep `course: []` until rewritten): leave until the next seed.
- **Z `z_cover_seed` accepted:** covers onto `findings/examples/local` (production's ids), duplicate guard, column fit, stand-in proof; Johnny's two commands given. Z's questions: yes to rewriting the six rows with their own values; delete `local_backup_pre_covers` after production shows the covers.
- **Z `z_records_only` halted, answered:** today's install keeps every anchor; decided: hex packages unchanged; records-only keeps chart anchors whatever the truth version, drops own-sector anchors and counts them. Halt report filed as `done/z_records_only_halt.md`.
- **1.2.3 called:** `findings/push/release_2026-10-15b.md`, 37 paths, `outer24`: 1766 pass, 1 fail (the known renderer timing flake; 3 of 3 alone), build `index-CTGrh87X.js`. `versionvideo/` held (Johnny's edits).

## 292. 1.2.3 live; D and Z reports; 1.2.4 called on two of D's questions (2026-10-16 18:05)

- **1.2.3 live:** `10e6d8d` on origin; live index `index-CTGrh87X.js` (the rehearsal's). Johnny is running Z's cover seed; at 18:00 the catalogue still answered `cover: null` on all six.
- **D `d_store_2` accepted:** filter column (Kind, Contents, Edition, Tags, Updated, Publisher; counts over the other sections), sheet below 1024 in the URL (`filters=1`), results line, chips, pages of 24, Back restores the store's scroll per entry; solid public route (track dimmed, course bright with a 10 px arrowhead, 7 px at the present hex with no course); lime card, Route row gone; "Publish my ships' course" in `AccountMenu.vue` (disabled before 0020; 503 sentence). D raised the track to 70% (45% measured 2.33:1). D found no route drawn for the party's own ships anywhere. Orchestrator looked at `kb27_route_course_1600` and `kb27_store2_column_1600`; "See more" grey in the shot predates D's `.mk-link` (shot 22:29, file 22:31). Flaw queued: the featured row repeats the grid's first three.
- **Z `z_records_only` accepted:** `hexKeys` without a minimum; 400 "A package needs at least one hex or one record."; a placement on a records-only package 400; own-sector anchors nulled and counted in `records.anchorsDropped`; contract section F18. Server only; D's screens are queued.
- **1.2.4 called:** `findings/push/release_2026-10-16.md`, 46 paths plus the directive files, `outer25`: 1828 tests, 1783 pass, 0 fail; checker, typecheck, `vue-tsc -b` clean; build `index-Cpo2OS6L.js`. 0020 rides with it. Waits on D's questions 1 and 3.
- **18:10, Johnny: yes to D's three.** Track 70%; own ships' routes in cyan (`prompts/d_store_3.md`, with the records-only screens and the featured-row repeat); tag links local. Covers seeded and live (Chrome: store scrolls, nine covers load); `local_backup_pre_covers` deleted. `prompts/a_test_flakes.md` written. Both go after the 1.2.4 push.

## 293. 1.2.4 live; A and D reports; 1.2.5 called on two of D's questions (2026-10-16 22:25)

- **1.2.4 live:** `0c387f2` on origin; live index `index-Cpo2OS6L.js` (the rehearsal's); 0020 applied (`/api/universes` items carry `showCourse`); Chrome: the filter column, covers, "See more" as a link; the featured repeat still live (fixed in 1.2.5).
- **A `a_test_flakes` accepted:** the fade test stubs `performance.now` (one fifth of `tFast` per frame); cause: a `setTimeout(10)` gap of 50 ms or more finished the fade in one frame. `store_scroll.test.js` reads source only; left. A's suite failed once in `tests/tools/examples.test.js` (seeding dry run, port 8872, shared stand-in) while D's suite ran; 11/11 alone (orchestrator). Queued.
- **D `d_store_3` accepted:** Publish records (`CampaignList.vue` entry, `RecordsPublish.vue`, shared `PublishFields.vue`), card "Records only", page without the hex box, import without placement and "N records lose their place on the map."; grid leaves out the featured cards; own route (`party_route.ts`, `setPartyRoute`, `--signal`; course 8.67:1, track 4.48:1). Orchestrator looked at `kb28_route_course_1600`, `kb28_records_import_1600`, `kb28_store_norepeat_1600`. Three questions to Johnny (board).
- **1.2.5 called:** `findings/push/release_2026-10-16b.md`, `outer26`: 1837 tests, 1792 pass, 0 fail; checker, typecheck, `vue-tsc -b` clean; build `index-rWBScAd1.js`. Waits on D's questions 2 and 3.
- **2026-10-17, Johnny: yes to D's three.** `recordCount` goes to Z (the marketplace server is Z's since 2026-10-14; the question had said B): `prompts/z_card_record_count.md`, go now (its files are outside 1.2.5). D `prompts/d_import_style.md` after the 1.2.5 push. 1.2.5 stands as built.

## 294. 1.2.5 live; Z's record count; the store to be hardened; a changelog (2026-10-17 12:20)

- **1.2.5 live:** `2f16058` on origin; live index `index-rWBScAd1.js` (the rehearsal's).
- **Z `z_card_record_count` accepted:** optional `recordCount` on `PackageCard` and `PackagePublicPage`, read with `hex_count` in one query (`countedListingOf`); catalogue, mine, hidden and the page. Z's question decided: the author's stub list (`PackageListing`) stays without it.
- **Johnny:** asked the flow for publishing campaign items (answered in chat: records via Publish on the records list; hexes via Build, select, Publish selection; share the package link; others import); wants a changelog from the version number; the marketplace was not built to the manifesto, filter clicks disorient, it feels like a different app (keep the logo or a top nav); and the version videos' look on the marketplace.
- **Measured on production (Chrome):** a filter tick scrolled `.mk-scroll` from 131 to 0 in one frame (the results shrank below the window), Tags rebuilt from ten choices to five, "Records only" vanished, the featured row went, each tick pushed history. No remount, no image reload.
- **Prompts:** D `d_store_harden.md` (after `d_import_style`): the store inside the app frame with `Rail.vue` and the videos' red-V wordmark; filters that hold still (0 px, choices dim at 0, results keep the window's height, replace not push); the manifesto table; Publish chooser; the version videos' look (ground, kickers, hairline rules, framed panels, date boxes). E `e_changelog.md`: `changelog.ts` backfilled from git log in players' words, the window behind "Version · What's new" in three places, `/changes`, a test that the first entry is APP_VERSION.

## 295. D's import styles; 1.2.6 called; every lane given work (2026-10-17 12:40)

- **D `d_import_style` accepted:** `market/market.css` (`.mk-sum`, `.mk-fine`) imported by the store and the publish fields; `build-fine`/`build-link` replaced in the import panel, product page, cover editor and imports list; `tests/web/import_style.test.js` fails on any class styled only in a lazily loaded file (9 on the old panel). D's two questions decided (board).
- **1.2.6 called:** 24 paths, `outer27`: 1843 tests, 1798 pass, 0 fail; build `index-CF1BRS3K.js`.
- **Johnny: "get all the agents working".** Prompts: A `a_shared_encoder` (one encoder; tests that run side by side), B `b_quota_reservation` (its 0013 design), C `c_own_sector_offset` (investigation), Z `z_parked_truth_build` (finish, shelve or split the ten files parked since 10-07). D and E as in 294.
- **Two direction questions to Johnny** (chat): Z's next build (recommended: the players' view link, the last part of Slice 4); convert the people and patrons example packs to records-only (recommended: yes).
- **13:00, three extra lanes for today (Johnny: "L/M/N", reset in 5 hours; "okay with UX / UI improvements … Claude is good at frontend").** L `l_discs_without_webgl` (software discs from the CPU sheet; the WebGL path untouched); M `m_video_look` (the videos' look as shared `design/base.css` pieces first, then the journal and timeline); N `n_record_page` ("Mentioned in", "On the timeline", then M's look). D's `d_store_harden` item 5 amended to use M's pieces, not its own. The API-suite sweep is queued.

## 296. 1.2.6 live; streams for L, M and N; seven reports (2026-10-17 14:00)

- **1.2.6 live:** `d6658f5`, index `index-CF1BRS3K.js` (the rehearsal's).
- **Johnny:** "Have LMN do work that can constantly be in progress … we don't have to push for a while, the goal is maximum productivity." New: `directives/streams/` (README = the loop: take an item, claim files in `claims.md`, gates, entry in `reports/<lane>_stream.md`, next item at once; proposals and blocked items don't stop the lane; "Found by me" when the queue runs out). Queues: L rendering (software discs, orbit without WebGL, orbit look, 390, 50 ms budget, no pop-in, traffic, keyboard); M the look across the app, style only; N the campaign connected (N0 finishes the record page's timeline hand-off).
- **Accepted:** A `a_shared_encoder` (partial: tests isolated; encoder merge decided, `a_encoder_merge`); B `b_quota_reservation` (DO `object_reservations`, 15 min expiry, generate, images and builder writers; installs need Z: `z_install_reservation`; the `universes` suite's 1.1.0 pin: `b_universes_pin` with `test:api:all`); C `c_own_sector_offset` (one formula; Z's 15 hexes = distance to the sector centre; `market/place.ts` thumbnail one column and row off, queued for D); E `e_changelog` (entries 1.1.1 to 1.2.6 read well; `/changes`); M `m_video_look` (shared pieces in `base.css`, journal and timeline; dot contrast decided); N `n_record_page` (Mentioned in, On the timeline; questions decided).
- **Z `z_parked_truth_build`:** split (finish dev_make_admin, inputs, the remove route, a cap-safe test; shelve the reconcile hardening, the seal as written, the preview); README at `findings/parked/truth_build_2026-10-07/`; four questions to Johnny (board).
- **14:10, D `d_store_harden` accepted:** the store inside the rail with the red-V wordmark, M's ground, kickers, frames and date boxes; steadiness 22 of 22 (steady.log), kb30_filters.gif; Publish chooser; the manifesto table; 1871 pass. Orchestrator looked at kb30_store_1600 and kb30_product_1600: one app now. D's four decided (board). **D and E on streams too** (`streams/D.md`, `streams/E.md`); `lanes/START.md` step 2 sends a "stream" row to its queue. C free (its area overlaps L's today).
- **14:15, Johnny: "yes to all six, all agents started".** The Worker is on Workers Paid. Z on a stream (`streams/Z.md`): Z1 its current prompt, Z2 the parked split (finish four, shelve six to `findings/parked/` by file edits), Z3 the seal step in `upload_truth.js`, Z4 two packs to records-only, Z5 the players' view contract (proposal, stop there), Z6 catalogue facets.
- **14:30:** A `a_encoder_merge` accepted; A on a stream (`streams/A.md`: dice roller per Johnny's default "shows the dice and interprets nothing", truth_client fetched once, the one-sector limit before a request, dossier model speed). Stream entries reviewed: D1 (thumbnail on the map's geometry; no visible change), N0 (timeline hand-off works at 1600 and 390; Where kicker). N saw the campaign tabs overlap at 1600: added to M1. `packages_migration.test.js` failed in N's full run, passes alone: added to B's prompt as item 4.
- **14:45:** accepted L `l_discs_without_webgl` (software discs from the dossier's own sheets in a worker; WebGL path unchanged on both parity pages; Regina 20 discs 735 ms first paint at DPR 2; flags need `--disable-3d-apis` to match Johnny's Edge), Z `z_install_reservation` (installs reserve and release; `family=`, `author=`), E stream E1 (`/help` guide, palette Help, link from What's new). L's and Z's questions decided (board). `contracts/b_builder.md` install line updated by the orchestrator.
- **15:20, a request for a public API and MCP server: PAUSED by Johnny** ("not ready to foot this bill yet"). Shape, costs (about $175/month worst case for sustained uncached scraping) and must-haves in `findings/api_mcp_paused.md`.
- **14:50, stream entries reviewed:** D4 (What's inside drawn by the map's renderer), D5 (proposal: map covers at card size, question to Johnny), D6 (390: every store control 44 px), E2 (error sentences; server list queued for B; two MapView sentences as D9), L1b, L2 (nothing else in the orbit view used WebGL), M3, M4, N3 (grouped, virtual past 200), N4 (palette commands; "New vessel" decided).
- **15:05, Johnny on the dice roller:** "always just be d6, this notation thing is too complex … simple and streamlined. I love the dice rolling system we have on traveller.voyage/sheets/man-in-the-low-berth/." A1 rewritten: 1D/2D/3D buttons only, the sheet's tumbling 3D dice and result card, tokens only, interprets nothing; A had a notation roller half built in `apps/web/src/dice/`.
- **15:10, Johnny: "There's boon and bane dice too."** No text in `rules/`, `assets/` or the low-berth sheet; A1 builds the toggles and holds their effect for Johnny's words. Stream entries: L3 accepted (orbit view in the look). `tests/web/contrast.test.js` had a syntax error mid-edit at 14:43 (another lane's, the records-list group count line): watch.
- **15:15, Johnny (rules): "Boon rolls 3D keeps best two, bane keeps worst two."** Written into A1: toggles, mutually exclusive (UI choice), 3D with the dropped die dimmed, count buttons held at 2D while on.
- **15:30, A1 accepted** (d6 only, 1D/2D/3D, sheet-style tumbling dice and card, Boon/Bane per Johnny, R key yields to the builder's Roll again). A1b queued: toggles don't roll (2D stays the throw); the dropped die dimmed in the tray and shown as a small face on the card. A's question 2 (card, not toast): yes.
- **15:12:** A1b accepted (toggles are settings; dropped die dimmed in the tray, faces with pips on the card). E3 store, campaign, party, journal, dossier accepted (words; Build left for D/M claims, E7). A5 queued: the journal-mention timing test. Johnny says another agent is writing new backlog items; nothing has landed in `directives/` yet (15:10). C waits for it.

## 297. Two backlogs; B and C on streams; P0, P1, L1, L2, T1 issued (2026-10-17 15:25)

- **New:** `directives/backlog_players_landing_trade.md` (Epics P players, L landing, T trade; Johnny: "players first, landing page now, trade first") and `directives/backlog_ux_industry_best.md` (U1 to U44, four tiers), written by a review session.
- **Issued (Johnny relayed: "issue P0 (B contract), P1 (A), L1 and L2 (stream lanes) and T1 (A, D)"):** B on a stream (`streams/B.md`: B1 its prompt, B2 the players contract P0, B3 the server's sentences); C on a fresh stream (`streams/C.md`: L1, L2 with the `/help` cold-load blank, L3, U19, U35, U20); A gains AP1 (players_view.ts) and AT1 (cargo, passengers, ledger shape); D gains DT1 (Cargo and Ledger sections, after AT1).
- B was waiting on `truth_build.test.js` (510 s; parked, Z2's): told to skip it.
- Eight questions from the backlogs to Johnny (board).
- **15:30, Johnny: "yes to all eight, C started".** Players write notes; 12 players; no second referee now; the positioning draft stands for Johnny to edit; fair use words are Johnny's, welcome window only; the sheet's Cargo and Passenger rows become a view of the manifest (added to AT1 and DT1); Johnny supplies `rules/mgt2e_trade.json`; party cash separate. B2, AT1, DT1, C's header updated.
- **15:35, Johnny: "trade.txt is in the assets folder"** (`assets/trade.txt`, 854 lines, MgT2E trade chapter, tables wrapped by extraction: passengers, freight, traffic tables, fares by parsec, supplier, brokers, purchase and sale, illegal goods, the trade goods table). Z's ZT0 (after Z2): draft `findings/rules_drafts/mgt2e_trade.json` from it, every value cited by line, nulls with questions where scrambled; Johnny moves it to `rules/`.
- **15:40, N's entries reviewed:** N5 (timeline takes focus on open), N6 (links both ways: already built), N9 partial, N10 (three connections on the hover card), N8 partial (cold URLs; a missing entry titled "New session", N11). N's scoped-registry proposal decided yes (N12). `CampaignPanel.vue` is the hot file: A, E, M and N have each waited on it.
- **15:45, N wrapped:** clean (claims released, servers stopped). Its leftovers (N7, N8 timeline URL, N9b, N11, N12 scoped registry) to E as EN1. N fixed the journal-mention timing test (A5 marked done). `findings/kn_runtime/`, `findings/kn_state/` are N's scratch.

## 298. The directives cleanup (2026-10-17, Johnny's word; `prompts/orchestrator_cleanup_2026-10-17.md`)

- **Archive:** `directives/archive/` (README), `archive/prompts/` (222 finished or pre-file-bus prompts), `archive/reports/` (157 reviewed reports; `reports/done/` left empty), `archive/legacy/` (8 legacy specs), 12 orientation pages and finished recipes, and `archive/handoff_sections_1_to_290.md` (the whole old handoff). Nothing deleted. Move lists: `findings/cleanup_moves_step2.txt`, `_step2b.txt`, `_step5.txt`.
- **handoff.md** now holds sections 291 on (17.7 KB). **decisions.md** (new): Johnny's decisions and the orchestrator's, newest first, wording unchanged, plus every answered question and the 26 interim choices that stand (blank Answer line, the old file's rule). **questions_for_johnny.md**: open only (the legacy tree, new; G22, D2, D4 from 10-07). **board.md** 6.9 KB: lane table unchanged; dead sections removed; Direction for 2026-10-17; Known, not fixed trimmed to what is unfixed live.
- **README.md** rewritten; **BOOT.md** one line and **lanes/START.md** the same change six times (`archive/reports/`); **ORCHESTRATOR.md** reads decisions.md; **orchestrator_state.md** engine line fixed (e1.2 live since 1.2.0); **plan.md** status note; `campaign_manager_plan.md` and `plan_engine_corrections.md` status lines; paths repointed in plan.md, data_model.md, legacy_map_inventory.md, campaign_manager_plan.md, CLAUDE.md.
- **CLAUDE.md:** reading order is BOOT.md or ORCHESTRATOR.md; roles rewritten for lanes, streams and claims; done = test, check, typecheck, build; the legacy tree's removal is Johnny's question.
- `npm run check` clean. Found, not fixed: BOOT.md step 2 doesn't route a "stream" row (START.md does); stream queues cite `reports/done/<x>.md`, now in `archive/reports/` (streams were not to be touched).

## 299. L and M wrapped; how to run stream mode (2026-10-17 16:20)

- **L wrapped:** L1 to L5 accepted (software discs; the orbit view without WebGL, in the look, at 390 with 44 px targets; the 50 ms budget: the sector-zoom grid cached as Path2D, reduced-motion read once a second, the WebGL probe in a worker, one path for ringlets; log `findings/perf/stream_l_long_tasks.md`). Proposals routed: `viewport-fit=cover` (C, CL4); half resolution while moving without a GPU (D, DL5). Open in its queue: L6 to L8.
- **M wrapped:** M1 to M8 accepted (records list, party, characters, dossier kickers, Build pane, account page and changelog window, toast; OmniBox's field edge put back to 3:1). M's question decided: changelog dates in `.ui-date` (E, EM7). M9 and M1b to E (EM9); M10 stays in its queue.
- To check before the next push: M8's full run failed "public games are tracks at the hex tier, drawn on their own layer…" while L5 was changing `MapRenderer.ts`'s grid; rerun on the settled tree.
- **`streams/HOW_TO_RUN.md`** (Johnny: "make a note on how we can go back into stream mode again later or for any of the lanes"): turning a lane into a stream, starting, running, wrapping up, resuming L, M, N or any lane, going back to prompts, the push after.
- **16:30:** Johnny asked for the four questions again and to stage the cleanup list: staged on his word (419 files: 383 renames, 22 added, 14 modified; not committed). Local dev: no one command; 500s (migrations, local truth) and 403s (BETTER_AUTH_URL production in `[vars]`, wrangler's Origin rewrite, `__Secure-` cookies on http). B0 queued after B2 in B's stream: `npm run dev` via `scripts/dev.mjs`, proven end to end.
- **16:40, Johnny:** legacy tree kept frozen; D2 closed (Discord and Google working); D4 closed (no longer matters); G22 closed as built (share link role owner/editor, ownership transfer). Questions file now empty. Cleanup questions 3 and 4 (BOOT.md stream line, stream paths to archive) still open in the chat.
- **16:45, Johnny: "yes to both".** `BOOT.md` step 2 gains the stream line; D's queue's two `reports/done/` paths now `archive/reports/`; `HOW_TO_RUN.md` updated. Nothing open with Johnny.
- **16:55, Johnny: stream mode is the default** (decisions.md; ORCHESTRATOR.md, HOW_TO_RUN.md, board, memory). B2 (players contract, `contracts/b_players.md`) in as a proposal; its five questions decided by the orchestrator; Johnny reviews the contract before P2. B is on B0 (`npm run dev`, `scripts/dev.mjs` in progress).
- **17:00, Johnny: no 12-player cap.** Members active or archived ("Playing" / "Archived"; "Archive" / "Bring back"), a 255-active guard, archive instead of remove. B2b queued after B0 to update `contracts/b_players.md`. P2's build still waits on Johnny's yes.
- **17:10, Johnny is running `prompts/x_players_review.md`** (one expensive session: leak map, permissions table, attacks, fixes with tests, rewritten P1–P9 in `players_build_plan.md`). B2b held for it; B does B0 then B3.
- **17:15, A's entries accepted:** A4 (dossier model fast enough: no call over 16 ms on a quiet machine), AP1 (`players_view.ts`; the pack uses it), AT1 (cargo, passengers, ledger shapes; sheet rows a view), AT2 (refuel and monthly cost lines, numbers only). Questions decided as recommended (decisions.md); AP1's party-place text flagged for the players review. A's queue refilled: AT4a, AU14, AU16, AU17. D gets DT2 (the buttons). E's N9b also updates `record_card.test.js`.

## 300. All reports in; the players review; queues refilled (2026-10-17 18:35, by the clock)

- Clock note: my bullets labelled 17:00 to 17:15 in §299 were written about 16:10 by the clock; from here labels are `date`.
- **Reviewed (three forks, read-only, against the tree):** every new entry in A, B, C, D, E and Z, the integration sweep, ZT0. All accepted (decisions.md 18:35). The forks ran the flagged tests: `builder_sector_logic`, `campaign_logic`, `changelog`, `public_games` ("tracks at the hex tier"), `vessel_trade`, `map_low_res`: 41 of 41 pass, so the public_games rerun owed before the push is done.
- **Players review in** (`reports/x_players_review.md`, 28 findings, matrix, 35-case leak suite; `players_build_plan.md`: P1b, P2a, P2b, P3, P9, P4 to P8, P10). Its §7 eight questions plus "yes to P2" are questions 1 to 9. P1b (A) and B2b/P2a (B) queued on hold. B4 (F5, F9) goes now.
- **Queues refilled:** A (AP1b hold, AM1, AS3, AS3b, AU16b, AB3, AU15; AU17 gains the no-`/api` cache line); B (B2b hold rewritten as P2a, B4, B5 = L5, B6); C (CC5, CC6, CS4, CS6, CL4b); D (DS5, DS9, DU3, DU36, DU4, DU27); E (E7, E8 released, ES2, ES10, EL7, EL6, E5b); Z (Z5 held, Z7, Z8 hold).
- **Questions to Johnny:** 22 in `questions_for_johnny.md` (players 9, trade 11, starport fuel, map covers).
- **B0 works:** `npm run dev` from the root; http://localhost:5173; production chart read-only, local accounts (passkey), Discord/Google not local; Ctrl+C stops both.
- **Z2 changed the push rule:** the ten parked truth-build files are shelved under `findings/parked/truth_build_2026-10-07/files/`; four finished ones stay in the tree and go with the next push (check at the rehearsal).

## 301. Johnny's answers; session ingest spec; trade tables; local dev fix (2026-10-17 18:50)

- **18:40, Johnny:** all 22 recommendations yes, except: no 500-notes cap (guard 65,535 per player); trade page numbers blank. New: trade tables the referee loads or makes and picks (Z, ZT1; backlog T3c widened); Mongoose permission for concepting while nothing is charged (recorded). New: session ingest (record a game, an AI transcribes, an API or MCP updates the campaign): `prompts/x_session_ingest_spec.md` for one high-effort session; the API pause is lifted for the spec only.
- Released: A's AP1b, B's B2b as P2a (then P2b; Johnny's yes to P2 given), Z's Z8, D's D5. New: D DF18 (publish warning), Z ZT0b and ZT1, B4 gains log masking.
- **Johnny's first `npm run dev`:** 404s for `cdn.traveller.voyage/truth/vtest/*`. Cause: `truth_build.test.js` (Z2's run, 15:55) left a released `vtest` row in the shared local D1, newer than v10. The orchestrator deleted the `vtest` rows from local D1 (local only); v10 is current locally. Root fixes queued: B0b (`npm run dev` on its own state; current = production's newest), Z9 (the suite on its own state). The 401 is `/api/me` signed out.

## 302. E reviewed; two more specs: living systems, X-boat ripples (2026-10-17 19:15)
- E accepted: ES2, ES10, EL7, EL6 (decisions.md 19:15). E gains EU22 (focus and screen readers), EU44 (a changelog people read). Open: E5b, E7, E8.
- Johnny 19:10: chatter lines and background traffic as referee switches; X-boat news ripples. Prompts written: `prompts/x_living_systems_spec.md` (writes `spec_living_systems.md`, `reports/x_living_systems.md`, `findings/living_systems/chatter_sample.json`), `prompts/x_xboat_ripples_spec.md` (writes `spec_xboat_ripples.md`, `reports/x_xboat_ripples.md`). Facts for them: `orbit/ships.ts` already has `ShipKind 'traffic'` (dev stand-in); `map/route_lines.ts` draws `xboat` routes from sector data; `assets/` mentions the x-boat service (2eWorldCreation 1325, trade 272) but gives no speeds: expect questions.
- `x_session_ingest_spec.md` is running on a higher-effort model (Johnny 19:10). Claims at 19:10: B on `b_players.md` (P2a), `door_headers.test.js` (B4); Z on the trade draft (ZT0b); D on `MapRenderer.ts` (DS5).

## 303. Ship finances, T1c (2026-10-17 19:25)
- Johnny 19:20: owners and shares, the payment and when it's due, fuel aboard, upkeep beyond the mortgage. Backlog step T1c written (what exists: the seven cost boxes, AT2 refuel and recurring lines, DT2 buttons, the character's Ship Shares and Ship Payments boxes). Queued: A AT1c (shape and `campaign/ship_finance.ts`, after AP1b), D DT1c (the vessel's Owners, Payment, Fuel, Upkeep, after AT1c). Everything typed; computing from the price needs a rules source (asked of Johnny, not holding anything).
- Johnny 19:20: both specs started (living systems, X-boat ripples).

## 304. AP1b accepted (2026-10-17 19:35)
- A's P1b done and accepted; AP1c queued (party anchor to a hidden place shows the hex). Backlog Epic P now points at `players_build_plan.md`. Johnny asked whether the players review summary is in the backlog: yes (report, plan, answers 18:40, P1b done, B on P2a).

## 305. The passenger table (2026-10-17 19:45)
- Johnny asked whether the 15:28 session's passenger-table work is captured. Draft and backlog T3b were; nothing was queued and the file never moved to `rules/` (no word from Johnny recorded). Asked as question 23; A AT3b and D DT3b queued on hold. Found: `rules/guideline_4_1_starports_bases_trade_codes.md` (X-boat routes "capable of Jump-4") and `guideline_4_4_trade_density_and_interconnectivity.md` (WTN, traffic scaling) are rules sources the living-systems and X-boat specs will read (both prompts say "every file in rules/"). T1b (player credits) and T3 (fares) remain unissued in the backlog.

## 306. Passenger table in rules/ (2026-10-17 19:55)
- On Johnny's yes: `rules/mgt2e_random_passenger.json` copied unchanged (cmp same), `npm run rules:gen` (wrapper `mgt2e_random_passenger.js`), rules draft tests 8/8. Untracked: **add it to the 1.2.7 push list.** AT3b, DT3b released. ZT1b queued (one table-set mechanism for every roller table).

## 307. Z entries (2026-10-17 20:00)
- Z4 (two packs records-only v2, local and stand-in proven; production seed commands for Johnny), Z7 (sentences), Z9 (truth_build on its own state) done. ZT0b: draft has 0 `_question`, 27 `_answer`: asked Johnny as question 24 (move into rules/). ZT1 design in `findings/trade_tables_design.md` with 8 questions; Q7 overtaken by Johnny 19:55 (passenger table joins the one mechanism): ask the rest after ZT1b revises. Z8 starport draft `findings/rules_drafts/mgt2e_starports.json` (classes A-X fuel from 2eWorldCreation 1127-1158). ZT0b and Z8 entries are cut off mid-sentence in z_stream.md: ZR1 asks Z to re-write them.

## 308. Dots swell while zooming (2026-10-17 20:05)
- Johnny runs locally now. Bug: dots grow during zoom at the dots tier. Cause: DL5 half resolution (lowResAllowed with no WebGL) and `overviewPoints` min size of 1 backing pixel (`Math.max(1, ...) / this.dpr`). D, DF6, first.

## 309. Half resolution out (2026-10-17 20:10)
- Johnny 20:10: "the half resolution pan looks terrible" (he also first thought the dot bug was signed-out only, then reproduced it signed in). DF6 rewritten: remove DL5 entirely; any speed work keeps every frame sharp.

## 310. Three faults from Johnny (2026-10-17 20:15)
- Shots saved in `findings/johnny_shots_2026-10-17/`. D DF7: the panel header at Column (after DF6). C CS7: the global OmniBox over the orbit view's panel header (next). C CS8: city lights on the atmosphere (reported 2026-10-12, handoff in archive line ~6756, never issued; lost in the cleanup's Queue trim).

- 20:20, Johnny: hover on clickable things when zoomed out (he did not know they were clickable). D DF8, after DF7.

## 311. A, B, E and the three specs reviewed (2026-10-17 ~20:00 by `date`)
- Clock: my labels from 18:50 to 20:20 ran ~35 min ahead of `date`; from here `date`.
- A: AM1, AS3, AS3b, AU16b, AB3 (golden/generation unchanged), AU15 accepted; AF1 (dice_roll.test failing) queued first. E: E5b, E7, E8 accepted; E7b, E5c (changelog: drop the half-resolution line, add AU15), EU12 queued.
- B: B0b, B4, B6 accepted; B5's code fine but it changed `wrangler.toml` (`run_worker_first` adds `/`, `/s/*`, `/packages*`): question 25, out of the push until answered. Contract P2a: 15/17; fixes (a)-(e) as B2c; P2b1 to P2b4 queued (leak suite first). B0b means Johnny's local accounts from his first run are in the old state folder: he signs up again.
- Specs in: session ingest (11 questions), living systems (15), X-boat ripples (12); the X-boat network question is shared: 37. All in `questions_for_johnny.md` as 26 to 62. Startable without answers: X-boat A1/A2 (pure graph, parameters), living `seed.ts`/`facts.ts`; not queued yet (A's queue is full).

- 20:24: Johnny clarified session ingest: the referee's agent does all of it; we ingest the last step over MCP. Spec annotated (phase 6 dropped, MCP into phase 1); question 27 answered; 26 revised.

## 312. "Yes to all" (2026-10-17 20:27)
- Questions 24 to 62 answered (decisions.md). `rules/mgt2e_trade.json` in (cmp same, rules:gen, tests 8/8; untracked: push list). Queued: B B5b (toml back to 1.2.6, previews parked), SI0; Z SI5; A LS1, XA1/XA2; E LS2, XE1; D LS3, XD1-3 (D.md has no "Found by me" heading now: appended at the end); C LS4, LS5.
- **Push list for 1.2.7 must include** `rules/mgt2e_random_passenger.json`, `rules/mgt2e_trade.json`; must not include B5's toml change (B5b reverts it).

## 313. All streams reviewed (2026-10-17 20:30)
- See decisions.md 20:30. Only red gate: `players_logic.test.js` case 29 (B P2b1b first). CS8 city lights not started (C next). Questions 63 to 78 to Johnny. Look-by-eye list on the board.

## 314. Starport fuel in rules/; table sets decided (2026-10-17 20:39)
- 63 to 78 answered. `rules/mgt2e_space_travel.json` gains `fuel.byStarportClass`, `fuel.bases`, `fuel.basesNote` (10 lines; first attempt reformatted the file and was restored before the minimal insert). Queued: A AT2b, TS1; D DT2b; B TS0. Push list: the three rules files (`mgt2e_random_passenger.json`, `mgt2e_trade.json` new; `mgt2e_space_travel.json` modified).

- 20:45, Johnny: hover on surface map hexes. C CS9 (after CS8 city lights; `SurfaceStage.vue` already names terrain on click).

- 20:50, Johnny: dice out of the Campaign tab into an always-available tool (rail before Marketplace, or above the "?"). Orchestrator picked the rail (the "?" is map-only). A AD1, after AT2b.

- 20:55, Johnny: the world panel streamlined (pasted brief). Saved unchanged with orchestrator notes as `prompts/c_world_panel_streamline.md`; C CW1 after CS8, before CS9 (hover builds on its toolbar) and LS4. Step 1 supersedes D's DF7 Column header for panels with a pager. "Mainworld of the" lives in A's `dossier/model.ts`: C claims that string only.

## 315. A, C, D, E reviewed (2026-10-17 21:10)
- See decisions.md 21:10. All accepted. A: AF2 (fuelMark referee-only) first, AT2c, LS1b. D: LS3 released, DF12b, DU7, DU18, DU22b. Still owed by C: CS8 city lights, CW1 world panel, CS9 hover.

- 21:32: B accepted: P2b1b, B5b (toml back to 1.2.6), SI0 and TS0 contracts. B next: P2b2 to P2b4 (the players server). Rehearsal note: generate_speed and builder_density flake only under the loaded all-run.

- 21:33: C CS8 accepted as code; CS8b asks for night-side proof before CW1.

## 316. City lights, a third time (2026-10-17 21:40)
- Johnny saw the fault after CS8. `prompts/x_city_lights_fix.md` for a high-effort session (edits allowed in the renderers, claimed as X). C prepped: area refreshed, CS8b withdrawn, CW1 next. Suspect list in the prompt: another draw path, shell geometry sampling the city texture, or a stale bundle (AU17 service worker under Vite dev).

## 317. A, B, D, E reviewed (2026-10-17 21:45)
- All accepted (decisions.md 21:45). E wrote the 1,000 chatter lines (`living/lines/corpus.json`). B's 0021 is written (no routes yet). Z has nothing new since ZT1b (open: Z10, SI5).

- 21:50, Johnny: dice roller good; add D66 (tens and units) and a monospace result (Orbitron 7 hard to read). A AD2, first.

- 21:55, Johnny pasted the dice conventions: saved as `assets/dice_conventions.txt`. A AD3 (DM stepper, D3, 2D3) after AD2. A is on XA1 now (news graph).

- 21:57, Johnny: an X to close the dice popover; folded into AD2.

## 318. Streams reviewed (2026-10-17 22:05)
- All accepted (decisions.md 22:05). Johnny's optional production seed (Z4 + Z10 in one apply) is in `reports/z_stream.md` Z10. City lights session (X) is working (claims 21:56).

## 319. Streams reviewed; a reminder for 10-18 (2026-10-17 22:20)
- See decisions.md 22:20. Johnny asked to be reminded on 10-18 to apply the example-pack production seed (Z4 + Z10): on the board, in orchestrator_state Next turn 0, and in memory.

## 320. Lane X: city lights were the lock glow (2026-10-17 22:35)
- X's report checked against the tree and accepted (decisions.md 22:35). The brown "atmosphere band" was the selection lock's glow painted over the outer tenth of the planet in `OrbitRenderer.ts` `selection()`; the glow now starts at the body's edge; two new tests, 32 shots and a proof shot in `findings/city_lights_fix/`. Gates green on X's run; the two new tests pass on mine. Report moved to `reports/done/`.
- Questions 79 to 83 to Johnny (keep the glow as fixed; strike the spec's limb-glow line; neon as an accent with gold highways and white cores, a C item; limb fade; the service worker in dev). No lane item released on 80 to 83 until answered.
- 1.2.7 not called; when it is, X's files join the list: `apps/web/src/orbit/OrbitRenderer.ts`, `tests/web/orbit_lock_glow.test.js`, `tests/web/surface_city_pixels.test.js`, `tests/web/harness/city_pixels.html`, `tests/web/harness/city_pixels.mjs`.

## 321. Questions 79 to 83 answered; the glow goes up (2026-10-17 22:45)
- Johnny 22:40: all five as recommended, "and feel free to up the glow on these lights, I'd like them to feel very sci-fi please". Recorded in decisions.md 22:40.
- Done by the orchestrator: `planet_rendering.md` "Tech level, bloom" rewritten to G6's rule (80). C's queue: CS10 (neon accent, gold highways, white cores, lower population-A gain, and a bigger glow inside the disc and under the air; X's pixel test untouched), after CW1b, before CS9. Nothing for A (83: no guard) or on 82.
- Still with Johnny: look at Capital's night limb after X's fix; 1.2.7 when he likes; the 10-18 seed reminder.

## 322b. Reviews 23:10 to 23:15 (this session; the parallel session wrote §320 and §321)
- A, C, D accepted (decisions 23:10); B's P2b green, 35/35 (decisions 23:15); E EH1, EU28. Queued: A P3, P9 first, TS2b, AU6, AU37; B BC1b, SI1, TS4; C CW1b shots; D XD3b, DU40, DU6; E EU28b, XE1 note. Z idle since 22:01 (ZT5 open).

- 00:05: the players steps after P3 queued with their gates: A P8; D P5, P6; E P4, P7, P10. EU28 ticked; XE1 released.

- 23:40: A's P3 accepted (P3b authorName first); C CW1b, D DU31/DF14/XD3b/DU40 accepted (23:32); Z's ZT5 accepted, questions 84 to 92 to Johnny; Z next ZT6. E has filed nothing since 22:35 and holds no claims: likely stopped.

## 323. Living Systems Comms (2026-10-17 23:50)
- Johnny supplied `assets/Traveller_Living_Systems_Comms_FINAL/` (brief, receiver, procedural engine, 1,178-row corpus, Beowulf). `prompts/comms_receiver.md`: Z ZC1 (engine, scheduler, audit), C CC1 (receiver, mount). Supersedes answers 43, 45, 47; C LS4 withdrawn. Manifesto notes: the receiver JS uses `window.*` and a global constructor (route through `platform/browser.ts`), its CSS has 22 hex colours (to tokens).

## 324. Push 1.2.7 called; every entry since 00:05 reviewed (2026-10-18 09:40)
- Johnny 09:20: get to a push. Reviewed (forks, read-only): A P9 P3b P8 TS2b AU6 (AU37 declined); B BC1b SI1 TS4; C CS10 CC1; D DU40 P5 P6 DU6; E EU28b XE1 P4 P7 P10; Z ZC1 ZT6. Decisions 09:35.
- Blockers queued: C CC1b (controller not wired; traffic switch hidden; chatter help words), B SI1b (agent access default off), then TS4b.
- Tree gates 09:30 green (2417 tests, 0 fail). Changelog 1.2.7 (six items; `tests/web/changelog.test.js` assertions moved to 1.2.7) and APP_VERSION in. Clean copy `outer28` script `clean_copy28.sh`, list builder `pushlist.py` (scratchpad; handles staged renames).
- Slip: my 09:40 script replaced every open question with the new ones; 84 to 92 restored from turn2340.py at 09:45. The questions file keeps only open questions: append, never replace.
- 09:42: clean copy outer28: 14 tests and 1 typecheck error from uncommitted files (findings/, the held Comms package, a relative zod import). Z ZF1 and B SI1b addendum queued; both block 1.2.7.
- 09:50: Johnny: the skill to `skill/`, and two doors for the referee's AI (a snapshot prompt out, proposals in). Z ZF1b queued (blocks 1.2.7). Questions 105 to 108; SI2 to SI4 held until answered.
- 10:00: 105 to 108 answered (Copy and Download; whole records; no paste box; 108 withdrawn, already built). Queued: Z SI6 (snapshot spec, skill, template) after ZF1b; A SI2, D SI3, E SI4 held on it; D DJ1 jump times advance the clock. Question 109 (agent access on with the screens).
- 10:15: Johnny: no model on our side (confirmed), a token reaches one campaign, both doors back (the AI with a token, or paste its reply); no "snapshot" word. Z SI6b, B SI1c queued; A SI2, D SI3, E SI4 amended.
- 10:18: CC1b, SI1b, TS4b/c, ZF1, ZF1b, SI6 accepted; ZF1c (city pixel fixture out of findings) blocks 1.2.7, placed above Z's freeze line; TS4d approved for after the push; Z's 109, 110, 113 decided, 111 and 112 asked as 110 and 111. Freeze lines in every queue; waiting on C's LS5.
- 10:40: Johnny: System Comms toggle above Fit, on by default (C CC2, blocks 1.2.7, above C's freeze); Copy for your AI by part (Z SI6b, A SI2, D SI3 amended); 110 and 111 answered by it. C's LS5 done 10:24.
- 11:17: Johnny's comms emergency-theme brief saved whole as `prompts/c_comms_emergency_theme.md`; C CC3 after the push.
- 11:18: Johnny's shot: the comms receiver covers Fit. Folded into C's CC2 (in progress): System Comms and Fit to the lower left, nothing overlapping at 1600/1366/1024/390, a rectangle test.
- 11:25: Johnny: surface map wheel zoom lost. D DF15 (blocks 1.2.7, above D's freeze): likely the wheel listener attached in onMounted while the stage is behind v-if/Teleport.
- 11:28: Johnny: `mayday` in the address plays Beowulf after 3 s; folded into C's CC3 (after the push).
- 11:28: Johnny wants comms working before the push: C CC3 moved above the freeze, blocks 1.2.7, with an end-to-end proof in Edge.
- 11:55: C CC2, CC3 done. Johnny sees dead air: the engine needs the lead ship in the system. Decided: the view listens; Z ZC2 (blocks 1.2.7, live proof in Edge).
- 12:02: Johnny's shot: span switch over Back; the system crumb loops in the orbit view. C CW2, blocks 1.2.7.
- 12:17: DF15, ZF1c accepted. Left: Z ZC2 (in flight), C CW2 (not started; Johnny to say go).
- 12:25: Z ZC2 accepted (comms live for any viewer). C CC2b queued after CW2 (layout test depends on a running API). Left for 1.2.7: C CW2, CC2b.
- 12:45: C CW2, CC2b accepted; API suite 42/42 green; changelog comms line updated. Johnny: C CC4 (far right, SIG, fixed box, 'System Comms' everywhere), blocks 1.2.7.
- 12:55: Johnny: System Comms off pops; folded into C's CC4 (in progress) as (5): fade out and in, unmount after the fade.
- 12:58: Johnny's tidal locking brief: W1 to C (CW3, blocks 1.2.7, after CC4); E1 to Z held on questions 117 to 119.
- 13:10: 117-119 answered (E1 with the next engine change, e1.3, Regina's engine number). C CC4b (three lines) before CW3. CC4 done 13:07, to review.
- 13:33: ?mayday fails signed in (controller consumes it on arm; campaign key change cancels). Z ZC3, blocks 1.2.7.
- 13:37: CC4b accepted (fade confirmed in). CW3 unblocked: both ESM profile fixtures regenerate (every locked moon). Left: Z ZC3, C CW3.
- 13:40: Z ZC3 accepted. Left for 1.2.7: C CW3, then the rehearsal.
- 14:00: CW3 accepted; final rehearsal outer29 green (pixel artifact only); 1.2.7 commands handed to Johnny. After push: d1_migrations check, the example seed, lift FREEZE lines, refill queues.
- 14:05: Johnny: the release is 1.3.0. version.ts, changelog.ts, release notes, queues and board updated; changelog tests green.
