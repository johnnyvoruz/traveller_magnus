# Lane E — the way in to "My packages": two routes and the account-menu entry

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your crumb and avatar report is accepted, with all five of your choices kept
as built (Johnny).

## Goal

Lane D built the marketplace stub's screens (`apps/web/src/workspace/market/`): a
publish form and "My packages". They have no address yet, so "My packages" and the end
of a publish go nowhere. Give them their routes and their entry in the account menu.

## Read first

`directives/reports/done/d_marketplace_screens.md` (what D built, the exact route
lines, `MY_PACKAGES_PATH` in `workspace/market/command.ts`),
`findings/marketplace_screens_design.md`, and `directives/contracts/b_marketplace.md`
for what the stub is (a referee's own packages only; no browse, no install).

## What to build

1. **Routes.** In `apps/web/src/router.ts` (lent to you for these two lines only), add
   to `routes`, beside the other lazily loaded views:
   ```ts
   { path: '/packages', name: 'packages', component: () => import('./workspace/market/PackagesView.vue') },
   { path: '/packages/:packageId', name: 'package', component: () => import('./workspace/market/PackagesView.vue') },
   ```
   The manifesto's check: every route has a test that renders it from a cold load. Add
   those two tests where the other routes have theirs (find the existing pattern;
   signed out shows the sign-in card).
2. **The account menu.** In `apps/web/src/workspace/AccountMenu.vue` (lent to you for
   this), one item "My packages" that goes to `MY_PACKAGES_PATH`, shown only while
   someone is signed in, in the menu's existing item pattern, reachable by keyboard
   like its neighbours. No badge, no count.
3. **The real store in the app.** D's views take their store through `useMarketStore`
   and the app wires none. Read `findings/marketplace_client_ready.md` and
   `apps/web/src/marketplace/screen.ts` (Lane A's `asMarketplaceStore(openMarketplace(...))`)
   and wire the real client where the app starts its other stores (find how
   `builder/` is wired and follow it; name the file and lines in the report). The
   server is not built yet: with the real client the list will fail to load. Make sure
   that shows the screens' own plain sentence and not a blank page or a thrown error;
   if the screens have no such state, do not add one in `workspace/market/` (Lane D's):
   report the line.
4. Nothing else. No browse, no install, no "coming soon".

## Copy

"My packages", sentence case, as D's screens name it. Any other sentence follows the
Google developer documentation style guide.

## Owned files (this pass)

Lent: `apps/web/src/router.ts` (the two lines), `apps/web/src/workspace/AccountMenu.vue`
(one item), and the one start-up file where stores are wired (name it). Yours: the
tests for these in `tests/web/`, `directives/reports/e_packages_entry.md`. Not yours:
`workspace/market/`, `marketplace/`, `workspace/build/` (Lane D is working there),
`apps/api`, `packages/`, the three shared files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (if
`tests/web/build_hand.test.js` line 220 is still red, that is Lane D's fix in flight:
name it and go on). Fourth gate: a browser pass on your own API port and state
directory and your own Vite, both stopped after: signed in, open the account menu by
keyboard, choose My packages, see the list state; reload on `/packages`; open
`/packages/anything`; signed out on `/packages`; the browser's Back from each. Shots
`findings/ui_design_shots/km2_*`.

## Stop rule

Stop when the three items work and the report is written, or blocked on something in
another lane's files, named with its line.

Write `directives/reports/e_packages_entry.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: two routes in router.ts and the signed-in "My packages" menuitem. next: cold-load tests, then the gates.
done: tests/web/packages_entry.test.js, 4 pass. next: npm test, check, typecheck, build.
done: gates and the browser pass. The list shows the empty sentence because GET /api/packages returned 200. next: write the report.
done: directives/reports/e_packages_entry.md. next: stop.
