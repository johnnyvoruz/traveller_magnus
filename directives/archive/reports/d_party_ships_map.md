# Lane D d_party_ships_map report
Prompt: prompts/d_party_ships_map.md
Status: done

Found: a fresh start. The prompt had no Progress lines. My files held only last pass's edits, and `campaign_layer.ts` and `vessel_marks.ts` held A's accepted pass.
Finished: all five items, Johnny's "make the ship blips sing" note from the `go`, one bug that predated this pass, the tests, the shots and the gates.
Backed out: nothing.

## What is on the map now

**Your own ships (item 1).**
- The map uses A's `partyShipMarks` and `partyShipLabels`, through a small wrapper `partyShipTags` in `campaign_layer.ts`. Each ship stands at its own place.
- The lead is drawn exactly as the party marker always was.
- Every other ship gets the same marker a size smaller, with a thinner ring, and its chevron and tag at about 60%. A referee tells the lead at a glance (shot `1600_names`: FAR MARGIN · Voss is the lead, JEWEL · Wren Hale is the other ship).
- Each tag is the ship in capitals, as the party tag always was, then who is aboard as written, for example "SPARROW · Mora". A ship in jump says "· IN JUMP".
- Two ships on one hex stack one above the other, lead first, without overlapping.
- Zoomed out to points, a hex has one point, the lead's when it is there.
- A party with no ship on the map keeps the one marker where it stands, as before.
- A party ship is no longer drawn a second time as "another vessel".
- Clicking any of your ships opens the Party tab, as today's marker does. The Party tab can't open on one ship yet: see Needs.

**Someone else's ship, clicked (item 2).**
- A click or a tap on a dart opens the read-only card from `GET /api/public-ships/:mark`. The card shows:
  - the ship's name, in italics, in the ship's own colour;
  - an "Example" tag when `example` is true;
  - "Aboard:" (left out when empty, as decided);
  - the game, and "Referee" with the handle only when the answer carries one;
  - one line saying how many finished legs are drawn;
  - the Public journal entries, newest first, each with its title, its date ("093-1105", or the day it was written when it has no in-game date) and its body.
- It is read-only: its only control is Close.
- It closes with Esc, Close, or a click on the map. A click on a world goes on to open that world.
- On a wide window the card sits beside the ship's marks. Below 600 px it is a sheet along the bottom, at most 52% of the map, and the camera glides the ship into the band above it (shot `390_card`).
- A stack at the far zoom opens its first ship.
- While a card is open, its finished route is drawn:
  - violet round dots, hex to hex, with a ring at each stop;
  - unlike a trade route, which is a solid or dashed line in an allegiance's colour, and unlike any track of your own;
  - shown at every zoom, and gone when the card closes.
  - Only `legs` is drawn, so an unfinished leg can't appear: Beowulf's jump to Jenghe, which arrives after the campaign date, is absent.
- A 404 says "This ship is no longer public." and the dart goes at once.
- A 503 (a server before 0018) means no cards for that visit. The press then does what it did before cards: a click lands on the hex (shot `1600_before_0018`), and a tap shows the hover card.
- Any other failure says "The card could not be loaded. Try again."
- The comment in `chartClick` is replaced by the real call.

**"Example" (item 3).** On the dart's tag, after the name: a smaller, outlined, muted tag, quieter than the name (shot `1600_card_example`, Pale Heron). The feed's `example` is read; any other new key is still left unread.

**Signed out (item 4).**
- The guard is lifted: a visitor's map asks for the feed. Signed-out visitors see the ships, the pings and the cards (shots `1600_signed_out`, `1600_signed_out_card` and `390_signed_out_card`).
- On a server before 0018 a visitor's ask is 401. The map takes that one answer as no ships and asks nothing more until the visitor signs in: no error and no loop (tested).

**Making the ships sing (Johnny, with this `go`).**
- **A glow:** each dart has a soft glow of its own violet, so it reads as lit, not printed on the chart.
- **Pings:** each hex of public ships sends out a slow sonar ping, two rings half a beat apart, every 4.2 s. Each hex keeps its own beat, taken from its key, so the map twinkles rather than blinking in unison.
  - The rings are CSS on the compositor, so the chart is not redrawn for them.
  - At most 60 hexes ping at once. Others still glow.
  - New tokens `--ship-ping` and `--ship-ping-reach`.
- **A marching route:** while a card is open, its route's dots move slowly in the direction the ship went. Only then does the map redraw every frame.
- Under reduced motion there are no pings and the route stands still. The glow stays.

**Fixed along the way (it predated this pass).**
- The frame handed the feed's ships to the renderer after drawing. So the frame that followed an answer drew the old, empty set, and the ships showed only on a later redraw.
- On a busy desktop something else always redrew soon. On a quiet phone screen signed out, nothing did, and the ships never appeared (seen 2 times in 2 at 390 px).
- Now an answer is handed over before the next draw. Signed out at 390 px, the ships then showed in 6 loads of 6.

**Light and dark:** the app still has no light theme. All colours come from tokens.

## Changed files
- `apps/web/src/map/public_games.ts` (lent):
  - Asks signed out. A signed-out 401 stops further asks until a sign-in.
  - Keeps `example`.
  - New `dropPublicShip(mark)`.
- `apps/web/src/map/MapRenderer.ts`, party and public layers:
  - the glow, `exampleTag`, `paintRoute` and `setPublicRoute` (the route, at every tier) and `publicShipPings`;
  - `partyShipAt`, and `partyAt` counting every party ship;
  - `PublicShipCard` renamed `PublicShipHit`, so it no longer shares a name with B's schema.
- `apps/web/src/map/campaign_layer.ts` (lent from A):
  - `CampaignSnapshot.ships`, `drawPartyShips`, `drawShipMarker`, `drawShipPoint` and `partyShipTags`;
  - `drawCampaignLayer` returns `ships`;
  - The single-party path is unchanged.
- `apps/web/src/views/MapView.vue`:
  - The snapshot comes from `partyShipMarks`.
  - `openShip`, `closeShip`, Esc, and a click on the map closing the card.
  - The pings handed over per frame, and the frame fix (`onPublicGames`, `publicArrived`).
  - Mounts `ShipPings` and `PublicShipSheet`.
- `apps/web/src/workspace/public_card.ts` (new): reads the card leniently, fetches it (its four answers), formats a note's date, and words the route line.
- `apps/web/src/workspace/PublicShipSheet.vue` (new): the read-only card.
- `apps/web/src/workspace/ShipPings.vue` (new): the pings.
- `apps/web/src/workspace/public_ship_card.ts`: placement takes a width; the sheet constants.
- `apps/web/src/design/tokens.css`: two lines of mine, `--ship-ping` and `--ship-ping-reach`.
- `tests/web/party_ships_map.test.js` (new, 11 tests): your ships and their tags, clicks, the feed signed out, the card's reader and answers, the read-only card, "Example", the glow, the pings and the route.
- `tests/web/public_ships_map.test.js` and `tests/web/public_games_wire.test.js` (mine): updated for the click, `example`, and the frame fix.
- `findings/public_ships/setup.mjs` and `README.md`:
  - 0018, and two games: Glass Wake names its referee; Lantern Run is an example game whose referee is not named.
  - Finished and unfinished legs, two Public journal entries and one Players entry, and the viewer's party of three ships on two hexes.
  - The script fails if a referee-only name, the players-only entry, an unfinished leg's hex, any `cr_` or `cj_` id or a universe id is in the feed or the card. It also fails if a visitor can't see Regina, or the viewer sees their own ships in the feed.
- `findings/ui_design_shots/kb22_party_ships_*` (15):
  - 1600 px: names, far, own ship clicked, the card with its referee named, the example card, the plain card (referee name off), the route at the far zoom, signed out, the signed-out card, and before 0018;
  - 390 px: names, the card, signed out, and the signed-out card.
- `directives/prompts/d_party_ships_map.md`: Progress lines only.

## Gates
npm test:      pass (1,754 tests: 1,721 pass, 0 fail, 33 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`, exit 0; `vue-tsc -b` clean inside the build)
fourth gate:   pass (`npm run build`: `index-CIfBquDF.js` 201.70 kB, gzip 68.09; `index-9Q5XSvrp.css` 29.74 kB)

The index grew 12.85 kB, from 188.85 kB to 201.70 kB. Part of that is mine: the card, the pings and the route are in the map's chunk. Part is other lanes' work since my last build. I did not split it.

**Browser:** Edge on my own ports: API 8794 with inspector 9294, Vite 5194 with its own cache, DevTools 9394. Migration 0018 is applied to my own wrangler state.
- The card never showed the players-only entry, the referee-only person or the unfinished leg.
- The page logged no errors.
- During the pass, `vue-tsc -b` failed in `campaign/commit.ts`, `read.ts` and `store.ts` (Lane B's in-flight files). By the gates it passed, so no need is raised.
- Every server and the browser are stopped, and ports 8794, 5194, 9394 and 9294 are free.

## Contract published
none

## Needs from others
- Lane E (`workspace/PartyPanel.vue`, `shell/pane.ts`): a way to open the Party tab on one ship, such as `{ kind: 'party', ship }` or `?ship=`. Until then a click on any of your ships opens the Party tab as the single marker did, not focused on that ship. Once it exists, the map passes the id: a one-line change in `chartClick`, where `partyShipAt` already names the ship.

## Questions for Johnny
1. Should other people's ships also show when the map is zoomed out past the hex level, where the map is dots? I recommend yes, in a later pass: Lane B adds one small feed per chart version listing the hexes with public ships (no names), and the map draws a glow and a ping per hex at the sector and galaxy zoom levels. Then the whole galaxy feels alive, not only the patch you are zoomed into. Today the feed is asked per sector only at the hex zoom, so zoomed out the ships disappear.
