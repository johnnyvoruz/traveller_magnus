# Lane B universes_pin report
Prompt: prompts/b_universes_pin.md
Status: done

Found: progress was only the heading, the universes suite still expected engine 1.1.0, and there was no command that ran the worker suites together.
Finished: the catalogue test reads `packages/engines/package.json`, and `npm run test:api:all` runs the worker suites three at a time.
Backed out: nothing.

## Changed files
- tests/api/universes.test.js: the catalogue assertion reads `enginesPackage.version`, the same JSON import the worker uses. On this tree that is 1.2.0.
- scripts/test_api_all.mjs: new. Discovers every `tests/api` file that mentions `RUN_API_TESTS`, runs three at a time, each with its own port, inspector port, and state folder under the OS temp directory. A suite that calls `withDevServer` gets migrations first. Two files that name the same port wait. A Windows file-lock or dropped-connection failure is tried once more. The state folder is removed afterwards. `truth_build.test.js` is left out. The command prints `parked, Lane Z (Z2)` for that file and does not start it.
- package.json: `"test:api:all": "node scripts/test_api_all.mjs"`.
- tests/api/session.js: `runWrangler` retries `SQLITE_IOERR` and a worker that failed to start, the same way it already retries a locked database. `removeTree` waits out Windows still holding the sqlite directory.
- tests/api/packages_migration.test.js: one private temp directory, a free dev port and inspector port written into a private wrangler config, and `--cwd` set to that directory. `wrangler d1` has no `--port` flag, so the port is on that config.
- tests/api/builder_density.test.js, builder_dots.test.js, builder_sector_generate.test.js, generate_speed.test.js, public_overview.test.js, public_card.test.js, public_games.test.js, party_ships.test.js, truth_search.test.js, quota_reservation.test.js, campaign.test.js: the worker state directory is removed with `removeTree`.
- tests/api/quota_reservation.test.js: the probe put runs before the local D1 read, so a slow read cannot outlive the four-second reservation.
- tests/api/builder_allowance.test.js: the worker test's own cap is 450s. Under the heavy run it was stopped at its old 300s cap.

The other plain `tests/api` files do not start wrangler. `account_link.test.js` already listens on port 0. `http://127.0.0.1:8787` there is an origin string.

## Gates
npm test: fail. One failure, Lane A, not this prompt:

```
test at tests\tools\examples.test.js:31:1
✖ a pack that fails CampaignExport parsing is refused with the file and the field
AssertionError: The validation function is expected to return "true". Received false
Error: ...\bad-pack\campaign.json: This file is not a campaign export.
```

1946 tests, 1906 pass, 1 fail, 39 skipped. This run was before the later worker-test edits. Those files skip unless `RUN_API_TESTS=1`.

npm run check: pass (manifesto: clean)
typecheck: pass (`tsc --noEmit -p apps/api`)

fourth gate: `npm run test:api:all`, three at a time. The table is the third run. That run still started `truth_build.test.js`. The script now leaves that file out and prints `parked, Lane Z (Z2)`. The row is not in the table. The remaining rows are 30 pass and 5 fail. Seconds are that run. A file-lock failure has already been tried once.

| suite | result | seconds | assertion |
|---|---|---|---|
| builder_allowance.test.js | fail | 316.7 | the test hit its 300s cap: a daily allowance caps non-admins and resets with the UTC day |
| builder_close.test.js | pass | 162.1 | |
| builder_density.test.js | pass | 174.5 | |
| builder_dots.test.js | pass | 209.0 | |
| builder_form.test.js | pass | 110.7 | |
| builder_sector_generate.test.js | pass | 120.5 | |
| builder_sector.test.js | pass | 118.1 | |
| builder.test.js | pass | 243.2 | |
| campaign_entry_images.test.js | pass | 189.7 | |
| campaign_export.test.js | pass | 62.5 | |
| campaign.test.js | fail | 349.2 | EPERM deleting the voyage-dev state folder |
| characters.test.js | pass | 109.2 | |
| generate_speed.test.js | fail | 93.1 | Network connection lost, 500 !== 200 |
| health.test.js | pass | 53.6 | |
| install_delete.test.js | fail | 102.3 | EPERM deleting the voyage-remove state folder |
| install_links.test.js | pass | 53.8 | |
| install_records_only.test.js | pass | 35.6 | |
| install_reservation.test.js | pass | 44.0 | |
| install_source_gone.test.js | pass | 36.8 | |
| install.test.js | pass | 106.3 | |
| objects.test.js | pass | 38.0 | |
| package_covers.test.js | fail | 131.5 | EPERM deleting the voyage-covers-old state folder |
| packages.test.js | pass | 55.8 | |
| parity.test.js | pass | 28.6 | |
| party_ships.test.js | pass | 41.3 | |
| passkey_schema.test.js | pass | 34.4 | |
| passkeys.test.js | pass | 59.1 | |
| public_card.test.js | pass | 91.5 | |
| public_course.test.js | pass | 68.5 | |
| public_games.test.js | pass | 97.1 | |
| public_overview.test.js | pass | 74.9 | |
| quota_reservation.test.js | pass | 75.8 | |
| role.test.js | pass | 1.1 | |
| truth_search.test.js | pass | 38.8 | |
| universes.test.js | pass | 48.7 | |

Lane B causes, one line each:

- builder_allowance.test.js: the test reached its own 300s cap while the machine was busy (builder.test.js took 243s in the same run). It passed alone afterwards in 27.5s. The cap is now 450s. Owner B.
- generate_speed.test.js: wrangler dropped the connection and the job read came back 500. It passed alone afterwards in 17.7s. Owner B.
- campaign.test.js: Windows refused to delete the state folder after the assertions. `removeTree` was added after this table. It passed alone afterwards in 22.7s. Owner B.

The universes suite passed. The engines package was not edited.

## Contract published
none

## Needs from others
- Lane A: `tests/tools/examples.test.js` fails plain `npm test`. The thrown message is "This file is not a campaign export." The test expected `assert.throws` to accept that error.
- Lane Z: `install_delete.test.js` and `package_covers.test.js` fail on EPERM while deleting their temp state folders. Those files were not edited. `truth_build.test.js` is parked, Lane Z (Z2). It is left out of the run-all. It was not edited.

## Questions for Johnny
none
