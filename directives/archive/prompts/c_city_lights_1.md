# Agent C — Enhanced becomes the default; then the city lights, step 1 of 5

Issued 2026-10-06 by the orchestrator. Do this after `c_plot_readout.md` is reported.
**This replaces `c_ghosts.md`:** the ghosts go to Agent A and the locked world's card to
Agent E, because this is the larger job and it is yours.

## Why

Johnny saw the city lights sitting on the air and chose to differ from the old app, with a
bar: *"it needs to look sci-fi and incredible, beautiful, glowy, spectacular, it really needs
to inspire awe and wonder and capture sci-fi city feel from space, like 'oh, I want to visit
there or go there'"*. Agent F has designed it: **`findings/city_lights_design.md` is the
specification.** Read all of it before anything else, with its two concept boards
(`findings/ui_design_shots/city_design_worlds.svg`, `city_design_clouds.svg`). It is built
in five steps, each ending in frames Johnny looks at. **This prompt is Part 0 and step 1
only.**

## Part 0: Enhanced is the default look

`apps/web/src/surface/preferences.ts` answers `vanilla` unless a stored or session choice
says `enhanced`. Johnny has ruled the other way: **a visitor who has never chosen gets
`enhanced`; a stored choice of `vanilla` is still honoured**, and so is a session choice
where storage is blocked. A test for each case: nothing stored, `vanilla` stored, `enhanced`
stored, storage blocked with and without a session choice. Say every place the old default
was assumed (a caption, a test, a sample). F's note says "default preference remains
vanilla pending Johnny's decision": that decision is now made.

## Step 1: the separate program and its delivery (F's "An independent enhanced program" and build step 1)

Exactly as the design says. In short, and the design wins where this is shorter:

- New enhanced shader and bake modules under `surface/enhanced/`, with a **separately
  linked draw program**. No string replacement on the vanilla source, no enhanced branch in
  vanilla arithmetic. `tests/web/surface_gl.test.js` and the vanilla shader bytes do not
  change.
- Mode, renderer version and generation carried in the worker request and result; dispatch
  at the service boundary (`prepareDiscs` ignores the mode today); stale results and
  bitmaps dropped after every asynchronous step; the inactive mode's GPU resources and held
  tiles released; a valid same-mode coarse tile kept while sharpening; the plain lit disc
  when there is no valid tile.
- In this step the enhanced program **draws the same baseline as vanilla**. Nothing about
  the lights changes yet.
- **Pin the three review worlds** the design names (Rhylanor, Spinward Marches 2716;
  Pavabid, 1238; Cantrel, 0104) from the released truth: their body keys, tree hashes and
  profile dumps, the date 002-1105 00:00, the cameras and the light, in a capture manifest
  in `findings/`. If a released body disagrees with the UWP the design quotes, record it
  and use what is released.

## Check

- `npm test` and `npm run check` green, pasted; the vanilla Node and browser parity suites
  unchanged and green; `npm run build`.
- The frames the design asks for at step 1, by its names: the paired three-world sheets,
  vanilla and enhanced, near and far, and a recording of vanilla → enhanced → vanilla in
  the orbit view. The first and last vanilla buffers match. A test of delayed worker and
  bitmap results during rapid mode switches.
- Frame intervals through a mode switch at Regina, the longest reported; none over 50 ms.
- Your files: `apps/web/src/surface/`, the disc calls it needs in `orbit/disc_batch.ts`,
  and your tests. Do not touch `OrbitCanvas.vue`, `OrbitRenderer.ts` beyond the disc
  painter's interface if step 1 needs it (say which lines), `views/`, `dossier/`,
  `workspace/`, `campaign/`. If the design and the code disagree, stop and say where.
  Stop and report.
