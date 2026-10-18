# Lane B — publish the Builder's server contract; say what "make a sector and generate" needs

Issued 2026-10-10 by the orchestrator. You are a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory.

## Goal

The browser lanes have been building against notes in `findings/` and against your code
in progress. From now on they build against `directives/contracts/`. This pass writes
the contract for what the server already does for the Builder, and answers one question
Lane D is about to hit. **It is a documentation pass: no route changes behaviour.**

## Owned files (this pass)

- `directives/contracts/b_builder.md` (new; you are its only editor)
- `directives/reports/b_builder_contract.md` (your report)
- Read only: `apps/api/src/routes/builder.ts`, `apps/api/src/universe/` (`UniverseDO.ts`,
  `hexes.ts`, `sectors.ts`, `schema.ts`), `packages/shared/src/schemas/` (`form.ts`,
  `hand.ts`, `sector.ts`), `packages/generation/src/` (`form.ts`, `hand.ts`), `tests/api/builder_*.test.js`,
  and your predecessor's notes `findings/builder_contract_ready.md`,
  `builder_form_ready.md`, `builder_hand_ready.md`, `builder_sector_ready.md`,
  `builder_step3_close_ready.md`.

Do not edit code, tests or the `findings/` notes. If the code and a note disagree, the
code wins in the contract and the disagreement is listed in your report.

## 1. `contracts/b_builder.md`

One file, written from the code as it stands on disk, with for every Builder route:
method and path, who may call it (signed out, owner, admin), the request body, the
response envelope, every error code with when it is returned, and what it does to `rev`.
Then:

- the draft cycle: open, the changes array (order, client ids for `star.add` and
  `body.add`, `<id>.remove`, messages with `holds: false`), Keep, Discard, the conflict
  answer;
- blank (`{ baseRev }` only), design by hand on a charted system, Restore, generate on
  a hand-made system;
- sectors: make, rename, remove, restore, subsector names, own-sector slugs (`~`);
- undo tokens: what each act returns, how long a token lives, what one Undo takes back;
- the shared zod schema name for each body and answer, with its file.

Mark each line **live at `3d28e33`** or **on disk, unpushed**.

## 2. One question for Lane D, answered in the contract

Lane D (`prompts/d_select_hexes.md` item 7) lets a person select hexes in an empty
sector slot and press Generate: the sector is made, then the systems, **as one act with
one Undo that takes both back**. Say, from the code:

- can the server do that today in one call; if not, in two calls with one undo token
  that covers both;
- if neither, write the smallest addition as a proposed route in a section
  "Proposed, not built" (path, body, answer, undo, errors, which files it would touch).
  Do not build it. The orchestrator issues the build as its own prompt after Lane D
  reports what the screen needs.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`: run them and paste
the result lines to show the tree is as you found it (you changed no code). Fourth gate
for this pass: every route in `routes/builder.ts` appears in the contract (paste the
route list from the file beside the contract's headings).

## Stop rule

Stop when the contract and the report are written. Stop early with a blocked report if
`routes/builder.ts` does not pass typecheck as found, or if a route's behaviour cannot
be read from the code and tests without guessing: name the route and the question.

Write `directives/reports/b_builder_contract.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
- done: read lane, board, and this prompt. next: read builder routes, schemas, and undo from the code.
- done: read routes, schemas, undo, and the 3d28e33 diff. next: write contracts/b_builder.md.
- done: wrote contracts/b_builder.md. next: gates, then the report.
- done: gates passed and reports/b_builder_contract.md written. next: stop.
