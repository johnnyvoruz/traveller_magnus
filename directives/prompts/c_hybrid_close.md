# Agent C — the hybrid surface map, the close before its push

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`. You
lead this work; the Traveller Architecture agent has finished and will not edit again.
Accepted from your report: the audit, the ragged ice on land and sea, the tilt check,
the cuts (globe sampling, seasonal ice with the clock, saving hex edits), Vanilla and
`DRAW_FRAG` unchanged, the parity script, the two push files. Five things are left.

## 1. A system generated in Build, seen

Condition 1 is not met without it. Agent D runs a local API with a universe pinned to
chart v5 and signs in as dev-admin; `findings/builder_system_design.md` says how (search
it for the local harness and the pinned universe). Do the same on your own ports and
your own state directory. Generate one Mongoose system and one Architect of Worlds
system, open each world's dossier, and shoot the map, the terminator, Symbols and the
caption (`hy_build_*`). The orbit view of a generated system is stuck on "Loading this
system." until Agent A's fix lands; that is A's, do not touch it, use the dossier. If the
harness cannot be made to work, say exactly where it stops.

## 2. The first Symbols click

It measured exactly 50.0 ms, and the budget is no presented frame at or over 50 ms. The
cause you named is icon decode. Decode the set ahead of the click (after the sheet is on
screen, off the frame that draws it), so the first toggle costs what the later ones do.
Measure the first click on a cold dossier at DPR 1 and 2.

## 3. The two measurements you skipped

A warm in-app open of a body's dossier (your `/b/w7` link count was 0: find the link the
app really renders, or open it from the body chips), worst frame; and a screenshot of
the focus ring on each toggle and on the time bar.

## 4. Hex colours outside `tokens.css`

`apps/web/src/surface/hybrid/icons.ts` still holds colour literals (about lines 214,
242, 251, 260, 282, 286 to 288 and whatever follows: `#b00020`, `#ffffff`, `#e8501c`,
`#c0182b`, `#7a1fa2`, …). Manifesto rule: no hex colour outside `tokens.css`. Move every
one to a token, reusing your `--icon-*` set where the colour is the same, read through
the path the public icons use. Then say in one line why `npm run check` passed with them
there (report it; `scripts/` is not your lane).

## 5. Two push lists instead of one

Johnny has not ruled on the Okina question, and the map does not depend on the answer.
So that the map can go without it:
- `findings/push/hybrid_surface_files.txt`: the map only. Take out
  `packages/engines/src/mgt2e_world_engine.js` and the five `engine_1.1.0` fixtures, and
  the four `findings/` paths (notes are not pushed by list).
- `findings/push/engine_water_ice_files.txt`: those six engine and fixture paths.
- In `hybrid_surface_notes.md`, add a section "Without the engine change": read every
  surface test and say whether any of them needs the nine engine lines or the changed
  fixtures to pass, naming the test if so. Re-check the line ranges in the three shared
  files against the tree as it is now (Agents A and D have edited them since).

## Check and report

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`,
`scripts/surface_parity.js`, pasted. What you finished, what you cut. No git, no deploy.
Stop and report.
