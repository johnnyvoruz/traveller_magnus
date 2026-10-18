# Agent A — the character sheet's fields, from the PDF Johnny has now supplied

Issued 2026-10-07 by the orchestrator, **rewritten the same evening**: Johnny has put
`assets/Character Sheet 2026_fillable.pdf` (and two print versions) in `assets/`. The PDF
is now the source; the plan's transcription is what it is checked against. Do this after
`a_journal_3.md` is reported. Johnny: *"next step of work should get us to character
sheets."*

## You have already done the earlier version of this file: keep it, and do this one

Your report of 22:28 was on this prompt as first written (the §5.2a transcription), read
before the rewrite reached you. That work is **accepted as the transcription and kept**,
but it is not what goes into `rules/`:

- Move `findings/rules_drafts/mgt2e_character_sheet.json` to
  `findings/character_sheet_transcription.json`, and your table to
  `findings/character_sheet_transcription.md`, so nothing in `rules_drafts/` can be
  copied into `rules/` by mistake and the name `character_sheet_fields.md` is free for
  the PDF's inventory below. Point your shape test at the new path, or drop it if item 5
  below replaces it.
- **Your two questions are answered by the PDF, not by Johnny:** the type of each
  profile hex and of each table column is whatever its widget is on the fillable PDF
  (the ship's were text boxes and checkboxes). Record what the PDF has; do not ask for a
  type the PDF already gives.
- The transcription is now the thing the PDF is diffed against (item 2) and the outline
  for the groups file (item 3).

## Where this stands

The character sheet is K13 part 4 in `slice_2_campaign.md`, and takes the road the ship
sheet took (handoff §89): a read-only inventory of the fillable PDF's form fields, which
Johnny copies into `rules/`, and then Agent D's sheet on the record's page. **Read
`findings/ship_sheet_fields.md` and `findings/ship_sheet_fields.json` first: this step
produces their twins.** The fillable PDF's field names and positions are the sheet's
structure, supplied, not inferred.

## Build, read-only: nothing under `rules/`, `apps/`, `packages/` or `assets/` changes

1. **`findings/character_sheet_fields.json`**, in exactly the shape of the ship's file:
   `source`, `pageSize`, the `box` note, and `fields`, each with `name`, `page`, `type`,
   `box` (`x`, `y`, `w`, `h` in points, PDF user space) and `section`. Every widget, in
   the PDF's own order. The ship's was read with pypdf; use the same, or another reader
   kept outside the repo (no new dependency in any `package.json`, no script committed
   unless it sits under `tools/` beside a note). Say which you used and its version.
2. **`findings/character_sheet_fields.md`:** the counts (by page, by type, by section),
   every field in a table a referee can read, and **the diff against
   `campaign_manager_plan.md` §5.2a both ways**, as the ship's file did against §5.3b: on
   the PDF and not in the transcription; in the transcription and not on the PDF. The
   transcription was made from the sheet supplied on 2026-10-02; this PDF is dated 2026:
   differences are expected and are findings, not errors.
3. **`findings/character_sheet_groups.md`, the structure the flat list does not carry.**
   For each section of §5.2a, in order: the PDF widgets that make it, by name. For a
   table, its rows and columns as widget names (how many rows the PDF prints). For the
   characteristics, which widget is the value and which the DM. For the skills, the
   widgets in reading order and what is printed beside each, exactly as the PDF prints
   it. Anything on the PDF that fits no section, and any section with no widgets, listed.
   **Positions and names only: no meanings, no legal values, no derived numbers.**
4. **Zero-Assumption.** Nothing from your own knowledge of Traveller: no skill added, no
   speciality, no rule for a DM. Where a widget's name is cryptic, record the name and
   the nearest printed label, and put it under "Questions".
5. **A shape test:** `tests/shared/character_sheet_fields.test.js` reads
   `rules/mgt2e_character_sheet_fields.json` when it exists, else the findings file,
   else skips, and checks what the ship's file guarantees: unique names (or, if the PDF
   repeats a name, say so and how the ship's file handled it), a page and a box on every
   field, a type from the set found.

Also say, from reading `apps/web/src/workspace/ship_sheet.ts` (Agent D's, read only), how
a vessel's sheet values are stored on the record and how the rules file reaches the page
through the generated wrapper: one paragraph, no code, so the character sheet follows it.

## Then Johnny copies it

Your report ends with the two lines he will run, as the ship's did:
`cp findings/character_sheet_fields.json rules/mgt2e_character_sheet_fields.json` and
`npm run rules:gen`. You do not run them.

## Check

`npm test`, `npm run check`, pasted. No git. Stop and report with the counts, the diff's
two totals, and the questions.
