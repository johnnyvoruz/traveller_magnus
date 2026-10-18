# Agent C — city lights, step 4b: the glow is right and the worlds are too dark

Issued 2026-10-07 by the orchestrator. Step 4 is **accepted as engineering**: the glow
is in the enhanced draw only, the grey wash on night cloud is found and gone (your
account of the cube B spill is in the log), opaque cloud hides the city, nothing leaks
past the silhouette, gas giants and empty worlds stay dark, the worst frame is 33.2 ms,
and the end parity run exits 0. **It is not pushed**, because of what the compare strips
show.

## What the strips show

`city_design_s4_rhylanor_compare.png` and `city_design_s4_pavabid_compare.png`, read by
the orchestrator:
- **Rhylanor** (population 9, tech level 15). Step 2, which is live: the night side is
  alive from limb to terminator, a bright dense network. Step 4: a few glowing knots and
  faint threads on a black hemisphere. At far 60 the step 2 world plainly has cities;
  the step 4 world is nearly a dark disc.
- **Pavabid** (population 8). Step 2: warm patches you can see. Step 4: almost nothing,
  at near 320 and at far 60.
Step 4 is the more correct picture and the less impressive one. Johnny's words for this
work: *"it needs to look sci-fi and incredible, beautiful, glowy, spectacular, it
really needs to inspire awe and wonder and capture sci-fi city feel from space, like
'oh, I want to visit there'."* Most worlds are seen at 20 to 60 pixels in the orbit
view: a world of billions has to read as one at that size.

The design allows this pass: "Stronger glow can be tuned against stage 4's frames
without reopening the surface-only rule." What must not come back: the haze outside the
silhouette, light under opaque cloud, the grey wash on unlit cloud, light on gas giants
or empty worlds.

## Make three, and let Johnny choose

In the harness, by parameters and weights (the parameter ledger's own knobs: coverage of
the network by population, emission gain, the glow weights and admissions, the far-size
behaviour), no new texture and no new pass unless you show its cost:

- **A. Step 4 as it stands** (the reference).
- **B. Brighter and fuller, same structure.** The network carries more of the land on a
  high-population world (what scales with population in the ledger, pushed for 8 and 9
  and above), brighter arterials, the glow admitted at far sizes so a 20 to 60 pixel
  world shows a lit hemisphere and not specks. Dark gaps and dark oceans remain.
- **C. B, plus a low urban sheet under the network** where cube C has energy on the
  highest-population, highest-tech worlds: the "city from space" carpet that step 2's
  fill gave by accident, now only on built ground, under cloud transmission, never past
  the limb. Rhylanor should blaze; Pavabid should glow warm and modest; Cantrel
  (population 2) should stay a few sparks.

For each world one strip, `city_design_s4b_{rhylanor|pavabid|cantrel}_variants.png`:
**step 2 (live) | A | B | C**, at near 320 (DPR2) with far 60, far 40 and far 20 at
native pixels beneath each. Then one ordinary orbit view of the Rhylanor system for B
and for C (`city_design_s4b_orbit_{b|c}.png`), since that is where it is seen. Say in
numbers what changed between them (lit fraction of the night hemisphere and its mean
luminance, at near 320 and at far 60, for step 2, A, B and C).

Say which you would ship and why. Leave the tree on your choice, with A, B and C each
one named constant block away, so Johnny's pick is a one-line change.

## Hold the line on

The acceptance list of step 4, re-checked for B and C (cores keep their gaps; opaque
cloud black; no limb ring; nothing outside the silhouette; Regina C-II and Cantrel B-I
dark). The budget: the worst presented frame for B and for C at DPR1 and DPR2, none at
or over 50 ms; memory beside step 4's. `DRAW_FRAG` bytes untouched. `npm test`,
`npm run check`, `npm run typecheck`, `npm run build`, and `scripts/surface_parity.js`
once at the end, pasted (and say plainly whether the driver still exits 1 on a shade row
marked `allowedDrift`: if it does, that is a defect in the driver to list, not to patch
here).

`OrbitRenderer.ts`, `orbit/`, `views/`, `workspace/`, `campaign/`, `packages/`,
`apps/api` are not yours. No git. Stop and report.
