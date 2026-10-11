# D marketplace_screens report
Prompt: prompts/d_marketplace_screens.md
Status: done

Design: findings/marketplace_screens_design.md, including the strings table. Mockups `km_*`; built shots `km_built_*`; pass scripts findings/builder_pass_src/k1.mjs and k2.mjs.

## What was built
1. **Publish, from Build.**
   - "Publish selection…" is in the palette as a Build command, and in the Build bar's More menu.
   - The More item runs the palette command, which knows the selection. A sector or a subsector of your own shows the sector bar, which has no More menu, so the palette is the way in there.
   - The form opens in the Build pane. It holds a summary, the package (a new one, or a new version of yours), title, kind, description, tags, the records on the hexes (with checkboxes, all on), the snapshot and public sentence, and the limits in words.
   - It sends only hexes that hold something.
2. **Progress and result.**
   - Publish creates the package, then sends the version, then opens `/packages/:id?version=N`. That page watches the version through `store.watch`, so a reload watches again from the address.
   - A refused request stays in the form in the server's words, and the form keeps what was typed.
   - A failed version is said on the package page, with its reason.
3. **My packages.**
   - The list shows the eight listing fields, with an empty state and placeholder cards while loading. Each package has a page with its versions.
   - Registry line, at the end of `apps/web/src/shell/registry.ts`, with its import at the top:
     ```ts
     import { offerMyPackages } from '../workspace/market/command.ts';
     offerMyPackages(registerCommand);
     ```
     It registers "My packages" only while someone is signed in.
   - **Route lines for `apps/web/src/router.ts`** (not mine), to add to `routes`:
     ```ts
     { path: '/packages', name: 'packages', component: () => import('./workspace/market/PackagesView.vue') },
     { path: '/packages/:packageId', name: 'package', component: () => import('./workspace/market/PackagesView.vue') },
     ```
     Until they are there, "My packages" and the end of a publish go to an address with no view.
4. **Signed out.** Neither command is in the palette (checked on the map). `/packages` shows the sign-in card.

## Changed files
- apps/web/src/workspace/market/ (new):
  - market.ts: limits, words, what goes in, form state, the publish act, store holder;
  - PublishForm.vue;
  - PackagesView.vue;
  - command.ts;
  - fake_store.ts (not imported by the app).
- apps/web/src/workspace/build/commands.ts: `build-publish`.
- apps/web/src/workspace/build/BuildBar.vue: the More menu item.
- apps/web/src/workspace/build/BuildPane.vue: shows the form while it is open (many mode). The prompt lists `commands.ts` and `BuildBar.vue` for the command; BuildPane is the Build pane the form opens in.
- apps/web/src/shell/registry.ts: the import line and the call line above.
- tests/web/market_screens.test.js (new, 7 tests, against the fake).
- findings/marketplace_screens_design.md; findings/builder_mockup_src/buildm.mjs and indexm.html.

## How the fake store is wired, dev-only
- Nothing in the app imports `fake_store.ts`, so the production build has none of it.
- The pass script runs this in the dev server's page:
  1. imports `fake_store.ts`;
  2. hands it to `useMarketStore`;
  3. adds the two routes to the app's own router (`__vue_app__.config.globalProperties.$router`);
  4. re-resolves the address.
- For the reload check, the fake is given the page's storage, so its packages survive.

## Gates
npm test:      FAIL, 1 of 1379, not from this pass. `tests/web/build_hand.test.js:220` expects the star fields without `s1.classText`. Lane B's work in progress (`packages/generation/src/hand.ts`, modified, prompts/b_hand_followups.md "star class") now adds that field. I left the expectation alone until B's shape is final; I update it in prompts/d_hand_designer_3.md. Everything else: pass 1363, skipped 15.
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass (index chunk 267.24 kB; pin 450 kB)
fourth gate:   pass. Own API (8797), Vite (5197) and Edge (9397), all stopped after; ports free.

## Browser pass (fake store)
- **My packages, empty:** "You have not published a package yet." with how to publish (`km_built_empty`).
- **Keyboard only, a new package:**
  - On the map, the palette (typed "Publish selection", then Enter) opened the form on Spinward Marches subsector F.
  - Focus started on Package. Tab went to Title, Kind (already "subsector"), Description and Tags. Enter in Tags published.
  - The page opened at `?version=1`: "Waiting to publish version 1…", then "Published version 1." (`km_built_publishing`, `km_built_published`).
- **A second version, with a reload while it published:**
  - The form offered "Publish version 2". After a reload, the page still said "Waiting to publish version 2", then "Published version 2." (`km_built_version`, `km_built_reload_done`).
- **A refusal:** "This package publishes from a different universe." appeared in the form, and the title stayed typed (`km_built_refused`).
- **A failed version:** "Version 1 failed: A hex is not in this universe. To try again, go back to Build and select Publish selection." (`km_built_failed`).
- **The limits:**
  - An empty title with 33 tags gave "Enter a title." and "Use 32 tags or fewer." once Publish was tried.
  - A 90-character title stopped at 80 (`km_built_limits`).
- **Records:** subsector C (Regina) listed "Bay 4 Drydock" and "Far Margin". Clearing one changed the summary to "1 record" (`km_built_records`).
- **Five packages:** the eight fields on each card, at 1600 and 520 px (`km_built_list`, `km_built_list_520`).
- **Spans:** the form at column, half, full and 520 px (`km_built_form_*`).
- **Signed out:** the sign-in card, and neither command in the palette (`km_built_signed_out`).
- **Loading:** the placeholder cards show on a cold load before the first answer. Once packages are in memory, a later visit shows them at once and refreshes in place. The deliberately slow load in k2 hit the warm path, so the cold placeholders are not in a shot.
- Console: no error.

## Contract published
none

## Needs from others
- **Johnny / orchestrator:** the two route lines above, in `router.ts`.
- **Orchestrator:** publishing one filled hex alone is not offered.
  - For one system the pane shows the dossier, and the form can only appear in `DossierPanel.vue`, a shared file.
  - The line that would allow it, before `<SystemEditor v-else-if="drafting" …>` in DossierPanel.vue:
    ```vue
    <PublishForm v-else-if="marketUi.open" :keys="[hexKey]" />
    ```
    with `build-publish` then allowing one key.
- **Lane E:** the account menu entry goes to `/packages` (`MY_PACKAGES_PATH` in `workspace/market/command.ts`).
- **Lane A:** nothing. The seam had every call the screens needed.

## Questions for Johnny
1. Should a package be publishable from a single system (one hex)? Suggested: yes, through the one DossierPanel line above, in a pass that holds that file. Today it takes two or more hexes, a subsector or a sector.
2. Should a chart system that you removed from your map go into a package (as a deleted hex)? Suggested: yes, as built. The contract's manifest has a `deleted` hex for exactly this. Otherwise the removal would be lost on install.
