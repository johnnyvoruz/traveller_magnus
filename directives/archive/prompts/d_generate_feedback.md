# Lane D — generation you can see running; density on the sheet; whose map this is

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Do `prompts/d_publish_single.md` first if it
has no report yet. (It has: accepted, with both differences from the prompt's line kept.)

## Why

Johnny, 2026-10-11, on the live site (version 1.1.2): "tried doing system generation
and there's no spinner UI to show the generation in flight"; a subsector "is generating
something in EVERY SINGLE HEX"; and "I want to confirm that I'm building my own copy
of a universe and that anything I generate is not being burned into the truth layer."

## 1. Generation in flight is unmistakable

What exists: for one hex the button's words change to "Generating…" with `aria-busy`;
for many, a thin bar in the pane with "N of M" and Stop (`BuildPane.vue` about lines
76 to 83). He did not see either. Reproduce it first on a production build (the bar
may be waiting on its 300 ms rule, be off screen at the pane's column width, or the
job may finish between polls) and say in the report which.

Then make it impossible to miss, in the app's existing motion language (find the
spinner the app already uses; do not make a second):

- **One hex:** a spinner in the Generate button from the frame of the click, and the
  hex on the map marked as working until the preview is drawn.
- **Many:** the bar appears on the frame of the click, not after a delay, with a
  spinner, the label, "N of M", and Stop. On the map, the hexes of the job are marked
  as waiting and each changes as its system lands, so the map itself shows progress.
  If the store does not tell you which hexes have landed, mark the whole selection as
  working until the job ends and name the line in Lane A's store you would need.
- **The end:** the toast with the counts and Undo, as now, plus the "left empty" count
  once part 2 is in.
- Reduced motion: the spinner does not turn; the words and counts carry it.
- Nothing shifts when the bar appears or leaves (measure the layout shift).

## 2. Density on the Generate sheet

**Do this part only when `directives/reports/done/b_generate_density.md` or
`directives/reports/b_generate_density.md` exists**; read the contract section it
names. Lane A passes the field through the store (`findings/builder_density_ready.md`;
if that note is not on disk either, build the sheet against your seam and say so).

Johnny, 2026-10-11: yes to density, **as a dropdown** on the generate path, so the
same control serves any selection (a few hexes, a box, a subsector, a sector). On the
sheet for many hexes (`GenerateSheet.vue`), one labelled select, "Hexes to fill", with
four options in this order: "Every selected hex", "Sparse (2 in 6)", "Standard (3 in
6)", "Dense (4 in 6)". **Standard is the default**; the choice is remembered with the
engine and method. The same select is offered wherever many hexes are generated without
opening the sheet (the Build bar's Generate for a selection, the right-click menu): if
the sheet is the only place settings live today, show the current choice in the
button's second line ("Standard, 3 in 6") so nobody fills a subsector by surprise. One
hex shows no select and always generates. The count cannot be known before the roll:
say "up to N hexes", and after the run say how many were filled and how many were left
empty.

## 3. "This is your map"

What is true (orchestrator, from the architecture and `apps/api/src/universe/hexes.ts`):
the published chart is a released, read-only version; a universe points at one version
of it and stores only its own changes; Generate, Remove, Keep and "Design by hand"
write to the person's universe and never to the published chart, and nobody else sees
them. Publishing a package is the only way anything leaves, and that makes a package,
not a change to the chart.

Say this once where a person starting to build will read it, in two plain sentences,
and nowhere else: your recommendation for where (the first time Build opens, or a line
in the Generate sheet's foot). Do not use the word "truth": it is our word, not the
referee's; the screens already say "the chart" and "your map" (keep to the naming in
`findings/builder_system_design.md` §21).

## 4. Roll again without Keep (carried over from `d_publish_single`, part 2)

`findings/builder_roll_again_ready.md` is on disk now. The button stays on after a
roll, pressing it rolls again (`hand_acts.ts` still blocks the second press and
`edit.rolled` stores the id once: Lane A's note says what the draft does), the count
for that body's roll stays 1, and the sentence "To roll different values, select Keep,
and then roll again." goes. One test.

## 5. Focus leaves the orbit picker (found by Lane F before it stopped)

Shot `findings/ui_design_shots/kf_13_picker_focus_escape.png` (look at it first): with
the orbit picker open, keyboard focus gets out of the modal to the page behind. No
steps were written down. Reproduce by keyboard only (Tab and Shift+Tab past each end,
the arrow keys on the picker's marks, opening and closing a select inside it), then
hold focus inside the picker while it is open, send it back to the control that opened
it on close, and add a test. If the frame is the copy of `workspace/Lightbox.vue`'s
the board mentions, fix it in your copy and say whether the Lightbox has the same hole.

## Copy

Every sentence follows the Google developer documentation style guide; add the new
strings to §21 of the design note.

## Owned files (this pass)

`apps/web/src/workspace/build/`, `tests/web/build_*.test.js`, your token lines, shots
`kb8_*`, `directives/reports/d_generate_feedback.md`. Not yours: `builder/` (Lane A),
`apps/api`, `packages/`, `views/OrbitView.vue`, the dossier files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on a production build with your own API port and state directory, both
stopped after: one hex and a subsector, with the network slowed so the in-flight state
lasts (say how), at column, half, full and 520 px, reduced motion once; shots of each
in-flight state.

## Stop rule

Stop when part 1 and part 3 pass (and part 2 if B's report was there) and the report
is written.

Write `directives/reports/d_generate_feedback.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: part 4, roll again without Keep (the blocking sentence removed; 1 test). next: part 1, reproduce the missing in-flight state on a production build.
done: part 1 reproduced (production build, 1,200 ms latency): one hex shows only the word "Generating…" for 2 to 3 s; a subsector's bar does show at +50 ms but is a still line at "0 of 80" that never moves (the job went 0 to done between polls), the map is unmarked, and with the pane closed nothing shows. Built: BuildSpin (the app had no spinner), flight.ts (waiting and landed hexes from row revisions), marks on the map, a job chip under the Build strip, the pane's bar laid over the pane; 3 tests. Part 2 skipped (no B density report). next: part 3, then the browser pass.
done: part 3 (note under the Build strip, once, until Got it); part 5 (focus held in the orbit picker, returned to Pick orbit; 1 test); browser pass kb8_* on a production build (latency 2,500 ms by CDP, four widths, reduced motion, layout shift measured); gates green (1397 pass); servers stopped; §25; report written. next: part 2 when Lane B's density report is on disk.
