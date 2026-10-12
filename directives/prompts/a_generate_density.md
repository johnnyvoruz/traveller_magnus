# Lane A — the Builder store carries density and tells the screen which hexes landed

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your roll-again report is accepted. Do `prompts/a_market_types.md` first if it
has no report yet.

## Why

Johnny generated a subsector on the live site: every hex was filled, and he saw
nothing while it ran. Lane B is adding a `density` field to generate
(`prompts/b_generate_density.md`); Lane D is making the run visible
(`prompts/d_generate_feedback.md`). Your store sits between them.

## What to build

1. **Progress the screen can draw.** Today the store's job progress gives total, done
   and failed. Add, from what the server's job answer already carries (read
   `directives/contracts/b_builder.md`, the job routes), the hex keys that have landed
   so far, or if the server gives only counts, say so in the report with the line and
   leave the shape as it is: do not guess which hexes landed. The first progress
   callback fires at once when the act starts, before the first answer, so a bar can
   appear on the frame of the click.
2. **Density. Only when `directives/reports/b_generate_density.md` or its copy in
   `reports/done/` exists**: pass the field through every generate call of the store
   (one hex, many, and with new sectors), default absent, and carry the new
   "left empty" count through progress and the final result. If B's report is not
   there when you reach this, stop after part 1 and say so.
3. Write `findings/builder_density_ready.md`: five lines for Lane D (the option's name
   and values on your call, the new progress fields, the count's name).

## Owned files (this pass)

`apps/web/src/builder/`, `tests/web/builder_*.test.js`, the note,
`directives/reports/a_generate_density.md`. Not yours: `workspace/`, `packages/`,
`apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
tests for the immediate first progress call, landed keys (if the server gives them),
density on each of the three calls, and the left-empty count.

## Stop rule

Stop when the parts that could be built pass and the report is written.

Write `directives/reports/a_generate_density.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: the job answer gives done as a count and names only failed hexes, and B's density report is absent. next: fire the opening progress before the first answer, then the gates.
done: the opening callback is in place and the tests passed. The build fails on Lane D's wrapFocus import. next: the report is written.
