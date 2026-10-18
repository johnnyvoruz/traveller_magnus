# Lane A shared_encoder report
Prompt: prompts/a_shared_encoder.md
Status: partial

Found: progress was empty, and the owned files were clean.
Finished: the seeding dry run and the Vite SSR caches no longer share a port or a folder.
Backed out: nothing. The two encoders were not merged.

## Changed files
- tests/tools/examples.test.js: "the seeding dry run names each cover" copies `findings/examples/local_covers` and `findings/examples/standin_covers` into one OS temp folder, passes a free port to `--port`, and deletes the copy. The assertions are the same. `seed_production.mjs` was not edited: `--port` is already an argument. The source side still calls `localState` with port 8831, and that write now lands in the copy.
- tests/web/packages_entry.test.js, record_visibility.test.js, uwp_dots.test.js, version_label.test.js: each Vite cache is `mkdtemp` under the OS temp folder, removed afterwards. They had been fixed directories under `.tmp/`.
- tests/web/workspace_character_sheet.test.js: the SSR server had no `cacheDir`, so it used Vite's shared cache. It now has its own temp directory, removed afterwards.
- apps/web/src/campaign/images.ts and apps/web/src/workspace/market/cover_image.ts: not changed.

## Encoder (Halt & Challenge)
`sha256Hex` is the same in both files: copy the bytes, SHA-256, hex.

`encodeWebp` is not the same.

1. Fallback. `campaign/images.ts` returns null when `createImageBitmap` is missing. It scales with `Math.max(width, height)`, returns null when that side is under 1 px, draws on `OffscreenCanvas` and `convertToBlob` when that exists, and otherwise uses a document canvas and `toBlob`. `cover_image.ts` returns null unless both `createImageBitmap` and `document` exist. It divides by `Math.max(1, width, height)`, so a 0 px bitmap still scales, and it only uses a document canvas.
2. Quality and size limits are not inside either function. The record path passes 2048 px, 320 px and quality 0.85. The cover path passes 1600 px, 640 px and the list 0.85, 0.72, 0.6, 0.45. Those stay with the callers either way.

No test that both paths call one function, because that merge was not made.

## Other ports and folders
Plain `npm test` (the `RUN_API_TESTS=1` suites were left alone):

- Fixed port: `tests/tools/examples.test.js` port 8872. Fixed.
- Shared state written by a plain-suite test: the two example folders above, and the five Vite caches above. Fixed.
- `tests/api/account_link.test.js` listens on port 0. `http://127.0.0.1:8787` is an origin string, not a bind.
- `tests/tools/r2_s3.test.js` listens on port 0 and uses a temp directory.
- `tests/api/server.js` port 8799, `characters.test.js` port 8807 and `.tmp/character-api-8807`, and the `.tmp/lane-b-*` folders run only with `RUN_API_TESTS=1`.

## Gates
npm test: see the paired runs. One dry run alone passed (66.9 s).
npm run check: pass (manifesto: clean)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: fail in another lane's file, before Vite ran:

```
src/workspace/passkey/AccountPage.vue(15,20): error TS6133: 'defineAsyncComponent' is declared but its value is never read.
src/workspace/passkey/AccountPage.vue(541,115): error TS2339: Property 'changesOpen' does not exist on type ...
src/workspace/passkey/AccountPage.vue(542,30): error TS2339: Property 'changesOpen' does not exist ...
src/workspace/passkey/AccountPage.vue(542,51): error TS2339: Property 'changesOpen' does not exist ...
```

Paired `npm test`, twice at once, three rounds. The dry run passed in all six. Process exit codes were not captured; the counts are the runner's own summary.

- Round 1: 1822 pass, 9 fail, both processes. The dry run passed. Failures were store and account markup moving while the suites ran (a list shell that now starts with the rail, filter-count tests, the scroll source check, the version line).
- Round 2: 1834 pass, 1 fail, both processes. The dry run passed. The one failure was `version_label.test.js`, "the signed-in account menu ends with the version": the rendered menu has `<!---->` between the What's new button and `</section>`, and the existing pattern does not allow it.
- Round 3: 1835 pass, 0 fail, both processes. The dry run passed in each (100.1 s and 97.5 s).

## Contract published
none

## Needs from others
- Lane E (or whoever has `AccountPage.vue`): `npm run build` fails on an unused `defineAsyncComponent` and on `changesOpen`, which the template uses and the script does not define.
- The round 1 and round 2 failures are the store shell and the account menu changing during the run. Round 3, with those files settled, was clean. Not changed here.

## Questions for Johnny
1. The cover encoder and the record encoder differ in the canvas they use and in a 0 px bitmap. Recommended: export `encodeWebp` and `sha256Hex` from `campaign/images.ts`, delete the copies in `cover_image.ts`, and import them. Keep `COVER_LIMITS` and `COVER_QUALITIES` in the cover file; both functions already take the long side and the quality. On a normal browser the cover then tries `OffscreenCanvas` first and falls back to the document canvas it uses today. A bitmap with no pixels returns null instead of a 1 px image. The hash function is already the same, line for line. I did not merge them.
