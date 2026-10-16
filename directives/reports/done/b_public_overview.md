# B public_overview report
Prompt: prompts/b_public_overview.md
Status: partial

The overview route, the schema, the contract, and this lane's tests are done. `npm test` is red on two Lane Z files. This pass does not edit them.

## Changed files
- `apps/api/src/routes/public_games.ts`: `GET /api/public-games/overview`. One grouped query. Success is `Cache-Control: public, max-age=60`.
- `apps/api/src/index.ts`: mounts that route.
- `packages/shared/src/schemas/public_games.ts`: `PublicGamesOverview`, `PublicGamesOverviewHex`, `PUBLIC_OVERVIEW_MAX` 20,000.
- `packages/shared/src/index.ts`: exports those names.
- `tests/api/public_overview.test.js`: with 0018 (ports 18884/19884) and with `public_cards` dropped before start (ports 18885/19885).
- `tests/shared/public_games.test.js`: the overview shape rejects a name, a `~` key, and a zero count.
- `directives/contracts/b_party_ships.md`: section "The overview".

## Gates
npm test: fail. 1773 tests, 1737 pass, 2 fail, 34 skipped. `TEST_EXIT 1`. Both failures are Lane Z. See Needs from others.
npm run check: pass. `manifesto: clean`.
typecheck: pass. `tsc --noEmit -p apps/api`, `TYPECHECK_EXIT 0`.
npm run build: pass. `vue-tsc -b` and vite, 673 modules, `BUILD_EXIT 0`.

`RUN_API_TESTS=1`:

- `tests/api/public_overview.test.js`: pass, both tests, 25938 ms. `OVERVIEW_EXIT 0`. With 0018 the body is `{ hexes: [{ key: "Spinward_Marches/1910", count: 2 }] }` for the owner, the other player, and a signed-out caller. The cache header is `public, max-age=60`. A `~` sector row is absent. Switching both games off removes the hex. The sector feed for the owner still has count 1. With `public_cards` dropped, signed-out is 401 and a signed-in caller still gets the hex.
- `tests/api/public_games.test.js`: pass, 32212 ms, including the database with `public_games` dropped. `GAMES_EXIT 0`.

## Contract published
contracts/b_party_ships.md, section "The overview"

## Needs from others
- Lane Z: `tests/api/packages_migration.test.js` applies every migration except `0010_packages.sql`, then executes that script. `0019_package_covers.sql` alters `packages` in that script, so the execute fails with `no such table: packages`. Exclude `0019_package_covers.sql` from that prior list the same way the test excludes `0010_packages.sql`.
- Lane Z: `tests/shared/package_schema.test.js` parses a `PackageCard` with no `cover`. `PackageCard.cover` is required and nullable. Add `cover: null` to that fixture.

## Questions for Johnny
none
