# Agent A — the travel module

Issued 2026-10-06 by the orchestrator. This replaces any earlier travel prompt.

Your panes design (`findings/panes_swap_design.md`) is **accepted: shape A**, the `panel`
query. Its steps start when Agent D is out of `views/`; a prompt will say when.

Now, a small one. Johnny supplied the space travel rules as `rules/mgt2e_space_travel.json`.
**If that file is absent, stop and say so.** Run `npm run rules:gen`, then write
`apps/web/src/campaign/travel.ts`: pure, every rule number read from the generated module
(`packages/engines/src/generated/rules/mgt2e_space_travel.js`), none written in code.

1. `transitSeconds(distanceKm, accelG)`: the file's formula,
   `2 * sqrt(metres / (G * travel.metresPerSecond2PerG))`. A distance or a G that is not
   finite and positive throws.
2. `jumpParsecsCounted(parsecs)`: never under `jump.minimumParsecsCounted`.
3. `jumpFuelTons(hullTons, parsecs)`: `jump.fuelHullFractionPerParsec` times the hull times
   the counted parsecs.
4. `ASSUMED_HULL_TONS = 100`, exported, with the comment: Johnny, 2026-10-06, a stand-in for
   the MVP until a ship's own fields are read. It is the one number in the file that is not
   from `rules/`.
5. `rollJumpHours(random) -> { hours, dice }`: `jump.durationHours.base` plus
   `jump.durationHours.dice` six-sided dice (the book's D is `roll1D` in
   `packages/engines/src/core/rng.js`); `dice` is the array of faces. `random` is a function
   returning a number in [0, 1); its default is a new `randomUnit()` in
   `platform/browser.ts`, not the engines' seeded rng.

`tests/web/campaign_travel.test.js`: each function; the roll with a fixed source; and every
cell of `transitTimes` against `transitSeconds`, to the precision printed. **Eleven cells
are known to differ by more than rounding** (for example 100,000 km at 6G: table 42 minutes,
formula 43.03). List those cells in the test as data, with both values, and assert the list
is exactly those. Do not bend the formula or the table.

`npm test` and `npm run check` green, pasted.

Do not touch `campaign/track.ts`, `orbit/`, `workspace/`, `views/` or `packages/`. Stop and
report.
