# Lane A — a new account's map is "My map"; a sector or subsector address opens its pane

Issued 2026-10-13 by the orchestrator, on Johnny's two answers of today. You may be a
fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md` (the "Engine 1.2.0" notice too), `directives/lanes/A.md`,
`directives/reports/done/d_first_run_fixes.md` (its "Needs from others" and questions
1 and 3), finding 12 in `findings/first_run_review.md`, then this file. No git but
read-only, no deploy, no `rules/`, no Traveller rule from memory.

Your `a_sector_labels` report is accepted.

## Do, in this order

1. **A new account's map is named "My map"** (Johnny: yes). The first universe the
   app makes for an account is created in `apps/web/src/campaign/store.ts` (line 244,
   `postCampaign('My campaign')`; the comment at line 213). Make it "My map". An
   existing universe keeps the name it has: no rename, no migration. Update
   `tests/web/campaign_store.test.js`.
   Do **not** change `freshName` in `workspace/campaigns.ts` or the placeholder in
   `workspace/CampaignList.vue` (Lane D's files, and a second one made from the
   Campaign list is made as a campaign). List in the report every other place that
   still says "My campaign" to a person, with file and line, for Lane D.
2. **A sector's address and a subsector's address open their pane** (Johnny: yes;
   finding 12). Today `/s/Spinward_Marches` and `/s/Spinward_Marches/sub/C` open the
   map only; both need `?panel=dossier`. `addressPane` in
   `apps/web/src/shell/pane.ts` (line 138, lent to you for this) answers the open
   dossier pane for those two views on a bare address. A `panel` query still wins. A
   hex address is unchanged. Every caller of `addressPane` (`router.ts`,
   `dossier/DossierPanel.vue`, `characters/screens/CharactersPanel.vue`) keeps
   working: read each, edit none, and say what each does with the new answer.
3. **Three things that must still be true afterwards; test each.**
   - Closing the pane with the X on such an address closes it and it stays closed
     (no redirect loop that opens it again). Say how the closed state is written in
     the address.
   - **A first visit opens no pane.** Lane D's first visit
     (`workspace/first_visit.ts`, `views/MapView.vue`) aims the camera at the Regina
     subsector. If it does that by going to `/s/Spinward_Marches/sub/C`, your change
     would open a pane on every first visit: find out which it is, do not edit
     Lane D's files, and if it is the address, write the exact line Lane D must
     change under "Needs from others" and stop item 2 before the browser pass.
   - Clear and Esc in Build (Lane D's `build/clear.ts`) return to "that address with
     the pane shut" when a selection was started inside a sector's or subsector's
     pane. Say whether that still holds.

## Owned files (this pass)

`apps/web/src/campaign/store.ts`, `apps/web/src/shell/pane.ts` (`addressPane` and
what it calls), their tests in `tests/web/`, shots `ka10_*`,
`directives/reports/a_map_name_address_pane.md`. Not yours: `views/MapView.vue`,
`workspace/` (Lane D, mid-step there now), `router.ts`, `dossier/DossierPanel.vue`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Lane Z is changing engine output this turn: a red engine or
parity test goes under "Needs from others". Fourth gate: a browser pass on your own
port and Vite cache, stopped after: the two addresses bare, with `?panel=dossier`,
closed with the X and reloaded, and a hex address, at column, half, full and 520 px;
then a first visit with empty storage.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_map_name_address_pane.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

done: a new account is created as "My map", and a bare sector or subsector address opens the dossier while panel=closed stays shut. A first visit aims the camera from FIRST_PLACE and stays on `/`. next: the four gates, then the browser pass.
done: tests 1610 pass and 2 fail outside this pass, check clean, typecheck clean, build index 179.75 kB. next: the browser pass.
done: 29 shots on port 5197. Bare addresses open the dossier, panel=closed stays shut after reload, a hex is unchanged, and a first visit opens no pane. Vite stopped. next: the report.
done: directives/reports/a_map_name_address_pane.md written. next: stop.

