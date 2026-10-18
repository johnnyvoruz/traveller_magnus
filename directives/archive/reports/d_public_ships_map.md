# Lane D d_public_ships_map report
Prompt: prompts/d_public_ships_map.md
Status: done

Found: a fresh start. The prompt had no Progress lines, and none of this pass's files had edits in git status.
Finished: all three items, the test, the shots and the gates.
Backed out: nothing.

## What is on the map now

- **Each public ship has its own mark:** a violet dart (`--chart-public`) with a notched tail and a dark edge, pointing right. A world is a disc, a base is a white star or triangle, your own party is a cyan ring with a chevron, and other vessels are dim discs, so the dart can't be mistaken for any of them.
- **Where world names show (from 63.75 px a parsec):**
  - The darts stack up from the top right inside their hex. They sit clear of the hex number, the starport letter and the gas giant.
  - Each dart has the ship's name on a dark backed tag, in italics. A name wider than 150 px is cut with an ellipsis, and the card says it whole.
  - Up to three ships show one row each. With more, two show and a "+N" row stands for the rest.
- **Further out, at the hex tier below names:** each hex shows one stack of up to three overlapping darts, and "+N" past three.
- **Hover with a mouse:** a card shows the ship's name in italics and "Aboard:" with the names. Nothing else, and never an id.
  - Over a stack, the card lists every ship on the hex. Over "+N", it lists the ships that row stands for.
  - A card names at most five ships and ends "And N more ships." when there are more, including any the feed did not list past its cap of 20.
  - When no published name is aboard, the line is left out (question 1).
  - The card opens beside all of the hex's marks, never over one.
- **Tap on a phone:** a tap on a mark shows the same card, above the marks so the world stays in view, and does nothing else. A tap anywhere else closes it. The card follows its mark while the map moves.
- **Nothing looks clickable:**
  - The cursor stays as it is (`auto` measured over a dart). There is no hover lift, and the card takes no pointer.
  - A mouse click on a dart lands on the hex underneath: it opened Regina's pane in the browser pass.
  - The comment where the click will go is in `chartClick` (`views/MapView.vue`): "Someone else's public ship: a click opens nothing yet and lands on the hex. The read-only card (prompts/b_public_card.md) opens here."
- **A server without 0017:** a hex without `ships` is today's diamond, with its name or count, drawn by the same code, unchanged. A malformed `ships` value also falls back to the diamond. Keys the client does not know (`example`, or any other) are left unread.
- **Light and dark:** the app has no light theme yet (`base.css` sets `color-scheme: dark`, and `tokens.css` has no light values). The shots taken with a light preference are pixel-identical to the dark ones. Every colour comes from a token.

## Changed files
- `apps/web/src/map/public_games.ts` (lent): reads `ships` (`mark`, `ship`, `aboard`) when present. A ship that can't be read is dropped. It caps 20 ships and 20 names, and leaves unknown keys unread. Without a list, the hex is exactly today's `{ hex, count, name }`.
- `apps/web/src/map/MapRenderer.ts`, the public layer only:
  - `paintPublic` splits rows into diamonds (old feed) and fleets (new feed).
  - New: `paintDiamonds` (today's code, moved), `paintShips`, `shipDart` and `shipTag`.
  - Hover lookups `publicShipAt` and `publicShipByKey`, the `PublicShipCard` type and `fitLabel`.
  - One line in `draw` clears the hover targets off the hex tier.
- `apps/web/src/views/MapView.vue`:
  - `paintShipCard` runs on hover, on pointer out and on every drawn frame.
  - `notePress` records whether the last press was touch.
  - `chartClick` lets a tap pin the card, and holds the comment for the later click.
  - Mounts `<PublicShipCardView>` over the canvas.
- `apps/web/src/workspace/PublicShipCard.vue` (new): the card, laid over the canvas, with `pointer-events: none` and tokens only.
- `apps/web/src/workspace/public_ship_card.ts` (new): the card's lines, an estimate of its height, and where it sits (beside the marks, or above or under them on a phone, always inside the map).
- `tests/web/public_ships_map.test.js` (new, 5 tests):
  - the feed, with and without `ships`, unknown keys, and the caps;
  - a dart per ship, names only at the names tier, "+N", one stack further out, and the diamond for an old hex;
  - hover targets that are never click targets (`partyAt` and `vesselAt` stay false), and no id in the drawn text or the card;
  - where the card sits;
  - nothing clickable in the card's source, and the comment and the tap branch in `MapView.vue`.
- `findings/public_ships/setup.mjs` and `README.md` (new): the local setup, rerunnable. It covers 0017 applied, a released `v10` row, two accounts, three ships (two on Regina 1910 and one on Roup 2007) and one referee-only member. The script fails if that member's name, a `cr_` id or the universe id is in the feed.
- `findings/ui_design_shots/kb21_public_ships_*` (17):
  - 1600 px: names, the far zoom (`chevron`), hover on the shared hex, hover on the single ship, and hover on the stack further out;
  - 390 px: names, the far zoom (`chevron`), and the tap card;
  - crowded at 1600 and 390 px: "+2", and its hover card;
  - an old server at 1600 px (names and the far zoom) and at 390 px;
  - a light preference at 1600 and 390 px.
- `directives/prompts/d_public_ships_map.md`: Progress lines only.

No change to `tokens.css`: the existing `--chart-public`, `--bg-0`, `--bg-1`, `--line-1`, `--text-1` and `--text-muted` cover it.

## Gates
npm test:      pass (1,733 tests: 1,701 pass, 0 fail, 32 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`, exit 0; `vue-tsc -b` for apps/web, clean inside the build)
fourth gate:   pass (`npm run build`: `index-B1a50xfr.js` 188.85 kB, gzip 63.93; `index-Yf2E9sJt.css` 26.30 kB)

**Browser:** Edge on my own ports: API 8794 with inspector 9294, Vite 5194 with its own cache, DevTools 9394. ref2 viewed ref1's Glass Wake. The feed and every card left out "Sennet Rho (referee only)". The page logged no errors. Every server and the browser are stopped, and ports 8794, 5194, 9394 and 9294 are free.

My local wrangler state now has 0015 to 0017 applied and a `v10` row in `truth_versions`. It is my scratchpad directory, not a shared one.

## Contract published
none

## Needs from others
- none
- For the orchestrator, when B's signed-out feed lands: `watchPublicGames` still asks only while signed in (`signedIn` in `map/public_games.ts`). Signed-out visitors see no ships until that guard is lifted, a one-line change in the file I was lent this pass. I did not lift it before B's server answers signed-out visitors.

## Questions for Johnny
1. When none of the people aboard a ship are published (none in the party, or all referee-only), what should the ship's card say? I recommend leaving out the "Aboard:" line, so the card shows only the ship's name, as built. The alternative is "Aboard: no one named", which tells a visitor that something is hidden.
