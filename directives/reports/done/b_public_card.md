# B public_card report
Prompt: prompts/b_public_card.md (Fix 1)
Status: done

## Changed files
- `directives/contracts/b_party_ships.md`: section "The public card". The cost sentence now includes a journal-only save.
- `packages/shared/src/schemas/campaign.ts`: journal `visibility` adds `public`. Records and links stay `referee` or `players`. `Universe.showReferee` is optional.
- `packages/shared/src/schemas/public_games.ts`: `PublicGamesSetting.showReferee` is optional. `PublicShipMark.example` is optional. `PublicShipCard`, `PublicFinishedLeg`, `PublicJournalNote`, and the card caps.
- `packages/shared/src/public_hex.ts`: `publicFinishedLegs`, `publicCardJournal`, `fitPublicCard`.
- `packages/shared/src/index.ts`: exports those names.
- `apps/api/src/db/migrations/0018_public_cards.sql`: `universes.show_referee`, `universes.example`, and `public_cards`. No drizzle journal entry (the journal stops at 0002).
- `apps/api/src/auth/public_schema.ts`: one probe per isolate for the `public_cards` table.
- `apps/api/src/routes/public_ships.ts`: `GET /api/public-ships/:mark`.
- `apps/api/src/index.ts`: mounts that route.
- `apps/api/src/routes/public_games.ts`: signed-out feed after 0018, `example` on each ship, rate limit by user id or `CF-Connecting-IP`, and `showReferee` on the public-games PATCH.
- `apps/api/src/routes/universes.ts`: `showReferee` on the owner's list and game when 0018 is present. Owner campaign responses rewrite journal `public` to `players` unless the request sends `X-Voyage-Journal: public`.
- `apps/api/src/universe/campaign.ts`: a journal write that says `players` keeps a stored `public`, unless that same header is present.
- `apps/api/src/universe/public_mark.ts`: the same batch writes `public_cards`. A journal-only save refreshes it. Delete removes the card rows.
- `tests/api/public_card.test.js`: the card with 0018 (ports 18868/19868) and with `public_cards` dropped before start (ports 18872/19872).
- `tests/api/public_games.test.js`: a signed-out feed is `200` `{ hexes: [] }` once 0018 is applied.
- `tests/shared/public_games.test.js`, `tests/shared/campaign.test.js`: finished legs, public notes, and the visibility split.

The only web edit on the first pass is `apps/web/src/workspace/timeline.ts`. Fix 1 keeps a stored `public` on that row.

## Fix 1
- `apps/web/src/campaign/read.ts`: `parseRead` drops keys a read schema does not declare. `JOURNAL_PUBLIC_HEADERS` is `X-Voyage-Journal: public`.
- `apps/web/src/campaign/store.ts`: the campaign page request sends that header. The list, the create answer, the rename answer, and each campaign page go through `parseRead`.
- `apps/web/src/campaign/commit.ts`: the changes request sends the same header, and the result goes through `parseRead`.
- `apps/api/src/routes/universes.ts`: a request with that header returns stored `public`, including a conflict's `current`. Any other request still rewrites `public` to `players`.
- `apps/api/src/universe/UniverseDO.ts` and `campaign.ts`: a `players` write stores `players` when the header is present. Without it, a stored `public` stays `public`.
- `apps/web/src/workspace/timeline.ts`: the row keeps `public`.
- `tests/web/campaign_read.test.js`: unknown keys drop on the four read shapes. Write schemas stay strict.
- `tests/api/public_card.test.js`: both header states, on the same worker.
- `directives/contracts/b_party_ships.md`: "Public journal entries" and "The referee's name".

Campaign export reads the Durable Object directly, so the file already holds stored `public`. It does not use the mask.

`tools/examples/` is unchanged. Tests set `example` with SQL. No admin route sets it.

## Gates
npm test: pass. 1740 tests, 1708 pass, 0 fail, 32 skipped (the API files). `TEST_EXIT 0`.
npm run check: pass. `manifesto: clean`.
typecheck: pass. `tsc --noEmit -p apps/api`, `TYPECHECK_EXIT 0`.
npm run build: pass. `vue-tsc -b` and vite, 673 modules, `BUILD_EXIT 0`.

`RUN_API_TESTS=1`:

- `tests/api/public_card.test.js`: pass, both tests, 23806 ms. `CARD_EXIT 0`. With 0018 the signed-out card returns the finished leg and the public note. A save without the header keeps `public` and a conflict comes back as `players`. With `X-Voyage-Journal: public`, the page and the conflict say `public`, a `players` write clears the card, and a `public` write puts the note back. `showReferee`, `example`, delete, and the 61st signed-out call are unchanged. With `public_cards` dropped before start, the signed-out card is 401, the signed-in card is 503 `Public ship cards are not available yet.`, the PATCH body is `{ public: true }`, and the feed has no `example` key.
- `tests/api/public_games.test.js`: pass, 29666 ms, including the database with `public_games` dropped. `GAMES_EXIT 0`.
- `tests/api/party_ships.test.js`: pass, both tests. With 0017 (ports 18866/19866) and with `public_ships` dropped before start (ports 18867/19867). `PARTY_EXIT 0`.

Two earlier runs failed for reasons that are not the schema.

- The first card run expected one hex and got `{ hexes: [] }`. Day 100 sits inside the unfinished flight, and that flight's destination is another sector, so the feed for Spinward Marches is empty. The fixture clock is day 15, between the finished leg and that flight. The card assertion is unchanged: one finished leg, `Spinward_Marches/1910` to `Spinward_Marches/1911`.
- `public_games.test.js` expected 429 and got 200 `{ hexes: [] }` while `npm run build` was regenerating files. Run alone, the same 61 calls return 429. The limiter is unchanged.

## Contract published
contracts/b_party_ships.md, section "The public card"

## Needs from others
none

## Questions for Johnny
none
