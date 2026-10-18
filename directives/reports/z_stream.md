# Stream Z

## Z1 Imports through the reservation; catalogue family and author - done
Files: see `directives/reports/z_install_reservation.md`.
What changed:
- An install reserves the preview's bytes under its charge id before the copy. It releases them after `chargeObjectBytes` or on any failure. A refusal is 400 `too_large`, "This universe is out of space."
- `GET /api/packages` takes `family=` (repeatable, the store's first-match table, now `PACKAGE_KIND_FAMILIES` in `@voyage/shared`) and `author=` (current profile handle). Contract F2 and F8 lines are written.
Gates: test 1927 tests, 1888 pass, 0 fail; check; typecheck; worker suites as listed in the report. Build was not a gate for that prompt and is run from Z2 on.
Shots: none (no screen changed).
Questions: answered on the board 2026-10-17 (current handle; the browser imports the shared table, D8).

## Z2 The parked files, split (answers 1, 3, 4) - done
Files: `apps/api/src/routes/admin.ts`, `tests/api/truth_build.test.js`, `tests/generation/inputs_catalogue.test.js` (new), `apps/api/src/jobs/reconcile_transform.ts`, `apps/api/src/jobs/truth_build.ts` and `tests/generation/reconcile_derived.test.js` (put back to HEAD's content), `apps/api/src/jobs/release_seal.ts`, `tests/generation/release_seal.test.js` and `apps/web/src/views/TruthPreview.vue` (deleted from the tree), `findings/parked/truth_build_2026-10-07/files/**` (the ten, as parked), `findings/parked/truth_build_2026-10-07/README.md`. `apps/api/src/jobs/inputs.ts` and `scripts/dev_make_admin.js` stay as parked. All by editing files; no git.
What changed:
- Shelf: each of the ten, exactly as parked, is copied to `files/<its repo path>` (hashes checked).
- `admin.ts` is HEAD plus the remove route's hunk alone: `import { z }`, `TruthRemove`, `POST /api/admin/truth/builds/:version/remove` and `deleteTruthPrefix`. The release seal hunk and the preview route are shelved.
- `truth_build.test.js` is HEAD plus the remove block (its audit count scoped to `at >= removeAt`) and its helpers on `stateRoot()`. It is cap-safe: the 14-sector `vfeed` build checks that `'all'` gets 400 `one_sector` and a GET gives 404, then builds `[S01]` (202, `data.sectors` `['S01']`) to one sector done. Three binding-call counts gained the one `list` the `inputs.ts` skip makes, and the derived stub's `list` filters by prefix, as in the parked copy.
- The leftover-catalogue test moved from the parked `reconcile_derived` test into `inputs_catalogue.test.js`, so `reconcile_derived` is back to HEAD's content.
- README: a "What is where after the split" table, and "How to bring back what is shelved" (merge hunks only into `admin.ts` and the test; `reconcile_transform.ts` and `truth_build.ts` come back together; the Worker seal is replaced by Z3).
- `git status` among the ten now shows only `inputs.ts`, `admin.ts`, `dev_make_admin.js` and `truth_build.test.js`, plus the new `inputs_catalogue.test.js`.
Gates: `npm test` 2006 tests, 1966 pass, 1 fail, 39 skipped. The fail is `tests/web/record_card.test.js:38`, another lane's new, untracked file. check clean; typecheck clean; build ok. `RUN_API_TESTS=1 node --test tests/api/truth_build.test.js` on port 18898/19898 with its own state (`%TEMP%\z2_truth_state`, migrations applied): 11 of 11 pass. Two earlier runs failed for other reasons. In one, the dev server reloaded when another lane edited source, then crashed with `SQLITE_IOERR_TRUNCATE`. The other found the two count and response fixes above.
Shots: none (no screen changed; `TruthPreview.vue` had no router entry).
Questions: none.

## ZT0 The trade rules file, drafted from `assets/trade.txt` - proposal
Files: `findings/rules_drafts/mgt2e_trade.json`, `tests/generation/trade_rules_draft.test.js` (new). Nothing in `rules/`.
What changed:
- The draft is filled only from `assets/trade.txt` (855 lines). Every section and every row carries `_src`, the line or lines it came from. Rows rebuilt from wrapped extraction cite every line used.
- What it carries: passengers (the four passages and their requirements, the traffic roll with its DMs and world DMs, the 2D table); `fares` (the Passage and Freight table, 1 to 6 parsecs); freight (lots, traffic DMs, the table, late delivery); mail; supplier (the three checks, starport DMs, DM-1 per repeat attempt); goods (availability rules and all 36 D66 rows: type, availability, tons, base price, Purchase and Sale DMs, examples, `illegal`); purchase and sale (3D and their modifiers); `modifiedPrice` (-3 or less to 25+); `localBrokers`; `illegalGoods`. Prose rules are in `notes`, quoted with their lines.
- Renamed or added keys are explained in `_readme`: `goods` is now `{ availability, table }`; `fares`, `modifiedPrice`, `illegalGoods` and `checklist` are new; `broker` is now `localBrokers`; `tradeRoutes` is empty because the text has none. Random Passenger is already in `mgt2e_random_passenger.json`.
- The test parses the draft and checks that every section and row has `_src` and that every cited line exists and isn't blank. Each row's key words (type, roll, label, name, availability, DM codes, text sentences) and its numbers (prices, percents, signed DMs) must appear in the cited lines. Every null needs a `_question`, D66 runs 11 to 66 once, and 61 to 65 are the illegal rows. A wrong price, DM or percent fails it (tried, then restored). It can't catch a DM put in the wrong column; question 2 covers that.
Gates: the test passes 4 of 4. Full gates as in Z2 (same run).
Shots: none.
Questions (for Johnny's review; the draft moves to `rules/` only on his word, then `npm run rules:gen`):
1. Line 44 says "three categories" and then lists four passages (high, middle, basic, low). Recommended: four, as the list has. The draft carries four.
2. On 18 Trade Goods rows, the Purchase DM and Sale DM sit on one line with no comma between them (for example line 563, "Asteroid +4 Industrial +3, Non-"). I split the columns at the missing comma. Rows marked `_question: 2`: 16, 23, 24, 25, 32, 33, 35, 36, 41, 43, 46, 51, 52, 53, 55, 61, 62, 65. Recommended: accept, after checking a few against the book.
3. Availability and DM names stay as printed, including "High-Tech" (32), "High Pop" (35, 36, 42, 63), "Ice Capped" (44, 53) and "High Tech ,High Pop" (36). Recommended: one name-to-trade-code table that you approve, in the module, not in this file.
4. Exotics (66) has no availability, tons, price or DMs (lines 854-855: "a matter for roleplaying"). Recommended: keep the nulls and leave 66 out of every roll.
5. Exotics' `illegal` flag is null: lines 406-408 say "Illegal goods can include illegal exotics". Recommended: null, meaning the referee decides.
6. "a quantity of randomly determined goods equal to the Population code" is split across a sidebar (lines 352 and 395). Recommended: read as one sentence, as drafted.
7. Lines 97-98, "Chief Steward DM+ highest / Steward skill on ship", are drafted as a DM equal to the highest Steward skill on the ship. Recommended: yes.
8. The Mail table's "Freight Traffic DM-10 or less" and similar rows (276-280). Recommended: they mean the total DM that applied to the Freight Traffic roll. Labels are kept verbatim.
9. The sale roll is 3D from line 491 ("works just like purchasing") with line 424. Recommended: yes.
10. `source.pages` is null: the text has no page numbers. Please fill in the book pages.
11. `tradeRoutes` (for T4b) is not in this chapter. Recommended: drop the key, or name the source for it.

## Z3 The seal step (answer 2) - done
Files: `tools/truth/upload_truth.js`, `tools/truth/r2_s3.js`, `tests/tools/upload_truth_seal.test.js` (new).
What changed:
- `--seal` is a new mode with the upload's targets and rules. Alone it is a dry run: it names the count from `truth-local/<v>/manifest.json` (indexes, and N+1 reports if reconciled) and touches no network or wrangler. `--remote --yes`, `--endpoint <url> --yes` (its own keys only) and `--local` do the writes.
- `truth_versions.state` must be `released` (production D1 for `--remote`), or the run is refused with exit 3 before any bucket read. A state that can't be read is refused too.
- It reads `truth/<v>/manifest.json` (written by the release) for the sector list. It re-puts each `truth/<v>/sectors/<slug>/index.json`, and, if `truth/<v>/reconciliation.json` exists, each `reconciliation/sectors/<slug>.json` and `reconciliation/report.json`. Each gets the same bytes, its content type and `public, max-age=31536000, immutable`. Each is a signed S3 GET then PUT; if the ETag changes, that object fails. An object that already has the immutable header is skipped, so a re-run sends nothing. A missing index fails the run; a missing report is listed in `absent`.
- `r2_s3.js`: `getObject` (signed GET, same retries, 404 is `{ status: 404 }`), and `putObject` takes `bytes` as well as `file`.
- The line 25 comment now says: "max-age=60 until the version is released; then --seal re-puts it immutable". The file header documents the seal.
Gates: `node --test tests/tools/upload_truth_seal.test.js tests/tools/upload_truth.test.js tests/tools/r2_s3.test.js` passes 33 of 33. The new file runs against a local stand-in S3 server (signed requests, SHA-256 payload check, MD5 ETags) and covers: the dry-run count; `--yes` and keys; refusal of null, building and withdrawn states and of an unreadable state, with zero requests; a released version (only the two index PUTs; every byte unchanged); a reconciled version (an absent report is listed; a re-run makes 0 PUTs); an absent index; no released manifest; and `--local` through wrangler with `--cache-control`. Full gates as in Z2.
Shots: none.
Johnny's commands (after `POST /api/admin/truth/release/v<N>` has answered 200; v10 has 512 sectors, so about 1,030 to 2,060 S3 requests, none of them Worker subrequests):
```
cd D:/webstorm/traveller_magnus
node tools/truth/upload_truth.js v10 --seal
node tools/truth/upload_truth.js v10 --seal --remote --yes
```
The second needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (Object Read & Write) and a wrangler login, as the upload does. Check: `sealed` plus `alreadySealed` equals the index count plus `reports` minus `absentCount`, and `failedCount` is 0. Run it again and expect `sealed: 0`.
Questions: none.

## Z4 Two example packs to records-only (answer 6) - done
Files: `tools/examples/records_only_v2.mjs` (new), `tools/examples/README.md` (a "Records-only versions" section), `tests/tools/records_only_v2.test.js` (new). Local states: `findings/examples/local` (both version 2s published), `findings/examples/local_backup_pre_v2` (a copy from before), `findings/examples/standin_v2` (a copy of `standin_prod`, seeded). The proof script and log: `findings/examples/z4_check.mjs` and `z4_check.txt`.
What changed:
- `records_only_v2.mjs` reads the latest version of each of the two packs and plans version n+1: `hexKeys: []` and the same `recordIds`. A pack that is already records-only is skipped. A missing, duplicate or unfinished pack is refused before anything is written. With `--apply` it publishes through `POST /api/packages/:id/versions` on a local API (port 8861; PID 54352, started and stopped by the script). It waits for each version, then checks the manifest and the row.
- In `findings/examples/local`, the state production was seeded from:
  - `pk_HP3HB90KFC95QD6FTM408WMNHS` "Regina highport contacts": version 2 has 0 hexes and 13 records, the same ids as version 1 (which had 1 hex).
  - `pk_KQ4ACZ3HTJ927X2T8BNMD1PBZF` "Jewell patrons": version 2 has 0 hexes and 14 records, the same ids as version 1 (which had 6 hexes).
  - Package ids are unchanged, and version 1 stays.
- Stand-in proof on `standin_v2` (production's six ids, with covers). The `seed_production.mjs` dry run printed six `update` lines (Regina and Jewell with `versions 1, 2`), `new packages 0, updated 6`, and `universes 6, manifests 8, objects 33, covers 6`. Then the apply ran (`Applied: 6 packages on the target.`) and a second dry run printed the same lines.
- Through the stand-in's API (port 8862; PID 20424, started and stopped by the script):
  - Each package page shows `latest 2, hexCount 0`, with `recordCount` 13 and 14.
  - Each catalogue card shows `latestVersion 2, hexCount 0`.
  - A new reader's preview of version 2 has 0 hexes, 0 conflicts and no placement.
  - The install writes 0 hexes, 13 records and 10 links (Regina), and 0 hexes, 14 records and 11 links (Jewell). The campaign then holds 13 and 14 records.
Gates: `npm test` (`RUN_API_TESTS` unset): 2069 tests, 2030 pass, 0 fail, 39 skipped. check, typecheck and build are clean. `records_only_v2.test.js`: 4 of 4.
Shots: none (the package page and cards already show records-only packs; no screen changed).
Johnny's commands (production: the usual copy; nothing else to run):
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production
```
Check the dry run:
- `House account found: traveller_voyage (e2b2245a-5260-4b91-8f33-1e02997fd9d5).`
- six `update` lines and no `insert`; Regina highport contacts and Jewell patrons say `versions 1, 2`;
- `new packages 0, updated 6`, then `universes 6, manifests 8, objects 33, covers 6`.

Stop on any `insert`, the duplicate-guard sentence or the "no 0019" sentence. Then:
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production --apply
```
It must end with `Applied: 6 packages on the target.` Install counts are kept. If the cover copy (the z_cover_seed commands) has not run on production yet, this apply also carries the covers, as that copy would have.
Questions:
1. May `findings/examples/local_backup_pre_v2` be deleted once production shows both version 2s? Recommended: yes.
## Z6 Server-side catalogue facets - done
Files:
- `packages/shared/src/schemas/package.ts`: `PackageContents`, `PackageFacetsQuery` (strict), `PackageFacet` and `PackageFacets`, after `PackageCatalogueQuery`.
- `packages/shared/src/index.ts`: exports them.
- `apps/api/src/routes/package_facets.ts` (new, imports only `@voyage/shared`): `familyOfKind`, `facetCounts` (the store's rules) and `facetRows` (one read, capped at `FACET_SCAN` = 5000).
- `apps/api/src/routes/packages.ts`: `GET /facets`, placed after `GET /` and before `/:packageId/versions/:version`, so facets is never read as a package id.
- `tests/api/package_facets.test.js` (new).
- `directives/contracts/b_marketplace.md`: a `GET /api/packages/facets` section in F2, with lines for Lane D.

What changed:
- `GET /api/packages/facets?q=&family=&contents=&edition=&tag=&updated=&author=` answers `{ total, scanned, capped, kinds, contents, editions, tags, updated, by }`, each a list of `{ value, count }`.
- It reads the same packages as the public catalogue (not hidden, `latest_version > 0`). `q` uses the catalogue's `LIKE`. Contents comes from the latest version's `hex_count`, and Publisher from the current profile handle.
- A section's counts are taken over the packages the other sections let through, which is the rule in `apps/web/src/workspace/market/filters.ts`. Lines 155-181 are `facets()`, and lines 112-120 are `passes()`.
- More than 5000 packages matching `q` gives `capped: true`, with counts over the newest 5000.
- No migration and no dependency. The route is the one the item names.

Gates:
- `npm test` (`RUN_API_TESTS` unset): 2086 tests, 2046 pass, 0 fail, 40 skipped.
- check, typecheck and build are clean.
- `package_facets.test.js` without the API: 6 pass and 1 skip.
- With `RUN_API_TESTS=1` set for that one run only: 7 of 7 pass. That run used my own port 18871, inspector 19871 and a temp state folder. It was seeded by SQL with no cookie and no `.dev.vars`. The worker's PID was 3612, stopped by the test; the port was checked free afterwards.
- The parity test compares the counts with the store's own `facets()` for eight filter sets, and they are equal.

Shots: none (server only).

Notes:
- `b_marketplace.md` already had mixed line endings: 743 CRs at HEAD and 779 before I edited it.
- My section is LF only.

Questions: none.
## ZT0b The trade draft, with Johnny's answers - proposal
Files: `findings/rules_drafts/mgt2e_trade.json`, `tests/generation/trade_rules_draft.test.js`. Nothing in `rules/`.
What changed:
- All 27 `_question` marks are cleared. Each row an answer settles now carries `_answer: Johnny
## ZT1 Trade tables the referee picks, a design - proposal
Files: `findings/trade_tables_design.md` (new). No code, migration or route; all of those are proposals inside the design.
What changed:
- The design covers the eight points the item asks for:
  1. the **table set**: the rules file's shape plus a header, as a `TradeTableSet` zod schema in `packages/shared`, passthrough so the `_src` and `_answer` keys ride along;
  2. the official set from `rules/` as the default;
  3. a referee's own sets per account, made by copy and edit, from scratch (copy, then clear), or by loading a JSON file, with Download back;
  4. the campaign's choice: an additive `CampaignSettings.tradeTables` id. `CampaignSettings` is `.strict()` (`packages/shared/src/schemas/campaign.ts:323-330`), so the shared schema ships first;
  5. how T5 reads it: `campaign/trade.ts` takes one resolved set, and every roll's readout names the set;
  6. validation: one shared `validateTradeTables` that checks shape, the tables T5 needs, dice shapes and their coverage, numbers, trade-code names and a 256 KB cap;
  7. storage: a D1 table plus content-addressed R2 objects, safe in either order, with the DO `lists` alternative weighed;
  8. the marketplace as a later package kind.
- Steps are given per lane with files and tests (A, B, D, E, plus Johnny's step 0).
- Against T3c (`directives/backlog_players_landing_trade.md:475-480`), it replaces T3c for trade:
  - whole sets instead of single tables;
  - per account and chosen per campaign, instead of a campaign `tables` copy;
  - D1 and R2 instead of a `campaign_tables` DO row kind.
- T3c stays for the Random Passenger table.

Gates: check is clean (document only; `npm test` was 2046 of 2086 with 0 fail at 19:06, and nothing that runs has changed since).

Shots: none.

Questions: eight, in the design's last section, each with its recommendation first:
1. whole sets;
2. account storage;
3. no campaign one-off copy at first;
4. from
## Z9 `truth_build.test.js` on its own state - done
Files: `tests/api/truth_build.test.js`.

What changed:
- **Run alone** (`RUN_API_TESTS=1`, no `VOYAGE_PERSIST_TO`), the suite now:
  - makes a temp state folder (`voyage-truth-state-*`) and its own dev port, 18877 with inspector 19877. No other file uses those ports; 18881 was taken by `public_course.test.js:253`.
  - sets `VOYAGE_PERSIST_TO` and the ports before loading `server.js` and `session.js`. They are now dynamic imports, because `server.js` reads the port once, when it loads (`tests/api/server.js:9-10`).
  - applies the migrations there in a `before` hook.
  - in an `after` hook, stops its own dev server (the pid file `server.js` writes for that port), then deletes both the `.tmp/api-dev-<port>` folder and the state.
- `runWrangler`, `stateRoot`, `withDevServer` and `dev_make_admin.js` already follow `VOYAGE_PERSIST_TO`:
  - `tests/api/session.js`, `runWrangler`: persist
## Z7 The server sentences B3 left in my files - done
Files: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/packages.ts`, `apps/api/src/routes/installs.ts`, `tests/api/packages.test.js`, `tests/api/install.test.js`, `tests/api/install_records_only.test.js`, `tests/api/install_reservation.test.js`, `directives/contracts/b_marketplace.md` (one note).

What changed: words only. The codes and statuses are unchanged. The sentences come from B3's list for Z (`reports/b_stream.md`, B3, Lane
## Z8 Which starports sell which fuel, a draft - proposal
Files: `findings/rules_drafts/mgt2e_starports.json` (new), `tests/generation/starport_rules_draft.test.js` (new). Nothing in `rules/`.

What changed:
- The draft is filled only from `assets/2eWorldCreation.txt`, and every section and row carries `_src`. It holds:
  - **classes**, from the Starport Facilities table (lines 1127-1158), one row per class:
    - A Excellent, refined (line 1129);
    - B Good, refined (1137);
    - C Routine, unrefined (1145);
    - D Poor, unrefined (1152);
    - E Frontier, none (1157);
    - X No Starport, none (1158).
    It also holds the Fuel note (1177-1178) and the frontier note (1169-1171).
  - **prices**: refined Cr500 and unrefined Cr100 per ton, risky
## ZT0b The trade draft, with Johnny's answers - proposal (re-written 19:52, ZR1)
Why re-written: the 19:07 entry was cut off. PowerShell 5 mangled the double quotes in the text it handed to node. This one is written from a file.

Files: `findings/rules_drafts/mgt2e_trade.json`, `tests/generation/trade_rules_draft.test.js`. Nothing in `rules/`.

What changed:
- All 27 `_question` marks are cleared. Each row an answer settles now carries `_answer: "Johnny 2026-10-17 (ZT0 Qn): ..."`:
  - the 18 Trade Goods rows of Q2;
  - the Chief Steward DM (Q7);
  - the five Mail rows (Q8);
  - the illegal-exotics note (Q5);
  - Exotics, row 66 (Q4 and Q5);
  - `source` (Q10).
- No value changed:
  - Q1: the four passages were already in.
  - Q2: the split was already in.
  - Q4 and Q5: Exotics keeps its six nulls.
  - Q7 and Q8: the labels stay verbatim.
  - Q9: `sale.roll` was already `3D`.
  - Q10: `source.pages` stays `null`.
- Q11: the `tradeRoutes` key is dropped.
- `_readme`:
  - The first paragraph now says how answers are marked.
  - The shape paragraph says `tradeRoutes` is dropped.
  - The values paragraph cites Q3.
  - A new paragraph records Q1, Q6 and Q9.
- The test's null check is now "every question is settled, and a null left carries Johnny's answer". It checks:
  - no `_question` remains, `source` included;
  - every `_answer` names its question;
  - every null has an answer;
  - `tradeRoutes` is gone and `source.pages` is null;
  - Exotics keeps its six nulls;
  - the passages are High, Middle, Basic and Low;
  - selling is 3D.

Q3, the names the module's name-to-trade-code table needs. These are the printed names in the goods table's `availability`, `purchaseDM` and `saleDM`:
- They map to these codes:
  - Agricultural (Ag), Asteroid (As), Desert (De), Fluid Oceans (Fl), Garden (Ga);
  - High Pop and High Population (Hi);
  - High Tech and High-Tech (Ht);
  - Ice Capped and Ice-Capped (Ic);
  - Industrial (In);
  - Low Pop and Low Population (Lo);
  - Low Tech (Lt), Non-Agricultural (Na), Non-Industrial (Ni), Poor (Po), Rich (Ri), Water World (Wa).
- Three are not trade codes: `All` (every world), `Amber Zone` and `Red Zone` (travel zones).
- The table needs 23 printed names for 16 codes.

Gates:
- `trade_rules_draft.test.js`: 4 of 4.
- `npm test` (`RUN_API_TESTS` unset): 2086 tests, 2046 pass, 0 fail, 40 skipped.
- check, typecheck and build are clean.

Shots: none.

Johnny's move (CLAUDE.md:45, "**`rules/` changes only on Johnny's word.**"). On your word, run:
```
cd D:/webstorm/traveller_magnus
copy findings\rules_drafts\mgt2e_trade.json rules\mgt2e_trade.json
npm run rules:gen
npm test
```
`rules:gen` is `node scripts/gen_rules_esm.js` (package.json:14). The `_answer`, `_src` and `_readme` keys go into `rules/` with the values.

Questions:
1. Should the copy in `rules/` keep the `_src` and `_answer` keys? Recommended: yes. They are the citations, and the trade module ignores `_` keys. If not, I strip them in a copy for you to move.

## ZT1 Trade tables the referee picks, a design - proposal (re-written 19:52, ZR1)
Why re-written: cut off at question 4, for the same cause as ZT0b.

Files: `findings/trade_tables_design.md` (new). No code, migration or route; all of those are proposals inside the design.

What changed:
- The design covers the eight points the item asks for:
  1. the **table set**: the rules file's shape plus a header, as a `TradeTableSet` zod schema in `packages/shared`, passthrough so the `_src` and `_answer` keys ride along;
  2. the official set from `rules/` as the default;
  3. a referee's own sets per account, made by copy and edit, from scratch (copy, then clear), or by loading a JSON file, with Download back;
  4. the campaign's choice: an additive `CampaignSettings.tradeTables` id. `CampaignSettings` is `.strict()` (`packages/shared/src/schemas/campaign.ts:323-330`), so the shared schema ships first;
  5. how T5 reads it: `campaign/trade.ts` takes one resolved set, and every roll's readout names the set;
  6. validation: one shared `validateTradeTables` that checks shape, the tables T5 needs, dice shapes and their coverage, numbers, trade-code names and a 256 KB cap;
  7. storage: a D1 table plus content-addressed R2 objects, safe in either order, with the DO `lists` alternative weighed;
  8. the marketplace as a later package kind.
- Steps are given per lane with files and tests (A, B, D, E, plus Johnny's step 0).
- Against T3c (`directives/backlog_players_landing_trade.md:475-480`), it replaces T3c for trade:
  - whole sets instead of single tables;
  - per account and chosen per campaign, instead of a campaign `tables` copy;
  - D1 and R2 instead of a `campaign_tables` DO row kind.
- T3c stays for the Random Passenger table. ZT1b, next, moves it in.

Gates: check is clean (document only).

Shots: none.

Questions (each with the recommended answer first):
1. Is a set the whole trade rules file, rather than one table at a time? Recommended: whole sets. The procedure reads them together, and a mixed set is hard to name in a roll's readout.
2. Where should sets be stored? Recommended: the referee's account (D1 row plus R2 object), chosen per campaign. The alternative is a copy inside each campaign.
3. Should a campaign also keep its own one-off copy? Recommended: no, not at first. "Copy" in the account covers it.
4. "Create from scratch": offer it as copy, then clear tables? Recommended: yes. A blank set fails validation until every table is filled.
5. May players see the chosen set's tables (read-only) when they can see the campaign? Recommended: yes, the tables only, never the referee's other sets.
6. Should sets be shared through the marketplace now? Recommended: no. Download and Load first, the marketplace after T5 is in play.
7. Should the Random Passenger table be part of the trade set? Recommended: no, it stays its own file. Johnny's 19:55 word, in ZT1b, settles this: one mechanism, a set per kind.
8. Should the limit be 256 KB per set and 20 sets per account? Recommended: yes. The official set is about 49 KB.

## Z9 `truth_build.test.js` on its own state - done (re-written 19:52, ZR1)
Why re-written: cut off in the middle of a quoted line.

Files: `tests/api/truth_build.test.js`.

What changed:
- **Run alone** (`RUN_API_TESTS=1`, no `VOYAGE_PERSIST_TO`), the suite now:
  - makes a temp state folder (`voyage-truth-state-*`) and its own dev port, 18877 with inspector 19877. No other file uses those ports; 18881 was taken by `public_course.test.js:253`.
  - sets `VOYAGE_PERSIST_TO` and the ports before loading `server.js` and `session.js`. They are now dynamic imports, because `server.js` reads the port once, when it loads (`tests/api/server.js:9-10`).
  - applies the migrations there in a `before` hook.
  - in an `after` hook, stops its own dev server (the pid file `server.js` writes for that port), then deletes both the `.tmp/api-dev-<port>` folder and the state.
- These already follow `VOYAGE_PERSIST_TO`, so every `vtest` row and object now lands in the temp state:
  - `tests/api/session.js`, `runWrangler`: "persist && args.includes('--local') && !args.includes('--persist-to')";
  - `tests/api/server.js:14-18`;
  - `scripts/dev_make_admin.js:25-27`.
- **Under `scripts/test_api_all.mjs`**, which already sets `VOYAGE_PERSIST_TO` and the ports and removes the state, nothing changes.

Gates:
- The suite run explicitly with `RUN_API_TESTS=1` (that run only): 11 of 11 pass in 286 s. Its own dev server was PID 51756 on 18877, stopped by the suite. Afterwards the port and inspector were free, and the temp state and `.tmp/api-dev-18877` were gone.
- The shared `apps/api/.wrangler/state` D1 file kept its time (19:07:22) and size (741,376 bytes) across the run.
- `npm test` (`RUN_API_TESTS` unset): 2089 tests, 2049 pass, 0 fail, 40 skipped.
- check, typecheck and build are clean.

Shots: none.

Questions:
1. The 15:55 run's leftovers (`vtest` and the versions derived from it) may still be in the old shared local D1, `apps/api/.wrangler/state`. B0b moved `npm run dev` to `apps/api/.wrangler/dev` (`reports/b_stream.md`, B0b), so they no longer reach your dev server. Should that old state be left alone? Recommended: yes, leave it. Nothing reads it now. If you want it clean, delete the folder `apps/api/.wrangler/state` yourself; your old local sign-ins are in it.

## Z7 The server sentences B3 left in my files - done (re-written 19:52, ZR1)
Why re-written: cut off after the first sentence of "What changed".

Files: `apps/api/src/routes/admin.ts`, `apps/api/src/routes/packages.ts`, `apps/api/src/routes/installs.ts`, `tests/api/packages.test.js`, `tests/api/install.test.js`, `tests/api/install_records_only.test.js`, `tests/api/install_reservation.test.js`, `directives/contracts/b_marketplace.md` (one note).

What changed: words only. The codes and statuses are unchanged. The sentences come from B3's list for Z (`reports/b_stream.md`, B3, "Lane Z, not edited") and E's words (`reports/e_stream.md:46-48`, plus line 73: "still drop the word truth if a person can open them").
- Shared sentences:
  - "Invalid JSON.", "Invalid request." and "Invalid limit." become "That request could not be read. Try again." (admin 3 + 3, packages 1 + 7 + 2, installs 1 + 6).
  - "Origin check failed." becomes "That request was blocked. Reload the page and try again." (admin 4, packages 3).
  - "Role required." becomes "You do not have access to that." (packages 1).
- `admin.ts` drops "truth":
  - "That truth version already exists." → "That version already exists."
  - "No such source truth version." → "No such source version."
  - "The source truth version is not released." → "The source version is not released."
  - "Source truth version has no sectors." → "The source version has no sectors."
  - "No such truth build." → "No such build." (4 places)
  - "Invalid truth version." → "That version name is not valid."
  - "That truth version cannot be removed." → "That version cannot be removed."
  - "That truth version is already released." → "That version is already released." (3 places)
- Left as they were: the `admin.ts` sentences that are admin-only, have no "truth" in them, and are not on B's list, such as "Sector catalogue is missing." and "Build is not finished.".
- The tests that quote the sentences were updated:
  - `packages.test.js`: lines 234, 282, 287, 473, 490 and 525;
  - `install.test.js`: line 234;
  - `install_records_only.test.js`: lines 234 and 240;
  - `install_reservation.test.js`: line 312.
- `b_marketplace.md` gets one "Sentences (Z7)" note after the failure-shape line. It gives the old-to-new map, plus B3's "Sign in to continue.", and says to match on `code`, never on `message`. The places that quote the old words are left; the note covers them.

Gates:
- `npm test` (`RUN_API_TESTS` unset): 2089 tests, 2049 pass, 0 fail, 40 skipped.
- check, typecheck and build are clean.
- `package_facets.test.js` with `RUN_API_TESTS=1` set for that run only: 7 of 7. Its own port was 18871, and the worker PID 46540 was stopped by the test.

Not run by me: the four API suites whose assertions changed. They make their session cookie from `apps/api/.dev.vars`, which lane Z doesn't touch.

Needs from others, not edited:
- `tests/web/marketplace_store.test.js:246-257` and `tests/web/public_games_wire.test.js:47-49` still use the old sentences as fixtures, and pass.
- `apps/web/src/workspace/market/fake_store.ts:72` still says "Invalid request.".

Johnny's commands (the four changed API suites, on their own ports 18874, 18876, 18889 and 18897):
```
cd D:/webstorm/traveller_magnus
$env:RUN_API_TESTS='1'; node --test tests/api/packages.test.js tests/api/install.test.js tests/api/install_records_only.test.js tests/api/install_reservation.test.js; Remove-Item Env:RUN_API_TESTS
```

Questions:
1. Should "Invalid truth version." become "That version name is not valid."? Recommended: yes, keep it. The alternative is "That version is not valid."

## Z8 Which starports sell which fuel, a draft - proposal (re-written 19:52, ZR1)
Why re-written: cut off at "risky". The questions were missing.

Files: `findings/rules_drafts/mgt2e_starports.json` (new), `tests/generation/starport_rules_draft.test.js` (new). Nothing in `rules/`.

What changed:
- The draft is filled only from `assets/2eWorldCreation.txt`, and every section and row carries `_src`. It holds:
  - **classes**, from the Starport Facilities table (lines 1127-1158), one row per class:
    - A Excellent, refined (line 1129);
    - B Good, refined (1137);
    - C Routine, unrefined (1145);
    - D Poor, unrefined (1152);
    - E Frontier, none (1157);
    - X No Starport, none (1158).
    It also holds the Fuel note (1177-1178) and the frontier note (1169-1171).
  - **prices**: refined Cr500 and unrefined Cr100 per ton, unrefined "risky to use when jumping" (1178-1180). These are the same numbers as the space travel draft's `fuel`.
  - **bases**: "Bases have their own fuel-refining ability" (1180-1181).
    - Naval: refined, for naval vessels (1309-1312).
    - Scout: refined, for scout ships, retired scout ships included (1320-1322).
    - Corsair: "enough to refuel" corsair ships, grade not stated (1294-1296).
    - Way Station: "servicing scout ships", no fuel word (1324-1326).
  - **skimming**: gas giants give unrefined fuel to streamlined starships in 1D days, at no cost (70-77; line 73, "this eliminates fuel cost").
- The test checks:
  - every `_src` exists and isn't blank;
  - each row's words, sentences and Cr prices are in its cited lines;
  - the classes run A to E and X, in order, with the printed fuel word on each row's line;
  - the prices equal `findings/rules_drafts/mgt2e_space_travel.json`;
  - every null has a `_question`.
  A wrong price fails it (tried with 600, then restored).

Gates:
- `starport_rules_draft.test.js`: 4 of 4.
- `npm test` (`RUN_API_TESTS` unset): 2103 tests, 2062 pass, 0 fail, 41 skipped.
- check, typecheck and build are clean.

Shots: none.

Questions (each with the recommended answer first):
1. Where does it go in `rules/`? Recommended: into `rules/mgt2e_space_travel.json` as `fuel.byStarportClass` (`{ "A": "refined", "B": "refined", "C": "unrefined", "D": "unrefined", "E": "none", "X": "none" }`) plus `fuel.bases`, as D's DT2 question 1 suggests. Refuel then reads one file. The alternative is its own `rules/mgt2e_starports.json`.
2. Does a base's refined fuel serve every ship, or only the ships the text names? Recommended: only the named ones (naval vessels at N, scout ships at S; lines 1311 and 1320-1321). The refuel screen offers base fuel when the referee ticks "naval" or "scout" on the vessel, and otherwise the class's grade.
3. Is fuel at a naval or scout base priced? The text prices only fuel "available for purchase" at the port (lines 1177-1180); `crPerTon` is null. Recommended: null, meaning the referee decides. The alternative is the starport's Cr500.
4. What grade does a corsair base refuel with? Line 1296 says only "enough to refuel". Recommended: null, the referee decides.
5. Does a Way Station sell fuel? Lines 1324-1326 say "servicing scout ships" with no fuel word. Recommended: null, so it is not offered.
6. Berthing Cost, Facilities (Shipyard, Repair, Highport) and the Bases rolls are in the same table but left out. The extraction runs those columns together (for example lines 1129-1135), and the item asks only for fuel. Recommended: leave them out until a screen needs them.
7. Pages: the text names pages only as cross-references (page 257 at line 60, page 259 at line 1181), so `source` has no `pages` key, as you answered for the trade draft (ZT0 Q10). Recommended: same, no pages.

Note (found by me, ZR1): the Z6 entry lost its double quotes for the same cause. Its sense is intact ("so facets is never read as a package id" means the word "facets").
## ZR1 Two entries cut off - done
Files: `directives/reports/z_stream.md` (appended only).

What changed:
- ZT0b and Z8 are appended again in full under their headings, marked "re-written 19:52, ZR1". Z8's seven questions are now in the file, with my recommendations.
- The same cause cut three more of my entries from the last turn, so they are re-written the same way:
  - ZT1 stopped at question 4;
  - Z9 stopped in a quoted line;
  - Z7 stopped after one sentence.
- The cause: I passed the entry text to `node -e` as a PowerShell 5 argument, and PS5 drops or splits embedded double quotes. Entries are now written to a file first and appended from it.
- The design file and drafts were written directly and are whole. I checked the end of `findings/trade_tables_design.md`.

Gates: none needed (report text only).

Questions: none.
## ZT1b The table-set design widened to every rules table a roller reads - proposal
Files: `findings/trade_tables_design.md`. Kept under its name, so the links from ZT1 still work. The title now says "Table sets ... every roller table".

What changed:
- New **section 9, "One mechanism for every roller table"**, quoting Johnny's 19:55 words:
  - 9.1: one `TableSet` envelope `{ kind, id, name, basedOn, edition, tables }`, with `tables` the official file's own content. There is one set per kind. A bare rules-shaped file can be loaded, and its kind is asked for.
  - 9.2: a closed `TABLE_KINDS` registry. Today it has `trade` (`mgt2e_trade`) and `randomPassenger` (`mgt2e_random_passenger`). A later roller table is one line plus its schema and validator. `validateD66List` checks the passenger table: D66, 11 to 66 once, texts and dice strings.
  - 9.3: `CampaignSettings.tableSets` (a kind-to-id map, optional) replaces `tradeTables`. A resolver, `setFor(kind, ...)`, picks the set, and both rollers take the resolved set (`trade.ts` and `passengers.ts`).
  - 9.4: one `table_sets` D1 table with `kind`, and one `/api/table-sets?kind=` route family.
  - 9.5: an editor part per kind.
  - 9.6: the lane steps, changed. Passengers can go first, because T3b's file is in `rules/` now.
- **What of T3c it replaces**, re-written: all of T3c now, the passenger table included.
  - Copying into the campaign becomes copying to the account and choosing the copy.
  - There is no `campaign_tables` DO row kind.
  - T3c's "the campaign's copy wins" and "the rules file is the default" are kept, as `setFor` and `official:<kind>`.
- Question 7 is marked settled by Johnny's 19:55 word. Sections 1 to 8 stand, read as the `trade` kind.
- I didn't read `rules/mgt2e_random_passenger.json`, because `rules/` is forbidden to lane Z. The passenger shape comes from its draft, `findings/rules_drafts/mgt2e_random_passenger.json`.

Gates: check is clean (document only).

Shots: none.

Questions (new only, each with the recommended answer first):
9. Is the list of kinds closed, so a loaded file must be a kind the app has a roller for? Recommended: yes.
10. One route family, `/api/table-sets?kind=`, for every kind? Recommended: yes.
11. Should the passenger list editor ship before the trade editor? Recommended: yes.

ZT1's questions 1 to 6 and 8 are still open.
## Z10 Re-add the example covers D5 now crops - done
Files:
- `tools/examples/trim_covers.mjs` (new).
- `tools/examples/covers/hollow-verge.webp` and `hollow-verge_640.webp` (trimmed). The old pair is in `tools/examples/covers/untrimmed/` (new).
- `tools/examples/README.md`: a "Map covers trimmed as D5 trims them" section.
- `tests/tools/trim_covers.test.js` (new).
- Local states:
  - `findings/examples/local`: Hollow Verge's cover re-added.
  - `findings/examples/local_backup_pre_z10`: a copy from before.
  - `findings/examples/standin_z10`: a copy of `standin_v2`, seeded.
- Proof: `findings/examples/z10_check.mjs` and `z10_check.txt`.

What changed:
- `trim_covers.mjs` does D5's trim to the example files:
  - the same rule: `chartTrim` and `lumaOf`, imported from `apps/web/src/workspace/market/cover_trim.ts`, on a 400 px look, as `trimmedChart` in `cover_image.ts` does;
  - only for a map or system package, by `PACKAGE_KIND_FAMILIES`;
  - the same output: 1600 px and 2 MB, 640 px and 200 KB, WebP at quality 85, 72, 60 or 45, never enlarged.
  - Without `--apply` it prints the plan. `--apply` writes the new pair and keeps the old one in `covers/untrimmed/`. `--upload --state <dir>` re-adds each trimmed pack's cover through `PUT /api/packages/:id/cover` as the house account, then checks the row.
- The result:
  - **Hollow Verge** (sector piece) is trimmed. The 1600x900 picture is 97.6 % dark chart, and its systems sit in 140-260 x 48-177 of the 400 px look. The box is 1148x644 at 228,128, so the cover is 1148x644 (28,122 B) and the thumbnail 640x359 (14,332 B). A second run keeps it whole.
  - **Feri terraces** (system) stays whole, because D5's rule keeps it. It is 87.5 % dark, but its bright pixels reach all four edges, so the box would keep more than 70 % (`TRIM_KEEP_MAX`).
  - The four records packs are not maps, so they are untouched.
- In `findings/examples/local`, the state production is seeded from, `pk_0ER3XMWG1PZD4AHJD89T2XM5GZ` "Hollow Verge" now names cover `99fd85f0522f…` and thumbnail `7d0153b3f26f…`; it was `f443c6d143e2…`. The local API was port 8863, PID 50936, started and stopped by the script.
- Stand-in, `standin_z10`, a copy of `standin_v2`, which carries production's six ids:
  - The `seed_production.mjs --to-local` dry run printed six `update` lines, `new packages 0, updated 6`, Hollow Verge's `cover` line naming `objects/99fd85f0522f…` and thumbnail `objects/7d0153b3f26f…`, and `universes 6, manifests 8, objects 33, covers 6`.
  - The apply printed `Applied: 6 packages on the target.`.
  - `z10_check.mjs` then found, in both states, that the rows name the trimmed pair and the R2 objects equal the files byte for byte.
  - Through the stand-in's API (port 8864, PID 54032, started and stopped by the script), the package page and the catalogue card both give `cover.hash 99fd85f0…`, `thumbHash 7d0153b3…` and `source: "upload"`.
- Feri terraces' cover is unchanged everywhere.
- On production, the old Hollow Verge pair stays as unused objects. The seed copies objects and never deletes on update.

Gates:
- `trim_covers.test.js`: 5 of 5. It covers families, a synthetic chart cut to a padded 16:9 box, a bright picture and a full chart kept whole, the limits and no enlarging, and the example files as D5 leaves them.
- `npm test` (`RUN_API_TESTS` unset): 2195 tests, 2153 pass, 0 fail, 42 skipped.
  - The run before it had one fail, in Lane D's `tests/web/living_settings.test.js`, which expected a sentence `LivingSettings.vue` doesn't yet hold. D claimed both files at 21:43 and is working on them. The next run was clean.
- check, typecheck and build are clean.

Shots: none taken. The trim is D5's, already shot in `sd_D5_card_after_1600.png` and `sd_D5_card_after_390.png`.

Johnny's commands (production: the usual copy from `findings/examples/local`). First the dry run:
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production
```
Check the dry run:
- `House account found: traveller_voyage (e2b2245a-5260-4b91-8f33-1e02997fd9d5).`
- six `update` lines and no `insert`;
- `new packages 0, updated 6`;
- the Hollow Verge `cover` line names `objects/99fd85f0522f…` and thumbnail `objects/7d0153b3f26f…`;
- `universes 6, manifests 8, objects 33, covers 6`.

Stop on any `insert`. Then apply:
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production --apply
```
It must end with `Applied: 6 packages on the target.`. This one apply also carries Z4's two version 2s, if that copy hasn't run yet.

Questions:
1. Feri terraces stays whole, because D5's rule keeps it (its bright pixels reach every edge). Should I leave it? Recommended: yes, leave it. The alternative is a new, tighter screenshot of the Feri system, made by hand and re-added through this tool.
2. May `findings/examples/local_backup_pre_z10` and `standin_z10` be deleted once production shows the trimmed cover? Recommended: yes.
## SI5 (21:50, done 22:01): session ingest, the skill and the schema

Item: `Z.md` line 107. Sources: `spec_session_ingest.md` SI5 and 2.4; `reports/x_session_ingest.md` appendix A (lines 702-957) and 4.5; `contracts/b_session_ingest.md` "Schema exports"; `decisions.md` 20:24 and 20:27 (line 18: words "Proposals", "Agent access", "Bring in a session", "your AI agent"; "SI" not in app copy; referee only until phase 5; sheets in phase 4; token bound to one campaign by default; never audio or transcripts).

Files:
- `packages/shared/src/schemas/proposals.ts` (new): appendix A as written, zod 3, importing from `./campaign.ts`. Three changes. (1) A comma was missing after the `record.update` option. (2) The update's "nothing to change" `.refine` moved from that option to a `superRefine` on `Proposal`, because a zod 3 discriminated union takes plain objects only (the typed option is `ZodObject`). Same message; path `set`. (3) Added `export type` for `ProposalState` and `AccessScope`. A file comment was added at the top.
- `packages/shared/src/index.ts`: one export block, the 26 names in B's contract list, from `./schemas/proposals.ts`.
- `tests/shared/proposals.test.js` (new), 13 tests, 13 pass. The six the spec names: the example batch parses; a `visibility` key on a record is refused; a `ref` that names nothing is refused; 201 proposals are refused (200 pass); a 301-character quote is refused (300 passes); a duplicate `ref` is refused. Also: `visibility` on the proposal itself is refused; a link to a ref created later is refused; a fourth quote is refused; an update with nothing to change is refused; a create with an `id` or without evidence is refused; a decision may carry an edit. The SKILL.md frontmatter check (report 4.5): only `name, description, license, compatibility, metadata`; the name format, at most 64 characters, no reserved words; the description is 1 to 1,024 characters with no tags; compatibility is at most 500 characters; metadata values are strings; the file is under 500 lines. The words check: Proposals, Agent access, your AI agent; no "SI".
- `findings/session_ingest/SKILL.md`: version 0.2-draft. Added: nothing applies without review (a rule); the referee's own agent records, transcribes and extracts, and the site takes only the batch over MCP, never storing audio or a transcript; the decided words. Before you start now has a referee-only step, and the token bound to one campaign by default. Two new rules: sheets, images, party, settings and hexes are not proposals; keep the recording and transcript with the referee. Submit errors gain 401, 403, 404, and 503 `tokens_unavailable`/`proposals_unavailable`. The report says "as your AI agent". 144 lines.
- `findings/session_ingest/references/shape.md`: the ref order rule, the 120-character label, the 8 to 64-character key, "at least one of set or append", and "every object is strict".
- `findings/session_ingest/references/transcription.md`: an opening paragraph saying this is the agent's work on the referee's tools, and the site never receives audio or a transcript.
- `example_batch.json` and `example_transcript.md`: unchanged. The batch parses as written.

Gates (`RUN_API_TESTS` unset): `npm test` 2214 tests, 2170 pass, 42 skipped, fail 2 then 1 on a rerun. The one that remains is `tests/web/style_class_collision.test.js:99` "an unscoped class rule in dossier or surface is defined in one file". It is about other lanes' in-progress dossier and surface `.vue` files (D and X claims at 21:51/21:56); none of them are mine. check clean, typecheck clean, build clean.

Questions:
1. The skill folder is `findings/session_ingest/`, but the spec rule says `name` must match the parent directory. When it is published, should it go in a folder named `voyage-session-ingest/`? Recommended: yes, rename only at publish time (the test checks the name format, not the folder).
2. The contract's routes table says a batch read carries each proposal's `appliedId`, but appendix A's `StoredProposal` has `targetId`. Keep `targetId`, which the export list and the schema use, and have B change the contract's word? Recommended: yes, keep `targetId`.
3. B and SI1 should know: the "nothing to change" check is on `Proposal`, not on the update option. Note it for SI1? Recommended: yes. There is nothing to run.
## ZT5 (23:14, done 23:24): the trade procedure, the logic

Item: `Z.md` line 85. Sources: `rules/mgt2e_trade.json` (read only; every result's `cites` are the `_src` lines it used, all `assets/trade.txt:N` or `N-M`), `assets/trade.txt` 303-499, A's TS1 resolver (`campaign/table_sets.ts` `setFor`, done 22:39), and `decisions.md:57` ("names as printed with an approved name-to-code table in the module").

Files:
- `apps/web/src/campaign/trade.ts` (new). It is pure, has no screen, and imports only the generated wrapper and `validateTableSet`.
  - `tradeTables(set)`: a trade set that passes its checks, otherwise the official file. The caller passes `setFor('trade', ...).set`.
  - `TRADE_CODE_NAMES`: 16 codes and 20 printed spellings, the list approved from `z_stream.md:228-236`. `ZONE_NAMES` adds Amber Zone and Red Zone; `worldNames(world)`.
  - Find a supplier (lines 311-335): `findSupplier` takes kind supplier, blackMarket or online. It rolls 2D plus skill, the characteristic DM, `starportDm` and DM-1 per earlier attempt this month, against the 8 parsed from "Average (8+)". Time is 1D days or hours. Online is refused below TL8 or with an unknown TL. Finding a buyer is the same call (492-493).
  - Goods available (336-352, 395-422):
    - `quantityDm`: Population 3- is -3, 9+ is +3.
    - `rollTons`: the DM goes on the dice, then the multiplier; zero or less means none.
    - `goodsAvailable` for a supplier: all Common Goods, the legal goods matching the world's codes, and population-code D66 rolls, re-rolling 61-65. A repeat adds a lot.
    - For a black market: the matching illegal goods, plus population-code rolls of 1D with 6 leading.
    - A 66 (Exotics) goes to `exotics` for the referee.
  - Prices (423-436, 457-499):
    - `columnDm` takes the largest DM in each column.
    - `saleDm` uses the column or, for a locally banned good, the world's Law Level less the banned-at level, whichever is higher. The banned-at level is the referee's number; no ban list exists.
    - `modifiedPriceRow`.
    - `purchasePrice`: 3D + Broker + Purchase DM - Sale DM - the supplier's Broker (assumed 2).
    - `salePrice`: 3D + Broker + Sale DM - Purchase DM - the purchaser's Broker (assumed 2).
  - Local brokers (354-372): the hired broker's skill replaces the Traveller's, plus DM+2 on negotiations. The fee is 10% of the gross, or 20% for illegal goods. `rollLocalBroker` returns the 2D total and the total over 3 unrounded. A natural 2 on the fixer's roll marks an informer.
- `tests/web/trade.test.js` (new): 18 tests, 18 pass, all on seeded dice.
  - Tables: official by default, a chosen set read, a broken set falls back.
  - Names: every printed name in the goods table has a code or is All or a zone.
  - The dice forms, the starport DMs, supplier, black market and online.
  - Quantity DMs; the Industrial example of lines 409-419; random rolls with re-roll, repeat and 66; the black market.
  - Largest DM; illegal goods with a local ban and a zone; the price bands; purchase; sale; brokers and fees; the informer; Exotics refused.

Gates (`RUN_API_TESTS` unset):
- `npm test`: 2311 tests, 2269 pass, 0 fail, 42 skipped. check is clean.
- typecheck and build are red, but not from this item. Every error is TS2300 "Duplicate identifier" in `packages/shared/src/index.ts` lines 81-102: the players exports are listed both as `export {` and `export type {`. Lane A claimed that file at 23:15 and is mid-edit.
- `vue-tsc -b` with those lines filtered out shows no other error, so `trade.ts` typechecks. Re-run typecheck and build once A releases the file.

Questions (the points the file leaves open; each is coded as recommended and easy to change):
1. Starport D, E and X: the file lists DMs only for A, B and C (lines 333-335). Are they DM+0? Recommended: yes.
2. Does the starport DM also apply to the black market and online searches? Recommended: yes, all three (line 331, "finding a supplier"). The alternative: the ordinary supplier only.
3. Population DM on quantity: on the dice before the multiplier, (2D-3) x 10? Recommended: yes. The alternative: on the final tons.
4. A black market supplier: only illegal goods (no Common Goods), with as many random 1D rolls as the population code? Recommended: yes for both. Line 404 says "any randomly rolled", with no count.
5. Local broker skill "2D/3" (lines 357, 364): how to round? Recommended: down. `rollLocalBroker` returns the exact third, so the screen or Johnny decides.
6. "Use only the largest" with a negative DM (Common Consumables, Asteroid -4): the largest that applies, even when negative? Recommended: yes, as coded.
7. A local ban's Law-difference Sale DM on the sale only, not in the purchase roll's "- Sale DM"? Recommended: yes (lines 444-452 speak of selling on the banned world).
8. The text's Industrial example (409-419) does not list Vehicles (56, available on Industrial). The table wins? Recommended: yes.

## ZC1 Living Systems Comms: the engine, the corpus adapter, the mixer, the scheduler, Beowulf, the audit (Z 00:08, done 00:26)

### The receiver interface (for C's CC1)

```ts
// apps/web/src/living/comms/controller.ts
export type CommsMessage = { ch: string; type: string; from: string; text: string; status?: string; band?: string };
export interface CommsScreen {
    transmit(message: CommsMessage): void;            // one utterance; the screen animates it
    idle(options?: { keepLast?: boolean }): void;     // keepLast: hold the last line; bare: clear
    onTranscriptComplete(callback: () => void): void; // the controller registers once at creation
    destroy(): void;                                  // never called by the controller
}
export function createCommsController(deps: {
    screen: CommsScreen;
    clock?: { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
    store?: { get(key: string): string | null; set(key: string, value: string): void };
    lines?: () => readonly ChatterLineData[];
    visibility?: { visible(): boolean; onChange(fn: () => void): () => void };
}): {
    update(input: { facts: SystemFacts | null; truthVersion: string; campaignKey: string; shown: boolean }): void;
    state(): 'off' | 'dead-air' | 'speaking' | 'dwell' | 'fading';
    destroy(): void;
};
```

Wiring from `mountCommsReceiver(root, { onTranscriptComplete })` (C's `receiver_render.ts`):

```ts
let done = () => {};
const r = mountCommsReceiver(root, { onTranscriptComplete: () => done() });
const ctl = createCommsController({ screen: { transmit: r.transmit, idle: r.idle, onTranscriptComplete: (cb) => { done = cb; }, destroy: r.destroy } });
// watch(facts, truthVersion, campaignKey, shown) -> ctl.update({...});  onUnmounted: ctl.destroy(); r.destroy();
```

- **What `shown` means:** chatter switched on, not quiet, and the system view showing.
- **The defaults** come from `platform/browser.ts`: `now`, `storageGet`/`storageSet`, `pageVisible`/`onPageVisibility`. Timers are plain `setTimeout`.
- **What the controller decides:** it is the only timer authority. The screen has no pool, no queue and no timers of its own.
- **`from` text:** upper case, as in the package samples.
- **Channels:**

  | channel | ch | type |
  |---|---|---|
  | approach | CH 03 | LOCAL APPROACH |
  | dockside | CH 07 | DOCKSIDE |
  | services | CH 11 | PORT SERVICES |
  | common | CH 16 | COMMON |
  | weather and the beacon | CH 01 | TRAFFIC ADVISORY |
  | Beowulf | CH -- | ARCHIVE RELAY |

  Beowulf messages also carry status PLAYBACK and band RECORDED SIGNAL.
- **A weak turn** carries the band "WEAK CARRIER".

### Files

- **New: `apps/web/src/living/comms/`**
  - **`roster.ts`:** 12 stable callsigns from `(hexKey, truthVersion)`, plus the seeded draw helpers (`@voyage/shared` hashString and mulberry32).
  - **`events.ts`:** the package's 60 procedural scenes, verbatim from `engine/chatterProcedural.ts` lines 91-398. Four gates are tightened. A D or E station is "<world> Field". It also has `welcomeFor`, `nextProceduralEvent` (family draw, then scenario), the cadence bands and `suggestedGapSeconds`. Event ids are `proc:<id>`.
  - **`corpus_events.ts`:**
    - the corpus adapter: `BLOCKED` rumour, distress, news and advert;
    - `EXCLUDED` (121 refused ids), `SHIP_ALLOWED` (51) and `SHIP_NEEDS_STAFF` (17);
    - the UWP gates, `AIR_WORDS`, the slot resolver, speakers and channels;
    - event ids `line:<id>`.
  - **`mixer.ts`:** 60% procedural, deterministic by `(hexKey, tv, day, eventIndex)`. Each source falls back to the other; when both are empty the result is null, which means dead air.
  - **`beowulf.ts`:** the verbatim quote and four segments (`receiver/comms-receiver.js` lines 24-30), the 1/2048 FNV gate (lines 37-42), and one uninterruptible event. The flag is `voyage.comms.beowulf.<campaignKey>`, set when playback starts.
  - **`controller.ts`:** the scheduler.
- **Replaced: `apps/web/src/living/lines/corpus.json`.** It is now the package's `content/corpus.json`, byte for byte, 1,178 lines (decisions.md 2026-10-17 23:50, superseding answer 47).
- **Changed: `tests/shared/chatter_schema.test.js`.**
  - The thousand-line split test is replaced by the shipped split: control 143, customs 113, news 182, market 160, weather 134, advert 124, ship 145, rumour 135, distress 42.
  - It keeps the thin, trade-code, atm, fixture-hearing (40 or more) and distress-weight checks.
  - The six-check test now requires every corpus failure to be refused by `corpusGate` on every fixture. sample.json must still pass clean.
- **New tests:**
  - `tests/web/comms_engine.test.js` (16 tests);
  - `tests/web/comms_controller.test.js` (10 tests, fake clock, screen, store and visibility).
- **New: `findings/living_systems/comms_audit.mjs`** runs the real controller for 30 minutes on six worlds.
- **New: `findings/living_systems/comms_audit.md`** holds the line-by-line corpus review, the prototype review, the transcript findings and fixes, and the six transcripts.

### The brief's checklist (IMPLEMENTATION_BRIEF section 7), by test

| item | result | where it is checked |
|---|---|---|
| Rumour, distress, news, advert never air | pass | engine test "rumour, distress..." on all six fixtures |
| Allowed categories gated by UWP; customs needs a staffed port | pass | engine tests: X port, E port |
| Silent while away or in jump | pass | engine "nothing plays away or in jump"; controller "away and in jump" (1 h of dead band) |
| No X tower, no E formal ATC, no highport ops without a highport, no vacuum weather | pass | engine tests, four of them |
| Gaps: busy 15-45 s, ordinary 40-115 s, quiet 125-360 s | pass | engine "the gap follows the cadence bands"; controller first test (min and max edges) |
| Next turn only after transcript complete, then a 1-3 s dwell | pass | controller "the next turn waits..." (edges at 999 ms and 3 s) |
| After the last turn: idle keepLast, then idle, then dead air | pass | controller first test |
| Callsigns stable by (hexKey, truthVersion) | pass | engine "callsigns are stable..." |
| Events by (hexKey, tv, day, eventIndex); eventIndex monotonic and persisted | pass | engine determinism; controller "history persists" across a remount |
| Per-system history with eviction; no starvation | pass | controller "a starved pool..." (12 h on an X world with no corpus: over 100 utterances) |
| Cancel on chatter off or quiet, jump, truth change, unmount | pass | controller "chatter off, a jump and a truth change..." and "destroy..." |
| Route change | pass | by unmount, which destroys; it is the Vue wrapper's job to call `destroy()` |
| Hidden tab pauses, no backlog | pass | controller "a hidden tab..." (2 h hidden, then one event; a transcript that ends while hidden waits) |
| Beacon once per real arrival | pass | controller "the beacon plays once..." (not on re-update, a chatter toggle or a remount; yes after away or jump) |
| Beowulf 1/2048, A-E ports, inSystem or docked, once per campaign, four segments, no interleave, no button | pass | engine Beowulf test; controller Beowulf test |
| Long utterances split at sentences within an event | pass | engine "a long utterance..." |
| No skip button, no waveform selector, receiver visuals | n/a | C's CC1 |

### Results

All three gates were run with `RUN_API_TESTS` unset.

- **Tests:** `node --test "tests/**/*.test.js"` gives 2406 tests: 2361 pass, 0 fail, 45 skipped. The skips are existing API suites.
- **`npm run check`:** manifesto clean.
- **`npm run typecheck`:** clean. B's two errors from 23:48 are gone.
- **`npm run build`:** clean.

### Sample (Mirewell, C, Ag Wa, the first five minutes; all six worlds are in the audit)

```
00:01 CH 01 MIREWELL BEACON: Welcome to Mirewell. Arrivals call Mirewell approach on channel 4. Have your vessel registration ready.
01:35 CH 03 MIREWELL CONTROL: Leda 63, traffic crossing above you. Range 3 thousand. No course change.
01:40 CH 03 LEDA 63: Traffic in sight. Holding course.
02:54 CH 16 JUNE 20: To the ship that skimmed before us: thanks for telling us the upper layer was quiet. It wasn't.
04:55 CH 16 MICA 73: Kiln 22, you're cutting out. Shift to narrowband.
```

### Questions

92. **Borderline high-law customs lines.** customs-085, customs-089 and customs-098 are terse high-law inspector lines. Keep them? *Recommended: keep.* They are procedural, not threats. They were reviewed in the audit's section 3.
93. **Alien-flavoured lines.** market-156/157/158 and ship-116/141 are alien-flavoured traders and crews; they name no species or polity. Keep them? *Recommended: keep.* The ship lines are staff-gated now.
94. **The procedural and corpus mix.** The share is 60% procedural and 40% corpus where both have something unheard. Is that right? *Recommended: yes for now; tune after C's receiver is live.*

### Not done

- **C's wiring** into `CommsReceiver.vue` is CC1. Nothing in the app mounts the controller yet.
- **`lines.ts`** still describes the corpus as "the thousand-line pool" (line 12). The file is unclaimed and is not mine; it is a one-word fix for whoever owns it.
## ZT6 Freight and passengers available at a world, the logic (Z 00:26, done 00:30)

ZT6 did not need to change `trade.ts`: questions 84-91 still have no answers, so I left the file alone.

### Files

- **New: `apps/web/src/campaign/traffic_lots.ts`.** It is pure and reads its tables through `trade.ts` `tradeTables(set)`. That is the same table-set resolver ZT5 uses. With no set, or a set that fails its checks, it reads the official file.
- **Exports:**
  - `trafficTables`;
  - `worldDmApplies(label, world)`. It returns null for a label it cannot read; the procedure then puts that label in `unread` rather than guess;
  - `passengerTraffic(q)`: four 2D rolls in the file's order (Low, Basic, Middle, High). Each roll gets the check's Effect, the Chief Steward and the per-class DM. It adds both worlds' DMs and the parsec DM, reads the traffic row, then rolls that row's dice;
  - `freightTraffic(q)`: three rolls in order (Incidental, Minor, Major), then each lot's tons (1D x 10, 1D x 5 or 1D). The result's `sharedDm` is what feeds mail;
  - `mailOffer(q)`. It applies the freight DM band, armed, TL 5 or less, rank and SOC; mail is offered on 12 or more, with 1D containers of 5 t at Cr25000 each, all or none. It returns null when a set has no mail table;
  - `fare(parsecs, passage)` and `freightPay(parsecs, tons)`. Both return null past the table's 6 parsecs;
  - `lateReduction(face)`: 1D+4 x 10%, at most 100;
  - `passageNeeds(counts)`: staterooms, cargo tons, spare tons, low berths and Steward levels.
  - Every result carries `cites` (`assets/trade.txt` lines from the file's `_src`).
- **New: `tests/web/traffic_lots.test.js`.** Nine tests with seeded faces; each test fails if the code asks for more dice than it was given. They cover:
  - every DM source;
  - the table edges (the "1 or less", "20 or more" and 0 rows);
  - lot tons;
  - the mail bands at -11, -10, -9, -5, -4, 4, 5, 9, 10 and 15;
  - fares at 1, 2, 3 and 6 parsecs, and past the table;
  - a chosen set's fare;
  - a set with no mail table;
  - an unreadable label returned in `unread`;
  - refusing 0 or fractional parsecs.

### Results

All gates were run with `RUN_API_TESTS` unset.

- **Tests:** `node --test "tests/**/*.test.js"` gives 2416 tests: 2371 pass, 0 fail, 45 skipped. The skips are the API suites.
- **`npm run check`:** clean.
- **`npm run typecheck`:** clean.
- **`npm run build`:** clean.

### Questions (Halt & Challenge: each is coded as the recommendation and can be changed in one place)

95. **Mail's "Freight Traffic DM".** Johnny's ZT0 Q8 answer is the total DM on the Freight Traffic roll, but each of the three rolls has its own per-size DM (Major -4, Incidental +2). Is the total the shared part only: the check, both worlds and the distance (`FreightResult.sharedDm`)? *Recommended: yes, the shared part.*
96. **"World is TL of 5 or less" (line 282).** Is that the world the mail leaves from? *Recommended: yes.*
97. **"Each parsec of destination past the first" (lines 112, 191).** Is it applied once per roll, not once per world, even though it sits under "for both source and destination worlds"? *Recommended: once.*
98. **Steward levels.** Are they counted per passage class, each rounded up, then summed? Then 11 High and 3 Middle need 2 + 1 = 3 levels. *Recommended: yes.*
99. **"Cannot usually exceed the number of people resident" (lines 122-128).** Leave it unenforced and let the referee decide? A screen could warn when the source world's population code is 1 or less. *Recommended: don't clamp.*
100. **Fares past 6 parsecs.** Return null, since the table stops at 6 and no jump is longer? *Recommended: yes.*
101. **Chief Steward with no Steward skill aboard.** Use DM+0, so the caller passes 0 and the untrained -3 does not apply? *Recommended: yes.*
## ZF1 Tests that need git-ignored files (Z 09:43, done 09:51)

### Changes

1. **The skill is now tracked.**
   - Five files were copied byte-identical (hash-checked) to `tools/session_ingest/`: `SKILL.md`, `references/shape.md`, `references/transcription.md`, `example_batch.json` and `example_transcript.md`.
   - The originals in `findings/session_ingest/` were removed, and `findings/session_ingest/README.md` is now a one-line pointer to the new folder.
   - `tests/shared/proposals.test.js` line 9 now reads `SKILL_DIR = join(ROOT, 'tools', 'session_ingest')`.
   - `directives/spec_session_ingest.md`: all 7 mentions (lines 9, 20, 372, 392, 424 and 425) now point to `tools/session_ingest/`.
   - `directives/contracts/b_session_ingest.md` has no mention of the folder, so nothing changed there. B also claims it from 09:42.
   - Historical reports (`reports/x_session_ingest.md`, `session_ingest_plan_review.md`, `prompts/x_session_ingest_spec.md`) were left as written.
2. **`tests/generation/trade_rules_draft.test.js`** now reads `rules/mgt2e_trade.json`. I compared the files first: `fc /b` found no differences, and the SHA-256 of both is 42A6B13B….
3. **`tests/generation/starport_rules_draft.test.js`** gives each of its 4 tests `{ skip }` when `findings/rules_drafts/mgt2e_starports.json` or `mgt2e_space_travel.json` is absent; the test reads both. The skip message names the missing file and the reason.
4. **`tests/web/comms_engine.test.js`**: the "byte for byte" test skips when the package corpus is absent, and its message names the path. The 1,178-line count is still checked in `chatter_schema.test.js`.

### Proof

- **Scratch copy:** I made a copy under `%TEMP%`, without `.git`, `findings/` or `assets/Traveller_Living_Systems_Comms_FINAL/`, with `node_modules` linked by junction. Then I deleted it, removing the junctions first; the original `node_modules` is intact.
  - The four files: 37 tests, 32 pass, 5 skip (4 starport, 1 corpus), 0 fail.
  - The full suite: 2420 tests, 2365 pass, 54 skip, **1 fail**.
  - The fail is `tests/web/surface_city_pixels.test.js:211`. Its harness (`tests/web/harness/city_pixels.mjs` line 15) loads `__FS__/findings/city_design_s1_manifest.json`, and Vite returns its HTML page instead of JSON. That file is not in this item and it is X's pixel test (decisions.md 22:40, item 81: "X's pixel test stays untouched"), so I left it.
- **In the tree:** the four files give 37 of 37 passing.
- **Gates** (`RUN_API_TESTS` unset):
  - `npm test`: 2420 tests, 2374 pass, 0 fail, 46 skipped;
  - `npm run check`: clean;
  - `npm run typecheck`: clean;
  - `npm run build`: clean.

### Questions

105 (now 109, see ZF1b). **The city pixel test fails on a fresh checkout,** because it needs `findings/city_design_s1_manifest.json`. Who fixes it? *Recommended: give it to X or C as a ZF1-style skip with the reason, or move the manifest under `tests/`. Lane Z can do it if the orchestrator lifts "X's pixel test stays untouched" for this one line.*
106 (now 110, see ZF1b). **The skill's frontmatter name** is `voyage-session-ingest`, but its folder is now `tools/session_ingest`. The Agent Skills format wants them to match; that was my SI5 question 1 (`z_stream.md` line 535). *Recommended: when the skill is published, hand it out as a folder named `voyage-session-ingest`, and keep `tools/session_ingest` in the tree as ZF1 asked.*
## ZF1b The skill lives in `skill/` (Z 09:51, done 09:59)

### Changes

- **Moved:** `tools/session_ingest/` to the repo-root `skill/`, which Johnny made empty. The files are `SKILL.md`, `references/shape.md`, `references/transcription.md`, `example_batch.json` and `example_transcript.md`, hash-checked identical before the old folder was deleted. Nothing is left in `tools/session_ingest/`; `tools/` again holds only `examples`, `geomorphs` and `truth`. `skill/` is not git-ignored.
- **`tests/shared/proposals.test.js`:** `SKILL_DIR = join(ROOT, 'skill')`.
- **`directives/spec_session_ingest.md`:** all 7 mentions (lines 9, 20, 372, 392, 424 and 425) now point to `skill/`.
- **`directives/contracts/b_session_ingest.md`:** one line added under the phase notes, after line 18. It says the skill the referee's agent runs is `skill/SKILL.md`, with `skill/references/` and `skill/example_batch.json` beside it. The file had no path to repoint, and B's 09:42 claim had been released by 09:51.
- **`findings/session_ingest/README.md`:** the pointer now names `skill/`.
- **Left as written:** `decisions.md:1175` and the historical reports, `z_stream.md`'s ZF1 entry included. They describe what happened at the time.

### Proof

- **Scratch copy** without `.git`, `findings/` or the comms package; I deleted it afterwards, removing the junctions first.
  - The four ZF1 files: 37 tests, 32 pass, 5 skip, 0 fail.
  - The full suite: 2421 tests, 2365 pass, 54 skip, 2 fail:
    - `surface_city_pixels.test.js:211`: the same failure as in ZF1, because it needs `findings/city_design_s1_manifest.json`;
    - `comms_receiver.test.js:331` ("module is not defined"): C's file, claimed by C at 09:50. It failed in the tree too at that moment, and it passes in the tree in the final run below. It was C's work in progress, not a missing file.
- **In the tree** (`RUN_API_TESTS` unset):
  - `node --test "tests/**/*.test.js"`: 2421 tests, 2375 pass, 0 fail, 46 skipped;
  - `npm run check`: clean;
  - `npm run typecheck`: clean;
  - `npm run build`: clean.

### Questions

My two ZF1 questions are renumbered: the orchestrator's snapshot questions now take 105 to 108.

109. **The city pixel test fails on a fresh checkout,** because it needs `findings/city_design_s1_manifest.json`. It is not on the 11:00 audit's list. *Recommended: move that manifest under `tests/web/harness/`, or skip with the reason. That is X's or C's call, since "X's pixel test stays untouched" (decisions.md 22:40, item 81). Lane Z can do it if that rule is lifted for this one line.*
110. **The frontmatter name** is `voyage-session-ingest`, but the folder is `skill/`. The Agent Skills format wants them to match. *Recommended: when the skill is published, hand it out as a folder named `voyage-session-ingest`, and keep `skill/` in the tree as Johnny asked.*
## SI6 (10:02, done 10:08): "Copy for your AI", the snapshot prompt and the skill, in the spec

Z.md SI6, decisions 11:20 (105 Copy and Download, 106 the whole record, 107 no paste box, 108 withdrawn).

**Changed**
- `directives/spec_session_ingest.md`: new section "3.1 The snapshot for your AI" before "4. The build plan" (113 lines): the file name rule, built in the browser with no route, no token ever; the six parts in order with every key and the sort orders; what is left out and why; the function for A (`apps/web/src/campaign/ai_snapshot.ts`: `aiSnapshot(campaign, { universeId, origin })` and `aiSnapshotFileName(name)`, pure, LF, one trailing newline) and A's test; the size table at 100, 500 and 2,000 records. CRLF kept.
- `directives/contracts/ai_snapshot_fixture.json` (new, 5,454 bytes): `{ options, campaign }`; three live records (person, vessel, business), one deleted, one link, a session entry and an undated rumour, the party, the clock at 047-1105 rev 12. Every object passes the shared CampaignRecord, CampaignLink, CampaignEntry, CampaignSettings and CampaignClock schemas (checked with safeParse).
- `directives/contracts/ai_snapshot_expected.md` (new, 8,006 bytes): the exact text for the fixture.
- `skill/SKILL.md` (144 to 160 lines, version 0.3-draft): step 1 reads the snapshot (pasted or as a file) or `read_campaign_index` over MCP, the same things kept either way; Before you start 3 and 4 and step 4 and the search rule say how to work from the snapshot. Frontmatter keys unchanged, no `SI` token, the required words still present.
- `findings/session_ingest/snapshot_reference.mjs` (new, not committed): the reference that wrote the fixture and the expected text and measured the sizes (`write`, `fixture`, `sizes`); it uses `workspace/stardate.ts` and `orbit/clock.ts` for the dates.
- `skill/references/snapshot.md` was claimed and not made (not needed).

**Sizes** (typical: details 600 characters, summary 120; heavy: details 3,000, summary 300, bodies 6,000; tokens are characters / 4): 100 records 276,613 characters (~69,000 tokens) typical, 784,513 (~196,000) heavy; 500 records 937,119 (~234,000) typical; 2,000 records 3,417,635 (~854,000) typical, 9,586,585 (~2,397,000) heavy.

**Results**: `tests/shared/proposals.test.js` 13/13. Full suite (tap, RUN_API_TESTS unset) 2421 tests, 2375 pass, 0 fail, 46 skipped; `npm run check` clean; `npm run typecheck` clean; `npm run build` clean. No servers started.

**Questions** (numbered after 110; the orchestrator also uses 109, so renumber as needed)
- 111. Sheet and images in the snapshot? Recommended: **leave them out** (no proposal may touch them, and a sheet is long); mention them in a question when the session changed one. Alternative: add `sheet` whole, as 106 says "the whole record".
- 112. Big campaigns. Recommended: **show the size next to Copy and Download ("about 230,000 tokens") and, above 150,000 tokens, say "Too big to paste into most AIs: use Download, or turn on Agent access and let your AI read it over MCP"**; keep the text whole (106). Alternative: cut records not touched in the last N sessions above a limit.
- 113. Which 50 journal entries. Recommended: **the 50 latest by in-game date, then sequence, undated first** (as specced). Alternative: the 50 last written (`updatedAt`).

**Blockers**: none. A builds `campaign/ai_snapshot.ts` against the fixture; D places the buttons; the way back still needs agent access on (question 109, 1.2.7).
## ZF1c (12:01, done 12:10): the city pixel fixture into the tree

Z.md ZF1c (orchestrator 2026-10-18 10:18; question 109 decided).

**Changed**
- `tests/web/harness/city_design_s1_manifest.json` (new): a byte-for-byte copy of `findings/city_design_s1_manifest.json` (39,373 bytes; `fc /b` no differences; SHA-256 both AFD11899AFA4...). The findings copy is left in place.
- `tests/web/harness/city_pixels.mjs` line 15: `const MANIFEST = '__FS__/tests/web/harness/city_design_s1_manifest.json';` (was `__FS__/findings/...`). Nothing else in the harness or the test changed.
- `apps/web/src/dev/city-lights/CityLights.vue` line 38: `const MANIFEST = new URL('../../../../../tests/web/harness/city_design_s1_manifest.json', import.meta.url).href;` (was `'/@fs/D:/webstorm/traveller_magnus/findings/...'`). The route is added only under `import.meta.env.DEV` (`router.ts` 65 to 90) and `vite.config.ts` 42 allows the repo root, so the dev page serves it and the production build carries neither the page nor the file (`city_design_s1` appears in no `dist` script).

**Results**
- `tests/web/surface_city_pixels.test.js` in the tree: 1/1 pass, not skipped.
- The same test in a scratch copy without `findings/` (robocopy with `/XD .git node_modules findings ...`, junctioned `node_modules`): 1/1 pass. Junctions removed with `rmdir`, the copy removed.
- No `findings` path left in the test or `tests/web/harness/`.
- Full suite (tap, RUN_API_TESTS unset): 2444 tests, 2397 pass, **1 fail**, 46 skipped. The failure is `tests/web/orbit_stage_layout.test.js:32` "System Comms, Fit, the receiver and the chips do not overlap": `page.waitForSelector` timed out after 60 s on `.orbit-stage[data-state="ready"]`. This is not Z's file (new at 11:30), and D holds `apps/web/src/dossier/SurfaceStage.vue` (claimed D 12:00), so it is likely in-flight work. Left alone.
- `npm run check` clean; `npm run typecheck` exit 0; `npm run build` exit 0.
- No servers left running (the pixel test starts and stops its own).

**Note for the push**: `tests/web/harness/` and `tests/web/surface_city_pixels.test.js` are untracked (`git status`: `??`), so the release list must add them for CI to have the test.
## ZC2 (12:13, done 12:20): Comms, the view listens, not only the party

Z.md ZC2; decisions 11:28 (mayday) and 11:57 (comms for a system the ship is not in; the orchestrator's 11:55 rule).

**Changed**
- `apps/web/src/living/comms/events.ts`: `nextProceduralEvent` no longer returns null when the party is away or in jump (the scenes are between roster ships and the port, never the party). `partyHears` stays, documented as the gate for what is addressed to the party; `welcomeFor` keeps it (no beacon unless the lead ship is `inSystem` or `docked`).
- `apps/web/src/living/comms/corpus_events.ts`: `corpusPool` and `nextCorpusEvent` lose the `partyHears` gate. A line whose `when.party` names a party place (241 of 1,374: 154 ship, 20 ship inSystem, 30 advert, 6 control, 6 customs, plus 25 in-jump logs already refused) is addressed to the party and still passes only when `eligible()` finds the lead ship there; every other gate (X tower, E formal ATC, highport, vacuum weather, the four blocked categories, staffed ports) unchanged.
- `apps/web/src/living/comms/mixer.ts`: `mixEvent` loses the gate.
- `apps/web/src/living/comms/controller.ts`: `active` is `facts && (shown || mayday forced)`; the party moving no longer cancels anything. New `welcomeDue`: when the lead ship arrives while the view is on air, the beacon plays next (`beaconDelayMs` after the arrival when the band is quiet, after the current line otherwise; never over an armed `mayday`, flag `maydayArmed`). Header comment rewritten. `mayday` plays at 3 s with no ship. Repetition, starvation, cadence, visibility pause and the once-only Beowulf roll (which still needs the party in system) unchanged.
- `tests/web/comms_engine.test.js`: "nothing plays away or in jump" becomes "away and in jump the system still talks, and nothing addressed to the party plays" (same ambient pool, same scenes, no beacon, no `when.party` line, lines on A to D).
- `tests/web/comms_controller.test.js`: "away and in jump, the band is dead" becomes "the view still listens, and never hears the beacon"; the cancel test now says a jump does not cancel, and out of jump the beacon plays; the emergency test: a jump does not cut the archive (four segments, then normal).
- `tests/web/comms_listens.test.js` (new, 5 tests, fake timers, Regina's chart row A788899-C): signed out with no campaign, a line within the first minute and no beacon; switching to Efate, lines continue; a campaign with the party away, ten or more lines in half an hour and no beacon; the party arriving while on air, the beacon once (inSystem then docked is one arrival), 1.5 s after the arrival; `mayday` with no ship, shown on and off, Beowulf at exactly 3 s, `emergency` then `normal`, four segments.
- Not changed: `CommsReceiver.vue`, `OrbitView.vue` (they already pass facts with `party: 'away'` signed out), beowulf.ts, C's and D's files.

**Live check** (`findings/examples/zc2_live.mjs`, not committed): Vite on Z's own port 6231 with `VOYAGE_TRUTH_API=https://traveller.voyage` and `VOYAGE_API` at an empty port 6239, so the page is signed out (the one console error is that 502); Edge headless (Playwright `channel: 'msedge'`), 1600x900. `npm run dev` itself was not used: its ports 5173 and 8787 are fixed and were in use by another lane (pids 59336, 43492, left alone), and it reads `.dev.vars`. No transmission was forced.
- `/s/Spinward_Marches/1910/orbit` (Regina; the item said `/s/Core/2118`, which is Capital): first line 11.0 s after the stage was ready, CH 03 LOCAL APPROACH from REGINA HIGHPORT. Shot `findings/ui_design_shots/zc2_1_regina_signed_out_first_line.png`.
- Switched in the app's router (no reload) to Efate, `/s/Spinward_Marches/1705/orbit`: a line 9.2 s after ready, CH 16 COMMON from PLANT DISPATCH. Shot `zc2_2_efate_after_switch_line.png`.
- `?mayday` on Regina, fresh load: `data-comms-theme="emergency"`, CH -- EMERGENCY, FREE TRADER BEOWULF, about 3.6 s after load began. Shots `zc2_3_mayday_red_beowulf.png` and `zc2_4_mayday_red_segment3.png` ("losing cabin pressure"); then `normal` (teal), `zc2_5_mayday_back_to_teal.png`.
- The Vite server ran in the script's process (pid 32468) and is closed; ports 6231 and 6239 are free.

**Results**: comms suites (engine, controller, flavor, broadcasts, mayday, listens) all pass. Full suite (tap, RUN_API_TESTS unset): 2454 tests, 2407 pass, 1 fail, 46 skipped. The failure is the same `tests/web/orbit_stage_layout.test.js:32` as at ZF1c (not Z's): it **passes with `VOYAGE_TRUTH_API=https://traveller.voyage` set** (1/1, 12 s), so it depends on the truth reaching its Vite through the API on 8787. `npm run check` clean; `npm run typecheck` exit 0; `npm run build` exit 0.

**Questions**
- 114. The Regina address: recommended **`/s/Spinward_Marches/1910/orbit`** (Regina; ZC2 named `/s/Core/2118`, which is Capital). Alternative: also prove Core/2118.
- 115. `orbit_stage_layout.test.js` needs the chart: recommended **its Vite sets `VOYAGE_TRUTH_API` the way `scripts/dev.mjs` does (the owner's change)**, or skip when the chart does not load. Alternative: document that it needs `npm run dev` up.
- 116. The rare Beowulf roll (not `?mayday`) still needs the party in the system: recommended **keep** (it is a find for the party). Alternative: let a watching view roll it too.

**Blockers**: none for ZC2.
## ZC3 (13:35, done 13:38): `?mayday` survives the campaign arriving

Z.md ZC3 (Johnny 13:30; the orchestrator's diagnosis confirmed in the code: `start()` set `maydayUsed` when it armed the archive, so the `cancel()` that a new context key causes threw the armed timer away and nothing re-armed it).

**Changed**
- `apps/web/src/living/comms/controller.ts`: `maydayUsed` is set in the timer's callback, when the archive starts playing. New `maydayDue`: the deadline, `maydayDelayMs` after the archive was first armed. A re-arm after a context change waits `max(0, maydayDue - now)`.
  - **Why keep the first deadline** (not a fresh 3 s from the change): Johnny's word (decisions 11:28) is "after 3 seconds on page load", and a signed-in visit should look the same as a signed-out one; a fresh 3 s from each change would drift to 4 s or more and grow with every late load. When the context is down past the deadline (no facts while the campaign loads), the archive plays as soon as the view is back.
  - Still once per controller (once per page load: the view's `pageMayday` claim), never replayed after it played, still plays with System Comms off.
  - **The campaign key arriving still resets the band**: the Beowulf once-only flag is per campaign (`beowulfStorageKey`) and the party facts change with it, so the band restarts on the campaign's terms. Note: the history key is per hex and truth version (`historyKey`), not per campaign, so repetition history carries across.
- `tests/web/comms_mayday_signed_in.test.js` (new, 5 tests, fake timers): `'none'` then the campaign's key at 1 s, with comms on and off: Beowulf at 3 s, four segments, `emergency` then `normal`; changes of campaign, truth and hex inside the wait: it plays once, at 3 s; after it played, campaign, truth, null-facts and facts changes do not replay it; no facts from 1 s to 5 s: it plays at 5 s, the moment facts return; signed out with no change: 3 s as before.

**Results**: comms suites 44/44. Full suite (tap, RUN_API_TESTS unset): 2473 tests, 2427 pass, **0 fail**, 46 skipped (`orbit_stage_layout` passes now). `npm run check` clean; `npm run typecheck` exit 0; `npm run build` exit 0. No servers started.

**Not proved live signed in.** `npm run dev` has fixed ports 5173 and 8787 (in use by another lane at 12:13) and reads `apps/api/.dev.vars`, which Z may not touch; a signed-in session needs that Worker. Johnny's check: `npm run dev`, sign in, open `http://localhost:5173/s/Core/1623/orbit?mayday`: red Beowulf at about 3 s after the receiver appears, then teal.