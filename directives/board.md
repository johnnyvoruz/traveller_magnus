# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-17 15:30 (by the clock).

**Last push: `d6658f5`, version 1.2.6, engine e1.2, 2026-10-17, live** (index `index-CF1BRS3K.js`). Truth v10. No push planned for a while (Johnny, 14:00): work piles up in the tree.
**Deploys run on push** (Johnny, 2026-10-14): push commands no longer include `npm run deploy:ci`.

Streams (`directives/streams/`): A, B, C, D, E, L, M, N and Z work a queue without stopping; files they edit are in `streams/claims.md`. Lanes on prompts treat a claimed file as taken.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | stream | streams/A.md | `a_encoder_merge` accepted 14:30 (one encoder; 0-pixel bitmap refused). Now: a dice roller that interprets nothing, the chart's data loaded once, the one-sector limit said before a request, the dossier model's speed |
| B | stream | streams/B.md | B1 = `b_universes_pin` (in progress; skip `truth_build`); then B2 the players contract (P0, paper, proposal), B3 the server's error sentences |
| C | stream (started 15:30) | streams/C.md | the landing: L1 meta/robots/sitemap, L2 the welcome window and `/help` blank on a cold load, L3 pictures, U19 cold-load tests, U35 orbit first open, U20 no layout shift |
| D | stream | streams/D.md | `d_store_harden` accepted 14:10 (rail, wordmark, ground, kickers, frames, steady filters 22/22, Publish chooser, manifesto table). Now: thumbnail offset, catalogue kept for the session, the map's floating controls in the look, What's inside, map covers, 390, states, Z's queries |
| E | stream | streams/E.md | E4 onward; EN1 = Lane N's leftovers (it holds `CampaignPanel.vue`) |
| Z | stream | streams/Z.md | Z1 = `z_install_reservation` (in progress); then the parked files split, the seal step in `upload_truth.js`, two packs to records-only, the players' view design (proposal), catalogue facets |
| F | retired | (none) | Johnny, 2026-10-11: unreliable (runs out of budget); do not use or propose until he says it is back |
| L | wrapped 16:15 | streams/L.md (resumable) | done: L1–L5 (software discs, orbit view without WebGL, in the look, at 390, the 50 ms budget); open in its queue: L6, L7, L8 |
| M | wrapped 16:15 | streams/M.md (resumable) | done: M1–M8 (the look across the app); open: M10; M9 and M1b moved to E (EM9) |
| N | wrapped 15:45 | streams/N.md (resumable) | done: N0–N6, N9 (timeline), N10, the mention timing test; leftovers N7, N8 (timeline URL), N9b, N11, N12 moved to E (EN1) |

**Shared files:** a stream lane claims a file in `streams/claims.md` before editing it; a lane on a prompt treats a claimed file as taken.

**Stream mode, starting and stopping:** `streams/HOW_TO_RUN.md`.

**Restarting a frozen lane:** paste the block in directives/lanes/START.md with the
lane's letter as the first message of a new session; from then on "go" is enough.

## Naming (Johnny, 2026-10-14)
The engine version is written **e1.2** (next e1.3) in reports, prompts and anything
Johnny reads. Code, `packages/engines/package.json`, fixture folders (`engine_1.2.0/`),
ledgers and stored rows keep the semver string `1.2.0`. The app version is 1.2.N, bumped
on every push.

## Contracts
- contracts/b_marketplace.md, contracts/b_public_games.md (B): size b and the opt-in
  hex mark; nothing open; public games server being built.
- contracts/b_auth.md (B): username and passkey sign-in, built, **held out of pushes** until the gate is fixed.
- contracts/b_builder.md (B): the Builder routes, the draft cycle, sectors, undo, and
  the one act: `POST .../generate` with `makeSectors`, `POST .../sectors/undo-generate`.
- Next in b_builder.md: "Hand: orbit data", "Hand: roll a profile", "What may orbit what".
- Coming: contracts/b_players.md (B, stream B2: Epic P's contract).

## Direction (Johnny, 2026-10-17)
1. **Players first:** players as accounts in a campaign (Epic P,
   `backlog_players_landing_trade.md`).
2. **The landing page now:** the welcome window and the first five minutes (Epic L).
3. **Trade first** among the table tools: the manifest and ledger now, the trade
   procedure once `rules/mgt2e_trade.json` exists (Epic T; Johnny supplied
   `assets/trade.txt`; Lane Z drafts the file).
4. The best UX in the industry: `backlog_ux_industry_best.md`, issued into streams as
   they free up.
5. **Paused:** a public API and MCP server (cost).
The words are in `decisions.md`, 2026-10-17.

## Known, not fixed
- The planet discs have no texture in a browser without WebGL (Johnny's Edge): fixed on
  disk (Lane L's software discs), live with the next push.
- A crash between the D1 byte add and the settled mark double-counts a universe's bytes
  (B's own speed leftover; the 250 MB race itself is closed on disk by B's reservation).
- A journal entry's image bytes are owner-only (`GET .../objects/:hash`); a player read
  comes with Epic P (decision 6).
- Modal frame styles live in workspace/Lightbox.vue and D's picker carries a copy;
  one shared frame in design/base.css is owed (UX backlog U23).
- The hand model refuses any non-moon body around a world ("A world orbits a star.",
  packages/generation/src/hand.ts 374), with no rule cited. Nothing is relaxed until
  Johnny rules.
- Not verified on production: dots and the toast advancing while a job runs; the
  paired-star removal ask (unit test only); letting go of a 409-hex box (175 ms in
  headless software rendering, not measured on a real GPU).

## Open with Johnny
See `questions_for_johnny.md`: the legacy tree (new, 2026-10-17) and three older
questions without an answer (G22, D2, D4).

## Pending push
None called; next is 1.2.7, see `orchestrator_state.md`.

## Queue (prompts not yet written)
- Every push list from 1.2.6 on: the orchestrator adds the release's entry to `apps/web/src/changelog.ts` (a test fails without it).
- D: E's suggested words for the Generate sheet ("Full system, from the star outward."; decided 2026-10-13), if not yet in.
- D's review, left over: finding 18
  (520 px: the dossier hides the world), the `h1`/`p` reset moved from `views/Account.vue` to `base.css`.
- An engine pass for the Regina fault, on Johnny's word only (the generator rebuild;
  the held nine water-against-ice lines belong with it).
- Player Pack next steps: images in the file, the map, importing player notes (after Epic P's projection, P1).
- Campaign order (findings/campaign_gap_audit.md §4): 7 more than one ship, 8 flight
  log (on Johnny's word), 10 ship numbers and dice.
- Worker: `retry_delay = 10` on the `voyage-generate` consumer (B's recommendation;
  wrangler.toml is Johnny's).
- The rest of both backlogs (`backlog_players_landing_trade.md` P2 onward, L3 onward
  beyond stream C, T2 onward; `backlog_ux_industry_best.md`), into streams as lanes free up.
