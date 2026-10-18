Found: a restart. The sign-in card, items 1 to 5 and finding 16 were written and unit-tested by the frozen session; its browser shots (`kb18_*`, 13:12 to 13:24) existed but no result was recorded, no gate had been pasted, and item 7 was not started. No server of its was still running.
Finished: item 7 (`linkProvider`), all four command gates, the whole browser pass again on my own ports, and two faults that pass found (below).
Backed out: nothing.

# D first_run_fixes report
Prompt: prompts/d_first_run_fixes.md
Status: done (the sign-in card, items 1 to 5, finding 16 and item 7). Finding 12 is not done: see "Needs from others". Item 8 was held by the prompt.

## Changed files
- apps/web/src/workspace/passkey/SignInBody.vue: the card's order is now "Create an account" (filled), "Or sign in with another account" and the provider rows, the passkey's "Sign in" (plain), "I lost my passkey" directly under it. The fingerprint sentence is off the card. A refusal is said under the control it answers. Focus on opening lands on the top button; `ready` is emitted one tick later so that, in a browser with no passkeys, the top button is the first provider (found in the browser pass: focus went to the page body).
- apps/web/src/workspace/passkey/words.ts: `SIGN_IN_PASSKEY` is "Sign in". `PASSKEY_EXPLAIN` stays in the file because the account page's passkey list still reads it (`AccountPage.vue` line 435).
- apps/web/src/workspace/passkey/AccountPage.vue: linking a provider calls Lane A's `linkProvider(id, '/account')`.
- apps/web/src/workspace/passkey/link.ts: deleted (item 7).
- apps/web/src/workspace/first_visit.ts (new): what a first visit is, where it opens, the stored view, when the line of help shows.
- apps/web/src/workspace/FirstHint.vue (new): the one line under the search field, with a Dismiss button.
- apps/web/src/workspace/build/clear.ts (new): where Clear leaves the map.
- apps/web/src/views/MapView.vue: the opening camera for a bare address; the view at rest stored per browser; the line of help; `clearSelection()` for the strip's Clear and for Esc; `startBuild` for the strip's first step; the tier handed to the strip; a re-read of the route no longer moves a camera that was already aimed for that path.
- apps/web/src/workspace/build/BuildStrip.vue, state.ts: Build's first step (`firstStep`), one note and one button under the strip.
- apps/web/src/workspace/build/BuildPane.vue, GenerateSheet.vue: the two "universe" strings (item 2).
- apps/web/src/workspace/build/HandDesigner.vue: the two sentences of finding 8.
- apps/web/src/workspace/build/edit.ts, undo_words.ts: Undo after Blank system says "Removed the blank system at 1409." (finding 16). `runUndo` now returns whether everything was put back; no new machinery.
- tests/web/first_run_fixes.test.js (new, 12 tests), tests/web/passkey_screens.test.js (the card's order and label; the `link.ts` test replaced by one for `linkProvider`).
- findings/builder_system_design.md §32; shots `findings/ui_design_shots/kb18_*`.

### What the prompt asked me to say

- **What "first visit" is keyed on (item 1):** this browser's storage holds no `voyage_last_view`. The camera is written there each time it comes to rest. A bare address then opens on the stored view; with none, on the Regina subsector of the Spinward Marches (`/s/Spinward_Marches/sub/C`) framed whole. Where the whole subsector would be drawn too small for names (a window shorter than about 850 px or narrower than about 660 px, worked out from the frames measured at 1600 × 1000 and 520 × 900), it opens on Regina itself at the zoom where names show: this was the second fault the browser pass found (at 520 px the first view had dots and no names). An address that names a place or carries a camera always wins. A browser that refuses storage (a private window) is a first visit every time.
- **The line of help** is remembered in `voyage_first_hint_done`: set by Dismiss or the first time any hex is opened. It is hidden while a pane is open or Build is on, and shown again after, until it is done.
- **Every string changed for "Your map" (item 2):**
  1. BuildPane.vue: "this universe's settings" is now "your map's settings".
  2. GenerateSheet.vue: the heading "Settings · this universe" is now "Settings · your map".
  The strip already read "YOUR MAP" over the universe's name and is unchanged. A test now fails if any Build template says "universe" to the person.
- **Which is which:** the strip (top right) is the map. The date chip beside the search field is the campaign's ("No campaign date", `StardateChip`), and the Campaign panel's "MY CAMPAIGN" is the records'. I changed neither.
- **Clear (item 3):** Clear and Esc empty the selection and go back to the address the selection was started from, with the camera where it is. Started from the bare map: the bare map, no pane. Started from one hex: that hex's pane. Started inside a sector's or subsector's own pane: that address with the pane shut.
- **Build's first step (item 4):** far out, "To build, first go to a sector and zoom in until you see the hexes. Then select an empty hex, and select Generate a system." with **Go to the Spinward Marches**; at the sector tier the same with **Zoom in**; where hexes show, "Select an empty hex, and then select Generate a system. To fill an area, turn on Select hexes and drag across it." with **Select hexes**. It is not shown again once this browser has generated or designed a system (`voyage_build_started`).
- **The designer (item 5):** "To add a star, select Add star." The second sentence follows the bar: "To leave the designer, select Close." with no changes, "To undo every change in the draft, select Discard." once there is one.
- **Other lines on the sign-in card:** I removed only the fingerprint sentence. I see no other helper text about passkeys on the card; "I lost my passkey" and the no-passkey note are controls and fallbacks, not helper text.

## Gates
npm test:      pass (1605 tests, 1578 pass, 0 fail, 27 skipped)
npm run check: pass ("manifesto: clean")
typecheck:     pass (`tsc --noEmit -p apps/api`; the web's `vue-tsc -b` passes inside the build)
npm run build: pass. `index-DC_ibpbr.js` 176.61 kB, gzip 59.54 kB (176.38 kB before the two fixes from the browser pass; the board's figure at 20:00 was 175.34 kB)
fourth gate:   pass. Headless Edge, a fresh profile with extensions off, my own API (8794, private state), Vite (5194, own cache, the chart from production) and DevTools port (9394). All three stopped after; the ports are free.

Seen in the browser:
- **First visit** (1600 × 1000, empty storage): opens on the Regina subsector, Regina named and in view, the line under the search field. **Second visit** on the bare address: the view the map was left on, after a drag as well. **Addressed** (`/?x=0&y=0&z=1`, `/s/Deneb`): the address wins. **520 × 900 and 1100 × 800:** Regina centred with names.
- **The line of help:** Tab reaches Dismiss after the search field; Enter removes it and focus goes to the chart; it stays gone after a reload; opening a hex ends it too.
- **The card**, signed out: the rail pop-up, the Campaign panel at column, half and full, `/account`, and 520 px, with three providers and with none: the order and labels as ruled, nothing spilling, no sideways scroll. Focus on opening is on "Create an account"; Tab order is Create, X, Discord, Google, Sign in, I lost my passkey. Create opens its form in place, Esc returns focus to it; Back from the recovery form returns focus to the lost link. With no passkeys: the note, "Sign in with X" filled and focused; with no passkeys and no providers: the note alone.
- **Signed in** (a local sign-up with a virtual passkey): Build's step at the three tiers, by Enter and by pointer, and at 1100 and 520 px; Clear by pointer, by keyboard (Enter on Clear) and by Esc, from the bare map, from one hex, and from inside a subsector's pane, at column, half and full: never the whole sector. The designer's two sentences against the bar (Close, then Discard after Add star). Undo after Blank system, by keyboard: "Removed the blank system at 2003."
- No console error or exception in any run.

Not exercised: a real provider round trip for `linkProvider` (local has no provider secrets; Lane A's unit test covers the call, and mine checks the page calls it with `/account`). A private window (storage refused) was reasoned, not run.

## Contract published
none

## Needs from others
- Lane A: **finding 12 is not in my files.** Today neither `/s/Spinward_Marches` nor `/s/Spinward_Marches/sub/C` opens a pane on a bare address (both need `?panel=dossier`), so the two no longer disagree, but a subsector address still opens no subsector pane. Which pane an address opens is decided by `addressPane` in `shell/pane.ts`. If Johnny wants a subsector (and a sector) address to open its pane, that function needs to answer the open pane for those two views; nothing changes on my side.
- Lane E (`shell/Rail.vue`): nothing needed this pass.
- Orchestrator: the board's "Then: A's feed lines in MapView.vue, the public games switch, the Build pitch on the sign-in card" are untouched; they are `d_public_games_wire.md`.

## Questions for Johnny
1. A new account's strip still reads "YOUR MAP / My campaign", because the map and the campaign are one thing with one name, and the app names a new one "My campaign" (`campaign/store.ts`, Lane A). Recommended answer: leave the strip as ruled, and have Lane A name a new one after the person, for example "kb18_new's map", or simply "My map", so the strip no longer says "campaign". The other choice is to leave it: the label "Your map" already sits above the name. Which do you want?
2. In a small window (shorter than about 850 px or narrower than about 660 px) the whole Regina subsector cannot be shown with names, so a first visit there opens on Regina itself, centred, with names readable, and part of the subsector is off screen. Recommended answer: yes, keep that; names matter more than seeing the whole subsector. The other choice is the whole subsector with dots and no names. Is the recommended one right?
3. Should a subsector's address (and a sector's) open its pane without `?panel=dossier`, as finding 12 asked? Recommended answer: yes for both, as one small Lane A change, so a shared link shows the subsector's name and worlds. Today both open the map only.
