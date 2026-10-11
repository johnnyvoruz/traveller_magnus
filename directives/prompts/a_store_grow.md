# Lane A — the store's one-act generate and its Undo (Lane D is blocked on this)

Issued 2026-10-11 by the orchestrator. The Builder push is made (`8118f72`). **This
comes before `prompts/a_dossier_open_frame.md`**; do that one in the same session
afterwards, each with its own report. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory.

## Goal

Lane B built one server act that makes sectors and generates hexes in them, with one
undo call. Lane D's screen must call it through your store and cannot: `Builder.generate`
(`apps/web/src/builder/store.ts` about 566) cannot send `makeSectors` and parses the
answer as `BuilderGenerateDone`; `Builder.undo` (about 703) knows only the `job` and
`reverts` tokens. Add the two things D asks for.

## Read first

1. `directives/reports/d_grow_one_act.md` (or `reports/done/` if moved), section
   **"What Lane A needs to add (exact)"**: the signature of `generateGrowing`, what
   `accepted` and `finished` resolve with, the key remap, the token, the Undo and the
   Restore. Build to that text. It is the interface D will code against.
2. `directives/contracts/b_builder.md`: "`POST /:id/generate` with `makeSectors`" and
   "`POST /:id/sectors/undo-generate`", and `directives/reports/done/b_sector_generate.md`
   for request and answer examples. Build against the contract, not `apps/api`.
3. `packages/shared/src/schemas/sector.ts`: `SectorSeed`, `SectorGenerate`,
   `SectorGenerateDone`, `SectorGenerateUndo`, `SectorGenerateUndone`.

## Owned files (this pass)

- `apps/web/src/builder/store.ts`, `screen.ts` (`asBuildStore` passes
  `generateGrowing` through), `types.ts`, `sectors.ts`, `index.ts`
- `tests/web/builder_store.test.js`, `tests/web/builder_sectors.test.js`
- `findings/builder_grow_ready.md`: the final signatures for D, as you did in
  `findings/builder_handle_ready.md`
- `directives/reports/a_store_grow.md`

Not yours: `workspace/` (D's `seam.ts`, `grow_acts.ts`, `acts.ts` stay exactly as they
are), `apps/api`, `packages/`, every shared file.

## What must be true (each with a test against the fake transport)

1. `generateGrowing` makes exactly one `POST .../generate` with `makeSectors`;
   `baseRev` only when there is one hex (0 for a placeholder key).
2. 201 lands the rows; 202 watches the job as `generate` does. On either, the made
   sectors are in `sectors()` before `accepted` resolves, and `keys` maps every
   `~slot_<x>_<y>/<hhhh>` to `<real id>/<hhhh>` by slot.
3. The Undo token is usable as soon as `accepted` resolves, also while the job runs.
   `undo(token)` makes exactly one `POST .../sectors/undo-generate` (`{ sectorId,
   baseRev }` after a 201, `{ jobId }` after a 202) and never `jobs/:jobId/undo`.
4. Undo during a running job: the poll loop ends without throwing, and `finished`
   resolves with state `stopped`.
5. After Undo the made sectors and their hex rows are gone from memory and the
   existing-sector slugs are reloaded.
6. `undo` returns a Restore token built from `SectorGenerateUndone` (one sector undo
   per made sector, one hex revert per existing-sector hex). If that cannot be done
   cleanly, return `null` and say so in the report and the note; do not half-build it.
7. Every server error reaches the caller as the server's own message; a 409
   `That slot is in use.` also adds `details.current` to `sectors()`.
8. The existing `generate` and `undo` behave exactly as before for every existing
   caller (their tests unchanged and passing).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the list of new test names, one per point above.

## Stop rule

Stop when the eight points have a passing test each, the note and the report are
written. Stop early with a blocked report if the contract and D's ask disagree: quote
both lines and do not pick one.

Write `directives/reports/a_store_grow.md` from `directives/reports/_TEMPLATE.md`; under
"Needs from others" give Lane D the final signatures. Then go on to
`prompts/a_dossier_open_frame.md`. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress
done: D's ask and the contract agree (generateGrowing, undo-generate, restore from SectorGenerateUndone). next: add it on the store and screen, with one test per point.
done: generateGrowing, the grow undo, and the Restore are on the store, and the screen passes the handle through. next: one fake-transport test per point, then the gates.
done: eight tests pass, and test, check, typecheck, and build are green. next: the note and the report, then the dossier frame.
done: findings/builder_grow_ready.md and directives/reports/a_store_grow.md are written. next: prompts/a_dossier_open_frame.md.
