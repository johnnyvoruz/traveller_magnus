# Z example_packages report
Prompt: prompts/z_example_packages.md (orchestrator answer 2)
Status: done (answer 3 applied; the two 390 px card shots are open, see question 1).

## Changed files (this pass)
- packages/shared/src/schemas/package.ts: `PackageManifest.records.links` optional `{ contentHash, count }`; `InstallResult.links` optional.
- apps/api/src/jobs/publish_queue.ts: `publishedLinks()` reads the source campaign's live links (`GET /campaign`, paged) whose two ends are both published records, sorted by id, stored content-addressed; counted in the version bytes. Left out when there are none.
- apps/api/src/routes/installs.ts: `load()` reads the manifest's links; the install passes them to the object.
- apps/api/src/universe/install.ts: `applyInstall` writes links after the records (ends live, provenance like records, baseRev from the stored link), returns `links`; `removeInstall` tombstones the import's links (new rev and seq); local `nextCampaignSeq` (same `campaignSeq` meta counter as campaign.ts, which is Lane B's this turn and not touched).
- directives/contracts/b_marketplace.md: new section F16.
- tests/api/install_links.test.js (new, port 18885): three records, two links, two records published -> manifest ships one link with visibility and notes; install writes it with the install's provenance; remove deletes links and records.
- tools/examples/build_local.mjs: the Hollow Verge restore loads the pack's links from campaign.json after the bootstrap import (its recorded manifest predates F16; systems unchanged).
- tools/examples/seed_production.mjs: `target()` exported for seed_games.
- tools/examples/seed_games.mjs (new): reads `games/*.json` (refuses with file and field), deterministic ids, in-memory records/settings/journal turned into `public_ships`/`public_cards` rows by `publicShips`, `publicFinishedLegs`, `publicCardJournal`, `fitPublicCard`, `publicMarkId`; user and profile with no session or passkey, universe `public_games = 1, example = 1, show_referee` from the file; dry by default, `--apply` idempotent, `--remove` in B's order; refuses without 0018 or when a handle belongs to another account; `--to-local` or `--production`.
- tools/examples/README.md: links note, "push 1.2.1 first" at the top of Johnny's steps, example-games steps.
- tests/tools/example_games.test.js (new): refusal, determinism, unfinished leg left out, B's remove order.
- findings/examples/: games_fixture/ (two throwaway rehearsal games, Lane Z's), rehearse_games.mjs, count_games.mjs, run2.log, local, local2, standin rebuilt.

## Rehearsal (fresh stand-in findings/examples/standin)
- Packages: copy found Traveller_Voyage, 6 inserts, 33 objects. Signed out six packages, right kinds and tags. A second account imported all six (Hollow Verge placed, 6 new hexes): **82 records, 64 of 64 links**. Two fresh builds give the same six fingerprints (links included).
- Games (fixture): two applies, the second a no-op update. Signed-out feed on Spinward_Marches: 3 ships on 1910 (stacked), all `example: true`. Cards: game one shows referee, game two `referee: null`; finished legs only (a leg arriving after the clock is left out); the public journal entry. `--remove --apply`: 0 example universes, 0 public_ships, 0 public_cards, 0 example users, 0 profiles; the six packages stay.

## Gates
npm test:      pass (1759 tests, 1726 pass, 33 skipped, 0 fail)
npm run check: pass (manifesto clean)
typecheck:     pass
fourth gate:   build pass; RUN_API_TESTS install, install_delete, install_source_gone, install_links, packages, packages_job (4), packages_migration pass; campaign (Lane B's) failed once on a Windows EPERM temp-dir cleanup and passed on rerun

## Servers
All stopped: builds 40700 and 62648 (via the started node 52484), rehearsal 57264, games rehearsal 51736, plus the wrangler dev children of the API tests (their own harness). No listener on 8831, 8841, 8851, 5239, 9439 or 18xxx. `--production` not run.

## Foreign edits
Many uncommitted files of other lanes in the tree (B's campaign.ts, universes.ts, public_*; others). Not touched.

## Contract published
contracts/b_marketplace.md F16

## Needs from others
- Lane C: `tools/examples/games/*.json` (not on disk at this pass). Then I run seed_games on the stand-in with the real twelve and take shots.

## Questions for Johnny
1. seed_games writes the example accounts' email as `<handle>@example.invalid`, `email_verified = 0`. Suggested: keep it (an unroutable address, never shown). Alternative: leave email empty, if the user table allows it.
2. The handle check in seed_games is `^[A-Za-z0-9_]{3,32}$` plus "not another account's handle"; I did not find a single shared handle validator in the code. Suggested: Lane C's test names the app rule it follows, and I switch seed_games to that same function. Alternative: keep my pattern.
3. The example universes carry no Durable Object state, so if anyone ever opens one as its owner the first save rewrites the public rows from an empty campaign. Nobody can sign in as those accounts, so: suggested, accept. Alternative: an admin guard on `example = 1`.
4. Shots for the games (map darts and card) wait for C's twelve files. Suggested: take them in the run that seeds the real content.
## Pass 4: answer 3

- `tools/examples/seed_games.mjs` now checks the referee with `judgeUsername` (`apps/api/src/auth/passkey_words.ts`, imported, not edited). The check that the referee is not another account's handle stays. The email stays `<handle>@example.invalid` with `email_verified = 0`.
- `tests/tools/example_games.test.js` refuses `No Spaces` and a referee of 25 characters, and checks that Lane C's twelve files pass. 4 of 4 pass.
- I seeded C's twelve games on a fresh stand-in (`findings/examples/standin_games`, with 0017 and 0018). The first apply wrote them and a second apply changed nothing.
  - Signed out, the feed shows Spinward Marches 10 ships on 9 hexes, Deneb 2, Trojan Reach 3 and Gvurrdon 3. Every ship has `example: true`.
  - All 18 cards return 200. Each one shows its referee, or none, as its file says.
- Shots in `findings/ui_design_shots/kb23_example_games_*`:
  - The four sector maps and `stacked_2007`, at 1600 and 390 px.
  - At 1600 px: `card_referee` (Salt Lantern, referee even_column) and `card_no_referee` (Red Thread).
  - At 1600 px: `stacked_card` (Copper List at 2007). A click on the stacked pair always opens Copper List. I found no point that opens Kestrel's Due.
  - At 390 px, a tap on a dart opens the hex sheet, not the card. The files are kept as `card_*_390_tap_miss.png`.
- `--remove --apply` removed 12 accounts and 18 ship rows. A count on the stand-in finds 0 example universes, public_ships, public_cards, users and profiles.
- Gates: npm test passed 1730 with 0 failures and 33 skipped. check, typecheck and build are clean.
