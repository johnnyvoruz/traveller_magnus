# Lane B — the worker suites all green, all together

Issued 2026-10-17 by the orchestrator. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/B.md`, your report `reports/done/b_quota_reservation.md`,
then this file. No git but read-only, no deploy, no `rules/`.

## 1. The `universes` suite's old pin
It expects `engineVersion` `1.1.0`; `packages/engines` is `1.2.0` on disk (engine e1.2; production
still answers what it was deployed with). Make the test read the expected version from
`packages/engines/package.json`, as the server does. Don't change the engines package.

## 2. Every worker suite in one command
Nobody runs all of `tests/api/` together. Add `scripts/test_api_all.mjs` and the root script
`test:api:all`: it runs each `RUN_API_TESTS=1` suite with its own free port and its own state folder
under the OS temp folder, a few at a time (say how many), and prints one table: suite, result,
seconds, and for a failure its first assertion. State folders are removed afterwards; no server is
left.

## 3. Run it and sort the failures
Run it on today's tree. For each failure: the cause in one line and its owner (by the board's lane
areas). Fix the ones in your area. Don't fix another lane's; list them.

## 4. One more collision (added 14:30)
`tests/api/packages_migration.test.js` ("package tables apply on a fresh local D1 and on today's
schema") runs in plain `npm test`. It failed in Lane N's full run at about 14:20 while other lanes ran
theirs, and passes alone (orchestrator, 14:30). Give it its own temp state folder and a free port, as
Lane A did for `tests/tools/examples.test.js` (`reports/done/a_shared_encoder.md`), and check every
other `tests/api/` file that runs without `RUN_API_TESTS` for the same.

## 5. Skip `truth_build` (orchestrator, 15:15)
`tests/api/truth_build.test.js` is one of the ten parked truth-build files; Lane Z is reworking it
now (stream Z2, made cap-safe) and it ran past 510 s for you. Leave it out of your run-all table with
the note "parked, Lane Z (Z2)", stop any run of it you have going, and finish the rest.

## Gates
`npm test`, `npm run check`, the typecheck; the table from item 3 in your report.

## Report
`directives/reports/b_universes_pin.md`. **Owned:** `tests/api/universes.test.js`,
`scripts/test_api_all.mjs` (new), the one root `package.json` script line, tests under `tests/api/` in
your area, your report. Other lanes are editing `tests/api/` files today: touch only yours.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: the universes suite still pins 1.1.0 by hand. next: read the version from the engines package.
done: the catalogue test reads packages/engines/package.json. next: run every worker suite together.
done: the suites ran three at a time. Universes passed. Density died on a Windows file lock, and the quota read died on SQLITE_IOERR. next: retry those, and give the package migration its own port.
done: density, quota, and the package migration passed alone. The three-at-a-time run still lost four suites to a file lock after the assertions. next: wait out that lock and run the table again.
done: the second table kept the file lock on three fixed state folders, and the quota probe lost the race to a slow D1 read. next: fix those and run the table again.
done: the third table is 30 pass and 6 fail. The Lane B rows pass alone. next: the report.
done: truth_build.test.js is left out of test:api:all, noted parked, Lane Z (Z2). next: the stream entry.
