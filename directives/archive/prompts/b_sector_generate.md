# Lane B — build "make a sector and generate in it" as one act with one Undo

Issued 2026-10-10 by the orchestrator. Johnny said yes to this build at 19:45. You are a fresh session with no
memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/B.md`, then this file. No git but read-only, no deploy, no `rules/`,
no Traveller rule from memory.

## Goal

Lane D's Build screen lets a person select hexes in an empty sector slot and press
Generate. That must make the sector and the systems as one act, and one Undo must take
both back. Your contract `directives/contracts/b_builder.md`, section "Proposed, not
built", describes two routes for **one** new sector:

- `POST /api/universes/:id/sectors/generate` (schema `SectorGenerate`)
- `POST /api/universes/:id/sectors/:sectorId/undo-generate` (body `SectorRev`)

**Lane D has since built the screen and needs more than that** (its report,
`directives/reports/done/d_select_hexes.md`, "Needs from others"): a box can hold hexes
in existing sectors **and** in several empty slots at once, and the whole box must be
one job with one undo token. D suggests `makeSectors: [{ slot, name }]` on the existing
generate body. Today D's `apps/web/src/workspace/build/grow_acts.ts` makes two calls and
its Undo is two calls that can stop part way; read that file to see what it sends.

So, in this order:

1. **Contract first.** Rewrite the "Proposed, not built" section of
   `contracts/b_builder.md` as one act that covers: hexes in existing sectors, hexes in
   one or more new sectors (each with slot and name), one job (or inline for one hex),
   one undo call that takes back every hex written and every sector made, and an undo
   of that undo. Say how the client names a hex in a sector that does not exist yet.
   Prefer extending `POST .../generate` as D suggests if the code allows it; keep your
   two-route shape only if it can carry the whole box. Append a Progress line when the
   contract section is written, so Lane D can read it while you build.
2. **Then build exactly what the contract now says.** If it cannot be done as written,
   stop and report; do not change the shape silently.

## Owned files (this pass)

- `packages/shared/src/schemas/sector.ts` (add `SectorGenerate` and its answer),
  `packages/shared/src/index.ts` only if the export list needs the new names
- `apps/api/src/routes/builder.ts`, `apps/api/src/universe/sectors.ts`, and
  `apps/api/src/universe/UniverseDO.ts` or `hexes.ts` only where the one history
  payload needs it
- `tests/api/builder_sector_generate.test.js` (new) and, for pure logic,
  `tests/api/builder_sector_logic.test.js`
- `directives/contracts/b_builder.md`: move the two routes out of "Proposed, not
  built" into the route list, marked **on disk, unpushed**, with the final shapes
- `directives/reports/b_sector_generate.md`

Nothing in `apps/web`, nothing in `packages/engines`, no change to what any existing
route answers. `packages/generation` is read, not edited: generation goes through the
one code path the existing `POST .../generate` uses.

## What must be true

Read "the sector" below as "every sector this act makes", and the route names as the
ones your rewritten contract section settles on.

1. One local: inline, status 201, the sector row and the hex in one history payload.
   More than one local: status 202 with a `jobId`, the same job kind
   `POST .../generate` makes.
2. If the inline generate throws, no sector row is left behind.
3. `undo-generate` stops the job if it is still running, deletes the hex rows this act
   wrote and marks the sector deleted, keeping the rows on the delete history as
   `POST .../delete` does, so `POST .../sectors/:id/undo` of that delete brings both
   back.
4. A moved sector rev answers 409 `The sector changed.`; a moved hex rev answers 409
   `The hex changed.`; nothing is written in either case.
5. Every error the two existing routes can return is returned here with the same code
   and words. Signed out and non-owner are refused as on `POST .../sectors`.
6. No engine output changes: the golden fixtures and the parity test are untouched and
   pass.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on the new test file and on `tests/api/builder_sector.test.js`, on
your own port and state directory, pasted; stop the server you started.

## Stop rule

Stop when the six points have a passing test each, the contract is updated and the
report is written. Stop early with a blocked report if the job runner cannot be told to
stop a running job from inside the Durable Object without a change outside the owned
files, or if a point above contradicts the code: name the point and the line.

Write `directives/reports/b_sector_generate.md` from `directives/reports/_TEMPLATE.md`.
Under "Needs from others" give Lane D the exact request and answer for both routes.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
- done: contract section rewritten for one box, one job, one undo. next: build SectorGenerate and the two routes.
- done: SectorGenerate, both routes, and the six tests. Gates passed. next: report.
- done: report written at directives/reports/b_sector_generate.md. next: orchestrator.
