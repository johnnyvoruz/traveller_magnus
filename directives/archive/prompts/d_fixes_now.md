# Agent D — the fixes that can go now, and the estimate's settling sum

Issued 2026-10-06 by the orchestrator. Both designs are accepted as written
(`findings/daynight_locked_design.md`, `findings/plot_ghosts_design.md`); the choices in
them are with Johnny, and until he answers, your recommended option stands in each. Agent C
builds the locked-world card and the ghosts from your notes.

**Agent A is rebuilding the panes right now** (follow-up 17) in `views/`, `App.vue`,
`router.ts`, `shell/`, `components/OmniBox.vue` and the address-pushing lines of
`workspace/`. **Agent E** is in `dossier/`, `orbit/card.ts` and `orbit/BodyCard.vue`.
**Do not edit any of those in this step.** If something below turns out to need one of
them, build the rest and say exactly what is needed.

## 1. From `directives/prompts/d_orbit_small_fixes.md`, do items 1, 2, 3, 4, 5 and 8

Read that file; the items are as written there:

1. the date readout's right padding (`orbit/HeaderClock.vue`);
2. "No ships here" on one line (`orbit/ShipStrip.vue`);
3. the campaign mark button out of the header, the way back in the Time drawer
   (`HeaderClock.vue`, `TimeControls.vue`, `orbit/commands.ts`, your drawers note);
4. a mark with `jump` set is not a ship on the picture (`OrbitCanvas.vue` `shipStatus` and
   the plotting "from", `ship_marks.ts`; say which lines of `OrbitCanvas.vue` you changed);
5. the plot card's title must not wrap inside a name (`ShipStrip.vue`);
8. the reaction-drive line over the assumed hull (`orbit/estimates.ts`, `ShipStrip.vue`).

**Items 6, 7 and 9 wait** for Agent A's report: they need `workspace/WhereBlock.vue` and
`views/OrbitView.vue`.

## 2. From your ghost design, step 2's pure half

`orbit/estimates.ts`: `settleFlight(distanceAt, accelG, departs)` exactly as your note's
§6.1 and §2.3 say, with its tests (a still target, a moving one that converges, one that
never agrees and stops at eight with `settled: false`, no distance). **Do not wire it:**
`views/OrbitView.vue` is Agent A's for now, and `realDistanceKmBetween` is Agent C's next
step. The wiring, the `preview` prop and the browser pass over the ghosts come in your next
prompt.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted; a failure only in
another agent's files is theirs: say which, and paste a run of your own test files. In the
browser, on your own port with `VOYAGE_TRUTH_API` set as the brief says: the header at rest
and with each drawer open, on and off the campaign date, signed in and signed out; a scrub
across the campaign date with the pointer held; the empty ship list and the plot card at
each width; a vessel in jump (no ring standing, no plotting from it) and the bubble as it
leaves. Contrast pairs for anything new. Screenshots `fu19_*`. Notes into
`findings/orbit_view_design.md`. No git, not even status. Stop and report, in the brief's
format.
