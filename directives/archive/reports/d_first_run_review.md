# D first_run_review report
Prompt: prompts/d_first_run_review.md
Status: done. Part 1 (the review) is written. Part 2 is done; two of its items were measured or weighed and deliberately not changed (the global rules and the modal frame), with the reasons below.

## Changed files
Part 1, read-only:
- `findings/first_run_review.md` (new): 19 findings, ranked, with the ten to fix first. Each has where, what happens, what was expected, a shot, severity, owner and a fix.
- Shots: `findings/ui_design_shots/kb16_*`.

Part 2:
- `apps/web/src/workspace/passkey/AccountPage.vue`:
  - Each passkey row says when it was added ("Added 2026-10-12").
  - A sign-out the server refuses keeps the person signed in on screen and says A's sentence under the button.
  - Link uses `link-social`.
- `apps/web/src/workspace/passkey/words.ts`: `addedOn` gives the house form for a real-world date (YYYY-MM-DD, as a journal entry's Played date), in the person's time zone.
- `apps/web/src/workspace/passkey/link.ts` (new): `POST /api/auth/link-social` with `{ provider, disableRedirect: true, callbackURL: '/account' }`, as the rewritten contract names it. A's client wraps only `sign-in/social`, which would sign in as another account. When A wraps `link-social`, this file goes.
- `apps/web/src/workspace/passkey/recovery.ts`: comment only (`router.ts` installs the guard now).
- `apps/web/src/views/Account.vue`: the router workaround is removed. The two global rules stay (see below).
- `tests/web/passkey_screens.test.js`: 2 more tests (12): the added date, and the link call (the route, the body, a refusal and a network fault passed through).
- `findings/passkey_screens_design.md`: the date, the link route, and the sign-out refusal.
- Pass scripts: `findings/passkey_pass_src/pk10.mjs`, `glob.mjs`.

## Gates
npm test:      1566 tests, 1542 pass, 1 fail, 23 skipped. The failure is `tests/api/public_games.test.js`, Lane B's new file for the public games work in progress, not mine.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes; `index` is 171.61 kB (gzip 57.90). Part 2 adds nothing to the first chunk; `SignInBody` is 16.44 kB and `AccountPage` 18.93 kB, as their own chunks.

During the pass, `vue-tsc` briefly stopped on duplicate identifiers in `packages/shared/src/index.ts` (Lane B, in flight). By the final build they were gone.

fourth gate:   pass. Edge headless with the virtual authenticator, on my ports (Vite 5197, API 8797, CDP 9397, inspector 9247), all stopped. On A's fixed client (pk10):
- The row says "kb16_new · Added 2026-10-12".
- **A refused sign-out:** the server's sign-out answered 500 with no code, which I stood in for by patching `fetch` for that one route.
  - The page stays on the account.
  - "Sign-out did not finish. You are still signed in." shows under the button.
  - `GET /api/me` still answers 200 (`kb16_signout_refused.png`).
- **A real sign-out** now ends the session: `GET /api/me` answers 401.
- **A closed prompt:** "You closed the passkey prompt.", in the muted colour (`kb16_closed_prompt.png`).
- **Adding a passkey the device already holds:** A's own "The passkey ceremony did not finish." No library sentence reached any screen.
- **A recovery code, then a reload on `/s/Spinward_Marches/1910`:** lands on `/account` with the recovery screen. That now comes from `router.ts`.
- **Adding a passkey finishes the session:** "Passkey added. 9 of 10 recovery codes are unused."
- **Not tried:** Link and Unlink in the browser, because no provider is configured locally. The unit test covers the call.

**Part 1 setup.**
- Signed out on https://traveller.voyage (1.1.10): a fresh Edge profile with extensions off (the machine's extensions otherwise open their own tabs in a fresh profile), at 1600 px, 520 px, and by keyboard.
- Signed in on my local build. I didn't make an account on production, because that writes to the live database, and passkey sign-up isn't live yet anyway.
- My private database had a stray test release (`vtest`) dated after `v5`, so my local map asked the CDN for a chart that doesn't exist. I dated it back in my own state only.

## The two global rules in views/Account.vue (`h1`, `p`)
- **Measured:** on eight screens (the map, a dossier, a mainworld, the orbit view, the Campaign panel, an empty hex in Build, `/packages`, `/account`), I read the computed style of every visible `h1` and `p` with the rules on and then off.
- **Margins:** almost every component sets its own.
- **What relies on them:**
  - The toast's sentence colour (`.toast-said`, on every screen).
  - Three dossier lines (`.doss-star`, `.doss-socio-stay`, `.doss-day-lead`, colour).
  - The packages page: its title (`.mk-title`, colour and letter spacing) and two unclassed paragraphs, which would gain a 16 px margin.
- **Not scoped**, because scoping them would change those screens. They are the app's only element reset; `design/base.css` has no `h1` or `p` rule. They belong in `base.css` as a stated reset, but that file is lent to me this pass for the frame only (see Needs).

## The modal frame
- **Not lifted.** It isn't the small, safe move the prompt allows.
- **Four files, not two:** `PersonCard.vue` and `PlanModal.vue` borrow the Lightbox's `.lightbox-card` class, and get its styles only because the Lightbox's chunk has loaded. The shared part is small (the fixed layer, the scrim, and nine card properties), but a correct lift changes all four components' markup. Two of them are outside this pass's files, and getting it wrong would restyle a person card and the deck plan.
- **Suggested:** a short prompt lending `Lightbox.vue`, `build/OrbitPicker.vue`, `PersonCard.vue`, `PlanModal.vue` and `base.css`, adding `.ui-modal`, `.ui-modal-scrim` and `.ui-modal-card`, with a before-and-after shot of each.

## Contract published
none

## Needs from others
- **Lane A:**
  - Wrap `POST /api/auth/link-social` in `account/passkey.ts`. My `workspace/passkey/link.ts` stands in until then.
  - From A's report: `AccountMenu.vue`'s Sign out ignores a refused sign-out. That file is mine but not in this pass's list, so I didn't edit it. It's a two-line change for my next prompt.
- **Orchestrator:**
  - Assign owners for the review's findings that sit outside lanes: the search box (`components/OmniBox.vue`), `shell/Rail.vue`, the panel host at 520 px, and `workspace/journal/`.
  - Lend `design/base.css` for the `h1`/`p` reset, and the four frame files.
- **Lane B:** `tests/api/public_games.test.js` fails in the full run.

## Questions for Johnny
1. Regina's page contradicts its own world profile. The profile says Atmosphere 8 (dense, breathable), Hydrographics 8 (water world) and Fluid Oceans. The cards say −84 °C, and the surface map is captioned "Ethane" and drawn as desert. For the best-known world in Traveller, a player reads this as broken. Should a charted mainworld's temperature and surface follow its UWP? I suggest yes: the engine owners look at why the physical model gives Regina −84 °C, citing the rules text, and a charted mainworld never shows a surface its UWP rules out. The alternative is to keep the model's result and say on the page why it differs from the profile.
2. The map a person builds on and the campaign they keep records in are both called "My campaign" (the build strip, the date chip and the Campaign panel). A new person can't tell whether Build changes the campaign or the map. Should the map have its own name? I suggest yes: the build strip says "Your map" and the universe's own name, and "My campaign" stays for the records. The alternative is to keep one name and say on the build strip that the campaign's records sit on this map.
3. The first screen shows the whole charted space as grey dots, with no name and no hint, and the long Zhodani column is its most striking shape. Should a first visit open somewhere readable? I suggest yes: open on the Spinward Marches at the subsector tier with Regina in view, with one dismissible line: "Search for a world, or select a hex to read its system." The alternative is to keep the galaxy view and add only the line.
