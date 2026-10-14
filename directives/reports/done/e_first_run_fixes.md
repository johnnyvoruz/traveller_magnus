# E first run fixes report
Prompt: prompts/e_first_run_fixes.md
Status: done

## Changed files
- apps/web/src/search/omni.ts: rank is exact name, then a name that starts with the query, then the rest. Inside a rank, a system in the Spinward Marches comes before the others, then the name.
- apps/web/src/components/OmniBox.vue: an empty field lists Regina, Spinward Marches, and Jewell subsector, and says "Try a world, a sector, or a subsector." Choosing a world or a sector drops the camera query so the map flies there.
- apps/web/src/shell/Rail.vue: a signed-out Campaign or Build shows its reason when focused, and on the expanded rail. Choosing one expands the rail and opens the sign-in card.
- apps/web/src/workspace/journal/list.ts: `entryHeading` is the title, or "New session" (and the same shape for the other kinds).
- apps/web/src/workspace/CampaignPanel.vue: at column and half width the panel heading is that entry heading. The crumb uses it too.
- apps/web/src/workspace/CampaignCrumb.vue: the trail buttons use the dossier crumb face, not the browser's grey button.
- apps/web/src/workspace/journal/EntryPage.vue: "Saved" shows only after a change on this visit.
- apps/web/src/workspace/journal/EntryGallery.vue: the empty image control reads "Add an image" without a hover. The first image is "Cover".
- apps/web/src/workspace/journal/JournalList.vue: "Download the Player Pack" is hidden until the journal has an entry. It stays at the top of the journal list.
- apps/web/src/workspace/timeline.ts: `timelineAdvice`. No date: "Set the campaign date. Sessions take that date when you write them." With a date and nothing dated: "Add a session in the Journal. It uses the campaign date."
- apps/web/src/workspace/TimelineList.vue: the button does that step. "Set the campaign date" opens the date field. "Open the Journal" opens the Journal.
- tests/web/omni.test.js, tests/web/timeline_list.test.js, tests/web/entry_images.test.js: the rule and the new words.

The panel heading and the crumb live in CampaignPanel.vue and CampaignCrumb.vue. Those files are Lane D's. The journal page cannot set the panel heading, so this pass edited those two lines of chrome.

## Gates
npm test:      pass (1562 pass, 0 fail, 24 skipped)
npm run check: pass
typecheck:     pass
build:         pass. index chunk `dist/assets/index-CId6R2dG.js` 175.31 kB (gzip 59.12 kB)
fourth gate:   partial. On http://127.0.0.1:5195 (Vite cache under the temp directory, stopped after):
- Pointer: focused search, saw the three examples, typed "reg", clicked Regina. The address became `/s/Spinward_Marches/1910` with the camera query dropped. Regina was the first result.
- Keyboard: typed "Spinward Marches" and pressed Enter. The address became `/s/Spinward_Marches`.
- Signed out, pointer: Campaign expanded the rail, showed "Campaign: sign in to keep records, a party, and a journal.", and opened the sign-in card.
- Signed out, keyboard: focus on Build showed the sentence beside the rail. Enter expanded the rail and showed "Build: sign in to generate systems and sectors on your map."
- 520 px, 960 px, and 1440 px: the search field and the expanded rail stayed inside the window.
- Signed in, the journal entry, and the timeline were not opened. This browser had no session, and a passkey on this origin will not verify against production.

## Contract published
none

## Needs from others
- Lane D: the sign-in card always says "Keep a private campaign on top of this map: people, places, jobs, your ship." It does not change when Build is pressed. When the card opens from Build, the pitch should be "Sign in to use Build. It generates systems on a copy of the map that's yours." The rail already says that sentence. `workspace/passkey/SignInBody.vue` and `workspace/account.ts` are D's.
- Lane B: search on the server still orders a rank by name only (`apps/api/src/routes/truth.ts`). The browser re-ranks the 50 rows it receives, and live "reg" already returned Regina first. If a query has more than 50 prefix matches that sort before Regina, Regina never arrives. The same tie-break belongs in the `ORDER BY`: the Spinward Marches, then the name.

## Questions for Johnny
1. A session written before the campaign has a date stays off the timeline after the date is set. The new line says sessions take that date when you write them, and the next empty state says to add a session. Recommended answer: leave it. Do not date the older entries when the campaign date is set. The referee sets In fiction on an entry that should appear.

## Ranking rule
An exact name match is first. A name that starts with the query is next. Anything else that contains every word is last. Accents and case are ignored. Inside one of those three bands, a system in the Spinward Marches comes before other sectors, then the name from A to Z. The test covers "Regina", "reg", "mora", the hex "1910", and the sector "Spinward Marches".

## What I found, finished, and backed out
Found: the prompt's Progress was empty, and git had no edits in the files this prompt allows.
Finished: the five findings above.
Backed out: nothing.
