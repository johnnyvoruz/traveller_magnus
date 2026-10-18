# One expensive session — how fast news travels: X-boat traffic and information ripples, the spec

Issued 2026-10-17 19:15 by the orchestrator, for a single session on the strongest model available, at high effort.
You may be a fresh session with no memory. **Read-only on code; you write only the files named under Write.** No git
but read-only, no deploy, no production commands, nothing in `rules/`, `js/`, `hex_map.html` or `style.css`.

## Why (Johnny, 2026-10-17 19:10, his words)
"The other thing I want to figure out is how to best and cheaply simulate how X-Boat traffic would work, and you
could click a button to see how fast information is travelling (almost like ripples from systems). These can be also
given to more high effort models to figure out the best ways to handle this."

In the Traveller setting, news moves no faster than ships, and the X-boat network is the fast lane. A referee clicks a
system and a button, and the chart shows the news spreading outward over weeks: fast along the X-boat routes, slower
off them. A player asks "has word of the coup reached Regina yet?" and the chart answers. Your job: the cheapest
correct way to compute and draw that, as a spec a lane can build, with the questions for Johnny.

## Read first
1. `CLAUDE.md` (rules 2 and 3: **Zero-Assumption** and **Halt & Challenge**), `directives/manifesto.md`,
   `directives/decisions.md`, `directives/design_reference.md`, `directives/legacy_map_inventory.md` (what the map
   draws, including routes).
2. The route data: `apps/web/src/map/route_lines.ts` (route lines, the `'xboat'` colour key), `map/routes.ts`,
   `map/MapRenderer.ts`, `map/truth_client.ts` (what the browser loads: sector indexes, the overview, polities), the
   truth files (`directives/data_model.md`, truth section; `tools/truth/`), and the raw sector files in
   `universe/raw/` (TravellerMap XML: find where routes and their types live, and whether every sector has them).
   Say exactly which sectors carry X-boat routes and which don't.
3. The clock: the campaign date and calendar (`packages/shared/src/schemas/campaign.ts`, `apps/web/src/orbit/clock.ts`,
   `campaign/track.ts`), the timeline, and how a jump's duration is represented today.
4. `rules/` (every file) and `assets/` (`2eWorldCreation.txt` near line 1325 on the x-boat station; `trade.txt` near
   line 272 on mail and the x-boat service). Lane Z's drafts in `findings/rules_drafts/`.

## The rule that shapes everything
**The speed of news is a rule.** How long an X-boat takes per jump, its jump number, how long a station holds a
message before the next boat, how fast ordinary shipping carries news off the network: none of it may come from
memory. Cite `rules/` or `assets/` line by line, or write a numbered Halt & Challenge question for Johnny with the
cell left as a named parameter. Build the whole design so these numbers are **parameters** (one small table the
referee or Johnny sets), and the simulation is correct for any values.

## Do
1. **The model:** a graph of systems; X-boat edges from the route data; off-network edges (commercial traffic
   between systems within some jump distance, the jump number a parameter); a weight per edge in days from the
   parameters. News from a source system at a campaign date reaches each system at the shortest-path time
   (Dijkstra over the graph). Say whether that is enough or whether delays per station, schedules, or random spread
   (a seeded Monte Carlo) add something a referee would notice, and what each costs.
2. **Cheap:** everything in the browser, from data the chart already loads; no server, no stored results. Size the
   graph (systems and edges for one sector, a domain, all 512 sectors), the time to compute at each size on a
   mid-range laptop, and the memory. Precompute what can be precomputed at truth-build time if it helps (say what,
   and its bytes), or show it isn't needed. Load only the sectors the ripple reaches, with a cap.
3. **The picture:** clicking "How fast does news travel from here" on a system (dossier or map command): the chart
   animates rings of arrival time outward, faster along the X-boat lines; a scrubber over campaign days ("day 0 to
   day 60"); each system tinted by how old the news is when it arrives; hover a system for "News from Regina arrives
   here on 123-1105, 18 days later." Fits the look (`design_reference.md`), reduced motion shows the final map
   without animation, the 50 ms long-task budget, software rendering without WebGL. Also the reverse: "how old is the
   news here", the age of news from every system at the party's location.
4. **In a campaign:** tie to the campaign clock and the party's position; whether a journal entry or a record can be
   the "news" (a dated event spreading from its place); how it shows to players under Epic P
   (`directives/players_build_plan.md`): it reveals nothing hidden if the source is a players-visible record.
5. **The build plan:** phases (A the graph and the shortest paths, pure and tested; D the chart layer and the
   scrubber; E the words; Z anything deep), each with files, tests (a fixture sector with known routes and answers;
   timing tests at the sizes above), gates, and what must be true first.
6. **Questions for Johnny,** numbered, each in full with your recommendation first: every parameter that needs a rule
   (with where you looked), the off-network model, whether players can run it, where the button lives.

## Write
- `directives/spec_xboat_ripples.md`: the spec (1 to 5), ready for the orchestrator to turn into stream items.
- `directives/reports/x_xboat_ripples.md`: what you measured (graph sizes, timings from a probe run inside the repo
  under `.tmp/`), the route data's coverage, the alternatives you didn't pick, the parameter table, the questions (6).

Take the time it needs. A design that bakes in a number from memory is a failure; one that can't run on a laptop is
too.
