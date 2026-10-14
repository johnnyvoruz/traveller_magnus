# Lane A — sector names that overprint (review finding 11)

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
finding 11 in `findings/first_run_review.md` (shots `kb16_landing.png`,
`kb16_strip_zoom.png`), then this file. No git but read-only, no deploy, no `rules/`,
no Traveller rule from memory.

Your `a_public_games_feed` report is accepted. Lane D adds your `MapView.vue` lines;
Lane B is changing the feed so it leaves out the caller's own games (your name-match
drop stays; it becomes a second guard).

## Do

1. **A sector label is never wider than its sector.** In the one-sector-wide column
   north of the charted space the sector names overprint each other
   ("Tsebntsiatldants"). In the map's label pass (`map/MapRenderer.ts`, lent to you
   for this; name the function in the report): when a sector's name at the current
   zoom is wider than the sector's drawn width less a margin, first shrink it down to
   a floor size, and below the floor do not draw it. Say the floor and the margin and
   why. No truncation with dots. The same rule for subsector names if they share the
   pass.
2. **Measure it.** A frame at the first zoom and at two zooms in over that column:
   label count drawn and skipped, and the frame time against today's, on a quiet
   run. The rule must add no text measuring per frame that is not cached.
3. **Do not change the first view's framing.** Lane D is moving the first visit to
   the Spinward Marches (`d_first_run_fixes.md`); that is the other half of this
   finding.

## Owned files (this pass)

`apps/web/src/map/MapRenderer.ts` (the label pass only), `apps/web/src/map/glyphs.ts`,
`tests/web/` for them, shots `ka9_*` in `findings/`,
`directives/reports/a_sector_labels.md`. Not yours: `views/MapView.vue` (Lane D).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Fourth gate: a browser pass on your own port and Vite cache,
stopped after: the north column at three zooms, and the Spinward Marches at the same
three to show nothing there changed, each as a shot.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_sector_labels.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the label pass already scales to 84% and drops below 9 px, and the working tree's other edits in these files are the accepted public-games diamonds. next: measure the north column before changing the pass.
done: at z=4 the live label "Tsebntsiatldlants" is 136 px on a 128 px sector because the first frame cached the fallback width (133 px) and later drew Orbitron (170 px). next: remeasure once the display font has loaded, and keep the 9 px floor.
done: settleNameFont remeasures once Orbitron is ready, and the same label is now 106 px inside the 128 px sector. next: the six shots and the four gates.
done: six shots, tests 1577 pass and 0 fail, check clean, typecheck clean, build index 176.38 kB. next: the report.
done: directives/reports/a_sector_labels.md written. next: stop.

