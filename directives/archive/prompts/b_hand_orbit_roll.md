# Lane B — the hand designer's missing data: orbits, a profile roll, and what may orbit a world

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy. **`rules/` is read-only and no
Traveller rule comes from memory** (CLAUDE.md rules 1 to 3): where this prompt needs a
rule, you quote the file and line in `rules/` or you stop and ask.

## Johnny, on the live hand designer (2026-10-11)

> "Let's add a UWP roller, randomizer button next to the profile header so it's like a
> little action button in the upper right of that micro-section. Also I think we're
> missing key data for the orbit view to set the orbit data. I think instead of people
> having to type a number (they can do that) they can click on a button that will open
> a modal of the current system structure and essentially allow the user to pick a body
> to orbit and then move their mouse to see a visualization of the orbit line, then
> click a button when they want to place it. Also why can't belts orbit a world? Is
> that a hard rule in the Mongoose rules?"

Seen in the tree: a hand-made star or body stores `parentId` and an integer `order`
and nothing else about its orbit (`packages/shared/src/schemas/hand.ts` about 38 to
61), so the orbit view has no distance to draw from. `packages/generation/src/hand.ts`
about 371 to 376 refuses any body that is not a moon unless its parent is a star
("A world orbits a star."), with no rule cited.

## Goal

Three things, **contract first**, then build the first two. Lane D builds the screen
against the contract while you build.

### 1. Orbit data on a hand-made system

- Read what the orbit view needs: `apps/web/src/orbit/hand_present.ts` and the rows the
  generated path gives it (`orbitId`, `au`, `eccentricity`, a star's `separation` and
  `orbitId`, a moon's orbit; read the engine output, do not guess the list).
- Add the stored fields a person can set for a star, a world, a gas giant, a belt and
  a moon, optional so every stored document still parses, with form fields in the
  draft cycle (`<id>.orbit…`), typed as a number.
- The unit, the allowed range, and any conversion (orbit number to AU, a moon's orbit
  in planetary diameters or otherwise) come from `rules/` and the engine's own
  functions; cite file and line for each in the contract. If the rules give two ways,
  list both and ask; do not pick.
- A read-only helper the screen can call so the picker can show a line where the
  pointer is: either the conversion published as a pure function in `packages/shared`
  (shared imports only zod) or as numbers in the form answer. No engine code reaches
  the browser.
- `order` keeps working; say how order and orbit relate when both are set, and what
  the server refuses (two bodies on one orbit? inside the star?) only where `rules/` or
  the existing auditors say so, cited.

### 2. Roll a profile for one body

A draft change (for example `<id>.profile.roll`) that fills that body's profile fields
(the UWP and whatever the form's Profile section holds) by running the **existing**
engine path for one body of the system's edition, seeded so the same draft and roll
number give the same result. It stays a draft until Keep; Discard drops it; rolling
again gives the next roll. Find the engine entry point that can produce one world's
profile in an existing system context. If the engines can only roll a whole system,
say so in the contract, propose the smallest honest alternative, and **stop before
building this part**: no new generation logic, no reimplementation of a table.
Engine output stays byte-identical: fixtures and the parity test untouched and green.

### 3. What may orbit a world (answer only, build nothing)

In the contract, a section "What may orbit what": for the edition(s) the hand designer
supports, quote what `rules/` says (start with `rules/guideline_4_2_gas_giants_and_belts.md`,
`rules/guideline_1_4_orbital_allocation.md`, `rules/mgt2e_data.js`) about a belt around
a world or a gas giant, and about rings, with file and line. Say what the generated
engine output already carries for a world (`rings`, `moons`) and what the hand model
lacks. If `rules/` is silent, write "rules/ is silent" and put the question to Johnny
in your report. Do not relax the refusal at line 374 in this pass.

### 4. Belts (added 2026-10-11, Johnny)

> "Belts, do they always have a certain UWP - and then we should probably remove the
> year data for belts because it doesn't matter."

- **Answer, with citations, in the contract's "What may orbit what" section:** what
  `rules/` says a planetoid belt's profile is for each edition the hand designer
  supports (which UWP digits are fixed, which are rolled, which do not apply), with
  file and line, and what the engines actually emit for a generated belt (read the
  output, name the fields). If `rules/` is silent or the editions differ, say so and
  put the question to Johnny. Then make the belt's Profile section in the form and the
  profile roll of part 2 follow exactly that: a fixed digit is shown and not editable,
  and the roll does not change it. Build this only where the rule is cited.
- **Decision (Johnny): a belt has no year data.** The form for a body of kind `belt`
  carries no year or orbital-period fields, the server drops any such change for a
  belt, and a stored belt that has them keeps parsing. List the exact field ids you
  remove so Lane D and Lane A can stop showing them (the dossier and the orbit view's
  card are theirs: name the fields, edit nothing in `apps/web`). This changes the hand
  form only: generated engine output is untouched and stays byte-identical.

## Owned files (this pass)

- `directives/contracts/b_builder.md`: new sections "Hand: orbit data", "Hand: roll a
  profile", "What may orbit what", each marked proposed, then **on disk, unpushed**
  when built
- `packages/shared/src/schemas/hand.ts`, `form.ts`, `index.ts`;
  `packages/generation/src/hand.ts`, `form.ts`; `apps/api/src/routes/builder.ts` and
  `apps/api/src/universe/` only if a route must change
- `tests/generation/hand.test.js`, `tests/api/builder_*.test.js`
- `directives/reports/b_hand_orbit_roll.md`

Not yours: `apps/web` (including `orbit/hand_present.ts`: tell Lane A what to read
from the new fields), `packages/engines`, `rules/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on the Builder test files you touched, on your own port and state
directory, stopped after; and every unit, range and conversion in the contract carries
a `rules/` or engine citation.

## Stop rule

Append a Progress line the moment the three contract sections are written (Lane D
waits on it). Stop when parts 1 and 2 are built and tested and the report is written.
Stop early, with what is done, on any rule that is missing or ambiguous: write the
question for Johnny in full and do not improvise.

Write `directives/reports/b_hand_orbit_roll.md` from `directives/reports/_TEMPLATE.md`;
under "Needs from others" give Lane D the form field ids and Lane A the fields
`hand_present.ts` should read. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: three contract sections in directives/contracts/b_builder.md (Hand: orbit data, Hand: roll a profile, What may orbit what), marked proposed. next: build part 1 orbit fields and the belt year drop; do not build the profile roll or a belt UWP lock.
done: part 1 orbit fields and the belt year drop are on disk; profile roll and belt UWP lock were not built. next: report directives/reports/b_hand_orbit_roll.md, then stop.
