# B stream report

## B1 universes pin — done
Files: tests/api/universes.test.js, scripts/test_api_all.mjs, package.json, tests/api/session.js, tests/api/packages_migration.test.js, and the Lane B worker suites named in reports/b_universes_pin.md.
What changed:
- The catalogue test reads the engine version from packages/engines/package.json.
- `npm run test:api:all` runs the worker suites three at a time, each with its own port and state folder.
- `truth_build.test.js` is left out. The command prints `parked, Lane Z (Z2)` and does not start it.
- Windows file-lock cleanup and the quota probe order are in the pin report. The full table is there.
Gates: npm test failed in Lane A's tests/tools/examples.test.js (1946 tests, 1906 pass, 1 fail, 39 skipped). check pass. typecheck pass. The third all-run is in the pin report (30 pass, 5 fail once the parked file is left out of the table). `node --check scripts/test_api_all.mjs` after the skip.
Shots: none. Nothing on screen changed.
Questions: none

## B2 players contract — proposal
Files: directives/contracts/b_players.md
What changed:
- The contract names the two D1 tables, the invite link (30 days, 12 members, revoke, remove), and every P2 route with method, auth, request, envelope, and the named errors.
- A member read is the DO page passed through `playersView`. The decision 3 field list is quoted word for word. Member writes are journal notes only, with `author_id` enforced in the Worker.
- Migration 0021 and the DO column `author_id` may land in either order. Each route has an answer for the missing tables and for the missing column.
- Johnny's three answers are written as decided: players write journal notes, 12 players per campaign, no second referee in this leg.
- No route, migration, or schema was added.
Gates: none (paper, P0).
Shots: none.
Questions:
1. Recommended: add `token TEXT NOT NULL` on `universe_invites` beside `token_hash`, so a later POST and the referee's Copy can return the same link. May P2 add that column?
2. Recommended: `campaign_full` counts current member rows, so removing a member frees a seat after 12 claims. Is the cap the current member count?
3. Recommended: P2 also adds `PATCH /api/universes/:id/players/:userId` `{ personId }` for the owner, because the referee can change which person a member is. Should that route be in P2?
4. Recommended: when the unbuilt slice 4 revoke is built, name it `DELETE /api/universes/:id/players/publishes/:publishId`, so it does not share `DELETE /players/:userId`. Is that the later path?
5. Recommended: drop every `rev` in the projection, including the clock's, and still send `deleted: true` for a player note the member was allowed to see. Do deleted player notes travel on the poll?

## B0 One command for local development — done
Files: scripts/dev.mjs, package.json, apps/web/vite.config.ts, tests/api/dev_command.test.js, Claude.md, directives/README.md
What changed:
- `npm run dev` runs `scripts/dev.mjs`. It applies local D1 migrations, copies production released chart versions with `INSERT OR IGNORE` so a new campaign can pin, and starts the Worker on 127.0.0.1:8787 and Vite on http://localhost:5173. `BETTER_AUTH_URL`, host, and upstream are command-line overrides. `wrangler.toml` was not edited. The chart is read from https://traveller.voyage unless `--local-truth`. The command prints that URL at once and prefixes `[db]`, `[api]`, and `[web]`. SIGINT stops both with `taskkill /T /F`. A real Ctrl+C was not pressed; the running command was stopped the same way.
- CLAUDE.md Commands table: `| `npm run dev` | Worker and Vite together on http://localhost:5173, local D1 migrated, chart from production (`scripts/dev.mjs`) |`
- directives/README.md: `Local development is `npm run dev` (`scripts/dev.mjs`): the Worker and Vite together.`
- Proof on http://localhost:5173: the map, Regina's dossier (`/s/Spinward_Marches/1910?panel=dossier`), `/packages` ("No packages yet."), passkey sign-up for `bdevlaneb` (Edge `--headless=old`, CDP virtual authenticator), campaign "Pilot Run" created (201), a person record saved (`POST .../campaign/changes` 200, the page says Saved). No 403 and no 500. `GET /api/me` was 401 while signed out. Two `GET .../hexes/dots` calls returned 503 `chart_unavailable` ("The chart for this version could not be read.") because the local public bucket has no chart overview. The map itself is the production chart.
Gates: npm test 1990 pass, 0 fail, 39 skipped. check clean. typecheck clean. build clean.
Shots: findings/ui_design_shots/sb_dev_map_1600.png, sb_dev_map_390.png, sb_dev_dossier_1600.png, sb_dev_packages_1600.png, sb_dev_campaign_1600.png
Questions:
1. Recommended: leave the two 503 dot responses. Do not copy the production chart into the local public bucket for this command. Is that the local behaviour you want?

## B3 The server's error sentences — done
Files: apps/api/src/auth/session.ts, apps/api/src/index.ts, apps/api/src/character/CharacterRoom.ts, apps/api/src/character/service.ts, apps/api/src/universe/UniverseDO.ts, apps/api/src/universe/forward.ts, apps/api/src/universe/sectors.ts, apps/api/src/universe/hexes.ts, apps/api/src/universe/campaign.ts, apps/api/src/routes/characters.ts, apps/api/src/routes/universes.ts, apps/api/src/routes/public_games.ts, apps/api/src/routes/builder.ts, apps/api/src/routes/generate.ts, apps/api/src/routes/objects.ts, apps/api/src/routes/package_covers.ts, apps/api/src/routes/admin_packages.ts, apps/api/src/routes/campaign_export.ts, and the tests/api files that assert those sentences.
What changed:
- Lane E's change list is now the sentence a person reads. Four validation lines ("Invalid JSON.", "Invalid request.", "Invalid limit.", "Invalid subsector.") are one sentence: "That request could not be read. Try again." Sign-in is "Sign in to continue." A blocked origin is "That request was blocked. Reload the page and try again."
- The same swap covers a missing system, a refused hex, a charted slot, the ten-campaign cap, image and cover checks, a campaign read, an undo, and a missing pin. Kept sentences were left, including "Too many requests.", "The chart for this version could not be read.", and the cover limits.
- Campaign create, when the chart version is not released, now says "That version is not released." E had filed the old sentence under admin screens and said to drop the word "truth" when a person can see it.
- `requireUser` and `requireRole` carry the new sign-in and access sentences, so a route that calls them says the new words even when its file was not edited.
Gates: npm test 2003 pass, 0 fail, 39 skipped. check clean. typecheck clean. build clean. The suite was run again after the campaign-create sentence. typecheck and build ran on the tree just before that one sentence.
Shots: none. These paths are errors and were not on screen.
Needs from others:
- Lane Z, not edited. `routes/admin.ts`: "Origin check failed.", "Invalid JSON.", "Invalid request.", plus the chart-build sentences ("That truth version already exists.", "No such source truth version.", "The source truth version is not released.", "Source truth version has no sectors.", "No such truth build.", "Invalid truth version.", "That truth version cannot be removed.", "That truth version is already released."). `routes/packages.ts`: "Origin check failed.", "Invalid JSON.", "Invalid request.", "Invalid limit.", "Role required." `routes/installs.ts`: "Invalid JSON.", "Invalid request."
- `packages/generation` is outside this stream's area. `form.ts` and `hand.ts` still say "Type a finite number.", "Nothing rolls this field.", "No system was produced.", and "You can't edit …".
- `tests/web` still fixtures the old sentences and passed: marketplace_store.test.js, public_games_wire.test.js, builder_draft.test.js, build_undo_words.test.js. Not edited.
Questions:
1. Recommended: keep "That version is not released." on campaign create. Is that the sentence?

## B0b npm run dev on its own state — done
Files: scripts/dev.mjs, tests/api/dev_command.test.js
What changed:
- Migrations, the catalogue pin, and `wrangler dev` use `--persist-to .wrangler/dev` (folder `apps/api/.wrangler/dev`). Test runs keep their own state folder, so a released `vtest` row they leave behind is not this command's database.
- The current chart is the production list's newest `releasedAt`. A local released row dated after that is withdrawn (`state = 'withdrawn'`) on startup. The row stays. It is ignored, not refused with an error. `--local-truth` does not withdraw.
- Local accounts do not move. The accounts from earlier runs stay in `apps/api/.wrangler/state`. This command starts a separate database, so those sign-ins are not in it. Sign up again on http://localhost:5173, or copy the old state folder yourself.
Gates: npm test 2016 pass, 0 fail, 39 skipped. check clean. typecheck clean. build clean.
Shots: none. Nothing on screen changed.
Questions: none

## B4 Header hygiene, no-store and log masking — done
Files: apps/api/src/universe/door_headers.ts, apps/api/src/universe/forward.ts, apps/api/src/routes/universes.ts, apps/api/src/routes/campaign_export.ts, apps/api/src/http.ts, tests/api/door_headers.test.js, tests/api/logged_route.test.js, tests/api/campaign.test.js, tests/api/packages.test.js, tests/api/package_covers.test.js
What changed:
- A Durable Object fetch drops every client `x-voyage-*` header, then sets `x-voyage-user-id` and `x-voyage-universe-id`. `x-voyage-journal` is copied back only when the client sent it.
- `GET` and `PATCH` of the campaign, and the campaign export, answer `cache-control: private, no-store`, including the early owner refusals.
- The request log writes `/join/<token>` and `/claim/<token>` for those paths. Other paths are unchanged.
- A forged `x-voyage-user-id`, `x-voyage-worker`, and `x-voyage-member` on `GET .../campaign` returns the same body as a clean read. No echo route was added.
- The admin takedown test now expects "You do not have access to that.", which `requireRole` already says. The package card key list includes `recordCount`, which the catalogue card now returns.
Gates: npm test 2048 pass, 1 fail, 40 skipped. The fail is `tests/web/dice_roll.test.js` (Lane A claims that file). check, typecheck, and build were clean on this Worker code. `test:api:all`: 36 pass, 0 fail, 36 suites. `truth_build.test.js` stayed parked. The first all-run timed out `builder_density.test.js` at 8 minutes while the machine was loaded; alone it passes in 17 seconds, and it passed in the second all-run.
Shots: none. Nothing on screen changed.
Needs from others:
- Lane A, not edited. `tests/web/dice_roll.test.js`: "the palette command is Roll dice, rolls 2D, and yields R while R is taken" expects 7 and got NaN.
Questions: none

## B2b The players contract: playing and archived — proposal
Files: directives/contracts/b_players.md
What changed:
- The contract is rewritten as decided. Active members cap at 255. The sentence is "This campaign has 255 players, the most it can have." `max_uses` is not a column. `uses` counts claims and never refuses. Delete archives the row (`archived_at`, `archived_by` `owner` or `self`). The owner's `PATCH` `{ status: 'active' }` brings a row back. A live link reactivates a self-archived row and refuses an owner-archived one. There is no true delete.
- Screen words for Lane D: "Playing", "Archived", "Archive", "Bring back". `GET /players` returns both groups.
- Review §6 items 1 to 17 are in the contract. The live-notes guard is 65,535 per player, "You have 65,535 notes in this campaign, the most one player can keep." The 10 writes a minute and 60 reads a minute stay. The five answers from 16:55 and the eight review answers from 18:40 are written as decided. The questions section is gone.
- No route, no migration, and no code.
Gates: same tree as B4. npm test 2048 pass, 1 fail in Lane A's dice test. check, typecheck, build clean before these papers. No Worker change in this item.
Shots: none.
Questions:
1. Recommended: the leak suite uses the live Origin sentence, "That request was blocked. Reload the page and try again." The review's case 35 still says "Origin check failed." The contract follows the live sentence, the same one owner mutations use.

## B5 Social previews from the Worker — done
Files: apps/api/src/preview_tags.ts, apps/api/src/preview_document.ts, apps/api/src/index.ts, apps/api/wrangler.toml, tests/api/preview_tags.test.js
What changed:
- `/`, `/s/:sector`, `/s/:sector/:hex`, and `/packages/:id` run the Worker before the asset server. The Worker rewrites the title, description, `og:title`, `og:description`, and `og:image` already in `index.html`. It does not add a second set. `apps/web/index.html` was not edited.
- A request whose `Accept` does not prefer HTML is returned as the asset server sent it. A sector page reads the released chart's sector index from the public bucket and keeps it in memory. A hex title is the world's name. The description is the name, the UWP, and the sector name. A public package uses its title, the author's handle, and its cover on the public CDN. A hidden package and an unknown route keep the default tags.
Gates: npm test 2058 pass, 0 fail, 41 skipped. check clean. typecheck clean. build clean. `test:api:all` 37 pass, 0 fail, 37 suites. `truth_build.test.js` stayed parked. The preview worker test passed: `/s/Spinward_Marches/1910` carries Regina, and the same URL with `Accept: application/json` keeps the default title.
Shots: none. The tags are for a crawler, not a screen.
Questions: none

## B6 The byte count's crash window — done
Files: apps/api/src/jobs/object_charge.ts, apps/api/src/jobs/generate_queue.ts, tests/api/object_charge.test.js
What changed:
- The D1 byte add was already one batch, and already idempotent by job id. `finishCounts` now charges and then runs the settled mark through `accountSettledBytes`, so a crash after the add retries the mark.
- A retry of the same job adds the bytes once and runs the mark again. The quota reservation and the 250 MB sentence were not changed.
Gates: npm test 2066 pass, 1 fail, 41 skipped. The fail is `tests/web/map_low_res.test.js` (Lane D's map, not edited). check clean. typecheck clean. build clean. The new charge test passed.
Shots: none.
Needs from others:
- Lane D, not edited. `tests/web/map_low_res.test.js`: "without WebGL, a moving frame is half resolution, and a still one full again after a moment" failed with "still settling".
Questions:
1. Recommended: leave the pre-0014 plain add as it is. When `object_byte_charges` is missing, a retry can still add the bytes twice. That path is the unmigrated fallback. Production has 0014.

## B2c The players contract: five fixes — done
Files: directives/contracts/b_players.md
What changed:
- A member note's anchor is null, a system anchor (`kind: 'system'`), or a record anchor whose id is in the current projection. A hidden record and a missing record still answer the same 400. A note on a hex is accepted.
- `PlayersPage` is Lane B's schema, written in `packages/shared/src/schemas/players.ts` in P2b with the other players schemas. Lane A does not add it.
- `visible` rides when `after` is 0, and on every later page whose seq moved past `after`.
- Pick for the owner's read: the Worker passes the handle map on that read too, so `authorName` stays. `author_id` stays off the body.
- Build note: register `PATCH .../players/me` before `PATCH .../players/:userId`.
- Both answers are written in as decided. The leak suite uses "That request was blocked. Reload the page and try again." The pre-0014 plain add stays. No route, no migration, and no code. Status is the P2b contract. B2 and B2b are marked done.
Gates: npm test 2069 pass, 0 fail, 41 skipped. check clean. typecheck clean. build clean.
Shots: none.
Questions: none

## P2b1 The leak suite skeleton — done
Files: tests/api/players_leaks.test.js, tests/api/players_logic.test.js
What changed:
- The worker file builds the §5 fixture through the owner routes and names every case. The assertion is the contract shape. A missing route does not pass.
- Cases 27 and 29 are pure, in players_logic.test.js. Case 29 follows the decided 65,535 guard. The review text still says the 501st.
- The pack's links have no id. Case 33 compares record ids, entry ids, and the two ends of each link.
Gates: npm test 2082 pass, 2 fail, 42 skipped. One fail is case 29 (this skeleton). The other is Lane E's tests/web/cold_load.test.js. check clean. typecheck clean. build clean. With RUN_API_TESTS=1 the leak file ran on port 18893: 33 fail, and cases 17 and 33 pass. The worker file stays skipped in npm test.
Shots: none.
Why each case stands where it does:
1. Member read is not a players page.
2. Same. The client page parse never starts.
3. Same. Party lists are not there.
4. Same. The ship leg is not there.
5. Same. The link list is not there.
6. Same. The caption is not there.
7. The poll after a hide is not a players page.
8. The poll after a delete is not a players page.
9. The poll after a hidden create is not a players page.
10. A write on a hidden journal id is not 403 forbidden with the row left out.
11. A member write of anything but their own note is not the contract 403, and a hidden anchor is not 400 validation.
12. Another member's edit is not 403, and the owner's delete is not applied.
13. The member's note is not applied, so the three reads have no authorName.
14. A hidden anchor and a missing anchor are not the same 400 validation body.
15. The players image is 404, not 200. The referee image is not reached.
16. The member page after the hide is not a players page, so the image check never starts.
17. Passes. Export, hexes, generate, install preview, public-games, object put, sectors, and jobs already answer two signed-in non-owners with the same 404, "No such universe."
18. A non-member on campaign and on players/me is not that same stranger body.
19. An archived member is not 403 not_a_member, and the players list is not the two groups.
20. Invite create is not a live link.
21. A claim is not 400 invite_expired.
22. The owner's claim is 404, not 403 forbidden.
23. The extra claim is not_found, not 400 campaign_full with the 255 sentence.
24. The archived member's claim is 404, not 403 not_a_member reason archived.
25. The fourth claim is 404, not 429 rate_limited with retry-after 10.
26. The member read with forged x-voyage headers is not a players page.
27. Passes. loggedRoute already writes /join/<token> and /claim/<token>, and the token is not in the line. Built in B4.
28. The 11th note write is 404, not 429.
29. Fails in npm test. campaign_journal has no author_id column, so the 65,535 count cannot run. The sentence under test is "You have 65,535 notes in this campaign, the most one player can keep."
30. A response in the campaign, players, and playing set has no cache-control: private, no-store.
31. The member read is not a players page, so rev cannot be checked.
32. Playing is not { ok: true, data } with items.
33. Passes. planPack and playersView agree on the record ids, the entry ids, and the link ends.
34. After 1,001 owner records, the member read is not a players page, so the earlier link is not visible.
35. A member write with Origin https://evil.example is 404, not 403 with "That request was blocked. Reload the page and try again."
Companion. A note anchored to a system hex is not an applied change.
Needs from others:
- Lane E, not edited. tests/web/cold_load.test.js expected the route table without /changes/:version. Lane E holds router.ts and the changelog files.
Questions: none

## P2b1b Case 29 turns every lane's gate red — done
Files: tests/api/players_logic.test.js
What changed:
- Case 29 ("a member's 65536th live note is refused") is `{ todo: 'P2b2 author_id' }`. The assertion body is unchanged.
- The test still runs and still fails: campaign_journal has no author_id. Node counts a failing todo as a todo, so the process exits 0 and other lanes' gates stay green.
- P2b2 removes that todo when the column exists. A todo that then passes fails the runner, so the removal is required.
Gates: npm test 2098 pass, 0 fail, 42 skipped, 1 todo. The todo line is "a member's 65536th live note is refused # P2b2 author_id". check clean. typecheck clean. build clean. The cold-load fail named on P2b1 is gone in this run (Lane E, not edited).
Shots: none.
Questions: none

## B5b Link previews parked — done
Files: apps/api/wrangler.toml, apps/api/src/preview_tags.ts, tests/api/preview_tags.test.js
What changed:
- `run_worker_first` is the 1.2.6 line again: `["/api/*"]`. The social-tags comment above it is gone.
- The first line of `preview_tags.ts` says it is parked until Johnny turns it on. `preview_document.ts` is unchanged. HTML routes no longer reach it.
- The worker case in `preview_tags.test.js` is skipped, reason "parked until Johnny turns it on". The body stays. The two pure cases still run.
Gates: npm test 2108 pass, 0 fail, 42 skipped, 1 todo. check, typecheck, and build clean (index-CD4gVsNi.js, local only). `test:api:all` exits 1. The second run was 35 pass, 3 fail, 38 suites. `preview_tags.test.js` passed. `quota_reservation.test.js` passed on that run (it failed on the run before the skip). `players_leaks.test.js` failed on the players page: that is the P2b1 skeleton and stays until P2b4. `generate_speed.test.js` failed in the loaded run (the 121st stop was 200, not 429) and passed alone in 14.5s. `builder_density.test.js` timed out at 8 minutes in the loaded run and passed in the earlier all-run at 19.3s. `truth_build.test.js` stayed parked.
Shots: none.
Questions: none

## SI0 Session ingest, the contract — proposal
Files: directives/contracts/b_session_ingest.md
What changed:
- The contract is the spec's §2.1, §2.2, §2.4 and §2.5, plus the MCP endpoint in phase 1 (the note at the top of the spec, and Johnny 20:24 and 20:27). Nothing is built.
- Better Auth 1.7.7, as installed, has no API-key plugin, so the four checks fail. The hand-written `access_tokens` table and `platform_flags` are the design. Migration number 0022, after P2b's 0021.
- A token is bound to one campaign unless the create sends `universeId: null` (the "all my campaigns" tick). Nothing applies without the referee. `campaign:read` returns referee-only text. OAuth waits until someone asks.
- The either-order table: missing 0022 is 503 `tokens_unavailable`; a Durable Object without the proposal tables is 503 `proposals_unavailable`. A proposal submit does not spend the referee's 120-a-minute budget.
Gates: npm test 2122 pass, 0 fail, 42 skipped, 1 todo. check, typecheck, and build clean (index-C9hVAHG3.js, local only). No route, so `test:api:all` was not run.
Shots: none.
Questions: none

## TS0 Table sets, the contract — proposal
Files: directives/contracts/b_table_sets.md
What changed:
- One account-level D1 table `table_sets` plus an R2 object per set, chosen per campaign. No campaign copy, and no `campaign_tables` row. The migration is the next hand-written file after 0022. It is not written here.
- One route family, `/api/table-sets?kind=`. Kinds now are `trade` and `randomPassenger`. A kind with no roller is refused. 20 sets an account, 256 KB a set.
- A player reads only the set their campaign has chosen, and only after the players server exists. Until then a non-owner gets 404. The list stays the owner's.
- "From scratch" is copy-then-clear in the editor. The server stores a set only when that kind's validator accepts it. Official files stay in `rules/` and are never rows.
Gates: npm test 2129 pass, 0 fail, 42 skipped, 1 todo. check, typecheck, and build clean (index-C9hVAHG3.js, local only). No route, so `test:api:all` was not run.
Shots: none.
Questions: none

## P2b2 Membership tables and author_id
Files: apps/api/src/db/migrations/0021_universe_members.sql, apps/api/src/db/schema.ts, apps/api/src/universe/campaign.ts, tests/api/campaign_logic.test.js, tests/api/players_logic.test.js
What changed:
- Hand-written `0021_universe_members.sql`: `universe_members` (status, archived_at, archived_by, PK universe_id + user_id) and `universe_invites` (token_hash unique, uses counts). Indexes on `universe_members(user_id)` and `universe_invites(universe_id)`. Drizzle tables match. No route queries them yet.
- `installCampaignSchema` adds nullable `author_id` on a new journal table and by the same pragma path as `images`. `schemaVersion` stays `'3'`. `entryFrom` reads `authorId`. The owner page and a journal conflict's `current` leave that field off, so the owner body stays the campaign schema.
- An old journal table gains the column, and a fresh table is created with it. Both owner reads omit `authorId`.
- Case 29 stays a todo, now labelled `P2b3 live-notes guard`. Its column check passes. The refusal it reaches is still the universe cap, "20,000 live entries per universe." The player sentence belongs to part 3. Taking the todo off here would turn every lane's `npm test` red.
Gates: npm test 2142 pass, 0 fail, 42 skipped, 1 todo. check, typecheck, and build clean (index-CfMX6nHc.js, local only). No route, so `test:api:all` was not run.
Shots: none.
Questions: none

## P2b3 Member read and the live-notes guard
Files: apps/api/src/universe/campaign.ts, apps/api/src/universe/UniverseDO.ts, apps/api/src/character/rooms.ts, tests/api/players_logic.test.js, tests/api/room_headers.test.js
What changed:
- `readPlayersCampaign` runs `playersView` over the live rows, then pages the projected rows whose `seq` is above `after`. `visible` (ids only) is on the page when `after` is 0 or when `seq` has moved. `GET /campaign/players` reads `x-voyage-member` and `x-voyage-handles` (a JSON map of user id to handle, set by the Worker). `GET /campaign/seq` answers `{ seq }`.
- `applyCampaignChanges(..., member)` writes journal notes only: kind `note`, author `players`, visibility `players`, no images. Create stores `author_id`. Update and delete check `author_id` before `baseRev`. A foreign note is 403 `forbidden`, "You cannot change that." An anchor is null, a system anchor, or a players record. A hidden record and a missing record are both 400 `validation`, "Invalid request."
- The live-notes guard is 65,535 per `author_id`. A delete frees one. Those notes use that guard, so the universe's 20,000-entry cap does not refuse them. The owner's own writes still use the universe cap. A member PATCH does not spend the owner's 120.
- `openSocket` drops every client `x-voyage-*` header, then sets the socket's own user, name, and role.
- Case 29 is no longer a todo. It passes.
Gates: npm test exit 1: 2146 pass, 1 fail, 42 skipped, 0 todo. check, typecheck, and build clean (index-DOuaYGKV.js, local only). The one failure is `tests/web/living_words.test.js`, "the living switches use the spec sentences", which is another lane's file. No Worker route in this item, so `test:api:all` was not run.
Needs from others: `tests/web/living_words.test.js` looks for the chatter help sentence in `apps/web/src/workspace/LivingSettings.vue`. Lane D has that Vue file claimed. The sentence is not in the file, so the test fails. Left untouched.
Shots: none.
Questions: none

## P2b4 The players Worker
Files: packages/shared/src/schemas/players.ts, apps/api/src/routes/players.ts, apps/api/src/auth/players_schema.ts, apps/api/src/universe/player_rate.ts, apps/api/src/universe/forward.ts, apps/api/src/universe/campaign.ts, apps/api/src/universe/UniverseDO.ts, apps/api/src/routes/universes.ts, apps/api/src/routes/objects.ts, apps/api/src/index.ts, apps/api/src/http.ts, tests/api/players_leaks.test.js, tests/api/players_logic.test.js
What changed:
- The players schemas live in `packages/shared/src/schemas/players.ts`. Lane A holds `packages/shared/src/index.ts`, so the API imports that file by path. The barrel was not edited.
- Owner routes for the invite, the two lists, bring-back, and `personId`. `PATCH .../players/me` is registered before `PATCH .../players/:userId`. Account routes are `POST /api/join`, `GET /api/join/:token`, and `GET /api/me/playing`. The log writes both `/api/join` and `/api/join/<token>` as `/api/join/<token>`.
- `memberUniverse` is owner, active member, archived, or none. Before 0021 only the owner is a role, and `GET /api/me/playing` is `{ items: [] }`. Writes that need the tables are 503 `players_unavailable`.
- A member campaign read calls `GET /campaign/players` with the Worker's own `after` and `limit`. The owner read still calls `GET /campaign`. The Worker sets `x-voyage-authors: 1` on that owner read, strips `authorId`, and sets `authorName` from the handle map. A member page is not passed through `maskOwnerJournal`, so a public entry stays public.
- Each projected table is paged on its own, up to `limit`. A merged window of 1000 cannot hold an early record and a later link. When a table is cut, `seq` is the earliest cut. `GET /campaign/object-hashes` is the member image set, cached per isolate by universe and `seq` for one minute.
- Join counts every authenticated POST before the token lookup: 3 per 10 seconds, `retry-after: 10`. The 255 cap counts `status = 'active'` only, after a real token is valid, and it covers a new row and a self-archived return. An accepted member note spends that member's 10 writes. A refused note does not. Member campaign reads and object reads share the 60-a-minute map.
- The leak fixture joins M1 and M2 and archives M3 through the routes before the first read. Case 2 parses `PlayersPage`. Case 23 inserts 253 real user rows and claims the live token. The wide page joins M1 to that second universe. The party anchor assertion expects the hex `playersView` already returns for a hidden place (P1c). The kind name in the fixture is `pilot`, because a player-visible kind is not a hidden marker and `ZREF_kind` was tripping the marker check.
Gates: npm test exit 1: 2233 pass, 1 fail, 42 skipped, 0 todo. check pass. typecheck pass. build pass (`index-DY1TTSE7.js`, local only). `npm run test:api:all`: 38 pass, 0 fail. `truth_build.test.js` parked. Isolated `players_leaks.test.js`: 35 pass, including the pack companion.
Needs from others: `tests/web/relationship_web.test.js` fails to import `layoutWeb` from `apps/web/src/workspace/web/web_layout.ts`. That file is not Lane B's. Left untouched.
Shots: none.
Questions: none

### Review §3, checked against this code
- `GET /api/universes` — checked. Still the owner's own list. Playing-in is `GET /api/me/playing`.
- `GET/PATCH/DELETE /api/universes/:id` — checked. `ownedUniverse`. A member is 404.
- `GET …/campaign` — checked. Owner: full page, tombstones, `authorName`, no `authorId`. Member: projection, `visible`. Archived: 403 `not_a_member`. Other signed-in: 404. Signed out: 401.
- `PATCH …/campaign/changes` — checked. Owner: full. Member: own note, 10 accepted writes a minute. Archived: 403. Other: 404. Signed out: 401.
- `GET …/campaign/export` — checked. Owner only. Everyone else 404.
- `GET …/objects/:hash` — checked. Owner: stored bytes, or "No such object." Member: hash in the projected set, otherwise the same 404 body as a stranger, "No such universe." Archived: 404.
- `PUT …/objects/:hash` — checked. Owner. A member is 404.
- Builder `/hexes*`, `/sectors*`, `/jobs*`, `/generate`, `/pin` — checked. `ownedUniverse`. A member is 404.
- Installs — checked. `ownedUniverse`. A member is 404.
- `PATCH …/public-games` — checked. Owner. A member is 404.
- `POST` and `DELETE …/players/invite` — checked. Owner. A member is 404. No live link still returns `{ revoked: true }`.
- `GET …/players` — checked. Owner, both groups. A member is 404.
- `DELETE …/players/:userId` — checked. Owner archives. The member archives only their own row. Another id, an archived member, and a stranger are 404. An archived row is returned unchanged.
- `PATCH …/players/:userId` — checked. Owner, `{ personId }` or `{ status: 'active' }`, not both. A member is 404.
- `PATCH …/players/me` — checked. Active member, `{ personId }` in the projected party or null. Owner is 404. Archived is 403. A stranger is 404.
- `POST /api/join` — checked. Owner on their own link: 403 `forbidden`. Active member: 200, no second row. Self-archived: same row brought back. Owner-archived: 403, `details.reason` `archived`. 255 active rows: 400 `campaign_full`. 4th claim in 10 seconds: 429, `retry-after: 10`. Signed out: 401.
- `GET /api/join/:token` — checked. Live token returns name, owner handle, and expiry, including signed out. Unknown, expired, and revoked use the contract codes. 60 a minute by IP.
- `GET /api/me/playing` — checked. Active memberships only, with `truthVersion`. An archived row is absent. The owner's own universes are absent. Signed out: 401. Before 0021: `{ items: [] }`.
- `GET /api/public-games*` and `GET /api/public-ships/:mark` — checked. Unchanged.
- `GET /api/packages*` — checked. Unchanged.
- `/api/characters/*` — checked. Unchanged. Membership adds no grant.
- `/api/admin/*` — checked. Unchanged.
- DO `GET /campaign` — checked. The owner route only. A member call uses `GET /campaign/players`.
- DO `GET /campaign/players` and `GET /campaign/seq` — checked. The Worker builds the URL. Neither is a public route. `GET /campaign/object-hashes` is the same kind of internal read.
- DO `PATCH /campaign/changes` with the member header — checked. The Worker sets `x-voyage-member` after `headersForDoor` drops the client's `x-voyage-*` headers. A missing `author_id` column is 503 `players_unavailable` on that write.
- Private bucket — checked. A member read goes through the objects route and the projected hash set.

## SI0b targetId
Files: directives/contracts/b_session_ingest.md
What changed:
- The batch-read row in the routes table now says `targetId`, the same name as `StoredProposal` and the export list. The column stays `target_id`. `appliedId` is not a field.
- A note for SI1: the "nothing to change" check is a `superRefine` on `Proposal`, not on the update option. The message and the path stay `nothing to change` and `set`.
- Nothing built. No route, migration, or schema file.
Gates: none (paper).
Shots: none.
Questions: none

## BC1 Campaign list summary — proposal
Files: directives/contracts/b_campaign_summary.md
What changed:
- `GET /api/universes` and `GET /api/universes/:id` gain an optional `summary`: vessel names, how many are aboard, the clock day count, the live record count, and when the campaign last changed. The card builds the party line and the date. This API does not send those sentences.
- The list does not call a Durable Object per universe. The object keeps one `campaign_summary` row, rewritten when a campaign write stores a change. The Worker copies that row into D1 `universe_summaries`. The list joins D1.
- The migration is the next number after 0022. 0022 is still unwritten, and this paper does not add a file. Before the table exists the list omits `summary`. A missing row is `summary: null` until the next stored change.
- `GET /api/me/playing` is unchanged. Nothing built.
Gates: none (paper).
Shots: none.
Questions: none

## BC1b The campaign summary — done
Files: directives/contracts/b_campaign_summary.md, apps/api/src/db/migrations/0022_universe_summaries.sql, apps/api/src/db/schema.ts, apps/api/src/universe/campaign.ts, apps/api/src/universe/install.ts, apps/api/src/universe/summary_sync.ts, apps/api/src/routes/universes.ts, apps/api/src/routes/installs.ts, packages/shared/src/schemas/campaign.ts, tests/api/campaign_summary_logic.test.js, tests/api/campaign_summary.test.js
What changed:
- The contract matches the three accepted changes. A stored campaign write, including a member note and install apply or remove, puts `summary` on that Durable Object response. There is no `GET /campaign/summary`. The Worker removes `summary` before the client sees `CampaignChangesResult`, `InstallResult`, or `InstallRemoved`.
- The Durable Object keeps one `campaign_summary` row (`schemaVersion` stays `3`). `vessels` are the stored names of `party.vesselIds` in order, skipping a missing or deleted id. `aboard` counts `party.memberIds` that still point at a live record. `clockDays` is the stored clock or null. `records` counts live `campaign_records`.
- D1 `universe_summaries` is migration 0022, the next free number when this was built. The list and `GET /api/universes/:id` join it and do not call the Durable Object. The key is omitted until the table exists, and `summary` is null until a row exists. `GET /api/me/playing` is unchanged.
- The Worker upserts D1 only when the values differ from this isolate's last upsert for that universe, and that upsert was at least a minute ago. The Durable Object row still updates on every stored change, so a burst can leave the list up to a minute behind.
Gates: npm test 2271 pass, 0 fail, 43 skipped. check clean. typecheck pass. build pass (`index-MZ8jd5Td.js`). test:api:all 39 pass, 0 fail (truth_build parked). An earlier run failed `objects.test.js` once; an isolated rerun and the following full run passed it.
Shots: none.
Questions: none

## SI1 Session ingest, the server — done
Files: directives/contracts/b_session_ingest.md, apps/api/package.json, package-lock.json, apps/api/src/db/migrations/0023_access_tokens.sql, apps/api/src/db/schema.ts, apps/api/src/auth/tokens.ts, apps/api/src/auth/token_codec.ts, apps/api/src/routes/tokens.ts, apps/api/src/routes/agent.ts, apps/api/src/routes/admin.ts, apps/api/src/routes/universes.ts, apps/api/src/universe/proposals.ts, apps/api/src/universe/publish_read.ts, apps/api/src/universe/budget.ts, apps/api/src/universe/UniverseDO.ts, apps/api/src/universe/forward.ts, apps/api/src/universe/schema.ts, apps/api/src/http.ts, apps/api/src/env.ts, apps/api/src/index.ts, apps/api/wrangler.toml, apps/api/src/mcp/server.ts, tests/api/proposals_logic.test.js, tests/api/tokens_logic.test.js, tests/api/session_ingest.test.js, tests/api/mcp.test.js, tests/api/logged_route.test.js
What changed:
- Migration 0023 adds `access_tokens` and `platform_flags`. Tokens are `tv_pat_` plus 32 random bytes, stored as a SHA-256 hash, shown once, at most ten live, default expiry 90 days and at most 365. A missing `universeId` is 400. A universe the caller does not own is 404. Revoke, expiry, an unknown token, and a banned account all answer 401 `token_invalid`. Cookie routes that do not call `requireAgent` answer 401 `unauthenticated` for a bearer, the same body as signed out.
- Proposal tables live in the Durable Object (`installProposalSchema` after the campaign schema). `schemaVersion` stays `3`. Phase-1 ops are record create and update, link create, journal create, clock set, the four appends, and question. Accept resolves a `ref` inside the batch. A conflict stays pending. A replayed create whose row already exists is marked accepted. The submit budget is 10 a minute on the token and 10 a minute on the object, separate from `allowMutation`. The 21st open batch is refused before the charge.
- `POST /mcp` uses `@modelcontextprotocol/server` 2.3.1 (`createMcpHandler`). Bearer only. Origin absent or this site. Six tools, one-to-one with the read and submit routes. No apply, resolve, or delete tool. `wrangler.toml` `run_worker_first` includes `/mcp` and `/mcp/*` so the assets layer does not answer POST with 405. While `agent_access` is off, token routes and every `/mcp` method answer 503 `agents_paused`. The kill switch is checked before the method check.
- The public-ship check uses its own universe that has the released truth version, so the overview query can see the mark. The token-bound universe and the null-truth universe stay separate.
Gates: npm test 2361 pass, 0 fail, 45 skipped. check clean. typecheck pass. build pass (`index-SJg35XSX.js`). test:api:all 41 pass, 0 fail, 41 suites (truth_build parked). `session_ingest.test.js` pass 17.8s. `mcp.test.js` pass 16.3s.
Shots: none.
Leak table (`directives/reports/x_session_ingest.md` §5), re-read row by row:
- S1 checked. Cases 1 and 2 refuse unknown keys. Case 3 (pure) stores `visibility` `referee`.
- S2 checked. Cases 4, 5, 7, and 9. Case 6 is `readPublishSources` in the pure test (`found` false). Case 8 is `tests/web/player_pack.test.js`, not this lane's file. The export route covers the proposed name.
- S3 checked. Cases 10 and 11. Agent reads send `private, no-store`. A bound token on another universe is the missing-universe 404.
- S4 checked. Case 12 is 401 `unauthenticated`, the signed-out body. Case 13 after revoke is `token_invalid`. Case 15, an expired token is `token_invalid`.
- S5 checked. Case 16. Forged `x-voyage-worker` and `x-voyage-member` do not change the submit, and the 11th submit is still 429.
- S6 checked. Cases 17, 18, and 20. Case 19's sentence is the pure test (`charges === 0`). The worker cannot open 21 batches inside the 10-submit budget. The 11th submit is 429 and a referee PATCH in that minute is 200. Case 21 (pure) sweeps expiry and the 90-day delete.
- S7 checked. Case 22. Same key and hash returns the stored batch. A different hash is 409 `idempotency_conflict`.
- S8 checked. Case 23. The three pairs answer the same bodies.
- S9 checked. Case 24 (pure). Apply, skip the mark, resolve again: one record, state `accepted`, `appliedRev` a number, conflicts empty.
- S10 checked. `mcp.test.js`: cookie without a token is 401 `token_invalid`. `Origin: https://evil.example` is 403. GET and DELETE are 405 when the switch is on.
- S11 checked. Case 25. Resolve with a foreign Origin is 403.
- S12 checked. Case 26 deletes the batch. Case 27 (pure) refuses a 301-character quote.
- S13 checked. Case 14 extends `logged_route.test.js`: the log object has `via` and `tokenId`, and the sample secret is absent. This is the log-line keys, not a live wrangler capture.
- S14 checked. Case 28. Accept a `track.append` on the public chart universe and the overview hex moves.
- S15 checked. Covered with case 5: the players page has no proposal field.
Questions: none

## TS4 Table sets, the server — done
Files: apps/api/src/db/migrations/0024_table_sets.sql, apps/api/src/db/schema.ts, apps/api/src/routes/table_sets.ts, apps/api/src/index.ts, tests/api/table_sets.test.js, directives/contracts/b_table_sets.md
What changed:
- Migration 0024 adds `table_sets`. 0022 is universe summaries and 0023 is access tokens, so this is the next free number. One row per set. The bytes are a private R2 object at `table-sets/<owner>/<id>/<sha256>.json`, written before the row. Delete sets `deleted_at`. The list omits a deleted row, and a GET of one is 404.
- `/api/table-sets?kind=` lists the signed-in account's live sets of that kind, without the table body. POST accepts `{ kind, name, tables }` or `{ copyOf, name? }`. `copyOf` is `official:<kind>` or an id this account owns. PUT takes `baseRev` and `tables`, and a stale rev is 409. The official bytes are `rules/mgt2e_random_passenger.json` and `rules/mgt2e_trade.json`, the files `rules:gen` wraps. The server runs `validateTableSet` before it stores anything.
- An account holds 20 live sets. A set over 256 KB is refused with the validator's sentence. An unknown kind stays "Invalid request." and the roller's sentence is `details.problems[0].words`. A missing table is 503 `table_sets_unavailable`.
- A player has no list of someone else's sets. GET of one id is 200 only for the owner, or for an active member of a campaign whose `tableSets` for that kind is that id. A stranger and an archived member get the same 404 as a missing id.
Gates: npm test 2371 pass, 0 fail, 46 skipped. check clean. typecheck pass. build pass (`index-DNn0HJ0u.js`). test:api:all 42 pass, 0 fail, 42 suites (truth_build parked). `table_sets.test.js` pass 18.2s.
Shots: none.
Questions: none

## SI1b Agent access ships off — done
Files: apps/api/src/auth/tokens.ts, apps/api/src/mcp/server.ts, apps/api/src/db/schema.ts, apps/api/package.json, package-lock.json, directives/contracts/b_session_ingest.md, tests/api/session_ingest.test.js, tests/api/mcp.test.js
What changed:
- `agentAccessOn` is on only when `platform_flags.agent_access` is the row `value = 'on'`. No table, no row, any other value, and a read error are off. A fresh database refuses `POST /mcp` and `POST /api/tokens` with 503 `agents_paused` "Agent access is paused." Cookie campaign routes are unchanged.
- To turn it on later, an admin sends `POST /api/admin/flags` with `Origin` of this site (or no Origin) and body `{"key":"agent_access","value":"on"}`. The answer is 200 `{ "ok": true, "data": { "key": "agent_access", "value": "on" } }`. The same call with `"value":"off"` pauses it again. The route is audit logged as `agent_access.set`.
- MCP tool schemas import Zod 4 as `zod4`, the package alias `npm:zod@4.6.5` on `@voyage/api`. `zod/v4` from this workspace is Zod 3.25.76's preview, which is not the Zod 4 the MCP SDK wraps, and a relative path into the repo's root `node_modules` fails a clean checkout. `wrangler deploy --dry-run` bundled the Worker (7975.12 KiB, exit 0). `tokens_logic.test.js` does not call the flag, so it was left as it is. The worker tests insert or POST the `on` row before they mint a token.
Gates: check clean. typecheck pass. build pass (`index-BWSRq7ux.js`). `session_ingest.test.js` and `mcp.test.js` pass. test:api:all 42 pass, 0 fail, 42 suites (truth_build parked). npm test 2364 pass, 10 fail, 46 skipped.
Needs from others: the 10 failures are `tests/shared/proposals.test.js`, claimed by Lane Z (ZF1). They open `findings/session_ingest/example_batch.json` and `SKILL.md`, which that item is moving. Not fixed here.
Shots: none.
Questions: none

## TS4b A member reads only the owner's set — done
Files: apps/api/src/routes/table_sets.ts, tests/api/table_sets.test.js
What changed:
- `memberMayRead` is true only when an active membership's campaign has chosen that set id for its kind and `row.ownerId` is that universe's `owner_id`. A named set from another account stays off.
- The worker test points the campaign at another account's set. The active member's GET is 404, the same body as a missing id. The member can still read the campaign owner's own chosen set.
Gates: check clean. typecheck pass. build pass (`index-Cpjnu8Nq.js`). `table_sets.test.js` pass. npm test 2374 pass, 1 fail, 46 skipped.
Needs from others: the failure is `tests/web/comms_receiver.test.js` (`spectrum` of undefined), claimed by Lane C. Not fixed here.
Shots: none.
Questions: none

## TS4c The table-sets contract matches the owner check — done
Files: directives/contracts/b_table_sets.md
What changed:
- The decided line, the GET `/:id` row, and the migration-order row now say a member may read a chosen set only when that set's owner is the campaign universe's owner. A named set from another account is the same 404 as a missing id.
- No route, migration, or stored-data change. The check is the one TS4b added.
Gates: npm test 2375 pass, 0 fail, 46 skipped. check clean. typecheck pass. build pass (`index-Cpjnu8Nq.js`).
Shots: none.
Questions: none

## TS4d A campaign should not store another account's set — proposal
Files: none (paper). The write is `apps/api/src/universe/campaign.ts` (`applyCampaignChanges`, the settings branch) and `tests/api/table_sets.test.js`.
What changed:
- Nothing built. A settings change may set `tableSets` to any string. TS4b refuses the member read when that id belongs to another account, with the same 404 as a missing id. The campaign keeps the id, and a roller that cannot read the set uses the official table.
- Proposed: on that write, if the id is not `official:<kind>` and the universe owner has no live row for it, refuse. Same missing-set answer. Official ids stay allowed. This changes what `PATCH .../campaign/changes` accepts, so it waits on Johnny.
Gates: no code change. The tree is the TS4c run: npm test 2375 pass, 0 fail, 46 skipped. check clean. typecheck pass. build pass (`index-Cpjnu8Nq.js`).
Shots: none.
Questions:
1. Refuse a settings write that names a set the universe owner does not own, with "No such table set." Recommended: yes.
