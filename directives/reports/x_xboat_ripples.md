# X x_xboat_ripples report
Prompt: prompts/x_xboat_ripples_spec.md
Status: done (a spec and this report; no code changed)

## Changed files
- directives/spec_xboat_ripples.md: the spec, §1 to §5 of the prompt's "Do"
- directives/reports/x_xboat_ripples.md: this report, with the measurements and the questions
- .tmp/xboat_probe/probe.mjs and .tmp/xboat_probe/out.txt: the probe and its output (gitignored, local)

## Gates
npm test:      not run (no file under apps/, packages/ or tests/ changed)
npm run check: not run (same)
typecheck:     not run (same)
fourth gate:   none

## Contract published
none

## Needs from others
- none. The spec's A1 can start on Johnny's answers to questions 1 to 4; A1 and A2 build with the cited values and `null` for the rest.

---

## 1. What I read, and what the rules give
`CLAUDE.md`, `manifesto.md`, `decisions.md` (the 2026-10-17 19:10 entry, G1 of 2026-10-06, B1),
`design_reference.md`, `legacy_map_inventory.md` §4 and §10, `data_model.md` §5, `players_build_plan.md`,
`streams/README.md`; `map/route_lines.ts`, `map/routes.ts`, `map/MapRenderer.ts` (`routes`, `routeColour`,
`setDotOverlay`), `map/truth_client.ts`, `map/traffic.ts`, `map/campaign_layer.ts`, `map/geometry.ts`,
`map/theme.ts`, `design/tokens.css`; `packages/shared/src/parsers/metadata_xml.ts` (every route attribute
is kept as written), `packages/shared/src/schemas/truth.ts` and `campaign.ts`, `packages/generation/src/overview.ts`
and `route_colours.ts`, `tools/truth/build.js`; `orbit/clock.ts`, `campaign/track.ts`, `workspace/party_where.ts`,
`workspace/stardate.ts`, `workspace/timeline.ts`, `workspace/record_when.ts`, `shell/registry.ts`,
`dossier/DossierPanel.vue` (the actions slot), `orbit/alignment_runner.ts` (the worker pattern);
`universe/raw/sectors.json` and all 512 `.xml` and `.tsv`; every file in `rules/`; `assets/2eWorldCreation.txt`
(lines 118 to 140, 230 to 250, 1236 to 1250, 1295 to 1345), `assets/trade.txt` (255 to 300),
`assets/2eWorldGeneration_EngineSpec.md`; `findings/rules_drafts/` (the four drafts; `mgt2e_space_travel.json`
is byte-identical to the copy in `rules/`).

The whole sweep for the speed of news gave **one cited duration** and **one cited reach**:
- `rules/mgt2e_space_travel.json` `jump.durationHours = { base: 148, dice: 6 }` (Johnny, 2026-10-06, G1.4): a
  jump is 148 + 6D hours whatever the distance. Earliest 154 h, mean 169 h (7.04 days), latest 184 h.
- `rules/guideline_4_4_trade_density_and_interconnectivity.md` line 5: communications routes "generally
  established at Jump-2 or Jump-3 distances. X-Boat routes follow these paths and are capable of Jump-4."
- `assets/2eWorldCreation.txt` 126 to 135: a trade route needs "a jump-1 or jump-2 route" between two worlds
  within four parsecs (the only cited reach for ordinary traffic). 236 to 250: a route's class is the jump its
  ships make, because they refuel at each stop. 1320 to 1326: a Scout base is "an excellent place to pick up
  rumours and news"; a Way Station (W) is "dedicated to the x-boat communication network". `assets/trade.txt`
  267 to 293: mail is freight "not vital enough to be entrusted to the x-boat service"; no speed.
- Not found anywhere: the hold at a station, a boat schedule, the wait for a commercial ship, any difference
  between an X-boat's jump and another ship's. `rules/*.js` (the engine tables) have nothing on routes or mail.

## 2. The route data's coverage
Counted by the probe over `universe/raw/*.xml` (13,853 `<Route>` records in 300 of 512 files; the TSV gives
180,312 systems, 159,869 in the 399 canonical sectors).

### 2.1 What the records carry
| Attribute | Records | Values |
|---|---|---|
| `Start`, `End` | 13,853 | hex ids |
| `Type` | 6,087 | Trade 2,873 · Core Route 2,563 · Commercial 265 · TradeMinor 124 · Shipping 62 · Independent 45 · Migration 36 · Diadem 24 · Special 19 · **Xboat 15** (all in `The_Beyond_Don_McKinney_2015`, not canonical) · J-5 14 · Imperium Outpost 14 · others under 10 |
| `Allegiance` | 4,312 | ZhCo 2,223 · As 561 · SoCf 406 · JuPr 139 · JuHl 119 · 40 more codes |
| `Color` | 412 | |
| `Style` | 24 | |
| `EndOffsetX/Y`, `StartOffsetX/Y` | 1,075 records cross a sector edge | |
| none of Type, Allegiance, Color (**bare**) | **3,460** | 2,421 of them in canonical sectors |

The chart today colours as X-boat every record with no `Allegiance` and no `Color` (`map/route_lines.ts`;
the legacy did the same, `legacy_map_inventory.md` §4: `Type` is never read): **9,254 records, of which 5,794
are typed** (Trade 2,829, Core Route 2,563, Commercial 157, TradeMinor 124, and the rest). So the X-boat
green on the chart is not the X-boat network; it is "any route nobody coloured". Question 1 is about this.

### 2.2 Which sectors carry X-boat routes (by the bare rule)
- **39 canonical sectors have bare routes**, the Imperial ones: Old Expanses 203, Core 166, Dagudashaag 145,
  Diaspora 139, Vland 118, Lishun 108, Massilia 105, Antares 95, Fornast 94, Spinward Marches 91, Daibei 90,
  Zarushagar 80, Ley 74, Ilelish 74, Gushemege 72, RimReach 68, Corridor 67, Deneb 66, Solomani Rim 66,
  Ruthless Veil 53, Empty Quarter 52, Canopus 51, Delphi 50, Amderstun 46, Rzakki 35, Verge 32, Magyar 27,
  Trojan Reach 26, Tsadra 24, Reaver's Deep 21, Alpha Crucis 18, Reft 17, Porlock 15, The Beyond 13,
  Glimmerdrift Reaches 8, Nooq 6, Avereguar 3, Hinterworlds 2, Kidunal 1. Twenty non-canonical sectors have
  bare routes too (Judges Guild and other variants).
- **220 canonical sectors have routes but no bare ones**: the 167 ZCR sectors (Zhodani, `ZhCo`), the Aslan
  sectors (`As`), the Solomani Rim's neighbours (`SoCf`), the Vargr extents, and the Far Frontiers, Vanguard
  Reaches, Gzirr'k'l, Extolian, Ricenden, Blaskon, Phlask, Centrax, Wrenton, Folgore and Dark Nebula group
  (typed Trade and Core Route only).
- **140 canonical sectors have no routes at all** (the Vargr and Hiver fringes, the Far Shore, the empty
  sectors; the list is in `.tmp/xboat_probe/out.txt`).
- In every canonical sector the bare records, where they exist, are the sector's communication lines, not its
  trade lines: Spinward Marches has 91 bare, 16 `SwCf`, 13 `ZhCo`, 7 `DaCf`, and nothing typed.

### 2.3 Shape of the records
- Length, all records (parsecs: count): 1: 2,620 · 2: 3,996 · 3: 3,730 · 4: 3,448 · 5: 51 · 6: 7 · 0: 1.
- Length, bare records: 1: 470 · 2: 1,090 · 3: 1,146 · 4: 743 · **5: 11**. The eleven 5-parsec bare records
  exceed guideline 4.4's "capable of Jump-4" (question 6).
- 219 records (61 bare) have an end hex with no system in the TSV: dropped as edges.
- 1,075 records cross a sector edge through the offset attributes; 153 of those point at a sector with no
  file, all outside the canonical set.

### 2.4 Spinward Marches, the test case
439 systems; 91 bare records giving 86 edges after dropping five whose far end is outside the loaded sector or
on no system; 89 systems on the bare network. Regina 1910 is A788899-C with bases `NS`. Six worlds carry the
Way Station code `W`; **all six are on bare routes**. 66 worlds carry a Scout base. From Regina on bare routes
alone, with the cited mean jump time and no hold: 28 systems within 60 days, 81 reached in all (147 days to
the farthest). Across the whole chart the bare network connected to Regina spans **1,817 systems**, the farthest
1,001 days away (143 legs).

## 3. What I measured
Probe: `.tmp/xboat_probe/probe.mjs` (read-only over `universe/raw/`), output `.tmp/xboat_probe/out.txt`. Node
v24.19.0 on Johnny's desktop (32 logical cores; not a laptop: multiply by two to three for one, by four for the
no-GPU Edge at the throttle in `findings/perf/stream_l_long_tasks.md`). Weights were placeholders (7 days an
X-boat leg; 14 days an off-network leg) so the counts of reached systems are illustrative; the sizes and the
timings do not depend on the weights. Dijkstra is a binary heap over CSR typed arrays; medians of five runs.

| Sector set | Systems | Bare edges | Off-network J | Off edges | CSR bytes | Build ms | Dijkstra ms, no horizon | reached | Dijkstra ms, 60-day horizon | within 60 d |
|---|---|---|---|---|---|---|---|---|---|---|
| Spinward Marches | 439 | 86 | 0 | 0 | 6,648 | 0.7 | 0.03 | 81 | 0.03 | 28 |
| | | | 1 | 455 | 13,928 | 1.5 | 0.15 | 335 | 0.02 | 63 |
| | | | 2 | 1,323 | 27,816 | 1.3 | 0.18 | 433 | 0.11 | 114 |
| | | | 3 | 2,513 | 46,856 | 3.3 | 0.11 | 439 | 0.02 | 159 |
| 3 × 3 block (Ziafrplians, Gvurrdon, Tuglikki, Foreven, Spinward Marches, Deneb, The Beyond, Trojan Reach, Reft) | 3,212 | 205 | 0 | 0 | 41,828 | 1.3 | 0.02 | 183 | 0.01 | 28 |
| | | | 1 | 3,001 | 89,844 | 7.9 | 0.13 | 721 | 0.02 | 63 |
| | | | 2 | 9,006 | 185,924 | 10.2 | 0.54 | 3,071 | 0.02 | 115 |
| | | | 3 | 17,759 | 325,972 | 12.7 | 0.62 | 3,114 | 0.03 | 167 |
| all 399 canonical | 159,869 | 2,393 | 0 | 0 | 1,956,720 | 102 | 0.38 | 1,817 | 0.16 | 28 |
| | | | 1 | 197,904 | 5,123,184 | 471 | 1.1 | 9,233 | 0.15 | 63 |
| | | | 2 | 589,702 | 11,391,952 | 643 | 14.2 | 73,234 | 0.13 | 115 |
| | | | 3 | 1,168,447 | 20,651,872 | 875 | 16.3 | 76,541 | 0.11 | 167 |
| all 512 | 180,312 | 3,460 | 0 | 0 | 2,219,108 | 80 | 0.21 | 1,817 | 0.14 | 28 |
| | | | 1 | 214,548 | 5,651,876 | 541 | 6.2 | 9,233 | 0.22 | 63 |
| | | | 2 | 640,364 | 12,464,932 | 1,063 | 18.9 | 73,536 | 0.15 | 115 |
| | | | 3 | 1,267,575 | 22,500,308 | 1,517 | 28.6 | 76,846 | 0.22 | 167 |

Readings:
- **Run time is never the problem.** Under 1 ms for anything a referee opens; 14 to 29 ms for a run over the
  whole chart with no horizon; 0.2 ms with a 60-day horizon at any size.
- **Build time is the only long task**, and only for the whole chart (0.5 to 1.5 s). One sector or nine builds
  in 1 to 13 ms. If the whole chart is ever wanted it is a worker job (spec §5 Z2).
- **Memory** is 28 KB (a sector), 186 KB (nine), 11 to 12 MB (the chart) at jump-2 off-network.
- **Data is the real cost.** Routes live only in `sectors/<slug>/index.json` (400 files, 84 KB on average,
  33.7 MB in all, immutable per version). Nine sectors is nine indexes the map mostly holds already; the chart
  is 400 and is not acceptable in a browser. `overview.json` (1.4 MB, already loaded for the zoomed-out map)
  gives every system's presence per hex, so the node set never needs an index; only the edges do.
- **Precompute, when it is wanted:** a `truth/<v>/routes.json` of every record's `Start`, `End`, offsets,
  `Type`, `Allegiance`, `Color`: 13,853 records, about 500 KB as JSON and under 100 KB gzipped; the 3,728
  records with no `Type` and no `Allegiance` pack to 22 KB as three `Uint16` each. With it and the overview, the
  whole-chart graph builds with no index. Not needed for the sizes a referee uses: v1 loads sectors as the
  frontier reaches them, capped at nine (spec §2).

## 4. The design in one paragraph
A graph of systems (nodes from the overview, edges from the route records under a chosen rule plus
within-N-parsecs commercial edges), weights in days from a ten-row parameter table whose only cited entries are
the jump duration and the trade-route reach, Dijkstra with a horizon from the source at the campaign date, run
three times for earliest, likely and latest; a layer on its own canvas that tints reached systems by the age of
the news and runs the ripple along the X-boat lines by lerping each edge between its ends' arrival days; a
scrubber in the time-controls look with Today marked from the campaign clock; a hover sentence with the date;
the reverse run from the party's hex; "Spread this news" on any record or entry with a date and a place;
players run it on public data and their own projection. Phases A1, A2 (pure, tested, Lane A), D1, D2, D3
(the chart, Lane D), E1 (words), A3 (players), Z1 to Z3 (precompute, worker, stored parameters and variants)
in `spec_xboat_ripples.md` §5.

## 5. Alternatives I did not pick
| Alternative | Why not |
|---|---|
| Treat "what the chart draws in the X-boat colour" as the network | 5,794 of those 9,254 records are typed Trade or Core Route; the bare set is the one that matches the Way Stations and the Imperial sectors. Kept as a selectable rule (`chart`) for a referee who wants it |
| Breadth-first search in legs, not days | a leg is a cited duration and the off-network legs differ from X-boat legs; days are what the referee asks about, and Dijkstra costs the same |
| Flood over hexes (cellular automaton, one step per day) | the network is sparse and the frontier must follow lines; a hex flood over 180,000 hexes a day for 60 days is far more work and gives no better answer |
| Precompute all-pairs arrival times at truth build | 180,000² is out of the question; per-source Dijkstra is 0.2 ms with a horizon |
| A server endpoint | the prompt asked for the browser only; the data is public and the maths is under a millisecond; a server adds cost and a round trip for nothing |
| Monte Carlo per leg as the default | earliest, likely, latest gives the range a referee needs for a tenth of the work and a deterministic picture; Monte Carlo stays a Z option (question 10) |
| Boat schedules | nothing in the rules gives a period; the time-dependent edge is a small change when one exists (question 10) |
| Tinting through the chart's own route pass | the ripple animates; the chart's route pass is cached per index and must not redraw per frame. The layer pattern (`map/traffic.ts`) exists for exactly this |
| A Web Worker in v1 | one sector or nine builds in under 13 ms and runs in under 1 ms; a worker is for the whole-chart build only (Z2) |
| Per-campaign parameters in v1 | `CampaignSettings` is strict; a new key is a schema, DO and panel change; the first version uses Johnny's numbers in code (question 9) |

## 6. The parameter table (every cell cited or asked)
| Key | Meaning | Default and source | Question |
|---|---|---|---|
| `jumpHours` | one jump | 148 + 6D hours, `rules/mgt2e_space_travel.json` `jump.durationHours`; earliest 154, likely 169, latest 184 | 2 |
| `xboatLegHours` | one X-boat leg | the same cited jump; nothing says an X-boat is faster or slower | 2 |
| `stationHoldHours` | the wait at a station for the next boat | **none found**; 0 until Johnny gives one, and the hover says so | 3 |
| `xboatMaxParsecs` | a route longer than this is not one X-boat leg | 4, `guideline_4_4` line 5 ("capable of Jump-4") | 6 |
| `xboatRouteRule` | which route records are the network | `bare` (no Type, no Allegiance, no Color) plus `Type="Xboat"` | 1 |
| `offNetworkOn` | commercial traffic carries news between nearby systems | on | 4 |
| `offNetworkParsecs` | two systems this close trade | 2, `2eWorldCreation.txt` 126 to 135 (trade routes need a jump-1 or jump-2 route) | 4 |
| `offNetworkWaitHours` | the wait for a ship going the right way | **none found**; until given, X-boat only, and the picture says so | 4 |
| `horizonDays` | the scrubber's last day | 60 (Johnny's "day 0 to day 60"; product, not a rule) | — |
| `sectorCap` | sectors loaded for one ripple | 9 (product) | — |

## Questions for Johnny
Each with my recommended answer first. 1 to 4 set the defaults the first items build with; the rest can wait.

1. **Which route records are the X-boat network?** Recommended: the **bare** records (no `Type`, no
   `Allegiance`, no `Color`) plus the fifteen with `Type="Xboat"`. Evidence: the bare records are the Imperial
   sectors' lines (Core 166, Vland 118, Spinward Marches 91, Deneb 66 and 35 more canonical sectors); all six
   Way Stations in Spinward Marches sit on them; the typed Trade and Core Route records (5,794 of the 9,254 the
   chart draws in X-boat green today) are trade lines, not communication lines. Under this rule the Zhodani,
   Aslan, Solomani and Vargr sectors (220 canonical) have no X-boat network and news there moves off-network
   only. The rule is a parameter; a referee can pick "what the chart draws" or add allegiance codes (a Zhodani
   campaign's `ZhCo` lines as its fast lane). Where I looked: `map/route_lines.ts`, `legacy_map_inventory.md` §4,
   `packages/generation/src/route_colours.ts`, all 512 XML files. Nothing in `rules/` or `assets/` names which
   drawn line is an X-boat line; `2eWorldCreation.txt` 126 to 135 only says communications routes are drawn as
   single lines. (The chart's X-boat colour itself is not changed by this; B1 of `decisions.md` is a separate
   matter.)

2. **How long is one X-boat leg?** Recommended: one jump as the rules give it, 148 + 6D hours
   (`rules/mgt2e_space_travel.json`, from your answer of 2026-10-06), shown as earliest 154 h, likely 169 h
   (the mean of the dice, 7.04 days), latest 184 h. Nothing in `rules/` or `assets/` says an X-boat jumps
   faster or slower than any other ship, and `guideline_4_4` line 5 only gives its reach (jump-4). If you want
   one number instead of a range, say which (the mean is my pick). The dice are not rolled: the three fixed
   values are arithmetic over the cited rule.

3. **How long does a message wait at a station before the next boat leaves?** Recommended: **0 hours until
   you give a number**, and the hover says "no station hold" so nobody mistakes the picture for a rule. Where I
   looked: `assets/2eWorldCreation.txt` 1320 to 1326 names the Way Station and says nothing about timing;
   `assets/trade.txt` 267 to 293 is about mail as freight; `rules/` has nothing. Any value you give (a flat
   number of hours, or hours by Way Station versus a plain stop) is one row in the table and no code change.

4. **Does news spread off the network, and how?** Recommended: **yes**, by commercial traffic between systems
   within **2 parsecs** (the only cited reach: `2eWorldCreation.txt` 126 to 135, trade routes need "a jump-1 or
   jump-2 route"), each leg costing the cited jump time **plus a wait for a ship** that is nowhere in the rules.
   Until you give the wait (hours, flat), the picture runs **X-boat only** and the control says so. If you
   would rather the reach follow the route data (a jump-1 main as drawn), say so: that is a different rule and
   a different edge set, both buildable. Where I looked: `guideline_4_4` (Mongoose: pairs within 4 parsecs with
   a jump-1 or jump-2 path; T5: jump-4 between important worlds), `2eWorldCreation.txt` 236 to 250.

5. **Are routes two-way?** Recommended: **yes**. The records have `Start` and `End` but the legacy and the
   current chart draw one undirected line; nothing in the rules speaks of direction. A one-way network would
   make the reverse question ("how old is the news here") a second run on the reversed graph, which is cheap
   if you ever want it.

6. **Eleven bare routes are 5 parsecs long, past guideline 4.4's "capable of Jump-4".** Recommended: **keep
   them as one leg each** (the data is the network, and `xboatMaxParsecs` lets a referee drop them). The
   alternative is to split them or drop them; both change the chart's network on a guideline, which I would
   not do without your word. The eleven are listed by the probe if you want them.

7. **Where does the button live?** Recommended, all four, in this order: the command palette ("How fast does
   news travel from here", runnable with a system selected); a **News** button in the dossier's actions beside
   **Orbits**; **"Spread this news"** on a record or journal entry that has both a date and a place; **"How old
   is the news here"** on the Party tab's Where card for the reverse. If you want fewer, the palette and the
   dossier button are the two that matter.

8. **Can players run it?** Recommended: **yes, anywhere on the chart**, and "Spread this news" on the records
   and entries in their projection. The graph is public truth data, the run is in the browser, nothing is
   stored, and the party's place is already on their Where card; it reveals nothing the chart does not. A
   referee-only record never reaches a player, so it has no button for them. The parameters are read-only for
   players.

9. **Per-campaign parameters now or later?** Recommended: **later**. The first version holds your answers to 1
   to 4 in code (one table, one file). A referee's own values mean a `news` key on `CampaignSettings` (schema,
   Durable Object, a settings card): a stored-data change, so a proposal first (spec §5 Z3).

10. **Boat schedules and random spread?** Recommended: **not in the first version.** Earliest, likely and
    latest already give the range; a schedule needs a boat period that is nowhere in the rules; a seeded
    Monte Carlo (6D per leg per run, 20 runs, percentiles) is a Z item of a day if you want the fuzzy edge.
    Both fit the same Dijkstra.

11. **Write `routes.json` at truth build?** Recommended: **only when you ask for a ripple across the whole
    Imperium.** For a sector or nine the map's own indexes are enough and nothing new is stored. The whole
    chart needs all 400 indexes (33.7 MB) or one new file of under 100 KB gzipped at build time, plus a worker
    for the 0.6 to 1.5 s build. A truth version bump either way.

12. **The builder's own routes.** Recommended: **out of scope.** A referee's own sector carries
    `metadata.routes: []` in its index today and the map does not read the overlay's `routes` list, so the
    ripple in an own sector is off-network only. When own routes reach the chart they join the graph with no
    change to this design.
