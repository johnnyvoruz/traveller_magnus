# N stream report

## N0 Finish "On the timeline" — done
Files: apps/web/src/workspace/CampaignPanel.vue, apps/web/src/workspace/TimelineList.vue, apps/web/src/workspace/WhereBlock.vue, tests/web/record_page_links.test.js
What changed:
- A row in a record's "On the timeline" now opens the timeline at that row. `CampaignPanel.vue` watches `timelineAt` (from `timeline_focus.ts`) and runs its own `openTimeline()`. When `TimelineList.vue` mounts, it reads that row (`openAtAsked`), clears it, marks the row, scrolls it to the centre and puts focus on the list, so arrow keys and Enter carry on from there. With no row asked for, or a row that is gone, it opens at Today as before. I added this on top of Lane M's restyled version and changed only the script.
- The `WhereBlock` heading is a kicker on all three screens that use it (record, journal entry, Party tab), with an 8 px gap below it. The Party tab's own rule that sets its top margin to 0 still applies.
- Legs stay off the timeline (decided 2026-10-17), so nothing changed there.
- Two tests added: the panel and list wiring (including the fallback to Today), and the Where kicker.
Gates: test 1878/1879 pass. The one failure is not in my files: tests/api/packages_migration.test.js "package tables apply on a fresh local D1 and on today's schema". check clean, typecheck clean, build pass.
Browser (local Worker on 5916, headless Edge on 5918): clicking the Beowulf's "012-1105" row goes to `?panel=campaign` with the timeline open, the Beowulf row active and the list focused, at both 1600 and 390. Before: the URL stayed on the record and the timeline did not open. No console errors.
Shots: findings/ui_design_shots/sN_N0_record_{before,after}_{1600,390}.png (the section), sN_N0_clicked_{before,after}_{1600,390}.png (after the click), sN_N0_party_{before,after}_{1600,390}.png (the Where kicker on the Party tab).
Seen, not mine: at 1600 the Campaign panel's tab strip overlaps ("Jour" runs under "Timeline", with a scrollbar under the tabs) in sN_N0_party_after_1600.png. That is styling, which is Lane M's in this area. I did not touch it.
Questions: none

## N1 A hex knows its campaign — done
Files: apps/web/src/workspace/JournalHere.vue (new), apps/web/src/workspace/hex_journal.ts (new), apps/web/src/workspace/RecordsHere.vue (one mount line), apps/web/src/workspace/record_links.ts (`shownMentions` made generic), tests/web/hex_journal.test.js (new)
What changed:
- The records half was already built: `RecordsHere.vue` ("Your records here") lists the records placed at the hex, or on the world being shown. Both the system view and the world view of the dossier mount it. I did not build that again.
- New: "Your journal here" (on a world's page, "Your journal in this system"). It lists the journal entries that mention the system (`hex:<hexKey>` in `mentions`) or are set there (`entriesAtHex`, which follows a record anchor to where the record is). Each entry is listed once, latest in-story date first, and says why: "Mentions this system" or "Set here". Each row links to `?panel=journal&entry=…`. The list stops at 20 with "Show all". The section is hidden when empty, when signed out, or while the campaign isn't open, and it never fetches.
- Mounted from `RecordsHere.vue` (one line, `<JournalHere :hex-key="hexKey" :on-world="bodyKey !== null" />`). That puts it under the records on both dossier views with no edit to `dossier/DossierBody.vue` or `DossierPanel.vue`. The queue named DossierBody, but the records already sit in a slot that DossierPanel fills, so mounting there would have meant two dossier edits instead of one line in my own area.
- It uses Lane M's look (`.ui-kicker`, `.ui-date`) and RecordsHere's row classes.
Gates: test 1890/1890 pass (the earlier packages_migration failure is gone), check clean, typecheck clean, build pass. Before this fix, `vue-tsc` failed on `row.why` because `shownMentions` wasn't generic; fixed.
Browser: on Regina (`/s/Spinward_Marches/1910`), the after view lists "Back at Regina" (Session · Set here · 046-1105) and "Trouble at the highport" (Rumour · Mentions this system · 038-1105). The before view has records only. Clicking the rumour opens `panel=journal&entry=…0050`. Regina A-I's page shows the same two entries under "Your journal in this system". No console errors.
Shots: findings/ui_design_shots/sN_N1_dossier_{before,after}_{1600,390}.png, sN_N1_world_after_1600.png
Questions: none. One note for Lane M: the new section's heading is a kicker, and the "Your records here" heading just above it is not yet. That one is M's to restyle in the dossier pass.

## N2 Record hover cards — done
Files: apps/web/src/workspace/record_card.ts (new), apps/web/src/workspace/RecordCard.vue (new), apps/web/src/workspace/CampaignPanel.vue (mounts it once), apps/web/src/workspace/LinksBlock.vue, apps/web/src/workspace/CampaignList.vue, apps/web/src/workspace/journal/JournalBody.vue, apps/web/src/workspace/journal/EntryPage.vue (one attribute each, plus one import), tests/web/record_card.test.js (new)
What changed:
- There is one card, `RecordCard.vue`, teleported to the body and mounted once in the Campaign panel. It shows the record's avatar, name, type (as a kicker), one line (the summary, or the first line of the details), where it is now, and Open. For a ship on its track, "where" uses the same words as the Party tab ("In jump to Regina system, arrives 045-1105 00:00"), not its stored anchor.
- A record link opts in with `v-record-card="id"`, a directive in `record_card.ts`. It is on the connection chips (`LinksBlock`), the records list rows (`CampaignList`), mention tokens in a journal entry's body (`JournalBody`) and the entry page's "Mentioned" chips (`EntryPage`). "Mentioned in" on a record page lists entries, not records, so it has no card.
- Behaviour: a mouse resting on a link for 300 ms (plan §4.4) shows the card. Leaving closes it after 150 ms, unless the mouse moves onto the card. Keyboard focus (`:focus-visible`) shows it at once and sets `aria-describedby="record-card"` on the link. Escape closes only the card, and the panel's own Escape waits for the next press. A click, a scroll or blur closes it. Touch pointers never show it, so a tap opens the record as before. Open is `tabindex="-1"` because the link itself opens the record on Enter.
- Placement: under the link, or above it when there is no room below, and kept 8 px inside the view (`cardPlace`, tested at 1600 and 390).
Gates: test 1897/1897 pass, check clean, typecheck clean, build pass.
Browser (local 5916, Edge 5918): hovering the Beowulf row in the records list shows its card; moving away closes it. Hovering "Captain Voss" in a session's body shows his card. Escape closes the card and the entry stays open; before this change, the same Escape left the entry. Tabbing onto a records-list row shows the card; tabbing past it closes it. No console errors. Before: no card anywhere.
Shots: findings/ui_design_shots/sN_N2_list_{before,after}_{1600,390}.png, sN_N2_entry_{before,after}_{1600,390}.png, sN_N2_keyboard_after_1600.png
Questions: none. Plan §4.4 also lists "2–3 relationships" on the card, which the queue item didn't ask for. I left them out. Adding them later would mean reading `links.ts` in `RecordCard.vue`.

## N3 The records list grouped — done
Files: apps/web/src/workspace/record_groups.ts (new), apps/web/src/workspace/CampaignList.vue, tests/web/record_groups.test.js (new), tests/web/record_card.test.js (one pattern now reads `item.record.id`)
What changed:
- Under "All", the list is grouped by type, in the type chips' order. Each group has a heading button (the type as a kicker, its count, a chevron, `aria-expanded`), and empty types are left out. Within a group, rows keep the list's sort (by name or recently changed). With a type chip chosen there is one group, so no headings are shown.
- Clicking a heading folds or unfolds its group. Folds are kept per campaign on this device (`voyage.recordGroups.<universeId>`, through the existing `storageGet`/`storageSet`, so a refusing private window only loses the memory). A typed search unfolds every group while it lasts, so a match is never hidden. The type chips, "At Regina", search, sort, Locate (L), Delete and the hover cards all work as before.
- From 200 rows (`VIRTUAL_FROM`), the list draws only the items within about 400 px of the view, with pads above and below that keep the scroll height. Record rows vary in height (a summary, tags at half width), so heights are measured as items are drawn and guessed until then (`windowOf` in `record_groups.ts`; the journal's fixed-height `visibleRange` would drift here).
- Up and Down now walk headings and rows together, scrolling to and drawing an item the window had left out. Up from the first item goes to the search box, as before.
Gates: test 1907/1907 pass, check clean, typecheck clean, build pass.
Browser (local 5916, Edge 5918): the small list shows People 3 and Vessels 1. Folding People leaves its heading with "3" and no rows, and the fold survives a reload. With 264 records, before: 264 rows drawn. After: 14 drawn at the top at 1600 (6 at 390) and 23 when scrolled mid-list. Sixty Down presses from the first heading land on the 60th item ("Person 224", which is correct for the sort). No console errors.
Shots: findings/ui_design_shots/sN_N3_list_{before,after}_{1600,390}.png, sN_N3_folded_after_1600.png, sN_N3_long_{before,after}_{1600,390}.png, sN_N3_long_scrolled_after_1600.png
Note for Lane M (M2 waits on this file, released now): the list markup is now `<template v-for="item in shownItems">` with heading items (`li.camp-group > button.camp-group-head`) and row items (`li[data-key]`), plus `li.camp-pad` spacers. The heading's look (`.camp-group-head`, tokens only) is a first pass for M to restyle.
Questions: none

## N4 The command palette for the campaign — done
Files: apps/web/src/workspace/campaign_command.ts (new), apps/web/src/shell/registry.ts (the one hookup line: `offerCampaignCommands(registerCommand);`, plus its import), apps/web/src/workspace/CampaignPanel.vue (one watch that carries out the asks, plus its import), tests/web/campaign_command.test.js (new)
What changed:
- While someone is signed in, the palette offers one "New …" per record type from `RECORD_TYPES`, in the app's own type words: New person, New place, New business, New organization, New job, New event, New item, New note, New vessel. The queue said "New ship", but the type is called Vessel everywhere else, so I kept "New vessel" (question 1). It also offers "Find a record…", "Open the journal", "Open the timeline" and "Go to the party". The same signed-in watch as "My packages" (`market/command.ts`) registers and removes them.
- The journal and the party are addresses, so their commands just go there. New, Find and the timeline need the open campaign: they open the records list and leave an ask in `campaignAsk`. The Campaign panel carries it out once it is open and the campaign is ready: a new record (as Add does: its page opens with the name field ready), the records search focused, or the timeline. From the store (`/packages`), which has no Campaign panel, they open over the map.
- Typing a record's name in the palette already finds it (the omnibox's campaign group, `omni_campaign.ts`), so "Find a record…" goes to the full list's search rather than adding a second search.
Gates: test 1909/1909 pass, check clean, typecheck clean, build pass.
Browser (local 5916, Edge 5918): typing "New" in the palette lists the nine New commands (before: only "Neworld"). Each command run from `/`: New place opens `record=cr_…` with focus on Name; Find focuses "Search records"; Open the timeline shows the timeline (crumb "Campaign / Timeline"); Open the journal focuses "Search the journal"; Go to the party opens `panel=party`. No console errors.
Shots: findings/ui_design_shots/sN_N4_palette_{before,after}_{1600,390}.png, sN_N4_new_place_after_1600.png
Questions:
1. "New vessel" or "New ship"? Recommended: "New vessel", matching the type chip, Add menu and record pages. If you want "ship" in the palette, the better fix is renaming the type's words in `records.ts` everywhere, not only here.

## N5 Lists by keyboard — done (one fix) + proposal (the registry)
Files: apps/web/src/workspace/TimelineList.vue (`takeFocus`), tests/web/record_page_links.test.js (one test)
What I found (checked in the browser, local 5916):
- Records list: already built. Up and Down walk headings and rows (N3), Enter opens (rows are buttons), L locates, Delete deletes, and `/` goes to "Search records" (the Campaign panel's `onKey` calls the list's `focusSearch`).
- Journal list: already built. Up and Down, Enter opens, and `/` goes to "Search the journal".
- Timeline: Up, Down and Enter were built, but **opening the timeline (its button, or the palette's "Open the timeline") left focus on nothing**: the button that opened it is gone, so the arrow keys did nothing until you clicked the list. Fixed: on opening, the list takes focus (`takeFocus`, at Today or at a row a record page asked for), unless a field is being typed in. The timeline has no search, so `/` there opens the palette as it does elsewhere.
What changed: the one fix above. Before, ArrowDown left the active row on the Today row; after, focus is on "Timeline" and ArrowDown moves to the next row.
Gates: test 1922/1922 pass. One earlier run reported a whole-file failure in tests/web/contrast.test.js with fewer tests counted; it passed 393/393 alone and in the full rerun, which fits another lane mid-edit on tokens.css. check clean, typecheck clean, build pass.
Shots: findings/ui_design_shots/sN_N5_timeline_{before,after}_{1600,390}.png
Proposal ("through the one shortcut registry, listed in the palette"): the list keys work, but as each list's own handlers, not registry commands. Moving them in as written would break them. `shell/registry.ts` `handleKey` is global and the first matching command wins, and `/` is already the palette's key (`OmniBox.vue`, `keys: ['/', 'Ctrl+K']`), so a list's `/` would never be reached. Doing it properly needs a scope on the registry: a command declares `scope: 'campaign-list'`, the Campaign panel says which scope has the keyboard, and `handleKey` tries the active scope before the global commands. The palette would then list "Search this list (/)", "Next row (Down)", "Open (Enter)" under the list while one is shown. Size: about 30 lines in `registry.ts`, the 'search' entry in `OmniBox.vue` (Lane D holds it today), and moving three lists' handlers over. Recommended: do it together with the Help window's shortcut list (Lane E), which would read the same scopes.
Questions: 1. The scoped registry above: build it, and who owns `registry.ts` for it? Recommended: Lane N, after D releases `OmniBox.vue`.

## N6 Links both ways — already built
Files: none changed.
What I found:
- A link is stored once and worded from each end: `workspace/links.ts` `connectionsOf` reads both `linkIdsFrom` and `linkIdsTo` and words each side with `labelFor(kind, outward)`, which is the shared vocabulary's `labelFrom` on the from end and `labelTo` on the to end (`CAMPAIGN_LINK_KINDS`, for example crew: "Crew of" / "Crew", owns: "Owns" / "Owned by", ally: "Ally" both ways). The role is the link's own text and shows on both ends. Nothing is stored twice. tests/web/workspace_links.test.js covers it.
- Checked in the browser (local 5916) with one link, Voss crew of the Beowulf with the role Captain. Voss's page reads "Crew of · Beowulf · Captain" and the Beowulf's reads "Crew · Captain Voss · Captain".
Gates: no change, so nothing to run beyond the N5 run (1922/1922).
Shots: findings/ui_design_shots/sN_N6_voss_1600.png, sN_N6_ship_1600.png
Questions: none

## N9 (found) Hover cards where records are still bare — partial (the timeline done; the dossier waiting on CampaignPanel.vue, A)
Files: apps/web/src/workspace/TimelineList.vue (one attribute, one import), tests/web/record_card.test.js (one line)
What changed:
- The timeline's record rows show the record's card on hover (`v-record-card="row.source === 'record' ? row.id : null"`). Journal rows on the timeline are entries, so they have none. The rows are options in a listbox that holds the focus itself, so the keyboard path there is the list's own.
- Not done: the dossier's "Your records here" rows. The one card is mounted in `CampaignPanel.vue`, and `PanelHost.vue` mounts that panel only once the campaign has been opened, so in a session that has only used the dossier there is no card to show. The fix is to move the single `<RecordCard />` from CampaignPanel.vue to PanelHost.vue (always mounted beside the panels), then add the directive to `RecordsHere.vue`'s rows. Lane A holds CampaignPanel.vue, so this waits. Mounting a second card meanwhile would put two tooltips with the same id on screen.
Gates: test 1923/1923 pass, check clean, typecheck clean, build pass.
Browser (local 5916): hovering Captain Voss's row on the timeline shows his card at 1600 and 390. Before: no card.
Shots: findings/ui_design_shots/sN_N9_timeline_{before,after}_{1600,390}.png
Questions: none

## N10 (found) The hover card names up to three connections — done
Files: apps/web/src/workspace/RecordCard.vue, apps/web/src/workspace/record_card.ts (`CARD_TIES`, `cardTies`), tests/web/record_card.test.js (one test)
What changed:
- Under "where it is", the card lists up to three of the record's connections (plan §4.4: "2–3 relationships"), each as "<label> <other record> · <role>", read with `connectionsOf` (`links.ts`). That is the same order and wording as the record page's Connections, so "Crew of Beowulf · Captain" on Voss and "Crew Captain Voss · Captain" on the ship. If there are more, a last line says "and N more". A record with no connections shows no list.
Gates: test 1929/1929 pass, check clean, typecheck clean, build pass.
Browser (local 5916): hovering Voss in the records list shows "… | Crew of Beowulf · Captain | Open" at 1600 and 390. Before: no connections line.
Shots: findings/ui_design_shots/sN_N10_card_{before,after}_{1600,390}.png
Questions: none

## N8 Every campaign thing has a URL that works cold — partial (record, entry, journal, party, characters checked; the timeline row waits on CampaignPanel.vue)
Files: tests/web/campaign_urls.test.js (new). No app code changed.
What I found (each loaded cold, a full page load from about:blank, local 5916):
- A record, at `/`, at `/s/Spinward_Marches/1910` and at `/s/…/1910/orbit`: the record's page opens with its crumb. A record id that isn't in the campaign shows "This record is gone." with the crumb "Deleted record".
- An entry: its page opens. The journal list, the party and the characters list open. A character id that doesn't exist shows "No such character." with "All characters".
- **Defect:** an entry id that isn't in the journal shows "This entry is not in the journal." in the body, but the panel's title and crumb say **"New session"**. `CampaignPanel.vue` words a missing entry with `entryHeading(null)`, which is the word for a new draft. The fix is in CampaignPanel.vue's `title` and `crumb` (a missing entry should read like a missing record, for example "Missing entry"), and it waits on that file (Lane E holds it). Queued as N11.
- The timeline isn't an address yet: it is a local `showTimeline` in CampaignPanel.vue, and `withQuery` keeps only the keys it knows. A timeline row's URL needs a pane for the timeline in `shell/pane.ts`, which `PanelHost.vue` and `CampaignPanel.vue` then read. That is N7 and N8's remaining part, waiting on CampaignPanel.vue.
- The new test writes each campaign pane with `atPane` on each of the three views and reads it back with `addressPane`; the camera keys survive, and moving between panes drops the old id. A Node render of these routes isn't practical (the map view needs a canvas), so the cold load itself is the browser pass above.
Gates: test 1932/1933. The one failure is tests/web/journal_mention.test.js "two thousand records filter inside one frame", a timing test that fails under the full parallel run and passes alone (checked again). check clean, typecheck clean, build pass.
Shots: findings/ui_design_shots/sN_N8_{record,record_on_a_hex,gone_record,entry,gone_entry,journal,party,characters,a_character,orbit_record}_1600.png
Questions: none

## N12 (found) The journal mention filter's timing test flakes under the full run — done
Files: tests/web/journal_mention.test.js (the one timing test)
What changed:
- "two thousand records filter inside one frame" timed a single cold call of `filterMentions` against 50 ms. Under `npm test`, which runs files side by side, that measured JIT warm-up and machine load, and it failed about one run in three today for every lane. It now warms once and keeps the best of five timings. The 50 ms budget and every result check are the same.
Gates: the full run after the change had no failure in this test (1932 pass). Its only failures were in tests/web/changelog.test.js ("rendered", "the window renders the current release open"), which matches Lane E's in-flight changelog work (E claims ChangelogBody.vue). The test passed 3 of 3 times alone. check, typecheck and build were unchanged by a test-only edit.
Shots: none (test only).
Questions: none

## Wrap-up (Johnny said "wrap up")
- Done: N0, N1, N2, N3, N4, N5, N6, N9 (timeline part), N10, N12. N8 partial (record, entry, journal, party and characters load cold; a test round-trips each address).
- Waiting on `CampaignPanel.vue` (Lane E holds it): N7 (timeline narrowed, in the URL), N8's timeline-row URL, N9b (hover cards in the dossier: move the one `<RecordCard />` to `PanelHost.vue`), N11 (a missing entry is titled "New session").
- Open questions, also in N4 and N5 above: 1. "New vessel" or "New ship" in the palette (recommended: "New vessel"). 2. A scoped shortcut registry so the list keys run through it and show in the palette (recommended: Lane N, after Lane D releases `OmniBox.vue`).
- My claims are released and my local Worker (5916/5919) and headless Edge (5918) are stopped. findings/kn_runtime/ and findings/kn_state/ are scratch from my local runs and can be deleted.
