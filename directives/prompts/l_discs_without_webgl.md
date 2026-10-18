# Lane L — planet discs in a browser without WebGL

Issued 2026-10-17 by the orchestrator, for today only. You may be a fresh session with no memory.
Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/L.md`,
`directives/planet_rendering.md`, then this file. No git but read-only, no deploy, no `rules/`.
**Drawing only: engine output and the surface painter's colours are not touched.**

## The fault (live, Johnny's Edge)
Johnny's Edge has no WebGL (both contexts null, main thread and OffscreenCanvas). The orbit view's
planet discs are painted with WebGL2, so they draw no texture; `surface/webgl_notice.ts` shows "Planet
surfaces need WebGL…". The dossier's flat surface map already paints without WebGL: the vanilla
sheet has a CPU path (`surface/service.ts` `createChunkedMap`, `surface/vanilla/map*.ts`).

## Do
1. **A software disc:** when `webglMissing()` is true, paint each disc on a 2D canvas from the CPU
   sheet the dossier already makes: an orthographic sphere, each disc pixel mapped to latitude and
   longitude and sampled from the sheet, with the same tilt, rotation and terminator the WebGL disc
   uses (`disc_shade.ts`, `tilt_latitude.ts`). Plainer is fine (no specular, no clouds, no city
   lights); wrong is not: a world's coastlines, ice and colours must match its sheet.
2. **Off the main thread:** the sampling runs in the existing surface worker or a new one, in chunks,
   so no main-thread task passes 50 ms (manifesto, Graceful). Cache per body and size like the WebGL
   bakes.
3. **The notice:** with the software discs on, the notice says what is plainer, in one sentence, in
   Google style ("Planet surfaces are simpler because WebGL is turned off in this browser. …").
   Where nothing is missing any more, no notice.
4. **The WebGL path is untouched:** with WebGL on, every pixel is as before (prove it with the
   existing parity pages, `/dev/surface-parity` and `/dev/surface-parity/gl`).
5. **Speed:** time a system of 12 bodies at the orbit view's sizes, first paint and cached, at
   1600 px and DPR 2. Give the numbers.

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- Browser: headless Edge with WebGL turned off (`--disable-gpu --disable-webgl`, say what you used and
  prove both contexts are null), on a local build: the orbit view of Regina's system and of one ice
  world and one desert world, shots `findings/ui_design_shots/kl_discs_*`, each beside the same view
  with WebGL on.

## Report
Write `directives/reports/l_discs_without_webgl.md` from the template.

**Owned:** `apps/web/src/surface/` (new files for the software disc; the lines that choose the
path; `webgl_notice.ts`), the orbit view's disc hookup only if the disc path is chosen there (name the
file and lines; `views/OrbitView.vue` is shared), tests under `tests/web/`, your shots and report.
Lane C is working read-only this turn; it edits nothing in `surface/`.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: read the disc path (service.ts prepareDiscs/drawDisc, disc_hold, gl_shade geometry, both sheets); wrote surface/soft/globe.ts (vanilla globe from commitDiamond's calls, hybrid globe read back through the net, gas bands) and surface/soft/disc_paint.ts (orthographic disc, WebGL diffuse term, casters, rings). next: soft disc worker, page link, the choosing lines in service.ts.
done: soft disc worker (disc.worker.ts), page link (link.ts, start.ts, messages.ts), the choosing lines in service.ts prepareDiscs and disposeSurfaces, the new notice in webgl_notice.ts, tests/web/surface_soft_disc.test.js (17 green). next: full gates, then headless Edge with WebGL off.
done: headless Edge with WebGL off (both contexts null) and on; shots kl_discs_* (whole system, close-ups, gas giant); timings DPR 1 and 2; A/B long tasks soft vs flat; parity pages identical to HEAD with WebGL on. next: final gates, report.
done: final gates green (npm test 1929/0 fail, check clean, vue-tsc and api typecheck clean, build ok); report written to directives/reports/l_discs_without_webgl.md. next: none (stopped).
