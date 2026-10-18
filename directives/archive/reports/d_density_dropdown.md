# D density_dropdown report
Prompt: prompts/d_density_dropdown.md
Status: done. The blocked first report is filed as `reports/done/d_density_dropdown_blocked.md`.

## Changed files
Lent edits first, for Lane A:
- `apps/web/src/builder/screen.ts`, `generateMany` only: a fourth argument `density`, put on the body only when it's named:
  ```ts
  ...(density ? { density } : {})
  ```
  Nothing else in `builder/` changed.
- `tests/web/builder_store.test.js`: one test beside Lane A's density tests, "the screen adapter passes density through on many hexes when named, and omits it when not".

Mine:
- `apps/web/src/workspace/build/seam.ts`:
  - `Density`;
  - `density?` on `generateMany` and `GrowBody`;
  - `skipped`, `leftEmpty`, `placed` and `landed` (optional) on `JobProgress`, `GrowProgress` and `FollowedJob`'s progress.
- `apps/web/src/workspace/build/state.ts`:
  - `build.density`;
  - `DENSITIES`, `DEFAULT_DENSITY` (`standard`), `cleanDensity`, `densityLine`, `generateWords`, `jobLabel`;
  - `readDensity` and `setDensity` (per universe);
  - `jobLine` says "hexes checked";
  - `jobToast` uses `placed.length` and `leftEmpty`, with `NOTHING_NEW` for a run that writes nothing.
  - Progress without the new fields keeps today's words.
- `apps/web/src/workspace/build/GenerateSheet.vue`:
  - the "Hexes to fill" select for many hexes, with a one-line hint;
  - the submit says "Generate up to N" unless Every;
  - the choice is saved for the universe.
- `apps/web/src/workspace/build/BuildPane.vue`:
  - the Generate button for many hexes says "Generate up to N hexes", with the choice on a second line; the slot act says "up to" too;
  - the progress under the button reads "N of M hexes checked · K systems so far".
- `apps/web/src/workspace/build/commands.ts`: the right-click menu's Generate item for many hexes, the same words with the choice as its second line.
- `apps/web/src/workspace/build/acts.ts`, `grow_acts.ts`:
  - pass `density`, label the job, and feed the marks from each step;
  - the density is read for the universe when Build's universe changes;
  - the grow progress keeps the new fields.
- `apps/web/src/workspace/build/flight.ts`: marks from `placed`/`landed` and the checked count, in place of revisions.
- `apps/web/src/workspace/build/BuildMarks.vue`: reads the new split.
- `apps/web/src/workspace/build/job_toast.ts`: a followed job carries the new counts and feeds the marks.
- Tests: `tests/web/build_flight.test.js`:
  - a job that lands in three steps, including a left-empty hex going back to plain;
  - a store without the counts;
  - the slot rename;
  - the words before, during and after, for every choice and for one and many;
  - the nothing-new sentence;
  - the right-click menu's words;
  - the choice remembered per universe.
- `findings/builder_system_design.md` §29, with its strings.
- Shots `findings/ui_design_shots/kb12_*`; pass scripts `findings/builder_pass_src/dd1.mjs` to `dd3.mjs`.

## Gates
npm test:      pass. 1472 tests, 1454 pass, 0 fail.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes (index 167.13 kB).
fourth gate:   pass, with one gap. My Vite dev server (my own config and dependency cache) on 5197, my API on 8797 with its own state directory, CDP 9397, inspector 9247; all stopped after.

**The default:** this universe with nothing stored shows "Generate up to 80 hexes / Standard, 3 in 6" (`kb12_default`).

**Each choice on an empty subsector** (systems in the pane's tally against the toast):

| Choice | How | The toast | Pane |
|---|---|---|---|
| Every | pointer | Generated 80 systems in Subsector B. | 80 (match) |
| Sparse | keyboard: Shift+G, arrows in the list, Tab to Generate, Enter | Generated 31 systems in Subsector C. 49 hexes were left empty. | 31 (match) |
| Standard | pointer | Generated 36 systems in Subsector H. 44 hexes were left empty. | 36 (match) |
| Dense | keyboard | Generated 51 systems in Subsector H. 29 hexes were left empty. | 51 (match) |

- **While running:** "Generating up to 80 systems · 0 of 80 hexes checked" with Stop, and "0 of 80 hexes checked · 0 systems so far" under the button. This local server reports each 80-hex job in a single step, so no in-between step was seen; the three-step test covers it.
- **A second run** at Standard over the same subsector: "No systems were generated. At this density, the roll leaves these hexes empty every time. To fill them, set Hexes to fill to Every selected hex, or select one hex, and then select Generate." (`kb12_second_run`)
- **Remembered:** after Dense and a reload, the button reads "Dense, 4 in 6".
- **One hex:** an empty hex shows "Generate a system" with no second line, and G gives a preview.
- **A new sector slot at Sparse** (16 hexes): "Create the sector and generate up to 16 hexes / Sparse, 2 in 6", then "Generated 7 systems in the new sector Density Test. 9 hexes were left empty." Undo took the sector back (`kb12_slot`).
- **The sheet and the button** at half, column, full and 520 px: `kb12_sheet`, `kb12_sheet_520`, `kb12_button_*`.
- **The right-click path** in the browser: not reached. With nine hexes selected, a right-click on one of them in headless Edge opened the single-hex menu ("Empty hex 1002"): the selection was gone by the time the menu read it. That's `MapView`'s pointer handling, not mine; I didn't dig further. The many-hex menu's words ("Generate up to 3 hexes" / "Sparse, 2 in 6", and none for one hex) are covered by a unit test on `menuFor`.
- My test universe still holds 369 of my systems in Hollow Reach Two from earlier passes. They're only on my local state.

## Contract published
none

## Needs from others
- None for density.
- Optional, for whoever owns `views/MapView.vue`: check whether a right press on a hex inside a many-hex selection keeps the selection before the menu opens (`MapView.vue` around line 1541). In my headless run it didn't.

## Questions for Johnny
1. The choice is remembered per universe; the engine and method are still one choice for every universe, as before. Should the engine and method also be per universe? I suggest not now: no referee has asked, and it would change what "Your choice is saved for next time" means for everyone.
2. The second line under Generate reads "Standard, 3 in 6". Is that clear to a referee who hasn't opened the sheet? I suggest yes: the numbers say how many in six hexes get a system, and the sheet's hint explains the roll. The alternative is "About half of the empty hexes", which is less exact.
