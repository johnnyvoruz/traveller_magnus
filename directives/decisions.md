# Decisions

A dated ledger, newest first, moved here unchanged on 2026-10-17 from `board.md` and the answered part of `questions_for_johnny.md` (the directives cleanup). **Read this before deciding anything; do not re-decide.** Add new decisions at the top of their part.

## Decisions from Johnny

## 2026-10-18 14:05 by `date`: the release is 1.3.0
- Johnny: "This feels like a v 1.3 to me, can we refactor to align around this v number?" `APP_VERSION` and the changelog entry are 1.3.0 (was to be 1.2.7); the queues, board and push notes say 1.3.0; later pushes are 1.3.N. The engine stays e1.2; the tidal E1 deviation still ships as engine e1.3 (a separate number, Johnny 13:10).

## 2026-10-18 13:10 by `date`: E1 timing; three lines of comms
- Johnny: "117 next engine change, 118 yes, 119 engine number - also local system comms either needs to be wider or one more character line taller to support 3 lines of text".
- **117:** E1 ships with the next engine change. **118:** as e1.3 (1.3.0). **119:** Regina takes the engine's number (about 135 h solar day); no correction pin. Z ZE1 held until then.
- **Three lines:** the receiver one line taller (the width kept for 390), fixed at that size: C CC4b, blocks 1.2.7.

## 2026-10-18 12:58 by `date`: tidal locking fixes
- Johnny pasted a brief ("additional fix for this rev"), saved whole as `prompts/tidal_locking.md`. W1 (the web profile's moon test) in 1.2.7: C CW3. E1 (the engine's lunar mainworld period, a planned deviation) held: questions 117 to 119; the brief itself says to bundle it with the next engine change, and a bump needs a truth rebuild.

## 2026-10-18 12:45 by `date`: System Comms, one name; the receiver far right, fixed, SIG alive
- Johnny: "we can move the local comms to the far right of the page now that we moved the buttons and then we lost the SIG animation, it should be at zero until there's a message and then it sorta fluctuates. and then during the beowulf comms, the ui shifts slightly I don't know if that's to fit the text or not. the local comms container should never shift or grow, and then we should unify the feature, either call it local comms or system comms - let's call it system comms."
- C CC4, blocks 1.2.7. Accepted first: C CW2 (one header corner; the crumb opens the overview and stays in the orbit view, `overview=1`) and CC2b (the layout test reads the public chart, skips offline).

## 2026-10-18 11:57 by `date`: comms for a system the ship is not in
- Johnny: "oh, I want to show comms even if my ship isn't in the system, so the players / ref can get a peek of what's going on there". Confirms the orchestrator's 11:55 rule (the view listens); Z ZC2 as written.

## 2026-10-18 11:28 by `date`: comms whole in 1.2.7
- Johnny: "I want comms working before the push". C's CC3 (the red theme and `mayday`) moves above the freeze line and blocks 1.2.7, with an end-to-end proof in Edge (real transmissions within a minute, across a system change and a tab hide; `?mayday` red and back).

## 2026-10-18 11:28 by `date`: `mayday` plays the Easter egg
- Johnny: "Also I want to add a url variable like &mayday that will trigger the comms easteregg after 3 seconds on page load with that URL". Orchestrator's details: orbit-view addresses only; 3 s after the receiver mounts; skips the rarity roll and the once-only check and does not mark it played; plays even with System Comms off, for that visit only; once per page load. In C's CC3 (after the push).

## 2026-10-18 11:17 by `date`: the comms emergency red theme
- Johnny pasted a brief ("Note for traveller comms work"): Beowulf turns the receiver Traveller Red (700 ms in, red through every fragment, 900 ms back), label EMERGENCY, by explicit metadata, reusable for later emergency events, nothing else changed. Saved whole in `prompts/c_comms_emergency_theme.md`; C CC3, after 1.2.7 (orchestrator: an Easter egg does not hold the push).

## 2026-10-18 10:40 by `date`: System Comms in the orbit view, on; Copy for your AI by part
- Johnny: "System chatter enable / disable should be in the orbit view maybe above the Fit button in the lower right. have it enabled to on, maybe the button name is System Comms - I have another agent doing some work on additional messages. - I think maybe give the copy / export a few different options, maybe we do a phases, one for ship / characters / campaign items (people places things). or all of it, the user can decide what aspect or how it can work with their process or AI budget"
- **System Comms:** a toggle above Fit in the orbit view, **on by default for everyone**, remembered per device; the campaign settings' chatter switch goes (background traffic's stays). Supersedes the 23:50 note that the referee's `living` switch governs chatter. C CC2, in 1.2.7.
- **More messages coming** from another agent of Johnny's: when they arrive, they go through the corpus review as the package's did (Z's adapter and the four blocked categories), never pasted in whole.
- **Copy for your AI by part:** the referee picks **All**, or any of **Ships** (vessels: cargo, ledger, finances, track), **Characters** (with their sheets), **People, places and things** (the campaign records), **Journal**; the date, the party and the instructions always come with it. The size of each choice shows beside it, so it fits the AI budget. This answers questions 110 (sheets come with Characters; images never) and 111 (size shown per choice; above 150,000 tokens the warning).

## 2026-10-18 10:15 by `date`: two ways back, no model on our side
- Johnny: "I must have a fundamental misunderstanding of MCP, I don't want a model to actually intepret anything on our side, what I want is for a user to be able to use their agent with our API and their campaign token or whatever and they can use their AI to write to their campaign in the database (JUST THEIR DATA ONLY!!) - 108 there should be no snapshots? Just you click the copy for your AI and then that's what you use instead. So the process is always copy for your AI, paste that into your AI with transcript and our skill file and then they can either use the AI to do the write or yeah, now I see, they can paste the output of their AI into a place where our API can parse and make updates to their campaign, that might work"
- **No model runs on our side, ever.** MCP is a request format agents speak; our `/mcp` and our API only check and store structured data (the zod schemas). Confirmed as built.
- **A token reaches one campaign only:** bound to one universe and its owner (`ownedDoor`, `mcp/server.ts:45`); it reads that campaign and sends proposals to it; nothing else.
- **The flow:** Copy for your AI (the whole campaign, Copy or Download) + the transcript + the skill go into the referee's own AI. Back by either door: (a) the AI sends the proposals itself (API or MCP, with a token), or (b) **Paste your AI's reply** into the campaign: our API parses it (no AI), checks it against the proposal format, and it lands in the same Proposals list. This replaces the 10:00 "no paste box" (107). Paste needs only the referee's sign-in, not agent access, so it can ship while agent access is off (109 then concerns only the token door).
- **"Snapshot" is not a word in the app.** The button is "Copy for your AI". Each record in the copied text carries its version number, so an update to a record edited after the copy still shows a conflict (108's protection, unchanged, no screen word "snapshot").
- **Review stays:** proposals from either door wait in the Proposals list for accept, edit or drop (Johnny 10-17 20:24, spec §0).

## 2026-10-18 10:00 by `date`: the snapshot for the referee's AI (105 to 108); jump times advance the clock
- Johnny: "105 - wither an md or just copy to clipboard / 106. I'd do the whole record for each item, it's the only way to ensure full context is maintained across systems / 107. no paste proposals box, we shouldn't have an AI running on our side, it's my understanding that the prompt will tell the user agent how to submit the data for their campaign, am I incorrect in this? 108. I need more information, I don't understand what problem this is solving. Also I want to add an additional feature that when a user clicks on any of the 100D jump travel times, it will advance the time in their campaign by the amount on the jump time."
- **105:** "Copy for your AI" gives both: **Copy** (to the clipboard) and **Download** (`<campaign>-for-your-ai.md`), the same text.
- **106:** the **whole record** for every item (every field the referee sees: details, For players, tags, place, links, visibility, rev), no 300-character cut, no "names only".
- **107:** **no Paste proposals box.** The prompt tells the referee's agent how to send its proposals: MCP (`POST /mcp`) or HTTPS with an agent token (`POST /api/universes/:id/campaign/proposals`). The token is never in the prompt (the referee gives it to their agent from Agent access). So the way back needs **agent access on**, which ships off in 1.2.7 (SI1b): question 109.
- **108 withdrawn:** already built. Each record in the snapshot carries its version (`rev`); an update proposal names the version it read (`base_rev`); if the referee edited that record after the snapshot, accepting it is a conflict and shows both, as when two browsers edit the same record (spec §1.4, contract `resolve`). The review screen uses the existing conflict look (SI3).
- **Jump times advance the clock** (orchestrator, presentation and the campaign's own clock; no rule): D DJ1.

## 2026-10-18 09:50 by `date`: the skill in `skill/`; two doors for the referee's AI
- Johnny: "move the referee skill from findings to the new /skill folder and anything else that is in an ignored folder - I have a feeling we're really going to need some duality to ensure the AI/SI tools work correctly. I think the pattern will have to be that the ref clicks \"campaign snapshot for MCP\" that generates a propmt for the user AI that essentially says what is already created and then they use that context plus their campaign transcription so that their LLM doesn't re-create listings that already exist, and then knows how to update existing ones."
- Done: Z ZF1b (the skill to repo-root `skill/`, blocks 1.2.7). The audit of ignored folders: nothing else the product or a test needs lives there; the other clean-copy skips are generated data (truth-local v10, `universe/raw`, `dist`, wrangler); the two unapproved rules drafts (starports, climate bands) and the character sheet transcription stay in `findings/` under rule 1 until Johnny approves them into `rules/`.
- The snapshot design is questions 105 to 108 (written as the orchestrator recommends); SI2 to SI4 are not issued until answered.

### 2026-10-17 22:40 by `date`, questions 79 to 83 (the city lights fix) and a brighter glow
Johnny: "go with recommendation on all five and feel free to up the glow on these lights, I'd like them to feel very sci-fi please".
- **79:** the lock glow stays as X fixed it: it begins at the body's drawn edge; outside the body unchanged.
- **80:** `planet_rendering.md` "Tech level, bloom" rewritten by the orchestrator: domes inside the surface disc only; city light on the surface, night side, under cloud and the air's scattering; the air shell carries no city light on any side at any zoom. The legacy limb-glow sentence is gone.
- **81:** a C item, CS10: neon as an accent on street and arterial lines only, gold highways, near-white cores, look C's gain and sheet lowered on population A; **and the glow raised**: bigger, softer domes around cores and along the threads, strongest at TL 12+, inside the disc and under the air (G6 holds; X's pixel test stays untouched and green).
- **82:** the limb fade stays as it is.
- **83:** the service worker keeps registering under Vite dev; no guard.


### 2026-10-18 00:00 by `date`, the Comms evidence is the orchestrator's
Johnny: "The changed files / tests / transcripts / screenshots would really be just for you in case we need to fix anything, I'm not using that other agent moving forward". The lanes still write full entries (paths, tests, transcripts, shots); the orchestrator reviews them and keeps them for fixes; Johnny gets a short summary. Nothing goes back to the agent that wrote the package.

### 2026-10-17 23:50 by `date`, Living Systems Comms: the supplied package is authoritative
Johnny: "Implement the complete Traveller Living Systems Comms feature using the attached `Traveller_Comms_Complete_Handoff` package. [...] These are the authoritative instructions and supersede all earlier prototypes. The visual design is approved and locked. Use the supplied bars-only receiver [...] do not reintroduce a skip button or waveform selector. [...] Complete the implementation, run the required tests, and report the actual code changes and results." (package in `assets/Traveller_Living_Systems_Comms_FINAL/`).
- Supersedes 20:27 answers 43 (placement: now lower right above the planet tabs, one transmission at a time), 45 (categories: `rumour`, `distress`, `news`, `advert` off by default; allowlist control, customs, market, weather, vetted ship, gated by UWP) and 47 (the supplied 1,178-row corpus replaces E's 1,000 lines). C's LS4 withdrawn. LS5 (background ships), the switches, quiet, seeds, "no line restates a rule" and LS7 stand.
- Split (orchestrator): Z ZC1 the engine, adapter, mixer, single-timer controller, Beowulf, audit; C CC1 the bars-only receiver in Vue, mounted and wired; one interface between them (`prompts/comms_receiver.md`). The orchestrator assembles the brief's §8 report from both entries.

### 2026-10-17 21:55 by `date`, dice: D66, a readable result, and the full conventions
Johnny 21:50: "Dice roller looks good, we also want to have a d66 and then the font for the number result should be like a monospace font, I rolled a 17 and the sci-fi font the 7 was too bendy and hard to make out." 21:55: "full dice rules" with the MgT2E Game Conventions text (1D/2D, 2D+3/3D-2, D3 and 2D3, D66), saved verbatim as `assets/dice_conventions.txt`. A: AD2 (D66, mono result), AD3 (a DM stepper, D3 and 2D3), cited to that file. Still no typed notation (the 2026-10-17 "simple and streamlined" rule stands).

### 2026-10-17 20:39 by `date`, questions 63 to 78
Johnny: "63. yes / 64. just ref named ships that players are attached to / 65 - 68 = go with recommendation | 69 - 78 = go with recommendation".
- **63:** the starport fuel moved into `rules/mgt2e_space_travel.json` by the orchestrator on his word: `fuel.byStarportClass` (A, B refined; C, D unrefined; E, X none; `assets/2eWorldCreation.txt` 1127-1158), `fuel.bases` (N, S refined for the named ships; C and W fuel null), `fuel.basesNote`. A ten-line insertion, nothing else changed; `rules:gen`; refuel, travel and rules tests 16/16.
- **64:** base fuel is offered only on a ship the players are attached to (a party vessel) that the referee marks naval or scout; the orchestrator's reading of "just ref named ships that players are attached to".
- **65 to 68 as recommended:** base fuel unpriced (the referee decides); corsair grade unset; a Way Station offers none; berthing, facilities and base rolls left out.
- **69 to 78 as recommended:** whole sets; kept on the referee's account (a new D1 table and R2 objects), chosen per campaign; no campaign one-off copy at first; "from scratch" = copy then clear; players see the chosen set's tables read-only; no marketplace yet; 256 KB a set, 20 sets an account; only kinds with a roller; one route family `/api/table-sets?kind=`; the passenger editor first.

### 2026-10-17 20:27 by `date`, "yes to all": questions 24 to 62
Johnny: "yes to all - streams have reported in". Every recommendation as written in `questions_for_johnny.md` (moved here):
- **24:** the trade draft moved unchanged to `rules/mgt2e_trade.json` by the orchestrator; `npm run rules:gen`; tests pass. Johnny may still spot-check the 18 split rows before the push.
- **25: link previews not now.** B5's `wrangler.toml` change (`run_worker_first`) is reverted to the 1.2.6 line by B; `preview_tags.ts` stays in the tree unused and parked.
- **Session ingest 26, 28 to 36:** phase 1 = tokens, the MCP endpoint and the routes under it, proposals, the review screen; SI0 (B, paper) and SI5 (Z) now; server after P2b, store after P3, screens after P6. Nothing applies without review (a rule, not a setting). Keep up to three 300-character quotes per proposal; pending 30 days, reviewed 90; never audio or transcripts. Sheets in phase 4. Referee only until phase 5. Words: "Proposals", "Agent access", "Bring in a session", "your AI agent"; "SI" not in app copy. OAuth when asked. Billing alert $20 a month before SI1 ships. A token bound to one campaign by default. The referee's agent may read referee-only text.
- **37:** the X-boat network = bare route records plus the 15 typed "Xboat" (`xboatRouteRule`), for both specs; chart colours unchanged.
- **Living systems 38 to 51:** all 15 dials; activity by the Freight Traffic world DMs (a dial); none civilian at X or Red (Red: patrols); arrivals at 1.15x the mainworld's 100-diameter limit; the role triggers; ticker in the orbit view's lower left and under the dossier header, never on the chart; players same as referee, own mute; **the sample approved, minus the customs line that paraphrases the Law Level table (no line restates a rule)**; `living` in campaign settings; E writes the 1,000 by hand; "Quiet on this device" and a "Traffic" chip; two-word ship names from a new list; hover = name, role, one line; the AI hook after Epic P and the 1,000 lines, 2,000 calls a day.
- **X-boat 52 to 62:** one leg 148+6D h (154/169/184); station hold 0 until given; off-network within 2 parsecs, shown X-boat only until the wait is given; two-way; the eleven 5-parsec routes kept with a setting; the button in all four places; players may run it; per-campaign settings later; no schedules or Monte Carlo in v1; whole-Imperium only on request; own sectors out of scope.

### 2026-10-17 20:24 by `date`, session ingest: the referee's agent does everything but the last step
Johnny: "Oh whoops, the skill for them to transcribe the game was not for US to do the recording, but for the ref to do all of it with the prompt we give them and then their agent basically makes the MCP call to update their campaign, I don't want to do the processing for all the intenstive part. Its up to them to get that sorted out and then we just ingest their last step."
- The referee's own agent (with our skill and prompt) records, transcribes and extracts; we ingest only its proposal batch, over MCP. Question 27 answered: the referee. Phase 6 (our transcription) dropped for good. The MCP endpoint is part of phase 1, not phase 2 (the orchestrator's reading of "their agent basically makes the MCP call"). Note at the top of `spec_session_ingest.md`.

### 2026-10-17 19:55, question 23: the Random Passenger table into `rules/`
Johnny: "yes to 23, move it into rules and remember we will want to tweak so the user can select other random tables in case I need to swap this out".
- Copied unchanged from `findings/rules_drafts/mgt2e_random_passenger.json` to `rules/mgt2e_random_passenger.json` by the orchestrator on his word (CLAUDE.md rule 1); `npm run rules:gen` run; book and page blank. Goes in the next push. A's AT3b and D's DT3b released.
- **Selectable tables:** the referee will be able to pick other random tables, as with trade tables (18:40). One mechanism for every rules table a roller reads (Z, ZT1b); the roller reads its table through one replaceable function.

### 2026-10-17 19:20, ship finances on the list
Johnny: "I also want to add additional ship metrics like who owns the ship / ship shares / what's the ship payment when is it due / how much fuel is and how much is upkeep on top of ship mortgage, we might have some of this already, I just wanted to make sure I have it added to my list". Backlog step **T1c** (owners and shares, payment and due date, fuel aboard, upkeep), every value typed; queued as A's AT1c (after AP1b) and D's DT1c (after AT1c). Computing payments, maintenance or share values from the price waits on a rules source from Johnny.

### 2026-10-17 19:10, systems that feel alive; X-boat news ripples (two specs)
Johnny: "two options for refs that will make the systems feel more alive, I want to generate like 1,000 various system "chatter" lines that will give life (when it gets cheap enough, I'll want to send actual system data to a cheap LLM and generate actual chatter that's reactive to what's going on) the other option I want to be able to turn on is other ship traffic in the system, it doesn't have to be real and not tracked via the universal tracking system. I just want the systems to feel alive. It would depend on the mainworld tech and other UWP factors that make sense. The other thing I want to figure out is how to best and cheaply simulate how X-Boat traffic would work, and you could click a button to see how fast information is travelling (almost like ripples from systems). These can be also given to more high effort models".
- Two one-session specs for a high-effort model: `prompts/x_living_systems_spec.md` (chatter lines with a 100-line sample, the later LLM hook, background traffic in the orbit view; referee switches, off by default; browser-only, never stored, zero server cost) and `prompts/x_xboat_ripples_spec.md` (the X-boat graph, shortest-path news arrival, the ripple picture over campaign days). Both: every traffic or speed number cited from `rules/`/`assets/` or a named parameter with a question; nothing from memory.
- 19:10 also: Johnny gave `x_session_ingest_spec.md` to a higher-effort model (running).

### 2026-10-17 18:40, the 22 questions: "all of your recommendations look right", with three changes
Johnny: "There could be more than 500 notes per campaign, especially if we can make some AI connectivity (which we will eventually want) [...] Other than that, all of your recommendations look right, the text file will not use page numbers, so let's just leave them blank. For trade I will also want to be able to load our own trade tables or create others so the user can pick, just in case Mongoose changes their mind (we have their permission right now for concepting the application to use whatever we want as long as we're not charging and we're not charging anything)".
- **Players 1 to 4, 6 to 8: yes as recommended.** A players ship's leg to a hidden place shows the hex, not the name; an owner-archived player can't rejoin through a live link (a self-archived one can); a non-member gets 404 "No such universe." (403 only for an archived member); own notes keep `rev`; the publish form warns when a chosen record is referee-only; `seq` climbing is accepted; `/join/*` and `/claim/*` masked in the log.
- **Players 5, changed:** no 500-notes cap. The per-minute guards stay (10 note writes, 60 reads a minute per player); the live-notes count is a guard only, **65,535 per player** (the orchestrator's pick in the spirit of "something dumb like 255"), never a design limit.
- **Players 9: yes, B may build P2** after the orchestrator reviews the contract (P2a).
- **Trade draft 10 to 18 and 20: yes as recommended** (four passages; Z's split of the 18 rows; names as printed with an approved name-to-code table in the module; Exotics out of every roll with nulls; Exotics' illegal flag null; the Population sentence as one; Steward DM = highest Steward skill aboard; Mail rows = the Freight Traffic roll's total DM; selling 3D; `tradeRoutes` dropped). **19: page numbers stay blank.**
- **21: yes,** Z drafts which starports sell which fuel from `assets/2eWorldCreation.txt`. **22: crop a map cover to its systems when it's added** (D5).
- **New, trade tables the user picks:** besides the official tables, a referee can load their own trade tables or make others, and choose which a campaign uses ("just in case Mongoose changes their mind"). Extends backlog T3c from one copied table to whole selectable table sets. Design first (Z, ZT1).
- **Permission (Johnny's statement, recorded for reference):** Mongoose has given permission, for now, to use whatever we want while concepting the application, as long as nothing is charged; nothing is charged.
- **New, session ingest:** "a skill that you can record your game, transcribe it with an SI (superintelligence, new word for AI) Agent, and then we have an API or MCP that will automatically update your campaign on traveller.voyage - I want that to be a thing". A spec first: `prompts/x_session_ingest_spec.md`, one high-effort session. This lifts the 15:20 pause **for the spec only**; building waits on Johnny's yes to a phase with its costs.

### 2026-10-17 17:00, players: no 12 cap; playing and archived (replaces "12 players" of 15:30)
"What's with the 12 player limit? Maybe we remove that because players might cycle in and out of a game,
maybe they can be active or archived or some other friendly name, if we have to have a limit make it
something dumb like 255 or whatever." Built as: members are active or archived (screens say "Playing"
and "Archived"; actions "Archive" and "Bring back"); a guard of 255 active members; archiving replaces
removing, so a player's notes keep their name and a returning player comes back to the same row.

### 2026-10-17 16:50, stream mode is the default
"I'd like to default us to this stream mode of doing things, so we can keep that going." Every lane
runs on a stream unless the orchestrator has a reason for a one-off prompt (a single bounded job, a
halt answer, a fresh lane's first task). How: `streams/HOW_TO_RUN.md`.

### 2026-10-17 16:45, "yes to both"
- `BOOT.md` step 2 sends a "stream" row to its queue, as `lanes/START.md` does.
- Stream queues' `reports/done/` paths repointed to `archive/reports/` (paths only).

### 2026-10-17 16:40, the cleanup's questions
- The legacy tree (`hex_map.html`, `js/`, `style.css`): **kept frozen for now** ("keep frozen for now").
- D2, sign-in providers: **closed.** Discord and Google are on and working ("they are working right now … just leave it the way it is").
- D4, three commits of 2 to 3 October with old-app files: **closed.** Johnny doesn't remember; it no longer matters (the slice 0 checklist it closed is history).
- G22, a claimed pregen, shared or given: **closed as built.** A character's share link carries a role (`character_invites.role`, `owner` or `editor`), so the referee can share it (the player edits, the referee keeps it) and can later hand ownership to an editor (`apps/api/src/character/service.ts`, "Ownership goes to an editor."). No new decision needed.

### 2026-10-17 15:30, "yes to all eight" (was the board's "Open with Johnny")
Nothing open. Answered 2026-10-17 15:30, "yes to all eight":
- Epic P: players write journal notes (kind note, visible to players, with their name); 12 players per campaign; no second referee in this leg.
- Epic L: the orchestrator's positioning draft stands for Johnny to edit; the fair use and credits words are Johnny's, on the welcome window only (until he sends them: credits and version only).
- Epic T: the ship sheet's Cargo and Passenger rows become a view of the vessel's manifest; **Johnny supplies `rules/mgt2e_trade.json`** (T4b onward wait for it; the draft shape goes to `findings/rules_drafts/` first); the party's cash stays separate from the ship's ledger.

### 2026-10-17 15:20, a public API and MCP server are PAUSED (was a board section)
A request came in for an API and an MCP server. Johnny: "Let's pause, I'm not ready to foot this bill yet." No lane designs or builds either. Notes for when it comes back: `findings/api_mcp_paused.md`.

### The board's "Decisions from Johnny" ledger (to 2026-10-14, wording unchanged)
- 2026-10-15 10:05, orchestrator (Z's questions): covers count against no quota (one pair per package, at most 2.2 MB, a replaced pair is deleted); a hidden package's cover shows only to admins, as its page does (2026-10-14 15:45); Z's two map covers are retaken without the app chrome (Fix 1).
- 2026-10-15, Johnny: nothing on the site is ever sold ("we can't charge money for anything"); the marketplace borrows store patterns because users know them. Import is the buy button.
- 2026-10-15 08:55, Johnny (storefront): a package uses its records' art when it has some; sectors get a generic default or the publisher's pasted screenshot (no automatic snapshot yet); the Grok lanes (A, B, C, E; Z enhanced) make the images themselves and say so if they cannot; style is RPG concept art with no shared palette ("too same-y"). Orchestrator: cover order upload, then first record image, then the kind default; everything free, Import is the buy button (Johnny may overrule); a takedown pulls an uploaded cover off the public bucket.
- 2026-10-14 21:00, Johnny (live map): ships barely visible at the hex zoom and absent zoomed out; lose the "Example" text; "think tactical CIC or air traffic control"; blips must not fight the map, "way way way too cluttered". Orchestrator design in `d_traffic_display.md` (decided): constant-size diamond, dark casing, one measured `--chart-traffic`, own ships filled cyan / others open, invisible 6 s sweep that paints each track, no text at rest, hover data block, click zoomed out flies to the hex; card keeps one quiet "Example game" footer line (Johnny may drop it). A dimmed "scope" view with a track list only if Johnny asks after the shots.
- 2026-10-14 20:35: example content is live on production (six packages by traveller_voyage, twelve example games, 18 ships). Removal: `--production --remove --apply` on `seed_production.mjs` and `seed_games.mjs`.
- 2026-10-14 19:35, Johnny: remove the 1.2.0 WAV from history (amend 20fc3c8, force-push with lease; `*.wav` ignored in versionvideo); yes to public ships glowing and pinging when zoomed out (B overview feed, D drawing, after 1.2.1).
- 2026-10-14 19:20, orchestrator: example handles follow `judgeUsername`; example emails `<handle>@example.invalid`. D's zoomed-out ships question asked.
- 2026-10-14 18:45, orchestrator (Z questions): links travel in a package (F16, ends both published); house universes stay live; Hollow Verge keeps the engine's names; provenance left; records packs keep their charted hexes. Production order: push 1.2.1, then the package copy, then the example games.
- 2026-10-14 18:30, orchestrator: a public ship with nobody published aboard shows no "Aboard:" line (D's question). Old-tab compatibility goes to old tabs only: the new browser identifies itself with `X-Voyage-Journal: public`; browser reads ignore unknown keys from now on.
- 2026-10-14 17:50, Johnny: a publisher deleting their content never claws it back from anyone who installed it (an install is a full copy; checked: it copies trees, images and records into the installer's own prefix and campaign). Z's manifest slots close the one dependency (placing from a deleted source map).
- 2026-10-14 18:40, orchestrator: Z's halt answered: the manifest carries each own sector's slot so a placed import never needs the source map (a deleted source map broke it too); the charted-system pack is records only.
- 2026-10-10: the file bus replaces pasting.
- 2026-10-10: B builds the one-act "make a sector and generate" (done).
- The dossier-open frame does not hold the push.
- E's Campaign order approved; E's defaults taken for its eight rule questions
  (ship sheet fields stay a stand-in, slingshots and mid-leg re-aim parked, dice show
  and interpret nothing, costs and cargo are typed, visibility is per record).
- A party with more than one ship: a list of vessel ids, one flagged current, and
  "Where are we" follows that one.
- Lane folders confirmed as written in lanes/*.md.
- Selecting hexes: the keyboard keeps `U I O / N M ,` for the six neighbours; Generate
  in an empty slot keeps the systems straight away; the map glides again when the pane
  is widened. All as built.
- Marketplace stub is **size b**: publish and list for the referee's own account; no
  browse by others, no install. A listing shows title, author handle, kind, truth
  version, edition, hex count, tags, latest version. Any signed-in owner publishes a
  subset of a universe they own. No moderation in the stub.
- Public games: one hex mark and the universe's name only; the hex from the last save
  of the party track, no heartbeat or expiry; hex precision only; opt-in, default
  off; shared only on the same non-null truth version; one dot and a count per hex.

- 2026-10-11: the five red golden fixtures get a read-only pass (C) before anything
  is decided about the held engine set.
- 2026-10-11: yes, the right-click menu reserves the "Design by hand…" line with a
  muted "Checking…" line of the same height (D, prompts/d_grow_one_act.md item 6).
- 2026-10-11: assets/HybridSurfaceMap_Design.md goes in a push.

- 2026-10-11: every instruction a person reads follows the Google developer
  documentation style guide (developers.google.com/style). First applied to Build.
- 2026-10-11: the hand designer gets a "Roll profile" button on the Profile heading
  and an orbit picker (a modal of the system; pick a parent, move, Place); typing the
  number stays.

- 2026-10-11, all as recommended: the held nine engine lines stay held for the
  generator rebuild; a universe not on a published chart cannot publish in the stub;
  package manifests go to the public bucket; the public mark follows the single
  `vesselId` until a campaign pass stores the list; no allowlist entry for
  surface/vanilla/map_palette.ts; the Google style standard applies to all app copy.
- 2026-10-11: a belt has no year data in the hand designer.

- 2026-10-11: Discord and Google sign-in secrets are set (Johnny). Passkeys wait.

- 2026-10-11, the hand designer: yes to a one-body profile roll in the engines (his
  word for the engine change; output must stay byte-identical); non-MgT2E systems
  pick orbits in AU only; a moon's period stays off the form; **a belt may be placed
  around a world by hand** (nothing generates one; moon rules come from another book
  later); no belt profile cell is locked; eccentricity takes any finite number; a
  world inside the star's inner limit or two bodies on one orbit are neither refused
  nor called out.

- 2026-10-11, the Campaign pages: the way back moves to the top as a breadcrumb (the
  X keeps closing the pane); "Add an image" moves onto the avatar area in the page
  head and the image becomes the record's avatar wherever it is shown; a circle for
  people and characters, a square for every other kind.

- 2026-10-11: a record's first image is its avatar (no new field).
- 2026-10-11, marketplace: `hex_keys` and `record_ids` JSON columns on
  `package_versions`; limits approved: 1,280 hexes, 500 records, title 1 to 80,
  description to 2000, kind 1 to 40, 32 tags of 1 to 40, 100 versions.

- 2026-10-11: a blank hand system picks orbits in AU; on MgT2E typing an orbit number
  fills AU; an unnamed star shows its spectral class.
- 2026-10-11: **every star value that is a closed list is a dropdown, not free text**
  (B sends the options from rules/, D renders them).

- 2026-10-11, the roll: a gas giant's profile is not filled; on the mainworld only
  size, atmosphere and hydrographics are rolled.
- 2026-10-11: a value the engine needs from a hand-made star to work (luminosity and
  the like) is a picker on the star's form, with its options from rules/ (B).
- 2026-10-11, **versions:** the app version is 1.1.N and the last number goes up with
  every push (first: 1.1.1, the push after `8118f72`); the second number moves when
  features harden, on his word. The orchestrator bumps `apps/web/src/version.ts` in
  each push list. The engine version (1.1.0) stays tied to its fixtures folder.

- 2026-10-11, yes to eight: the parked preview route leaves router.ts for a patch
  file; a hand star's luminosity, mass, diameter and temperature are four number
  fields that show the lookup until typed; the plain-style server messages are applied
  in one pass with the browser lines that quote them; AoW and blank systems keep
  type, subtype and class as text; a package may be published from a single system; a
  chart system removed from the map goes into a package as a deleted hex; E's five
  Campaign choices stay as built; only the app version moves per push.

- 2026-10-11: K or Ctrl+Enter keeps whichever is open (preview or draft); "Remove"
  stays without "from your map"; Lane F does a read-only UX review of Build and the
  hand designer.

- 2026-10-11: yes, hide the account menu's native file control (E).
- 2026-10-11, live on 1.1.2: generating must show a spinner while it runs; generating
  a subsector must not fill every hex; the app must say that what a person generates
  is their own map and never changes the published chart.

- 2026-10-11: density yes to all three (Standard default, one hex always generates,
  seeded per hex), **as a dropdown**: "Every selected hex" and the three densities.

- 2026-10-11: textures confirmed working in Chrome; Edge had turned hardware
  acceleration off on his machine. Not an app fault; the no-WebGL notice stays in C's prompt.

- 2026-10-11: a removed hex is published from the palette only (enough); the palette
  hides commands that cannot run (E, OmniBox.vue lent); ice caps must stop reading as
  a perfect circle: ragged edge, the sea cutting in (C, prompts/c_ice_caps.md).

- 2026-10-11: a software renderer for discs without WebGL is not ruled out; later.
  The "your own map" note stays under the Build strip. The strip's own line is
  rewritten in the Google style (both wordings read as confusing). Job progress goes
  beside the Generate button and into a lower-right toast that lasts the job, so a
  person can do other things while it runs; it does not cover the pane's first line.

- 2026-10-11: signed out, the rail shows the Campaign and Build items switched off,
  so visitors see what an account gives; only those two.

- 2026-10-11: yes, a switched-off rail item opens the sign-in card when chosen.

- 2026-10-11: **non-admins may generate 100 systems a day** (a bot must not drive
  costs up); a premium account with more may come later, not now.

- 2026-10-11, the dossier's surface map (live 1.1.3): a button to open it large; a
  key for the symbols; the hex grid always on, as in the old app; day and night as a
  soft light and dark overlay with no outline; less crunched at column width.

- 2026-10-11: B's speed plan approved (third for B, behind the cap). The referee's own
  systems must show as dots on the zoomed-out map (A).

- 2026-10-11, yes to seven: the strip reads "YOUR MAP / <name> · your copy of the
  published chart" with the version in the tooltip; the note as D wrote it; preview,
  Keep and opening a draft stay held while a job runs. The cap: the UTC day; Undo
  gives nothing back; previews and Roll again count; a request over the allowance is
  refused whole.

- 2026-10-11: the ice caps are good enough for now; come back later, perhaps with a
  higher-effort model, after the process is streamlined. Yes: a high-tilt world's
  orbit disc should show its ice where the dossier map does (C, later, small).

- 2026-10-11: **the Undo system is low priority**: no more Undo work unless something
  more important needs it. Yes: a generate job stays one resumable message until the
  speed pass measures a split; a left hex named by number; the refused Undo stays
  offered; the spinner moves to design/. The sun marker on the surface map: Johnny
  looks on 1.1.5 first.

- 2026-10-11, **flow:** questions are answered before a lane is told to go; a lane
  whose prompt an open question could change is held.

- 2026-10-11, yes to six: the column map has no key pop-over, "Key" opens the large
  view; day and night keeps its fade, gains a faint terminator line and a darker night;
  the sun marker comes back, small; the record page gets a date with an optional end;
  a job's result has no Undo if the map was left in its first second, and says so;
  Referee-only rows stay unmarked on the timeline. Also from him: the large map view
  is centred, has zoom and pan controls, and a full legend that can be read.

- 2026-10-11, passkey sign-in: **no email service if it can be avoided**; one account
  when sign-ins share a verified email (yes); it goes after the cap and before speed in
  B's queue (yes).

- 2026-10-11, passkey sign-in: **an account is a username and a passkey; no email is
  asked for** (his users care about privacy and do not want to give one).

- 2026-10-11, passkey sign-in, yes to three: passkey only, no two-factor or
  authenticator code; recovery by one-time codes shown at sign-up, a nudge to add a
  second passkey, linking a provider optional; if passkey, codes and any linked
  provider are all lost the account is lost, and the screen says so.

- 2026-10-11: yes, B brings the passkey package (name, size, dependencies) to Johnny in
  its design note and installs nothing until he says so.

- 2026-10-11, density: **whenever more than one hex is selected, generating asks for
  the density every time**; the choices read in plain words ("about half of the empty
  hexes"), not "3 in 6".

- 2026-10-12 (orchestrator, trivial): the four density choices stay in the order
  Sparse, Standard, Dense, Every hex.

- 2026-10-12, yes to six: add `@better-auth/passkey` 1.7.7; the username is the
  public handle (3 to 24, letters, digits, underscore; taken refused); five passkey
  sign-up ceremonies an hour for one address, Turnstile only if needed; a right-click
  inside a subsector or sector opened by its address acts on all of it; a
  hydrographics-0 world keeps its painted percent and is captioned "no seas"; C does
  the city lights now.

- 2026-10-12, yes to twelve: a recovery session may sign out; Generate stays on when
  the density roll might pass what is left; at zero the note under the Build strip
  stays while nothing is selected; C takes the second look at the ice caps now. The
  Player Pack, first version: a referee-only mention reads "a record"; a hex mention
  shows its written label; a link between two player-visible records shows without
  role or notes; one HTML file, no ZIP package; no map; no images; party and ship
  only when marked for players, the clock day as cutoff; a notes box with "Download
  my notes", no import yet.

- 2026-10-12: no shared noise between the map's ice edge and the disc's; they agree on the ice line and that is enough.

- 2026-10-12, yes to three (D's first-visit review): a read-only pass on why Regina
  reads -84 C and Ethane, rules text cited, before any engine change (C); the Build
  strip shows "Your map" and the universe's name, "My campaign" stays for the records
  (D, after the passkey push); a first visit opens on the Spinward Marches with Regina
  in view and one dismissible line of help (D, after the passkey push).

- 2026-10-12: yes, the owner's universe list carries `publicGames` (only when migration 0013 is present).

- 2026-10-13, Regina: **yes** to an engine pass that keeps a charted mainworld's
  atmosphere and hydrographics when it is a moon and stops defaulting a missing
  temperature band to Temperate; no to the lock alone; no to hiding it on the screens.
  The orchestrator runs a trial outside the tree first (C's trace says the forbidden
  zone, not the default, moved Regina out). Passkeys: no change wanted; the build
  already takes password-manager passkeys.
- 2026-10-13: **a real passkey sign-up works on production** (Johnny).
- 2026-10-13, the sign-in card: "Create an account" at the top; the passkey button
  last in the list and labelled "Sign in"; the passkey helper sentence removed (D,
  added to `d_first_run_fixes.md`). The button sits below the provider rows; only
  the fingerprint sentence goes (yes to both).
- 2026-10-13: **Lane Z** is new: heavier-effort requests, run by another model
  (`lanes/Z.md`). It has the water and ice pass; C is free.
- 2026-10-13: water, ice and temperature are to be solved once, by a high-effort
  session (`c_liquid_temperature_once.md`); the Regina trial prompt is withdrawn.
- 2026-10-13: yes, a new account's map is named "My map" (existing ones keep their
  name); yes, a sector's or subsector's address opens its pane (finding 12). Lane A.

- 2026-10-13 21:10, **yes to nine**. Engine 1.2.0: the chart lock holds a charted
  mainworld's atmosphere and hydrographics for **every** charted mainworld, not only a
  moon (his word for the deviation, rule 4; no rules text either way, recorded as a gap);
  the book's temperature roll is parked for a separate decision; only atmosphere 0 is a
  vacuum for the ice rule; atmosphere 0 at or above water's melting point names no liquid
  and keeps its hydrographics digit; exotic liquids stay with atmospheres 10 to 12.
  A session written before the campaign had a date stays off the timeline. The public
  games switch stays in the account menu under Rename with D's words, and gains a line
  when it is on and the party has no place. `noindex` on the unlisted sheet.
- 2026-10-13 21:10: "let's get into a good place for a push."

- 2026-10-13 21:40, yes to both: Build's two one-sector sentences as written (D); the
  screen keeps 273.15 and the engine 273 (C). A go.

- 2026-10-14, yes to both: the lanes take D's first-visit polish (D, E); a universe made
  on an older engine generates its new systems with the current engine, and stored systems
  keep what they have (its row keeps the engine it was made with).
- 2026-10-14, Johnny's goal for the marketplace: make a map, sector or whatever, publish
  it, and import it into a campaign either in the same place or placed like a puzzle
  piece somewhere else. 10:10, yes to all five: own maps publish; anyone browses
  (importing needs an account; report and takedown); any package moves as one rigid shape
  snapped to the hex grid; a piece may land anywhere, charted space included, replacing
  the chart's systems in that campaign only, listed in the preview; a campaign keeps its
  copy and shows "update available".
- 2026-10-14, the character sheet: the six profile hexes on one row (abbreviations STR,
  DEX, END, INT, EDU, SOC allowed); one line per skill with a "+" in a left gutter to add
  the next specialism line, names aligned, specialism lines as tiers. No cap on specialism lines ("it doesn't make sense to cap it").
- 2026-10-14, yes to all four: the orbit picker keeps its fade; imported records name their package (provenance mode `package`); restore an import's undo point (after placement); a takedown keeps a private manifest copy.
- 2026-10-14 12:45: no undo machinery for imports: removing an import is a plain delete of what it brought ("make the record and then CRUD delete it"); one import per package per campaign; importing into a never-opened map pins it (phase 4); no quota refund on removal.
- 2026-10-14 13:45: a package's install count never goes down (a remove leaves it).
- 2026-10-14 18:15, Johnny: the house account is `Traveller_Voyage` (user id e2b2245a-5260-4b91-8f33-1e02997fd9d5), made on production.
- 2026-10-14 18:05, Johnny: example marketplace content ("it's empty right now"). The public card:
  example games carry an "Example" tag and are easy to remove; a journal entry can be "Public" and
  shows on the card; the referee chooses game name only or game name and their handle; signed-out
  visitors see public ships.
- 2026-10-14 17:40, Johnny: ships move separately (own track and position; each member aboard
  one ship or none); one public mark per ship with its name; every party ship of a public game
  shows, with who is aboard; a public route shows only finished legs; it is flavour, read-only,
  a "community" feel. Example games (6 or 12 accounts, each with a ship) to show it off.
- 2026-10-14 17:40, orchestrator: the public switch stays per game; a referee-only record is
  never named in public; `party.vesselIds` + `party.aboard` replace `party.vesselId`.
- 2026-10-14 17:15, Johnny: `versionvideo/` is his (another agent, for social media posts); it
  goes in the next push (1.2.1). Next leg: more than one ship per party; then sharing ships
  across the galaxy ("so we can see everyone's adventures"). Design questions asked 17:15.
- 2026-10-14 17:00, orchestrator (Z 4b questions, no behaviour change): an in-place
  re-import of a package the campaign holds in place is the same import re-applied, not a
  second one, so it is allowed; an admin's view of a hidden package has no outline or Import.
- 2026-10-14 15:45: admins open hidden package pages (and a Hidden filter); everyone else sees "Listing not found."
- 2026-10-14 14:20: the marketplace gets its own rail item, "Marketplace"; a small version number at the foot of the sign-in and account windows (D).
- 2026-10-14: the marketplace goes to Lane Z, not B. Yes to Z's five: edges leaving a piece dropped on publish; another edition refused; theirs or mine per hex; takedown keeps objects, deletes manifests; an install counts against the quota, not the daily cap.
- 2026-10-14, a Back "<" left of the pane's X: one pane back; X still closes the pane.

### Answered in `questions_for_johnny.md` (moved 2026-10-17, newest first, wording unchanged)

#### 2026-10-17 15:25, from the backlogs (Epics P, L, T)  (D. Direction)
- P1 players write journal notes? Rec. yes. **Answer (15:30):** yes.
- P2 twelve players enough? Rec. yes. **Answer:** yes.
- P3 a second referee now? Rec. no. **Answer:** no (as recommended).
- L1 positioning sentence: edit the orchestrator's draft? Rec. yes. **Answer:** yes.
- L2 fair use and credits words, welcome window only? Rec. yes. **Answer:** yes; Johnny supplies the words.
- T1 sheet's Cargo and Passenger rows as a view of the manifest? Rec. yes. **Answer:** yes.
- T2 will you supply `rules/mgt2e_trade.json`? **Answer:** yes.
- T3 party cash separate from the ship's ledger? Rec. yes. **Answer:** yes.

#### 2026-10-17 15:10, boon and bane (no text in rules/ or assets/)  (D. Direction)
**Answer (15:15):** "Boon rolls 3D keeps best two, bane keeps worst two."

#### 2026-10-17, six (Z's parked files and two directions) — **Answer (14:15): yes to all six**  (D. Direction)

1. Finish four parked truth-build files, shelve six. **Yes.**
2. A seal step in `upload_truth.js`, run by Johnny after a release. **Yes.**
3. Is the Worker on Workers Paid? **Yes.**
4. Shelve the admin truth preview. **Yes.**
5. Z builds the players' view link next. **Yes** (design first).
6. "Regina highport contacts" and "Jewell patrons" to records-only. **Yes.**

#### 2026-10-16, D's three from `d_store_3` (2 and 3 hold the 1.2.5 push)  (D. Direction)

1. An optional `recordCount` on the catalogue card (Lane B), so a records-only card reads "People · 12 records" instead of "Records only". Recommended: yes. **Answer (2026-10-17):** yes (Lane Z: it owns the catalogue route).
2. Your own ship's route shows for the party ship whose record is open, else the lead while the Party tab is open; no new ship picker. Recommended: yes. **Answer:** yes.
3. Publish records starts with the narrowed list's records, and with none when the whole list shows. Recommended: yes. **Answer:** yes.

#### 2026-10-16, D's three from `d_store_2` (1 and 3 hold the 1.2.4 push)  (D. Direction)

1. The finished track at 70% brightness instead of 45% (45% fails 3:1 on the chart). Recommended: yes. **Answer (18:10):** yes.
2. Your own ships' routes drawn solid with the arrowhead in party cyan, for the selected ship while the Party tab is open. Recommended: yes, a small D pass. **Answer:** yes.
3. A tag link filters the loaded cards in the browser until B's catalogue queries. Recommended: yes. **Answer:** yes.

#### 2026-10-15, the four that held 1.2.2  (D. Direction)

1. Public ship card in the lime traffic colour. **Answer (19:40):** yes.
2. Lead ship's tag at rest at the hex zoom: off, name on hover. **Answer:** yes, as built.
3. A's twelve covers ship as they are. **Answer:** yes.
4. The ship display ships as it is. **Answer:** yes.

#### D1. Players before the Builder?  (D. Direction)

An earlier review suggested a thin "Table" slice (campaign, invite link, members, ship,
clock, journal) between the Viewer and the Builder, so players exist before the full editing
tools do. Do you want that order, or Builder first as the plan has it?

*Interim: the plan's order (Builder next).*

**Answer (2026-10-04): campaign first.** Optional login; everyone signed in gets their own
campaign layer over the base truth map; making their own maps (the Builder) comes after.

#### G16 (answer)  (G. Jumps (from K12, parked))

**Answer (2026-10-07): yes, and it is in `assets/`** (`Character Sheet 2026_fillable.pdf`
and two print versions). The PDF is the source; the transcription is what it is checked
against (`prompts/a_character_fields.md`, rewritten).

#### G21. v6's unresolved liquids (asked 2026-10-07; handoff §197, §198)  (G. Jumps (from K12, parked))

Three questions: ice on airless worlds that are warm at their warmest; water on ordinary
atmospheres outside 273 to 373 K; exotic atmospheres where no listed liquid is in range.

**Answer (2026-10-07): "I want to move on from ice and stuff for now, so just do your
best with 1 - 3."** Delegated. The orchestrator's provisional choices, from the tables
already in `rules/` only, are in `prompts/b_liquid_policy_2.md` and marked provisional
in the policy: below Water's melting point is Ice; a vacuum at or above it, or anything
above the boiling point, is no free liquid; an exotic atmosphere with no listed liquid in
range is Unknown Exotic Liquid. One edit changes any of them.

#### G17 to G20. Live character sheets (asked 2026-10-07; handoff §190)  (G. Jumps (from K12, parked))

Johnny's direction: a live sheet owned by the player's account, shared with a referee,
co-edited by both, the same in every universe that uses it; and a character copied into
another universe as its own instance, including through the free marketplace.

- **G17. What stays the referee's own about a player's character?** *Recommended: the
  sheet, the name, the portrait and the summary are live and shared. Each game keeps its
  own layer that the player does not see unless the referee shares it: where the
  character is, who they are linked to, and the referee's notes.*
- **G18. May the referee change anything on a live sheet?** *Recommended: yes, the whole
  sheet, with each change showing who made it. Locks on parts of it can come later.*
- **G19. When a live character leaves a game (the player leaves, or the referee removes
  it), does that game keep a frozen copy?** *Recommended: yes, a copy as it stood, marked
  as no longer live.*
- **G20. How live is "live" in the first version?** *Recommended: a change by one shows
  for the other within a few seconds while both have the sheet open; if both change the
  same box at once the later change stands and the other sees it. No shared cursor and no
  merging of typing, which can come later.*

**Answers:**

- **G20 (2026-10-07): "Think of it like two people working in Google Sheets at the same
  time."** A change appears for the other at once, with presence (who is on the sheet,
  which box they are in); a box lands when committed, the later commit stands.
- **G18:** taken as yes from the same answer (both edit anything), until he says
  otherwise.
- **G17 (2026-10-07): yes.** The sheet, name, portrait and summary are live and shared;
  each game keeps its own layer (place, links, the referee's notes), unseen by the player
  unless shared.
- **G19 (2026-10-07): yes.** A game keeps a frozen copy, marked as no longer live.

#### G16. Is there a fillable character sheet PDF?  (G. Jumps (from K12, parked))

The character sheet (K13 part 4) was waiting on one. It is being built from the sheet
supplied on 2026-10-02 instead (transcribed in `campaign_manager_plan.md` §5.2a). If a
PDF exists, it goes in `assets/` and is checked against that draft.

*Recommended: build from the transcription now; add the PDF whenever it is to hand.*

#### G11 to G15. Five small ones, answered together  (G. Jumps (from K12, parked))

**Answer (2026-10-07): "all your recommendations sound reasonable, let's go with those."**

- **G11. A ship that has flown, selected: is the plotter live at once with its last
  thrust?** Yes, as Agent D built it. A ship that has never flown asks for a thrust first.
- **G12. A route that ends in a jump: are its in-system waypoints editable?** Yes. The
  jump and every leg after it keep their durations and move in time
  (`prompts/d_nav_console_2.md` section 4).
- **G13. A compact nav console for 520 px windows?** Not now.
- **G14. A journal row with no title** shows the first line of the body; "Untitled note"
  (or handout, or rumour) only when the body is empty too; an untitled session shows
  "Session 14".
- **G15. A deleted session's number** is never reused.

#### G10. May a referee strike or correct a leg once it is in the flight log?  (G. Jumps (from K12, parked))

The flight log (follow-up 31) archives the legs a vessel has flown. A course added by
mistake would otherwise be history for ever.

*Recommended: yes, narrowly. A logged leg can be struck out (with Undo) and its note
edited; it cannot be re-timed or re-aimed.*

**Answer (2026-10-06): yes**, as recommended. Recorded in `slice_2_campaign.md`
follow-up 31.

#### G9. Should a ship be re-aimable in the middle of a leg?  (G. Jumps (from K12, parked))

A leg already under way is history: the ship finishes it and an edited route starts from
its end. Re-aiming in mid-flight would need a rule, because the book's travel formula is
from rest to rest and the ship would be moving.

*Recommended: keep it for the MVP.*

**Answer (2026-10-06): keep it for the MVP.** Recorded in `plan.md` "Ship navigation
backlog" as item 5, for after the campaign MVP.

#### G8. Is the journal next for A and E, with the limits in A's prompt?  (G. Jumps (from K12, parked))

The journal (K7) is the slice's next step. A's schema step sets: 20,000 entries, a
100,000-character body, a title that may be empty, and no rule forcing a handout to be
player-visible.

*Recommended: yes, as written.*

**Answer (2026-10-06): yes.** `prompts/a_journal_1.md` (A) and
`prompts/e_journal_design.md` (E) were handed out.

#### G7. Who designs the city lights, and is Enhanced the default?  (G. Jumps (from K12, parked))

(1) The look he asked for is hard visual design. Agent F (high effort, limited budget,
parked) is the one kept for that: use F for one paper-only design session, then Agent C
builds? (2) Vanilla is the default look today and Enhanced is one command away. The new
city lights live in Enhanced. Make Enhanced the default?

*Recommended: yes to both.*

**Answer (2026-10-06): yes to both.** Johnny gave Agent F `prompts/city_lights_design.md`,
and Enhanced is to be the default look (a stored choice of Vanilla still honoured). Agent C
flips the default as Part 0 of `prompts/c_ghosts.md`.

#### G6. The city lights on a planet's air (follow-up 20)  (G. Jumps (from K12, parked))

Johnny saw "the city texture on the atmosphere layer and not the planet layer". Agent C
found that our planet shader is the old app's, line for line (a test requires it): the
night-side city lights are dimmed by cloud but not hidden (they keep 40% under full cloud),
there is a city-coloured glow at the planet's edge, and the air halo round the night side
carries the city colour too. Leave it as the old app draws it; or make ours differ: lights
on the surface only, hidden by cloud, with no city colour in the edge glow or the halo?
The second is the first deliberate difference from the old app's planet renderer and is
recorded as one.

*Recommended: the second, since he called it a bug. Interim: unchanged.*

**Answer (2026-10-06): the second,** "but it needs to look sci-fi and incredible, beautiful,
glowy, spectacular, it really needs to inspire awe and wonder and capture sci-fi city feel
from space, like 'oh, I want to visit there or go there'". Orchestrator's ruling on how:
vanilla stays the old app exactly (its test untouched); the new city lights are the
**enhanced** disc, designed first (`prompts/city_lights_design.md`), then built by Agent C.

#### G5. The reaction-drive figure on a long flight  (G. Jumps (from K12, parked))

The flight estimate's reaction-drive line uses the sum Johnny confirmed (2.5% × hull × G ×
hours) and assumes thrust all the way. On a long flight it passes the ship's own tonnage: a
35 AU flight at 2 G reads "about 1,424 tons" for the assumed 100-ton hull. Leave the number
as it is; or, when it is more than the hull, say "more than the ship's tonnage" in place of
the number; or hide the reaction line for the MVP?

*Recommended: the second. Interim: the number is shown as computed.*

**Answer (2026-10-06): not picked.** Johnny pasted the book's drive tables (kept in
`findings/rules_notes/mgt2e_drives.json`, not in `rules/`) and said "let's just keep it easy
for now, knowing we might change some stuff up" when he has the Cluster Truck supplement.
The orchestrator took the recommended option: over the assumed hull the line reads "more
than the ship's tonnage". He may change it.

#### G4. Should the flight estimate show a reaction drive's fuel, and is this the sum?  (G. Jumps (from K12, parked))

The MVP does not know which drive a ship has. The flight preview could show both lines:
"Manoeuvre drive: no fuel" and "Reaction drive: about N tons". The orchestrator reads the
rule as: fuel = 2.5% × hull tonnage × the G flown × the hours of the flight (a flight
thrusts the whole way, to the midpoint and back down). For the assumed 100-ton hull at 2 G
for 10 hours that is 50 tons. Is that the sum, and should both lines show?

*Recommended: yes to both. Interim: a flight shows distance and time and no fuel line.*

**Answer (2026-10-06): yes.** Both lines show, and the sum is 2.5% × hull tonnage × the G
flown × the hours of the flight. The numbers go into `rules/mgt2e_space_travel.json` (a
`manoeuvre` block); `reactionFuelTons` in `campaign/travel.ts` computes it.

#### G3. Does a flight inside a system use fuel?  (G. Jumps (from K12, parked))

The text pasted on 2026-10-06 gives a fuel cost for jumps only (10% of hull tonnage per
parsec). Does the book give a fuel cost for manoeuvring from one body to another? If so,
the rule is needed; if not, a flight shows distance and time and no fuel.

*Interim: a flight shows distance and time only; fuel appears on jumps only.*

**Answer (2026-10-06):** "I think there might be inner-system fuel rules in a supplement I
don't have, this is the only rule I can find that might be relevant", with the book's text:
**manoeuvre drives do not require fuel; reaction drives do**, at 2.5% of the ship's total
tonnage per Thrust per hour (a Thrust 4 ship needs 10% of its tonnage per hour of use); a
Reaction 0 drive needs 0.25 tons per hour of Thrust; there are 10 combat rounds in an hour.
So a manoeuvre-drive flight uses no fuel. Not yet in `rules/` and not yet built: see G4.

#### G2. Which ship sheet fields hold the three numbers a jump needs?  (G. Jumps (from K12, parked))

The official sheet's Ship Data File has Name, Class, Configuration, **Size**, Hull Options,
Armour, Hull Points; Drives has Reaction Drive Output, **Manoeuvre Drive Output**, **Jump
Drive Output**, **Fuel Capacity**, and cost and power fields. To show "this jump needs 40
tons" and to warn "beyond this ship's drive", the app needs the hull's tonnage, the jump
number and the thrust in G. Is the tonnage "Size", the jump number "Jump Drive Output" and
the thrust "Manoeuvre Drive Output", each written as a plain number?

*Recommended: yes to all three. Interim: the jump preview shows the parsecs and the fuel
as a share of the hull ("2 parsecs, 20% of hull"), with no warning.*

**Answer (2026-10-06): not for the MVP.** "For MVP we won't actually deduct fuel numbers
from a ship, but I'd like to maybe put estimated numbers of time / distance / fuel
measurements when plotting a course for a ship. If it needs data to be calculated due to
mass, we can just set mass at 100 tons for now just for MVP and then I'll figure out what on
the ship fields would actually be used for calculations. The MVP design will essentially let
anything go, it's just measuring and then for vNext we will tie in ship logic to plotting
warnings / refueling." So: the plotting previews show estimates of distance, time and fuel;
the hull is assumed to be 100 tons and the screen says so; no ship field is read, nothing is
deducted, nothing warns or refuses. Which sheet fields feed the sums is Johnny's to decide
for vNext.

#### G1. The jump rules the app would need  (G. Jumps (from K12, parked))

For the jump-plotting feature you described on 2026-10-05 (`slice_2_campaign.md` K12),
nothing in `rules/` covers jump or in-system travel, so the app cannot build it yet. When
you are ready, add a `rules/` file (any name) that states, from the Mongoose 2e books:

1. the minimum distance from a body before a ship may jump, and how it is measured;
2. the travel time for a ship at a given G rating over a distance (the formula, and whether
   the ship turns over at the midpoint);
3. how far a jump may reach, from the drive rating;
4. whether the jump duration varies from the 168 hours you gave on 2026-10-02;
5. anything about fuel the app should show or refuse on, or "nothing".

No orchestrator will fill these in from memory. Not needed until the MVP steps are done.

Note (2026-10-05): for (1), the orbit view already draws jump-limit circles at 100 diameters,
copied from the legacy `js/system_viewer.js` (2916 to 2950). Say whether that is the rule to
use for the minimum jump distance, or give another. Likewise for (2): the dossier's "100D jump
travel times" table (1G to 6G) comes from `calculateBaseJourneyTimes` in the engines, copied
from the legacy `universal_math.js`. Confirm it as the travel-time rule, or give another.

**Answer (2026-10-06), with the book's text pasted by Johnny (Fuel, Jump Travel, Travel
Times, Travel Calculations, Transit Times, Common Distances for Traders):**
1. **Yes:** 100 diameters, as the copied code has it (the world's, and the star's where it
   is larger).
2. **Confirmed by the book:** Time = 2 × √(Distance ÷ Acceleration), metres and seconds,
   from rest, accelerating to the midpoint and decelerating to rest, 1 G about 10 m/s².
   That is what `calculateBaseJourneyTimes` computes. The book's Transit Times table
   differs from its own formula by more than rounding in 11 of 90 cells (largest: 100,000 km
   at 6G, table 42 minutes, formula 43.03); the book calls the table a summary of the
   formulae, so the app computes from the formula and the table is kept as reference.
3. A jump carries a number of parsecs equal to the jump number; a jump of less than one
   parsec counts as jump-1.
4. **148 + 6D hours** in jumpspace, whatever the distance. This supersedes the fixed 168
   of 2026-10-02.
5. Fuel: 10% of hull tonnage per parsec jumped. Refined Cr500 a ton, unrefined Cr100 a
   ton; refuelling takes 1D hours. An accurate jump arrives outside or on the verge of the
   100-diameter limit of the target world.

The numbers live in `rules/mgt2e_space_travel.json` (typed by the orchestrator into
`findings/rules_drafts/`, copied in by Johnny). Astrogation checks, inaccurate jumps and the
danger of unrefined fuel are named in the text and not supplied: not built.

#### F7. The two internal-heat caps  (F. The generated worlds contradict their charts (one decision))

Keep the engine's existing caps (1000 and 150 on the two components, none on their sum)?

*Recommended: keep.*

**Answer (2026-10-04): yes, as recommended.**

#### F6. When no legal orbit suits the chart  (F. The generated worlds contradict their charts (one decision))

List the system as unresolved for you to look at, or let the engine bend albedo and
greenhouse to force a fit?

*Recommended: list it; decide when we see how many there are.*

**Answer (2026-10-04): yes, as recommended.**

#### F5. A charted world with no climate given  (F. The generated worlds contradict their charts (one decision))

Today the engine assumes "temperate roll 7" and then often cannot honour it. Instead: place
the world in a legal orbit that suits its published atmosphere and hydrographics?

*Recommended: yes.*

**Answer (2026-10-04): yes, as recommended.**

#### F4. What a liquid's name promises  (F. The generated worlds contradict their charts (one decision))

Liquid at the world's **mean** temperature (it may freeze or boil at the extremes, and we
say so), or liquid across the whole low-to-high range?

*Recommended: the mean, with freezing and boiling noted.*

**Answer (2026-10-04): yes, as recommended.**

#### F3. When a world's stored liquid is impossible at its real temperature  (F. The generated worlds contradict their charts (one decision))

(Example: "liquid oxygen" at 541 K.) Replace it with the most abundant liquid from your
exotic-liquids table that *is* liquid at that temperature, or leave it marked unresolved?

*Recommended: replace; unresolved only when nothing in the table fits.*

**Answer (2026-10-04): yes, as recommended.**

#### F2. What temperature makes a world "Frozen", "Cold", "Temperate", "Hot", "Boiling"?  (F. The generated worlds contradict their charts (one decision))

The rules files tie those five words to **orbit position** only. To show a Climate that
matches the real temperature we need the temperatures. Your other agent quoted: Frozen at
-51 °C and below, Cold up to 0 °C, Temperate up to 30 °C, Hot up to 80 °C, Boiling above.
Confirm that table from your book, or give yours.

*Interim: the dossier shows the temperature and an "Orbital zone"; no Climate word.*

**Answer (2026-10-06): "make it an easy array we can edit later, let's just go with these
for now."** The quoted table is adopted as provisional: Frozen to -51 °C, Cold to 0 °C,
Temperate to 30 °C, Hot to 80 °C, Boiling above; each band includes its upper limit. It
lives in `rules/mgt2e_climate_bands.json` (typed by the orchestrator into
`findings/rules_drafts/`, copied into `rules/` by Johnny), a plain array he can edit; no
band number is written in code.

#### E10. Seas and ice in the enhanced mode (Agent F's proposal)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

Three separate decisions, each from data the world already carries; vanilla is untouched:

1. **How much is covered:** the world's hydrographics percentage when it has one, else the
   Hydro digit times 10%. No minimum sea. (A Hydro 0 world can carry 1 to 5%.)
2. **What covers it:** the generated liquid (water, methane, ammonia, acid and so on), not a
   guess from the atmosphere.
3. **Where it is frozen:** by that liquid's own melting point from the rules table
   (`rules/mgt2e_data.js:740`). Low temperature above melting: no ice. High temperature below
   it: all of it frozen. In between: ice from the poles down, placed by a visual
   approximation, `T(latitude) = mean + A x (1/3 - sin^2(latitude))`, with A limited so it
   stays inside the world's own high and low. Unknown liquid, or missing temperatures: no ice
   drawn. Worlds locked to their star are handled separately (ice on the far side), designed
   when built. No extra snow on land for now.

The latitude formula is a presentation approximation, not a rules figure. Approve, change, or
say no.

**Answer (2026-10-04): approved,** including the latitude formula. Enhanced mode only.

#### E9. Ice caps on hot worlds (first enhancement)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

You spotted that the old map painter gives white poles to worlds over 100 °C and ignores
hydrographics. That is the old code, copied faithfully (`js/planet_renderer.js:288-301`): the
cap depends only on the temperature band, and even "Hot" gets a cap from about 80° latitude.
Proposal for the enhanced mode, vanilla left alone: a cap is drawn only where the world's
**low** temperature is below the freezing point of its surface liquid (273 K for water); its
size grows with hydrographics; hydrographics 0 has none. Approve, change, or give your own rule.

**Answer (2026-10-04): approved in principle. Not built yet.** Superseded by E10, which is the
fuller version of the same idea after Agent F's review.

#### E1 and E2. Hex terrain (answered)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

**Answered 2026-10-04:** copy what the old app does first ("vanilla"). Improvements to terrain
and world appearance are welcome, as enhancements that can be switched off to return to
vanilla. Recorded in `recipe_planet_surfaces.md` §0. Terrain stays a picture made in the
browser, as in the old app; any terrain class table belongs to the enhanced mode and comes
to you for approval when it is proposed.

#### Answered  (A. The orbit view and the dossier (from Agent D))

- **A1. Seasons on a moon.** Answered 2026-10-03: `tidallyLocked` means locked to the body it
  orbits; a moon takes its planet's year and orbit angle; under 3° of tilt it reads
  "negligible seasons". Built.
- **A2. Where spring starts.** Answered 2026-10-03: the northern spring equinox is at orbit
  angle 0°, and the tooltip says so. Built.
- **A3. "Today's" temperature.** Answered 2026-10-04: approved as written,
  `mean × (1 ± tiltPart × sin(orbit angle) / (1 + pressure)) ^ 0.25`, labelled an estimate
  with the inputs in the tooltip. Built on the orbit card. A11 to A13 are what it left open.
- **A4. The date a visitor sees first.** Answered 2026-10-03: day 002 of 1105, and a link may
  carry `?date=DDD-YYYY` and `&time=HHMM`. Built.
- **A6. Temperature scales.** Answered 2026-10-03: `18°C (64°F)`, no kelvin on the card. Built.
- **A7. Highport art.** Answered 2026-10-04: yes, the images are yours and ship. The four
  paintings are in `apps/web/public/starports/`.

#### A14. The "Day" tile beside the Day and night card  (A. The orbit view and the dossier (from Agent D))

The dossier's "Day" tile comes from the dossier model: it is the spin against the stars, or
the words "Tidally locked". The Day and night card under it gives the day from one sunrise to
the next. On Regina the tile says "Tidally locked" (to its planet) while the card says
"24 hours", which reads as a contradiction though both are true. Choose:

- (a) rename the tile "Rotation",
- (b) drop the tile when the card is shown, or
- (c) leave it.

(a) and (b) change `dossier/model.ts`, which belongs to the dossier's owner, not Agent D.

*Interim: (c), left as it is.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a).** The tile is now labelled "Rotation".

#### A13. Proving the copied tilt term against the engine  (A. The orbit view and the dossier (from Agent D))

The brief said to stop if the engine does not expose the tilt term on its own. It does not:
the term is worked out in the middle of a larger function
(`packages/engines/src/mgt2e_world_engine.js:1757-1759`). The copy in
`apps/web/src/orbit/today_temp.ts` is tested against hand-worked values, but not against the
engine. Proposal: a test that reads those three lines out of the engine file and runs them
beside the copy, the way the legacy parity tests do, with no change to the engine. Yes or no?

*Interim: not written.*

**Answer (2026-10-04, ruled in `handoff.md` §59): yes.** The test reads the three lines from the engine file and runs them beside the copy. Written; it passes.

#### A12. Today's temperature where the formula has no answer  (A. The orbit view and the dossier (from Agent D))

When the tilt part is larger than 1 + pressure (a strongly tilted world with almost no
atmosphere), the winter side of the formula takes the fourth root of a negative number.
Should that hemisphere show:

- (a) no "today" line,
- (b) the world's low temperature instead, or
- (c) another floor you name?

*Interim: (a), no line for that world.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a).** When the bracket under the root is not positive there is no line. Built and tested.

#### A11. Today's temperature on a planet locked to its star  (A. The orbit view and the dossier (from Agent D))

The approved formula (A3) swings the temperature with the season. A planet locked to its star
has one face always sunward, and the engine leaves a locked world a tilt of 3° at most, so the
formula would show nearly the mean on both hemispheres, which says nothing about its hot and
cold faces. Should such a world show:

- (a) no "today" lines,
- (b) the formula's result anyway, or
- (c) something else you name (for example its high on the day side and low on the night side)?

*Interim: (a), no lines.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a), no lines.** Built and tested.

### Interim choices that stand (moved from `questions_for_johnny.md`)

These were asked 2026-10-04 to 2026-10-06 and their **Answer** line was left blank. The file's own rule: "Leave a line blank to keep the interim choice shown under it." Its 2026-10-05 note says A5, A8 to A10, A15, A16 and E11 to E13 were settled by the orchestrator on Johnny's instruction. Johnny can reopen any of them.

#### A5. Body chips  (A. The orbit view and the dossier (from Agent D))

A row of chips along the bottom of the orbit view, one per star and world, with each
world's moons in a pop-up. It is in the design reference but the old app does not have it.
It is also how a keyboard user reaches every body. Keep it?

*Interim: built.*

**Answer:**
Keep it. It is the keyboard path to every body and a referee's quickest way round a system at the table. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### A8. Daylight latitude  (A. The orbit view and the dossier (from Agent D))

The orbit card quotes hours of light at 45° latitude over the year, and the dossier's Day and
night card draws its second strip for 45°. Is 45° the latitude you want, or another?

*Interim: 45°.*

**Answer:**
45°: keep. A middle latitude is the honest single figure; the strip and the card say "at 45°". (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### A9. How small a tilt means "no seasons"  (A. The orbit view and the dossier (from Agent D))

Your answer on moon seasons said a tilt under 3° reads "negligible seasons". The delighter
note (`campaign_manager_plan.md` §7.4) hides the season label under 5°. Which one holds for
every world: 3° or 5°?

*Interim: 3°.*

**Answer:**
3°, Johnny's own figure from A1, for every world. The 5° note in campaign_manager_plan.md §7.4 is superseded. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### A10. Star temperatures  (A. The orbit view and the dossier (from Agent D))

Stars show their temperature in °C and °F like worlds. Keep that, or show stars in kelvin?

*Interim: °C and °F.*

**Answer:**
Kelvin for stars, as Johnny wrote above: "5,800 K". Worlds stay °C (°F). (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)
I feel like K is right for stars, because that's how we measure light bulbs 

#### A15. What to call the 24-hour day  (A. The orbit view and the dossier (from Agent D))

The dossier now says "standard days (24 h)" for the clock's day and "local days" for the
world's own. "Standard day" is Agent D's wording. Keep it, or name the term you want
("Imperial day", "galactic standard day", another)?

*Interim: "standard days (24 h)".*

**Answer:**
Keep "standard days (24 h)" and "local days". Nothing in rules/ names the calendar day; if Johnny later wants an in-setting name, it is one string. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### A16. Where a world's starport stands (for the local-time tick)  (A. The orbit view and the dossier (from Agent D))

You decided the local-time tick on the Day and night strip is for the starport, with the
map's prime meridian as the fallback (`campaign_manager_plan.md` §7.10). Nothing in a released
system says where on a world its starport is. Until something does, every world uses the
fallback. How should a starport get its place?

- (a) the referee pins it on the surface map,
- (b) a rule you supply places it, or
- (c) the prime meridian is the starport's longitude by definition.

This goes with E3 (where longitude 0 is), which is also still open.

*Interim: the fallback for every world.*

**Answer:**
(c) for now: the prime meridian is the starport's longitude by definition, so the local-time tick is the starport's. (a), a referee-placed pin on the surface map, becomes a campaign feature once the surface map takes pins; the pin then overrides (c). Settles E3 the same way: longitude 0 is the starport. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### E3. Where is longitude 0 on a world?  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The map and the turning disc need one answer. The old orbit view puts a world's prime
meridian toward the right of the system at day 0. Keep that?

*Interim: keep the old app's.*

**Answer:**

#### E4. Effects with nothing in the data behind them  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

Aurora would need a magnetic-field or stellar-activity value, which the generated systems do
not carry. The same goes for volcanic plumes beyond what the geology fields say. Supply a
rule or a field, or they stay out.

*Interim: left out.*

**Answer:**

#### E5. Vegetation that looks Terran  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

`planet_rendering.md` has an open question: is `compatibility` the right field to decide how
Earth-like a world's vegetation looks?

*Interim: as that document has it.*

**Answer:**

#### E6. Surfaces for other editions  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The orbit view reads Mongoose-generated systems only. Do Classic, T5, RTT and Architect of
Worlds systems get surfaces now, or with the Builder slice where those can be generated?

*Interim: with the Builder slice.*

**Answer:**

#### E7. The same continents as the old app?  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The planet pictures will be drawn by the old app's code, ported and proven identical. But the
old app seeded each world's continents from values that lived on your device (its seed and the
hex's position on that map), so a world will look like the same *kind* of world, not have the
same coastlines you remember. Matching old coastlines exactly would need the old seed and map
positions carried over. Is "same look, different coastlines" acceptable?

*Interim: yes.*

**Answer:**

#### E8. Planets on a computer without WebGL2  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The old app has a third, slower planet painter for computers whose browser cannot do WebGL.
Porting it costs about three agent sessions. Phones and tablets are out of scope, so this
is rare. Port it now, later, or never? Without it those computers see plain lit discs in the
orbit view; the surface map in the dossier works everywhere.

*Interim: later.*

**Answer:**

#### E11. Sea colours for three liquids (from Agent D, enhanced map)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The enhanced map colours a sea by its liquid, using the colours the old app's planet profile
already holds. Three liquids in the rules table have no colour there: **Fluorine,
Hydrofluoric Acid and Hydrochloric Acid**. The old profile paints any liquid it does not
know in one purple it calls "Unknown Exotic Liquid". Choose:

- (a) use that purple for these three,
- (b) supply a shallow and a deep colour for each, or
- (c) leave their seas undrawn.

*Interim: (c). Their basins are drawn as dry lowland and the caption says "not drawn".
No Regina body has one of the three.*

**Proposed for (b), for your yes** (shallows, then deeps, as red, green, blue), shown beside
the twelve existing colours in `findings/ui_design_shots/surface_liquid_swatches.png`:

| Liquid | Shallows | Deeps | Look |
|---|---|---|---|
| Fluorine | 222, 214, 138 | 136, 124, 52 | pale yellow |
| Hydrofluoric Acid | 150, 178, 172 | 62, 92, 92 | colourless: a pale grey-teal |
| Hydrochloric Acid | 186, 200, 150 | 96, 114, 70 | colourless to faintly yellow-green |

Say "yes", or change any of them. Nothing is in the code until you do.

**Answer:**
(b), the three proposed colours as drawn. A sea the data says is there is drawn. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### E12. The colour of a frozen sea that is not water (from Agent D, enhanced map)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

The only ice colours with a source are the old profile's for frozen water. The enhanced map
uses them for every frozen sea, whatever the liquid (Regina A-VIII's frozen oxygen looks like
water ice). Keep one ice colour for all, or supply colours for other ices?

*Interim: water's ice colours for all.*

**Two proposals, for your yes,** on the same sheet
(`findings/ui_design_shots/surface_liquid_swatches.png`, columns 3 and 4):

- **Option A, one neutral "frozen exotic" colour** for every frozen sea that is not water:
  shallows 208, 210, 216; deeps 160, 164, 176 (a grey-white, against water ice's blue-white).
- **Option B, each liquid's own colour, paled:** the shallows 70% of the way to 236, 240, 246
  and the deeps 55% of the way to 176, 188, 204. Frozen oxygen stays faintly blue, frozen
  chlorine faintly green, frozen ethane a warm grey.

Water keeps its existing ice in both. Choose A, B, or keep water's ice for all.

**Answer:**
Option B: each liquid's own colour, paled by the stated amounts; water keeps its ice. A frozen chlorine sea should not look like water ice to a referee reading the map. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### E13. A liquid the data calls "Unknown Exotic Liquid" (from Agent D, enhanced map)  (E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9))

Regina C-II-g has 26% cover of a liquid the generator named "Unknown Exotic Liquid". It is not
in the rules table, so it has no melting point and the approved rules cannot say where it
freezes. The old profile does hold a colour under that name. Draw such a sea in that colour
with no ice, or leave it undrawn?

*Interim: undrawn; the basin is dry lowland and the caption says so.*

**Answer:**
Draw it in the old profile's colour (152,112,172 / 68,40,102), never frozen, and say "exotic liquid; freezing point unknown" in the caption. A 26% sea drawn as dry land contradicts the data. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

#### F1. Fix the engines, once, then rebuild the truth once?  (F. The generated worlds contradict their charts (one decision))

Proposal: (1) the principle "a world's stored physical data never contradicts its published
UWP or itself"; (2) Agent F designs the corrections from the findings and the rules files,
and brings you only the points where the rules files do not decide; (3) the new engines are
allowed to differ from the old app, with each difference recorded; (4) one truth rebuild (v6)
at the end.

*Interim: nothing changes; the enhanced map draws what the data says.*

**Answer:**

#### B1. Two route colours are hard to see  (B. The map)

The X-boat green and the core-route purple fall below the contrast level for lines on the
map background (2.85 and 2.08 against a minimum of 3). They are the colours the charts use.
Keep the chart colours, or brighten them?

*Interim: chart colours kept.*

**Answer:**

#### B2. Small text contrast  (B. The map)

Agent D held all text under 12 px to a stricter contrast level than the standard requires
(7:1 instead of 4.5:1), because your concern was small type. Keep the stricter level, or use
the standard one?

*Interim: stricter level kept.*

**Answer:**

#### B3. Unlabelled subsectors  (B. The map)

After the title jitter fix, a subsector whose title would sit off to the left or under the
panel has no title, even when it fills the view. Suggestion: add a constant
"Sector · Subsector" readout for the centre of the view in the status line. Do you want it?

*Interim: not built.*

**Answer:**

#### B4. Polity colours  (B. The map)

Each polity now has one colour everywhere, picked from the old palette by its name (the
Imperium is white, the Zhodani orange, the Aslan purple; some polities share a colour). You
said colours should be set in the UI per map, which is Builder work. Until then, do you want
any of the big polities set by hand in `universe/polity_colours.json`? List name and colour,
or leave blank to keep the defaults.

*Interim: defaults.*

**Answer:**

#### B5. Body position counter in the dossier  (B. The map)

The old app shows "3 / 14" after the Next button; the new one shows it between Previous and
Next. Keep it between, or move it after?

*Interim: between.*

**Answer:**

#### C1. The favicon  (C. The app)

Agent D installed a far-trader wedge with a red V. The red (`#d8202a`) is its guess at
Traveller red. Keep it, pick another of the four options in
`findings/ui_design_shots/favicon_options.png`, or give the exact colour.

*Interim: D's choice.*

**Answer:**

#### C2. Fonts  (C. The app)

The old app uses two font weights the new one does not ship, so some text is slightly too
light or too heavy. Fixing it means adding two font files. Yes or no?

*Interim: not added.*

**Answer:**

#### C3. Where production deploys from  (C. The app)

Today every push to `campaign` goes live. Now that tests run on every push, production could
deploy from `main`, with `campaign` as a preview site. Do you want that?

*Interim: `campaign` deploys to production.*

**Answer:**

#### D2. Sign-in providers  (D. Direction)

Only X sign-in exists. Discord and Google before anyone outside is invited?

*Interim: X only.*

**Answer:**

#### D3. One subsector at a time  (D. Direction)

You said users may generate "no more than one subsystem at a time". I read that as one
subsector (80 hexes) per request, with per-user metering. Is that right?

*Interim: not yet applied to the specs.*

**Answer:**

## Decided by the orchestrator

## Decided by the orchestrator, 2026-10-18 14:00 by `date` (C's CW3; 1.2.7 ready)
- **CW3 accepted:** locked moons not star-locked (Regina's system 8 moons, Zeycude 3); both ESM profile fixtures regenerated; legacy untouched; Regina's globe in bands.
- **1.2.7 ready:** rehearsal `outer29` green but the pixel test's copy-layout artifact; commands in `findings/push/release_2026-10-18.md`.

## Decided by the orchestrator, 2026-10-18 13:40 by `date` (Z's ZC3)
- **ZC3 accepted:** `maydayUsed` set when the archive starts playing; a re-arm after a context change keeps the first deadline (3 s from the first arm, as Johnny's "after 3 seconds on page load"); the campaign key arriving still resets the band (Beowulf's once-only flag is per campaign). 5 new tests; full suite 0 fail. Not proved live signed in (Z could not use `npm run dev`); Johnny's check on his dev server.

## Decided by the orchestrator, 2026-10-18 13:37 by `date` (C's CC4b, CW3)
- **CC4b accepted:** the receiver 240 px tall (212 under 540), width unchanged; three lines fit at 1600 and 390; the longest corpus line still clips its fourth line at 390 (C's question: leave it; Johnny asked for three lines). The fade from CC4 is in (`commsLeaving`, unmount after the opacity falls).
- **CW3 unblocked:** the moon test flips `locked` on every tidally locked moon (Regina's system: w1m0 to w1m3, w2m1, w2m3, w5m0, w5m1; Zeycude: w1m1, w1m2, w6m0), not only Regina. That is the brief's rule (a locked moon keeps one face to its planet, not its star), so both ESM fixtures `profile_regina.json` and `profile_zeycude.json` regenerate; legacy fixtures untouched.

## Decided by the orchestrator, 2026-10-18 13:33 by `date`
- `?mayday` fails signed in: the controller marks it used when armed, and the campaign key arriving inside the 3 s cancels the timer. Z ZC3, blocks 1.2.7. Checked working signed out (bare Vite, Regina and Velpare; Johnny's dev server, Velpare).

## Decided by the orchestrator, 2026-10-18 13:12 by `date` (C's CC4)
- **CC4 accepted for (1) to (4):** the receiver far right on the stage inset; the SIG bars (never wired in the port) now follow the envelope, 0 idle, 0.30 to 0.51 mid-line; the frame fixed (506 x 221 at 1600, 264 x 193 at 390; it grew 12 to 65 px before); SYSTEM COMMS and "System communications". **(5) the fade was missed** (added mid-item): folded into CC4b.

## Decided by the orchestrator, 2026-10-18 12:25 by `date` (ZC2)
- **Z ZC2 accepted:** ambient comms play for any system on screen, signed out or with the party away; party-addressed lines (the beacon, `when.party` lines) only with the lead ship there; a jump no longer cuts the band; `?mayday` at 3 s with no ship. Live in Edge, nothing forced: Regina a line at 11 s, Efate after a switch at 9 s, `?mayday` red then teal. Z's questions: 114 none (the orchestrator named Capital's address for Regina; Regina is `/s/Spinward_Marches/1910`); 115 C CC2b, blocks 1.2.7; 116 keep (the natural 1-in-2048 Beowulf stays a find for a party in the system).

## Decided by the orchestrator, 2026-10-18 12:17 by `date`
- **D DF15 accepted:** the wheel listener stayed on the old stage element after a body change rebuilt it (`v-if`); now `@wheel` in the template, and the size observer follows the elements. Checked in Edge: wheel zooms after the round trip; the small map still scrolls the dossier. **Z ZF1c accepted** (fixture in `tests/web/harness/`; passes in a copy without `findings/`). Watch in the rehearsal: C's `orbit_stage_layout.test.js` (headless Edge) timed out once in Z's loaded run.

## Decided by the orchestrator, 2026-10-18 12:02 by `date`
- Johnny's shot: the span switch over the panel's Back, and the "← <system>" crumb looping in the orbit view. Both new in 1.2.7 (CW1's header with Panel's Back): C CW2 blocks the push.

## Decided by the orchestrator, 2026-10-18 11:55 by `date` (comms dead air)
- C CC2, the CC2 amendment and CC3 accepted as built (System Comms and Fit lower left; `voyage.comms.on`, absent = on; the red theme and `mayday`). But Johnny sees only dead air: the engine plays nothing unless the lead ship is in the system (the package brief's "no away chatter"), so every signed-out visit and every system the party is not in is silent. Decided, from Johnny's 10:40 "on for everyone": **the view listens**; ambient lines play for whoever watches; party-addressed lines need the lead ship there; `mayday` needs no ship (C's question 1 answered the other way). Z ZC2, blocks 1.2.7, with a live proof. C's CC2 question 1 (Quiet mutes only background traffic now): as C recommends; E's words later. Question 2 superseded by ZC2.

## Decided by the orchestrator, 2026-10-18 11:25 by `date`
- Johnny's bug (the surface map lost scroll zoom) is a 1.2.3 regression: D DF15 blocks 1.2.7. D, not C: C holds the orbit view for CC2; D is idle and did the map's hover (DF8).

## Decided by the orchestrator, 2026-10-18 10:18 by `date` (CC1b, SI1b, TS4b to TS4d, ZF1, ZF1b, SI6)
- **Accepted:** C CC1b (controller created and destroyed with the receiver; chatter help words; the traffic switch is back because LS5, in progress, shows it), B SI1b (agent access off for no table, no row, a read error; fresh database: `/mcp` and `POST /api/tokens` 503 "Agent access is paused."; zod as the alias `zod4` = `npm:zod@4.6.5`; to turn on: `POST /api/admin/flags` body `{"key":"agent_access","value":"on"}`, audit logged), TS4b, TS4c, Z ZF1, ZF1b (`skill/`), SI6 (written before the paste door; SI6b amends it).
- **New blocker:** `tests/web/harness/city_pixels.mjs` reads `findings/city_design_s1_manifest.json`: Z ZF1c (Z's question 109, decided: the fixture moves into the harness folder; the check is unchanged, so 22:40 item 81 holds).
- **Z's question 110 decided:** keep `skill/` in the tree (Johnny's folder); when it is handed out, the download is a folder named `voyage-session-ingest` to match the frontmatter.
- **Z's question 113 decided:** the 50 latest journal entries by in-game date, then sequence, undated first (as specced).
- **TS4d decided yes** (refuse a settings write naming another account's table set: "No such table set." unless `official:<kind>` or the owner's live row), as "just their data" (Johnny 10:15); after the push.
- Not blocking: `receiver_render.ts` keeps its own `setInterval` display clock (`:405`); a follow-up routes it through `platform/browser.ts`.
- Push freeze lines in every queue (10:20); C finishing LS5 (background traffic), then the final rehearsal.

## Decided by the orchestrator, 2026-10-18 09:35 by `date` (all entries since 00:05; push 1.2.7)
- **Accepted:** A P9, P3b, P8, TS2b, AU6; E EU28b, XE1, P4, P7, P10; C CS10; D DU40, P5, P6, DU6. Lane questions settled as each lane recommended: A P9 (poll on while the panel is open and not View as players), E P4 (token in session storage), E P7 (a player may change kind and visibility on their own note; the commit drops what fails), E P10 (date format, living switches, table sets left out of What players see), D DU40 (`commands` is the leader; no new link kind), D DU6 (Vessels keeps the legs: one line in `timelineKeeps`, A).
- **AU37 (one-step Undo) declined:** Johnny 2026-10-14 "CRUD over undo" decides it; editing back by hand.
- **CC1 accepted as the receiver, not wired:** C CC1b first; it blocks 1.2.7 (a referee who turns chatter on would see a dead panel).
- **B BC1b, SI1, TS4 and Z ZC1, ZT6 accepted** (migrations 0021 to 0024 create only; each reader checks its table exists: safe in either order). **SI1b blocks 1.2.7:** agent access (tokens and `/mcp`) ships **off** (no row, no table or a read error = off), consistent with Johnny's "API and MCP paused" (10-17); Johnny turns it on by the admin switch when he wants it. `wrangler.toml`'s `run_worker_first` gains `/mcp`, `/mcp/*` (SI1): in the 1.2.7 list, Johnny told. TS4b (owner check on a member's set read) right after. Z's questions renumbered 93 to 102 (92 was taken).
- **Clean copy `outer28` (09:42): 2411 tests, 14 fail, typecheck 1 error** — all from files not committed: the rules-draft tests and the session-ingest tests read `findings/`, the corpus test reads the held-out Comms package, `mcp/server.ts` imports zod by a relative `node_modules` path. Z ZF1 (the skill moves to `tools/session_ingest/`, tracked) and B SI1b's addendum; both block 1.2.7. The city-light pixel test's timeout there is the rehearsal's layout (no root `node_modules/vite` in the copy), not the code: it passes in the tree. Build passes (`index-DImMHsPI.js`).
- Gates on the working tree 09:30: check clean, typecheck clean, `npm test` 2417 / 2371 pass / 0 fail / 46 skipped, build passes.
- Follow-ups (not blocking): `globalThis.sessionStorage`/`history` in `JoinPage.vue`, `router.ts:111`, `dossier/world_panel.ts` bypass `platform/browser.ts` and the checker misses `globalThis.`; a player's reload opens the account's own first campaign (A); a player's own note still shows the kind menu, visibility and Add an image (E, check P7); CS10's neon share is a minority at TL15 (question to Johnny); P5's invite link state after reload (question).

## Decided by the orchestrator, 2026-10-17 23:40 by `date` (A's P3, Z's ZT5)
- **P3 accepted:** `applyPlayersPage` with `visible` reconciliation (F1), `'gone'` on 404 or 403 `not_a_member` (F23), held rows `rev: 0` except own notes, `commit` drops everything but a players note for a player, the membership calls, the players schemas exported; 6/6 tests. Gap: `authorName` dropped on held notes (A P3b, first). A's question: P6 mounts the gone sentence (D's P6 note).
- **ZT5 accepted as logic** (`campaign/trade.ts`, 18 seeded tests, every result cites `_src`; five numbers spot-checked against `assets/trade.txt`). Its eight readings of the rules text are questions 84 to 91; the name-to-code table is question 92. Z next: ZT6 (freight and passengers available at a world).
- Typecheck clean at 23:32 (the duplicate players exports were A's mid-edit).

## Decided by the orchestrator, 2026-10-17 23:32 by `date` (C and D entries)
- Accepted: C CW1b (Edge without a GPU, Youghal and Efate, Column and Half, 1600 and 390); D DU31 (Print on record pages and entries through the browser's print, a print stylesheet with three print tokens; Bright Ledger prints 11 pages with its ship sheet), DF14 (one `placeNow`: a vessel's header, list row and web bar follow its track), XD3b, DU40 (the org chart: `commands` as leader, decided).
- DU31's subsector print parked until Johnny asks. The typecheck red other lanes saw (`packages/shared/src/index.ts` duplicate players exports, A mid-P3) is clean at 23:32.

## Decided by the orchestrator, 2026-10-17 23:15 by `date` (B and E entries; P2b green)
- **P2b accepted: the players server is in.** 35 of 35 leak cases pass (the system-hex companion included), `test:api:all` 38/38 on B's run; header stripping, `memberUniverse` (owner/member/archived/none), no-store on every branch, the rate guards, log masking, `GET /api/join/:token`, `/api/me/playing` with `truthVersion`; B wrote "checked" per row of the review's §3 matrix; no new migration (0021 safe in either order). Next: P3 and P9 (A), then P4 to P8, P10.
- SI0b accepted. BC1 accepted with three changes (summary in the write's response; upsert only on change, once a minute; next free migration number): BC1b. SI1 and TS4 queued for B (unblocked by P2b).
- E: EH1 accepted; EU28 accepted with `rel="noopener noreferrer nofollow"` and a redacted-mention test (EU28b); E's two questions as recommended.
- Z has filed nothing since 22:01: ZT5 is open and unblocked.

## Decided by the orchestrator, 2026-10-17 23:10 by `date` (A, C, D entries)
- Accepted: A TS1, TS2 (resolver only; storage gap: TS2b), TS3, XA2b; C CS9 (hover outline on its own canvas, Edge with and without a GPU), CW1b in substance (shots owed); D XD1, XD2, XD3, DF13, DU2, DU39, and DT3b earlier.
- D's questions: XD3 hide the button without a date, unable only with a date and no place; DU39 opens at Half; DU2 reads Jump Drive Output. A's TS1 question: the trade-code name check waits for a rules table. XD1's deviations stand.
- Refills: A TS2b, AU6, AU37 (proposal first); D XD3b, DU40, DU6.
- Flag for the parallel session's file: `tests/web/surface_city_pixels.test.js` hits EPERM on `rmSync` at times (`maxRetries: 5` would fix it).

## Decided by the orchestrator, 2026-10-17 22:35 by `date` (Lane X, city lights)
- **X's report accepted** after checking the tree: the fix is one line in `apps/web/src/orbit/OrbitRenderer.ts` `selection()` (the lock glow annulus starts at `visualR`, a belt keeps 0.9 R); `tests/web/orbit_lock_glow.test.js` and `tests/web/surface_city_pixels.test.js` (Vite + headless Edge with SwiftShader, skips without a browser) pass on the orchestrator's own run; the proof shot (glow stop in magenta turns the whole band magenta on every side) and the after shots confirm it. Nothing under `surface/` changed; CS8 stays as C left it. Root cause recorded: the "atmosphere band" Johnny saw three times was the selection lock's glow (`#ffce73` at 16 %) painted over the outer tenth of every planet after the worlds; the surface's city lights showed through it. Legacy `system_viewer.js:2225-2235` draws the same annulus.
- Step 0: the service worker registers under Vite dev but is network-first for the shell list only, so it cannot serve stale code. No change (question 83).
- CS8b (night-side proof) stays withdrawn: X's shots cover it. The `planet_rendering.md` edit waits on question 80; the city look item for C waits on 81. Lane X is done; its row stays on the board as done.

## Decided by the orchestrator, 2026-10-17 22:20 by `date` (A, C, D entries)
- Accepted: A XA2 (three Dijkstra runs, under 5 ms for Spinward Marches), AD2 (D66 from `assets/dice_conventions.txt` 29-34; `--font-data` tabular result; a close button on the popover, the sheet and the card); C CW1 (Johnny's world panel brief, every checklist item passed at 1600 and 390 on Youghal and Efate; one new token `--t-chevron`; star tiles keep kelvin; the readout shows the campaign clock and the local time, left as C recommends); D DU10 (the account menu keeps the person, seven items; a Campaigns panel), DU13 (`?` opens Keyboard shortcuts from the registry).
- C CW1b: the `doss-stat` class collision (every lane's red test) and the Edge-without-GPU check. D DF13: `jump_ring.ts` and `party_ships_map` red mid-DU2. DU10: My packages stays. B BC1: a per-campaign summary in the list (after P2b4, SI0b).
- Johnny asked to be reminded on 2026-10-18 to run the production seed (Z4 + Z10 in one apply): board, state and memory carry it.

## Decided by the orchestrator, 2026-10-17 22:05 by `date` (A, B, D, E, Z entries)
- Accepted: A XA1 (news graph: Spinward Marches 439 nodes, 86 bare edges, under 10 ms); B P2b3 (the member read with `visible`, the own-note rule in the DO before `baseRev`, anchors null/system/players record, hidden and missing alike, 65,535 guard, `openSocket` header strip; case 29 passes); D LS3b, DU18b; E E11, E12, E13; Z Z10 (Hollow Verge trimmed; Feri stays whole), SI5 (`schemas/proposals.ts`, 13 tests; the skill 0.2-draft).
- EDF1: one date form (`DDD-YYYY`, weekday where shown); no "long" form, no control. SI5: publish the skill in a folder named `voyage-session-ingest/`; `targetId` (B fixes the contract word, SI0b). Z10: Feri whole; backups may go after Johnny's seed.
- Refills: A XA2 (explicit); E EH1 (dice help), EU28 (rich text design); D DU2, DU39, DU31; Z ZT5 (the trade procedure's logic).
- In-progress breakage seen by lanes (C's CW1 badge prop, X's dossier/surface classes, Z's comma): transient, cleared on reruns; re-check at the rehearsal.

## Decided by the orchestrator, 2026-10-17 21:45 by `date` (A, B, D, E entries)
- Accepted: A AT2c, LS1b, AF2, AD1 (Dice on the rail before Marketplace; popover; bottom sheet at 390; gone from the campaign panel; `/account` has no rail: left so); B P2b2 (0021 `universe_members`, `universe_invites`; `author_id` by pragma; owner reads omit `authorId`; case 29 a todo until P2b3); D LS3, DF12b, DU7 (quick note on **Q**: Ctrl+Shift+N opens a private window before the page sees it), DU22b (polite live region names the selection; the status line no longer speaks); E E10, LS2 (1,000 lines in `corpus.json`, customs lines name no ban; 60 + 60 ship-name words).
- DU18 as D recommends: units keep Johnny's Celsius-first rule; date form per campaign (E, EDF1); reduced motion stays the system's; density and sound out; DU18b is only "This device" with Quiet. E's questions (E10, LS2) as recommended; the settings screen reads `words.ts` (D LS3b); the ticker uses both pools (C's LS4 note).
- D refilled: DU10 (Campaigns panel), DU13 (keyboard help from the registry).

## Decided by the orchestrator, 2026-10-17 21:40 by `date` (city lights, again)
- Johnny 21:35: "City lights are still on the atmospheric layer - give me prompt I can give to higher effort model to fix finally. Then prep C for next stream" (shot `findings/johnny_shots_2026-10-17/city_lights_still_2135.png`, Capital A586A98-F, night side, lights in the top limb's atmosphere band). `prompts/x_city_lights_fix.md` written (may edit the renderer files, claims as lane X; step 0 checks the service worker under Vite dev; a pixel test, not source text). C's CS8b withdrawn; C's area refreshed (renderers are X's this turn); C next: CW1, CS9, LS4, LS5.

## Decided by the orchestrator, 2026-10-17 21:33 by `date` (C's CS8)
- CS8 accepted as code (vanilla `gl_shade.ts` and enhanced `draw.ts`: no city colour in the air scatter or the night limb haze; the parity test strips the two sites; `js/` untouched). Its shots face the day side, so CS8b: night-side and limb shots before and after, a pixel check if possible, before CW1.

## Decided by the orchestrator, 2026-10-17 21:32 by `date` (B's entries)
- Accepted: P2b1b (case 29 a todo until P2b2), B5b (`run_worker_first` back to `["/api/*"]`; previews parked; the worker case skipped), SI0 (`contracts/b_session_ingest.md`: own `access_tokens` table, Better Auth 1.7.7 has no API-key plugin; MCP `POST /mcp` in phase 1 on the same Worker; every stored proposal referee-only; 10 submits a minute per token and per universe outside the 120 budget; kill switch `platform_flags.agent_access`; migration 0022), TS0 (`contracts/b_table_sets.md`: `table_sets` D1 table plus R2 objects; `/api/table-sets?kind=`; kinds trade and randomPassenger).
- `test:api:all` under load: `players_leaks` red until P2b4 (expected); `generate_speed` and `builder_density` failed only in the loaded all-run and pass alone. Before 1.2.7: run those two alone in the rehearsal.

## Decided by the orchestrator, 2026-10-17 21:10 by `date` (A, C, D, E entries)
- Accepted: A AT2b, LS1; C CL4b; D DF9 (galaxy dots as kept bitmaps on whole pixels; 33 to 46 fps without a GPU), DU3b, DF10 (dots drawn after lines), DT2b (the naval/scout mark; Refuel offers what the class sells); E E5d, EU12, E9.
- LS1's question: all three weapon customs lines go (they tie a ban to a Law Level range; "no line restates a rule"): LS1b; E writes rule-free customs lines.
- DT2b's need: `fuelMark` referee-only in the schema and the projection (A, AF2, first).
- DF12: "Post this month" posts the five upkeep boxes, the Upkeep figure (A AT2c, D DF12b). Product, not a rule: the boxes are typed.
- DF11 (kept galaxy layer): only if a real machine is slow. EU12's three questions as E recommends.
- D refilled: DU7 quick capture, DU18 per-device settings, DU22b the map's live region.

## Decided by the orchestrator, 2026-10-17 20:30 by `date` (all streams' entries)
- Accepted: A AF1, AP1c, AT1c, AT3b (`usePassengerTable` is the one replaceable function), AU17 (`shell_cache.js`: `/api`, `/join`, `/claim` network-only; shell network-first; old caches deleted); B P2b1 (case 29 to `todo` first: P2b1b); C CC5, CS4, CS6, CU35, CS7; D DS9, DU3, DU36, D5, DF18, DU4, DU27, DF6 (no half-resolution code left), DF7, DF8, DT1c; E EU22, E7b, EU44 (E5c: one preview line out, E5d); Z ZR1.
- Decided: C's CL4b first-run card as C recommends; D's DF9 (galaxy dots batched, same pixels) yes, label sprites wait; D's DU3 question as D recommends (DU3b); E's EU22 questions as recommended; EU44's preview question moot (previews parked). Z told lanes may read `rules/`. Z10: re-add the example covers D5 crops.
- To Johnny: Z8's starport questions (63 to 68) and ZT1/ZT1b's table-set questions (69 to 78).

## Decided by the orchestrator, 2026-10-17 19:55 by `date` (B's entries; the players contract)
- Accepted: B0b (`npm run dev` on `apps/api/.wrangler/dev`; a local released row newer than production's newest is withdrawn), B4 (`door_headers.ts`; no-store; log masking; 36/36 suites), B6. B5's code accepted but **its `wrangler.toml` change is Johnny's**: question 25; out of the push until he answers.
- The players contract (P2a) checked against the review's §6: 15 of 17 right; fixes (a) member note anchors null/system/projected record, (b) B writes `PlayersPage`, (c) `visible` on `after=0`, (d) `authorName` on the owner's read, (e) route order: B2c. B's questions: 1 yes (live Origin sentence), 2 yes (pre-0014 fallback stays). P2b queued as P2b1 to P2b4. `character/rooms.ts` `openSocket` header copy folded into P2b3.

## Decided by the orchestrator, 2026-10-17 19:50 by `date` (A's and E's entries)
- Clock note: labels from 18:50 to 20:20 in this file and the handoff ran ahead of `date` by about 35 minutes; from here labels are `date`.
- Accepted: A AM1, AS3, AS3b, AU16b, AB3 (golden and generation 208 pass, 0 fail: output unchanged), AU15; E E5b, E7, E8. E7's leftover "engine" sentences: E7b now. E5b's draft: drop the half-resolution line, add AU15 (E5c). A's AB3 leftovers: `contracts/b_builder.md` quotes old sentences (B, when next in it), `tests/web/builder_draft.test.js` fake reply (harmless).

## Decided by the orchestrator, 2026-10-17 20:10 (half resolution out)
- Johnny 20:10: "Oof, the half resolution pan looks terrible." DL5 (half resolution while the camera moves, on browsers without WebGL or with slow frames) comes out entirely: D's DF6. Speed without a GPU comes from cheaper drawing, never lower sharpness. (The look is the bar: legacy-look memory.)

## Decided by the orchestrator, 2026-10-17 19:35 (A's AP1b)
- AP1b accepted: party lists filtered, a hidden track end becomes the system hex (hexKey, bodyKey) or null, hidden cargo and passenger ids dropped, object hashes from images only, own-note `rev` and `authorName`; probe 1 prints the filtered party, a system anchor and `true`. Q1 (`authorName: ''` for an unknown handle): keep. Q2: the party anchor follows the track-end rule (Johnny's question 1 said "track or anchor"): AP1c.

## Decided by the orchestrator, 2026-10-17 19:15 (E's entries)
- Accepted: ES2 (signed out: "Sign in to build here.", the Sign in button opens the rail's card; `dossier_signed_out.test.js`), ES10 (one static import of the router; `shell/go.ts`; no INEFFECTIVE_DYNAMIC_IMPORT), EL7 (help "Start here", links to `/welcome`), EL6 (About draft, `findings/landing_about_draft.md`, four sentences for Johnny to confirm; nothing ships).
- ES2's run saw two failures in `tests/shared/players_view.test.js` while Lane A held it for AP1b: A's item in progress, not E's.

## Decided by the orchestrator, 2026-10-17 18:35 (all stream entries, the players review, the integration sweep)

- **Accepted:** A AT4a, AU14, AU16; B B0, B3; C C1, C2, C3, C4, C6, CL4; D D6, D7, D8, DF1, D9, DF2, DF3, DF4, DF5, DL5, DT1, DT2; E E3 (all areas; Build left correctly), E4, E5, E6, EN1, EM7, EM9; Z Z2, Z3; ZT0 as a proposal for Johnny.
- **The players review** (`reports/x_players_review.md`, `players_build_plan.md`) is the plan for Epic P. P1b (A) and P2a (B, B2b plus §6) are queued **on hold** until Johnny answers its §7 questions 1 to 8 and says yes to P2 (question 9): the rule is QUESTIONS before GO. B4 (F5 header hygiene, F9 no-store) goes now: no question touches it and it holds for the owner today.
- A's questions (AT4a 1 and 2, AU14 1 to 3, AU16 1): as A recommended. AU16's note (a version released twice; the cache never evicts): AU16b.
- AU14 edited `views/MapView.vue` (D's) while D's DL5 did too; no collision (both changes are in). Noted to both: a screen edit is claimed.
- AU17 (installable): the service worker never caches `/api/*`, `/join/*`, `/claim/*` (review F9, F22, F23).
- C1's `#0b0c10` literal in `apps/web/index.html` (theme-color): accepted as a documented exception; `meta.test.js` ties it to `--bg-0`.
- C2: the four pane sentences stand until Johnny edits them (decision of 15:30). C2 Q2, Q3, C4 Q1: as C recommended. C5 approved (presentation, not a rule) and given to C with `orbit/` while L is wrapped; C6's orbit card height to C; the shell header and `StatRows.vue` shifts later.
- D8 counts: the browser keeps counting until the store passes 100 packages; Z6 (server facets) stays in Z's queue.
- DT1 Q2: a cargo lot with a price posts its payment to the ledger by default, dated by the campaign clock (product, not a rule). DT1 Q3: the minus sign moves into `formatCredits` (A, AM1).
- DT2's starports question needs a rule: asked of Johnny (Z8 drafts it on his yes). Until then the vessel shows the class and the referee decides.
- B0 Q: the two local 503 dot answers stay. B3 Q: "That version is not released." yes. B3's leftovers: Z7 (Z's routes), AB3 (generation words).
- Integration sweep: nothing blocks 1.2.7. Finding 2 decided: signed out, "Sign in to build here." with the sign-in link (E, ES2). Findings 3 and the Boon/Bane reach (A), 4 and 6 (C), 5 and 9 (D), 10 (E); 1 and 8 likely closed by AU14 (retest at the rehearsal); 7 by design.
- Z5 held: Epic P now covers players seeing a campaign; re-scope before anyone starts it.
- E7 and E8 released to E with their files (D is not in `workspace/build/` or `passkey/` this turn).

## Decided by the orchestrator, 2026-10-17 17:15 (A's stream questions: all as A recommended)
- A4: "largest" systems by body count. AP1: an included link keeps its role and notes; party place and settings text stay in the players' read (**the players review may overrule this**: referee text in the party's place is a candidate leak).
- AT1: `amount` is the signed credit change, `kind` doesn't flip it; blank sheet rows aren't stored and the sheet is a view of the dense list; `PassengerLot.note` stays. AT2: costs post negative; `refuelHours` unread; the starport check is the screen's; Purchase Cost posts with the others when typed; Lane D mounts the buttons (DT2).

## Decided by the orchestrator, 2026-10-17 16:55 (B's players contract, five questions)
1. `universe_invites` keeps `token` beside `token_hash` so Copy returns the same link: owner routes only, never logged, cleared on revoke (a reusable, revocable campaign link, unlike a character's single-use one).
2. `campaign_full` counts current members; removing one frees a seat.
3. The owner's `PATCH /api/universes/:id/players/:userId` `{ personId }` is part of P2.
4. The later players' publish revoke is `DELETE /api/universes/:id/players/publishes/:publishId`.
5. The projection drops every `rev`; a deleted player note the member could see travels as `deleted: true` on the poll.

## Decided by the orchestrator, 2026-10-17 16:20
- M's M7 question: the changelog shows each release's date in the `.ui-date` box (E, EM7).
- L's L4 proposal: `viewport-fit=cover` in `index.html` (C, CL4). L's L5 proposal: half resolution while the map moves without a GPU (D, DL5).
- M's leftovers M9 and M1b go to E (EM9); L6 to L8 and M10 stay in their queues for when L or M is back.

## Decided by the orchestrator, 2026-10-17 14:45 (and 14:50)
- N4: the palette says "New vessel", the type's own word everywhere.
- L (software discs): the dossier drops its WebGL notice (L1b); small enhanced globes read a smaller sheet; gas giants keep the bake's bands.
- Z (installs, catalogue): `author=` matches the publisher's current profile handle; the browser imports `PACKAGE_KIND_FAMILIES` from `@voyage/shared` (D8).

## Decided by the orchestrator, 2026-10-17 14:00
- D's four (`d_store_harden`): NEW = updated in the last 7 days; cards keep the date box; "Browse by kind" stays; the results bar sticks below 1024 px. Johnny may overturn on sight.
- A: merge the encoders as recommended (`a_encoder_merge`).
- M: the wordmark's red dot stays as in the videos (2.7:1; a logotype, exempt); the contrast test says so.
- N: track legs stay off the timeline; `WhereBlock`'s heading becomes a kicker everywhere (N0 in its stream).

## Decided by the orchestrator, 2026-10-17 (D's `d_import_style` questions)
1. The cover hint keeps the store's fine print (`mk-fine`) everywhere.
2. The publish forms' limits line moves to `mk-fine` too, in `d_store_harden` (one extra line in its item 3).

## Decided by the orchestrator, 2026-10-16
- Z's question 2: the dropped-anchor count stays on the preview only, not on the install answer.
- Z's question 1 (example packs to records-only) is already Johnny's, after records-only ships with D's screens (Queue).

## Decided by the orchestrator, 2026-10-15 (D's storefront questions)
1. Kind chips and "More by" filter in the browser over the loaded page (up to 100 cards) while the catalogue is small; B adds `family=` and `author=` queries later (Queue).
2. Focus stays the manifesto's one amber ring; cyan only on Import, the active chip and hover borders.
3. A new package's cover goes up once its first version is accepted; a refused cover does not stop the publish; an existing package's cover changes only on its page.
4. Signed out, Import goes to social sign-in as before; the passkey modal waits for B's auth in pushes.

## Decided by the orchestrator, 2026-10-13
- The public games feed leaves out the caller's own universes (built, B).
- In a window too small for the whole Regina subsector with names, a first visit opens on
  Regina with names (D's question 2, as built).
- The dossier codes with no line in rules/ or assets/ stay bare (E's eight: Cr, nobility
  letters, allegiance, the trade codes Ph An Cp and sophont remarks, PCR, the government,
  law, tech, starport and military strings, AoW and RTT, luminosity classes other than V
  and D and BD). Johnny may supply text for any of them later.
- No push of engine 1.2.0 and no v10 upload before Lane C's change 1 is in (it is, 21:00).
- Z's three: the side-stream key is `<hexId>|liquid|<world>|<moon>|<orbitId>` under the
  master seed; the 20:11 v10 build is thrown away; the uploader's `--endpoint` reads the
  version state from the local emulation and needs its own `S3_ENDPOINT_*` keys.
- The map draws every public game the server sends (D's question 1; A removes the name guard).
- The account menu under a panel is fixed before the push (D's question 4).
- C's surface change to `engine_1.2.0/profile_regina.json` is intended: 7 fields on three
  bodies of Regina's system (w1m3, w6, w7) that carry `liquidType: null` now paint no sea;
  Regina herself is unchanged. Regenerated by the orchestrator with a guard that refused
  any other difference.
- The ten parked truth-build files stay out of 1.1.12; `admin.ts` goes by the cap-only
  patch (B's question; a local v9 released on that shape).
- `tests/generation/liquid_temperature_census.test.js` skips when `universe/raw/Core.tsv`
  and the other sample files are absent (git-ignored; CI has none). Edited by the
  orchestrator: one guard line, no assertion changed.
- The Generate sheet's "top down" note becomes "from the star outward" too (D's question
  2; after the push).
