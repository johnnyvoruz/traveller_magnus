# Lane E e_rail_build_pitch report
Prompt: prompts/e_rail_build_pitch.md
Status: done

Found no half-finished edit of this prompt.
Finished the rail line, the test, `noindex`, and the signed-out browser pass.
Backed out nothing.

## Changed files
- `apps/web/src/shell/Rail.vue`: `onLocked` sets `signInFrom` to `'build'` or `null` before `run('account')`. `signInFrom` is imported from `workspace/account.ts`. Nothing else in that function.
- `tests/web/rail_build_pitch.test.js`: choosing the switched-off Build item sets it, and choosing Campaign clears it. The card stays open in the test, as it does when it is already open.
- `apps/web/public/sheets/meridian-03/index.html`: one tag, the first inside `<head>`: `<meta name="robots" content="noindex">`. Nothing else in that file. The other sheet and the menu are unchanged. The same tag is in `apps/web/dist/sheets/meridian-03/index.html` after the build.
- Shots: `findings/ke10_1440.png`, `findings/ke10_520.png`.

## Gates
npm test: 1640 tests, 1611 pass, 2 fail, 27 skipped. `tests/web/rail_build_pitch.test.js` passed. The two failures are under Needs from others.
npm run check: pass. manifesto clean.
typecheck: pass.
npm run build: pass. `index-BOXdN4_j.js` 176.30 kB (gzip 59.22 kB).

Browser, stopped after: Vite preview of that build on 127.0.0.1:5198, signed out (the account button was the locked Build item). At 1440 × 900 and at 520 px wide, a click on Build opened the card with "Sign in to use Build. It generates systems on a copy of the map that’s yours." A click on Campaign put back "Keep a private campaign on top of this map: people, places, jobs, your ship. The map works the same without an account." Enter on each focused button did the same.

## Contract published
none

## Needs from others
- Lane C, while the engine step is open: `tests/golden/esm.test.js` "esm profile_regina matches legacy fixture" fails. The profile JSON does not match the fixture. Not touched.
- Lane D: `tests/web/packages_entry.test.js` "the account menu offers My packages while signed in" fails. The signed-in render has no `account-packages` button. `workspace/` was not touched.

## Questions for Johnny
none
