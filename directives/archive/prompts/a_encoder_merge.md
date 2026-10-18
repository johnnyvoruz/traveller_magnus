# Lane A — one image encoder (decided)

Issued 2026-10-17 by the orchestrator. Read `CLAUDE.md`, `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/A.md`, your report `reports/done/a_shared_encoder.md`, then
this file. No git but read-only, no deploy, no `rules/`.

## Decided (your question 1: yes, your recommendation)
- Export `encodeWebp` and `sha256Hex` from `campaign/images.ts`. Delete the copies in
  `workspace/market/cover_image.ts` and import yours. Keep `COVER_LIMITS` and `COVER_QUALITIES` in the
  cover file.
- The cover path then tries `OffscreenCanvas` first and falls back to the document canvas. A bitmap
  with no pixels returns null; the cover path treats null as "this image can't be used" with the
  sentence the cover editor already shows for a refused file (find it; don't write a new one).
- A test that the store's cover and the record gallery call the same function, and one for the null case.
- `cover_image.ts` is Lane D's; check the board: if D's current prompt still names `market/`, wait
  until D's report is filed, or touch only the import lines and the deleted copies.

## Gates
`npm test`, `npm run check`, the typecheck and `npm run build`.

## Report
`directives/reports/a_encoder_merge.md` from the template. **Owned:** `campaign/images.ts`; the import
lines and the deleted copies in `market/cover_image.ts`; tests under `tests/web/`; your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: exported encodeWebp and sha256Hex; cover_image imports them and the local copies are gone. COVER_LIMITS and COVER_QUALITIES stayed. next: the two tests, then the gates.
done: encoder_merge.test.js — null bitmap, and cover plus gallery share that encoder. Both passed alone. npm test 1879 pass, 0 fail. check clean. typecheck pass. next: npm run build.
done: npm run build passed (vue-tsc and vite). Report written. next: none, stopped.
