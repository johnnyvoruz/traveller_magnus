# Lane B — hand designer follow-ups from Lane D's pass: keep orbits on "Design by hand", star class on the form, messages in plain style

Issued 2026-10-11 by the orchestrator. **Go now**, before
`prompts/b_marketplace_server.md` (Johnny's order: the Builder first). You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`, then this
file, then `directives/reports/done/d_hand_designer_2.md` ("Needs from others" is
written to you). No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory.

## 1. "Design by hand" drops every orbit (a fault)

Lane D switched a generated MgT2E system (Spinward Marches 1214) to hand: no body had
`orbitId`, `au` or `pd` afterwards, so the picker listed all five worlds as "no orbit
yet" although the generated tree has them. When a generated or charted system is turned
into a hand document, copy what the generated rows already hold into the optional
fields you added: a star's `orbitId`, `orbitAU`, `eccentricity`, `periodYears`; a
world's, gas giant's and belt's `orbitId`, `au`, `eccentricity` (and `periodYears`,
never for a belt); a moon's `pd` and `eccentricity`. Copy, never compute: a value the
row does not have stays absent. A test on a fixture system: design by hand, then
`handWalk` gives the same orbit numbers the generated rows had. Restore still returns
the original system byte for byte.

## 2. A star's class on the form

Stars of a generated system have no name, so the picker and the "Orbits" lists read
"around No name". Put the star's spectral class as the engine already states it (the
row's own text, for example its `name` or `sType`/`subType`/`sClass`: read the rows,
do not compose a class from rules) on the form as a read-only label for each star, and
say in the contract which field carries it. If the rows do not hold it for a hand-made
star, the label is empty.

## 3. Server messages in plain style

Johnny's standard for every instruction a person reads is the Google developer
documentation style guide: second person, active voice, present tense, plain words,
say what happened and what to do next, never a raw id or raw JSON. Lane D listed the
Builder's server messages that break it, by file and line, in its report (about fifty
lines across `packages/generation/src/hand.ts`, `form.ts`,
`apps/api/src/universe/sectors.ts`, `hexes.ts`). For each:

- rewrite the sentence; where it names a field by raw id, name it by its form label;
  where it shows raw JSON (`form.ts` about 1242) say what was wrong in words;
- messages that name legacy controls (the Architect of Worlds and Hill Sphere lines,
  `form.ts` about 646, 655, 698) name what the person can do in this app, or, if
  nothing, say only what happened;
- **the meaning, the status code and when it is returned do not change**;
- every changed sentence is changed in `directives/contracts/b_builder.md` in the same
  pass, with a before and after table in `findings/builder_messages.md`, because the
  browser lanes match some of these words in tests: list for Lane A and Lane D each
  test or code line under `apps/web` and `tests/web` that quotes an old sentence
  (find them; edit none).
- If a sentence is fine as it is, leave it and say so.

## 4. A star's set values are choices, not free text (added 2026-10-11, Johnny)

> "All star info that is sorta 'set' should all be picker dropdown and not free-text."

Your roll and belt report is accepted; this prompt is go now. Every hand-form field of
a star whose legal values are a closed list becomes a select: the form sends the field
with type `select` (or the form's existing equivalent: read `form.ts` first and reuse
it) and its options, each with a value and a label.

- **The lists come from `rules/` and the engines, cited.** Spectral type, subtype,
  luminosity class, a companion's separation, and any other star field the form
  carries: for each, name the table in `rules/` (or the engine constant that reads it)
  with file and line, per edition the hand designer supports. Combinations the rules
  forbid (a class that does not exist for a type) are filtered only where a rule or
  the engine's own lookup says so, cited. If `rules/` gives no closed list for a
  field, it stays text and you say so. Nothing from memory.
- The server refuses a value outside the list for a **new** change, in a plain
  sentence that names the field by its label; a stored document that already holds
  another value keeps parsing and keeps its value until changed.
- Do the same for a body's fields only where the form already has a closed list (kind,
  parent); do not turn profile cells into selects in this pass.
- Put the field ids, their option lists' sources and the refusal sentence in the
  contract, section "Hand: select fields", so Lane D can render them
  (`prompts/d_hand_designer_3.md`).

Also from Johnny, for the record (no code unless missing): a blank hand system with no
edition picks orbits in AU; on MgT2E typing an orbit number fills AU (Lane D does that
in the browser with your shared helper; nothing for you).

## Owned files (this pass)

`packages/generation/src/hand.ts`, `form.ts`; `apps/api/src/universe/sectors.ts`,
`hexes.ts`, `routes/builder.ts`; `packages/shared/src/schemas/hand.ts`, `form.ts`;
`tests/generation/`, `tests/api/builder_*.test.js`; `directives/contracts/b_builder.md`;
`findings/builder_messages.md`; `directives/reports/b_hand_followups.md`. Not yours:
`apps/web`, `tests/web`, `packages/engines`, the parked truth-build files.

## Gates

`npm test` (expect `tests/web` failures only where a test quotes an old sentence: list
each, they are Lane A's and Lane D's to update), `npm run check`, `npm run typecheck`,
`npm run build`, pasted. Fourth gate: `RUN_API_TESTS=1` on the Builder API tests, own
port and state directory, stopped after.

## Stop rule

Stop when the three parts are done and reported. Part 3 may be reported partial if the
web tests it would break are many: then do parts 1 and 2, write the table, change no
sentence, and ask.

Write `directives/reports/b_hand_followups.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 16:45: Johnny's answers on the roll, and luminosity

Tell-tale for a session already running: this section is new; read it before you
report.

- The roll leaves a gas giant's profile empty: **yes**. On the mainworld only size,
  atmosphere and hydrographics are rolled: **yes**. No change to the roll.
- Your question on the typed white dwarf (the lookup that needs a luminosity the hand
  star does not store). Johnny: **"if we have elements that require certain values to
  function, like luminosity, it should be a picker."** So: every value the engine
  steps need from a hand-made star in order to work (luminosity first; read
  `rollBodyProfile` and `generateStarObject` and list every other one: mass,
  temperature, diameter, whatever the steps actually read) is a field on the star's
  form, **as a select where `rules/` gives a closed list for it, cited**, defaulting
  to what the existing lookup gives for the star's type, subtype and class, so a
  person who changes nothing gets today's result. Where the rules give a formula or a
  range and no list, say so in the contract and ask before choosing a control: do not
  invent the steps of a dropdown. The roll then reads the stored value in place of the
  lookup. A star with a required value missing gives one plain sentence naming the
  field to set. Stored documents without these fields keep parsing and keep today's
  behaviour. This is part 4's work; put it in the contract's "Hand: select fields".
- **Versions (Johnny):** the app version goes 1.1.N, the last number up by one with
  every push; the orchestrator bumps `apps/web/src/version.ts` in each push list. The
  engine version stays 1.1.0 for now, because it names
  `tests/golden/fixtures/engine_1.1.0/` and the parity deviations file: do not bump it.

## Progress
