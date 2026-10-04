# Planet surfaces: P1 plan

Status: proposed for orchestrator acceptance. Written 2026-10-04 by Agent F.
Planning only; no implementation or browser measurements performed in P1.
This is the P1 deliverable requested by Johnny, replacing the recipe's proposed
`findings/surface_design.md` destination. It does not issue implementation work.

## 1. Authority, scope and evidence

Read in the requested order: `recipe_planet_surfaces.md` (especially §0),
`findings/legacy_surface_inventory.md`, `apps/web/src/surface/profile.ts`, then
`architecture.md` §10 and §10.1. The inventory is the source reference below; read raw
legacy source during implementation only where exact code or missing detail is needed.
Also inspected the existing oracle and browser adapter to establish their capabilities.

Recipe §0 wins: ship the two independent legacy surfaces first. Vanilla deliberately
retains their different continents, palettes and seeds. The one-world requirement applies
to enhanced mode. Both modes are presentation only, generated on demand from released
data; neither writes terrain into truth, exports or RPG values. The recipe's explicit
surface exception to architecture §10.1 applies, not a general permission for browser
generation. No engines or generation package enter the viewer bundle.

Several effects listed under P7 already exist in PlanetGL: clouds, cities, glint, lava,
atmospheric glow, rings and shadows. Vanilla retains the existing versions. Only additions
or changes to them are enhancements. Gas giants get discs but no terrain map; stars,
belts, rings and unmappable worlds retain the legacy eligibility rules. They are not
forced through a spherical solid-terrain classifier.

P2's `profile.ts` already exports `surfaceKind`, `surfaceProfile`, `halo` and
`tempBandFromKelvin`. Preserve that port and its fixture coverage; file existence alone
does not establish P2 acceptance. Its mutable WeakMap results must never be modified by
enhanced mode. The Node oracle now loads planet_renderer, planet_profile and system_viewer;
its canvas stub returns null. It can evaluate profiles, but cannot currently prove pixels.
PlanetGL is not loaded there. No new extension is required just to expose the profile;
V1/V2 need the separate drawing harness described below.

Inventory cautions: §3.11 describes the two FNV hash loops as different, although the
displayed xor/imul operations are algebraically equivalent modulo 32 bits. Test their
outputs instead of adopting that claim. Their PRNGs and seed strings are different.
Likewise §7.3's phrase “sea level is computed twice” must not lead to two thresholds:
legacy GL measures one threshold and reuses it in the bake, which resamples height.

## 2. Common boundaries and identity

Proposed files under `apps/web/src/surface/`:

| File | Boundary |
|---|---|
| `contracts.ts` | Plain request/result types, mode, immutable body snapshot, coordinate units, versioned worker messages |
| `identity.ts` | `legacyMapInputs`, `legacyDiscId`, `enhancedSeedKey`, `surfaceCacheKey`; separates drawing seeds from cache identity |
| `preferences.ts` | Read/set mode and optional enhanced effect flags through the platform adapter |
| `service.ts` | `requestMap`, batched `prepareDiscs`, `drawDisc`, cancellation, availability and disposal; dispatch once by mode |
| `surface.worker.ts` | CPU map/fallback/enhanced jobs, bounded queue and transferable results |
| `cache.ts` | Byte-counted LRU, reservations, resource disposal and instrumentation |
| `profile.ts` | Existing P2 legacy profile, kept under permanent parity tests |

All new browser globals, worker construction and storage access go through
`platform/browser.ts`, extended by its owner. The surface worker gets a platform worker
adapter for worker-global message/canvas access rather than reaching through page globals.
Pure modules accept numeric palettes and explicit options; they never read CSS or storage.
Legacy colour values become immutable vanilla token values resolved before dispatch;
theme changes must not recolour vanilla terrain. Shader colour constants use the same
frozen values. UI colours and scan durations also come from tokens. P2's existing numeric
tables are not opportunistically refactored: any token migration needs a separate parity
check. No changes to frozen legacy files or rules, no git and no dependency installation.

The public drawing identity is the released full hex key plus the existing dossier body
key (`s<i>`, `w<i>`, `w<i>m<j>`). Cache identity additionally includes source tree hash
(or content revision), mode, algorithm version, palette version, drawing options and
resolution. Drawing seeds do not include cache revision or zoom. Do not use body names
as cache identity and do not append cache identity to a vanilla drawing seed.

### Seed contract and recorded deviations

V1 explicitly accepts `masterSeed`, `imageSeed`, continental definition and coastline
complexity. Reproduce `worldMapData`, `canMapWorld` and `diamondMapSpec` from inventory
§6.3, including coercions, unnamed-body fallback and raw-name trimming. Map seed chains:
`masterSeed + '-' + imageSeed + '-ph'`, `'-cn'`, `'-oc'`, using legacy hashString and
mulberry32. `imageSeed` is `hexId-name`, or the exact legacy unnamed fallback, not a
dossier key. No clouds, craters or cities are added to the flat-map path.

Production recommendation: pass the full released hex key as the hexId argument and use
`TravellerMagnus` as the explicit vanilla masterSeed. Default slider values are 0.55 and
0.45. This is a recorded input deviation: the app's full hex key differs from the old
hexId, and the new app does not have the old device's arbitrary masterSeed. Consequently
old screenshots need not show identical continents. Never describe this as exact old-site
identity. The parity harness supplies identical explicit strings to both implementations,
including original-format hexIds, alternate masterSeeds and actual new hex keys. A second
adapter fixture records the deliberate old/new input difference. No silent copying of an
unrelated device setting, and no substitution of the truth generation seed.

V2 and the vanilla fallback reproduce `_surfaceId` exactly:
`hexId|name|type|uwp|diamKm-or-diam|au|pd|kind`, preserving its `||` versus `??` handling.
There is no masterSeed in this path. Pass this id to P2's surfaceProfile; preserve PRNG
consumption and offsets. Use the same full-hex-key migration policy as V1. Enhanced mode
uses a documented, unambiguous encoding of full hex key and dossier key as its seed,
independent of names. Different identities across modes are intentional.

## 3. V1: vanilla map and its proof

| File under `surface/vanilla/` | Functions/responsibility |
|---|---|
| `map_inputs.ts` | Legacy body normalization and eligibility; no profile-based substitution |
| `map_fields.ts` | `buildGrid3D`, `sample3D`, `fbm3D`, `buildContinentSeeds`, `continentHeight`, `buildCDF`, `remapHeight` |
| `map_palette.ts` | `buildPalette`, `heightToRGB`, exact rounding, stop ordering and temperature-string tests |
| `map_projection.ts` | Diamond inverse projection and coverage; preserve the loops, rounding and endpoint rules |
| `map_grid.ts` | Hex path construction, clips and diamond separators; same geometry for blank and finished sheet |
| `map.ts` | `renderFlatMapPixels` (worker RGBA), `drawMapOverlay`, `renderDiamondBlank`; fixed 800×400 output |

Port the five-lobe diamond with six northern triangle pieces, continuous equatorial band
and five southern triangles; do not “correct” it from its misleading rhombus comment.
Port `round(π * size * 1600 / 1005)`, pointy hexes, odd-row offset, unrounded vertical
anchor and half-column phase literally. The grid remains a screen-space cosmetic overlay.
Retain print fill, transparency, clip/stroke order and line widths. No terrain labels or
forest cells in V1. Other projection buttons, hemisphere pictures, headers, downloads and
approach viewer are outside this session series; factoring must not accidentally port them.

Proof has two independent levels:

1. `tests/oracle/surface_map.js` loads the unmodified legacy file in an isolated Node VM,
   with explicit window settings, masterSeed and legacy core hash/PRNG. A deliberately
   narrow canvas stand-in implements ImageData allocation and putImageData capture and
   records paths, save/restore, clipping, fill and strokes. It does not pretend to rasterize
   canvas paths. Run the actual public renderFlatMap entry point. Compare the complete
   pre-overlay 800×400 RGBA buffer byte-for-byte, plus the ordered drawing-command trace.
   For diagnostic grid/CDF fixtures, a test-only, assertion-guarded in-memory source
   insertion may expose private helpers before the IIFE return; never modify source files
   or use a hand-transcribed algorithm as the oracle. Record source digest and insertion
   count so source drift fails loudly. Compare the Float32 grid, continent seeds, CDF,
   palette and selected inverse-projection coordinates exactly in the pinned Node runtime.
2. `apps/web/src/dev/surface-parity/` runs the original file and the new renderer in
   isolated browser realms with real Canvas2D, identical dimensions, settings and inputs.
   Compare final getImageData buffers, including clipping, antialiasing and hex strokes.
   Require byte equality in the same pinned browser/backend; diagnose differences rather
   than blessing new goldens. Headless means a real browser without a visible window, not
   the Node stub. The worker path must match the main-thread reference path as well.

Fixtures: Regina's eligible bodies plus size 0/R exclusions, named and unnamed bodies,
whitespace names, duplicate names, missing fields, numeric/string digits, hydro 0/10/11/F,
molten, rock, ice, standard wet and exotic A/B/C versus D/E/F, alternate seeds and slider
values, print mode, and pixel probes on every lobe join/pole. Existing P2 fixtures stay.
Tests live under `tests/web/surface_*.test.js`; committed oracle fixtures and manifests
under `tests/web/fixtures/surface/`. Goldens include inputs and legacy source digests.

The browser harness is served only by a dev/test server route, with legacy source supplied
by test tooling from disk. Do not put legacy files in public assets or import them into the
production graph. Verify the production output contains neither harness nor oracle.
Use available browser automation; if an automation dependency is missing, request its
installation separately. Browser parity is a required check, never a silent skipped test.

## 4. V2: vanilla GL bake, shade and proof

Files under `surface/vanilla/`: `gl_shaders.ts` (original vertex/noise/fields/stats/bake/draw
sources and licence attribution), `gl_stats.ts` (byte decoding, percentile, cloud/urban
edges and port selection), `gl_bake.ts` (faces, attachments, mipmaps), `gl_shade.ts`
(uniform binding and tile rendering), `gl_plan.ts` (sizes, packing and job scheduling),
`gl.ts` (availability, renderBatch, tile, axisBasis, disposal/context recovery).
Backdrop is outside scope. Tests inspect actual RGBA attachments, not legacy inspect(),
which forces alpha to 255 and would hide height/cloud errors.

Preserve 128×64 equal-area RGBA8 statistics, quantization/decoding, share clamps, gas
bypass, cube face directions, two RGBA8 cubes, mipmaps, filtering, anisotropy selection,
32..1024 size choices and shader arithmetic. Preserve the original reversed-edge
smoothstep calls initially; their cross-driver behaviour is a risk, not permission to
silently repair vanilla. Test legacy and port on the same backend. Scheduling may change
to meet 50 ms, but compare completed outputs at identical LODs rather than arrival times.

The request boundary includes key, profile, device-pixel radius, scale, spin, cloudSpin,
sweep, samples, ring geometry/phase, tilt, light, sun colour, casters, lightMode and explicit
animation seconds. Supplying performance time is a testability change, not a different
clock. Freeze it in fixtures. Agent D owns request construction and batched tile integration;
drawDisc copies the prepared tile and returns false when unavailable. Do not run one GL
batch per disc. Flat dots and day/night-off behaviour remain caller responsibilities.

Proof: `tests/oracle/surface_gl.js` serves the unmodified PlanetGL and PlanetProfile into
the dev browser harness with explicit document/canvas/time dependencies. Test-only source
instrumentation may expose attachment/stat readback with guarded anchors and source
digests. It must execute the real shader, not a TypeScript imitation. Separate canvases
receive identical request sequences and profile values. Capture statistics bytes and
decoded thresholds, every face of both cubes at 32 and 128, representative 512/1024 cases,
then final shade tiles at fixed spin, tilt, light, clock, ring phase and caster inputs.

Require exact stats bytes and classification channels against legacy on the pinned
backend; initial target is exact cube/tile RGBA too. If driver rasterization prevents
exact comparison, report the cause and propose a narrowly scoped reviewed tolerance;
do not silently increase it. Store mismatch count, maximum and mean channel error, masks
and difference images. Saved screenshots are supplementary, not the shader proof.
Repeat legacy-versus-port on at least one integrated GPU; different machines are compared
against their local legacy output, not a promise of identical cross-GPU rasterization.

Cases include ocean/dry/ice, hot/exotic/gas, cities, cloud cover, no liquid, rings, eclipses,
tilts 0/90/>90, zero and large sweep, light mode, tiny and capped radii, cold/evicted/rebuilt
worlds, atlas pressure, context loss/restoration and unavailable WebGL. Node tests separately
cover exact stats decoding, packing, sizes and memory accounting.

Important distinction: renderer parity is identical requests producing identical pixels.
The recipe also asks D's newer spin model to drive the app. Legacy GL and fallback already
disagree on retrograde, and legacy locks moons to the star. Recommendation is to keep D's
approved moon behaviour at the application boundary and record that as a visible motion
deviation; do not change P2 or shader fixtures to disguise it. Johnny's question below
settles whether vanilla must also reproduce the old request construction.

## 5. No-WebGL path

Recommend porting `_paintWorldSteps` and its dependencies for vanilla, rather than replacing
its appearance. Files: `vanilla/canvas_fields.ts` (seed/noise/climate), `canvas_bake.ts`
(generator producing terrain/cloud/emission layers), `canvas_disc.ts` (light layers,
masking, compositing and bitmap rotation). Inventory §6.1 and §5 establish dependencies;
the precise helper closure must be read from system_viewer during this port.

Cost: two implementer sessions plus D's shared integration session: one for fields/layers,
one for compositing and parity. This is a third renderer to maintain, with different life,
water, crater, cloud and city mappings. A replacement lit solid disc costs less but fails
the promised vanilla fallback appearance. It may be the immediate pending frame, never
the completed fallback. Port tests use real browser canvas and an instrumented legacy
closure; compare completed layer buffers and final compositing under frozen inputs.

Generate layers in a worker with OffscreenCanvas when supported. Without worker Canvas2D,
compute typed-array layers there and replay bounded canvas operations on the page. If
workers themselves fail, resume row/drawing chunks across tasks with a 4 ms target and
measure; a temporary low-detail lit disc stays visible. Do not run the entire legacy
generator synchronously. Context loss uses the fallback, cancels GL jobs, and restoration
recreates resources. Reduced motion freezes spin/cloud/storm/ring animation inputs but
retains lighting; explicitly test this accessibility adaptation against fixed-input parity.

Enhanced no-WebGL uses the shared enhanced terrain sampled into a CPU spherical disc and
the common lighting/compositing infrastructure. It must not silently show vanilla continents.
Cache completed low-resolution enhanced frames; worker jobs are latest-request-wins.
Pending enhanced frames show a lit placeholder or last valid enhanced frame.

## 6. The device switch and permanent vanilla protection

Use one validated preference `surfaces: 'vanilla' | 'enhanced'`, default vanilla until
Johnny chooses otherwise. Persist through existing platform storageGet/storageSet; blocked
storage leaves a session-only choice. Register a toggle command through `shell/registry.ts`
using the existing registration pattern, with current mode visible in its label. D wires
both views to the same preference. No route or truth mutation is needed.

Dispatch at the service boundary; vanilla imports must not depend on enhanced modules.
Share platform services, cache machinery, immutable request types and already-proven
projection geometry. Keep vanilla noise/palette/shaders frozen in their own modules;
enhanced behaviour composes separate functions and shader sources. No `if enhanced` inside
vanilla arithmetic. Shared refactors must pass both vanilla fixture suites unchanged.
Deep-freeze profile inputs in tests; enhanced profiles are new values, never mutations of
P2's cached object. Separate mode/version cache namespaces and use request-generation
tokens so late worker results cannot repaint the other mode. Switching releases inactive
GPU resources; it does not reserve two complete budgets.

Cheap independent enhanced flags: seasonalIce, paletteVariants, movingClouds and lightning.
They default off until accepted and affect only enhanced requests. Disabling an effect
returns to the enhanced baseline, not to legacy geography. “One terrain” is the enhanced
foundation and is disabled only by the main mode switch. Record settings in cache keys
only when they change baked data; temporal uniforms do not invalidate terrain caches.

Vanilla Node and browser suites remain required release checks permanently, including
after every enhancement. A vanilla→enhanced→vanilla round trip must reproduce initial
buffers. Never regenerate goldens merely because implementation changed. A deliberate
vanilla change needs explicit approval, a deviation entry and retained old evidence.

## 7. Enhanced mode: one terrain, one sea level

Files under `surface/enhanced/`: `terrain.ts`, `noise.ts`, `sea.ts`, `climate.ts`,
`classes.ts`, `hexmap.ts`, `seasonal_ice.ts`, `gl_fields.ts`, `gl_bake.ts`, `gl_shade.ts`,
`map.ts`, `canvas_disc.ts`. Implement P3 only after the enhanced class proposal is accepted;
§0 settles copying vanilla, not the meaning of newly invented biome labels.

Canonical geometry is a unit sphere with +Z north; longitude increases from +X toward +Y.
Public latitude/longitude use degrees, internal trig radians. Projection adapters explicitly
convert the vanilla map's +Y-north convention. D supplies the body-to-view basis and
subsolar coordinates; enhanced axis orientation must agree with seasons/daynight rather
than reuse the legacy random axis azimuth blindly. Test equinoxes, solstices, retrograde,
locked planets and moons, prime meridian, poles, seam wrap and cube edges. This is a
proposed seam for D's acceptance, not an agreement already obtained.

Terrain archetype 0 adapts legacy GL terrainHeight, preserving its characteristic noise,
ridges and craters. A worker CPU reference uses explicit float32 checkpoints matching GLSL.
Prepare immutable `TerrainDefinition` (seed, profile, algorithm version) and `TerrainStats`.
`computeSeaLevel` alone measures 8192 fixed equal-area samples (128×64), sorts and applies
the legacy percentile-index convention; use the legacy GL liquid-share/clamp policy
initially, documented as a presentation mapping. Compute the scalar on CPU, round once to
float32 and pass the identical value to map, GPU and fallback. Do not run a second GPU
quantile. Gas skips it. Height below sea without a liquid stays dry rock, as in GL.

`sampleCell(definition, stats, lat, lon)` returns raw height, normalized height above sea,
liquid eligibility, permanent ice, local baseline temperature, moisture, vegetation cover
and class. Preserve meaningful intermediate values; do not classify from final RGB.
Baseline climate adapts GL's profile-driven temperature field. Unknown fields follow
documented P2 fallback behaviour; no new Traveller inference.

GPU proof samples the actual enhanced shader at at least 512 fixed points per ocean, dry
and ice world, plus adversarial coastline/ice/class-boundary, seam and pole points. Proposed
height tolerance is 1e-4 in normalized height; normalized moisture/cover tolerance 1e-4
and temperature tolerance 0.01 °C. Report maxima and the count of near-threshold samples.
Outside the respective tolerance bands require identical water/ice/class results at every
point. Near-threshold points are explicitly reported, not counted as passing classifications.
Use encoded readback when float render targets are unavailable and include quantization
in the measurement. Failure triggers design review, not a wider tolerance by default.

If CPU/GL noise cannot satisfy these bounds, the review fallback is worker-generated
canonical sampled fields uploaded to the GPU, with identical interpolation on both paths.
That changes memory/resolution tradeoffs and needs F's review before P4/P5 build on it.
Finite cube resolution/filtering can still soften coastlines; distinguish field agreement
from rendered-pixel approximation and test visible alignment at each accepted LOD.

Enhanced hexes initially reuse the diamond's screen lattice. Invert each visible centre
to lat/lon; clipped fragments without a valid centre are unclassified. A hex intersecting
an interruption is clipped into visible pieces; each piece samples its own centre and has
a presentation-only piece id. This is not a globally addressable equal-area hex planet.
Round-trip projection tests must handle multiple seam representations explicitly. If
Johnny wants durable locations or adjacency, stop for the data-model decision.

### Proposed class table, in precedence order

All thresholds here are presentation proposals, not Traveller rules. Define `e` as land
height normalized above the shared sea level, `m` as clamped GL-style moisture, `v` as
GL-style vegetation cover, and `T` as baseline local °C. Class equality uses the same
comparison order in worker and shader. Missing biomass/complexity disallows the new
forest/swamp labels even if legacy fallback vegetation is drawn.

| Class | Proposed test | Data gate/source |
|---|---|---|
| ice | Frozen liquid, or permanent ice mask >= 0.5 | Profile liquid/climate; existing GL freeze/snow ramps |
| ocean | Below shared sea with eligible unfrozen liquid | Profile hydrographics/liquid; display actual liquid name alongside class |
| mountain | Dry, e >= 0.65 | Shared relief; profile geology supplies shape, threshold proposed |
| swamp | Dry, e < 0.08, m >= 0.75, v >= 0.35, 2 <= T <= 38 | Explicit biomass > 0, liquidName Water, hydro > 0; wet-lowland interpretation proposed |
| forest | Dry, v >= 0.60 and profile life.maturity >= 0.75 | Explicit biomass > 0 and explicit biocomplexity; thresholds proposed |
| vegetation | Dry, v >= 0.20 | Profile life cover; avoids calling mats/alien cover grassland |
| desert | Dry, m < 0.25, v < 0.20, T > -8, air strength > 0 | Climate/air; “dry terrain”, not a claim of sand |
| rock | Remaining dry cells | Profile composition; neutral fallback |

Gas/stars/belts/rings have no class. Hot rock may have a lava visual layer, not an invented
volcanic class. Until approved, no enhanced classes ship; vanilla needs no such approval.
Every accepted mapping and missing-field policy goes into `planet_rendering.md` before use.

### Seasonal ice contract

Keep `permanentIce` and terrain class immutable. `seasonalIce(cell, season)` returns
additional coverage 0..1; combined coverage is max(permanentIce, seasonal coverage).
Season input is a plain snapshot from D: effective tilt, declination, orbit phase and
the shared clock revision. No new clock, spin or season calculation in surfaces.

Proposed thermal adjustment is `-(spread/2) * sin(latitude) * sin(declination)`;
use the existing land snow ramp (-8 to -16 °C) or water ice ramp (-6 to -14 °C), expressed
with defined increasing-edge interpolation. This is a new visual mapping requiring
Johnny's approval, not a physical climate model. Initially eligible only for water/ice
worlds with explicit temperature bounds and tilt, excluding locked planets; missing inputs
give zero added coverage. Do not freeze methane or acid at water thresholds by invention.

Permanent coverage is the minimum coverage across the permitted seasonal temperature
range; baseline rock/liquid albedo is stored without seasonal ice. Shader uniforms apply
the changing coverage from static temperature/latitude fields. The map uses the same
fields in a lightweight overlay, GPU where available or worker-composited CPU tiles.
Use the same season snapshot for both views; coalesce to the latest request, swap CPU
overlays atomically and report update latency. No cube rebakes, reclassification or sea-level
change as the clock advances. Tests cover zero tilt, both solstices, wraparound, high time
rates and reduced motion. Reduced motion freezes decorative animation; explicit clock
scrubbing still updates lighting and seasonal state consistently.

## 8. Workers, bounded caches and cold performance

One CPU surface worker, one active heavy job and at most two queued jobs; prioritize the
selected map then visible coarse discs. Cancel superseded bodies/modes and dispose late
results. Transfer buffers/bitmaps instead of cloning them. On worker-capable WebGL2 systems,
use an OffscreenCanvas GL worker for bake/stats work; test its parity with the reference
browser canvas. A main-thread GL implementation is permitted only after cold measurements
prove bounded submissions/readbacks. Break stats batches, initial 32-pixel bakes and larger
faces into scheduled work; tile a face if needed. Changing scheduling is not permission to
change shader samples. GPU stalls/readPixels require measurement, not assumptions.

GPU budget: at most 320 MiB for all surface GL resources across modes, including cube
mips, in-flight bakes, stats targets and atlas. Reserve bytes before allocating. Legacy's
320 MiB estimate covered cubes only and spared all current-frame worlds; the new hard
cap is a scheduling deviation. Count two RGBA8 cubes including all mip levels exactly.
Atlas dimensions stay <=4096 each and its bytes come out of the same cap. When visible
demand exceeds it, reduce LOD or split batches while retaining completed coarse pictures;
never overcommit because all worlds are visible. No per-frame cache churn.

CPU surface budget: 128 MiB across worker/page, counting transferred ownership once and
duplicate copies separately. Subcaps: map sheets 24 MiB (max 16 sheets at 800×400), fallback
layers 64 MiB, enhanced fields 24 MiB, scratch/in-flight 16 MiB. Blank/outgoing sheets count
against the map cap. Discard intermediate grids after baking unless retained within caps.
Close ImageBitmaps and delete textures on eviction/disposal. Main-thread scratch buffers
are reused; profiles have a bounded service index even though P2's WeakMap is GC-managed.
No disk surface cache. Eviction can require recomputation; a retained visible frame remains
while a replacement is prepared. The scan never conceals synchronous blocking.

Cold measurements before each integration acceptance: private browser window, cleared
surface caches, fixed released fixture hashes, hardware/browser/backend recorded. Regina
and 1531, both modes and fallback, DPR 1 and 2, fit/framed/maximum zoom, clock real-time
and one year per second; plus the architecture's 200-body stress scene. Record worker
startup, first lit disc, map-ready and reveal times, full-detail time, long tasks, maximum
task duration, frame p50/p95/p99/max and missed-frame count, memory high water and eviction
counts. Target <=16 ms rendering work per frame and no main-thread task >=50 ms. Separate
display refresh interval from CPU render time. Report cold shader compilation/readback
stalls explicitly. No claim of compliance from warm averages alone.

Also measure rapid selection, repeated mode switches, context loss/restoration, reduced
motion, offscreen worker unavailable, worker failure and cache thrashing. Lazy-load surface
code so the chart's under-one-second interactive budget does not depend on surfaces.
Run `npm run check`, `npm test`, `npm run typecheck`, `npm run build`, plus required browser
parity/performance checks; the current root typecheck targets apps/api, so it is not by
itself evidence that web TypeScript passed. Use the web build's checks and report any gap.

## 9. Build order: one bounded deliverable per session

Owner suggestions need orchestrator assignment. F owns the expensive numerical design and
review gates; mechanical ports go to other agents. D retains orbit ownership, and dossier
wiring is assigned to D or its current owner explicitly. No step starts until its predecessor
is reported; enhanced steps also require the stated product decisions.

| Step | Suggested owner | Deliverable | One-line check |
|---|---|---|---|
| 0 | Orchestrator | Accept P1, verify P2 report, assign platform/dossier seams and record interim decisions | No unresolved vanilla input contract |
| 1 | B | Identity, requests, preference/service skeleton and exact adapter fixtures | Seeds and mode round-trip tests pass |
| 2 | B | Node map oracle, fixtures and dev browser harness infrastructure | Original renderFlatMap yields captured RGBA and real canvas output |
| 3 | C | V1 fields, palette and diamond pixels in worker | Intermediate fixtures and pre-overlay RGBA equal legacy |
| 4 | C | V1 grid/blank/overlay and browser comparison | Complete 800×400 sheet equals legacy on pinned browser |
| 5 | D | Dossier map/scan integration, worker platform seam | Cold scan stays responsive; no task reaches 50 ms |
| 6 | B | Vanilla fallback fields and layer generator | Completed layers match legacy oracle |
| 7 | C | Fallback lighting/masks/compositing | Final fallback pixels match frozen legacy requests |
| 8 | B; F reviews | GL oracle and vanilla shaders/stats/bake at fixed resolution | Actual shader stats and six faces match legacy |
| 9 | B; F reviews | GL shade, rings, casters, blur and basis | Frozen final tiles match legacy across the V2 matrix |
| 10 | C | Progressive scheduling, hard caps and context lifecycle | Cold/evicted/restored outputs retain parity within caps |
| 11 | D | Batched orbit wiring, fallback, switch command and motion adapter | Both vanilla views work; deviations and cold timings reported |
| 12 | Orchestrator | Accept vanilla release evidence; approve enhanced proposal | Permanent vanilla suites required and P3 decisions recorded |
| 13 | F | P3 canonical coordinates/noise/sea and actual GPU probe | Shared scalar and 512+ point comparisons meet stated bounds |
| 14 | F | P3 climate/classification, seasonal field contract | Boundary and seasonal tests pass; vanilla unchanged |
| 15 | C | P4 enhanced map, clipped hex sampling and classes | Projection/class tests pass and cold map remains responsive |
| 16 | F | P5 enhanced bake/shade using shared fields | Map/disc coastline and class probes agree across LODs |
| 17 | C | Enhanced CPU disc and worker seasonal overlay | No-WebGL retains enhanced geography and bounded tasks |
| 18 | D | Both-view integration, shared axis/highport seam and seasonal inputs | Known map landmark and terminator match the rotating disc |
| 19 | C with D wiring | P6 night/season/pointer overlay | Scrubbing, polar and locked-moon cases agree in both views |
| 20.n | D | One approved P7 effect per session, separate enhanced flag | Field gate, screenshot, frame cost and vanilla parity reported |
| 21 | D; orchestrator reviews | Full cold performance matrix and rendering spec reconciliation | All required checks and limits evidenced; omissions explicit |

If a session's measured scope exceeds this unit, report and split at its named function
boundary before continuing. Do not combine remaining delighters into an unbounded session.
Every report includes literal required-check output, screenshots beside legacy, deviations,
unexercised cases and the relevant browser metrics. Tests here are planned, not run in P1.

## 10. Questions for Johnny, with interim choices

These ask about product appearance/compatibility. Technical choices above are recommendations
for orchestrator acceptance, not extra questions delegated to Johnny.

| Question | Interim choice | Blocks |
|---|---|---|
| Must vanilla reproduce an old device's exact continents, or is legacy rendering with the new full hex key sufficient? | New full hex key and explicit TravellerMagnus masterSeed; retain original-input fixtures and record changed geography | Production adapter acceptance; oracle/port work can proceed |
| Does vanilla use the already-approved corrected moon/retrograde motion, or reproduce the old viewer's motion too? | D's current motion; exact legacy request fixtures remain separate | Final V2 integration acceptance |
| Which mode should a new device start in? | Vanilla; enhanced is opt-in | No vanilla work |
| Approve the proposed enhanced class table, including forest/swamp gates and cosmetic clipped hex pieces? | Keep vanilla; enhanced classification does not ship until approved | P3 classification and its dependants |
| Approve enhanced longitude zero toward +X at the reference epoch, with the locked planet's zero meridian facing its star? | Follow D's convention, explicitly handle the locking exception | Enhanced orientation contract |
| Approve the seasonal-ice visual formula and keeping hex class fixed through seasons? | Seasonal effect off; permanent class and baseline ice remain | Seasonal enhancement only |
| Is compatibility the right field for Terran vegetation colours? | Preserve legacy in vanilla; retain it as the enhanced baseline but add no new compatibility mappings | New palette interpretation only |
| Should aurora or unsupported plume effects be included without a driving field? | No; leave out until a field and mapping are supplied | Those effects only |
| Are other editions in this release? | MgT2E application integration now; retain legacy branches in vanilla and synthetic parity fixtures, defer other-edition UI integration | Expansion beyond this scope |

Presentation versus data is already answered for this work and is not reopened. A future
request for persistent forest-hex locations or terrain exports triggers a new truth/schema
plan before implementation. Nothing here promises that a cosmetic hex id will survive it.

## 11. Three highest risks

1. **Compatibility can be claimed at the wrong boundary.** New hex keys/masterSeed policy
   and D's corrected motion change inputs even if a renderer is perfect. Separate exact
   renderer fixtures, application-adapter deviations and old screenshot expectations.
2. **GL parity and cold responsiveness can conflict.** Stats readback, shader compilation,
   legacy undefined smoothstep behaviour and concurrent first bakes require actual browser
   evidence. Keep original shaders as oracle and alter scheduling under measured budgets.
3. **Enhanced agreement can fail at coastlines, axes or seasonal ice.** One CPU-computed
   sea level, explicit basis conversions and actual shader/classification probes are gates
   before either enhanced view is accepted. Seasonal coverage never mutates base classes.
