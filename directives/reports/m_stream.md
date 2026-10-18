# Stream M report

The m_video_look prompt's report is `directives/reports/m_video_look.md`. Shots come from the harness `findings/km_harness/` (the real components in the real Panel, a seeded store; `&frame=1` adds the clock line and the crumb, `view=chrome` the map's date chip).

## M1 The campaign panel's frame — done (CampaignPanel.vue split off as M1b)
Files: workspace/ClockLine.vue, workspace/StardateChip.vue, workspace/CampaignCrumb.vue (styles only). Not CampaignPanel.vue: Lane N claimed it at 14:08 for N0, so its header and tabs are M1b, waiting.
What changed:
- The clock line under the tabs: the campaign date sits in the outlined Orbitron date box (`.ui-date`'s values), scoped to `.clock`, so the record and entry dates that share `.clock-date` are untouched. On hover the box edge turns --signal-dim.
- The map's date chip: the date is in Orbitron 700, 0.1em, as the videos set it; the chip itself is unchanged. The signed-out chip's `font-weight: 600` is gone: Orbitron ships 400 and 700 only, so 600 was being faked.
- The crumb (a defect found, already there before): a long page name pushed the trail under the panel's Column/Half/Full control and squeezed "Journal" to nothing. Now the middle part keeps at least "Jou…", the page name ends in an ellipsis, and the whole trail stays in the crumb's title. The separators are --signal-dim.
- Tried and dropped: the crumb's links as Orbitron kickers. Orbitron capitals are too wide for a column panel; even "Campaign / Journal / Arrival at Regina" truncated. The trail stays in Inter.
Gates: test 1893/1893 pass (1932 tests, the rest skipped; one earlier run had 1 failure while other lanes were editing, gone on the next two runs), check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M1_{panel_set,panel_unset,crumb,crumb_long,chip_set,chip_unset,chip_out}_{before,after}_{1600,390}.png`
Questions: none

## M3 The party — done
Files: design/base.css (my block), workspace/PartyPanel.vue, TrackBlock.vue, ShipSheet.vue, PersonSheet.vue. Not changed: PersonCard.vue and VesselPlan.vue (inside the ship sheet's own PDF look, no headings) and WhereBlock.vue (N had already made its heading a kicker).
What changed:
- Shared, in my base.css block: `<h3 class="ui-heading ui-kicker">` is now one piece. The kicker alone sets `display: block; margin: 0`, which dropped the heading's row and spacing; each lane was patching that (N's `.where`, `.rec` margins). Now `.ui-heading.ui-kicker` keeps the heading's flex row and 18/8 px spacing, and a `.ui-count` inside a kicker reads as a frame's count (Orbitron, --signal, no pill). **For Lane N:** this also restyles the counts in your "Mentioned in" and "Your journal here" kicker headings to match the frame counts; your margin patches are now redundant but harmless.
- The party: "Ships" and "The party" are kickers with Orbitron counts; both lists sit in frames (--bg-0, --line-2, the teal halo). "No party yet" is on the ground with an Orbitron title and a hex glyph, as the journal's first visit.
- The track: a frame like Connections, labelled "Track" with its count; the legs list inside drops its raised fill. The leg dates stay in mono, as an instrument reads them.
- The ship's "Sheet" and the person's "Character sheet" headings are kickers. The sheet itself (the PDF tabs and rust value tags) is unchanged.
- The harness gained `view=party` and `view=record` (a ship with a four-leg track, a person).
Gates: test 1901/1902 pass (1941 tests): the one failure is `tests/web/record_card.test.js` against `CampaignList.vue`, which Lane N claims and is editing (not mine, not touched). Check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M3_{party_empty,party_many,party_long,ship,person}_{before,after}_{1600,390}.png`
Questions: none

## M4 Characters — done
Files: characters/screens/CharactersPanel.vue, characters/screens/ClaimPage.vue, workspace/CharacterSheet.vue. Not changed: SheetPanel.vue and SheetBox.vue (they are the official sheet's own look: the tabs, the rust value tags, the hex characteristics; restyling them would lose the PDF's face).
What changed:
- The list: "Mine", "Shared with me" and the open character's "Share" / "Who has access" are kickers. The rows sit in one frame (--bg-0, --line-2, the halo) with hairlines between them, where each was its own raised card; a row lights --surface-1 under the pointer.
- No characters yet: the line sits on the ground in a frame, in --text-1 at 14 px (it was muted and loose under the toolbar).
- The character sheet's heading is a kicker; its row wraps at 390 px so Collapse all and Open all go under it instead of overflowing.
- The claim page (the page a share link opens): the ground behind it, the `.ui-brand` mark and wordmark over the card, the card framed, its title in Orbitron 700. The title was `font-weight: 500`, which Orbitron does not ship (400 and 700 only). The brand is the only new mark; no words changed.
- The harness gained `view=characters` (the list, served by `objects.mjs` as `/api/characters`; empty when the address has state=empty), `view=claim` and `view=record&state=sheet` (a person with a filled sheet).
Gates: test 1909/1909 pass (1948 tests, the rest skipped), check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M4_{list_many,list_empty,sheet,sheet_full}_{before,after}_{1600,390}.png`, `sM_M4_claim_after_{1600,390}.png` (no before for the claim page: the harness could not mount it until after the change).
Questions: none

## M2 The records list — done
Files: workspace/CampaignList.vue (styles and one class), design/tokens.css (one line appended), design/base.css (my block), tests/web/contrast.test.js (two pairs).
What changed:
- The rows sit in a frame: `.camp-rows` is now --bg-0 with a --line-2 edge and the teal halo. `.camp-rows` is shared, so the journal's list gets it from here too (its own override in JournalList.vue is now redundant; M9 removes it).
- The group bands from N3: the count in Orbitron --signal at the band's right, no pill, so "PEOPLE … 5" reads like the frames' counts. N's kicker and fold are untouched.
- The toolbar wraps on a narrow panel (search at least 200 px), as the journal's does.
- "Your campaign starts here" is on the ground: `.camp-first.ui-ground` here is now the one rule for every first visit (the records, the journal, the party), with an Orbitron title and a hex glyph.
- New token `--ground-fill` (the ground's radial gradient). `.ui-ground` uses it, and a component whose own background rule loads after base.css names it (`.camp-first` did hide the gradient; only the grid and stars showed).
- The tags, avatars, Timeline, Publish and Add buttons and the type chips are unchanged: they already read in the look.
Gates: test 1919/1919 pass (1958 tests, the rest skipped), check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M2_{records_empty,records_many,records_long,records_half}_{before,after}_{1600,390}.png`
Questions: none

## M5 The dossier — done
Files: dossier/DossierBody.vue, DayNight.vue, JourneyTimes.vue, StellarLines.vue, SystemTree.vue, workspace/RecordsHere.vue (one class on each heading; no style rules changed). Looked at and left: DossierPanel, DossierOverview, FactTiles, StatRows, SocioBlock, SurfaceKey, UwpRibbon.
What changed:
- Every dossier section heading is a kicker (`ui-heading ui-kicker`): the main and side stat sections, Moons, Worlds, Day and night, 100D Jump Travel Times, Stellar configuration, System (its count now in Orbitron), and "Your records here" / "Your records on this world" (the orchestrator's note from N1). N's "In your campaign" already was.
- The components' own heading rules (`.doss-daynight > .ui-heading`, `.doss-tree > .ui-heading:first-child`, `.here-head .ui-heading`, DossierPanel's first-section rule) load after base.css and still set their margins, so nothing moved: every number, tile, ribbon and row is where it was.
- Left as they are, on purpose: the UWP ribbon, the fact tiles, the stat rows and the socioeconomics disclosure are the legacy inspector's look (design_reference.md), already the bar; framing them would add boxes around boxes. SurfaceKey's headings are a map key's labels, not sections.
Gates: test 1922/1922 pass (1961 tests, the rest skipped), check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M5_{dossier_parts,panel}_{before,after}_{1600,390}.png` (from /design: its "Dossier parts" and "Panel" sections).
Questions: none

## M6 The Build pane — done
Files: workspace/build/BuildPane.vue, GenerateSheet.vue, BuildScope.vue, SystemEditor.vue, DensityAsk.vue, HandDesigner.vue (classes on headings, a few style rules). Checked and left: BuildStrip.vue and BuildMarks.vue (Lane D's D3 put them in the look; they read right), BuildBar, BuildMenu, SectorBar, SectorPane, DesignAsk, EditField, OrbitPicker (no section headings; OrbitPicker is the one modal).
What changed:
- Every section heading in the pane is a kicker: Selected, Engine, Method, Hexes to fill, the "hexes that already hold a system" question, Settings, Subsectors, the system editor's sections, the density ask's legend, and the hand designer's Bodies, Profile and System. The selected body's own title in the hand designer stays a title (a name, not a section).
- In the generate sheet the kickers run at 0.24em (one is a whole question), and "your map" beside Settings stays a quiet note in Inter, not an Orbitron count.
- The Generate card and the selected-hexes list sit in frames (--bg-0, --line-2, the halo).
- Tried and dropped: the tally numbers (5 empty hexes, 0 systems as charted) in Orbitron. Its slashed 0 reads as a checkbox at 17 px; they stay in the code face.
Gates: test 1928/1929 on the full run (1968 tests): the one failure was "two thousand records filter inside one frame" (tests/web/journal_mention.test.js, a timing test); it passes 3 of 3 alone, so it is load, not this change. Check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M6_{build_empty,build_many,build_sheet,build_many_full}_{before,after}_{1600,390}.png` (the harness's `view=build`).
Questions: none

## M7 Account and sign-in — done (AccountMenu.vue left: Lane E claims it)
Files: workspace/passkey/AccountPage.vue, workspace/passkey/SignInBody.vue, workspace/ChangelogBody.vue (the changelog window's body; views/ChangesView.vue and ChangelogWindow.vue only mount it and are unchanged). views/Account.vue only mounts AccountPage.
What changed:
- The account page (/account) is on the ground; its grid and stars are held to the window as the page scrolls. The `.ui-brand` mark and wordmark sit at the top, over "Back to the map". Signed out, the sign-in sits in a frame sized to it (462 px); signed in, each card is a frame. Titles are in Orbitron 700.
- The brand is on the page, not in SignInBody: SignInBody also fills the small sign-in card in the panels, where a second brand would crowd the panel's own header. Its "Sign in" title is in Orbitron.
- The changelog window: "What's new" in Orbitron over the red-into-teal rule; the releases on a `.ui-steps` line, the newest step lit, each version line in Orbitron (the newest in --signal); the release title in --text-1, where it was muted.
- Not done, a question below: the date in a `.ui-date` box. That needs the version and the date in two elements; tests/web/changelog.test.js (Lane E's) reads the rendered text "1.2.6 · 17 October 2026" as one run, and I don't edit another lane's test.
Gates: test 1928/1928 pass (1967 tests, the rest skipped), check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M7_{changes,account_out}_{before,after}_{1600,390}.png`. The signed-in account page has no shot: the harness has no stand-in for the session yet.
Questions:
1. For Lane E (or the orchestrator): may the changelog show each release's date in the outlined Orbitron date box, as the videos do? Recommended: yes. It needs the version and the date as two spans, so changelog.test.js would match "1.2.6" and "17 October 2026" separately instead of the joined line. The words stay the same; only the " · " between them goes.

## M8 The shell — done (Panel.vue left: Lane E claims it)
Files: shell/ToastStrip.vue, components/OmniBox.vue (one line), tests/web/contrast.test.js (three pairs). PanelHost.vue draws nothing of its own (it mounts the panels); unchanged.
What changed:
- The toast is the videos' toast: a raised card (--surface-1) with a --signal-dim edge, a --signal bar at the left, a teal halo and --text-0 words. Placement, timing and actions are unchanged.
- OmniBox, reviewing D's D3: one regression put back. D set the search field's edge to --line-2, which is 2.15:1 on the field's glass, under the 3:1 WCAG 1.4.11 asks of a field's boundary; it is --control-line again (3.43:1), and D's halo stays. A new contrast pair holds that edge to 3:1. D's kickers in the results popup read right and are unchanged.
Gates: test 1937/1938 (1977 tests): the one failure is "public games are tracks at the hex tier, drawn on their own layer…", a map test in Lane D's area (map layers); nothing in this item touches the map. Check clean, typecheck clean, build built.
Shots: `findings/ui_design_shots/sM_M8_{toasts,omnibox}_{before,after}_{1600,390}.png` (the harness's `view=toast`; the omnibox from /design). The harness shows two of its three toasts; the one with Restore did not appear in either shot, so the action button is unshot.
Questions: none

## Stopped here (Johnny: "wrap up")
Done: M1, M2, M3, M4, M5, M6, M7, M8. Open: M9 (empty states, one pattern), M10 (/design complete), M1b (the campaign panel's header and tabs, waiting on CampaignPanel.vue).
For M9: the journal and the party still carry their own copies of the first-visit ground rules; `.camp-first.ui-ground` in CampaignList.vue now covers all three, so their copies can go.
