# Agent A — panes swap, steps 2 to 4: build your design

Issued 2026-10-06 by the orchestrator. The index step and the hex distance are accepted and
live. This is Johnny's follow-up 17 ("Campaign pressed in the orbit view routes to the map;
it must not"), by your own accepted design, `findings/panes_swap_design.md`. Step 1
(`shell/pane.ts`) is in.

**You do all three remaining steps**, including step 2, which the design gave to Agent D.
D is on a paper-only step and the files are free now. Read your design again, sections 2
to 6, and build it exactly; it is the recipe. Where the tree has moved since you wrote it
(the ship strip, the estimates, the Party tab reading the track, `workspace/party_where.ts`,
`workspace/TrackBlock.vue`), carry the new call sites the same way and list each in your
report.

## Order, each left green (`npm test`, `npm run check`, `npm run build`)

- **Step 2, the call sites.** Every push of `/campaign`, `/campaign/r/:record` and
  `/campaign/party`, and every writer of the query, goes through `shell/pane.ts`
  (`withQuery`, the pane values). The views still mount the panes and accept the query as
  well as the old paths. After this step Campaign pressed in the orbit view stays in orbit.
- **Step 3, the host.** `shell/PanelHost.vue` and `shell/frame.ts`; `App.vue` wraps the
  router and the host; the pane mounts leave `MapView.vue` and `OrbitView.vue`, which
  publish the frame; the rail-width rule and `--panel-width` move to `.app`; `Rail.vue`
  gains the two focus methods; the orbit view publishes its place source.
- **Step 4, the router.** The three campaign routes and `preloadCampaign` go; the redirects
  from `campaignRedirect` and the `beforeEach` preload come in.

## Files

**Yours for this step:** `apps/web/src/App.vue`, `router.ts`, `shell/`, `views/MapView.vue`,
`views/OrbitView.vue`, `components/OmniBox.vue`, and in `workspace/` only the lines that push
an address or read the route (`CampaignPanel.vue`, `AccountMenu.vue`, `PartyPanel.vue`,
`LinksBlock.vue`, `PersonCard.vue`, `RecordsHere.vue`, `WhereBlock.vue`, `TrackBlock.vue`,
`party_where.ts`, and any other file you find that does; list them). Your tests.

**Not yours, do not edit:** `apps/web/src/dossier/`, `orbit/card.ts` and `orbit/BodyCard.vue`
(Agent E is rebuilding the dossier pages right now: mount `DossierPanel` with exactly the
props and events the views pass today, and if its interface looks different from your
design's, stop and say so); `orbit/OrbitCanvas.vue`, `OrbitRenderer.ts`, `ships.ts`,
`distance.ts`, `theme.ts` (Agent C); `orbit/ShipStrip.vue`, `HeaderClock.vue`,
`TimeControls.vue`, `estimates.ts`, the drawers (Agent D's; nothing in them pushes an
address, and if you find one that does, say so instead of editing); `campaign/`,
`packages/`, `design/`. No look changes: no style, token or wording beyond what the move
needs.

## Check

- The tests of your design's section 6, plus whatever the three steps need. The entry
  script stays under 450,000 bytes; say its size before and after. No pane is statically
  imported by `App.vue`, `MapView` or `OrbitView`.
- **In a browser**, on your own port
  (`VOYAGE_TRUTH_API=https://traveller.voyage npx vite --port 5191` from `apps/web`; sign in
  locally with `node scripts/dev_make_admin.js`, read the script first): every row of your
  "today" table and your "new addresses" table by cold load; Back and Forward across pane
  changes on the map and in orbit; Campaign pressed in orbit stays in orbit; a pan and a
  scrub keep the pane; the three old `/campaign` links redirect and Back does not stop on
  them; focus after each swap as your focus table says; signed out. If you cannot drive a
  browser, say "not run" for this list in your report and nothing else changes: Agent D
  will run it.
- Stop your dev server and browser. No git. Stop and report, with every file touched.
