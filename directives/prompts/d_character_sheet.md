# Agent D — the character sheet on the person's page

Issued 2026-10-07 by the orchestrator. Do this after `d_nav_console_2.md` is reported.
Johnny: *"next step of work should get us to character sheets."* You built the ship
sheet; this is its sibling, and it is yours to design and build.

## What Johnny asked for (2026-10-05, K13 part 4 in `slice_2_campaign.md`)

Person records get the same treatment as vessels, "with all our new design
requirements": **the sheet as the panel's default, collapsible sections, frozen keys
when a table scrolls sideways, pills for linked records.**

## What it is built from

- **The fields (changed 2026-10-07, evening: the PDF has arrived).** Johnny has put
  `assets/Character Sheet 2026_fillable.pdf` in `assets/`. Agent A is inventorying its
  form fields into `findings/character_sheet_fields.json`, the twin of the ship's file
  (`prompts/a_character_fields.md`); Johnny copies that to
  `rules/mgt2e_character_sheet_fields.json` and runs `npm run rules:gen`, and you read
  it through the generated wrapper exactly as `workspace/ship_sheet.ts` reads the
  ship's. **The PDF's fields are the sheet.** `campaign_manager_plan.md` §5.2a (the
  sheet as supplied on 2026-10-02) and A's `findings/character_sheet_groups.md` tell you
  how the flat list groups into sections, tables, value-and-DM pairs and the skills
  block; where they and the PDF differ, the PDF wins and you say so.
- **The rule for every box:** the sheet stores what the referee types and **computes
  nothing**. A characteristic has a value and a DM, both typed (Johnny has not supplied
  how one gives the other). A skill's speciality is free text. No Traveller knowledge
  from memory: if a box seems to need a rule, it is a plain box and a line in your
  questions.
- **What is not a second copy:** the portrait is the record's primary image; the
  profile hexes on the back show the six values typed on the front; Homeworld is a
  system (a pill that goes there, chosen with the place picker you already have);
  Equipment may list linked item records as pills beside its free table.
- **The stored value:** on the record's `sheet`, against `mgt2e_character@1`, as the
  ship's is against its own schema. Free-form sheets a person may already hold are kept
  and shown; nothing is discarded.

## The inventory is in (2026-10-07, late): 420 widgets, checked

`findings/character_sheet_fields.json` (410 text, 10 checkboxes; page 1 has 317, page 2
has 103; every name unique; the ship file's shape), `findings/character_sheet_fields.md`,
and `findings/character_sheet_groups.md` (how the widgets line up with §5.2a). Johnny
copies the JSON to `rules/mgt2e_character_sheet_fields.json` and runs `rules:gen`. Two
things A asked, answered here:
- **The two "Other" characteristic hexes** (`Other Characteristic 1`, `Other Stat 1`,
  `Other DM 1`, and the same for 2) have no printed caption: they are slots the referee
  names. A name box, a value, a DM, all free. `Other Dm 2` is spelled so on the PDF: the
  key keeps the PDF's spelling; what you print beside it is your layout's.
- **`Skill/Ability 1` to `11` and their `DM` boxes**, the third skill column: blank rows
  for skills the sheet does not print. Free text and a typed DM.
The 2026 PDF differs widely from the 2026-10-02 transcription (15 names match of 420):
the PDF wins everywhere.

## Build it so the sheet can move house (Johnny, 2026-10-07, late)

Johnny has said where character sheets are going: **one "live" sheet, owned by a
player's account, shared with a referee, co-edited by both, and showing the same in
every universe that uses it; and separately, a character copied into another universe
as its own independent instance** (the marketplace). Neither is built in this step, and
neither is designed here (Agent A is writing that design on paper). What it asks of you
now is one boundary, kept clean:

- **The sheet component does not know where its values live.** It takes a sheet
  document (`schema` and the values) and whether it may be edited, and it emits changes.
  The person's page wires that to the record's `sheet` today; later the same component
  is wired to a live sheet in an account's library, with no change inside it.
- Nothing in the sheet reads the record, the store or the universe directly: the
  portrait, the homeworld pill and the linked items come in as given values and come
  out as events.
- It shows who it belongs to and whether it is this game's own or a live one only
  through a slot or a prop the page fills; in this step the page fills it with nothing.
- A test mounts the sheet with a plain object and no store.

**And the bar for "live" is Google Sheets** (Johnny, the same evening: "Think of it like
two people working in Google Sheets at the same time"). The live wiring is not yours in
this step, but three things in the component decide whether it will be possible, so
build them now:
- **A change is one box.** The sheet emits a change per box when that box is committed
  (left, or Enter), naming the box and its new value; a table emits row added, row
  removed, row moved, cell changed. It never emits "the whole sheet".
- **Values may change under the reader at any time.** When the document it is given
  changes in a box the person is not in, that box updates in place, with a brief token
  motion (none under reduced motion); **the box the person is typing in keeps its text,
  its caret and its focus**, and nothing scrolls. A test changes three boxes from outside
  while a fourth has focus.
- **Presence has a place.** The sheet takes an optional map of box to person (a name and
  a colour token) and marks those boxes as someone else's, and it emits which box the
  person has entered and left. In this step the page passes none. Design the mark in the
  mockups (one box held by "Mara", in the tokens, readable without colour alone); it must
  not shift the layout when it appears.

## Step 1, in the same step: the design

`findings/character_sheet_design.md`, with mockups `kc_*` at column, half, full and
520 px: the whole sheet collapsed and open; Core and Other Characteristics; the skills
block (it is long: show how it reads and how a referee finds a skill); one table with
more columns than fit (Weapons), its key column frozen; the back's Wounds and
Background; a person with no sheet yet, and the one press that starts one; a player
character and what marks it (the plan's `kind: 'pc'` puts them in the Party tab). The
language is the ship sheet's: chamfered panels, cyan tabs, rust tags. Say what you take
from `ShipSheet.vue` unchanged, what you lift into a shared part, and what is new. No
stop for a ruling unless the look truly forks.

## Step 2: the build

- Built the way the ship sheet is: the fields come from the rules file, and the layout
  that groups them (which widgets are a table's rows, which pair is a value and its DM)
  is yours, in one place, checked against the file by a test so a field the PDF has and
  the layout forgot fails loudly. Share `ship_sheet.ts`'s machinery; do not fork a
  second one.
- Every value saves through the record's existing in-place save, with the saving mark
  the record page has. Tables add and remove rows; the Equipment total is the sum of the
  Mass column as the sheet prints it (the one arithmetic the transcription itself asks
  for; if it is not marked in A's file, leave it out and say so).
- One panel system, command first, tokens only, the 2 px amber ring, reduced motion,
  contrast pairs for anything new, a print stylesheet only if it falls out for nothing
  (it is not in this step).
- **If the rules file is not in `rules/` when you reach the build, stop after the design
  and report**: do not read the draft from `findings/` in product code.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. In the
browser, signed in locally: start a sheet on a person, fill each section, reload and
find every value; a table with eight rows scrolled sideways; collapse and open; the
portrait and the profile hexes following their sources; a second person; the Party tab.
Column, half, full, 520 px; keyboard through every field; reduced motion. Screenshots
`kc_built_*` beside the mockups.

`orbit/` (after your second pass), `campaign/`, `surface/`, `dossier/`, `packages/`,
`apps/api`, `workspace/journal/` (Agent E is building there, and has a few lines in
`CampaignPanel.vue`: re-read before you edit it) are not yours in this step. No git.
Stop and report, in the brief's format, with your questions for Johnny.
