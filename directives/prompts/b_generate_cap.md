# Lane B — a daily cap on generated systems; two hand-form faults; what bounds a job's speed

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Do `prompts/b_keep_crash_dots.md` first if it has no report yet (it is urgent).

## 1. The cap (Johnny, 2026-10-11)

"How do we limit a user to basically select all and just generate 1,000 systems …
for now let's just cap non-admins at 100 systems a day to generate. I could see a bot
running amok on here and driving costs way up." A premium account with a higher
number may come later: make the number a per-account value with a default, not a
constant buried in a route.

Contract first (`directives/contracts/b_builder.md`, a section "Daily generation
allowance"), then code. Built on these answers unless the board's Decisions say
otherwise when you start:

- **Who:** every account that is not an admin (use the role the admin routes already
  check; say which). Admins have no cap.
- **What counts:** every system the server generates for that account, on any of its
  universes: one hex, a preview, "Roll again", a job, a generate with `makeSectors`,
  `filledToo` regenerations. A hex that density leaves empty does not count. Hand
  design, edits, Keep and a one-body profile roll do not count.
- **Undo gives nothing back.** Otherwise generate and Undo in a loop is free.
- **The day** is the UTC calendar day; the count resets at 00:00 UTC.
- **Default allowance 100**, stored so one account's number can be changed later
  without a deploy (a column or a small table; migration `0011`).
- **Over the allowance:** a request that would pass it is refused whole, before
  anything is queued or written: 429 with a stable `details.code` (your name for it),
  `details.remaining`, `details.limit`, `details.resetsAt`, and a sentence in the
  Google developer documentation style that says how many are left and when it resets.
  With density on, count the worst case before the roll and give back the difference
  when the job ends, or roll first and count exactly: choose, and say which.
- **Counting is atomic** against two requests at once (say how: one D1 statement that
  adds and checks, or the account's own counter object).
- **The browser can ask:** the allowance (limit, used, remaining, resetsAt) is on an
  answer the browser already fetches at start (`GET /api/me` is the natural place) and
  on every generate answer, so the Generate sheet can show "63 of 100 left today"
  without a new round trip.
- A job that is already running when the day turns is not cut off.
- The per-request ceiling (1,280 hexes) stays as it is for everyone.

## 2. Two faults Lane D found in the hand form

- `packages/generation/src/hand.ts` `fieldLabel` (about line 200) takes the leaf after
  the first dot, so `star.0.temp` is labelled `0.temp` and a refusal reads "This field
  cannot hold that." where it should read "Temperature cannot hold that." Fix for
  every hand field with a numbered owner; a test over each field id pattern.
- A world's "Roll profile" on a star with no type, subtype or class and none of the
  four numbers **rolled** (Y6A40000); your contract says it answers "Set Type,
  Subtype, and Class." Repro from D: add a star, add a world, give the world to the new
  star, Roll profile. Make the code and the contract agree, the contract's way unless
  you find the contract wrong: then say so and stop on that item.

## 3. Report only: what bounds how fast a job runs

(If `prompts/b_generate_speed.md` exists when you read this, it replaces this part:
write only the last sentence's answer here, about the job that stopped at 68 of 80.)

Johnny asked what settings let the Worker "scale automatically to crunch on system
generation". Do not change `apps/api/wrangler.toml` in this pass. Report, from the
code and the config as they are: how a generate job is cut into queue messages, what
runs in sequence and what in parallel, what the per-universe object forces to be
serial, the consumer settings today (`voyage-generate`: `max_batch_size = 1`, no
`max_concurrency`, `max_retries = 3`; `[limits] cpu_ms = 60000`), measured hexes per
second locally, and what you would change (batch size, concurrency, hexes per message)
with the risk of each. Also say what happened with the job you saw stop at 68 of 80
in your density run, whether it is a fault in the product or in the test, and whether
a person could hit it.

## Owned files (this pass)

`apps/api/` (not `wrangler.toml`), `packages/shared/`, `packages/generation/`,
`tests/api/`, `tests/generation/`, `tests/shared/`, the contract,
`directives/reports/b_generate_cap.md`. No engine file. Not yours: `apps/web`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on your own ports, server stopped: a non-admin generates up to the
allowance, the next request is refused whole with the code and the numbers, nothing
written; two requests at once cannot pass it together; Undo does not refund; an admin
is not capped; the allowance on `GET /api/me`; a changed per-account number is
honoured; the count resets when the UTC day changes (drive the clock, do not wait).

## Stop rule

Stop when the three parts are done and the report is written.

Write `directives/reports/b_generate_cap.md` from `directives/reports/_TEMPLATE.md`.
Under "Needs from others" give Lanes A and D the code, the fields and where the
allowance is read, in five lines. Questions for Johnny written out in full, recommended
answer first. After each meaningful step append one line under Progress: "done: X.
next: Y."

## Progress
