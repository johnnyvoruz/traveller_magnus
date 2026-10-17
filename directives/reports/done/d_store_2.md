# Lane D store_2 report
Prompt: prompts/d_store_2.md
Status: done

Item 1 (scroll) was `d_store_scroll`, already in 1.2.3. Item 5 was dropped. Items 2, 3, 4, 4b and 4c are done.

## What changed, by item

### 2. Filters in a left column, with Amazon's patterns
- **At 1024 px and wider:** a 240 px column on the left. It is sticky 12 px from the top, and scrolls on its own
  when it is taller than the window. It has these sections, each a heading and a list of choices with grey counts:
  - Kind: the families, combined with OR. This replaces the chip row.
  - Contents: "Has map hexes" and "Records only". "Records only" is listed only while some loaded package has no
    map hexes, so it is hidden today.
  - Edition.
  - Tags: the ten most used, then "See more" or "See fewer".
  - Updated: "Last 7 days", "Last 30 days" and "Any time". These are buttons with `aria-pressed`.
  - Publisher: shown only when the loaded cards have more than one handle.
- **How the counts work:** a section's counts are taken over the cards that every other section lets through, so
  each count is what ticking that box would show. A choice that is on stays listed even at a count of 0.
- **Above the results:**
  - The results line, for example "6 results", "4 results for “regina”" or "1–24 of 31 results". When the server
    has more than is loaded, it says "of at least N".
  - The active filters as removable chips, then "Clear all".
  - "Sort by" on the right.
- **The grid:** 3 columns at 1600 px and 2 at 1024 px. The client shows 24 cards a page; "Show more" reveals the
  next 24 and fetches the server's next page when the loaded cards run out.
- **The featured row:** only on the plain storefront, never with a search, a filter, My packages or Hidden. It is
  headed "Most imported" only when some package has an import, and otherwise "New in the store" (the latest
  three). Locally every package has 0 imports, so it reads "New in the store".
- **The URL:** the filters are in the query, as `kind`, `contents`, `edition`, `tag`, `updated` and `by`. A key with
  more than one choice repeats (`?kind=map&kind=system`). An old `?kind=sector%20piece` still reads as Maps.
  - Each filter, search or sort change is a new history entry, as on Amazon, so Back undoes it.
  - Counting and filtering run in the browser over the loaded cards. Only the search text goes to the server.
- **Below 1024 px:**
  - There is no column. A "Filters" button sits beside sort and shows the count when filters are on
    ("Filters (1)").
  - It opens a sheet from the left, using the app's one modal frame. It is full height everywhere and full width
    on a phone, holds the same sections, and ends with "Show N results".
  - The sheet is part of the URL (`filters=1`), so Back closes it. The filters ticked inside it stay: the sheet
    replaces its own history entry, and on close the filters move to the entry below.
  - Escape, the close button, the scrim and "Show N results" all close it, and focus returns to "Filters".
- **The search box:** stays full width at the top.
- **Text buttons:** "See more", "Clear all", "Try again" and "Report this package" use a new store class,
  `.mk-link`. The old `build-link` was only styled once the Build pane had loaded, so on a cold store load those
  buttons showed as grey browser buttons.

### 3. Ship routes as solid lines, and the course ahead
- **What is drawn while a public card is open:**
  - **The finished track (`legs`):** a solid 2 px line in the traffic colour, cased in the chart's dark like the
    tracks, with round joins, no arrowhead and no animation. It runs into the ship's present hex.
  - **The course ahead (`course`):** the same line at full brightness, with a filled arrowhead (10 px) at its last
    hex.
  - **An empty or absent `course`:** the track only, with a small arrowhead (7 px) at the present hex, pointing the
    way the ship came in.
  - Legs chain into one line where one leg ends and the next starts. A leg that stays on its hex, or has an end off
    the chart, draws nothing.
- **The card reads `course` leniently:** a missing key or a non-list is an empty course, a bad leg is left out, and
  no parser requires the key.
- **Your own ships' routes:** I changed nothing for these. On this tree the sector map draws no route for the party's
  own ships, dotted or otherwise. The only dotted ship route was the open public card's (`MapRenderer.paintRoute`).
  See question 2.
- **Contrast,** measured as for the tracks (`findings/traffic_colour.md`, "Acceptance"):
  - The stroke is the 75th-percentile luminance of the line's ink.
  - The background is the median of the chart's own pixels 3 to 5 px outside the drawn line.
  - Two shots at the same camera under reduced motion, card shut and card open, so the pixels that differ are the
    route. The card and the selection bracket are left out.
  - Measured in 20 px tiles along the line, at 1600 px, hex zoom, on the Jewell/Regina border.
  - Script: `findings/storefront/route_contrast.py`. Output: `route_contrast.log` (at 70%).
  - Results:

    | Line | Tiles | Min | 10th percentile | Median | Under 3:1 |
    |---|---|---|---|---|---|
    | Bright course | 21 | 3.99 | 7.65 | 9.39 | 0 |
    | Small arrowhead (no course) | 1 | 4.66 | | | 0 |
    | Dimmed track at 45%, as asked | 55 | | 2.33 | 2.33 | 53 |
    | Dimmed track at 60% | 52 | | 2.72 | 3.66 | 13 |
    | **Dimmed track at 70%, shipped** | 42 | 4.78 | 4.78 | 4.78 | 0 |
    | Dimmed track at 70%, Copper List (no course) | 22 | 1.19 | 2.44 | 4.93 | 5 |

  - **At 45% the track fails 3:1, so I shipped 70%** (question 1). It still reads clearly dimmer than the course.
  - The five Copper List tiles under 3:1 are where its track runs straight through the world discs and names of
    1808 to 1810. The tracks had the same kind of exception on large white text.

### 4. The public card in lime
- The ship's name, the card's border and its outer ring now use `--chart-traffic`. The route on the map already did.
- The token's comment now reads "other people's ships as tracks, the open card's route on the map, and that
  card's ship name and border".
- The "Route" row is gone from the card, with its style and `routeWords`.
- `tests/web/contrast.test.js` gains the pair `--chart-traffic` on `--bg-1` (the 18 px name), and it passes.
- `tests/web/traffic_display.test.js` now allows `--chart-traffic` in `PublicShipSheet.vue`.

### 4b. The referee's course switch
- **Where:** the switch is in `apps/web/src/workspace/AccountMenu.vue`, the file that holds "Show my name on public
  cards". It sits directly after that switch, labelled "Publish my ships’ course", as an On/Off
  `menuitemcheckbox` like the other two. It shows while public is on.
- **Its state** is in a new file, `workspace/public_course.ts`: on by default, the PATCH, the 503 sentence, and a
  count of saved writes.
- **The write:** `PATCH /api/universes/:id/public-games` with `{ public: true, showCourse }`. The answer's
  `showCourse` is kept.
- **After a save,** `MapView.vue` watches the write count and fetches the open card again, if one is open.
- **When the universe has no `showCourse` key,** the switch shows On and disabled, with "Available after the next
  update." under it.
- **A 503 `course_unavailable`** shows the server's sentence under the switch, with `role="alert"`, and the switch
  stays as it was.

### 4c. Back to the same place in the store
- The scroller saves its `scrollTop` for each history entry, keyed by the history position and the full path.
- A history pop (Back or Forward) restores the saved position once the page is tall enough for it, giving up after
  about two seconds.
- A new entry forgets any older entry that had the same key. A new path starts at the top, and a filter change on
  the same path keeps the scroll position.

## Changed files
- apps/web/src/workspace/market/filters.ts (new): reading and writing the query, OR within a section and AND across, the counts, the toggles, the active chips and the results line.
- apps/web/src/workspace/market/StoreFilters.vue (new): the filter sections, used in both the column and the sheet.
- apps/web/src/workspace/market/PackagesView.vue: the column and results layout, results line, active chips, sheet, featured heading, pages of 24, the scroll memory and `.mk-link`. The chip row and its styles are removed.
- apps/web/src/workspace/market/storefront.ts: `featured` returns `{ heading, cards }`. The unused `familiesIn` and `ofFamily` are removed.
- apps/web/src/workspace/market/ProductPage.vue: Report uses `.mk-link`. Nothing else changed.
- apps/web/src/map/traffic.ts: `RouteLeg`, `routeChains` and `arrowHead`.
- apps/web/src/map/MapRenderer.ts: `paintRoute` draws solid lines and arrowheads, and `setPublicRoute({ legs, course })` replaces the old signature. The dot constants are removed.
- apps/web/src/views/MapView.vue: passes the course to the renderer, and fetches an open card again after a course write.
- apps/web/src/workspace/public_card.ts: `course` is read leniently through a shared `readLegs`. `routeWords` is removed.
- apps/web/src/workspace/PublicShipSheet.vue: the lime name, border and ring. The Route row is removed.
- apps/web/src/workspace/public_course.ts (new): the course switch.
- apps/web/src/workspace/AccountMenu.vue: the course switch, its two notes, and clearing the note when another campaign opens.
- apps/web/src/design/tokens.css: only the comment on my own `--chart-traffic` line.
- tests/web/store_filters.test.js (new, 8 tests) and tests/web/public_course.test.js (new, 4 tests).
- tests/web/party_ships_map.test.js: the card's course, the route geometry, and solid lines with arrowheads in place of dots.
- tests/web/market_storefront.test.js: the featured heading. The chip test is removed along with its helpers.
- tests/web/store_scroll.test.js: the scroll memory.
- tests/web/contrast.test.js and tests/web/traffic_display.test.js: as listed under item 4.
- findings/storefront/store2.mjs, route.mjs, route_contrast.py, and the logs store2.log and route_contrast.log.
- findings/ui_design_shots/kb27_store2_* (11 shots) and kb27_route_* (3 shots).

## Gates
npm test:      pass (1834 tests, 1797 pass, 0 fail, 37 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   npm run build pass. The first run failed with an unused parameter (`path`, TS6133). `npm run typecheck`
               does not catch that and the build's `vue-tsc -b` does. Fixed and rerun.

Browser pass: headless Edge, signed out, on the local build with the six packs. Logs are in `findings/storefront/`.
- **The column at 1600:**
  - The column is 240 px wide at x 190, and the grid has 3 columns.
  - Sections: Kind 6 × 1, Contents (Has map hexes 6), Edition (MgT2E 6), ten tags and "See more", Updated.
  - The Filters button is hidden at this width.
  - Shot: `kb27_store2_column_1600`.
- **Filters in the URL:**
  - Ticking Maps gives `?kind=map`, "1 result", the chip "Maps", and no featured row. Ticking Systems as well gives
    `?kind=map&kind=system` and "2 results".
  - Back returns to `?kind=map` with only Maps ticked.
  - The shared link `?kind=map&kind=system&updated=7` restores both boxes, "Last 7 days" and three chips.
  - The old link `?kind=sector%20piece` ticks Maps.
  - Shots: `kb27_store2_filtered_1600`, `kb27_store2_shared_link_1600`.
- **The results line:** "6 results", and for a search "4 results for “regina”" (`kb27_store2_search_1600`).
- **The empty result:** `?kind=ship&edition=CE` shows "No packages match. Try fewer filters or other search
  words." with Clear all, which goes back to `/packages` (`kb27_store2_empty_1600`).
- **1024 and 768:**
  - At 1024 the column shows and the grid has 2 columns (`kb27_store2_column_1024`).
  - At 768 the column is hidden and the Filters button shows (`kb27_store2_768`).
- **The sheet at 390:**
  - It opens at `?filters=1`, full screen (390 × 844), with focus on its close button, and reads "Show 6 results".
  - Ticking Ships gives `?kind=ship&filters=1` and "Show 1 result".
  - Back closes the sheet. The address becomes `?kind=ship`, the button reads "Filters (1)", and focus is back on
    it.
  - "Show N results" and Escape each close it too.
  - Shots: `kb27_store2_390`, `kb27_store2_sheet_390`, `kb27_store2_sheet_ticked_390`,
    `kb27_store2_sheet_closed_390`.
- **Back to the same place, at 390:**
  - I scrolled the store to 1607 and opened a package, which starts at 0. I scrolled it to 900 and went Back: the
    store was at 1607.
  - Forward returned to the package at 900.
  - The Marketplace link (a new entry) starts at 0.
  - Shot: `kb27_store2_back_scroll_390`.
- **The route:**
  - Kestrel's Due shows the dimmed finished track into Roup (2007), then the bright course up and to the right,
    with its arrowhead at 2304 (`kb27_route_course_1600`).
  - Copper List, on the same hex, has no course: its track only, with the small arrowhead at Roup
    (`kb27_route_no_course_1600`).
  - Both cards show the lime name `rgb(212, 255, 58)` and a lime border, and neither has a Route row.
  - `kb27_route_shut_1600` is the same view with the card shut.
- No console errors.
- **Local data I added,** in my own local state only:
  - I applied migration 0020.
  - I ran `tools/examples/seed_games.mjs --to-local findings/storefront/local --apply` for the example ships.
  - I set one card's `course` by SQL, because the seed writes none.
- Every server and the browser are stopped. Ports 8941, 9941, 5341 and 9541 are free.

Not shot:
- The course switch in the menu. Its states are covered by `tests/web/public_course.test.js`.
- The route at 390.

## Contract published
none

## Needs from others
- Lane B (later, as before): `family=` and `author=` catalogue queries, so the counts can cover more than the
  loaded page.
- Lane B, optionally: `tools/examples/seed_games.mjs` writes no `course`, so the example ships have none until a
  game sets one. Only needed if Johnny wants example courses on production.

## Questions for Johnny
1. **The finished track at 70%, not 45%.** At about 45% the dimmed track measured 2.33:1 at the median on the chart.
   It fails the 3:1 the tracks keep. At 70% the same view measures 4.78:1, and the track still reads as dimmer
   than the course (9.39:1). Keep 70%? Suggested answer: yes. The alternative is 45% and accepting that the
   finished track falls under 3:1.
2. **Your own ships' routes.** The prompt says they are dotted today. On this tree the sector map draws no route for
   the party's own ships at all. A press on one of your tracks opens the Party tab, and the only route ever drawn
   was the open public card's. Should your own ships' finished legs and planned legs be drawn the same way, solid
   with the arrowhead, in the party's cyan (`--signal`)? Suggested answer: yes, as its own small pass, drawn for
   the selected ship (or the lead) while the Party tab is open. The alternative is to leave your own ships without
   a line.
3. **The tag filter is now local.** A tag link on a package page (`/packages?tag=Regina`) used to ask the server, so
   it found every package with that tag. It now ticks Tags: Regina in the column and filters the loaded cards, which
   is the first 100. That follows the decision of 2026-10-15, and the catalogue is far below 100 today. Keep it?
   Suggested answer: yes, until Lane B's catalogue queries. The alternative is to keep sending a single tag to the
   server, which would make the other sections' counts cover only that tag's packages.
