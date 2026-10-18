# Lane A — draw a belt that orbits a world

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your hand-orbit report is accepted.

## Goal

Johnny ruled (2026-10-11) that a belt may be placed around a world or a gas giant by
hand; nothing generates one. Lane B built it: read
`directives/contracts/b_builder.md`, section **"What may orbit what"**, and
`directives/reports/done/b_hand_roll_belt.md`, "Needs from others". What the rows now
carry: such a belt is nested in its parent body's `moons` with `type`
`Planetoid Belt`, `pd` and `eccentricity` when stored, no `isMoon`, no `periodYears`.

Make the orbit view and the dossier show it honestly:

1. `apps/web/src/orbit/hand_present.ts` nests it exactly as the server's `handWalk`
   does (a test that deep-equals the two for a system with a world, a moon and a belt
   around that world).
2. In the orbit picture it is drawn around its parent as a belt (the look the app
   already uses for a belt around a star, scaled to the parent: reuse that drawing; do
   not design a new mark), not as a moon disc. Where the drawing is in
   `OrbitRenderer.ts` and Lane C has the disc-drawing part on loan this turn, **do not
   edit the disc code**: if a belt around a world cannot be drawn without it, give the
   lines and stop that part.
3. The lists, chips, card and dossier name it a belt, under its parent, with its
   distance in planetary diameters when stored and **no year, no day, no period**
   (Johnny: a belt has no year data). It is never counted as a moon ("4 moons").
4. A system with no such belt looks exactly as today.

## Owned files (this pass)

`apps/web/src/orbit/` except the disc-drawing part of `OrbitRenderer.ts` and
`disc_batch.ts` (lent to Lane C); `apps/web/src/dossier/model.ts`;
`tests/web/orbit_*.test.js`, `tests/web/dossier_model.test.js`;
`directives/reports/a_belt_around_world.md`. Not yours: `views/OrbitView.vue`,
`dossier/DossierPanel.vue`, `dossier/DossierBody.vue`, `workspace/`, `packages/`,
`apps/api`.

## Copy

Any label you add follows the Google developer documentation style guide: plain words,
sentence case, present tense.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (a build
failure in another lane's file is pasted under Needs, not fixed). Fourth gate: one
shot on your own ports of a hand system with a world, its moon and its belt in the
orbit view, `findings/ui_design_shots/kb_belt_around_world.png`; servers stopped.

## Stop rule

Stop when the four points are tested and reported, or blocked on the disc code as
above.

Write `directives/reports/a_belt_around_world.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full, recommended
answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: read the contract and handWalk. next: nest the belt and draw the band.
done: the belt is nested, drawn as the belt band, and left out of the moon count. next: the gates and the shot.
done: the belt is nested like the walk, drawn around its parent, and the shot is saved. next: none.
