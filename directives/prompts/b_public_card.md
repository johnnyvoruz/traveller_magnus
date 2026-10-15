# Lane B — the public ship card, public journal entries, signed-out viewers, example games

Issued 2026-10-14 by the orchestrator. **Start only after `b_party_ships` is accepted**
(the board says so). You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_public_games.md`, `directives/contracts/b_party_ships.md`
(yours, from the last pass), then this file. No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14)

- Sharing is "really just for flavor, you can't really alter anyone else's game or ship.
  It's sorta just to establish a 'Community' feeling vibe."
- A public route shows only legs a ship has finished, never where it is heading.
- Example games: "make like 6 or 12 accounts each with a ship and it shows the ship and
  who's on it." Asked whether they carry an "Example" tag: **"yes (make them easy to
  remove later)".**
- Asked whether a referee can mark a journal entry "Public" so it shows on the game's
  card: **yes.**
- Asked whether a card names who runs the game: **"Let the ref account determine what's
  published, either the name only or name and ref name."**
- Asked whether signed-out visitors see public ships on the map: **yes.**

## Do

Extend `directives/contracts/b_party_ships.md` with a section "The public card", then
build it.

1. **The card:** `GET /api/public-ships/:mark` (the opaque mark id from the last pass).
   Anyone, signed in or out. Answer: the game's name; the referee's handle **only when
   that game chose to show it**; `example` (step 6); the ship's name; the names aboard
   (the last pass's rules); the **finished legs** of that ship's track up to the
   campaign's current date (from and to as system hex keys, the dates; never a leg not
   yet arrived, never a body, point or note); the game's **public journal entries**
   (step 2), newest first, capped (you name the cap). 404 "No such ship." for an unknown
   mark, a game switched off, or a ship no longer public.
2. **"Public" journal entries.** A third choice for a journal entry's visibility beside
   `referee` and `players`. Records and links keep their two values; give entries their
   own enum rather than widening `Visibility` for everything. As in the last pass, find
   what a cached 1.2.0 or 1.2.1 tab does on reading an entry marked public (strict
   parse?) and make sure it neither breaks the journal nor saves the entry back as
   something else. Say what that tab sees in the contract.
3. **No reader opens another universe's Durable Object.** Whatever the card shows is
   written to D1 on save, on the same trigger as the public rows, and a save that
   changes a public entry (a journal-only patch included) refreshes it. Name the stored
   shape, its size bound, and the cost per save.
4. **The referee's choice:** `PATCH /api/universes/:id/public-games` grows a second
   field for "show my name" (default off: game name only). Keep `{ public }` alone
   working for a 1.2.x tab. `GET /api/universes` and `/:id` carry it for the owner on the
   same rule as `publicGames`.
5. **Signed-out viewers:** `GET /api/public-games` and the card answer signed out. The
   rate limit counts a signed-out caller by IP (`CF-Connecting-IP`), signed-in by user
   id as today. "The caller's own games are left out" applies only when signed in.
6. **Example games, easy to remove.** A flag on the universe that only an admin or the
   seed tool sets (no browser route for owners), carried as `example: true` on the
   feed's ships and on the card. Name how the seed tool finds and deletes every example
   account, universe and row in one go (plain delete). The example content itself and
   the seed tool are the next pass's job (Lane Z, from your contract); this pass ships
   the flag, the column and the guarantee that removing them leaves nothing behind.
7. **The leak list,** updated: the referee's handle only when chosen; no journal entry
   that is not `public`; no unfinished leg; no `cr_`, universe or user id; no email.
8. **Migration** `0018_*.sql` (after your 0017), safe in either order: until it is
   applied, the card is 503 with a sentence like the switch's, the feed works as after
   the last pass, and the PATCH ignores the new field.

## Owned files (this pass)

As in `b_party_ships`, plus `apps/api/src/routes/public_ships.ts` (new), the journal
schema in `packages/shared/src/schemas/campaign.ts`, `apps/api/src/routes/universes.ts`
for the PATCH and list fields, `apps/api/src/db/migrations/0018_*.sql`. Web files: the
smallest compile edits only, listed in the report. Never the ten parked truth-build
files, `versionvideo/`, `packages/engines`, the fixtures, `tools/examples/` (Z's).

**This turn Lane A owns `workspace/party.ts`, `party_where.ts`, `campaign/`,
`map/vessel_marks.ts`, `map/campaign_layer.ts` and `pack/plan.ts`; Lane D owns
`map/public_games.ts`, `map/MapRenderer.ts` and `views/MapView.vue`; Lane Z owns
`packages/shared/src/schemas/package.ts`, `jobs/publish_queue.ts` and
`routes/installs.ts`.** If your change breaks the compile in any of those files, do not
edit it: write the exact error and the one-line fix under "Needs from others".

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, `RUN_API_TESTS=1` for
the public suites, with and without 0018 applied, pasted.

## Stop rule

Stop when the gates pass and the contract and report are written. Write
`directives/reports/b_public_card.md` from `directives/reports/_TEMPLATE.md`. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: a cached tab parses journal visibility as referee or players only, and the page is strict. next: the card, the public value, and migration 0018.
done: schema, migration 0018, the card route, and the players echo that keeps public. next: gates.
done: npm test and npm run check passed. The card test saw an empty feed because day 100 is mid-flight, so the dot is the destination sector. next: rerun the card at day 15, between the finished leg and the unfinished flight.
done: gates passed. The card suite, public games (solo), and party ships passed with 0018 applied and with the new table dropped. next: the report.
done: the journal header, the read-side parse, and the contract wording. next: the read test, then the worker suite.
done: Fix 1 gates passed. The header keeps public for this bundle and the rewrite for a tab that omits it. next: the report.

## Fix 1 (orchestrator, 2026-10-14; go again)

Accepted, with one fault. To keep a cached tab opening, the owner's campaign read rewrites
`public` to `players`, and a `players` write keeps a stored `public`. That also blinds the
**new** browser: a referee can mark an entry Public but never sees that it is, and can
never set it back to Players. Fix it so that only old tabs get the rewrite:

1. **The new browser says who it is.** Every campaign read and every campaign changes
   call from this bundle sends the header `X-Voyage-Journal: public`. With that header,
   entries come back with `public` as stored, a conflict's `current` too, and a `players`
   write stores `players`. Without the header, today's rule stays, for old tabs. Add the
   header in `apps/web/src/campaign/store.ts` and `apps/web/src/campaign/commit.ts`
   (lent to you for this; Lane A is free) and wherever else the browser reads or writes
   the campaign. Tests both ways, in the worker suite.
2. **Stop the next one at the root.** Every compatibility rule in your two contracts
   exists because the browser parses server answers strictly, so one new key strands an
   open tab on "loading". Make the browser's parse of **server answers** ignore keys it
   does not know: the campaign page, the changes result, the universe list and one
   universe. **Writes the server validates stay strict.** Do it in one place (a read-side
   parse helper, or `.strip()` variants used only on reads) and say which in the
   contract. A tab that parsed with the old schema still needs the rewrite above, so
   keep the rewrite. If this turns out bigger than a few files, do item 1 only and write
   item 2 up under "Needs from others" with its size.
3. Update the contract's "Public journal entries" and "The referee's name" sections.

Owned files: as before, plus `apps/web/src/campaign/store.ts`, `commit.ts`, and the read
call sites item 2 needs. **Lane E is editing `workspace/journal/`, `PartyPanel.vue`,
`AccountMenu.vue` and `workspace/public_games.ts` this turn. Lane D is editing
`views/MapView.vue`, `map/` and `workspace/PublicShipCard.vue`.** Do not touch those; a
needed change goes under "Needs from others". Gates as before. Update your report.
