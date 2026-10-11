# Lane D — the hand designer, third pass: the roll button, dropdowns for a star's set values, belts around a world

Issued 2026-10-11 by the orchestrator, **for after `prompts/d_marketplace_screens.md`
is reported and after the board shows Lane B's `b_hand_followups` accepted** (parts 2
and 4 below need it). You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory.

## Johnny's rulings (2026-10-11)

- "All star info that is sorta 'set' should all be picker dropdown and not free-text."
- Yes to a one-body profile roll (Lane B has built it).
- A belt may be placed around a world or a gas giant by hand.
- On a blank hand system with no edition, the picker works in AU (as built).
- On an MgT2E system, typing an orbit number fills AU with the same conversion.
- An unnamed star shows its spectral class in the picker and the "Orbits" lists.

## Contract to read

`directives/contracts/b_builder.md`: "Hand: roll a profile", "What may orbit what",
"Hand: orbit data", and the section Lane B adds in `b_hand_followups` for select
fields and the star's class label. Build against the contract, not `apps/api`.

## What to build

1. **Wire "Roll profile".** The button you designed (`kb6_roll`) sends
   `{ id: '<bodyId>.profile.roll' }` in the draft's `roll` list (it is not a form
   row). Busy while pending; the filled cells are marked; it counts as one change;
   Keep stores, Discard drops, pressing again rolls again. It is also the palette
   command. Say what the roll does **not** fill, in one plain sentence near the
   button, from the contract: a gas giant's profile is not filled; on the mainworld
   only size, atmosphere and hydrographics are; and a star with no type gives the
   server's message. Do not disable the button with no explanation.
2. **Dropdowns for a star's set values.** Every star field the form marks as a select
   (Lane B decides which, from `rules/`, and sends the options with their labels) is a
   dropdown, using the app's one select control (look in `design/` and `workspace/`
   first; no second implementation, no native-looking mismatch). Keyboard and type-to-
   find work; the current value shows even if it is not in the options (a stored
   document typed earlier), marked "not in the list", and is kept unless the person
   changes it. Free text stays only for what is truly free (a name). You do not
   decide which values exist: if the form sends text for a field you think is set,
   list it in the report for Lane B.
3. **A star's class as its name of last resort.** Where a star has no name, show the
   class label the form carries (for example "K1 V") in the picker, the "Orbits"
   lists and the rows; "No name" only when there is no class either.
4. **A belt around a world.** The parent list offers worlds and gas giants for a belt
   and no longer rewrites it to a moon; its orbit fields are then planetary diameters
   and eccentricity, picked or typed like a moon's; no year. Removing a world with a
   belt asks like removing one with moons, with the server's count.
5. **Orbit number fills AU as you type** on an MgT2E system, both ways, with
   `mgt2eOrbitToAu` and `mgt2eAuToOrbit`; one change per field in the draft; clearing
   one clears the other; no conversion for any other edition.
6. **One name per control.** Your last report listed three controls whose label
   differs between the bar and the palette ("Remove" and "Remove from your map", "Keep"
   and "Keep the draft", "Star" and "Add a star"). The Google style standard says one
   thing has one name: pick one for each, bar and palette alike, and add them to the
   copy table.

## Copy

Every sentence follows the Google developer documentation style guide. Add the new
strings to the table in `findings/builder_system_design.md` §21.

## Owned files (this pass)

`apps/web/src/workspace/build/`; `design/tokens.css` appended lines only;
`tests/web/build_*.test.js`; the design note and shots `kb7_*`;
`directives/reports/d_hand_designer_3.md`. Not yours: `builder/` (if the handle cannot
send a roll entry, give Lane A the exact need and stop that part), `orbit/`, `apps/api`,
`packages/`, the three shared files, and the workspace record files on loan to Lane E.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports, servers stopped after: roll a world, a belt, the
mainworld, a gas giant; choose each star dropdown by pointer and by keyboard; a stored
value not in the list; a belt around a world, removed with its parent; the orbit
number and AU following each other; column, half, full and 520 px.

## Stop rule

Stop when the six items are built and passed, or partial with what the contract did
not yet give you, named.

Write `directives/reports/d_hand_designer_3.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
