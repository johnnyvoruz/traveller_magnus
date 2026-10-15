# Lane D — your own ships on the map, and the public ship card

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/contracts/b_party_ships.md` (all of it, including "The public card"),
`directives/reports/a_party_ships.md` ("For D") and your own
`directives/reports/d_public_ships_map.md`, then this file. No git but read-only, no
deploy, no `rules/`.

## Johnny's words (2026-10-14)

- "Let's do more than one ship per party." Ships move separately.
- Public ships show "the ship and who's on it". The public route shows finished legs only.
  "It's really just for flavor, you can't really alter anyone else's game or ship. It's
  sorta just to establish a 'Community' feeling vibe."
- Example games carry an "Example" tag. Signed-out visitors see public ships.
- Your question (a ship with nobody published aboard): **decided by the orchestrator,
  leave the "Aboard:" line out, as you built it.**

## Do

1. **Your own party, one marker per ship.** Switch the map from `partyMarker` and the
   `party` flag on `vesselsOnMap` to A's `partyShipMarks` and `partyShipLabels`. Each
   ship stands at its own place. The lead ship keeps today's marker; the others use the
   same marker family without the lead's emphasis, so a referee can tell which is the
   lead. Each one is labelled with the ship and who is aboard, at the tiers where names
   show. Two of your own ships on one hex must both read clearly. Clicking one does what
   clicking today's party marker does, for that ship.
2. **Click a public ship: the read-only card.** A click or tap on someone else's dart
   opens the card from `GET /api/public-ships/:mark`:
   - The game's name. The referee's handle, only when the answer carries one. An
     "Example" tag when `example` is true. The ship's name, "Aboard:" (left out when
     empty), and the public journal entries, newest first, each with its title, date
     and body.
   - **The finished route drawn on the map** while the card is open: the legs from
     `legs`, in a quiet style that cannot be mistaken for a trade route or for your own
     ship's track. It goes away when the card closes.
   - Read-only: no control on the card changes anything. Close with Esc, the close
     button, or a click on empty map.
   - Errors: 404 says "This ship is no longer public." and the dart is dropped on the
     next load. 503 (a server before 0018) means no click: the dart stays hover-only, as
     now.
   - Where it opens is your call: the side pane, like a record page, or an anchored
     card. It must work at 390 px.
   - Replace the comment you left in `chartClick` with the real call.
3. **"Example" on the dart's tag** when the feed's ship has `example: true`: a small
   tag, quieter than the name.
4. **Signed-out visitors:** lift the `signedIn` guard in `map/public_games.ts`. B's server
   answers signed out once 0018 is applied; before that a signed-out feed is 401, and the
   map must take that quietly, with no error and no retry loop.
5. **The local setup** in `findings/public_ships/`: add 0018, one example game, one game
   showing the referee's name and one not, finished and unfinished legs, two public
   journal entries and one players-only entry, and a party of your own with three ships
   on two hexes. The card must never show the players-only entry or an unfinished leg.

## Owned files (this pass)

`views/MapView.vue`, `map/MapRenderer.ts` (party and public layers), `map/public_games.ts`
(lent), `map/campaign_layer.ts` (lent from A), `workspace/PublicShipCard.vue`,
`workspace/public_ship_card.ts`, new files of yours under `workspace/` for the card,
`design/tokens.css` (your own lines), tests under `tests/web/`, `findings/public_ships/`,
shots `findings/ui_design_shots/kb22_party_ships_*`,
`directives/reports/d_party_ships_map.md`.

**Do not touch:** `workspace/PartyPanel.vue`, `workspace/journal/`, `AccountMenu.vue`,
`workspace/public_games.ts` (Lane E this turn); `campaign/` (Lane B is adding a header
there); `apps/api`, `packages/shared` (B); `tools/examples/`,
`routes/installs.ts`, `jobs/publish_queue.ts`, `schemas/package.ts` (Z); the ten parked
truth-build files; `versionvideo/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
at 1600 and 390 px: your three ships (two on one hex), the card for a normal game, an
example game and a game that shows the referee's name, the route drawn, signed out, and a
server without 0018. Start Vite with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_party_ships_map.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: feed asks signed out (401 quiet, no loop), example kept, dropPublicShip; workspace/public_card.ts + PublicShipSheet.vue (read-only card, sheet at 390, Esc/close/empty click), route drawn and marching while open; ShipPings.vue + glow (Johnny 2026-10-14: make the blips sing); own party one marker per ship (campaign_layer partyShipTags/drawPartyShips, MapView snapshot); tests/web/party_ships_map.test.js. next: local setup with 0018, then shots.
done: local setup with 0018 (setup.mjs: Glass Wake names its referee, Lantern Run example, finished + unfinished legs, 2 Public + 1 Players entry, viewer's 3 ships on 2 hexes); shots kb22_party_ships_*; fixed: feed answers drawn the next frame (signed-out phone showed no ships); phone card flies the ship above the sheet. Servers stopped. next: gates and report.
done: gates pass (1754 tests, 0 fail; check clean; typecheck; build); servers stopped; the report is written. next: nothing.
