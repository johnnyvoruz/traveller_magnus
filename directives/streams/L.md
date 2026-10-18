# Stream L — rendering: surface, orbit view, map visuals

Read `streams/README.md` first; it is the loop. Today only (Johnny, 2026-10-17), until he stops you.

**Area:** `apps/web/src/surface/`, `apps/web/src/orbit/`, `apps/web/src/map/` (not `views/MapView.vue`
or `shell/Rail.vue`: Lane D's), tests under `tests/web/` for those. `views/OrbitView.vue` is shared:
style and the lines an item names only. Engine output and the surface painter's colours never change.
The shared look is `design/base.css`, block "The version-video look" (Lane M's): use its classes;
don't edit that block (propose additions).

## Queue
- [x] L1 Finish `prompts/l_discs_without_webgl.md` (software discs). Its report goes to
  `reports/l_discs_without_webgl.md` as the prompt says; then add a one-line entry to your stream report.
- [x] L1b **After the software discs (decided 14:45 on your questions: yes to all three):** the dossier shows
  no WebGL notice any more (`dossier/SurfaceStage.vue` line 114, `webglNotice = ''`, drop its
  `.doss-webgl` style; claim the file: it is Lane C's, free today); fix the two stale comments in
  `orbit/OrbitRenderer.ts` (lines 10 and 482-483). Small enhanced globes keep the smaller sheet; gas
  giants keep the bands.
- [x] L2 **The orbit view without WebGL:** find everything else `OrbitRenderer.ts` and the orbit view
  draw with WebGL; give each a 2D path so the whole view works in Johnny's Edge. Same proof as L1.
- [x] L3 **The orbit view in the shared look** (style and layout only): `OrbitHeader`, `HeaderClock`
  (its date in `.ui-date`), `Drawer`, `DrawerTabs`, `BodyCard`, `BodyChips`, `NavConsole`,
  `TimeControls`, `LayerKey`, `ShipStrip`, `OrbitPopover`. Kickers over sections, frames for cards.
- [x] L4 **The orbit view at 390 px:** every drawer, control and card usable on a phone; nothing under
  the browser's bars; touch targets 44 px.
- [x] L5 **Main-thread budget:** in headless Edge with 4x CPU throttling, record long tasks while
  panning and zooming the map at sector, subsector and hex zoom, opening a dossier, and opening the
  orbit view. Fix every task over 50 ms in your area; every other one is a proposal with its owner.
  Log `findings/perf/stream_l_long_tasks.md`.
- [ ] L6 **Nothing pops in:** discs and surface maps arrive without a layout shift or a grey flash: a
  placeholder of the final size, then a dissolve with the motion tokens.
- [ ] L7 **Traffic and routes at every zoom:** label collisions, overlapping tracks at sector zoom,
  the arrowheads at hex zoom, the cyan party route over lime traffic. Fix in `map/traffic.ts`,
  `map/route_lines.ts` and the route painting in `MapRenderer.ts`.
- [ ] L8 **The orbit view by keyboard:** a visible order through bodies and controls, the amber ring,
  and a list alternative for the canvas for screen readers.

## Found by me
