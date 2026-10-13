Found: the server sends `GenerationAllowance` on `GET /api/me` and on every generate answer, and a request over the allowance is a 429 that writes nothing.
Finished: that number is on the session, replaced by each generate answer and by a 429, and the Build adapter lets the refusal through.
Backed out: nothing.

# Lane A allowance store report
Prompt: prompts/a_allowance_store.md
Status: done

## Changed files
- apps/web/src/account/session.ts: `session.allowance`, filled from `GET /api/me`. Sign-out clears it and drops a late answer from the previous account. `readAllowance()` asks `GET /api/me` once after `resetsAt`. No timer.
- apps/web/src/builder/allowance.ts: `AllowanceRefused`, `allowanceCovers`, `allowanceResetsLocal`.
- apps/web/src/builder/store.ts: preview, generate, a job accept, and a make-sector answer replace the number when the body has `allowance`. A missing field leaves it. A 429 `generation_allowance` replaces it from the details (`used` is limit minus remaining), throws `AllowanceRefused` with the server's sentence, writes no row, and follows no job.
- apps/web/src/builder/screen.ts: `allowance()` on the adapter. The refusal is not caught.
- apps/web/src/builder/index.ts: exports the class and the two helpers.
- tests/web/builder_allowance.test.js: the helpers; `GET /api/me`; one generate, a preview, a job, a made sector, and an answer that omits the field; a 429; an admin; signed out; a second account; one stale read.
- findings/builder_allowance_store.md: the import paths, the shapes, and one example each. The server reserves the density roll's writes, not every named hex.

The value lives on the session because it is the account's number and `GET /api/me` arrives before any map is open. A copy on one builder would be wrong on the next map, and would vanish when that map closed.

## Gates
npm test: pass. 1486 passed, 0 failed, 20 skipped.
npm run check: pass (`manifesto: clean`)
typecheck: fail. Two errors in `apps/api/src/universe/campaign.ts` (lines 385 and 720): `images` on a journal entry may be `undefined`, and the assigned type does not allow that. This pass did not edit that file. The web build's `vue-tsc` passed.
npm run build: pass (`vue-tsc -b && vite build`)
fourth gate: pass. The store tests above cover `GET /api/me`, one generate, a job accept, a 429 that leaves the row and the job empty and updates the number, an admin's nulls, signed out, the stale read (one extra `GET /api/me`), and a second account.

## Contract published
none

## Needs from others
- Lane D: `findings/builder_allowance_store.md`. Read `readAllowance()` or `allowance()` on the adapter. Catch `AllowanceRefused`. The seam type does not list `allowance()`.
- Lane B: none for the allowance. `npm run typecheck` is red in `apps/api/src/universe/campaign.ts` on the journal `images` field.

## Questions for Johnny
none
