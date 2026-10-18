# B party_ships report
Prompt: prompts/b_party_ships.md
Status: done

## Changed files
- `directives/contracts/b_party_ships.md`: the contract. Party limit 20. Old rows lift. A 1.2.0 save merges. `pm_` mark ids. `public_marks` stays until a later migration.
- `packages/shared/src/schemas/campaign.ts`: `party.vesselIds`, `party.aboard`. A stored `vesselId` reads as a one-ship list with every member aboard.
- `packages/shared/src/schemas/public_games.ts`: `ships` on each hex. Caps `PUBLIC_SHIPS_PER_HEX` 20 and `PUBLIC_NAMES_PER_SHIP` 20.
- `packages/shared/src/public_hex.ts`: `publicFirstHex`, `publicShips`, `publicMarkId`. `publicMarkHex` is gone.
- `packages/shared/src/index.ts`: exports the new names.
- `apps/api/src/universe/campaign.ts`: a 1.2.0 save keeps stored `vesselIds` and `aboard` when the stored row already has them.
- `apps/api/src/universe/public_mark.ts`: one `public_ships` row per publishable ship, and that universe's `public_marks` row deleted in the same batch. Before 0017, the first ship still writes `public_marks`.
- `apps/api/src/routes/public_games.ts`: the feed adds `ships` when 0017 is present. `hex`, `count`, and `name` stay as they are. `count` is the full ship count.
- `apps/api/src/auth/public_schema.ts`: one probe per isolate for the `public_ships` table.
- `apps/api/src/db/migrations/0017_public_ships.sql`: the table. No drizzle journal entry (the journal stops at 0002).
- `tests/api/party_ships.test.js`: three ships survive an old-shape save; without 0017 the feed has no `ships` key and only the first ship.
- `tests/shared/campaign.test.js`, `tests/shared/public_games.test.js`, `tests/api/campaign.test.js`, `tests/api/public_games.test.js`, `tests/web/workspace_party.test.js`: the new party shape, and ship names allowed only under `ships`.

Screens still open on the first ship. These are the only web edits:

- `apps/web/src/workspace/party.ts`: `leadVesselId`. `withVessel` writes one ship and puts every current member aboard it. That write replaces the list.
- `apps/web/src/campaign/track.ts`: the track reads the first ship, and still accepts a fixture that only has `vesselId`.
- `apps/web/src/campaign/journal.ts`: the journal anchor reads `vesselIds[0]`, then the old `vesselId`.
- `apps/web/src/map/vessel_marks.ts`: the party mark is the first ship.
- `apps/web/src/pack/plan.ts`: the pack ship is the first ship, with the same old-id fallback.
- `apps/web/src/views/OrbitView.vue`: `partyVesselId` is `vesselIds[0]`.

These files in handoff §275 did not need an edit. `map/campaign_layer.ts` takes its own `{ vesselId, anchor }`. `MapView.vue` uses `vesselId` as a hit-test name. `PersonField.vue` and `sheet_people.ts` pass `vesselId` as a crew link. `map/public_games.ts` is Lane A's. It reads `hex`, `count`, and `name`, and ignores `ships`.

## Gates
npm test: pass. 1716 tests, 1686 pass, 0 fail, 30 skipped (the API files). `TEST_EXIT 0`.
npm run check: pass. `manifesto: clean`.
typecheck: pass. `tsc --noEmit -p apps/api`, `TYPECHECK_EXIT 0`.
npm run build: pass. `vue-tsc -b` and vite, 661 modules, `BUILD_EXIT 0`.

`RUN_API_TESTS=1`:

- `tests/api/public_games.test.js`: pass, 25517 ms, including the bare database with `public_games` dropped. `PUBLIC_GAMES_EXIT 0`.
- `tests/api/campaign.test.js`: pass, both tests. `CAMPAIGN_EXIT 0`.
- `tests/api/party_ships.test.js`, `campaign_logic.test.js`, `campaign_entry_images.test.js`: 16 pass, 0 fail. The party-ships file covers 0017 applied (ports 18866/19866) and the table dropped before start (ports 18867/19867). `API_SUBSET_EXIT 0`.

The first combined API run failed two tests. Neither failure was the schema.

- `public_games.test.js` expected 429 and got 200 `{ hexes: [] }` while other wrangler processes were up. Run alone, the same 61 calls return 429. The limiter is unchanged.
- `campaign.test.js` got `Ten universes per account` for `dev-admin` on the shared local D1 (`apps/api/.wrangler/state`). Six live rows were leftover `Store proof …` universes from earlier runs of that test. I set `deleted_at` on those six local rows only. The four that stay are `The Spinward Run` and three named `Imported Game`. No remote database was touched.

## Contract published
contracts/b_party_ships.md

## Needs from others
none

## Questions for Johnny
none

## Next: the public card
Not started. The contract's "Next: the public card" section is the guarantee this pass leaves: each public ship has a `pm_` mark id, stable for that ship across saves, and not a `cr_` id, not reversible to one, and not the universe id.
