Found: zoomed-out dots come only from the published overview string. The server has no per-sector string of which hexes hold a system.
Finished: nothing drawn. The route Lane B would add is in `findings/map_own_dots.md`.
Backed out: nothing.

# Lane A own dots report
Prompt: prompts/a_own_dots.md
Status: blocked

## Changed files
- findings/map_own_dots.md: why the three gaps are in `overviewPoints`, and the route wanted from Lane B.

No renderer change. `GET /:id/hexes` is a required `sector`, pages of 100 full rows (`BuilderHex`, including the chart entry). `GET /:id/sectors` is `RefereeSector`: id, slot, name, sixteen subsector names, rev, deleted. Neither is a 1280-character cell string.

Twenty sectors the referee has touched, if each held one subsector of 80 systems, is 20 requests and about 1,600 full rows. A full sector is 1,280 rows and 13 pages. That is the paging this prompt says not to do.

The three gaps, from `apps/web/src/map/MapRenderer.ts`: `setChart` copies `overview.sectors[].cells`, and `overviewPoints` draws a dot for every character that is not `.`. A generated or hand-made system is not in that string, so it has no dot until the hex tier. A removed chart system is still in the string, so its dot stays. An own sector is absent from the overview, `cells` is null, and the loop skips it. This was read from the renderer. It was not clicked through in a browser, because there is no route to draw from yet.

## Gates
npm test: not run for this pass. The form-followups pass in the same session reported 1423 passed, 1 failed, 17 skipped. The failure is `tests/web/surface_hybrid.test.js`, Lane C.
npm run check: not re-run. Nothing under `apps/` or `packages/` changed after the form-followups build.
typecheck: not re-run.
fourth gate: not run. No dots were added, so there are no `ka_dots_*` shots.

## Contract published
none

## Needs from others
- Lane B: `GET /api/universes/:id/hexes/:sector/dots` as written in `findings/map_own_dots.md`. Answer `{ cells }` length 1280. `.` is empty. Any other character is a system. Apply the referee's rows on top of the chart string. Own sectors are `.` except where a row holds a system.
- Lane D: none until that route exists. The map then caches one string per sector and refetches a sector when one of its hexes changes. Same dot, same colour, same size as a charted system.

## Questions for Johnny
1. Should a system the referee added use the same dot as a charted one? Suggested answer: yes. On the zoomed-out map a system is a system. Difference, if any, belongs at the hex tier.
