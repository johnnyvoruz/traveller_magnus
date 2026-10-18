Found: the accepted 0013 charge and public-games edits were uncommitted. `chargeObjectBytes` still threw when `object_byte_charges` was missing. Progress was empty.
Finished: nothing a frozen session had left half-done.
Backed out: nothing.

# Lane B charge fallback report
Prompt: prompts/b_charge_fallback.md
Status: done

## Changed files
- `apps/api/src/jobs/object_charge.ts`: a missing `object_byte_charges` table uses the plain `UPDATE universes SET object_bytes = object_bytes + ?` and nothing else. The probe is `sqlite_master`, once per D1 binding (a `WeakMap`), the same shape as the 0013 probe in `public_schema.ts`. That path never starts the batch, so the bytes cannot be added twice. If a batch still fails with `no such table` and `object_byte_charges`, the batch has rolled back, the binding is remembered as absent, and the plain update runs once.
- `apps/api/src/routes/public_games.ts`: `GET /api/public-games` joins `universes` with `owner_id !=` the caller. A hex with no other game is absent. One other game keeps `count` 1 and that universe's name.
- `apps/api/src/routes/truth.ts`: inside a search rank, `Spinward_Marches` comes before the name. Ranks and the row shape are unchanged. The cap stays 50.
- `tests/api/object_charge.test.js`: the two existing cases stay. A missing table adds the bytes once and does not throw. A batch that reports a missing table adds them once.
- `tests/api/public_games.test.js`: the owner sees none of their own; the other account sees the owner's game; a third account sees both.
- `tests/api/truth_search.test.js`: fifty `RegaNN` rows plus Regina. Regina in the Spinward Marches is first, and `Rega49` is past the cap.
- `tests/api/generate_speed.test.js`, `tests/api/builder_sector_generate.test.js`, `tests/api/public_games.test.js`, `tests/api/truth_search.test.js`: `VOYAGE_BEFORE_0013=1` drops `object_byte_charges`, `public_marks`, and the `public_games` column after apply. `d1_migrations` still lists 0013 and 0014. The worker looks at the objects, not that table.
- `directives/contracts/b_public_games.md`: the feed leaves out the caller.
- `directives/contracts/b_builder.md`: the plain add when 0014 is absent.

`apps/api/src/jobs/generate_queue.ts` still calls `chargeObjectBytes` and then writes the settled mark. The `sectorCount` check in that file was already in the working tree and was left as it stood.

The probe is the check, not the error text. D1's wording for a missing table is not a contract in this repo. The 0013 probe is the pattern this tree already ships, and it does not start a batch. The error text is only the safety net for a batch that still says the table is missing.

## Gates
npm test:      pass (1571 pass, 27 skipped, 0 fail)
npm run check: pass
typecheck:     pass
fourth gate:   pass on the charge, the feed, and search. `builder_sector_generate.test.js` fails in both schema states on another lane's one-sector cap. Servers were stopped. Listeners were gone; the ports were in TIME_WAIT only.

| File | With 0013 and 0014 | Without those objects |
|---|---|---|
| object_charge.test.js | pass, 5 tests (the file is in-process; both table states are in it) | pass, same 5 tests, run again |
| public_games.test.js | pass, 22.8 s, ports 18850/19850 then 18851/19851 | pass, 8.1 s, port 18851/19851, objects dropped |
| generate_speed.test.js | pass, 12.8 s, 18846/19846 | pass, 14.0 s, same ports, objects dropped. `objectBytes` was still greater than 0 |
| builder_sector_generate.test.js | fail, 10.9 s, 18836/19836 | fail, 11.2 s, same ports, objects dropped |
| truth_search.test.js | pass, 7.2 s, 18862/19862 | pass, 7.7 s, same ports, objects dropped |

`builder_sector_generate.test.js` line 243 expected 202 and got 400 `validation` / `one_sector`, "The limit is one sector per request." The two-sector box is `makeSectors` Left and Right. The one-sector generate earlier in that test had already returned 202. The same line failed with the objects dropped. `apps/api/src/jobs/one_sector.ts` is untracked. `routes/builder.ts` and the `sectorCount` lines in `generate_queue.ts` are not this pass.

`tests/api/truth_build.test.js` was not edited and was not run. Search is `tests/api/truth_search.test.js`.

## Contract published
contracts/b_public_games.md, contracts/b_builder.md

## Needs from others
- Whoever owns the one-sector cap (`apps/api/src/jobs/one_sector.ts`, `apps/api/src/routes/builder.ts`, the `sectorCount` check in `apps/api/src/jobs/generate_queue.ts`): `tests/api/builder_sector_generate.test.js` fails at the two-sector box in both schema states. Lane C's review prompt names this cap. Not fixed here.

## Questions for Johnny
none
