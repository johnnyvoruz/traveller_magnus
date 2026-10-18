# Stream A — browser logic: dice, the chart's data, the builder

Read `streams/README.md` first; it is the loop. Until Johnny stops you. Your entries go to
`reports/a_stream.md`; shots `findings/ui_design_shots/sa_<item>_*`.

**Area:** `apps/web/src/characters/*.ts`, `apps/web/src/builder/`, `apps/web/src/map/truth_client.ts`,
`apps/web/src/dossier/model.ts`, new files for the dice roller, tests under `tests/web/` for those.
`campaign/` is Lane N's today and `orbit/` Lane L's: claim before you touch them, and only for a line an
item names. Screens (`.vue`) belong to other lanes: a new small component for your item is yours;
an edit to someone else's screen is one mount line, claimed and named. Use Lane M's shared look.

## Queue
- [x] 14:32 A1 **The dice roller — CHANGED by Johnny, 15:05: read this before you go on.**
  Johnny: "it should always just be d6, this notation thing is too complex. We're going for simple and
  streamlined. I love the dice rolling system we have on traveller.voyage/sheets/man-in-the-low-berth/."
  - **Six-sided dice only. No notation, no parser:** remove `NdM`, `D66` and the typed-notation path
    from `dice/roll.ts`, `command.ts` and the roller. A roll is 1, 2 or 3 dice (2 by default), chosen
    with three buttons ("1D", "2D", "3D"), and that is all a person picks.
  - **The sheet's system is the model:** `apps/web/public/sheets/man-in-the-low-berth/index.html`,
    "dice roller" (CSS lines 134-181, the script around `rollCheck` and the toast, about lines
    480-560). Copy its feel: the dice tumble into the middle of the screen as 3D dice with pips (the
    `.dice-tray`, `.die`, `.face`, the `toss` animation, about 1.1 s; none under reduced motion), then
    the result card slides up from the bottom (`.roll-toast`): the total large, each die beside it.
    Click or Escape dismisses it. Tokens only (the sheet's colours become the app's: dice in
    `--signal`, a 1 in the alert red as the sheet's `--pip-one`), the app's one toast if it can carry
    the card, otherwise say why not.
  - **It interprets nothing** (no "Effect", no "8+", no verdict): the sheet's Effect line comes from a
    character's check; the app's roller has no target. Lane D or a later item can add rolls from the
    character sheet with their DMs; not this item.
  - Opened from the palette ("Roll dice", rolls 2D at once), the campaign panel's dice button
    (when `CampaignPanel.vue` is free), and the `R` key through the shortcut registry if `R` is free.
  - The last 20 rolls for the page, in memory, as built.
  - **Boon and Bane — Johnny's words, 15:15 (the rule's source; cite them in the code comment):
    "Boon rolls 3D keeps best two, bane keeps worst two."**
    - Two toggles beside 1D/2D/3D, off by default. Turning one on turns the other off (they are never
      both on: a UI choice, not a rule).
    - With either on, the roll is 3D and the total is the best two (Boon) or the worst two (Bane). The
      count buttons show 2D and are disabled while a toggle is on, since the roll is a 2D roll made
      with three dice.
    - All three dice tumble; on the card the dropped die is shown dimmed and struck through, the two
      kept dice and their total as normal, with "Boon" or "Bane" in the card's title.
    - Tests: a Boon roll's total is the sum of its two highest dice and a Bane's of its two lowest,
      over fixed dice.
  - Shots before (your notation roller) and after, 1600 and 390, and a short GIF of a 2D roll.
- [x] 15:01 A1b **The roller, two fixes (orchestrator 15:30, from `sa_A1_roller_boon_1600.png`; your two
  questions):**
  - A toggle is a setting, not a throw: turning Boon or Bane on does **not** roll. While one is on,
    1D and 3D are disabled and **2D stays enabled as the throw** (it reads "2D" and rolls three dice
    kept to two). Your question 1: changed this way. Your question 2 (a card, not a toast): yes, keep it.
  - The dropped die must be plain to see: in the tray it settles dimmed (about 35% opacity) once
    the dice land, and on the card each die is shown as a small die face (the tray's pips, about
    24 px), not a digit, with the dropped one dimmed and crossed. The total stays large.
  - Shots after, 1600 and 390, Boon and Bane each.
- [x] A2 **Nothing on the chart loads twice:** count `truth_client.ts` fetches while panning away from
  a sector and back, zooming out and in, and reopening a dossier, in a session. Every repeat that the
  HTTP cache or an in-memory cache should have answered: fix it in your area, and give the before and
  after counts.
- [x] A3 (answered 15:00: keep the pane's two sentences, as you recommend; the item was written without knowing they exist) **The one-sector limit said before a request:** the Build pane learns the limit from the
  server's answer today. Work out the request size in the builder's logic before sending, and when it
  passes one sector, say "You can generate one sector at a time." where the request would go (one
  line in the pane, claimed), without sending it. Same words as the server's refusal (B's contract).
- [x] 15:37 A4 **The dossier model's speed:** time `dossier/model.ts` building the system and world pages
  for the 20 largest systems in Regina's subsector; anything over 16 ms on the main thread is cached
  or split; numbers before and after.

- [x] 15:49 AP1 **P1, the players projection — next after A4** (Johnny 2026-10-17: "players first").
  Source: `directives/backlog_players_landing_trade.md`, Epic P, decision 3 and step P1; read "What
  exists". New `packages/shared/src/players_view.ts`: `playersView(full)` and
  `playersObjectHashes(view)`, pure, with exactly decision 3's rules (a record when `visibility ===
  'players'`; a link when both ends are in; a journal entry when `players` or `public`; hidden
  mentions read "a record"; party, clock and settings in; `provenance`, `rev` and tombstones out).
  Move the Player Pack's filter and redaction to it: `apps/web/src/pack/plan.ts` calls it (Lane D's
  file, named here: claim it, change only the filter's call), `pack/text.ts` keeps rendering.
  `tests/shared/players_view.test.js` with the fixture from `tests/web/player_pack.test.js`: the leak
  gate (no referee-only marker survives), a `public` entry in, a link with one hidden end out, a
  hidden mention as "a record"; the pack's tests still pass. Lane B's contract
  (`contracts/b_players.md`, when written) cites your function: if it isn't there yet, build to
  decision 3 and say so.
- [x] 15:59 AT1 **T1, the shape of cargo, passengers and the ledger** (Johnny: "trade first"). Source: the
  same file, Epic T, "What exists", decisions 2 to 4 and step T1 (your half). `RecordStatus` in
  `packages/shared/src/schemas/campaign.ts` gains optional `cargo`, `passengers`, `ledger` (additive;
  passthrough stays; the shapes from `campaign_manager_plan.md` §5.3 as the step says); pure
  `campaign/cargo.ts` (add, remove, tons used, capacity read from the sheet's "Cargo Capacity"),
  `campaign/ledger.ts` (post, balance, by period), `campaign/money.ts` (`Cr1,234`, `MCr1.2`). No rule,
  no price, no dice. **The ship sheet's Cargo and Passenger rows become a view of the manifest** (Johnny 15:30, Epic T question 1: yes): add the pure mapping both ways in `campaign/cargo.ts` (sheet row n ⇄ `status.cargo[n]`, first sixteen, then "and N more"; the same for passengers and "Passenger Name/Passage/Notes"), so editing either edits the same data. The party's cash stays separate from the ledger (question 3: yes); the character's "Cash on Hand" is untouched. Tests for the
  pure modules and the schema (old records still parse). `campaign/` is Lane N's today: claim. Lane D
  builds the screens after you (its DT1).
- [x] (done by Lane N at its wrap-up, 15:45: warm once, best of five, same 50 ms budget; skip it) A5 **`tests/web/journal_mention.test.js`'s 50 ms filter budget fails under load** (waiting on tests/web/journal_mention.test.js, N) (Lane E's run at
  15:08: 348 ms beside a build, 56.9 and 95.6 ms alone). Make the test measure the work, not the wall
  clock under load (count operations, or a budget that holds on a loaded machine with a comment why),
  as you did for the title fade. Tests only; if the code itself is slow, say so and stop.

- [x] 16:16 AT4a **T4a, markets nearby, by data** (Johnny: "trade first"; backlog Epic T step T4a, your half):
  `campaign/markets.ts`: the worlds within N parsecs of a ship's world (`map/geometry.ts`), with
  starport, trade codes, WTN and population from the truth, sorted by distance; N of 2, 4 or 6. Pure,
  tested on Regina's subsector. No pairing, no price (T4b waits on the trade rules file). Lane D builds
  the Markets section after you.
- [x] 16:39 AU14 **The palette everywhere, with scopes** (UX backlog U14): `Ctrl+K` from every screen
  including the orbit view and the store; groups Worlds, Records, Entries, Commands, Packages; recent
  first; fuzzy names; a typed hex id ("1910") jumps. Coordinate with Lane E's EN1 (N12, the scoped
  registry): claim `shell/registry.ts` only after E releases it; `OmniBox.vue` likewise.
- [x] 16:45 AU16 **Loading that never shows twice** (UX backlog U16, your half): the chart's immutable sector
  indexes and trees kept in the Cache API through `platform/browser.ts`, so a return visit draws the
  last view with no network wait. Cache only, never persistence (decided in the backlog). Measure a
  return visit before and after.
- [x] 18:51 (released 18:50: Johnny said yes to question 1, a leg to a hidden place shows the hex and no name, and to question 4, own notes keep `rev`) AP1b **P1b, the projection hardened** — **next, before anything below.**
  Source: `directives/players_build_plan.md` step P1b and `reports/x_players_review.md` F3, F14, F15, F20 (read both).
  Files: `packages/shared/src/players_view.ts`, `tests/shared/players_view.test.js`, `apps/web/src/pack/plan.ts` (only
  if a signature changes), `tests/web/player_pack.test.js`. Build exactly the plan's P1b list. Done when the report's
  §8 probe 1 (run from `.tmp/` inside the repo, Node 24) prints filtered party lists, a system anchor and `true`.
- [x] 18:54 AM1 **A debit written "−Cr4,800"** (D's DT1 question 3, decided 18:35): `campaign/money.ts` `formatCredits` puts the
  minus sign before "Cr" (U+2212), for Cr and MCr; callers stop adding their own sign. Claim `campaign/money.ts`; test in
  `tests/web/money.test.js` (or the file that tests it now).
- [x] 19:07 AS3 **The dice card covers the map's locator line** (integration sweep finding 3): `DiceRoller.vue` sits at
  `bottom: 24px`; lift it above the locator line (read the locator's height from the shell, no magic number) at 1600
  and 390. Shots `sa_AS3_*`.
- [x] 19:15 AS3b **Boon and Bane from the palette** (integration sweep): "Roll dice" in the palette opens the roller with
  Boon and Bane reachable, as in the campaign panel; typing "boon" or "bane" finds them. No new dice rule.
- [x] 19:23 AU16b **Old chart versions leave the cache** (your AU16 note, accepted 18:35): when the current truth version
  changes, delete `voyage-chart` entries under other versions' paths; a test with two versions.
- [x] 19:56 AF1 **`tests/web/dice_roll.test.js` fails** (seen in B's run 19:50: "the palette command is Roll dice…" expected 7 and got NaN): yours since AS3b; fix the test or the code, whichever is wrong. First.
- [x] 19:59 AP1c **The party's place follows the same rule as a ship's leg** (your AP1b question 2, decided 19:35: Johnny's question 1 named "a players ship's track **or anchor**"): a party anchor that names a hidden record becomes the system anchor `locate` finds (hexKey and bodyKey only), or null when none, exactly as a track end; "Where are we" keeps the hex. Test beside the track-end test. AP1b question 1 (an unknown handle is `authorName: ''`): keep, as you recommend.
- [x] 20:03 AT1c **T1c, the ship's owners, shares, payment, fuel aboard and upkeep: the shape and the logic** (Johnny
  19:20; `directives/backlog_players_landing_trade.md` step T1c, read it whole): `RecordStatus` gains `owners`,
  `payment`, `fuelTons` (additive, optional, passthrough stays; `players_view.ts` keeps an owner anchor only when its
  record is kept, as P1b does for party ids); new pure `campaign/ship_finance.ts`: shares total and each holder's
  part, due and overdue from the campaign day, `payNow` (a ledger line and the next due day), the upkeep sum of the
  recurring boxes with its parts; `refuel.ts` reads `fuelTons` when present. Every value typed; no rule computes a
  payment, maintenance or a share's value. Tests in `tests/web/ship_finance.test.js`, and the projection test for an
  owner anchor to a hidden person. Next, before AB3.
- [x] 19:28 AB3 **The generation sentences B3 left** (B's B3 leftovers): the person-facing sentences in
  `packages/generation/src/form.ts` and `hand.ts`, in Google style, as B3 did for the Worker; words only, no rule changed,
  no output changed (the parity and golden tests must stay byte-identical).
- [x] 20:06 (released 19:55: Johnny said yes; `rules/mgt2e_random_passenger.json` is in, `npm run rules:gen` run; Johnny: "remember we will want to tweak so the user can select other random tables", so read the table through one function that a chosen table can later replace, no import of the wrapper scattered around) AT3b **T3b, roll a random passenger: the logic** (backlog step T3b, read it whole): `campaign/passengers.ts` reads the generated wrapper of `rules/mgt2e_random_passenger.json` (never the draft in `findings/`), `rollPassenger` as the backlog says, and the test that every roll 11 to 66 is reachable and held once.
- [x] 19:34 AU15 **Search that finds text, the browser half** (UX backlog U15): the palette searches record details and
  journal bodies of the open campaign (in memory, no server); a match shows its line with the word marked. No
  server change. Test with a fixture campaign.
- [x] 20:10 AU17 **Installable** (U17): a web app manifest and a service worker that caches the app shell and
  fonts only; no offline writes; the manifest's icons from `public/favicon.svg`. Check that a deploy
  still serves the new app (no stale shell): say how.
  (orchestrator 18:25, from the players review, F9/F22/F23: the service worker never caches a
  response under `/api/`, never `/join/*` or `/claim/*`, and passes every other non-shell request
  straight to the network; a test lists the cached URLs and asserts none starts with `/api/`.)

- [x] 20:45 AT2b **Refuel by starport class and base** (Johnny 20:39, questions 63 to 67; `rules/mgt2e_space_travel.json` `fuel.byStarportClass`, `fuel.bases`, `fuel.basesNote` are in): `refuel.ts` offers the grade the class sells (none at E and X); at a world with a naval or scout base, base fuel (refined, price null so the referee types it) only for a party vessel marked naval or scout; corsair and Way Station offer nothing. A test per class and per base. First.
- [x] 21:24 AF2 **`fuelMark` is referee-only** (D's DT2b need, 21:10; a players leak once Epic P is live): add `fuelMark: z.enum(['naval', 'scout']).optional()` to `RecordStatus`, and drop it in `players_view.ts` `projectStatus` (`if (key === 'fuelMark') continue;`), with a projection test. **First.**
- [x] 21:15 AT2c **"Post this month" posts the upkeep five** (D's DF12 question, decided 21:10 as D recommends: the purchase price is paid once; the Fuel Tank Cost is a refuel's price, which Refuel posts): `refuel.ts` `MONTHLY_COST_FIELDS` becomes the five `ship_finance.ts` `UPKEEP_FIELDS` uses (Mortgage, Maintenance, Life Support, Salary, Running), one list, not two copies; the refuel test updated. D changes the screen's words.
- [x] 21:18 LS1b **No customs line states what the law bans** (your LS1 question, decided 21:10: Johnny's rule is "no line restates a rule", and all three weapon lines tie a ban to a Law Level range): remove customs-001 and customs-003 from `living/lines/sample.json` as well; E writes customs lines that ask crews to declare or show papers without saying what is banned (LS2).
- [x] 21:37 AD1 **Dice as a tool on the rail, everywhere** (Johnny 20:50: "break out the dice controls to the sidebar before the marketplace or maybe it goes above the ? in the upper right corner and is always available across the experience, like a handy little tool instead of being tucked in with the Campaign tab"; orchestrator's pick: **the rail**, because the "?" is the map's own help and the rail is on every screen) — next after AT2b. A **Dice** item in `shell/Rail.vue` just before Marketplace (claim it; a die icon in the look, the label "Dice" when expanded, a keyboard hint like the others). It opens a small popover beside the rail holding today's `dice/DiceButton.vue` picks (1, 2, 3 dice; Boon; Bane; d6 only, as decided); the result shows in the existing `DiceRoller.vue` card. Works on the map, the orbit view, the store, the account page, signed out too; Esc closes it; at 390 it opens as a bottom sheet. Remove `DiceButton` from `CampaignPanel.vue` (line ~472; claim it for that line). The palette's "Roll dice" commands stay. Tests: the rail item on every route that mounts the rail; the popover rolls; nothing left in the Campaign panel. Shots at 1600 and 390.
- [x] 22:13 (21:55: Johnny supplied the dice rules, `assets/dice_conventions.txt`; cite its lines in `dice/roll.ts` and the tests; D66 is lines 29 to 34) AD2 **D66 and a readable result** (Johnny 21:50: "Dice roller looks good, we also want to have a d66 and then the font for the number result should be like a monospace font, I rolled a 17 and the sci-fi font the 7 was too bendy and hard to make out") — **next, before anything else.** (1) A **D66** pick beside 1D, 2D, 3D in the rail popover and the palette ("Roll D66"): two dice read as tens and units, the first die the tens (Johnny's word, and how `rollPassenger` already reads the table); the card shows "34" with the two dice in order and the label "D66"; Boon and Bane are off while D66 is chosen. (2) The result number in `DiceRoller.vue` (line ~406, `--font-display` Orbitron at 54px) uses `--font-data` (the mono stack the UWP strings use), tabular numbers; check 1, 7, 11, 17, 66 read cleanly at 1600 and 390, and in Edge. Tests: D66 covers 11 to 66 and never a 7, 8, 9 or 0 digit; the card's font. Shots of a 17 before and after. (3) (Johnny 21:57: "add an X on the dice modal to show the user it can be closed") a close button (×, `.ui-btn is-icon`, aria-label "Close dice") in the rail popover's top right, and on the result card if it has none; Esc still closes; at 390 the bottom sheet has it too.
- [x] 22:19 AD3 **The rest of the dice conventions** (Johnny 21:55, "full dice rules", the text now in `assets/dice_conventions.txt`; cite it line by line) — right after AD2, still simple, no typed notation: (1) a **DM** stepper (−, the number, +; default 0, say from −6 to +6 as a presentation range) applied to the total of 1D, 2D, 3D, Boon and Bane (lines 14 to 18: "add or subtract the number shown to the total rolled"); the card shows "2D+3 = 11" with the dice; (2) **D3** and **2D3**: each die halved and rounded up, then added (lines 19 to 26); the card shows each die's face and its D3 value; (3) D66 takes no DM (the text gives it none). Tests per line of the text: D3 maps 1-2/3-4/5-6 to 1/2/3; 2D3 ranges 2 to 6; a DM shifts the total exactly. Palette commands for each. Shots of the popover and a 2D+3 card at 1600 and 390.
- [x] 22:04 XA2 **X-boat ripples: the arrival times** (`spec_xboat_ripples.md` §5 "A2"; XA1 accepted 22:05): earliest, likely and latest from the cited 148+6D hours, station hold 0, off-network off until Johnny gives the wait. D's XD1 waits on it: do it right after AD3. Done in the same pass as the 21:59 line; D can take XD1.
- [x] 22:39 TS1 **Table sets, the shape and the checks** (Z's `findings/trade_tables_design.md` with ZT1b; Johnny 20:39: all ten as recommended): the `TableSet` zod schema in `packages/shared` for the kinds with a roller (random passenger first, then trade), `validateTableSet` (shape, the tables the roller needs, dice coverage, numbers, 256 KB), and the resolver `usePassengerTable` reads (official file unless a chosen set). Pure, tested. After XA2.
- [x] 21:06 LS1 **Living systems: the schema, the seed, the facts** (`spec_living_systems.md` §5, row LS1, as written; Johnny's answers 20:27): `schemas/chatter.ts`, `packages/shared/src/seed.ts`, `living/facts.ts`, selection; ship the 100 sample lines **minus the customs line that paraphrases the Law Level table**. Pure, tested.
- [x] 21:55 XA1 **X-boat ripples: the parameters and the graph** (`spec_xboat_ripples.md` §5 "A1", as written; `xboatRouteRule` = bare records plus typed "Xboat", decisions 20:27). Then **XA2** the arrival times (§5 "A2"): 148+6D h as earliest/likely/latest, station hold 0, off-network within 2 parsecs off by default until Johnny gives the wait.
- [x] 22:04 XA2 **X-boat ripples: the arrival times** (`spec_xboat_ripples.md` §5 "A2"): earliest, likely and latest from 148+6D h, station hold 0, off-network days only when a wait is supplied, horizon, and from/to on the two-way graph.
## Found by me

- [x] 22:50 XA2b (found) **The arrivals timing check survives a busy suite.** The Spinward Marches walk is still a few milliseconds. `npm test` runs files together, and the 5 ms ceiling then read 8 ms and 10 ms. The same file passes alone. The ceiling becomes 25 ms, which still fails a walk that takes a large fraction of a second. The correctness asserts stay.
- [x] 22:48 TS3 (found) **A roll can take a table.** Source: `findings/trade_tables_design.md` §9.3, `rollPassenger(set, face)`. The first argument may be a passenger table for that roll only. A function there stays the face source, so `VesselTrade.vue` is unchanged. The installed table is the default and is not replaced by a passed table.
- [x] 22:43 TS2 (found) **The campaign's chosen table.** Source: `findings/trade_tables_design.md` §9.6 step 2, the `setFor` half. New `apps/web/src/campaign/table_sets.ts` `setFor(kind, settings, ownSets, officials)` returns the chosen set, or the official one. A kind left out of settings is the official set and says nothing. A named set that is missing, the wrong kind, or fails `validateTableSet` is the official set, with "This campaign's <kind> table could not be read; using the official table." No `CampaignSettings` edit, no route, no migration. `rollPassenger` keeps its arguments: `VesselTrade.vue` calls it, and that screen is not this item. The edited-copy roll is already in the passenger tests.
- [x] 16:07 AT2 (found) **T2, fuel and the monthly costs, the numbers only.** Source: `directives/backlog_players_landing_trade.md` Epic T step T2. New `apps/web/src/campaign/refuel.ts` reads `fuel.refinedCrPerTon` and `fuel.unrefinedCrPerTon` from the generated space-travel wrapper. Tons to fill are the sheet's "Fuel Capacity" minus a typed current level. The cost is those tons times the file's Cr per ton, and `refuelLine` posts that as an expense. The seven boxes Purchase Cost, Mortgage Cost, Maintenance Cost, Fuel Tank Cost, Life Support Cost, Salary Cost and Running Cost each become a recurring line when the box has a positive number. No dice, no starport check, no new stored field, no screen. `tests/web/refuel.test.js`: a full tank's Cr sum is the file's number times the tons.
- [x] 23:26 P3 **Players, the client store** (`players_build_plan.md` step P3, as written; B's P2b is green: 35 of 35 leak cases, 23:15): `campaign/membership.ts`, `store.ts`, `read.ts`, `commit.ts`, `workspace/campaigns.ts`, `tests/web/membership.test.js`; `PlayersPage` parse, **`visible` reconciliation** (a row not listed leaves the store), `'gone'` on 403/404, change builders refuse all but a player's own note, join, invite preview, leave, set person. Also export the players schemas from `packages/shared/src/index.ts` (B imported them by path). **Next, before everything below** (players first).
- [x] 23:33 P9 **Players, polling** (plan step P9): a 30 s `after` poll while the panel is open and visible; stops on close, hidden and `'gone'`; both roles. Right after P3.
- [x] 23:37 P3b **Keep `authorName` on held notes** (P3 accepted 23:40; P5, P6 and P7 need it): `holdEntry` deletes `authorName` (`store.ts` ~142). Keep it on held journal rows (an optional field on the client's held-entry shape, or a side map the journal screens read), never sent back in a commit. Test: a page entry with `authorName: 'kim'` keeps it after `applyPlayersPage` and is absent from the commit body. First.
- [x] 23:51 P8 **Players, the map and the dossier for a player** (`players_build_plan.md` step P8, as written) — after P3 and P9: the Builder's right-click items and Select hexes hidden for a player; the party ships, marks and campaign layer from the store; a hidden place on a players ship's track shows the hex and no name; the browser pass with two accounts.
- [x] 23:55 TS2b **A campaign can store its chosen table** (TS2's gap, 23:10): `CampaignSettings` is `.strict()` and has no `tableSets`, so `setFor` reads a key nothing can store. Add `tableSets: z.record(z.string()).optional()` (kind to set id) additively, with an old-rows-parse test and a round-trip test; the players projection carries it (players see the chosen set, decisions 20:39). TS1's question decided: the trade-code name check waits for a name-to-code table in `rules/`.
- [x] 00:02 AU6 **The timeline that fills itself** (UX backlog U6, A's half, as written there): the pure list of dated entries and dated records the timeline shows, with the clock; D mounts it.
- [x] 00:02 AU37 **Undo where "delete with Restore" isn't enough** (U37, as written there; CRUD over undo stands: propose first, as a proposal entry, before any code).
- [ ] **FREEZE for push 1.3.0 (orchestrator 2026-10-18 10:20): finish the item you are on, write its entry, release your claims, then start nothing new until the orchestrator removes this line.** (Not an item to tick.)
- [ ] (HOLD: after Z's SI6b and B's SI1c; decisions 10:15: also `pastedBatch(text)` finds and checks the JSON and submits it through B's owner door) SI2 **Session ingest, the client store, and Copy for your AI** (by part, decisions 10:40: `aiSnapshot(campaign, { parts, universeId, origin })` and a size per part) (`spec_session_ingest.md` §5 SI2 as written, plus decisions 10:00): `campaign/proposals.ts`, the poll hook, `account/tokens.ts`, and `campaign/ai_snapshot.ts` built to Z's SI6 template and fixture (the whole record, every live record; no server read). Tests as the spec lists, plus the fixture text byte for byte.
