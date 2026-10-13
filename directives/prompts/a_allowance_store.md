# Lane A — the daily allowance in the store

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your zoomed-out dots report is accepted (store and renderer); it goes out in
version 1.1.8. Lane D adds your two `MapView.vue` calls this turn and does the browser
pass you could not.

## Goal

Lane B built the daily cap: a non-admin account may generate 100 systems a UTC day.
The server now says how many are left. Put that number where Lane D's screens can read
it, kept true after every generate, with no extra request.

## Contract

`directives/contracts/b_builder.md`, section "Daily generation allowance". Read it
whole. In short: `GenerationAllowance` is `{ limit, used, remaining, resetsAt }` in
`packages/shared`; it is on `GET /api/me` (`data.allowance`) and on every generate
answer (`BuilderGenerateDone`, `BuilderJobAccepted`, `SectorGenerateDone`, the preview
body); `limit` and `remaining` are null for an admin; a request over the allowance is
refused whole with 429, `error.code` `generation_allowance`,
`details { code, remaining, limit, resetsAt }`. The field is optional on the schema.

## Build

1. One reactive value, `allowance`, readable by the Build screens: the last
   `GenerationAllowance` the server sent, or null when none has arrived or the person
   is signed out. Say where it lives and why (the builder store, or beside the session
   in `account/session.ts`: that file is **lent to you** for the one field read off
   `GET /api/me`; name the lines).
2. It is replaced by the `allowance` on every generate, preview, Roll again, job
   accept and make-sector answer, and by the `details` of a 429
   `generation_allowance` refusal (which carries `remaining`, `limit`, `resetsAt`).
   An answer without the field leaves the held value alone.
3. A refusal reaches the caller as a typed result the screen can tell from any other
   failure: the code, `remaining`, `limit`, `resetsAt` and the server's sentence. Do
   not reword the sentence. Nothing is written or marked on the map for a refused
   request; no job is followed.
4. Helpers the screen needs, pure and tested: `allowanceCovers(allowance, count)`
   (true for an admin, true when unknown) and `allowanceResetsLocal(allowance)` (the
   reset as a `Date`; the screen formats it). Say in your note what number a
   many-hex request is checked against on the server (the density roll's writes, per
   the contract), because "up to N" on the button may be more than that.
5. After `resetsAt` passes, the held value is stale: on the next read after that
   time, ask `GET /api/me` once and replace it. No timer that runs while nothing is
   on screen.
6. Signing out clears it. Signing in as another account never shows the last
   account's number.

## For Lane D

Write `findings/builder_allowance_store.md`: the value's import path and shape, the
refusal's shape, the two helpers, one usage example each. Lane D starts its allowance
screens from that note and from your report.

## Owned files (this pass)

`apps/web/src/builder/`, lent: `apps/web/src/account/session.ts` (the allowance field
only), `apps/web/src/builder/screen.ts` (the refusal passes through the adapter).
Tests in `tests/web/builder_allowance.test.js`. `directives/reports/a_allowance_store.md`.
Not yours: `workspace/build/`, `views/MapView.vue` (Lane D), `apps/api`, `packages/`
(Lane B).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
store tests over a stub server: the value after `GET /api/me`; after one generate;
after a job accept; a 429 leaves the map and the job state untouched and updates the
value; an admin (nulls); signed out; the stale read after `resetsAt`; a second account.

## Stop rule

Stop when the gates pass and the report and the note are written.

Write `directives/reports/a_allowance_store.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

