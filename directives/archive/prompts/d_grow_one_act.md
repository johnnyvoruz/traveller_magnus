# Lane D — "Make the sector and generate" onto the server's one act, with one true Undo

Issued 2026-10-11 by the orchestrator. **Start only after the board says the Builder
push is made** (it changes files that are in that push). You may be a fresh session
with no memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/D.md`, then this file. No git but read-only, no deploy, no `rules/`,
no Traveller rule from memory. Both your reports of 2026-10-10 are accepted.

## Goal

Selecting hexes in an empty sector slot and pressing Generate makes the sector and the
systems. Today `apps/web/src/workspace/build/grow_acts.ts` does that as two calls and
its Undo as two calls that can stop part way. Lane B has built the one act. Move the
screen onto it so Undo is one call and "Undo stopped part way" can no longer happen.

## Contract to read

`directives/contracts/b_builder.md`: the sections "`POST /:id/generate` with
`makeSectors`" and "`POST /:id/sectors/undo-generate`". Build against that file, not
against `apps/api`. The short version, from B's report
(`directives/reports/done/b_sector_generate.md`, which has the full request and answer
examples):

- one `POST .../generate` with `hexKeys` and `makeSectors: [{ name, slot: { x, y } }]`;
  a hex in a sector not made yet is named `~slot_<x>_<y>/<hhhh>`; `baseRev` only when
  there is exactly one hex (0 for a new-slot hex);
- 201 with `jobId: null` for one hex, 202 with a `jobId` for more; `sectors[]` gives
  each made sector's real id, to remap the placeholder keys;
- one `POST .../sectors/undo-generate` (`{ sectorId, baseRev }` inline,
  `{ jobId }` queued) takes back every sector made and every hex written; do **not**
  call `POST .../jobs/:jobId/undo` for this act;
- undo of the undo: one `POST .../sectors/:sectorId/undo` per made sector, and
  `.../revert` per hex that was in an existing sector.

## Owned files (this pass)

- `apps/web/src/workspace/build/grow_acts.ts`, `acts.ts`, `seam.ts`, `sectors.ts`, and
  `BuildPane.vue` or `commands.ts` only where the act's words change
- `tests/web/build_pointer.test.js`, `tests/web/build_sectors.test.js`, or a new
  `tests/web/build_grow.test.js`
- `directives/reports/d_grow_one_act.md`

The call itself goes through Lane A's `apps/web/src/builder/` store. **Read it first.**
If the store cannot send `makeSectors` or call `undo-generate`, do not add it there:
write a blocked report that gives Lane A the exact two functions you need (name,
arguments, answer), and stop. Not yours: `builder/`, `apps/api`, `packages/`, the three
shared files, `views/MapView.vue` beyond what `grow_acts.ts` already calls.

## What must be true

1. A box of hexes in one empty slot, in several empty slots, and across an existing
   sector into empty slots each make one request and show one toast with one Undo.
2. Undo is one request; after it the sectors are gone and existing-sector hexes are as
   they were. The words "Undo stopped part way" are removed with the code that needed
   them.
3. Undo while the job is still running stops it and takes everything back.
4. The toast's Restore after an Undo (if you offer one) uses the undo-of-undo calls
   above; if you do not offer one, say so in the report.
5. Every server error in the contract's list is shown in its own words, none
   swallowed; a 409 leaves the selection as it was.
6. **Only if `directives/board.md`, Decisions, says yes to the menu placeholder:** the
   right-click menu reserves the "Design by hand…" line from the first frame with a
   muted "Checking…" line of the same height, so Remove never moves. If the board does
   not say yes, leave the menu as it is.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own API port and state directory and your own Vite, both stopped
after, shots `kb5_grow_*`: one slot, two slots, across a sector edge, Undo of each,
Undo while running; the network panel or server log showing one request for the act
and one for the Undo.

## Stop rule

Stop when the points hold, the gates pass and the report is written; or blocked, as
above, on Lane A's store.

Write `directives/reports/d_grow_one_act.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 14:00
- The push is made (`8118f72`). Your blocked report is accepted: Lane A is adding
  `generateGrowing` and the undo to the store (`prompts/a_store_grow.md`) to the
  signatures you wrote. **Start again only when the board shows A's store pass
  accepted**; then read `findings/builder_grow_ready.md` for the final signatures.
- Item 6 is **yes** (Johnny, 2026-10-11): build the "Checking…" line.

## Progress
done: read contract and Lane A's store; the store cannot send makeSectors or call undo-generate. Blocked report written with the two functions A needs. next: wait for Lane A, then build grow_acts.ts/acts.ts onto them.
done: built on A's generateGrowing (one request, one Undo, Undo while running, Restore when the store gives a token) and the "Checking…" menu line; four gates green; browser pass kb5_grow_* (one request per act and per Undo, from the API log); servers stopped; report written. next: prompts/d_hand_designer_2.md when Johnny says go.
