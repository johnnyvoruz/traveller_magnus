# Backlog — the best UX and UI in the industry

**Status:** BACKLOG, asked for by Johnny 2026-10-17 ("this must have the best UX / UI in the
industry"). Written by the review session that wrote `backlog_players_landing_trade.md`; read that
file first, since the three epics there come before most of this. Facts are from production 1.2.6
and the code on 2026-10-17. Every item is sized for one stream-lane entry or one prompt and says
what it needs: **rule** (a Traveller rule from Johnny), **server** (Lane B, a contract first),
**decision** (Johnny), or **none** (a lane can take it today).

**What "best in the industry" means here, in rules the lanes can check.** The bar is the
manifesto's seven words plus three things the competitors are judged on at the table:
1. **Nothing is more than two actions away** from the map or the palette, on a phone or a desk.
2. **Every screen answers "where am I, when is it, what can I do here"** without a label hunt.
3. **The app is never embarrassing in front of players:** no blank page, no leak, no jump,
   no spinner where cached data exists, no word that breaks Google style.

Items are in four tiers. Within a tier, the order is the recommended order. Lane letters follow
the board's areas (A client logic, B server, D screens, E words and journal and characters,
M style, N connected behaviour, L rendering, C renderers). Shared files (`views/MapView.vue`,
`views/OrbitView.vue`, `shell/PanelHost.vue`, `workspace/CampaignPanel.vue`) must be named in
the prompt that touches them.

---

## Tier 1 — at the table (what a referee runs a session with)

**U1 Session mode (D, then A).** One command, "Start a session": the campaign panel becomes a
live board at Full: the clock large with the weekday and a one-button "+1 hour / +1 day / +1 week"
row, the party card with "Where are we" and who is aboard, the journal's session entry open for
typing with `@` mentions, the dice button, and a "Markets nearby" or "Records here" strip for the
current world. "End the session" writes the session entry's real date and asks one question:
"Advance the campaign date to the end of the session?" Needs: none (every piece exists; this is
composition). This is the screen D&D Beyond's encounter tracker is for fantasy. Size L.

**U2 Jump-range ring (A, D).** With a party ship selected, a ring of jump-N hexes around its
world on the map, reading the ship's jump rating from the sheet once Johnny names the field
(`campaign_gap_audit.md` §3 question 1). Until then a "Show jump-2 ring" with the number typed on
the Party tab. Worlds inside the ring get their starport letter in the ring's colour. Needs:
decision (the field name); the typed version needs none. Size M.

**U3 "Where is everyone" on one card (D).** The Party tab's first card: each ship with its
position words from `campaign/track.ts`, each member aboard or ashore, and a Locate button per
row that draws the locator line. Today the "No party yet" card and the vessel's track are the
only views. Needs: none. Size S.

**U4 Phone pass on the five table screens (D, M).** At 390 px: the party, the record page, the
journal entry, the character sheet, the dossier. Each gets a before and after shot and a rule:
no horizontal scroll, every control reachable with a thumb, the bottom sheet (`phone_sheet`
pattern) for every panel. D&D Beyond's app is where players sit during play. Needs: none. Size M.

**U5 Handout reveal (D, after Epic P).** On a journal handout, "Show to players": a full-screen
image or text with the campaign's look, a link players can open on their phone, and a toast when
they have. D&D Beyond shipped "Reveals" in 2025 for exactly this. Needs: server (P2's
projection already carries players entries; the reveal is a read of one entry). Size M.

**U6 The timeline that fills itself (A, D).** `timeline.ts` lists dated entries and dated records
only; a vessel with three dated legs shows "Add a session". Add: vessel legs as rows (arrival at
a world, departure, jump entry and exit), grouped by day, filterable by ship and type (stream N's
N7 covers the filters), and the party's position row "today". Needs: none; the N0 decision "legs
stay off" was for the record page's own list, not the campaign timeline, and is reversed here
*(decided here; Johnny may overrule)*. Size M.

**U7 Quick capture (D, E).** `Ctrl+Shift+N` anywhere: a one-line note box at the top of the map
("Add a note") that writes a journal note mentioning the current hex and the selected record,
without opening the panel. Referees type during play; the panel is for after. Needs: none. Size S.

**U8 Dice at the table (D).** The roller exists and interprets nothing (`dice/roll.ts`, 1 to 3
dice, boon and bane). Add a roll history strip (last eight), a "Roll again", and a roll button
beside every characteristic and skill on the character sheet that pre-fills the dice and names
the box it came from, still interpreting nothing (Q6). The 3D roller stays backlog. Needs: none.
Size S.

---

## Tier 2 — the first hour (a new referee's day one)

**U9 One onboarding checklist, everywhere (D).** Epic L's first-run card grows into a checklist
in the account pop-up: world found, ship added, date set, first record, first entry, players
invited, package browsed. Each line is a button. Done lines fade; the list leaves at 7 of 7.
Needs: none. Size S.

**U10 The account menu becomes a Campaigns panel (D).** Today `AccountMenu.vue` is one list of
fourteen items. Split: the pop-up keeps identity, "Campaigns…", "Characters", "Account",
"What's new", "Help", "Sign out"; a new `?panel=campaigns` lists campaigns as cards (name, world
of the party, date, record count, last played, Playing in), with New, Rename, Delete (the one
confirm), Export, Import, and the public switches on the card's back. Johnny asked for "a major
cleanup of the account window" (plan.md, 2026-10-08). Needs: none. Size M.

**U11 The account page inside the shell (M, D).** `/account` renders outside the rail and the
look. Make it a panel (`?panel=account`) in the look, with the same sections; `/account` stays as
a redirect so the recovery-codes flow keeps its URL. Needs: none. Size S.

**U12 Empty states that teach (M, E).** One pattern (stream M's M9): a sentence in `--text-muted`
and one action. Audit every list and tab: Records, each type chip, Party, Journal, each journal
kind, Timeline, Characters, My packages, Markets. "Nowhere in particular" on a record row is a
place-less record; make the row's place a button "Place it" instead. Needs: none. Size S.

**U13 Keyboard help from the registry (A, D).** Manifesto Extendability: the help screen is
generated from the shortcut registry. `?` opens a sheet listing every registered shortcut by
group; the palette shows the shortcut beside each command. Today `HelpGuide.vue` is hand-written
and has no shortcuts. Needs: none. Size S.

**U14 Palette everywhere, with scopes (A).** `Ctrl+K` from any screen including the orbit view
and the store; result groups Worlds, Records, Entries, Commands, Packages; recent items first;
fuzzy match on names; a hex id typed ("1910") jumps. The omnibox exists; this makes it the one
way to go anywhere (manifesto: a feature gets no chrome until it works from the palette). Needs:
none. Size M.

**U15 Search that finds text (A, B).** Search inside record details and journal bodies, not only
names. Client-side over the loaded campaign first (the campaign is already in memory); a server
FTS table in the DO later (the DO already has `hexes_fts`). Needs: none for the client half;
server for the rest. Size M.

**U16 Loading that never shows twice (A, L).** Manifesto Graceful. The chart's sector indexes and
trees are immutable; make the first visit cache them in the browser (Cache API through
`platform/browser.ts`) so a return visit renders the last view with no network wait; the
campaign store keeps its last read in IndexedDB for instant paint, then reconciles with
`?after=`. Needs: none (a decision on IndexedDB for *cache only*, since the plan dropped it for
*persistence*; *decided here:* cache only). Size L.

**U17 Installable (A).** A web app manifest and a service worker that caches the app shell and
the fonts: "Add to home screen" on a phone, a desktop window without browser chrome. No offline
writes. Needs: none. Size S.

**U18 Settings that are per device (D).** One small settings sheet in the account pop-up:
units (km or AU first, °C or °F or K), date form (`DDD-YYYY` or long), reduced motion, map
density, sound off (there is no sound; the switch is reserved). Stored per device, not on the
server. Needs: none. Size S.

---

## Tier 3 — the polish bar (what makes a reviewer say "this is the one")

**U19 Cold-load tests for every route (A, N).** Manifesto Connected: "every route in the router
table has a test that renders it from a cold load." `/help` rendered blank on a cold load in
Chrome on 2026-10-17; the orbit route opens with the system panel covering the picture at Full.
One SSR test per route with a representative query, and the orbit route opens with the dossier
at Column, not Full. Needs: none. Size S.

**U20 No layout shift (L, D).** A Lighthouse run on `/`, `/s/Spinward_Marches/1910` and the
orbit route scores zero CLS; reserve the height of the search bar, the date chip, the panel
header and the body chips before data arrives. Record the three numbers in the report. Needs:
none. Size S.

**U21 Reduced motion and a light theme (M).** `prefers-reduced-motion` disables every animation
(the manifesto says it does; verify the orbit sweep, the locator pulse, the panel reveal). A
light theme as a token swap only (`color-scheme: light` block in `tokens.css`), reachable from
U18, with the contrast test run on both. Needs: none. Size M.

**U22 Focus and screen readers (D, M).** Every icon button has a name; the rail is a `nav` with
`aria-current`; panels trap focus the way the lightbox does and return focus on close; the map
canvas announces the selected hex in a live region; the body chips are a `listbox`. One audit
with axe in the browser pass, the findings fixed. Needs: none. Size M.

**U23 One modal, one toast, one confirm (M).** The board notes modal frame styles live in
`Lightbox.vue` and D's picker carries a copy. Finish the shared frame in `base.css`; the Player
Pack's confirm dialog and the delete-campaign confirm use it; toasts never stack past two. Needs:
none. Size S.

**U24 Words, one pass per screen (E).** Google developer style across every sentence a person
reads: buttons are verbs, sentences end with a period, no "Please", no exclamation marks, the
same word for the same thing (campaign, not game, except "public game"). The Builder's fifty
server messages (board, Known) are part of this. Needs: none. Size M.

**U25 Hover cards for worlds (N).** The record hover card exists; add the world card on hover of
any hex link (name, UWP tiles, trade codes, allegiance, "Open") in the journal body, the links
block, the records list and the markets list. Needs: none. Size S.

**U26 Links that unfurl (B).** Epic L's L5 gives `/s/…` and `/packages/…` social previews; add
`/join/<token>` ("You're invited to <campaign>") and a public ship's card. Pasting a link into
Discord is how Traveller groups share; the preview is the first impression. Needs: server. Size S.

**U27 Portraits in rows (D).** A record's first image as the avatar in the records list, the
party, the hover card and the timeline (gap audit §4 step 5). Needs: none. Size S.

**U28 Rich text, a small subset (E, A).** Details and journal bodies take a tiny Markdown
subset: headings, bold, italic, lists, links, `[[mentions]]`, images from the record's gallery
inline. One parser in `workspace/journal/body.ts` (which already splits mentions), one renderer,
escaped by default, with a test that nothing else renders. Obsidian Portal's wiki pages are the
bar for narrative depth. Needs: none. Size M.

**U29 Referee-only passages inside text (E, after U28).** A `:::referee` block in a players
record or entry that the projection strips and the referee sees shaded. Obsidian Portal's
"GM-only" paragraphs, done at the projection so it can never leak. Needs: none after P1 and U28.
Size S.

**U30 Comments on an entry (B, E, after Epic P).** Players and the referee reply under a journal
entry; a reply is a players note with a `parent` id; the entry shows a count. Needs: server
(a column on `campaign_journal`). Size M.

**U31 Print and PDF (D, L).** "Print" on the character sheet, the ship sheet, a record page, a
journal entry and a subsector (the chart at the names tier): a print stylesheet on paper tokens,
the browser's print dialog, no second renderer. Needs: none. Size M.

**U32 Snapshots and restore (B, D).** Nightly snapshot of each campaign's rows to R2 (the DO
already has a `snapshots` table for the Builder), a list of the last 14 in the Campaigns panel,
"Restore to this" with the one confirm. "The export file is the backup" is not a hosted
product's answer. Needs: server. Size M.

**U33 In-app notices (B, D).** A small inbox on the account button: a package you imported has a
new version, a player joined, a player wrote a note, the referee shared a handout. Polled with
`/api/me`. Needs: server. Size M.

**U34 Store community (B, D).** An author page (`/@handle`: their packages and public ships), a
"Used in N campaigns" count, a "Notify me of updates" tick on an import, and a featured row the
admin curates. Everything free (Johnny: nothing is ever sold). Needs: server. Size M.

**U35 Orbit view first-open framing (C, D).** On open the camera fits the inner system with the
mainworld's chip selected and the panel at Column; the "No ships here" pill only when the campaign
is open; the time drawer's Play is reachable by Space. The screenshot today shows a small cluster
in the middle of a dark field. Needs: none. Size S.

**U36 The map's own help, in place (D).** A "?" on the floating controls that overlays the map's
gestures once (drag, wheel, Shift+drag, `S`, `U I O / N M ,`, right-click), then never again.
Needs: none. Size S.

**U37 Undo where "delete with Restore" is not enough (A).** A moved record, a changed date, an
edited track leg: a toast with "Undo" for 10 s, using the change builders' inverse, no undo stack
(Johnny: CRUD over undo; this is a single-step toast, not a stack). Needs: decision (yes/no).
Size M.

---

## Tier 4 — the delighters (why people talk about it)

**U38 Scrubbing time moves the party (A, C).** Dragging the campaign date on the timeline moves
the party's ships along their tracks on the map and in the orbit view, dims records dated after,
and shows "then" positions as ghosts. The orbit clock already runs; this binds the campaign date
to it with a scrub. Needs: none. Size L.

**U39 Relationship web (D).** A force graph of records and links for the open campaign (full
width), filterable by type and link kind, a click opens the record, the locator line connects the
graph node to the map. Needs: none. Size M.

**U40 Org chart (D).** Organizations with `member` and `leads` links drawn as a tree (gap audit:
starts from the seed list; allegiance colours wait on Q8). Needs: none for the chart. Size M.

**U41 "What season is it here" (C, A).** The plan's §7.4: the world's axial tilt and orbit give a
season word and a temperature band at the campaign date, on the dossier's day-and-night card.
Needs: rule check (the climate bands exist in `rules/mgt2e_climate_bands.json`; the tilt is in the
generated tree); if any number is missing, propose. Size M.

**U42 Share a moment (D, B).** "Share this view": a public, read-only link to the current map
view or orbit view at this date, with the campaign's public ships, rendered without chrome, with
a social preview. Needs: server (a short-link table). Size M.

**U43 Sound, off by default (C).** A click on a hex, the panel reveal, a jump: three short tones
on the sci-fi terminal register, off unless U18 turns it on. Needs: decision. Size S.

**U44 A changelog people read (E).** "What's new" with one picture per release and a two-line
story, posted as a page (`/changes/<version>`) that unfurls (U26). Needs: none. Size S.

---

## Found on the tour (fix in whatever lane owns the file)

- `/help` blank on a cold load in Chrome (`views/HelpView.vue`, `HelpWindow.vue`). Epic L, L2.
- The orbit route opens with the dossier at Full over the picture. U19 and U35.
- Clicking Build in the rail while the campaign panel was open changed nothing visible (one
  observation, Chrome, signed in). Reproduce; if Build only toggles Select hexes, the rail item
  needs a pressed state and a toast on first use.
- The campaign panel has both a "Timeline" tab-like control at the right of the tab strip and a
  "Timeline" button beside Publish. One of them goes.
- Two records named "New vessel": the Add button should name the new record by type and count
  ("Vessel 2") or open the name field selected.
- The Characters panel opens from the account pop-up only; it is not on the rail and not in
  the palette's first screen. U14 and U10.
- `/account` sits outside the shell. U11.
- `index.html` has no description or social tags. Epic L, L1.
