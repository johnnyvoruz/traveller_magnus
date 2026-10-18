Found: the one-sector cap was already in the tree. `builder_sector_generate.test.js` still expected 202 for two sectors. `markJobFailed` stored a reason only when a hex key was set. Progress was empty.
Finished: nothing a frozen session had left half-done.
Backed out: nothing.

# Lane B one sector followups report
Prompt: prompts/b_one_sector_followups.md
Status: done

## Changed files
- `tests/api/builder_sector_generate.test.js`: the two-sector box is 400 `validation` / `one_sector`, "The limit is one sector per request." No sector is created, the answer has no job, and `allowance.used` does not move. Left alone and Right alone are each 202. `VOYAGE_BEFORE_0013` is unchanged.
- `apps/api/src/universe/hexes.ts`: `markJobFailed` stores a reason that has no hex key on the job blob as `error`. A reason with a hex key is still one failure row. The failed-hex count does not move when there is no hex key.
- `packages/shared/src/schemas/builder.ts`: `BuilderJob.error` is an optional string, so `GET .../jobs/:id` can return that sentence.
- `tests/api/builder_logic.test.js`: a failed job with no hex key keeps the sentence and an empty `failures` list.
- `directives/contracts/b_builder.md`: the cap, the sentence, the code, the routes, and the three Build actions that can send two sectors.

The route checks in `builder.ts` and the queue check in `generate_queue.ts` were already in place. They were not changed.

## What the Build pane shows

A request the route refuses never becomes a job. The store throws the server message (`apps/web/src/builder/store.ts` `request`). Generate on a selection writes it to `build.error`, which `BuildPane.vue` and the bar show. Create-sectors-and-generate writes it to `growUi.error`, which the pane shows beside the new-sector names. Lane D does not need a new line for that 400.

A job the queue backstop fails is different. The watch treats `failed` as finished and does not throw. `progressOf` copies `failures[].hexKey` and does not read `error`. `jobToast` and `jobLine` count that list. With no failure row the toast does not say the sentence. Lane D should show `BuilderJob.error` when the job ends `failed` and `failures` is empty.

## Gates
npm test:      pass (1585 pass, 27 skipped, 0 fail)
npm run check: pass
typecheck:     pass
fourth gate:   pass. Each file had its own ports. Servers were stopped. No listener left on those ports.

| File | Result |
|---|---|
| one_sector.test.js | pass, 3 tests |
| builder_sector_generate.test.js with 0013 and 0014 | pass, 10.5 s, ports 18836/19836 |
| builder_sector_generate.test.js with `VOYAGE_BEFORE_0013=1` | pass, 11.6 s, same ports |
| builder_density.test.js | pass, 9.8 s, ports 18841/19841 |
| builder_allowance.test.js | pass, 18.3 s, ports 18843/19843 |
| generate_speed.test.js | pass, 12.3 s, ports 18846/19846 |

## Contract published
contracts/b_builder.md

## Needs from others
- Lane D: before the request, say "The limit is one sector per request." for a selection of two prefixes (Generate and Generate with…, including the right-click line) and for Create sectors and generate across two empty slots. A sector or a subsector opened by its address is one prefix and should still be sent. After a job ends `failed` with `error` set and `failures` empty, show that `error`. The 400 path already shows the sentence.

## Questions for Johnny
none
