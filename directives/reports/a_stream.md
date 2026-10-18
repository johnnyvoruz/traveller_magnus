# Stream A

## A2 Nothing on the chart loads twice — done
Files: apps/web/src/map/truth_client.ts, tests/web/truth_client.test.js
What changed:
- A successful file under the CDN base stays in memory for the page, shared by every TruthClient given the same fetch. A failed fetch is dropped, so the next ask tries again.
- The released-version list is not kept. It can change during a session.
- Polities uses that same jar. A 404 is still an empty document. Any other failure is still retried.
- Before, on one map client: panning back, zooming back in, and reopening the dossier already made no second index or tree fetch. A second client in the same page (the orbit route replaces the map, and the map is built again on return) fetched the manifest, the overview, polities, each index and the tree a second time: 2 per URL. After: 1 per URL, including that second client. Counted in tests/web/truth_client.test.js.
Gates: test 1897 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass
Shots: none (no visible change)
Questions: none

## A3 The one-sector limit said before a request — done
Files: none. Already in apps/web/src/workspace/build/one_sector.ts, acts.ts, BuildPane.vue, commands.ts, density_ask.ts, grow_acts.ts.
What changed:
- Nothing. A selection in two sectors does not send. Generate is off, and the pane shows the sentence where the button is (`BuildPane.vue`, `data-build-one-sector`).
- The words already shown are "You can generate in one sector at a time. Select hexes inside one sector, and then select Generate." and, for two empty slots, "You can create one sector at a time. Select hexes inside one empty sector slot, and then generate. Repeat for each slot."
- The server's refusal is "The limit is one sector per request." (`apps/api/src/jobs/one_sector.ts`, contracts/b_builder.md).
Gates: no code change. The A2 run is this tree.
Shots: none
Questions:
1. The queue names both "You can generate one sector at a time." and the server's sentence, and the pane already shows the two longer sentences above. Recommended: keep those two. They say what to do next. Leave the server sentence for the answer that comes back if a request is still sent.

## A1 The dice roller — done
Files: apps/web/src/dice/roll.ts, command.ts, DiceRoller.vue, DiceButton.vue, apps/web/src/shell/registry.ts, apps/web/src/workspace/CampaignPanel.vue (the existing DiceButton mount), apps/web/src/App.vue (the existing DiceRoller mount), tests/web/dice_roll.test.js
What changed:
- Notation is gone. A roll is 1, 2 or 3 six-sided dice, chosen with 1D, 2D and 3D. The palette command is "Roll dice" and rolls 2D at once. R does the same, and it yields while the builder's "Roll again" (`workspace/build/commands.ts`, key `r`) is runnable.
- The dice tumble in the middle for 1.1s (none under reduced motion), then a card slides up: the total large, each die beside it. Click or Escape dismisses it. The last 20 rolls stay in memory.
- Boon and Bane, Johnny 15:15: "Boon rolls 3D keeps best two, bane keeps worst two." The toggles sit beside the count buttons, off by default, and only one can be on. While one is on, the count buttons show 2D and are disabled. Turning one on rolls at once, because those buttons cannot. Three dice tumble. The card is titled Boon or Bane, the dropped die is dimmed and struck through, and the total is the two that remain. A tie drops the earliest tied face for Boon and the latest for Bane.
- The app toast cannot carry this card. `shell/toast.ts` is a string, at most two, with an optional action. The card is its own slide-up, the sheet's result, not a second toast strip.
Gates: test 1962, 1923 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass
Shots: findings/ui_design_shots/sa_A1_roller_before_1600.png, sa_A1_roller_before_390.png (the notation roller), sa_A1_roller_after_1600.png, sa_A1_roller_after_390.png, sa_A1_roller_boon_1600.png, sa_A1_roller_2d.gif. The campaign header was not in the shots: the API on 8787 is down, so the panel is signed out. Boon was driven on the live page. The 502 line in the shots is that missing API.
Questions:
1. Turning Boon or Bane on rolls immediately. Recommended: keep that. The count buttons are disabled while a toggle is on, so the toggle is the throw.
2. The result stays a card rather than a toast. Recommended: keep the card. The toast is a sentence and cannot show the total and the dice.

## A1b The roller, two fixes — done
Files: apps/web/src/dice/command.ts, DiceButton.vue, DiceRoller.vue, tests/web/dice_roll.test.js
What changed:
- Boon and Bane are settings. Turning one on does not roll. While one is on, 1D and 3D are disabled and 2D stays the throw: it rolls three dice and keeps two. The card stays a card.
- Once the dice land, the dropped die in the tray is at 35% opacity. On the card each die is a 24px face with pips. The dropped face is dimmed and crossed. The total stays large.
- A Boon of 1, 6, 3 totals 9 and drops the 1. A Bane of the same dice totals 4 and drops the 6.
Gates: test 1970, 1931 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass
Shots: findings/ui_design_shots/sa_A1b_boon_after_1600.png, sa_A1b_boon_after_390.png, sa_A1b_bane_after_1600.png, sa_A1b_bane_after_390.png. The 502 line is the API on 8787, which is not running.
Questions: none

## A4 The dossier model's speed — done
Files: none. `apps/web/src/dossier/model.ts` is unchanged.
What changed:
- Nothing. Largest means the most bodies `bodyKeys()` walks, the work the system page and the world pages do. Regina is subsector C (`universe/raw/Spinward_Marches.xml`, Index C). 32 hexes there have a tree. The 20 with the most bodies, hex ascending on a tie: Whanga 1806 (51), Shionthy 2306 (44), Yres 1802 (43), Wochiers 2207 (41), Regina 1910 (41), Roup 2007 (39), Knorbes 1807 (37), Beck's World 2204 (37), Pscias 2106 (36), Inthe 2410 (36), Yori 2110 (35), Heya 2402 (33), Algine 2308 (33), Forboldn 1808 (30), Pixie 1903 (28), Jenghe 1810 (27), Yurst 2309 (27), Rethe 2408 (23), Ruie 1809 (23), Kinorb 2202 (22).
- On the quiet pass, 100 `overviewModel` calls: median 0.229 ms, p95 2.077 ms, slowest 4.749 ms (Ruie 1809). 3430 `bodyModel` calls: median 0.031 ms, p95 0.326 ms, slowest 7.919 ms (Regina 1910, body `w9m1`). The slowest first call was 7.729 ms (Roup 2007, `w1m6`). None over 16 ms.
- A pass while the machine was busy recorded single calls up to 348 ms. The quiet pass of the same pages had no call over 16 ms, so those were pauses. Nothing was cached or split. Before and after are the same.
Gates: test 1967, 1928 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass
Shots: none (no visible change)
Questions:
1. "Largest" is the body count above. Recommended: keep that. It is the work these two functions do on a system page and its world pages.

## AP1 P1, the players projection — done
Files: packages/shared/src/players_view.ts, packages/shared/src/index.ts, apps/web/src/pack/plan.ts, tests/shared/players_view.test.js
What changed:
- `playersView` turns a full campaign read into the players' read. A record stays when `visibility === 'players'`. A link stays when both ends stay. A journal entry stays when it is `players` or `public`. Tombstones are left out. `rev` and `provenance` are left off. Party, clock and settings stay. A mention of a hidden record reads "a record"; a players record's mention reads that record's name; a hex mention keeps its written label, or the hex key.
- An anchor that points at a hidden record is left off. `playersObjectHashes` lists every 64-character hash still in that read. A players image stays. A referee-only image does not.
- The Player Pack asks `playersView` which rows are in, including a `public` entry. `pack/text.ts` still renders the file and still redacts its own text. The pack's leak test still passes.
- `directives/contracts/b_players.md` is not in the tree. This follows Epic P decision 3.
Gates: test 1983, 1944 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass
Shots: none (no visible change)
Questions:
1. An included link keeps its role and notes. The pack file still does not print them. Recommended: keep them on the read. Decision 3 drops a link only when an end is hidden.
2. Settings kinds and the party's place stay, including text the referee wrote there. Recommended: keep them. Decision 3 says the party, clock and settings are in.

## AT1 T1, the shape of cargo, passengers and the ledger — done
Files: packages/shared/src/schemas/campaign.ts, packages/shared/src/index.ts, apps/web/src/campaign/cargo.ts, apps/web/src/campaign/ledger.ts, apps/web/src/campaign/money.ts, tests/shared/campaign_status.test.js, tests/web/cargo_ledger.test.js
What changed:
- `RecordStatus` gains optional `cargo`, `passengers` and `ledger`. Other status keys stay free. A record with only a track, or with `status: null`, still parses.
- `CargoLot`, `PassengerLot` and `LedgerLine` follow `campaign_manager_plan.md` §5.3. `PassengerLot.note` is added so the sheet's Passenger Notes box has a field. All three are exported from `@voyage/shared`.
- `campaign/cargo.ts` adds and removes lots, sums tons, and reads the first number in the sheet's "Cargo Capacity". The sixteen Cargo rows and sixteen Passenger rows are a view of the first sixteen lots: row n is list entry n, and the rest are "and N more". Field names are the PDF's own. "Passenger Capactiy" is the PDF's spelling and is not read. A blank row is not stored.
- `campaign/ledger.ts` posts a line, sums `amount`, and groups lines by the campaign day on the line. `amount` is the credit change as stored. `kind` does not flip the sign.
- `campaign/money.ts` writes `Cr1,234` and `MCr1.2`. No rule, no price, no dice. The party's cash and a character's Cash on Hand are not these modules.
Gates: test 2005, 1965 pass, 1 fail, 39 skipped. The fail is `tests/web/record_card.test.js`: `CampaignPanel.vue` has no `<RecordCard />` (expected 1, found 0). That file is claimed by E at 15:54. Not fixed. check clean; typecheck pass; build pass (758 modules, vue-tsc, vite 1.15s).
Shots: none. Lane D builds the screens (DT1).
Questions:
1. `amount` is the signed credit change, and `kind` does not flip it. Recommended: keep that. An expense is posted as a negative amount.
2. A blank sheet row is left out of the list, so the sixteen rows are the first sixteen stored lots. Clearing a row deletes that lot and later lots move up, which can bring a 17th onto the sheet. Recommended: keep that. The sheet is a view of the dense list, and row n is `cargo[n]` of that list.
3. `PassengerLot.note` is not in the §5.3 sketch. The sheet has Passenger Notes. Recommended: keep the note.
Needs from others: Lane E, `apps/web/src/workspace/CampaignPanel.vue`. `tests/web/record_card.test.js` expects one `<RecordCard />` in that file. The match count is 0 while E holds the claim.

## AT2 T2, fuel and the monthly costs, the numbers only — done
Files: apps/web/src/campaign/refuel.ts, tests/web/refuel.test.js
What changed:
- `refuel.ts` reads `fuel.refinedCrPerTon` and `fuel.unrefinedCrPerTon` from the generated space-travel wrapper. Tons to fill are the sheet's "Fuel Capacity" minus a typed current level. A level above capacity fills nothing. `refuelCost` is those tons times the file's Cr per ton. `refuelLine` posts that as an expense (`amount` negative) and returns null when no tons are taken on.
- The seven PDF boxes Purchase Cost, Mortgage Cost, Maintenance Cost, Fuel Tank Cost, Life Support Cost, Salary Cost and Running Cost each become a recurring line when the box holds a positive number. A blank, a zero and a box with no number post nothing. `campaign/travel.ts` is unchanged.
- No dice. `refuelHours` is not read. No starport check. No new stored field. No screen.
Gates: test 2012, 1972 pass, 1 fail, 39 skipped. The fail is the same `tests/web/record_card.test.js` mount in `CampaignPanel.vue`, claimed by E. Not fixed. check clean; typecheck pass; build pass (758 modules, vue-tsc, vite 0.99s).
Shots: none. No screen.
Questions:
1. A cost is posted as a negative `amount`. Recommended: keep that. It matches the ledger from AT1, where an expense is stored as a negative credit change.
2. `refuelHours` stays unread. Recommended: leave it. T2 prices the tons. It does not time the refuel.
3. This function does not check for a starport. Recommended: leave the check to the screen, once it has the world. This module only prices a typed level against the file.
4. Purchase Cost is posted as recurring, with the other six, when the box has a number. Recommended: keep that. The line posts what was typed. It does not decide which costs repeat.
5. The Refuel and Post this month buttons are not on a screen. Recommended: Lane D mounts them, as it mounts Cargo and Ledger, and calls `refuelLine` and `monthlyLines`.
Needs from others: Lane E, `CampaignPanel.vue`, the record-card mount above. Lane D, the two buttons.

## AT4a T4a, markets nearby, by data — done
Files: apps/web/src/campaign/markets.ts, tests/web/markets.test.js
What changed:
- `marketsNearby` keeps worlds at most 2, 4 or 6 parsecs from the ship, nearest first, and includes the ship's own world at 0. Distance is `parsecsBetween`. Any other range returns nothing.
- A sector-index row supplies the name, the starport character (`map/uwp.ts`), the trade codes, and the population character (the fifth UWP character, the one `surface/profile.ts` reads). The index has no WTN, so that field stays empty. `wtnOf` reads `body.mgtSocio.WTN` when a tree has been loaded.
- No pairing and no price. Regina's subsector on the local v10 chart is covered: starport, codes and population character match the index row, and the tree's WTN is read only from that body.
Gates: test 2032, 1993 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass (758 modules, vue-tsc, vite 0.82s).
Shots: none. Lane D builds the Markets section.
Questions:
1. The ship's own world is in the list at 0 parsecs. Recommended: keep it. "Within N" includes where the ship is.
2. Population is the UWP character, not a head count. The index does not carry `totalWorldPop`. Recommended: keep the character. A head count needs the tree, the same way WTN does.

## AU14 The palette everywhere, with scopes — done
Files: apps/web/src/components/OmniBox.vue, apps/web/src/App.vue, apps/web/src/views/MapView.vue, apps/web/src/views/DesignView.vue, apps/web/src/search/omni.ts, apps/web/src/search/recent.ts, apps/web/src/search/chart_hold.ts, apps/web/src/search/palette_state.ts, apps/web/src/platform/browser.ts, apps/web/src/workspace/market/catalogue_memory.ts, tests/web/omni.test.js
What changed:
- One palette is mounted for the whole page. Ctrl+K and / reach it from the orbit view and the store, through a page key listener. A screen that already handled the key is left alone. The design sample does not take a second Search command. `shell/registry.ts` was not edited. Lane E's scopes stay as they are.
- Groups are Worlds, Records, Entries, Commands, Packages. An empty field leads with places opened earlier this session, then the examples. Journal titles match, deleted entries do not. Packages are only cards and pages already read this session.
- A name matches when its letters come in order, after exact, prefix and contained words. "1910" still matches the world's hex. The released chart is remembered once the map has loaded, and a search from another screen loads it if the map has not.
Gates: test 2048, 2009 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass (769 modules, vue-tsc, vite 0.86s).
Shots: findings/ui_design_shots/sa_au14_before_map_1600.png, sa_au14_before_map_390.png, sa_au14_before_orbit_1600.png, sa_au14_before_orbit_390.png, sa_au14_before_store_1600.png, sa_au14_before_store_390.png, and the same six with `after`. Ctrl+K opened the palette on the orbit view and on the store. Typing 1910 on the store listed Regina first, under Worlds.
Questions:
1. Recent rows lead only while the field is empty. A typed query stays best match first. Recommended: keep that. Recent is a way back, not a better match than the name.
2. Packages are whatever this session already loaded. The palette does not ask the catalogue. Recommended: keep that. An empty Packages group means the store has not been opened yet.
3. A fuzzy match is a subsequence, and it ranks under a word that is actually contained. A word that is not in the name still matches nothing. Recommended: keep that. "regina march" must not list Regina.
Needs from others: none.

## AU16 Loading that never shows twice — done
Files: apps/web/src/platform/browser.ts, apps/web/src/map/truth_client.ts, tests/web/truth_client.test.js
What changed:
- Immutable chart files (anything under the CDN base: sector indexes, trees, the manifest, the overview, polities) are kept in the Cache API, name `voyage-chart`, through `platform/browser.ts`. A later visit reads them from that cache and does not ask the network. A damaged cache entry is ignored and fetched.
- The released-version list is not cached. It can change. A failed response is not cached. Nothing is written to IndexedDB.
- When the Cache API is missing, the request starts in the same turn it always did, so a burst of indexes still overlaps.
Gates: test 2049, 2010 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass (769 modules, vue-tsc, vite 0.83s).
Shots: none. The measure is the orbit of Regina, Spinward Marches 1910, reloaded. Before: the return visit requested the sector index, the tree and the overview again (1 each). After: the return visit requested none of those. `/api/truth/versions` was requested both times.
Questions:
1. The manifest, the overview and polities are cached with the indexes and the trees. They are immutable files on the same CDN. Recommended: keep them in the same cache. The versions list stays out.
Needs from others: none. The campaign's last read in IndexedDB is the other half of U16 and is not this item.

## AP1b P1b, the projection hardened — done
Files: packages/shared/src/players_view.ts, tests/shared/players_view.test.js, tests/web/player_pack.test.js. apps/web/src/pack/plan.ts was not edited: `playersView` still takes the campaign alone, and the new second argument is optional.
What changed:
- Party `memberIds` and `vesselIds` keep only visible record ids. `aboard` keeps a pair only when both ids are visible. A party anchor that names a hidden record stays null.
- A track end that names a hidden record becomes the system hex `locate` finds for it, with `hexKey` and `bodyKey` only. No name, no label, no point. When no hex is found, the end is null. A visible record end stays a record anchor. A hidden `itemId` or `personId` is dropped. Other status text and the sheet still redact strings.
- `playersObjectHashes` reads `images[].hash` and `images[].thumbHash` on the projected records and entries only.
- `playersView(full, { userId, handles })`: a journal row whose `authorId` is the caller keeps `rev`. A row with an `authorId` gains `authorName` from the handle map, or an empty string when the map has no handle. `authorId` is not copied out. Rows without an `authorId` stay as they were.
- The pack fixture's public entry was `kind: 'notice'`, which is not a journal kind, so a page built from it could not parse. It is now `kind: 'note'` with `visibility: 'public'`.
Probe 1, from `.tmp/` on Node 24.19.0, printed a party whose lists hold only the visible person and ship, a track end `{ kind: 'system', hexKey: 'Spinward_Marches/1910' }`, and `true`.
Gates: players_view 7 pass; player_pack 5 pass including the pack agreement. Full `npm test`: 2064 tests, 2025 pass, 1 fail, 38 skipped. The fail was `tests/api/campaign.test.js` while Lane B held `apps/api/src/universe/forward.ts` (the file could not resolve `auth/session` mid-edit). A re-run of that file afterwards: 0 fail, 1 skipped. check clean; typecheck pass; build pass (769 modules, vue-tsc, vite 1.02s).
Shots: none.
Questions:
1. A handle the map does not hold becomes `authorName: ''`. Recommended: keep the empty string. The field is present, and the projection does not invent a name.
2. A party anchor to a hidden record stays null. The hex is on the ship's track end. Recommended: keep that. Johnny's yes was the leg.
Needs from others: Lane B, the one `campaign.test.js` failure above. Not this item.

## AM1 A debit written "−Cr4,800" — done
Files: apps/web/src/campaign/money.ts, tests/web/cargo_ledger.test.js, apps/web/src/workspace/VesselTrade.vue (the one credits line).
What changed:
- `formatCredits` and `formatMegaCredits` put U+2212 before the unit when the amount is negative. `−Cr4,800`, `−MCr1.2`. A credit stays `Cr1,234` and `MCr1.2`.
- The vessel trade screen passes the amount through. It no longer adds a minus of its own.
Gates: test 2072, 2033 pass, 0 fail, 39 skipped; check clean; typecheck pass; build pass (770 modules, vue-tsc, vite 1.80s).
Shots: none. The screen already showed `−Cr4,800`. The minus moved into the formatter, and the rendered line is the same string.
Questions: none.
Needs from others: none.

## AS3 The dice card covers the map's locator line — done
Files: apps/web/src/dice/DiceRoller.vue, apps/web/src/platform/browser.ts.
What changed:
- The result card no longer sits at a fixed 24px. Its bottom is `calc(var(--chrome-inset) + var(--locator-height, 0px) + var(--sp-2) + env(safe-area-inset-bottom, 0px))`.
- `locatorHeight()` in `browser.ts` reads `.ui-status`. It returns 0 when the line is missing or empty, and `offsetHeight` otherwise. The card sets `--locator-height` from that reading when it appears, and again on resize. `MapView.vue` was not edited.
- Before, the card overlapped the Regina locator by 16px at 1600 and at 390 (card bottom 876, line top 860, line height 30, viewport height 900). After, the gap is 8px at both widths (card bottom 852, overlap −8). The 390 line did not wrap at that height, so both shots measured the same 30px pill. An empty pill stays height 0, and the card sits at the chrome inset plus the token gap.
Gates: test 2086, 2046 pass, 0 fail, 40 skipped; check clean; typecheck pass; build pass (772 modules, vue-tsc, vite 1.18s).
Shots: findings/ui_design_shots/sa_AS3_before_1600.png, sa_AS3_before_390.png, sa_AS3_after_1600.png, sa_AS3_after_390.png. The first-visit redirect was skipped in the shot script by setting `voyage_welcome_shown` before navigation, so the hex page stayed on the map.
Questions: none.
Needs from others: none.

## AS3b Boon and Bane from the palette — done
Files: apps/web/src/dice/command.ts, apps/web/src/dice/DiceRoller.vue, tests/web/dice_roll.test.js.
What changed:
- "Roll dice" still rolls 2D, or Boon or Bane when that mode is already on, and it opens the roller. The roller is the same count, Boon and Bane buttons as the campaign panel, in a bar on the map, signed in or out. Close hides the bar.
- The palette also lists "Boon" and "Bane". Each turns that mode on and rolls. The buttons still do not roll when toggled. Choosing Boon again from the palette leaves Boon on.
- Typing "boon" or "bane" ranks that command. The existing matcher is unchanged.
Gates: test 2089, 2049 pass, 0 fail, 40 skipped; check clean; typecheck pass; build pass (776 modules, vue-tsc, vite).
Shots: findings/ui_design_shots/sa_AS3b_palette_boon_1600.png (the command "Boon" under Commands), sa_AS3b_after_1600.png, sa_AS3b_after_390.png. After "Roll dice", the bar shows 1D, 2D, 3D, Boon, Bane and Close. Pressing Boon sets aria-pressed to true. The bar sits 8px above the card, and the card sits 8px above the locator, at both widths. No separate before frame: the signed-out roller without these buttons is the integration sweep's `x_sweep_dice_boon_1600.png`.
Questions: none.
Needs from others: none.

## AU16b Old chart versions leave the cache — done
Files: apps/web/src/platform/browser.ts, apps/web/src/map/truth_client.ts, tests/web/truth_client.test.js.
What changed:
- `chartKeepVersion` deletes `voyage-chart` entries whose path is `/truth/<other version>/`. The current version stays. Object URLs under `/objects/` stay. `chartMatch` is unchanged.
- `TruthClient.currentVersion` awaits that sweep after it picks the released version. The same version does not list the cache again. A cache with no `keys` is left as it is.
- The test stores v1, v2, and an object. The current version v2 drops v1. When the current version becomes v1, v2 drops and the object stays.
Gates: check clean; typecheck pass; build pass (777 modules, vue-tsc, vite). npm test 2097, 2056 pass, 1 fail, 40 skipped. The fail is `tests/api/preview_tags.test.js`: it cannot import `apps/api/src/routes/package_covers` from `apps/api/src/preview_tags.ts`. Lane B holds that file. Not fixed.
Shots: none.
Questions: none.
Needs from others: Lane B, `preview_tags.ts` and `tests/api/preview_tags.test.js`.

## AB3 The generation sentences B3 left — done
Files: packages/generation/src/form.ts, packages/generation/src/hand.ts, tests/generation/hand.test.js, tests/generation/roll_body.test.js.
What changed:
- Words only. "Type a finite number." is "Type a number." "Type a finite number above 0." is "Type a number greater than 0." "Nothing rolls this field." is "This field cannot be rolled." "No system was produced." is "This system could not be built." "You can't edit …" is "You cannot edit …". The checks are the same.
- The parity and golden tests stayed in the full suite, which passed with no new deviation.
Gates: test 2105, 2064 pass, 0 fail, 41 skipped; check clean; typecheck pass; build pass (777 modules, vue-tsc, vite).
Shots: none. These sentences are refusals.
Questions: none.
Needs from others: `directives/contracts/b_builder.md` still quotes the old sentences. Not edited. `tests/web/builder_draft.test.js` still feeds the old mass sentence as a fake server reply. Not edited.

## AU15 Search that finds text, the browser half — done
Files: apps/web/src/workspace/omni_campaign.ts, apps/web/src/search/omni.ts, apps/web/src/components/OmniBox.vue, tests/web/palette_text.test.js.
What changed:
- A record whose details contain every typed word is listed, including when the name index does not have it. A deleted record is not listed. The row's line is the details line that contains the last word, and that word is marked. A match that is only in the name or the summary still shows the place line.
- A journal body is searched the same way. The row's line is the body line, with the word marked. A title match with no body line stays "Journal entry". No request is sent.
Gates: test 2108, 2067 pass, 0 fail, 41 skipped; check clean; typecheck pass; build pass (777 modules, vue-tsc, vite).
Shots: none. The palette lists campaign text only while someone is signed in, and the API on 8787 is not running. The fixture in tests/web/palette_text.test.js is a Depot whose details are "The amber vault is under the port." and a Tuesday entry whose body is "We found the amber vault." Both mark the word amber.
Questions: none.
Needs from others: none.

## AF1 The palette dice total — done
Files: none. The test and the roller already agree.
What changed:
- Nothing. `tests/web/dice_roll.test.js` passes: 5 tests. After the palette leaves Boon on, `setMode('boon')` turns it off, and `rollDefault` of faces 3 and 4 totals 7.
- The NaN from B's 19:50 run is a third face. Boon and Bane throw three dice. A two-face list then returns undefined, and the total is NaN. The roller is right to throw three. This tree turns Boon off before that roll, and the mode is plain.
Gates: test 2110, 2069 pass, 0 fail, 41 skipped; check clean; typecheck pass; build pass (778 modules, vue-tsc, vite).
Shots: none.
Questions: none.
Needs from others: none.

## AP1c The party's place follows a ship's leg — done
Files: packages/shared/src/players_view.ts, tests/shared/players_view.test.js.
What changed:
- The party's anchor uses the same projection as a track end. A hidden record becomes the system `locate` finds, with hexKey and bodyKey only. A hidden record with no system is null. A kept record stays a record anchor. A system anchor still keeps its label, with hidden names redacted.
- The fixture's hidden place at Spinward Marches 1910, body w3, is that system anchor, and the label is absent. A place with no anchor leaves the party anchor null. "Where are we" reads that anchor, so the hex remains.
Gates: test 2110, 2069 pass, 0 fail, 41 skipped; check clean; typecheck pass; build pass (778 modules, vue-tsc, vite).
Shots: none.
Questions: none.
Needs from others: none.

## AT1c Ship owners, payment, fuel aboard and upkeep — done
Files: packages/shared/src/schemas/campaign.ts, packages/shared/src/index.ts, packages/shared/src/players_view.ts, tests/shared/campaign_status.test.js, tests/shared/players_view.test.js, apps/web/src/campaign/ship_finance.ts, apps/web/src/campaign/refuel.ts, tests/web/ship_finance.test.js.
What changed:
- A vessel status may carry `owners`, `payment` and `fuelTons`. Each is optional. Other status keys still pass through. An owner is a record or the party, plus a typed share count. A payment is a typed amount, a whole-day period, the next due day, and an optional payee. No rule prices a share or derives a payment.
- `shareParts` is the total and each holder's count divided by that total. `paymentWhen` is due, overdue, or today from the campaign day. The clock's fraction stays on that day. `payNow` posts an expense and moves the due day on by `everyDays`. With no payment object, the amount is the Mortgage Cost box when that box has a number. No period is filled in.
- Upkeep sums Mortgage, Maintenance, Life Support, Salary and Running where the box is a positive number, and lists those parts. Purchase Cost and Fuel Tank Cost stay out of that sum.
- Refuel uses `fuelTons` as the level aboard when the field is present, and the typed level otherwise.
- A players view keeps an owner whose holder is the party or a visible record. An owner of a hidden person is dropped. Fuel tons and the payment stay.
Gates: test 2116, 2075 pass, 0 fail, 41 skipped; check clean; typecheck pass; build pass (778 modules, vue-tsc, vite).
Shots: none.
Questions: none.
Needs from others: none.

## AT3b Roll a random passenger — done
Files: apps/web/src/campaign/passengers.ts, tests/web/passengers.test.js.
What changed:
- `rollPassenger` reads the generated wrapper of `rules/mgt2e_random_passenger.json`. That import lives only in `passengers.ts`. `usePassengerTable` is the one function a chosen table later replaces.
- The table's dice field is D66. Two faces are the tens and the units, which is how the entries are numbered (backlog step T3b). A sub-roll uses the entry's `1D` and its ranges. A skill uses the entry's `1D-1`. The printed text is returned as stored. Nothing else is interpreted.
- Every roll from 11 to 66 is in the file once, and `rollPassenger` reaches each of them. A stand-in table replaces the published one for that call, then the published table is put back.
Gates: test 2121, 2079 pass, 1 fail, 41 skipped; check clean; typecheck pass; build pass (778 modules, vue-tsc, vite). The fail is `tests/api/players_logic.test.js`, which Lane B holds. The passenger tests passed.
Shots: none.
Questions: none.
Needs from others: Lane B, `tests/api/players_logic.test.js`. "a member's 65536th live note is refused" expected a player note to be counted by `campaign_journal.author_id`. Not edited.

## AU17 Installable — done
Files: apps/web/public/manifest.webmanifest, apps/web/public/shell_cache.js, apps/web/public/sw.js, apps/web/src/platform/browser.ts, apps/web/src/main.ts, apps/web/index.html, tests/web/shell_cache.test.js.
What changed:
- The manifest is Traveller.voyage, standalone, starting at `/`. Its icon is `/favicon.svg`. The page links it. `background_color` and `theme_color` are `#0b0c10`, the same literal as the existing theme-color meta, which is `--bg-0`. A manifest cannot read a CSS variable.
- The worker stores the shell and the fonts only: `/`, `/index.html`, `/assets/`, `/fonts/`, the two favicons, and the manifest. A GET outside that list goes straight to the network. `/api/`, `/join/` and `/claim/` are never stored. A request that is not GET is not handled, so nothing is written offline.
- A deploy is not a stale shell. Shell files are network-first, and the cache is the offline copy. Vite fingerprints `/assets/`, so a new document asks for new URLs. `skipWaiting` and `clients.claim` let a changed worker take the open page. A font URL is not fingerprinted; a changed font bumps `SHELL_CACHE` (`voyage-shell-v1`). `registerAppShell` lives in `browser.ts`. The worker does not use `window`.
- The test lists the URLs that would be cached and asserts none starts with `/api/`, `/join/` or `/claim/`.
Gates: test 2124, 2081 pass, 1 fail, 42 skipped; check clean; typecheck pass; build pass (778 modules, vue-tsc, vite). The built `dist` has `sw.js`, `shell_cache.js`, `manifest.webmanifest` and `favicon.svg`. The fail is still Lane B's `tests/api/players_logic.test.js`. The shell test passed.
Shots: none. Nothing on screen moved.
Questions: none.
Needs from others: Lane B, `tests/api/players_logic.test.js`. Same failure as AT3b. Not edited.

## AT2b Refuel by starport class and base — done
Files: apps/web/src/campaign/refuel.ts, tests/web/refuel.test.js.
What changed:
- `fuelOffers` reads `fuel.byStarportClass` and `fuel.bases` from the generated space-travel wrapper. A class whose grade is refined or unrefined is one offer at the file's Cr per ton. `none` (E and X) is not an offer.
- A naval base (`N`) or a scout base (`S`) adds refined fuel with `crPerTon` null, so the referee types the price. That offer is only for a party vessel marked naval or scout, and only for the base that mark names. Corsair (`C`) and Way Station (`W`) have `fuel` null, so they add nothing. A class A world with both bases and a naval mark offers the starport's priced refined fuel and the base's unpriced refined fuel.
Gates: test 2143, 2100 pass, 0 fail, 42 skipped; check clean; typecheck pass; build pass (786 modules, vue-tsc, vite).
Shots: none. No screen.
Questions: none.
Needs from others: none.

## LS1 Living systems: the schema, the seed, the facts — done
Files: packages/shared/src/schemas/chatter.ts, packages/shared/src/seed.ts, packages/shared/src/index.ts (exports), apps/web/src/living/facts.ts, apps/web/src/living/chatter.ts, apps/web/src/living/lines.ts, apps/web/src/living/lines/sample.json, tests/shared/chatter_schema.test.js, tests/web/living_facts.test.js, tests/web/living_chatter.test.js.
What changed:
- ChatterWhen and ChatterLine moved from check_sample.mjs. hashString and mulberry32 copied from packages/engines/src/core/rng.js lines 8-23 into seed.ts. Shared still imports only zod.
- systemFacts reads the chart row (UWP through fromEHex as labels.ts has it, PBG's last two digits as belts then gas giants, zone as rowFor decodes it). The tree, when passed, adds mainworldProfile digits, highportOf (null with no profile, false when the profile says N), gasGiantCount and beltCount, moons and other body names, and the lead ship's statusWords state. The chart alone leaves highport null, moons 0 and the party away. An X-boat route is the bare rule: no Allegiance, no Type, no Color, plus Type "Xboat", or a way station base.
- sequenceFor is the weighted shuffle. The visit cursor is per hex and wraps. A new day builds a new sequence and leaves the cursor where it is. clearSequence is navigation away.
- The shipped sample is the draft minus customs-002 ("all weapons and armour are banned beyond the starport fence"). 99 lines. customs-001 and customs-003 stay.
Gates: test 2164, 2121 pass, 0 fail, 42 skipped, 1 todo; check clean; typecheck pass; build pass (792 modules, vue-tsc, vite). The first full run also saw tests/web/import_style.test.js fail on PackagesView `.is-large` while CampaignList was being edited; a second run is the one counted, and that test passed.
Shots: none. No screen.
Questions:
1. Johnny said to drop the customs line that paraphrases the Law Level table. Three customs lines mention weapons: customs-001 (firearms stay aboard, law at least 6), customs-002 (all weapons and armour banned, law at least 9), customs-003 (energy weapons not permitted planetside, law 2 to 5). Recommended: only customs-002 copies the table's "all weapons, all armour". It is the one removed. Keep 001 and 003.
Needs from others: tests/api/players_logic.test.js "a member's 65536th live note is refused" is a todo (`# P2b2 author_id`) and still asserts false. It does not fail the suite. Not this lane's file.

## AT2c Post this month posts the upkeep five — done
Files: apps/web/src/campaign/refuel.ts, tests/web/refuel.test.js, tests/web/vessel_trade.test.js.
What changed:
- `MONTHLY_COST_FIELDS` is `UPKEEP_FIELDS` from ship_finance.ts. One list: Mortgage Cost, Maintenance Cost, Life Support Cost, Salary Cost, Running Cost. Purchase Cost and Fuel Tank Cost are not posted by Post this month.
- The empty ship-sheet hint joins that list, so it now names the five. VesselTrade.vue was not edited. D still owns any other wording on that screen.
Gates: test 2166, 2123 pass, 0 fail, 42 skipped, 1 todo; check clean; typecheck pass; build pass (795 modules, vue-tsc, vite). The vessel trade render test checks the five-name hint. No browser shots.
Shots: none.
Questions: none.
Needs from others: AF2 is waiting on packages/shared/src/schemas/campaign.ts, held by D. The players_logic todo is unchanged and does not fail the run.

## LS1b No customs line states what the law bans — done
Files: apps/web/src/living/lines/sample.json, tests/shared/chatter_schema.test.js.
What changed:
- customs-001 and customs-003 are removed, with customs-002 already gone. 97 lines. Every category is still present (customs has 8). The note cites Johnny 21:10: no line restates a rule.
Gates: test 2172, 2129 pass, 0 fail, 42 skipped, 1 todo; check clean; typecheck pass; build pass (795 modules, vue-tsc, vite).
Shots: none. No screen.
Questions: none.
Needs from others: none for this item. AF2 still waits on D's claim of campaign.ts.

## AF2 fuelMark is referee-only — done
Files: packages/shared/src/schemas/campaign.ts, packages/shared/src/players_view.ts, tests/shared/players_view.test.js.
What changed:
- RecordStatus accepts an optional fuelMark of naval or scout. A missing mark still parses. corsair does not.
- projectStatus skips fuelMark, so the key is absent from a players vessel. fuelTons 31 and payment.amountCr 4800 still pass through, and an owner anchor to a hidden person is still dropped.
Gates: test 2172, 2129 pass, 0 fail, 42 skipped, 1 todo; check clean; typecheck pass; build pass (795 modules, vue-tsc, vite).
Shots: none. No screen.
Questions: none.
Needs from others: none. The players_logic todo is unchanged and does not fail the run.

## AD1 Dice as a tool on the rail — done
Files: apps/web/src/shell/Rail.vue, apps/web/src/design/Icon.vue, apps/web/src/workspace/CampaignPanel.vue, tests/web/rail_dice.test.js.
What changed:
- A Dice item sits on the rail immediately before Marketplace. The icon is a die, the expanded label is Dice, and the hint is "Dice" with no shortcut, so R stays on the palette's Roll dice.
- The button opens a popover beside the rail. It holds the same 1D, 2D, 3D, Boon, and Bane picks. Escape closes it. At 390 px it is a bottom sheet. The result stays the existing dice card.
- The campaign panel no longer mounts that button.
- Signed out, a 2D roll from the popover lands on the card on the map, in orbit, and in the store. The Sign in control leaves Dice on the rail.
Gates: test 2180, 2137 pass, 0 fail, 42 skipped, 1 todo; check clean; typecheck pass; build pass (800 modules, vue-tsc, vite).
Shots: findings/ui_design_shots/sa_ad1_before_1600.png, sa_ad1_before_390.png, sa_ad1_after_1600.png, sa_ad1_after_390.png.
Questions:
1. /account does not mount the rail, so Dice is not on that page. Recommended: leave /account as it is. The tool is on every screen that already has the rail, including while signed out and while the account menu is open.
Needs from others: none. B holds tests/api/players_logic.test.js. Its author_id case is still a todo and the suite fail count is 0.

## XA1 X-boat ripples: the parameters and the graph — done
Files: apps/web/src/news/params.ts, apps/web/src/news/graph.ts, tests/web/news_graph.test.js.
What changed:
- One NewsParams object. Jump and X-boat leg are 148+6D hours (earliest 154, likely 169, latest 184). Station hold is 0. The route rule is bare. Off-network is on, within 2 parsecs, and the wait is null, so the default graph has no off-network edges.
- Nodes come from loaded indexes plus overview cells for sectors that are not loaded. X-boat edges follow the route rule, drop a missing end, drop a leg longer than xboatMaxParsecs, and collapse a duplicate. Off-network pairs use a spatial hash. Each undirected edge is two CSR arcs. Weights are likely days.
- The fixture uses hex 3201 for the cross-sector leg, because two 0101 hexes are 32 parsecs apart. Spinward Marches keeps SYSTEM_PRESENT rows only: 439 nodes, 86 bare edges, under 10 ms. The neighbour scan covers the full bucket ring.
Gates: test 2201, 2159 pass, 0 fail, 42 skipped, 0 todo; check clean. Typecheck failed once on Z's proposals.ts (TS1005, mid-edit) and the retry was clean. Build failed on C's DossierBody.vue(68,8) TS2345: SurfaceStage requires badge. That file was not edited.
Shots: none. No screen.
Questions: none.
Needs from others: C holds apps/web/src/dossier/DossierBody.vue and SurfaceStage.vue. The build stays red there until C's SurfaceStage call passes badge. Z's proposals.ts error had cleared by the typecheck retry.

## XA2 X-boat ripples: the arrival times — done
Files: apps/web/src/news/arrivals.ts, tests/web/news_arrivals.test.js.
What changed:
- newsArrivals runs Dijkstra three times, earliest, likely and latest, from the cited 148+6D hours. An X-boat arc adds the station hold. An off-network arc adds the wait. The stored likely weights are not the days used.
- mode "to" walks a reversed copy of the arcs. On the two-way chain that matches "from". On a one-way arc it does not.
- A step past the horizon stays unreached. The origin stays at day 0. An unknown source returns nulls and does not throw. Wanted sectors are the likely frontier.
- The chain is 0101 to 0104 (three parsecs, X-boat only) then 0104 to 0106 (two parsecs, off-network). A one-parsec X-boat leg would also be an off-network pair, and a hold of 0 hours would lose to that pair. Hold 24 hours moves 0104 to 193/24 and 0106 to that plus 169/24. Wait 48 hours leaves 0104 at 169/24 and moves only 0106.
Gates: the arrival tests are 4/4, and Spinward Marches from 1910 with no horizon finished under 5 ms. Full test 2228, 2185 pass, 1 fail, 42 skipped, 0 todo. check clean. typecheck pass. build pass. The one failure is tests/web/style_class_collision.test.js: class doss-stat is in FactTiles.vue and StatRows.vue. Nine sectors were not timed. Those raw files are not in git. The test header says so.
Shots: none. No screen.
Questions: none.
Needs from others: C holds apps/web/src/dossier/FactTiles.vue. The style-class failure is that file sharing doss-stat with StatRows.vue. Not edited.

## AD2 D66 and a readable result — done
Files: apps/web/src/dice/roll.ts, apps/web/src/dice/command.ts, apps/web/src/dice/DiceButton.vue, apps/web/src/dice/DiceRoller.vue, apps/web/src/shell/Rail.vue, tests/web/dice_roll.test.js, tests/web/rail_dice.test.js.
What changed:
- D66 is a pick beside 1D, 2D and 3D, and a palette command named Roll D66. The first die is the tens digit and the second is the units, assets/dice_conventions.txt lines 29 to 34. The card title is D66. Boon and Bane are off while it is chosen. Roll dice and R stay 2D, or Boon or Bane when that toggle is on.
- The result number uses --font-data with tabular numbers. 1, 7, 11, 17 and 66 were read on the card. 17 is a 3D total. A D66 cannot show a 7.
- A Close dice button sits on the rail popover, including the 390 bottom sheet, and on the result card. Escape still closes the popover. The palette bar keeps its Close control.
Gates: dice and rail tests 8/8. Full test 2232, 2189 pass, 1 fail, 42 skipped, 0 todo. check clean. typecheck pass. Build failed on D's apps/web/src/map/jump_ring.ts(84,17) TS1294. That file was not edited.
Shots: findings/ui_design_shots/sa_ad2_before_1600.png, sa_ad2_before_390.png, sa_ad2_after_1600.png, sa_ad2_after_390.png, sa_ad2_after_1_1600.png, sa_ad2_after_7_1600.png, sa_ad2_after_11_1600.png, sa_ad2_after_66_1600.png, sa_ad2_pop_1600.png, sa_ad2_pop_390.png, sa_ad2_after_edge_1600.png. The before shots force the old display face on the same card. Edge showed 17.
Questions: none.
Needs from others: D holds apps/web/src/map/jump_ring.ts. The build stays red there. tests/web/party_ships_map.test.js failed on a traffic-canvas rule. MapView.vue is D's. Not edited.

## AD3 The rest of the dice conventions — done
Files: apps/web/src/dice/roll.ts, apps/web/src/dice/command.ts, apps/web/src/dice/DiceButton.vue, apps/web/src/dice/DiceRoller.vue, apps/web/src/shell/Rail.vue, tests/web/dice_roll.test.js.
What changed:
- A DM stepper sits with the picks. Minus, the number, plus. It starts at 0 and stops at −6 and +6. It does not roll. The next 1D, 2D, 3D, Boon, or Bane adds it to the dice total. The card reads "2D+3 = 11" and shows 11. assets/dice_conventions.txt lines 14 to 18.
- D3 and 2D3 are picks and palette commands Roll D3 and Roll 2D3. Each face is halved and rounded up: 1–2 is 1, 3–4 is 2, 5–6 is 3. The card shows the face and that value. Lines 19 to 26. 2D3 runs from 2 to 6.
- D66 keeps no DM. The stepper is disabled while D66 is chosen.
- At 390 the sheet wraps the picks and the close control sits in the row, so Boon and Bane stay visible.
Gates: test 2237, 2195 pass, 0 fail, 42 skipped, 0 todo. check clean. typecheck pass. build pass.
Shots: findings/ui_design_shots/sa_ad3_card_1600.png, sa_ad3_card_390.png, sa_ad3_pop_1600.png, sa_ad3_pop_390.png.
Questions: none.
Needs from others: none.

## TS1 Table sets, the shape and the checks — done
Files: packages/shared/src/schemas/table_sets.ts, packages/shared/src/index.ts, apps/web/src/campaign/passengers.ts, tests/shared/table_sets.test.js, tests/web/passengers.test.js.
What changed:
- TableSet is schemaVersion 1, a closed kind, an id, a name of 1 to 80 characters, basedOn, an edition, and tables. The envelope is strict. TABLE_KINDS names randomPassenger (mgt2e_random_passenger) and trade (mgt2e_trade).
- validateTableSet checks the envelope, the sections a roller needs, D66 once from 11 to 66, traffic and modified-price bands with no gap or overlap, the dice strings those files print, prices and percents at 0 or more, integer DMs, and 256 KB. An unknown kind returns "This app has no roller for that table."
- Both official files pass. mail, localBrokers and illegalGoods may be absent. The Exotics row keeps its nulls.
- usePassengerTable(null), or a set that fails its checks, reads the official passenger file. A randomPassenger set that passes is what the roller reads. A bare table still installs, so the one-row stand-in still works.
- Trade-code names are not checked. rules/ has no name-to-code table, and none was invented.
Gates: test 2266, 2224 pass, 0 fail, 42 skipped, 0 todo. check clean. typecheck pass. build pass.
Shots: none. No screen changed.
Questions: The design's name check needs a table that maps printed names to trade codes. Recommended: leave that check out until the table is in rules/.
Needs from others: none.

## TS2 The campaign's chosen table — done
Files: apps/web/src/campaign/table_sets.ts, tests/web/table_sets_resolve.test.js.
What changed:
- setFor(kind, settings, ownSets, officials) returns the set a campaign rolls. A kind left out of settings, or named official:<kind>, is the official set and says nothing. A named set that is in hand, the same kind, and passes validateTableSet is the one returned.
- A named set that is missing, the wrong kind, or fails its checks is the official set, with "This campaign's <kind> table could not be read; using the official table." A kind with no roller returns no set and "This app has no roller for that table."
- The file does not import a rules file. CampaignSettings is unchanged. No route and no migration.
Gates: test 2274, 2232 pass, 0 fail, 42 skipped, 0 todo. check clean. typecheck pass. build pass.
Shots: none. No screen changed.
Questions: none.
Needs from others: none.

## TS3 A roll can take a table — done
Files: apps/web/src/campaign/passengers.ts, tests/web/passengers.test.js.
What changed:
- rollPassenger may take a passenger table as its first argument and use it for that roll only. The installed table stays. A function as the first argument is still the face source, so VesselTrade.vue is unchanged.
Gates: passenger tests 8/8. check clean. typecheck pass. build pass. Full test 2275, 2232 pass, 1 fail, 42 skipped. The fail is tests/web/news_arrivals.test.js: the Spinward Marches walk is budgeted at 5 ms and took 10 ms, then 8 ms, while the suite was busy. The same file passes on its own (the walk inside the 5 ms budget). Not edited.
Shots: none. No screen changed.
Questions: none.
Needs from others: none. The arrivals budget is this lane's file from XA2. It fails only when the whole suite runs together.

## XA2b The arrivals timing check survives a busy suite — done
Files: tests/web/news_arrivals.test.js.
What changed:
- The Spinward Marches walk from 1910 stays the same check. The ceiling is 25 ms. A quiet walk is a few milliseconds. The suite runs this file beside the others, and 5 ms then read 8 ms and 10 ms. The same file passed on its own. 25 ms still fails a walk that takes a large fraction of a second. The day and reach asserts are unchanged.
Gates: test 2275, 2233 pass, 0 fail, 42 skipped, 0 todo. check clean. typecheck and build were already green on this source; no source file changed.
Shots: none.
Questions: none.
Needs from others: none.

## P3 Players, the client store — done
Files: apps/web/src/campaign/membership.ts, store.ts, commit.ts, apps/web/src/workspace/campaigns.ts, packages/shared/src/index.ts, tests/web/membership.test.js. read.ts was not edited.
What changed:
- The open campaign has a role, owner or player, and a playing list from GET /api/me/playing. Opening one of those campaigns pins the map to that campaign's truthVersion and reads the same campaign pages as the owner, parsed as PlayersPage.
- A page that carries visible drops every held record, link and journal entry whose id is not listed. Rows other than the caller's own notes are stored at rev 0. An own note keeps the rev the page sent, and an edit sends that rev as baseRev.
- A player read that answers 403 not_a_member, or 404, clears the rows, sets status to gone, and stops. The sentence for that state is "You are not in this campaign." (NOT_IN_CAMPAIGN). CampaignPanel.vue was not edited. P6 owns the panel.
- While the role is player, commit keeps a players note and drops every other change before it is applied or sent. join, invitePreview, createInvite, revokeInvite, listPlayers, leave and setPerson are the membership calls. A 401 on those calls signs the store out. The join page's sentences stay with P4.
- The players schemas are exported from @voyage/shared. One export carries the value and the type. A second type export was a duplicate identifier.
Gates: test 2320, 2277 pass, 0 fail, 43 skipped, 0 todo. check clean. typecheck pass. build pass. membership.test.js 6/6.
Shots: none. No screen changed.
Questions:
1. The gone sentence lives in workspace/campaigns.ts and the panel does not show it yet. Recommended: P6 mounts NOT_IN_CAMPAIGN when status is gone. This step does not edit CampaignPanel.vue.
Needs from others: none.

## P9 Players, polling — done
Files: apps/web/src/campaign/poll.ts, apps/web/src/platform/browser.ts, tests/web/poll.test.js.
What changed:
- watchCampaignPanel(open) waits 30 seconds, then reads the campaign pages after the seq the store already holds. It runs for an owner and for a player, and only while the panel is open and the tab is visible. Closing the panel, hiding the tab, or a player 403 or 404 stops it. A player 403 or 404 clears the rows and sets status to gone, the same as the first read. An owner 403 stops the timer and leaves the rows. A 401 signs out. Any other failure leaves the rows and tries again on the next wait. No toast.
- The read is merged into the store. Rows already held stay put, so the list is not cleared and rebuilt. A player page that carries visible still drops an id that is no longer listed. A save that has not been sent yet waits for the next wait.
- pageVisible and onPageVisibility live in platform/browser.ts. No screen calls watchCampaignPanel yet. MapView, OrbitView, PanelHost and CampaignPanel were not edited.
Gates: test 2325, 2282 pass, 0 fail, 43 skipped, 0 todo. check clean. typecheck pass. build pass. poll.test.js 5/5.
Shots: none. No screen changed.
Questions:
1. The poll starts only when something calls watchCampaignPanel(true). Recommended: P6 calls it when the campaign panel opens and watchCampaignPanel(false) when it closes.
Needs from others: none.

## P3b Keep authorName on held notes — done
Files: apps/web/src/campaign/store.ts, tests/web/membership.test.js.
What changed:
- A players page entry may carry authorName, the profile handle. holdEntry no longer throws that away. It is kept on the store as campaign.authorNames, keyed by the entry id, and it is not a field of the journal row. A save therefore cannot send it. A page that carries visible drops a handle whose entry id is no longer listed. Clearing the campaign drops the handles.
- Journal screens read campaign.authorNames[entry.id]. CampaignEntry is unchanged, so the name is not part of a commit.
Gates: test 2326, 2283 pass, 0 fail, 43 skipped, 0 todo. check clean. typecheck pass. build pass. membership.test.js 7/7.
Shots: none. No screen changed.
Questions: none.
Needs from others: none.

## P8 Players, the map and the dossier for a player — done
Files: apps/web/src/views/MapView.vue, apps/web/src/workspace/build/BuildStrip.vue, tests/web/player_map.test.js. Dossier files verified, not edited.
What changed:
- A player does not open the Builder's right-click menu and does not get Select hexes. `playerMap` is `campaign.role === 'player'` (`MapView.vue` 2058). `onBuildMenu` returns at 2464. `onMenuKey` returns false at 2495. `boxWants` returns false at 2064, so Shift+drag does not draw a box. The build-acts watch filters out `build-select` at 2562 and sets `build.selecting` false at 2572. The strip binding is `:select-hexes="campaign.role !== 'player'"` at 3116.
- `buildOffered` at 1452 is unchanged, so the rail Build button still shows. P6 locks that button.
- `BuildStrip` defaults `selectHexes` to true. Vue treats a missing boolean as false, and without the default the button would vanish for a referee. A player hides the button, drops the first-step "Select hexes" note, and `takeStep` does not turn the tool on.
- Party ships, marks and the campaign layer already come from the store: `snapshotFromStore` calls `partyShipMarks` and `vesselsOnMap` on `campaign.records`. No new map data.
- The dossier already uses the store. `RecordsHere` says "Your records here" and calls `recordsHere(campaign.records)`. `JournalHere` says "Your journal here" and calls `entriesAtHex`. `DossierPanel` `recordCounts` reads `campaign.records`. There is no "In your campaign" string.
- A hidden place has no `locationLabel`. `placeWords` then returns the hex alone (`places.ts`). `placeLine` does the same, already asserted as "Spinward Marches 1910". The map marker is the hex key and the ship name.
Gates: test 2337, 2294 pass, 0 fail, 43 skipped, 0 todo. check clean. typecheck pass. build pass. player_map.test.js 3/3, including an SSR render of the strip.
Shots: none. The two-account browser pass was not run. No second session is on this machine, and a private wrangler would sit beside other lanes. The strip render is the SSR test: the referee sees Select hexes, the player does not.
Questions:
1. The other palette build acts, including G to generate, still register for a player while Build is on. Recommended: leave them. P6 locks the rail button with "Build is the referee's".
Needs from others: none.

## TS2b A campaign can store its chosen table — done
Files: packages/shared/src/schemas/campaign.ts, tests/shared/table_sets_settings.test.js.
What changed:
- `CampaignSettings` gains optional `tableSets`, a record of kind to set id. An old row with no key still parses. A stored map round-trips. A value that is not a string is refused.
- `playersView` already copies the settings fields it does not rewrite, so the projection carries `tableSets` with no change to `players_view.ts`. A player sees the chosen set.
- The trade-code name check is unchanged. It waits for a name-to-code table in `rules/`.
Gates: test 2340, 2297 pass, 0 fail, 43 skipped, 0 todo. check clean. typecheck pass. build pass. table_sets_settings.test.js 3/3.
Shots: none. No screen changed.
Questions: none.
Needs from others: none.

## AU6 The timeline that fills itself — done
Files: apps/web/src/workspace/timeline.ts, tests/web/timeline_legs.test.js. No screen. D mounts it (DU6).
What changed:
- `campaignTimeline` is the campaign list. It keeps dated journal entries and dated records, and adds each vessel's legs. A jump is Jump entry at departure and Jump exit at arrival. Any other leg is Departure and, when arrival is later, Arrival. A docked or orbit stay on one day count is one Arrival. Days are grouped newest first, as the existing list does.
- With a campaign date and a party, the first row on Today is where the party is. A place with no name is the hex alone (`Spinward Marches 1910` in the test).
- `buildTimeline` without `includeLegs` is unchanged, so the record page's list still leaves legs off.
- A ship filter keeps that ship's leg rows and the party row when it is that ship. A record-type filter still drops legs.
Gates: timeline_legs.test.js 2/2 and timeline_list.test.js 5/5. check clean. Web build passed (vue-tsc included). The full suite is 2352 tests, 2308 pass, 1 fail, 43 skipped. The failure is `tests/web/rail_build_pitch.test.js`, which still expects the old Build click in `Rail.vue`. Lane D holds that file and has changed the click for the player lock. `npm run typecheck` fails in Lane B's `apps/api/src/mcp/server.ts`, `routes/tokens.ts`, and `universe/proposals.ts`. Those files are not this item.
Shots: none. No screen changed.
Questions: none.
Needs from others: D's `Rail.vue` (the rail pitch test). B's typecheck in the three files above.

## AU37 Undo where delete with Restore is not enough — proposal
Files: none. No code.
What this proposes:
- A moved record, a changed date, and an edited track leg get one Undo on the existing toast. Recommended: yes. It lasts 10 seconds, as U37 writes. Undo sends the previous anchor, the previous date, or the previous track, through the change that already saves those fields. One edit only. A second edit replaces the toast, and Undo returns the value from just before that second edit. There is no stack and no Ctrl+Z. A change the store refuses does not offer Undo. A player cannot make these edits, so a player sees no Undo for them.
- Delete already has Restore. This does not add a second way to undo a delete.
Gates: none. No code until Johnny says yes.
Shots: none.
Questions:
1. Should this one-step Undo be built? Recommended: yes. One toast, the latest edit only, no undo stack.
Needs from others: none.
