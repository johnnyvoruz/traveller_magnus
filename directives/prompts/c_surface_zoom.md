# Lane C — zoom in much further on the surface map, crisp at every step

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
`directives/planet_rendering.md`, then this file. No git but read-only, no deploy, no `rules/`.
Engine output is not touched: this pass is drawing only.

## Johnny's words (2026-10-15)

"I also want to be able to zoom in way more on the surface map please."

## Today

- `surface/hybrid/view.ts` 14: `HEX_READ_PX = 48`. `maxZoom` stops the zoom when one hex is
  48 CSS px wide.
- `dossier/SurfaceStage.vue` 123: the enhanced large view bakes once at 1600 × 800. Vanilla bakes
  at 800 × 400 and scales in CSS.
- So beyond the cap the picture would only blur.

## Do

1. **The cap rises to one hex at 320 CSS px**, about 6.7 times today's deepest view. Put the
   number in one named constant with a comment, and use it for both looks.
2. **Crisp at every zoom, never a blurred upscale:**
   - Past the zoom where the bake runs out of pixels (one bake pixel to one device pixel),
     draw the visible window again at device resolution.
   - Use the same painter and the same seeds, so a hex's colours and coastline never change
     with zoom. Only detail is added.
   - Keep the full bake underneath as the stand-in while the sharper window draws, so nothing
     flashes.
   - Throttle the redraw to the end of a wheel or pinch burst. Panning at a held zoom reuses
     what is drawn and draws only the new edge, or redraws the window. Pick what stays under
     one frame, and give the time.
3. **At the deep zooms**, if the painter has a finer level of detail (more noise octaves, the
   coast line, the hex grid's line width), let it grow with zoom so a close look shows texture,
   not flat colour. Say what you added. If adding detail would change what a hex is, don't add
   it: ask in your report.
4. **Controls:**
   - Wheel, pinch, the zoom keys and double-click all reach the new cap.
   - The fit button and the zoom readout, if there is one, stay right.
   - Pan stays clamped to the sheet at every zoom.
5. **Memory:** the redrawn window holds at most about 4 times the stage's device pixels. Measure
   it on a 1600 px stage at DPR 2 and give the number.

## Gates

- `npm test` and `npm run check`, the typecheck and `npm run build`.
- The surface parity checks (`/dev/surface-parity`), unchanged at fit.
- Frames for Johnny, on one temperate world with coast and one ice world, enhanced and vanilla,
  at fit, at today's cap, at about 3 times today's cap and at the new cap:
  `findings/ui_design_shots/kb27_surface_zoom_*`.
- A note on what the no-WebGL path does: it must still zoom to the new cap, even if it stays
  plainer.

## Report

Write `directives/reports/c_surface_zoom.md` from the template.

**Owned:**
- `apps/web/src/surface/` (all of it);
- `apps/web/src/dossier/SurfaceStage.vue`;
- tests under `tests/web/`;
- your shots and your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: read the bake cap (48 px, CSS scale only) and confirmed no half-done edit in the surface files. next: raise the cap and paint a sharp window with the same painter.
done: cap is 320 CSS px; sharp window uses the same painter past one bake pixel per device pixel. next: tests, then frames.
done: npm test 1782 pass, check clean, API typecheck clean, web build clean. The fit sheet pixel body matches HEAD. next: frames.
done: temperate and ice frames, and the no-WebGL cap check. next: the report.
done: report written at directives/reports/c_surface_zoom.md. next: stop the lane server and remove the temp Vite config.
done: lane Vite on 5227 stopped and vite.lane-c.config.ts removed. next: nothing.
