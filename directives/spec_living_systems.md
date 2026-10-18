# Systems that feel alive: chatter and background traffic. The spec

**Status:** SPEC, written 2026-10-17 by the one-session review on `prompts/x_living_systems_spec.md`.
Ready for the orchestrator to turn into stream items once Johnny has answered the questions in
`reports/x_living_systems.md` section 6 (each is built to the recommended answer; a different
answer is named in the phase it changes). Read-only on code: nothing here is built.

**Why (Johnny, 2026-10-17 19:10):** two switches for referees so systems feel alive: about a
thousand short "chatter" lines (later, when it is cheap, from an LLM reacting to the system), and
other ship traffic in the system that is not real and not on the universal tracking.

**The rule that shapes everything.** Nothing here invents a Traveller rule. Every quantity is
either cited (a line of `assets/` or `rules/`) or named as a **presentation dial** in the dial table
(`reports/x_living_systems.md` section 3) with no rules meaning. Where a rule is needed and the
text does not give one, the question is in section 6 of the report and the build uses the
recommended answer as a dial until Johnny rules.

**What exists and is reused**, as the tree stood on 2026-10-17:
- `apps/web/src/orbit/ships.ts`: `ShipTrack`, `ShipMark`, `placeShips`, `shipAt`, `dockedBeside`;
  `ShipKind` already has `'traffic'` and `OrbitRenderer.paintDesignator` draws it in `theme.textMuted`
  (line 2417). The dev stand-in (`standInMarks`) shows how a looped jump pair is dated.
- `apps/web/src/campaign/track.ts` `positionAt`, `apps/web/src/orbit/ship_list.ts` `shipsHere`,
  `statusWords`, `jumpStanding` ("outside every 100D circle", ruled 2026-10-06).
- `apps/web/src/orbit/layout.ts`: `jumpAU` per body and star (`limitDiameters: 100` in
  `rules/mgt2e_space_travel.json`), `AU_KM`, the scene's bodies.
- `apps/web/src/map/traffic.ts` and `map/public_games.ts`: the **public traffic scope**, real
  tracks in `--chart-traffic` lime diamonds. Background traffic never enters it.
- `apps/web/src/dossier/model.ts`: `mainworldProfile`, `pickSystem`, `bodyKeys`, `basesValue`,
  `rowFor` (zone and trade code decoding); `orbit/highport.ts` `highportOf`.
- `apps/web/src/surface/vanilla/map.ts` exports `hashString` and `mulberry32`, the same functions as
  `packages/engines/src/core/rng.js` (the engines are not imported by the browser).
- `packages/shared/src/schemas/campaign.ts` `CampaignSettings` (party, kinds, calendar, rev) and
  `packages/shared/src/players_view.ts`, which passes settings to players minus `rev`.
- `apps/web/src/platform/browser.ts`: `prefersReducedMotion`, `storageGet`, `storageSet`,
  `observeLongTasks`.

---

## 1. Chatter

### 1.1 What it is
Short in-world lines (radio, news, talk) shown one at a time while a system is open, chosen from a
written set by the system's data, the campaign date and where the party is. Off by default. The
referee turns it on for the campaign; anyone can quiet it on their own device.

### 1.2 The line format
A zod schema in `packages/shared/src/schemas/chatter.ts` (new file), exactly the schema in
`findings/living_systems/check_sample.mjs` (`ChatterWhen`, `ChatterLine`), moved as it is:

```
ChatterLine = { id, category, voice, text, when: ChatterWhen, weight? }
ChatterWhen = { starport?, highport?, size?, atm?, hydro?, pop?, gov?, law?, tl?,
                tradeCodes?, notTradeCodes?, zone?, bases?, notBases?, gasGiants?, belts?,
                moons?, otherBodies?, xboat?, party?, day? }   // .strict(): an unknown key is refused
```

- Categories: `control` (traffic control and docking), `customs` (customs and law), `news`,
  `market` (prices in words, never numbers), `weather` (the world's sky), `advert`, `ship`
  (ship-to-ship and shipboard), `rumour`, `distress`.
- Slots in `text`: `{world}`, `{port}`, `{starport}`, `{ship}`, `{ship2}`, `{sector}`,
  `{subsector}`, `{date}`, `{gasGiant}`, `{belt}`, `{moon}`, `{body}`. A slot that needs a thing
  carries that thing in `when` (`{gasGiant}` needs `gasGiants.min >= 1`, `{port}` a `starport` list
  without X, and so on). The schema test refuses a line that does not.
- `findings/living_systems/chatter_schema.md` is the field-by-field reference: the source of each
  fact in the dossier model, and the `assets/` lines each condition family cites.

### 1.3 The facts a system knows: `SystemFacts`
`apps/web/src/living/facts.ts` (new) builds one plain object from what the app already loads:

| Fact | From the chart row (`SectorHex`) | From the tree, when loaded |
|---|---|---|
| `name`, `sector`, `subsector` | `entry.name`, the index's names | `state.name` |
| `starport`, `size`, `atm`, `hydro`, `pop`, `gov`, `law`, `tl` | `entry.uwp` decoded with `fromEHex` | `mainworldProfile(state)` digits |
| `tradeCodes`, `zone`, `bases` | `entry.tradeCodes`, `entry.zone`, `entry.bases` | the profile's, as `decodedRows` prefers |
| `gasGiants`, `belts` | the PBG string's last two digits | `state.gasGiantCount`, `state.beltCount` |
| `highport` | null (unknown) | `highportOf(mainworld)`: true, false, or null without a profile |
| `moons`, `otherBodies`, body names | 0 | `bodyKeys(system)` and the bodies' `name` |
| `xboat` | a way station base, or a route in `index.metadata.routes` touching the hex under the ripples spec's `xboatRouteRule` (its recommended value `bare`: no Allegiance, Type or Color, plus `Type="Xboat"`); question 4, one answer for both specs | same |
| `party` | `away` | `inSystem`, `docked` or `inJump` from the lead ship's `statusWords` |
| `day` | the campaign clock's day of the year, else the orbit view's shown date | same |

The chart row is enough for most lines, so the map and the dossier can speak before the tree
arrives; the tree adds highports, moons and body names.

### 1.4 Tone
In-world, one or two sentences, varied voices, no real-world brands, no published text, no polity or
species names, no rule or number stated as fact, nothing cruel. The sample is
`findings/living_systems/chatter_sample.json` (100 lines across every category, self-checked by
`check_sample.mjs`: every slot resolves, every condition is a known field, every system of each
starport class hears something). The full 1,000 is a Lane E item after Johnny approves the tone
(question 9); the split per category and per condition is in `chatter_schema.md`.

### 1.5 Selection
`apps/web/src/living/chatter.ts` (new), pure:
1. `eligible(line, facts)` as in `check_sample.mjs`.
2. `sequenceFor(hexKey, truthVersion, day, lines, facts)`: the eligible lines, each given a key
   `mulberry32(hashString(hexKey + '|' + truthVersion + '|' + day + '|' + line.id))()` divided by
   its `weight`, sorted ascending. That is a weighted shuffle, deterministic for the system and the
   campaign day, so two people opening the same system on the same day hear the same lines in the
   same order (`hashString`/`mulberry32` from `surface/vanilla/map.ts`, or copied into
   `packages/shared/src/seed.ts` so the Worker can reuse them later).
3. The visit keeps a cursor per `hexKey` in memory (a `Map`, cleared on navigation away from the
   system): the k-th line shown is `sequence[k]`, so no line repeats until every eligible line has
   been heard; then the cursor wraps.
4. Cadence (dials 10 and 11): the first line after 4 s, then one every 45 s, each shown for the
   whole interval; hovering the ticker pauses the clock. A day change in the campaign clock
   re-seeds the sequence but keeps the cursor.
5. `{ship}` and `{ship2}` are two names from the ship-name generator (3.3) seeded by
   `hexKey + day`, the same for the whole visit, so a line that names a ship can be followed by another
   about the same ship.

### 1.6 Where it shows
One component, `apps/web/src/living/Ticker.vue` (new), rendered in three places with the same
props (`facts`, `day`, `party`, `enabled`):
- **The orbit view:** a one-line strip docked at the stage's lower left, above the body chip row,
  the pattern of the legacy docked tooltip (`design_reference.md` section 3, Tooltip: "a one-line
  strip at the panel edge"); at most 60% of the stage's width, never over a control (the chips,
  the ship strip and the nav console keep their places; the strip hides under 390 px when the chip
  row wraps to two lines).
- **The dossier:** one line under the header's place line, before the UWP ribbon
  (`DossierOverview.vue`, one mount line).
- **The map at the system tier:** nothing is drawn on the chart (Johnny, 2026-10-14: "way way way
  too cluttered"); the dossier's line is the map's. Question 7.

The look: `--font-text` 12/16 in `--text-muted`, a small kicker from `voice` in the badge style
(`CONTROL`, `NEWS`), a radio icon, and a dismiss `×` that hides the ticker for the visit. A new line
fades in over `--t-base`; with reduced motion it swaps with no fade. Nothing scrolls, ever. The
strip has `role="status"` and `aria-live="polite"`.

The switch's words (Google style; `instructions_google_style.md`), in the campaign panel's
settings: **Show system chatter**, "Short radio and news lines while a system is open. Players see
them too." Per device, in the account menu: **Quiet on this device**, "Hides chatter and background
traffic on this device only."

---

## 2. Chatter later, from a cheap LLM (the hook only)

Not built now. Designed so that one system costs one call a day at most, and the written lines
are always the fallback.

- **What is sent:** the `SystemFacts` of 1.3 and nothing else: the chart row and the tree are
  public truth data already served to anyone, so nothing a player may not see is in the prompt.
  No campaign record, person, journal or ship name is sent. The party's state is sent as the one
  word of `facts.party`. A referee opt-in to send journal entries is a later question, not this
  design.
- **Prompt shape:** a frozen system prompt (the tone rules of 1.4 and the JSON schema of 1.2,
  cached) and a user message with the facts and the date; the model returns 12 `ChatterLine`
  objects for that day. The answer is parsed with the same zod schema; a line that fails, or a
  line whose `when` the facts do not satisfy, is dropped; fewer than 4 good lines means the
  written set is used.
- **Caching:** key `hash(truthVersion, hexKey, dayNumber, promptVersion)` in Workers KV with a
  48-hour TTL; the browser asks `GET /api/chatter/:hexKey?day=` and the Worker answers from KV
  before it ever calls a model. The written lines are mixed in at a 2:1 ratio so the day never
  reads as one voice.
- **Guards** (`findings/api_mcp_paused.md` must-haves): the campaign switch on and a signed-in
  caller; the Workers rate-limiting binding per user (10 a minute); a daily cap on model calls
  (dial, 2,000 a day) after which the written lines serve; a kill switch setting that turns the
  route off without a deploy; a billing alert in the Cloudflare dashboard at Johnny's figure;
  CDN cache headers on the route (`public, max-age=3600`).
- **Cost** per 1,000 systems opened a day, at about 600 input and 400 output tokens a call
  (prices in the report's section 4, fetched 2026-10-17): Claude Haiku 5.5 about $7.80 a month,
  GPT-5 nano about $5.70, Gemini 2.5 Flash-Lite about $6.60, Workers AI Llama 3.2 3B about $4.95;
  batch halves the first three. At a realistic 250 calls a day it is under $2 a month on any of
  them.
- **When it is worth it:** the dollars are already small; the cost is governance. Recommend after
  Epic P is live and the written 1,000 are in (so the fallback is deep), with the daily cap and the
  billing alert in place first. Question 15.

---

## 3. Background traffic

### 3.1 What it is
Made-up ships that come and go in the orbit view: arriving at the system's edge, flying to the
mainworld, docking, going out to a gas giant, leaving. Generated in the browser from a seed,
never stored, never sent, never on the public traffic scope. Off by default; the referee's switch.

### 3.2 What ships appear, and how many
Every quantity below is a dial or a citation; the dial table is the report's section 3.

**The activity index** (dial 2): the sum of the world DMs of the Freight Traffic roll for this world
as a source world, `assets/trade.txt:175-189`: Population 1 or less −4, 6 to 7 +2, 8 or more +4;
Starport A +2, B +1, E −1, X −3; Tech Level 6 or less −1, 9 or more +2; Amber Zone −2, Red Zone −6.
This borrows the table's **shape**, not its meaning: it is not a count of ships and never claims
to be. The index runs from −14 to +8.

**Ships drawn at once** (dial 1): `round(clamp((index + 4) / 12, 0, 1) × 12)`, so a class X
world with Population 0 draws nothing and a class A world of Population 9 and TL 12 draws twelve.
Then two cited overrides: a **Red zone** draws no civilian ship, only patrols (travel "is
forbidden... Interdictions are enforced by the Imperial Navy", `assets/2eWorldCreation.txt:1333-1336`);
a **class X** world draws no civilian ship (no starport, Starport Facilities table 1155-1157).

**Kinds by role** (dials 4a to 4f; each trigger cited, each share a dial):

| Role | When | Share of the count | Shape and words | Cited |
|---|---|---|---|---|
| trader | Population 1+, starport A to E | the remainder | circle; "free trader", "far trader" as words only | the Freight and Passenger Traffic tables exist for any world (`trade.txt:89-94`, `172-176`) |
| liner | Population 8+ or starport A or B | 1 in 4 of the count, at most 3 | rectangle; "liner" | passenger DMs +3 at Pop 8+, +2 at A, +1 at B (`trade.txt:103-107`) |
| patrol | bases include N, or zone Red | 1 at N; 2 in a Red zone | square; "patrol" | naval bases "are always guarded by armed vessels" (`2eWorldCreation.txt:1312-1313`); Red enforced by the navy (1335-1336) |
| scout | bases include S or W | 1 | triangle; "scout" | scout base, way station (1320-1326) |
| x-boat | bases include W, or `xboat` is true (question 4) | 1, arriving and leaving by jump only | triangle; "courier" | way station "dedicated to the x-boat communication network" (1324-1326); the x-boat service, `trade.txt:272` |
| shuttle | highport true | 2, between the mainworld and its highport | circle, small; "shuttle" | "Ships that cannot land at a downport are serviced by a fleet of shuttles" (1100-1106) |

A world with the index at the floor but a base still draws that base's ships (a scout at a class D
world with a scout base; a patrol at a Red zone).

### 3.3 Names
`packages/engines/src/core/ship_names.js` (new, pure, beside `core/names.js`): two word lists
(about 60 adjectives and 60 nouns, written by Lane E in the tone of the example ships, "Far Margin",
"Blue Runner") and `shipNameFor(seed)` = adjective + noun from `mulberry32(seed)`. The browser copy
lives in `packages/shared/src/ship_names.ts` with the same lists (the engines are not imported by
the browser; `npm run check` keeps it so). The system name pool (`core/names.js`) is not used, so
a ship is never named after a nearby world.

### 3.4 Where they move
A schedule of `ShipTrack`s, placed by the existing `placeShips`, so the renderer, the hit test and
the 100D standing need no new drawing code:

- **Anchors:** the mainworld (`bodyKey` of the mainworld, as `bodiesAtOf` already resolves a bare
  system anchor); a gas giant (`w<i>` of the first world whose `type` is `Gas Giant`); a belt; and
  the **edge**: a system point on the mainworld's 100D circle plus a margin (dial 7: 1.15 × its
  `jumpAU`, at a seeded bearing). The edge is the app's existing convention for where a jump
  leaves from ("outside every 100D circle", `ship_list.ts jumpStanding`, ruled 2026-10-06) and the
  limit itself is `rules/mgt2e_space_travel.json` `limitDiameters: 100`. No rule says where a ship
  comes out of jump; this is the drawing's convention, as `ship_marks.ts` says of the mainworld.
- **A trader's day:** jump in at the edge (a `jump` leg ending there, so the arrival bubble shows),
  fly to the mainworld, dock for D hours (dial 5: 6 to 30 h, seeded), fly to the gas giant to skim
  (cited, `2eWorldCreation.txt:240-244`: "a gas giant... where unrefined fuel can be skimmed") when
  the system has one and the seed says so (dial 6: 1 in 3), then to the edge and jump out. A liner
  skips the gas giant. A patrol orbits the mainworld (`orbit` leg) with one flight out to the edge
  and back. A scout goes mainworld to belt and back. An x-boat jumps in at the edge, docks, and
  jumps out: no gas giant. Shuttles hop mainworld to mainworld on `flight` legs an hour long
  (the highport is scenery at the mainworld, so a shuttle's leg is drawn as a short arc beside the
  disc by `dockedBeside`, offset by index).
- **Durations:** flights by the travel formula in `rules/mgt2e_space_travel.json` (`travel.formula`,
  from rest to rest) at a dial G (dial 8: 2 G, the second column of the Transit Times table);
  jumps by `jump.durationHours` (148 + 6D, rolled with the ship's seed). Legs are dated in campaign
  days, so the picture is right at every speed from real time to a year a second.
- **Time scale:** at real time a flight across an AU takes two days, so a ship barely moves,
  which is right; at a day a second the whole day's traffic plays in a second. Above dial 9
  (2 days a second) the traffic layer draws only docked and orbiting ships, so marks never
  teleport; the dev stand-in's 16 s wall loop is **not** used (it is dev-only).

### 3.5 The seed, and why it is stable while you watch and fresh across days
`apps/web/src/living/traffic.ts` (new) builds the schedule for a **day bucket**: `bucket =
floor(days)`. For buckets b−1, b and b+1 (as the stand-in does with its three cycles) each ship
index i gets `rng = mulberry32(hashString(hexKey + '|' + truthVersion + '|' + bucket + '|' + i))`,
and from `rng` its name, role, arrival hour, dock hours, gas-giant choice, bearing and jump hours.
Ships whose legs cross a bucket boundary are generated by the bucket they arrive in, so a ship in
flight at midnight is the same ship on both sides. Scrubbing back a week shows that week's ships
again; opening the system tomorrow shows tomorrow's. Nothing is written anywhere: no D1, no
Durable Object, no R2, nothing on the public scope, zero server cost. The schedule is rebuilt only
when the bucket, the system or the switch changes; a build is a few hundred objects.

### 3.6 On the chart
No hint at the system tier (recommended; question 7): the chart's traffic diamonds are real tracks
in `--chart-traffic` and Johnny ruled the chart must not get cluttered. In the orbit view the
difference is visible by construction: background ships use `kind: 'traffic'`, drawn in
`--text-muted` wireframes, never lime, never diamonds, never in the ship list or the ship tags
(the tags are the campaign's ships only, `shipTags` filters by the campaign's tracks).

### 3.7 Performance
- The cap is 12 ships (dial 1) plus 2 shuttles; `placeShips` is linear in ships and legs
  (at most 8 legs each), well under a millisecond a frame; the renderer draws 14 extra designators.
- The schedule is built once per bucket in one synchronous call under a millisecond; no worker
  needed; `observeLongTasks` in the L5 harness confirms no new task over 50 ms.
- Software rendering without WebGL (Lane L's path): marks are 2D canvas strokes already; nothing
  WebGL is added. The hover block is drawn on the 2D canvas like the map's.

### 3.8 Hover
A traffic mark under the pointer (`shipAt` already answers it) shows a data block in the map's
style (`map/traffic.ts blockPlace`, `drawBlock`): the ship's name, its role in words, and one
`ship`-category chatter line seeded by the ship's id and resolved with that ship's name. Nothing
to click: the press falls through to the body under it or does nothing.

---

## 4. The switches

- **Where they live:** `CampaignSettings` gains
  `living: z.object({ chatter: z.boolean(), traffic: z.boolean() }).strict().optional()`, absent
  meaning both off. One schema change in `packages/shared/src/schemas/campaign.ts`, no migration:
  the settings document is stored whole (`commit.ts applySettings`, the DO's settings row) and
  `partyChange` already writes the whole document. `players_view.ts` passes it through unchanged
  (settings minus `rev`), so players get the referee's choice. Question 10 (the alternative is a
  column on `universes`, a migration).
- **The referee's control:** the campaign panel's settings area (`CampaignPanel.vue`, claimed):
  two checkboxes, **Show system chatter** and **Show background traffic** ("Ships that come and go
  in the orbit view. They're scenery, not tracked ships."), written with one settings change on
  the held revision, as `partyChange` does.
- **The per-device override:** `voyage.living.quiet` in `storageSet`, read by both features:
  **Quiet on this device** in the account menu. The orbit view's Layers drawer also lists
  **Traffic** as a chip (hotkey `-`) when the campaign switch is on; it flips the same per-device
  key for traffic only.
- **Players (Epic P):** the setting rides in the projection; a player sees the same chatter
  (seeded by system and day) and the same ships as the referee, cannot change the switch, and can
  quiet their device. Chatter reads no record, so nothing hidden can reach it. Question 8.
- **Signed out, or no campaign:** both off (there is no switch to turn on).
- **Defaults:** off.

---

## 5. The build plan

Phases for the lanes; the areas are today's (`streams/*.md`): A browser logic, E words, L the orbit
view (C or D take the orbit items when L is wrapped), D the campaign panel, Z anything deep. Gates
for every item: `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, plus the item's.

| Phase | Lane | Files | Tests | Done when | Before it |
|---|---|---|---|---|---|
| LS0 Johnny | Johnny | `reports/x_living_systems.md` section 6 | none | the dial table and questions 1 to 15 answered; the sample's tone approved | nothing |
| LS1 the schema and the facts | A | `packages/shared/src/schemas/chatter.ts` (from `check_sample.mjs`), `packages/shared/src/seed.ts` (`hashString`, `mulberry32`, cited to `core/rng.js`), `apps/web/src/living/facts.ts`, `apps/web/src/living/chatter.ts`, `apps/web/src/living/lines.ts` (loads the JSON) | `tests/shared/chatter_schema.test.js` (the six checks of `check_sample.mjs` over the shipped lines); `tests/web/living_facts.test.js` (facts from a chart row alone and with the tree, for the orbit fixture and one of each starport class); `tests/web/living_chatter.test.js` (same system same day same sequence; never twice until wrap; the party states; the day change) | the sample's 100 lines ship as `apps/web/src/living/lines/sample.json` and the tests pass | LS0 |
| LS2 the words | E | `apps/web/src/living/lines/*.json` (1,000 lines per the split in `chatter_schema.md`), `packages/engines/src/core/ship_names.js` and `packages/shared/src/ship_names.ts` (the word lists), the switch and ticker words | the schema test over every file; a test that the two word lists agree; the split counted per category and per condition in the entry | 1,000 lines pass the schema test; every fixture hears at least 40 lines | LS0 (the tone), LS1 (the schema) |
| LS3 the settings | D | `packages/shared/src/schemas/campaign.ts` (`living`), `tests/shared/campaign.test.js` (old rows parse, new rows round-trip), `workspace/CampaignPanel.vue` (claimed) or a new `workspace/LivingSettings.vue` mounted by one line, `workspace/AccountMenu.vue` (Quiet on this device), `apps/web/src/living/quiet.ts` | `tests/web/living_settings.test.js`: the change is one settings commit on the held rev; a player's panel shows the state read-only; the quiet key wins; shots at 1600 and 390 | a referee can switch both on and off; the DO accepts the row (the worker suite's settings case extended) | LS1 |
| LS4 the ticker | L (else C) | `apps/web/src/living/Ticker.vue`, one mount line each in `views/OrbitView.vue` and `dossier/DossierOverview.vue` (claimed) | `tests/web/living_ticker.test.js`: SSR with a line and empty; dismiss hides for the visit; reduced motion swaps; `aria-live`; never over a control (a layout assertion on the stage at 1600 and 390); shots before and after | the ticker shows in the orbit view and the dossier for a campaign with the switch on, and never otherwise | LS1, LS3 |
| LS5 background traffic | L (else D) | `apps/web/src/living/traffic.ts` (the schedule), `apps/web/src/living/roles.ts` (the index and the mix), one line in `views/OrbitView.vue` concatenating the traffic tracks into `tracks` when the switch is on and the device is not quiet, the hover block in `orbit/OrbitCanvas.vue` (claimed), the Layers chip in `orbit/commands.ts` | `tests/web/living_traffic.test.js`: counts per fixture (A, B, C, D, E, X, a Red zone, a naval base, a way station, a highport); the same bucket gives the same ships; a ship crossing midnight is the same on both sides; no civilian ship in a Red zone or at X; every jump leg's edge point lies outside every 100D ring (`shipStanding`); the cap holds; `tests/web/orbit_renderer.test.js` extended with a traffic mark's colour; shots at 1600 and 390 in the GPU and no-GPU browsers; the L5 long-task harness shows no new task over 50 ms | ships come and go in the orbit view for a campaign with the switch on; the public scope is unchanged (`tests/web/map_*` untouched and green) | LS1, LS3; LS2 for names (a stub list of 10 words until then) |
| LS6 players | A | verify only, with the two-account jig of `findings/marketplace/` | the players leak suite gains one case: the projection carries `living` and nothing else new | a player sees the ticker and the ships and cannot change the switch | P3 (the player client), LS4, LS5 |
| LS7 the LLM hook | Z | spec only until Johnny lifts the pause for it: `apps/api/src/routes/chatter.ts`, KV binding, the guards of section 2 | `tests/api/chatter.test.js`: cache hit before any model call; the daily cap; the kill switch; a bad answer falls back | Johnny's yes with the cost figure | LS2, Epic P live, question 15 |

**What must be true first, in one list:** Johnny's answers (LS0); LS1 before everything; LS3
before the ticker and the traffic can be turned on; LS2 can run alongside LS3 to LS5 (the sample's
100 lines serve until it lands).
