# Lane A — the report you owe, then the nine star colours in `orbit/system.ts`

Issued 2026-10-10 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory.

## Step 0. The report for the draft handle (owed)

`directives/prompts/a_draft_handle_close.md` is finished and accepted on the tree, but
its report was never written: the checklist sits under that file's "## Progress". If
`directives/reports/a_draft_handle_close.md` and
`directives/reports/done/a_draft_handle_close.md` are both missing, write the first one
now from `directives/reports/_TEMPLATE.md`: copy the checklist's file lines under
"Changed files" (correct a line number only if it has moved), paste the gates from
step 3 below once you have run them, and under "Needs from others" write the line for
Lane D that the checklist gives. Change no code for this step.

## Goal

`findings/checker_colour_audit.md` (lines 18 to 26) lists nine colour literals in
`apps/web/src/orbit/system.ts` at about lines 203 to 205: the star colours for types O,
B, A, F, G, K, M, D and BD. The manifesto allows no colour outside
`apps/web/src/design/tokens.css`. Move them, so the checker patch in that audit can go
in with nothing of yours left on its list.

## Owned files (this pass)

- `apps/web/src/orbit/system.ts`: only the star colour table and whatever reads it
- `apps/web/src/design/tokens.css`: nine new lines, appended, named by what they paint
  (`--star-o` … `--star-bd`), each holding today's exact value. Change no other line.
- `tests/web/orbit_system.test.js`
- `directives/reports/a_orbit_colours.md`

Not yours: `views/OrbitView.vue` (shared; Lane D has it this turn), `views/MapView.vue`,
`workspace/`, `surface/`, `apps/api`, `packages/`.

## Contract to read

None from another lane. Read how Lane C did the same thing for the surface map:
`iconPaint()` and the `--surface-*` tokens (`apps/web/src/surface/hybrid/symbols.ts`,
`daynight_layer.ts`): a token is read once when the thing is built, never per frame.

## Steps

1. Find every reader of the star colour table (`grep` in `apps/web/src/orbit/` and
   `views/OrbitView.vue`; read, do not edit, the view). If a reader outside your owned
   files needs the colour as a string at import time, keep the function's signature
   and resolve the token inside `system.ts`.
2. `system.ts` is used by tests in Node, where there is no stylesheet. Keep the tests
   passing without a DOM: resolve the token through whatever seam the orbit code
   already uses for theme colours (look for one first), and where there is none, add
   the smallest one (a resolver passed in, with the token **name** as the value the
   pure code carries). Do not copy the literals into a fallback table in a script:
   that is the thing being removed.
3. Gates: `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted.
   Fourth gate: `grep -nE "#[0-9a-fA-F]{3,8}\b" apps/web/src/orbit/system.ts` prints
   nothing, pasted. One shot of an orbit view with at least two star types before and
   after (`findings/ui_design_shots/kb_star_tokens_before.png`, `_after.png`), on your
   own ports, both servers stopped after.

## Stop rule

Stop when the grep is empty, the gates pass and both reports are written. Stop early
with a blocked report if the only way to give a reader its colour is an edit in
`views/OrbitView.vue` or any file not listed above: name the line and what it needs.
A gate failure in another lane's file is pasted under "Needs from others", not fixed.

Write `directives/reports/a_orbit_colours.md` from the template. Questions for Johnny
written out in full, recommended answer first. After each meaningful step append one
line under Progress: "done: X. next: Y."

## Progress
done: before shot is findings/ui_design_shots/kb_star_tokens_before.png (Regina: F7 V, BD 0 V, M3 V). next: replace the hex table in orbit/system.ts with token names, resolved from the page or from tokens.css.
done: STAR_TOKENS replaced the hex table. The nine tokens were already in tokens.css, so none were appended. next: after shot, gates, both reports.
done: after shot is kb_star_tokens_after.png. Gates pass (1316 tests, 1302 pass, 0 fail, 14 skipped; check clean; typecheck exit 0; build 492 modules; no hex in system.ts). Reports: directives/reports/a_draft_handle_close.md and directives/reports/a_orbit_colours.md. next: stop.
