# Stream E — words and help

Read `streams/README.md` first; it is the loop. Until Johnny stops you. Your entries go to
`reports/e_stream.md`; shots `findings/ui_design_shots/se_<item>_*`.

**Area:** the words people read: labels, sentences, empty states, errors, tooltips, in
`apps/web/src/` (any file, **words only**, through the claims file: Lanes D, L, M and N are editing
some of them); the changelog (`changelog.ts`, the window); a new help page. Google developer style
(`directives/instructions_google_style.md` if present, else developers.google.com/style). No Traveller
rule from memory: a rules term is copied from `rules/` or left as it is.

## Queue
- [x] E1 **How to publish and share, in the app:** a short guide at `/help` (a route, cold-load test)
  in the shared look: "Make records", "Publish records", "Publish part of your map", "Share a package",
  "Import a package", "Your ship on other people's maps". Each step names the real button. Reachable
  from the command palette ("Help") and from the changelog window's foot. Read the code for the real
  flow; the orchestrator's summary of 2026-10-17 is in `handoff.md` §294.
- [x] E2 **Every error sentence a person can see:** list the server's `message` strings that reach the
  UI (`apps/api/src`) and the browser's own; fix the browser's in your area; the server's are a list
  for Lane B with your suggested words.
- [x] E3 **Words, area by area,** one entry per area in `reports/e_stream.md`. Store sentences already fit. Campaign, party, journal, dossier, and account menu changed. Build left (board gives `workspace/build/` to D; M is styling it). Sign-in sentences left (`workspace/passkey/`, M). The same empty-hex sentence in `OrbitView.vue` left (L).
- [x] E4 **Tooltips and `aria-label`s:** every icon-only button has one, in the same words as its
  command in the palette. Build's menus left (board gives `workspace/build/` to D).
- [x] E5 **The changelog's 1.3.0 entry, kept current:** as accepted work lands (the board and the
  stream reports), keep a draft entry at the top of `changelog.ts` with version `1.3.0` and today's date
  only when the orchestrator bumps `APP_VERSION`; until then keep the draft in
  `findings/changelog_draft_1.3.0.md` (the test ties `CHANGELOG[0]` to `APP_VERSION`).

- [x] EN1 (15:54) **Lane N's leftovers (N wrapped at 15:45; all four need `CampaignPanel.vue`, which you hold):**
  read `streams/N.md` and the N entries in `reports/n_stream.md` for each.
  - N11: a missing journal entry is titled "New session" in the panel's title and crumb; word it as a
    missing record is ("Missing entry").
  - N9b: move the one `<RecordCard />` from `CampaignPanel.vue` to `shell/PanelHost.vue` (claim; and
    update `tests/web/record_card.test.js`, which expects it in CampaignPanel.vue and fails every
    lane's run while it isn't: Lane A, 16:05), then
    `v-record-card` on `RecordsHere.vue`'s rows, so the dossier's rows get hover cards.
  - N7 and the rest of N8: the timeline as an address (a pane in `shell/pane.ts` that `PanelHost.vue`
    and `CampaignPanel.vue` read), narrowed by record type and "only this ship", in the URL; a cold
    load of a timeline row's URL opens it.
  - N12 (decided 15:40): the scoped shortcut registry, as N5's proposal in `reports/n_stream.md` sets
    out, once Lane D releases `OmniBox.vue`; your Help window then lists the shortcuts from it (UX
    backlog U13).

- [x] EM7 (16:14) **The changelog's dates in the date box** (Lane M's M7 question, decided 16:20: yes): the version
  and the date as two spans so the date sits in `.ui-date` as in the videos; update
  `tests/web/changelog.test.js` to match "1.2.6" and "17 October 2026" separately. Words unchanged;
  only the " · " between them goes.
- [x] EM9 (16:18) **Lane M's leftovers, when `CampaignPanel.vue` and `Panel.vue` are yours anyway** (M wrapped at
  16:15): M9 (one empty-state pattern: `.camp-first.ui-ground` in CampaignList.vue now covers records,
  journal and party; remove the journal's and party's own copies), M1b (the campaign panel's header
  and tabs in the look; the tab overlap at 1600). Style only; read `streams/M.md` and
  `reports/m_stream.md`.

- [x] ES2 (18:44) **Signed out, the Build panel says "Build is off. Switch it on…"** to a visitor who cannot (integration
  sweep finding 2, the worst one a visitor sees; decided 18:35): signed out, the sentence is "Sign in to build here." with
  the sign-in action as its link; signed in, today's sentence. `dossier/DossierPanel.vue` near line 549 (claim it). A
  cold-load test of `/s/Spinward_Marches` signed out.
- [x] ES10 (18:50) **The build warning `INEFFECTIVE_DYNAMIC_IMPORT`** (sweep finding 10: the router is imported both
  statically and dynamically): find the static importer and make it one way; `npm run build` prints no such warning.
  If the importer is `market/command.ts` (D's), claim it for the one line.
- [x] EL7 (18:55) **L7, help: "Start here"** (Epic L step L7, as written in the backlog): `HelpGuide.vue`'s first section for a
  new referee; the window links to `/welcome`; leave "invite players" out until Epic P is live.
- [x] EL6 (18:59) **L6, the About words, a draft** (Epic L step L6, as written): `findings/landing_about_draft.md`, every legal
  sentence marked "Johnny to confirm". Nothing ships.
- [x] E5b (19:15) **The 1.3.0 changelog draft, whole** (E5 accepted 18:35; the draft covers E's and N's work only): add D's store,
  trade sections and map work, C's welcome window and landing, L's software discs and orbit view, A's dice roller,
  palette and chart cache, M's look, B's local command (a line for people who run it, or none), in
  `findings/changelog_draft_1.3.0.md`. Read each lane's stream report for what is done. The orchestrator copies it into
  `changelog.ts` at push time.
- [x] EU22 (20:27) **Focus and screen readers** (UX backlog U22, as written there; you did the names in E4): the rail a
  `nav`, panels as regions with their titles, a visible focus ring in the look on every control, Tab order that
  follows the screen, Esc closes the top layer only. A test per shell landmark; a keyboard-only pass in the entry.
- [x] EU44 (20:14) **A changelog people read** (U44, as written there), the words and the structure only; pictures come with
  the push.
- [x] E7b (19:56) **The last "engine" sentences** (your E7 note, decided 19:50: do them now): the Design by hand menu line, the By hand tag title, the Roll again title when a value is locked (`workspace/build/`, still yours), and the toast "The engine no longer generates it." (find its file; claim it for the line). Words only.
- [x] E5c (20:00) **The changelog draft, kept true** (E5b accepted 19:50): drop the line "While you drag the map on a slower device, it draws more lightly and sharpens when you stop." (D's DF6 takes half resolution out, Johnny 20:10 by the board); add AU15, search that finds text inside records and journal entries. Then, each time a lane's entry lands, add its player-facing line; the orchestrator calls a final sweep before the push.
- [x] E5d (20:43) **One changelog line out** (orchestrator 20:30): `findings/changelog_draft_1.3.0.md` line ~25, "A shared link for a world shows that world's name. A package link shows its title and cover.": Johnny parked link previews (question 25, 20:27). Remove it. EU22's questions decided as you recommend (no Tab trap; the map's live region and the chip listbox later, for D and C).
- [x] EU12 (21:04) **Empty states that teach, the rest** (UX backlog U12; your EM9 did the campaign tabs): every other empty list or panel in the one pattern (`.camp-first.ui-ground`): the store's empty searches, the dossier's empty sections, the orbit view's empty hex already done (E6). Words in Google style.
- [x] LS2 (21:25) **Living systems: the 1,000 lines and the ship names** (`spec_living_systems.md` §5 row LS2; the split in `findings/living_systems/chatter_schema.md`; by hand, one voice; no line restates a rule; two-word ship names from a new list). After A's LS1 lands the schema (write to `chatter_schema.md` meanwhile).
- [x] (decided 22:05: one form, `DDD-YYYY` with the weekday where it already shows, as the campaign plan fixed it; no "long" form and no settings control; the stored field stays unread) EDF1 (21:47) **The campaign's date form, read everywhere** (D's DU18 question 2, decided 21:45: per campaign, set by the referee): the stored `calendar.dateFormat` ('imperial' or 'long') is read by every screen that writes a campaign date (the clock line, the timeline, the journal, the ledger, the record page); one formatter, the referee's choice in the campaign settings. Claim each screen per line. Tests for both forms.
- [x] EH1 (22:34) **Help: Dice** (after A's AD3): a short section in `HelpGuide.vue` on the dice tool: 1D, 2D, 3D, D3 and 2D3, D66, Boon and Bane, the DM, in plain words from `assets/dice_conventions.txt` (quote nothing long; cite it in the test). Google style.
- [?] EU28 (22:34) **Rich text, a small subset: the design first** (UX backlog U28, E with A): propose the subset (bold, italic, lists, links, mentions as today), where it renders (record details, journal bodies), how it stays safe (no raw HTML), and how the players projection and the Player Pack treat it; a proposal entry, no code.
- [x] EU28b (23:52) **Rich text, the build** (your EU28 design accepted 23:15: no headings or images; links http and https only) with two additions: rendered links carry `rel="noopener noreferrer nofollow"` and open in a new tab; a test that a redacted mention ("a record") inside bold, a link or a list neither breaks the parse nor shows the hidden label, in the client render and in the Player Pack. Claim the record page and journal renderers per line.
- [x] (00:02) (note 23:15: D wrote the first sentences in XD2: "News from Regina starts here on 002-1105.", "News from Mora takes more than 60 days to reach Roup.", "The party is at Roup.", "How old the news is at Roup", "Fresh", "60 days old"; reword in place) XE1 **X-boat ripples: the words** (`spec_xboat_ripples.md` §5 "E1").
- [x] (00:11) P4 **Players, the join page** (`players_build_plan.md` step P4, as written) — after A's P3: `/join/:token`, the token out of the address bar at once (`history.replaceState` to `/join`), "You're invited to <campaign>" from `GET /api/join/:token`, sign in and return, **Join**, "Which one is you?" or "Not yet", the refusals including "The referee archived you from this campaign."
- [x] (00:20) P7 **Players, notes in the journal** (plan step P7) — after D's P6: "Written by <handle>", own notes editable and deletable, the referee deletes any note.
- [x] (00:28) P10 **Players, help and words** (plan step P10) — after D's P6: "Invite your players" and "What players see" (every field the projection carries), "Player notes" becomes "For players" everywhere, the changelog line.
## Found by me
- [x] E6 (found) **The orbit empty hex** now says "This hex has no world on the chart." (`views/OrbitView.vue`), the same words as the dossier.
- [x] (19:23) (released 18:35: `workspace/build/` is yours for this item's four files; claim them; D is not in that folder this turn) E7 (found) **Build pane sentences** still say "the engine" (`workspace/build/`). Re-checked: the board still gives that folder to D. `BuildBar.vue` says "The engine can't build this system. To find out why, read the engine's message in the form." `DesignAsk.vue` says "The engine stops generating this system." and "everything else the engine rolled." `EditField.vue` and `SystemEditor.vue` say "more lines from the engine." Suggested, when the folder is free: "This system could not be built. To find out why, read the message in the form." Drop "the engine" from the other three. No Traveller rule in those sentences.
- [x] (19:27) (released 18:35: `workspace/passkey/words.ts` is yours for this item; claim it) E8 (found) **Sign-in** still says "can't" in `workspace/passkey/words.ts` (`NO_WEBAUTHN_PROVIDERS`, `NO_WEBAUTHN_ALONE`, `LOST_MEANS_LOST`, `CODES_LEAD`, `RECOVERY_DO`, and the recovery-file line). Suggested: "cannot". Re-checked: the board still gives that folder to D.
- [x] E9 (21:09) (found) **Records list empties** still use the dashed box. A search with no match, a place filter with nothing of yours, and a type with none yet use the shared empty card. Words stay.
- [x] E10 (21:21) (found) **The other dashed empties** (the timeline, a missing record, a journal list that is not the first visit) still use `.camp-empty`. Put them on the shared empty card. Words in Google style. The records list is done (E9).
- [x] E11 (21:39) (found) **The dashed empty rules are unused.** Nothing in the app still uses `.camp-empty`. Remove them from the records list.
- [x] E12 (21:50) (found) **Build still says "engine" where a person chooses the rules.** The generate sheet's group is labelled Engine, and the regenerate button's title says "Choose an engine". Say Rules, and point the title at Generate with….
- [x] E13 (21:54) (found) **The surface map's tooltip says "engine" for a world's temperatures.** The hover line on Surface map says Temperatures: engine. Say where the figures come from, in plain words.
- [ ] **FREEZE for push 1.3.0 (orchestrator 2026-10-18 10:20): finish the item you are on, write its entry, release your claims, then start nothing new until the orchestrator removes this line.** (Not an item to tick.)
- [ ] (HOLD: after D's SI3) SI4 **Session ingest, words and help** (`spec_session_ingest.md` §5 SI4 as written, plus decisions 10:00): "Bring in a session" covers Copy for your AI (what it holds: your whole campaign, referee notes included; give it only to your own AI), installing the skill from `skill/`, making a token, and the two ways proposals come back (your AI sends them with a token, or you paste its reply); that no AI runs on our side; a token reaches this one campaign only. Never "snapshot".
