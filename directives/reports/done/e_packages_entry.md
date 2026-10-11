# E packages entry report
Prompt: prompts/e_packages_entry.md
Status: done

## Changed files
- apps/web/src/router.ts: two lazy routes, `/packages` (`packages`) and `/packages/:packageId` (`package`), both `PackagesView.vue`. Nothing else in that file.
- apps/web/src/workspace/AccountMenu.vue: one signed-in menuitem, "My packages", store icon, no badge and no count. It pushes `MY_PACKAGES_PATH` (`/packages`) and closes the menu. Arrow keys reach it with the other menuitems. It stays in the menu while the campaign is still loading. Characters and the party stay behind `ready`.
- tests/web/packages_entry.test.js: the two route lines, a cold server render of each route, and the menu item present while signed in and absent while signed out.
- No start-up file edited. The real client is already opened where the screen asks, `apps/web/src/workspace/market/market.ts` lines 43-50 (`marketStore` calls `asMarketplaceStore(openMarketplace(...))`). That is the same moment the builder opens: `apps/web/src/builder/bind.ts` lines 65-67 run when the map or the orbit view calls `bindBuilder`, not from `main.ts`. A second opener in `App.vue` would copy the adapter that `market.ts` already owns. `workspace/market/` is Lane D's, so it was not edited.

## Gates
npm test:      fail (1377 pass, 3 fail, 16 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
fourth gate:   pass

`tests/web/build_hand.test.js` line 220 did not fail. The three failures are Lane B's `tests/api/packages_job.test.js`, at the `open()` helper line 93 (`FOREIGN KEY constraint failed`) for the tests at lines 157, 202, and 251. This pass did not edit `tests/api` or `apps/api`.

The cold server render shows the loading shell ("My packages", "Loading your packages" on the list). The sign-in card is painted in `onMounted` after `loadSession` (`PackagesView.vue` lines 94-97 and 117-120), so a server render does not show it. The browser pass did.

Browser, own wrangler on 8843 (persist `.tmp/e-packages-8843`) and own Vite on 5197 (cache `.tmp/e-packages-vite`), both stopped. Isolated headless Chrome. Signed in, Tab to the account button, Enter, ArrowDown to My packages, Enter.

- List: "You have not published a package yet." `GET /api/packages` returned 200 on this port, so the screen used its empty sentence (`PackagesView.vue` lines 126-129), not a failure sentence.
- Reload of `/packages`: the same sentence.
- `/packages/anything`: "No such package." That is the server's message, shown by the screen's catch (`PackagesView.vue` lines 64-66 and 143). The page did not go blank and did not throw.
- Signed out on `/packages`: "Sign in to publish and to see your packages." and a Sign in button.
- Back from the package returned to `/packages`. Back from the list returned to `/`. Back from the signed-out page returned to `/`.

Shots: `findings/ui_design_shots/km2_menu.png`, `km2_list.png`, `km2_list_narrow.png`, `km2_reload.png`, `km2_package.png`, `km2_signed_out.png`. The narrow list keeps the title, the Map link, and the empty sentence inside the viewport.

The menu shot also shows the native file control ("Choose File"). The import input in `AccountMenu.vue` uses `vplan-file`, and that class is styled only in `VesselPlan.vue`. It was already in the menu. This pass did not change it. With no released truth, the status line "TruthClient: no released truth version" sits over the bottom of the menu.

## Contract published
none

## Needs from others
- Lane B: `tests/api/packages_job.test.js` `open()` line 93 fails the suite with `FOREIGN KEY constraint failed`. The list route on this port already answers 200.

## Questions for Johnny
1. Leave the marketplace client opened in `market.ts` lines 43-50, when the screen first asks? Suggested answer: yes. That matches the builder, which opens from the view (`bind.ts` lines 65-67), and a second opener would copy the adapter.
2. Hide the account menu's import file control? Suggested answer: yes, on a later menu pass. Give `AccountMenu.vue` the same off-screen rule `VesselPlan.vue` uses for `.vplan-file`. Not in this pass: the prompt was one item.
