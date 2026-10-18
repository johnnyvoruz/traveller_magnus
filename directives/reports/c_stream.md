# Lane C stream

## C1 L1, meta, robots, sitemap — done
Files: apps/web/index.html, apps/web/public/robots.txt, apps/web/public/sitemap.xml, tests/web/meta.test.js
What changed:
- The document head carries the draft description, Open Graph tags (title, description, type, url, image, site name), `twitter:card` (`summary_large_image`), and `theme-color` `#0b0c10`.
- `theme-color` is the value of `--bg-0` in `tokens.css`. A meta tag cannot read a CSS variable, so the colour is written in `index.html` with a comment. The test reads `--bg-0` and fails if the two drift.
- `og:image` points at `https://traveller.voyage/og.png`. The file itself arrives in C3.
- `robots.txt` allows `/` and disallows `/api/`, `/account`, `/claim/`, and `/join/`. It names the sitemap.
- `sitemap.xml` lists `/`, `/packages`, `/help`, and `/welcome` on `https://traveller.voyage`.
Gates: test 1974 run, 1935 pass, 0 fail, 39 skipped; check clean; typecheck clean; build clean (`dist/index.html`, `dist/robots.txt`, `dist/sitemap.xml`)
Shots: none. The change is the document head and two public files.
Questions: none

## C2 L2, the welcome window, and /help on a cold load — done
Files: apps/web/src/views/WelcomeView.vue, apps/web/src/workspace/WelcomeWindow.vue, apps/web/src/workspace/welcome.ts, apps/web/src/workspace/first_visit.ts, apps/web/src/router.ts, apps/web/src/map/routes.ts (the `/welcome` fit only), apps/web/src/workspace/AccountMenu.vue (the About control only), tests/web/welcome.test.js. HelpView.vue and HelpWindow.vue were not changed.
What changed:
- `/welcome` renders the map with a window over it. A signed-out first visit, with no stored camera, is sent there once after the address settles and the session is known. A named address, a returning camera, and a signed-in person stay put. Closing the window stores `voyage_welcome_shown`.
- While the window is up, the first-visit hint stays down. MapView.vue was not edited.
- The window has the positioning line, three panes (Fly, Run, Share) with sized placeholders, Create an account (the sign-in card, default pitch, inside the window), and Just explore. The footer is the geomorph credit and a link to Version 1.2.6. No legal text.
- Open Regina goes to `/s/Spinward_Marches/1910`. See an example ship loads a ship flagged example and shows its name in the window, then a link to that hex with the dossier closed. Browse the marketplace goes to `/packages`.
- About Traveller.voyage sits in the account pop-up for a signed-in person and a signed-out person, and opens `/welcome` any time.
- `/help` on this tree already cold-loads the guide. Production is still blank because that route is not in the deployed bundle. `/changes` and `/welcome` cold-load the same way: each view mounts the map, and the window renders on its own.
Pane drafts for Johnny:
- Positioning: "Traveller.voyage puts a private campaign on the official chart of the Traveller universe. It's free."
- Fly / The chart / "The chart has 512 sectors. Open Regina to read one world." / Open Regina
- Run / A campaign on the map / "Keep records, ships, and a clock on the chart. An example ship is already flying." / See an example ship
- Share / A package you can import / "Publish part of your map, or import a package into a campaign." / Browse the marketplace
Gates: test 1997 run, 1958 pass, 0 fail, 39 skipped; check clean; typecheck clean. Build failed in `apps/web/src/workspace/CampaignPanel.vue` (Lane E's claim): `leadVesselId` unused, `showTimeline` not defined. Not fixed. Clicked on the dev server: Open Regina landed on `/s/Spinward_Marches/1910`, Create an account showed Sign in, Just explore returned to `/` and the window was gone.
Shots: findings/ui_design_shots/sc_c2_help_1600.png, sc_c2_welcome_1600.png, sc_c2_welcome_390.png. No before shot; the window is new. The chart toast on those shots is the dev server with no API.
Questions:
1. Pane words above. Recommended: keep them until you edit.
2. Run shows the example ship inside the window, then a hex link. Opening the canvas ship card needs MapView.vue, which Lane D has claimed. Recommended: keep the in-window summary and the hex link.
3. The blank `/help` on production is the undeployed route. Recommended: no HelpWindow change.

## C3 L3, pictures — done
Files: apps/web/public/landing/fly.webp, apps/web/public/landing/run.webp, apps/web/public/landing/share.webp, apps/web/public/og.png, apps/web/src/workspace/WelcomeWindow.vue, apps/web/src/workspace/welcome.ts, tests/web/welcome.test.js
What changed:
- The three panes now show production screenshots. Fly is the chart at the names tier over the Regina subsector, with the dossier closed and the rail left out. Run is Regina's orbit with the Time drawer open. Share is the Feri terraces package page (`pk_W5FTJF8B2M77XHXT7FTBT1XB08`) with the cover removed before the shot. No AI art.
- `og.png` is the Spinward Marches chart at 1200 × 630 with the page's own wordmark. It is the image `index.html` already points at.
- Sizes: fly.webp 118922 bytes, run.webp 57940, share.webp 50182, og.png 90124. Each is under 200 kB.
Gates: test 2012 run, 1972 pass, 1 fail, 39 skipped. The failure is `tests/web/record_card.test.js` ("mounted once, in the Campaign panel"), in Lane E's `record_card.ts`. Not fixed. `welcome.test.js` 7 pass. Check clean. Typecheck clean. Build clean; `dist` has the four files.
Shots: findings/ui_design_shots/sc_c3_chart_1600.png, sc_c3_orbit_1600.png, sc_c3_package_1600.png, sc_c3_og.png, sc_c3_welcome_1600.png, sc_c3_welcome_390.png. The empty panes are sc_c2_welcome_1600.png and sc_c2_welcome_390.png. The chart toast on the welcome shots is the dev server with no API.
Questions:
1. These four pictures, for you to pass. Recommended: keep them. The package shot leaves empty space on the right so the title is small in the pane, and it contains no cover.

## C4 U19, cold-load tests for every route — done
Files: tests/web/cold_load.test.js
What changed:
- One check per path in the static router table, with a representative address (Regina `1910`, body `w0`, the Feri terraces package, a claim token).
- `/account`, `/claim/:token`, `/packages`, and `/packages/:packageId` render to HTML. `/changes`, `/help`, and `/welcome` render their windows; each view still mounts the map.
- The three old `/campaign` paths redirect onto `/` with the campaign or party panel.
- The test fails if the router table gains or drops a path without the list being updated.
Gates: test 2023 run, 1984 pass, 0 fail, 39 skipped. Check clean. Typecheck clean. Build failed in `apps/web/src/workspace/CampaignList.vue` (Lane E's claim): a `KeyboardEvent` cast. Not fixed.
Shots: none. The change is a test.
Questions:
1. `/`, the four `/s/...` map routes, and both orbit routes still set up through `window`, so a server render of `MapView.vue` or `OrbitView.vue` does not finish. `MapView.vue` is Lane D's claim. `OrbitView.vue` is shared and Lane L works in `orbit/`. Recommended: leave those seven as route-table checks. D and L can add the browser guards if a full render is wanted.

## C5 U35, the orbit view's first open — proposal
Files: none
What changed: nothing. `OrbitView.vue` does not set the panel span. `readSpan()` in `shell/panel_state.ts` returns `full` when that was the last choice, and that key is shared with the map. The open camera is `fitCamera` in `orbit/camera.ts`, which frames every body. There is no inner-system bound in `orbit/` or in `js/system_viewer.js`. The selected chip is the body in the address, and `/orbit` has none. `mainworldByKey` in `orbit/bodies.ts` already finds the mainworld.
Gates: not run. No files changed.
Shots: none
Questions:
1. Recommended: on an orbit address with no body, select the mainworld from `mainworldByKey`, frame the camera on that body's orbit (not a new Traveller cutoff), and set the panel to Column for the visit, putting the previous span back when the view closes. Do not edit `PanelHost.vue` (Lane E). Confirm that frame before it is built. `orbit/` is Lane L's working area.

## C6 U20, no layout shift — done
Files: none. The three routes do not render a Lane C file. Nothing in the welcome window, the help window, or `index.html` was reserved.
What changed: measured cumulative layout shift in headless Chrome at 1600 × 1000, device scale 1, on production, with a fresh profile. Shifts ignore input. Eight seconds after each navigation.
- `/` — 0.00007, one shift, `rail-item`.
- `/s/Spinward_Marches/1910` — 0.0202. Largest: `doss-stats` 0.0178 (`dossier/StatRows.vue`), then `panel-body` 0.0020 (`shell/Panel.vue`).
- `/s/Spinward_Marches/1910/orbit` — 1.90. The large shifts are `orbit-card` (`views/OrbitView.vue`), 0.55, 0.50, 0.44, 0.19.
The numbers after are the same. There was no edit to remeasure.
Gates: not run. No files changed.
Shots: none
Questions:
1. Recommended: Lane L reserves a height on `.orbit-card` before the picture arrives. Lane E reserves the panel header in `shell/Panel.vue`. The dossier stats row in `dossier/StatRows.vue` is the hex-route shift; that file is outside Lane C. The home route is already near zero.

## CL4 viewport-fit=cover — done
Files: apps/web/index.html, tests/web/meta.test.js
What changed: the viewport meta is `width=device-width, initial-scale=1.0, viewport-fit=cover`. The existing `env(safe-area-inset-bottom)` rules can now see the inset on a notched phone.
Gates: test 2032 run, 1993 pass, 0 fail, 39 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cl4_map_390.png, sc_cl4_orbit_390.png, sc_cl4_store_390.png. At 390 × 844 the document scroll width matches the viewport on all three. The rail, the search field, the orbit header, and the store title sit inside the screen. This Chrome reports a safe-area inset of zero, so a notch was not on the shot.
Questions: none

## CC6 The orbit card's height reserved — done
Files: apps/web/src/views/OrbitView.vue, tests/web/orbit_card.test.js
What changed:
- The card's height is the viewport minus the chrome insets and the phone sheet, from the first paint. The border sits inside that height.
- Until the shell publishes a pane width, an open pane holds the card at that span (column, half, or full) and the card does not slide. The reserved width is the pane plus one gutter on each side, which is the width the shell measures. Below 600 px the pane is a sheet, so the card does not reserve a side width.
- Measured again in headless Chrome, fresh profile, shifts that ignore input, eight seconds after navigation. Before, on production at 1600 × 1000: 0.285, 31 shifts, every one `.orbit-card` (the earlier 1.90 was the same element). After, local, at 1600 × 1000: 0.0129, five shifts, none of them the card. The card sits at x = 608 beside a 540 px pane, 982 × 980. At 390 × 844: 0.029, from the dossier stats and the panel header. The card is 302 × 402 and stops above the sheet.
Gates: test 2072 run, 2033 pass, 0 fail, 39 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cc6_before_1600.png, sc_cc6_before_390.png, sc_cc6_orbit_1600.png, sc_cc6_orbit_390.png
Questions: none

## CC5 The orbit visit — done
Files: apps/web/src/orbit/opening.ts, apps/web/src/orbit/OrbitCanvas.vue, apps/web/src/views/OrbitView.vue, apps/web/src/shell/panel_state.ts, apps/web/src/dossier/DossierPanel.vue, apps/web/src/workspace/CampaignPanel.vue, apps/web/src/characters/screens/CharactersPanel.vue, tests/web/orbit_opening.test.js, tests/web/panel_span.test.js
What changed:
- An orbit address with no body selects the mainworld. The key comes from mainworldByKey on the system pickSystem returns. A named body is left alone. Turning that chip off, while the address still names no body, stays off. The address is not rewritten.
- The picture frames that body on its orbit once the canvas has a size, at the view’s clock day. Fit and double-click are unchanged.
- The panel shows Column for the visit and does not write that choice. Leaving the view puts the remembered width back. Clicking a span button records that width instead. PanelHost.vue was not edited. The three panels subscribe so an already-open pane follows the visit.
- On Regina (/s/Spinward_Marches/1910/orbit), headless Chrome, fresh profile: the pressed chip is “Regina (mainworld)”, zoom 34.7 at 1600 (the whole-system fit reads 1.0) and 7.7 at 390. With voyage_panel_span stored as full, the open pane is column (540 px at 1600) and the map afterwards is full again.
Gates: test 2086 run, 2046 pass, 0 fail, 40 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cc5_before_1600.png, sc_cc5_before_390.png, sc_cc5_orbit_1600.png, sc_cc5_orbit_390.png
Questions: none

## CS4 One back button — done
Files: apps/web/src/orbit/OrbitHeader.vue, apps/web/src/views/OrbitView.vue
What changed:
- One control, named Back to the map. The tooltip is Back to the map (Esc) at every width. On a narrow header the words are hidden and the accessible name is Back to the map.
- Below 600 px the card starts under the search row, so that button is not covered. At 1600 the button is on the orbit card at x = 623, 150 px wide, and nothing covers it. The sweep had this same button at (131, 39), under the dossier title, while the card still started under the pane.
Gates: test 2103 run, 2062 pass, 0 fail, 41 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cs4_before_1600.png, sc_cs4_before_390.png, sc_cs4_orbit_1600.png, sc_cs4_orbit_390.png
Questions:
1. At 1600 the search field covers the dossier title and the Column and Half buttons. Recommended: hide the search on the orbit view. The field lives in OmniBox.vue, which this item does not name, so it was left.

## CS6 The chip row fades where it cuts — done
Files: apps/web/src/orbit/BodyChips.vue, tests/web/body_chips.test.js
What changed:
- Below 600 px the chips stay one scrolling row. A chip is at least 44 px by 44 px. At 1600 they still wrap, and a chip stays 30 px tall.
- Where the row cuts a chip, that edge fades out. The fade follows the scroll, so the start fades only after you move, and the end fades until the last chip is in view. On Regina at 390 the row is 1985 px in a 300 px track, the end is cut, and the first chip is 44 px tall.
Gates: test 2106 run, 2065 pass, 0 fail, 41 skipped. The chip test was run again after the mask colour change: 1 pass. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cs6_before_1600.png, sc_cs6_before_390.png, sc_cs6_orbit_1600.png, sc_cs6_orbit_390.png
Questions: none

## CU35 The empty-ship line and Space in the Time drawer — done
Files: apps/web/src/orbit/ShipStrip.vue, apps/web/src/views/OrbitView.vue, tests/web/orbit_u35.test.js
What changed:
- “No ships here” shows only while the campaign panel is open. A signed-in campaign with the panel shut leaves that corner of the picture empty. The ship list is unchanged when the system has ships.
- Opening the Time drawer focuses Year. Space there pauses or plays, and the year stays 1105. The same press from a time field or a range field plays too. A button keeps Space for itself.
- On Regina, signed out, headless Chrome: the drawer opens on Year, Space changes the play button from pressed to paused at 1600 and at 390, and the date stays 002-1105. No “No ships here” line is in the page.
Gates: test 2112 run, 2071 pass, 0 fail, 41 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cu35_before_1600.png, sc_cu35_after_1600.png, sc_cu35_before_390.png, sc_cu35_after_390.png
Questions: none

## CL4b The first-run card — proposal
Files: none
What changed:
- Not built. The queue asks for one mount line in CampaignPanel.vue. The Records empty sentence is in CampaignList.vue (“No records yet”), so that one line would sit above it.
- Step 2, New vessel, creates a record. An empty-state card then unmounts, before Set the campaign date. Decision 5 says the card leaves only when all three steps are done, and the “No party yet” card stays for a campaign that has records and no party.
- Step 1, Find your ship’s world, calls locate-system. Nothing in the campaign document records that a world was found. A new stored flag is a stored-data change.
Gates: not run. No files changed.
Shots: none
Questions:
1. Recommended: show the card until a vessel has a place and the campaign date is set. Step 1 ticks when a world is open this visit, and is not stored. The buttons call locate-system, create a vessel at that world, and open the date editor. Mount it from CampaignPanel, and hide CampaignList’s empty sentence while it is up. No new stored field.

## CS7 The search clears the panel title — done
Files: apps/web/src/views/OrbitView.vue, tests/web/orbit_panel_top.test.js
What changed:
- The orbit panel uses the map’s panel top, 76 px, under the search row. The search field stays where it is, on the map and on the orbit view.
- At 1600 the title “Regina” is at y = 106 and the field ends at y = 62. Column, Half and Full all clear it, and a point on the title hits the heading. At 390 the panel is the bottom sheet, already clear of the field, and it stays there.
Gates: test 2110 run, 2069 pass, 0 fail, 41 skipped. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cs7_before_1600_column.png, sc_cs7_before_1600_half.png, sc_cs7_before_1600_full.png, sc_cs7_before_390_column.png, sc_cs7_before_390_half.png, sc_cs7_before_390_full.png, and the same six with after.
Questions: none

## CL4b The first-run card — done
Files: apps/web/src/workspace/first_run.ts, apps/web/src/workspace/FirstRun.vue, apps/web/src/workspace/CampaignPanel.vue, apps/web/src/workspace/CampaignList.vue, tests/web/first_run.test.js
What changed:
- The card is on the records list, at column width and beside a record at full width. It stays until a live vessel has a place and the campaign date is set. An open world ticks step 1 for this visit and is not stored.
- Locate runs the existing locate-system command, and the button is named so the line can start there. Add your ship creates a vessel at the open world and opens it. Set the date opens the date editor. Locate and Add your ship wait until a world is open. All three wait while you are offline.
- While the card is up, the list hides “Your campaign starts here” and the “No … yet” sentence. The party’s “No party yet” card is unchanged.
Gates: test 2149 run, 2106 pass, 0 fail, 42 skipped, 1 todo. The todo is tests/api/players_logic.test.js (Lane B), left as it is. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cl4b_after_1600.png, sc_cl4b_after_390.png. No before shot. The card replaced the empty list in this pass. On Regina, signed in, with no records and no date: step 1 reads Done, Locate and Add your ship are enabled, and neither empty sentence is in the list.
Questions: none

## CS8 City lights on the atmosphere — done
Files: apps/web/src/surface/vanilla/gl_shade.ts, apps/web/src/surface/enhanced/draw.ts, tests/web/surface_city_gates.test.js, tests/web/surface_disc_delivery.test.js, tests/web/surface_gl.test.js
What changed:
- The orbit disc no longer adds city colour in the air. The halo outside the surface is air scatter only. The night-side limb haze that mixed city light into the air is gone. City light on the surface stays, under the air scatter.
- Enhanced already removed those two terms from its own program. Its markers now match the vanilla source, and it still does not multiply by `uCityHaze`.
- The software disc still draws no city lights. Settlement lights on the flat surface map stay on the sheet. `js/planet_gl.js` is unchanged. The shader parity test strips these two sites before it compares.
Gates: test 2172 run, 2129 pass, 0 fail, 42 skipped, 1 todo. The todo is tests/api/players_logic.test.js (Lane B), left as it is. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cs8_before_1600.png, sc_cs8_before_390.png, sc_cs8_after_1600.png, sc_cs8_after_390.png. Regina, vanilla surfaces, day and night on, at 1600 and 390. The camera faces the day side, so the city web is not the subject of the frame. The air rim is.
Questions: none

## CW1 The world panel streamlined — done
Files: apps/web/src/dossier/world_panel.ts, apps/web/src/dossier/WorldSection.vue, apps/web/src/dossier/DossierPanel.vue, apps/web/src/dossier/DossierBody.vue, apps/web/src/dossier/SurfaceStage.vue, apps/web/src/dossier/SurfaceTimeBar.vue, apps/web/src/dossier/FactTiles.vue, apps/web/src/dossier/model.ts, apps/web/src/workspace/RecordsHere.vue, apps/web/src/shell/Panel.vue, apps/web/src/design/tokens.css, tests/web/world_panel.test.js, tests/web/dossier_model.test.js
What changed:
- The header holds the pager. A mainworld shows the badge once, beside the title. Column with a pager keeps the width switch on its own row and leaves 48 px for the close button, so Full stays readable. Half and full keep the pager and the switch on one row. Panels without a pager keep the earlier column header.
- The map caption and the mainworld badge on the map are gone. One toolbar row holds the scale, the hex size, the picked terrain, and the layer controls. The lighting sentence sits on the map. Under 480 px of the map column the Day/Night and Symbols words hide and the icons stay. The time row is the campaign clock plus the local time, and it renders only on a rotating world. The readout opens the date editor. Escape and a pointer outside it close the editor.
- Five facts sit in one 3+2 panel. Mean temperature is degrees Celsius, with Fahrenheit beside it or under it when the cell is narrow. The Day and Night block is unmounted. Orbit, Physical, and Life drop Tidally locked, Twilight zone, and Orbital period, and they put the unit on the value. A tidally locked world with a twilight zone notes that on the rotation fact. The four sections collapse, remember the closed set on this device, and open again if storage throws. Your records folds the same way when you are signed in.
- The place line for a mainworld is the system title plus the hex. No calculation changed. Star pages still show kelvin on the star tiles. The world fact panel does not.
Checklist, column / half / full, at 1600 and at 390, on Youghal (locked, Spinward Marches 3039) and Efate (rotating, 1705):
- No standalone pager row. Pass at both widths and all three spans. The pager is in the header.
- Mainworld badge once, in the header. Pass.
- Toolbar is one row, 30 px, and does not wrap. Pass. At 1600, column and half are icon-only. Full shows the Day/Night and Symbols words. At 390 every span is icon-only, because the map column is under 480 px.
- No map caption and no time status line. Pass.
- Youghal: no time controls. Pass.
- Efate: one time row. The readout opens the date editor. Escape and a pointer on the page close it. Pass. Checked in the live page after the view updated, not from the screenshot script.
- One 3+2 stat panel. Pass. Temperature, the band, and the asides stay readable at half and at column.
- Day and Night block gone. Pass.
- Tidally locked, Twilight zone, and Orbital period are not rows in Orbit. Pass. Youghal’s rotation aside still says twilight band.
- No kelvin in the world panel text. Pass on Youghal and Efate. Star tiles still show kelvin.
- The four headings toggle with the pointer and with Enter. aria-expanded updates. A closed section stays closed after reload. Pass on Youghal in the live check. Space uses the button’s default. The signed-out shots do not show Your records, because that fold renders only when a session is present. The server render covers the heading and the stored closed set.
- Full at 1600 still reads as a two-column panel. Pass.
- One new duration token, --t-chevron, in tokens.css. No hex colour added outside that file.
Fields kept, after Life, in the same scroll: journey times, world profile, socioeconomics, the moons list, and the worlds list. The moons count is not a sixth fact tile. Orbits stays on its own actions row.
Gates: test 2228 run, 2186 pass, 0 fail, 42 skipped, 0 todo. That suite ran before the column header padding and the readout click handler. Check clean before those two edits. Typecheck clean earlier in the session. The web build is clean after both edits.
Shots: findings/ui_design_shots/sc_cw1_after_youghal_1600_{column,half,full}.png, sc_cw1_after_youghal_390_{column,half,full}.png, and the same six with rotating (Efate 1705). Before shots are the system overview, because the first pass did not open Mainworld. Headless Chrome. Edge without a GPU was not checked.
Questions:
1. The readout shows the campaign clock, which already includes hours, minutes, and seconds, and then the local time. Recommended: leave both. Changing the clock text would touch the orbit clock.

## CS9 Hover on a surface map hex — done
Files: apps/web/src/surface/hover_hex.ts, apps/web/src/surface/vanilla/map_grid.ts, apps/web/src/dossier/SurfaceStage.vue, tests/web/surface_hover.test.js
What changed:
- Moving a mouse or a pen over the surface map outlines the hex under the pointer and, on the enhanced map, shows that hex's terrain name in the toolbar. The outline is its own canvas, in the pick colour, redrawn when the hex or the zoom changes. The painted sheet is not redrawn for a hover.
- The hit-test runs at most once a frame. A later point in the same frame replaces the earlier one. Leaving the map clears the outline and the hover name. A click still pins the terrain name, and that name stays after the pointer leaves. A touch does not hover. A tap still pins.
- The enhanced map uses the hybrid hexes. Vanilla uses the same diamond lattice the grid already strokes, so the outline matches those hexes. Those hexes have no terrain name, which is the same as before. The software disc and the other sheet painters are unchanged. The overlay sits above whichever of them painted the sheet.
Gates: test 2252 run, 2210 pass, 0 fail, 42 skipped, 0 todo. Check clean. Typecheck clean. Build clean.
Shots: findings/ui_design_shots/sc_cs9_before_1600_column.png, sc_cs9_after_1600_column.png, sc_cs9_before_1600_large.png, sc_cs9_after_1600_large.png, and the same four at 390. Regina, enhanced. The hover name is Sea ice. Edge at 1600 column, with a GPU and with the GPU off: sc_cs9_before_edge_1600_column.png, sc_cs9_after_edge_1600_column.png, sc_cs9_before_edge_nogpu_1600_column.png, sc_cs9_after_edge_nogpu_1600_column.png. On each, a touch move showed no name, leaving cleared it, and a click kept it.
Questions: none

## CW1b One class in two files — done
Files: none this pass. The fact tiles already use `doss-figure` and `doss-figurepanel`. `doss-stat` stays in StatRows.vue only.
What changed:
- The collision test passes. No second rename.
- Edge was launched with the GPU disabled. Youghal (locked) and Efate (rotating) at column and half, 1600. Youghal shows Night side centred, no time row, and the twilight-band aside. Efate shows one time row, Full readable, and 68 °C with 154 °F. Below 600 px the width switch is hidden, so half is not a control there. Column at 390 is shot for both worlds.
Gates: test 2311 run, 2269 pass, 0 fail, 42 skipped, 0 todo. Check clean. Typecheck fails in `packages/shared/src/index.ts`: PlayersPage and the join types are exported twice. That file is not this item. Left as it is. Build was not re-run. No web source changed.
Shots: findings/ui_design_shots/sc_cw1b_edge_nogpu_youghal_1600_column.png, sc_cw1b_edge_nogpu_youghal_1600_half.png, sc_cw1b_edge_nogpu_efate_1600_column.png, sc_cw1b_edge_nogpu_efate_1600_half.png, sc_cw1b_edge_nogpu_youghal_390_column.png, sc_cw1b_edge_nogpu_efate_390_column.png.
Questions: none

## CS10 City light look — done
Files: apps/web/src/surface/enhanced/city_cube.ts, apps/web/src/surface/enhanced/city_look.ts, apps/web/src/surface/enhanced/city_gates.ts, apps/web/src/surface/enhanced/draw.ts, apps/web/src/surface/enhanced/bake.ts, tests/web/surface_city_gates.test.js, tests/web/surface_city_cube.test.js, tests/web/surface_disc_delivery.test.js. profile.ts and surface/vanilla/gl_shade.ts were not edited. tests/web/surface_city_pixels.test.js was not edited.
What changed:
- The cube bake keeps the base fill on the tech-level colour. Downtown cores mix most of the way toward white. Highways mix most of the way toward warm gold. Neon tints street and arterial lines only, and only in a minority of districts: the share runs from about 18% to about 36% as the neon amount rises, and those lines move 62% of the way from the tech colour toward the neon hue.
- Look C’s gain on population 9 and above, including Capital, is 1.2. The sheet weight is 0.45, and the sheet still applies only at population 9 or above with neon at 0.25 or above, so Regina (population 8) has no sheet. The sharp sample of the cube is unchanged. The glow samples higher mip levels (log2 of 3 and log2 of 8), with tight weight 3.2 and broad weight 2.2. A first pass at 4.8 and 3.6, with a flat violet replace, washed Capital into a purple fog. The shipped tint multiplies the baked colour toward violet, so gold and white stay.
- Crisp lines still fade with cloud cover at 0.92. The glow uses exp(-1.35 × cover), so thin cloud lets the dome through and thick cloud still covers it. The glow stays inside the surface disc, on the night side, under the air. The air shell still has no city term. The cube version is enhanced-cities-4d, so a stored cube rebakes. The draw-only trim did not bump the version again.
Gates: test 2337 run, 2294 pass, 0 fail, 43 skipped, 0 todo. The pixel check, untouched, reports outside max diff 0 of 56384 px and night shell alpha 0, diff 0, on enhanced Pavabid, vanilla Pavabid, and enhanced Rhylanor. Check clean. Typecheck clean. Build clean. All four ran after the glow trim.
Shots: findings/city_look_cs10/. Headless Edge, device scale 1. Night side toward the camera where the framing held.
- Before, GPU, 1600: sc_cs10_before_gpu_capital_1600.png (zoom 31.0, the pink and teal honeycomb), sc_cs10_before_gpu_regina_1600.png (zoom 39.6), sc_cs10_before_gpu_valhalla_1600.png (zoom 11.4, centred, smaller than the other two).
- After, GPU, 1600, the trimmed look: sc_cs10_after_gpu_capital_1600.png (zoom 50.4, warm white and gold cores, magenta and cyan as accents, glow inside the disc), sc_cs10_after_gpu_regina_1600.png (zoom 39.6), sc_cs10_after_gpu_valhalla_1600.png (zoom 34.8, night crescent, a few warm specks).
- Limb crops at 2× from those 1600 GPU frames: sc_cs10_before_gpu_{capital,regina,valhalla}_1600_limb2x.png and sc_cs10_after_gpu_{capital,regina,valhalla}_1600_limb2x.png. Each after crop includes the limb. Capital’s crop also includes day-side cloud. Regina’s and Valhalla’s tags are cut by the crop.
- 390 often frames the star, because the stage centre is the star until the world is tracked, and the extra wheel then flies into it. After, GPU: capital zoom 1.0, Regina 6.1, Valhalla 1.8.
- No GPU (`--disable-webgl --disable-webgl2 --disable-software-rasterizer`, probe webgl off): sc_cs10_after_nogpu_{capital,regina,valhalla}_{1600,390}.png. Zooms at 1600: Capital 56.7, Regina 39.6, Valhalla 36.0. The software disc does not sample the city cube, so these frames document that path. Before, no GPU, is the matching sc_cs10_before_nogpu_* set.
The low-tech world is Valhalla, Spinward Marches 2811. The catalogue row used to pick it is UWP E365432-5. The body card shows tech level 5 on the moon chips.
Questions:
1. At tech level 15 about 36% of districts take a neon accent. The Tech level row in planet_rendering.md still says most districts are neon at 15. Recommended: keep the minority. That even pink and teal fill is the look this item removes. If you want more colour at tech level 15, the share can rise in a second round.

## CC1 The local comms receiver — done
Files: apps/web/src/living/CommsReceiver.vue, apps/web/src/living/comms/receiver_render.ts, apps/web/src/design/tokens.css (new `--comms-*` colours only), apps/web/src/views/OrbitView.vue (one mount), tests/web/comms_receiver.test.js. The corpus, the event engine, and the scheduler were not edited. Those are Z's.
What changed:
- The orbit view shows the locked bars receiver at the lower right, just above the planet tabs, while the campaign's chatter switch is on. Quiet on this device hides it. A signed-out visit has no campaign, so the receiver stays off. There is no skip control, no waveform switch, and no demo loop.
- One transmission shows at a time. Words resolve one by one. The completed line is what the screen reader hears. The bars follow speech energy. The antenna arcs keep their own loop. SIG, the mast, and the header do not pulse with the words. Reduced motion drops the arcs and shows the whole line at once.
- Colours from the approved stylesheet are tokens. The renderer uses the browser module for frames, the clock, reduced motion, and tab visibility. Gradient ids are unique per instance.
- `transmit`, `idle`, and `onTranscriptComplete` match the interface in the comms prompt. Z has not published a controller entry, so nothing calls `transmit` in the app yet. The shots call it from the page to show a line mid-reveal.
Gates: test 2355 run, 2311 pass, 1 fail, 43 skipped, 0 todo. The failure is `tests/web/rail_build_pitch.test.js` against `apps/web/src/shell/Rail.vue`, which Lane D holds. Not fixed. `comms_receiver.test.js` passes. Check clean. Typecheck clean. Build clean, after the phone trim.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1. Before is the orbit with chatter off. After idle is "Awaiting transmission". After mid is "Free trader," with the bars up. GPU and no GPU (Edge launched with WebGL disabled), at 1600 and 390: `sc_cc1_before_{gpu,nogpu}_{1600,390}.png`, `sc_cc1_after_idle_{gpu,nogpu}_{1600,390}.png`, `sc_cc1_after_mid_{gpu,nogpu}_{1600,390}.png`. At 1600 the panel sits above the chips and clear of them. At 390 the heading is on screen and a long source name ellipsizes. The stage has no webgl probe attribute, so the no-GPU frames are identified by the launch flags.
Questions:
1. The receiver is not connected to a scheduler yet. Recommended: connect it when Z publishes the controller, and do not add a second timer here. That follow-up is CC1b.

## CC1b Wire the receiver to the controller — done
Files: apps/web/src/living/CommsReceiver.vue, apps/web/src/living/comms/receiver_render.ts, apps/web/src/platform/browser.ts (later and createElement), apps/web/src/views/OrbitView.vue (facts and props only), apps/web/src/workspace/LivingSettings.vue, apps/web/src/living/words.ts, tests/web/comms_receiver.test.js, tests/web/living_words.test.js, tests/web/living_settings.test.js. The controller, the corpus, and the event engine were not edited.
What changed:
- The receiver creates Z's controller on mount and destroys the controller first on unmount. Facts, the truth version, the campaign id, and shown are watched. Facts come from systemFacts for the system on screen. The chart alone, a party away, and a party in jump stay silent. A lead ship in flight, orbit, hold, or docked can hear.
- The renderer's timers and elements go through platform/browser.ts. The controller remains the only authority for when a line plays.
- Show background traffic is hidden until LS5. The chatter switch and Quiet on this device stay. The chatter help sentence is "Short radio traffic while a system is open in the orbit view. Players see it too."
- A test mounts the component with fake timers and a docked Regina fixture. The beacon completes once, and nothing is said before the beacon delay.
Gates: test 2421 run, 2375 pass, 0 fail, 46 skipped. Check clean. Typecheck clean. Web vue-tsc clean. Build clean.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1. Before is chatter on with no ship in the system: "Awaiting transmission". After is the same visit with a ship docked at Regina, mid welcome: "Welcome to Regina." GPU and no GPU (Edge launched with WebGL disabled), at 1600 and 390: `sc_cc1b_before_{gpu,nogpu}_{1600,390}.png`, `sc_cc1b_after_{gpu,nogpu}_{1600,390}.png`. The stage has no webgl probe attribute. The no-GPU frames are identified by the launch flags.
Questions: none

## LS5 Living systems: background traffic — done
Files: apps/web/src/living/roles.ts, apps/web/src/living/traffic.ts, apps/web/src/living/quiet.ts, apps/web/src/workspace/LivingSettings.vue, apps/web/src/orbit/commands.ts, apps/web/src/orbit/LayerKey.vue, apps/web/src/orbit/OrbitCanvas.vue, apps/web/src/views/OrbitView.vue, tests/web/living_traffic.test.js, tests/web/living_settings.test.js, tests/web/orbit_renderer.test.js. map/traffic.ts was imported for the hover plate only. The public chart scope, the ship list, and the renderer’s traffic colour were left as they stood.
What changed:
- A signed-in campaign with the traffic switch on draws seeded scenery in the orbit view. The count uses the freight-world index shape (assets/trade.txt:175-189) as a dial, then the presentation dials in reports/x_living_systems.md §3. Cap 12 ships plus 2 shuttles. A red zone draws 2 patrols. Class X draws no trader, liner, or shuttle. Naval, scout, way-station, and x-boat marks add their one ship. Liners are 1 in 4 of the count, at most 3, and only for population 8+ or starport A or B.
- Each ship belongs to the day it arrives. The view builds the previous day, this day, and the next day. A jump lasts about a week, so the jump mark shows while that arrival day is in the three-day window. Dock 6–30 hours. One third of traders skim when a gas giant is present. The arrival point is 1.15 times the mainworld 100D radius, at a seeded bearing. Flights use 2 G. Above 2 campaign days a second, only ships at a dock, in orbit, or on hold stay on screen.
- Marks use the muted wireframe already in the orbit renderer: trader and shuttle a circle, liner a rectangle, patrol a square, scout and courier a triangle. Names come from the shared ship-name list. The line under the name is an eligible ship line from the living pools. Press does nothing. Hover draws the map’s label plate. Campaign ship tags skip kind traffic. The schedule is not stored.
- The Layers chip is Traffic, hotkey `-`, command orbit-layer-traffic. It shows when the campaign traffic switch is on and this device is not Quiet. The chip writes voyage.living.traffic. Quiet still hides chatter and traffic together. Show background traffic is visible again in Living settings.
Gates: test 2427 run, 2381 pass, 0 fail, 46 skipped. living_traffic.test.js 5 pass. orbit_commands.test.js 3 pass. Check clean. API typecheck clean. Web vue-tsc clean. Build clean.
Shots: findings/ui_design_shots/. Regina’s orbit, headless Edge, device scale 1, Year 1,105 day 2. Before has no scenery marks. After shows muted wireframes beside Regina at 1600. At 390 the column dossier covers most of the picture. GPU and no GPU (Edge launched with WebGL disabled): `sc_ls5_before_{gpu,nogpu}_{1600,390}.png`, `sc_ls5_after_{gpu,nogpu}_{1600,390}.png`. A PerformanceObserver on each shot recorded one long task of 63–68 ms with traffic off and with traffic on. There is no observeLongTasks harness in the tree. The schedule did not add a longer task than the page already had.
Questions:
1. The Traffic chip uses its own device key, voyage.living.traffic, so hiding traffic leaves chatter on. Recommended: keep that key. Quiet on this device already hides both. If you want one control, the chip can set Quiet and hide chatter as well.

## CC2 System Comms in the orbit view — done
Files: apps/web/src/living/quiet.ts, apps/web/src/views/OrbitView.vue, apps/web/src/workspace/LivingSettings.vue, tests/web/system_comms.test.js, tests/web/living_settings.test.js, tests/web/living_words.test.js, tests/web/comms_receiver.test.js. The schema field living.chatter is unchanged. words.ts is unchanged.
What changed:
- The View drawer has a System Comms button stacked above Fit. It uses the orbit button look, the radar icon, aria-pressed, and the title "System Comms on" or "System Comms off". Pressed, it uses the active row colour.
- The choice is voyage.comms.on on this device. Absent means on. The read and the write go through platform/browser.ts, which already catches a blocked store. Signed out, a player, and a referee all get the same default.
- The receiver mounts when the orbit view is ready and this device has System Comms on. It does not read living.chatter, and Quiet does not hide it. With no campaign the controller's campaign key is none. Show system chatter is gone from Living settings. Show background traffic and Quiet stay.
- A signed-out visit with the switch on still shows "Awaiting transmission". The chart alone marks the party away, so a line plays once a lead ship is in the system.
Gates: test 2431 run, 2385 pass, 0 fail, 46 skipped. Check clean. API typecheck clean. Web vue-tsc clean. Build clean.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1, View drawer open. Before is the drawer with Fit and no System Comms button. After on shows the button above Fit and the receiver at "Awaiting transmission". After off keeps the button and hides the receiver. `sc_cc2_before_drawer_{1600,390}.png`, `sc_cc2_after_on_{1600,390}.png`, `sc_cc2_after_off_{1600,390}.png`. At 390 the drawer is scrolled so the button and Fit sit in the card above the world panel.
Questions:
1. Quiet on this device still says it hides chatter. The receiver ignores Quiet. Recommended: leave Quiet as the mute for background traffic, and leave the sentence for E.
2. With no lead ship, including a signed-out visit, the receiver stays on "Awaiting transmission". Recommended: keep that. The switch decides whether the receiver is there. A line still needs a ship in the system.

## CC2 amendment: System Comms and Fit on the lower left — done
Files: apps/web/src/views/OrbitView.vue, apps/web/src/orbit/OrbitCanvas.vue, tests/web/system_comms.test.js, tests/web/orbit_stage_layout.test.js
What changed:
- System Comms and Fit sit in a column at the lower left of the orbit foot, to the left of the body chips. The receiver stays at the lower right.
- The Fit control on the canvas corner is gone. Fit in the View drawer is the drawer control again. The stage Fit keeps the title "Fit the whole system (F, or double-click empty space)" and shows pressed while the picture is fitted. A double-click on empty space still fits the picture.
- An open drawer stops above the foot and the receiver. The stage publishes `--foot-height` and `--comms-height`, and the drawer max-height subtracts both, with overflow scrolling.
- A signed-out server render still shows System Comms and the stage Fit in the foot. The device choice is unchanged: `voyage.comms.on`, and an absent value means on.
Gates: npm test 2432 run, 2386 pass, 0 fail, 46 skipped (system_comms and orbit_stage_layout included). npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1. Before is the receiver over the canvas Fit. After puts System Comms and Fit at the lower left and the receiver at the lower right. `sc_cc2_place_before_{1600,1366,1024,390}.png`, `sc_cc2_place_after_{1600,1366,1024,390}.png`. At 1024 with the column panel open, the chips wrap into a tall block and the picture gets shorter. That wrap was already in the foot.
Questions: none. The two questions on the first CC2 entry still stand.

## CC3 Emergency red theme and mayday — done
Files: apps/web/src/living/comms/controller.ts, apps/web/src/living/comms/beowulf.ts, apps/web/src/living/comms/events.ts, apps/web/src/living/comms/mayday.ts, apps/web/src/living/comms/receiver_render.ts, apps/web/src/living/CommsReceiver.vue, apps/web/src/design/tokens.css, apps/web/src/views/OrbitView.vue, tests/web/comms_controller.test.js, tests/web/comms_engine.test.js, tests/web/comms_mayday.test.js
What changed:
- An event can carry theme normal or emergency. beowulfEvent sets emergency. The controller calls theme before the first fragment, keeps it through every fragment and pause, and sets normal after the last fade. Cancel, a jump, a truth change, System Comms turning off, and unmount set normal too. The choice is the theme field. No path matches the archive text.
- While the theme is emergency the archive row's type reads EMERGENCY. Channel, playback, and recorded signal stay as they are. The receiver sets data-comms-theme. Teal accents use the tokens --comms-emergency, --comms-emergency-hi, and --comms-emergency-glow. The fade is 700 ms in and 900 ms out, from tokens. prefers-reduced-motion still drops the fade. Amber labels stay amber. White text stays white.
- An orbit address that carries mayday, with a value or without one, arms the archive once per page load. The view reads the key from the router. Three seconds after the receiver mounts, Beowulf plays through the controller, ahead of ordinary chatter. It skips the 1-in-2048 roll and the once-only check, and it does not write the played flag. A later route in the same document does not play it again. Other addresses never read the key. System Comms can stay off: the receiver still mounts for that visit, and the saved switch is unchanged. After the archive, ordinary chatter continues only when the switch is on.
Acceptance:
- Normal chatter stays teal, and ordinary events never call emergency.
- Beowulf sets emergency before the first fragment and shows EMERGENCY.
- The receiver stays emergency across every fragment and pause, then returns to normal after the last fade.
- Jump, System Comms off, a truth change, and unmount each return the theme to normal.
- mayday: nothing before 3 s, Beowulf at 3 s, the played flag untouched, nothing without the key, no replay on the next system.
- Reduced motion still removes the long fade.
Gates: npm test 2440 run, 2394 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1. sc_cc3_normal_1600.png is the teal receiver on Awaiting transmission. sc_cc3_mid_1600.png is the frame part way to red. sc_cc3_emergency_1600.png is the red receiver mid-line, label EMERGENCY, source FREE TRADER BEOWULF. The line was forced on the mounted receiver so the theme can be seen with no lead ship.
Not seen live: a signed-in visit with a ship in the system, so this session did not watch a real band for a minute, a system change, a tab hide, or ?mayday playing itself. The controller tests cover that timing, the pause while a tab is hidden, and the cancel paths.
Questions:
1. mayday still requires the party in radio range (in the system or docked). A signed-out visit has no lead ship, so the receiver stays on Awaiting transmission and ?mayday does not play. Recommended: keep that gate. The archive is something the ship can hear. If you want the address to play with no ship, say so.

## CW2 The world panel header in the orbit view — done
Files: apps/web/src/shell/Panel.vue, apps/web/src/dossier/DossierPanel.vue, apps/web/src/shell/pane_back.ts, apps/web/src/orbit/opening.ts, apps/web/src/views/OrbitView.vue, tests/web/orbit_overview_back.test.js, tests/web/campaign_touch.test.js
What changed:
- The header corner has one size. Close sits on the edge. Back, when the stack has a previous pane, sits one gap to its left. The title row and the tools (the width switch and the pager) stay in the content box, at Column, Half, and Full. On a phone the same corner is 44 px. The old Column-plus-pager rule had reserved room for Close only, so FULL sat on the back chevron.
- The crumb in the orbit view opens the system overview and stays on the orbit route. The address is the body-less orbit path plus overview=1. That pane is not the opening mainworld, so the stack gains one step and Back returns to the body once. The map's crumb is unchanged: no body is already the system there.
- A clock rewrite of the same orbit address keeps overview=1. Choosing a body still drops it, because that navigation does not copy the key.
- An address with no body and no overview key still opens on the mainworld.
Gates: npm test 2457 run, 2411 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean (existing chunk-size warning).
Shots: findings/ui_design_shots/. Regina, headless Edge, device scale 1. Before: sc_cw2_before_column_1600.png, sc_cw2_before_half_1600.png, sc_cw2_before_full_1600.png, sc_cw2_before_column_1366.png, sc_cw2_before_half_1366.png, sc_cw2_before_full_1366.png, sc_cw2_before_column_390.png, sc_cw2_before_crumb_1600.png (crumb returned to the mainworld and Back was gone). After: sc_cw2_after_column_1600.png, sc_cw2_after_half_1600.png, sc_cw2_after_full_1600.png, sc_cw2_after_column_1366.png, sc_cw2_after_half_1366.png, sc_cw2_after_full_1366.png, sc_cw2_after_column_390.png, the same widths with no Back as sc_cw2_after_noback_*, sc_cw2_after_crumb_1600.png (Regina system, Back still there), sc_cw2_after_back_1600.png (the star again). Rectangles of the switch, the pager, Back, and Close do not overlap at those widths.
Questions: none

## CC2b The orbit layout test reads the public chart — done
Files: tests/web/orbit_stage_layout.test.js
What changed:
- The test sets VOYAGE_TRUTH_API to https://traveller.voyage when the variable is absent, the same chart scripts/dev.mjs gives Vite. The page then loads the chart through that proxy. It does not need a Worker on port 8787.
- Before Vite starts, the test asks the chart for /api/truth/versions and gives up after 5 seconds. If that request fails, the test skips with the reason "the chart at <origin> cannot be reached". A closed port is that case. The 60 second wait for the orbit stage stays only after the chart has answered.
Gates: on its own, with no dev server, 1 pass in 12.2 s. With VOYAGE_TRUTH_API=http://127.0.0.1:9, 1 skipped in 1.8 s, reason "the chart at http://127.0.0.1:9 cannot be reached". npm test 2457 run, 2411 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean (existing chunk-size warning).
Shots: none. The test's page is unchanged.
Questions: none

## CC4 System Comms: place, signal, frame, name, and fade — done
Files: apps/web/src/living/CommsReceiver.vue, apps/web/src/living/comms/receiver_render.ts, apps/web/src/views/OrbitView.vue, tests/web/comms_receiver.test.js, tests/web/orbit_stage_layout.test.js
What changed:
- The receiver's right edge stays on the orbit stage's 18px inset, just above the foot. System Comms and Fit stay at the lower left. The slot width is min(506px, 100% minus 36px), so a narrow stage no longer shrink-wraps the box. Nothing overlaps at 1600, 1366, 1024, or 390, with the chips on one row and on two.
- The SIG meter was never wired. The port kept the package's envelope (attack 0.043, release 0.235) and used it only for the trace. The ten bars were static CSS, lit at rest. They now scale from that envelope, each bar on its own noise, so they sit dark at zero and move only while a word is on the air. After the line's release the level returns to 0. Reduced motion stays at 0.
- The frame is a fixed rectangle: 506 by 221 at 1600, and 264 by 193 at 390. Text wraps or clips inside the transcript. The metadata chips keep their columns. Before this, the panel was only a minimum height, and under 540px that minimum was 0. A full approach line grew the box from 506 by 221 to 506 by 233 at 1600, and from 246 by 193 to 246 by 258 at 390. A Beowulf fragment that still fit stayed 221 at 1600 and grew to 223 at 390. The width at 390 was the shrink-wrapped 246, not the text.
- The heading reads SYSTEM COMMS. The region label is "System communications". The toggle stays System Comms. The trace caption still reads LOCAL SIGNAL.
- Turning System Comms off fades the receiver out, and turning it on fades it in. The slot changes opacity only, over `--t-base` with `--ease-out`. Reduced motion keeps a short fade on that slot, `--t-fast`, and does not pop. The receiver's own entrance no longer slides, so the frame stays put while the opacity changes. The controller's shown flag goes false as soon as the leave starts, so no line starts during the fade. The component unmounts when the opacity transition ends, or 400ms later if that event does not fire. Leaving the route uses the same fade and waits for it. The one mayday archive still holds the receiver when the switch is off.
Gates: npm test 2468 run, 2422 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean (existing chunk-size warning). The layout test passed in 12.8 s, including the inset, the equal frame through an ordinary line and all four Beowulf fragments at each of the four widths, and the 1600 leave: the slot stays mounted with opacity below 1, the rectangle unchanged, then it leaves the DOM. The receiver test's fake clock reads signal 0 while idle, above 0 mid-word, and 0 after the release.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1, signed out. Idle, mid-line, and Beowulf at 1600 and 390: sc_cc4_before_idle_1600.png, sc_cc4_before_line_1600.png, sc_cc4_before_beowulf_1600.png, sc_cc4_before_idle_390.png, sc_cc4_before_line_390.png, sc_cc4_before_beowulf_390.png, and the same six names with after. The frame is 506 by 221 at 1600 in every after shot, and 264 by 193 at 390. SIG reads 0 while idle and 0.30 to 0.51 during a line. The lines were forced on the mounted receiver, because a signed-out visit has no lead ship. Mid-fade, new names: sc_cc4_fade_1600.png (opacity 0.28, 506 by 221, no transform) and sc_cc4_fade_390.png (opacity 0.78, 264 by 193, no transform).
Questions: none

## CC4b System Comms fits three lines — done
Files: apps/web/src/living/CommsReceiver.vue, tests/web/orbit_stage_layout.test.js
What changed:
- The receiver box is one transcript line taller in every state, and the width is unchanged. The fixed height is 240px (was 221) and 212px under 540px (was 193). Text still wraps inside the box. The frame stays the same through an ordinary line, the longest corpus line, every Beowulf fragment, and the idle label.
- At 1600 the longest corpus line and Beowulf's longest fragment each wrap to two lines, and both fit. At 390 Beowulf's longest fragment wraps to three lines and all three fit. The longest corpus line wraps to four lines at 390. Three of those lines fit. The fourth still clips.
- The fade from CC4 was already in the tree (the slot stays mounted while the opacity falls, then it unmounts). This item did not build it again.
Gates: npm test 2468 run, 2422 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean (existing chunk-size warning). The layout test passed in 12.3 s, including the equal frame and the three-line check at 1600 and 390.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1, signed out. sc_cc4b_before_line_1600.png, sc_cc4b_before_beowulf_1600.png, sc_cc4b_before_line_390.png, sc_cc4b_before_beowulf_390.png, and the same four names with after. Before, the box is 506 by 221 and 264 by 193. After, it is 506 by 240 and 264 by 212. The lines were written into the transcript, because a signed-out visit has no lead ship.
Questions:
1. The longest corpus line wraps to four lines at 390, and the fourth line still clips. Recommended: leave the box at one extra line, which is what shows three lines. A second extra line, or a wider box, would be a separate change.

## CW3 Tidal locking W1 — done
Files: apps/web/src/surface/profile.ts, tests/web/surface_profile_lock.test.js, tests/golden/fixtures/engine_1.2.0/profile_regina.json, tests/golden/fixtures/engine_1.2.0/profile_zeycude.json
What changed:
- A moon locked to its planet is no longer star-locked in the surface profile. `climate.locked` and `rotation.locked` stay false when `isMoon`, `isSatellite`, or type `Satellite` is set. A planet with the same lock still reads true. The 13:37 decision accepts every locked moon in both ESM fixtures.
- Regina is `1910|w1m3`. Both of its lock fields go from true to false. The same two fields go from true to false on these rows, and on nothing else:
- `profile_regina.json`: `w1m0`, `w1m1`, `w1m2`, `w1m3` (Regina), `w2m1`, `w2m3`, `w5m0`, `w5m1`.
- `profile_zeycude.json`: `w1m1`, `w1m2`, `w6m0`.
- `profile_extra` is unchanged. The legacy fixtures `tests/golden/fixtures/profile_regina.json` and `profile_zeycude.json` were not edited, and their tests still pass.
Gates: npm test 2474 run, 2428 pass, 0 fail, 46 skipped. npm run check clean. API typecheck clean. Web vue-tsc clean inside npm run build. npm run build clean (existing chunk-size warning). The profile golden tests pass, including legacy.
Shots: findings/ui_design_shots/. Regina's orbit, headless Edge, device scale 1, signed out. Before: sc_cw3_before_1600.png and sc_cw3_before_390.png, a hot half and a cold half. After: sc_cw3_after_1600.png and sc_cw3_after_390.png, latitude bands.
Questions: none


