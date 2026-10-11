# Lane F — expert review of Build and the hand designer (read-only)

Issued 2026-10-11 by the orchestrator. You are a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/F.md`,
`directives/design_reference.md`, then this file. Git read-only only. No deploy. You
do not edit `rules/` and you state no Traveller rule from memory.

## Why you

You are the specialist Johnny brings in from time to time for complex systems and very
refined UI and UX. Five other lanes built the galaxy Builder over three days, each
seeing one corner, each to a recipe. It works and its tests pass. Nobody has yet looked
at the whole of it the way a referee meets it. Johnny's bar, in his words on this
project: "make it best-in-class"; the rebuilt app must match the polish of the legacy
app it replaces (`design_reference.md`; the legacy look is the bar, and a tokens-only
restyle was rejected once); and every sentence a person reads follows the Google
developer documentation style guide. His own reactions so far, which the lanes then
fixed in part, tell you what he notices: a selected hex hidden by the pane that opens;
a plain drag that drew a box when he wanted to pan; "cryptic" instructions in "purple
prose"; a way back at the bottom of a pane so he kept pressing X; typing a number where
he wanted to point at an orbit; free text where a value comes from a closed list.

## Goal

**A ranked review, not a build.** You change no product file. Write
`findings/build_ux_review.md`: what a referee meets when building a galaxy by hand and
by generation, where it is short of best in class, and what to do about each, in the
order you would do it. Five lanes are editing this tree as you read; a review that
edits nothing cannot collide with them, and each finding you write becomes a prompt for
the lane that owns the file.

## What to look at

Run it; do not review from code alone. Your own API on a free port with its own state
directory and your own Vite pointed at it, both stopped when you finish; never use or
stop a server you did not start. Sign in as the dev admin
(`scripts/dev_make_admin.js`; read it first). A real pointer where you can, keyboard
only once through, and at the pane's three widths (column, half, full) and 520 px, with
reduced motion once.

The Builder, end to end:
1. Entering Build; the strip, the bar, the palette; what is discoverable without the
   palette and what is not.
2. Selecting: click, Shift+click, the box, the Select tool, hover, cursors, the glide
   that clears the pane, the keyboard neighbours (`U I O / N M ,`), the cap.
3. Generating: one hex, many, a subsector, a sector; the generate sheet's settings;
   progress, Stop, Undo, Restore; generating in an empty sector slot (the sector is
   made with the systems, one Undo).
4. The system editor on a generated system: the form, a draft, Keep, Discard, a
   conflict ("Keep mine").
5. The hand designer: a blank system; "Design by hand" on a charted and on a generated
   system and its Restore; adding stars, worlds, gas giants, belts and moons; a body
   around a pair of stars; a belt around a world; the star dropdowns; the orbit picker
   (pointer and keyboard); orbit number and AU; "Roll profile"; removing a star with
   what orbits it; the asks.
6. Sectors: making, naming, moving, removing, subsector names.
7. From Build to the orbit view and the dossier for what was just made, and back.
8. Publish selection and My packages (the marketplace stub; its server is not built,
   so judge the screens and the copy, not the result).
9. Signed out, and offline.

The specifications of what was intended, to judge against (do not re-litigate
decisions Johnny has taken; they are on the board under Decisions):
`findings/builder_system_design.md` (the design note, sections 18 to 23 are the latest),
`findings/marketplace_screens_design.md`, `directives/contracts/b_builder.md`, the
shots under `findings/ui_design_shots/` (`kb3_*` to `kb7_*`, `km_*`), and the legacy
app for the look (`hex_map.html`, `style.css`, and `tests/harness/legacy.js` if you
need its behaviour).

## What to judge

- **The model.** Is there one clear idea of selection, draft, Keep and Undo across
  every act, or do acts differ in ways a person has to learn one by one? Where does
  the app make the person hold state in their head?
- **Flow and friction.** Count the steps and pointer travel for the ten things a
  referee does most. Name every dead end, every place the next step is not on screen,
  every modal that could be inline, every confirmation that could be an Undo.
- **Feedback and motion.** Does every act answer within a frame; is anything popping,
  shifting, or loading twice (manifesto, "Graceful"); is motion carrying meaning or
  decorating. Measure where you assert: a frame time, a layout shift.
- **Visual refinement.** Hierarchy, spacing rhythm, alignment, density at each width,
  type scale, the use of the tokens, states (hover, focus, busy, disabled, empty,
  error), and whether it reads as one product with the legacy reference's character
  or as five authors. Be specific to the pixel where it matters.
- **Words.** Against the Google developer documentation style guide: every sentence
  that is unclear, long, passive, inconsistent in naming, or missing the next step.
  Quote it and give the replacement.
- **Access.** Keyboard reach and order, focus that is always visible, names and roles
  for a screen reader on the custom controls (the picker, the marks layer, the menus),
  contrast, target sizes on touch.
- **System risk.** You also see complex systems: where the browser's draft, the
  server's revision and the undo tokens could disagree and show a person something
  untrue (a stale preview, a count that lies, an Undo that takes back more or less
  than its words say). Read `apps/web/src/builder/` and the contract for these; give
  the sequence of acts that would show it, and try it.

## The note

1. **Verdict in ten lines:** where it stands against best in class, and the three
   changes that would move it most.
2. **Findings, ranked**, most valuable first. Each: what you saw (with a shot under
   `findings/ui_design_shots/kf_*` or a measurement), why it matters to a referee,
   the change you recommend in enough detail to build, its size (an hour, a day, more),
   the files it touches and the lane that owns them (`directives/lanes/*.md`), and
   whether it needs a decision from Johnny first.
3. **What is already right** and must not be lost in a refinement pass: be as specific
   as with the faults.
4. **Faults**, apart from taste: anything that is simply broken, with the steps.
5. **Questions for Johnny**, each written out in full with your recommended answer
   first and what it blocks.

Rank honestly. A list of forty equal items is not a review; say what you would do
first if only three things could be done.

## Gates

None of the four apply; you change no code. Yours: `git status --porcelain` before and
after, identical except this prompt's Progress and your report (the note and shots are
under git-ignored `findings/`); paste both. Your servers stopped.

## Stop rule

Stop when the note is written and the report filed. Do not start fixing: if something
is one line and obviously wrong, it is finding number one, not an edit. If the app
will not run for you because another lane is mid-edit (three test files are red in
Lane C's texture work as this is written), say what you could not see and review the
rest.

Write `directives/reports/f_build_ux_review.md` from `directives/reports/_TEMPLATE.md`:
the verdict, the top ten findings in one line each with owner and size, and every
question for Johnny in full. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: Read the lane assignment, recovery state, design reference and Builder contract; no predecessor review or report exists, and no owned changes need recovery. next: Run isolated local API and Vite and inspect the referee workflows.
