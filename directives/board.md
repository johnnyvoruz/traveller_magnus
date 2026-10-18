# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-18 09:40 (by `date`).

**Last push: `d6658f5`, version 1.2.6, engine e1.2, 2026-10-17, live** (index `index-CF1BRS3K.js`). Truth v10. No push planned for a while (Johnny, 14:00): work piles up in the tree.
**Deploys run on push** (Johnny, 2026-10-14): push commands no longer include `npm run deploy:ci`.

Streams (`directives/streams/`): A, B, C, D, E, L, M, N and Z work a queue without stopping; files they edit are in `streams/claims.md`. Lanes on prompts treat a claimed file as taken.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | stream | streams/A.md | done: P9 polling, P3b, P8 player map, TS2b, AU6 timeline legs (AU37 undo declined: CRUD over undo). Queue open: a player reload opens their own first campaign (to add), Vessels keeps legs |
| B | stream | streams/B.md | done: BC1b summaries, SI1 session ingest + MCP, TS4 table sets. **Next: SI1b agent access ships off (blocks 1.3.0)**, TS4b |
| C | stream | streams/C.md | done: CS10 neon city lights, CC1 receiver. **Next: CC1b wire the receiver (blocks 1.3.0)**, LS5 traffic |
| D | stream | streams/D.md | done: DU40 org chart, P5 referee players screens, P6 player panel + View as players, DU6 timeline legs. Queue empty: refill after the push |
| E | stream | streams/E.md | done: EU28b rich text, XE1 X-boat words, P4 join page, P7 notes, P10 help. Queue empty: refill after the push |
| X | done 22:30 | prompts/x_city_lights_fix.md (report in reports/done/) | the "atmosphere band" was the selection lock glow painted over the outer tenth of the planet (`OrbitRenderer.ts` `selection()`); now starts at the body edge; pixel test added. Questions 79 to 83 open. Not re-used until Johnny names a new deep problem |
| Z | stream | streams/Z.md | done: ZC1 comms engine (corpus, scheduler, Beowulf, audit), ZT6 freight and passengers logic. **Next: ZF1 tests on git-ignored files (blocks 1.3.0)**. Questions 93 to 102 to Johnny |
| F | retired | (none) | Johnny, 2026-10-11: unreliable (runs out of budget); do not use or propose until he says it is back |
| L | wrapped 16:15 | streams/L.md (resumable) | done: L1–L5 (software discs, orbit view without WebGL, in the look, at 390, the 50 ms budget); open in its queue: L6, L7, L8 |
| M | wrapped 16:15 | streams/M.md (resumable) | done: M1–M8 (the look across the app); open: M10; M9 and M1b moved to E (EM9) |
| N | wrapped 15:45 | streams/N.md (resumable) | done: N0–N6, N9 (timeline), N10, the mention timing test; leftovers N7, N8 (timeline URL), N9b, N11, N12 moved to E (EN1) |

**Shared files:** a stream lane claims a file in `streams/claims.md` before editing it; a lane on a prompt treats a claimed file as taken.

**Stream mode is the default** (Johnny, 2026-10-17); starting, stopping and resuming: `streams/HOW_TO_RUN.md`.

**Restarting a frozen lane:** paste the block in directives/lanes/START.md with the
lane's letter as the first message of a new session; from then on "go" is enough.

## Naming (Johnny, 2026-10-14)
The engine version is written **e1.2** (next e1.3) in reports, prompts and anything
Johnny reads. Code, `packages/engines/package.json`, fixture folders (`engine_1.2.0/`),
ledgers and stored rows keep the semver string `1.2.0`. The app version is 1.3.N (1.3.0 from 2026-10-18; Johnny: "This feels like a v 1.3"), bumped
on every push.

## Contracts
- contracts/b_marketplace.md, contracts/b_public_games.md (B): size b and the opt-in
  hex mark; nothing open; public games server being built.
- contracts/b_auth.md (B): username and passkey sign-in, built, **held out of pushes** until the gate is fixed.
- contracts/b_builder.md (B): the Builder routes, the draft cycle, sectors, undo, and
  the one act: `POST .../generate` with `makeSectors`, `POST .../sectors/undo-generate`.
- Next in b_builder.md: "Hand: orbit data", "Hand: roll a profile", "What may orbit what".
- contracts/b_players.md (B): proposal; P2a folds in the players review's §6 after Johnny's answers; the plan is `players_build_plan.md`.

## Direction (Johnny, 2026-10-17)
1. **Players first:** players as accounts in a campaign (Epic P,
   `backlog_players_landing_trade.md`).
2. **The landing page now:** the welcome window and the first five minutes (Epic L).
3. **Trade first** among the table tools: the manifest and ledger now, the trade
   procedure once `rules/mgt2e_trade.json` exists (Epic T; Johnny supplied
   `assets/trade.txt`; Lane Z drafts the file).
4. The best UX in the industry: `backlog_ux_industry_best.md`, issued into streams as
   they free up.
5. **Paused:** a public API and MCP server (cost). **Except** the session-ingest spec (18:40): record a game, an AI transcribes it, an API or MCP updates the campaign; spec only (`prompts/x_session_ingest_spec.md`).
7. **Systems that feel alive** (19:10): chatter and background traffic, referee switches; X-boat news ripples. Specs first.
6. **Trade tables the referee picks** (18:40): the official set is the default; a referee may load or make others (Z, ZT1).
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
**Reminder for Johnny, 2026-10-18 (he asked on 10-17 22:15):** run the example-pack production seed (Z4's two records-only versions and Z10's trimmed Hollow Verge cover, one apply). Commands and the dry-run checks are in `reports/z_stream.md`, Z10 ("Johnny's commands"). Dry run: `node tools/examples/seed_production.mjs --from findings/examples/local --production` (six `update`, no `insert`); apply: add `--apply` (ends "Applied: 6 packages on the target."). After it shows on production, the backup folders `findings/examples/local_backup_pre_v2`, `local_backup_pre_z10` and `standin_z10` may go.
Questions 84 to 104 and 109 open (117 to 119 answered 13:10) (110, 111 answered 10:40) (105 to 108 answered 10:00; 109: when agent access turns on) (trade readings, comms content, freight and mail, neon share, invite link); none blocks 1.3.0. Look by eye: Capital at `/s/Core/2118/orbit`, night side up: the limb ends at black, the gold ring and its glow sit outside the disc (`findings/city_lights_fix/after_capital_gpu_1600.png`). Also waiting on him: commit the staged cleanup; call 1.3.0 when he likes.

## Pending push
**1.3.0 ready 2026-10-18 14:00; commands handed to Johnny.** Notes and commands: `findings/push/release_2026-10-18.md`; list `findings/push/release_2026-10-18_files.txt` (638 paths). Two commits: the staged cleanup, then 1.3.0. Clean copy `outer29` green but the known pixel-test layout artifact; `test:api:all` 42/42. After the deploy: `d1_migrations` 0021 to 0024; then the example-pack seed (10-18 reminder); then lift the FREEZE lines in every queue.

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
