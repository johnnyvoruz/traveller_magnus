# Lane C c_surface_zoom report
Prompt: prompts/c_surface_zoom.md
Status: done

Found the surface files clean, with no half-done zoom edit.
Finished the 320 px cap, the sharp window, the frames, and the gates.
Backed nothing out.

Engine output was left alone. Versions were not bumped. Engines stay e1.2. The app stays on the last push, 1.2.2 at `7b6f4e5`.

## What the map does now

`HEX_READ_PX` in `surface/hybrid/view.ts` is 320. `maxZoom` uses that one constant for enhanced and vanilla. Fit stays zoom 1. Wheel (`ZOOM_WHEEL` 1.1), pinch, zoom keys (`ZOOM_KEY` 1.5), the zoom buttons, and double-click all call `viewLimit()`, which calls `maxZoom`. Vanilla used to stop at zoom 1 whenever the hybrid model was absent. It now uses `vanillaHexesAcross`, the same count `drawHexGrid` already used. Pan clamp is the existing `clampView`. There is no numeric zoom readout. Enhanced still shows the scale sentence and the hex bar. Fit is the Fit button and the `0` key, both `FIT_VIEW`.

The sharp window is a second canvas inside `.doss-zoom`, over the baked sheet and under the day/night tint. It is drawn only when one bake pixel would cover more than one device pixel (`devicePerBake > 1`). The bake stays up while the window paints, and during a wheel or pinch burst the window is hidden so the bake is the stand-in. Keys, buttons, double-click, and fit start the paint at once. A wheel or pinch waits `SHARP_BURST_MS` (120) after the last event. Each paint yields about every 16 ms.

A pan keeps the already painted canvas inside the zoom transform, so the picture tracks the finger. `SHARP_PAN_MS` (80) after the pan settles, the bitmap is shifted by whole device pixels and only the new strips are painted. A shift larger than the bitmap, or a pan that arrives while a strip is still filling, hides the window and paints it again. A node timing of a 7×1600 hybrid edge strip was 2.3 ms, so a full-height strip of about 14 device pixels stays inside one 16 ms frame at that rate. A full window does not: a 1600×800 hybrid half-window took 923 ms (0.721 µs/px), which extrapolates to about 3.7 s for the 3200×1600 window below. Vanilla on a 400×200 window was 46–48 ms (about 0.58 µs/px), about 3.0 s extrapolated to the same full window. The slices keep each turn under about 16 ms. On the design page the measured window paints were shorter because the stage is smaller: enhanced 857×429, about 462–548 ms for 367,653 px; vanilla 1366×683, about 458–733 ms for 932,978 px.

## Detail added at a close zoom

The extra grain is octaves 3 and 4 of the existing `gtr` grid (`CONTINENT_FREQ` × 8 and × 16, seed `tr`). It is added only when the window's side is finer than the bake: `grain += 0.045 * fineGrain`. The baked sheet does not call it. The coast is the same height-neighbour darkening, sampled on the finer pixels. The hex stroke is `hexGridCss`: 1 CSS px through 48 px per hex, 2 CSS px at 320. Vanilla has no second noise field. While its sharp window is live, the hex grid and the diamond separators are drawn in the marks canvas at device resolution, and they thicken with the same function. Crater count and crater positions stay on the bake layout and the bake seed.

## Memory

On a 1600×800 CSS stage at device pixel ratio 2 and zoom 1, the window is 3200×1600: 5,120,000 pixels, 20,480,000 bytes of retained RGBA. That is one copy of the stage's device pixels. `SHARP_PIXEL_CAP` is 4, so the reported ceiling is 4× that count. A spare canvas exists only during a pan shift, a second copy, still under the ceiling. The hybrid field for a window is built with `cacheField: false` and dropped after the paint. The worker and the sheet cache still hold the two fixed bakes, 800×400 and 1600×800.

## Frames

Temperate world: the design page specimen, UWP B766777-9, size 7, temperate, hydrographic 6. Enhanced stage about 857×429. At the cap, zoom 15.84 and the hex readout 320.0. A further wheel stayed there. Minus went 15.84 to 10.56. Key `0` returned zoom 1. Double-click went to 1.5. A pan moved the sheet, and a drag at zoom 1.5 clamped the translate to 0,0. Vanilla on a 1366-wide stage (35 hexes across): zoom 1 / 1.23 / 3.69 / 8.20 for fit, 48, 144, and 320 px per hex. A further step stayed at 8.20.

Ice world: released truth, Spinward Marches 1004 Esalin, mainworld index 2, body `w2`, UWP C565673-8, size 5, frozen, mean temperature 216.38 K. Route `/s/Spinward_Marches/1004/b/w2`. Enhanced stage 857: fit hex 28.3 with the sharp window off; 48 px (zoom 1.70) still off because the bake is finer than the screen (0.91 device pixels per bake pixel); 144 (zoom 5.09) and 320 (zoom 11.32) live. A further wheel stayed at 11.32. Vanilla size 5 is 25 hexes across, so on a 1366-wide stage fit is already about 55 px per hex. The published vanilla ice frames are the 1100×800 retake, stage 1026×513, zoom 1 / 1.17 / 3.51 / 7.79. A further step printed 7.80, which is `toFixed(2)` on the cap.

Files: `findings/ui_design_shots/kb27_surface_zoom_temperate_{enhanced,vanilla}_{fit,48,144,320}.png`, `kb27_surface_zoom_ice_enhanced_{fit,48,144,320}.png`, `kb27_surface_zoom_ice_vanilla_{fit,48,144,320}.png`, `kb27_surface_zoom_nowebgl_cap.png`.

Pinch was not exercised. The pinch path calls the same `applyView(..., 'burst')` as the wheel.

## No WebGL

The surface map is a 2D canvas either way. `webglMissing` only notices the orbit discs. Headless Chrome with WebGL disabled, on `/design`, enhanced, large map, twelve `+` keys: zoom 15.84, hex 320.0, sharp window live, state full. The notice still reads: "Planet surfaces need WebGL, which is turned off in this browser. Turn on hardware acceleration in the browser's settings, and then reload." The painter is the same one.

## Changed files
- `apps/web/src/surface/hybrid/view.ts`: `HEX_READ_PX` 320, `hexGridCss`.
- `apps/web/src/surface/hybrid/model.ts`: `fineGrain` octaves on the existing `tr` grid.
- `apps/web/src/surface/hybrid/paint.ts`: window placement, grain only when the window is finer, craters stay on the bake.
- `apps/web/src/surface/hybrid/field.ts`: `fieldBuild` can skip the field cache.
- `apps/web/src/surface/sharp.ts`: window geometry, pan strips, the 4× pixel ceiling.
- `apps/web/src/surface/sharp_view.ts`: burst, pan shift, chunked paint.
- `apps/web/src/surface/vanilla/map_window.ts`: the same diamond painter for a window.
- `apps/web/src/surface/vanilla/map_projection.ts`: the pixel write extracted as `commitDiamond`. Loops and the write match HEAD. `diamondLatLon` and `paintDiamondPoint` serve the window.
- `apps/web/src/surface/vanilla/map_grid.ts`: `vanillaHexesAcross`. Line widths default to the old 0.6 and 1.
- `apps/web/src/dossier/SurfaceStage.vue`: cap, sharp canvas, reasons, vanilla screen-space grid while the window is live.
- `tests/web/surface_sharp.test.js`: cap, geometry, strips, memory, integer diamond samples.

## Gates
npm test:      pass (1782 pass, 0 fail, 36 skipped; API tests skipped without `RUN_API_TESTS=1`). Run before the last comment edit. That edit does not change behaviour.
npm run check: pass (manifesto clean after the comment edit).
typecheck:     pass (`npm run typecheck`, API `tsc --noEmit`). Web `vue-tsc` passed inside the build.
fourth gate:   pass (`npm --workspace apps/web run build`: vue-tsc and vite, 683 modules). Dist has no parity harness.

Surface parity (`node scripts/surface_parity.js`, its own Vite on 5199): JSON `ok` is false, process exit 0. The fit sheet is the same pixel write as HEAD, and the grid defaults are unchanged, so this pass did not move the fit bake. Ice matched, 0 mismatches on 800×400. The other map worlds differ in the polar lobes: Regina 42012 mismatches, max channel error 183, mean 1.472; Jewell 41720 / 200 / 1.505; Efate 43526 / 202 / 2.037; Dry 57155 / 186 / 2.321. The Regina difference image is black across the equatorial band. GL shade rows also disagree, and this pass did not edit the GL pipeline or `scripts/surface_parity.js`: Ocean tilt 0/90/120, Ocean sweep 0 and 0.5, Ocean eclipse, Ocean light, Ocean radius 1100, Ringed phase 0 and 0.75, all `problems: ["tile"]`, `allowedDrift` false. Ocean radius 2.5 is the allowed single pixel. Negative control Ocean alt flags cube32, cube128, and mip1, with stats mismatches 0.

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
