# Agent C — city lights, step 4 of 5: the compact local glow

Issued 2026-10-07 by the orchestrator. Step 3 is **accepted as built** (cube C, the static
filtering, the day material, the harness at `/dev/city-lights`, the step 2 crops you
owed). **It is not pushed**: it goes live together with this step, for the reason under
"The look" below.

## First: parity again, after your last change to the vanilla files

Step 3 edited `surface/vanilla/gl.ts`, `gl_bake.ts` and `gl_shade.ts` (the per-baker
mount, cube C's unit, `uCloudForce`, `uCityOn`, `uDiag`). Your report says parity was
"already run, not run again", which reads as run before those edits. **Run
`scripts/surface_parity.js` now, on the tree as it stands, and paste the result.** It is
run once more at the end of this step. No push happens on a parity result older than the
last edit to a vanilla file.

## The look: what step 3 did to the picture, and what this step must give back

Put `city_design_s2_rhylanor_002-1105_near320_enhanced_dpr2.png` beside the `s3` frame of
the same name. Step 2, which is what is live: a bright filled network, saturated, under
dark cloud. Step 3: a thin line network on a darker ground, and **the cloud on the night
side now reads as grey patches lighter than the ground under them.** Each step is right
by the design, and the design said the spectacle returns here. But the frame as it
stands is a step down from what Johnny has on the live site, and his words for this work
were: *"it needs to look sci-fi and incredible, beautiful, glowy, spectacular, it really
needs to inspire awe and wonder and capture sci-fi city feel from space, like 'oh, I want
to visit there'."* That is the bar for this step's frames.

Two things to answer in the report, with numbers:
- **What lights the cloud on the night side**, and whether its brightness changed between
  step 2 and step 3 or only the ground under it did (the same cloud patch sampled in both
  frames). If night cloud is brighter than an unlit ground with no city beneath it, say
  whether that is the design's intent, and what you would do about it inside the design.
- **The Pavabid near crop** shows two discs overlapping at this pin. Say which body is
  which. Keep the pin and the constants; add one clean frame of Pavabid from the harness
  so the world can be judged.

## Then step 4, from `findings/city_lights_design.md`

"Add compact local glow": the glow taps G1 and G2 and the soft shoulder, as the bake and
draw contract and the parameter ledger give them. Enhanced only; the vanilla `DRAW_FRAG`
bytes untouched. The design's own tuning note applies: a stronger glow may be tuned
against this step's frames without reopening the surface-only rule. Use that room; say
what you set and why.

What Johnny must be able to see, same three worlds, same pin (002-1105 00:00), same
hashes and camera and light constants:
- the near and far sheets, `city_design_s4_…`, DPR1 then DPR2;
- **one comparison strip per world: step 2 (live) | step 3 | step 4**, at near 320 and at
  far 60, as `city_design_s4_{world}_compare.png`. This is the frame he will judge by;
- a clear, thin and thick cloud close-up from the harness (`cloud000`, `cloud050`,
  `cloud100` at least);
- a recording of a zoom from 20 to 320 px, and a slow turn.

The design's acceptance, checked line by line in the report: the glow stays near emitting
cores; dark gaps remain between districts; it vanishes beneath opaque cloud; it never
becomes a ring at the limb; nothing city-coloured outside the silhouette; gas giants and
a population-zero world stay city-free (Regina C-II, Cantrel B-I). The hand-drawn cloud
study in the design is the target.

## Budget and checks

The cost ledger's numbers for the two taps, measured at DPR1 and DPR2: the longest
presented frame through a mode switch, a fly-to, the zoom and the slow turn, **none at or
over 50 ms**, stated as the worst number. Memory after the step, beside step 3's table.
`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and the parity script
again, all pasted.

`OrbitRenderer.ts`, `orbit/`, `views/`, `campaign/`, `packages/`, `apps/api` are not
yours. No git. Stop and report after step 4; step 5 (the budget proof) is a separate
prompt.
