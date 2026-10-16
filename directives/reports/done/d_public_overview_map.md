# Lane D d_public_overview_map report
Prompt: prompts/d_public_overview_map.md
Status: partial. Everything is built, tested and through the gates. The browser check of the zoomed-out glow against Lane B's real route waits for B: `routes/public_games.ts` has no overview route yet and there is no `b_public_overview` report. As item 5 says, I stopped there.

Found: a fresh start. 1.2.1 is pushed (`origin/campaign` is at `55fe998`), so the board's "pause until 1.2.1 is pushed" was met. The prompt had no Progress lines, and none of this pass's files had edits.
Finished: items 1 to 4 and 6 to 7, tests, the stack and touch browser pass, labelled preview shots of the zoomed-out glow, and the gates.
Backed out: nothing.

## What the map does now

**Zoomed out, the galaxy stays alive (items 1 to 4).**
- **Asking.** `watchPublicOverview` in `map/public_games.ts` asks `GET /api/public-games/overview?truthVersion=<pin>`:
  - when the map first leaves the hex zoom, then at most once a minute while it stays out (`PUBLIC_OVERVIEW_EVERY_MS`);
  - never with a null pin;
  - signed out too. A signed-out 401 is taken quietly, and nothing more is asked until a sign-in.
- **Reading.** The answer is read leniently: only `key` and `count`, at most 20,000 hexes. A `~` sector or a malformed row is left out.
- **The glow.** Off the hex zoom, every hex with ships glows violet, at three strengths by `count` (1, 2 to 3, 4 or more).
  - The halos add light, so a busy patch shines brighter.
  - The cores are solid with a dark edge, so they read on a polity's fill as well as on black.
- **The pings.** Each hex pings with its own beat, a little smaller than at the hex zoom (new token `--ship-ping-reach-far`). At most 60 ping at once, as before: the busiest hexes first, then those nearest the middle of the screen. The rest still glow.
- **Read-only.** Nothing is clickable and there is no hover card.
- **The hand-off.** At the hex zoom the overview draws nothing and the sector feed's darts draw as before. A hex keeps the same ping key at both zooms, so its rhythm carries on as you zoom in.
- **Reduced motion.** No pings; the glow stays.

**Every dart is easy to hit with a finger (item 6).**
- **The rule.** For a touch, every public dart, and each of your own ship markers, is at least `TOUCH_PX` (44 px) across, and it wins over the hex underneath. A tap nearer the world than the mark stays the world's.
- **A mouse** keeps the drawn mark, so a click beside a ship lands on the hex.
- **Measured at 390 px:**
  - A finger 14 px off a 10 px dart at the far zoom opened its card.
  - A finger on Roup's world opened Roup (`/s/Spinward_Marches/2007`).
  - A finger beside your own ship at Yori opened the Party tab.
- **Measured at 1600 px:** a mouse 20 px off the dart opened nothing.

**Every ship in a stack is reachable (item 7).**
- **"1 of N".** A card opened on any hex with several ships, whether its stack, its "+N" row or any one row, says "1 of 2", with Previous and Next. Each step loads that ship's card and its route.
- **Where it starts.** Opened from one row, the card starts on that ship (Kestrel's Due, "2 of 2").
- **Focus** stays on the button you pressed.
- **Read-only.** Previous, Next and Close are the only controls, and none changes anything.
- **Z's example games at Spinward_Marches/2007:** Copper List (1 of 2), then Next to Kestrel's Due (2 of 2), then Previous back, at 1600 and 390 px.

## Changed files
- `apps/web/src/map/public_games.ts`:
  - New: `readOverview`, `watchPublicOverview`, `publicOverview`, `PUBLIC_OVERVIEW_EVERY_MS` and `PUBLIC_OVERVIEW_MAX`.
  - `resetPublicGames` clears the overview too.
- `apps/web/src/map/MapRenderer.ts`:
  - `setPublicOverview`, `paintOverview`, and pings off the hex zoom.
  - `TOUCH_PX`, and a `touch` argument on `publicShipAt`, `partyShipAt` and `partyAt`.
  - Each hit carries its hex's whole list (`fleet`) and the mark's and the world's centres.
- `apps/web/src/views/MapView.vue`:
  - Hands the overview over before each draw, watches it each frame, and passes `far` to the pings.
  - `touch` is passed from `chartClick`.
  - `showShip` and `stepShip`; the card keeps the hex's list.
- `apps/web/src/workspace/PublicShipSheet.vue` (mine, from the last pass): "1 of N", Previous and Next (`step`), and focus only on opening.
- `apps/web/src/workspace/ShipPings.vue`: `far` and its smaller ring.
- `apps/web/src/design/tokens.css`: one line of mine, `--ship-ping-reach-far: 28px`.
- `tests/web/public_overview_map.test.js` (new, 8 tests): the reader, the once-a-minute rule and the quiet 401, the glow and the pings off the hex zoom, no double at the hex zoom, finger targets on darts and on your own ships, and stack stepping.
- `tests/web/party_ships_map.test.js`, `tests/web/public_games_wire.test.js` (mine): updated for the new arguments, buttons and imports.
- `findings/ui_design_shots/kb24_public_overview_*` (11):
  - stack shots: `1600_stack_1of2`, `1600_stack_2of2`, `1600_names_row2`, `390_stack_tap`, `390_stack_2of2`, `390_world_tap` and `390_own_tap`;
  - **previews**: `preview_1600_sector`, `preview_1600_galaxy`, `preview_390_sector` and `preview_390_galaxy`. In these, the overview answer is made in the page from the real sector feed, because B's route is not in. They show the look, not B's route.
- `directives/prompts/d_public_overview_map.md`: Progress lines only.

## Gates
npm test:      pass (1,771 tests: 1,738 pass, 0 fail, 33 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`, exit 0; `vue-tsc -b` clean inside the build)
fourth gate:   pass (`npm run build`: `index-Cym4E2PP.js` 206.47 kB, gzip 69.54; `index-Cy3VURIH.css` 30.17 kB)

**Browser:** Edge on my own ports: API 8794 with inspector 9294, Vite 5194 with its own cache, DevTools 9394.
- Z's 12 example games were seeded into my own state with `tools/examples/seed_games.mjs --to-local`, through a scratch folder that links to it, because the tool expects `<dir>/state`.
- My own test game Glass Wake was switched off in my state, so 2007 holds Z's two ships as in Z's report.
- Signed in as ref2, with ref2's three-ship party.
- The page logged no errors.
- Every server and the browser are stopped, and ports 8794, 5194, 9394 and 9294 are free.

**Still to do once B's report is in:** the sector and galaxy zooms on the real route at 1600 and 390 px, signed in and out, and with reduced motion. My test answer has the exact shape in B's prompt, `{ hexes: [ { key, count } ] }`, so I expect no code change; if B's shape differs from the prompt, the reader is the one place to change.

## Contract published
none

## Needs from others
- Lane B: `GET /api/public-games/overview` (prompts/b_public_overview.md) and its report. My browser check of the zoomed-out glow waits for them.
- Lane E (carried over from d_party_ships_map): a way to open the Party tab on one ship. The map already knows which ship a tap or click was on.

## Questions for Johnny
none
