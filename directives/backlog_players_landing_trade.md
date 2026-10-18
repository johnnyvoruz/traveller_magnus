# Backlog — players as accounts, the landing page, trade

**Status:** BACKLOG, decided by Johnny 2026-10-17 ("yes players first, landing page now, trade
first"). Written by a review session for the orchestrator, from a tour of production 1.2.6 and a
read of the code on that day. Every fact below names its file. Every decision not Johnny's is
marked *(decided here)* and stands until he overrules it; every question only he can answer is
under "Questions for Johnny" at the end of its epic, spelled out in full.

**How to use this file.** Each epic is a numbered list of steps sized for one lane and one
report. Steps name the files they touch, what exists, what to build, the check and the gate. The
orchestrator turns a step into a prompt in `directives/prompts/` or a queue line in
`directives/streams/<lane>.md`; a step marked **contract first** goes to Lane B as a contract in
`directives/contracts/` before any client step starts. Nothing here is a recipe yet: line numbers
drift, so the orchestrator writes the recipe from the step when it issues it.

**Order across the three epics.** L1 and L2 (one day, no server) can run on a stream lane at once.
P0 to P3 are the critical path for players; P4 onward fan out. T1 to T3 need no rule and can start
any time; T4b onward wait on the trade rules file (Johnny). Nothing in this file touches `rules/`,
`js/` or the engines.

---

## Epic P — players as accounts

> **Superseded for order and detail (2026-10-17):** `directives/players_build_plan.md` (P1b, P2a, P2b, P3, P9, P4 to P8, P10), written from `reports/x_players_review.md` (28 findings, the 35-case leak suite). Johnny answered its questions 18:40 (`decisions.md`). The steps below are the original outline.

### Why
D&D Beyond's engagement is players owning a character inside a campaign; Obsidian Portal's is
players writing the log. Traveller.voyage has one user per campaign. A player gets a downloaded
Player Pack (`apps/web/src/pack/`) and a character shared by link (`apps/web/src/characters/`).
Nothing a player does comes back, and nothing they see is live.

### What exists (facts, 2026-10-17)
- **One owner per universe.** `ownedUniverse` in `apps/api/src/universe/forward.ts` selects
  `owner_id = actor.id`; not owned is 404. No members, shares or invites table for universes
  exists in any migration (0000 to 0020). `data_model.md` §2 names an unbuilt `player_publishes`.
- **The Durable Object trusts the Worker.** `UniverseDO.ts` has no user or role logic. `GET
  /campaign` (`universe/campaign.ts`, `readCampaign`) returns every row, every visibility,
  tombstones included. The DO never reads `x-voyage-user-id`; only `CharacterRoom.ts` does.
- **Visibility is stored and not enforced server-side.** Records and links: `referee | players`;
  journal entries: `referee | players | public` (`packages/shared/src/schemas/campaign.ts`).
  Journal `author` is `referee | players` but the web app always writes `referee`
  (`apps/web/src/campaign/journal.ts`).
- **The only per-user grant model is characters:** D1 `character_access (character_id, user_id,
  role owner|editor)` and `character_invites` (32-byte token, SHA-256 stored, 14-day expiry,
  single use), `POST /api/characters/claim` rate-limited 3 per 10 s, the `/claim/:token` page
  (`apps/web/src/characters/screens/ClaimPage.vue`), and the live room (`CharacterRoom` DO).
  This is the model to copy.
- **The leak gate already exists in the browser.** `apps/web/src/pack/plan.ts` includes a row only
  when `visibility === 'players'`, keeps a link only when both ends are players records, redacts
  `[[cr_…]]` mentions to "a record", and counts what it withheld. `tests/web/player_pack.test.js`
  is the leak test. The public projection `packages/shared/src/public_hex.ts` is the server-side
  precedent for a pure projection function.
- **Images are owner-only:** `GET /:id/objects/:hash` (`routes/objects.ts`).
- **A person record attaches a live character** as `sheet: { schema, characterId }`
  (`workspace/person_character.ts`); the sheet loads through the viewer's own character grant.
- **Reads are incremental:** `GET /campaign?after=<seq>&limit` already exists for the owner.
- **Limits that matter:** 120 non-GET DO calls per minute per universe (`universe/budget.ts`);
  10 universes per account; 250 MB of objects per universe.

### Decisions *(decided here; Johnny may overrule)*
1. **Membership copies characters.** Two D1 tables: `universe_members (universe_id, user_id,
   role, person_id NULL, created_at)` and `universe_invites (id, universe_id, token_hash, role,
   expires_at, revoked_at, uses, max_uses, created_at)`. The owner stays `universes.owner_id`;
   `role` holds only `'player'` for now. A co-referee is a later role value, not a new table.
2. **One reusable invite link per campaign,** `/join/<token>`, 30 days, at most 12 members
   ("A campaign can have 12 players."). The referee can revoke it and make a new one, and can
   remove a member. Characters' single-use link stays as it is.
3. **Players read a projection, never the rows.** One pure function
   `packages/shared/src/players_view.ts` turns a full campaign read into what players see. The
   server applies it for members; the Player Pack switches to the same function so the file and
   the live view cannot disagree. Rules: a record is in when `visibility === 'players'`; a link
   when both ends are in; a journal entry when `players` or `public`; mentions of hidden records
   read "a record"; the party, clock and settings are in; `provenance`, `rev` and tombstones are
   out. The pack's leak test moves to this function.
4. **Players write one thing:** journal entries of kind `note`, `visibility: 'players'`,
   `author: 'players'`, and may edit or delete their own. The DO's `campaign_journal` gains
   `author_id` (user id) so "their own" is enforced on the server. Everything else is read-only
   for a player. The referee's "Player notes" field on a record is renamed in the UI to **"For
   players"** (it is referee-written text players see); the stored key `playerNotes` does not
   change.
5. **A member may be one person record** (`person_id`): "Which one is you?" at join time, from
   the party's members, changeable later by the referee or the player. It drives "Where am I"
   and the player's ship. A character sheet stays reachable only through `character_access`.
6. **Images:** a member may read an object hash that appears in the players projection. The
   server computes the allowed set from the projection on request (cache per isolate for a
   minute by universe seq). Nothing else opens.
7. **Freshness:** both roles poll `GET /campaign?after=` every 30 s while the panel is open and
   the tab is visible. Realtime over a DO WebSocket (as `CharacterRoom`) is P12, later.
8. **Defaults do not change:** a new record is `referee`. The referee gets a "View as players"
   switch that runs the same projection in the browser, so leaks are seen before they happen.
9. **Players never see the Builder**, never export, never publish, and are not counted toward
   the owner's 10 universes. A player's "Playing in" list is separate from "Your campaigns".

### Steps

**P0 — contract (B, contract first).** `directives/contracts/b_players.md`: the two tables,
the routes below, the projection's field list (from decision 3), the `author_id` column, error
codes (`not_a_member`, `invite_expired`, `invite_revoked`, `campaign_full`), rate limits (join 3
per 10 s per user, as claim), and the member read of objects. Check: the contract names every
route with method, auth level and envelope, in `api.md`'s style. Gate: none (paper).

**P1 — the projection (A).** New `packages/shared/src/players_view.ts`: `playersView(full:
CampaignRead): CampaignRead` plus `playersObjectHashes(view)`. Move the pack's filter and
redaction to it (`apps/web/src/pack/plan.ts` calls it; `pack/text.ts` keeps rendering). Tests:
`tests/shared/players_view.test.js` with the fixture from `tests/web/player_pack.test.js`; the
leak gate asserts no referee-only marker survives; a `public` entry is in; a link with one hidden
end is out; a hidden mention reads "a record". Gate: `npm test`, `check`, `typecheck`.
Shared file: `pack/plan.ts` is Lane D's area by the lanes table; name it in the prompt.

**P2 — membership on the server (B).** Migration `0021_universe_members.sql` (hand-written, as
0003 onward; keep `db/schema.ts` in step). `universe/forward.ts` gains `memberUniverse(c)`:
owner or member, returning `{ row, actor, role, forward }`. Routes in a new
`routes/players.ts` mounted on universes:
- `POST /:id/players/invite` (owner): makes or returns the live link; `DELETE` revokes.
- `GET /:id/players` (owner): members with username, person_id, joined.
- `DELETE /:id/players/:userId` (owner, or the member themselves to leave).
- `PATCH /:id/players/me` (member): `{ personId }`.
- `POST /api/join` `{ token }` (user): claim; 404 unknown, 400 with `details.reason`.
- `GET /api/me/playing` (user): universes where the caller is a member, with name and owner
  handle.
- `GET /:id/campaign` for a member: the DO read passed through `playersView` in the Worker (the DO
  stays role-free). `?after=` works the same.
- `PATCH /:id/campaign/changes` for a member: accept only journal creates, updates and deletes
  of kind `note` with `author: 'players'`, `visibility: 'players'`, and `author_id` equal to the
  caller on update and delete; anything else 403 `forbidden`. The DO campaign schema adds
  `author_id TEXT NULL` to `campaign_journal` (`installCampaignSchema`, additive).
- `GET /:id/objects/:hash` for a member: allowed when the hash is in
  `playersObjectHashes(playersView(read))`.
Worker tests in `tests/api/players.test.js` against `wrangler dev`: join, cap at 12, revoke,
member read hides a referee record, member note round-trips, member cannot patch a record,
member reads a players image and not a referee one. Gate: the worker suite, `typecheck`.

**P3 — the client store (A).** `apps/web/src/campaign/membership.ts` (new): `role` on the open
campaign (`owner | player`), `playing` list, `join(token)`, `invite` calls. The campaign store
(`workspace/campaigns.ts`, `campaign/store.ts`) opens a universe from "Playing in" through the
same read path; the change builders refuse everything but player notes when `role === 'player'`
(so the UI cannot even try). Tests with the fake transport pattern of `characters_client`.
Gate: `npm test`, `check`, `typecheck`, `build`.

**P4 — the join page (E).** `/join/:token` beside `/claim/:token`: the brand, "You're invited
to <campaign>", signed out → the sign-in card and return to the same URL (as `ClaimPage.vue`);
signed in → **Join**; then "Which one is you?" (the party's person records, or "Not yet"); then
`/?panel=campaign`. The four refusals in the claim page's words. Copy in Google style. Test as
`characters_screens` does (four states). Gate: all four, plus shots at 1600 and 390.

**P5 — the referee's players screens (D).** On the Party tab a **Players** section: the link
(Make, Copy, Revoke; the expiry), the members (username, their PC, Remove), the cap. In the
campaign panel header a **"View as players"** switch (runs `playersView` in the browser; a kicker
banner "You're seeing what players see"; every control hidden, as in P6). `AccountMenu.vue` gets
"Playing in" under "Your campaigns". Gate: all four, shots, `tests/web/players_referee.test.js`
(SSR: the section renders with and without a link).

**P6 — the player's campaign panel (D).** When `role === 'player'`: Records lists the projection
(no Add, no Publish, no type change, no visibility switch); the record page is read-only with
"For players" text shown as the record's body; Party is read-only with "Where are we" and
"Your ship"; Journal lists players and public entries with **Add a note**; Timeline as today.
No Build on the rail for a player (the rail's `lockedGuest` pattern, with the words "Build is the
referee's"). Gate: all four, shots at 1600 and 390 for every tab.

**P7 — player notes in the journal (E).** `workspace/journal/`: an entry by a player shows
"Written by <username>" (the server's `author_id` resolved to a handle in the read; B adds
`author_name` to the projection in P2 or a follow-up), a chip in the list, mentions work, images
off for players in this slice. The referee can delete any note (today's delete, with Restore).
Gate: all four, `journal_screen` test extended.

**P8 — the map and dossier for a player (A).** The party ships, marks and the campaign layer come
from the store and need nothing new; verify in a browser pass. The dossier's "In your campaign"
and "Your journal here" use the store's rows, so they already show the projection. The Builder's
right-click items and `Select hexes` are hidden for a player (`views/MapView.vue`: shared, name
the lines). Gate: all four, a signed-in pass with two accounts (the marketplace lane's two-account
jig in `findings/marketplace/` shows how).

**P9 — polling (A).** `campaign/read.ts`: a 30 s `after` poll while the panel is open and
`document.visibilityState === 'visible'`, through `platform/browser.ts`; stops on close; one
toast "Updated" never shows (changes just appear; lists do not jump: Graceful). Gate: all four,
a test that the timer stops when hidden.

**P10 — help and copy (E).** `HelpGuide.vue`: "Invite your players" and "What players see";
`changelog.ts` entry; the record page's "Player notes" label becomes "For players" everywhere
(`RecordPage.vue`, the pack's heading). Gate: `help` and `record_visibility` tests updated.

**P11 — the referee sees players' presence (D, after P9).** "3 players here" in the panel header
from the members list and their last read (B adds `last_seen_at` to members on each read; cheap
UPDATE, at most once a minute per member). Proposal-sized; issue only after P1 to P9 are live.

**P12 — realtime (B, later).** A `UniverseRoom`-style WebSocket like `CharacterRoom` that pushes
"seq changed"; the client then does the `after` read. Replaces P9's timer. Not before the above
is live and used.

### Questions for Johnny (all answered 2026-10-17)
1. ~~May players write journal notes?~~ **Yes.** Kind `note` only, visible to players, with
   their name on it (P4 to P7 as written).
2. ~~Is 12 players per campaign enough?~~ **Yes.**
3. ~~A second referee in this leg?~~ **No, not for now.** P0 reserves the role column for it.

---

## Epic L — the landing page and the first five minutes

### Why
A signed-out visitor lands on a bare map. No sentence says what this is. There is no screenshot,
no path to "start a campaign", no preview card when the link is pasted into Discord or X.
D&D Beyond's front page sells; Obsidian Portal's shows campaigns. The map must stay home
(manifesto §1 rule 1), so the landing is a window over the live map, not a second site.

### What exists (facts)
- `apps/web/index.html` has `<title>Traveller.voyage</title>` and two favicons. **No meta
  description, no `og:` or `twitter:` tags.** No `robots.txt`, no `sitemap.xml`.
- `App.vue` always renders `MapView` at `/`. There is no signed-out branch and no landing copy
  anywhere (grep "Traveller.voyage", "welcome": only DesignView, the recovery file and the
  store's brand link).
- First visit: `workspace/first_visit.ts` opens Spinward Marches subsector C (Regina on a narrow
  window) and shows one hint, "Search for a world, or select a hex to read its system."
  (`FirstHint.vue`, mounted in `MapView.vue`), dismissed once per browser.
- The sign-in pitch lives in `workspace/account.ts` ("Keep a private campaign on top of this
  map…"), the fine print "Nothing you add changes the map, and nobody else sees it.", the card in
  `passkey/SignInBody.vue` with the version and What's new.
- `/help` is a window over the map (`HelpView.vue` + `HelpWindow.vue`), six sections, all about
  publishing. `/changes` is the same pattern for the changelog. **Bug seen 2026-10-17 in Chrome:
  `/help` on a cold load renders a blank page**; opened from the menu it works.
- The look has `.ui-brand`, `.ui-ground` (hex grid and stars), `.ui-modal`, `.ui-steps`
  (`design/base.css`); the wordmark is used on the claim page and the store.
- Production holds six example packages and twelve example games with eighteen public ships, so
  the landing can point at real things.
- After sign-up the browser goes to `/account` for recovery codes; then `greet()` (`MapView.vue`)
  opens the Campaign pane once per browser.

### Decisions *(decided here)*
1. **A welcome window, not a separate site.** Route `/welcome` renders `MapView` plus a window,
   as `/help` does. It opens by itself on a first visit when signed out (before the hint; the hint
   still shows after it is closed) and from the account pop-up ("About Traveller.voyage") at any
   time. `/` stays the map, so every existing link keeps working.
2. **Three panes that do the thing.** "Fly" (the charted universe: 512 sectors; a button that
   flies to Regina and opens its dossier), "Run" (a campaign on the map: records, ships, the
   clock; a button that opens an example public ship's card), "Share" (packages; a button to the
   store). Each pane has one real screenshot. Primary action "Create an account" opens the
   sign-in card with the default pitch; secondary "Just explore" closes the window.
3. **One sentence of positioning, written for a referee:** what it is, that the universe is the
   official chart, that a campaign sits on it, that it is free. Google developer style. The
   orchestrator writes the sentence from this and Johnny edits it; nobody invents a slogan.
4. **Social previews are server-side.** The Worker serves `index.html`; a small middleware
   rewrites `<title>`, `description`, `og:title`, `og:description`, `og:image` for `/`,
   `/s/:sector`, `/s/:sector/:hex` (the world's name, UWP and sector, from the truth index) and
   `/packages/:id` (the package's title, author and cover). Everything else gets the default
   tags. A static `og.png` (1200×630) is the default image.
5. **A first-run card for a new account**, in the Campaign panel's empty state: three steps with
   buttons, 1 "Find your ship's world" (Locate), 2 "Add your ship" (New vessel, placed there),
   3 "Set the campaign date". Each step ticks when done; the card leaves when all three are. It
   replaces the "No party yet" card's role for a brand-new campaign and keeps that card for a
   campaign with records and no party.
6. **An About footer with fair use and credits** on the welcome window: TravellerMap's data terms,
   Far Future Enterprises' fair use policy, Mongoose Publishing, the geomorph credit already in
   the deck plan, the version and the changelog link. **The legal words are Johnny's**; until he
   supplies them the footer shows credits and version only, never invented legal text.

### Steps

**L1 — meta, robots, sitemap (A, small).** `index.html`: description, `og:*`, `twitter:card`,
`theme-color` from `--bg-0`. `apps/web/public/robots.txt` (allow all; disallow `/api/`,
`/account`, `/claim/`, `/join/`) and `sitemap.xml` (`/`, `/packages`, `/help`, `/welcome`). The
og image is L3's; link it now at `/og.png`. Test: a `tests/web/meta.test.js` reads `index.html`
and asserts each tag. Gate: `npm test`, `build`.

**L2 — the welcome window (D, copy by E).** `views/WelcomeView.vue` (route `/welcome`, the
`HelpView` pattern), `workspace/WelcomeWindow.vue` with the three panes, the two actions, the
About footer (credits and version). `first_visit.ts`: `welcomeShown` keyed by a new storage key;
opens once when signed out and never for a signed-in user. The account pop-up gets "About
Traveller.voyage". Test: SSR render of the window (as `help.test.js`), the first-visit logic
(`first_run_fixes` pattern). Gate: all four, shots at 1600 and 390. **Fix the `/help` cold-load
blank in the same step**, since `WelcomeView` copies its pattern: reproduce with a cold Chrome
tab, find why `HelpWindow` does not mount, fix in `HelpView.vue` or `HelpWindow.vue`, and add a
cold-load route test for `/help`, `/changes` and `/welcome` (manifesto Connected: every route has
a cold-load test).

**L3 — pictures (D).** Three screenshots at 1600 (the chart at the names tier over Spinward
Marches, the orbit view of Regina with the time drawer open, a package page) and `og.png`
(1200×630, the chart with the wordmark), captured from production with no account chrome, WebP
under 200 kB each, under `apps/web/public/landing/`. No AI art, no package covers (Johnny,
2026-10-14: covers never in promo). Shots go in the report for Johnny to pass.

**L4 — the first-run card (D).** `workspace/FirstRun.vue` in the Campaign panel's Records empty
state when the campaign has no records: the three steps of decision 5, each a button that runs
the existing command (`locate-system`, New vessel at the located hex, the date chip's editor), a
tick when the state shows it done. Test: SSR with none, one and three done. Gate: all four, shots.

**L5 — social previews from the Worker (B).** `apps/api/src/preview_tags.ts`: for the four route
shapes of decision 4, read the truth index (sector `index.json` from the public bucket, cached)
or the package row, and rewrite the tags in the served `index.html`. Only when the `Accept`
header prefers HTML; bytes otherwise untouched. Test in `tests/api/preview_tags.test.js`: `/s/
Spinward_Marches/1910` carries "Regina", a package id carries its title, an unknown route the
default. Gate: the worker suite, `typecheck`. Needs: nothing from Johnny.

**L6 — the About words (E, then Johnny).** Draft the fair use and credits paragraph in
`findings/landing_about_draft.md` from what the repo already states (manifesto §4 "same terms
TravellerMap operates under", the geomorph credit in `deckplan/`), with every legal sentence
marked "Johnny to confirm". Nothing ships until he answers.

**L7 — help: "Start here" (E).** `HelpGuide.vue` gets a first section for a new referee (find a
world, add a ship, set the date, invite players once Epic P is live) and the window links to
`/welcome`. Gate: `help` test updated.

**L8 — a demo campaign without an account (B, A; after P1).** One example universe marked
`demo = 1`; `GET /api/demo/campaign` serves its players projection to anyone (60 per minute by
IP, as the public feed). The welcome window's "Run" pane opens the real campaign panel on it,
read-only, with a banner "This is an example. Create an account to start your own." Cheapest
possible "try it": zero sign-up. Issue after P1 and P2 exist.

### Questions for Johnny
1. The positioning sentence: the orchestrator drafts one; do you want to write it yourself
   instead? Recommended: let the draft come, then edit.
2. The fair use and credits text (L6): will you supply the words, and is there a line you want
   on every page (footer) or only on the welcome window? Recommended: welcome window only.

---

## Epic T — trade

### Why
The Traveller session loop is speculative trade, freight and passengers, patrons and ship
costs. D&D Beyond's encounter builder is the fantasy equivalent. Traveller Nexus (Demiplane,
2026-03-31) has the rules but no universe; the ship on this map already knows where it is, when
it is, and what the world's trade codes and WTN are. Trade on this map is the feature nobody
else can build.

### What exists (facts)
- **No trade tables in `rules/`.** Missing: the trade goods table (goods, base price,
  availability, tons dice, purchase and sale DMs), the broker and sale procedure, finding a
  supplier, passenger and freight tables, the Trade Routes Table, the Importance and Economic
  extension tables. `guideline_4_1` and `guideline_4_4` name them as data references and hold
  prose only. `findings/rules_drafts/` holds no trade draft.
- **Present:** trade code definitions as data (`rules/mgt2e_data.js` `tradeCodes`, lines 144 to
  163; also CT and T5), the GWP multipliers and WTN starport modifiers
  (`mgt2e_data.js` 891 to 907, which the engine duplicates inline), fuel prices
  (`rules/mgt2e_space_travel.json` `fuel.refinedCrPerTon`, `unrefinedCrPerTon`,
  `refuelHours`), which `campaign/travel.ts` does not read yet.
- **The legacy Trade Match** (`js/trade_match.js`) reads no rules file: `RANGE = 12` hexes and
  two hard-coded pairs (Ag↔Na, In↔Ni), its header admitting the Trade Routes Table is absent. It
  lists partner worlds and draws locator lines; it prices nothing. Not ported.
- **Ship sheet fields that exist** (`rules/mgt2e_ship_sheet_fields.json`): "Cargo Capacity",
  "Cargo Type/Tons/Notes 1–16", "Passenger Capactiy" (sic, the PDF's spelling), "Passenger
  Name/Passage/Notes 1–16", "Fuel Capacity", and the costs "Purchase, Mortgage, Maintenance, Fuel
  Tank, Life Support, Salary, Running Cost". Values are stored on `record.sheet` keyed by field
  name (`workspace/sheet_fields.ts`). No credits field on the ship sheet; the character sheet has
  "Cash on Hand" and "Broker Modifier".
- **Plan shapes, never built:** `campaign_manager_plan.md` §5.3 `status.cargo [{label, tons,
  value, origin, destination, note}]`, `status.passengers`, `status.ledger [{when, amount, memo,
  kind}]`. `RecordStatus` is a passthrough object holding only `track` today
  (`packages/shared/src/schemas/campaign.ts`).
- **Johnny's standing decisions:** "costs and cargo are typed" (board, Decisions); Q5 recurring
  costs typed by the referee; Q7 cargo rows free text until the goods table exists; dice show and
  interpret nothing until a rule says what a roll means.
- **Precedent for rules in the browser:** `campaign/travel.ts` reads the generated
  `mgt2e_space_travel.js` in the web app; engines stay on the platform. A trade module follows
  travel, not the engines.
- The vessel's position in time comes from `campaign/track.ts` (`positionAt`); the world under a
  ship, its UWP, trade codes and WTN come from the dossier model (`dossier/model.ts`,
  `socioBlock`).

### Decisions *(decided here)*
1. **Order:** what needs no rule ships first (T1 manifest and ledger, T2 fuel and running
   costs, T3 passengers, T4a markets nearby by data); the procedure (T5 onward) waits on one
   rules file from Johnny, `rules/mgt2e_trade.json`, whose shape is proposed below for him to fill
   from the book. No number in it comes from anyone but him.
2. **One source for cargo and passengers.** `status.cargo` and `status.passengers` on the vessel
   are the data; the ship sheet's sixteen Cargo rows and sixteen Passenger rows become a view of
   them (first sixteen, the rest "and N more"). Editing a sheet row edits the status row. This
   changes what those sheet boxes do, so it is proposed, not assumed (question 1).
3. **A ledger per vessel,** `status.ledger`, typed lines and posted lines (buy, sell, refuel,
   fare, freight, a recurring cost) with a running balance in Cr. **A ledger per character**
   (Johnny, 2026-10-17: player credits as a checkbook register, T1b); money moves between the
   two as paired lines.
4. **Money is formatted by one function** (`campaign/money.ts`): `Cr1,234`, `MCr1.2`, tabular.
5. **Trade logic is a pure browser module,** `campaign/trade.ts`, reading the generated rules
   file, tested with fixtures; the dice come from `dice/roll.ts`; the interpretation comes from
   the rules file, which is allowed once it exists.

### Steps

**T1 — the manifest and the ledger (A for the shape, D for the screen).**
A: `packages/shared/src/schemas/campaign.ts` `RecordStatus` gains `cargo`, `passengers`, `ledger`
(additive, optional; passthrough stays), `campaign/cargo.ts` (pure: add, remove, tons used,
capacity from the sheet's "Cargo Capacity"), `campaign/ledger.ts` (pure: post, balance, by
period), `campaign/money.ts`. D: on the vessel record a **Cargo** section (rows, "32 of 82 t"
gauge, Add a lot: label, tons, paid, where, when from the clock) and a **Ledger** section (lines,
balance, Add a line: amount, memo, kind, date). Server: none (status rides the record save).
Test: pure modules; SSR of the sections. Gate: all four, shots. Question 1 decides the sheet
mirror; until answered the sheet rows stay as they are.

**T1c — the ship's owners, shares, payments, fuel and upkeep (A for the shape, D for the screen).**
Johnny, 2026-10-17 19:20: "additional ship metrics like who owns the ship / ship shares / what's the ship payment
when is it due / how much fuel is and how much is upkeep on top of ship mortgage, we might have some of this already".
*Already there:* the sheet's seven cost boxes (Purchase, Mortgage, Maintenance, Fuel Tank, Life Support, Salary,
Running), `campaign/refuel.ts` (AT2: refuel cost from `rules/mgt2e_space_travel.json`, the boxes as recurring ledger
lines), D's Refuel and "Post this month" (DT2), the character sheet's "Ship Shares" and "Ship Payments" boxes (T1b).
*Missing, built here, every value typed by the referee (no rule computes anything):*
- **Owners:** `status.owners`: a list of `{ holder: record anchor (person or organization) | 'party', shares }`;
  the total and each holder's share of it; a holder may be a players-visible person (their own share shows to them
  under Epic P).
- **Payment:** `status.payment`: `{ amountCr, everyDays, nextDueDay, payee? }` on the campaign calendar; "due in 5
  days", "overdue by 3 days" from the campaign clock; paying posts a ledger line and moves `nextDueDay` on by
  `everyDays`. Defaults come from the Mortgage Cost box when typed; no period is assumed.
- **Fuel aboard:** `status.fuelTons` (today AT2 asks for it each time): shown against the sheet's Fuel Capacity
  ("31 of 40 t"); Refuel fills it; a jump leg does not spend it (no rule here; the referee types).
- **Upkeep:** one monthly figure summing the recurring boxes (Mortgage, Maintenance, Life Support, Salary, Running)
  beside the payment, with each part listed.
*Later, needs Johnny's source text:* computing the payment or maintenance from the purchase price, or a share's
value, is a rule; until a rules file holds it, nothing is computed.

**T1b — player credits: the checkbook ledger (B contract first, A logic, D screen).**
Johnny, 2026-10-17: "I want to add player credits and it's like a checkbook ledger UI where the
player can see deposits and withdrawals, I love the idea of a Sci-Fi credit ledger."
*Facts:* the character sheet has a Finances section of eight boxes ("Cash on Hand", "Ship
Shares", "Debt", "Income", "Annual Pension", "Monthly Cash Flow", "Living Cost", "Ship
Payments"); a character's fields live in the `CharacterRoom` DO as single boxes with per-box
last-write-wins; a player edits their own character through `character_access`; the referee
writes campaign records only. *Decided here:*
- **The ledger lives on the Character, not on the campaign record,** so the player owns it, it
  follows the character between campaigns, and the live room's presence shows who is writing.
  It is a new append-only table in the character DO, `ledger (id, seq, when_day, when_real,
  memo, amount, kind, by_user, link_id NULL, void_of NULL)`, never a JSON box. A mistake is
  undone by a reversing line (`void_of`), which keeps the register honest and fits "CRUD over
  undo". Kinds: `pay`, `purchase`, `fare`, `share`, `transfer`, `adjustment`.
- **"Cash on Hand" becomes the balance** (Johnny, 2026-10-17: yes), the other seven boxes stay
  typed. **Each character chooses Simple or Detailed credit handling** (Johnny, same day: "the
  user can decide if they want the simple or the detailed version"). One data model serves
  both: in **Simple**, the Cash on Hand box is typed as today and every edit posts one
  `adjustment` line ("Set to Cr12,400") behind the scenes, so nothing is lost; in **Detailed**,
  the box is read-only and shows the running balance, and the register is open under it.
  The switch is a `ui-seg` on the Finances section, stored on the character
  (`meta.credits: 'simple' | 'detailed'`), and may be flipped at any time in either direction.
  *Decided here:* a new character starts in Simple; a character that already has lines other
  than adjustments opens in Detailed.
- **Transfers are paired lines:** the ship's ledger (T1) and a character's ledger post one line
  each with the same `link_id`: "Pay the crew" from the ship to each crew member, "Chip in" from
  a character to the ship. One pure module, `campaign/ledger.ts`, serves both ledgers.
- **Access (Johnny, 2026-10-17: yes):** anyone with access to the character (owner, editors)
  may post. Attaching a character to a campaign person record offers the player "Let the
  referee edit this sheet", off by default, which grants the campaign owner editor access;
  without it the referee's "Pay the crew" leaves the character's line **pending** for the
  player to accept (a `pending` flag, shown in amber; pending lines do not count in the
  balance).
- **The look, from `design_reference.md`:** the balance as an instrument readout in
  `--font-display`, tabular, "Cr" prefix, the scanner-sweep reveal on first open; a register
  table with hairline rows: Date (`DDD-YYYY`), Memo, Withdrawal, Deposit, Balance (running);
  withdrawals in `--text-1`, deposits in `--signal`, a negative balance in `--attention`; the
  new-line row folds in at the top (amount, memo, kind chips, the date from the campaign clock);
  on a phone the memo sits over the amounts. A `.ui-ledger` block in `base.css` and a `/design`
  section, so the ship's ledger and the character's are one look.
B: `contracts/b_character_ledger.md` (table, `GET /api/characters/:id/ledger?after=`, `POST`
a line, `POST .../void`, the pending accept, live-room event "ledger changed"). A:
`campaign/ledger.ts` (pure: post, balance, period totals, pair), `characters/ledger.ts` (the
client store on the live seam, `characters/transport.ts`). D: `workspace/LedgerBlock.vue` used
by `CharacterSheet.vue` (the Finances section) and the vessel's Ledger section from T1; the Party
tab gets a **Finances** card: each PC's balance, each ship's, the total. E: the words, and a
"Credits" section in help. Tests: the pure module (balances, voids, pairs), the store against
the fake transport, SSR of the block, the contrast test on the new colours. Gate: all four, the
character worker suite, shots at 1600 and 390. Export: a CSV of the register from the block.
Size L; the ship's ledger from T1 should land first so the module is shared, not copied.

**T2 — fuel and running costs (A).** `campaign/travel.ts` reads `fuel` from the rules file;
"Refuel" on the vessel at a world with a starport: refined or unrefined at the file's Cr per
ton, tons from "Fuel Capacity" minus a typed current level (no gauge rule exists; the level is
typed), posts a ledger line. The sheet's seven cost fields get a "Post this month" button that
writes a recurring line (Q5: typed, never derived). Test: the Cr sum for a full tank from the
file's numbers. Gate: all four.

**T3 — passengers with fares (D).** The `passenger` links that exist get `passage` (a word from
the ship sheet's own "Passage" field, free text until the rules file names the classes) and a
typed fare that posts to the ledger on "Board". Gate: all four, `workspace_sheet_people` test.

**T3b — roll a random passenger (A logic, D screen; rules file from Johnny).**
Johnny supplied the "Random Passenger" D66 table on 2026-10-17 and wants it implemented and
"easy to edit for later tweaks". It is typed in verbatim at
`findings/rules_drafts/mgt2e_random_passenger.json` (one entry per line; `text` is the printed
wording and is what the app shows; `sub` and `skills` only restate what the printed brackets
say so a roller can resolve them). **It moves to `rules/mgt2e_random_passenger.json` on his
word** (one copy; `npm run rules:gen` wraps `.json` files already), and the book and page go in
`source`. Nothing is built from the draft; the lane reads the generated wrapper under
`packages/engines/src/generated/rules/`.
- A: `campaign/passengers.ts` (pure): `rollPassenger(face)` reads the file, rolls the D66 (two
  six-sided dice read as tens and units, which is what the table's heading means; if the lane
  thinks that reading needs a citation, it stops and asks), resolves `sub` with its own die,
  rolls each `skills` entry's dice (`1D-1` read as one die minus one, as printed) and returns
  `{ roll, text, subText?, skills?: [{ name, level }], dice: [...] }`. A test proves every roll
  from 11 to 66 is reachable and the file holds each once (so an edit that drops a row fails a
  test, not a session). Edits to the table never need code: the module reads the entries and
  nothing else.
- D: on the vessel's **Passengers** section (and the sheet's Passenger rows, T3) a **Roll a
  passenger** button: the dice are shown with the result ("34 · Causes Trouble · 5: Violent"),
  then **Keep** makes a person record (kind `passenger`, name "Passenger" selected for typing,
  summary the printed text with the sub-result and the rolled skills as "Mechanic 2, Engineer
  0"), linked `passenger` to the ship with the fare field from T3 blank; **Roll again** rerolls.
  Nothing is interpreted beyond the file's words. Gate: all four, shots; the pure test above.
Size S once the file is in `rules/`.

**T3c — your own tables (later; B, A, D).** "Easy to edit for later tweaks" also means a
referee's own version: a campaign may copy a rules table (this one first) into its own
`tables` list and edit rows in place; the roller uses the campaign's copy when one exists.
The rules file stays the published default. Needs: server (a `campaign_tables` row kind in
the DO, additive). Issue after T3b is live.
**Widened 2026-10-17 18:40 (Johnny):** whole trade table sets the referee loads or makes, and picks per campaign, "just in case Mongoose changes their mind"; design in Z's ZT1.

**T4a — markets nearby, by data (A, then D).** `campaign/markets.ts`: worlds within N parsecs of
the ship's world (`map/geometry.ts` `parsecsBetween`), with starport, trade codes, WTN and
population from the truth, sorted by distance; the referee picks N (2, 4, 6). D: a **Markets**
section on the vessel and in the dossier, each row a link, hover card, locator line (the
signature). No pairing, no price: that is T4b. Gate: all four.

**T4b — complementary markets (after the rules file).** Trade code pairs and the Trade Routes
Table from `rules/mgt2e_trade.json`; the legacy Ag↔Na and In↔Ni pairs are **not** used without
the file (no citation). Highlights partner rows in T4a's list in amber.

**T5 — the trade procedure (after the rules file; A logic, D screen).** "Trade here" on the
vessel at its current world: find a supplier (the roll and DMs from the file), the goods on offer
(availability by the world's trade codes), quantity and price (the file's dice and DMs; the
character's Broker skill typed by the referee), **Buy** → cargo lot with origin and paid price →
ledger; at a later world **Sell** a lot → the sale roll → ledger, and the lot leaves. Every roll
is shown with its DMs named ("Ag +2, Broker 1"), from the file, never from code. Gate: fixtures
for every table in the file, one worked example from the book that Johnny confirms.

**T6 — freight and passengers generated (after the file).** Lots and passengers available at
this world for a destination within jump range, from the file's tables, with the ship's capacity
from the sheet; accept → cargo and passenger rows, fares on arrival. Gate: as T5.

**T7 — the trade log (E, after T5).** Each buy or sell may write one journal line (kind `note`,
mentions the world and the ship) when the referee ticks "Log it". Players epic: it is visible
to players if the entry is.

### The rules file Johnny fills: `rules/mgt2e_trade.json` (proposed shape, no values)
The shape is a proposal for him to correct against the Core Rulebook; implementers build only
what the file contains. Suggested top-level keys: `source` (book and page), `goods` (one entry
per row of the trade goods table: name, tons dice, base price, availability codes, purchase DMs
by trade code, sale DMs by trade code), `supplier` (the finding-a-supplier procedure: skill,
DMs, time), `purchase` and `sale` (the price modification table: roll result to percentage),
`broker` (what a broker adds and costs), `passengers` (classes, fares by parsec, the availability
roll and DMs), `freight` (lot sizes, rates by parsec, availability), `mail` if he wants it, and
`tradeRoutes` for T4b (the table `guideline_4_4` names). He may rename anything; the module is
written to the file, not to this list. The draft goes in `findings/rules_drafts/mgt2e_trade.json`
first, as the climate bands and space travel did, and moves into `rules/` only on his word.

### Questions for Johnny
1. May the ship sheet's Cargo and Passenger rows become a view of the vessel's manifest (editing
   either edits the same data), or must the sheet boxes stay plain typed fields? Recommended: a
   view; one source means the gauge, the ledger and the sheet always agree.
2. Will you supply `rules/mgt2e_trade.json` from the Core Rulebook in the shape above (or your
   own)? Everything from T4b on waits for it; T1 to T4a start now.
3. ~~The party's cash~~ **Answered by Johnny 2026-10-17:** each player has a credit ledger of
   their own (T1b); the ship keeps its own (T1); transfers are paired lines. **"Cash on Hand"
   becomes the balance**, and each character chooses Simple (type the balance) or Detailed
   (the register) credit handling. Both are built on T1b's one model.
4. ~~Referee access at attach time~~ **Answered by Johnny 2026-10-17: yes.** Offered when the
   player attaches the character, off by default; without it the referee's line waits for the
   player to accept.
