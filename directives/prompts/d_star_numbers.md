# Lane D — a hand-made star's four numbers; density on the sheet when B has it

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your generate-feedback report is accepted
(parts 1, 3, 4 and 5); it goes out in version 1.1.3.

## 1. Mass, diameter, temperature, luminosity on a star's form

Lane B built them (`directives/reports/done/b_star_numbers.md`;
`directives/contracts/b_builder.md`, "Luminosity, mass, diameter, temperature"; read
the contract, not B's code). Field ids `<starId>.mass`, `<starId>.diam`, `<starId>.temp`,
`<starId>.lum`; kind `number`; each carries `lookup` (a number or `null`).

- Four number fields in the star's section of the hand designer, labelled Mass,
  Diameter, Temperature, Luminosity, with the unit the contract gives beside each
  (do not state a unit the contract does not).
- **While `value` is `null`, the field shows `lookup` as its placeholder**, marked as
  looked up, not typed (your judgement how: muted text and a short tag is the house
  pattern for a default). Typing stores the number; clearing the field sends `null`
  and the lookup shows again.
- When a diameter or temperature is typed and no luminosity, the shown luminosity
  follows them (B sends it as the lookup; show what the server sends, do not compute).
- A bad number shows the server's sentence at the field.
- A star with no type, subtype or class: the contract says what the roll needs; make
  sure "Roll profile" on a world of that star shows the server's sentence naming the
  fields still to set, at the button.

## 2. Density on the Generate sheet

**Only when `directives/reports/b_generate_density.md` or its copy in `reports/done/`
exists**, and Lane A's `findings/builder_density_ready.md` names the option on the
store's call. The design is part 2 of `prompts/d_generate_feedback.md` (Johnny: a
dropdown, "Every selected hex", "Sparse (2 in 6)", "Standard (3 in 6)", "Dense (4 in
6)", Standard the default, the current choice shown on the button's second line, the
left-empty count in the end toast). If either file is missing when you reach this,
skip it and say so.

## 3. From your last report

- The orchestrator will put Johnny's answers to your three questions on the board
  (Decisions). If the board says yes to "your map over chart v5", change that one
  string in `BuildStrip.vue` in this pass.
- Roll again had a unit test only: roll one body twice in the browser pass here.

## Copy

Every sentence follows the Google developer documentation style guide; add new strings
to the design note's table.

## Owned files (this pass)

`apps/web/src/workspace/build/`, `tests/web/build_*.test.js`, your token lines, shots
`kb9_*`, `directives/reports/d_star_numbers.md`. Not yours: `builder/`, `apps/api`,
`packages/`, the dossier files, `views/OrbitView.vue`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports with your own Vite cache, stopped after: a blank hand
system, a star with a class (lookups shown), type a mass (stored, lookup gone), clear
it (lookup back), a bad number, a classless star with and without the four numbers and
"Roll profile" on its world, roll twice; keyboard only once; column, half, full, 520 px.

## Stop rule

Stop when part 1 passes (and part 2 if its two files were there) and the report is
written.

Write `directives/reports/d_star_numbers.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
