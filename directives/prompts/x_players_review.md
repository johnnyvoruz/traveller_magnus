# One expensive session — players in a campaign: prove it cannot leak, then plan the build

Issued 2026-10-17 by the orchestrator, for a single session on the strongest model available. You may
be a fresh session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/decisions.md`
(every decision; don't re-decide), `directives/backlog_players_landing_trade.md` (Epic P),
`directives/contracts/b_players.md` (Lane B's contract, with its 2026-10-17 17:00 change to playing and
archived members if B has written it in; if not, apply that decision yourself as stated in
`decisions.md`), `directives/data_model.md`, `directives/api.md`, then this file. **Read-only on code;
you write only your report and the files named below.** No git but read-only, no deploy, no `rules/`.

## Why
Today every campaign has one reader, its owner. Epic P lets players in. From then on a referee's
secrets (hidden records, plot notes, images, journal drafts, character sheets) are one bug away from
the people they are kept from. A leak in front of players is the one failure the product can't take
back. Before Lane B builds P2, find every way a player could see, infer or change what they shouldn't,
and turn the plan into steps that make each one impossible and tested.

## Do
1. **Map every path data takes to a browser** for a universe: every Worker route under
   `apps/api/src/routes/` that reads a universe, a campaign, objects, characters, public cards,
   packages, the overview; every Durable Object endpoint (`apps/api/src/universe/`, `character/`) and
   who can reach it; R2 object reads; the Player Pack (`apps/web/src/pack/`); the browser's caches
   (HTTP cache headers, `truth_client.ts`, any in-memory or IndexedDB store, service workers if any);
   the export file; error messages and counts that could reveal hidden things (a 404 vs 403, "3 hidden
   records", ids in URLs, `rev` and `seq` gaps, mention text, link ends, image hashes, timeline dates,
   the party's position, the public ship card's journal lines).
2. **An authorization matrix:** rows = every route and DO call after P2; columns = owner, active member,
   archived member, other signed-in user, signed out, the public card reader. Each cell: allowed or not,
   what it returns, and the line of code (today) or the contract section (P2) that enforces it.
3. **Attack it.** For each role below owner, list every way to get or infer referee-only data or to
   change something they may not, including: replaying an old invite after revoke or archive; an
   archived member's open tab and its poll; racing a visibility change against a read; a record made
   players-visible then hidden again (what did the browser keep?); mentions and links that point at
   hidden records; images reused across records; character sheets attached to hidden people; the
   Player Pack built before a visibility change; the projection's own edge cases (tombstones, `rev`,
   party members hidden, a ship whose track crosses a hidden place); the DO trusting `x-voyage-*`
   headers; rate limits and the 120 writes a minute budget used to deny the referee service.
4. **For each finding:** severity (leak, inference, tamper, denial), the exact fix (file and function,
   or the contract section to change), and **the test that proves it can't happen** (a black-box
   worker test against `wrangler dev`, or a pure test on `playersView`).
5. **The build plan:** rewrite Epic P's steps P1 to P9 as an ordered plan for the lanes (A, B, D, E
   areas as on the board), with the fixes folded in, each step with its files, its tests from step 4,
   and what must be true before the next starts. Mark anything that needs Johnny's word as a numbered
   question with your recommendation.
6. **A leak test suite spec** Lane B can build first, before any P2 route: `tests/api/players_leaks.test.js`,
   every case from step 3, written as test names and expectations (not code), so P2 is built to pass it.

## Write
- `directives/reports/x_players_review.md`: steps 1 to 4 and 6, worst findings first.
- `directives/players_build_plan.md`: step 5, ready for the orchestrator to turn into stream items.
- Changes you'd make to `contracts/b_players.md` as a list in the report (Lane B owns the file).

Take the time it needs. Being thorough here is the point; a short report is a failure.

---

## Answers, written 2026-10-17 by a review session on the strongest model, for the session that runs this prompt next

The hard part is done and written down. **Do not start from zero.** Read these three files first and
treat them as the answer key; your job is to verify, correct and extend, not to rediscover:

- `directives/reports/x_players_review.md` — steps 1 to 4 and 6 of this prompt: 28 findings worst
  first (F1 to F28), the data-path map, the authorization matrix, the attack walk, the 35-case leak
  suite spec, the list of contract changes, and eight questions for Johnny with recommendations.
- `directives/players_build_plan.md` — step 5: P1b, P2a, P2b, P3, P9, P4 to P8, P10, with files,
  tests and gates.
- `directives/contracts/b_players.md` — Lane B's proposal. It still says 12 players; the 17:00
  decision (playing and archived, a 255 guard, archive not remove) and the report's §6 replace that.
  Apply them in your head; do not edit the contract (Lane B owns it).

### Facts you would otherwise spend an hour finding
1. `playersView` already exists: `packages/shared/src/players_view.ts` (Lane A, AP1), with
   `tests/shared/players_view.test.js`. The Player Pack (`apps/web/src/pack/plan.ts`) calls it.
2. The Worker's only guard today is `ownedUniverse` in `apps/api/src/universe/forward.ts`; every
   universe route calls it and answers 404 to anyone but the owner. There is no member anywhere yet.
3. The Durable Object (`apps/api/src/universe/UniverseDO.ts`, `universe/campaign.ts`) reads no user
   id. `readCampaign` returns every row including tombstones; `applyCampaignChanges` answers a stale
   `baseRev` with the stored row in `conflicts[].current` (lines near 586, 673, 680, 757).
4. `forward` copies the client's headers into the DO call and then sets `x-voyage-user-id` and
   `x-voyage-universe-id`; the DO reads `x-voyage-worker` and `x-voyage-journal`.
5. The browser keeps campaign rows in memory only (`campaign/store.ts`); `localStorage` holds ids
   and preferences; there is no service worker and no IndexedDB (grep). Image objects are served
   `private, immutable`; campaign reads carry no `Cache-Control`.
6. `requestContext` in `apps/api/src/http.ts` logs `c.req.path` for every request, including the
   `/join/<token>` page load.
7. All links are written `visibility: 'referee'` (`apps/web/src/workspace/links.ts`) and the
   journal is always `author: 'referee'` (`campaign/journal.ts`); there is no UI for either.
8. The black-box test pattern is `tests/api/campaign.test.js` and `tests/api/characters.test.js`
   (`withDevServer`, `userCookie` by inserting a session row with `wrangler d1 execute`, own ports
   and `VOYAGE_PERSIST_TO`). `RUN_API_TESTS=1` runs them; `npm run test:api:all` runs every suite.
9. To run a probe against the real projection, put the script under `.tmp/` **inside the repo**
   (`@voyage/shared` does not resolve from outside) and run it with Node 24, which strips types.
   The two probes are in the report's §8; probe 1 reproduces F3 in five seconds.

### What is worth your effort (in this order)
1. **Re-run probe 1** and confirm the two lines of output quoted in the report. If the tree has
   moved (Lane A may have shipped P1b), say what changed and whether F3 is closed.
2. **Check the matrix (§3) cell by cell** against the files named in §2.1. Every "today" cell must
   point at a line you read. Correct any cell that is wrong and say which.
3. **Extend the leak suite spec (§5)**: for each of the 35 cases write the exact request (method,
   path, headers, body) and the exact expected status, code and the assertion on the body, in the
   shape `tests/api/campaign.test.js` uses, so Lane B can type it in. Keep the fixture of §5.
4. **Look for findings the report missed.** Candidates it considered and left out on purpose:
   timing side channels (ignored), the universe purge cron (not built), owner account deletion (not
   built). Anything else you find goes in as F29 onward, in the same shape (severity, what, where,
   fix, test).
5. Do **not** redo the build plan unless a finding changes a step; then edit that step in place.

### Traps
- Do not re-decide anything in `decisions.md`; the 16:55 and 17:00 entries are the latest.
- Do not edit code, `rules/`, `js/` or the contract. Your files are the report (append under a
  heading "Verification, <date>") and, if a step changes, the plan.
- The eight questions in §7 go to Johnny through the orchestrator. Do not answer them yourself and
  do not add to them unless a new finding needs one; then write the question in full with a
  recommendation, as the others are.
- A short verification entry is fine; a short report is not. The report is long because leaks are
  the one failure the product cannot take back.
