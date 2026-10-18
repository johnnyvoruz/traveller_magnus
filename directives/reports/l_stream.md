# L stream report

## L1 Software discs — done
Report: `reports/done/l_discs_without_webgl.md` (accepted by the orchestrator 14:45; entry written by the orchestrator, because the session ended after the prompt's report).

## L1b The dossier without the WebGL notice; stale orbit comments — done
Files: apps/web/src/dossier/SurfaceStage.vue, apps/web/src/orbit/OrbitRenderer.ts
What changed:
- The dossier shows no WebGL notice: the `<p class="doss-webgl">`, its style and the notice import are gone. `data-webgl` on the figure still reports `off` or `on`, from `webglMissing()`.
- `OrbitRenderer.ts`: the header comment (line 10) and the notice comment (lines 482-483) now say the discs are WebGL tiles, or the software discs without WebGL, else the flat fallback.
- Small enhanced globes keep the smaller sheet; gas giants keep the bands (decided 14:45; nothing to change).
Gates: test 1936 run, 1897 pass, 0 fail, 39 skipped; check clean; typecheck clean (vue-tsc and api); build ok
Shots: sL_L1b_before_1600.png (the dossier with the notice, from L1), sL_L1b_after_1600.png, sL_L1b_after_390.png (headless Edge, WebGL off; no `.doss-webgl`, no notice text, `data-webgl="off"`). There is no 390 before shot: the before state was gone when this item started.
Questions: none

## L2 The orbit view without WebGL — done (nothing else needed WebGL)
Files: none changed. Script: findings/kl_runtime/exercise.mjs.
What changed:
- Searched `orbit/`, `views/OrbitView.vue`, `map/` and `platform/` for WebGL: the only users are the disc path (`surface/vanilla/gl*`, `enhanced/city_cube.ts`, `enhanced/session.ts`), which L1 replaced with the software discs. The backdrop, bands, orbits, rings, highports, scan, selection, ships and lineups are all 2D canvas already.
- Ran every layout (orbits, row, column) and every layer switch (paths, moons, habitable, jump limit, day/night, scan, mainworld) by its button, off and back on, in headless Edge with WebGL off (both contexts null) and with WebGL on. No page errors in either. The discs stay tiled through every step, and the frame draw stays at 1.2 to 2.0 ms on average.
- Seen, not changed (WebGL side, not this item): in the row and column lineups with WebGL on (SwiftShader), the discs were still the flat fallback 3.5 s after the switch (`data-discs="ready:0"`), while the software discs had tiles (`ready:4`). Probably SwiftShader baking at the new sizes; worth checking on a real GPU.
Gates: no code change since L1b (test 1936 run, 1897 pass, 0 fail; check clean; typecheck clean; build ok)
Shots: sL_L2_row_webgl_off.png / _on, sL_L2_column_webgl_off.png / _on, sL_L2_daynight_off_webgl_off.png / _on (1600, DPR 1). The orbits-layout pair is kl_discs_regina_webgl_off.png / _on from L1.
Questions: none

## L3 The orbit view in the shared look — done
Files: apps/web/src/orbit/OrbitHeader.vue, HeaderClock.vue, Drawer.vue, BodyCard.vue, BodyChips.vue, NavConsole.vue, TimeControls.vue, ShipStrip.vue, OrbitPopover.vue (style, plus a kicker line in Drawer and OrbitHeader and the kind label in BodyCard). DrawerTabs.vue and LayerKey.vue: no change needed; the drawer's kicker heads the layer key.
What changed:
- Header: the place and age are a kicker over the system name (Orbitron 12 px capitals, --signal-dim, as the dossier's head). The date sits in the date box (`.ui-date`, teal). On a narrow stage the button itself is the box: the inner edge and the calendar icon drop, so the readout keeps its old width. At 390 the header is no wider than before.
- Drawers: each shelf leads with its name as a kicker (TIME, VIEW, LAYERS). Under 620 px it takes its own row. It is `aria-hidden`, since the region's label already says it.
- Cards: the selected body's card takes the frame's edge (--line-2) and teal halo (--frame-glow). Its kind ("MAINWORLD SATELLITE") is the frame label over the name, and the name is Orbitron 15 px. The inspector's bracket corners stay. The keyboard popover, the ship strip, the jump-to box and the nav console take the same halo.
- Counts: the moon count on a body chip and the time drawer's speed readout are Orbitron, as a frame's count. The nav console's labels and section rules are kickers, and its rule fades out as `.ui-rule.is-signal`.
- Contrast, computed with the contrast test's own helpers, all at least 4.5:1: --signal-dim on --stage-head 5.32 (header and popover kickers); --signal-dim on glass over --bg-0 5.29 (drawer kicker, card label, nav labels); --signal on glass 12.83 (moon count); --signal on --bg-2 14.21 (header date).
Gates: test 1961 run, 1922 pass, 0 fail, 39 skipped (an earlier run hit a syntax error in `contrast.test.js`, another lane's edit in progress, since fixed); check clean; typecheck clean (vue-tsc and api); build ok.
Shots: sL_L3_before_* and sL_L3_after_* at 1600 and 390: _view, _orbit-date (Time drawer), _drawer_view, _drawer_layers, _body (the selected body's card). The ship strip and nav console need a signed-in campaign, which the local build doesn't have; they are not in the shots.
Needs from others: the owner of `tests/web/contrast.test.js`: please register the four pairs above (I didn't claim the file; another lane was editing it).
Questions: none

## L4 The orbit view at 390 px — done
Files: apps/web/src/views/OrbitView.vue (style only), apps/web/src/orbit/OrbitHeader.vue, HeaderClock.vue, BodyChips.vue, TimeControls.vue, OrbitRenderer.ts, apps/web/src/surface/webgl_notice.ts. Claimed but unchanged: DrawerTabs.vue, LayerKey.vue, BodyCard.vue (OrbitView's phone rule covers their targets).
What changed (all under `@media (max-width: 599px)`, the panel's own sheet breakpoint, unless noted; nothing changes above it):
- The stage stops above the phone sheet: `.orbit-card` bottom is the inset plus `--sheet-cover` (published by shell/PanelHost.vue) or the browser's bottom inset, whichever is larger. This holds at every width; both are 0 on a desktop. Before, the sheet covered the chips and the lower half of the picture.
- Every control is a 44 px touch target: one rule in OrbitView sets min-width and min-height on buttons, tabs, layer keys, chips, scrub ends, the date fields, the card's close and the seasons help, and the sliders get a 44 px track. The probe counts 0 controls under 44 px in every state (before: 29 to 41 per state). The one exception is the Linear scale checkbox, which sits inside a 44 px label.
- Header in two rows: back and name, then the clock and the drawer tabs. The readout's padding shrinks to fit. The keyboard help button is hidden (no keyboard on a phone; before, it sat off the right edge).
- Body chips are one row that scrolls sideways (before: three or four rows under the sheet). A moons list stands over the chip row across the card, so the scroller doesn't clip it; choosing a moon from it works.
- Drawers taller than the picture scroll inside it (the Time drawer's last row was cut off). The View drawer's layout buttons wrap (Column was off the edge), and so does the speed row.
- The WebGL notice is one line on a picture under 520 px wide: "Planet surfaces are simpler because WebGL is turned off." (`SURFACE_WEBGL_NOTICE_SHORT`). Before, it was six lines over the picture.
- The browser's bars: the bottom inset is in the card's bottom edge. `env(safe-area-inset-*)` is only non-zero with `viewport-fit=cover` in index.html, which isn't in my area (proposal, below).
Gates: test 1968 run, 1928 pass, 1 fail, 39 skipped. The failure is `journal_mention.test.js` "two thousand records filter inside one frame" (69.6 ms on a loaded machine, two headless browsers running); it passes 3 of 3 alone, and the file isn't mine. check clean; typecheck clean (vue-tsc and api); build ok.
Shots: sL_L4_before_390_* and sL_L4_after_390_* (_view, _orbit-date, _orbit-drawer-view, _orbit-drawer-layers, _body), sL_L4_after_390_moons.png; sL_L4_after_1600_* (unchanged from L3's after shots). Script: findings/kl_runtime/phone_probe.mjs, moons_390.mjs.
Proposal (outside my area, apps/web/index.html, Lane D or the orchestrator): add `viewport-fit=cover` to the viewport meta so the safe-area insets apply on notched phones. Size: one attribute.
Seen, not mine: at 390 the icon rail (shell/Rail.vue, D's) keeps 68 px of a 390 px screen, so the orbit card is 300 px wide.
Questions: none

## L5 Main-thread budget — done (four fixes; the rest logged with owners)
Files: apps/web/src/map/MapRenderer.ts, apps/web/src/surface/webgl_notice.ts, apps/web/src/surface/webgl_probe.worker.ts (new), apps/web/src/surface/service.ts, apps/web/src/orbit/OrbitRenderer.ts, tests/web/surface_soft_disc.test.js; log findings/perf/stream_l_long_tasks.md; scripts findings/kl_runtime/perf.mjs.
What changed:
- The grid at sector zoom is cached as Path2D blocks in world space, stroked under the camera transform. Before, it was rebuilt hex by hex every frame (28–63 ms a frame at 4x). Sector zoom with a GPU: 6 long tasks down to 3; with no GPU: 29 down to 7. Cost: the first frame at the hex zoom builds the blocks once (about 170 ms at 4x). I tried building two blocks a frame instead, but that makes consecutive frames differ until all are built, which `public_games.test.js` rightly checks, so I took it back out.
- `prefers-reduced-motion` in the map renderer is read at most once a second (one read cost a 55 ms style pass).
- The WebGL check runs in a worker (`webglState()`: unknown, ok or missing; `onWebglState`), so no page task makes a context; it cost 71–83 ms as the orbit view opened. `prepareDiscs` says pending until the answer. 4 new tests.
- A ringed world's flat ringlets are one path and one stroke.
- Left, with owners and sizes, in the log. The big one is Johnny's no-GPU case: every animated frame is 50–70 ms of main-thread rasterization at 4x. Proposal: half resolution while moving.
Gates: test 1977 run, 1938 pass, 0 fail, 39 skipped; check clean; typecheck clean (vue-tsc and api); build ok.
Shots: none (nothing visible changes).
Questions: none
