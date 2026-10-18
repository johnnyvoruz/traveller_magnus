# D star_numbers report
Prompt: prompts/d_star_numbers.md
Status: partial.
- Parts 1 and 3 are built and passed in the browser. Each has gaps that need Lane A or Lane B (below).
- Part 2 (density) isn't started: `directives/reports/b_generate_density.md` isn't written, and `findings/builder_density_ready.md` says density isn't on the store's call.

## Changed files
- `apps/web/src/workspace/build/EditField.vue`:
  - a number field shows the server's `lookup` as a muted placeholder, with "Looked up · To use another value, type it." under it;
  - an optional `unit` beside the box;
  - labels keep at least 88 px.
- `apps/web/src/workspace/build/hand.ts`: `unitOf` (the contract's four units) and `lookupWords` (four significant figures).
- `apps/web/src/workspace/build/HandDesigner.vue`:
  - passes the unit;
  - shows each roll message once (a body rolled again had its "Rolled this profile." repeated).
- `apps/web/src/workspace/build/job_toast.ts` (new): one toast per many-hex job.
  - Its words follow the job, and it has Stop. It's held for the whole run, then gives way to the result toast with Undo.
  - Stop says "Stopping." at once.
  - It comes back after leaving the map clears the toasts.
- `apps/web/src/workspace/build/acts.ts`, `grow_acts.ts`: start and end the toast.
- `apps/web/src/workspace/build/BuildPane.vue`:
  - progress under the Generate button, sharing one grid cell with the settings line (53 px idle and running, so nothing moves);
  - the bar over the pane's first line is gone;
  - held controls carry the hold sentence as their tooltip.
- `apps/web/src/workspace/build/BuildBar.vue`, `commands.ts`: the hold sentence on Edit, on More, and on the right-click menu's first held item.
- `apps/web/src/workspace/build/BuildStrip.vue`, `state.ts`:
  - the job chip is removed;
  - the strip's words are rewritten;
  - the note is reread;
  - new `JOB_HOLD`, `stripLine` and `yoursNote`.
- Tests: `tests/web/build_flight.test.js` (4 new: the job toast, the toast across a store change, the strip and note words, units and lookups).
- `findings/builder_system_design.md` §26, with its strings.
- Shots `findings/ui_design_shots/kb9_*`; pass scripts `findings/builder_pass_src/sn1.mjs` to `sn6.mjs`.

## Gates
npm test:      1426 tests, 1405 pass, 4 fail, all Lane C's surface work in flight:
- `surface_enhanced_map.test.js` ("a row of the sheet is the latitude the vanilla projection gives it");
- `surface_gl.test.js` ("orbit disc shaders match js/planet_gl.js");
- `surface_oracle.test.js` ("surface oracle is deterministic and matches fixtures");
- `surface_service.test.js` ("the page path paints when workers are unavailable").

All of Build's tests pass.

npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes (index 160.92 kB). Mid-pass it failed for a while on Lane A's `builder/store.ts` (an unused `UndoOutcome`), since fixed on their side.
fourth gate:   pass, with the gaps below. Production bundle (`vite build`, `vite preview` through my own config and dependency cache), my API on 8797 with its own state directory, CDP 9397, inspector 9247; all stopped after. Network slowed by CDP `Network.emulateNetworkConditions`, latency 2,500 ms.

**Star numbers** (Okyrhoe 1214, MgT2E by hand; keyboard only, Tab and typed text):
- **K1 V:** the four lookups (0.78 solar masses, 0.88 solar diameters, 5040 kelvin, 0.4502 solar luminosities) are in the server's first form. But they show only **after the first change**: Lane A's `cloneForm` drops `lookup` (below).
- **Typing:** Mass 1.2 was stored (1 change), with no lookup line. Diameter 2: Luminosity follows, "2.325 Looked up". Mass cleared: the lookup is back ("0.78 Looked up").
- **A bad number** (temperature 0): the server refused it, but the sentence shows **at the top**, not at the field, and reads "This field cannot hold that. Type a finite number above 0." (both causes below).
- **A classless star:**
  - With no numbers, Roll profile on its world **rolled** the cells (Y6A40000). The contract says "Set Type, Subtype, and Class." (below).
  - With Mass only: "Set Diameter and Temperature." under the Profile heading, and nothing written.
  - With all three: rolled (Y6101358), with Luminosity "0.6914 Looked up".
- **Roll twice** on Okyrhoe A-I: ········ → HB870000 → YBCA0000. The bar's count didn't move for the second roll.
- **A blank hand system** (0101): a new star shows no lookups. Set to G2 V, it shows 1.02, 1.04, 5840 and 1.133, all looked up.
- Shots at column, half, full and 520 px: `kb9_star_*`. At 520 px every label shows whole.

**A subsector job** (G, by keyboard):
- **At +150 ms:** "0 of 80 generating · Stop" under the button, the tally still in view, and the toast "Generating 80 hexes · 0 of 80 Stop".
- **No shift:** the slot is 53 px idle and 53 px running. Layout shift from the press to the end was 0.0021, from the pane's counts changing at the end.
- **The toast stays** with the pane closed (`kb9_job_pane_closed`).
- **Stop from the toast:** "Stopping. Generating 80 hexes · 0 of 80" at once, then the result toast "Generated 80 systems in Subsector L." with Undo, which I pressed. This local server lands all 80 between two polls, so the stop came too late to keep any out.
- **Away and back** (the account page by the app's router): the account page has no toast strip, so nothing shows there (below). Back on the map, the job had finished while I was away, and its result toast with Undo was there.
- Shots at column, half, full and 520 px during a job: `kb9_job_*`.

## What a person can and can't do while a job runs
- **Free, and they work:** pan and zoom, open a system or a world, the orbit view, select other hexes (box, Shift+click, a subsector), leave Build, leave the map. Nothing guards them, and none writes.
- **Held, because they would write the map while the job writes it:**
  - Generate, Generate with, Blank system, Edit, Design by hand, Remove, Restore, and the More menu (with Publish).
  - Where: the `busy` guard in `canBuild` (`commands.ts` 91), and the store's own refusal, "A build is already running."
  - Each says why, at the control: "While hexes are generating, you can't change systems. To change one now, select Stop."
- **Not unblocked:** keeping or rolling a preview, and opening a draft. They'd need Lane A's store to take a second write while a job runs, and to settle what a job does to a hex with a draft open. I didn't ask for that.

## Contract published
none

## Needs from others
- **Lane A,** `apps/web/src/builder/draft.ts` `cloneForm` (line 104): copy `lookup`, so the first form shows the star's lookups. One line:
  ```ts
  ...(field.lookup !== undefined ? { lookup: field.lookup } : {}),
  ```
- **Lane A,** a field refusal: put the server's sentence on its field (`details.code` `field`, `details.id`, the contract's "Codes the browser reads"). Today it reaches the editor as a loose message at the top. This is the queued "read B's three codes" item.
- **Lane A,** a job across routes: leaving the map closes the builder store (`bind.ts` `close`), which clears every toast (`store.ts` 1152). The job goes on, its old store keeps following it, and its result toast arrives later.
  - I put the job's toast back when the next store opens.
  - To show it on the account page as well, the toast strip would have to live in the app shell rather than in `MapView` and `OrbitView`. That's `shell/`, which isn't mine.
  - Untested: whether Undo on a result toast minted by the closed store still works on the new one.
- **Lane B,** `packages/generation/src/hand.ts` `fieldLabel` (line 200): it takes the leaf after the first dot. `star.0.temp` becomes `0.temp`, so every hand field with a numbered owner refuses as "This field cannot hold that. …" instead of "Temperature cannot hold that. …".
- **Lane B,** the roll on a classless star with none of the four numbers rolled the world's profile. The contract says it answers "Set Type, Subtype, and Class."
  - Repro: Okyrhoe, Add star, Add world, give the world to the new star, Roll profile.
- **Whoever owns `shell/ToastStrip.vue`,** optional: a toast that can show a spinner (a `busy` flag), and an action that doesn't close its toast. With those, the job's toast would turn the way the button does, and Stop wouldn't swap toasts.

## Questions for Johnny
1. The strip's words. I built the first of these and suggest keeping it:
   1. "YOUR MAP / The Spinward Run · your copy of the published chart". The version is in the tooltip: "The Spinward Run is your copy of the published chart, version v5".
   2. "The Spinward Run · only you see your changes". Says the same from the point of view of who can see it, but doesn't say it's a copy.
   3. "Editing The Spinward Run, your own copy of the chart". A sentence, but "Editing" is wrong while nothing is being edited.
2. The note, reread to the same standard: "This map is your own copy of the published chart. What you generate, change, or remove stays on your map, and nobody else sees it unless you publish a package." Is that right? I suggest yes. It names the map the way the strip does, and says what happens and who sees it, in two sentences.
3. While a job runs, preview, Keep and opening a draft stay held, with the sentence at the control. Is that acceptable for now? I suggest yes: unblocking them needs Lane A's store to take a second write during a job. Looking, navigating and selecting are already free.
