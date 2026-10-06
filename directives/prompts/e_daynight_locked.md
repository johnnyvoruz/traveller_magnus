# Agent E — the locked world's Day and night card (follow-up 18)

Issued 2026-10-06 by the orchestrator. Do this after `e_climate_fields.md` is reported.

For a world that keeps one face to its star, the Day and night card shows an empty strip
under "No day and night". Johnny asked for a short computer-terminal readout "from the
Scouts" in its place. Agent D has designed it: **`findings/daynight_locked_design.md` is the
specification** (mockups `findings/ui_design_shots/fu18_*`). Read all of it; it says exactly
what to build and which field each line reads.

## Your files for this step

The same rules as before, with one change: **`apps/web/src/dossier/DayNight.vue` and
`apps/web/src/orbit/daynight.ts` are yours for this step** (Agent C, whose they were, is on
the planets' city lights). Still closed: everything else in `orbit/` but `card.ts` and
`BodyCard.vue`, `design/tokens.css`, `design/base.css`, `tests/web/contrast.test.js`,
`views/`, `workspace/`, `shell/`, `surface/`. No git.

## Build

- Treatment 1 of the design: the readout alone, in place of the strip, for a locked world
  only. Every other world's card is unchanged, including the teal play marker that moves
  with the orbit clock.
- No High or Low temperature beside DAYSIDE and NIGHTSIDE: the dossier does not say which
  side each belongs to.
- The type-on runs once, by the tokens' motion, and not at all under reduced motion; the
  cursor does not blink. Nothing shifts as it types: the block has its full height first.
- If the design needs a token or a colour pair that does not exist, do not add it: build
  with what exists, and name what you need in your report.

## A change in your folder that is not yours: leave it

`dossier/DossierOverview.vue` was edited on 2026-10-06 by Johnny and the orchestrator:
**"Explore orbits" now sits to the right of the Mainworld button**, inside the mainworld
callout (`.doss-callout-actions`), and keeps its own row at the top only when there is no
callout (`!model.holdLead`). Do not move it back and do not restyle it. If your own work
touches that file, read it again first.

## One more, in your own file

Agent A has rebuilt how the panes are addressed (`apps/web/src/shell/pane.ts`: `withQuery`
keeps `panel`, `record`, the camera and the clock in the query). A found one push that does
not go through it: in `dossier/DossierPanel.vue`, the push to the orbit view is
`orbitPath(...)` with no query (about line 222), so opening the orbit view from the dossier
drops the clock and the pane. Send it with `withQuery(route.query, {})`, as the two body
pushes above it carry `route.query`. A test if the push is in a pure helper; otherwise say
how you checked it.

## Check

Tests for the lines (each from its field; the TWILIGHT ZONE line only when the dossier has
that row; a world that is not locked unchanged). `npm test`, `npm run check`,
`npm run typecheck`, `npm run build`, pasted. In the browser, signed out, on the released
chart: Jenghe I (Spinward Marches 1810), the world in D's mockup, at column, half, full and
520 px, with reduced motion on and off; and one world that is not locked. Screenshots
`fu18_built_*` beside D's `fu18_*`. Stop and report, in the same format as before.
