# Lane A test_flakes report
Prompt: prompts/a_test_flakes.md
Status: partial

Found: progress was empty, and both owned test files were clean at `0c387f2` (1.2.4 is HEAD).
Finished: the title-fade test steps `performance.now` instead of waiting on the wall clock.
Backed out: nothing.

## Changed files
- tests/web/renderer.test.js: "draw reports animating while a title fades in, then settles (B1.12b)" stubs `performance.now` and advances it by one fifth of `tFast` (10 ms of a 50 ms fade) on each frame, then restores the real clock. The assertions are the same. `MapRenderer` already reads the clock through `now()` in `platform/browser.ts`, so no production file changed.
- tests/web/store_scroll.test.js: not changed.

## What the tests depend on
The fade test called `setTimeout(10)` between draws. `subsectorTitles` moves the title by `elapsed / (tFast * 1000)` from `performance.now()`. The first draw only marks the fade as started. The next draw applies the whole gap. A gap of 50 ms or more finishes the fade in that one frame, and `frames >= 2` fails. That is the recorded message, "the fade took more than one frame". A throwaway run of the old loop with a forced 80 ms gap did finish in one frame (`animating` false, one pill). Under 32 CPU burners the old file still passed 20/20: the suite has to delay that timer past 50 ms before it fails.

`store_scroll.test.js` has no timer, no `requestAnimationFrame`, and no clock. It reads `App.vue`, `PackagesView.vue` and `AccountPage.vue` and checks source text. File order cannot change it: each test file runs in its own process, and these three tests share no mutable state. On a stable tree, 20/20 before any edit and 20/20 after, under the same 32 burners. The one failure Lane Z recorded on 2026-10-15 named no assertion. The likely cause is a read while that source was being saved (the file changed again in 1.2.4). A retry would still assert whatever complete text was on disk, so it was left as it is.

## Gates
npm test:      fail (1796 pass, 1 fail, 37 skipped). The owned tests passed in that run. The failure is another file. Paste:

```
test at tests/tools/examples.test.js:109:1
✖ the seeding dry run names each cover (17697.3933ms)
AssertionError [ERR_ASSERTION]: packages/pk_1JMEXKWRVHB3R1PWJ3EZJK7ANP/1/manifest.json is missing from the built state.
1 !== 0
```

npm run check: pass (manifesto: clean)
typecheck:     not run (not a gate of this prompt)
fourth gate:   not run

Load, before the edit: `renderer.test.js` 20 pass / 0 fail, `store_scroll.test.js` 20 pass / 0 fail (32 busy `node` processes).
Load, after the edit: the same, 20/20 and 20/20. Those processes were stopped.

## Contract published
none

## Needs from others
- The seeding dry run in `tests/tools/examples.test.js` ("the seeding dry run names each cover"): `findings/examples/local_covers` is missing `packages/pk_1JMEXKWRVHB3R1PWJ3EZJK7ANP/1/manifest.json`. Not owned here, not changed.

## Questions for Johnny
none
