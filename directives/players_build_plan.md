# Players build plan — Epic P, ordered for the lanes

**Status:** PLAN, written 2026-10-17 by the players review session (`reports/x_players_review.md`,
"the report"). The orchestrator turns each step into a stream item. Every finding number (F1 to F28)
and test case number is the report's. Decisions of 2026-10-17 (15:30, 16:55, 17:00) stand; nothing
here re-decides them. The eight open questions are the report's §7; each step says which answer it
waits on, and what to build in the meantime.

**Order.** P1b → P2a → P2b (the leak suite first, then the server) → P3 → P9 → P4 → P5 → P6 → P7 →
P8 → P10. P2a and P1b can run at once (different lanes, different files). P4 to P8 can fan out once
P3 is in; each is one lane.

**Gates for every step:** `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, plus
the step's own. The worker suite (`RUN_API_TESTS=1`, the file named) for every B step.

---

## P1b — the projection, hardened (A) — before P2
Files: `packages/shared/src/players_view.ts`, `tests/shared/players_view.test.js`,
`apps/web/src/pack/plan.ts` (only if a signature changes).
Build:
- `party.memberIds` and `vesselIds` filtered to kept ids; `aboard` keeps a pair only when both are
  kept (F3a).
- `status.track[].from` and `.to`: a record anchor to a hidden record becomes the system anchor
  `locate` finds for it, with `hexKey` and `bodyKey` only, or null (F3b; question 1, recommended
  yes; build the recommended form now, the other is one line).
- `status.cargo[].itemId` and `status.passengers[].personId`: dropped when hidden (F3b).
- `playersObjectHashes` reads `images[].hash` and `images[].thumbHash` of records and entries only
  (F15).
- `playersView(full, options?)` with `options.userId` and `options.handles` (a map of user id to
  handle): a journal entry whose `authorId` equals `userId` keeps `rev`; every entry with an
  `authorId` gains `authorName` (F20; question 4, recommended yes). `CampaignRead`'s journal rows
  may carry `authorId?: string | null` (the DO adds it to `entryFrom` in P2b; the pack passes none).
Tests (all in `players_view.test.js`):
- the three F3 cases (ids filtered; leg to a hidden place; cargo id dropped);
- **the parse test**: for every fixture, the projection with `rev: 0` and `provenance: null` put back
  parses as `CampaignPage` (case 2 in pure form);
- "a link's own visibility is not read; the rule is both ends" (F14, pins today's behaviour);
- "a hash written in a body does not open an object" (F15);
- own-note `rev` and `authorName` (F20);
- the pack agreement (case 33, in `tests/web/player_pack.test.js`).
Done when: the report's probe 1 prints filtered party lists, a system anchor, and `true`.

## P2a — the contract, revised (B; paper) — with P1b
Files: `directives/contracts/b_players.md`.
Build: B2b as queued (playing and archived, 255, archive not remove) **plus the report's §6, items
1 to 17**, each written in `api.md`'s style. The five orchestrator answers of 16:55 are already
decided and go in as decided. The eight questions of §7 are listed under "Questions for Johnny" with
the report's recommendations; the contract is written to the recommended answers and marks each
sentence that would change with "(question n)".
Done when: the orchestrator has reviewed it against the report and Johnny has said yes to P2.
Nothing in P2b starts before that yes, except the leak suite skeleton below.

## P2b — the server (B)
**Part 1, first: the leak suite skeleton.** `tests/api/players_leaks.test.js` with the fixture of
the report's §5 and all 35 cases as named tests; each case's body is the expectation written as
assertions against routes that do not exist yet, so the file fails (not skips) until P2 is built.
`tests/api/players_logic.test.js` for the pure cases (27, 29). Done when the file runs and fails on
every case for the right reason (404 on a missing route is not the right reason: assert the shape).

**Part 2: the data.** Migration `0021_universe_members.sql` (hand-written, as 0003 on):
`universe_members (universe_id, user_id, role, person_id, status, archived_at, archived_by,
created_at, PK(universe_id, user_id))`, `universe_invites (id, universe_id, token, token_hash UNIQUE,
role, expires_at, revoked_at, uses, created_at)`, indexes on `universe_members(user_id)` and
`universe_invites(universe_id)`. `db/schema.ts` in step. Safe in either order with the DO column.
The DO: `installCampaignSchema` adds `author_id TEXT` to `campaign_journal` by the pragma path
the `images` column uses; `entryFrom` reads it as `authorId`; `schemaVersion` stays `'3'`.

**Part 3: the Durable Object.** In `universe/campaign.ts`:
- `readPlayersCampaign(sql, afterSeq, limit, caller: { userId, handles })` → reads every live row,
  runs `playersView` over the whole set, returns projected rows with `seq > after` (merged in seq
  order under the cap, as `readCampaign` does), `settings`, `clock`, `seq`, `done`, and `visible`
  when `seq > after` or `after === 0` (F1, F16, F17). The handle map comes from the Worker (one D1
  query over the universe's members and the owner).
- `applyCampaignChanges(sql, changes, now, acknowledgePublic, member?)` (F2, F4, F6c): with
  `member`, only journal changes; `note`/`players`/`players`; create stores `author_id`; update and
  delete need `author_id === member.userId` **before** the `baseRev` check; the anchor rule; the
  live-notes guard by `author_id`, **65,535 per player** (Johnny 18:40: no 500 cap; the per-minute guards stay).
- In `UniverseDO.fetch`: `GET /campaign/players`, `GET /campaign/seq`; the member value read from
  `x-voyage-member` (set by the Worker only, F5) and passed to `applyCampaignChanges`.

**Part 4: the Worker.** New `routes/players.ts` mounted on `universesRoute`; `universe/forward.ts`
gains `memberUniverse(c)` → `{ row, actor, role: 'owner' | 'member', forward }` and both
`forward`s strip `x-voyage-*` (F5) and check `Origin` on mutations (F21). The member branch of
`GET /:id/campaign`, `PATCH /:id/campaign/changes` and `GET /:id/objects/:hash` in their existing
files (objects: the set from `playersObjectHashes` of the cached projection, keyed by
`(universeId, seq)` with `seq` read per request, F22). Rate limits (F6a, F6b). `cache-control:
private, no-store` (F9). `requestContext` masks `/join/*` and `/claim/*` (F7). Routes: invite
POST/DELETE, players GET, `DELETE …/players/:userId` (archive; self), `PATCH …/players/:userId`
(`{ personId }` or `{ status: 'active' }`), `PATCH …/players/me`, `POST /api/join`,
`GET /api/join/:token`, `GET /api/me/playing` with `truthVersion`. Errors as the contract after §6.
Schemas in a new `packages/shared/src/schemas/players.ts` (`PlayersPage`, `PlayerInvite`,
`PlayerList`, `PlayerPerson`, `JoinClaim`, `JoinPreview`, `PlayingList`).

Done when: all 35 cases pass, `test:api:all` is green, `typecheck` clean, and the report's §3
matrix is re-read cell by cell against the code (B writes "checked" per row in its entry).
Waits on: questions 2, 3, 4, 5, 7, 8 (build the recommended answers; each is a one-line change if
Johnny says otherwise).

## P3 — the client store (A) — after P2b
Files: `apps/web/src/campaign/membership.ts` (new), `campaign/store.ts`, `campaign/read.ts`,
`campaign/commit.ts`, `workspace/campaigns.ts`, `tests/web/membership.test.js` (fake transport, the
`characters_client` pattern).
Build: `role` on the open campaign (`owner` | `player`); `playing` from `GET /api/me/playing`
(name and `truthVersion`; the map pins to it); opening a "Playing in" campaign reads `…/campaign`
through the same `loadPages` and parses `PlayersPage` (rows have no `rev` but own notes; the store
keeps `rev` 0 for the rest and refuses to commit them); **`visible` reconciliation**: on a page that
carries `visible`, delete every held record, link and entry whose id is not listed (F1); on 403
`not_a_member` or 404 the store clears rows, sets `status` to a new `'gone'`, and the panel shows
"You are not in this campaign." (F23); the change builders refuse everything but a players note when
`role === 'player'` (so the UI cannot even try); `join(token)`, `invitePreview(token)`, the invite
calls, `leave()`, `setPerson(id)`.
Tests: a row made referee leaves the store on the next page; a 403 clears and stops; a player
cannot build a record change; own-note edit sends `baseRev` from its `rev`.

## P9 — polling (A) — right after P3 (it is small and P6 needs it)
Files: `campaign/read.ts` or `campaign/poll.ts` (new), `platform/browser.ts`, `tests/web/poll.test.js`.
Build: a 30 s `after` poll while the panel is open and `document.visibilityState === 'visible'`;
stops on close, on hidden, and on `'gone'`; both roles; no toast; lists do not jump.
Test: the timer stops when hidden and after a 403.

## P4 — the join page (E) — after P3
Files: `apps/web/src/characters/screens/JoinPage.vue` (new, beside `ClaimPage.vue`), `router.ts`,
`tests/web/join_page.test.js`, `apps/web/index.html` (the referrer meta, if C's L1 has not added it).
Build: `/join/:token`: on mount read the token, `history.replaceState` to `/join` (F7); the brand;
"You're invited to <campaign>" from `GET /api/join/:token` (the name and the referee's handle);
signed out → the sign-in card and return to the same page with the token kept in memory; signed in →
**Join**; then "Which one is you?" from the projected party's people, or "Not yet"; then
`/?panel=campaign`. The five refusals in the claim page's words plus "The referee archived you from
this campaign." (question 2). Google style.
Tests: the four states as `characters_screens`; the URL is `/join` after mount; shots at 1600 and 390.

## P5 — the referee's players screens (D) — after P3
Files: `workspace/PartyPanel.vue` (a **Players** section), `workspace/players/` (new components),
`workspace/AccountMenu.vue`, `tests/web/players_referee.test.js`.
Build: the link (Make, Copy, Revoke; the expiry); the members in two groups **Playing** and
**Archived** with the handle, their person ("Which one"), and **Archive** / **Bring back**; the
sentence "This campaign has 255 players, the most it can have." only when full; in the campaign
panel header **"View as players"**: runs `playersView` on the full store in the browser, a kicker
banner "You're seeing what players see", every control hidden as in P6; "Playing in" under "Your
campaigns" in the account menu.
Tests: SSR with and without a link, with both groups; shots.

## P6 — the player's campaign panel (D) — after P5
Files: `workspace/CampaignPanel.vue`, `workspace/RecordPage.vue`, `workspace/PartyPanel.vue`,
`workspace/journal/*`, `shell/Rail.vue`, `tests/web/players_panel.test.js`.
Build: when `role === 'player'`: Records lists the projection (no Add, no Publish, no type change,
no visibility switch); the record page read-only with "For players" shown as the record's body;
Party read-only with "Where are we" and "Your ship"; Journal lists players and public entries with
**Add a note**; Timeline as today; no Build on the rail (`lockedGuest`, "Build is the referee's").
**Never a count of hidden things** (F24): no "left out" sentence anywhere in the player's panel.
Tests: SSR per tab; "left out" absent; shots at 1600 and 390 for every tab.

## P7 — player notes in the journal (E) — after P6
Files: `workspace/journal/*`, `tests/web/journal_screen.test.js`.
Build: an entry with `authorName` shows "Written by <handle>" and a chip; own notes editable and
deletable by the player (their `rev`); the referee can delete any note (today's delete with
Restore); images off for players; mentions work (a hidden mention already reads "a record").
Test: the journal screen test extended with a player-authored entry and an own-note edit.

## P8 — the map and dossier for a player (A) — after P3
Files: `views/MapView.vue` (the Builder's right-click items and `Select hexes` hidden for a player;
name the lines), `dossier/*` (verify only).
Build and verify in a browser pass with two accounts (the marketplace lane's two-account jig in
`findings/marketplace/`): the party ships, marks and the campaign layer come from the store; the
dossier's "In your campaign" and "Your journal here" show the projection; a hidden place's hex on a
players ship's track shows the hex and no name (question 1).
Test: the MapView test for the hidden items; the browser pass in the entry.

## P10 — help and copy (E) — after P6
Files: `workspace/HelpGuide.vue`, `changelog.ts`, `workspace/RecordPage.vue`, `pack/html.ts`,
`tests/web/help.test.js`, `record_visibility` test.
Build: "Invite your players" and "What players see" (the second names every field the projection
carries: summary, details, "For players", tags, kind, when, place, sheet text, status, images and
captions, link role and notes, settings kinds, the party's place and ships, the clock; F13); the
"Player notes" label becomes "For players" everywhere; a changelog entry.

## P11, P12 — unchanged from the backlog (after the above is live).

---

## What must be true before each step starts
| Step | Before it |
|---|---|
| P1b | nothing |
| P2a | nothing (paper) |
| P2b part 1 | P2a reviewed |
| P2b parts 2 to 4 | Johnny's yes to P2; P1b in the tree |
| P3 | P2b green on all 35 cases |
| P9 | P3 |
| P4, P5, P8 | P3 (P4 also `GET /api/join/:token`) |
| P6 | P5 and P9 |
| P7 | P6 |
| P10 | P6 |

## Questions carried (the report's §7, numbered the same)
1 hidden-place hex on a players ship (P1b, P8) · 2 archived rejoin (P2b, P4) · 3 404 for
non-members (P2b) · 4 `rev` on own notes (P1b, P2b, P3) · 5 member guards (P2b) · 6 marketplace
warning (outside P; Lane Z or D later) · 7 `seq` accepted (P2b) · 8 log masking (P2b).
Each is built to the recommended answer; a different answer is a one-line change named in the step.

**Answered 2026-10-17 18:40 (decisions.md):** all as recommended, except question 5: no 500-notes cap (guard 65,535 per player; the per-minute guards stay). Johnny said yes to P2.
