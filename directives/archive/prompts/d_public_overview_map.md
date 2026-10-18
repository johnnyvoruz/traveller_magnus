# Lane D — public ships glow and ping when the map is zoomed out

Issued 2026-10-14 by the orchestrator. **Start only after the board says push 1.2.1 is
live.** You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/prompts/b_public_overview.md` (Lane B is building that route at the same
time), your reports `reports/done/d_public_ships_map.md` and
`reports/done/d_party_ships_map.md`, then this file. No git but read-only, no deploy, no
`rules/`.

## Johnny's words (2026-10-14)

Your question, whether other people's ships should show zoomed out past the hex level:
**yes.** You recommended it so that "the whole galaxy feels alive". Earlier, about the
ships: make the blips sing.

## Do

1. **Read the overview.** `GET /api/public-games/overview?truthVersion=<the map's pin>`
   answers `{ hexes: [ { key, count } ] }` (exact shape in B's prompt). Ask once when the
   map first leaves the hex zoom, and again at most once a minute while it stays out
   (the answer is cached for 60 s). Signed out works once 0018 is applied; a 401 before
   that is taken quietly, as the sector feed does. Skip it when the pin is null.
2. **Draw it at the sector and galaxy zoom levels:** a soft violet glow per hex with
   ships, a little stronger where `count` is higher, and the same slow sonar ping as at
   the hex zoom (`ShipPings.vue`, its own beat per hex). Nothing to click and no hover
   card: zoomed out it is atmosphere, and zooming in shows the darts. Where the map shows
   hundreds of hexes, name a limit on how many ping at once (you used 60), and let the
   rest glow.
3. **The hand-off between zooms** must not double up: at the hex zoom the sector feed's
   darts draw as now and the overview draws nothing.
4. Reduced motion: no pings, the glow stays (as now).
5. Until B's route exists, build and test against a fake answer in your tests. Your browser
   check runs once B's report is in. If it is not in when everything else is done, say
   so and stop.

## Also in this pass: two faults Lane Z found (2026-10-14, after 1.2.1)

6. **On a phone, a tap on a dart at the far zoom opens the hex sheet, not the card** (Z's
   shots `kb23_example_games_card_*_390_tap_miss.png`). The dart there is about 10 px.
   Give every public dart, and your own ship markers, a touch target of at least 44 px
   across that wins over the hex underneath, without making a mouse click on a nearby
   world land on the ship.
7. **A stack of ships on one hex opens only its first ship** at the far zoom (Z: "A click
   on the stacked pair always opens Copper List. I found no point that opens Kestrel's
   Due."). Make every ship in a stack reachable. For example, the card shows "1 of 2"
   with previous and next when it was opened from a stack. Your call; show it in the
   shots at 1600 and 390 px, on the example games at Spinward_Marches/2007.

## Owned files (this pass)

`map/public_games.ts`, `map/MapRenderer.ts`, `views/MapView.vue`,
`workspace/ShipPings.vue`, `design/tokens.css` (your own lines), tests under `tests/web/`,
shots `findings/ui_design_shots/kb24_public_overview_*`,
`directives/reports/d_public_overview_map.md`. Lane B is in `routes/public_games.ts` and
`packages/shared/src/schemas/public_games.ts`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
the sector and galaxy zooms at 1600 and 390 px with the example games seeded on your local
state (Z's `tools/examples/seed_games.mjs --to-local`), signed in and out, and reduced
motion. Start Vite with its own cache directory; stop every server after.

## Stop rule

Stop when the gates pass and the report is written. Write
`directives/reports/d_public_overview_map.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: overview reader + watch (public_games.ts), glow + pings off the hex zoom (MapRenderer paintOverview, ShipPings far), TOUCH_PX targets on darts and own ships, card steps through a hex's ships (1 of N); tests/web/public_overview_map.test.js; my older assertions updated. next: browser check, once B's route is in.
done: browser pass on Z's example games (stack 1 of 2 with Next/Previous at 1600 and 390; finger 14 px off a far dart opens the card, on the world opens the world; finger beside own ship opens Party); overview preview shots with a page-made answer (B's route not in); glow strengthened. Servers stopped. next: gates and report.
done: gates pass (1771 tests, 0 fail; check clean; typecheck; build); servers stopped; report written as partial. next: the zoomed-out browser check on B's real route once reports/b_public_overview.md is in.
