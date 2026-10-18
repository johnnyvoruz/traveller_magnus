# How fast news travels: X-boat traffic and information ripples, the spec

**Status:** SPEC, written 2026-10-17 by the one-session X-boat ripples review
(`prompts/x_xboat_ripples_spec.md`; the measurements and the questions are in
`reports/x_xboat_ripples.md`, "the report"). Ready for the orchestrator to turn §5 into stream
items. Nothing here is built. Nothing here states a Traveller rule: every number that is a
rule is either cited to `rules/` or `assets/` by line, or is a named parameter with a numbered
question in the report §6.

**What it is.** A referee clicks a system and asks "How fast does news travel from here". The
chart tints every system by the day the news arrives, fast along the X-boat lines, slower off
them, with a scrubber over campaign days. The reverse question, "how old is the news here",
tints every system by how long its news takes to reach the party. Everything runs in the
browser over data the chart already loads. Nothing is stored and nothing touches the server.

---

## 0. The rule that shapes everything

**The speed of news is a rule, and the app has none for it.** The sweep of `rules/` (every
file) and `assets/` found exactly these:

| Where | What it says | What it gives this feature |
|---|---|---|
| `rules/mgt2e_space_travel.json`, `jump.durationHours` (`{ base: 148, dice: 6 }`), from Johnny's answer G1.4 of 2026-10-06 (`decisions.md`) | 148 + 6D hours in jumpspace, whatever the distance | **The only cited duration.** One leg on any route, X-boat or not, takes this long in jump: 154 to 184 hours, 169 hours on the mean of the dice, that is 7.04 days |
| `rules/mgt2e_space_travel.json`, `jump.parsecsPerJumpNumber: 1`, `minimumParsecsCounted: 1` | a jump carries as many parsecs as its jump number | a leg of N parsecs is one jump for a drive of jump-N or better |
| `rules/guideline_4_4_trade_density_and_interconnectivity.md` line 5 | "Communications Routes: Generally established at Jump-2 or Jump-3 distances. X-Boat routes follow these paths and are capable of Jump-4." | an X-boat leg of up to 4 parsecs is one jump. The route data agrees: 99.7 % of the bare routes are 1 to 4 parsecs long; 11 are 5 (report §2.3) |
| `assets/2eWorldCreation.txt` lines 126 to 135 | communications routes are drawn as lines between hexes; trade routes need "a jump-1 or jump-2 route" between two worlds within four parsecs | the only cited reach for ordinary commercial traffic: jump-1 or jump-2 |
| `assets/2eWorldCreation.txt` lines 236 to 250 | routes are classified by the jump drive needed, because ships refuel at each stop | a route's parsec length is the jump its boats make |
| `assets/2eWorldCreation.txt` lines 1320 to 1326 | a Scout base is "an excellent place to pick up rumours and news"; a Way Station (W) is "a large Imperial Interstellar Scout Service installation dedicated to the x-boat communication network" | the W base code marks X-boat infrastructure. In Spinward Marches all six W worlds sit on bare routes (report §2.4) |
| `assets/trade.txt` lines 267 to 293 | mail is freight "not vital enough to be entrusted to the x-boat service or a private courier"; a flat Cr25,000 per container | nothing about speed |

Not found anywhere: how long an X-boat waits at a station, how often boats leave, how long
ordinary shipping waits for a ship, whether an X-boat jumps faster than other ships. Each is a
**parameter** (§1.4) with a question in the report §6. The design is correct for any values.

---

## 1. The model

### 1.1 The graph
- **A node is a system:** a chart hex with a row. The source of truth for "is there a system
  here" is the overview the chart already holds (`overview.json`, one character per hex, `.`
  is empty: `packages/generation/src/overview.ts`), so the node set of every sector is known
  without loading its index. The name, UWP and bases come from the sector index when it is
  loaded, and the hover says the hex until then.
- **An X-boat edge is a route record the referee's chosen rule classes as X-boat** (§1.3),
  between the two systems at its ends (`Start`, `End`, with `StartOffsetX/Y` and `EndOffsetX/Y`
  as sector offsets, exactly as `map/route_lines.ts` reads them). A record whose end has no
  system is dropped (219 of 13,853 across the chart; report §2.3). Duplicate records between
  the same two systems are one edge. Edges are two-way (question 5).
- **An off-network edge** joins two systems within `offNetworkParsecs` of each other
  (`map/geometry.ts` `hexDistance`, one hex is one parsec), found with a spatial hash over the
  global hex coordinates, never by an all-pairs scan.
- **A weight is days.** X-boat edge: `xboatLegHours` + `stationHoldHours`. Off-network edge:
  `offNetworkWaitHours` + `jumpHours`. All four are parameters (§1.4). A system is a node of
  both kinds of edge at once; the shortest path mixes them freely.
- **Storage:** compressed sparse rows in typed arrays (`Uint32Array` offsets and targets,
  `Float32Array` weights), built once per (sector set, parameters) and kept for the session.
  Measured: 28 KB for one sector, 186 KB for nine, 11.4 MB for the whole canonical chart at
  jump-2 off-network (report §3).

### 1.2 The arrival time
News from source `s` dated `d0` reaches system `v` at `d0 + dist(s, v)` where `dist` is the
shortest-path time over the weighted graph: **Dijkstra with a binary heap**, stopped at a
horizon (the scrubber's last day, `horizonDays`). The reverse question is the same run from
the party's system: on a two-way graph `dist(party, v)` is how long news from `v` takes to
reach the party.

Three runs, not one, when the jump duration is dice: **earliest** (154 h per leg), **likely**
(169 h, the mean of 148 + 6D), **latest** (184 h). The rings and the tint use the likely time;
the hover gives all three ("earliest day 16, likely day 18, latest day 21"). This is arithmetic
over the cited rule, not a new rule. A referee who wants one number sets the dice to their
mean (question 2).

### 1.3 Which routes are X-boat routes (the data, and a decision)
The chart has 13,853 route records in 300 of 512 sectors. They carry `Type` (6,087 records:
Trade, Core Route, Commercial, TradeMinor, Xboat 15, and others), `Allegiance` (4,312, mostly
ZhCo, As, SoCf), `Color` (412), or nothing (3,460 **bare** records). The chart today, as the
legacy map did (`legacy_map_inventory.md` §4: "the XML Type attribute is never read"), draws
every record with no `Allegiance` and no `Color` in the X-boat colour: 9,254 records, of which
5,794 are typed Trade, Core Route and the like.

The bare records are the Imperial sectors' communication lines: Core 166, Vland 118,
Dagudashaag 145, Lishun 108, Spinward Marches 91, Deneb 66, Corridor 67 and 32 more canonical
sectors; the six Spinward Marches way stations all sit on them, and from Regina the bare
network reaches 1,817 systems. The Zhodani, Aslan, Solomani and Vargr sectors carry allegiance
routes and no bare records at all (220 canonical sectors; report §2.2).

**The rule is a parameter, `xboatRouteRule`,** with these values; the report's question 1
asks Johnny which is the default:
- `bare` (recommended): no `Allegiance`, no `Type`, no `Color`, plus any record with
  `Type="Xboat"`.
- `chart`: whatever the chart draws in the X-boat colour today (no `Allegiance`, no `Color`).
- `allegiances:<codes>`: records whose `Allegiance` is in a list the referee gives (a Zhodani
  campaign's fast lane), on top of `bare`.
A sector whose rule matches nothing has no X-boat network there; news still moves off-network.

### 1.4 The parameters (one table, the referee's or Johnny's)
| Key | Meaning | Cited default | If not cited |
|---|---|---|---|
| `jumpHours` | hours in jump, one leg | `rules/mgt2e_space_travel.json` `jump.durationHours`: 148 + 6D; earliest 154, likely 169, latest 184 | — |
| `xboatLegHours` | one X-boat leg | the same `jumpHours` (nothing says an X-boat jumps faster or slower) | question 2 |
| `stationHoldHours` | a message waits at a station for the next boat | none found | question 3; **0 until Johnny gives a number**, and the hover says "no station hold" |
| `xboatMaxParsecs` | a route longer than this is not one X-boat leg | `guideline_4_4` line 5: jump-4 | question 6 (11 routes are 5 parsecs) |
| `xboatRouteRule` | which records are the network (§1.3) | `bare` | question 1 |
| `offNetworkOn` | commercial traffic carries news off the lines | on | question 4 |
| `offNetworkParsecs` | two systems this close trade | `2eWorldCreation.txt` 126 to 135: trade routes need a jump-1 or jump-2 route, so 2 | question 4 |
| `offNetworkWaitHours` | wait for a ship going the right way | none found | question 4; **until given, the picture runs X-boat only and says so** |
| `horizonDays` | the scrubber's last day | product, not a rule: 60 (Johnny's "day 0 to day 60") | — |
| `sectorCap` | most sectors loaded for one ripple | product: 9 | — |

The table is one TypeScript object with a zod schema. v1 holds the defaults in code (Johnny's
answers). A per-campaign override is a stored-data change (`CampaignSettings` is strict) and
waits on question 9.

### 1.5 Is Dijkstra enough
| Variant | What a referee would notice | Cost | Verdict |
|---|---|---|---|
| Fixed weights, one run | smooth rings; one date per system | 0.03 ms for a sector, 0.5 ms for nine sectors, 14 ms for the whole canonical chart (report §3) | **v1** |
| Earliest, likely, latest (three runs) | a range in the hover; the ring has a soft edge if drawn as a band | three times the above | **v1** |
| Boat schedules (a boat leaves every `periodHours`; a message waits for the next one) | arrival dates step instead of flow; a message that just misses a boat loses a whole period | the same Dijkstra with a time-dependent edge (waiting is first-in first-out, so correctness holds); no extra memory | not v1: needs a period that is nowhere in the rules (question 10) |
| Seeded Monte Carlo (roll 6D per leg per run, `k` runs, report percentiles) | a fuzzy frontier; "9 times in 10 it is there by day 20" | `k` runs; at `k` = 20 still under 15 ms for nine sectors; the rolls come from `core/rng.js` seeded by the campaign, so the picture is the same every time | not v1; it adds little over earliest, likely, latest (question 10) |
| Per-station delays by world (starport class, population) | rich, but a rule | none found in `rules/` | no, until a rule exists |

---

## 2. Cheap: sizes, timings, loading

Measured by `.tmp/xboat_probe/probe.mjs` over `universe/raw/` (report §3 has the tables; the
machine is Johnny's desktop, Node 24; multiply by two to three for a mid-range laptop and by
four for the no-GPU Edge at the throttle Lane L used in `findings/perf/stream_l_long_tasks.md`).

| Size | Systems | X-boat edges (bare) | Off-network edges at jump-2 | Graph bytes | Build | Dijkstra, no horizon | Dijkstra, 60-day horizon |
|---|---|---|---|---|---|---|---|
| One sector (Spinward Marches) | 439 | 86 | 1,323 | 28 KB | 1.3 ms | 0.18 ms | 0.11 ms |
| Nine sectors (the 3 × 3 block round it) | 3,212 | 205 | 9,006 | 186 KB | 10 ms | 0.5 ms | 0.02 ms |
| All 399 canonical sectors | 159,869 | 2,393 | 589,702 | 11.4 MB | 643 ms | 14 ms | 0.13 ms |
| All 512 | 180,312 | 3,460 | 640,364 | 12.5 MB | 1,063 ms | 19 ms | 0.15 ms |

What this says:
- **The computation is free at the sizes a referee uses.** One sector or nine: under 1 ms to
  run, about 10 ms to build, on the main thread within the 50 ms budget even at four times
  slower. No worker is needed for v1.
- **The whole chart is a build problem, not a run problem.** 643 ms to build is a long task;
  if the whole-chart ripple is ever wanted, the build goes to a Web Worker on the pattern of
  `orbit/alignment_runner.ts` (one request, one reply, terminate to cancel), or is cut into
  per-sector blocks built on idle frames. The run itself is 14 ms.
- **The data, not the maths, is the cost.** Routes live only in `sectors/<slug>/index.json`
  (84 KB on average, 400 of them, 33.7 MB in all; cached immutable per version). A ripple over
  nine sectors needs nine indexes, which the map at that zoom has mostly loaded already
  (`TruthClient` keeps 32). A whole-chart ripple would need all 400, which is not acceptable.
- **Load only what the ripple reaches, with a cap.** The frontier starts in the source's
  sector. Each time a settled node is within `max(offNetworkParsecs, 5)` parsecs of a sector
  edge whose sector is not loaded, that sector is wanted (`TruthClient.want`), the run pauses
  on that edge until the index arrives (`onArrive`), and the graph grows by one sector. At
  `sectorCap` sectors (default 9) the ripple stops at the loaded edge and the panel says
  "Shown as far as nine sectors." With `horizonDays` 60 and the cited jump time, the X-boat
  frontier from Regina reaches 28 systems and the jump-2 frontier 115, all inside the
  3 × 3 block, so the cap is rarely met.
- **Precompute, if the whole chart is ever wanted:** a `truth/<v>/routes.json` written at
  truth build (`tools/truth/build.js`, beside `overview.json`) holding every route record of
  every sector with just `Start`, `End`, the offsets, `Type`, `Allegiance` and `Color`:
  13,853 records, about 500 KB as JSON and under 100 KB gzipped, or 22 KB packed as three
  `Uint16` per bare edge. With it and the overview the whole-chart graph builds with no index
  at all. Not needed for v1; a Z item when Johnny asks for ripples across the Imperium
  (question 11).
- **Memory:** nine sectors cost under 200 KB of typed arrays plus the indexes the map holds
  anyway. The whole canonical chart at jump-2 is 11.4 MB, acceptable in a worker, not on a
  phone's main thread.

---

## 3. The picture

### 3.1 Where it starts
- A command in the registry (`shell/registry.ts`), **"How fast does news travel from here"**,
  runnable when a system is selected or a dossier is open (manifesto: "a feature gets no chrome
  until it works from the command palette").
- A **News** button in the dossier's actions beside **Orbits** (`dossier/DossierPanel.vue`
  `#actions`), shown for a hex that has a system.
- On a record with a date and a place, and on a journal entry with both: **"Spread this news"**
  (§4.2).
- On the Party tab's Where card: **"How old is the news here"** (the reverse, §3.5).
Where the button lives is question 7.

### 3.2 The layer
Its own canvas over the chart, on the pattern of `map/traffic.ts` (`TrafficLayer`): drawn
when the chart is drawn (the tints move with the camera) and on its own clock while the
scrubber plays; it never asks the chart to redraw. It holds one `Ripple`:
`{ source, day0, horizonDays, mode: 'from' | 'to', arrivals: Map<hexKey, { earliest, likely, latest }> }`.

At the scrubbed day `t` (days after `day0`):
- **Reached systems** (`likely` ≤ `t`): a disc behind the world glyph at the hex zoom and the
  dot tiers, in one news colour `--chart-news` at an alpha that falls with the age of the news
  at `t` from fresh (just arrived) to old. Not reached: untouched.
- **Rings along the lines:** each X-boat edge `u → v` with `likely(u)` ≤ `t` < `likely(v)` is
  drawn from `u` towards `v` for the fraction `(t − likely(u)) / (likely(v) − likely(u))` in
  `--chart-news` over the route's own line; a reached edge is drawn whole. That is the ripple:
  it runs along the network at the speed of the boats. Off-network spread has no line to draw;
  its systems light up as they are reached.
- **Zoomed out** (the overview tiers): the reached systems' dots through the renderer's existing
  dot overlay (`MapRenderer.setDotOverlay`, a map of hex key to colour), so the overview draws
  the ripple with no per-hex work of its own.
- **Band for the range:** a reached system whose `earliest` ≤ `t` < `latest` draws its disc
  at half alpha ("it may be there").

### 3.3 The scrubber
A floating control in the map's frame, in the look of the orbit view's time row
(`design_reference.md` §3 time controls: timecode in the display font, tabular; the jog
slider): **"News from Regina · day 18 · 141-1105"**, a range input `0` to `horizonDays`,
Play/Pause, and **Today** marked on the track when a campaign clock is set (§4.1). Arrow keys
move a day; Home and End. Play runs day 0 to the horizon over one token length
(`--t-ripple`, new in `tokens.css`, no literal in a component); it repeats until paused.
Close: Escape or the ✕ on the control; the layer clears.

### 3.4 Hover
Hovering a reached system shows a data block in the traffic layer's manner (no text at rest):
**"News from Regina arrives here on 141-1105, 18 days later. Earliest 16, latest 21."**
Dates through `workspace/stardate.ts` (`DDD-YYYY`). An unreached system within the horizon:
**"News from Regina has not reached here by day 60."** The reverse mode (§3.5): **"News from
Mora reaches Regina in 9 days."** Words are Lane E's (§5, phase E).

### 3.5 The reverse: how old is the news here
`mode: 'to'`: the source is the party's system (`workspace/party_where.ts` `partyWhere` at the
clock's day), the same run, the tint reads "news from this system is N days old when it reaches
the party". The scrubber is replaced by a legend of ages. One click from the Where card.

### 3.6 Motion, budget, fallback
- `prefers-reduced-motion`: no play; the layer draws the final state at the scrubbed day; the
  scrubber still works by hand. Read once, as the traffic layer does, not per frame.
- 50 ms: the run is under 1 ms (§2); the draw is one disc per reached system and one line per
  reached edge, a few hundred at most within a horizon; the dot overlay carries the rest. No
  frame does more than the chart's own route pass.
- Without WebGL: it is 2D canvas, the same as the chart, at full resolution always (Johnny,
  2026-10-17: no half-resolution drawing while moving). Speed comes from drawing less: the layer
  draws nothing while the camera moves and once when it settles, as the chart's titles do.
- Phone: the control stacks under the date chip at 390 px; the hover becomes a tap, the same
  as a track.

---

## 4. In a campaign

### 4.1 The clock and the party
- `day0` defaults to the campaign date (`CampaignClock.days`; `party_where.ts` `campaignDays`,
  the default start when none is set). Every date on screen is `day0 + t` as a stardate.
- **Today** on the scrubber's track is the clock; opening the ripple from a dated event (§4.2)
  places the scrubber at Today, so the first thing the referee sees is where the news is now.
  "Has word of the coup reached Regina?" is `likely(Regina) ≤ today − day0`.
- The source defaults to the open dossier's system, else the party's system.

### 4.2 A record or an entry as the news
A record with `when.start` and a system anchor (or a record anchor that `locate` resolves to a
system), and a journal entry with `when` and an `anchor`, can be the news: **"Spread this
news"** opens the ripple with `day0 = when` and `source = the place`. The ripple is a view;
nothing is written to the record. A record with a date but no place, or a place but no date,
has no button (one line says why on hover). `kind: 'event'` records and `rumor` entries are the
natural cases, but the button keys on date-and-place, not on kind.

### 4.3 Players (Epic P, `players_build_plan.md`)
The graph is public truth data and the run is in the browser; the ripple reveals nothing that
the chart does not. For a player:
- "How fast does news travel from here" on any system: allowed (question 8). It uses the
  chart only.
- "Spread this news" on a record or entry: only those in the players' projection
  (`playersView`), which already carry the date and the place; a referee-only record has no
  button for a player because the player never has the record.
- "How old is the news here": from the party's place, which players already see on the Where
  card.
- The parameters are read-only for a player; the referee's values apply.
No count of hidden things, no "left out" sentence anywhere (F24 stands).

### 4.4 Own sectors and the builder's routes
A referee's own sector carries no routes in its index today (`workspace/build/sectors.ts`
writes `metadata.routes: []`), so the ripple there is off-network only until own routes exist
on the chart. The overlay's `lists.kind = 'routes'` is not read by the map; out of scope here
(question 12).

### 4.5 Living systems
`prompts/x_living_systems_spec.md`'s chatter has a slot for the campaign date; "news age" from
this feature is a later condition a line could read ("word of X has reached here"). A hook,
not a dependency.

---

## 5. The build plan

Order: **A1 → A2 → D1 → D2 → E1**, then **D3**, **A3**; **Z1 to Z3** only on Johnny's word.
Gates for every item: `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, plus
the item's own. Files are new unless named as an edit. No file in `rules/`, `js/`, the legacy
tree, or the server.

### A1 (Lane A) — the parameters and the graph, pure and tested
Files: `apps/web/src/news/params.ts` (the §1.4 table as one typed object with a zod schema,
every cited value with its citation in a comment, every uncited one `null` until Johnny
answers), `apps/web/src/news/graph.ts` (nodes from a list of `SectorIndex` plus the overview's
cells for sectors not loaded; X-boat edges by `xboatRouteRule`; off-network edges by spatial
hash; CSR typed arrays; `sectorsWanted(frontier)`), `tests/web/news_graph.test.js`.
Tests:
- a fixture sector (made up, in the test file: six systems, four bare routes, one typed route,
  one allegiance route, one route to a hex with no system, one cross-sector route with an
  offset) builds the expected nodes and edges under each `xboatRouteRule` value;
- off-network edges at jump-1 and jump-2 are exactly the pairs within that distance;
- duplicates collapse; a dangling route is dropped; a 5-parsec bare route is dropped at
  `xboatMaxParsecs` 4 and kept at 5;
- the real Spinward Marches raw files, which are in git (`universe/raw/Spinward_Marches.tsv`,
  `.xml`, through `parseT5Tab` and `parseMetadataXml` from `@voyage/shared`): 439 nodes, 86
  bare edges, built under 10 ms.
Must be true first: nothing. Johnny's answer to question 1 changes one default, not the code.

### A2 (Lane A) — the arrival times
Files: `apps/web/src/news/arrivals.ts` (binary-heap Dijkstra with a horizon; `earliest`,
`likely`, `latest` from the dice; `mode: 'from' | 'to'` on the two-way graph; the frontier's
next wanted sector), `tests/web/news_arrivals.test.js`.
Tests:
- the fixture sector with hand-computed days for every system at `stationHoldHours` 0 and at
  a non-zero value; the off-network wait moves only off-network arrivals;
- `earliest ≤ likely ≤ latest` everywhere; a horizon stops the run and leaves the rest
  unreached;
- the reverse mode equals the forward mode on a two-way graph;
- timing: Spinward Marches from 1910, no horizon, under 5 ms; the 3 × 3 block cannot be built in
  tests (the other eight sectors' raw files are not in git), so the size claim for nine sectors
  stays the report's measurement, named in the test file's header.
Must be true first: A1.

### D1 (Lane D) — the layer and the scrubber
Files: `apps/web/src/map/news_layer.ts` (the §3.2 layer, own canvas, the dot overlay at the
overview tiers), `apps/web/src/map/NewsScrubber.vue` (§3.3), `views/MapView.vue` (edit: mount
the layer and the control; the command "How fast does news travel from here"; the layer's
sector loading through the map's `TruthClient`), `design/tokens.css` (edit: `--chart-news`,
one measured colour on the chart background with the contrast test; `--t-ripple`),
`tests/web/news_layer.test.js`, `tests/web/contrast.test.js` (edit: the new token).
Tests: the edge-progress fraction and the age alpha as pure functions; a reached edge draws
whole; the reduced-motion path draws once; the dot overlay map holds exactly the reached
systems; the command registers and is runnable only with a system; shots at 1600 and 390 at
day 0, day 18 and day 60 from Regina.
Must be true first: A2 green.

### D2 (Lane D) — the dossier button, the hover block, the reverse mode
Files: `dossier/DossierPanel.vue` (edit: **News** beside **Orbits**), `map/news_layer.ts`
(the hover block), `workspace/WhereBlock.vue` (edit: **How old is the news here**),
`tests/web/news_hover.test.js`.
Tests: the hover sentence for reached, unreached and reverse; the button only on a hex with a
system; shots.
Must be true first: D1.

### E1 (Lane E) — the words
Files: `apps/web/src/news/words.ts` (every sentence of §3.4 and §4.2 in one place, Google
style), `workspace/HelpGuide.vue` (edit: "How fast does news travel", with the parameter table
in words and the line "Nothing in the rules sets a station's hold; the referee's value
applies"), `changelog.ts` (edit), `tests/web/help.test.js` (edit).
Must be true first: D2.

### D3 (Lane D) — "Spread this news" on records and entries
Files: `workspace/RecordPage.vue`, `workspace/journal/EntryPage.vue` (edits: the button under
§4.2's date-and-place rule), `tests/web/news_spread.test.js`.
Must be true first: D2; Johnny's answer to question 7 if it moves the button.

### A3 (Lane A) — players
Files: `apps/web/src/news/*` (verify only: no store write, no server call; a test that the
module imports nothing from `campaign/commit.ts`), `tests/web/news_players.test.js` (a player's
projection yields the same ripple from a players-visible record; a referee-only record yields
no button).
Must be true first: P3 of `players_build_plan.md` in the tree; question 8 answered.

### Z1 (Lane Z) — `routes.json` at truth build
Files: `tools/truth/build.js` (edit), `packages/shared/src/schemas/truth.ts` (edit: a
`TruthRoutes` schema), `apps/web/src/map/truth_client.ts` (edit: `routes(version)`, one fetch
per version, cached immutable like `polities`), `tests/generation/routes_file.test.js`,
`tests/web/truth_client.test.js` (edit). A truth version bump. Must be true first: Johnny's
yes to question 11; a whole-chart ripple asked for.

### Z2 (Lane Z) — the whole-chart ripple in a worker
Files: `apps/web/src/news/graph.worker.ts`, `news/graph_runner.ts` (the `alignment_runner.ts`
pattern), tests. Must be true first: Z1.

### Z3 (Lane Z) — per-campaign parameters and the variants
A `news` key on `CampaignSettings` (schema, DO, the party panel's settings card), and the
schedule or Monte Carlo variants of §1.5 if Johnny wants them. A stored-data change: a proposal
first. Must be true first: questions 9 and 10.

### What must be true before A1 starts
Nothing in the code. In the directives: Johnny's answers to questions 1 to 4 fix the defaults;
A1 and A2 build with the cited values and `null` for the rest, and the picture (D1) shows
"X-boat only" until the off-network wait has a value. No item here states a rule the report
does not cite.

---

## 6. Questions for Johnny
Twelve, written out in full with the recommendation first, in `reports/x_xboat_ripples.md` §6.
In one line each: 1 which route records are the network (recommended: the bare ones plus
`Type="Xboat"`); 2 an X-boat leg is one cited jump of 148 + 6D hours shown as earliest, likely,
latest (yes); 3 the station hold (0 until given); 4 off-network traffic within 2 parsecs with a
wait Johnny sets (on, and X-boat only until the wait exists); 5 routes two-way (yes); 6 the
eleven 5-parsec bare routes (keep as data); 7 where the button lives (dossier beside Orbits,
the palette, records and entries, the Where card); 8 players can run it (yes); 9 per-campaign
parameters later (yes, later); 10 schedules and Monte Carlo (not in v1); 11 `routes.json` at
truth build (only when a whole-chart ripple is wanted); 12 the builder's own routes (out of
scope).
