# Lane A — two tests that fail under load

Issued 2026-10-16 by the orchestrator. **Start only after Johnny pushes 1.2.4.** You may be a fresh
session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/A.md`, then this file. No git but read-only, no deploy, no `rules/`.

## The faults
1. `tests/web/renderer.test.js`, "draw reports animating while a title fades in, then settles
   (B1.12b)" (line 485). It failed in the full suite in the 1.2.3 rehearsal and once before; it
   passes alone.
2. `tests/web/store_scroll.test.js` failed once in Lane Z's full run on 2026-10-15 and passed alone
   and on the rerun. Which test in it failed was not recorded.

## Do
1. Find what each depends on that changes under load: wall-clock time, real timers, `requestAnimationFrame`, file order.
2. Make each test independent of it: an injected clock or fake timers where the code already takes one, or awaiting the state instead of a fixed delay. **What each test asserts doesn't change.**
3. If the fix needs a change outside `tests/`, for example a clock parameter on `MapRenderer` or the store's scroll memory, don't make it: stop and report what you'd change and where (Halt & Challenge).
4. Prove it: run each file 20 times while the full suite runs alongside (or under a CPU load of your choosing) and give the pass count before and after.

## Gates
`npm test` and `npm run check`.

## Report
Write `directives/reports/a_test_flakes.md` from the template.

**Owned:** `tests/web/renderer.test.js` and `tests/web/store_scroll.test.js` (Lane D's file, named here for this pass), your notes and your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: progress was empty and both test files were clean at 0c387f2 (1.2.4 is HEAD). The fade test waits on setTimeout(10) while MapRenderer steps the title by performance.now() over a 50 ms tFast, so one late timer finishes the fade in a single frame. store_scroll.test.js only reads source. next: pass counts under CPU load, before any edit.
done: before the edit, under 32 CPU burners, renderer.test.js 20/20 and store_scroll.test.js 20/20. A separate 80 ms gap on the old loop finished the fade in one frame (animating false, one pill). The fade test now steps performance.now by a fifth of tFast and restores it. store_scroll left as it is: no timer, no rAF, and the reads are stable on this tree. next: 20 runs under load, then npm test and npm run check.
done: after the edit, under 32 CPU burners, both files 20/20. npm run check clean. npm test 1796 pass, 1 fail, in tests/tools/examples.test.js (not this prompt). next: the report.
done: report written (directives/reports/a_test_flakes.md). next: none, stopped.
