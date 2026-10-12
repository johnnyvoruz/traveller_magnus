# Lane C — urgent: two live faults, both found; fix them (replaces the earlier text of this prompt)

Issued 2026-10-11 18:50 by the orchestrator, replacing the 18:30 text of this file: the
"signed in" lead is dead (Johnny sees both faults in a private window and on charted
worlds), and the orchestrator has since found both causes on the live site. You may be
a fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/C.md`, then this file. No git but read-only,
no deploy, no `rules/`, no Traveller rule from memory.

## Fault 1: a world's dossier shows only "Day and night", drawn over the whole pane

Live, version 1.1.2, `https://traveller.voyage/s/Spinward_Marches/1910/orbit/b/w7`
(any world of any system). Johnny: "the only thing I see is the day/night info, no UWP
no anything else … renders atop EVERYTHING else". Shot:
`findings/ui_design_shots/live_daisuke_1.1.2.png`.

**Cause, read from the live page's computed styles.** Two unscoped rules share one
class name, and both land in the `DossierPanel` CSS chunk:

- `apps/web/src/dossier/DayNight.vue` line 115: `<section class="doss-section doss-daynight">`,
  styled at line 175 (border, background, padding).
- `apps/web/src/dossier/SurfaceStage.vue` line 460: `<div class="doss-daynight" …>`, the
  day and night layer over the surface map, styled at lines 537, 545 and 754
  (`position: absolute; inset: 0; pointer-events: none; opacity …`).

The section in the dossier therefore takes `position: absolute; inset: 0` and its own
background, and covers the pane (measured live: 540 by 887 px at the pane's origin).
The rest of the dossier is whole underneath it (`.doss-body` is 2,280 px tall with the
map, the ribbon and the sections). It came in with the hybrid surface map (`8118f72`).

**Fix, in your file:** rename the class in `SurfaceStage.vue` (all four places; a name
under the stage's own prefix, for example `doss-stage-daynight`) and anything in
`apps/web/src/surface/` or the tests that reads it. Do not touch `DayNight.vue`.

**Then make it impossible to repeat.** A test in `tests/web/` that reads every
`<style>` block that is not `scoped` under `apps/web/src/dossier/` and
`apps/web/src/surface/` and fails when one class selector is defined at the top level
of two different files. If it finds other collisions today, list them in the report;
fix the ones in your files, name the rest with their owner.

## Fault 2: no textures on the orbit view's discs, in Johnny's browser

**Cause, measured in his browser (Edge 154, on the live page):** WebGL is not
available there at all. `document.createElement('canvas').getContext('webgl2')` and
`('webgl')` both return null, the same on an `OffscreenCanvas`; the orbit view reports
`data-discs="unavailable:0"`; the worker file itself loads (200, 83 kB). So nothing is
wrong with the delivery you fixed; the app has no texture path without WebGL and says
nothing about it. That is why you could not reproduce it. Why his browser has no
WebGL (hardware acceleration off, or the browser turned it off after GPU crashes) is
his to check; the orchestrator has asked him.

**Do:**

1. Reproduce: run the production build in a browser started with WebGL off (for
   Chromium, `--disable-gpu --disable-software-rasterizer`, or whichever flags give
   null contexts; say which) and confirm `data-discs="unavailable:0"` and flat discs,
   and what the dossier's surface map shows in the same state.
2. **Say so, once, plainly.** When the surface service finds no WebGL, the orbit view
   and the dossier's surface map each show one short line in the app's existing
   quiet-notice pattern, in the Google developer documentation style: what is missing
   and what to do (for example: "Planet surfaces need WebGL, which is turned off in
   this browser. Turn on hardware acceleration in the browser's settings, and then
   reload."). Find where each line can live in your own files; if it needs
   `views/OrbitView.vue` or `dossier/DossierBody.vue` (not yours), give the exact line
   in the report instead.
3. **Report, do not build: a path without WebGL.** Is there a CPU path already in
   `apps/web/src/surface/` (the vanilla renderer, a 2D canvas bake) that could paint a
   disc texture and the dossier map without WebGL? What would it cost (time per body
   on a 2D canvas, what would look different)? One paragraph and a recommendation;
   Johnny decides.

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`, `SurfaceTimeBar.vue`,
`apps/web/src/orbit/disc_batch.ts` and the disc drawing in `orbit/OrbitRenderer.ts`
(lent), your tests in `tests/web/`, your token lines, shots `kc_live_*`,
`directives/reports/c_own_system_blank.md`. Read only: `dossier/DayNight.vue`,
`dossier/DossierBody.vue`, `dossier/DossierPanel.vue` (Lane D changed three lines),
`views/OrbitView.vue`, `apps/web/src/builder/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (a red file
that is not yours is named and passed over). Fourth gate: `node scripts/surface_parity.js`;
a production build in a browser **with** WebGL: open a world, the dossier is whole
(head, map, ribbon, tiles, Day and night as one section in its place), the map's own
day and night layer still works; the same **without** WebGL: the dossier is whole and
the notice shows. Shots of both, servers stopped.

## Stop rule

Fault 1 first: it is the urgent one and is a rename. Stop when both parts pass and the
report is written.

Write `directives/reports/c_own_system_blank.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: renamed the stage layer to doss-stage-daynight and added a collision test. No other unscoped class is defined in two files under dossier or surface. next: say when WebGL is missing, then shoot the dossier with WebGL and without.
done: the missing-WebGL line is in webgl_notice.ts, on the dossier map, and painted on the orbit picture. check and the production build are clean. next: shoot both browsers and write the report.
done: both shots pass. With WebGL the dossier is whole and discs are ready:13. Without WebGL (--disable-gpu --disable-software-rasterizer) discs are unavailable:0 and both notices show. Report written. next: stop.
