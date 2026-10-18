# Stream B — the Worker: players first

Read `streams/README.md` first; it is the loop. Until Johnny stops you. Your entries go to
`reports/b_stream.md`. Your own ports and state as always; nothing against production.

**Area:** `apps/api/` (not `routes/packages.ts`, `installs.ts`, `universe/install.ts`: Lane Z's), the
migrations, `directives/contracts/b_*.md` and the new `b_players.md`, tests under `tests/api/`.

## Queue
- [x] B1 Finish `prompts/b_universes_pin.md` (the pin, `test:api:all`, the collision fixes; skip
  `truth_build`, item 5). Report `reports/b_universes_pin.md`. `test:api:all` skips `truth_build.test.js` (parked, Lane Z (Z2)).
- [x] B2 (orchestrator 16:55, your five questions: 1 yes, store `token` beside `token_hash`, readable only by the owner's routes, never logged, gone on revoke; 2 yes, the cap counts current members; 3 yes, the owner's `PATCH .../players/:userId` `{ personId }` is in P2; 4 yes, that later path; 5 yes, drop every `rev`, and a deleted player note the member could see travels as `deleted: true` on the poll. Write them into the contract. P2 waits on Johnny's review of the contract.) **P0, the players contract (paper only)** — proposal `directives/contracts/b_players.md`. P2 waits on Johnny. `directives/backlog_players_landing_trade.md`,
  **Epic P**: read "What exists", the nine "Decisions" and steps P0 to P3 and P9. Johnny, 2026-10-17:
  "players first". Write `directives/contracts/b_players.md` in `api.md`'s style:
  - the two D1 tables (decision 1), the invite link and its limits (decision 2: 30 days, 12 members,
    revoke, remove);
  - every route of step P2 with method, auth level (owner, member, user), request, envelope and
    errors (`not_a_member`, `invite_expired`, `invite_revoked`, `campaign_full`, `forbidden`);
  - the projection's field list from decision 3, word for word, and that the Worker applies
    `playersView` (Lane A builds it in `packages/shared/src/players_view.ts`) to a member's read;
  - the member's writes (decision 4, journal notes only, `author_id` on `campaign_journal`, enforced
    in the Worker), the member read of objects (decision 6), the join rate limit, the polling read
    (decision 7);
  - migration `0021` safe in either order, and how every route answers before it is applied;
  - Epic P's three questions are **answered (Johnny, 15:30): players write journal notes; 12 players
    per campaign; no second referee in this leg** (keep the role column for later). Write them in as
    decided, not as assumptions.
  Proposal entry: stop the item there. P2 (the build) comes after Johnny's review.
- [x] (released 18:50, Johnny: yes to all nine, except question 5: **no 500-notes cap**; the 10 writes and 60 reads a minute guards stay; the live-notes guard is **65,535 per player**. This item is the build plan's **P2a**: everything below **plus `reports/x_players_review.md` §6, items 1 to 17** (item 5 with 65,535), each in `api.md`'s style, the §7 answers written in as decided (decisions.md 18:40). Proposal entry; the orchestrator reviews it; then P2b part 1, the leak suite skeleton, and on to P2b; Johnny's yes to build P2 is given) — **next, after B4**) B2b **The players contract: no 12-player cap; playing and archived members** — right after B0
  (Johnny 17:00: "What's with the 12 player limit? Maybe we remove that because players might cycle in
  and out of a game, maybe they can be active or archived or some other friendly name, if we have to
  have a limit make it something dumb like 255"). In `contracts/b_players.md`:
  - `universe_members` gains `status` (`active` | `archived`, default `active`) and `archived_at`.
  - The cap is **255 active members** per campaign, a guard, not a design limit. The full sentence
    becomes "This campaign has 255 players, the most it can have." `max_uses` goes (or is 255 and never
    refuses: say which). Archived members don't count.
  - **Archive, not remove:** the owner's `DELETE .../players/:userId` becomes an archive (status
    `archived`): the member loses access at once (reads, notes, images), keeps nothing new, and stays
    listed so their notes keep their name. A member leaving by themselves is archived the same way.
    `PATCH .../players/:userId` `{ status: 'active' }` (owner) brings them back; joining again with a
    live link also reactivates the same row. A true delete of a member row is not offered.
  - Words for the screens (Lane D, P5): "Playing" and "Archived" as the two groups; "Archive" and
    "Bring back" as the actions. Note it in the contract for D.
  - Every route's answer before 0021 still holds; `GET .../players` returns both groups.
  Proposal entry again: Johnny's yes to build P2 is still to come.
- [x] B0 **One command for local development — next after B2** — 16:40. (Johnny 16:30: "what's the one command
  that will do it all … I'm getting 403 and 500 errors"). Today `npm run dev:api` and `npm run dev:web`
  are separate; a fresh local run hits 500s (local D1 behind on migrations; no truth in the local
  bucket) and 403s (`BETTER_AUTH_URL` is the production URL in `wrangler.toml` `[vars]`; wrangler
  rewrites Origin to the route's zone; `__Secure-` cookies don't stick on http). Read
  `findings/signin_setup.md`, the working passkey setup in `findings/passkey_pass_src/`,
  `tests/api/server.js` (how the suites start wrangler), and `apps/web/vite.config.ts`.
  - Root `npm run dev` → `scripts/dev.mjs` (node only, **no new dependency**): applies
    `wrangler d1 migrations apply voyage --local`; starts the Worker and Vite together on fixed local
    ports with every override the browser needs for sign-in (the `BETTER_AUTH_URL` var, host and
    upstream, the proxy's Origin handling) passed on the command line or the environment, never by
    editing `wrangler.toml`'s production values; serves the chart from production's public truth
    (`VOYAGE_TRUTH_API=https://traveller.voyage`, read-only) unless `--local-truth`; prints the one URL
    to open; prefixes each process's output; Ctrl+C stops both cleanly on Windows.
  - If `.dev.vars` lacks `BETTER_AUTH_SECRET`, say so in one sentence and how to add one; never print
    a secret.
  - **Proof, in a browser on that URL:** the map, a hex's dossier, `/packages`, a passkey sign-up and
    sign-in (CDP virtual authenticator), a campaign record created and saved, and no 403 or 500 in the
    console or network log. Shots `findings/ui_design_shots/sb_dev_*`.
  - One line each in the root `CLAUDE.md` Commands table and `directives/README.md` for `npm run dev`
    (quote them in your entry; the orchestrator reviews `CLAUDE.md` changes).
- [x] B3 **The server's error sentences** — 17:25. that reach the screen: Lane E's list with suggested words
  (`reports/e_stream.md`, E2, "For Lane B"). Words only, in your area; Z's routes are a list for Z.

- [x] B0b **`npm run dev` on its own state** — 18:55. (Johnny's first run, 18:45: the app asked the production CDN for
  `truth/vtest/*` and got 404s, because `tests/api/truth_build.test.js` had left a released `vtest` row in the shared
  local D1; the orchestrator deleted it locally): `scripts/dev.mjs` keeps its D1, DO and R2 state in its own folder
  (`--persist-to`, e.g. `apps/api/.wrangler/dev`), so no test run can reach it; and the local current version is the
  production list's newest (a local released row newer than that is ignored or refused, say which). Test in
  `tests/api/dev_command.test.js`. Then tell Johnny in the entry whether his local accounts move to the new folder.
- [x] B4 **Header hygiene, no-store and log masking, on today's routes** — 19:10. (question 8 answered yes 18:40: also mask `/claim/*` and `/join/*` paths in `requestContext`'s log line, `apps/api/src/http.ts`, with a test) (players review F5 and F9; no question touches
  them, and they hold for the owner today): `universe/forward.ts` drops every `x-voyage-*` header from the client before
  it sets its own, and re-sets `x-voyage-journal` from the client's value explicitly (contract §6 item 6); every campaign
  read and write answer carries `cache-control: private, no-store`. Tests in `tests/api/campaign.test.js`: a client
  `x-voyage-user-id` or `x-voyage-worker` never reaches the DO (prove it with a route that echoes what the DO saw, or by
  its effect); the header is on `GET .../campaign`. `test:api:all` green.
- [x] B5 **L5, social previews from the Worker** (`backlog_players_landing_trade.md` Epic L step L5, as written there):
  `apps/api/src/preview_tags.ts`, `tests/api/preview_tags.test.js`. Only when `Accept` prefers HTML; bytes otherwise
  untouched. Lane C wrote the static tags in `apps/web/index.html` (C1): rewrite those, don't add a second set.
- [x] B6 **The byte count's crash window** (board, Known not fixed: a crash between the D1 byte add and the settled mark
  double-counts a universe's bytes): make the add and the mark one D1 batch, or make the add idempotent by key; a test
  that replays the step twice and counts once.
- [x] B2c (19:53) **The players contract: five fixes, then it's the P2b contract** (orchestrator review 19:55 of your P2a against the review's §6; everything else is right): (a) line ~157 and ~148: a member note's `anchor` is `null`, a system anchor, or a record anchor whose id is in the current projection; hidden and missing answer the same 400 (as written, a note on a hex is refused); (b) line ~142: B writes `PlayersPage` in `packages/shared/src/schemas/players.ts` in P2b with the other players schemas (as line ~102 says), not Lane A; (c) line ~127: `visible` also rides on `after=0`; (d) line ~135: say the Worker passes the handle map on the owner's read too, or drop `authorName` from the owner's read (your pick; say which); (e) a build note: `PATCH .../players/me` is registered before `PATCH .../players/:userId`. Your questions: 1 yes (the live Origin sentence; case 35 follows it), 2 yes (leave the pre-0014 fallback). Then mark B2 and B2b done.
- [x] P2b1 (20:00) **P2b part 1, the leak suite skeleton** (`players_build_plan.md` P2b part 1; `reports/x_players_review.md` §5): `tests/api/players_leaks.test.js` with §5's fixture and all 35 cases as named tests, plus a companion to case 14, "a note anchored to a system hex is accepted"; each fails for the right reason (assert the shape, not a 404 on a missing route); `tests/api/players_logic.test.js` for the pure cases (27, 29). Entry lists every case and why it fails today.
- [x] P2b1b (20:41) **Case 29 turns every lane's gate red** (orchestrator 20:30): `tests/api/players_logic.test.js` runs in plain `npm test`, and case 29 ("65536th live note") fails until P2b2 adds `author_id`. Mark it `{ todo: 'P2b2 author_id' }` (or gate it like the worker suite) and remove the todo in P2b2. **First, now.** P2b1 otherwise accepted.
- [x] B5b (20:46) **Link previews parked** (Johnny 20:27, question 25: "not now"): put `apps/api/wrangler.toml`'s `run_worker_first` back to the 1.2.6 line exactly (`git diff` read-only to see it); `preview_tags.ts`, `preview_document.ts` and their test stay, unused; a line at the top of `preview_tags.ts` says it is parked until Johnny turns it on. `test:api:all` green. **Next.**
- [x] SI0 (21:11) **Session ingest, the contract (paper)** (`spec_session_ingest.md` §5 "SI0" and the note at its top: the MCP endpoint is in phase 1; Johnny's answers in `decisions.md` 20:27): `contracts/b_session_ingest.md`. Proposal entry; nothing built. After B5b, before P2b2.
- [x] TS0 (21:15) **Table sets, the contract (paper)** (Z's design and ZT1b; Johnny 20:39: on the account, a D1 table plus R2 objects, chosen per campaign, `/api/table-sets?kind=`, 20 sets and 256 KB, players read the chosen set only): `contracts/b_table_sets.md`. Proposal. After SI0; the server waits until the players server is in.
- [x] P2b2 (21:35) **P2b part 2, the data**: migration `0021_universe_members.sql` (hand-written) with the contract's columns (`status`, `archived_at`, `archived_by`), `universe_invites`, the indexes; `db/schema.ts`; the DO's `author_id` column by the pragma path; `entryFrom` reads `authorId`. Safe in either order. Tests as the plan says.
- [x] P2b3 (21:41) **P2b part 3, the Durable Object**: `readPlayersCampaign` (the whole live set, `playersView`, rows with `seq > after`, `visible`), `applyCampaignChanges(..., member?)` (journal only, note/players/players, author before `baseRev`, the anchor rule, the 65,535 guard), `GET /campaign/players`, `GET /campaign/seq`, `x-voyage-member` read only from the Worker. Also `character/rooms.ts` `openSocket` copies client headers (line ~63): strip `x-voyage-*` there too, as B4 did for the universe door.
- [x] P2b4 (22:59) **P2b part 4, the Worker**: `routes/players.ts`, `memberUniverse` in `forward.ts`, the member branches of campaign read and changes and objects (the projection's hash set keyed by `(universeId, seq)`), the rate guards, every route and error of the contract, `schemas/players.ts`. Done when all 35 cases (and the companion) pass, `test:api:all` is green, and you re-read the review's §3 matrix row by row against the code, writing "checked" per row in the entry.
## Found by me
- [x] BC1 (23:02) **A summary per campaign in the list** (D's DU10 proposal, accepted 22:20): `GET /api/universes` items gain a small summary (the party in words, the campaign date, the record count, last changed) so every campaign card can say them, not only the open one; read from the DO cheaply (one call per universe is too many: say how, e.g. a summary row the DO writes on change, safe in either order). After P2b4 and SI0b. Proposal first if it needs a column.
- [x] SI0b (23:00) **One word in the session ingest contract** (Z's SI5 question 2, decided 22:05): the routes table says `appliedId`; the schema and the export list say `targetId`. Use `targetId`. Note for SI1 (Z's question 3): the "nothing to change" check is a `superRefine` on `Proposal`, not on the update option. After P2b4.
- [x] BC1b (23:37) **The campaign summary, three changes** (your BC1 proposal accepted 23:15 with these): (1) the summary rides in the write's own Durable Object response, no second `GET /campaign/summary` per write; (2) the D1 upsert only when the values changed, at most once a minute per universe (isolate cache); (3) the migration takes the next free number at build time. Revise `contracts/b_campaign_summary.md`, then build it (`test:api:all`).
- [x] SI1 (00:26) **Session ingest, the server** (`spec_session_ingest.md` §5 SI1, `contracts/b_session_ingest.md`; unblocked: P2b is in): tokens, the kill switch, the proposal tables in the DO, the routes and `POST /mcp`, every case the contract lists, worker tests. Migration: the next free number. After BC1b.
- [x] TS4 (00:40) **Table sets, the server** (`contracts/b_table_sets.md`): the D1 table, the R2 objects, `/api/table-sets?kind=`, validation by `validateTableSet` (A's TS1), the 20-set and 256 KB limits, players read the chosen set only. After SI1.
- [x] SI1b (09:52) **Agent access ships off: blocks 1.3.0, first** (orchestrator 2026-10-18 09:40; SI1 accepted): `agentAccessOn` (`auth/tokens.ts` ~80-100) treats no `platform_flags` table, no `agent_access` row, and a read error as **on**, so token minting and `POST /mcp` go live on production the moment 1.3.0 deploys, with no screen and the public API paused over cost. Make all three **off**: only a row with `value = 'on'` turns it on (the admin `agent_access.set` writes it). Update the doc comment, `contracts/b_session_ingest.md` (the kill switch's default), and the tests (`tokens_logic`, `session_ingest`, `mcp`: set the row to `on` where a test needs access; add one that a fresh database refuses `/mcp` and token creation with the paused answer). In your entry, the exact admin call (route and body) Johnny would use to turn it on later. **Also:** `mcp/server.ts:3` imports zod by a relative path into the root `node_modules` (`../../../../node_modules/zod/v4/index.js`); a clean checkout outside the repo layout fails typecheck (the rehearsal did). Import it by package name: `zod/v4` if the MCP SDK accepts that build, or a named dependency alias in `apps/api/package.json` (for example `"zod4": "npm:zod@4.x"`, then `npm install` and the lockfile) — say which and why; `wrangler deploy --dry-run` bundles it. `test:api:all`.
- [x] TS4b (09:57) **A member reads only the owner's set** (orchestrator 09:40; TS4 accepted): `memberMayRead` (`routes/table_sets.ts` ~170) lets an active member read any set id the campaign's `settings.tableSets` names without checking the set belongs to the campaign's owner. Add `row.ownerId === <universe owner>`; a test with a set id from another account refused. Right after SI1b.
- [x] TS4c (10:00) **The table-sets contract matches the owner check** (found): `contracts/b_table_sets.md` still says a member may read any id the campaign names. Say the set's owner is the universe's owner, on the decided line, the GET row, and the migration-order row. No route change.
- [ ] (approved 10:18: build as you proposed, after the freeze) TS4d (10:01) **A campaign should not store another account's set** (found): `PATCH .../campaign/changes` still accepts `settings.tableSets` naming a set the universe owner does not own. TS4b makes a member's GET of that id 404, so the stored choice is a dead pointer and the rollers fall back to the official table. Proposal only: refuse that write. Not built.
- [ ] **FREEZE for push 1.3.0 (orchestrator 2026-10-18 10:20): finish the item you are on, write its entry, release your claims, then start nothing new until the orchestrator removes this line.** (Not an item to tick.)
- [ ] SI1c **Proposals pasted by the referee** (Johnny 10:15, decisions 10:15) — after SI1b and TS4d: `POST /api/universes/:id/campaign/proposals` also accepts the **owner's cookie** (Origin checked), the same body and checks as the agent door, `source.label` "Pasted", **not** gated by agent access (works while it is off), counted against the owner's mutation budget and the per-universe open-batch limit. A member or another account: 403. Tests: owner paste with agent access off is 201; a player 403; a malformed batch 400 with the failing path; contract updated. `test:api:all`. Not for 1.3.0.
