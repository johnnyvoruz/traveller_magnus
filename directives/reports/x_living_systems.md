# X living systems spec — report
Prompt: prompts/x_living_systems_spec.md
Status: done (read-only on code; `directives/spec_living_systems.md`, this file, and
`findings/living_systems/` written)

Written 2026-10-17 by the one-session review on the strongest model. Every fact names a file and a
line as the tree stood on 2026-10-17. Nothing in `apps/`, `packages/`, `tests/` or `rules/` was
changed; no git, no deploy, no production command.

## Changed files
- `directives/spec_living_systems.md`: the spec, sections 1 to 5 (chatter, the LLM hook, background
  traffic, the switches, the build plan).
- `directives/reports/x_living_systems.md`: this file (research, alternatives, the dial table, the LLM
  cost table, the questions).
- `findings/living_systems/chatter_sample.json`: 100 lines in the schema.
- `findings/living_systems/check_sample.mjs`: the self-check (run from the repo root with
  `node findings/living_systems/check_sample.mjs`; passes: 100 lines, every slot resolves, every
  condition a known field, eligible lines per starport fixture A 57, B 54, C 43, D 25, E 11, X 5).
- `findings/living_systems/chatter_schema.md`: the schema notes, the citations per condition, the
  split for 1,000 lines.
- `directives/prompts/x_living_systems_spec.md`: progress lines appended.

## Gates
npm test:      not run (no code changed)
npm run check: not run (no code changed)
typecheck:     not run (no code changed)
fourth gate:   `node findings/living_systems/check_sample.mjs` pass

## Contract published
none (the settings change in spec section 4 is one zod field; Lane B's `b_party_ships.md` is not
touched)

## Needs from others
- The orchestrator: turn the spec's section 5 into stream items after Johnny answers section 6 below.
- Lane Z (the X-boat ripples spec, running in parallel): one shared definition of "a hex on the
  X-boat network" (question 4 here); whichever session answers first, the other follows.

---

## 1. Research, with sources

### 1.1 What the rules text gives, line by line
Read in full: every file in `rules/` (the 21 guideline and logic pages, `mgt2e_data.js`,
`mgt2e_space_travel.json`, `mgt2e_climate_bands.json`, the two sheet field files, `rtt_worldgen.md`
headings) and `assets/trade.txt`, `assets/2eWorldCreation.txt`. What bears on this spec:

| Quantity | Where | What it says |
|---|---|---|
| Passenger Traffic table and its DMs | `assets/trade.txt:84-127`, table 136-157 | 2D, four rolls; world DMs: Pop ≤1 −4, 6–7 +1, 8+ +3; Starport A +2, B +1, E −1, X −3; Amber +1, Red −4; each parsec past the first −1 |
| Freight Traffic table and its DMs | `trade.txt:172-189`, table 241-262 | 2D, three rolls; world DMs: Pop ≤1 −4, 6–7 +2, 8+ +4; A +2, B +1, E −1, X −3; TL ≤6 −1, TL 9+ +2; Amber −2, Red −6 |
| Mail and the x-boat service | `trade.txt:267-294` | mail "not vital enough to be entrusted to the x-boat service or a private courier"; the Mail table's DMs are keyed to the Freight Traffic DM (Johnny ruled the total DM, ZT0 Q8) |
| Refuelling at gas giants | `2eWorldCreation.txt:240-244` | ships "jump only to systems where they can refuel; either to a starport or a system with a gas giant or water-bearing worlds where unrefined fuel can be skimmed" |
| Starports: downports, shuttles, highports | `2eWorldCreation.txt:1097-1106` | "Ships that cannot land at a downport are serviced by a fleet of shuttles"; "Worlds advanced or rich enough may possess a highport" |
| Starport Facilities table | 1129-1160 | A refined fuel, shipyard (all), repair, highport 6+; B refined, shipyard (spacecraft); C unrefined, shipyard (small craft); D unrefined, limited repair; E none; X no starport |
| Frontier port, berthing weekly | 1163-1170 | "a bare spot of bedrock, marked with a beacon"; berthing "due weekly" |
| Highport DMs | 1192-1194 | DM+1 TL 9–11, +2 TL 12+, +1 Pop 9+, −1 Pop 6− (the engine rolls it; the app reads `starportProfile`) |
| Bases | 1292-1327 | C corsair, D depot, M military, N naval ("always guarded by armed vessels... advanced hospital"), S scout ("an excellent place to pick up rumours and news"), W way station ("dedicated to the x-boat communication network") |
| Travel Codes | 1328-1336 | Amber: dangerous, "be on their guard"; Red: interdicted, "travel to them is forbidden... enforced by the Imperial Navy" |
| Atmosphere table | 309-318 | 2, 4, 7, 9 tainted (filters); 2, 3 respirators; 0, 1 vacc suit |
| Population table | 503-512 | 1 "a tiny farmstead", 2 "a village", 4 "small town", 5 "average city", 7 "large city", 9 "present day Earth" |
| Government 0 and 1 | 535-558 | 0 "No government structure", 1 "Company/Corporation" |
| Law Level table | 967-1004 | 2 energy and laser weapons; 6 all firearms except shotguns and stunners; 9+ all weapons, all armour |
| Trade code definitions | `rules/mgt2e_data.js:144-163` | the 18 codes with their UWP ranges |
| Base targets by starport | `rules/mgt2e_data.js:91-110` | military A/B 8+, C 10+; naval A/B 8+; scout A 10+, B/C 9+, D 8+; corsair D 12+, E/X 10+ |
| Jump limit, jump duration, travel formula | `rules/mgt2e_space_travel.json` | `limitDiameters: 100`; `durationHours 148 + 6D`; `seconds = 2 * sqrt(metres / (G * 10))`; the Transit Times table at 1 to 6 G |
| Guideline 4.4 (trade density) | `rules/guideline_4_4_trade_density_and_interconnectivity.md` | CT: comms routes at J-2/J-3, "X-Boat routes follow these paths and are capable of Jump-4"; MgT2E: WTN "used to determine the volume of passenger and freight traffic"; T5: an "Expected Ship Traffic Table" maps Importance to ship volume. **None of these tables is in `rules/`**: the guideline names them, the data files do not hold them |

What the text does **not** give: how many ships are at a port at once, where a ship comes out of
jump, how long a ship stays docked, how often an x-boat calls, whether a scout base hosts x-boats
(a way station does; a scout base is "for scout ships"). Each is a dial or a question below.

### 1.2 What the app gives
- The orbit view already places ships from dated legs (`orbit/ships.ts placeShips`, 121-153), draws
  a `'traffic'` kind in `--text-muted` (`OrbitRenderer.ts:2417`), shows arrival and departure bubbles
  for `jump` legs (`paintBubble`), stacks docked ships beside a body (`dockedBeside`), answers the
  mark under the pointer (`shipAt`) and whether a mark is outside every 100D ring
  (`ship_marks.ts shipStanding`). The dev stand-in (`standInMarks`, 352-452) is the model for a looped
  schedule but is dated on a 16 s wall loop and is dev-only.
- The public traffic scope (`map/traffic.ts`, `map/public_games.ts`, `MapRenderer.hexTracks` 609 and
  `farTracks` 712) is a separate canvas of lime diamonds fed by `GET` public games per sector. Nothing
  in this spec touches it.
- `SectorHex` (`packages/shared/src/schemas/truth.ts:5-18`) carries name, uwp, allegiance, zone,
  bases, tradeCodes, pbg, ix for every hex, so most chatter conditions are known before the tree loads.
- `highportOf` (`orbit/highport.ts:58-64`) reads "H Y" from `starportProfile` and assumes no highport
  without a profile.
- `CampaignSettings` (`schemas/campaign.ts:323-331`) is stored whole; `players_view.ts:335-356` passes
  it to players minus `rev`.
- `hashString` and `mulberry32` exist in the browser already (`surface/vanilla/map.ts`, used by
  `surface/map_chunks.ts:44`), the same functions as `packages/engines/src/core/rng.js:7-21`.
- The clock: `orbit/clock.ts` (`totalDays`, `splitDays`, speeds from real time to 365 d/s), the
  campaign date in `stardate.ts` (DDD-YYYY, day 001 the Holiday).
- Long-task budget: `findings/perf/stream_l_long_tasks.md` (Lane L, L5): the orbit view's first frames
  are the costly ones; a per-frame layer must stay under a millisecond.
- Route data: `universe/raw/*.xml` `<Route>` records carry `Type` on about 6,000 of 13,700 records
  (`Trade` 2,873, `Core Route` 2,563, `Commercial` 265, `Xboat` only 15, all in
  `The_Beyond_Don_McKinney_2015.xml`); Spinward Marches, Core and Deneb carry **untyped** routes (128,
  167, 67). `route_lines.ts:62` colours an untyped route with no `Color` or `Allegiance` as `xboat`.

### 1.3 Prices fetched 2026-10-17 (section 4 has the table)
Claude: https://claude.com/pricing and https://platform.claude.com/docs/en/about-claude/pricing.
OpenAI: https://developers.openai.com/api/docs/pricing. Google: https://ai.google.dev/gemini-api/docs/pricing.
Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/platform/pricing/ (page dated
2026-10-15).

## 2. Alternatives not picked

| Picked | Not picked | Why |
|---|---|---|
| Conditions as data (`when` with ranges and lists) | tags on lines ("highport", "busy") resolved by a tag table | a tag hides the rule it stands for; a range cites it and the checker can read it |
| A weighted deterministic shuffle per (system, day) | a Markov chain of categories, or time-of-day slots | more machinery for no visible gain at one line a minute; the shuffle is a pure function with a one-line test |
| The ticker as a docked one-line strip | a scrolling marquee; a log panel; toast messages | a marquee is motion for its own sake and fails reduced motion; a log invites reading, which is not the point; toasts are for the app's own messages (manifesto: one toast) |
| The activity index borrowed from the Freight Traffic DMs | WTN (`mgtSocio.WTN`), or T5 Importance | WTN is in the socio block only for MgT2E systems with socio built; Importance is T5's; the freight DMs are in `assets/` for every edition's UWP and cite line by line. WTN is the better long-term dial once `rules/` holds the WTN-to-traffic table (question 2) |
| Ships as `ShipTrack` legs placed by `placeShips` | a separate particle layer with its own motion | one placement code path, one hit test, the bubbles and the 100D standing for free |
| The edge as 1.15 × the mainworld's 100D | a fixed AU; the star's 100D; the picture's margin | the mainworld's ring is the one the view already draws and the one the party's own jumps use |
| `living` in the campaign settings document | columns on `universes` (like `show_course`) | no migration, players get it through the projection as built, one commit path |
| No chart hint at the system tier | a faint halo or a second diamond style | Johnny's 2026-10-14 clutter ruling and the scope's meaning ("real tracks") |
| One call per system per day, KV-cached, written lines as fallback | a call per visit; a nightly batch over every inhabited system | per visit scales with users not systems and is uncacheable; a nightly batch over 512 sectors is 10,000+ calls a day for systems nobody opens |

## 3. The dial table (presentation dials, no rules meaning; for Johnny to approve, question 1)

| # | Dial | Default | Range | Where it bites |
|---|---|---|---|---|
| 1 | ships drawn at once, the cap | 12 (plus 2 shuttles) | 0 to 20 | spec 3.2, 3.7 |
| 2 | the activity index | the Freight Traffic world DMs (`trade.txt:175-189`) summed for this world; the count is `round(clamp((index + 4) / 12, 0, 1) × dial 1)` | any monotone map | 3.2; question 2 |
| 3 | civilian ships at class X and in a Red zone | none (patrols only in Red, cited) | none / a trickle | 3.2 |
| 4a | liner share | 1 in 4 of the count, at most 3; only at Pop 8+ or starport A or B | 0 to half | 3.2 |
| 4b | patrols | 1 with a naval base; 2 in a Red zone | 0 to 4 | 3.2 |
| 4c | scouts | 1 with a scout base or way station | 0 to 2 | 3.2 |
| 4d | x-boats | 1 with a way station, or on the network (question 4) | 0 to 2 | 3.2 |
| 4e | shuttles | 2 with a highport | 0 to 4 | 3.2 |
| 4f | traders | the remainder | | 3.2 |
| 5 | dock hold | 6 to 30 h, seeded | 1 h to 7 d | 3.4 |
| 6 | share of traders that go to the gas giant to skim | 1 in 3 | 0 to all | 3.4 |
| 7 | the edge: where ships arrive and leave | 1.15 × the mainworld's 100D radius, seeded bearing | 1.05 to 2 | 3.4; question 5 |
| 8 | flight acceleration | 2 G | 1 to 6 G (the Transit Times columns) | 3.4 |
| 9 | the clock rate above which only docked and orbiting ships are drawn | 2 d/s | 0.25 to 30 d/s | 3.4 |
| 10 | chatter cadence | first line after 4 s, then one every 45 s | 15 to 180 s | 1.5 |
| 11 | distress weight | 0.2 (the others 1) | 0.05 to 1 | 1.2 |
| 12 | the ticker's width | at most 60% of the stage | 40 to 100% | 1.6 |
| 13 | lines from the LLM mixed with written lines | 2 written to 1 generated | | 2 |
| 14 | daily cap on model calls | 2,000 | | 2 |
| 15 | the day bucket | 1 campaign day | 0.5 to 7 | 3.5 |

## 4. The LLM cost table

Prices per million tokens, fetched 2026-10-17 from the vendors' own pages (URLs in 1.3). The
workload: 1,000 systems opened a day, one call each, about 600 input tokens (a cached 400-token
system prompt plus the facts) and 400 output tokens (12 lines). Monthly is 30 days.

| Model | Input | Output | Cache read | Batch | $/day at 1,000 calls | $/month | With the system prompt cached | With batch |
|---|---|---|---|---|---|---|---|---|
| Claude Haiku 5.5 (prompts ≤ 100K) | $0.10 | $0.50 | $0.01 | 50% off | $0.26 | $7.80 | about $6.80 | about $3.90 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | 50% off | $2.60 | $78 | | $39 |
| GPT-5 nano | $0.05 | $0.40 | $0.005 | 50% off | $0.19 | $5.70 | about $5.20 | about $2.85 |
| GPT-5 mini | $0.25 | $2.00 | $0.025 | 50% off | $0.95 | $28.50 | | $14.25 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.01 | 50% off | $0.22 | $6.60 | about $5.50 | about $3.30 |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 | $0.025 | 50% off | $0.75 | $22.50 | | $11.25 |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | $0.03 | 50% off | $1.18 | $35.40 | | $17.70 |
| Workers AI Llama 3.2 3B (`@cf/meta/llama-3.2-3b-instruct`) | $0.051 | $0.335 | none | none | $0.165 | $4.95 | | |
| Workers AI Llama 3.1 8B fp8 fast | $0.045 | $0.384 | none | none | $0.18 | $5.40 | | |
| Workers AI Granite 4.0 micro | $0.017 | $0.112 | none | none | $0.055 | $1.65 | | |

Notes. Workers AI also gives 10,000 free Neurons a day on the paid plan, which covers part of a
small workload; the Neuron rate per token is not stated per model on the page, so it is left out.
At a realistic 250 calls a day (50 referees, 5 systems each) every row is under $2 a month. The
KV cache (Workers KV reads are in the Workers Paid plan's allowance at this volume) makes the
second visitor to a system on a day free. The Workers AI small models are the cheapest and need
no key, but a 3B model follows a JSON schema less reliably than Haiku 5.5 or GPT-5 nano; the
fallback to written lines covers that.

**Recommendation.** Claude Haiku 5.5 or GPT-5 nano with the system prompt cached: about $7 a month
at a thousand systems a day, under $2 at today's scale. Start when Epic P is live and the written
1,000 are in, with the daily cap and Johnny's billing alert first (question 15).

## 5. Halt & Challenge items raised (each is a question in section 6)
1. How many ships are at a port: no table in `rules/` or `assets/` (the guideline names T5's
   Expected Ship Traffic table and MgT2E's WTN, neither is in the data). Dial 2 (question 2).
2. Where a ship comes out of jump: no rule in the text. The app's convention (question 5).
3. Which hexes are on the X-boat network: the raw routes are typed in some sectors and not in the
   Marches; `route_lines.ts` colours the untyped ones as `xboat` (question 4).
4. Whether a scout base hosts x-boats: the text gives the way station to the x-boat network and
   the scout base to scout ships; the spec follows the text (x-boats at W only, plus the network
   answer) (question 4).
5. Gas giant skimming: cited (`2eWorldCreation.txt:240-244`); no halt.
6. Weapons notices by law level: the lines are in-world notices conditioned on the Law Level table;
   they state no rule. If Johnny prefers no law conditions at all, the five customs lines that use
   them drop (question 9).

## 6. Questions for Johnny (recommended answer first)

1. **The dial table (section 3) as a whole.** Recommended: approve all fifteen as presentation dials
   with no rules meaning; each can be changed later in one constant. If any one should instead come
   from a rule, say which and the lane leaves it a dial until the rule is in `rules/`.
2. **The activity index.** Recommended: use the sum of the Freight Traffic world DMs
   (`assets/trade.txt:175-189`) as the index that scales how many ships are drawn, named in the code
   as a presentation dial that borrows the table's shape. Alternative: wait for a WTN-to-traffic
   table in `rules/` (Lane Z's trade draft does not hold one) and draw a flat count until then.
3. **Civilian ships at class X worlds and in Red zones.** Recommended: none; a Red zone draws
   patrols only (cited: interdictions are enforced by the navy). Alternative: a trickle at X worlds
   with population.
4. **What counts as "on the X-boat network" for chatter and the x-boat ship** (shared with the
   ripples spec, which names it the parameter `xboatRouteRule`, `spec_xboat_ripples.md` section 1.3).
   Recommended: a way station base (W, cited) **or** a route record touching the hex under
   `xboatRouteRule` at its recommended value `bare` (no `Allegiance`, no `Type`, no `Color`, plus any
   `Type="Xboat"`); `Core Route` and `Trade` records do not count. One answer serves both specs.
   Alternative: W bases only, which gives the Marches very few x-boats.
5. **Where ships arrive and leave.** Recommended: a point just outside the mainworld's 100D circle
   (1.15 times its radius, dial 7), the same convention the party's own jumps use. Alternative: the
   star's 100D circle.
6. **The role triggers.** Recommended: patrols at naval bases and in Red zones, scouts at S and W,
   x-boats per question 4, shuttles with a highport, liners at Pop 8+ or starport A or B, traders
   everywhere else (each cited in spec 3.2). Say if any should be dropped or added.
7. **The ticker's place and the chart.** Recommended: a one-line docked strip at the orbit stage's
   lower left; one line under the dossier header; nothing drawn on the chart at the system tier.
   Alternative: a faint hint on the chart as well, which risks the clutter you ruled against on
   2026-10-14.
8. **Players.** Recommended: players hear the same chatter and see the same ships as the referee
   (the switch rides in the projection; chatter reads no record, so nothing hidden can reach it),
   and may quiet their own device. Alternative: referee only.
9. **The sample's tone and the categories.** Recommended: approve `chatter_sample.json` as the
   tone for the 1,000 and the nine categories with the split in `chatter_schema.md`. Say what to
   change (drier, funnier, longer, no law-level customs lines, other categories) and Lane E writes
   to it.
10. **Where the switches live.** Recommended: a `living` object in the campaign settings document
    (one zod field, no migration, reaches players as built). Alternative: two columns on
    `universes` with a migration, as `show_course` was done.
11. **Who writes the 1,000 lines.** Recommended: Lane E writes them by hand to the split (about a
    day of a stream), so the fallback set is yours and the tone is one voice. Alternative: generate a
    first draft with a model once (about $0.50 at the prices above) and have E edit it; faster, and
    "when it gets cheap enough" suggests you would rather not yet.
12. **The per-device words and place.** Recommended: "Quiet on this device" in the account menu,
    and a "Traffic" chip in the orbit view's Layers drawer that quiets traffic only.
13. **Ship names.** Recommended: two-word names from a new word list in the engines core and a copy
    in shared (never the system name pool, so no ship is named after a nearby world). Say if you
    want a style ("Far Margin", "Blue Runner" are the model).
14. **The hover line on a background ship.** Recommended: name, role in words, and one `ship`
    chatter line; nothing to click. Alternative: name and role only.
15. **When the LLM hook starts.** Recommended: after Epic P is live and the 1,000 lines are in,
    with the daily cap (2,000 calls) and a billing alert at a figure you pick, on Claude Haiku 5.5 or
    GPT-5 nano; expected cost under $2 a month at today's scale, about $7 at a thousand systems a day.
    Alternative: never, the written lines are enough; or Workers AI's small models at about $5 a
    month with no key, accepting weaker JSON discipline.
