Found: the prompt's Progress was empty, and no report existed. Git had no edits in Lane A's files.
Finished: `linkProvider`, the public-games feed, and the diamond on the chart.
Backed out: nothing.

# A public games feed report
Prompt: prompts/a_public_games_feed.md
Status: done

## Changed files
- apps/web/src/account/passkey.ts: `linkProvider(provider, callbackURL)` posts `{ provider, disableRedirect: true, callbackURL }` to `POST /api/auth/link-social`. A refusal keeps the server's code and sentence, including `{ code: 'SOCIAL_ACCOUNT_ALREADY_LINKED', message: 'Social account already linked' }`. `startSocial` is unchanged.
- findings/passkey_client.md: one paragraph for `linkProvider`.
- apps/web/src/map/public_games.ts: the feed. It lives in `map/` because it is a read of the chart, keyed by the pin and the sectors on screen. The builder store is the referee's own rows.
- apps/web/src/map/MapRenderer.ts: `setPublicGames` and one draw. The diamond is not a hit target.
- apps/web/src/map/glyphs.ts: the diamond's offset from the hex centre.
- apps/web/src/map/theme.ts: reads `--chart-public`.
- apps/web/src/design/tokens.css: `--chart-public: #c4b5fd`.
- tests/web/passkey_client.test.js, tests/web/public_games.test.js.

The feed calls `GET /api/public-games?truthVersion=&sector=` once per sector while that sector stays in view. A sector that leaves and comes back is not asked again for 60 seconds. Signed out, a null pin, or a slug that is not a chart slug (anything starting with `~`) makes no call. 401, 429, 5xx, a body that cannot be read, and offline store no marks and do not ask again during that visit.

The server allows 60 calls a minute. This client allows 12. At the hex tier a sector is about 720 by 1040 pixels, so an 8K screen can show about 72 sectors. The worst case is those 72 arriving together: 12 calls go out, and the rest wait until a stamp is 60 seconds old. The test puts 40 sectors up at once, sees 12 calls, then 12 more after 60 seconds, and no 60-second window holds more than 12.

The server's read joins every public universe on that pin and sector. The answer has no universe id, so the viewer's own game is in the feed. A hex whose count is 1 and whose name is the open universe's name is dropped here. A hex with more than one game has `name: null`, so that count is left as the server sent it.

`{ hexes: [] }`, which is what the live server returns before migration 0013, draws nothing.

The mark is a stroked diamond in `--chart-public`, up and to the right of the world disc. It is drawn only at the hex tier. The universe's name, or the count when the count is greater than one, is drawn at the same zoom as hex labels (`PPP_NAMES`). `partyAt` and `vesselAt` do not read it, so a click still lands on the hex. An empty set returns before the canvas is touched: the draw's call count matches a frame with no public games.

Draw time for the whole frame, hex grid included, on a quiet run: 0 marks 27.68 ms, 10 marks 16.94 ms, 200 marks 21.67 ms. In the full suite the same frames were 49.50, 58.76, and 45.32 ms. The 10-mark frame was slower than the 200-mark frame, so the grid and the machine dominate. Zero marks add no canvas calls.

The index chunk is `index-CId6R2dG.js`, 175.31 kB, gzip 59.12. The previous accepted figure was 171.50 kB. This working tree also holds other lanes' web edits, so that delta is not the feed. The index contains `--chart-public` and does not contain `zod`, `safeParse`, or `/api/public-games`. `link-social` is only in the account page chunk, from Lane D's stand-in. `linkProvider` is dropped by the bundler until something calls it.

`MapView.vue` was not edited. Lane D adds the import and, in `frame()` after `renderer.draw`:

```ts
import { publicGamesOverlay, watchPublicGames } from '../map/public_games.ts';

const open = universeNow();
watchPublicGames({
    signedIn: session.user !== null,
    truthVersion: version ? version : null,
    sectors: drawn.tier === 'hex' ? drawn.sectorsOnScreen : [],
    ownName: open && open.truthVersion === version ? open.name : null,
}, markDirty);
renderer.setPublicGames(drawn.tier === 'hex' ? publicGamesOverlay(drawn.sectorsOnScreen) : null);
```

`watchPublicGames` is safe on every frame. The second argument runs when a request settles, so the map draws the marks. Pass an empty sector list when the tier is not hex, so a sector that was on screen starts its 60 seconds.

Lane D's account page should call `linkProvider(provider, '/account')` and delete `workspace/passkey/link.ts`. That is already item 7 of `prompts/d_first_run_fixes.md`.

The map was not clicked in a browser. The marks are not on screen until those lines land in `MapView.vue`.

## Gates
npm test:      pass (1562 pass, 0 fail, 24 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   pass (`tests/web/public_games.test.js`, `tests/web/passkey_client.test.js`)
npm run build: pass. Index chunk `index-CId6R2dG.js` 175.31 kB, gzip 59.12. No zod in that chunk.

## Contract published
none

## Needs from others
- Lane D: the `MapView.vue` lines above, and item 7 of `d_first_run_fixes.md` (`linkProvider`, then delete `workspace/passkey/link.ts`).

## Questions for Johnny
1. When several public games share a hex, the feed sets `name` to null and does not say which universe is the viewer's. The client cannot take the viewer's own game out of that count, so the count is drawn as the server sent it, including the viewer's game when public games are on. Suggested answer: leave that count. The exact fix is for the server to omit the caller's row. A name match is the only signal the answer allows, and it works only when the hex has one game.
