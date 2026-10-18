# Lane A — the feed draws every game the server sends

Issued 2026-10-13 by the orchestrator. **Second in your queue, after
`prompts/a_map_name_address_pane.md` is reported.** You may be a fresh session with no
memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/A.md`, `directives/reports/done/d_public_games_wire.md` (fault 1),
`directives/contracts/b_public_games.md`, then this file. No git but read-only, no
deploy, no `rules/`.

The server now leaves the caller's own universes out of `GET /api/public-games`
(Lane B, built). Your name-match guard (`dropOwn`, `ownName` in
`apps/web/src/map/public_games.ts`) therefore hides a stranger's game that happens to
share the name of the viewer's own: Lane D saw it with two new accounts, both named
"My campaign".

## Do

1. Remove `dropOwn`. Every hex the server sends is drawn.
2. Make `ownName` optional and unread in `watchPublicGames`'s argument, so Lane D's
   call in `views/MapView.vue` still compiles until Lane D drops the field
   (`d_menu_and_job_error.md` item 2). Do not edit `MapView.vue`.
3. `tests/web/public_games.test.js`: a game with the same name as the open universe
   is drawn; the count is as sent.

## Owned files (this pass)

`apps/web/src/map/public_games.ts`, `tests/web/public_games.test.js`,
`directives/reports/a_feed_draw_all.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. A red test
in `surface/` or the engine fixtures while Lane C is mid-step goes under "Needs from
others". No browser pass: Lane D's two-account pass covers it.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_feed_draw_all.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: dropOwn is gone, ownName is optional and unread, and a same-name game is drawn with the count the server sent. next: the four gates and the report.
done: check, typecheck and build pass. npm test is 1611 pass and 2 fail, both outside this pass. next: the report.
done: directives/reports/a_feed_draw_all.md written. next: stop.

