# Agent C — the enhanced look reads the corrected climate; then city lights, step 2 of 5

Issued 2026-10-06 by the orchestrator. The fourth motion pass is **accepted and pushed**
(Moons off as the wave run back with its tiles held, Day/night on the same wireframe, a
planet's shade request the same with Moons on and off; your account of what `moonsShown`
was dropping is in the log). Johnny judges it live.

## Before anything: two things Johnny saw, to check on the deployed build

Minutes after pushing your fourth pass, and almost certainly while the build before it was
still the live one, Johnny reported: *"Moons on, click to remove, the textures still vanish
immediately. When we toggle Day / Night back on, the rings on a planet pop in, they should
fade in."* Your fourth pass is live now (`c7d4772`; the live orbit chunk is
`OrbitView-GbU36niV.js`).

- Open `https://traveller.voyage` itself (not your dev server), a ringed gas giant with
  moons at Regina (C-II), Enhanced, and do exactly those two things: Moons off; then
  Day/night off and on again. Record each as a GIF beside the same on your dev build.
- **If either still shows on the live build, it is first in this step:** the moons'
  textures stay until the returning wave has passed them; and a planet's rings never pop,
  in either direction of either switch: they cross-fade with the body's own sweep, and a
  ring whose tile arrives late fades up over `--t-base`. Say what differed between your
  dev frames and the live site (a production-only path, the default mode, device pixel
  ratio, a tile arriving later over the network) and add a test that would have caught it.
- If neither shows on the live build, say so with the two GIFs, and go on.
- **Update, from Johnny after a hard refresh on your fourth pass:** *"the moons animation
  is fixed now, the rings still pop in the day/night toggle."* So the Moons half is
  confirmed done, and **the rings popping when Day/night is switched is confirmed still
  there on the live build: fix it first.** Reproduce it on `https://traveller.voyage` at a
  ringed planet (off and on again), find why your dev frames did not show it, and make the
  rings cross-fade with the body's sweep in both directions.

## Part 0, small, and it gates the next truth release

A corrected truth version (v6) is being built now. Every world in it carries the fields
`packages/engines/src/reconcile_environment.js` writes: `surfaceTempBand` (`{ status:
'known', band }` or `{ status: 'unknown' }`: the climate word for the world's real mean
temperature, from Johnny's table), `orbitalTempBand`, a corrected `liquidType`, and
`liquidStatus`. Today's worlds have none of them.

`apps/web/src/surface/profile.ts` has `tempBandFromKelvin`, and `surface/identity.ts` falls
back to it. The corrections plan forbids a renderer's own Kelvin rule standing in for the
classifier. So:

- **Enhanced:** when a body has `surfaceTempBand` known, the look takes its band from that
  word. When the status is unknown, or the field is absent (every world today), the look
  is exactly what it is now. The corrected `liquidType` is read as it stands; a
  `liquidStatus` of unresolved or unknown is drawn as the "Unknown Exotic Liquid" look you
  built (never frozen, its caption saying the liquid is unresolved), and `none` as no sea.
- **Vanilla:** unchanged. It keeps `tempBand`, the legacy alias the corrections leave
  alone, and the old app's rule where there is none.
- Tests: a fixture body run through `reconcileTree` (a test may import the engines; the app
  may not) gives the enhanced profile the classifier's band; the same body without the
  fields gives today's profile byte for byte; vanilla's fixture digests do not move.
- Say in the report every place in `surface/` that still reads a temperature to choose a
  look, and why each is still right.

## Step 2 of `findings/city_lights_design.md`: put the light under the weather

Read the design again: "Per-frame terms and ordering", and build step 2 of "What Agent C
builds". In short, and the design wins where this is shorter:

- In the **enhanced** program only: the two `uCityHaze` additions and the city colour in
  `halo()` go. The existing direct city light and the downport get the design's gates:
  cloud transmission `T` (nothing at all once cloud reaches 0.95), the `night` ramp across
  the terminator, and `seen` at the limb. The downport loses its screen-space spikes and
  its broad halo in enhanced mode. The network, cube C and the glow are steps 3 and 4: not
  now. Vanilla's bytes do not change; `tests/web/surface_gl.test.js` is not touched.
- The frames the design asks for at step 2, by its names, of the same three pinned worlds
  at 002-1105: near and far, vanilla beside enhanced; a city-on / city-off difference
  image whose every pixel outside the planet's silhouette is zero; controlled crops at
  cloud 0, 0.25, 0.5, 0.75 and 1; a gas giant and a population-zero world as controls.
- A test for each gate where it can be pure; the difference-outside-the-disc check as a
  test if the harness can run it, otherwise as a measured number in the report.
- No frame over 50 ms through a mode switch and a fly-to at each of the three worlds; the
  longest reported.

One thing from step 1 to settle: `scripts/surface_parity.js` exited 1 on a one-channel,
one-pixel drift in a different tile each run. Say whether that happens with the mode set
to vanilla and the new dispatch out of the path (if you can show it), so it is known
whether step 1 brought it.

## Check

`npm test`, `npm run check`, `npm run build` green, pasted. Your files: `apps/web/src/surface/`
and its tests, and the disc calls in `orbit/disc_batch.ts`. Agents A and D are in
`orbit/OrbitRenderer.ts`, `ships.ts` and `OrbitCanvas.vue`: leave them. Stop and report.
