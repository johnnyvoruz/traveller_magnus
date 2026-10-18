# Lane E — the rail tells the sign-in card it was opened from Build

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
`directives/reports/done/d_public_games_wire.md` ("Needs from others", Lane E), then
this file. No git but read-only, no deploy, no `rules/`.

Your `z_sheets_static` report is accepted. Johnny has answered its question: yes
(item 4 below).

## Do

1. `apps/web/src/shell/Rail.vue`, `onLocked`: before the `run('account')` line add
   `signInFrom.value = which === 'build' ? 'build' : null;` and add `signInFrom` to
   the import from `../workspace/account.ts`. Nothing else: the pop-up clears it on
   close. This is Lane D's line, written for your file.
2. A test in `tests/web/` that choosing the switched-off Build item sets it and
   choosing Campaign clears it.
3. In a browser, signed out: choose Build on the rail; the card reads "Sign in to use
   Build. It generates systems on a copy of the map that's yours." Choose Campaign:
   the card reads its usual line. Pointer and keyboard, at 1440 and 520 px.

4. **`noindex` on the unlisted sheet (Johnny: yes).** In
   `apps/web/public/sheets/meridian-03/index.html` only, add
   `<meta name="robots" content="noindex">` inside `<head>`. Change nothing else in
   that file; the other sheet and the menu stay as they are. Say the one line and
   where in the report. After `npm run build`, confirm it is in
   `apps/web/dist/sheets/meridian-03/index.html`.

## Owned files (this pass)

`apps/web/src/shell/Rail.vue`, its test, `apps/web/public/sheets/meridian-03/index.html`
(the one line), shots `ke10_*`,
`directives/reports/e_rail_build_pitch.md`. Not yours: `workspace/` (Lane D).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. A red test
in `surface/` or the engine fixtures while Lane C is mid-step goes under "Needs from
others". The browser pass above, on your own port and Vite cache, stopped after.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/e_rail_build_pitch.md` from
`directives/reports/_TEMPLATE.md`. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: the rail sets signInFrom before it opens the card, and the unlisted sheet has noindex. next: the test, then the gates.
done: the rail test chooses Build, then Campaign. next: the four gates and the browser.
done: check, typecheck and build passed. The card was read at 1440 and 520, by click and by Enter. next: the report.

