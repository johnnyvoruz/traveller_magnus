# E handout images 2 report
Prompt: prompts/e_handout_images_2.md
Status: partial

found: Progress was empty. No earlier report for this prompt. `directives/reports/b_entry_images.md` was not present at the start, and it was still absent after the note.
finished: part 1, the Player Pack design note.
backed out: nothing.

## Changed files
- findings/player_pack_design.md: the read-only design note for the Player Pack
- directives/prompts/e_handout_images_2.md: two Progress lines
- directives/reports/e_handout_images_2.md: this report

## Part 2
Waiting. The order is to build handout images only after `directives/reports/b_entry_images.md` (or a copy under `reports/done/`) exists. Neither file is there.

Looked at the tree anyway, and did not build on it. `directives/api.md` has the section "Images on a record and on a journal entry". `CampaignEntry` now has `images` as the same `CampaignImage` list a record has, at most 12, null to clear, and an older row reads as null (`packages/shared/src/schemas/campaign.ts` lines 262 and 283–286). `campaign_journal` has an `images` column, including an `ALTER TABLE` for an existing universe (`apps/api/src/universe/campaign.ts`). That matches the step 1 ask. The screens still do not write it.

## Gates
npm test:      not run (no product code)
npm run check: not run
typecheck:     not run
fourth gate:   not run

## Contract published
none

## Needs from others
- Lane B: the report `directives/reports/b_entry_images.md`, so part 2 can start. The field and the api.md section are already on disk.

## Questions for Johnny
The same eight are written out in `findings/player_pack_design.md`, recommended answer first. Short form:

1. A mention of a referee-only record should become the words "a record", and the name stored in the token should be ignored. Ordinary prose stays as written.
2. A hex mention should show the label written in the token, not a name looked up from the map.
3. Until a link has its own switch, show a connection between two player-visible records without the role or the notes. Every link is stored as `referee` today, and no screen changes that.
4. The first file should be one HTML file. Do not add `fflate` (0.8.3, unpacked 796,742 bytes) or any other ZIP package.
5. Leave the map out of the first version.
6. Leave images out of the first version. A later file stays at or under 32 MB.
7. List a party member or the ship only when that record is for players. Use the clock day as the cutoff. Leave the Characters API out.
8. "Download my notes" is the copy that matters. `localStorage` in a file opened from disk is only a convenience. Do not import those notes until the merge is its own step.
