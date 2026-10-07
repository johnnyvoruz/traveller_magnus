# Agent C — city lights, step 3 of 5: the hierarchy and the materials

Issued 2026-10-07 by the orchestrator. Step 2 and the ring cross-fade are **accepted and
called for push** (your ring hunks in `OrbitRenderer.ts` and your test, cut from the shared
file by line; your `surface/` files whole). The enhanced look reading the classifier's
word is accepted: the vanilla path keeps `tempBand`, and your list of what still reads a
temperature, and why each is right, is in the log.

## Three things left over from step 2, first

1. **A harness that can force what the orbit page cannot.** The design asked for crops at
   cloud `c = 0, .25, .5, .75, 1` and for city-on against city-off, and you rightly did
   not invent them: the orbit page has no such control. Steps 3 and 4 need the same
   (the C diagnostic, the cloud close-ups). Build a dev-only page beside
   `dev/surface-parity/` that draws the **enhanced** program for a pinned body with the
   overrides the design's sheets need (cloud amount, city on/off, the light vector, a
   fixed inspection camera), every override labelled on the frame. It ships in no product
   route. Then make the step 2 crops with it, for the same three worlds:
   `city_design_s2_{world}_cloud{000|025|050|075|100}_enhanced.png` and
   `..._city{on|off}_enhanced.png`.
2. **`scripts/surface_parity.js`, run.** Shared files changed in step 2 (`profile.ts`,
   `disc_shade.ts`, `service.ts`, `caption.ts`), each behind the mode. The unit tests say
   vanilla did not move; the parity script is the proof. Paste its result. If the
   one-pixel drift you mentioned is older than step 2, say which commit it dates from.
3. **Say it once, in the notes:** on the released chart (v5, no `surfaceTempBand`, no
   `liquidStatus`) Rhylanor's enhanced caption still reads "Water, frozen" at 328 K. That
   is the old data, and it changes when v6 is released, not before. No code for it.

## Then step 3, from `findings/city_lights_design.md`

Read "Bake and draw contract" (the static bake), the parameter ledger and the cost ledger
again, then step 3 under "What Agent C builds": **bake the hierarchy and the materials.**
Add the cube C and its static filtering, then the day material. Enhanced only; the vanilla
`DRAW_FRAG` and its bytes untouched; no glow taps (G1/G2 are step 4).

What Johnny must be able to see, on the same three worlds at the same pin
(002-1105 00:00, the hashes and the camera and light constants of steps 1 and 2 unchanged):
- the near and far sheets again, `city_design_s3_…`, DPR1 then DPR2;
- **a C diagnostic** (RGB and core) from the harness;
- **daylight views**: the built ground by day, so a night centre can be laid over its day
  ground and seen to coincide;
- **a slow turn of each world** (a GIF): no sliding of light against ground, no new
  necklaces along coasts, no jump at a cube seam;
- every LOD transition side by side, and the ground held fixed with only the cloud spin
  changed.

The design's acceptance for this step, which you check and report line by line: night
centres coincide with daytime built ground; no sliding; no new coast necklaces; no seam
jumps; gas giants and a population-zero world stay city-free (Regina C-II, Cantrel B-I);
nothing drawn under cloud at 0.95 or over; nothing city-coloured outside the silhouette.

## Budget and checks

The cost ledger's numbers for the bake and for the frame, measured: bake time per world
cold and warm, memory, and the longest presented frame through a mode switch, a fly-to
and a slow turn; **no frame at or over 50 ms**, and say so with the number rather than an
average. `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted.

`OrbitRenderer.ts` is shared with Agent A (the route) again: touch it only if step 3
truly needs it, and list your lines. Not yours: `orbit/ships.ts`, `orbit/course.ts`,
`NavConsole.vue`, `views/`, `campaign/`, `packages/`, `apps/api`. No git. Stop and
report after step 3; step 4 is a separate prompt.
