Found: Progress was empty, and store.ts and pane.ts were clean.
Finished: a new account is created as "My map", and a bare sector or subsector address opens the dossier. Closing writes panel=closed, and that stays shut.
Backed out: nothing.

# Lane A a_map_name_address_pane report
Prompt: prompts/a_map_name_address_pane.md
Status: done

## Changed files
- apps/web/src/campaign/store.ts: the first universe an account gets is created as "My map". An existing universe is not renamed.
- apps/web/src/shell/pane.ts: `dossierDefault` is true for a sector and a subsector, so a bare address opens the dossier. A panel query still wins, including `panel=closed`. A hex address is unchanged. `campaignRedirect` still leaves `panel=dossier` on those two paths as written, and it does not strip `panel=closed`.
- tests/web/campaign_store.test.js: the created name is "My map".
- tests/web/pane.test.js: bare open, query wins, close stays shut, first visit stays on `/`, and Clear still shuts the pane.
- findings/ka10_*.png: the two addresses bare, with `?panel=dossier`, closed with the X and reloaded, and a hex address, at column, half, full and 520 px, plus `ka10_first_visit.png`.

Closing writes `panel=closed`. The X goes through `atPane` with kind `shut`, and `paneChanges` sets that key. `campaignRedirect` returns null for it, so a reload does not open the pane again.

A first visit does not go to `/s/Spinward_Marches/sub/C`. `MapView.vue` aims the camera with `targetFor({ path: FIRST_PLACE })` and leaves the route at `/`. That home address opens no pane. The browser pass with empty storage landed on `/?x=-108.500&y=-40.703&z=75.307` with the pane shut and the Regina subsector in view.

Clear and Esc still return to that address with the pane shut. `build/clear.ts` reads `addressPane(...).view` and, for a sector or a subsector, calls `atPane` with kind `shut`. The new default does not change that write.

`router.ts` `preloadPane` reads `.pane`. A bare sector or subsector is now `dossier`, so it preloads `DossierPanel.vue`. A `panel` query still selects the characters pane or a campaign pane.

`dossier/DossierPanel.vue` reads `.view` only, for the sector or subsector scope. The view kind is unchanged. The pane shows because the pane kind is now dossier. With Build off, the body is the existing sentence for that sector or subsector.

`characters/screens/CharactersPanel.vue` reads `.pane` and uses it only when the kind is `characters`. A bare sector or subsector is dossier, so `characterId` stays null. `panel=characters` still wins.

These still say "My campaign" to a person, and they are Lane D's:
- `apps/web/src/workspace/campaigns.ts` line 37, the default of `freshName` (the comment is line 36). AccountMenu fills a new universe's draft from it.
- `apps/web/src/workspace/CampaignList.vue` line 206, the name field placeholder.

## Gates
npm test:      fail. 1639 tests, 1610 pass, 2 fail, 27 skipped. Both failures are outside this pass (see Needs from others).
npm run check: pass
typecheck:     pass
build:         pass. `dist/assets/index-ZOUNurMl.js` 179.75 kB, gzip 60.68 kB
fourth gate:   pass. Own Vite at http://127.0.0.1:5197/, cache under the temp pane directory, stopped after. No page errors. Bare sector and subsector opened the dossier (card 520, 756, 1512, and 432 px). `?panel=dossier` stayed on that query and opened the same pane. The X wrote `panel=closed`; after reload the pane stayed shut at all four widths. `/s/Spinward_Marches/1910` still opened the dossier. A first visit with empty storage opened no pane.

## Contract published
none

## Needs from others
- Lane Z: `tests/golden/esm.test.js` "esm profile_regina matches legacy fixture" is red. Engine output on this tree does not match the fixture. Not touched.
- Lane C: `tests/web/surface_enhanced_map.test.js` "the sea of a body is decided by seas.ts" is red. The sea result now includes `boilFromLatDeg` (40.51048127080723 for the Ethane case). Not touched.
- Lane D: the two "My campaign" strings above. A second universe made from the Campaign list is still named as a campaign.

## Questions for Johnny
none
