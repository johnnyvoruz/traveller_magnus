# Stream Z — the server's open work, then the players' view

Read `streams/README.md` first; it is the loop. Until Johnny stops you. Your entries go to
`reports/z_stream.md`. Your own ports and state as always; nothing against production: commands for
Johnny are written out in full in your entry (`cd D:/webstorm/traveller_magnus`, forward slashes).

**Area:** the marketplace server (`routes/packages.ts`, `installs.ts`, `universe/install.ts`, the
publish job), `packages/shared/src/schemas/package.ts`, `tools/examples/`, `tools/truth/`, the ten
parked truth-build files, the contracts you own, tests under `tests/api/`, `tests/shared/`,
`tests/tools/`, `tests/generation/` for those. Lane B is in `universe/` (the reservation) and
`tests/api/universes.test.js`: claim before you touch anything there.

## Johnny's answers, 2026-10-17 (to your `z_parked_truth_build` questions and two of the orchestrator's)
1. Split: **finish four** (`dev_make_admin.js`, `inputs.ts`, the remove route, a cap-safe
   `truth_build` test) and **shelve six** — yes.
2. The seal: **a seal step in `tools/truth/upload_truth.js`** that Johnny runs after a release — yes.
3. **The Worker is on Workers Paid** (10,000 subrequests per invocation).
4. The admin truth preview: **shelve** — yes.
5. Your next big build: **the players' view link** — yes.
6. "Regina highport contacts" and "Jewell patrons" become **records-only** — yes.

## Queue
- [x] Z1 Finish `prompts/z_install_reservation.md` (installs through the reservation; `family=` and
  `author=`). Its report goes to `reports/z_install_reservation.md`; add a one-line entry here.
- [x] Z2 (15:21, done 16:03) **The parked files, split (answers 1, 3, 4):**
  - Finish the four in the tree, on today's code: the remove route's hunk alone in `admin.ts`, the
    `inputs.ts` skip, `dev_make_admin.js`, and `truth_build.test.js` made cap-safe (one sector per
    build). Tests green; nothing else in `admin.ts` changes.
  - Shelve the six: copy each to `findings/parked/truth_build_2026-10-07/` (your README's table),
    then put the tracked files back to HEAD's content and delete the new ones from the tree, **by
    editing files, never by git**. List every file you touched. After this step, `git status` shows
    only the four finished files among the ten.
  - Update the README's "How to bring them back" for what remains parked.
- [x] ZT0 (proposal 16:03; Johnny answered 18:40, see ZT0b) (proposal 16:03: draft and test written, 11 questions in `reports/z_stream.md`) **The trade rules file, drafted from Johnny's source — next after Z2** (Johnny 15:35:
  "trade.txt is in the assets folder"; he answered yes to supplying the trade rules). Source:
  `assets/trade.txt` (854 lines, the MgT2E trade chapter as extracted text; its tables are wrapped by
  the PDF extraction). Shape: `findings/rules_drafts/mgt2e_trade.json` (the empty skeleton,
  keys from `directives/backlog_players_landing_trade.md`, Epic T, "The rules file Johnny fills").
  - Fill it **only from `assets/trade.txt`**: every value carries the line it came from (`"_src":
    "assets/trade.txt:160"` beside each table or row). Nothing from memory, no value inferred. Where
    the extraction wraps a row (Trade Goods: a name, its availability codes and DMs run over several
    lines; Passenger and Freight Traffic; the price table), rebuild the row and cite every line used.
  - Tables to carry, if the text has them: the trade goods (D66, type, availability, tons dice, base
    price, purchase and sale DMs by trade code, examples), finding a supplier and a broker (the checks
    and DMs as written), local brokers, the purchase and sale price modification, passengers (the
    four passages, what each requires, the traffic table and its DMs), fares and freight rates by
    parsecs, freight (lots, the traffic table and its DMs), mail if present, illegal goods.
  - Rename or add keys to fit what the text holds; say why in `_readme`. Prose rules that a table
    can't hold go in a `notes` array, quoted with their line, short.
  - **Halt & Challenge** on anything ambiguous (a cell the extraction scrambled, a DM whose trade code
    is unclear, a rule that contradicts another line): a numbered question for Johnny in your entry,
    the cell left `null` with `"_question": n`. Never guess a number.
  - A test (`tests/generation/trade_rules_draft.test.js`) that the file parses, every row has a
    `_src`, every `_src` line exists in `assets/trade.txt` and contains the row's key words.
  - Proposal entry: Johnny reviews the draft; it moves to `rules/mgt2e_trade.json` only on his word
    (CLAUDE.md rule 1), then `npm run rules:gen`. Don't touch `rules/`.
- [x] Z3 (done 16:03) **The seal step (answer 2):** `upload_truth.js` gains a step Johnny runs after a release that
  re-puts each sector index and reconciliation report of a released version with
  `public, max-age=31536000, immutable` (same bytes), over R2's S3 interface as the upload does. A dry
  run first that names the count; refuse a version that isn't released. Fix the "sealed by release"
  comment to say how. Test against a local stand-in. Johnny's commands in your entry.
- [x] (Johnny 20:27, question 24: moved to rules/mgt2e_trade.json by the orchestrator, decisions.md:15) ZT0b (19:02, proposal 19:07) **The trade draft, with Johnny's answers** (18:40, "all of your recommendations look right"): Q1 four
  passages; Q2 accept your split of the 18 rows; Q3 names stay as printed, and a name-to-trade-code table goes in the
  module later (list the names it needs in your entry); Q4 Exotics keep their nulls and stay out of every roll; Q5
  Exotics' `illegal` stays null (the referee decides); Q6 one sentence; Q7 the Steward DM is the highest Steward skill
  aboard; Q8 the Mail rows mean the Freight Traffic roll's total DM; Q9 selling is 3D; **Q10 `source.pages` stays
  blank, no page numbers**; Q11 drop `tradeRoutes`. Clear each `_question` it settles; the test still passes. Proposal
  entry: Johnny moves the file into `rules/` (CLAUDE.md rule 1).
- [x] (Johnny answered 20:39: all as recommended) ZT1 (19:07, proposal 19:08) **Trade tables the referee picks, a design** (Johnny 18:40: "I will also want to be able to load our own trade
  tables or create others so the user can pick, just in case Mongoose changes their mind"). Design only, as a proposal
  in `findings/trade_tables_design.md`: a **table set** with the same shape as the rules file (a zod schema in
  `packages/shared`), the official set from `rules/` as the default, a referee's own sets per account or per campaign
  (made from scratch, copied from the official one and edited, or loaded from a JSON file), the campaign's choice of
  set, how the trade procedure (T5) reads whichever is chosen, validation of a loaded file (every table the procedure
  needs, the dice shapes), whether a set can be shared through the marketplace as a package kind, and the server
  storage (additive DO rows or R2 objects; safe in either order). It extends backlog T3c; say what of T3c it replaces.
  Steps for lanes with files and tests, and questions for Johnny with recommendations.
- [x] Z9 (19:08, done 19:17) **`truth_build.test.js` on its own state** (it left a released `vtest` row in the shared local D1 at 15:55 and
  broke Johnny's `npm run dev`): the suite uses its own `VOYAGE_PERSIST_TO`, as `campaign.test.js` does, and deletes
  what it made at the end.
- [x] Z4 (18:42, done 18:53) **Two example packs to records-only (answer 6):** "Regina highport contacts" and "Jewell
  patrons", a version 2 of each with no hexes and the same records, through the app's own publish
  route as the example tools do; prove on a stand-in seeded like production; Johnny's dry run and
  apply in your entry. Their ids don't change.
- [x] ZT5 (23:14, done 23:24; questions in reports/z_stream.md) **The trade procedure, the logic** (backlog Epic T step T5; `rules/mgt2e_trade.json` is in, 20:27): `campaign/trade.ts`, pure: find a supplier, the goods available, purchase and sale price modification, brokers, illegal goods, every step citing the rules file's keys (and through them `assets/trade.txt` lines); it reads its tables through the table-set resolver A builds in TS1 (official set by default). No screen (D later). Tests per table, seeded dice. Halt & Challenge on anything the file leaves open. After A's TS1 if its resolver is needed; start with the pieces that don't need it.
Z10's questions decided 22:05: Feri terraces stays whole; the backup and stand-in folders may go once Johnny's production seed shows the trimmed cover.
- [x] ZC1 (00:08, done 00:26; interface and questions 92-94 in reports/z_stream.md) **Living Systems Comms: the engine, the corpus adapter, the mixer, the scheduler, Beowulf, the audit** (Johnny 23:50, `prompts/comms_receiver.md`, the package `assets/Traveller_Living_Systems_Comms_FINAL/Traveller_Comms_Complete_Handoff/`: read START_HERE.md and IMPLEMENTATION_BRIEF.md in full) — **next, before ZT6.** Write the receiver interface at the top of your entry first, so C can wire to it.
- [x] ZT6 (00:26, done 00:30; questions 95-101 in reports/z_stream.md) **Freight and passengers available at a world, the logic** (backlog Epic T step T6; `rules/mgt2e_trade.json`'s passenger and freight traffic tables, fares by parsec, lots, mail): pure `campaign/traffic_lots.ts` beside `trade.ts`, every value cited to the file's keys and `assets/trade.txt` lines, through the table-set resolver; seeded tests. Halt & Challenge as in ZT5. If Johnny's answers to 84 to 91 change `trade.ts`, apply them first.
- [x] ZF1 (09:43, done 09:51; scratch-copy proof and questions renumbered 109-110 in reports/z_stream.md) **Tests that need git-ignored files: blocks 1.3.0, first** (orchestrator 2026-10-18 09:42; the clean-copy rehearsal of 1.3.0 failed 13 tests that pass in the tree): `findings/` and `assets/Traveller_Living_Systems_Comms_FINAL/` are not committed, so a fresh checkout fails these. (1) **The skill becomes a tracked file:** move `findings/session_ingest/SKILL.md`, `references/`, `example_batch.json`, `example_transcript.md` to `tools/session_ingest/` (same names; it is what we hand referees, so it belongs in the tree) and point `tests/shared/proposals.test.js` (the example batch, the SKILL.md frontmatter, the decided words) and `spec_session_ingest.md`'s and `contracts/b_session_ingest.md`'s mentions at it (leave a one-line pointer file in `findings/session_ingest/README.md`). (2) `tests/generation/trade_rules_draft.test.js` reads `rules/mgt2e_trade.json` now (in since 10-17, the same bytes as the draft; check with `cmp` first, and if they differ, stop and say so). (3) `tests/generation/starport_rules_draft.test.js` (its draft is not in `rules/`): `{ skip }` when `findings/rules_drafts/mgt2e_starports.json` is absent, with the reason in the skip message. (4) Your corpus test "the shipped corpus is the package corpus, byte for byte": skip when the package folder is absent (the package stays local; Johnny holds it out of the push). Prove it: in a scratch copy of the repo with `findings/` and that assets folder removed (or by renaming them for one run, then back), the four files pass or skip; in the tree they pass. Small: do it now.
- [x] ZF1b (09:51, done 09:59; proof and questions 109-110 in reports/z_stream.md) **The skill lives in `skill/` (Johnny 09:50: "move the referee skill from findings to the new /skill folder"): blocks 1.3.0, right after ZF1** — move what ZF1 put in `tools/session_ingest/` (SKILL.md, `references/`, `example_batch.json`, `example_transcript.md`) to the repo-root `skill/` (Johnny made the folder), and point everything at it: `tests/shared/proposals.test.js`, `spec_session_ingest.md`, `contracts/b_session_ingest.md`, `findings/session_ingest/README.md`'s pointer, any `tools/` or test path. Nothing left in `tools/session_ingest/`. The same proof as ZF1 (a copy without `findings/` passes). If ZF1 is not done yet when you read this, move straight to `skill/` and tick both.
- [x] SI6 (10:02, done 10:08; spec 3.1, fixture and expected text in directives/contracts/, questions 111-113 in reports/z_stream.md) **"Copy for your AI": the snapshot prompt and the skill, in the spec** (Johnny 10:00, decisions 10:00: 105 Copy and Download, 106 the whole record, 107 no paste box, 108 withdrawn) — after ZF1b. (1) A section in `spec_session_ingest.md` ("The snapshot for your AI"): what the prompt holds in order (what to do with a transcript; the campaign: clock, calendar, party, every live record whole with id, type, kind, name, tags, place, links, visibility, details, For players, rev; the last 50 journal entries whole; the proposal format with the example; the rules: never create what is listed, change a listed record by its id and the rev shown, names as listed, unsure means a loose thread; how to send: MCP tool names or `curl` with a token the referee gives it, never a token in the prompt), the size it reaches at 100, 500 and 2,000 records (characters and an estimate of tokens), and that it is built in the browser from the open campaign (no server read). (2) `skill/SKILL.md` reads either the snapshot (pasted or given as a file) or `read_campaign_index` over MCP, the same shape. (3) The template as a pure function's spec for A (`campaign/ai_snapshot.ts`: `aiSnapshot(campaign, { universeId, origin }) -> string`), with a fixture campaign and the expected text, so A builds against it. No new server route.
- [x] ZF1c (12:01, done 12:10; passes in the tree and without findings/, entry in reports/z_stream.md) **The city pixel fixture into the tree: blocks 1.3.0, before the freeze line** (orchestrator 2026-10-18 10:18; your question 109, decided: moving a fixture the test reads is not touching X's check): copy `findings/city_design_s1_manifest.json` to `tests/web/harness/city_design_s1_manifest.json` (byte for byte), point `tests/web/harness/city_pixels.mjs:15` at it, and point `apps/web/src/dev/city-lights/CityLights.vue:38` at the same file through a path relative to the repo, not `D:/webstorm/...` (claim it; the dev page only). Leave the findings copy. Run `tests/web/surface_city_pixels.test.js` in the tree (passes) and say so. Nothing else in the test changes.
- [x] ZC2 (12:13, done 12:20; tests, live check in Edge with five shots in findings/ui_design_shots/zc2_*, questions 114-116 in reports/z_stream.md) **Comms: the view listens, not only the party: blocks 1.3.0, before the freeze line** (Johnny 11:55: "should I see the local comms working? I'm not seeing any transmissions, just dead air"; decisions 11:55; Johnny 11:57 confirms: "I want to show comms even if my ship isn't in the system, so the players / ref can get a peek of what's going on there"). Your engine gates everything on `partyHears(f)` (`events.ts` ~403, `controller.ts` ~147, ~399), so a signed-out visit, a campaign with no lead ship, or a system the party is not in gets dead air forever, and C's `?mayday` waits for a ship too. Johnny's 10:40 word is System Comms on for everyone who opens an orbit view. The rule now: **the receiver listens to the system on screen**: ambient traffic (control, customs, market, weather, vetted ship lines, the procedural scenes between other ships) plays whenever the view is shown, whoever watches and wherever the party is; **lines addressed to the party's ship** (the welcome, the arrival beacon, approach or docking calls to the party's callsign, anything that names or answers the party) play only when the lead ship is `inSystem` or `docked`; **in jump** the party hears nothing of its own, but the view still listens to the system on screen; **`mayday`** plays Beowulf at 3 s regardless of the party (C's CC3 question 1, decided: no ship needed). Keep every other gate (no X tower, no E formal ATC, no highport ops without a highport, no vacuum weather, the four blocked categories, repetition, starvation). Tests with fake timers: signed out with no campaign, lines within the first minute on Regina's facts; a campaign with the party away, ambient lines but no party-addressed line; the party arriving, the beacon once; `mayday` with no ship plays at 3 s. **Then prove it live**: `npm run dev` in Edge, signed out, `/s/Core/2118/orbit` (Regina): a transmission within a minute; switch to another system: lines continue; `?mayday`: red Beowulf at 3 s and back to teal; a shot sequence in your entry (C's shots forced a line; this must not). Claim the `living/comms/*` files (C is done with them).
- [x] ZC3 (13:35, done 13:38; the first 3 s deadline kept, tests in comms_mayday_signed_in.test.js, not proved live signed in: entry in reports/z_stream.md) **`?mayday` is lost when signed in: blocks 1.3.0, before the freeze line** (Johnny 13:30: "http://localhost:5173/s/Core/1623/orbit?mayday isn't working for me"; the orchestrator reproduced it working signed out on his dev server and on a bare Vite, red at about 3 s, so it fails only with a campaign). Diagnosis (orchestrator, read from `living/comms/controller.ts`): `start()` sets `maydayUsed = true` when it **arms** the archive (~365) and starts a 3 s timer; signed in, the campaign arrives after the receiver mounts, so `update()` sees a new `campaignKey` (`'none'` then the campaign's), the context key changes (~419), `cancel()` clears the armed timer and `maydayArmed`, and `start()` will not arm again because `maydayUsed` is already true. The same happens on any context change inside the 3 s (a truth version, the facts' hex). Fix: the archive counts as used only when it **starts playing** (set `maydayUsed` in the timer's callback), so a context change during the wait re-arms it with a fresh 3 s from that change (or keeps the original deadline: say which and why); still once per page load, still no replay after it has played. Consider whether a campaign key arriving should reset the band at all (the history key is per campaign, so probably yes, but say). Tests with fake timers: update with `campaignKey: 'none'`, then the campaign's key at 1 s, Beowulf plays (at 3 s or 4 s, as you decide); a second context change after it played does not replay it; the signed-out path unchanged. If you can, prove it live signed in (a local account on `npm run dev` per `findings/` or the dev admin script); otherwise say so.
- [ ] **FREEZE for push 1.3.0 (orchestrator 2026-10-18 10:20): finish the item you are on, write its entry, release your claims, then start nothing new until the orchestrator removes this line.** (Not an item to tick.)
- [ ] SI6b **The paste door** (Johnny 10:15, decisions 10:15; replaces 10:00's "no paste box"): in the spec section SI6 wrote, the template and fixture, and `skill/SKILL.md`: the referee's AI ends with **one fenced JSON block** in the proposal batch format when it has no token (the referee pastes its reply into the campaign), or sends it itself when it has one. Our side finds the block in the pasted text (the first fenced `json` block, or the whole text if it parses), checks it with the shared `ProposalBatch` schema, and says which proposal failed and why. No model on our side. Drop the word "snapshot" from anything a referee reads ("Copy for your AI"). Update the expected text for A. **Also (Johnny 10:40, decisions 10:40): by part.** The prompt is built from chosen parts: All, or any of Ships (vessels with cargo, ledger, finances, track), Characters (with sheets), People, places and things (records), Journal; the date, party and instructions always. Say which record types fall in each part (from the shared schema), give each part's size at 100, 500 and 2,000 records, and a fixture and expected text per part and for All. Images never. Above 150,000 tokens the warning sentence.
- [ ] (HOLD, orchestrator 18:35: Epic P and the players review now cover players seeing a campaign; this item is re-scoped against `players_build_plan.md` before anyone starts it) Z5 **The players' view link (answer 5), design first:** `plan.md` Slice 4: "a players' view of my
  universe … send my table the link"; "players' publish = fog-of-war filter at publish time to static
  files". Write `directives/contracts/z_players_view.md`: what a player sees (record `visibility`,
  player notes, journal entries a player may see, the party, hexes), the link (who can open it,
  revoking it), what is published (static files, as the plan says, or a filtered read), the size,
  the routes and the migration if any. Every open choice as a numbered question with your
  recommendation. Your entry is a **proposal**: stop this item there. The build items come after
  Johnny's answers.
- [x] Z6 (18:54, done 19:04) **Server-side catalogue facets:** the counts for Kind, Contents, Edition, Tags, Updated and
  Publisher computed over the whole catalogue for a query (`GET /api/packages/facets?…`), so the
  store's column is right past 100 packages; contract lines for Lane D.

- [x] Z7 (19:17, done 19:21) **The server sentences B3 left in your files** (B's B3 leftovers): the person-facing `message` strings in
  `routes/admin.ts`, `routes/packages.ts`, `routes/installs.ts`, in Google style as B3 did; words only; the tests that
  quote them updated.
- [x] (Johnny 20:39: in rules/mgt2e_space_travel.json, questions 63 to 68) (released 18:40, Johnny: yes) Z8 (19:21, proposal 19:26) **Which starports sell which fuel, a draft**
  (D's DT2 question): from `assets/2eWorldCreation.txt` (the starport and base text; line 1320 names a scout base's
  refined fuel), draft the classes and the fuel each sells into `findings/rules_drafts/` as ZT0 did, every value cited
  by line, nulls with questions. Nothing in `rules/`.
- [x] ZR1 (19:52, done 19:54) **Two entries cut off** (orchestrator 20:00): in `reports/z_stream.md` your ZT0b entry ends at "carries `_answer: Johnny" and your Z8 entry at "risky"; the questions Z8 numbers (1, 3, 4, 5, 6 at least) are not in the file. Re-write both entries whole (append them again under the same headings, marked "re-written"), with Z8's questions in full and your recommendations. First, before ZT1b.
- [x] (Johnny answered 20:39: all as recommended) ZT1b (19:54, proposal 19:55) **The table-set design widened to every rules table a roller reads** (Johnny 19:55: "remember we will want to tweak so the user can select other random tables in case I need to swap this out"): extend `findings/trade_tables_design.md` (or rename it `table_sets_design.md`) so one mechanism serves trade sets and the Random Passenger table now (`rules/mgt2e_random_passenger.json`, in since 19:55), and any later roller table: a set per kind, the official file the default, the referee's own made, copied or loaded, chosen per campaign. Say what of T3c it replaces now (your ZT1 kept T3c for the passenger table; Johnny's word moves it into the one mechanism). Questions only where new.
- [x] Z10 (21:39, done 21:50) **Re-add the example covers D5 now crops** (D's D5: a map package's cover is trimmed to its systems when added; the live examples keep their old covers): through `tools/examples`, locally and on the stand-in as Z4 did, with Johnny's production commands in the entry. Note (orchestrator 20:30): lanes **may read** `rules/`; only editing it is Johnny's.
- [x] SI5 (21:50, done 22:01) **Session ingest, the skill and the schema** (`spec_session_ingest.md` §5 "SI5", with B's SI0; Johnny 20:24: the referee's agent records, transcribes and extracts; we take only its proposals over MCP): finish `findings/session_ingest/SKILL.md` and the proposal schema as the spec says, words per decisions 20:27 ("Proposals", "your AI agent").
## Found by me
- [ ] (HOLD until the next engine change: Johnny 13:10 answered 117 to 119: with the next engine change, as e1.3 (1.3.0), Regina takes the engine's number (about 135 h); never in the tree before that release and its truth rebuild) ZE1 **Tidal locking E1: lunar mainworlds' orbital period** (`prompts/tidal_locking.md` item E1, as written).
