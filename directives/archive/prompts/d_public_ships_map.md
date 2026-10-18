# Lane D — everyone's ships on the map: one mark per public ship

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/contracts/b_party_ships.md` ("The feed" and "What must never appear"), then
this file. No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14)

- "How are we looking to share ships across the galaxy so we can see everyone's
  adventures?"
- "All party ships that are published or public should show up on the map ... it shows
  the ship and who's on it."
- "It's really just for flavor, you can't really alter anyone else's game or ship. It's
  sorta just to establish a 'Community' feeling vibe."
- The bar for the look is the legacy app (memory: rebuilt UI must match its polish).

## What is there now

`GET /api/public-games` (Lane B) returns, for each hex, `hex`, `count` and `name` (today's
dots) and, once migration 0017 is applied, `ships: [{ mark, ship, aboard }]` (ship name,
names aboard). `map/public_games.ts` reads the first three and draws one dot with a count.

## Do

1. **`map/public_games.ts`** (lent to you this pass): read `ships` when it is present.
   When it is absent (a server before 0017), keep today's dot and count exactly as they
   are. Ignore keys you do not know: B's next pass adds more (an `example` flag, and the
   feed answering signed-out visitors).
2. **One mark per ship** at its hex, in the public layer of `map/MapRenderer.ts`, wired in
   `views/MapView.vue`:
   - A ship glyph that cannot be mistaken for a world, a base, or the viewer's own party
     marker.
   - The ship's name beside it, at the zoom tiers where world names show.
   - Several ships on one hex read clearly: fanned or stacked, with "+N" when more than
     fit. Your call on the shape; show it in the shots.
   - Hover (desktop) or tap (phone) shows the ship's name and "Aboard:" with the names.
     Nothing else, and never ids.
   - **No click action yet.** The read-only card comes in a later pass (B is writing its
     route now), so nothing may look clickable: no pointer cursor, no hover lift that
     suggests a button. Leave a one-line comment where the click will go.
   - Tokens only. Light and dark.
3. **A local setup that shows it:** a local wrangler with 0017 applied, two accounts.
   Account one turns public on and has three ships on a v10 map: two on one hex, one
   elsewhere, with members aboard. One member is referee-only and must not appear.
   Account two views the map. Write the setup down in `findings/public_ships/` so a later
   pass can rerun it.

## Owned files (this pass)

`map/public_games.ts`, `map/MapRenderer.ts` (the public layer only), `views/MapView.vue`,
`design/tokens.css` (your own lines), tests under `tests/web/`, `findings/public_ships/`,
shots `findings/ui_design_shots/kb21_public_ships_*`,
`directives/reports/d_public_ships_map.md`.

**Do not touch:** `workspace/party.ts`, `party_where.ts`, `campaign/`, `map/vessel_marks.ts`,
`map/campaign_layer.ts`, `pack/plan.ts` (Lane A this turn), `apps/api`, `packages/shared`
(Lane B), `tools/examples/` (Z), the ten parked truth-build files, `versionvideo/`. The
viewer's own party markers per ship are your **next** pass, on A's functions.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
shots at 1600 px and 390 px, at two zoom tiers, light and dark: the shared hex, the
single ship, the hover or tap card, and a server without 0017 (today's dot). Start Vite
with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_public_ships_map.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: map/public_games.ts reads `ships` (mark, ship, aboard; unknown keys unread; absent keeps today's dot). next: one mark per ship in MapRenderer's public layer.
done: renderer public layer (dart per ship, names at the names tier, +N past three, hover hits), workspace/PublicShipCard.vue + public_ship_card.ts, MapView wiring (hover, tap pins, click falls to the hex), tests/web/public_ships_map.test.js. next: local setup with 0017, two accounts, three ships; then shots.
done: local setup (0017 applied to my state, v10 row, ref1 Glass Wake with three ships, one referee-only member; findings/public_ships/setup.mjs + README.md); shots kb21_public_ships_* at 1600 and 390, two tiers, hover, tap, crowded +N, old server; light preference identical (no light theme). Servers stopped. next: gates and report.
done: gates pass (1733 tests, 0 fail; check clean; typecheck; build); servers stopped; the report is written. next: nothing.
