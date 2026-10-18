# E stream report

## E1 How to publish and share, in the app — done
Files: apps/web/src/views/HelpView.vue, apps/web/src/workspace/HelpGuide.vue, apps/web/src/workspace/HelpWindow.vue, apps/web/src/workspace/help_command.ts, apps/web/src/router.ts, apps/web/src/shell/registry.ts, apps/web/src/map/routes.ts, apps/web/src/workspace/ChangelogBody.vue, tests/web/help.test.js
What changed:
- `/help` opens a short guide over the map, in the one modal frame. Close, Escape and the scrim leave `/`. The six sections are Make records, Publish records, Publish part of your map, Share a package, Import a package, and Your ship on other people's maps. Each step names the control on the screen (Add, Publish, Publish records, Select hexes, Publish selection…, Import, Preview, Place on the map, My packages, and the account switches).
- The command palette lists Help, signed in or out. The foot of What's new links to `/help`.
- `map/routes.ts` treats `/help` as the home rect, the same one-line treatment as `/changes`, so the map does not send that URL home.
- A cold-load test renders the six sections. The two account switch labels are read from their constants, so the guide cannot drift from the menu.
Gates: test 1888 pass, 0 fail, 38 skipped. check clean. typecheck clean. build pass.
Shots: findings/ui_design_shots/se_e1_1600_before.png, se_e1_390_before.png (the map), se_e1_1600_after.png, se_e1_390_after.png (the guide), se_e1_changes_1600.png (Help at the foot of What's new). Isolated Chrome. The palette command opens `/help`. Close returns to `/`. The changelog link opens `/help`. At 1600 the card sits inside the window. At 390 the list scrolls inside it.
Questions: none

## E2 Every error sentence a person can see — done
Files: apps/web/src/map/routes.ts, apps/web/src/orbit/LineupSearch.vue, apps/web/src/workspace/AccountMenu.vue, apps/web/src/campaign/import.ts, apps/web/src/deckplan/attach.ts, apps/web/src/builder/draft.ts, apps/web/src/account/passkey.ts, tests/web/routes.test.js, tests/web/deck_plan_attach.test.js, tests/web/passkey_client.test.js
What changed:
- A missing sector, a sector off the published chart, a bad subsector, a bad hex, an unknown address, and a chart with no sectors now say so in plain words. The status line for `/s/Nope` reads "Nope is not on this chart."
- A line-up search that fails says "The search could not finish. Try again." It no longer appends the worker's own text.
- Importing a file that is not a campaign export says "This file is not a campaign export." The parser still names the first fault for the example-pack tool. A row over the limit says "One part of this campaign is too large to import." A deck plan that is not a file says "This file could not be read. Choose a Geomorph Shipyard file." A deck plan that does not fit says "This deck plan is too large to save."
- A closed passkey prompt says "You closed the passkey prompt." A passkey that does not finish says "The passkey could not be used. Try again." An empty held form message says "This system could not be built."
- The server's sentences are the list below, for Lane B. `apps/api` was not edited. `views/MapView.vue` is named for Lane D on the board, so it still shows a `TruthClient:` sentence when the chart fails to load. Suggested words: "The chart could not be loaded." The same file says "Loading N sector indexes." Suggested: "Loading N sectors."

For Lane B. These `error.message` strings reach the screen (the browser shows `error.message` from the account, the campaign, characters, the store, Build, and the public switches). UniverseDO repeats Invalid request, Invalid JSON, Too many requests, and No such route. Migration sentences in `public_schema.ts`, `passkey_schema.ts`, and the object-byte charge log do not reach the screen.

Keep:
- The limit is one sector per request.
- This campaign already has this package. Remove it first, or take its update.
- The chart for this version could not be read.
- Public games are not available yet. The course switch is not available yet. Public ship cards are not available yet.
- Add a passkey before you use the rest of this account.
- 250 MB of objects per universe. This universe is out of space.
- A package holds at most 1280 hexes. A package holds at most 500 records. A package needs at least one hex or one record.
- Choose theirs or mine for every conflict. An update keeps its placement. Leave the anchor out.
- This hex changed. Reload it, then try again. The map changed. Preview again.
- The marketplace is being updated. Try again soon. You cannot report your own package.
- This package has too many versions. This package is for a different edition. This package publishes from a different universe.
- This hex already has a system. This system is already designed by hand.
- Too many requests.
- Covers are not available yet. A hidden package cannot change its cover. A cover is at most 2 MB. A cover thumbnail is at most 200 KB. A cover is a WebP image. A cover thumbnail is a WebP image. A cover is at most 1600 px on its long side. A cover thumbnail is at most 640 px on its long side. The hash does not match the cover.
- That hex address is not valid. The anchor is not in the package. A sector of the piece is not on the map. The piece does not fit on the map.
- Sign-in is not configured. The recovery session was not created.
- This universe is busy. Generation stopped. Try again in a minute.
- That sector address is not valid. Check the address and try again. No such sector. This sector changed. Reload it, then try again. That slot is in use. Choose another slot. That sector already exists. You named that slot twice. Name each slot once. Add at least one hex to this new sector. No such hex. No such job. The job is still running. Nothing to remove. Nothing to restore. A hex is not in this universe. No such record.

Change (current, then the suggested sentence):
- Origin check failed. → That request was blocked. Reload the page and try again.
- Invalid JSON. Invalid request. Invalid limit. Invalid subsector. → That request could not be read. Try again.
- Role required. → You do not have access to that.
- Sign in required. → Sign in to continue.
- Something went wrong. → Something went wrong. Try again.
- No such route. → That page does not exist.
- No stored tree. → This hex has no saved system.
- The engine could not build this system. → This system could not be built.
- The generator refused this hex. → This hex could not be generated.
- That engine and generator are not available yet. → That way of generating is not available yet.
- The chart is not loaded. → The chart is still loading. Try again in a moment.
- That slot holds a charted sector. → That place already has a published chart.
- Ten universes per account. → An account holds at most ten campaigns.
- This system can't be stored. Check the stars and the worlds, then try again. → This system cannot be stored. Check the stars and the worlds, then try again.
- Hash must be 64 lowercase hex characters. Hash does not match the body. → That image could not be checked. Choose the file again.
- Image is larger than 8 MB. → This image is larger than 8 MB.
- Image is not WebP. → Use a WebP image.
- Send the cover as a form with image, thumb, hash, and thumbHash. → The cover could not be read. Choose the image again.
- The thumbHash does not match the thumbnail. → The thumbnail does not match. Choose the image again.
- Campaign page did not advance. Campaign read failed. → The campaign could not be read. Try again.
- sector is required. truthVersion is required. → That request could not be read. Try again.
- This universe has no generation pin. Open it again. Invalid pin. No pin. → Open this campaign again, then try again.
- This universe has no chart. → This campaign has no chart.
- The chart entry is not a sector hex. → That hex is not on the chart.
- Already undone. → That is already undone.
- Nothing to undo. No such revision. → There is nothing to undo.

Admin screens only (still drop the word truth if a person can open them): Build is not finished. Sector build record is missing. Sector catalogue has no sectors. Sector catalogue is missing. Sector inputs are missing. Source truth version has no sectors. That truth version already exists. That truth version cannot be removed. That truth version is already released. The source truth version is not released. No catalogue entry for a slug. No sector index for a slug. Sector index for a slug is not valid. No sector build for a slug. sectors must be 'all'. truthVersion is not a released version. Invalid truth version. Invalid preview query. The version in the body does not match the path. A mismatch "differs from the source version." Preview: No sector index for that version. Sector index is not valid. That hex is not in the sector index. Tree object is missing. Stored object is not a tree. Invalid sector catalogue.

Passed through raw, so the words are not in the route file: `InputChainError` ("No catalogue for …"), `SealError`, `PublishRefusal`, `HexRefusal`, `FormRefusal`, and an allowance refusal. In `packages/generation`, a person can also see "Type a finite number." (suggest "Type a number."), "Nothing rolls this field." (suggest "This field cannot be rolled."), "No system was produced." (suggest "This system could not be built."), and "You can't edit …" (suggest "You cannot edit …").

Gates: test 1909 pass, 0 fail, 39 skipped. check clean. typecheck clean. build pass.
Shots: findings/ui_design_shots/se_e2_1600_before.png, se_e2_390_before.png ("No sector Nope."), se_e2_1600_after.png, se_e2_390_after.png ("Nope is not on this chart."). Isolated Chrome, port 5235. The other sentences are error paths and were not on screen.
Questions: none

## E3 store — done
Files: none edited. Read `workspace/market/` (PackagesView, ProductPage, PublishChooser, PublishForm, RecordsPublish, ImportPanel, ImportsList, CoverEditor, PlaceMarks, PublishFields).
What changed:
- Nothing. The sentences a person reads already fit: empty store, a failed fetch, a missing package, publish, and import.
- `PackagesView.vue` and, later, `ProductPage.vue` were claimed by D during this pass, so they were not edited. Their visible sentences were already in that voice.
Gates: check clean. typecheck clean. Full `npm test` before the dossier and campaign-panel sentences: 1962 tests, 1923 pass, 0 fail, 39 skipped. After those sentences: 1970 tests, 1930 pass, 1 fail, 39 skipped. The fail is `tests/web/journal_mention.test.js` (filter budget 50 ms; measured 348 ms beside the build, then 56.9 ms and 95.6 ms alone). That test is not in these files. Build passed on the earlier run. The later build failed in `apps/web/src/dice/DiceRoller.vue` (`settled` unused, Lane A). Not fixed.
Shots: none. No store sentence changed.
Questions: none

## E3 campaign — done
Files: apps/web/src/workspace/CampaignList.vue, apps/web/src/workspace/CampaignPanel.vue
What changed:
- The first-run line is "It is private to you. Nothing you add changes the map."
- A folded group says "Hide the …", matching "Show the …".
- The campaign panel meta is "Private to you. Nothing you add changes the map."
Gates: same run as E3 store.
Shots: none. These lines show only while signed in, and this session has no sign-in.
Questions: none

## E3 party — done
Files: apps/web/src/workspace/PartyPanel.vue, apps/web/src/workspace/VesselPlan.vue
What changed:
- No ship: "No ship yet. The party stays where you put it."
- No deck plan: "No deck plan yet. Import the file the Geomorph Shipyard exports. The plan is drawn from its tiles."
- "Make lead" left as it is. A test pins those two words.
Gates: same run as E3 store.
Shots: none. The party and a vessel's deck plan show only while signed in.
Questions: none

## E3 journal — done
Files: apps/web/src/workspace/journal/EntryPage.vue, tests/web/party_panel_public_e.test.js
What changed:
- The line under Who can read this is always on screen, including for a referee-only entry. It now says "When this entry is public and this game is public, your ships' public cards show it."
- The journal list was already in player words and was not edited. The timeline is claimed by N.
Gates: same run as E3 store.
Shots: none. An entry shows only while signed in.
Questions: none

## E3 dossier — done
Files: apps/web/src/dossier/DossierPanel.vue, apps/web/src/views/DesignView.vue
What changed:
- An empty hex says "This hex has no world on the chart." The design page uses the same sentence.
- Rules terms, code explanations, and the Build sentences inside the dossier were left. "Slot" stays; it is the word the Build screens already use.
- The same sentence in `views/OrbitView.vue` was left. L claims that file. Queued as E6.
Gates: same run as E3 store.
Shots: findings/ui_design_shots/se_e3_1600_before.png, se_e3_390_before.png, se_e3_1600_after.png, se_e3_390_after.png. Isolated Chrome, port 5237, DPR 1. `/s/Spinward_Marches/0201`, signed out. Before: "in the sector index." After: "on the chart." The server was stopped.
Questions: none

## E3 Build — left
Files: none. The board gives `workspace/build/` to D, and M claimed BuildPane, GenerateSheet, BuildScope, HandDesigner, SystemEditor, and DensityAsk.
What changed:
- Nothing. Player sentences there still say "the engine" and "can't". Suggested when the folder is free: "This system could not be built. To find out why, read the message in the form." Queued as E7.
Gates: same run as E3 store.
Shots: none.
Questions: none

## E3 account and sign-in — done
Files: apps/web/src/workspace/AccountMenu.vue
What changed:
- At the campaign cap the menu says "At most 10". A campaign that already has records says "has records" beside Import.
- Sign-in copy was left. `workspace/passkey/` is D's on the board, and M claimed the sign-in screens. "This browser can't use passkeys." is still there. Suggested: "cannot". Queued as E8.
Gates: same run as E3 store.
Shots: none. The menu lines show only while signed in, and only at the cap or when the open campaign has records.
Questions: none

## E4 Tooltips and aria-labels — done
Files: apps/web/src/orbit/HeaderClock.vue, apps/web/src/orbit/NavConsole.vue, apps/web/src/orbit/TimeControls.vue, apps/web/src/orbit/OrbitHeader.vue, apps/web/src/shell/Panel.vue, apps/web/src/workspace/journal/JournalList.vue, apps/web/src/dossier/DossierPanel.vue, apps/web/src/views/DesignView.vue, apps/web/src/workspace/PartyPanel.vue, apps/web/src/workspace/PersonField.vue, apps/web/src/workspace/VesselPlan.vue
What changed:
- An icon-only button that is a palette command uses that command's name for both the tooltip and the aria-label. Play or pause. Back to the campaign date. Plot to the body before. Plot to the next body. Remove the focused waypoint. Return the course's hours to the estimates (the same apostrophe as the command). On a narrow orbit header, Back. The wide header still shows the word Map, so it keeps that as its accessible name, with the tooltip "Back to the map (Esc)".
- Where there is no palette command, the tooltip matches the aria-label. Close panel. Previous body. Next body. Back to real time: one game second per second. See the plan at full size. Remove, with the ship's or person's name. Take a person out of a field. Add a person to a field.
- The journal icon opens a menu of Handout and Rumour, so it stays "Handout or rumour". It was not renamed to the single command New handout.
- Build was left. The board gives `workspace/build/` to D. Those menus still say More in the tooltip. The roll control's tooltip still says the engine. Queued as E7.
Gates: test 1932 pass, 1 fail, 39 skipped, 1972 tests. The fail is tests/web/changelog.test.js "the window renders the current release open". It looks for "1.2.6 · 17 October 2026" as one string. The window now puts the version and the date in separate spans. M claims ChangelogBody.vue and ChangesView.vue. check clean. typecheck clean. build pass (the known router dynamic-import warning only).
Shots: findings/ui_design_shots/se_e4_1600_after.png, se_e4_390_after.png. Isolated Chrome, port 5239, DPR 1. `/s/Spinward_Marches/0201`, signed out, hover on the panel close. Both widths read title "Close panel" and aria-label "Close panel". Headless Chrome did not paint the native tooltip. No before shots: the close button's pixels did not change. Signed-in controls (party, journal, person, deck plan, orbit) were not on that screen. The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## E5 The changelog's 1.2.7 entry — done
Files: findings/changelog_draft_1.2.7.md
What changed:
- The draft is six player sentences: Help, the guide, the empty hex, empty party and deck plan and a private campaign, the plain failure sentences, and icon buttons that match their commands.
- `changelog.ts` still starts at 1.2.6. APP_VERSION is still 1.2.6. The draft stays out of the changelog until the orchestrator bumps the version.
Gates: no product file changed after E4. Same run: test 1932 pass, 1 fail, 39 skipped (changelog window markup, M). check clean. typecheck clean. build pass.
Shots: none. The draft is not on screen.
Questions: none

## E6 The orbit empty hex — done
Files: apps/web/src/views/OrbitView.vue
What changed:
- An empty hex on the orbit view says "This hex has no world on the chart." The dossier already used that sentence.
Gates: test 1935 pass, 0 fail, 39 skipped, 1974 tests. check clean. typecheck clean. build pass (the known router dynamic-import warning only).
Shots: findings/ui_design_shots/se_e6_1600_before.png, se_e6_390_before.png, se_e6_1600_after.png, se_e6_390_after.png. Isolated Chrome, port 5241, DPR 1. `/s/Spinward_Marches/0201/orbit`, signed out. Before: "in the sector index." After: "on the chart." The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## EN1 Lane N's leftovers — done
Files: apps/web/src/shell/pane.ts, apps/web/src/shell/PanelHost.vue, apps/web/src/shell/registry.ts, apps/web/src/workspace/CampaignPanel.vue, apps/web/src/workspace/TimelineList.vue, apps/web/src/workspace/timeline.ts, apps/web/src/workspace/RecordsHere.vue, apps/web/src/workspace/record_card.ts, apps/web/src/workspace/CampaignList.vue, apps/web/src/workspace/journal/JournalList.vue, apps/web/src/components/OmniBox.vue, apps/web/src/workspace/HelpGuide.vue, tests/web/pane.test.js, tests/web/campaign_urls.test.js, tests/web/timeline_list.test.js, tests/web/record_page_links.test.js, tests/web/record_card.test.js, tests/web/registry.test.js, tests/web/help.test.js
What changed:
- A journal entry that is not in the journal, or is deleted, is titled "Missing entry" in the panel title and the crumb. A real session with an empty title still says "New session".
- The record card is mounted once, beside the panels. Rows in the dossier's list use the same hover card. The campaign panel does not mount a second one.
- The timeline is an address: `panel=timeline`, `tl` for the row, `tlType` for a record type, `tlShip=1` for only this ship. A cold load opens that row, or Today when the row is gone. Escape on a row clears the row and stays on the timeline. Escape on the list returns to Records. The type list is "All types" and the nine type names. A type hides journal entries. "Only this ship" keeps the lead ship, records aboard it, and journal entries anchored to those records. With no lead ship the button is off and the line says "The party has no ship yet." A filter that matches nothing says "Nothing on the timeline matches."
- List keys go through the shortcut registry. While records or the journal have the keyboard, `/` searches that list. On the timeline, `/` opens Search. Down, Up, Enter, L and Delete are commands for the list that is open, and the palette lists them then. Help has a "Keys in a list" section. The draft at findings/changelog_draft_1.2.7.md names the new sentences. `changelog.ts` is still 1.2.6.
Gates: test 1984 pass, 0 fail, 39 skipped, 2023 tests. check clean. typecheck clean. build pass.
Shots: findings/ui_design_shots/se_en1_1600_after.png, se_en1_390_after.png. Isolated Chrome, port 5243, DPR 1, `/help`, signed out. The new section is on the page. No before shot: this item was already open in the tree. The missing-entry title, the dossier card and the timeline filters need a signed-in campaign, which this browser did not have. The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## EM7 The changelog's dates in the date box — done
Files: apps/web/src/workspace/ChangelogBody.vue, tests/web/changelog.test.js
What changed:
- Each release shows the version and the date as two spans. The date sits in `.ui-date`. The words are the same. The dot between them is gone.
Gates: test 1993 pass, 0 fail, 39 skipped, 2032 tests. check clean. typecheck clean. build pass.
Shots: findings/ui_design_shots/se_em7_1600_before.png, se_em7_390_before.png, se_em7_1600_after.png, se_em7_390_after.png. Isolated Chrome, port 5245, DPR 1, `/changes`, signed out. Before: "1.2.6 · 17 October 2026" in one line. After: 1.2.6 beside the date box. The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## EM9 Empty states and the campaign tabs — done
Files: apps/web/src/workspace/journal/JournalList.vue, apps/web/src/workspace/PartyPanel.vue, apps/web/src/workspace/CampaignPanel.vue
What changed:
- The journal and the party no longer keep their own copies of the first-visit card. Both use `.camp-first.ui-ground` from the records list: the ground, the frame, the Orbitron title, the hex glyph.
- The campaign header wraps, and each tab can shrink, so the party line does not paint over the next tab. Words are unchanged.
Gates: check clean. typecheck clean. build pass. test 2000 pass, 3 fail, 39 skipped, 2042 tests. The three failures are in `tests/api/builder_sector_logic.test.js` and `tests/api/campaign_logic.test.js` (server sentences: "That slot holds a charted sector.", "Already undone.", "Invalid request."). Those files are not in this item. Lane B is on the server's error sentences. Not fixed here.
Shots: none. The empty cards and the tabs show only inside a signed-in campaign, and this browser had no account.
Questions: none

## ES2 Signed-out Build sentence — done
Files: apps/web/src/dossier/DossierPanel.vue, tests/web/dossier_signed_out.test.js
What changed:
- Signed out, a sector, subsector, or empty slot says "Sign in to build here." Sign in is a button that opens the same sign-in card as the rail's Build item.
- Signed in, the panel keeps today's sentences: switch Build on to select and generate in this sector or subsector, or to make a sector in this slot.
- A cold load of /s/Spinward_Marches, signed out, renders the Sign in sentence and not "Build is off. Switch it on".
Gates: check clean. typecheck clean. build pass (no INEFFECTIVE_DYNAMIC_IMPORT in this log). test 2021 pass, 2 fail, 39 skipped, 2062 tests. The two failures are in tests/shared/players_view.test.js, which Lane A claims. Not fixed here. Clicking Sign in on /s/Spinward_Marches opened the card "Sign in to use Build. It generates systems on a copy of the map that's yours."
Shots: findings/ui_design_shots/se_es2_1600_before.png, se_es2_390_before.png, se_es2_1600_after.png, se_es2_390_after.png. Isolated Chrome, port 5247, DPR 1, /s/Spinward_Marches, signed out. The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## ES10 Router import one way — done
Files: apps/web/src/shell/go.ts, apps/web/src/router.ts, apps/web/src/workspace/help_command.ts, apps/web/src/workspace/campaign_command.ts, apps/web/src/workspace/market/command.ts, tests/web/router_import.test.js
What changed:
- main.ts is the only static import of the router module. Help, campaign, and marketplace commands no longer import it. They push through shell/go.ts, which the router binds when it is created.
- The registry does not import the router. A static import from the commands would cycle, because the router loads the views that load the registry.
Gates: check clean. typecheck clean. build pass, and the log prints no INEFFECTIVE_DYNAMIC_IMPORT. test 2033 pass, 0 fail, 39 skipped, 2072 tests.
Shots: none. The addresses the commands open are unchanged.
Questions: none

## EL7 Help, Start here — done
Files: apps/web/src/workspace/HelpGuide.vue, tests/web/help.test.js
What changed:
- The guide's first section is Start here: Search for a world, make a vessel on Records, set the campaign date. Invite players is left out.
- That section links to /welcome with the words About Traveller.voyage. The link opens the welcome window.
Gates: check clean. typecheck clean. build pass. test 2033 pass, 0 fail, 39 skipped, 2072 tests. Clicking the link from /help opened /welcome.
Shots: findings/ui_design_shots/se_el7_1600_before.png, se_el7_390_before.png, se_el7_1600_after.png, se_el7_390_after.png. Isolated Chrome, port 5249, DPR 1, /help, signed out. The server was stopped. The lane Vite config and the shot script were deleted.
Questions: none

## EL6 About words, a draft — done
Files: findings/landing_about_draft.md
What changed:
- A draft only. Nothing was added to the welcome window.
- Four legal sentences, each marked "Johnny to confirm": the chart is hosted on the same terms TravellerMap operates under; the geomorph credit and CC BY-NC 4.0; the shipyard software is GPL-3.0 and the images are not; this site grants no rights beyond those terms.
- Far Future's policy is not drafted. The repo does not state its words. The Mongoose notice stays a link in the attribution file.
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2046 pass, 0 fail, 40 skipped, 2086 tests.
Shots: none. Nothing on screen changed.
Questions: none

## E5b The 1.2.7 changelog draft, whole — done
Files: findings/changelog_draft_1.2.7.md
What changed:
- The draft stays out of changelog.ts. APP_VERSION is still 1.2.6. The title stays Help.
- Added player lines for the store (return visits, What's inside, phone controls, missing and failed packages, Sign in to publish, Build on the rail, kind and publisher filters), the map (shared frames, chart load sentences, a lighter picture while dragging on a slower device, subsector names, Where is everyone), a vessel's Cargo, ledger, and Fuel and costs, About Traveller.voyage, a shared link, the orbit visit and its picture, planet pictures without the dossier notice, Roll dice, Search on the orbit view and in the store, chart files kept on the device, and the shared look.
- Also added the later Help, date-box, and signed-out Build lines that were not in the earlier draft.
- No line for the local run command. That command is for people who run the app. Header and log work is not something a player sees.
- Left out work that did not change what a person reads: covers still a proposal, the one-sector sentences already on screen, and the players read.
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2056 pass, 0 fail, 40 skipped, 2096 tests.
Shots: none. Nothing on screen changed.
Questions:
1. The queue file's next open box is EU22. The board's next line is E7, then E8, then EU22, then EU44. Recommended: follow the board and take E7 next. The board names those four Build files as released for that item.

## E7 Build pane sentences — done
Files: apps/web/src/workspace/build/BuildBar.vue, apps/web/src/workspace/build/DesignAsk.vue, apps/web/src/workspace/build/EditField.vue, apps/web/src/workspace/build/SystemEditor.vue
What changed:
- The Keep title, when the form is holding the draft, now says "This system could not be built. To find out why, read the message in the form."
- Design by hand now says "Building stops for this system." The fine print says "everything else that was rolled."
- A long note folds as "and N more lines" in the field and in the profile row.
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2062 pass, 0 fail, 41 skipped, 2103 tests.
Shots: none. The Keep sentence is a title, and a title does not paint in headless Chrome. Design by hand and the folded lines need a signed-in system with a long note. The signed-out map does not show them.
Questions:
1. Three nearby sentences still say "the engine": the Design by hand menu line, the By hand tag title, and the Roll again title when a value is locked. The toast after you confirm still says "The engine no longer generates it." That toast is outside these four files. Recommended: leave them for a later pass. This item named the four sentences above.

## E8 Sign-in, cannot — done
Files: apps/web/src/workspace/passkey/words.ts, tests/web/passkey_screens.test.js
What changed:
- "can't" is now "cannot" in the two no-passkey browser sentences, the lost-account sentence, the recovery-codes lead, the add-a-passkey sentence, and the line in the downloaded recovery file.
- "they're" in the codes lead stays. Comments in that file stay.
- The screen test expects the two new browser sentences.
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2065 pass, 0 fail, 41 skipped, 2106 tests.
Shots: none. Those sentences show when this browser cannot use passkeys, or on the recovery-code screens after sign-in. This Chrome can use passkeys, and there is no signed-in session here. The screen test checks the two browser sentences.
Questions: none

## EU22 Focus and screen readers — waiting
Files: none
What changed: nothing. `shell/Panel.vue` is claimed by D (19:55). The panel region is that file. Left open.
Questions:
1. Recommended: take EU22 again when `shell/Panel.vue` is free. The rail is already a nav.

## E7b The last engine sentences — done
Files: apps/web/src/workspace/build/BuildBar.vue, apps/web/src/workspace/build/EditField.vue, apps/web/src/workspace/build/hand_acts.ts
What changed:
- Design by hand now says "You type and arrange every body. Building stops for this system."
- The By hand tag says "Designed by hand. Building does not generate this system."
- Roll again, when a value is locked, says "Roll again. This replaces the value you typed."
- The toast says "Building no longer generates it."
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2069 pass, 0 fail, 41 skipped, 2110 tests.
Shots: none. These are a menu line, two titles, and a toast after you confirm Design by hand. Titles do not paint in headless Chrome, and that confirm needs a signed-in system.
Questions: none

## E5c The changelog draft, kept true — done
Files: findings/changelog_draft_1.2.7.md
What changed:
- Dropped the line about a lighter picture while dragging. The map stays sharp.
- Search now says it finds words inside a record's details and a journal entry, and marks the word.
- Added player lines for Using the map, a trimmed map cover, a referee-only record on a publish form, phone campaign controls, Back to the map, the orbit title clear of Search, fading body chips, "No ships here" only while Campaign is open, and Space in the Time drawer.
- A shared link for a world shows that world's name. A package link shows its title and cover.
- The draft stays out of changelog.ts. The title stays Help.
Gates: check clean. typecheck clean. build pass, no INEFFECTIVE_DYNAMIC_IMPORT. test 2069 pass, 0 fail, 41 skipped, 2110 tests.
Shots: none. Nothing on screen changed.
Questions: none

## EU44 A changelog people read — done
Files: apps/web/src/changelog.ts, apps/web/src/workspace/ChangelogBody.vue, apps/web/src/workspace/ChangelogWindow.vue, apps/web/src/views/ChangesView.vue, apps/web/src/router.ts, apps/web/src/map/routes.ts, tests/web/changelog.test.js, tests/web/cold_load.test.js
What changed:
- Each release has a two-line story. In the list, the title links to `/changes/<version>`. That page shows the version, the date, the title, and the two lines. All versions returns to the list. An unknown version says "This version is not in What's new."
- The page has a picture slot, and no release has a picture yet. `APP_VERSION` stays 1.2.6. Nothing was added at 1.2.7.
- `/changes/<version>` stays on the chart, the same way `/changes` does.
Gates: check clean. typecheck clean. build pass, 778 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2084 pass, 1 fail, 42 skipped, 2127 tests. The fail is `tests/api/players_logic.test.js` ("a member's 65536th live note is refused"), claimed by B. Not touched.
Shots: findings/ui_design_shots/se_eu44_1600_before.png, se_eu44_390_before.png, se_eu44_1600_after.png, se_eu44_390_after.png, se_eu44_1600_page.png, se_eu44_390_page.png, se_eu44_1600_missing.png. Isolated Chrome. Record packages opens `/changes/1.2.6`. All versions returns to `/changes`. `/changes/9.9.9` shows the missing sentence. At 390 the version page fits in the card.
Questions:
1. Should `/changes/<version>` unfurl in a social preview before a picture ships? Recommended: no. Add the preview with the picture at the push. That preview needs the server, and this item left server routes alone.

## EU22 Focus and screen readers — done
Files: apps/web/src/shell/Panel.vue, apps/web/src/shell/Rail.vue, apps/web/src/design/base.css, apps/web/src/shell/registry.ts, tests/web/shell_landmarks.test.js, tests/web/registry.test.js
What changed:
- The rail was already a nav. Map is the current page on the map, including a window over it. On the store, Map is not current and Marketplace is.
- An open panel is a region named by its title.
- The focus ring beats a control that clears its own outline. Search, which had no ring, now shows one. A rail item still pulls the ring inward.
- Escape that a layer already handled does not run another command. Help closes on Escape and leaves the map.
- The first Tab stops on the map are the rail: Expand navigation, Map, System, Campaign, Build, Marketplace.
Gates: check clean. typecheck clean. build pass, 783 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2095 pass, 1 fail, 42 skipped, 2138 tests. The fail is `tests/api/players_logic.test.js` ("a member's 65536th live note is refused"). Not touched.
Shots: findings/ui_design_shots/se_eu22_1600_before.png, se_eu22_390_before.png, se_eu22_1600_after.png, se_eu22_390_after.png. Isolated Chrome. Before is the rail's first button. After is Search with the ring, and the Map button marked current.
Questions:
1. Should a panel trap Tab the way the lightbox does? Recommended: no. This item says Tab follows the screen, and a trap would hold focus inside the panel.
2. The backlog also names a live region on the map canvas and body chips as a listbox. Recommended: leave both. They sit on the map and in the orbit view, and this item's list did not name them. `MapView.vue` was claimed by D while this item ran, so it was not edited.

## E5d One changelog line out — done
Files: findings/changelog_draft_1.2.7.md
What changed:
- Removed "A shared link for a world shows that world's name. A package link shows its title and cover." Link previews stay parked.
- EU22 stays as decided: no Tab trap. The map live region and the chip listbox wait for later.
- The draft stays out of changelog.ts.
Gates: check clean. typecheck clean. build pass, 786 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2098 pass, 0 fail, 42 skipped, 1 todo, 2141 tests. The todo is `tests/api/players_logic.test.js`, marked P2b2. Not touched.
Shots: none. Nothing on screen changed.
Questions: none

## EU12 Empty states that teach, the rest — done
Files: apps/web/src/workspace/market/PackagesView.vue, apps/web/src/workspace/RecordsHere.vue, apps/web/src/design/base.css, tests/web/store_states.test.js, tests/web/empty_teach.test.js, findings/changelog_draft_1.2.7.md
What changed:
- A store search with no match uses the shared empty card. The title is "No packages match". The sentence is "Try fewer filters, or search with other words." The action is Clear all. Clear all clears the search.
- The card's rules are in the shared stylesheet, so the store draws the card without opening the campaign list.
- The store's other empties stay in the store frame: nothing published, nothing hidden, no packages yet, a missing package, and a catalogue that did not load.
- A system or a world with no records of yours uses the same card. The sentence is "Add a record here. It stays in your campaign." On a world it says "Add a record on this world. It stays in your campaign." The action is Add a person, and the existing menu still adds another type. When the list has records, Add here stays in the heading.
- The empty hex sentence is unchanged. The journal block stays hidden when it has no entries.
- One line in the 1.2.7 draft. The draft stays out of changelog.ts.
Gates: check clean. typecheck clean. build pass, 792 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2121 pass, 0 fail, 42 skipped, 1 todo, 2164 tests. The todo is `tests/api/players_logic.test.js`, marked P2b2. Not touched.
Shots: findings/ui_design_shots/se_eu12_1600_before.png, se_eu12_390_before.png, se_eu12_1600_after.png, se_eu12_390_after.png. Isolated Chrome, signed out, a search that matches nothing. The dossier card is hidden until you are signed in, so it was not shot.
Questions:
1. Socioeconomics with nothing built has no action that does not invent a control. Recommended: leave the muted sentence.
2. The store empties that are not a search stay in the store frame. Recommended: yes. This item names empty searches, and that frame is the store's own pattern.
3. "Place it" on a record with nowhere to put it is a new control. Recommended: leave it until an item names that control.

## E9 Records list empties — done
Files: apps/web/src/workspace/CampaignList.vue, tests/web/empty_teach.test.js
What changed:
- A search with no match, a place filter with nothing of yours, and a type with none yet use the shared empty card.
- The search title is "No records match". The sentence still names what you typed. The action is Clear the search.
- The place filter title is "Nothing of yours here". The sentence still names the place. The action is Show every record.
- A type with none yet keeps its title ("No people yet", and the same for the other types). The sentence is "Add one. It stays in your campaign." The action is the existing Add button.
- The first-visit card is unchanged. The dashed-box rules stay, because a missing record and the timeline still use them.
Gates: check clean. typecheck clean. build pass, 792 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2122 pass, 0 fail, 42 skipped, 1 todo, 2165 tests. The todo is `tests/api/players_logic.test.js`, marked P2b2. Not touched.
Shots: none. The records list is behind sign-in, and this session has no account, so the card was not opened in a browser.
Questions: none

## E10 The other dashed empties — done
Files: apps/web/src/workspace/TimelineList.vue, apps/web/src/workspace/RecordPage.vue, apps/web/src/workspace/journal/JournalList.vue, tests/web/empty_teach.test.js, findings/changelog_draft_1.2.7.md
What changed:
- A timeline with nothing dated uses the shared empty card. With no campaign date the title is "No campaign date yet" and the action is Set the campaign date. With a date the title is "Nothing on the timeline yet" and the action is Open the Journal. The sentences are the ones already written for those two cases.
- A timeline whose filters hide every row uses the same card. The title is "Nothing on the timeline matches". The sentence points at All types and Only this ship, which are already on the screen.
- A missing record uses the card. Deleted: "This record was deleted", "You can put it back.", Undo the delete. Otherwise: "This record is gone", "It is not in this campaign."
- A journal list that already has entries, and then has nothing to show, uses the card. Search: "No entries match", the words you typed, Clear the search. A kind with none yet: "No sessions yet" (and the same for notes, handouts, and rumours), "Add one. It stays in your campaign.", and the existing New button. A place filter: "Nothing of yours here", the place, Show every entry.
- The first-visit journal card is unchanged. One line in the 1.2.7 draft. The draft stays out of changelog.ts.
Gates: check clean. typecheck clean. build pass, 795 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2130 pass, 0 fail, 42 skipped, 1 todo, 2173 tests. The todo is tests/api/players_logic.test.js, marked P2b2. Not touched.
Shots: none. The timeline, a record page, and the journal open only while signed in, and this session has no account.
Questions:
1. The filtered timeline has no new button. Recommended: leave it. All types and Only this ship are already on the screen.
2. "You can put it back." and "It is not in this campaign." Recommended: keep both.

## LS2 Living systems: the 1,000 lines and the ship names — done
Files: apps/web/src/living/lines/corpus.json, apps/web/src/living/lines.ts, apps/web/src/living/words.ts, packages/engines/src/core/ship_names.js, packages/shared/src/ship_names.ts, packages/shared/src/index.ts, tests/shared/chatter_schema.test.js, tests/shared/ship_names.test.js, tests/web/living_words.test.js
What changed:
- A separate pool of 1,000 lines in corpus.json. The sample pool is unchanged, and sampleLines still returns only that file. Customs lines ask a crew to declare cargo or show papers. They do not name a ban.
- The split is control 150 (50 highport, 25 base, the rest one starport class), customs 110 (25 at law 0 to 1 with no other condition, 18 also by government 0 or 1), news 150 (each trade code at least 5, amber 15, red 10, each base letter 5, Holiday 5), market 110, weather 110 (each atmosphere digit at least 5), advert 110, ship 120 (40 in jump or in system, 40 empty), rumour 100, distress 40 at weight 0.2. Every category has at least 20 lines with an empty or one-key condition.
- The six fixtures hear 297, 289, 271, 248, 231, and 208 lines. The schema test runs over every file in the lines folder.
- Ship names are two words, sixty and sixty, the same list in the engine file and the browser file. shipNameFor agrees for seeds 1, 2, and 99. Generation does not import the engine file.
- Switch and ticker words are in words.ts, the same sentences the settings screen already shows. The chip word is Traffic. The dismiss name is Hide for this visit. Nothing new is mounted. No changelog line: these lines are not on screen yet.
Gates: check clean. typecheck clean. build pass, 800 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2141 pass, 0 fail, 42 skipped, 1 todo, 2184 tests. The todo is tests/api/players_logic.test.js, marked P2b2. Not touched.
Shots: none. No new control is on screen. The settings sentences were already there.
Questions:
1. The settings screen still has the sentences written out, and words.ts repeats them. Recommended: point the screen at words.ts when that file is free.
2. Hide for this visit is the accessible name for the ticker dismiss. Recommended: keep it for the ticker item.
3. The thousand lines stay a separate pool from the sample. Recommended: keep them separate until something shows them.

## E11 The dashed empty rules are unused — done
Files: apps/web/src/workspace/CampaignList.vue, tests/web/empty_teach.test.js
What changed:
- Removed the unused dashed-box rules from the records list. No screen still uses that class. The shared empty card is unchanged.
Gates: check clean. typecheck clean. build pass, 800 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2142 pass, 0 fail, 42 skipped, 1 todo, 2185 tests. The todo is tests/api/players_logic.test.js, marked P2b3, and Lane B claims that file. Not touched.
Shots: none. Nothing on screen used those rules.
Questions: none

## EDF1 The campaign's date form, read everywhere — proposal
Files: none changed.
What I found:
- `calendar.dateFormat` is stored as `imperial` or `long`. Nothing that writes a date reads it. The clock, the timeline, the journal, the ledger, and the record page already print `DDD-YYYY`, with the weekday beside the clock.
- The written form is already fixed: `DDD-YYYY`, and `DDD-YYYY HHHH` when a time matters (`campaign_manager_plan.md` §7.1 and §10 Q4, referee 2026-10-02). The weekday sits beside that (§7.9). No file says what `long` prints. The older readout "Year 1,105 · Day 1 · 00:00:00" is the form §7.1 replaced.
- The settings control would live with the campaign settings. That screen is claimed by Lane D, so it was not edited. The surface time bar is claimed by Lane C.
Questions:
1. What should `long` print? Recommended: do not add a second form or a settings control until you name the string. Every screen stays on today's `DDD-YYYY` (and the weekday where it already shows). Alternative, using only the weekday names and the imperial date already specified, with no extra words: `Wonday 002-1105`, and `Holiday 001-1105`. When a time matters: `Wonday 002-1105 0830`. I did not ship that.

## E12 Build still says engine where a person chooses the rules — done
Files: apps/web/src/workspace/build/GenerateSheet.vue, apps/web/src/workspace/build/BuildPane.vue, tests/web/build_words.test.js
What changed:
- The generate sheet's first group is labelled Rules. The choices under it are unchanged.
- The regenerate button's title is "Open Generate with…, then select “Regenerate them too”." While a job is running it still uses the existing hold sentence.
- No changelog line. This is a label on a sheet that was already there.
Gates: check clean. typecheck clean. build pass, 801 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2153 pass, 0 fail, 42 skipped, 0 todo, 2195 tests.
Shots: none. The sheet opens only while signed in, with Build on, and this session has no account.
Questions: none

## E13 The surface map tooltip says engine for a world's temperatures — done
Files: apps/web/src/surface/caption.ts, tests/web/surface_caption_words.test.js
What changed:
- The hover line on Surface map no longer says "Temperatures: engine". When the world has its own figures it says "from its figures". When it has only a climate word it says "from its climate word only". The mean and the range are unchanged.
- No changelog line. One phrase in a tooltip that was already there.
Gates: check clean. typecheck clean (apps/api). test 2159 pass, 0 fail, 42 skipped, 0 todo, 2201 tests. build failed in vue-tsc on files other lanes claim: first `CampaignsPanel.vue` missing while Lane D claimed `PanelHost.vue` (the file was present on a second run), then `packages/shared/src/schemas/proposals.ts` line 107, a missing comma, Lane Z. Not touched.
Shots: none. The line is the title on the surface map. Lane C claims that stage, and this session has no account.
Questions: none

## EH1 Help: Dice — done
Files: apps/web/src/workspace/HelpGuide.vue, tests/web/help.test.js, findings/changelog_draft_1.2.7.md
What changed:
- Help has a Dice section. It names Dice on the rail, 1D, 2D, 3D, Lower DM, Raise DM, D3, 2D3, D66, Boon, and Bane, and the palette commands Roll dice, Roll D3, Roll 2D3, Roll D66, Boon, and Bane. R rolls 2D when nothing else is using that key.
- 1D, 2D, 3D, the DM, D3, 2D3, and D66 follow assets/dice_conventions.txt (lines 6–13, 14–18, 19–26, and 27–32). The section does not quote that file. Boon and Bane follow Johnny, 2026-10-17 15:15: best two of three, and worst two. The DM stops at −6 and +6, which is the stepper on the screen.
- One line in the 1.2.7 draft. The draft stays out of changelog.ts.
Gates: check clean. typecheck clean. build pass, 821 modules, no INEFFECTIVE_DYNAMIC_IMPORT. test 2210 pass, 1 fail, 42 skipped, 0 todo, 2253 tests. The failure is tests/web/news_layer.test.js against MapView.vue. Lane D claims both files. Not touched. The help tests passed.
Shots: findings/ui_design_shots/se_eh1_1600_before.png, se_eh1_390_before.png, se_eh1_1600_after.png, se_eh1_390_after.png. Isolated Chrome, /help, signed out. The Dice section is the last step. At 390 it wraps inside the card.
Questions: none

## EU28 Rich text, a small subset: the design first — proposal
Files: none changed.
What I found:
- Record details and journal bodies are plain text. A journal body already turns `[[cr_…|label]]` and `[[hex:Sector/1910|label]]` into chips (`workspace/journal/body.ts`). Anything else, including a tag, stays text.
- The players projection redacts those strings and still returns text (`players_view.ts`). The Player Pack redacts mentions to a visible name, or to "a record" when the target is hidden (`pack/text.ts`), then escapes the whole string and turns line breaks into breaks (`pack/html.ts`).
Proposal:
- Stored text stays text. No new column, no HTML in the row.
- One parser beside the mention splitter. It emits text, bold, italic, a list, a link, and the mentions that already exist. The renderer escapes every text node. A tag in the source stays text. A link is http or https only.
- The same renderer draws record details and journal bodies.
- The players projection keeps returning the string. The client renders it. Hidden mentions stay as they are today.
- The Player Pack runs the same parser after redaction, and emits escaped tags for bold, italic, lists, and links. A mention is still the visible name, not a token.
- Headings and gallery images stay out of this subset. Headings collide with the page's own headings. An image needs its own insert. That is a later item.
- Size: one parser, two screens, and the pack. No server route. Lane A has nothing to store.
Questions:
1. Leave headings and gallery images out of the first subset? Recommended: yes.
2. May a link be any https or http address? Recommended: yes, and nothing else. A `javascript:` address stays text.

## EU28b Rich text, the build — done
Files: apps/web/src/workspace/journal/body.ts, apps/web/src/workspace/journal/rich.ts, apps/web/src/workspace/journal/RichNodes.vue, apps/web/src/workspace/journal/JournalBody.vue, apps/web/src/workspace/EditableText.vue, apps/web/src/workspace/RecordPage.vue, apps/web/src/pack/html.ts, tests/web/rich_text.test.js, tests/web/record_card.test.js, findings/changelog_draft_1.2.7.md
What changed:
- One parser beside the mention splitter. It draws bold, italic, a list, and an http or https link. A tag, a javascript address, an image, and an unclosed mark stay text. A mention stays one chip inside those marks.
- Record details and journal bodies use it. The details read view is a div, so a link is not inside a button. Summary and player notes stay plain. A click on a link or a chip does not start editing. A chip still opens the record or the world.
- A link opens in a new tab with rel="noopener noreferrer nofollow".
- The Player Pack runs the same parser after redaction, on details and journal bodies only. A hidden mention is the words "a record" inside bold, a list, and a link, and the hidden label is absent. A mention inside an address falls back to text.
- One line in the 1.2.7 draft. The draft stays out of changelog.ts.
Gates: test 2302 pass, 0 fail, 43 skipped, 0 todo, 2345 tests. check clean. typecheck fails in apps/api/src/routes/tokens.ts and apps/api/src/universe/proposals.ts. Lane B claims both. Not touched. build pass, 868 modules, vue-tsc clean, no INEFFECTIVE_DYNAMIC_IMPORT.
Shots: none. Record details and journal entries open only while signed in, and this session has no account. The HTML is covered by tests/web/rich_text.test.js.
Questions: none

## XE1 X-boat ripples: the words — done
Files: apps/web/src/map/news_layer.ts, apps/web/src/map/NewsScrubber.vue, apps/web/src/workspace/HelpGuide.vue, tests/web/news_hover.test.js, tests/web/help.test.js, findings/changelog_draft_1.2.7.md
What changed:
- Hover on the world the news starts from: "News starts at Regina on 123-1105."
- Hover where the news has not arrived, the other way: "News from Lysen has not reached Regina by day 60."
- Hover on the party's world: "The party is here, at Regina."
- The age legend: "Age of the news at Roup", from "Just arrived" to "60 days later".
- Help has a News section. It names News, How fast does news travel from here, and How old is the news here. The 60 days and the lack of a station wait match apps/web/src/news/params.ts (horizonDays 60, stationHoldHours 0).
- The sentences stay where they are drawn. changelog.ts is unchanged. One line is in the 1.2.7 draft.
Gates: test 2311 pass, 1 fail, 43 skipped, 0 todo, 2355 tests. The failure is tests/web/rail_build_pitch.test.js against apps/web/src/shell/Rail.vue. Lane D claims Rail.vue. Not touched. check clean. typecheck clean. build pass, 872 modules, vue-tsc clean, no INEFFECTIVE_DYNAMIC_IMPORT.
Shots: findings/ui_design_shots/se_xe1_1600_after.png, se_xe1_390_after.png. Isolated Chrome, /help, signed out. The News section is the last step. No before shot: the copy was already in the file when the page was opened. The hover sentences show only after News is open on a world.
Questions:
1. Move these sentences into a new words file, as the spec's file list says? Recommended: no. The 23:15 note says reword them in place.

## P4 Players, the join page — done
Files: apps/web/src/characters/screens/JoinPage.vue, apps/web/src/characters/screens/join_model.ts, apps/web/src/router.ts, tests/web/join_page.test.js, tests/web/cold_load.test.js, apps/web/index.html, findings/changelog_draft_1.2.7.md
What changed:
- /join/:token reads the token, then history.replaceState to /join. /join is the return address. The token is kept in session storage under voyage.join.token so sign-in can come back. A dead link drops it.
- Signed out: "You're invited to <campaign>." The line names the referee's handle, then "Sign in to join. You come back to this page."
- Signed in: Join. Then "Which one is you?" The people are the projected party's people. Not yet is always there. Then /?panel=campaign.
- Refusals use the claim page's four sentences, plus "The referee archived you from this campaign." A full campaign uses the server sentence "This campaign has 255 players, the most it can have." The owner's own link uses "You cannot change that."
- index.html has referrer same-origin. changelog.ts is unchanged. One line is in the 1.2.7 draft.
- GET /api/join/:token and POST /api/join already exist. No new server route.
Gates: full suite before the cold-load route list was updated: 2329 pass, 3 fail, 45 skipped, 0 todo, 2377 tests. One fail was tests/web/cold_load.test.js, because the new routes were not in its list. That file and tests/web/join_page.test.js then pass together, 17 tests. The other two fails are tests/shared/chatter_schema.test.js. Lane Z claims apps/web/src/living/lines/corpus.json and that test. Not touched. check clean. typecheck clean. build pass, 876 modules, vue-tsc clean, no INEFFECTIVE_DYNAMIC_IMPORT.
Shots: findings/ui_design_shots/se_p4_1600_after.png, se_p4_390_after.png. Isolated Chrome, signed out, preview stubbed as Hollow Verge / ada. The address after load is /join. The card shows the invite and Sign in. No before shot: the page is new. Join, Which one is you, and the refusals need a signed-in account.
Questions:
1. Keep the token in session storage for the return from sign-in? Recommended: yes. The bar is /join. A value that lives only on the page is gone when sign-in leaves the site.

## P7 Players, notes in the journal — done
Files: apps/web/src/workspace/journal/list.ts, apps/web/src/workspace/journal/JournalList.vue, apps/web/src/workspace/journal/EntryPage.vue, tests/web/journal_screen.test.js, findings/changelog_draft_1.2.7.md
What changed:
- The handle is campaign.authorNames[entryId]. The journal row does not store it. A non-empty name shows "Written by <handle>" and a chip of the handle, on the list row and on the entry page.
- A player can edit and delete their own note. That path was already the page's read-only flag from P6. Images stay off for every player, including on their own note. A referee who can edit the page can still change images.
- A player save of a referee or private entry is dropped by the existing player commit. The save call still returns true. The body stays as stored.
- Mentions: a hidden mention still reads "Met a record." The record id does not appear.
- The referee delete is today's delete, with Undo. The test restores the note.
- changelog.ts is unchanged. The 1.2.7 draft has one line: "A journal note names who wrote it. You can edit and delete your own notes. Images stay off for a player."
Gates: npm test 2362 pass, 0 fail, 45 skipped, 0 todo, 2407 tests. check clean. typecheck clean. build pass, 876 modules, vue-tsc clean, no INEFFECTIVE_DYNAMIC_IMPORT. The journal screen test covers the name, the image lock, the own-note edit, the dropped private save, and the referee Undo.
Shots: none. "Written by" is inside a signed-in campaign journal. This session has no signed-in campaign, so a shot would be a stub.
Questions:
1. Leave kind and visibility editable on a player's own note? Recommended: yes. The item did not name those controls. A change that fails the player commit is already dropped.

## P10 Players, help and words — done
Files: apps/web/src/workspace/HelpGuide.vue, apps/web/src/workspace/RecordPage.vue, apps/web/src/pack/html.ts, tests/web/help.test.js, tests/web/record_visibility.test.js, tests/web/rich_text.test.js, findings/changelog_draft_1.2.7.md
What changed:
- Help has Invite your players. It names Party, Get the invite link, Copy, Revoke, Join, and Not yet.
- Help has What players see. The sentence names the summary, the details, For players, the tags, the kind, when it is, the place, the sheet text, the status, the images and their captions, a connection's role and notes, the kinds you set, the place and the ships of the party, and the campaign date. A journal note names who wrote it. A hidden mention reads "a record".
- On the record page, the heading, the field label, and the prompt say For players. An empty field says "No notes for players yet."
- The Player Pack heading is For players. It was "Notes for players".
- The stored name playerNotes is unchanged. changelog.ts is unchanged. The 1.2.7 draft has one line.
Gates: npm test 2371 pass, 0 fail, 45 skipped, 0 todo, 2416 tests. check clean. typecheck clean. build pass, 876 modules, vue-tsc clean, no INEFFECTIVE_DYNAMIC_IMPORT. help, record visibility, and rich text tests pass.
Shots: findings/ui_design_shots/se_p10_1600_before.png, se_p10_1600_after.png, se_p10_390_before.png, se_p10_390_after.png. Isolated Chrome, /help, signed out. The record-page label needs a signed-in record, so it is not in the shots. At 390 the campaign date sits on the help lead in both the before and the after shot.
Questions:
1. Name the date format, the living switches, and the table sets in What players see? Recommended: no. The plan's list is the sentence. The date format stays unread. The other two have no player sentence, and a line about them would guess.
