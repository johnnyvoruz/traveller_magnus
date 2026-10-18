Found: the profile hexes were a fixed 78px and wrapped, every numbered PDF line was its own row, and `widgetKind` refused any name outside the 420. Nothing was half-done.
Finished: six hexes on one row with STR–SOC under the value; one row per skill, a gutter, and a "+" that adds a tier with no cap; lines past the PDF's own stored as `Extra/<label>/<n>/…`; `widgetKind` treats those names as text.
Backed out: nothing.

# Lane A sheet row and skills report
Prompt: prompts/a_sheet_row_and_skills.md
Status: done

## Changed files
- `apps/web/src/workspace/CharacterSheet.vue`: the profile row does not wrap; each hex keeps its proportions, shrinks with the pane, and caps at 78px. The abbreviation sits under the value. Skill rows share a gutter; a numbered skill shows its first line and a "+" (accessible name "Add another Athletics specialism"). Added lines sit one tier under that skill. An empty added line lasts until the sheet closes.
- `apps/web/src/workspace/character_sheet.ts`: profile abbreviations, the numbered-skill set and the first extra line number read from the layout, and the grouping the page renders. All counts skills (39 on this PDF). Trained counts lines with something typed, including a line past the PDF's own.
- `packages/shared/src/character_extra.ts`: `extraFieldName` and `parseExtraName`. A name is an extra line only when the label is a PDF skill with numbered lines and `n` is an integer from 4 to 99. 99 is a guard against junk names, not a design cap. The "+" does not stop at 99; the server refuses a name past the guard.
- `packages/shared/src/index.ts`: exports that module.
- `apps/api/src/character/widgets.ts`: `widgetKind` returns `'text'` when the shared parser accepts the name. `WIDGET_COUNT` stays 420.
- `tests/web/workspace_character_sheet.test.js`: grouping, the parser, and the drawn boxes (lines after the first of a numbered skill are not drawn until used).
- `tests/api/character_logic.test.js`: the sheet room writes `Extra/Athletics/4/Specialism` and reads it back, and refuses `Extra/Admin/4/Specialism` and `Extra/Athletics/3/Specialism`.
- Shots: `findings/ui_design_shots/kb17_sheet_skills_{narrow,column,wide}_{profile,closed,athletics_one,athletics_five,athletics_reloaded,find_athl}.png`. Narrow is a 272px pane (the column card at a 360px window). Column is 520. Wide is 1424 (a 1512px window minus the rail and the insets). At 272px the six values stay on one row at 12.4px.

Every numbered skill on this PDF has lines 1 to 3. That count is `firstExtraNumber` in `character_sheet.ts`, not a typed 3. The server cannot import the web layout, so it builds the same label set with `numberedSkillLabels` over the PDF field names. A test locks the two sets together.

Lines 1 to 3 stay the PDF's own field names. The two "Name it" slots stay off the profile row.

## Gates
npm test:      fail — one failure outside this pass (below). Sheet tests passed. 1661 tests, 1633 pass, 1 fail, 27 skipped.
npm run check: pass
typecheck:     pass
build:         pass. `dist/assets/index-CEIWbUQh.js` 178.36 kB, gzip 59.99 kB
characters live (`RUN_API_TESTS=1`): pass

```
✖ package tables apply on a fresh local D1 and on today's schema
  AssertionError: package_installs
  true !== false
  at tests/api/packages_migration.test.js:44
```

## Contract published
none

## Needs from others
- Lane B: `tests/api/packages_migration.test.js` still asserts a fresh database has no `package_installs` table. The apply now creates one. This pass did not touch that test or the migrations.

## Questions for Johnny
none
