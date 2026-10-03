# Required features — Agent M, 2026-10-03

The question: what does Traveller.voyage need to be the place a table runs its Traveller
campaign, the way D&D Beyond is for D&D? Measured against `plan.md`, `data_model.md`,
`api.md`, `feature_inventory.md` and `campaign_manager_plan.md`.

Rules posture: this file names features. It states no Traveller rule, table or number. Where
a feature needs rules data, it says so and stops.

---

## 1. Where the plan stands against the goal

The plan describes itself as "TravellerMap plus a dose of D&D Beyond". Today the dose is
small. What D&D Beyond actually is, piece by piece:

| D&D Beyond pillar | Traveller equivalent | In the plan? |
|---|---|---|
| Account, my characters, my campaigns | account, my travellers, my campaigns | Accounts yes. Characters are records inside a referee's universe. No campaign entity. |
| A campaign with a DM and invited players | referee plus players at one table | **No.** One owner per universe; player accounts "after slice 5". |
| Character sheet that knows the rules | traveller sheet | Schema-driven sheet designed; rules data not supplied. |
| Compendium of rules content | careers, equipment, ships, trade goods | **No**, and it is a licence question. |
| Encounter and combat tools | ship and personal combat aids | No (and correctly not invented). |
| Dice with a shared log | 2D roller the table sees | Roller designed, local only. |
| Homebrew, shared | packages and catalogue | Yes, slice 4. A strength. |
| Maps | the chart, systems, orbits | Yes, and far beyond anything D&D Beyond has. |

So the map half is stronger than the model, and the table half is mostly unbuilt and partly
unplanned. That is the gap this file is about.

What Traveller needs that D&D does not, and the plan already sees: a ship as a shared
character (status, crew, cargo, ledger), a clock that drives everything (jump takes a week),
and geography that matters (where are we, what is within reach). These are the product's
edge. `campaign_manager_plan.md` §5 and §7 are good on all three.

---

## 2. The biggest gap: there are no players

**What exists.** `plan.md` slice 3 lists "player accounts" under Out. Slice 4 gives players a
static published site behind a link. Player accounts and journals are in "After 5 (not
planned in detail)". `universes.owner_id` is the only relationship between a person and a
universe. Every universe route is `owner`.

**Why this is the gap.** A referee tool with a published read-only view is a wiki. The thing
people pay D&D Beyond for is that the player opens their own sheet on their own phone, the
referee sees it change, and the party's shared state is in one place. Everything in the
campaign plan that delights (the connections boxes, the ship ledger, the jump button, player
notes) is worth five times more when the players are in it.

**What it requires, concretely:**

1. **A campaign is its own row.** D1: `campaigns (id, universe_id, owner_id, name, …)`,
   `campaign_members (campaign_id, user_id, role: referee | player, joined_at)`,
   `campaign_invites (token, campaign_id, role, expires_at, used_by)`. Decision D5: whether one
   universe may hold several campaigns (two tables playing in the same Marches). If yes,
   every `campaign_*` row in the Durable Object needs a `campaign_id` now; adding it after
   data exists is a migration per universe.
2. **A third auth level.** `api.md` has `owner`. It needs `member(campaignId, role)`. The
   Durable Object must know who is asking, not only that the owner check passed.
3. **Visibility enforced on the server, per request.** The fog-of-war design is already
   fail-closed (`fog_of_war_field_tags.md`, `export_core.js:566-611`), and the campaign plan's
   own §13 says it "must run in the Worker so a player's browser never receives referee
   data". Do that as a live filtered read, not as a static publish. It also removes the
   revocation problem (Technical T15).
4. **Player-owned writes.** A player edits their own sheet, their own notes, and shared
   things the referee opens to them (ship cargo, ledger). That is a per-record permission:
   `owner_user_id` and an `editable_by` level on `campaign_records`. The plan has
   `visibility` (who may read) and nothing for who may write.
5. **Travellers that belong to the person.** On D&D Beyond a character lives in "My
   Characters" and joins a campaign. In the plan a character is a `person` record in the
   referee's database and dies with it. Either a traveller is a user-owned document that a
   campaign links to, or leaving a campaign exports it. Decide before sheets are built.
6. **Live updates for members.** `GET /api/universes/:id/events` (SSE) is specified for the
   owner's other tabs. The same stream, filtered by visibility, is the shared dice log, the
   clock moving, and the ship's hull dropping on every phone at the table. The Durable
   Object per universe is already the right home for it.

---

## 3. Getting in the door

| Need | State | Note |
|---|---|---|
| Sign-in a tabletop group will actually use | X only | Discord is where tables organise; Google and e-mail link cover the rest. `auth/options.ts` already registers Discord and Google when secrets exist. This is credentials, not code. Decision D6. |
| Choose your handle | Auto-derived from the X display name | It becomes the permanent prefix of every sector you make (Technical T10). Needs a claim screen. |
| Privacy and terms pages | Not written | Required by the X e-mail scope (handoff §7) and by any public launch. |
| Delete my account, export my data | Not specified | Overlay export covers the universe; nothing covers the account. |
| Join a campaign from a link | Not specified | The single most important onboarding flow: referee pastes a link in Discord, player lands in the campaign. |
| First-run for a referee | Sample campaign exists as a fixture (G4) | Make "start from the sample at Regina" the empty state. |

---

## 4. The campaign plan needs to be rewritten for this platform

`directives/README.md` calls `campaign_manager_plan.md` "the source for slice 3". It was
drafted on 2026-10-02 for the legacy app, hours before the cloud direction was adopted.
Reading all 1,599 lines:

**Still right and worth carrying (about a third):**
§1 the ten feelings · §2 data model v2 (records, links, journal, anchors, tokens) · §4
workspace and linking interactions · §5 sheets, vessel status, the Jump button · §7.1-7.3
timeline · §7.4-7.5 seasons and temperatures · §8 journal · §10 the Halt & Challenge list ·
§14 taste questions.

**Superseded (about two thirds):**
§0 audit of `js/` · §3 IndexedDB persistence · §6 motion work in legacy files (the intent
survives in `design_reference.md`) · §7.6-7.8 shader and orrery recipes against
`planet_gl.js` line numbers (these are slice 1 work and belong in that recipe) · §9 Player
Pack as a ZIP with notes returned by file, justified by "no server exists" · §11 phases
naming legacy files · §12 non-goals ("no sync server", "no new app shell") · §13 the cloud
sketch (Pages, offline-first), which contradicts `plan.md` §2.

An implementer handed this file will build the wrong thing in good faith. **Before slice 3,
split it:** a short `campaign_model.md` holding the carried sections restated for D1, the
Durable Object and members, and leave the original marked legacy.

**Fields lost between the plan and `data_model.md` §3:**

| Plan §2 | `data_model.md` | Lost |
|---|---|---|
| Link: `kind, role, order, since, until, notes, visibility`, custom labels | `campaign_links (from_id, to_id, relation, note, …)` | `role`, `order`, `since`, `until`, `visibility`, custom labels. Hierarchy sort, dated memberships and player-visible links all depend on them. |
| Journal: `kind, title, when, realDate, sequence, author, visibility, anchor, mentions` | `campaign_journal (when_day, visibility, body, record_ids, …)` | `kind`, `title`, `sequence`, `author`, `anchor`, `realDate`. Sessions, handouts and rumours cannot be told apart. |
| `when: { year, day, seconds }`, display `DDD-YYYY HHHH` | `when_start INT` as `year * 365 + day` | The time of day. The agreed date format shows hours. |
| `settings`: party, kinds, calendar, `jumpHours` | not present | Needs a home (`meta`, or the campaign row). |
| Text tokens `[[hex:1-A-0101\|Regina]]` | — | Uses the legacy hex id. New identity is `Spinward_Marches/1910`. |
| Vessel `status`: position log, cargo, ledger, log | one JSON column on the record | Every ledger line rewrites the whole record at one `rev`. With players writing too, two people editing one ship always conflict. The position log and ledger want their own rows. |

No index on `campaign_links (from_id)` or `(to_id)`; every relationship lookup needs both.

---

## 5. Rules data and the licence question

**What `rules/` holds today:** world and stellar generation for five editions, the
methodology guidelines, and expectation tables. Nothing about people, ships, equipment or
trade goods (the campaign plan confirmed this by grep).

**What the table features need from Johnny** (from the plan's own §10, still open):

| # | Needed | Blocks |
|---|---|---|
| Q1 | Characteristic-to-modifier table; each skill's specialities; meaning of Rads, Wounds, Recovery | a traveller sheet that computes anything |
| Q2 | Ship vocabularies (sensors, software, weapons, drives); what a critical-hit pip means; hull points | a ship sheet beyond free text |
| Q5 | Which recurring ship costs are derived and which are entered | the ledger |
| Q6 | Task resolution conventions | a roller that says more than a number |
| Q7 | Trade goods table | cargo that knows what it is; any trade calculator |
| Q8, Q9 | Organisation kinds; visibility granularity | taste, not rules |

The plan's answer to missing data is right and should be kept exactly: sheets render from a
schema file, and degrade to free-form rather than invent.

**The licence question (decision D7, needs Johnny to verify, I am not asserting law):**
the manifesto rests on "the same fair-use terms TravellerMap operates under", and the
attribution text cites Far Future Enterprises' policy. That covers the setting and chart
data. Mongoose 2e rules content (careers, equipment lists, ship components, trade tables, the
sheet layouts transcribed in the campaign plan §5) is Mongoose's, with its own fan-use policy
and its own community-content programme. A compendium is the part of D&D Beyond that exists
because of a licence. Before any Mongoose table is hosted publicly, someone should read
Mongoose's current policy and write the answer into the manifesto next to the FFE line.

A design that is safe in the meantime: the platform ships schemas and empty vocabularies;
a referee's own entries live in their universe; nothing rule-shaped is in the public bucket.

---

## 6. Sequencing: the order serves the builder, not the table

Current order: Viewer → Builder → Campaign → Sharing → Merge → (players).

Slice 2 (Builder) is by far the largest slice: generation service, hex editor, system editor
with five adapters, four route generators, borders, regions, allegiances, filters, sector
layout, sync with conflict handling, history, snapshots, import and export. The plan itself
calls it "the product for the two hundred". Campaign value arrives after it, and players
after everything.

Most Traveller tables play in the charted universe and change little of it. A referee
running the Marches needs: an account, the chart, records pinned to worlds, a ship, a clock,
a journal, and their players. None of that needs a hex editor or a generation queue.

**Recommendation (decision D4):** insert a thin slice between Viewer and Builder.

**Slice 1.5 — Table.** A campaign on a truth-pinned universe with no hex edits.
- In: sign-in (Discord and Google added), campaign create, invite link, members with roles,
  records with links and anchors, party, the vessel with status and free-form sheet, the
  clock and Jump button, journal, server-side visibility, live updates to members, dice log.
- Out: any change to a hex, generation, routes, borders, packages.
- Needs from the platform: the universe row and Durable Object (exists as a shell), the
  campaign tables, the member auth level, SSE. A fraction of slice 2's surface.
- Done when: a referee creates a campaign at Regina, three players join from a link on their
  phones, the party jumps to Efate, the clock moves for everyone, and a player sees only what
  is marked for players.

This puts the D&D Beyond half in front of real tables months earlier, and every piece is
needed later anyway. The Builder then lands as "now you can change the map your campaign
sits on". Slice 5 (merge into canonical) is the furthest thing from the stated goal and can
wait without cost.

---

## 7. Feature list, by priority

**P0 — without these it is not a campaign platform**

| Feature | Plan today | Gap |
|---|---|---|
| Campaign entity, members, invite link | absent | §2 |
| Player sign-in beyond X | config only | §3 |
| Server-side referee/player visibility | static publish, slice 4 | §2 item 3 |
| Traveller sheet, player-editable | sheet designed, referee-only | ownership and write permission |
| Party ship: status, crew, cargo, ledger | designed (plan §5.3) | shared write; rows not one blob |
| Campaign clock and Jump | designed (plan §5.3a) | carry over as is |
| Records, links, anchors, locator | designed; partly lost in data model | §4 table |
| Journal: sessions, handouts | designed; fields lost | §4 table |
| Works on a phone | not addressed | one panel at three widths is designed for desktop; touch pan and pinch are not in the slice 1 input list |

**P1 — what makes it better than a wiki**

| Feature | Note |
|---|---|
| Jump planner for players | "Where can we reach, and is there fuel?" The route engine (`routes.js`, D3 and D4 in the inventory) and the starport and gas-giant data already answer it. Scheduled as a builder tool in slice 2; it is a player feature. |
| Trade lookup at the current world | `trade_match.js` (D11) exists. The plan wisely opens it from the cargo table instead of building a rule engine. |
| Timeline with the Now line | plan §7. Scrubbing time moving the ship is the signature moment. |
| Shared dice log | plan §5.5 plus the event stream. No interpretation until Q6. |
| Link previews | A link to Regina pasted in Discord should show its name, UWP and a picture. The SPA has no server rendering; the Worker can inject Open Graph tags for sector, hex and campaign-invite routes from D1. Cheap, and it is how the site spreads. |
| Org chart, relationship web | plan §4.3 |
| Print and PDF of sheets | plan §5.3b print stylesheet |
| Season and temperature lines | plan §7.4-7.5. Geometry over existing data; nothing invented. Keep the "?" tooltip. |

**P2 — the D&D Beyond long tail**

| Feature | Note |
|---|---|
| Homebrew catalogue | slice 4, already strong |
| Adventure and campaign-starter packages | a package of records, journal and handouts, not only hexes. The manifest's `records` block supports it; `lists` carries only routes and border paths. |
| Referee generators (patrons, encounters, NPCs) | every one needs rules data; Halt & Challenge, do not start |
| Character creation walk-through | the deepest rules dependency of all; last |
| Quotas, reports, image moderation | reports and takedown exist for packages only; players' uploads and published views need the same |
| Proposals into canonical | slice 5; furthest from the goal |

---

## 8. Things the plan gets right for this goal

- **Rules are data, and absent data degrades instead of inventing.** This is the only way a
  small team stays honest with a rules-heavy game.
- **Connections are links, not copies.** The sheet's Allies and Enemies boxes being views of
  the campaign graph is a better idea than anything on D&D Beyond.
- **One clock shared by the orrery and the campaign.** Time as an axis is what makes this
  Traveller and not a reskin.
- **The locator line and "the camera flies".** The map answering every panel is the feel.
- **Packages as diffs at fixed coordinates.** Homebrew that installs into a living campaign.
