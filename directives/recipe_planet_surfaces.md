# Recipe: planet surfaces (one world, two views)

Written 2026-10-03 by Agent D (UI design lead, orbit view) for the orchestrator to issue to a
new agent. Johnny asked for it. It is a brief for a peer, not an implementer recipe: it sets
the goal, the contract, the reading, the order of work and the checks; the agent writes its
own plan first and builds after that plan is accepted.

**Status (orchestrator, 2026-10-04):** ISSUED, with the four corrections from Agent F's review
applied below (the shader parity check, the 50 ms rule for the map, a shared contract for
seasonal ice, the harness path) and P3 gated on Q2. Steps are assigned in §2a. Johnny's six
questions (§9) are also in `questions_for_johnny.md`, section E; **Q1 and Q2 are answered: see §0, which
puts a vanilla port (V1, V2) ahead of P3 and makes P3 onward the switchable enhanced mode.**

It covers slice 1 part **C4** (`slice_1_viewer.md`: "the surface map in the dossier, textured
discs in orbit") and the delighters of `campaign_manager_plan.md` §7.6 and §7.7.

## 0. Johnny's decision: vanilla first, enhancements you can switch off (2026-10-04)

"The old app handled the hex terrain, we want to copy that, but if there's room for
improvement as far as terrain and world generation I want to enhance it, but in a way that I
could disable those enhancements and go back to vanilla just in case."

This answers §9 Q1 and Q2 and reorders the work:

- **Vanilla is the legacy app's surfaces, copied.** The surface map is what
  `PlanetRenderer.renderFlatMap` draws and the orbit disc is what `PlanetGL` draws, ported
  with the same discipline as the engines: same inputs, same seeds, same output, proven
  against the legacy code. Vanilla is presentation, made in the browser from the released
  data, exactly as the legacy app made it. Terrain is a picture, not stored data, because that
  is what it is in the legacy app.
- **Everything else in this recipe is an enhancement:** one terrain shared by the map and
  the disc, hex terrain classes, archetypes, palette families, seasonal ice, moving clouds,
  city lights, lightning and the rest. Each one is built **on top of** vanilla and sits behind
  one switch.
- **The switch.** One setting, `surfaces: 'vanilla' | 'enhanced'`, per device, with a
  command in the registry. Vanilla must stay reachable and stay tested for as long as the
  app exists: its parity fixtures never go away, and an enhancement may not change what
  vanilla draws. P1 designs the switch so that an enhancement can also be turned off on its
  own when that is cheap.
- **Order.** P0 and P2 as written. Then **V1** (the vanilla surface map, a parity port of the
  legacy flat-map path) and **V2** (the vanilla disc, a parity port of the legacy bake and
  shade path) come before P3. P3 onward build the enhanced mode. F's review of the shader
  check applies to V2 as much as to P5.
- **If an enhancement ever needs terrain to be data** (a referee placing things on a hex, or
  exports listing terrain), that is a new question for Johnny at that point; nothing in
  vanilla needs it.

## 1. The goal in one sentence

For every world and moon in a released system, generate **one** deterministic surface from
the body's own data, and show it two ways that agree: as the **hex surface map** in the
dossier (water, forest, mountains, desert, ice, swamp and the rest) and as the **lit, turning
disc** in the orbit view (terrain, atmosphere, clouds, storms, lights).

The legacy app does not have this property. Its orbit discs come from `js/planet_gl.js`
(cube maps baked per world) and its surface map from `js/planet_renderer.js`
(`renderFlatMap`, a separate painter with its own seeds and palette inputs). The continent on
the map is not the continent on the globe. Closing that gap is the point of this work: a
visitor finds a bay on the map, opens the orbit view, and watches that bay turn into the
night.

## 2. Who owns what

| Owner | Owns |
|---|---|
| **The surfaces agent** (this recipe) | a new `apps/web/src/surface/` tree, its tests under `tests/web/surface_*.test.js`, new tokens it needs in `apps/web/src/design/tokens.css`, `findings/legacy_surface_inventory.md`, `findings/surface_design.md`, and keeping `directives/planet_rendering.md` true |
| **Agent D** | `apps/web/src/orbit/*` (the painter, the picture, the stage, the card, day and night, seasons). D wires the surfaces agent's renderers into the orbit view through the seams in §5; the surfaces agent does not edit D's files |
| **Agent A** | `orbit/system.ts`, `maths.ts`, `orbit_au.ts`. `surfaceKind` in `system.ts` returns `null` until this work lands; A or the orchestrator decides who changes it |
| **The dossier's owner** | `apps/web/src/dossier/*`. `SurfaceStage.vue` is the placeholder the hex map replaces; the orchestrator says who wires it |
| **Johnny** | `rules/`, every question in §9, git, deploys |

## 2a. Who does which step (orchestrator, 2026-10-04)

Agent F is a higher-effort agent with a limited budget, so it gets the parts where a wrong
design is expensive, and reads inventories instead of raw legacy code where it can.

| Step | Who | Why |
|---|---|---|
| P0 legacy surface inventory | Agent A | read-only, the same job as the orbit inventory |
| P2 the profile, with parity | Agent B | a mechanical port proven against the oracle, as borders and regions were |
| V1 the vanilla surface map, V2 the vanilla disc | **Agent F** designs the port and its proof in P1; who builds each is set when the plan is accepted | parity with legacy pixels is the specialised part |
| P1 the plan | **Agent F** | the single-terrain design, the bake, cache and worker plan, the seasonal-ice contract; written from P0's inventory |
| P3 one terrain | **Agent F** | CPU and shader must agree; the hardest correctness problem here |
| P5 the disc | **Agent F** | the WebGL2 bake and shade port |
| P4 the hex surface map, P6 the overlay | Agent C, to F's plan | |
| Wiring into the orbit view and dossier, the look, P7 delighters | Agent D | owns the orbit view and the look |

P0 and P2 start now and in parallel. P1 starts when P0 is in. Nothing after P1 starts
before the orchestrator accepts the plan and Johnny has answered Q1 and Q2.

## 3. Read first, in this order

1. `directives/manifesto.md`, `directives/plan.md`, `directives/handoff.md`: the house rules
   and the current state.
2. `directives/planet_rendering.md`: the existing specification of data → appearance (family,
   atmosphere, liquids, temperature, life, geology, people, rotation, gas giants, rings, the
   inspector surface map, settled points, open questions). It is the document this work must
   keep true; every new mapping is recorded there.
3. `findings/legacy_orbit_inventory.md` §7: what `planet_profile.js`, `planet_gl.js` and
   `planet_renderer.js` export and read, with line ranges.
4. The legacy code itself, as the reference to port: `js/planet_profile.js`,
   `js/planet_gl.js`, `js/planet_renderer.js`; in `js/system_viewer.js` the spin and surface
   path (about 3505-3560, 4157-4314) and how planets are collected and handed to the GL
   renderer (2675-2771); in `js/system_inspector.js` 507-583 and `js/hex_editor.js`
   2216-2358 how the surface map is asked for.
5. `directives/campaign_manager_plan.md` §7.6 (living planets: moving clouds, city lights,
   lightning) and §7.7 (terrain archetypes and palette families). These are Johnny's own
   specification for the delighters, with shader sketches and eligibility tables.
6. `findings/orbit_view_design.md` §5 (which fields the released document carries, and which
   it does not), §8a (Johnny's decisions on seasons, tilt, locking and temperatures), §8d
   (the season and day-and-night overlay for the surface map).
7. The seams: `apps/web/src/orbit/daynight.ts`, `seasons.ts`, `OrbitRenderer.ts`,
   `picture.ts`, `highport.ts`, and `apps/web/src/dossier/SurfaceStage.vue`.
8. The legacy look, to match or beat: run `hex_map.html` (the headless harness is
   `tests/oracle/legacy.js`), and see `findings/ui_design_shots/orbit_legacy_*.png` and
   `legacy_*.png`.
9. Real data: Regina (Spinward Marches 1910, 41 bodies, the mainworld is a moon of a gas
   giant) and hex 1531 (63 bodies, the largest system in the Marches).

## 4. Rules (the same ones every agent here works under)

- **`rules/` is read-only. No Traveller rule or meaning from memory.** Every look is driven
  by a field in the document. Where a look needs a threshold or a meaning that is not in
  `rules/` or already settled in `planet_rendering.md`, write the question for Johnny (§9)
  and leave that part out.
- **Never edit `js/`, `hex_map.html`, `style.css` or `rules/`.** Read them, port from them.
- **Pure, tested modules that run under Node** for everything that is not a pixel: the
  profile, the terrain, the biome of a hex, the projections, the bake plan. `.ts` files must
  run under Node type stripping (no enum, no parameter properties, no namespaces).
- **Every colour and duration through `tokens.css`**; browser globals only through
  `apps/web/src/platform/browser.ts`; `npm run check` enforces it.
- **No engine code in the browser, and the browser never imports `@voyage/engines` or
  `@voyage/generation`.** A surface is presentation, as in legacy ("nothing here changes
  generation, export, or any RPG value"). If Johnny decides hex terrain is *data* (§9 Q1),
  that part moves to `packages/generation` and the truth build, and this recipe changes.
- **Deterministic.** Seed from the hex key and the body's dossier key (`s<i>`, `w<i>`,
  `w<i>m<j>`, from `bodyKeys` in `apps/web/src/dossier/model.ts`), so a world looks the
  same on every visit and device. Do not define a second key scheme.
- **Smoothness is an acceptance criterion: 16 ms a frame, measured in the browser**, on
  Regina and on 1531, at every zoom and with the clock at a year a second. Bake once, cache,
  draw the cache.
- **Nothing blocks the main thread for more than 50 ms** (manifesto, Graceful;
  `architecture.md` §10). Terrain sampling for a map, and any bake that is not on the GPU,
  runs in a Web Worker created through `platform/browser.ts`, or is proven under 50 ms by a
  cold measurement. A scan animation does not excuse blocking work: it freezes with the
  thread.
- **Why this is computed in the browser at all.** `architecture.md` §10.1 says the viewer
  downloads and draws and does not derive. Surfaces are the stated exception: the truth
  holds about six million bodies, so their pictures cannot be files. The exception holds
  only while a surface is presentation (§9 Q1), is deterministic from the released data,
  is generated off the main thread on demand, and is cached for the session.
- **Degrade, never blank.** No WebGL2, a lost context, or reduced motion must still give a
  good picture: a 2D fallback for the disc, lighting kept, clouds, storms and spin frozen
  under reduced motion.
- **No `npm install` without asking.** Legacy uses raw WebGL2; so can this. Three.js is the
  later 2.5D step (C5), not this one.
- **No git.** Johnny stages and commits.
- **Reports** lead with the outcome, paste `npm run check`, `npm test`, `npm run typecheck`
  and `npm run build`, give frame times and screenshots beside the legacy views, and say
  what was not exercised and anything done beyond scope.

## 5. The contract: what Agent D needs back

These are the seams the orbit view and the dossier plug into. Names are proposals; the shape
is the requirement. Settle them with Agent D in the plan (step P1) before building.

```ts
// apps/web/src/surface/profile.ts — pure. The port of PlanetProfile.kind / .of / .halo.
surfaceKind(body): 'star' | 'gas' | 'belt' | 'ring' | 'hot' | 'ice' | 'ocean' | ... | null
surfaceProfile(body, seedKey): Profile          // rock, liquid, climate, air, life, geology,
                                                // clouds, lights, rings, rotation, albedo, gas

// apps/web/src/surface/terrain.ts — pure. The single source of truth for both views.
// Everything is a function of a unit vector on the sphere (or latitude and longitude).
elevationAt(profile, lat, lon): number          // −1..1 about sea level
cellAt(profile, lat, lon): Cell                 // { elevation, water, ice, biome, ... }
                                                // `ice` here is the permanent cap. Seasonal
                                                // ice is a separate, time-dependent layer:
seasonalIce(profile, lat, lon, season): number  // 0..1; `season` from Agent D's seasons.ts.
                                                // P1 fixes this contract (see P1).

// apps/web/src/surface/hexmap.ts — pure. The surface map's grid.
hexToLatLon(profile, hex): { lat, lon }         // and back; states where longitude 0 is
hexTerrain(profile, hex): Terrain               // 'ocean' | 'forest' | 'mountain' | 'desert'
                                                // | 'ice' | 'swamp' | ... (§9 Q2 fixes the list)

// Renderers (browser).
drawDisc(ctx, request): boolean                 // request: key, profile, x, y, radius, spin,
                                                // star direction, tilt basis, casters, time;
                                                // false = not ready, caller paints the flat disc
axisBasis(profile, tiltDeg): Basis              // for the highport's orbit and the 2.5D step
drawSurfaceMap(canvas, profile, options)        // the dossier's hex map; options carry the
                                                // overlay inputs below
```

What Agent D supplies to those calls, already built and tested:

- **Spin**: `spinAngle(turningOf(body, isMoon), days, starAngle)` from `orbit/daynight.ts`.
  Take the spin from the caller; do not compute a second one. A planet locked to its star
  keeps one face to it; a locked *moon* turns once per orbit (Johnny's Q1, 2026-10-03),
  which differs from the legacy spin.
- **The star overhead**: `subsolarLongitude`, `subsolarLatitude` (the season's declination,
  from `orbit/seasons.ts`), `sunElevation(lat, lon, ...)` and `dayFraction` for the
  terminator, polar day and night, and local time on the map.
- **The picture**: where each world is, how large, and where its star is
  (`orbit/picture.ts` `WorldDraw`: `x`, `y`, `r`, `z`, `starX`, `starY`), the moons that can
  cast shadows, and the layer switches (`Layers.dayNight`).
- **The highport** (`orbit/highport.ts`): it circles in the picture plane today
  (`FLAT_BASIS`); with `axisBasis` it will circle the equator and pass behind the world.

## 6. The order of work

Each step ends with a check. Do not start a step before the one before it is reported.

**P0. The legacy surface inventory.** Write `findings/legacy_surface_inventory.md` in the
manner of `findings/legacy_orbit_inventory.md`: what each of the three legacy files does,
function by function with line ranges; every field read; every constant; how the surface
map's hex grid is laid out and which projection it uses; what is cached and when. State
plainly where the two legacy renderers disagree (seeds, palette inputs, terrain).
*Check: Agent D or the orchestrator can answer "what does legacy do for X" from the file
alone.*

**P1. The plan.** Write `findings/surface_design.md`: the single-terrain design, the module
list, the contract of §5 as agreed with Agent D, the bake and cache plan with its memory
budget (legacy: 320 MB, cube sizes 32 to 1024), the fallback path, the test plan, the
performance plan, and the questions for Johnny. It must also settle **seasonal ice** as one
contract both views consume: what the season input is, whether a hex's terrain class ever
changes with the season (the default answer is no: the class comes from the permanent cell,
and seasonal ice is drawn over it), and how caps advance and retreat without rebaking a
cube map each frame (a uniform in the shader and an overlay on the map, not a new bake).
And it names any extension the oracle (`tests/oracle/legacy.js`) needs for the profile
fixtures. *Check: accepted by the orchestrator before any code.*

**P2. The profile, with parity.** Port `PlanetProfile.kind`, `.of` and `.halo` to
`surface/profile.ts`. Capture golden fixtures from the legacy functions through
`tests/oracle/legacy.js` for a spread of bodies (Regina's 41, plus hot, exotic, barren,
ocean, ice, gas, belt and ring cases) and assert the port matches field for field. Any
difference is reported, never "fixed" toward either side. Note: the released document has
no `worldType`, `rotationPeriod` or `orbitalPeriod`, so the legacy branches keyed on them
never fire for released worlds. *Check: fixtures green; `surfaceKind` answers for every
body of Regina.*

**P3. One terrain.** `surface/terrain.ts`: elevation, water, ice and biome as pure
functions on the sphere, seeded, with the legacy generator as archetype 0 so today's worlds
keep their character. **Gated on Q2** (the terrain classes and thresholds): P3 implements
biomes, so it does not start before Johnny has approved the table.

A CPU reference and the shader must agree, and a TypeScript transcription of the GLSL is
not proof of that: it can pass while the GPU draws different coastlines. So:
- **One sea level.** The legacy disc derives its sea level from GPU samples. Here sea
  level is computed once, by one function, and passed to both paths as a number.
- **Node tests** hold the pure terrain to fixed sample points (determinism, ranges, the
  same cell for the same latitude and longitude from the map path and the disc path's CPU
  reference).
- **A browser check against the real shader**, run by an agent with a browser: render the
  terrain with the actual GLSL into a framebuffer, read back a fixed grid of at least 512
  points for at least three worlds (an ocean world, a dry world, an ice world), and compare
  with the CPU reference: elevation within a stated tolerance, and the **classification**
  (water or land, ice or not, biome) equal at every point that is further than that
  tolerance from a threshold. The numbers go in the report. The harness page lives under
  `apps/web` dev-only routes and is not shipped.
*Check: the Node tests green and the browser comparison reported with its tolerances.*

**P4. The hex surface map.** `surface/hexmap.ts` and the map renderer: each hex classed as
one terrain from the cell under it, drawn in the legacy diamond sheet's place in the
dossier, with the scan-then-fade reveal `planet_rendering.md` describes. The class list
and its thresholds are Johnny's to approve (§9 Q2) before this step builds. *Check:
Regina's map in the browser beside the legacy sheet; a **cold** map (nothing cached) is
measured, and no main-thread task in it exceeds 50 ms; the map's terrain is sampled in a
worker and the scan plays while it works.*

**P5. The disc.** The WebGL2 bake and shade path ported from `planet_gl.js`, reading the
P3 terrain, with the 2D fallback. Agent D then calls `drawDisc` from the orbit painter in
place of the flat disc, and `axisBasis` for the highport. *Check: Regina in orbit beside
the legacy view at fit, framed and at the zoom ceiling; frame times at every zoom on
Regina and 1531 at 1× and 2× pixel ratio; context loss falls back and recovers.*

**P6. The overlay** (`findings/orbit_view_design.md` §8d): on the surface map, the night
side and its terminator sweeping once per solar day, the season named on each hemisphere,
the band where the star passes overhead, polar day and night; local time and season under
the pointer. All from Agent D's `daynight.ts` and `seasons.ts`, on the orbit view's clock.
*Check: scrub the clock in the orbit view; the terminator on the map and the lit half of
the disc agree at every date.*

**P7. Delighters**, one at a time, each behind its data gate (§7). *Check per delighter: a
screenshot, the field that drives it, its frame cost.*

## 7. Delighters, and what gates each

Aim high: a visitor should want to sit and watch a world turn. But every effect says
something true about the world, and names the field that drives it. An effect with no field
behind it is a question for Johnny, not a feature.

| Delighter | Driven by | Source |
|---|---|---|
| Terrain archetypes: archipelago, pangaea, rift and ranges, cratered highlands, dune seas, fractured ice, shield volcanoes, basin lakes, impact giant | hydrographics, atmosphere, geology fields, size, the seed | plan §7.7a (eligibility table) |
| Palette families, 3 to 5 seeded sub-palettes per family | family, the primary's `sType`, the seed | plan §7.7b |
| Ice caps that advance and retreat with the season | tilt, the season's declination, temperature | `seasons.ts`, `daynight.ts` |
| Clouds that move in latitude bands; cloud shadows | atmosphere, pressure, hydrographics | plan §7.6a |
| City lights on the night side: amber, white, neon by era | population, tech level | plan §7.6; "Settled" in `planet_rendering.md` |
| Lightning in dense, wet atmospheres | atmosphere, pressure, hydrographics | plan §7.6 |
| Atmosphere rim glow; iridescence on unusual atmospheres | atmosphere code, pressure | legacy `halo()` |
| Gas giant bands and a long-lived storm | `ggType`, the seed (`vortices` in the legacy profile) | legacy |
| Rings that shadow the planet, and the planet's shadow on its rings | `rings`, star direction | legacy ring request |
| Moons casting shadows on their world (eclipses) | the picture's moon positions (`casters`) | legacy render request |
| Sun glint on open water | liquid type, hydrographics, star direction | new: propose in P1 |
| Twilight band on a world locked to its star | `tidallyLocked` / `isTwilightZone` on a planet | Johnny's Q1 |
| Molten glow on the night side of hot worlds | temperature, `kind` hot | legacy `testMolten` |
| Aurora | needs a field (magnetic field, stellar activity): **not in the document** | §9 Q4 |

## 8. What not to do

- Do not make the map and the disc from two generators again.
- Do not invent a field, a threshold or a meaning. Do not "improve" a legacy mapping
  silently: record every changed or new mapping in `planet_rendering.md`.
- Do not compute a second spin, season or clock. Take them from the caller.
- Do not allocate or bake per frame. Do not block the first paint on the sharpest bake.
- Do not ship anything that feeds generation, export or any RPG value.
- Do not edit Agent D's, Agent A's or the dossier's files; ask for the seam.

## 9. Questions only Johnny can answer (ask in P1, before building on them)

- **Q1. Is hex terrain presentation or data?** If a referee will place things on "the
  forest hex" or exports will list terrain, it is data: it must be generated in
  `packages/generation`, pinned by seed and stored in the truth, not made in the browser.
  If it is only a picture, it stays in `apps/web`. This decides where P3 and P4 live.
- **Q2. The terrain classes and their thresholds.** Propose a table (class, the cell values
  that produce it, the fields that gate it) and get it approved. Is "swamp" wet lowland
  with life? Is "forest" tied to `biomass`? None of that is in `rules/` today.
- **Q3. Where is longitude 0?** The map and the disc need one answer. The legacy spin puts
  the prime meridian toward +x of the system frame at day 0; Agent D would keep that.
- **Q4. Effects with no field behind them** (aurora, volcanic plumes beyond what
  `seismicStress` and the plate fields say, anything "sci-fi" for its own sake): supply the
  field or the rule, or they stay out.
- **Q5. The open question already in `planet_rendering.md`:** is `compatibility` the right
  field to drive how Terran vegetation looks?
- **Q6. Other editions.** The orbit model reads MgT2E only today. Do CT, T5, RTT and AoW
  worlds get surfaces in this step, or with the Builder slice?

## 10. Done means

`npm run check` clean, `npm test` green, `npm run typecheck` clean, `npm run build` green;
the profile's parity fixtures pass; the map and the disc agree cell for cell in tests and by
eye in the browser; 16 ms a frame held on Regina and 1531; the fallback works with WebGL
off; `planet_rendering.md` is true; and a report with screenshots beside the legacy views,
frame times, what was not exercised, and every question raised.
