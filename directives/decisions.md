# Decisions

A dated ledger, newest first, moved here unchanged on 2026-10-17 from `board.md` and the answered part of `questions_for_johnny.md` (the directives cleanup). **Read this before deciding anything; do not re-decide.** Add new decisions at the top of their part.

## Decisions from Johnny

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
