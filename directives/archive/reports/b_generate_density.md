# Lane B generate density report
Prompt: prompts/b_generate_density.md
Status: done

Found: the contract, the roll, and the job fields were already in the tree; the worker subsector had not passed.
Finished: a subsector at each density, one hex always written, absent density writes all, leftEmpty and placed, and a new sector that can roll empty.
Backed out: nothing. Sending one queue message per slice was tried. Under two local workers the later slices never ran, so the job is one message that posts every 32 hexes.

## Changed files
- directives/contracts/b_builder.md: density, leftEmpty, placed, and `?since=` on both generate sections
- packages/generation/src/density.ts: `densityKeeps` and `rollHoldsSystem` (new)
- packages/generation/src/index.ts: exports those two
- packages/shared/src/schemas/builder.ts: `GenerateDensity`, `leftEmpty`, `placed`
- packages/shared/src/schemas/sector.ts: density and `leftEmpty` on the sector generate answer
- packages/shared/src/index.ts: exports `GenerateDensity`
- apps/api/src/routes/builder.ts: rolls one hex inline; enqueues a longer job
- apps/api/src/jobs/generate_queue.ts: one message posts every 32 hexes and resumes from the counted hexes
- apps/api/src/universe/hexes.ts: `leftEmpty` and `placed` on the job; the count closes the job
- tests/generation/density.test.js: absent density is every; the three chances leave a subsector partly empty (new)
- tests/api/builder_logic.test.js: a batch records leftEmpty, placed, and `since`
- tests/api/builder_density.test.js: worker subsector at each density (new)

## Gates
npm test:      pass (1409 pass, 0 fail, 17 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass
fourth gate:   builder worker files, `RUN_API_TESTS=1`, concurrency 2: 25 pass, 1 fail. The fail was `EPERM` deleting `voyage-sector-gen-*` after the assertions in `builder_sector_generate.test.js`. That file alone then passed. Density passed in the suite. Ports 18831–18836 and 18841 were not listening afterward.

## Contract published
directives/contracts/b_builder.md

## Needs from others
- Lane A and Lane D: field `density`
- values `every` | `sparse` | `standard` | `dense`. Absent means `every`. Labels: "Every hex", "Sparse (2 in 6)", "Standard (3 in 6)", "Dense (4 in 6)"
- count `leftEmpty` (hexes the roll did not write). `skipped` is still "already held a system"
- Lane D: `placed` is the hex keys written, in order. `GET .../jobs/:jobId?since=<n>` returns the keys after the first n writes. `since` must be digits. A toast that treats `done` as "systems generated" also counts skipped, failed, and left empty. Use `placed.length` for systems that landed.

## Questions for Johnny
1. A generate job is one queue message. It posts every 32 hexes. A retry continues from the hexes already counted, so it does not repeat a posted slice. Stop, Undo, and the counts match the contract: `done` includes `leftEmpty`, and Undo restores only written hexes. I recommend keeping this until `prompts/b_generate_speed.md` measures a split. One message per slice is what that prompt can still do later. It does not work on the local broker today: with two wrangler processes, a job's second and third messages never ran and the job stayed at 32 of 80. The other measured limit is the product, not the broker. `UniverseDO` allows 120 mutations a minute, and each post is one. Posts of 4 hexes returned `Too many requests.` on the fifth subsector (the job stuck at 68 of 80). Thirty-two hexes a post keeps that test under the budget, and stays under the transaction cap of 64.
