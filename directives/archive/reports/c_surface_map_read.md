# Lane C surface map read report
Prompt: prompts/c_surface_map_read.md
Status: done

## Before and after

The before pair is the live column map, version 1.1.3. This pass has no earlier capture of the same build.

- `findings/ui_design_shots/live_map_symbols_off.png` / `kc_map_column_symbols_off.png`
- `findings/ui_design_shots/live_map_symbols_on.png` / `kc_map_column_symbols_on.png`

Twilight trials, then the width that ships (12°):

- `kc_map_twilight_6.png`
- `kc_map_twilight_12.png`
- `kc_map_twilight_18.png`

The browser pass, production build, own static server on port 5211, own Chrome profile. The server and Chrome are stopped.

- `kc_map_column_day.png`, `kc_map_column_day_off.png`
- `kc_map_large.png`
- `kc_map_key.png`
- `kc_map_half.png`, `kc_map_full.png`, `kc_map_520.png`
- `kc_map_reduced.png`
- `kc_map_vanilla.png`
- `kc_map_water.png`, `kc_map_dry.png`
- `kc_map_webgl_off.png`

## Changed files

- `apps/web/src/dossier/SurfaceStage.vue`: one stage for the column and the large view. Expand and Close, the key control, the scale under the map, the grid on every paint, labels that drop when they do not fit.
- `apps/web/src/dossier/SurfaceKey.vue`: the symbol key. Popover in the column. A fixed column beside the map when the map is large.
- `apps/web/src/surface/hybrid/symbols.ts`: `legendGroups`, `hexOutlineWidth`, label drop by gap and by gutter width.
- `apps/web/src/surface/hybrid/codes.ts`: unchanged. The key reads `SURFACE_CODES` and `CODE_TABLE` from here.
- `apps/web/src/surface/hybrid/overlay.ts`: night is one dark tint, twilight band 12°.
- `apps/web/src/surface/hybrid/daynight_layer.ts`: the sun reticle is gone. Settlement lights stay on the glow canvas.
- `apps/web/src/surface/hybrid/field.ts`: `LARGE_SHEET` is 1600×800. The column sheet stays 800×400.
- `apps/web/src/surface/contracts.ts`, `surface.worker.ts`, `service.ts`: the worker accepts only those two hybrid sizes.
- `apps/web/src/design/tokens.css`: `--surface-hex` is signal at 34%.
- `tests/web/surface_hybrid.test.js`: key groups, grid stroke with icons off, a label that does not fit is dropped.
- `apps/web/src/dossier/DossierBody.vue` and `DossierPanel.vue`: no edit. The large view does not need a line in either file.

## How the five items read

The world in the live shots is Vech, Mavuzog 2922, body `w1`, route `/s/Mavuzog/2922/b/w1`. The page reads UWP A7688B8-D. The caption reads "Surface map · Enhanced · Carbonic Acid". The scale under the map reads "1 hex ≈ 920 km". The water world is Vech A-II, `/b/w2`, caption "Surface map · Enhanced · Water · frozen". The dry body is Vech A-IV-a, `/b/w5m0`, hydro 0, and the caption builder still emits "Surface map · Enhanced · Water · frozen" for that frozen layout. The sheet in that shot is the grey ice ball.

1. **Open the map large.** The control is `ui-btn is-icon`, name "Open the map large", tooltip on the same name. It teleports the same `SurfaceStage` to `body` (`role="dialog"`, `aria-modal="true"`). Focus moves to Close. Escape and Close return focus to "Open the map large". Tab stays inside the dialog through `wrapFocus`. A hold element keeps the column height: 376 CSS px while the dialog is open, and 376 CSS px after it closes. Under reduced motion the large frame's computed `animation-name` is `none` and its duration is `0s` (`kc_map_reduced.png`). The enhanced sheet bakes at 1600×800. `data-sheet-ms` on that open is 915.0. The column bake on the same world is 333.2 ms. Vanilla stays on the 800×400 sheet and scales with CSS. The orbit discs do not share `paintDayNight`. Their light is `localC` and `capC` in `apps/web/src/surface/vanilla/gl_shaders.ts`. Their look is unchanged.

2. **A key for the symbols.** Names come from `CODE_TABLE` in `apps/web/src/surface/hybrid/codes.ts`. `legendGroups` in `symbols.ts` walks `SURFACE_CODES` in that table's order. The file comment on line 5 says the legend takes its names from this table. `rules/` has no Arcology, Taiga, or Ice cap names, so the table is the source. The legacy app's legend is the sector map: `hex_map.html` line 1341 (`#legend-toggle`) and line 1392 (`#legend-tray`), filled by `collectMapLegend` at `js/input_init.js` line 579 and `renderMapLegend` at line 637. That list is routes, regions, and borders. There is no surface-symbol key in `js/` to copy an order from. Judgement: every symbol is listed. Codes present on this world come first. The rest follow under the heading "Not on this world". On Vech the present names are Ocean, Shallows, Exotic terrain, Mountains, Starport, and City. In the column, **Key** opens a popover (`#surf-key`, `position: absolute`). The figure height stays 376 CSS px, so the shift is 0. Pointer opens it (`kc_map_key.png`). Enter on the focused **Key** button opens it, and Escape closes it, with the height still 376. In the large view the key is the column placement, beside the map, and it stays open (`kc_map_large.png`).

3. **The hex grid is always on.** Hybrid outlines draw on every paint. `icons` is true only while **Symbols** is on. The ink is `--surface-hex`, signal at 34%, the same mix as the legacy blank grid at `js/planet_renderer.js` line 1234 (`rgba(102, 252, 241, 0.34)`). The painted legacy call at line 1203 uses the default black stroke `rgba(0,0,0,0.45)` and `lineWidth` 0.6 (the function at line 917). Vanilla keeps that black stroke: `drawHexGrid` in `map_grid.ts` runs from `drawMapOverlay` on every vanilla paint, **Symbols** or not. Hybrid device-pixel width at device pixel ratio 1, from `data-grid-px`: column 0.74 at 474 CSS px, half 0.47 at 302 CSS px, full 1.00 at 670 CSS px. At a 520×900 viewport the column map is 386 CSS px and the grid is 0.60 device px. Both symbol states keep the grid (`kc_map_column_symbols_off.png`, `kc_map_column_symbols_on.png`).

4. **Day and night.** The night side is the tint `NIGHT_TINT` `[8, 12, 32]` with a twilight band of 12°. The 6° band reads as a hard edge at column width. The 18° band pulls dusk toward noon. 12° is the one that stays a soft edge. There is no terminator stroke, no border, and no second colour. The glow buffer stays clear. Settlement lights still draw on that canvas. **Day/Night** off clears the overlay (`kc_map_column_day_off.png`); on puts it back (`kc_map_column_day.png`). The large view uses the same painter.

5. **Column width.** The map's width rule is `width: 100%`. The previous rule was `min(100%, var(--panel-column))`, and `--panel-column` is 520px. At 1440×900 the column content box measures 474 CSS px, so the 520px cap does not shrink it. The drawn width before that rule change and after it is the same 474 CSS px. The type changes are what open the column up. The caption is 12px on 16px (it was 11.5px). Latitude labels stay at 12 CSS px and drop when the gutter cannot hold them. At column width the only label is "0°". The large view still draws 90°N through 90°S. The scale sits under the map at 12px: "1 hex ≈ 920 km" on Vech. Half is 302 CSS px because the existing half body splits the pane. That split is in `DossierPanel.vue`, which this pass does not edit. Full is 670 CSS px.

WebGL off: `data-webgl` is `off`, the notice is "Planet surfaces need WebGL, which is turned off in this browser. Turn on hardware acceleration in the browser's settings, and then reload.", and the 2D map still reaches `data-state` full (`kc_map_webgl_off.png`).

## Gates

npm test:      pass (1443 tests, 1426 pass, 0 fail, 17 skipped, RUN_API_TESTS unset)
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass (vite, 524 modules)
fourth gate:   pass. `node scripts/surface_parity.js` exit 0 (15.05 s). Browser pass on the production build, ports 5211 and 9351, both stopped. Worlds, spans, symbols, day and night, key by pointer and by Enter, reduced motion, and WebGL off are the shots above.

## Contract published

none

## Needs from others

none

## Questions for Johnny

1. The painted legacy grid (`js/planet_renderer.js` line 1203) is black at 45% opacity, with a line width of 0.6. The blank sheet on line 1234 is signal cyan at 34%. The enhanced map uses the cyan, through `--surface-hex`, because the sheet is dark and that is the grid the live symbols-on shot already shows. Recommended answer: keep the cyan token. Ask for a black token only if you want the painted-map ink on the dark enhanced sheet.

2. At half span the map is 302 CSS px wide. The column map is 474 CSS px. The half body already splits the pane, in `DossierPanel.vue` around the half-span rules (the `.doss-body[data-span="half"] .doss-map` block near line 766). This pass leaves that split alone, and the map fills the width it is given. Recommended answer: leave the split. Say if the half-span map should take the full pane width, and which line to add.
