# Lane C own-system blank report
Prompt: prompts/c_own_system_blank.md
Status: done

Found the stage class already renamed to `doss-stage-daynight`, with the collision test green and the WebGL notice already in the three files. The prompt's Progress line was one step behind that code. Finished the gates, both shots, and this report. Backed out nothing.

## Changed files
- `apps/web/src/dossier/SurfaceStage.vue`: the map's day/night layer is `doss-stage-daynight` (template, both rules, reduced motion). `DayNight.vue` still owns `doss-daynight`. The map figure sets `data-webgl` and, when WebGL is missing, shows the quiet line.
- `apps/web/src/surface/webgl_notice.ts`: the shared sentence and `webglMissing()`, which probes `webgl2` then `webgl` on a page canvas and caches the result. Where `document` is missing it returns false, so the node disc tests stay on the textured path.
- `apps/web/src/orbit/OrbitRenderer.ts`: `paintWebglNotice()` draws that same sentence on the orbit picture and sets `data-webgl="off"` on the canvas. `OrbitView.vue` and `OrbitCanvas.vue` were left alone, so the orbit line is canvas text in the lent disc-drawing section.
- `tests/web/style_class_collision.test.js`: reads every unscoped `<style>` under `apps/web/src/dossier/` and `apps/web/src/surface/` and fails when one class is defined as a top-level selector in two files. Descendant rules such as `.doss-daynight > .ui-heading` do not count as a second definition. The list is empty, so no other owner is named.
- `findings/ui_design_shots/kc_live_webgl.png`, `findings/ui_design_shots/kc_live_nowebgl.png`.

## Gates
npm test:      pass (1413 tests, 1397 pass, 0 fail, 16 skipped)
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`)
npm run build: pass (vue-tsc and vite)
fourth gate:   `node scripts/surface_parity.js` exit 0, top-level `"ok": true`. The nested `mismatches: 616030` is the Regina negative control.

Production page `http://127.0.0.1:8808/s/Spinward_Marches/1910/orbit/b/w7` (Regina A-VI), Chrome headless, 1440×900.

With WebGL: `data-state="ready"`, `data-discs="ready:13"`, map `data-webgl="on"`, no notice. `section.doss-daynight` is `position: static`, 474×249 at (95, 747). `.doss-stage-daynight` is `position: absolute`, 474×237 at (95, 163), over the map. The pane is 506×2529. The shot shows the head, the map with its day/night layer, the UWP ribbon, the tiles, and Day and night as one section. The close body on the orbit picture is textured.

Without WebGL, Chrome `--headless=new --disable-gpu --disable-software-rasterizer`: a page canvas `getContext('webgl2')` and `getContext('webgl')` are both null. `data-discs="unavailable:0"`, map `data-webgl="off"`, canvas `data-webgl="off"`. The dossier stays whole (section still static, 474×249). The map and the orbit picture each show: "Planet surfaces need WebGL, which is turned off in this browser. Turn on hardware acceleration in the browser's settings, and then reload." The orbit discs are the flat day-and-night discs. The dossier map still paints, because that sheet is a 2D canvas. The local server on port 8808 is stopped.

## A path without WebGL
The dossier map already paints without WebGL. `renderFlatMapPixels` in `apps/web/src/surface/vanilla/map.ts` fills an 800×400 buffer on the CPU, and `paintDiamondMap` draws it with a 2D canvas. The stage's day/night layer is that same kind of canvas. Orbit discs are not on that path. `vanilla/gl.ts` asks for WebGL2 and, when the context is null, marks the painter broken. There is no 2D bake of a disc, so there is no per-body 2D time to report. With WebGL missing, the orbit picture keeps the flat day-and-night disc. A textured disc would be a new software renderer of the cube shaders, and it would lack the GPU lighting. Recommendation: leave the flat disc and the notice as the fallback. The dossier map keeps painting, and the shared sentence explains the missing orbit textures.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. Should a software renderer paint textured orbit discs when WebGL is missing? Recommended answer: no. Keep the flat day-and-night disc and the one-line notice. The dossier map already paints on a 2D canvas, and a disc texture would be a new renderer.
