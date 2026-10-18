# Lane D — the hand designer, second pass: plain instructions, a profile roll button, an orbit picker

Issued 2026-10-11 by the orchestrator, **for after `prompts/d_grow_one_act.md` is
reported**. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory.

## Johnny, on the live hand designer (2026-10-11)

> "For the manual system creation, things are looking okay, the user instructions are
> cryptic and are written in purple prose, if you're gonna write instructions use
> Google Style Guide (https://developers.google.com/style/). Also let's add a UWP
> roller, randomizer button next to the profile header so it's like a little action
> button in the upper right of that micro-section. Also I think we're missing key data
> for the orbit view to set the orbit data. I think instead of people having to type a
> number (they can do that) they can click on a button that will open a modal of the
> current system structure and essentially allow the user to pick a body to orbit and
> then move their mouse to see a visualization of the orbit line, then click a button
> when they want to place it."

## Part 1. Rewrite every instruction in Build (no dependency; do this first)

Every sentence a person reads in `apps/web/src/workspace/build/` (hints, empty states,
asks, toasts, tooltips, button and field labels, command names) is rewritten to the
Google developer documentation style guide. The rules that matter here:

- Second person, active voice, present tense. "Select a star." not "A star may be
  selected."
- Say what to do, then why only if it is not obvious. One idea per sentence. Short.
- The condition comes before the instruction: "To add a moon, select a world."
- Sentence case everywhere, including buttons and headings. No exclamation marks, no
  "please", no "simply", "just", "easily".
- Plain words. No metaphor, no mood, no narration ("Nothing is stored at once" is the
  kind of line to replace with what happens: "Changes are saved when you select Keep.").
- Name a control by its exact label; the same thing has the same name everywhere.
- Errors say what happened and what to do next. Server messages are shown as the
  server sends them; list any that break these rules for Lane B, do not reword them.
- Numbers as numerals; no "e.g." or "i.e."; no directional words alone ("the button
  above").

Put a before and after table of every changed string in
`findings/builder_system_design.md` §19, so Johnny can read all the copy on one page.
This standard now applies to every instruction you write in any pass.

## Part 2. A roll button on the Profile section

A small icon button at the right of the "Profile" heading in `HandDesigner.vue`
(about line 287), with the tooltip and accessible name "Roll profile". It sends the
draft change Lane B's contract names; the fields fill; the bar counts it as a change;
Keep stores it, Discard drops it, pressing again rolls again. While the answer is
pending the button is busy and nothing shifts. It is also a command in the palette
(manifesto: no chrome until it works from the palette). A person who has typed values
is not asked to confirm: the roll is a draft and Undo is Discard; say so in the tooltip
only if it fits the style rules.

## Part 3. An orbit picker

Beside the orbit number field (which stays, and stays typeable) a button "Pick orbit"
opens the app's one modal with a picture of the current system: the stars and bodies
at their orbits. The person selects what to orbit (a star, a pair, a world for a
moon), moves the pointer and sees the orbit line follow with its value in the unit the
contract gives, and selects **Place** to set it; Escape or Cancel changes nothing.
Requirements:

- Keyboard: Tab to choose the parent, arrow keys to step the orbit, Enter to place.
  Touch: drag, then Place. Reduced motion: no animation, same result.
- The line snaps to what the contract allows and shows why a spot is refused, in the
  server's words.
- Occupied orbits are drawn and labelled so the person can see the gaps.
- The picture is drawn by you from the form's data and the pure helper the contract
  publishes. Read `apps/web/src/orbit/` (Lane A's) for the look and reuse exported
  pure functions; do not edit it; if you need an export, ask in the report.
- No frame at or over 50 ms while the pointer moves; drawing is SVG or one canvas,
  no layout per move.
- Design first: mockups `kb6_*` and a short §20 in the design note, then build.

## Part 4. Belts (added 2026-10-11, Johnny)

A belt shows no year or orbital-period fields (Johnny: "it doesn't matter"). Lane B
removes them from the form and lists the field ids in the contract; remove any label,
hint or row in Build that mentions a belt's year. Whatever the contract says is fixed
in a belt's profile is shown as fixed, with one plain sentence saying why. Do not
decide either from memory.

## Contract to read

`directives/contracts/b_builder.md`, sections **"Hand: orbit data"** and **"Hand: roll
a profile"** (Lane B, `prompts/b_hand_orbit_roll.md`). **If those sections are missing
or still say proposed with open questions, do part 1 and the mockups for parts 2 and 3,
then write a partial report and stop.** Do not build against Lane B's code in progress,
and do not invent a unit or a range for orbits.

## Owned files (this pass)

- `apps/web/src/workspace/build/` (the designer, its acts, a new picker component,
  commands), `design/tokens.css` appended lines only
- `tests/web/build_hand.test.js`, a new `tests/web/build_orbit_picker.test.js`
- `findings/builder_system_design.md` §19 and §20, shots `kb6_*`
- `directives/reports/d_hand_designer_2.md`

Not yours: `builder/` (if the handle cannot send the roll or the orbit change, give
Lane A the exact need and stop that part), `orbit/`, `apps/api`, `packages/`, the three
shared files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports, both servers stopped after: roll, roll again,
Discard, Keep; pick an orbit for a world, a moon, a companion star, by pointer and by
keyboard; then open the orbit view and show the body where it was placed; column, half,
full and 520 px.

## Stop rule

Stop when the three parts are built and passed, or partial as the contract rule above
says. Every question for Johnny written out in full, recommended answer first.

Write `directives/reports/d_hand_designer_2.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 15:40: what Lane B's contract now gives you

- Your grow report is accepted. Start now.
- **"Hand: orbit data" is built** (on disk, unpushed). Field ids: star, world and gas
  giant `<id>.orbit.id`, `<id>.orbit.au`, `<id>.orbit.eccentricity`,
  `<id>.orbit.years`; belt the first three only; moon `<id>.orbit.pd`,
  `<id>.orbit.eccentricity`. `''` or `null` clears. The picker converts with
  `mgt2eOrbitToAu` and `mgt2eAuToOrbit` from `@voyage/shared`, **for an MgT2E system
  only**; for any other edition the picker works in AU and shows no orbit number. Read
  the contract section and `directives/reports/done/b_hand_orbit_roll.md` for the rest.
- **"Hand: roll a profile" is not built** and may not be: the engines export no
  function that rolls one body. Part 2 is therefore **design only** in this pass: the
  button's place and states in the mockups, nothing wired, no dead button shipped.
- Part 4: never show `<beltId>.orbit.years`, `.orbit.days` or `.orbit.hours`. The
  contract fixes no cell of a belt's profile, so lock none.
- Build parts 1, 3 and 4.

## Progress
done: read the contract (orbit data built, roll not built). Part 1 copy rewrite handed to a helper agent (strings and tests only, table into the design note). next: orbit picker mockups kb6_*, then build in new files.
done: mockups kb6_* (findings/builder_mockup_src/build6.mjs, drawn through orbit_pick.ts); orbit_pick.ts, OrbitPicker.vue, tests/web/build_orbit_picker.test.js (6 pass). next: when the copy agent is done, wire "Pick orbit" into HandDesigner.vue and a palette command; belts check; gates; browser pass.
done: copy rewrite in (118 strings, §21); Pick orbit wired with a palette command; belts verified; four gates green; browser pass kb6_built_* (world by pointer, moon by keyboard, companion star, Escape, Keep, orbit view, spans, 520 px, worst frame 8.4 ms); servers stopped; report written. next: the orchestrator's next prompt.
