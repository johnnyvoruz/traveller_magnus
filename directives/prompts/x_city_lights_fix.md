# One expensive session — city lights drawn on the atmosphere: find it and fix it for good

Issued 2026-10-17 21:40 by the orchestrator, for a single session on the strongest model available, at high effort.
You may be a fresh session with no memory. You **may edit code** in the files this prompt names and the tests for
them; claim them first in `directives/streams/claims.md` as lane `X` (one line per file), release them at the end.
No git but read-only, no deploy, no production commands, nothing in `rules/`, `js/`, `hex_map.html` or `style.css`.

## Why
Johnny has reported this three times: on 2026-10-12, at 20:15 today, and again at 21:35 after Lane C's fix (CS8)
landed. In his words: "City lights are still on the atmospheric layer". His shots:
- `findings/johnny_shots_2026-10-17/city_lights_on_atmosphere.png` (20:15),
- `findings/johnny_shots_2026-10-17/city_lights_still_2135.png` (21:35): the orbit view, the world **Capital,
  A586A98-F** (Core sector, Capital's own system), night side toward the camera. The pink and teal city web shows
  on the dark side **and continues into the brown atmosphere band at the top limb**, outside the surface edge, as if
  the light texture were mapped onto the atmosphere shell, not the ground.

Lane C's CS8 (`reports/c_stream.md`, "CS8 City lights on the atmosphere") removed two terms that added city colour to
the air scatter and the night limb haze in `surface/vanilla/gl_shade.ts` and `surface/enhanced/draw.ts`, proved it with
source-level tests and shots of the **day** side. The fault is still on screen. So either the frame Johnny sees comes
from another path, or the lights are drawn at the shell's radius somewhere else, or his browser is running an old
build. Do not assume which.

## Read first
`CLAUDE.md`, `directives/manifesto.md`, `directives/planet_rendering.md` (the data-to-appearance spec: what the
atmosphere shell, the surface and the city lights are each supposed to be), `directives/decisions.md` (search "city",
"half resolution": never trade sharpness for speed), then C's CS8 entry and its tests
(`tests/web/surface_city_gates.test.js`, `surface_gl.test.js`, `surface_disc_delivery.test.js`).

## Do
0. **Is Johnny's browser running today's code?** `npm run dev` serves Vite; Lane A's AU17 added a service worker
   (`shell_cache.js`). Find out whether it registers under Vite dev, and whether it can serve a stale bundle. If it
   can, that's a finding in itself (fix: never register in dev), and the fix below still has to be proven on a clean
   profile.
1. **Reproduce.** Run the app on your own ports and state (see `scripts/dev.mjs`; `VOYAGE_PERSIST_TO`), open Capital's
   orbit view (the Core sector; find its hex from the truth index), turn the night side to the camera, and capture the
   frame in a real GPU browser (Chrome or Edge with WebGL) and in Edge with `--disable-gpu --disable-3d-apis` (Johnny's
   machine has no GPU at times). Save as `findings/city_lights_fix/before_*`.
2. **Find the path that drew it.** List every code path that paints city or settlement light anywhere a planet disc
   or sphere is drawn: at least `surface/vanilla/gl_shade.ts`, `surface/enhanced/draw.ts`, `surface/enhanced/city_cube.ts`,
   `surface/hybrid/daynight_layer.ts`, `surface/hybrid/symbols.ts`, `surface/disc_shade.ts`, `surface/sharp.ts`,
   `surface/soft/disc_paint.ts`, `surface/profile.ts`, the orbit view's body drawing (`orbit/OrbitRenderer.ts`,
   `orbit/BodyCard.vue`) and `dossier/SurfaceStage.vue`; grep for more (`uCity`, `city`, `night`, `lights`, `haze`,
   `shell`, `atmo`). For the frame in step 1, prove which program, which pass and which geometry put the light there
   (a temporary debug colour per path is fine; remove it after). Say exactly why the light lands outside the surface
   radius: wrong radius, shell geometry sampling the city texture, a composite order, a blur or bloom pass, a
   texture's alpha, a cube map seam.
3. **Fix it at the cause,** in every path that has the same fault. The rule, from `planet_rendering.md` and Johnny:
   city light belongs to the ground. It is drawn only within the surface disc, on the night side, under clouds and
   under the air's scattering; the atmosphere shell carries no city light at all, on any side, at any zoom. Keep the
   look otherwise identical (day side, clouds, limb glow, the software disc). `js/planet_gl.js` stays untouched: if a
   parity test compares shader source with it, list the stripped sites as C did.
4. **Prove it with pixels, not source text.** A test that renders the disc (headless Chrome with WebGL through
   SwiftShader is fine; the repo's browser checks show how) for a world with city lights and an atmosphere, night side
   toward the camera, and asserts: no pixel outside the surface radius has city-light hue; the shell ring's colour on
   the night limb equals the same world rendered with city lights off, within a small tolerance. Plus the after shots
   at 1600 and 390, GPU and no GPU, on Capital and Regina, the limb cropped at 2x: `findings/city_lights_fix/after_*`.
5. **Look at the light itself while you're there, but change it only if `planet_rendering.md` says so:** the city web
   in Johnny's shot is a saturated pink and teal cell pattern. If the spec describes city light differently, say how
   it differs and propose (don't build) the change as a question for Johnny.

## Gates
`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and the new pixel test.

## Write
`directives/reports/x_city_lights_fix.md`: step 0's answer; the path list with which one drew the shot and why the
light was outside the surface; the files changed; the test and what it asserts; before and after shots; anything
left, and questions for Johnny (numbered, recommended answer first).

## Progress
- done: step 0 (service worker cannot serve stale code in dev; no fix), step 1 (before shots, GPU and WebGL off, 1600 and 390, Capital and Regina), step 2 (the band is the selection lock glow in OrbitRenderer.selection(), proved with a debug colour and pixel measurements), step 3 (glow clipped to outside the body), step 4 (pixel test through SwiftShader, lock-glow unit test, after shots), step 5 (spec comparison, question 3). next: nothing; report at reports/x_city_lights_fix.md.
