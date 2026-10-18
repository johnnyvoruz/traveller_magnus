# Lane A — the character sheet: six profile hexes on one row; one line per skill with a "+"

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/A.md`, then this file. No git but
read-only, no deploy, no `rules/`. Lent this pass (D's folder; D is not editing them):
`apps/web/src/workspace/CharacterSheet.vue`, `apps/web/src/workspace/character_sheet.ts`.

## What Johnny saw (2026-10-14, the sheet in the Column pane)

- The profile hexes (`.csheet-profile`, `CharacterSheet.vue` ~420) wrap: Strength to
  Education on one row, Social alone on the second. **He wants all six on one row**, and
  said the abbreviation may be used to save width.
- The skill list shows every PDF line: Animals 1, Animals 2, Animals 3, Art 1, 2, 3,
  Athletics 1, 2, 3 and so on, mostly empty. **He wants the first line only, with a "+"
  to add another**, a space for the "+" on the left of every row so the skill names stay
  aligned, and the lines of a skill with specialisms shown as tiers under it.

## Do

1. **One row of six.** `.csheet-profile` does not wrap. The hexes share the row and
   shrink with the pane (keep the hexagon's proportions; the value stays readable at the
   narrowest pane width the app allows). Under each value show the abbreviation:
   Strength STR, Dexterity DEX, Endurance END, Intellect INT, Education EDU, Social SOC
   (Johnny's labels, display only). The full name stays as the hex's accessible name
   and `title`. The two named slots ("Name it") do not join the row; as today.
2. **Skills, one line each.** Every row gets a fixed-width gutter on the left, so all
   skill names start at the same x.
   - A skill without a specialism box (Admin, Advocate…): the gutter is empty; the row is
     as today.
   - A skill with numbered lines (Animals 1 to 3, Athletics 1 to 3…): show its first line
     with the name alone ("Athletics", no "1"), its specialism box and its level. A "+" in
     the gutter adds another line directly under the skill's last line, indented one
     tier, showing the specialism box and level only. **No cap (Johnny, 2026-10-14: "it
     doesn't make sense to cap it")**: the "+" never goes away. Its accessible name: "Add
     another Athletics specialism".
   - A line with anything typed (specialism or level) is always shown, whatever its
     number. A line added and left empty stays until the sheet is closed; it is not
     shown the next time.
   - The finder and the All / Trained switch keep working: a found or trained line shows
     under its skill's first line.
3. **Storage.** Lines 1 to 3 stay the PDF's own fields under the PDF's names (export, live
   co-editing and the Player Pack unchanged for them). Line 4 onward is stored under new
   names outside the PDF's set, made by one pure function in a new file
   `packages/shared/src/character_extra.ts` (zod-free is fine; exported from the package
   index): `Extra/<skill label>/<n>/Specialism` and `Extra/<skill label>/<n>/Modifier`,
   where `<skill label>` is the PDF line's label ("Athletics") and `n` is 4 or more.
   The same file exports the parser the server uses: a name is an extra line only if its
   label is one of the PDF's skills with numbered lines and `n` is an integer from 4 to
   99 (a guard against junk names, not a design cap; say so in the report).
   **The server refuses names the PDF does not have** (`apps/api/src/character/widgets.ts`,
   `widgetKind`, answering `unknown_field`). Lent to you for one change: `widgetKind`
   returns `'text'` for a name the shared parser accepts. Nothing else in `apps/api`.
   Live co-editing, the field history and the box limit then treat an extra line like
   any text box; prove it with one worker test that writes `Extra/Athletics/4/Specialism`
   and reads it back, and one that refuses `Extra/Admin/4/Specialism` (Admin has no
   numbered lines) and `Extra/Athletics/3/Specialism`.
   The number of PDF lines per skill is read from `character_sheet.ts`, never typed in.
4. Keep the copy standard (`directives/manifesto.md`, Google style) for any new text.

## Owned files (this pass)

The two lent files, `packages/shared/src/character_extra.ts` (new) and its export line
in `packages/shared/src/index.ts`, `apps/api/src/character/widgets.ts` (lent, `widgetKind`
only), tests under `tests/web/` and `tests/api/` (extend
`tests/web/workspace_character_sheet.test.js` or add one), `design/tokens.css` (your own
lines only), `directives/reports/a_sheet_row_and_skills.md`.

## Gates

`npm test`, `RUN_API_TESTS=1` for the character worker suite, `npm run check`,
`npm run typecheck`, `npm run build`, pasted. **Browser:** shots of the sheet at the
pane's narrowest and widest width: the profile row, the skill list closed, Athletics with
one and with five lines (the fifth typed, reloaded, still there), the finder on "athl". As
`findings/ui_design_shots/kb17_sheet_skills_*`. Start Vite with its own cache directory.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_sheet_row_and_skills.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: profile abbreviations, one skill row with a "+", extra field names, and widgetKind accepting them. next: tests and gates.
done: gates and the sheet shots. next: the report.
done: the report is directives/reports/a_sheet_row_and_skills.md. next: stop.

