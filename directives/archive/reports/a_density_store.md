Found: the store's generate calls omitted density, and a job's progress counted finished hexes without naming the ones written or the ones left empty.
Finished: density is optional on one hex, many hexes, and generate-with-sectors. Progress and the result name `done` and `placed` apart, and each callback gets the keys written since the last one.
Backed out: nothing. The dots and the daily allowance were not started.

# Lane A density store report
Prompt: prompts/a_density_store.md
Status: done

## Changed files
- apps/web/src/builder/types.ts: `JobProgress` carries `leftEmpty`, `placed`, and `landed`. `GenerateGrowingBody` takes optional `density`.
- apps/web/src/builder/store.ts: `generate` and `generateGrowing` send `density` only when the caller names it. Absent means every. A poll is `GET .../jobs/:jobId?since=<placed.length>`. `landed` is that delta. `placed` is the keys written, in order. `done` still counts written, skipped, failed, and left-empty hexes. A stop answer that omits `placed` keeps the keys already seen.
- apps/web/src/builder/screen.ts: `generateMany`'s callback and finished progress pass `skipped`, `leftEmpty`, `placed`, and `landed` through. The seam type still lists only `total`, `done`, `failed`, and `state`.
- tests/web/builder_store.test.js: opening progress includes the new fields. Density is on the body only when named, for one hex, many, and a grow. A job is polled with `since`, and the callback receives only the new keys. A stop that omits `placed` keeps the keys from the poll. The screen callback keeps the same fields.
- findings/builder_density_ready.md: the stale "density is not on the call" lines are replaced. The field-refusal paragraph and the followed-job paragraph stay.

## Gates
npm test: pass. 1434 passed, 0 failed, 17 skipped.
npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b && vite build`)
fourth gate: pass. Private wrangler on port 18852, inspector 19852, its own persist directory, universe `01M4PXVNNWNMTRCHRP313RRSPV`. Four subsectors through the store, MgT2E top-down, `filledToo` false. `done` is 80 on every one. Systems generated is `placed.length`. The keys handed to the callback, in order, were `placed`. Undo of each job returned null and the first written hex was gone. `stopDev` ran. Port 18852 was down after.

- every, subsector A: done 80, skipped 0, leftEmpty 0, failed [], systems 80. placed: blank/0101 blank/0201 blank/0301 blank/0401 blank/0501 blank/0601 blank/0701 blank/0801 blank/0102 blank/0202 blank/0302 blank/0402 blank/0502 blank/0602 blank/0702 blank/0802 blank/0103 blank/0203 blank/0303 blank/0403 blank/0503 blank/0603 blank/0703 blank/0803 blank/0104 blank/0204 blank/0304 blank/0404 blank/0504 blank/0604 blank/0704 blank/0804 blank/0105 blank/0205 blank/0305 blank/0405 blank/0505 blank/0605 blank/0705 blank/0805 blank/0106 blank/0206 blank/0306 blank/0406 blank/0506 blank/0606 blank/0706 blank/0806 blank/0107 blank/0207 blank/0307 blank/0407 blank/0507 blank/0607 blank/0707 blank/0807 blank/0108 blank/0208 blank/0308 blank/0408 blank/0508 blank/0608 blank/0708 blank/0808 blank/0109 blank/0209 blank/0309 blank/0409 blank/0509 blank/0609 blank/0709 blank/0809 blank/0110 blank/0210 blank/0310 blank/0410 blank/0510 blank/0610 blank/0710 blank/0810
- sparse, subsector B: done 80, skipped 0, leftEmpty 46, failed [], systems 34. placed: blank/1001 blank/1101 blank/1201 blank/1301 blank/1401 blank/1501 blank/0902 blank/1002 blank/1202 blank/1502 blank/1003 blank/1203 blank/1403 blank/1503 blank/1104 blank/1304 blank/1404 blank/1604 blank/1205 blank/1305 blank/1405 blank/0906 blank/1306 blank/0907 blank/1307 blank/1508 blank/1608 blank/0909 blank/1009 blank/1409 blank/0910 blank/1210 blank/1510 blank/1610
- standard, subsector C: done 80, skipped 0, leftEmpty 40, failed [], systems 40. placed: blank/2001 blank/1702 blank/2402 blank/1703 blank/2003 blank/2103 blank/1804 blank/2004 blank/2204 blank/2304 blank/2404 blank/1705 blank/1805 blank/1905 blank/2305 blank/2405 blank/1706 blank/2306 blank/1707 blank/1807 blank/2007 blank/2207 blank/1708 blank/1808 blank/1908 blank/2008 blank/2208 blank/2308 blank/2408 blank/1809 blank/2109 blank/2209 blank/2309 blank/2409 blank/1810 blank/1910 blank/2110 blank/2210 blank/2310 blank/2410
- dense, subsector D: done 80, skipped 0, leftEmpty 32, failed [], systems 48. placed: blank/2501 blank/2601 blank/2701 blank/3001 blank/3101 blank/2502 blank/2902 blank/3002 blank/3202 blank/2503 blank/2603 blank/2703 blank/3203 blank/2504 blank/2604 blank/2704 blank/2804 blank/3004 blank/3104 blank/2605 blank/2705 blank/3205 blank/2506 blank/2806 blank/2906 blank/3006 blank/3106 blank/3206 blank/2607 blank/2707 blank/2807 blank/2907 blank/3007 blank/3207 blank/2508 blank/2608 blank/2708 blank/3008 blank/3108 blank/3208 blank/2609 blank/3209 blank/2610 blank/2710 blank/2810 blank/2910 blank/3010 blank/3110

One hex `blank/2533` at sparse: done 1, leftEmpty 0, skipped 0, placed `blank/2533`. Undo returned null and the row was gone.

## Contract published
none

## Needs from others
- Lane D: `findings/builder_density_ready.md`. Density is on the store's `generate` and `generateGrowing`. The screen's `generateMany` does not take it, because the seam's `generateMany` and `GrowBody` omit it. The callback object carries `leftEmpty`, `placed`, and `landed` at runtime. The seam's `JobProgress` does not list them. `done` counts finished hexes. Systems generated is `placed.length`. Progress arrives in steps of up to 32. `job` and `stopJob` are already optional on the seam. The followed job's runtime progress includes the new fields. The seam's `FollowedJob` progress type does not.
- Lane B: none for density. Part 2 was skipped: `directives/reports/b_keep_crash_dots.md` is not written, and there is no copy under `reports/done/`. Part 3 was skipped: `directives/reports/b_generate_cap.md` is not written, and there is no copy under `reports/done/`.

## Questions for Johnny
none
