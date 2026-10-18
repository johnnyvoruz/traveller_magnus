# D publish_single report
Prompt: prompts/d_publish_single.md
Status: partial. Part 1 is built and passed. Part 2 is skipped because `findings/builder_roll_again_ready.md` wasn't on disk when I reached it.

## Changed files
- `apps/web/src/dossier/DossierPanel.vue`: the one held line and its imports.
  - Line 508: `<PublishForm v-else-if="marketUi.open && buildMode === 'system'" class="build-pane" :keys="[hexKey]" />`, just before `<SystemEditor v-else-if="drafting" …>`.
  - Lines 21–22: `import PublishForm …` and `import { marketUi } …` (two import lines, one per module).
  - Differences from the prompt's line:
    - `buildMode === 'system'` keeps the form from replacing a dossier when Build is off.
    - `class="build-pane"` gives the form the pane's padding.
  - Nothing else in the file changed, including the surface map's lines.
- `apps/web/src/workspace/market/market.ts`:
  - New `EMPTY_ALONE`, `canPublish` and `removedWords`.
  - `kindOfKeys` gives "system" for one hex.
  - The kind problem now reads "Enter a kind, for example system or subsector."
- `apps/web/src/workspace/market/PublishForm.vue`:
  - Says under the summary when hexes go in as deleted hexes.
  - The Kind hint now names "system".
  - Opened on one system, the form closes when you select another hex, when it leaves the pane, or when a draft or a preview opens.
- `apps/web/src/workspace/build/commands.ts`: `build-publish` runs for one system, one removed hex, or many hexes with one that holds something. It never runs over an open draft or preview.
- `apps/web/src/workspace/build/BuildBar.vue`: the More item's second line fits one system or one removed hex.
- `apps/web/src/workspace/build/BuildPane.vue`:
  - The form also shows for one removed hex.
  - The empty hex's fine print ends "An empty hex has nothing to publish."
- `tests/web/market_screens.test.js`: 1 new test (offered or not, the kind, the one-hex summary, the deleted-hex sentences).
- `findings/marketplace_screens_design.md`: §1, §2 and the strings in §4.
- `findings/builder_system_design.md` §24: what touches Build, plus its strings table.
- Shots: `findings/ui_design_shots/km3_*`.
- Pass scripts: `findings/builder_pass_src/ps1.mjs`, `ps2.mjs`, `ps3.mjs` and `vite.d.config.mjs`.

## Gates
npm test:      pass. 1400 tests, 1384 pass, 0 fail (the rest skip without RUN_API_TESTS). Lane C's three files pass too.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes too; the entry chunk is index 162.97 kB.
fourth gate:   pass. Headless Edge on my ports (API 8797, Vite 5197, CDP 9397, inspector 9247), all stopped after. The fake store was installed from the dev console, as before; nothing in the app imports it.
- Regina (1910), one filled system, by pointer:
  - The More menu shows "Publish selection… / Shares this system and its records as a package".
  - The form takes the dossier's place: "1 hex in Spinward Marches · 2 records", with Kind "system" and focus on Package.
- Shots at half, column, full and 520 px: `km3_form_*`.
- Cancel: the dossier text matches what it was before, and the form is closed.
- By keyboard:
  - Palette → Enter → Tab through Title, Kind, Description, Tags → Enter.
  - The page opens at `/packages/…?version=1` and moves from "Publishing" to "Published version 1." with 1 hex and 2 records (`km3_published`).
- Escape closes the form. Selecting another hex (1911) closes it, and going back to Regina shows the dossier.
- Removed chart system:
  - I removed Regina from my map. The palette then opened the form with "You removed this system from your map. It goes in as a deleted hex." (`km3_removed`).
  - Cancel, then Restore to the chart: Regina is back.
- Empty hex (0101 in my own sector):
  - There is no Build bar, so no More menu.
  - The fine print ends "An empty hex has nothing to publish." (`km3_empty`).
  - The palette still lists the command (see the note below), and choosing it opens nothing.
- Roll twice: not run, because part 2 is skipped.
- No page errors.
- The Kind hint changed after the `km3_form_*` shots, so they show the old hint. `km3_removed` shows the new one.

Two notes from the pass:
- The palette lists every registered command, whether or not it can run.
  - That's `components/OmniBox.vue`, not mine.
  - So "not offered" holds for the More menu and the pane, but the palette still lists the name. The command does nothing there.
  - If the palette should hide commands that can't run, that's a one-line change in `OmniBox.vue` for whoever owns it.
- My first Vite got 504 on every pre-bundled dependency.
  - Another dev server rebuilt the shared `apps/web/node_modules/.vite` under it.
  - I now start mine with its own cache (`findings/builder_pass_src/vite.d.config.mjs`). Other lanes can do the same, so a running server never breaks another lane's.

## Contract published
none

## Needs from others
- Lane A: `findings/builder_roll_again_ready.md` (`prompts/a_roll_again.md`). Part 2 waits for it, and it's about 10 lines on my side:
  - drop the `rollNote` sentence;
  - keep the button on;
  - add one test.
- Owner of `components/OmniBox.vue`, optional: skip a command whose `runnable()` is false, as `Rail.vue` and `handleKey` already do.

## Questions for Johnny
1. A removed hex has no Build bar, so publishing it as a deleted hex is only in the palette. Is that enough? I suggest yes: it's a rare act, and the form says plainly what happens. The alternative is a "Publish selection…" button in the removed hex's pane.
2. Should the palette hide commands that can't run, such as "Publish selection…" on an empty hex? I suggest yes, in `OmniBox.vue`. Today it lists them, and choosing one does nothing, with no message. That file isn't mine.

## Progress
See `prompts/d_publish_single.md`, Progress.
