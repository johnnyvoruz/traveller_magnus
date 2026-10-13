# Lane B — three lines in the auth contract, then build the public games server

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your gate fix, the dots 503 and the public games note are accepted. The dots
fix goes out in version 1.1.10; the passkey server goes out in the push after, with
Lane A's two client fixes.

## 1. First, small: `directives/contracts/b_auth.md` (Lanes A and D are waiting)

- **Linked providers.** State the exact body of `GET /api/auth/list-accounts` as this
  server answers it (Lane A reads a bare array of `{ id, providerId }`: right or
  wrong). State the route a **signed-in** person uses to link Google, Discord or X to
  their account, and what `POST /api/auth/sign-in/social` does when called while
  signed in (links, or signs in as someone else). If linking needs a route or an
  option that is not on, turn it on, with a test: a passkey account links a provider,
  then signs in with it and is the same account; a provider already linked to another
  account is refused with a plain sentence.
- **Sign-out needs a JSON body.** A body-less `POST /api/auth/sign-out` answers 415
  (confirmed on production). Lane A is fixing the browser. Write the rule into the
  contract for every better-auth POST, and say whether the Worker should accept a
  body-less sign-out as well (recommended: yes, if it is one small wrapper, so an old
  cached page can still sign out; show the test).
- **The local passkey recipe** (from `reports/done/d_passkey_screens.md`):
  `BETTER_AUTH_URL` is the page's origin, and `wrangler dev --host localhost:<port>
  --local-upstream localhost:<port>` or the verify call answers "Invalid origin".
  Add it to the contract's note. Also say whether that points at a production risk:
  what origin does the Worker see on `traveller.voyage`, and is `rpID`/`origin`
  right there. Do not guess: show the code path.
- `listPasskeys` rows: confirm `createdAt` is in the answer (Lane A will pass it on).

## 2. Build public games, server side

Contract: `directives/contracts/b_public_games.md`. Your note:
`findings/public_games_ready.md`, steps 1 to 5 of "Order to build", exactly:

1. Shared schemas `PublicGamesSetting` and `PublicGamesSector`; migration
   `0013_public_games.sql` (the column, `public_marks`, the index).
2. The pure function from the campaign document to a hex or "do not publish". No new
   Traveller rule. If the contract does not name which leg or field decides a case,
   stop that case and ask; do not invent one.
3. `PATCH /api/universes/:id/public-games`.
4. The mark recomputed after a campaign change that touched records, settings or the
   clock, when public is on. Deleting a universe removes its mark in the same request.
5. `GET /api/public-games?truthVersion=&sector=`: signed in, not owner-only,
   `Cache-Control: private, no-store`, the contract's shape, and **none of the banned
   keys**: a test builds a universe whose every private string is a unique marker and
   asserts no marker is anywhere in any answer another account can get.

Also:

- **Deploy order:** the Worker must behave as it does today if 0013 is not yet
  applied (as you did for 0012): the setting answers a plain 503, the read answers an
  empty sector, nothing else changes. A test.
- **Cost:** the D1 reads and writes added to a campaign save when public is off (must
  be none beyond what the save already does) and when on; the reads for one sector
  load of the feed.
- **Abuse:** a signed-in account polling the feed: say the limit you put on it.
- Mark the contract's sections built as you go, and write what Lanes A and D need at
  its end: the call, when to make it, the shape; the switch's route and errors.

## Owned files (this pass)

`apps/api/`, `packages/shared/`, tests in `tests/api/` and `tests/shared/`,
`directives/contracts/b_auth.md`, `b_public_games.md`,
`directives/reports/b_public_games.md`. Not yours: `apps/web/src/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on your own ports, servers stopped after: the public games suite
(two accounts, on and off, a move, a second game in one hex, different truth
versions, a null truth version, the leak test, no-0013), the passkey suite, health.

## Stop rule

Stop when the gates pass and the report is written, or at a case the contract does
not decide. If part 2 will be long, write part 1 into the contract first and append a
Progress line saying so, so Lanes A and D can read it.

Write `directives/reports/b_public_games.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

