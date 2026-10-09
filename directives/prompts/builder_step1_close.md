# Builder, step 1: joining the three parts

Issued 2026-10-08 by the orchestrator. All three parts of step 1 are on disk and none of
them meets the others yet: B's server stores hexes, A's store speaks to it, D's screens
run on a stand-in. The tree is red where they touch (`builder/screen.ts` lines 43 and
50: A's `JobState` against D's seam; `tests/web/builder_store.test.js` line 262: undo
after restore expects rev 3 and gets 2). This prompt closes the gaps each of you
reported. Common rules: `directives/swarm_restart.md`. Johnny's rulings are at the foot
of `prompts/builder_step1.md`: the Builder is not live; nothing checks a rule.

## Rulings on what you asked

1. **A row carries what the map draws (A's and D's question).** The map cannot draw a
   generated system from a hash, and nothing outside the generation code may read a
   tree. So **the server puts the chart entry on the row**: the same entry a truth
   sector index holds for a hex (name, profile and whatever else the map's glyph and
   label use), made by **the function in `packages/generation` that makes that entry
   for the truth build**, called beside `generateHex`. One seam, already there. The row
   gains `entry`; the store's `mergeHex` returns it; `layOver` draws it.
2. **A chart system can be removed (A's question).** "Remove from my map" on a hex of
   the chart that was never touched is the ordinary case, not an error: it writes a row
   in the `removed` state whose `base_hash` is the chart's tree hash, at `baseRev` 0.
   "Restore to the chart" deletes that row. The server's 400 there is a defect.
3. **Keys.** Alt+arrows are not free (the map pans on arrows). D chooses others and says
   which; nothing in `map/input.ts` changes.
4. **The three-star system D saw** (all labelled "Star", "D0 D", age 0) is the engine's
   own output and goes to the generator rebuild's list (`findings/generator_oddities.md`:
   D, add it with the hex, engine, roll and seed so it can be made again). Nobody fixes
   it here.

## Agent B

1. The `entry` on the row (ruling 1): say which function makes a sector index entry
   today and call it; a test that a generated hex's `entry` equals what a truth build of
   the same tree would index. Preview returns it too, so a preview can be drawn.
2. Removing an untouched chart hex (ruling 2), with tests for remove, restore, and
   remove-then-generate.
3. With A: the undo-after-restore rev (the failing store test). Say what the server
   returns and which side is wrong; fix yours if it is yours.
4. `findings/builder_contract_ready.md` updated. Your own port; one round trip. Gates.

## Agent A

1. **The store behind D's seam**, replacing `workspace/build/stand_in.ts` and its one use
   in `views/MapView.vue` (D's files: you have them for this, lines listed), once B's
   `entry` is on the row. The types meet in one place; the build is green.
2. Preview through the stateless route with the seed `<seed>/roll/<n>`, and Keep as the
   generate call with the same roll, as D asks; say if B's contract makes that
   impossible.
3. **A pane on the sector address and on the subsector address** (`/s/:slug/sub/:letter`,
   registered), so D's "what is selected" can be a sector or a subsector, and a
   many-hex selection is not shown from the last hex touched.
4. **The orbit view opens a system the referee generated**: it reads the chart's objects
   only today. It must read a universe's own object for an overridden hex, through the
   same walk. Say what it costs and do it if it is one step; if not, the exact list.
5. Two small ones from Agent E's hardening pass, in `characters/`:
   `live.ts` never returns to Live after it has fallen back to polling (after a poll
   succeeds, try the socket again); presence tone 2 is `--sheet-rust`, 2.88:1 as a ring,
   and becomes `--sheet-rust-line`, with its contrast pair back in the suite.
6. Tests; gates; a browser pass on your own ports with D's screens on your store:
   generate one, roll again, Keep, reload and find it; a block of twelve with three
   filled; Stop one mid-way; remove a chart system and restore it; Undo each; a conflict
   from a second tab.

## Agent D

1. Stay out of `workspace/build/stand_in.ts` and `views/MapView.vue` while A joins them;
   everything else in `workspace/build/` is yours.
2. The pane on a sector, a subsector and a true many-hex selection, when A's addresses
   land. One-hex acts work with the pane shut where the design says they do (G and
   Delete do nothing today). Keys for Keep, Roll again and Stop. `.psheet-who` on the
   person's page into the tab order (from E).
3. `findings/generator_oddities.md` (ruling 4).
4. Then **read `prompts/builder_step2.md` if it exists; if it does not, stop and report.**

## Agent E

Your hardening pass is accepted (the journal list drawn by window with a 150 ms search
wait; the focus rings; the status line announced). Free.

## Everyone

Gates pasted, what you built, stubbed, skipped, your questions. Stop and report.

## Added for Agent A, from Agent D's report (2026-10-08)

In `views/MapView.vue`, while you hold it:
1. In `actingKeys()`, drop `&& dossierShown.value`, so the one selected hex counts with
   the pane shut.
2. Where the build commands run, before `runBuild(item.id, actingKeys())`: when the id
   is `build-generate` or `build-generate-with` and the pane is shut, call `openHex(...)`
   on the selected hex first, so the preview or the sheet can be seen.
3. The watcher on `dossierShown` that discards a preview when the pane shuts stays.
Keys for moving the selected hex, chosen by D and free on the map: U, I, O for the three
neighbours above, N, M and comma for the three below; with Shift they grow the
selection. Build them where selection lives, or say they are D's once your addresses
land.

## Added for Agent A, from Agent B's close (2026-10-08)

- The row now carries `entry` (a `SectorHex` from `chartEntry` in `packages/generation`);
  preview returns `{ envelope, hash, entry }`. **A removed row keeps its `entry`**: your
  overlay returns null for `removed`, so the dashed outline has no name; use the entry
  the server kept.
- Undo of a restore returns a **new** rev (generate 1, remove 2, restore, revert to 2
  gives rev 3, state removed): the server is right; the store adopts it.
- One store test fails and is yours: `tests/web/builder_store.test.js:375`, "a remove
  queued while generate is in flight names the rev generate applied" (after the held
  generate returns, `map.row` is the override at rev 5; the test expects null before the
  flush). Decide which is right, and fix that one.
- B added two type annotations in your files so `vue-tsc` passes (`builder/store.ts`
  preview's return; `builder/bind.ts` the fetch URL). Keep or redo them.
- What a generated entry lacks, so the screens do not promise it: Mongoose has the name
  and profile, but importance is 0 and PBG, allegiance and bases are empty (the
  gas-giant mark will not show); Architect of Worlds has the name and **an empty
  profile**. `chartEntry` invents nothing. Say what the map draws for each.
