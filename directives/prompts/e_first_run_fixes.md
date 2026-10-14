# Lane E — the first ten minutes: search, the rail, the journal and the timeline

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
`findings/first_run_review.md` (Lane D's first-visit review of the live site,
accepted), then this file. No git but read-only, no deploy, no `rules/`, no Traveller
rule from memory. Your Player Pack went out in version 1.1.11 (`ef92359`).

## Do, in this order (numbers are the review's findings; read each in full there)

1. **Finding 4: search lands on the dossier but not on the map, and ranks Regiimaa
   above Regina** (`components/OmniBox.vue`, lent, and whatever ranks its results:
   name the file; if the ranking is on the server, write what Lane B must change and
   do the browser part). Choosing a world moves the map to it and opens it. An exact
   name match ranks first; then names that start with the text; then the rest. Say
   the rule in the report, with a test over "Regina", "reg", "mora", a hex number
   and a sector name.
2. **Finding 19: the search box shows nothing when focused.** One line of help, or
   recent places, in the house pattern: say which you built and why.
3. **Finding 9: switched-off Campaign and Build explain themselves only on hover**
   (`shell/Rail.vue`, lent). A signed-out person who chooses one sees why it is off
   and how to turn it on (the sign-in card already opens: check that the card says
   what the item gives them). Keyboard and touch, not only a tooltip.
4. **Finding 13: the journal entry looks unfinished.** Yours
   (`workspace/journal/`). Bring it to the standard of the record page: spacing,
   empty states, the header, the image strip you just built.
5. **Finding 14: the timeline's advice loops** (`workspace/timeline.ts`,
   `TimelineList.vue`). The empty and no-date states each say one true next step
   that works when followed.
6. **The Player Pack button:** if the review pass above shows it sits oddly on the
   journal list, say so; do not move it into Lane D's panel.

Not yours this pass (Lane D has them): findings 1, 5, 6, 7, 8, 12, 16.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

`apps/web/src/workspace/journal/`, `apps/web/src/workspace/timeline.ts`,
`TimelineList.vue`, lent: `apps/web/src/components/OmniBox.vue`,
`apps/web/src/shell/Rail.vue`. Tests in `tests/web/`, shots `ke8_*`,
`directives/reports/e_first_run_fixes.md`. Not yours: `views/MapView.vue`,
`workspace/build/`, `workspace/passkey/` (Lane D), `map/`, `account/` (Lane A),
`apps/api`, `packages/` (Lane B). If moving the map to a search result needs a line
in `MapView.vue`, write the line in your report and stop that part.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Fourth gate: a browser pass on your own ports and Vite cache,
stopped after: each fix by pointer and by keyboard, signed out and signed in, at
column, half, full and 520 px.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/e_first_run_fixes.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: search ranks exact, then prefix, then the rest, with the Spinward Marches ahead of a tie, and choosing a place drops the camera query. next: rail, journal, timeline, gates.
done: rail shows the lock sentence on focus and when expanded; journal heading, cover, Saved, and Player Pack; timeline advice. next: gates and the browser pass.
done: tests, check, typecheck, and build passed. Browser on 5195 covered search and the signed-out rail. next: the report.

