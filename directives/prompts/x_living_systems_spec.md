# One expensive session — systems that feel alive: chatter and background traffic, the spec

Issued 2026-10-17 19:15 by the orchestrator, for a single session on the strongest model available, at high effort.
You may be a fresh session with no memory. **Read-only on code; you write only the files named under Write.** No git
but read-only, no deploy, no production commands, nothing in `rules/`, `js/`, `hex_map.html` or `style.css`.

## Why (Johnny, 2026-10-17 19:10, his words)
"Another feature I want to have is two options for refs that will make the systems feel more alive, I want to
generate like 1,000 various system "chatter" lines that will give life (when it gets cheap enough, I'll want to send
actual system data to a cheap LLM and generate actual chatter that's reactive to what's going on) the other option I
want to be able to turn on is other ship traffic in the system, it doesn't have to be real and not tracked via the
universal tracking system. I just want the systems to feel alive. It would depend on the mainworld tech and other UWP
factors that make sense."

Two switches a referee turns on for a campaign: **chatter** (short lines of in-world radio, news and talk while a
system is open) and **background traffic** (ships coming and going in the orbit view and on the chart, made up on the
spot, never stored, never on the public traffic display). Your job is the spec a lane can build from, the first
sample of the lines, and the questions for Johnny.

## Read first
1. `CLAUDE.md` (rules 2 and 3: **Zero-Assumption** and **Halt & Challenge** matter here), `directives/manifesto.md`,
   `directives/decisions.md`, `directives/design_reference.md`, `directives/planet_rendering.md` (the parts on the
   orbit view).
2. What exists: `apps/web/src/orbit/ships.ts` (ship marks on the orbit picture; `ShipKind` already has `'traffic'`
   with a dev-only stand-in), `orbit/OrbitRenderer.ts`, `apps/web/src/map/traffic.ts` and `map/route_lines.ts` (the
   public traffic scope and route lines: the "universal tracking", which this must stay out of),
   `campaign/track.ts` (`positionAt`), the campaign clock and settings (`packages/shared/src/schemas/campaign.ts`),
   `packages/engines/src/core/rng.js` (`mulberry32`, `hashString`, `reseedForHex`: deterministic seeds) and
   `core/names` (the name generator), the dossier model (`apps/web/src/dossier/model.ts`) for what a system knows:
   UWP, starport, bases, trade codes, travel zone, gas giants, belts, the bodies.
3. `rules/` (every file; `npm run rules:gen` output in `packages/engines/src/generated/rules/`) and the sources in
   `assets/` (`trade.txt`: the passenger and freight traffic tables and their DMs; `2eWorldCreation.txt`: starports,
   bases, the x-boat station line near 1325). Lane Z's trade draft is `findings/rules_drafts/mgt2e_trade.json`.
4. Epic P: `directives/players_build_plan.md` (players will see the campaign; say what they see of these switches).

## The rule that shapes everything
**Nothing here may invent a Traveller rule.** Background traffic is presentation, but "how many ships at a class A
starport" or "where a ship jumps from" sound like rules. For each quantity you need, either cite a table in `rules/`
or `assets/` (the traffic tables in `trade.txt` are the obvious candidates: name the line) or mark it plainly as a
**presentation dial** with no rules meaning (e.g. "ships drawn at once: 3 to 12, scaled by the cited traffic roll's
range"), and list every dial in a table for Johnny to approve. Where a rule is needed and absent (for example the
jump-point distance, or whether a scout base hosts x-boats), write a numbered Halt & Challenge question; never fill it
from memory.

## Do
1. **Chatter, the content:**
   - Categories (for example traffic control and docking, customs and law, local news, markets and prices said in
     words not numbers, weather and the world's sky, adverts, ship-to-ship talk, rumours, the odd distress call), each
     with when it may appear: conditions on the UWP and the system (starport class, tech level, law level,
     government, population, trade codes, bases, travel zone, gas giants, belts), the campaign date, and the party
     (in the system, docked, in jump).
   - A **line format**: a JSON schema (zod in `packages/shared`) with slots (`{world}`, `{starport}`, `{ship}`,
     `{sector}`, `{subsector}`, `{date}`, a body's name) and the conditions as data, so a line never claims something
     the system's data contradicts (no highport talk at a class X starport, no ocean weather on a world with
     Hydrographics 0). Name the slot sources in the dossier model.
   - Tone: in-world, short (one or two sentences), varied voices, no real-world brands, no quoting published
     Traveller text, no Traveller rules or numbers stated as fact, nothing cruel. Original writing only.
   - **Write the first 100 lines** across every category as `findings/living_systems/chatter_sample.json` in your
     schema, with a test-style self-check (every slot resolves, every condition is a known field). The full 1,000 is
     a lane item after Johnny approves the sample's tone; say how to split it so variety holds (counts per category
     and per condition).
   - Selection: seeded by system and campaign time (`hashString(hexKey + day)` style), so two people looking at the
     same system on the same day hear the same line; how often a line appears; never the same line twice in a visit.
   - Where it shows: the orbit view, the dossier, the map at the system tier; a small, dismissible ticker in the
     look (`design_reference.md`), off by default, reduced-motion friendly, never over a control; Google style for the
     switch's words.
2. **Chatter later, from a cheap LLM** (Johnny: "when it gets cheap enough"): design the hook only, not the build:
   what system data is sent (only what the projection allows players to see, if players hear it), the prompt shape,
   caching per system and day so one system costs one call a day at most, the fallback to the written lines, the
   cost per 1,000 systems a day with two or three current cheap models and Cloudflare Workers AI (prices fetched now,
   with URLs and the date), and the abuse and cost guards (`findings/api_mcp_paused.md` must-haves). Recommend when
   it becomes worth it.
3. **Background traffic:**
   - What ships appear (kinds by role: traders, liners, patrols, scouts, x-boats where a route exists, small craft
     to and from the highport and the gas giant), their counts and mix by the system's data, with each quantity cited
     or a dial (see the rule above).
   - Where they move in the orbit view: between the mainworld, its port, gas giants (refuelling), belts, and the
     system's edge for arrivals and departures; motion that reads well at the orbit view's time scales; no physics
     claims. Reuse `orbit/ships.ts` marks (`kind: 'traffic'`), names from `core/names`, ship classes as words only.
   - On the chart: whether a subtle hint of traffic shows at the system tier, and how it stays visibly different from
     the public traffic scope (real tracks).
   - **Never stored, never sent:** generated in the browser from a seed (system + time bucket), nothing in D1, the DO
     or R2, nothing on the public traffic display, zero server cost. Say how the seed keeps it stable while you watch
     and fresh across days.
   - Performance: the 50 ms long-task budget and the frame budget in the orbit view, software rendering without
     WebGL (Lane L's path), the cap on ships drawn.
   - A ship you can hover: a data block with its name, kind and a line of chatter; nothing to click into.
4. **The switches:** where they live (campaign settings, so the referee decides for the table; a per-device "quiet"
   override), what players see under Epic P (the setting rides in the projection), defaults off.
5. **The build plan:** phases for the lanes (A logic and seeds, C or D the orbit view and ticker, E the words and the
   full 1,000 lines, Z anything deep), each with files, tests (pure tests on selection and conditions; a fixture system
   of each starport class; shots at 1600 and 390), gates, and what must be true first.
6. **Questions for Johnny,** numbered, each in full with your recommendation first: every presentation dial, every
   missing rule, the ticker's place, whether players hear chatter, the sample's tone.

## Write
- `directives/spec_living_systems.md`: the spec (1 to 5), ready for the orchestrator to turn into stream items.
- `directives/reports/x_living_systems.md`: the research with sources, the alternatives you didn't pick, the dial
  table, the LLM cost table, the questions (6).
- `findings/living_systems/chatter_sample.json` (100 lines) and its schema notes in the same folder.

Take the time it needs. Being specific is the point: every condition a real field, every number cited or a dial.

## Progress
- done: read the spec inputs (rules, assets, orbit ships and traffic scope, campaign schema, players plan, prices fetched 2026-10-17). next: the sample.
- done: findings/living_systems/chatter_sample.json (100 lines), check_sample.mjs (passes), chatter_schema.md. next: the spec.
- done: directives/spec_living_systems.md and directives/reports/x_living_systems.md (dials, costs, 15 questions). next: nothing; stopped.
