# X city lights fix report
Prompt: prompts/x_city_lights_fix.md
Status: done

Three lines first (BOOT step 3): nothing of this prompt was half-done when I started; I finished all of steps 0 to 5; I backed out nothing. The one temporary edit I made (a debug colour on the lock glow, step 2) was reverted before any gate ran.

## The short version

The "atmosphere band" in Johnny's shots is not the atmosphere. It is the **selection lock's glow** in `apps/web/src/orbit/OrbitRenderer.ts` (`selection()`, lines 1975 to 1988): a radial gradient of the lock colour `#ffce73` at 16 % alpha, filled as an annulus from **0.9 × the lock radius** out to the lock radius + 22 px, painted **after** the worlds. The lock radius is the body's drawn radius + 5, so on a world the outer tenth of the planet is covered by a translucent gold band on every side. On the night side, over near-black ground, that band reads as a brown shell of air, and the surface's own city lights show through it, so the lights look painted on the air.

The city lights themselves were never in the air on the enhanced disc, and after CS8 not on the vanilla disc either. The fix clips the lock glow to the outside of the body: it now begins at the body's drawn radius. Outside the body nothing changes, pixel for pixel; nothing in `surface/` changed.

## Step 0: was Johnny's browser running today's code?

Yes, and it could not have mattered.

- `registerAppShell()` (`apps/web/src/platform/browser.ts:335-338`) is called unconditionally from `apps/web/src/main.ts:8`, so the worker `apps/web/public/sw.js` **does register under Vite dev** at `localhost:5173`, scope `/`.
- `sw.js` is **network-first** and only for the shell list in `shell_cache.js`: `/`, `/index.html`, `/assets/*`, `/fonts/*`, the favicons and the manifest. Every other GET, which under Vite dev is the whole app (`/src/*`, `/@vite/*`, `/node_modules/.vite/*`), is not intercepted (`if (shellCacheOf(request.url) !== 'cache') return;`). While the dev server answers, the document and every module come from the network, so **it cannot serve a stale bundle in dev**. With the dev server stopped it serves the cached dev `index.html`, whose `/src/main.ts` then fails: a blank page, never old code. In production the document is network-first and the assets are fingerprinted, so a deploy is fresh too.
- What was on Johnny's screen: CS8's edits to `gl_shade.ts` and `draw.ts` are **uncommitted** (HEAD is 1.2.6 at 12:40; the last commit touching those files is 1.1.9), so production at 21:35 did not have CS8 and a dev server did. Neither matters for this fault. CS8 changed the vanilla program only; the enhanced program (the default, G7) had already stripped the two city-in-the-air terms before CS8 (`draw.ts` removed `HAZE_IN_HALO` and replaced `CITY_AND_PORT`). Johnny's 21:35 shot has **no** city hue outside the surface on the night side (measured, below), which is exactly what both programs draw with or without CS8.
- No fix made. If Johnny wants the worker out of dev anyway, that is a one-line guard in Lane A's `browser.ts` (question 5).

## Step 1: reproduction

My own stack: wrangler dev on 8797 (state `.tmp/x-city-state`), Vite on 5183 with the chart from production, driven by headless Edge over the DevTools protocol (the scripts stay in my scratchpad; nothing added to the tree). The orbit address with no body (`/s/Core/2118/orbit`) opens on the mainworld and frames it with the lock on it, which is Johnny's view; nine wheel notches on the planet give his zoom (r ≈ 400 px at 1600 wide).

- `findings/city_lights_fix/before_capital_gpu_1600.png`: Capital, A586A98-F, GPU (ANGLE D3D11 on an RX 7900 XTX), night side up and right. The gold band sits on the night limb with the pink and teal web continuing into it: Johnny's frame.
- `before_regina_gpu_1600.png`: Regina, A788899-C: the same band on its night limb at the top left, white web in it.
- `before_*_nogpu_1600.png`: Edge with `--disable-gpu --disable-3d-apis` still rendered the full WebGL discs: the disc worker gets a WebGL2 context through SwiftShader even when the page reports none. To reach the software disc (`surface/soft/`) WebGL has to be disabled outright (`--disable-webgl --disable-webgl2 --disable-software-rasterizer` as well). Those shots show the plain disc (no clouds, no lights, the notice bar) and **the same gold band over its limb**: the band does not come from any disc program.
- `before_*_gpu_390.png`, `before_*_nogpu_390.png`: the phone layout, mainworld card dismissed, lock on the planet in the small stage.

Measured on Johnny's `city_lights_still_2135.png` (scratch script, a least-squares circle through the gold ring pixels, then colours along radial lines): on the night side the band begins at **0.875 to 0.90 of the lock radius** at **(40, 33, 20)** and fades outward to (26, 22, 15). `#ffce73` × 0.16 over black is (41, 33, 18). From 1.00 to 1.07 of the ring radius the pixels are the background, (18, 48, 30): **no city hue outside the surface**. His 20:15 shot measures the same: (44, 34, 19) at 0.90, fading to (22, 17, 9) at 0.98.

## Step 2: every path that paints city or settlement light, and which one drew it

| Path | What it paints | Verdict |
|---|---|---|
| `surface/vanilla/gl_shade.ts` `DRAW_FRAG` | City network and glow inside `shadePlanet`, which returns 0 for d > 1 + 1.2 px; `halo()` (d > 1) has no city term since CS8 | Not it. Lights end at the surface |
| `surface/enhanced/draw.ts` `ENHANCED_DRAW_FRAG` | `GATED_CITY` inside the disc, gated by cloud, night and `seen`; the halo's city term and the limb haze were already stripped here before CS8 | Not it. The default disc never had city colour in the air |
| `surface/enhanced/city_cube.ts` | Cube C: baked emission and core strength, sampled only inside the disc | Not it |
| `surface/enhanced/city_gates.ts`, `city_look.ts` | Numbers for the gates and looks A/B/C | No painting |
| `surface/profile.ts` `cityLight`, coverage, `haze` | Colours and gains per tech level and population | No painting |
| `surface/disc_shade.ts` | Builds the shade request from a body | No painting |
| `surface/soft/disc_paint.ts`, `soft/globe.ts` | The software disc: lit ground, rings, eclipses; no clouds, lights or halo | Not it, and the band shows over it too |
| `surface/sharp.ts`, `sharp_view.ts` | The sharp window over the dossier's flat sheet | Not in the orbit frame |
| `surface/hybrid/daynight_layer.ts`, `hybrid/symbols.ts` (`cityLights`, `nightLights`) | Settlement dots on the dossier sheet's glow canvas | Not in the orbit frame |
| `dossier/SurfaceStage.vue` | Hosts the sheet and its day/night canvases | Not in the orbit frame |
| `orbit/BodyCard.vue` | Text and chips; no canvas | Not it |
| `orbit/OrbitRenderer.ts` `shadedDisc` → `service.drawDisc` → `discDest` | Blits the worker's tile, 1.16 r square including the air halo, centred at the body's radius | Correct radius |
| `orbit/OrbitRenderer.ts` `selection()` lines 1975-1988 | **The lock glow annulus from 0.9 R to R + 22, R = drawn radius + 5, painted over the body after the worlds** | **This drew it** |
| `orbit/highport.ts` and the station halo in `OrbitRenderer.ts` (~1918) | The highport's glow, in the port's colour | Not city light |

Why the light appeared to be outside the surface: it was not. The surface's lights stop at the surface (the tile's alpha is `smoothstep(1 + aa, 1 - aa, d)`, aa = 1.2 px). The lock glow is painted over the outermost 10 % of the surface, so the lights there are seen through a 16 % gold veil. The veil is uniform round the disc; on the day side it is invisible against bright cloud, on the night side it is the only thing there, so it reads as a shell of brown air with lights in it. Not a wrong radius, not shell geometry sampling the city texture, not a composite order inside the shader, not a blur or bloom pass, not a texture's alpha, not a cube seam.

Proof: `findings/city_lights_fix/proof_capital_lock_glow_debug_colour.png`. With the glow's inner stop temporarily set to magenta, the whole band turns magenta on every side, the web visible through it; the planet, its lights and its real halo do not change. The edit was reverted before the gates. The legacy `js/system_viewer.js:2225-2235` draws the same annulus over the body; in the legacy app the vanilla shader also put city colour in the halo and the limb haze (G6), which is why the same words fit then and now. Those terms are gone; the band stayed.

## Step 3: the fix

`apps/web/src/orbit/OrbitRenderer.ts`, `selection()`:

```ts
const glowFrom = hit.innerR !== undefined ? R * 0.9 : (hit.visualR ?? hit.r);
...
ctx.arc(cx, cy, glowFrom, 0, TAU, true);
```

The annulus now starts at the body's drawn radius (`hit.visualR`, which `R - 5` already was) for worlds, moons, stars and line-up bodies; a belt keeps the legacy 0.9 R because no disc lies under its lock point. The gradient itself is untouched (0.9 R to R + 22, lock colour to clear), so everything outside the body is pixel-identical to before; only the part that was over the body is gone. The surface programs, the software disc, the day side, the clouds and the limb glow are unchanged: no file under `surface/` was edited. `js/planet_gl.js` is untouched and the shader parity test is as C left it.

## Step 4: the tests

- `tests/web/surface_city_pixels.test.js` (new) with `tests/web/harness/city_pixels.html` and `city_pixels.mjs`. The test starts a Vite dev server of this repo on a free port, stages the harness under `.tmp/city-pixels/` with `/@fs/<repo>` spliced into its imports, launches headless Edge (then Chrome) with **WebGL through SwiftShader**, and for each case renders one pinned world (from `findings/city_design_s1_manifest.json`) through the real disc baker at radius 160 twice: city on, and city off (`cityOn: false` plus `lights.gain`, `glow` and `haze` at zero, same id so the bake is shared). It reads both tiles back with `readTile` and asserts, per case:
  - outside the surface radius (d > 1 + 3 px) the two renders are the same within 2 of 255 on every channel, on every side: the city switch changes nothing in the air shell;
  - on the night side of the limb (facing < −0.45, 1 < d ≤ 1.16) the shell is fully transparent in both renders, alpha 0, so no light of any hue lies past the surface there, and the shell equals the lights-off render exactly;
  - inside the disc on the night side the renders differ on more than 100 pixels: the lights are really drawn.
  Cases: enhanced Pavabid (air 0.92, population 8), vanilla Pavabid, enhanced Rhylanor (neon, population 9). Result on this machine, 7.3 s: `outside max diff 0 of 56384 px; night shell alpha 0, diff 0; night side 4331 / 5413 / 17441 of 26633 px lit by the city switch`, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`. Without a Chromium browser the test skips and says so.
- `tests/web/orbit_lock_glow.test.js` (new): with the recording context from `orbit_fixture.js`, the lock glow's annulus on a world, a moon, a small world, a star, and a line-up body starts at the hit's `visualR` (never inside the body) and its gradient is still 0.9 R to R + 22; a belt keeps 0.9 R.
- Tile images for the record: `findings/city_lights_fix/pixel_test_tile_enhanced_pavabid_city_on.png`, `_off.png` and their night-limb crops at 2x.

## Shots

Before and after, same addresses, same zoom (nine notches after the opening frame), same date (the fixed start, 002-1105):
- `before_capital_gpu_1600.png` / `after_capital_gpu_1600.png`, limb crops `*_limb2x.png`. After: the night limb ends at black; the lock ring and its glow sit outside the disc; the city web is unchanged inside.
- `before_regina_gpu_1600.png` / `after_regina_gpu_1600.png`, `*_limb2x.png`.
- `before_*_nogpu_1600.png` / `after_*_nogpu_1600.png` (WebGL disabled: the software disc), `*_limb2x.png`.
- `before_*_gpu_390.png` / `after_*_gpu_390.png` and `*_nogpu_390.png`, stage crops `*_stage2x.png`.
- Numbers, Capital 1600 GPU, 30° above the lock centre's horizontal on the night side: before, 0.91 to 0.98 of the ring radius reads (40, 33, 20) down to (20, 17, 10); after, the same pixels read (0, 1, 2): the night ground.

## Step 5: the light itself against the spec

Not changed; a question (3). What the spec says (`planet_rendering.md`, People): highways between districts in **warm gold** with traffic, arterial roads, street grids, **downtown cores**, rooftop beacons; neon districts mixed in from TL 12, most of them at 15; "**Neon is an accent on the street light**, block by block". The design paper (`findings/city_lights_design.md`): the hierarchy core → district → thread → darkness, "the brightest cores almost white", neon on "a minority of district light". What Johnny's shot shows on Capital (population A, TL F): an even honeycomb of saturated pink and teal **cell fills**, no visible gold highways, no brighter white cores. Where that comes from in the enhanced bake (`city_cube.ts`): the district tint `mix(base, districtTint(w2.z), 0.30 * uNeon)` multiplies the **whole fabric** (base fill, cores, highways, arterials, streets), with `districtTint` already 1.5× neon and, at neon = 1, 90 % of districts neon; then look C (`city_look.ts`, Johnny's pick) adds direct 2.8 × gain 1.85 on population 9+ and a 1.4 sheet, and the hue-preserving shoulder keeps the colour saturated as the peak clips. So neon is a fill, not an accent, and the gold and white terms are tinted away.

One spec line conflicts with decision G6: "Tech level, bloom: ... on a world more than about 20 % built up **the night-side air glows toward the limb**. Faint at low tech, strongest and neon-violet at 12+." That is the legacy `uCityHaze` term G6 removed (question 2).

## Changed files
- `apps/web/src/orbit/OrbitRenderer.ts`: `selection()`: the lock glow begins at the body's drawn radius; a belt keeps 0.9 R; comment says why.
- `tests/web/orbit_lock_glow.test.js`: new, three tests on the recording context.
- `tests/web/surface_city_pixels.test.js`: new, the pixel test (Vite + headless Edge/Chrome with SwiftShader, skips without a browser).
- `tests/web/harness/city_pixels.html`, `tests/web/harness/city_pixels.mjs`: new, the harness the test stages under `.tmp/city-pixels/`.
- `findings/city_lights_fix/`: before, after, proof, crops and tile images listed above.
- `directives/streams/claims.md`: my lines added and released. `tests/web/orbit_renderer.test.js` was claimed and not edited.
- Not changed: anything under `surface/`, `js/`, `rules/`, `style.css`, `hex_map.html`; CS8's uncommitted edits stay as C left them (they are right, they just were not the cause).

## Gates
npm test:      pass. 2247 tests, 2205 pass, 0 fail, 42 skipped, 0 todo (98 s). The new pixel test ran inside it (7.3 s) and the three cases printed the numbers above. Re-run on the final tree after the last edit: see the line below.
npm run check: pass (`manifesto: clean`).
typecheck:     pass (tsc printed nothing).
build:         pass (`✓ built in 1.49s`, exit 0).
pixel test:    pass, `node --test tests/web/surface_city_pixels.test.js`, 1 test, 0 fail; numbers above.
Final npm test on the final tree: pass. 2252 tests, 2210 pass, 0 fail, 42 skipped, 0 todo (123 s; five tests more than the first run, other lanes' files). The pixel test printed the same three lines.

## Contract published
none

## Needs from others
- Lane C, if question 3 is answered as recommended: the enhanced bake's tint placement and look C's gains (`surface/enhanced/city_cube.ts`, `city_look.ts`). Nothing blocks.
- Lane A, if question 5 is answered as "yes": a dev guard in `platform/browser.ts`. Nothing blocks.
- The orchestrator: CS8b (night-side shots) is covered by this report's shots; `planet_rendering.md` needs the edit in question 2 once Johnny answers.

## Anything left
- The two Edge flags in the prompt (`--disable-gpu --disable-3d-apis`) do not reach the software disc: the disc worker still gets WebGL2 (SwiftShader) and draws the full discs. The software disc appears only with WebGL disabled outright. Johnny's "no GPU at times" machine therefore most likely shows the WebGL discs through SwiftShader, slower but the same picture; the fix covers both paths.
- On the enhanced disc the limb gate `seen` leaves about a third of the city light at the very limb until the last 2 % of the radius (question 4). It is the accepted design, inside the disc, under the air; I did not touch it.
- My stack is stopped; its state is under `.tmp/x-city-state` and `.tmp/x-city-logs` (ignored). The staged harness under `.tmp/city-pixels` is rewritten on each test run.

## Questions for Johnny
1. The lock glow now begins at the body's edge instead of 10 % inside it; outside the body it is unchanged. Recommended: keep it so. Alternatives: drop the glow altogether (ring, ticks, arcs and brackets stay), or draw it under the bodies (same look as the fix, more code).
2. `directives/planet_rendering.md` still says, under "Tech level, bloom", that "on a world more than about 20 % built up the night-side air glows toward the limb". That is the legacy term decision G6 removed. Recommended: strike that sentence and write G6's rule there: city light is drawn only on the surface, on the night side, under cloud and under the air's scattering; the air shell carries no city light on any side at any zoom.
3. The city web on Capital is an even honeycomb of saturated pink and teal cell fills; the spec wants warm gold highways, white downtown cores, and neon as an accent on the street light in a minority of districts. Recommended: a Lane C item, after this fix lands, to (a) apply the neon accent only to the street and arterial lines in the bake and keep the base fill, the cores and the highways in the tech level's light (cores white-ish, highways gold as the spec says), and (b) lower look C's gain and sheet on population A so cores and threads stand out from the carpet; interim unchanged. Alternative: the current look is what you want, in which case the spec's "accent" sentence should be rewritten to match.
4. At the very limb the lights keep about a third of their strength until the last 2 % of the radius, then fade. Recommended: leave it; it is inside the disc, under the air, and physically plausible. Alternative: start the fade at a higher angle (for example from z = 0.35 instead of 0.30, with a stronger air term) so lights thin out before the limb; that is a shader constant in `draw.ts`/`city_gates.ts` and would need a citation and C's test updated.
5. The service worker registers under Vite dev. It cannot serve stale code, so nothing is broken. Recommended: no change now. Alternative: have Lane A skip `registerAppShell()` when `import.meta.env.DEV`, as hygiene, so a stopped dev server shows a plain error page instead of a cached shell.
