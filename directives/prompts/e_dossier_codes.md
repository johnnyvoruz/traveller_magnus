# Lane E — the dossier's bare codes (review finding 15)

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
finding 15 in `findings/first_run_review.md` (shot `kb16_address.png`), then this
file. No git but read-only, no deploy, no `rules/`.

Your `e_first_run_fixes` report is accepted. Your two needs are placed: the server's
search order with Lane B (`b_charge_fallback.md`), the sign-in card's Build pitch
with Lane D (`d_public_games_wire.md`).

## The rule that shapes this pass

**No Traveller rule from memory.** A tooltip that says what a code means is rules
text. Every explanation you write must rest on a line in `rules/` or `assets/`, and
the report cites it (file and line). Where neither holds the meaning, do not write
the tooltip: list the code under "Questions for Johnny" with what you could not
find. The review's own example sentence is not a source.

## Do, in this order

1. **Inventory.** Every code or abbreviation the system page and the world page show
   bare: the review names the economic code ("D7E+5"), WTN, PBG, Resource units,
   Nobility ("BcCeF"), Importance; find the rest (bases, zone, allegiance, trade
   codes, stellar class, the profile string itself). A table in
   `findings/dossier_codes.md`: the label on screen, the file and line that renders
   it, the source line in `rules/` or `assets/` for its meaning, or "none found".
2. **Build the ones with a source.** One plain sentence each, Google developer
   style, shown on hover **and** on keyboard focus **and** on touch, in the house
   pattern the dossier already uses (find it; if there is none, say so and use the
   pattern from `shell/Rail.vue`'s lock sentence you built). The words live in one
   new file, `apps/web/src/dossier/code_words.ts`, keyed by code, so a change is an
   edit to one place.
3. **The Build pane's "full system, top down" and the hex pane's "MgT2E"** are Lane
   D's copy: write your suggested words in the report, do not edit them.

## Owned files (this pass)

New: `apps/web/src/dossier/code_words.ts`. Lent, for the rows in your inventory
only: the dossier files that render them (`dossier/DossierBody.vue` and the page
files; name each one you touched and the lines). Tests in `tests/web/`, shots
`ke9_*`, `findings/dossier_codes.md`, `directives/reports/e_dossier_codes.md`. Not
yours: `dossier/SurfaceStage.vue`, `dossier/DayNight.vue` (Lane C),
`dossier/model.ts` (Lane A), `workspace/build/` (Lane D).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` and dossier chunk sizes. Fourth gate: a browser pass on your own port and
Vite cache, stopped after: Regina (`/s/Spinward_Marches/1910`), each explanation by
pointer and by keyboard, at column, half, full and 520 px.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/e_dossier_codes.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: no half-finished dossier edits on this prompt. next: inventory the bare codes and cite rules/ or assets/.
done: sentences for the codes rules/ and assets/ explain, wired on hover, focus and tap. next: the inventory table, then the gates.
done: inventory table in findings/dossier_codes.md. next: the gates.
done: npm test, check, typecheck and build passed. next: the Regina browser pass.
done: Regina explanations on hover, focus and tap at column, half, full and 520. next: the report.

