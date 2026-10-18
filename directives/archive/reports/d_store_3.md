# Lane D store_3 report
Prompt: prompts/d_store_3.md
Status: done

Records-only packages have their screens: Publish records from the campaign's records list, the card, the page without the hex box, and an import with no placement step that says which records lose their place on the map. The featured row is no longer repeated in the grid. The party's own ship now has its route on the map in cyan, drawn the same way as a public card's route.

One gap is not mine to close. The catalogue card carries no record count, so a records-only card reads "People · Records only · 1 import", not "People · 12 records" (question 1).

## Changed files

### Item 1: records-only packages (contract F18)
- `apps/web/src/workspace/CampaignList.vue`, the records list's publish entry:
  - A **Publish** button (store icon) beside Timeline. It shows only to the campaign's owner, signed in and online, once the campaign has a record.
  - It opens the dialog below, loaded on first use (`defineAsyncComponent`).
  - What starts chosen: the rows the list shows when the list is narrowed (a type chip, a search, or "At …"). With the whole list showing, nothing starts chosen (question 3).
- `apps/web/src/workspace/market/RecordsPublish.vue` (new), the "Publish records" dialog:
  - It uses the one modal frame. Focus starts on the first field, Tab stays inside, Escape closes, and below 640 px it fills the screen.
  - The records list has Select all and Clear.
  - It sends `hexKeys: []` with the chosen record ids.
  - With nothing chosen it shows the server's sentence, "A package needs at least one hex or one record.", and Publish is off. A refusal from the server shows as written.
  - The Kind box follows the records chosen ("people", "ships", or "records" for a mix) until the person types their own.
- `apps/web/src/workspace/market/PublishFields.vue` (new):
  - Holds the package half of a publish: the package choice, title, kind, description, tags and cover. Build's Publish selection and Publish records both use it, so they ask the same way.
  - The publish forms' styles moved here from `PublishForm.vue`, so either form loads them.
  - The kind hint now ends "…, hexes, or people."
- `apps/web/src/workspace/market/PublishForm.vue`: uses PublishFields. Otherwise unchanged: same summary, record list, limits, Escape and close rules.
- `apps/web/src/workspace/market/market.ts`:
  - `formProblems` takes `from: 'records'`, which asks for at least one record instead of a hex.
  - New: `NEEDS_ONE`, `kindOfRecords`, `usePublishTarget()` (shared by both forms) and `ownUniverse()`.
- `apps/web/src/workspace/market/storefront.ts`:
  - `cardFacts` uses the new `sizeWords`. With no hexes it says "12 records" when the card carries a count, else "Records only". It never says "0 hexes".
  - New `withoutFeatured` for item 2.
- `apps/web/src/workspace/market/ProductPage.vue`:
  - With `hexCount` 0, the hex box is replaced by "11 records" and "Records only. Nothing is placed on the map."
  - The hero facts read "11 records · 1 import".
  - The versions list leaves out "0 hexes".
- `apps/web/src/workspace/market/ImportPanel.vue`, for a records-only package:
  - No "In place / Place on the map" step, and no placement is ever sent. A line says "Records only. They go into the campaign, with nothing to place on the map."
  - Before Import it says "2 records lose their place on the map." ("1 record loses its place on the map."). A missing count from an older server reads as 0.
  - After the import, it opens the campaign's records list.
- `apps/web/src/workspace/market/place.ts`:
  - `previewLine` says "11 records." and leaves out "0 hexes".
  - New `anchorsDroppedWords`.

### Item 2: the featured row
- `apps/web/src/workspace/market/PackagesView.vue`:
  - The grid leaves out the featured row's cards.
  - The results line still counts every result, the row's included ("7 results").
  - Show more pages through the grid.
  - With a search, a filter, My packages or Hidden there is no row, and the grid shows everything, as before.

### Item 3: your own ships' routes
- `apps/web/src/workspace/party_route.ts` (new, pure):
  - `routeShipId` picks the ship: a party ship open as a record, else the lead while the Party tab is open.
  - `partyRoute` computes the legs at the campaign date from the records, with the shared `publicFinishedLegs` and `publicCourseLegs`. These are the server's functions for the public card, so own-sector legs drop out on both.
  - The referee always sees their own course, whatever the public course switch says.
- `apps/web/src/map/MapRenderer.ts`:
  - New `setPartyRoute`.
  - `paintRoute` draws one route: an open card's in the traffic colour, else the party's in `--signal`. Same line, 70% track, 10 px and 7 px arrowheads.
- `apps/web/src/views/MapView.vue` (route wiring only): a `partyRouteNow` computed from the pane, the party, the records and the campaign date. A watch sends it to the renderer, and it is also set when the renderer is made.

### Tests and evidence
- Tests:
  - `tests/web/records_only.test.js` (new, 5 tests): card facts, page, import words, Publish records, and the grid without repeats.
  - `tests/web/party_route.test.js` (new, 4 tests): which ship, the legs, no route, and the wiring.
- `findings/storefront/`:
  - Browser scripts: `store3_seed.mjs`, `store3.mjs`, `store3_route.mjs`, `store3_dialog.mjs`, `store3_page.mjs`, `store3_retake.mjs` and `store3_covers.mjs`.
  - Contrast: `route3_contrast.py` and `route3_contrast.log`.
  - Logs: `store3*.log` and `s3_*.log`.
- Shots: `findings/ui_design_shots/kb28_*` (22).

## Gates
npm test:      pass (1843 tests, 1806 pass, 0 fail, 37 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`npm run typecheck`, and `vue-tsc -b` for the web app)
fourth gate:   pass (`npm run build`)

### Browser pass
Headless Edge on my own local servers: API 8941, Vite 5341 and DevTools 9541, with the state in `findings/storefront/local`. All of them are stopped, and the four ports are free.

I seeded data into that local state only:
- Three people in the house's "Regina highport contacts". Two are placed in an own sector, so a records-only import has anchors to drop.
- Two ships of "Free traders of the Marches" as its party, each with a track. The lead, Bright Ledger, has a course ahead (2007, 2106, 2205, 2304). Cold Manifest has only finished legs.
- A second campaign for the reader.

What each part showed:
- **Publish records:**
  - Narrowed to People, the dialog opened with 11 chosen and Kind "people".
  - Clear showed the server's sentence and turned Publish off.
  - Publish went to the new package's page (`kb28_publish_records_1600/390`, `kb28_publish_records_list_1600/390`, `kb28_records_list_entry_1600/390`).
  - The dialog's records list no longer overlaps the text below it (checked at 1600 and 390), and the card fits the 390 screen.
- **Build:** Publish selection still opens and reads as before (`kb28_publish_selection_1600`).
- **Page:**
  - Facts "11 records · 0 imports". The hex box is gone, with "11 records" and the People list in its place.
  - Versions read "11 records" (`kb28_records_page_inside_1600/390`).
- **Card and filter:**
  - "Records only" counts 1, beside "Has map hexes" at 6.
  - The card reads "People · Records only · 0 imports" (`kb28_records_card_1600`).
- **Import, as the reader:**
  - No placement step; the preview says "11 records." and "2 records lose their place on the map." (`kb28_records_import_1600`).
  - Import opened the records list with the people in it (`kb28_records_imported_1600`).
- **Storefront, signed out, at 1600 and 390:**
  - 3 featured, 4 in the grid, and none repeated. The results line reads "7 results".
  - A search has no row (`kb28_store_norepeat_1600/390`, `kb28_store_norepeat_grid_390`).
- **Own route:**
  - Party tab: the lead's dimmed track, then the bright course with the 10 px arrowhead at 2304 (`kb28_route_course_1600`).
  - Cold Manifest's record open: its finished track with the 7 px arrowhead at 2106 (`kb28_route_no_course_1600`).
  - The records list draws no route (`kb28_route_shut_1600`).
  - Opening a public card (Copper List) replaced it with the lime route; closing the card brought the cyan back (`kb28_route_card_wins_1600`, `kb28_route_card_closed_1600`).

### Cyan contrast
Measured as the lime was in `d_store_2`: the stroke is the 75th-percentile ink, and the background is the median of the chart 3 to 5 px outside the line, in 20 px tiles. `route3_contrast.log` has the numbers; I compare them with the lime measurements from `d_store_2`.

| | Cyan median | Cyan lowest tile | Lime median (d_store_2) |
|---|---|---|---|
| Course ahead | 8.67:1 | 5.7:1 | 9.39:1 |
| Track at 70% | 4.48:1 | 2.95:1 | 4.78:1 |

- The course clears 3:1 everywhere.
- The track clears it in 58 of 59 tiles. The one below, at 2.95:1, is where the line enters the selected, highlighted hex 2106.

## Contract published
none

## Needs from others
- **Lane B:** add `recordCount` (from the latest done version) to the catalogue card, `PackageCard`. It has to be optional, because the shared schema is `.strict()` and a card from an older server must still parse. The card already shows "12 records" when the count is present, so nothing else in Lane D changes. Question 1 asks Johnny first.

## Found, not fixed
- On a product page opened cold, the import panel's "11 records." summary has no box. Its style (`.mk-sum`, `.mk-err`) belongs to the publish forms and loads only with them. This was the same before this pass. A later pass can give the import panel its own copy.

## Questions for Johnny
1. **The card's record count:** the catalogue card has no record count, so a records-only card says "People · Records only · 1 import", not "People · 12 records". Should I ask Lane B to add an optional `recordCount` to the card? I suggest yes, a small server change; the card already shows the number when it arrives. The alternative is to keep "Records only".
2. **Which ship is "selected":** the Party tab has no ship selection; pressing a ship there opens its record. So the route shows for the party ship whose record is open (pressed in the Party tab, or its mark on the map), else for the lead while the Party tab is open. With the records list, the journal or a dossier open, no own route is drawn. Is that right? I suggest yes. The alternative is a ship picker in the Party tab, a new control.
3. **What Publish records starts with:** the records the list shows when it is narrowed (a type, a search, "At …"). With the whole list showing, it starts with none, so nobody publishes a whole campaign by accident. Keep it? I suggest yes. The alternative is to start with everything shown.
