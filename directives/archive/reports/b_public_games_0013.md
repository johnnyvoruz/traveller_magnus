Found: no half-finished Lane B edit. `0013_public_games.sql` and `tests/api/public_games.test.js` were already untracked. Dirty job, admin, and truth-build files were already in the tree and were left.
Finished: `ownedUniverse` is the Drizzle select again, `publicGames` is on the owner list and the single read, and a finished generate job charges its bytes once.
Backed out: nothing.

# Lane B public games 0013 report
Prompt: prompts/b_public_games_0013.md
Status: done

## Changed files
- `apps/api/src/universe/forward.ts`: ownership uses the Drizzle select on every database. The hand-written column list is gone.
- `apps/api/src/auth/public_schema.ts`: `readPublicGames` reads the flag with one statement, and returns null when 0013 is absent.
- `apps/api/src/routes/public_games.ts`: the switch and the campaign recompute each read the flag themselves.
- `apps/api/src/routes/universes.ts`: list, single read, create, rename, and delete include `publicGames` only when 0013 is present.
- `packages/shared/src/schemas/campaign.ts`: `Universe.publicGames` is an optional boolean.
- `apps/api/src/db/migrations/0013_public_games.sql`: unchanged, still untracked, still required.
- `apps/api/src/db/migrations/0014_object_byte_charges.sql`: one row per generate job.
- `apps/api/src/jobs/object_charge.ts`: insert and `object_bytes` add are one D1 batch. A retry that finds the job adds nothing.
- `apps/api/src/jobs/generate_queue.ts`: `finishCounts` charges, then writes the settled mark.
- `tests/api/public_games.test.js`: the list and the single read, with 0013 and without it.
- `tests/api/object_charge.test.js`: a repeat adds once, and a failed add rolls the row back.
- `tests/api/universes.test.js`: the created universe's engine version is `1.1.0`, matching `packages/engines`.
- `tests/shared/campaign.test.js`: the optional boolean is accepted and a number is refused.
- `directives/contracts/b_public_games.md`: the list field, and the read that replaced the hand-written row.
- `directives/contracts/b_builder.md`: the one-time byte charge, and the open quota race.

The hand-written row existed because `public_games` is not a Drizzle column. Putting it on that table would make every ownership select fail before 0013. The raw statement listed every column so it could add `public_games`. A later column added to Drizzle and forgotten in that list would disappear on every Builder route once 0013 was on. The Drizzle select names its own columns, so the extra `public_games` column is ignored, and a new column cannot be dropped by a second list. The flag is read only by the switch, the recompute after a successful campaign save, the owner list (one statement for the whole list), and the single-universe read. That is the smaller change, and it is what the suites ran.

**0013 is safe to push.** Ship `0014_object_byte_charges.sql` in the same push. A finished job calls the charge table. Without 0014 that call throws and the settled mark is never written.

The 250 MB race is not closed. Two generate jobs on one universe each read `object_bytes` once, then keep a private baseline while they write objects. A lock taken at the slice read and held until the job ends would stall the second job, so it was not built. A reservation that does not stall looks like this: the Durable Object, which already runs one request at a time, adds the slice's new bytes to a per-universe reserved total before the object put, refuses the slice when `object_bytes + reserved` would pass 250 MB, and subtracts the reservation if the put fails or when `finishCounts` adds those bytes to D1. A crash must drop the reservation (store it with the job id and a short expiry) or a dead job would hold the quota. That is more than a few lines.

## Gates
npm test:      pass (1562 pass, 24 skipped, 0 fail). The skipped tests are the worker files, which run only with `RUN_API_TESTS=1` and are the fourth gate.
npm run check: pass
typecheck:     pass
fourth gate:   pass, with one file left to another lane. Each file had its own ports. 0013 was applied on that database.

| File | Result | Seconds |
|---|---|---|
| health.test.js | pass | 3.3 |
| universes.test.js | pass on retry | 16.7 |
| objects.test.js | pass | 17 |
| characters.test.js | pass | 16.4 |
| campaign_export.test.js | pass | 5.2 |
| parity.test.js | pass | 5.4 |
| campaign.test.js | pass | 21.2 |
| builder.test.js | pass | 11 |
| builder_form.test.js | pass | 10.7 |
| builder_close.test.js | pass | 12.1 |
| builder_sector.test.js | pass | 21.5 |
| builder_sector_generate.test.js | pass | 18.5 |
| builder_dots.test.js | pass | 17 |
| builder_allowance.test.js | pass | 22.7 |
| campaign_entry_images.test.js | pass | 12.5 |
| generate_speed.test.js | pass | 16.2 |
| packages.test.js | pass | 31 |
| passkeys.test.js | pass | 29.6 |
| passkey_schema.test.js | pass on retry | 12.7 |
| public_games.test.js | pass | 42.6 |
| builder_density.test.js | pass | 16.3 |
| truth_build.test.js | fail, not this lane | 156.6 |

`universes.test.js` first failed because it expected engine version `1.0.0`. The package is `1.1.0`. `passkey_schema.test.js` first failed in `finally` with `EPERM` while deleting its state directory. The assertions had passed. The retry passed. `public_games.test.js` covers the list and the single read with the column present (`false`, then `true`) and with the column dropped (the field omitted).

## Contract published
contracts/b_public_games.md, contracts/b_builder.md

## Needs from others
- Lane D: read `publicGames` from `GET /api/universes` and `GET /api/universes/:id`. Boolean when 0013 is present, omitted otherwise. Do not treat a missing field as on.
- Whoever owns the uncommitted truth-build work (`apps/api/src/routes/admin.ts`, `apps/api/src/jobs/truth_build.ts`, `tests/api/truth_build.test.js`, and the other dirty job files that were already in the tree): `truth_build.test.js` "truth build" failed at line 1333, `audit_log` rows for `truth.remove` on `vreconcile` were 2, expected 1. The other three worker tests in that file passed. Not fixed here.

## Questions for Johnny
none
