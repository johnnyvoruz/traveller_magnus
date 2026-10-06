# Orchestrator: start here

Written 2026-10-05 by the outgoing orchestrator session for the next one. `handoff.md` is the
full log (81 numbered sections, newest last); this file is the state on one page. Read this,
then `handoff.md` §65 onward, then `slice_2_campaign.md`. Keep this file true: replace it, do
not append to it.

## 1. Who is who

- **Johnny** is the referee and owner. He relays prompts and reports between you and the
  agents, runs every git command and every production command himself (with `!` in his
  prompt), and owns `rules/`, product decisions, secrets and the Cloudflare account.
- **You** are the orchestrator: review each report critically, verify cheap claims against the
  code, fix the spec first, write the next prompt, keep `directives/` true.
- **Agents A, B, C** are implementers of equal standing. By habit: **A** shared schemas,
  browser logic, tests; **B** the Worker and Durable Object (`apps/api`); **C** renderers and
  self-contained modules. **Agent D** is the high-effort UI agent and owns every screen and
  the look. **Agent F** is a higher-effort agent on a limited budget (about half spent):
  parked; use only for hard design, never for routine work.

## 2. How Johnny wants to be worked with

- Short replies that lead with the outcome. He reads the last message, often tired.
- End every reply with a **Board**: one line per agent and one for him.
- Decide and record; ask him only what only he can answer. He does not want lists of
  technical questions. When he must choose, give the recommended option first.
- Production-grade, no band-aids. The legacy look is the bar for every screen.
- He often pastes an old report by mistake, or forgets to hand out a prompt. Check each
  report against what you already accepted; if it is old, say so and repeat the missing
  prompt in full.
- Long lines lose their middles when pasted into agents' terminals. **Keep prompt lines under
  about 60 characters**, in a code block, ending in "Stop and report".

## 3. Rules you must keep (beyond `CLAUDE.md`)

- **Git and production are Johnny's.** `CLAUDE.md` rule 6 stands. Give him exact commands with
  forward slashes (`cd D:/webstorm/traveller_magnus; ...`). A push to `campaign` deploys.
- **Call for a push only when no agent is mid-step**, or give a command that adds finished
  work by path. A commit that caught an agent mid-step broke both the tests and the deploy
  on 2026-10-05 (handoff §80, §81).
- **After every push, check three things yourself:** the GitHub test run
  (`gh run list -R johnnyvoruz/traveller_magnus`; the repo is a fork, always pass `-R`), the
  Workers Build (ask Johnny for the log if a deploy is in doubt), and that the live bundle
  contains the new feature (fetch `https://traveller.voyage/`, find `assets/index-*.js`, grep
  it). A route answering proves nothing if it existed before.
- **Black-box runs need a quiet tree.** `wrangler dev` rebuilds when `apps/api` or
  `packages/*` change; an agent editing mid-run makes the test hang and time out (handoff
  §99). Re-run only when nobody is mid-step there, or read the route in full instead.
- **Stand-ins are not proof.** Every API step ends with its black-box test run against
  `wrangler dev` (`RUN_API_TESTS=1`). The Durable Object refuses SQL `BEGIN`; a `node:sqlite`
  stand-in accepted it and hid a total write failure (handoff §78).
- **Tests may not depend on** a git-ignored folder, the exact Node version, or line endings
  (the checkout is CRLF here and LF on CI). Stored digests of source files are taken over
  LF text.
- **Shell:** never put backticks inside a double-quoted shell string; it runs them. Write
  scripts with the Write tool and run them with `node`, or use a quoted heredoc.
- **Never** edit `rules/`, `js/`, `hex_map.html`, `style.css`. No Traveller rule from memory.
- `findings/` is git-ignored and local: inventories, designs, screenshots.

## 4. Where the product is (production, traveller.voyage)

- **Truth v5** released: 512 sectors, 180,312 systems. Held steady.
- **Viewer:** map, omnibox, dossier, orbit view with shaded planet discs (WebGL in a worker),
  line-up search, day and night, today's temperature, the surface map in the dossier with a
  vanilla / enhanced switch (enhanced: seas and ice from the data).
- **Campaign (live since 2026-10-05, commit `5e78744`):** sign in with X; one private campaign
  per account created on first use; records (nine types) with create, edit in place, delete
  with undo. Johnny has signed in and saved a record in production.
- **Storage:** the catalogue row is in D1 (`universes`, migration 0008 applied); a campaign's
  rows are in its own Durable Object (`campaign_records`, `campaign_links`, `lists` for the
  party and the clock). Nothing in R2 for campaigns yet. **Export exists** (§104, a JSON file per campaign through the API; the menu button comes
  with K15); import is A's next step. No server-side backups.
- **Deck plan tiles** are on the CDN under `geomorphs/` (3,026 objects); the PNGs are
  git-ignored; `assets/geomorphs/manifest.json`, `REBUILD.md`, `ATTRIBUTION.txt` are tracked.

## 5. The current slice: campaign on the truth (`slice_2_campaign.md`)

Johnny, 2026-10-04: campaign features before the Builder; optional login; everyone gets a
campaign layer over the truth map; own maps later. X sign-in only.

| Step | What | State |
|---|---|---|
| K1 | shared schemas (`packages/shared/src/schemas/campaign.ts`) | done, live |
| K2 | universes in D1, owner-checked forward | done, live |
| K3 | campaign in the Durable Object | done, live (after the transaction fix) |
| K4 | browser session and campaign store | done, live |
| K5a | sign-in entry, campaign panel | done, live |
| K5b | records: list, page, edit, delete, undo | done, live |
| map layer | party marker and locator (`map/campaign_layer.ts`) | done, live, nothing sets a party yet |
| K6a, K6b | clock in the API and the store | done, live, no screen yet |
| K10 logic | `copyRecords` in `packages/shared` | done, no route or screen |
| K9 parts 1, 2 | deck plan renderer, attach, `DeckPlanView.vue`, upload | done; not placed on a page |
| K5c | places: anchor editor, locator, "records here" in the dossier | done, accepted §82, not yet pushed |
| "1 week" | orbit time control, view only; line-up search in a kebab | done, not yet pushed |
| K9 part 3 | the deck plan viewer on a vessel's record page | done, accepted §85, not yet pushed |
| A/E answers | star kelvin, sea and ice colours (Agent C) | done §85; dossier star tile still owed |
| K5d | links | done, accepted §88, not yet pushed |
| K5e | the party | done, live |
| K5f | several campaigns: create, name, switch, delete | done, live |
| K14 | images on records: routes (B), browser encode and upload (A) | done, live; screens (D) after K6c |
| deck plan light backdrop | a paper token for the viewer | Agent C, in flight |
| K6c | clock screens, the date beside the search bar, the Rail | done, accepted §101, not yet pushed |
| **K14 screens** | images on the record page, rows, results; gallery; lightbox | **Agent D, in flight** |
| K15 | the orbit view as a showpiece: design, Johnny rules, build | next for D |
| K7, K8 | journal, timeline | outlines only |
| K10, K11 | copy between campaigns; shared records in an account library | K11 needs a design |

## 6. In flight right now

- **Agent D:** K14 image screens built, report not yet relayed; K15 part 1 (the orbit
  showpiece design) is written and waits on Johnny's rulings (handoff §105). Then K15
  part 2, K13 part 3, K6d.
- **Agent A:** campaign import in the browser (the restore half of the backup story).
- **Agent B:** free. The export route is in (§104); Export / Import buttons come with D's K15.
- **Agent C:** the local-time tick on the Day and night strip (plan §7.10; A16: the prime
  meridian).
- **Agent F:** parked. K13 parts 1 and 2 done (handoff 89 to 91); part 3 after K5f.
- **Last push:** 2f861ab (export), deployed and green. Local and finished: C's grid;
  D's K14 screens (unreported).

## 7. Decisions Johnny has made that shape the next steps

- **"Advance 1 week"** matters more than the line-up search (a week is the typical jump).
  Orchestrator's proposal, not yet confirmed by him: it moves the view only, except when a
  campaign is open and the view sits on the campaign date, when it advances that date too,
  with undo. Otherwise "looking is not advancing": scrubbing never changes the campaign date.
- **Several campaigns per account** (cap ten), and assets moving between them: **instanced**
  (a copy with provenance, K10) or **shared** (K11). Proposed split for shared, to confirm
  when written: what a character is (name, text, sheet, status) is shared; where they are and
  who they know (anchor, links) is per campaign.
- **Deck plans** from Geomorph Shipyard JSON on the ship sheet. Images are CC BY-NC 4.0 (credit
  always shown; non-commercial only). The shipyard's code is GPL-3.0: ours is written from
  `REBUILD.md`, never from its source. A real exported ship and its picture, from Johnny, are
  still needed to prove agreement with the shipyard.
- All sixteen of D's design choices are adopted (`findings/campaign_workspace_design.md`).
- **After the campaign MVP comes the Builder** (Johnny, 2026-10-05, recorded in `plan.md`):
  own universe as an overlay on the truth, generate systems and sectors with names and
  rollups, Mongoose 2e and T5 both. The engine corrections gate it; F2 is still open.

## 8. Parked, with everything written down

- **Engine corrections (`plan_engine_corrections.md`).** The engines, legacy and new alike,
  store physical data that contradicts the chart: 93% of mainworlds in an eight-sector scan
  (Regina is stored as a frozen ethane moon). Two tiers: reconcile labels and liquids as a
  derived build (v6), then fix generation and regenerate everything (v7). Johnny approved the
  direction and answered F3 to F7; **F2 (the kelvin table for the five climate words) is
  open.** Must be done **before the Builder**. A campaign is pinned to its truth version, so
  parking is safe; body anchors re-resolve by name on migration.
- **Jumps (K12, Johnny 2026-10-05):** plot a destination, fly to the jump point at 1 to 6 G
  in the orbit view, press Jump, the bubble fades and reappears a week later. Parked behind
  the MVP steps by Johnny's own wish. It cannot start until `rules/` holds the jump and
  travel rules (question G1); nothing about them is to be taken from memory.
- **Surfaces:** the enhanced shared terrain and enhanced disc, the no-WebGL painter, more
  delighters, the 2.5D view.
- **Viewer leftovers:** Trade Match, legend, help, settings.

## 9. Open with Johnny (`questions_for_johnny.md`)

None blocks work. Section A and E3, E11 to E13 were answered by the orchestrator on
2026-10-05 at Johnny's instruction (handoff §83; Agent C builds them). Still open: E4 to E8,
F2 (climate table), B1 to B5 (map), C1 to C3 (app; C3 is "deploy from main, preview from
campaign", worth raising after the broken deploy), D2 to D4. Four `CLAUDE.md` edits only he
can make are listed in handoff §4 and the summary there (rule 6 wording, two command rows,
the oracle path).
