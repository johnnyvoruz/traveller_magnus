# Lane C — the surface map, second pass: centred, zoom and pan, a legend you can read

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
`directives/design_reference.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your first surface-map pass is accepted and
is live in 1.1.5.

## What Johnny said, on 1.1.5

Shots (look at both first): `findings/ui_design_shots/live_map_large_1.1.5.png` (the
large view) and `live_map_key_column_1.1.5.png` (the key in the column).

"Full screen is better for the map - we want to center it and even better would be to
have map controls like to zoom in and pan around and then we need the full legend and
then I think we need to make the night darker or I was wrong about the day / night
border. I think the fade is perfect, but maybe a hint of a line to determine the
terminus on the day/night might help. The key in the column view is a good effort, but
terrible UX / execution. Can't see the dark symbols at all."

What the first shot shows: the large frame sits against the left edge and stops short
of the right; the key is outside it on the right, dim as if under the backdrop, cut
off at the window's edge, with its dark glyphs invisible on the dark ground.

## Johnny's rulings (2026-10-11)

1. **The column has no key pop-over.** "Key" in the column opens the large view, where
   the full legend is.
2. **Day and night:** keep the soft fade exactly as it is; add a faint line at the
   terminator; darken the night side a step.
3. **The sun marker comes back**, small and quiet, at the subsolar point.

## What to build

1. **The large view is one centred frame** that holds everything: the map, the legend
   beside it, the controls and the caption under it. Centred in the window with an
   even margin, never wider or taller than the window at any size from 1024 by 700
   up; under that width the legend goes below the map inside the same frame and the
   frame scrolls. Nothing of it sits outside the frame or under the backdrop. Measure
   and state the frame's four margins at 1440 by 900, 1920 by 1080 and 1024 by 700.
2. **Zoom and pan in the large view.** Wheel and pinch zoom about the pointer; drag
   pans; double-click zooms in a step; buttons for zoom in, zoom out and "Fit" in the
   house icon-button pattern in a corner of the map; keyboard: `+`, `-`, `0` for fit,
   arrows pan, when the map has focus. Zoom from fit (1x) to a level where one hex is
   comfortably readable (say the hex size in CSS pixels at maximum; bake or re-bake
   the sheet so the map is sharp at that zoom, and say the bake time and memory; if a
   single sheet cannot be sharp there, say what you chose instead). Pan is clamped so
   the map cannot leave the frame. Latitude labels and the scale follow the zoom; the
   scale's words stay true ("1 hex ≈ 943 km" does not change, a drawn bar does).
   Symbols keep a readable size across zoom. Reduced motion: no animated glide. The
   column map does not zoom or pan.
3. **A legend that can be read.**
   - Every glyph is drawn in the legend the way it is drawn on the map, on a ground it
     can be seen against: a small swatch of the terrain's own colour behind each
     terrain glyph, and settlement and base marks in their map colours. No black glyph
     on the dark panel. State the contrast of the worst row.
   - Names at the body type size, full contrast (`--text-1`), not dimmed.
   - Two groups as now: on this world first, then "Not on this world", the second
     collapsed by default with its count.
   - Grouped under plain headings in the table's own order (terrain, settlements,
     bases, or what `CODE_TABLE` implies; say which); two columns when the frame is
     tall enough to need them.
   - Pointing at a legend row highlights that symbol's hexes on the map; pointing at a
     hex names its symbol under the map. Keyboard reaches both.
4. **The column:** remove the key pop-over (`SurfaceKey.vue`'s pop-over mode and its
   control's behaviour). "Key" and "Open the map large" both open the large view;
   keep one control if two now do the same thing, named so a person knows the legend
   is there ("Open large, with the key" or better words of yours).
5. **Day and night:**
   - the fade: unchanged (12 degrees);
   - a faint line at the terminator: one thin stroke, light, low opacity, following
     the true terminator through the map's facets; it must read as a hint, not an
     outline. Show three strengths in shots and build the middle one unless one is
     clearly right;
   - the night side one step darker than `NIGHT_TINT` at its current strength: show
     the current one and two darker steps on a water world and on a dry world, with
     settlement lights on, and build the middle step; the terrain must still be
     readable on the night side;
   - the sun marker: a small quiet mark at the subsolar point, in both views.
6. Put the strengths you built in tokens or named constants so a later tune is one
   line each, and name them in the report.

## Constraints

Presentation only; both renderers; the dossier map keeps working with WebGL off; no
layout shift in the column when the large view opens or closes (it was 376 px before
and after: keep that); every word in the Google developer documentation style.

## Owned files (this pass)

`apps/web/src/dossier/SurfaceStage.vue`, `SurfaceKey.vue`, `SurfaceTimeBar.vue`, a new
component beside them if it keeps the stage readable, `apps/web/src/surface/`,
`scripts/surface_parity.js`, your tests in `tests/web/`, your token lines, shots
`kc_map2_*`, `directives/reports/c_surface_map_2.md`. Read only: `workspace/focus_trap.ts`
(import it), the dossier's other files, `map/input.ts` and `map/camera.ts` (Lane D's:
read them for how the chart handles wheel, pinch and drag, and match the feel; do not
import a camera that carries chart-specific state).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`node scripts/surface_parity.js`; a browser pass on a production build, your own
ports, stopped after: Vech (Mavuzog 2922) and the world in Johnny's shot if you can
find it (I-n-Amenas, Greenwater 0706, a generated world: any generated mainworld with
land and sea will do); the large view at the three window sizes; zoom by wheel,
buttons and keys to the maximum and back to fit; pan to each edge; the legend's hover
both ways; the three line strengths and three night steps; the column with one
control; reduced motion; WebGL off. Before and after pairs at the top of the report.

## Stop rule

Stop when the six items pass and the report is written.

Write `directives/reports/c_surface_map_2.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the live shots show the large frame against the left edge and a dim key cut off at the window. next: centre one frame, add zoom and pan, and make the legend readable.

done: the large frame holds the map and the key, zoom stays inside the stage, and the night peak is the middle step. next: run the gates and shoot the map.

done: npm test, the manifesto check, and typecheck passed. next: shoot the production build.

done: the production build was shot at the three window sizes, and zoom, the key, and the night steps were checked. next: write the report.

done: the report is written. next: stop.
