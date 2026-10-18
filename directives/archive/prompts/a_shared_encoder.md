# Lane A — one image encoder, and test suites that can run side by side

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`, then this file. No git but
read-only, no deploy, no `rules/`.

## 1. Two copies of one encoder
`apps/web/src/campaign/images.ts` has `encodeWebp` and `sha256Hex`; Lane D's
`apps/web/src/workspace/market/cover_image.ts` carries its own copies.
- Export both from `campaign/images.ts` with a one-line comment each. Behaviour unchanged.
- In `cover_image.ts`, delete the copies and import yours. **That file is Lane D's; this prompt names
  it for the import lines and the deleted copies only.** Lane D is working in `market/` this turn:
  touch nothing else in that folder.
- If the two copies differ (quality, size limits, a fallback), don't merge them: stop and list the
  differences (Halt & Challenge).
- A test that the store's cover path and the record gallery use the same function.

## 2. Suites that collide when two lanes run them at once
On 2026-10-16, `tests/tools/examples.test.js` "the seeding dry run names each cover" failed in one
lane's full run while another lane's full run was going. It passes alone. It starts wrangler on the
fixed port 8872 against the shared `findings/examples/standin_covers`.
- Give it a free port at run time and a throwaway copy of the stand-in under the OS temp folder,
  removed afterwards. What it asserts doesn't change.
- Search `tests/` for every other fixed port or shared state folder used by a test that runs in plain
  `npm test` (not the `RUN_API_TESTS=1` suites, which take a port per lane). List them, and fix each
  the same way.
- **Prove it:** run `npm test` twice at the same time, three times over, and give the results.

## Gates
`npm test`, `npm run check`, the typecheck and `npm run build`.

## Report
Write `directives/reports/a_shared_encoder.md` from the template.

**Owned:** `apps/web/src/campaign/images.ts`; the named lines of `workspace/market/cover_image.ts`;
`tests/tools/examples.test.js` and any test you fix under item 2 (list them); `tools/examples/seed_production.mjs`
only if the port must be passed in (say so); your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: progress was empty; the owned files were clean. sha256Hex matches. encodeWebp does not: images.ts tries OffscreenCanvas, then a document canvas, and returns null when the bitmap's longest side is under 1 px; cover_image.ts requires a document and only uses that canvas, and it clamps a 0 px side to 1. Not merged. next: isolate the seeding dry run and the shared Vite caches.
done: the dry run copies both states into a temp folder, takes a free port, and deletes the copy. Vite SSR caches (packages, visibility, uwp, version, character sheet) each get their own temp directory. next: one dry run, then the gates and the paired suites.
done: dry run passed alone. check and typecheck passed. build failed in AccountPage.vue (another lane). Paired npm test: rounds 1 and 2 failed on store and account markup being edited; round 3 was 0 fail both sides. The dry run passed in all six. Report written. next: none, stopped.
