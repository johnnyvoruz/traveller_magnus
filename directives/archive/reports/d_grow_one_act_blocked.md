# D grow_one_act report
Prompt: prompts/d_grow_one_act.md
Status: blocked (on Lane A's store, as the prompt's stop rule says)

Started on Johnny's "go". The board still says the push is not made, but `HEAD` is
`8118f72` (2026-10-11 13:35), whose message and files are the Builder push, and none of
D's files differ from it.

## What was read
- contracts/b_builder.md: "`POST /:id/generate` with `makeSectors`", "`POST /:id/sectors/undo-generate`", "Make sectors and generate, as one Undo".
- packages/shared/src/schemas/sector.ts: `SectorSeed`, `SectorGenerate`, `SectorGenerateDone`, `SectorGenerateUndo`, `SectorGenerateUndone` are there.
- apps/web/src/builder/store.ts, screen.ts, types.ts, sectors.ts.

## Why blocked
- `Builder.generate` (store.ts:566) builds its payload from `hexKeys, edition, generator, roll, filledToo` and `baseRev` only. It cannot send `makeSectors`. It also parses the inline answer as `BuilderGenerateDone`, which would refuse `SectorGenerateDone`, and it gives nothing back for `sectors[]`.
- `Builder.undo` (store.ts:703) knows two token kinds, `job` (`POST .../jobs/:jobId/undo`) and `reverts`. Nothing calls `POST .../sectors/undo-generate`. The prompt forbids the job undo for this act.
- A job's Undo token is minted at the 202, but `finished` resolves only when the job ends, so the screen cannot Undo a running job (point 3).

Nothing was changed in `grow_acts.ts`, `acts.ts` or the tests, because the act would not have a call to make.

## What Lane A needs to add (exact)

### 1. `Builder.generateGrowing` (store.ts), and `BuildStore.generateGrowing` (screen.ts → seam.ts)

```ts
generateGrowing(
    body: {
        hexKeys: readonly string[];          // real keys, and `~slot_<x>_<y>/<hhhh>` for a slot being made
        edition: string;
        generator: BuilderGenerator;
        roll: number;                        // 0 from the screen
        filledToo: boolean;                  // true from the screen, as generateMany
        makeSectors: readonly { name: string; slot: { x: number; y: number } }[];
    },
    onProgress?: (progress: JobProgress) => void,
): {
    stop(): void;
    /** Resolves at the server's 201/202. Rejects with the server's own message, nothing written. */
    accepted: Promise<{
        sectors: OwnSector[];                // from `sectors[]`, the real `~<ulid>` ids
        keys: Record<string, string>;        // each placeholder key -> its real key
        undo: UndoToken;                     // usable at once, also while the job runs
    }>;
    /** Resolves when the job ends (at once for one hex). */
    finished: Promise<{ undo: UndoToken; progress: JobProgress }>;
};
```

- Request: one `POST /api/universes/:id/generate` with the body as given. `baseRev` only when `hexKeys.length === 1` (0 for a placeholder key, otherwise the row's rev, as `generate` does now).
- 201 (`jobId: null`): land `rows`. 202: watch the job as `generate` does, reloading the real slugs.
- On either answer, before `accepted` resolves, add every made sector to `sectors()`, so `list()`, `get()` and `tick()` know them.
- `keys` remaps `~slot_<x>_<y>/<hhhh>` to `<sectors[i].id>/<hhhh>`, matching each sector by its `slot`.
- The token holds `{ sectorId: sectors[0].id, baseRev: sectors[0].rev }` for 201, and `{ jobId }` for 202, plus the slugs to reload.
- Errors: reject with an `Error` whose `message` is the server's `error.message` word for word, as `request()` does now. A 409 `That slot is in use.` should also add `details.current` (a `RefereeSector`) to `sectors()`, so the map shows the sector that took the slot.

### 2. `Builder.undo(token)` for that token, and `BuildStore.undo` unchanged

- Request: one `POST /api/universes/:id/sectors/undo-generate` with `{ sectorId, baseRev }` or `{ jobId }`. **Not** `jobs/:jobId/undo`.
- Call it even while the job is `queued` or `running`. The server stops the job first. The store's own poll loop for that job must end without throwing "The job did not finish.", and `finished` should then resolve with `state: 'stopped'`.
- After the answer:
  - drop the made sectors from `sectors()`, and drop their hex rows from memory;
  - reload the slugs of the hexes that were in existing sectors;
  - bump.
- Answer: `Promise<UndoToken | null>`. The returned token is the Restore: its `undo` makes one `POST .../sectors/:id/undo` `{ toRev, baseRev }` per `sectors[]` entry, then one `POST .../hexes/:key/revert` `{ toRev, baseRev }` per `hexes[]` entry. Those pairs come from `SectorGenerateUndone`. If A would rather not build the Restore, return `null`, and the screen will offer none (I will say so in the next report).
- Errors: 409 `The sector changed.` / `The hex changed.`, and 400 `Already undone.`, reach the screen as the server's message.

With these in place, D's part is small:
- `grow_acts.ts` sends the placeholder keys with `makeSectors`, then selects `keys` on `accepted`.
- `acts.ts` shows one toast with one Undo (and Restore, if A gives the token). The two-call `takeBack`, `grown.undo`, and the "Undo stopped part way" toast are deleted.
- `seam.ts` gains the `generateGrowing` type above.

## Changed files
- directives/reports/d_grow_one_act.md: this report.
- directives/prompts/d_grow_one_act.md: one Progress line.
- No code changed.

## Gates
Not run: no code changed since the step3_close_2 report.
npm test:      not run
npm run check: not run
typecheck:     not run
fourth gate:   not run (no browser pass; no servers started)

## Contract published
none (the shape above is the ask to Lane A, not a contract)

## Needs from others
- Lane A: the two functions above in `builder/store.ts`, and `generateGrowing` passed through `builder/screen.ts` `asBuildStore`. Then D's prompt can run as written.
- Orchestrator: the board's "push not made" line is stale against `HEAD` `8118f72`.

## Questions for Johnny
none new. Point 6 (the "Checking…" line) was not built: the board lists it under "Open with Johnny", not under Decisions.
