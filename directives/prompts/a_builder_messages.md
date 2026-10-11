# Lane A — apply the plain-style Builder messages, server sentences and the browser lines that quote them, in one pass

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your belt-around-a-world report is accepted.

## Goal

Johnny's standard for every sentence a person reads is the Google developer
documentation style guide (second person, active voice, present tense, plain words,
say what happened and what to do next, never a raw id or raw JSON). Lane B wrote the
proposed rewording of the Builder's server messages in
**`findings/builder_messages.md`** (a before and after table, about fifty sentences)
and applied none of it, because browser code and tests quote today's sentences.
Johnny said yes to applying it **in one pass, so the tree is never red between
lanes**. That pass is yours.

## Read first

- `findings/builder_messages.md`: the table. It is the source; do not improve on it
  silently. Where a proposed sentence still breaks the standard (a raw id, no next
  step), fix it and mark the row "changed by Lane A" with one line why.
- `directives/reports/done/b_hand_followups.md`, "Needs from others": the browser
  lines that quote today's sentences: `apps/web/src/builder/draft.ts` 131 to 137;
  `tests/web/builder_draft.test.js` 353, 413, 461, 526, 542, 556, 561, 741;
  `tests/web/builder_store.test.js` 435, 967, 973, 974, 986;
  `tests/web/build_grow.test.js` 169, 173, 190, 193; `tests/web/build_hand.test.js`
  194. Line numbers may have moved: find each by its sentence, and grep the whole of
  `apps/web/src` and `tests/` for every old sentence so none is missed.
- `directives/contracts/b_builder.md`: every sentence quoted there changes with it.

## Owned files (this pass)

Yours: `apps/web/src/builder/`, `tests/web/builder_*.test.js`.
**Lent to you for the sentences only** (change a string literal and nothing else; no
logic, no status code, no condition, no field id):
- Lane B's: `packages/generation/src/hand.ts`, `form.ts`;
  `apps/api/src/universe/sectors.ts`, `hexes.ts`, `apps/api/src/routes/builder.ts`;
  `tests/generation/*.test.js` and `tests/api/builder_*.test.js` where they quote a
  sentence; `directives/contracts/b_builder.md` (the quoted sentences only)
- Lane D's: `tests/web/build_grow.test.js`, `tests/web/build_hand.test.js`, and any
  line in `apps/web/src/workspace/build/` that compares against a server sentence
  (list each; if a screen shows its own wording in place of the server's, leave it and
  report it)
Lane B is building the marketplace server in other files (`routes/packages*`, the D1
schema, `packages/shared/src/schemas/package.ts`) and Lane D is in
`workspace/build/` screens: touch nothing of theirs beyond the string lines above. If
`tests/web/build_hand.test.js` line 220 is still red when you start (the star rows
and `classText`), that is Lane D's fix in flight: leave it, and report your gates with
that one named.

## What must be true

1. Every row of the table is applied, or listed as "left as it is" with the reason.
2. The meaning, the status code and the condition of each message are unchanged; a
   test for each changed sentence still proves the same thing.
3. No sentence a person can see holds a raw field id, a raw key or raw JSON; where the
   old one did, the new one names the field by its form label.
4. Browser code that matches a server sentence (for example to pick an action) matches
   by something stabler if the answer already carries one (a code, a field); if it
   does not, it matches the new sentence, and you list each such place for Lane B as a
   candidate for a code later. Add no new server field in this pass.
5. `findings/builder_messages.md` ends with the final table as applied.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted; the whole
suite, since this crosses lanes. Fourth gate: `RUN_API_TESTS=1` on
`tests/api/builder*.test.js` on your own port and state directory, stopped after; and
a grep that finds none of the old sentences anywhere under `apps/`, `packages/`,
`tests/` and `directives/contracts/`, pasted.

## Stop rule

Stop when the table is applied and the gates pass. If the suite cannot be brought
green without changing logic, back out every string change (leave the tree as you
found it) and report which sentence and why. Never leave the tree half-renamed.

Write `directives/reports/a_builder_messages.md` from
`directives/reports/_TEMPLATE.md`, with every lent file listed and its changed lines.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: read the table, the contract quotes, and the live sentences. No half-written pass in these files. next: apply the sentences in hand.ts and form.ts.
done: applied the sentences in hand.ts, form.ts, the API strings, the browser matches, the quoting tests, and the contract. next: run the gates.
done: gates run. check, typecheck, build, and the Builder API tests passed. npm test has one failure in Lane C's orbit_disc_texture.test.js. next: write the report.
