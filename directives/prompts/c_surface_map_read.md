# Lane C — the dossier's surface map: readable, with a key, hexes always on, a soft day and night

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
`directives/design_reference.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Do `prompts/c_ice_caps.md` first if it has no
report yet.

## What Johnny sees, live, version 1.1.3

Shots: `findings/ui_design_shots/live_map_symbols_off.png` and
`live_map_symbols_on.png` (look at both first). The dossier's surface map in the
pane's column width. His words: "we probably need a button to open in full screen to
read it, it's crunched down so bad in the column view, there's also no key for symbols
and then I want the hexes on no matter what, like the old system was … the day night
probably needs a little softer edge and no border outline so it just looks like the
light / dark overlay … it's super crunched".

## What to build

1. **Open the map large.** A button on the map (the house icon-button pattern, with a
   name and a tooltip; keyboard reachable) that opens the same map in a modal that
   uses the window: the map as large as the window allows at its own aspect, with its
   controls (Day/Night, Symbols, the time bar), the key (item 2), the scale and the
   caption. Escape and a Close button return, with focus back on the button. Hold
   focus inside it (`apps/web/src/workspace/focus_trap.ts` is the app's helper; read
   how `workspace/Lightbox.vue` uses it). It is the same component and the same state
   as the small map, not a second renderer: the time, the layers and the selected
   place carry both ways, and the sheet is baked at the size it is shown (say the bake
   time at the large size). Under reduced motion it opens without a transition.
2. **A key for the symbols.** Every symbol the map can draw, each with its plain name,
   read from the same table the drawing uses so the two cannot drift (say which file).
   In the large view the key is always shown beside or under the map. In the small
   view it opens from a "Key" control next to Symbols and does not push the map
   smaller. Only symbols present on this world are listed first; the rest follow under
   "Not on this world", or are left out: your judgement, say which. Names follow what
   the legacy app and `rules/` call each thing; do not name a symbol from memory.
   If the legacy app had a key, match its order (`hex_map.html`, `js/`; cite the line).
3. **The hex grid is always on.** Today the grid appears only with Symbols. Draw it
   whenever the map is shown, as the legacy surface map did (find it in `js/` and
   match its weight and colour against the map through tokens). "Symbols" then turns
   on only the symbols. The grid must stay legible and quiet at the column width: say
   the line width in device pixels at column, half and full.
4. **Day and night is a soft overlay with no outline.** Today the terminator shows as
   a bright line (the first shot). Remove the line; shade the night side with a
   gradual edge (a twilight band, wide enough to read as soft at the column width, not
   so wide that noon and dusk blur together: show three widths in shots and build the
   one you judge best). Light and dark only: no border, no glow, no second colour.
   The same treatment in the large view and, if it shares the code, on the orbit
   view's discs (say whether it does; do not change the discs' look without showing
   before and after).
5. **"Crunched".** At the column width the latitude labels, the scale bar and the
   caption are all tiny and the map is small. Give the map the full width of the
   pane's content at column (measure today's margins), keep labels at the smallest
   size the type scale allows and drop the ones that cannot fit instead of shrinking
   them, and move what can move under the map. Measure: the map's drawn width in CSS
   pixels at column, before and after.

## Constraints

- Nothing about a world's data changes; this is presentation.
- Both renderers (enhanced and vanilla) and no-WebGL (the dossier map is a 2D canvas
  and must keep working without it).
- No layout shift when the key opens or the large view closes (measure it).
- Every word follows the Google developer documentation style guide.
- If the large view needs a line in `dossier/DossierBody.vue` or `DossierPanel.vue`
  (not yours), give the exact line in the report; build everything else.

## Owned files (this pass)

`apps/web/src/dossier/SurfaceStage.vue`, `SurfaceTimeBar.vue`, a new component or two
beside them, `apps/web/src/surface/`, `scripts/surface_parity.js`, your tests in
`tests/web/`, your token lines, shots `kc_map_*`,
`directives/reports/c_surface_map_read.md`. Read only: `workspace/Lightbox.vue`,
`workspace/focus_trap.ts` (you may import the helper), the dossier's other files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`node scripts/surface_parity.js`; a browser pass on a production build, your own
ports, stopped after: the world in Johnny's shots if you can find it (atmosphere
"Carbonic Acid", UWP A768 8B8-D; say which world you used), plus one dry world and one
water world; small and large; Symbols on and off (grid in both); Day/Night on and off;
the key by pointer and keyboard; column, half, full and 520 px; reduced motion; with
WebGL off. Before and after pairs at the top of the report by file name.

## Stop rule

Stop when the five items pass and the report is written.

Write `directives/reports/c_surface_map_read.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the live shots show a bright terminator, hexes only with Symbols, and no key. next: draw the grid always, soften the night edge, and add the key and the large view.

done: the grid stays on, the night edge is a dark tint, and the column map opens large with a key. next: run the gates and shoot the map.

done: the report is written. next: stop.
