# Lane D — publish from a single system; roll again without Keep

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your third hand-designer report is accepted
(the roll, the star dropdowns, the class label, a belt around a world, orbit and AU in
step, one name per control).

## 1. Publish from a single system (Johnny: yes, 2026-10-11)

Today "Publish selection…" needs two or more hexes, a subsector or a sector, because
for one system the pane shows the dossier and your form cannot appear there. Your
report gave the fix; build it:

- **You hold `apps/web/src/dossier/DossierPanel.vue` this turn, for this one line and
  its import only**, before `<SystemEditor v-else-if="drafting" …>`:
  `<PublishForm v-else-if="marketUi.open" :keys="[hexKey]" />`. Give the line numbers
  in your report. Leave the surface map's lines (`findings/push/hybrid_surface_notes.md`)
  and every other block exactly as they are.
- `build-publish` allows one key; the Build bar's More menu offers it for one system;
  the summary reads right for one ("1 hex in 1 sector"); an empty hex alone is not
  offered (nothing to publish), with one plain sentence why.
- A chart system the person removed from their map goes in as a deleted hex (Johnny:
  yes, as built): make sure the one-hex case says so in the summary.

## 2. Roll again without Keep

Lane A is changing the draft handle so a repeated `<bodyId>.profile.roll` is sent
(`prompts/a_roll_again.md`). **Do this part only if `findings/builder_roll_again_ready.md`
is on disk** when you reach it; if it is not, skip it and say so. With it: the button
stays on after a roll, pressing it rolls again, the count for that body's roll stays 1,
and the sentence "To roll different values, select Keep, and then roll again." goes.

## 3. Your two questions: answered when the board says so

Whether K keeps a draft, and whether "Remove" is clear without "from your map", are
with Johnny. Until `directives/board.md`, Decisions, says otherwise, both stay as you
built them.

## Copy

Every sentence follows the Google developer documentation style guide; add new strings
to the table in `findings/builder_system_design.md` §21 and to
`findings/marketplace_screens_design.md`.

## Owned files (this pass)

`apps/web/src/workspace/build/`, `apps/web/src/workspace/market/`, the one line and its
import in `dossier/DossierPanel.vue`, `tests/web/build_*.test.js`,
`tests/web/market_screens.test.js`, shots `km3_*`, `directives/reports/d_publish_single.md`.
Not yours: `marketplace/`, `builder/`, `router.ts` and `workspace/AccountMenu.vue` (Lane
E has them this turn), `apps/api`, `packages/`, `views/OrbitView.vue`,
`dossier/DossierBody.vue`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (Lane C's
texture work is in flight: if `tests/web/orbit_disc_texture.test.js`,
`surface_service.test.js` or `orbit_renderer.test.js` are red, name them and go on).
Fourth gate: a browser pass with the fake store wired dev-only as before, servers
stopped after: publish one filled system from its dossier pane by pointer and by
keyboard; one removed chart system; an empty hex; the dossier unchanged when the form
is closed; roll twice if part 2 ran. Column, half, full and 520 px.

## Stop rule

Stop when part 1 is built and passed (and part 2 if its note was there) and the report
is written.

Write `directives/reports/d_publish_single.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
