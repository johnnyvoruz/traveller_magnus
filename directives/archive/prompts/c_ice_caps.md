# Lane C — ice caps that do not look like a perfect circle

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your rename, the collision test and the no-WebGL notice are accepted and go out in
1.1.3. One more thing first: Lane E saw `tests/web/surface_service.test.js`, "the page
path paints when workers are unavailable", fail once on `sheet.longestChunkMs < 50`
while other lanes' servers were running; it passes alone. Make that check not depend
on how busy the machine is (say how), without loosening what it proves.

## Why

Johnny, 2026-10-11: "for the ice-cap planetary textures we need to do something so
it's not so dang uniform, anything with an icecap on it looks like it's got nearly a
perfect circle on the top, we need something to sorta nibble at the edges at least a
little more... or that the oceans would cut into it."

## Goal

On every world that draws a polar cap, in the enhanced and the vanilla renderer, on
the dossier's surface map and on the orbit view's discs, the cap's edge is irregular
and follows the world under it: it reaches further over land and high ground, pulls
back over open sea, and breaks into lobes and bays. Seen from above the pole it must
no longer read as a circle.

## Constraints

- **How much ice a world has does not change.** Where the cap's size comes from (the
  world's data, the climate step, a rule table) stays exactly as it is; you change the
  shape of its edge, not its extent. Say in the report where the extent comes from, by
  file and line. If the look Johnny wants cannot be had without changing the extent,
  stop and report.
- **Deterministic.** The same world gives the same cap every time, on every machine,
  in both renderers: seed any noise from the world's own seed the way the terrain is
  seeded. No `Math.random`.
- **The sea cutting in** uses the sea mask the renderer already has; do not invent a
  second sea level. A water world with no land still gets a ragged edge from the noise
  alone.
- **Cost.** Bake time for a map and for a disc, before and after, on the worlds
  `scripts/surface_parity.js` uses. Not more than 10 percent slower; say the numbers.
- The parity script's expectations will move for capped worlds. That is expected:
  list which, show before and after, and update its pins only for those.
- Tidally locked worlds, worlds with a large axial tilt and fully frozen worlds: show
  one of each, and say what you did for them.

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`, `scripts/surface_parity.js`,
your tests in `tests/web/`, shots `kc_caps_*` (before and after, the pole seen from
above and the world at the equator, at least six worlds: one mostly sea, one mostly
land, one with islands, and the three special cases), `directives/reports/c_ice_caps.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`node scripts/surface_parity.js`; the shots; the bake times.

## Stop rule

Stop when the shots show it and the report is written. Put the before and after pairs
at the top of the report by file name, so Johnny can judge the look first.

Write `directives/reports/c_ice_caps.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the page-path timing check will use CPU time, and the cap edge is a shared nudge (lobes, sea retreat, land reach) that leaves the climate line where it is. next: wire it into the vanilla map, the hybrid sheet and the disc shader.
done: the nudge is in the vanilla map, the hybrid sheet and the disc shader, and the parity script pins the capped worlds. next: run the parity gate and take the before and after shots.
done: parity exits 0, the shots are taken, and the enhanced sheet yields the model in slices on this thread's CPU so the longest chunk stays under 50 ms. next: write the report.
done: the report is written. next: stop.
