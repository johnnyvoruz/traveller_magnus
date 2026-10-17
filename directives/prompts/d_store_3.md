# Lane D — records-only screens, the featured row, your own ships' routes

Issued 2026-10-16 by the orchestrator. **Start only after Johnny pushes 1.2.4** (your `d_store_2`
pass is in it). You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/contracts/b_marketplace.md` (section "Records-only packages (F18)"), your report
`directives/reports/done/d_store_2.md`, then this file. No git but read-only, no deploy, no `rules/`.

## Johnny's words

- 2026-10-15: "I see that there's always one hex, can we just have campaign elements that don't
  need a hex attached?" (Z built the server; this pass is the screens.)
- 2026-10-16, to your question 2: yes, draw your own ships' routes the same way.
- 2026-10-16, to your questions 1 and 3: yes (the track stays at 70%; tag links stay local).

## Do

### 1. Records-only packages (contract F18; every sentence is there)
1. **Publish from records:** an entry from the campaign's records list that publishes the chosen
   records with no hex selection (`hexKeys: []`). The server's 400 sentence shows as written.
2. **The card:** with `hexCount` 0 the facts line names the records ("People · 12 records"), never
   "0 hexes".
3. **The product page:** with `hexCount` 0 the hex box is hidden and the record count shows in its
   place.
4. **Import:** no placement step for a records-only package. When the preview's
   `records.anchorsDropped` is above 0, say so before the install: "2 records lose their place on
   the map." (1 record: "1 record loses its place on the map."). An absent key reads as 0.
5. The "Records only" filter in the column then has something to count; check it.

### 2. The featured row repeats the grid
On the plain storefront the "New in the store" row (or "Most imported") shows three cards that the
grid repeats straight below it; with six packages half the page repeats
(`kb27_store2_column_1600`). **Leave the featured cards out of the grid** while the row shows. The
results line still counts every result. With a search, a filter, My packages or Hidden the row is
gone (as today) and the grid shows everything.

### 3. Your own ships' routes
Today the sector map draws no route for the party's own ships.
- **When:** while the Party tab is open, for the selected ship (the lead when none is selected).
- **What:** the same drawing as a public card's route (`paintRoute`): finished track at 70%, course
  ahead at full strength with the 10 px arrowhead, the 7 px arrowhead at the present hex with no
  course. Colour `--signal` (the party's cyan), not lime.
- **The legs:** compute them in the browser from the campaign's records at the campaign date with
  `publicFinishedLegs` and `publicCourseLegs` from `@voyage/shared` (the same functions the server
  uses for the public card), so the two drawings agree. The referee sees their own course whatever
  "Publish my ships' course" says: that switch is about the public card only.
- **One route at a time:** an open public card's route replaces it while the card is open.
- Contrast: measure the cyan as you measured the lime (`route_contrast.py`) and give the numbers;
  3:1 for the course, and say what the track gets at 70%.

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- A browser pass on a local build: kb28 shots of a records-only package's card, page and import
  (with an anchor dropped), the plain storefront without repeats at 1600 and 390, and your own
  ship's route with a course and without.

## Report
Write `directives/reports/d_store_3.md` from the template.

**Owned:** `apps/web/src/workspace/market/`, `apps/web/src/map/MapRenderer.ts` and `traffic.ts`
(the route only), `apps/web/src/views/MapView.vue` (the route wiring only), the records list's
publish entry (name the file in your report), tests under `tests/web/` except
`renderer.test.js` and `store_scroll.test.js` (Lane A has those this turn), your shots and report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: records-only screens (card facts, product page without the hex box, import without placement and with the dropped-anchors notice, Publish records from the records list via shared PublishFields) and the featured row left out of the grid. next: your own ships' routes in cyan.
done: own ships' routes (workspace/party_route.ts, MapRenderer setPartyRoute in --signal, MapView wiring) and tests (party_route, records_only); npm test, check and vue-tsc clean. next: browser pass and kb28 shots.
done: browser pass (kb28 shots, 22), cyan contrast (course 8.67:1 median, track 4.48:1), gates green (npm test 1843/1806 pass/0 fail/37 skipped, check, typecheck, build) and the report written (directives/reports/d_store_3.md); servers stopped. next: none, stopped.
