Found: a fresh start for this prompt. Its Progress was empty, no report existed, and nothing in my files was half-done for it.
Finished: the feed's lines, the switch, the Build pitch, the gates and the browser pass.
Backed out: nothing.

# D public_games_wire report
Prompt: prompts/d_public_games_wire.md
Status: done, with two faults found and not fixed (both in "Needs from others") and one line owed by Lane E before the Build pitch can be seen.

## Read this first

1. **Another person's game is hidden when it has the same name as the viewer's own campaign.** Every new account's campaign is named "My campaign", so two new accounts never see each other. Seen in the browser: the server's feed answered `{"hexes":[{"hex":"1910","count":1,"name":"My campaign"}]}` and the map drew nothing; after the viewer renamed their own campaign, the diamond appeared. The cause is `dropOwn` in Lane A's `map/public_games.ts`, fed by the `ownName` line the prompt told me to add exactly as written. The server already leaves the caller's own games out, and the contract says "Do not subtract them again in the browser." I added the lines as written and did not change them.
2. **The account menu cannot be seen while a panel is open.** The pop-up is drawn under the panel: it opens, takes focus and answers the keyboard, but nothing shows. This is older than this pass (no stacking rule changed), and it now hides the switch too. A new account opens with the Campaign panel showing, so a new person meets it at once.

## Changed files
- apps/web/src/views/MapView.vue: the import and, in `frame()` after `renderer.draw`, the `watchPublicGames` and `renderer.setPublicGames` lines, as written in Lane A's report. An empty sector list is passed when the tier is not hex.
- apps/web/src/workspace/public_games.ts (new): the switch's words, the PATCH, and the value the server last answered. A universe with no `publicGames` field answers null, and null shows no switch.
- apps/web/src/workspace/AccountMenu.vue: the switch, under "Rename", with its sentence; the arrow keys walk it with the other items; the pop-up clears `signInFrom` when it closes.
- apps/web/src/workspace/account.ts: `SIGN_IN_PITCH_BUILD`, `signInFrom`, `signInPitch`.
- apps/web/src/workspace/passkey/SignInBody.vue: the card's first paragraph is `signInPitch(signInFrom)`.
- tests/web/public_games_wire.test.js (new, 6 tests).
- findings/builder_system_design.md §33; shots `findings/ui_design_shots/kb19_*`.

### What was built

- **Where the switch is:** the account menu at the rail's foot, directly under "Rename <name>". That menu already holds the universe's own settings (rename, delete, export, import), so it is where a referee would look. It acts on the open campaign.
- **What it reads:** "Show my party on other maps", with "On" or "Off" at the right. Under it: "When this is on, people on the same published chart see one mark on your party's hex, with this campaign's name. They see nothing else."
- **How it behaves:** off by default. It is a checkbox menu item (`aria-checked`); Enter, Space or a click turns it. The value shown is the server's answer. On success a toast says "Other people on this chart now see <name> where your party is." or "<name> is no longer shown on other maps." A refusal (401, 403, 404, 400, 503) is said in the server's sentence in the menu's alert line, and the switch stays as it was. Focus stays on the switch.
- **Absent is not on:** a universe without `publicGames` shows no switch and no sentence.
- **The pitch:** opened from Build, the card reads "Sign in to use Build. It generates systems on a copy of the map that's yours." From anywhere else it keeps today's two sentences. The card learns where it was opened from through `signInFrom` in `workspace/account.ts`; the pop-up sets it back to null when it closes.

## Gates
npm test:      2 fail, neither in my files (1639 tests, 1610 pass, 27 skipped). Before the other lanes' latest edits, the same tree with my work was 1611 tests, 1584 pass, 0 fail.
- ✖ `tests/golden/esm.test.js`: "esm profile_regina matches legacy fixture" (Lane Z, engine output in flight).
- ✖ `tests/web/surface_enhanced_map.test.js`: "the sea of a body is decided by seas.ts, and the caption says what was drawn" (Lane C, `surface/` in flight).
npm run check: pass ("manifesto: clean")
typecheck:     pass (`tsc --noEmit -p apps/api`; the web's `vue-tsc -b` passes inside the build)
npm run build: pass. `index-ZOUNurMl.js` 179.75 kB, gzip 60.68 kB (176.61 kB after my last report). The 3.1 kB is Lane A's feed module, now imported by the map view; the chunk holds no zod.
fourth gate:   pass, with the two faults above. Headless Edge, a fresh profile; my own API on 8794 with a private state, Vite on 5194 with its own cache, DevTools on 9394. All stopped after; the ports are free.

Seen in the browser, with migrations 0013 and 0014 applied:
- Two accounts, each signed up with a passkey, each with a campaign on chart v5.
- Account 1: a vessel placed at Regina (1910) and chosen as the party's ship. The menu shows the switch, Off. The arrow keys reach it; Enter turns it on; `GET /api/universes` then says `publicGames: true`; the toast is shown. Its own feed is `{"hexes":[]}` and its own map draws no diamond.
- Account 2: one diamond and the name "My campaign" on 1910 (`kb19_seen.png`), once its own campaign had a different name. With the same name: nothing drawn (fault 1). At the sector tier nothing is asked for or drawn.
- Account 1 turns the switch off by pointer: the toast, `aria-checked="false"`. Account 2's next load of the sector: the feed is empty and the diamond is gone.
- The pitch: with `signInFrom` set to "build" the card reads the Build line at 1600 × 1000 and at 520 × 900, nothing spills; after the card closes the next opening reads today's line.

Seen against an API without 0013: `GET /api/universes` has no `publicGames`; the menu has no switch and no sentence; the feed answers `{"hexes":[]}`; no mark, no alert, no toast, no console error. The PATCH, called by hand, answers 503 "Public games are not available yet."

Not exercised: the 503 sentence shown in the menu (no switch exists to press without 0013; the unit test covers each refusal). The rail's own Build item showing the Build pitch (it needs Lane E's line below; pressed today, it shows the old line).

## Contract published
none

## Needs from others
- Lane E, `shell/Rail.vue`: for the Build pitch, in `onLocked`, before the `run('account')` line, add
  `signInFrom.value = which === 'build' ? 'build' : null;`
  and to the import from `../workspace/account.ts` add `signInFrom`. Nothing else: the pop-up clears it on close.
- Lane A, `map/public_games.ts` (fault 1): remove `dropOwn` and the `ownName` field, since the server leaves the caller's own games out. Until then, the one-value change on my side is `ownName: null` in `MapView.vue`; I did not make it, because the prompt says "exactly as written". Say which you want.
- Orchestrator (fault 2): the account pop-up under an open panel. `.account-pop` (z-index 9) lives inside `.map`, which is `position: fixed` and so a stacking context of its own; the panel (z-index 3) is outside it and wins. The house pattern is to teleport a floating menu to `body`. `AccountMenu.vue` is mine: give me a prompt and I will do it, with the rail's position variables carried over.
- Lane Z and Lane C: the two red tests above.

## Questions for Johnny
1. Two new accounts both have a campaign named "My campaign", and today a public game with the same name as your own campaign is not drawn on your map. Recommended answer: draw every game the server sends, since the server already leaves your own out. This is a small change in Lane A's file. The other choice is to keep hiding same-named games. Which do you want?
2. The switch sits in the account menu under "Rename", and reads "Show my party on other maps" with the sentence "When this is on, people on the same published chart see one mark on your party's hex, with this campaign's name. They see nothing else." Recommended answer: keep the place and the words. The other place it could go is the Party panel, next to "Choose the ship", because the mark follows the party's ship. Is the menu right, and are the words right?
3. Turning the switch on shows nothing to other people until the campaign has a party ship that is somewhere on the chart, and the menu does not say so. Recommended answer: add one line under the switch when it is on and the party has no place: "Your party isn't on the chart yet. Choose the ship and set where it is." The other choice is to leave it. Do you want that line?
4. With a panel open, the account menu opens underneath it and cannot be seen. Recommended answer: fix it now, ahead of the push, because a new account starts with the Campaign panel open and so cannot find the menu or the switch. The other choice is to push without it. Which do you want?
