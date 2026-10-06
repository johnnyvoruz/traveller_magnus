# Agent E — the system page and the world page get separate identities

Issued 2026-10-06 by the orchestrator. You are **Agent E**, a new implementer on
Traveller.voyage. Four other agents are editing this tree while you work. This file says who
you are, exactly which files are yours, and what to build. Read it to the end before you
open any code.

## 1. Before anything else, read

1. `CLAUDE.md` (the repository's rules).
2. `directives/manifesto.md` (short; every line of new code obeys it).
3. `directives/agent_d_brief.md` sections 3, 5 and 6 only: the manifesto as a checklist for
   UI, the traps this kind of work has hit, and the report format. They apply to you. The
   ownership table in its section 2 is Agent D's, not yours; yours is below.
4. `findings/dossier_identities_analysis.md`: the analysis Johnny approved. It is the design.
5. `apps/web/src/dossier/model.ts` in full, then `DossierOverview.vue`, `DossierBody.vue`,
   `DossierPanel.vue`, `SocioBlock.vue`, then `apps/web/src/orbit/card.ts` and
   `orbit/BodyCard.vue`, then `tests/web/dossier_model.test.js`.

You do not need `directives/handoff.md`.

## 2. Who is who

Johnny owns the project, relays prompts and reports, and runs all git. The orchestrator
writes your prompts and reviews your reports. Agent A: campaign logic, the router. Agent B:
the engines' reconciliation. Agent C: the orbit renderer and the surface code. Agent D: the
lead design agent; every other screen is D's.

## 3. Your files, and nobody else's for this step

**You may create and edit only:**

- `apps/web/src/dossier/`, every file **except `DayNight.vue`** (Agent C's);
- `apps/web/src/orbit/card.ts` and `apps/web/src/orbit/BodyCard.vue`;
- `tests/web/dossier_model.test.js`, and new test files of your own in `tests/web/`.

**You may not edit anything else.** In particular: every other file in `orbit/`
(`OrbitCanvas.vue`, `OrbitRenderer.ts`, `ships.ts`, `ShipStrip.vue`, `HeaderClock.vue` and
the rest), `views/`, `workspace/`, `campaign/`, `map/`, `shell/`, `surface/`, `components/`,
`design/tokens.css`, `design/base.css`, `tests/web/contrast.test.js`, `packages/`,
`apps/api/`, `rules/`, `js/`, `hex_map.html`, `style.css`.

- If you need something from a file that is not yours (a prop passed in, a token, a colour
  pair in the contrast test), **do not edit it**: build your side so it works without it,
  and ask for it by name in your report.
- **No git** of any kind, not even `git status`. No `npm install`.
- A failing test in a folder that is not yours is another agent in mid-edit: report it,
  leave it, and run your own test files on their own to show yours pass.
- No Traveller rule or meaning from memory. You are moving rows that already exist; every
  value shown is one the model already computes. If a row you need is not there, stop and
  say so.

## 4. What is wrong

The system page (`overviewModel`, `DossierOverview.vue`) and the mainworld's page
(`bodyModel`, `DossierBody.vue`) open with the same screenful: the same title, the same
surface map, the same UWP ribbon, the same ten decoded rows, the same jump times. The orbit
view's pinned body card repeats the survey a third time.

## 5. Build

### 5a. The system page: where this hex sits, and what is in the system

1. **Title:** the system's name followed by " system" ("Regina system"); sector and
   subsector under it as now. A hex with no name keeps its present title. The body page's
   crumb back to the system reads the same words.
2. **The UWP ribbon stays, and is a link** to the mainworld's page when there is one
   (`mainworldKey`); it is the only UWP on this page.
3. **A one-line mainworld callout:** the mainworld's name with the words the map badge
   carries today ("Mainworld · moon of Regina A-IV"), and the button that opens it.
   **The lead surface map leaves this page.** No thumbnail in this step.
4. **The rows:** `identityRows` loses the ten decoded rows (Starport, Size, Atmosphere,
   Hydrographics, Population, Government, Law level, Tech level, Trade codes, Travel zone).
   It keeps Allegiance, Bases, Nobility, PBG, Resource units, Gas giants, Belts, Age,
   Edition.
5. **Socioeconomics:** the headline stays here. The long profile rows move to the
   mainworld's page (5b).
6. **Jump times** leave this page; one quiet line points to them on the mainworld's page.
7. The stellar lines and the system tree stay as they are.
8. **Two cases keep today's behaviour:** a partly surveyed hex with no generated system
   (`partial`; it has no world page, so `chartRows` stays as it is); and a system whose
   mainworld cannot be opened (`mainworldKey` null): it keeps the ten rows and the jump
   times, because there is nowhere else to show them.

### 5b. The world page: what this body is like

1. **Title:** the body's name, as now. **Place line for the mainworld:** "Mainworld of the
   Regina system" and the hex; other bodies keep their present place line.
2. This is the only page that decodes the UWP ("World profile"), and the only one with the
   surface map, the tiles, day and night, orbit, physical and life sections: all as now.
3. **Nothing may be lost in the move.** Trade codes and travel zone on the system page fell
   back to the hex's own values when the body had none (`world.tradeCodes ||
   state.tradeCodes`, `state.travelZone || world.travelZone`); the mainworld's World profile
   must use the same fallbacks. A test: for every fixture system, each of the ten rows the
   system page showed before appears on the mainworld's page with the same value.
4. **The mainworld's page gains a "Socioeconomics" section** holding the profile rows the
   system page gave up (through the same `socioBlock`; the `SocioBlock.vue` look). Other
   bodies do not get it.
5. Jump times stay here, as now.

### 5c. The pinned orbit card: what the picture is doing right now

`cardFor` returns the card's lines. Split them into two named groups in the model:
**now** (orbit number, distance, season, today's temperatures, daylight: the things that
change as the clock runs) and **survey** (UWP, starport, tech level, trade codes, zone,
diameter, rotation, gravity, the survey temperatures). `BodyCard.vue` takes one new optional
prop, `surveyElsewhere` (default false); when true it shows the **now** group only. Do not
pass the prop from anywhere: `OrbitCanvas.vue` is not your file. Agent D will pass it when
the dossier is open on the same body. With the prop absent the card looks exactly as today.

## 6. Check

- `tests/web/dossier_model.test.js` updated to the new pages, plus the "nothing lost" test of
  5b.3, the two unchanged cases of 5a.8, and the two groups of 5c.
- `npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. If `npm test`
  fails only in another agent's files, say which, and paste a run of your own files.
- In a browser, signed out is enough (the dossier is public):
  from `apps/web`, in Git Bash,
  `VOYAGE_TRUTH_API=https://traveller.voyage npx vite --port 5190` shows the released
  chart (a port of your own; leave any server already running alone). Look at Regina (Spinward Marches 1910) as a system and as its
  mainworld, a gas giant, a moon that is not the mainworld, and a partly surveyed hex; at
  column, half and full, and in a 520 px window; by keyboard (the ribbon link, the callout's
  button, the crumb back). Screenshots `fu22_*` in `findings/ui_design_shots/`, each beside
  a "before" taken from `https://traveller.voyage`. Stop your dev server and browser after.
- Tokens only; no new token (ask); no hex colour and no duration literal. Nothing may shift
  when the tree arrives: the callout and the pointer line hold their space.

## 7. Report

In the format of `agent_d_brief.md` section 6. Lead with one sentence. Include the manifesto
checklist line by line, every file you created or edited, and everything you need from a
file that is not yours. Stop and report.
