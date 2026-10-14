# Lane C — no sea where there is no free liquid (the browser side of engine 1.2.0)

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
your own `findings/liquid_minimal_review.md` ("Surfaces", lines 203 to 228), then this
file. No git but read-only, no deploy, no `rules/`, no Traveller rule from memory.

Your review is accepted: its five changes are with Lane Z (1, 2, 3) and Lane B (4,
5). **The engine is 1.2.0 on the working tree**: fixtures
`tests/golden/fixtures/engine_1.2.0/`, ledger
`tests/generation/parity_deviations_1.2.0.json`. Lane Z is editing engine files
again this turn; stay out of `packages/engines`, and a red engine test goes under
"Needs from others".

From 1.2.0 a body can carry `liquidType: null` with
`liquidStatus: { status: 'none' | 'unresolved' | 'unknown', outcome }`. An absent
`liquidType` is the 1.1.0 shape and keeps today's behaviour everywhere: stored
universes made on 1.1.0 must draw exactly as they do now.

## Do, in this order

1. **The five edits in your note, as you wrote them** (`enhanced/climate.ts`
   `liquidLook`; `profile.ts` `surfaceProfile`; `hybrid/inputs.ts` `seaLiquid`;
   `caption.ts` `hasSurfaceLiquid`; `identity.ts` `worldMapData` with
   `vanilla/map_palette.ts` `buildPalette`): no sea is painted, on the map, the disc
   or the vanilla palette, when `liquidType === null` or the status is `none`,
   `unresolved` or `unknown`.
2. **Sea ice.** `seaIce` and the sea plan never draw open water above the liquid's
   boiling point or ice above its melting point; read both points from the body's
   liquid as the engine stored it, not from a number in the browser. Say what each
   reads today.
3. **The caption says why.** One short line per outcome, Google developer style, in
   the place the "no seas" caption already uses: `vacuum-above-melt`,
   `above-boiling`, `unknown-exotic`, `temperature-missing`. Plain words; no rule
   stated beyond what the status says. Put the sentences in the report for Johnny.
4. **273 against 273.15.** `units.ts` shows kelvin less 273.15; the engine's ice
   line is the mean below 273 K (`rules/mgt2e_data.js` line 767). A world at 272.8 K
   is Ice and reads 0 °C. Do not change `units.ts` (every temperature on screen
   moves): write the two choices and what each changes as a question for Johnny.
5. **Prove it on real bodies.** From the engine as it stands, generate Regina
   (Spinward Marches 1910) and one body of each outcome (your review note names
   some; `tests/generation/liquid_temperature_census.js` finds the rest). For each:
   the large map, the disc and the caption, enhanced and vanilla, as shots
   `kc12_*`. And one 1.1.0-shaped body (no `liquidType`) before and after, to show
   it did not move.

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`, their tests in
`tests/web/`, `scripts/surface_parity.js`, `directives/reports/c_no_sea.md`. Not
yours: `dossier/` otherwise (Lane E was lent the code rows), `units.ts`,
`packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
surface chunk sizes. Fourth gate: `scripts/surface_parity.js` for the 1.1.0-shaped
bodies (no pixel moves), and a browser pass on your own port and Vite cache, stopped
after, for item 5.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/c_no_sea.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-13 21:10 by the orchestrator (read before your gates)

Lane Z landed its dice fix at 21:00 and regenerated the engine fixtures from a copy
taken at 20:49, before your edits. Two tests are now red and both are yours:
`tests/golden/esm.test.js` "esm profile_regina matches legacy fixture" (the fixture
`tests/golden/fixtures/engine_1.2.0/profile_regina.json` is built by `surfaceProfile`,
`tests/golden/cases_esm.js` line 156) and `tests/web/surface_enhanced_map.test.js`
line 339.

Regina carries a `liquidType` string (Ice), so the rule in this prompt says her
profile must not move. **Do not regenerate the fixture to make the test pass.** First
say, field by field, what changed in `profile_regina` and which of your edits did it.
If it is a fault, fix the edit. If it is intended (item 2, sea ice read from the
stored points), say why in the report, and only then regenerate that one fixture;
you may write that one file. Push 1.1.12 waits for your report.

## Progress

done: read the surfaces note and the current sea, caption and palette code. next: the five no-sea edits, then sea ice and the outcome captions.
done: no-sea edits, sea ice reads the stored liquid's melting and boiling points, and the four outcome captions. Climate, sea and hybrid tests pass (50). next: the full gates, then shots of real bodies.
done: real bodies with hydrographics above 0 — Regina (Ice), Rangent XIII-a (vacuum-above-melt), Uniqua (above-boiling), Regina A-IX (unknown-exotic), Errere with the liquid fields removed. Temperature-missing did not appear in 400 systems. next: shots, then the gates.
done: shots in findings/ui_design_shots/kc12_*. Preview page and route removed. Gates: check, typecheck, and build pass; surface parity prints no pin failures; npm test has one fail in tests/golden/esm.test.js (Lane Z). Report written. next: stop.

