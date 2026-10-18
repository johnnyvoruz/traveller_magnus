# D menu_selection report
Prompt: prompts/d_menu_selection.md
Status: done for parts 0 and 1. Part 2 (the daily allowance) isn't started: `directives/reports/b_generate_cap.md` isn't on disk, nor in `reports/done/`. Lane B's allowance code is in flight (see Gates).

## Part 1: what cleared the selection
A **right press**, through the release, not the context-menu event:
- In Chromium on Windows a right press is `pointerdown`, `pointerup`, then `contextmenu`.
- `map/input.ts` tracked any button. With Build on, the box handler took the press, and a still release ended the "box" as a click on one hex. Without the box handler, it reached `api.click`. Either way, the map selected that one hex, so `build.selection` was gone when `onBuildMenu` read it.
- A **touch long-press** isn't affected: it outlasts the click time (`--t-base`), so its release was never a click, and the selection already stayed.

## Changed files
- `apps/web/src/map/input.ts`: a secondary (`button === 2`) press isn't tracked; it's the context menu's alone, never a click, a box or a pan.
- `apps/web/src/views/MapView.vue`:
  - `onBuildMenu` uses `menuKeysFor` (the selection for a hex inside it, else that hex alone, opened as before);
  - `onMenuKey` handles Menu and Shift+F10 by the same rule, from the focused hex (or the selection when none is focused), and opens at the hex;
  - a watch opens the pane when the density prompt is asked for with it closed.
- `apps/web/src/workspace/build/density_ask.ts` (new): `askDensity`, `confirmDensity`, `cancelDensity`, `runMany`.
  - A new sector is named first.
  - Focus goes back to the opener, or to the pane's Generate button.
- `apps/web/src/workspace/build/DensityAsk.vue` (new): the prompt, in the pane; four radio rows, the hint, Generate and Cancel; Enter and Escape.
- `apps/web/src/workspace/build/BuildPane.vue`:
  - Generate for more than one hex asks; the full sheet's Generate runs (`generateNow`);
  - the prompt takes the card's place;
  - the button says "Generate…" on one line (`data-command="build-generate"`);
  - the second line is removed.
- `apps/web/src/workspace/build/commands.ts`: `build-generate` on more than one hex asks (G, the menu, the palette); the menu item says "Generate…"; new `menuKeysFor`.
- `apps/web/src/workspace/build/grow_acts.ts`: `slotNamesMissing` (the name is asked for before the density).
- `apps/web/src/workspace/build/state.ts`:
  - `DENSITIES` in the plain words, the new order, `DENSITY_HINT`, `densityWords`;
  - `build.asking`, closed when Build is turned off;
  - `densityLine` and `generateWords` removed; `NOTHING_NEW` names "Every hex".
- `apps/web/src/workspace/build/GenerateSheet.vue`: the select shows the same four wordings and the hint.
- `apps/web/src/workspace/build/acts.ts`: `placeWords`, for the prompt's heading.
- Tests:
  - `tests/web/build_menu_pointer.test.js` (new). A right press and release is no click and no box; a right drag doesn't pan; a left press still goes to the box; and `menuKeysFor`. The first assertion fails on the old `input.ts` ("actual 1, expected 0").
  - `tests/web/build_density_ask.test.js` (new):
    - G, the menu and the palette ask, and no job runs;
    - Generate runs once with the choice and remembers it;
    - Cancel writes nothing;
    - the preselection;
    - one hex isn't asked;
    - an empty slot is named first, then asked, then made with the choice;
    - the sheet doesn't ask twice.
  - `tests/web/build_flight.test.js`: the words and the menu updated.
- `findings/builder_system_design.md` §30, with its strings.
- Shots `findings/ui_design_shots/kb13_*`; pass scripts `findings/builder_pass_src/ms1.mjs` to `ms3.mjs`.

## Gates
npm test:      1492 tests, 1472 pass, 2 fail, both other lanes' work in flight:
- `tests/api/allowance_clock.test.js`: `apps/api/src/auth/allowance.ts` imports `./roles`, which isn't there (Lane B's allowance).
- `tests/web/builder_dots.test.js`, "a written hex shows at once, a removed chart dot goes, and Undo puts the chart character back": `builder/dots.ts` and `builder/store.ts` (Lane A's dots). Neither imports a file I changed.

All Build tests pass, including the new ones. My API also crashed once mid-pass on Lane B's half-written `packages/shared` (`GenerationAllowance is not defined`); it started again once their file compiled.

npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes (index 168.88 kB).
fourth gate:   pass. My Vite dev server (my own config and cache) on 5197, my API on 8797 with its own state directory, CDP 9397, inspector 9247; all stopped after. Selections were made with real clicks (a click, then Shift+click). A script `import()` landed on another module instance while other lanes' edits kept Vite hot-reloading.

**The prompt from each way in:**
- **The pane's Generate…:**
  - by pointer: "9 empty hexes in Subsector J", Standard preselected and focused (the first time in this universe);
  - Cancel: no prompt, nothing written, focus back on the Generate button;
  - by keyboard: Enter on the button opens it, the up arrow moves to Sparse, Escape cancels (focus back on the button, the selection kept);
  - again, Enter generates: "Generated 311 systems in Hollow Reach Two. 669 hexes were left empty." That run was on the whole sector, because the first script's selection hadn't taken (above); it was undone.
- **G after a reload:** the prompt with **Sparse** preselected, the last choice.
- **The right-click menu's Generate…:** the prompt for the nine; Generate ran "Generated 2 systems in Subsector J. 7 hexes were left empty." (undone).
- **The palette's "Generate a system"** with many hexes: the prompt.
- **An empty sector slot (nine hexes):**
  - with no name: no prompt, "To generate here, first name the new sector." with the cursor in the name box;
  - named: "9 empty hexes in a new sector", then "Generated 1 system in the new sector Ask Test. 8 hexes were left empty." (undone).
- **One hex:** a plain click on 1123, then G: no prompt, the preview's Keep bar.
- Shots: `kb13_prompt_column`, `_half`, `_full`, `_520`, `kb13_prompt_g`, `kb13_menu_ask`, `kb13_prompt_slot`, `kb13_one_hex`.

**Right-click and the menu key:**
- **Inside:** nine hexes selected (columns 10 to 12, rows 22 to 24). A real right press on 1123 keeps all nine; the menu reads "9 hexes · Generate… · Generate with…" (`kb13_menu_selection`).
- **Outside:** a right press on 1526 gives that hex alone (Liangjiang's menu).
- **Shift+F10** with the nine selected: the nine's menu. With one hex focused (Sethos): that hex's menu.

## Contract published
none

## Needs from others
- Lane B: `b_generate_cap` (and Lane A's note) for part 2.

## Questions for Johnny
1. The prompt lists the four choices as Sparse, Standard, Dense, then Every hex, as your ruling wrote them. Should Every hex come first instead, as on the old dropdown? I suggest keeping your order: it reads from fewest to most, and the preselection already starts on the last choice.
2. A right-click inside a subsector or sector you've opened by its address now counts as inside the selection, so the menu acts on the whole subsector or sector, not the one hex. Is that right? I suggest yes: the map draws the address as selected, and the pane already acts on all of it. The alternative is to treat only hand-picked hexes as a selection for the menu.
