# Agent D — the character sheet: re-base the design on the PDF, then build

Issued 2026-10-07 by the orchestrator. Your design (`findings/character_sheet_design.md`,
36 `kc_*` mockups) is **accepted as the look**: chamfered panels under cyan tabs that fold
to a bar with a count, the value on a rust tag and the DM outlined, one line per skill
with a "Find a skill" filter and a Trained switch, the first typed column of a table
frozen, "Start a character sheet" as the one filled control, the rust PC tag, the ship
sheet's machinery lifted into shared parts.

**But it stands on the 2026-10-02 transcription, and the sheet is now the 2026 PDF.**
Everything it needed arrived after you stopped:
- `rules/mgt2e_character_sheet_fields.json` is in place and generated (420 widgets: 410
  text, 10 checkboxes; every name unique; the ship file's shape).
- `findings/character_sheet_fields.md` (every widget) and
  `findings/character_sheet_groups.md` (how they line up with §5.2a) are on disk.
- Only 15 of the transcription's names match the PDF. **The PDF wins everywhere.**
- `prompts/d_character_sheet.md` gained three sections after you read it. **Re-read it
  from the top**: "The inventory is in", "Build it so the sheet can move house", and
  "the bar for live is Google Sheets" (a change is one box; values may change under the
  reader while the box being typed in keeps its text, caret and focus; presence has a
  designed place). They bind this build.

## 1. Re-base, briefly

Go through the PDF's fourteen sections (Personal Data File 25, Skills 149, Augments 15,
Armour 40, Weapons 56, Equipment 32, Finances 8, Wounds 16, Careers 30, History &
Background 1, Allies, Contacts, Rivals, Enemies 12 each) and correct the design note
where the PDF differs: section list and order, each table's real columns and row count,
the Careers rows with their Survival and Advancement checkboxes, the skills block as the
PDF prints it (with the eleven blank `Skill/Ability` rows), the two uncaptioned "Other"
characteristic slots. Re-shoot only the mockups that change. Add the presence mark (one
box held by "Mara") to one mockup.

## 2. Your six questions, answered

1. **Two "Personal Data File" boxes as one section:** yes. The PDF has one section of
   that name with 25 widgets.
2. **The profile strip:** `character_sheet_groups.md` lists the Universal Character
   Profile among the transcription's sections with no widgets on the 2026 PDF. So it is
   display only, as you drew it: the six values **exactly as typed**, under their
   names. No conversion of any kind (none has been supplied).
3. **Total Mass Carried:** there is no such widget on the 2026 PDF. Leave it out. No
   computed total.
4. **More lines for a speciality or a skill:** no. The sheet has the lines the PDF
   prints; the eleven blank rows are the room for extras. Values are stored by the PDF's
   own field names, as the ship's are.
5. **Allies, Contacts, Rivals, Enemies:** the PDF gives each six rows of a name box and
   a notes box (`Ally Name 1`, `Ally Notes 1`, …). Those are the free text you asked
   about. Linked records of the matching link kind show as pills above them; a pill is
   never written into a text box and a text box never makes a record.
6. **A characteristic's DM:** typed, until Johnny supplies the table.

## 3. Build

As `prompts/d_character_sheet.md` Step 2 says, with its Check. The layout that groups the
flat widgets is yours, in one place, and a test fails when the rules file has a widget
the layout does not place (all 420 placed, none twice).

## 4. Your own API, not a shared one

A process is listening on port 8787 and not answering, and another is on 8788: agents
are standing on each other's local servers. **Start your own** local API on a free port
with its own state directory, point your own Vite at it, say in the report exactly how
(the two commands), and stop both when you finish. Do not use, restart or stop a server
you did not start. Then do the browser pass your nav console report could not.

`workspace/journal/` and a few lines of `CampaignPanel.vue` are Agent E's: re-read before
you edit that file. `campaign/`, `orbit/OrbitRenderer.ts`, `surface/`, `packages/`,
`apps/api` are not yours. No git. Stop and report, in the brief's format.
