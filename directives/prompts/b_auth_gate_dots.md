# Lane B — make the passkey server safe to deploy; a dots fault; then read the public games contract

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Accepted: entry images and the speed pass (both in version 1.1.9) and the
passkey build. **The passkey server is held out of 1.1.9** for the two reasons in
part 1; it goes out when they are fixed.

## 1. The recovery gate (`apps/api/src/auth/recovery_gate.ts`)

It runs on every `/api/*` request that carries a session cookie and does its own D1
read of `session.must_add_passkey`. Two faults:

- **If the Worker is deployed before migration 0012 is applied, that read throws on
  every signed-in request and the whole app answers 500.** A deploy must never depend
  on that order. Make the gate safe: say what you chose (for one, the flag read rides
  on the session lookup the request already makes, and a missing column is treated as
  "not a recovery session" and logged once) and show a test that runs the Worker
  against a database without 0012: signed-in requests still work, passkey routes
  answer a plain refusal.
- **One extra D1 read per request for every signed-in person**, to serve a state
  almost nobody is ever in. Count the D1 reads of `GET /api/me` and of one builder
  read before and after the passkey build, and bring them back to what they were.

Also check the same deploy order for everything else 0012 touches (`user.username` on
`GET /api/me`, the plugins' own reads): with 0012 missing, the three social sign-ins
and every existing route must work as they do at `57ec8d0`. Say what does not.

**Johnny, 2026-10-12: yes, a recovery session may sign out.** Allow
`POST /api/auth/sign-out` for such a session and no other extra route; a test; the
sentence in `contracts/b_auth.md` under "Recovery" changed to match, so Lanes A and D
read it there.

## 2. The dots route when the overview cannot be read

Lane D (`reports/done/d_dots_allowance.md`): when `truth/<version>/overview.json` is
missing or unreadable, the dots routes answer a chart sector as 1,280 dots; the store
keeps that string and the zoomed-out map hides every charted system in it. An answer
must never say "empty" when the server does not know. Choose: an error for that
sector, or `cells: null` meaning "use the chart's own string" (then the contract and
the shared schema change and Lane A's store must treat null so: say which lines).
Prefer the one that needs no browser change, if there is one. Test: overview missing,
overview malformed, one sector absent from the overview.

## 3. Read-only: the public games contract

`directives/contracts/b_public_games.md` was written 2026-10-11 and nothing in it is
built. It is the next server feature. Read it against the board's "Decisions from
Johnny" and the tree as it is now (the allowance, the dots routes, the campaign
schema) and write `findings/public_games_ready.md`: what is decided, what the
contract still marks proposed or open, what has changed under it since it was
written, the migration it needs, and the order you would build it in, with the
browser side named for Lanes A and D. Questions for Johnny in full, recommended
answer first. Build nothing.

## Owned files (this pass)

`apps/api/`, `packages/shared/`, tests in `tests/api/`, `directives/contracts/b_auth.md`
and `b_builder.md` (the sections these change), `findings/public_games_ready.md`,
`directives/reports/b_auth_gate_dots.md`. Not yours: `apps/web/src/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on your own ports, servers stopped after: the passkey suite, the
health suite, the dots suite, and the new no-0012 test.

## Stop rule

Stop when parts 1 and 2 pass and the note and report are written.

Write `directives/reports/b_auth_gate_dots.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: read the gate, the dots route, and the pre-passkey session lookup. next: make 0012 optional and drop the extra session read.
done: the session lookup carries the recovery flag, 0012 missing uses the pre-0012 tables, sign-out is allowed, and a missing overview is 503. next: the four API suites and the other gates.
done: a recovery GET /api/me is 403, and the four API suites plus the other gates passed. next: write the report.
done: the report is directives/reports/b_auth_gate_dots.md. next: stop.

