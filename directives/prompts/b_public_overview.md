# Lane B — public ships when the map is zoomed out: one small feed per chart

Issued 2026-10-14 by the orchestrator. **Start only after the board says push 1.2.1 is
live.** You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_party_ships.md`, then this file. No git but read-only, no deploy,
no `rules/`.

## Johnny's words (2026-10-14)

Asked whether other people's ships should still show when the map is zoomed out past the
hex level, where today they disappear: **yes.** The point is that "the whole galaxy feels
alive". It is flavour: "you can't really alter anyone else's game or ship."

## Today

`GET /api/public-games?truthVersion=&sector=` answers one sector at a time, and the map
asks only at the hex zoom. Zoomed out to sectors or the galaxy, the map has nothing to
draw.

## Do

1. **`GET /api/public-games/overview?truthVersion=`.** Lane D builds against this shape
   at the same time, so keep it exactly:
   ```
   { hexes: [ { key: "Spinward_Marches/1910", count: 2 } ] }
   ```
   - One item per hex holding at least one public ship on that chart version, `key` the
     full hex key, `count` the number of public ships there. No names, no marks, no
     example flag, no game: hexes and counts only.
   - Ordered by `key`. Name a cap (suggested 20,000 hexes) and what happens past it.
   - **The same for every caller**, the caller's own ships included, so the answer can be
     cached: `Cache-Control: public, max-age=60`. Say in the contract why including the
     caller's own ships is acceptable here (the sector feed still leaves them out).
   - Signed in or out once 0018 is applied; before 0018 signed out is 401, as the feed.
     The same rate limit as the feed (user id, or IP signed out).
   - One D1 query: a `GROUP BY` over `public_ships` joined to live, public universes. Say
     its cost, and whether it needs an index beyond `public_ships_chart`.
   - Errors: 400 `truthVersion is required.` and `Invalid request.` as the feed.
2. Add `PublicGamesOverview` to `packages/shared/src/schemas/public_games.ts`.
3. Write it into `contracts/b_party_ships.md` as a section "The overview", with what must
   never appear (every key of the sector feed's list, and any name).
4. Tests: the shape, own ships included, a game switched off gone, a `~` sector never
   present, signed out before and after 0018, the cache header.

## Owned files (this pass)

`apps/api/src/routes/public_games.ts`, `packages/shared/src/schemas/public_games.ts`,
`packages/shared/src/index.ts`, `tests/api/public_games.test.js` or a new
`tests/api/public_overview.test.js`, `tests/shared/public_games.test.js`,
`directives/contracts/b_party_ships.md`, `directives/reports/b_public_overview.md`.
Lane D is in `map/` and `views/MapView.vue` this turn.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and `RUN_API_TESTS=1`
for the public suites, pasted.

## Stop rule

Stop when the gates pass and the report is written. Write
`directives/reports/b_public_overview.md` from `directives/reports/_TEMPLATE.md`. After
each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
