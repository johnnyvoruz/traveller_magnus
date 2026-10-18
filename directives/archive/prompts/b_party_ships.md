# Lane B — more than one ship per party: the contract, the schema and the server

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/handoff.md` §275, `directives/contracts/b_public_games.md`, then this file.
No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14)

- "Let's do more than one ship per party, and then how are we looking to share ships
  across the galaxy so we can see everyone's adventures?"
- Asked whether the ships move separately (each with its own track and position, each
  party member aboard one ship or none): **yes.**
- Asked whether other players see one mark per ship, at its own hex, labelled with the
  ship's name: **yes.**
- "All party ships that are published or public should show up on the map ... it shows
  the ship and who's on it."
- A public route shows only legs a ship has finished, never where it is heading: yes.
  "It's really just for flavor, you can't really alter anyone else's game or ship. It's
  sorta just to establish a 'Community' feeling vibe."

## Decided (orchestrator, 2026-10-14; no question open on these)

1. **The party** is a list of ships plus who is aboard each:
   `party.vesselIds` (ordered; the first is the one the screens open on), `party.aboard`
   (member id to vessel id; a member not in it is aboard no ship), `party.memberIds`
   and `party.anchor` as today. `party.vesselId` goes. You name the list's limit in
   `CAMPAIGN_LIMITS` (suggested 20) and say why.
2. **Each ship moves on its own track.** Its position is computed exactly as today's one
   ship's is (`packages/shared/src/public_hex.ts` `whereAreWe`/`positionAt`), once per
   ship. A member aboard a ship is where the ship is; a member aboard none is at
   `party.anchor`.
3. **The public switch stays per game** (`universes.public_games`). A public game
   publishes every ship in `party.vesselIds` that has a publishable hex, under today's
   rules (same non-null `truth_version`, no `~` sector, hex precision only, jump shows
   the system left).
4. **What a public ship shows:** the ship's name and the names of the party members
   aboard it. A record whose visibility is `referee` is never named (the ship is then
   not shown at all if it is itself `referee`; a member who is `referee` is left out of
   the names). Nothing else from the campaign goes public.
5. **One mark per ship** replaces decision 9's one dot and a count. Several ships on
   one hex are still one hex entry carrying a list.
6. Plain CRUD (Johnny's standing rule): a ship taken out of the party, a game switched
   off, a deleted universe each delete their rows. No undo.

## Not this pass (B's next prompt, after Johnny answers)

The public card (the route of finished legs, any public journal entries, who owns the
game), and the example games that show the feature off. Leave a section "Next: the
public card" in the contract that says only what this pass must already guarantee for
it: a **mark id per public ship that is stable for that ship across saves, opaque (not a
`cr_` id, not reversible to one, not the universe id)**, so a later route can open a
card by mark id.

## Do

1. **Write `directives/contracts/b_party_ships.md`.** The settings shape, the limits,
   reading old stored settings, accepting old writes (step 3), the per-ship position
   rule, the public rows, the feed, the leak list, migration order, cost, and "What A
   and D need": for every file in handoff §275's list, what changes there. Plain
   sentences, the same style as `b_public_games.md`.
2. **The schema** (`packages/shared/src/schemas/campaign.ts` `CampaignSettings`,
   `SettingsChange`): the new party shape. A stored settings row written before this
   change (`vesselId`, no `aboard`) **reads** as `vesselIds: [vesselId]` (or `[]`) with
   **every member aboard that ship**, because until now the whole party travelled on it.
3. **A cached 1.2.0 tab must not lose ships.** After the deploy, an open tab still runs
   the 1.2.0 bundle and saves the whole settings object in the old shape. Find out
   first how the 1.2.0 browser parses the settings it reads (strict or not) and what it
   sends on save. Then choose the server behaviour so that an old-shape save **never
   drops a ship or an `aboard` entry** that the stored row holds, and say in the
   contract what that tab sees. Prove it with a test: stored settings with three ships
   and an `aboard` map, an old-shape save from a 1.2.0 client, then the read still has
   all three and the map.
4. **Positions per ship** in `packages/shared/src/public_hex.ts`: a function that returns
   each party ship's publishable hex (keep `publicMarkHex` working for any caller until
   nothing uses it, then delete it in the same pass and say so).
5. **Public rows per ship.** A new migration `apps/api/src/db/migrations/0017_*.sql`
   (check 0016 is still the last) for one row per public ship: the opaque mark id, the
   universe, `truth_version`, sector slug, local hex, the ship's name, the names aboard,
   `updated_at`. The write runs on the same trigger as today
   (`apps/api/src/universe/public_mark.ts`: a save that applied records, settings or the
   clock, game public) and replaces that universe's rows in one D1 batch. **Safe in
   either order:** until 0017 is applied the Worker keeps today's `public_marks`
   behaviour, using the first ship; probe once per isolate like `detectPublicGames`.
   Say in the contract what happens to `public_marks` after 0017 (kept and dropped
   later, or emptied); do not drop a table in this migration.
6. **The feed** (`GET /api/public-games`, `apps/api/src/routes/public_games.ts`): keep
   `hex`, `count` and `name` on every item exactly as today so a 1.2.0 tab still draws
   its dots, and add `ships`: each `{ mark, ship, aboard }` (`aboard` a list of names),
   leaving out the caller's own games as today. Name a cap on ships listed per hex and
   on names per ship, with the count still true. `PublicGamesSector` in
   `packages/shared/src/schemas/public_games.ts` grows to match.
7. **The leak test** (`tests/api/public_games.test.js` and your new tests): the list in
   `b_public_games.md` "What must never appear" still holds, except that ship names and
   the names aboard are now allowed under `ships`. Add: no `cr_` id, no universe id, no
   referee-only name, no ship outside `party.vesselIds`.
8. **The browser compiles.** Changing the type breaks `party.vesselId` in the web files
   of §275. Make only the smallest edit in each so `npm run typecheck` passes and
   nothing on screen changes yet (for example the first ship where one ship is read
   today). List every such edit in the report. **No new screen, no store change beyond
   that:** A and D build those from your contract next.

## Owned files (this pass)

`packages/shared/src/schemas/campaign.ts`, `packages/shared/src/schemas/public_games.ts`,
`packages/shared/src/public_hex.ts`, `packages/shared/src/index.ts`,
`apps/api/src/universe/campaign.ts`, `apps/api/src/universe/public_mark.ts`,
`apps/api/src/routes/public_games.ts`, `apps/api/src/auth/public_schema.ts`,
`apps/api/src/db/migrations/0017_*.sql` (and its `meta` entry if the folder keeps one),
the web files listed in handoff §275 **for step 8's one-line edits only**, tests under
`tests/api/`, `tests/shared/`, `tests/web/` for what you change,
`directives/contracts/b_party_ships.md`, `directives/reports/b_party_ships.md`.

**Do not touch:** the ten parked truth-build files (`jobs/inputs.ts`,
`reconcile_transform.ts`, `truth_build.ts`, `release_seal.ts`, `routes/admin.ts`,
`scripts/dev_make_admin.js`, their three tests, `views/TruthPreview.vue`), `versionvideo/`,
`packages/engines`, the fixtures.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and
`RUN_API_TESTS=1` for `public_games`, the campaign suites and your new suites, pasted.
One run with 0017 applied and one without (the probe path).

## Stop rule

Stop when the gates pass, the contract and the report are written. If the old-tab
problem (step 3) has no answer that keeps every ship, stop there and write it under
Halt & Challenge with the options.

Write `directives/reports/b_party_ships.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: read the 1.2.0 client. `CampaignPage.parse` is strict, so a reload of the new party shape fails closed; an already open tab saves the whole settings object in the old shape. next: schema, per-ship hexes, migration 0017, and the feed.
done: schema, per-ship hexes, migration 0017, the feed, the 1.2.0 merge, and the contract. next: the two worker failures.
done: public_games and campaign pass alone. The 429 miss was the parallel run. The universe cap was six leftover Store proof rows on the local shared D1. next: the report.
done: gates green. Report at directives/reports/b_party_ships.md. next: stop. Do not start b_public_card.
