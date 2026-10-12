Found: Progress was empty. The job answer gives `done` as a count and names only failed hexes. `directives/reports/b_generate_density.md` is not written.
Finished: `generate` and `generateGrowing` report a start before the request, with the hex count and nothing done. The progress shape is unchanged. Density is not on the call.
Backed out: nothing.

# Lane A generate density report
Prompt: prompts/a_generate_density.md
Status: done

## Changed files
- apps/web/src/builder/store.ts: the first progress callback is queued as the act starts, before the request. It is `{ total, done: 0, failed: [], skipped: 0, state: 'running' }`. Later callbacks are the job's counts, as before.
- tests/web/builder_store.test.js: that opening callback for a job and for a grow act, and that the progress object has no landed-hex list.
- findings/builder_density_ready.md: five lines for Lane D.

The server does not say which hexes have landed. `directives/contracts/b_builder.md`, `GET /:id/jobs/:jobId`: answer data is `BuilderJob`. `done` is a count. `failures` holds at most 100 `{ hexKey, reason }`. The store does not guess the landed keys, so `JobProgress` has no new field.

Part 2 was not built. There is no `directives/reports/b_generate_density.md` and no copy under `reports/done/`. Density is not sent. There is no left-empty count.

## Gates
npm test: pass. 1396 passed, 16 skipped, 0 failed.
npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: fail, not in this pass.

```
src/workspace/build/OrbitPicker.vue(13,32): error TS2305: Module '"./orbit_pick.ts"' has no exported member 'wrapFocus'.
```

That file is Lane D's. It was not edited here.
fourth gate: pass for the part that could be built. The opening callback fires before the generate POST on both `generate` and `generateGrowing`. Landed keys are not on the job, so they were not added. Density on the three calls, and the left-empty count, wait on Lane B's report.

## Contract published
none

## Needs from others
- Lane B: write `directives/reports/b_generate_density.md` when the density field is on the server. This store will pass it on the next pass.
- Lane D: the bar can use the opening callback (`total` is the hexes named, `done` is 0, `state` is `running`). There is still no list of hexes that landed, and no density option on the call. See `findings/builder_density_ready.md`. The `wrapFocus` build error is in `workspace/build/OrbitPicker.vue`.

## Questions for Johnny
none
