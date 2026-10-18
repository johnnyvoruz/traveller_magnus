# Lane D stream

## D1 The package thumbnail on the map's geometry — done
Files: apps/web/src/workspace/market/place.ts, tests/web/package_outline.test.js (new)
What changed:
- The product page's drawing of the piece now places each hex with the map's own `toGlobal` and `hexCentre` (`map/geometry.ts`), scaled by 1.5 so a hex's corner radius stays 1; the second formula (no `-1`) is gone. New `outlineCentres()` returns the centres; `outlineHexes()` draws from them.
- What you see doesn't change: the old formula was one column and one row off everywhere, with the same stagger parity, so the view box (fitted to the hexes) showed the same shape. Now the drawing's coordinates are the map's, ready for D4 (the chart piece itself).
- Test: Hollow Verge's six hexes at slot (-8, -5) land on the map's centres, which are C's table values (x = q, y in parsecs); each polygon is centred on its cell; unknown sectors sit side by side.
Gates: test 1877/1915 pass (0 fail, 38 skipped), check clean, typecheck, build
Shots: none (no visible change; the drawing is the same shape in the same box)
Questions: none

## D2 The catalogue seen once — done
Files: apps/web/src/workspace/market/catalogue_memory.ts (new), apps/web/src/workspace/market/PackagesView.vue, tests/web/catalogue_memory.test.js (new)
What changed:
- The store keeps each query's last first page in memory for the session (`catalogue_memory.ts`: per search, sort, view and account; the oldest goes past 24). A return to the store paints it at once, with no placeholder, and asks the server behind it.
- The fresh answer replaces what is shown only when something differs, held at its height and settled (glide, dissolve) as a filter change is, so it never shifts the page. A failed refresh keeps what is shown, with the error line.
- The session read is remembered too, so a return doesn't wait on it.
- Measured (findings/storefront/sd_d2.mjs): store, then the map by the rail, then the store again with the catalogue request held: 0 placeholder frames of 159 at 1600 and of 177 at 390, all 7 cards on every frame; after the request is let go, the results' top and height are unchanged (221/1020 at 1600, 308/1637 at 390).
Gates: test 1887/1926 pass, 1 fail not mine (`journal_mention.test.js` "two thousand records filter inside one frame", 171 ms under load with my servers running; passes alone); check clean; typecheck; build fails in another lane's file (`workspace/JournalHere.vue(70,57)`: `why` is not on `MentionRow`), not mine.
Shots: sd_D2_return_1600.png, sd_D2_return_390.png (the store, painted from memory while the catalogue request is held)
Questions: none

## D3 The map's floating controls in the look — done (the date chip waits on M)
Files: apps/web/src/components/OmniBox.vue, apps/web/src/workspace/build/BuildStrip.vue, apps/web/src/workspace/build/BuildMarks.vue, apps/web/src/workspace/FirstHint.vue, apps/web/src/shell/Panel.vue (style only)
What changed:
- The search box and its results: the videos' frame (a `--line-2` edge and the `--frame-glow` halo, as `.ui-frame`); group labels ("Your campaign", "The chart") as kickers (Orbitron 12 px, 0.3em, `--signal-dim`); the row's kind label in Orbitron.
- The "Your map" strip: the frame edge and halo; "YOUR MAP" as a kicker over the map's name in Orbitron, as over a version number.
- The hex hover tag ("1811 · DINOM", "2013 · EMPTY"): the videos' outlined Orbitron box (as `.ui-date`) on the chart's glass, its add/take tones kept.
- The first-visit hint: the search box's frame and halo, so the two read as one piece.
- The panel's Column / Half / Full switch: small Orbitron capitals, as the videos' kickers (the panel's title and contents untouched: the inspector stays Inter, per the design reference's amendment).
- Two overlaps at 390 px fixed (they were there before): below 680 px the date chip takes the row under the search, so the first-visit hint and the "Your map" strip (with its notes) now sit a row lower; before, the chip covered the hint's words and the strip's Select hexes.
- Not done: the date chip (`workspace/StardateChip.vue` is claimed by M, M1 restyles it).
Gates: test 1893/1932 pass (0 fail, 39 skipped), check clean, typecheck, build
Shots: sd_D3_{hint,search,panel,build}_{before,after}_{1600,390}.png
Questions: none. Note for the orchestrator: M's queue lists the same files (M6 Build's `.vue`, M8 `OmniBox.vue` and `Panel.vue`, M9 `FirstHint.vue`); these are done in the look now, so M can build on them rather than redo them.

## D4 "What's inside" shows the chart piece itself — done
Files: apps/web/src/workspace/market/PieceChart.vue (new), apps/web/src/workspace/market/piece_chart.ts (new), apps/web/src/workspace/market/ProductPage.vue, tests/web/piece_chart.test.js (new)
What changed:
- The package's hexes are drawn by the map's own renderer (`MapRenderer`), fed only the piece: own sectors at the slots the manifest records, chart sectors at the truth's (read once through `TruthClient`, cached for the session), one sector index per sector holding the manifest's rows (a chart row as it is; a Build row from its `entry`). No second drawing rule: worlds, starports, bases, UWPs and names are the map's.
- The camera sits at a zoom past the map's names threshold (84 px per parsec), and the box is the piece's own size (Hollow Verge 308 × 319 at 1600, Feri 140 × 125), centred in its column. A piece that doesn't fit comes down in zoom, never below the hex tier; when that leaves it below the names threshold (a scattered piece such as The Glass Hand), its systems are listed under the drawing: hex, name, UWP.
- The canvas has a label naming the piece's systems for screen readers. A manifest whose hexes carry no rows (from before rows were kept) keeps the old outline.
Gates: test 1907/1946 pass (0 fail), check clean, typecheck, build
Shots: sd_D4_{hollow,glass,jewell,feri}_after_{1600,390}.png; before: kb30_product_inside_1600.png (the empty outline)
Questions: none

## D5 Map covers at card size — proposal
Files: none changed. findings/storefront/sd_d5_covers.py (the comparison), findings/ui_design_shots/sd_D5_covers_compare.png
What I found:
- A map package without a cover of its own already shows the default art for maps (the painted chart on a desk); that reads at 300 px.
- Live, Hollow Verge has an uploaded cover: the author's 1600 × 900 screenshot of the map. At card size (300 × 169) the six systems fill about a third of it, and the names and UWPs are 4 to 5 px tall: "a few dots".
- An automatic crop to the systems (bright pixels over the chart's grid, padded 12 %, widened to 16:9) gains only about 1.4×: the six systems stand three rows tall, so a 16:9 box can't zoom further without cutting them. The worlds read; the names are still small.
- The map's own renderer at card size (D4's drawing) can't do better: at the zoom where the piece fits 169 px tall, the map draws dots without names.
The two ways, shown side by side with today's in `sd_D5_covers_compare.png`:
1. **The default map art on cards** for a map package whose cover is a map screenshot (the product page keeps the screenshot). Reads at once; every map package looks alike.
2. **Crop at upload:** when the author adds a cover, `cover_image.ts` trims the empty chart round the systems before making the 640 px file, and the cover editor shows the trimmed result. Size: one function in `cover_image.ts` and its test, half a day; existing covers stay as they are until re-added (the six example covers would need re-adding by whoever owns `tools/examples`).
Gates: no code changed
Shots: sd_D5_covers_compare.png
Questions:
1. Map covers at card size: should cards show the default map art when a map package's cover is a screenshot of the map, or should covers be cropped to the systems when they are added? I suggest the crop at upload (2): the card stays this package's own picture, and an author who wants the painting can choose no cover. The alternative is the default art on cards (1), which reads best at 300 px but makes every map package look the same.

## D6 The store at 390 px, every screen — done
Files: apps/web/src/workspace/market/market.css, apps/web/src/workspace/market/ImportsList.vue, apps/web/src/shell/Rail.vue, tests/web/store_touch.test.js (new)
What changed:
- Measured every screen at 390 × 844 (findings/storefront/sd_d6.mjs): the store, the Filters sheet, a product page, its import panel, the Publish chooser, My packages, the Publish records dialog. Before: 28, 22, 13, 4, 19, 1 and 6 controls under 44 px (rail items 40, header and search 30 to 35, the sheet's choices 30, the dialogs' close 32 × 27, the import panel's switch 25).
- Below 640 px every control in the store and its dialogs is now 44 px tall and each close button 44 px square; the rail's items are 44 px (on the map too). After: no control under 44 px on any screen, but for the inline links below.
- Inline links keep their look (the author and the kind on a card, the breadcrumb, the product page's kind and author, See more); their hit area reaches 12 px round them. Checked with `elementFromPoint` 10 px above and below each: all land on the link, except a card's kind badge from above (it sits 8 px under the card's edge, which clips: about 41 px of target).
- My packages was 10 px wider than the window at 390 (the campaign picker's 180 px minimum): it now wraps and never exceeds the page.
- Nothing sits under the browser's bars: the product page's Import bar keeps its safe-area padding and the page's last section ends above it (732 px vs the bar at 779).
Gates: test 1909/1948 pass (0 fail), check clean, typecheck, build
Shots: sd_D6_{store,sheet,product,import,mine,chooser,records}_{before,after}_390.png
Questions: none

## D7 The store's empty, error and slow states — done
Files: apps/web/src/workspace/market/PackagesView.vue, apps/web/src/workspace/market/ProductPage.vue, apps/web/src/workspace/market/market.css, tests/web/store_states.test.js (new)
What changed:
- One state pattern in the videos' frame (`.ui-frame` with a kicker label, one headline in Orbitron, one sentence, one action): `.mk-state` in `market.css`, a candidate for the shared set (M9 asks for one empty-state pattern). Every store state uses it: My packages signed out ("MY PACKAGES · Sign in to see your packages."), nothing published yet, no match (Clear all), nothing hidden (admins), and the empty store ("THE STORE · No packages yet.", both ways to publish, Publish).
- A catalogue that could not be read: before, a line over an empty grid and "No results"; now "NOT LOADED", the server's sentence, "Check your connection, and then try again.", Try again, in the results' place, with no results line. A refresh that fails while cards are shown (D2) stays one line over them.
- A product page that could not be read: the same state in the hero's place, with Try again (it reads the package again). A removed package's address: "NOT FOUND · This package is not in the store. Its author or an admin may have taken it down, or the link is wrong. Campaigns that imported it keep their copy." and Back to the Marketplace.
- Slow network, measured with the catalogue's answer held 2.5 s: the placeholders hold the loaded page's top and, at 1600, its height to the pixel (221 / 1020 both). At 390 the placeholders are 429 px taller than seven loaded cards (six grid placeholders, one column), so the page's foot moves up when they arrive; nothing on screen above it moves. A return visit paints from memory (D2) and has no placeholders.
- Checked in the browser with the API's answers replaced (findings/storefront/sd_d7.mjs): each state shows, and Try again recovers both the store (7 cards) and the product page.
Gates: test 1922/1961 pass (0 fail), check clean, typecheck, build. (A run of the web tests alone hit the journal's "two thousand records filter inside one frame" timing test at 110 ms under load; not mine, it passed in the full run.)
Shots: sd_D7_{empty,failed,slow,nomatch,mine_out,product_failed,removed}_{1600,390}.png
Questions: none

## D8 The store on the server's family= and author= — done (counts: proposal)
Files: apps/web/src/marketplace/covers.ts, apps/web/src/marketplace/catalogue.ts, apps/web/src/workspace/market/filters.ts, apps/web/src/workspace/market/PackagesView.vue, tests/web/store_server_filters.test.js (new)
What changed:
- The kind table is the server's: `covers.ts`'s `KIND_FAMILIES` is now `PACKAGE_KIND_FAMILIES` from `@voyage/shared`, and `KindFamily` is `PackageFamily` (decided 14:45).
- The catalogue call carries `family` (repeated, OR) and `author` (contract F2).
- The store asks the server only when it must: the server answers 100 cards a page, so while the loaded cards are the whole catalogue (no `nextCursor`) the browser filters them exactly and nothing is asked. When the server has more, the ticked kinds go as `family=` and one publisher as `author=`, and the results are the server's answer, swapped in held and settled as a filter change is. Two or more publishers stay in the browser (`author` takes one handle); contents, edition, tag and Updated stay in the browser over the server's answer.
- Checked in the browser with the catalogue cut to 4 cards and a cursor (findings/storefront/sd_d8.mjs): ticking People asked `family=people` and showed both people packages, one of them not among the 4 loaded; one publisher asked `author=traveller_voyage` (7 cards); with the whole catalogue loaded, ticking asked nothing.
- Found and fixed on the way: every tick asked for the whole catalogue again. The store's load watcher returned a new array each run, so any change to the address fired it; it now watches a string and asks only when the search, sort, view or account changes. Steadiness rerun after: 22 of 22.
- Not done: the column's counts. The server answers results, not counts, so the counts are still the loaded cards' (exact up to 100 packages).
Gates: test 1928/1967 pass (0 fail), check clean, typecheck, build
Shots: sd_D8_family_1600.png (People, asked of the server)
Questions:
1. Should the server answer the column's counts? Today the store counts the loaded cards, which is exact up to 100 packages and a floor past that. I suggest a proposal for Lane B or Z: `GET /api/packages/facets` with the catalogue's query keys, answering per section the count for each choice over what the other sections let through (the store's rule today, `filters.ts` `facets`). Size: one route over the existing `packages` table and its test, about a day. The alternative is to keep counting in the browser until the store passes 100 packages.

## DF1 (found) A product page seen once — done
Files: apps/web/src/workspace/market/catalogue_memory.ts, apps/web/src/workspace/market/ProductPage.vue, tests/web/catalogue_memory.test.js
What changed:
- A package's page and each version's contents (its hexes and records, immutable once published) are kept in memory for the session, as D2 keeps the catalogue. A return to a package paints at once from memory, then reads the page again behind; contents are read again only when the latest version changed.
- "More by" comes at once from the store's kept "most imported" catalogue; the fresh read is kept for the store too (a later sort by Most imported paints at once).
- A failed read keeps the page on screen with the error line; a 404 still clears it to "Not found".
- Measured (findings/storefront/sd_d9.mjs): a package, back to the store, the package again with its page request held: 0 of 173 frames (1600) and 0 of 179 (390) showed the hero's placeholder or "Reading the package…"; "More by" was there on every frame.
Gates: test 1931/1970 pass (0 fail), check clean, typecheck, build
Shots: sd_D9_return_1600.png, sd_D9_return_390.png (the return, painted while the request is held)
Questions: none

## D9 Two sentences in the map view — done
Files: apps/web/src/views/MapView.vue (words only)
What changed:
- The chart failing to load said the client's own words ("TruthClient: …"); it now says "The chart could not be loaded." whatever the cause.
- "Loading N sector indexes." is now "Loading N sectors." ("Loading 1 sector." for one).
Gates: test 1931/1972 pass, 2 fail, neither mine: `tests/web/changelog.test.js` "the window renders the current release open" (it expects "1.2.6 · 17 October 2026"; the changelog window is Lane E's and M's M7 restyles its dates) and the journal's "two thousand records filter inside one frame" timing test under load (170 ms). check clean, typecheck, build
Shots: none (two status sentences)
Questions: none

## DF2 (found) The map's search said "No results" for "Regi" — done (no fault)
Files: none
What I found:
- The search asks the API (`/api/truth/search`, a D1 full-text table). My private local state has `truth_versions` v10 released but 0 rows in `truth_systems`, so it answers an empty list for any name.
- The live API finds them: "Regi" gives Regina (Spinward Marches 1910), Regiimaa, Reginald, Regis. Not a fault in the app; a private wrangler state needs the chart's systems loaded to search.
Gates: no code changed
Shots: none
Questions: none

## DF3 (found) The Build strip's notes in the look — done
Files: apps/web/src/workspace/build/BuildStrip.vue (style only)
What changed:
- The notes under the "Your map" strip ("This map is your own copy…", "Select an empty hex…", the allowance) take the strip's frame: a `--line-2` edge and the `--frame-glow` halo, so they read as hanging from it. Their signal and attention bars are kept.
Gates: test 1935/1974 pass (0 fail), check clean, typecheck, build
Shots: sd_DF3_notes_{before,after}_{1600,390}.png
Questions: none

## DF4 (found) Build on the store's rail on a cold visit — done
Files: apps/web/src/workspace/market/PackagesView.vue, tests/web/store_harden.test.js
What changed:
- The store offered Build on its rail only once a campaign was open, and only the map opens one, so on a store opened by its address the rail had no Build item while the map's did. It now offers Build to anyone signed in, as the map's rail looks: it opens the map with Build on, and the map opens the campaign. Checked on a cold store as the house: Map, System (off), Campaign, Build, Marketplace, Account at 1600 and 390.
- Note: the check script (`harden_look.mjs`) wrote its shots over `kb30_look_1600/390.png` from `d_store_harden`; they now show the store signed in as the house rather than signed out.
Gates: test 1935/1974 pass (0 fail), check clean, typecheck, build
Shots: kb30_look_1600.png, kb30_look_390.png (retaken; the rail shows Build)
Questions: none

## DF5 (found) A card's kind badge as a 44 px target at 390 — done
Files: apps/web/src/workspace/market/market.css (style only)
What changed:
- Below 640 px the kind badge is 29 px tall (6 px padding above and below), so with its hit area (to the card's edge above, 12 px below) it is about 49 px of target; before, about 41 px (D6's entry).
Gates: test 1937/1977 pass, 1 fail not mine: `tests/web/public_games.test.js` "public games are tracks at the hex tier…" reads `map/MapRenderer.ts`, which Lane L claims (15:15) and is editing. check clean, typecheck, build
Shots: none new (the badge's padding only; measured with findings/storefront/sd_d6_hit.mjs)
Questions: none

## DL5 The map without a GPU: half resolution while moving — done
Files: apps/web/src/map/MapRenderer.ts, apps/web/src/views/MapView.vue, tests/web/map_low_res.test.js (new); findings/storefront/perf_d/ (Lane L's perf driver and script on my ports, `frames.mjs`, `settle.mjs`, `vite.preview.mjs`, `frames.log`)
What changed:
- While the camera moves, the renderer draws at half the device's pixel ratio (the canvas's backing store halves; its CSS size stays, so the browser scales the frame up). When the camera has been still for 160 ms, one frame at full resolution. While it is settling, `draw` asks the caller for another frame, so the sharp frame always comes.
- On where the probe says WebGL is missing (`webglMissing()`, `onWebglState`, Lane L's L5), set by the map view; or, in any browser, once three moving frames in a row came more than 50 ms apart (a frame budget blown). A GPU browser with quick frames is unchanged.
- Measured in Edge without a GPU (`--disable-gpu --disable-3d-apis`), 4x CPU, three ten-step drags, two production builds of the same tree served alternately on 5341, half resolution on and off (frames.log):

| Zoom | On: frames, median, p90 | Off: frames, median, p90 |
|---|---|---|
| Subsector | 75 / 88 frames, 33 ms, 50 ms | 53 / 70 frames, 50 ms, 50–67 ms |
| Hex | 94 / 89 frames, 33 ms, 33–50 ms | 78 / 56 frames, 33 / 83 ms, 50 / 150 ms |

  Lane L's long-task count (perf.mjs) is not the measure here: cheaper frames mean more frames drawn in the same drag, so the count can rise while the map moves more smoothly; the two long-task runs (`perf_before.json`, `perf_after.json`) were also minutes apart under different machine load (the orbit view, which this doesn't touch, rose as much).
- Checked after a drag (settle.mjs): half resolution (766 × 500 for 1532 × 1000) while dragging and through the drag's coast, then full resolution again about 750 ms after release, when the coast ends.
Gates: test 1990/2029 pass (0 fail), check clean, typecheck, build
Shots: none (only the sharpness during motion changes)
Questions: none

## DT1 T1, Cargo and Ledger on a vessel — done
Files: apps/web/src/workspace/VesselTrade.vue (new), apps/web/src/workspace/vessel_trade.ts (new), apps/web/src/workspace/RecordPage.vue (one mount), apps/web/src/workspace/ShipSheet.vue (the rows' binding only), tests/web/vessel_trade.test.js (new)
What changed:
- **Cargo**, on a vessel's page under the Track, in the shared frame: the lots (label, tons, what was paid, where from, notes), a gauge "20 t of 40 t" from the ship sheet's Cargo Capacity (over capacity in amber, with how much; no capacity says where to write it), Remove on each lot, and **Add a lot**: lot, tons, paid (Cr), where (filled with where the ship is now, as the Party tab says it). With a payment, "Post the payment to the ledger, dated 002-1105" (on by default) posts it as an expense dated by the campaign clock: the "when from the clock" of the item, since a lot has no date of its own.
- **Ledger**: the balance in the frame's count, the lines by day, newest day first, each day in the date box with its sum, each line with its kind; and **Add a line**: amount, kind (expense, income, recurring cost), what it is for, day and year (the clock's by default). An expense or a recurring cost is taken off, income added (Lane A's AT1 question 1: the stored amount is the signed change). Money is written by Lane A's `money.ts`; a debit reads "−Cr4,800" (the sign in front, as a register writes it; `formatCredits` itself would write "Cr-4,800").
- **One source with the ship sheet** (Johnny 15:30: yes): `status.cargo` and `status.passengers` are the manifest; the sheet's sixteen Cargo rows and sixteen Passenger rows show it (`sheetView`) and an edit there writes it (`editedSheet`, through Lane A's `cargoFromSheet` / `passengersFromSheet`; lots past sixteen kept; a Passenger Name row's person kept as the lot's `personId`). The sheet keeps only its own boxes. A vessel saved before the manifest has its rows on the sheet: they are its manifest until the first edit moves them. The sheet's look is unchanged. Saves are one commit of the record, as the track's are; no server of its own.
- Checked in the browser on Bright Ledger (local state): a lot added from the section showed in the sheet's Cargo Type 1; typing Grain and 8 into the sheet's row 2 showed in the section; Cargo Capacity 40 on the sheet filled the gauge to "20 t of 40 t". 390 px: targets 44 px.
- Tests: the manifest's boxes, the one source (status, or a sheet from before), the view, an edit (rows past sixteen kept, a cleared row deleted, the rest of the status kept), a passenger's person, dates and signs; SSR of both sections (cargo against capacity, the ledger by day and its balance, the empty states, over capacity).
Gates: test 2003/2042 pass (0 fail), check clean, typecheck, build
Shots: sd_DT1_sections_1600.png, sd_DT1_sections_390.png, sd_DT1_ledger_390.png, sd_DT1_sheet_rows_1600.png
Questions:
1. Should adding a lot with a price post the payment to the ledger by default? I made it a box under the price, ticked, dated by the campaign clock (a lot has no date of its own). I suggest keeping it on by default: buying cargo is the commonest ledger line. The alternative is off by default, so the referee posts it by hand.
2. Should `money.ts` write a debit as "−Cr4,800" (the sign in front) rather than "Cr-4,800"? The sections do so now around `formatCredits`. I suggest Lane A moves the sign into `formatCredits` so every screen writes it one way; the alternative is to leave it to each screen.

## DT2 Refuel and "Post this month" on a vessel — done (one question on starports)
Files: apps/web/src/workspace/VesselTrade.vue, tests/web/vessel_trade.test.js
What changed:
- A third frame on a vessel's page, **Fuel and costs**, beside Cargo and Ledger.
- **Refuel**: where the screen knows the world under the ship (the map's own reading of that hex: Build's row there, else the chart's), it says "At Roup, starport C. Fuel Capacity 40 t." and offers refined or unrefined fuel at the rules file's price (Cr500 and Cr100 a ton, through Lane A's `refuel.ts`), the typed current level, and before posting what it takes on and costs ("Takes on 25 t for Cr12,500."). Post the refuel posts `refuelLine` to the ledger, dated by the campaign clock. Under way, or at a hex the map has not read: "Refuel when the ship is at a world". No Fuel Capacity on the sheet: it says to write it there.
- **This month**: the recurring lines `monthlyLines` would post from the ship sheet's seven cost boxes, each with its amount, and "Post this month: −Cr14,500, dated 002-1105". No cost written: it names the seven boxes.
- No new rule: the price is the rules file's, the costs are typed, there is no dice. The starport class is shown, not judged (question 1).
- Checked in the browser on Bright Ledger at Spinward Marches 2007 (local state): the world read as Roup, starport C; Fuel Capacity 40 and two costs typed on the sheet; 15 t in the tanks took on 25 t for Cr12,500; both posts landed in the ledger.
Gates: test 2004/2043 pass (0 fail), check clean, typecheck, build
Shots: sd_DT2_costs_1600.png, sd_DT2_posted_1600.png, sd_DT2_costs_390.png
Questions:
1. The item says Refuel shows "only where the ship is at a world with a starport". The rules files don't say which starport classes count as one, or which sell refined or unrefined fuel (class X appears only as a red-zone condition in `mgt2e_data.js`), so the screen shows Refuel wherever it knows the world, with the class beside it, and lets the referee judge. I suggest adding to `rules/mgt2e_space_travel.json` the classes that sell refined and unrefined fuel, from the book; the screen then offers only those grades there. The alternative is to keep it as it is: the class shown, the referee deciding.

## DS5 The subsector labels overlap at the top edge — done
Files: `map/titles.ts` (`separateTitles`, `TITLE_GAP`), `map/MapRenderer.ts` (`subsectorTitles` ranks, then separates; `selectedSubsector`; `setTitleTop`), `views/MapView.vue` (`titleTop()` measured on resize); test `tests/web/subsector_titles_apart.test.js`; script `findings/storefront/sd_ds5.mjs`.
What changed:
- Two subsectors side by side, both reaching above the view, held their titles on one line at the top edge: "Spinward Marches - Jewell" ended about 20 px before "Spinward Marches - Regina" began and read as one run of words. Titles are now kept 64 px apart.
- The titles are ranked each frame: the selected hex's subsector first, then a title already showing (so two titles don't trade places while panning), then the subsector with more of it on screen. A title too close to one ranked before it slides sideways to the nearest clear spot, still inside its own subsector and the view; the sticky top edge (y) never moves. With no clear spot it fades out, as a title covering the selected hex already does.
- The sticky edge was a fixed 68 px (under the search row). The map view now measures the search field and the date chip and passes the lower one plus 6 px; on a phone the date sits on a second row, so the title now sticks under it at about 130 px instead of running under the chip. At 1600 the value is unchanged (68).
Gates: test 2026/2065 pass, 0 fail (39 skipped, the API suite); check clean; typecheck; build.
Shots: before = the sweep's own `sd_DS5_before_1600.png`, `sd_DS5_before_390.png` (copies of `x_sweep_s_Spinward_Marches_1910_*`); after `sd_DS5_after_1600.png`, `sd_DS5_after_390.png`, `sd_DS5_after_unselected_1600.png`.
Questions: none

## DS9 "+ Publish" signed out — done
Files: `workspace/market/PackagesView.vue` (`visitor`, the header's two buttons, the empty store's action, `.is-unknown`); test `tests/web/store_harden.test.js` (item 4 updated); script `findings/storefront/sd_ds9.mjs`.
What changed:
- My call, of the two the item allowed: signed out, the header's "+ Publish" becomes **"Sign in to publish"**, a plain button (not the primary colour) at the end of the row, which goes straight to sign-in and comes back to the store. It isn't hidden: a visitor still learns that people publish here, and how to start.
- Signed in, nothing changes: "My packages" and "+ Publish", which opens the chooser.
- Until the session is known (a cold visit), the Publish button holds its place unseen, so a visitor never sees "Publish" flash before it turns into "Sign in to publish", and the row doesn't move.
- The empty store ("No packages yet") does the same: signed out, its action is "Sign in to publish".
Gates: test 2033/2072 pass, 0 fail; check clean; typecheck; build.
Shots: before `sd_DS9_before_signed_out_390.png` (the sweep's `x_sweep_packages_390.png`); after `sd_DS9_after_signed_out_1600.png`, `sd_DS9_after_signed_out_390.png`, `sd_DS9_after_signed_in_390.png`.
Questions: none

## DU3 "Where is everyone" on one card — done
Files: `workspace/party_everyone.ts` (new: `everyoneWhere`), `workspace/PartyPanel.vue` (the card, `locateRow`, the locate ending when a row's place changes, styles); test `tests/web/party_everyone.test.js`; scripts `findings/storefront/sd_du3.mjs`, `sd_du3_people.mjs`, `sd_du3_390.mjs`.
What changed:
- The Party tab's first frame, under "Where are we", is **Where is everyone**: each party ship in order (the lead marked), with where it is at the campaign date (`vesselWhere`: the strip's words under way, otherwise the place and its hex). Under each ship, set in, the people aboard it ("Aboard Bright Ledger"); then the people aboard no ship ("Ashore · Spinward Marches 1719").
- Every row with a place has its own **Locate**: the map flies there and the line runs from that row's button, which reads "Locating" until pressed again. A person aboard locates their ship's place. If a row's place changes under its locate (the date moves, the ship sails), the locate ends, as the Where block's does.
- With no ship in the party nobody is "ashore" (`party.ts` `isAboard`): those rows say the place alone. A row with nowhere to go says "Nowhere in particular" and has no Locate.
- At 390 a row stays on one line (name over place, Locate at the right); nothing overflows.
- In my local test campaign I added two people to the Free traders party through "Add someone", one aboard Bright Ledger and one aboard no ship (local state only).
Gates: test 2046/2086 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DU3_before_1600.png`, `sd_DU3_before_390.png` (the tab with the new card hidden by a style, since the card is the only change); `sd_DU3_after_1600.png`, `sd_DU3_after_locate_1600.png` (the line from the row to Roup), `sd_DU3_after_390.png`, `sd_DU3_after_card_390.png`.
Questions:
1. Where is a party member who is aboard no ship? The code gives three answers. `party.ts` and `memberWhere` say the party's own anchor. The people rows under "The party" say the lead ship's place. The person's own record has an anchor too. In the test campaign the party's anchor is empty, so `memberWhere` said "nowhere" for Cal Derrow, though his record says Spinward Marches 1719. Recommended: the party's anchor when it has one, else the person's own record. The card does this now, so `memberWhere` keeps its answer where it has one. The people rows' line would then move to the same rule (a one-line change in `PartyPanel.vue`, not made). Alternative: always the person's own record, since "aboard no ship" usually means they went somewhere on their own.

## DU36 The map's own help, in place — done
Files: `workspace/map_help.ts` (new: the lines, `HELP_KEY`, `helpDue`), `workspace/MapHelp.vue` (new: the "?" and the card), `views/MapView.vue` (mounts it; `helpSeen`, `helpAuto`, `helpWasSeen`); test `tests/web/map_help.test.js`; script `findings/storefront/sd_du36.mjs`.
What changed:
- A round **"?"** at the map's bottom right (the corner nothing else uses; 44 px on a touch screen) opens **Using the map** above it: a card in the frame look, with keys in `kbd` boxes. Esc or × closes it and focus goes back to "?"; "?" opens it with focus on ×. It ends with "The rest is in Help", linking `/help`.
- **It opens by itself once, then never again**: only after a first visit's line of help has ended (dismissed, or a hex opened), with the chart drawn and no pane or Build over the map, so a newcomer never gets two tips at once. Opened either way, it is remembered (`voyage_map_help_seen`). Opened by itself, it takes no focus.
- **Every line is pinned to the code that does it** by the test: drag, wheel, arrows, + and - (`map/input.ts`), Home (the Home view command), click, double-click to the orbit view (MapView), and, for someone signed in with a campaign, Build's S, Shift+drag (Alt+Shift+drag takes away), Space+drag, U I O / N M , (with Shift, add), right-click (`build/pointer.ts`, `build/commands.ts`, MapView).
- A touch screen (`pointer: coarse`, done in CSS, no window access) reads its own lines: drag, pinch, tap, and with Build on, drag with Select hexes on (two fingers still move the map). No double-tap line: I didn't verify that a double tap reaches the orbit view.
- Hidden while a public ship's sheet is open, since on a phone the sheet runs along the bottom.
Gates: test 2049/2090 pass on the first run with 1 failure that didn't repeat; second run 0 fail (the flaky timing test noted earlier, another lane's); check clean; typecheck; build.
Shots: `sd_DU36_before_1600.png`, `sd_DU36_before_390.png` (the map with the help hidden by a style); `sd_DU36_after_1600.png` (opened by itself, signed in: Build lines), `sd_DU36_after_390.png` (touch emulated: the touch lines).
Questions: none

## D5 Map covers at card size (crop at upload, Johnny 18:40) — done
Files: `workspace/market/cover_trim.ts` (new: `chartTrim`, `lumaOf`), `workspace/market/cover_image.ts` (`trimmedChart`; `prepareCover(file, encode, trim)` reports `trimmed`), `workspace/market/CoverEditor.vue` (`map` prop, the sentence, the "Trimmed" line), `workspace/market/ProductPage.vue` and `PublishFields.vue` (pass `map` for a map or system package); test `tests/web/cover_trim.test.js`; script `findings/storefront/sd_d5_trim.mjs`.
What changed:
- When the author of a **map or system** package (the kind's family, `PACKAGE_KIND_FAMILIES`) adds a cover, the picture is looked at 400 px wide. If it is a screenshot of the map (at least 85 % empty dark chart), it is cut to the box round the bright pixels (worlds, names, UWPs). The box is padded 12 %, widened to the card's 16:9, and moved inside the picture rather than cut. Then the 1600 px and 640 px files are made as before. Nothing changes on the server or in the stored data.
- **Kept whole:** a picture that isn't mostly dark chart (the eight default paintings are 3 to 62 % dark, so none would be cut), a map whose systems already fill it (a cut would keep over 70 %), any other kind of package, and a browser without OffscreenCanvas.
- Hollow Verge's 1600 × 900 screenshot: 98 % dark, systems in 18 % of it. Added through the product page's cover editor (local state), the card shows the six systems close enough to make out worlds and names. The editor says "Trimmed to the systems, so they read on a card.", and its note tells a map's author that the empty chart is trimmed away.
- Existing covers stay as they are until re-added (the live Hollow Verge, the Feri terraces example). The examples would need re-adding by whoever owns `tools/examples`, in `tools/`, not mine.
Gates: test 2056/2097 pass; 1 fail, `tests/api/preview_tags.test.js`, Lane B's file, claimed by B at 19:20 and being written now (Needs from others: none, it is theirs in progress); check clean; typecheck; build.
Shots: the two ways compared earlier `sd_D5_covers_compare.png`; `sd_D5_card_before_1600.png`, `sd_D5_card_before_390.png` (the local Hollow Verge with no cover: the default painting); `sd_D5_editor_after_1600.png`; `sd_D5_card_after_1600.png`, `sd_D5_card_after_390.png` (the trimmed screenshot).
Questions: none

## DF18 The publish form warns about a referee-only record — done
Files: `workspace/market/market.ts` (`REFEREE_ONLY_NOTE`, `refereeOnly`), `workspace/market/RecordsPublish.vue` and `PublishForm.vue` (the line), `workspace/market/PublishFields.vue` (`.mk-rec-note`, the record row wraps); test `tests/web/publish_referee_only.test.js`; script `findings/storefront/sd_df18.mjs`.
What changed:
- In both publish forms (Publish records, and Publish selection's "Records on these hexes"), a chosen record that is referee-only (`visibility: 'referee'`) has one line under it, past its box: "This record is referee-only. Its "For players" text is published as it stands." Untick it and the line goes; a record players can see has none.
- No change to the data or to what is sent: the forms still send the chosen ids.
- Checked in Publish records on the local Free traders campaign: no lines with nothing chosen, 5 of 28 after Select all, 4 after unticking Cal Derrow. At 390 the line wraps under the name, with no overflow. Publish selection's line is checked by the test, not in the browser.
Gates: test 2064/2105 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DF18_lines_1600.png`, `sd_DF18_lines_390.png`.
Questions: none

## DU4 Phone pass on the five table screens — done
Files: `workspace/campaign_touch.css` (new), `workspace/CampaignPanel.vue` (one import line, released at once), `shell/Panel.vue` (the sheet's close and back 44 px, the grab bar 32 px); test `tests/web/campaign_touch.test.js`; script `findings/storefront/sd_du4.mjs` (measures each screen).
What changed:
- Measured at 390 × 844, touch emulated, in the local Free traders campaign: the party, a record's page (Bright Ledger), the journal, the timeline, the dice (2D rolled). **Nothing scrolls the page sideways** on any of them, and nothing sticks out past the window. Every panel is already the bottom sheet below 600 px.
- **Thumb size.** Before, nearly every control was under 44 px: party 36 of 36, record page 311 of 387, journal 14 of 14, timeline 16 of 16, dice 60 of 88. The worst were the campaign tabs and the dice row (33), Locate and Change (30), the Referee/Players switch (25), the ship sheet's tab row (25), link chips (25), and the sheet's close (30). Below 600 px every button, tab, switch, select and chip button in the campaign panel is now 44 px tall, and icon buttons 44 px square. After: party 11 under 44, record 245, journal 2, timeline 3, dice 2. What is left: the inline words, which keep their look and get a hit area reaching 44 px (the date's "Set it", the breadcrumb, a party member's name, a tag's ×); the 32 px full-width grab bar; and the ship sheet's typed cells.
- **The three tabs on one row.** The Party tab's line ("Bright Ledger and Cold Manif…") made Records, Party and Journal stack, one row each, eating a half-height sheet. On a phone the line is hidden (the Party tab says it at its top), and the header is shorter than before even with 44 px controls.
- **Not changed, my call:** the ship sheet's tables (turrets, cargo, crew) stay wider than the phone and scroll sideways inside their own frame, as built (5 tables, 339 to 519 px in 320 px). Stacking 16 cargo rows of three fields into cards would make the sheet several screens long. Their typed cells stay 26 to 28 px tall: they are wide, and 44 px rows would double the sheet. If you want them stacked, that's a ShipSheet change (M3's file), and I'd propose it as its own item.
Gates: test 2069/2110 pass, 0 fail; check clean; typecheck; **build fails in `views/OrbitView.vue` line 1923**: Lane C's file, claimed 19:36 and being edited (Needs from others: C, the `ships` argument type at OrbitView.vue:1923). My files build.
Shots: `sd_DU4_{party,record,journal,timeline,dice}_before_390.png` and `_after_390.png`.
Questions: none

## DU27 Portraits in rows — done (already in place; checked and pinned)
Files: test `tests/web/portraits_in_rows.test.js` (new); scripts `findings/storefront/sd_du27.mjs`, `sd_du27_faces.mjs`. No app code changed.
What I found:
- All four places U27 names already draw the record's first image as its avatar: the records list (`CampaignList.vue`), the party (`PartyPanel.vue`, ships and people, and the new "Where is everyone" card), the hover card (`RecordCard.vue`) and the timeline (`TimelineList.vue`, from `timeline.ts`, which passes the record's images). All use `RecordAvatar`, which shows `primaryImage` (the gallery's first) and the kind's icon without one.
- Checked in the browser: in the local Free traders campaign no record had an image, so I gave two one through the record page's avatar slot (Bright Ledger, the ship painting; Ara Silt, the people painting; local state only). Their portraits show in the records list, the party (4 of 8 avatars: each appears twice, in Where is everyone and in its own list) and the hover card, at 1600 and 390. The timeline has no rows in this campaign, so the test pins it instead.
- The test pins all four, so a later change can't drop the portraits silently.
Gates: test 2073/2114 pass, 0 fail; check clean; typecheck; build (green again: Lane C's OrbitView.vue error from DU4's gates is gone).
Shots: `sd_DU27_list_1600.png`, `sd_DU27_list_390.png`, `sd_DU27_party_1600.png`, `sd_DU27_party_390.png`, `sd_DU27_timeline_1600.png`, `sd_DU27_timeline_390.png` (empty here), `sd_DU27_hover_1600.png`.
Questions: none

## DF6 Take half resolution out: the map always draws sharp — done (with a proposal)
Files: `map/MapRenderer.ts` (DL5's constants, fields, `applyScale`, `setLowResWhileMoving`, `lowResolution`, `settleScale` removed; `resize` and `draw` as committed), `views/MapView.vue` (the WebGL hook-up, `stopWebgl` and `data-low-res` removed); `tests/web/map_low_res.test.js` deleted; scripts `findings/storefront/perf_d/sharp.mjs`, `profile.mjs`, log `perf_d/sharp.log`.
What changed:
- DL5 is gone entirely: every frame draws at the device's full resolution, in every browser. Nothing else used the settle logic, so it went too. No source or test refers to it any more.
- **Measured** in Edge without a GPU (`--disable-gpu --disable-3d-apis`, port 9541), the production build, 1600 × 1000, three drags of ten steps, per zoom. Frames per second, median frame interval, and the renderer's own drawing time per frame:

  | Zoom | Real speed | 4× CPU slowdown |
  |---|---|---|
  | Galaxy (z 2) | **33 fps**, 33 ms, draws in 33 ms | **8 fps**, 183 ms, draws in 190 ms |
  | Dots tier (z 12) | 60 fps, 17 ms, 1 ms | 18 fps, 67 ms, 4 ms |
  | Hex (z 40) | 60 fps, 17 ms, 1 ms | 34 fps, 33 ms, 5 ms |
  | Hex with names (z 80) | 60 fps, 17 ms, 2 ms | **6 fps**, 167 ms, 38 ms |

  At real speed only the galaxy tier is under 60 fps. Under 4× slowdown, the galaxy and the names zoom are the slow ones.
- **By eye** (shots mid-drag): the dots tier and the hex tier are sharp on every frame. I zoomed in from the dots tier with six wheel notches, a shot after each, and **saw no dot drawn twice**. What I did see: where a subsector or sector line crosses a dot, the line is painted over it, and the dot reads as two halves (`sd_DF6_zoom_step2_crop.png`, enlarged). That may be what looked like doubling. It's a found item (DF10).
- **Where the time goes** (CPU profile of one drag):
  - **Galaxy:** 71% is `fillRect`. `overviewPoints` draws every system of every sector on screen as its own 1 px rectangle, each frame, with no culling.
  - **Hex with names, 4×:** 72% is the browser's own software rasterising outside the script, and `fillText` is the largest script cost at 8%.
- **Proposal (cheaper drawing, never blurrier):**
  1. **The galaxy dots, batched and kept.** Draw each sector's dots once into a small bitmap at the current zoom, and keep it. A pan then blits one image per sector; a zoom step redraws the bitmaps. Skip sectors off screen. The pixels are the same, so it's as sharp as now; I expect galaxy frames to drop from 33 ms to a few ms. Size: `overviewPoints` and a cache keyed by sector and zoom step, half a day.
  2. **World labels as cached sprites** at the names zoom. Each world's name and UWP block is rasterised once per zoom step into a sprite, then blitted. Text is what software rasterising pays most for. Size: a day; it touches `chartText` and `marks`, and needs a careful look at crispness on DPR 2.
  Both are mine (`MapRenderer.ts`). I've put item 1 under Found by me as a proposal (DF9). Item 2 waits for your word, since real-speed frames at that zoom are already 60 fps.
Gates: test 2069/2110 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DF6_dots_mid_drag_1600.png`, `sd_DF6_hex_mid_drag_1600.png`, `sd_DF6_zoom_step1_1600.png` … `step6`, `sd_DF6_zoom_step2_crop.png`.
Questions: none

## DF7 The panel header at Column width — done
Files: `shell/Panel.vue` (CSS only); script `findings/storefront/sd_df7.mjs`.
What changed:
- At Column, a header with a location line is now **two rows**:
  - The title and its hex badge across the top, with back and close in the top-right corner.
  - Then the location line, with the Column/Half/Full switch beside it.
  - Before, everything shared one row. With "Tremous Dex system" (or Johnny's Raprtsinsh with Back showing) the badge dropped under the title and the switch crowded it. There were only 17 px to spare even for Raprtsinsh without Back.
  - The header is now 78 px tall instead of 94; Half is 69.
- **Half and Full** keep their one row. **A phone** is the bottom sheet with no switch, and is unchanged.
- **Every panel that uses the header** gets this, since the CSS sits in the shared `Panel.vue`, and it applies wherever there is a location line (the dossier's systems, sectors and subsectors).
  - The campaign panels (party, records, journal) have a breadcrumb but no location line. They already fit, so they keep one row; a row holding only the switch would make them taller for nothing.
  - The store is a page, not a panel.
- With Back showing, the title row leaves room for both buttons (68 px). The shots don't show Back: opening a system from the search replaced the pane rather than stacking it, so Back didn't appear.
Gates: test 2082/2126 pass; 2 fail, neither mine: `tests/web/cold_load.test.js` (Lane E claims it and `router.ts` and is adding `/changes/:version`) and `tests/api/players_logic.test.js` (a server test, the players work in progress). check clean; typecheck; build.
Shots: `sd_DF7_{dossier,dossier_long,party,record}_{column,half,full}_{before,after}_1600.png` (header crops), `sd_DF7_dossier_back_*` (the same dossier opened from the search), `sd_DF7_dossier_{before,after}_390.png`.
Questions: none

## DF8 Hover on what can be clicked when zoomed out — done
Files: `map/hover_hit.ts` (new: `worldUnder`, `worldRing`, the sources' shape), `workspace/ChartHover.vue` (new: the ring and data block layer), `map/MapRenderer.ts` (`markRing`, `farLabelName`), `views/MapView.vue` (`hoverSources`, `placeAt`, `chartHoverMark`, `queueChartHover`, `paintChartHover`, the `data-hoverable` cursor, the layer in the template); test `tests/web/chart_hover.test.js`; script `findings/storefront/perf_d/hover.mjs`.
What a click opens today below the hex tier (read from `chartClick`), in its order:
- A track in the zoomed-out traffic flies the camera in to its hex.
- The party's marker (or a party ship's) opens the Party tab.
- A vessel's marker opens its record.
- A hex that holds a world (the overview's cell) opens its system. This is the "overview dot", and also the chart's disc when its sector is loaded: the same hex.
- Not clickable: a sector or subsector name, and a far label's text (only its world's dot is). Your own systems' dots, with Build off, aren't in the chart's overview, so a click there does nothing; with Build on, Build's own hover already says what a press does (slots, your sectors).
What changed:
- Each of those now has **the same hover**: the pointer cursor, a ring in the signal colour on the thing under the mouse, and a small data block beside it in the Build chip's type.
  - **A world:** its name and place where the loaded data has them ("REGINA" over "Spinward Marches 1910"). Otherwise the sector and hex, with "Select to open its system".
  - **A track:** where it is, with "Ships here. Select to zoom in."
  - **The party:** "The party", with "Select to open the Party tab."
  - **A vessel:** its name, with "Select to open its record."
- **One rule for both:** the world under the mouse is found by the click's own test (the canonical sector, then the overview's cell), and the marks are tried in the click's order. The hover never promises what a click won't do.
- **Never a fetch:** the words come from the sector's index only if it is already loaded, else the far labels the renderer already holds.
- **Cheap:** the hit-test runs at most once a frame (on pointer move, and after a frame drawn under a still mouse, so the ring follows a wheel zoom). It draws on its own layer, set directly like Build's hover; the chart doesn't redraw for it. It hides while dragging, at the hex tier (which has its own marks), in Build, and while a place is being picked.
- **Touch:** nothing. A finger gives the map no pointer position, so a tap behaves as before.
- **Checked in Edge without a GPU**, the mouse walking out from the middle:
  - At the dots tier (z 12) and the subsector tier (z 20): over a world the cursor becomes the pointer, and the ring and "SPINWARD MARCHES 2110 / Select to open its system" show. A click there opened Yori (2110). Off every world: no ring and the normal cursor.
  - Sharp on every frame (DF6).
  - Not checked in the browser: a zoomed-out track and the party's marker. My local state has no public traffic, and the party isn't drawn far out here. Both use the same layer and the renderer's own hit-tests.
Gates: test 2088/2131 pass; 1 fail, `tests/api/players_logic.test.js` (the players work in progress, not mine); check clean; typecheck; build.
Shots: `sd_DF8_dots_hover_1600.png`, `sd_DF8_subsector_hover_1600.png`, crops `sd_DF8_*_hover_crop.png`, `sd_DF8_dots_ring_zoom.png`.
Questions: none

## DT1c Owners, Payment, Fuel, Upkeep on the vessel — done
Files: `workspace/VesselTrade.vue` (the Owners and payment frame; Fuel aboard in Fuel and costs), `workspace/vessel_trade.ts` (`statusWithTrade` carries owners, payment and fuel aboard); test `tests/web/vessel_trade.test.js` (+2); script `findings/storefront/sd_dt1c.mjs`. Built on Lane A's `campaign/ship_finance.ts` and `refuel.ts` (AT1c).
What changed:
- **Owners and payment**, a new frame between Ledger and Fuel and costs, with three parts:
  - **Owners:** each holder with the shares typed (editable in place) and their part of the total ("30%", arithmetic on the typed counts, not a price), the total at the top ("100 shares"), and × to remove. **Add an owner** picks a person or organization from the campaign, or **The party**, then asks for the shares.
  - **Payment:** as typed, "Cr12,000 every 28 days to Regina Bank". Then "Due in 6 days", or "Due today" / "Overdue by 4 days" in the look's warning colour (`--attention`), with the next due date in the date box. **Pay now: −Cr12,000** posts the ledger line, dated today, and moves the next due date on by the typed period (`payNow`). **Set a payment** or **Change** opens the form: the amount starts from the Mortgage Cost box, and no period is filled in, as AT1c says.
  - **Upkeep:** one figure, "Cr14,500 a month", the five recurring boxes summed (`upkeep`: Mortgage, Maintenance, Life Support, Salary, Running), with each part listed below it.
- **Fuel**, in Fuel and costs: a gauge "31 t of 40 t" from `status.fuelTons` against the sheet's Fuel Capacity, and **Fuel aboard (t)**, typed and saved at once.
  - Refuel now reads the level from there, not from a box that forgot it.
  - Posting a refuel **fills the tanks**: the fuel aboard becomes the capacity, and the line says "The tanks are full."
- Checked in the browser on Bright Ledger (local state): Ara Silt with 30 shares and the party with 70 show 30% and 70%. The payment form offered 12,500 from the Mortgage Cost box (I typed 12,000). "Due today", then Pay now: the line posted and the next due date moved to 030-1105. Fuel 31 t of 40 t. At 390 nothing overflows.
Gates: test 2095/2138 pass; 1 fail, `tests/api/players_logic.test.js` (not mine, the players work); check clean; typecheck; build.
Shots: `sd_DT1c_before_1600.png`, `sd_DT1c_owners_1600.png`, `sd_DT1c_fuel_1600.png`, `sd_DT1c_owners_390.png`.
Questions: none

## DT3b Roll a passenger on the vessel — done
Files: `workspace/passenger_roll.ts` (new: `rollWords`, `passengerSummary`, `keptPassenger`), `workspace/VesselTrade.vue` (the Passengers section, `rollOne`, `keepRolled`); test `tests/web/passenger_roll.test.js`; script `findings/storefront/sd_dt3b.mjs`. The roll is Lane A's `campaign/passengers.ts` (AT3b), reading `rules/mgt2e_random_passenger.json` through its one function, so a chosen table can later replace it.
What changed:
- The vessel's page has a **Passengers** section after Cargo. It lists the same passengers the ship sheet's Passenger rows edit, each with its class; a passenger who is a person opens that person.
- **Roll a passenger** shows the dice thrown, as small boxes, and what they say, as the backlog writes it: "34 · Causes Trouble · 5: Violent", "36 · Engineer · Mechanic 2, Engineer 0", "11 · Refugee – Political". That is the entry's printed words up to its bracket, then the second die and its outcome, or the rolled skills. Then **Keep**, **Roll again** or **Cancel**.
- **Keep** commits one change. Then the person's page opens with the name marked, so typing replaces it.
  - **The person:** kind "passenger", named "Passenger", aboard the ship. Its summary is the printed text whole, then what was rolled ("Causes Trouble (1–3: Drunkard, 4–5: Violent, 6: Insane) · Violent").
  - **The link:** the person to the ship, as a passenger.
  - **The ship's list:** the person added, with no class and no fare (T3 leaves those to the referee).
- Nothing is read into the words beyond the file's.
- Checked in the browser on Bright Ledger (local state):
  - Rolled "66 · Hijacker or Pirate Agent", then rolled again: "32 · Wants to Stowaway or Join the Crew".
  - Keep opened "Passenger" with its name field being typed in, showing "Passenger on Bright Ledger".
  - Back on the ship, Passengers shows 1.
Gates: test 2098/2141 pass; 1 fail, `tests/api/players_logic.test.js` (not mine, the players work); check clean; typecheck; build.
Shots: `sd_DT3b_rolled_1600.png`, `sd_DT3b_rolled_390.png`, `sd_DT3b_kept_1600.png`.
Questions: none

## DF9 The galaxy dots batched and kept — done
Files: `map/MapRenderer.ts` (`overviewPoints`, `sectorDots`, `dotTile`, the `DotTile` type, `dotTiles`, `lastDotPpp`; `PPP_DOTS` imported); test `tests/web/galaxy_dots.test.js`; scripts `findings/storefront/perf_d/galaxy.mjs`, `same_pixels.mjs`, log `perf_d/galaxy.log`.
What changed:
- **At the galaxy zoom** (below the dots tier), each sector's dots are drawn once into a small bitmap and copied while the map pans: one copy a sector instead of one `fillRect` a system.
  - The zoom must hold still for one frame before the bitmaps are made, so a zoom in progress draws dot by dot as before.
  - A new zoom, pixel ratio, ink or set of cells (an overlay of your systems) drops or redraws a sector's bitmap.
  - Only sectors on screen are drawn, as before.
  - The dots tier and nearer never use bitmaps; they took about 1 ms a frame already.
- **Same pixels:** every dot now sits on a whole device pixel, whether drawn or copied, with the same arithmetic (whole-pixel origin plus rounded offset). Checked in Edge without a GPU on the same galaxy view, shot with bitmaps and with `OffscreenCanvas` taken away (dot by dot):
  - The two differ in 453 pixels; two dot-by-dot shots a few seconds apart differ in 417 (the map's own animation). So the copies are the drawn dots.
  - The one change from before: a dot that fell between pixels used to be smeared over two. It is now a crisp square on one. Sharper, never blurrier.
- **First tried, and dropped:** one path for all the dots, filled once. The script's drawing fell from 33 ms to 7 ms, but frames got slower (20 fps), because rasterising one huge path cost more than the rectangles. Measured, then reverted.
- **Measured** in Edge without a GPU, the production build, 1600 × 1000, three drags, galaxy zoom 2:

  | | Before (DF6) | After |
  |---|---|---|
  | Real speed | 33 fps, median frame 33 ms, drawing 33 ms | 46 fps, 17 ms, 2 ms |
  | 4× CPU slowdown | 8 fps, 183 ms, drawing 190 ms | 11 fps, 117 ms, 10 ms |

  At zoom 1 and 4 the median frame is also 17 ms at real speed. What's left at 4× is the browser's own painting of the polity fills and borders, not the dots.
Gates: test 2103/2146 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DF9_pixels_tiles.png`, `sd_DF9_pixels_direct.png`, `sd_DF9_pixels_direct2.png` (the same-pixels check), `sd_DF9_galaxy_pixel_tiles_1600.png`.
Questions: none

## DU3b A party member aboard no ship, one rule — done
Files: `workspace/party_everyone.ts` (`standsAt`, now the one rule; the card uses it), `workspace/PartyPanel.vue` (each people row's `standing` from `standsAt`; the old panel-wide `standing` and two unused imports removed), tests `tests/web/party_everyone.test.js` (+1, and the panel pinned) and `tests/web/party_panel_public_e.test.js` (one assertion: it pinned the old `{{ standing }}`; now `{{ row.standing }}`. Not another lane's claim; changed only because this item replaces what it checked).
What changed:
- As decided at 20:30: a party member aboard no ship is where the party's own anchor says, when it has one; otherwise where the person's own record is. The "Where is everyone" card and the people rows under "The party" now both say this, from one function.
- Before, the people rows said the lead ship's place for everyone aboard no ship.
- Checked in the browser (local state): Cal Derrow, aboard no ship, with the party's anchor empty, reads "Spinward Marches 1719" (his record) in both places. Before, his row said the lead ship's "Spinward Marches 2007".
Gates: test 2107/2150 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DU3b_party_1600.png`.
Questions: none

## DF10 Lines painted over dots — done
Files: `map/MapRenderer.ts` (`draw`: zoomed out, the dots are drawn after the subsector and sector lines; a stale DL5 comment removed); test `tests/web/galaxy_dots.test.js` (+1, the order); script `findings/storefront/perf_d/dots_lines.mjs`.
What changed:
- At the dots and galaxy tiers the order is now: sector borders, polity fills and borders, subsector lines and bright sector borders, then the dots. A line crossing a system's dot no longer paints over it, so the dot no longer reads as two halves.
- The hex tier is unchanged: the dots there stand in while a sector loads, under the hex layers, as before.
- Removed a comment I left in `draw` with DL5 ("At half resolution the caller draws again…"); DF6 had removed the code but not that line.
Gates: test 2108/2151 pass, 0 fail; check clean; typecheck; build.
Shots: before `sd_DF6_zoom_step2_crop.png` (the split dots); after `sd_DF10_dots_after_1600.png`, `sd_DF10_dots_after_crop.png` (enlarged: the dots on the lines are whole).
Questions: none

## DT2b Naval or scout, on a party vessel — done (one need from A)
Files: `workspace/VesselTrade.vue` (Refuel offers what the world sells; the mark; a base's typed price), `workspace/vessel_trade.ts` (`fuelMarkOf`, `FuelMark`; `statusWithTrade` carries the mark); tests `tests/web/vessel_trade.test.js` (+2); script `findings/storefront/sd_dt2b.mjs`. Built on Lane A's `fuelOffers` (AT2b) and `rules/mgt2e_space_travel.json` `fuel.byStarportClass` and `fuel.bases`. This also answers my DT2 question about which starport classes sell which grade: the rules file now says.
What changed:
- **Refuel offers what the world sells**, from the rules file: the grade the starport's class sells at the file's price. A class that sells none (E, X) says "No fuel is sold here: starport X sells none." The old free choice of refined or unrefined is gone.
- **The mark:** on a vessel in the party only, a referee choice under Fuel, "Base fuel (referee only)": Not marked, Naval vessel, or Scout ship. It is saved at once.
- **Base fuel:** when the world has the base the mark names, Refuel adds "Refined at the scout base, at the price you type". Choosing it asks for **Price (Cr a ton)** (the file leaves it to the referee). Nothing posts until a price is typed, and the line reads "Refuel, refined, scout base, 9 t". Corsair and Way Station bases offer nothing, as the file says.
- Checked in the browser at Roup (starport C, a scout base), on Bright Ledger (local state):
  - Unmarked: "Unrefined at the starport, Cr100 a ton".
  - Marked naval: the same (no naval base there).
  - Marked scout: the scout base's refined fuel is added. Price typed 400: "takes on 9 t for Cr3,600".
  - Cleared: back to the starport alone.
Gates: test 2111/2155 pass; 1 fail, `tests/api/players_logic.test.js` (not mine, the players work); check clean; typecheck; build.
Shots: `sd_DT2b_refuel_1600.png`, `sd_DT2b_refuel_390.png`.
Needs from others:
- **A (shape) and the players view:** the mark is stored as `status.fuelMark`, which `RecordStatus` lets through as a free key. `packages/shared/src/players_view.ts` `projectStatus` copies free keys to the players, so the mark would show on a players-visible vessel. To keep it referee-only, add `fuelMark: z.enum(['naval', 'scout']).optional()` to `RecordStatus`, and drop `fuelMark` in `projectStatus`: one `if (key === 'fuelMark') continue;`. Not mine, so not done. Until then, players' access isn't live, so nothing has leaked.
Questions: none

## DF11 The galaxy's polity fills and borders as one kept layer — proposal
Files: none changed. Profile with `findings/storefront/perf_d/profile.mjs 2 4`.
What I found:
- After DF9 the galaxy zoom's script is small: drawing about 10 ms a frame at 4× CPU in Edge without a GPU, 2 ms at real speed. But a frame at 4× is still about 117 ms. The profile puts 87% of it in the browser's own painting, outside the script: the large translucent polity fills and their borders, rasterised in software every frame.
- At real speed the galaxy zoom is already at a 17 ms median (46 to 51 fps), so this matters only on a slow machine.
The way, if wanted: draw the galaxy's still layers (polity fills, borders, sector borders, the dots) once into a bitmap a little larger than the view, and copy it while the map pans; redraw when the pan passes the margin or the zoom changes. Names, tracks and the selection stay drawn each frame on top. The copy must land on whole device pixels, as DF9's does, and be checked the same way (bitmap against direct, against the noise of two direct shots).
- The care it needs: the layers drawn on top must not drift against the copy by a fraction of a pixel while panning.
- Size: a day, in `MapRenderer.ts`.
Questions:
1. Build the kept galaxy layer now, or only if a real machine is slow at the galaxy zoom? I recommend only if a real machine is slow: real speed is already 17 ms, and this adds the most complex cache in the renderer. Alternative: build it now, so the 4× case reaches about 30 to 40 ms.

## DF12 "Post this month" posts the Purchase Cost every month — question
Files: none changed.
What I found:
- On a vessel, This month posts one recurring line per cost box with a number, from Lane A's `refuel.ts` `MONTHLY_COST_FIELDS`. That's seven boxes: Purchase, Mortgage, Maintenance, Fuel Tank, Life Support, Salary, Running. So a ship whose sheet says "Purchase Cost 5,000,000" posts −Cr5,000,000 every month.
- Beside it (DT1c), the Upkeep figure sums Lane A's `ship_finance.ts` `UPKEEP_FIELDS`: five boxes (Mortgage, Maintenance, Life Support, Salary, Running). So the page shows two monthly figures that disagree.
Questions:
1. Should "Post this month" post the five upkeep boxes, the same figure Upkeep shows? I recommend yes: the purchase price is paid once, and the Fuel Tank Cost reads as a refuel's price, which Refuel already posts. The change is in Lane A's `refuel.ts` (`MONTHLY_COST_FIELDS` → the upkeep five) and my screen's words. Alternative: keep all seven, and show why the two figures differ.

## LS3 Living systems: the switches — done
Files: `packages/shared/src/schemas/campaign.ts` (`CampaignSettings.living`, optional), `apps/web/src/living/quiet.ts` (new: `QUIET_KEY`, `device`, `setQuiet`, `livingOf`, `livingShown`, `livingChange`), `apps/web/src/workspace/LivingSettings.vue` (new), `apps/web/src/workspace/AccountMenu.vue` (one mount line and its import); tests `tests/shared/campaign.test.js` (+1), `tests/web/living_settings.test.js` (new), `tests/api/campaign.test.js` (the Worker suite's settings case extended); script `findings/storefront/sd_ls3.mjs`.
What changed:
- **The schema:** `living: { chatter, traffic }` in the campaign settings, as the spec writes it. Optional: a row from before parses, and absent means both off. No migration: the settings document is stored whole. The players' view carries it (settings minus rev), so players get the referee's choice; the test checks that.
- **The referee's switches**, in the account menu beside this campaign's other switches (public games, my name, the course):
  - **Show system chatter**: "Short radio and news lines while a system is open. Players see them too."
  - **Show background traffic**: "Ships that come and go in the orbit view. They're scenery, not tracked ships."
  - Each is written as one settings change on the held revision, the whole document otherwise as it was, as the party's writes are.
  - Why the account menu: the spec offered the campaign panel or a new component mounted by one line. The campaign panel has no settings area, while the account menu already holds this campaign's switches.
- **Quiet on this device**, under them: "Hides chatter and background traffic on this device only." It is stored as `voyage.living.quiet` and wins over the referee's switches. `livingShown(settings, quiet)` is what LS4's ticker and LS5's traffic should read.
- **Read-only:** someone who can't change the campaign (a player, once their client mounts it) sees the switches disabled, with "The referee turns these on or off for the campaign." Their quiet stays theirs.
- **Checked in the browser** as the house (local state): turned both on, reloaded, and both were still on (the server kept them). Quieted the device, reloaded, and it was still quiet. Then I set all three back off.
- **The Worker suite** (`RUN_API_TESTS=1 tests/api/campaign.test.js`, on my ports 8941 and 9941 with a throwaway migrated state): writing `living` on the held revision is applied, and the next read returns it. Passed.
Gates: test 2129/2172 pass, 0 fail; check clean; typecheck; build; the Worker campaign suite 2/2.
Shots: `sd_LS3_before_1600.png`, `sd_LS3_on_1600.png`, `sd_LS3_on_390.png`.
Questions: none

## DF12b Post this month, the words — done
Files: `workspace/VesselTrade.vue` (the part's head, the button, the empty line, what it says once posted, the header comment); test `tests/web/vessel_trade.test.js`.
What changed:
- With Lane A's AT2c, This month posts the five upkeep boxes, the same figure as Upkeep. The words now say so:
  - The part is **This month's upkeep**, and its button **Post this month's upkeep: −Cr14,500, dated 014-1105**.
  - Without numbers: "Write the ship's recurring costs on the ship sheet (Mortgage Cost, Maintenance Cost, Life Support Cost, Salary Cost, Running Cost) to post its upkeep each month."
  - Once posted: "Posted this month's upkeep: 2 lines, −Cr14,500, dated 014-1105."
- Lane A had already updated my test's box list for AT2c; I updated the head and button assertions.
Gates: test 2129/2172 pass, 0 fail; check clean; typecheck; build.
Shots: none (words only; the rendered test checks them).
Questions: none

## DU7 Quick capture — done (on Q; one question)
Files: `workspace/journal/quick_note.ts` (new: `quickNoteBody`, `captureWhere`), `workspace/QuickCapture.vue` (new), `views/MapView.vue` (the "Quick note" command on Q, `openCapture`, `closeCapture`, `openCaptured`, the mount; the first hint steps aside while the box is open); test `tests/web/quick_capture.test.js`; script `findings/storefront/sd_du7.mjs`.
What changed:
- On the map (signed in, with a campaign open), **Q**, or "Quick note" in the palette, opens one line under the search row: **Add a note**. It says what it will mention, for example "Mentions Regina. Enter adds it to the journal. Esc closes."
- **Enter** keeps a journal note: the words typed, then the mentions as tokens on their own line, `[[hex:…|Regina]]` for the selected hex and `[[cr_…|Bright Ledger]]` for the record open in the campaign panel. The journal reads them as any note's mentions, so the note shows in the dossier's "Your journal here".
  - Nothing else opens; the pane stays as it was.
  - A toast says "Note added to the journal." with **Open**.
- Empty words or **Esc** close it with no note.
- The box sits above an open pane, at Column or at Full: it leaves the map view for `.app`, as the date chip does. At 390 it sits under the date chip, with a 44 px box.
- **Not as written:** U7 says `Ctrl+Shift+N`. In Edge and Chrome that opens an InPrivate or incognito window before the page sees the key, and a page can't take it back. So I used **Q**, a single key like the map's others (S, L, R, Home), unused until now. See the question.
- Checked in the browser (local state):
  - On Regina, Q, a line, Enter: the toast showed, the Regina dossier stayed open, and the note was in the journal, mentioning the system.
  - With Bright Ledger open, the box said "Mentions Bright Ledger.", and Esc closed it.
Gates: test 2133/2176 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DU7_box_1600.png` (over a Full pane), `sd_DU7_box_390.png`.
Questions:
1. The quick note's key: `Ctrl+Shift+N` can't reach the page in Edge or Chrome (it opens a private window). Keep **Q**? I recommend Q: one key, like the map's other keys, never typed into a field by accident, and it's in the palette too. Alternatives: **N** (but N is Build's "New sector"), or `Alt+N`, which Edge leaves alone but is awkward to press.

## DU18 Settings that are per device — proposal (questions first)
Files: none changed.
What I found, setting by setting (U18 as written: units, date form, reduced motion, map density, sound):
- **Units, °C or °F or K first:** you decided on 2026-10-03 (Q6) that worlds show both scales, Celsius first ("18°C (64°F)"; `design/units.ts`, used by the dossier and the orbit view). A per-device order would undo that. Distances (km or AU first) are written in about eight orbit and dossier files, C's and L's areas.
- **Date form:** the campaign settings already hold `calendar.dateFormat` ('imperial' or 'long'), but nothing in the app reads it; every date is written one way. A device setting would first need the readers.
- **Reduced motion:** the system setting already works: script-driven motion reads `prefersReducedMotion()`, and about 13 components carry `@media (prefers-reduced-motion: reduce)`. A device switch would reach the script but not the CSS, unless every one of those components, across lanes, also read a root attribute. Half a switch is worse than none.
- **Map density:** no meaning is defined yet.
- **Sound:** the backlog says there is no sound; a switch that does nothing would be a fault.
- What exists today: **Quiet on this device** (LS3), in the account menu, is the first per-device setting. A small "This device" group there is the natural home for the rest.
Questions:
1. Temperatures and distances: may a device change the order? I recommend no: keep your Q6 decision (Celsius first, both scales) and leave units out of U18. Alternative: a device setting for °C or °F first (K stays a star's and the tooltip's), which changes `design/units.ts` and its readers.
2. Date form: per campaign or per device? I recommend per campaign (the stored `calendar.dateFormat`), set by the referee, after the screens that write dates are made to read it. That's its own item, mainly E's words and the clock line. Alternative: per device, overriding the campaign.
3. Reduced motion: a device switch on top of the system's? I recommend no: the system setting already works everywhere, and a switch that misses the CSS would mislead. Alternative: the switch, with a root attribute every component's reduced-motion CSS also reads (about 13 files, several lanes).
4. Map density and sound: leave them out until they mean something? I recommend yes.
If all four go as recommended, U18 is "This device" in the account menu holding Quiet on this device, and nothing more to build now.

## DU22b The map's live region — done
Files: `views/MapView.vue` (`announced`, `selectionWords`, `announceSelection`, called from `syncSelection` and `showStatus`; the `.map-announce` region; the status line no longer `aria-live`); test `tests/web/map_announce.test.js`; script `findings/storefront/sd_du22b.mjs`.
What changed:
- **A polite live region** (visually hidden) names the selection when it changes, by a click, a key (the neighbour keys in Build) or a search:
  - "Regina, Spinward Marches 1910" for a system.
  - "Empty hex, Spinward Marches 1911" in Build.
  - "3 hexes selected" for a selection of several.
  - It says each selection once. A hex whose sector hasn't loaded yet is said when it has, not twice.
- **Never on hover**, which doesn't change the selection, and never while dragging.
- **The visible status line** at the bottom left is no longer a live region. It used to be: a screen reader heard "Loading 3 sectors." while the map was panned, and a UWP spelled out letter by letter. It still shows the same words; it just doesn't speak.
- Checked in the browser: opening Regina gave "Regina, Spinward Marches 1910"; hovering other worlds and dragging left it unchanged; clicking Yori gave "Yori, Spinward Marches 2110".
Gates: test 2137/2180 pass, 0 fail; check clean; typecheck; build.
Shots: none (nothing visible changed).
Questions: none

## LS3b The settings screen reads living/words.ts — done
Files: `workspace/LivingSettings.vue` (the six sentences from `LIVING_WORDS`); tests `tests/web/living_settings.test.js` (+1: no sentence written in the component), `tests/web/living_words.test.js` (Lane E's, not claimed: its last six assertions required the sentences written out in `LivingSettings.vue`, the opposite of this decision; they now check that the component reads each `LIVING_WORDS` key. Changed only because this item replaces what they checked).
What changed:
- The living-systems switches' labels and help lines come from Lane E's `living/words.ts`, so the switches and the ticker say the same, from one place. The words on screen are unchanged.
Gates: test 2152/2195 pass, 0 fail; check clean; typecheck; build.
Shots: the menu in `sd_DU18b_menu_1600.png`, `sd_DU18b_menu_390.png`.
Questions: none

## DU18b "This device" in the account menu — done
Files: `workspace/LivingSettings.vue` (the group heading); test `tests/web/living_settings.test.js`; script `findings/storefront/sd_du18b.mjs`.
What changed:
- As decided at 21:45: under the campaign's switches, a small **This device** group, in the menu's own group style ("Your campaigns"), holding **Quiet on this device**, and nothing more. Units keep your Celsius-first rule; the date form is per campaign, a separate item; reduced motion stays the system's; density and sound are out.
- Checked in the browser at 1600 and 390: Show system chatter, Show background traffic, then THIS DEVICE, then Quiet on this device.
Gates: as LS3b.
Shots: `sd_DU18b_menu_1600.png`, `sd_DU18b_menu_390.png`.
Questions: none

## DU10 The account menu becomes a Campaigns panel — done (one question, one proposal)
Files: `workspace/CampaignsPanel.vue` (new), `shell/pane.ts` (the `campaigns` pane: `?panel=campaigns`, Escape shuts it, focus is the panel's own), `shell/PanelHost.vue` (mounts it, as the Characters panel is), `workspace/AccountMenu.vue` (the campaign list, forms, actions and switches moved out; Campaigns… and Help in; Go to the party out), `workspace/LivingSettings.vue` (`part`: the campaign's switches on the card, this device's quiet in the menu; a switch role on the card); tests `tests/web/campaigns_panel.test.js` (new), and the assertions that followed the moved markup to `CampaignsPanel.vue`: `menu_and_job_error`, `party_panel_public_e`, `public_course`, `public_games_wire` (now `role="switch"`), `record_visibility`, `living_settings` (all unclaimed; changed only where this item moved what they check); script `findings/storefront/sd_du10.mjs`.
What changed:
- **The account menu keeps the person:** who you are, **Campaigns…** (naming the open one), Characters, My packages, Account and sign-in, **Help**, This device (Quiet on this device), Sign out, then About and What's new. Seven items instead of fourteen or more.
- **The Campaigns panel** (`?panel=campaigns`) shows "6 of 10 campaigns" and **New campaign**, then a card for each campaign, the open one first.
  - **The open campaign's card** says who the party is, where it is, the campaign date and the record count ("Bright Ledger and Cold Manifest, 2 aboard · Spinward Marches 2007 · No campaign date · 29 records"). Its actions: **Show records**, **Rename**, **Export**, **Import into…** (an empty campaign only, as before), **Delete**, which asks once on the card. Its switches are folded under **Settings**: Show my party on other maps, my name and the course (when public), and the living systems' two switches.
  - **Another campaign's card** says when it last changed and has **Open**.
  - Switching or creating opens that campaign's records.
  - The public-games, name, course, import and export code is the menu's, moved as it was.
- Checked in the browser as the house (local state): the menu's seven items; Campaigns… opened the panel with focus on the open card; Settings listed the switches; New made "Panel proof" and opened its records; its card's Delete asked "Delete Panel proof? It has no records. This cannot be undone." and removed it; Free traders was open again. At 390 the panel is the bottom sheet.
- **Kept, not as U10 lists:** **My packages** stays in the menu (see the question).
- **Dropped:** "Go to the party" (the Party tab is a tab of the Campaign panel).
Gates: test 2181/2224 pass; 1 fail, `tests/web/style_class_collision.test.js` (`doss-stat` in the dossier, Lane C's work in progress); check clean; typecheck; build.
Shots: `sd_DU10_menu_1600.png`, `sd_DU10_panel_1600.png`, `sd_DU10_delete_1600.png`, `sd_DU10_panel_390.png`.
Proposal:
- A card for a campaign that isn't open can't say its party, date or record count: only the open campaign is loaded in the browser. **"Playing in"**, the campaigns you play in, waits for the players' side (Epic P). Both need a server route: a small summary per campaign (party words, campaign date, record count, last played) in the campaign list. That's B's area; size S on the server, then one line on the card.
Questions:
1. U10's menu has no **My packages**. Keep it in the menu? I recommend yes: it's how a referee reaches their own packages from anywhere, and the store's header link only shows inside the store. Alternative: drop it, leaving the store's header and the palette.

## DU13 Keyboard help from the registry — done
Files: `shell/key_help.ts` (new: `keyWords`, `keysWords`, `keyGroups`), `workspace/KeyHelp.vue` (new: the sheet, in the shared modal frame), `components/OmniBox.vue` (the "Keyboard shortcuts" command on `?`, the sheet's mount, a command's key in its palette line); test `tests/web/key_help.test.js`; script `findings/storefront/sd_du13.mjs`.
What changed:
- **`?` opens Keyboard shortcuts**, also listed in the palette. It is a sheet of every key the registry holds right now, grouped as Build, Orbit view and Everywhere, with each key said as it's pressed ("Shift+W", "Space", "Esc", "/ or Ctrl+K"; a letter typed both ways is said once). A key that can't run just now is dimmed.
- Nothing is listed by hand: on the map the sheet shows Q (Quick note) and L (Locate this system) because those commands are registered; Build's keys appear once Build is on.
- **The palette** says each command's key beside it: "Quick note · Command · Q".
- The command lives in the search box, which is on every screen that takes keys through its page listener, so `?` works on the map, the store and the orbit view. The orbit view's own keys sheet (C's) is unchanged.
- Checked in the browser on the map as the house: `?` opened the sheet (Build: B; Everywhere: R, / or Ctrl+K, ?, Home, Esc, Q, L); Esc closed it; typing "quick" in the palette gave "Quick note · Command · Q". At 390 the sheet fits (24 to 366 px).
- **Not done:** U13 also says "the help screen is generated" (`HelpGuide.vue`, hand-written prose). The `/help` page is its own route, so the map's keys aren't registered there; the generated list belongs over the screen whose keys it lists, as built. The sheet ends with a line pointing to the map's gestures under its "?" button.
Gates: test 2189/2231 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DU13_sheet_1600.png`, `sd_DU13_palette_1600.png`, `sd_DU13_sheet_390.png`.
Questions: none

## DU2 Jump-range ring — done (one question)
Files: `map/jump_ring.ts` (new: `jumpNumberOf`, `jumpParsecs`, `ringHexes`, `ringOutline`, `jumpRing`, `JumpRingLayer`), `views/MapView.vue` (the ring's canvas, `shownRing`, drawn with each chart frame, resized with it); test `tests/web/jump_ring.test.js`; script `findings/storefront/sd_du2.mjs`.
What changed:
- **With a party ship's record open** in the campaign panel, the map shades every hex within its jump number of the system the ship is at (under way, the system it's in), and draws the ring's outer edge in the signal colour. A jump-2 ring is 19 hexes.
- **The jump number** is what the referee typed on the ship sheet's **Jump Drive Output** box: the first whole number from 1 to 9, so "2", "J-2" and "Jump-2" all read as 2. A jump number carries `rules/mgt2e_space_travel.json` `jump.parsecsPerJumpNumber` parsecs (1). Nothing else is read into it: no fuel, no drive check.
- **Its own layer:** a canvas over the chart that takes no pointer, drawn at the device's full resolution with every frame the chart draws. No ring without a party ship's record open, without a jump number, or off the chart.
- Checked in the browser on Bright Ledger at Roup (local state): no ring before; "2" typed in Jump Drive Output, and the ring shaded the 19 hexes round Roup with its edge sharp; none with the panel closed; none once the box was cleared (I cleared it again afterwards).
Gates: test 2195/2237 pass, 0 fail; check clean; typecheck; build.
Shots: `sd_DU2_ring_1600.png` (Column, after Locate), `sd_DU2_ring_390.png`.
Questions:
1. Which ship sheet box holds the jump number? Your G2 answer (2026-10-06) left the fields for later. I read **Jump Drive Output**, the sheet's own jump box. Keep it? I recommend yes: it's where a referee writes the drive. Alternative: a jump number typed on the Party tab for each ship, kept apart from the sheet.

## XD1 X-boat ripples: the layer and the scrubber — done (XD2 and XD3 next, same item)
Files: `map/news_layer.ts` (new: `edgeProgress`, `ageAlpha`, `rippleFrame`, `NewsLayer`), `map/NewsScrubber.vue` (new), `views/MapView.vue` (the layer's canvas, the run over A's `news/` modules, sector loading through the map's `TruthClient`, the command, the scrubber's mount), `design/tokens.css` (appended `--chart-news: #ff7ad9;` and `--t-ripple: 6000ms;`); tests `tests/web/news_layer.test.js` (new), `tests/web/contrast.test.js` (the `--chart-news` pair on `--bg-0`, at the chart-mark minimum of 3); script `findings/storefront/sd_xd1.mjs`.
What changed:
- **"How fast does news travel from here"** in the palette, runnable only with a system selected. It runs Lane A's `newsArrivals` over A's `buildNewsGraph` from that system, starting on the campaign date (or the default date with none).
- **The layer:** its own canvas over the chart that takes no pointer, at the device's full resolution. At day `t`:
  - A system the news has reached gets a ring in `--chart-news`, bright when fresh and fading to faint at the horizon's age.
  - A system it may have reached (earliest ≤ t < latest) is drawn at half strength.
  - Along each X-boat line the news runs from the nearer system towards the farther, as far as it has got; a crossed line is drawn whole.
  - Zoomed out, rings become dots.
- **Sectors load as the news reaches them:** the run asks the `TruthClient` for the sectors its frontier wants, up to `NEWS_PARAMS.sectorCap` (9), and runs again as each arrives. At the cap the control says "Shown as far as nine sectors."
- **The scrubber**, centred over the chart's foot:
  - It says "News from Regina · day 18 · 020-1105" and has a day slider (arrows, Home, End), Play/Pause, a Today mark when the campaign has a date, and ✕.
  - Esc closes it, and the layer clears.
  - Play runs day 0 to the horizon over one `--t-ripple` and repeats until paused. With reduced motion there is no Play; the slider works by hand.
  - At 390 px it sits under the date chip, with 44 px buttons.
- Off-network spread stays off, as A's `offNetworkWaitHours` is null until you answer the report's question; only X-boat lines carry news now.
- Checked in the browser from Regina, signed out:
  - The palette lists the command, and choosing it opens the scrubber.
  - Lit pixels on the layer: 656 at day 0, 8,703 at day 18 and 19,875 at day 60.
  - Play moved from day 13 to day 25 in 1.2 s.
  - ✕ cleared the layer (0 lit pixels). No console errors.
Deviations from the spec, each on purpose:
1. **Rings, not discs behind the glyph.** The layer is a canvas over the chart, so a filled disc would hide the world's glyph and UWP. A ring round the world reads the same and hides nothing. Drawing under the glyph would mean editing `MapRenderer.ts`'s cell pass.
2. **Its own dots zoomed out, not `MapRenderer.setDotOverlay`.** That overlay paints the cells tier, not the overview tiers, so it would not show at the zoom where a ripple across nine sectors is seen. The layer draws its own dots, a few hundred at most.
3. **Drawn with every chart frame, not only once the camera settles.** A frame is one line per reached edge and one ring per reached system (under 1 ms), always at full resolution, so the ripple moves with the chart instead of vanishing during a pan.
Gates: test 2209/2252 pass, 42 skipped; 1 fail in `tests/web/surface_city_pixels.test.js` (EPERM removing its temp folder; X's file, X is running), which passes alone; check clean; typecheck; build.
Shots: `sd_XD1_day0_1600.png`, `sd_XD1_day18_1600.png`, `sd_XD1_day60_1600.png`, `sd_XD1_day18_390.png`.
Needs from others: X — `surface_city_pixels.test.js` fails now and then on Windows when `rmSync` hits a locked temp folder (EPERM after the browser closes); `rmSync(dir, { recursive: true, force: true, maxRetries: 5 })` would ride it out.
Questions: none new. The spec's 3.2 deviations above are yours to overrule.

## DF13 In-progress map files red in others' runs — done
Both came from DU2 while it was being built and were fixed before DU2's entry: `map/jump_ring.ts` keeps its canvas in an explicit field (no constructor parameter property, so no TS1294), and `MapView.vue` gives the traffic canvas, the jump ring and now the news layer each a rule of their own, which `party_ships_map.test.js` reads. With XD1 in the tree: build passes; `party_ships_map.test.js` and `jump_ring.test.js` pass.
Gates: as XD1.
Questions: none

## XD2 X-boat ripples: News in the dossier, the hover, the reverse — done
Files: `map/news_layer.ts` (`reverseFrame`, `frameFor`, `nodeAt`, `newsHoverWords`, the data block), `map/NewsScrubber.vue` (the reverse's legend of ages), `views/MapView.vue` (the "How old is the news here" command, the hover and the tap, the mode), `dossier/DossierPanel.vue` and `dossier/DossierOverview.vue` (**News**), `workspace/WhereBlock.vue` (**How old is the news here** on the party's block); tests `tests/web/news_hover.test.js` (new), `tests/web/news_layer.test.js` (two patterns follow the new source and draw lines); script `findings/storefront/sd_xd2.mjs`.
What changed:
- **News in the dossier.** On a system's overview, after Mainworld, Explore orbits and Locate; on a body, beside Orbits. It runs the map's "How fast does news travel from here", so it shows only where the map has registered that command (not beside the orbit view, not in a preview). A full panel drops to Column so the ripple can be seen.
- **The hover:** a data block in the traffic layer's manner (a dark plate on a leader, in `--chart-news`; no text at rest):
  - A reached system: "News from Regina arrives here on 009-1105, 7 days later. Earliest 6, latest 7."
  - An unreached one: "News from Regina has not reached here by day 60."
  - In reverse: "News from Mora reaches Roup in 9 days."
  - On a phone a tap on a system pins the block, as a tap on a track does; the tap still does what it did.
  - Days are whole, as the date counts them: news 17.6 days out arrives on day 17.
- **The reverse:**
  - **How old is the news here** on the Party tab's Where card, and in the palette, runs the same run from the party's system (`partyMarker` at the campaign date, the lead ship's place).
  - Every system within the horizon is drawn at once, with the X-boat lines it comes by whole: bright where its news reaches the party soon, faint where it takes long.
  - A legend of ages stands in place of the scrubber: "How old the news is at Roup", a bar from Fresh to "60 days old", ✕.
- Checked in the browser:
  - The overview's row read Mainworld, Explore orbits, Locate, News. News opened the ripple from Regina.
  - The hover gave the three sentences above (Regina itself: "News from Regina starts here on 002-1105.").
  - As the house on the traders' campaign, the Party tab showed "How old is the news here". It opened the legend at Roup with 16,311 lit pixels; ✕ cleared it. No console errors.
New sentences the spec doesn't give, for E's E1 to reword: "News from Regina starts here on 002-1105." (the source), "News from Mora takes more than 60 days to reach Roup." (reverse, unreached), "The party is at Roup." (reverse, the party's own system), and the legend's "How old the news is at Roup", "Fresh", "60 days old".
Gates: test 2224/2266 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_XD2_dossier_1600.png`, `sd_XD2_hover_1600.png`, `sd_XD2_reverse_1600.png`, `sd_XD2_reverse_390.png`.
Questions: none

## XD3 X-boat ripples: "Spread this news" on records and entries — done (one question)
Files: `map/news_ask.ts` (new: `spreadState`, the date-and-place rule; `askNews` / `onNewsAsk`, the channel the map hears), `workspace/SpreadNews.vue` (new: the button), `workspace/RecordPage.vue` and `workspace/journal/EntryPage.vue` (the button under the Where block), `views/MapView.vue` (`spreadNews`: the ripple from the place on the date, the scrubber at Today); test `tests/web/news_spread.test.js` (new); script `findings/storefront/sd_xd3.mjs`.
What changed:
- **Spread this news** on a record whose `when.start` and place are both set (a record aboard a vessel goes by the vessel's place, as its Where block does), and on a journal entry with `when` and an anchor. The button keys on date and place, never on kind.
- Pressing it:
  - Locates the place (the tracking line, as Locate does) and opens the ripple from that system with day 0 on the record's date.
  - Puts the scrubber at Today (the campaign date less the record's), so the first thing seen is where the news is now. With no campaign date, or a record dated after it, the scrubber starts at day 0.
  - A full panel gives way, as for a locate.
- Nothing is written: the ripple is a view. The test checks the button calls no save.
- One of the two missing: the button stays, unable (`aria-disabled`). Its hover, and a screen reader, say "Give it a date to spread this news from then." or "Give it a place to spread this news from there." Neither: no button.
- Shown only where the map has registered the ripple.
- Checked in the browser as the house, on Bright Ledger (at Roup, local state):
  - No date: unable, with the date line on hover.
  - "141-1105" typed: the button worked, and the ripple opened as "News from Roup · day 0 · 141-1105" with Roup located. No campaign date here, so day 0.
  - The date cleared again: unable again. No console errors.
Gates: test 2232/2274 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_XD3_spread_1600.png`, `sd_XD3_spread_390.png`.
Questions:
1. §4.2 says a record with a date but no place, or a place but no date, "has no button (one line says why on hover)". I read that as the button shown unable, with the why on hover. Most people and places have a place and no date, so they all carry an unable "Spread this news". Keep it? I recommend **hiding it when the date is missing, and showing it unable only when the date is there and the place isn't**. A dated thing is news; an undated one rarely is, and the button on every person and place is noise. Alternative: as built, unable everywhere one is missing.

## DU39 Relationship web — done (one question)
Files: `workspace/web/web_layout.ts` (new: `webGraph`, `webChoices`, `edgeTone`, `webGroups`, `layoutWeb`, `declutter`), `workspace/web/RelationshipWeb.vue` (new), `shell/pane.ts` (the `web` pane: `panel=web`, in the Campaign panel; Escape goes back to the records), `workspace/crumb.ts` ("Campaign / Relationships"), `workspace/CampaignPanel.vue` (**Relationships** beside Timeline, the mount, Escape); test `tests/web/relationship_web.test.js` (new); script `findings/storefront/sd_du39.mjs`.
What changed:
- **Relationships**, beside Timeline in the Campaign panel, shows the open campaign's linked records as a web across the panel's width. From Column it opens at Half, so the map stays beside it for Locate.
- **The layout** is a force layout, the same picture every time:
  - Each group of records joined to each other is laid out on its own; the groups are packed across the stage to suit its shape.
  - Names that would cover each other are then pushed apart.
  - A record with no link is not drawn. A deleted record or link is gone. Two records joined twice in one kind are one line.
- **Lines** by how the two stand: allies and contacts in the signal colour, rivals and enemies in the danger colour, patron, client and "concerns" in the attention colour, the rest (member, owns, crew, passenger, commands, involved) plain.
- **Filters:** a chip per record type and per link kind the campaign's links use, all on to begin with. With everything filtered away the stage says so.
- **A click opens the record.**
- **Pointing at a record** (mouse or focus) lights its lines and names it in the bar under the web: "Ara Silt · Person · 1 link · Spinward Marches 2716". The bar has **Locate**, whose tracking line starts level with that record's node.
- Tab goes through the records in name order. At 390 the chips are 44 px and the dots 32 px; the web sits under the chips in the sheet.
- Checked in the browser as the house on the traders' campaign:
  - 27 records and 22 lines in five groups, no two names on each other.
  - Items off took the crate away; Commands off took one record away.
  - Locate on Ara Silt drew the line from her node to Rhylanor.
  - A click on Ara Silt opened her record. No console errors.
Gates: test 2241/2283 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_DU39_web_1600.png`, `sd_DU39_locate_1600.png`, `sd_DU39_web_390.png`.
Questions:
1. U39 says "full width". I open the web at **Half** from Column (Full and Half stay as they are), because at Full the map is hidden and the locator line has nowhere to go. Keep Half? I recommend yes. Alternative: open at Full, and let Locate drop the panel to Half as a record's Locate does.

## DU31 Print and PDF — done (one proposal)
Files: `workspace/print.ts` (new: `printableCopy`, `printCopy`, `endPrint`), `workspace/PrintButton.vue` (new: the button and the print stylesheet), `workspace/RecordPage.vue` and `workspace/journal/EntryPage.vue` (**Print** in the footer), `platform/browser.ts` (appended `printPage`, `onAfterPrint`), `design/tokens.css` (appended `--print-paper: #ffffff;`, `--print-ink: #16181c;`, `--print-line: #8a8f98;`); tests `tests/web/print.test.js` (new), `tests/web/contrast.test.js` (ink on paper at the text level, the line at the mark level); script `findings/storefront/sd_du31.mjs`.
What changed:
- **Print** in the footer of every record page and journal entry. It opens the browser's own print dialog, where "Save as PDF" is the PDF: no second renderer, no server.
- The record page prints whole, with the person's character sheet or the vessel's ship sheet when it has one. The PDF is named after the record or entry.
- **The copy:** the page is copied into a print-only root, with what a copy loses put back: typed values, ticked boxes, chosen options, drawn canvases (the deck plan), and folded sheet sections opened. It goes when the dialog closes.
- **On paper:**
  - Only the copy prints: ink on white from the print tokens, whatever the app's theme, with white margins.
  - Field boxes print as their value on a rule, so a blank sheet prints as lines to write on.
  - Controls that only edit are left off: buttons, the image add tile and its hint, "+ tag", the remove crosses on chips, an empty field's prompt.
  - Sections and table rows are kept whole across pages where they fit.
- Checked in Edge through its own print path (`Page.printToPDF`; the dialog itself was stubbed, as it would block the driver):
  - Ara Silt: one page.
  - Bright Ledger: 11 pages. The record, connections, track, cargo, ledger, owners, fuel, then the ship sheet with its 77 filled fields (mortgage 12,500, fuel capacity 40, the cargo rows) and empty fields as rules.
  - A journal entry: one page.
  - Each time the copy was gone and the title back after the dialog closed. No console errors.
- **Not done:** U31 also lists the subsector, "the chart at the names tier". The chart is drawn on canvas in the app's dark theme, so on paper it would need the map renderer drawing a light theme: a second render path. See the proposal.
Gates: test 2246/2288 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_DU31_person.pdf`, `sd_DU31_ship.pdf`, `sd_DU31_entry.pdf`, `sd_DU31_person_1600.png`, `sd_DU31_button_390.png`.
Proposal:
- **Print a subsector:** a "Print" on the subsector's dossier that draws the subsector once, at the names tier, into an offscreen canvas with a light chart theme read from new `--print-chart-*` tokens. `MapRenderer` already takes its theme as an object (`readTheme`). It goes onto the page as an image, ink on white. Size M, `MapRenderer.ts` (C's renderer area) and `map/theme.ts`. I recommend it after Johnny confirms players want paper maps.
Questions: none

## DF14 (found) A vessel's place line ignores its track — done
Files: `workspace/place_now.ts` (new: `placeNow`, the record card's rule in one place), `workspace/RecordPage.vue` (the header), `workspace/CampaignList.vue` (the row), `workspace/web/RelationshipWeb.vue` (the bar); test `tests/web/place_now.test.js` (new); script `findings/storefront/sd_df14.mjs`.
What changed:
- Bright Ledger's page said "Vessel · Spinward Marches 1910" in its header (the stored anchor) and "Spinward Marches 2007" under Where (its track at the campaign date). The record card already followed the track.
- Now the header, the records list row and the relationship web's bar say where the track puts a ship, in the Party tab's words when it is under way, through one helper.
- Checked in the browser on the traders' campaign: the header reads "· Spinward Marches 2007", the same as Where. The list rows read Bright Ledger 2007 and Cold Manifest 2106, as "Where is everyone" does. No console errors.
- Left as they are: the omnibox's detail line, the mention list, the record picker and the timeline still say the stored anchor. In a list of choices that is defensible; say if you want them to follow the track too.
Gates: test 2248/2290 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_DF14_header_1600.png` (a text change; no 390 shot).
Questions: none

## XD3b The Spread this news rule, as decided — done
Files: `map/news_ask.ts` (`spreadState`), `workspace/SpreadNews.vue` (its header comment), `tests/web/news_spread.test.js`.
What changed:
- As you decided at 23:10:
  - No date: no "Spread this news" button, so it no longer sits on every person and place.
  - A date and no place: the button shows, unable, and its hover says "Give it a place to spread this news from there."
  - Both: the news, as before.
- Checked in the browser on Bright Ledger (local state): no button with no date. With "141-1105" typed it spread from Roup on that day. With the date cleared again, no button. No console errors. `sd_xd3.mjs` now prints its lines whole (a backslash was lost in an earlier run's text, not in the app).
Gates: test 2248/2290 pass, 0 fail, 42 skipped; check clean; typecheck; build.
Shots: `sd_XD3_spread_1600.png`, `sd_XD3_spread_390.png` (taken again).
Questions: none

## DU40 Org chart — done (one question)
Files: `workspace/web/org_tree.ts` (new: `orgForest`), `workspace/web/OrgChart.vue` and `workspace/web/OrgBranch.vue` (new), `workspace/web/RelationshipWeb.vue` (the Web / Org chart switch, kept on this device); test `tests/web/org_tree.test.js` (new); script `findings/storefront/sd_du40.mjs`.
What changed:
- **Org chart** beside **Web** in Relationships: the campaign's organizations as a tree.
- An organization that is a `member` of another hangs under it, on a line down the left.
- Each card shows:
  - The organization's name.
  - **Commanded by:** the people with a `commands` link to it, with their roles.
  - **Members:** the people and ships with a `member` link, by name. A commander is not listed again as a member.
  - **Also in:** other organizations it belongs to past the one it hangs under.
- Every name opens its record.
- One parent each: the first by the link's order. A loop of memberships is cut where it would close, so every organization is drawn once. An organization with nobody linked says "No members linked yet." With no organizations, one line says how to make one appear. Allegiance colours wait on Q8, as U40 says.
- At 390 the chips are 44 px and the labels sit above them.
- Checked in the browser as the house on "The Glass Hand" (local state, nothing changed):
  - The switch opened the chart: The Glass Hand, commanded by Wynn Solas (leader), with five members.
  - The choice was kept on reload.
  - The name opened its record. No console errors.
  - That campaign has one organization, so branches are covered by the test (a cell under its guild, two parents, a loop).
Gates: test 2251/2293 pass, 0 fail, 42 skipped; check clean. **Typecheck and build fail, only in `packages/shared/src/index.ts`** (A's claim since 23:15, mid-edit). Nothing else errors: `vue-tsc -b` with that file set aside is clean, and the web build passed before that edit landed.
Shots: `sd_DU40_chart_1600.png`, `sd_DU40_chart_390.png`.
Needs from others: A, `packages/shared/src/index.ts` lines 81 to 101 export the players names twice, as values and again as types (TS2300 Duplicate identifier, 18 errors). It turns typecheck and build red for every lane until it's saved whole.
Questions:
1. U40 says `member` and `leads` links, but the link kinds have no `leads`. I read `commands` (person to organization, "Commanded by") as the leader. Keep it? I recommend yes: the kind exists, and it already says "Commanded by" on the record page. Alternative: a new `leads` kind, which is a schema change in `packages/shared` and B's validation, then one line here.

## P5 Players, the referee's screens — done, except View as players (moved to P6; one question)
Files:
- New in `workspace/players/`:
  - `referee_calls.ts`: Archive, Bring back and Which one, on the contract's paths, keeping the server's message.
  - `players_words.ts`: dates, uses, member lines, the 255 rule, `partyPeople` through `playersView`.
  - `PlayersSection.vue`: the calls.
  - `PlayersBoard.vue`: what is drawn, from props, so it renders in a test.
  - `PlayingIn.vue`.
- Edits: `workspace/PartyPanel.vue` (the section, referee only) and `workspace/CampaignsPanel.vue` ("Playing in").
- Test `tests/web/players_referee.test.js` (new: the words, Which one through the projection, the board rendered with and without a link, with both groups, full, and failed). Script `findings/storefront/sd_p5.mjs`.

What changed:
- **Players**, on the Party tab, below the party. The referee only; the section shows even before the party has anyone.
- **The invite link:**
  - **Get the invite link** makes the live link, or shows the one already live.
  - Then the link in a field (selected on focus), **Copy**, and **Revoke**, with the line "Works until November 17, 2026 · Not used yet. Anyone with the link can join as a player."
  - Before the link: "Players join with an invite link. They see what you share with players, and can add notes to the journal."
- **Playing** and **Archived**:
  - Each player's handle and "Joined October 18, 2026", or "Archived on …" / "Left on …".
  - **Which one** offers the party's people as players see them (a referee-only person is never offered, as the server would refuse them), or "Not chosen yet".
  - **Archive** and **Bring back**. Archived shows only when someone is in it.
  - A refusal is said beside that player in the server's words (for example "This campaign has 255 players, the most it can have.").
  - With 255 playing, the full sentence shows above the groups.
  - When the server has no players yet, the list says "Players are not available yet." instead of looking empty.
- **Playing in**, in the Campaigns panel under your own campaigns: each campaign you play in, "Run by <handle>", and **Open** (A's `openPlaying`, then its records). Nothing shows for an account that plays in none.
- My local state needed migrations 0021 and 0022, applied to my own state directory only.
- Checked in Edge on local state:
  - The house got the link.
  - "reader" joined with it (200, role player).
  - Reader's Campaigns panel showed "Playing in 1 · Free traders of the Marches · Run by traveller_voyage".
  - The house saw reader under Playing and set Which one to Ara Silt (kept on reload).
  - Archive moved reader to Archived ("Archived on October 18, 2026") with "Nobody yet." under Playing; Bring back moved them back.
  - Afterwards reader was archived again and the link revoked. No console errors.

**Not done, View as players:** the item says it hides every control "as in P6". The record, party and journal screens have no read-only player form until P6 builds it, so a switch now would mean making the same screens read-only twice. I'll build it with P6: the projection over the full store, the banner "You're seeing what players see", and P6's read-only screens.

Gates: test 2294/2337 pass, 0 fail, 43 skipped; check clean; typecheck; build.
Shots: `sd_P5_players_1600.png`, `sd_P5_players_390.png`, `sd_P5_playing_in_1600.png`.
Questions:
1. After a reload the panel cannot tell whether a link is live: the contract has no read route for it, only the `POST` that makes one or answers the live one. So the referee presses **Get the invite link** again to see or revoke it, and that press makes a link when none is live. Add a `GET /api/universes/:id/players/invite` (B, small) answering the live link or none? I recommend yes: the section could then show the live link and its uses at once. Alternative: keep it as built. It is correct, one press more.

## P6 Players, the player's campaign panel (with P5's View as players) — done
Files:
- New in `workspace/players/`:
  - `player_mode.ts`: who is looking, the player's note, which notes are theirs.
  - `view_as.ts`, `ViewAsBar.vue`: View as players.
  - `PlayerRecordPage.vue`, `PlayerParty.vue`.
- Edits:
  - `workspace/CampaignPanel.vue`: the player's screens in place of the referee's, the poll, "gone", the bar.
  - `workspace/CampaignList.vue`: no Add for a player; their empty line.
  - `workspace/journal/JournalList.vue`: Add a note only; no Player Pack.
  - `shell/Rail.vue`: Build locked.
  - `workspace/ClockLine.vue`: "Set it" only when the date can be set.
- Tests: `tests/web/players_panel.test.js` (new: each screen rendered for a player; no hidden-count words; View as players on a real store refusing a record change), `tests/web/rail_build_pitch.test.js` (my rail test, now pinning the new Build rule). Script `findings/storefront/sd_p6.mjs`.

What changed:
- **For a player** (a member, or the referee viewing as players), the Campaign panel shows what is shared, read-only:
  - **Records:** the projection, with no Add and no Publish. With none, "No records here yet."
  - **A record:** its own read-only page. "For players" is the body, then Where (with Locate), Summary, Details, Tags and Connections, as the projection carries them (F13: from P6 on, what the projection holds is on a player's screen). No sheet, as a sheet opens only through the character's own access.
  - **Party:** "Where are we" (the lead ship's track at the campaign date, with Locate), "Your ship" (the lead ship), and the party's people. Each opens its record.
  - **Journal:** what is shared, and **Add a note** as the only way to write. The note is a players note (kind note, by and for the players, no images). The player can write their own note; other entries are read-only. The Player Pack, the referee's export, is gone, and with it its counts.
  - **Timeline** as today, read-only.
  - **Build** stays on the rail, switched off, and says "Build is the referee's."
  - The panel's line reads "Shared with you by the referee."
  - No count of hidden things anywhere (F24); the test checks the words on every player screen.
- **"You are not in this campaign."** (A's `NOT_IN_CAMPAIGN`) when the store is gone.
- **The poll (A's P9) is now wired:** it runs while the Campaign panel is open on a ready campaign. Nothing called it before.
- **View as players** (P5's last part), the referee's button in the panel:
  - The projection runs over the full store in the browser and is held exactly as a player's page is.
  - The role is player, so A's commit guard refuses every change; the test proves a record change is refused.
  - The banner says "You're seeing what players see" with **Stop viewing as players**, and the poll waits meanwhile.
  - Stopping, closing the panel, or reloading reads the campaign back from the server as the referee.
- Checked in Edge on local state:
  - The house viewed the traders' campaign as players: 23 of its 29 records, Bright Ledger's read-only page, the Party, the journal with only "Add a note", and Build locked. Stop brought back 29 records and Build.
  - "haul" joined with a fresh link and opened the campaign from Playing in: 23 records, Build locked, no View as players.
  - haul added a note with text, and it was on the server on a fresh open.
  - Afterwards haul was archived and the link revoked. No console errors.

Gates: test 2312/2355 pass, 0 fail, 43 skipped; check clean; typecheck; build.
Shots: `sd_P6_viewas_records_1600.png`, `sd_P6_viewas_record_1600.png`, `sd_P6_viewas_party_1600.png`, `sd_P6_player_records_1600.png`, `sd_P6_player_note_1600.png`, `sd_P6_player_party_390.png`.
Needs from others:
- **E (P7):** a player's own note still shows the referee's controls: the kind menu, the Referee / Players / Public switch with its public-cards line, and "Add an image" (`sd_P6_player_note_1600.png`). A's commit guard drops those changes and the server refuses images, so pressing them does nothing. P7's "own notes editable… images off for players" should hide them.
- **A (P3):** reloading as a player opens the account's own first campaign, not the one they play in. `openCampaign` looks for the remembered id only in the account's own list. A played campaign should reopen through `loadPlayerPages` when the remembered id is in `campaign.playing`.
Questions: none

## DU6 The timeline that fills itself, the screen — done (one question)
Files: `workspace/TimelineList.vue` (A's `campaignTimeline` with the party; each row says its source), `workspace/CampaignPanel.vue` (a leg or the Today row opens its ship; the Timeline's address changes with its controls); test `tests/web/timeline_screen_legs.test.js` (new); script `findings/storefront/sd_du6.mjs`.
What changed:
- **The Timeline shows each ship's legs**, by day, newest first, from A's AU6: Jump entry and Jump exit, Departure and Arrival, each with its place. With a campaign date and a party, the party's row also stands on Today.
- A leg row, or the Today row, opens its ship's record; the Today row with no ship opens the Party tab. Clicking a row with a place still locates it first.
- **Fixed on the way:** the type menu and "Only this ship" never changed anything when used. The Campaign panel's own `samePane` called any two Timeline addresses the same, so the change was never pushed. It now compares the type, the ship and the row. Loading the address directly always worked.
- Checked in Edge on the traders' campaign:
  - 18 leg rows (Bright Ledger's six jumps, Cold Manifest's three), "Jump exit · Spinward Marches 2304" on 029-1105 and so on.
  - A leg opened Bright Ledger.
  - "Only this ship", pressed and on a cold load, kept Bright Ledger's 12 rows.
  - No Today row there, as that campaign has no date (A's test covers it). No console errors.
  - On the way, my Vite server was found serving a stale `timeline.ts` that A had changed (its file watcher missed the edit). A restart fixed it; nothing in the tree.
Gates: test 2361/2406 pass, 0 fail, 45 skipped (an earlier run caught E's `cold_load.test.js` and Z's `chatter_schema.test.js` mid-edit; both pass now); check clean; typecheck; build.
Shots: `sd_DU6_timeline_1600.png`, `sd_DU6_timeline_390.png`.
Questions:
1. With "Vessels" chosen in the type menu, the legs go: A's rule keeps only records under a type, and a ship's record has no date of its own, so "Vessels" plus "Only this ship" shows nothing. Should "Vessels" keep the ships' legs? I recommend yes: a referee who picks Vessels on a timeline means where the ships went. It's a one-line change in A's `timelineKeeps` (A's file). Alternative: keep it as it is, where "Only this ship" is the way to see the legs.

## DF15 Scroll-wheel zoom lost on the surface map — done
Files: `dossier/SurfaceStage.vue` (the wheel bound in the template; the size observer follows the elements); test `tests/web/surface_wheel.test.js` (new); script `findings/storefront/sd_df15.mjs`.
Cause, reproduced in Edge before the fix:
- The stage sits under `v-if="mappable"`. Going from Regina's mainworld (`/b/w4m1`) to its gas giant (`/b/w4`) and back in the app keeps SurfaceStage mounted but rebuilds the stage element. The wheel listener, added once in `onMounted`, stayed on the old element. After the round trip the wheel left the scale at 1; the zoom buttons still worked, being template bindings.
- A direct load and a system-then-Mainworld click both worked locally (the target was there at mount). On production a target that arrives after mount meets the same dead listener.
Fix:
- `@wheel="onStageWheel"` on the stage. Vue's listener is not passive, so `preventDefault` holds. The `onMounted` add and the `onBeforeUnmount` remove are gone.
- The resize observer had the same flaw: it was set up only when the figure existed at mount, and observed the elements of that moment. It is now made at mount and re-pointed by a `watch([figureEl, stageEl], observeSize, { flush: 'post' })`. Same file, same cause; it keeps the map's width and redraw right after a rebuild.
Checked in Edge (local), after the fix:
- After the gas giant and back, the stage was rebuilt, and the wheel zooms in (1 to 1.257) and out (to 1.121) on the large map, at 1600 and at 390.
- The hover still names what is under the pointer ("Sea ice"). The zoom buttons still work.
- The small map: the wheel scrolls the dossier (scrollTop 0 to 240) and the map stays at zoom 1.00, as in 1.2.6.
- No console errors.
Test: no DOM library is in the repo (adding one is a `package.json` change, not D's), so instead of mounting, the test reads the compiled template. The stage element carries a plain, non-passive `onWheel` beside the hover handlers, it sits under `v-if="mappable"`, there is no `addEventListener('wheel'`, and the observer follows the elements. The Edge script is the behavioural check.
Gates: test 2403/2449 pass, 0 fail, 46 skipped; check clean; typecheck; build.
Shots: `sd_DF15_wheel_1600.png`, `sd_DF15_wheel_390.png`.
Freeze: stopped here as the FREEZE line asks; DJ1 and SI3 not started.
