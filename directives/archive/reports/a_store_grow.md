# A store_grow report
Prompt: prompts/a_store_grow.md
Status: done

## Changed files
- apps/web/src/builder/store.ts: `generateGrowing`, grow undo on `POST .../sectors/undo-generate`, Restore from `SectorGenerateUndone`. A poll page that arrives after that undo does not write the dropped rows back. `generate` is unchanged. `undo` of a job or a reverts token returns null.
- apps/web/src/builder/types.ts: `GenerateGrowingBody`, `GenerateGrowingHandle`, `GrowSectorSeed`.
- apps/web/src/builder/screen.ts: `asBuildStore` returns the handle. Its `undo` still returns `Promise<void>` and drops the Restore.
- apps/web/src/builder/sectors.ts: `adopt` and `forget` on `SectorBook`. `sectors()` does not expose them.
- apps/web/src/builder/index.ts: exports the new types.
- tests/web/builder_store.test.js: eight tests, one per point. No existing test edited.
- findings/builder_grow_ready.md: signatures for Lane D.
- directives/prompts/a_store_grow.md: Progress lines.
- directives/reports/a_store_grow.md: this report.

## Gates
npm test:      pass (1331 tests, 1316 pass, 0 fail, 15 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
fourth gate:   pass. The new tests, in order of the eight points:
1. generateGrowing posts one generate with makeSectors, and baseRev only for one hex
2. a grow answer lands the rows and remaps slot keys before accepted resolves
3. undo of a grow token posts sectors/undo-generate as soon as accepted resolves
4. undo during a running grow job resolves finished as stopped
5. undo of a grow drops the made sector and its rows, and reloads the old slug
6. undo of a grow returns a Restore token, and a bad answer returns null
7. a grow error is the server message, and a taken slot lands that sector
8. generate and its undo still omit makeSectors and return null

`npm run build` also passed (vue-tsc, then vite, 492 modules).

## Contract published
none

## Needs from others
- Lane D: call `generateGrowing` on `asBuildStore`. The final signatures are in `findings/builder_grow_ready.md`. `accepted` gives `{ sectors, keys, undo }`. Undo of that token is one `POST .../sectors/undo-generate`. `Builder.undo` returns the Restore (`Promise<UndoToken | null>`). `asBuildStore.undo` still returns `Promise<void>` and drops it, because `seam.ts` types `undo` as `Promise<void>`. When that seam line is `Promise<UndoToken | null>`, the wrapper should `return builder.undo(token)`. A `SectorGenerateUndone` that does not parse returns null, after the made sectors and their rows are already dropped. `onProgress` is the builder `JobProgress`, not `screenProgress`.

## Questions for Johnny
none
