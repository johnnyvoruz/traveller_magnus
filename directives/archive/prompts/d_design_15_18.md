# Agent D — two designs, on paper only (follow-ups 18 and 21; 15 is settled)

Issued 2026-10-06 by the orchestrator. Ship MVP part 2 is **accepted** (the rolled jump time,
the flight estimate with both fuel lines, the Party tab and marker from the track). Stopping
at the missing hex distance was right; Agent A is adding it, and the parsecs and jump fuel
line comes back to you in the next prompt.

**This step edits nothing under `apps/`, `packages/` or `tests/`.** Other agents are
mid-step on files your part 2 shares, and Johnny pushes part 2 as soon as they report; the
tree must stay as it is until then. Write to `findings/` only.

Read `directives/agent_d_brief.md`, then `directives/slice_2_campaign.md` follow-ups 15 and
18, then the manifesto again with these two in mind.

## 1. Follow-up 15: settled, and not yours in this step

Johnny has approved an analysis of the two sidebars and the pinned card
(`findings/dossier_identities_analysis.md`): the system page says where the hex sits and
what is in the system, the world page is the only one that decodes the world, and the
pinned orbit card shows what the picture is doing now and leaves the survey to the sidebar
when the sidebar is open on the same body. **A new Agent E is building it**
(`prompts/e_dossier_identities.md`) in `dossier/`, `orbit/card.ts` and `orbit/BodyCard.vue`.
Do not design it and do not touch those files. If you have already written
`findings/orbit_body_card_design.md`, leave it; say in your report where it differs from the
approved analysis. Read the analysis: your other screens will sit beside the result.

## 2. Follow-up 18: the locked world's Day and night card

For a world that keeps one face to its star, the card reads "No day and night · one face
always points at the star" over an empty Day side / Night side strip. Johnny wants the strip
gone for such a world and the fact shown as a short **computer-terminal readout "from the
Scouts"**: monospace, in the tokens (the `--signal` on `--bg-2` terminal look the design
page has, or one made for it), a few lines such as "ROTATION: LOCKED". **No new facts:**
every value is one the dossier already holds for that body; say which field each line reads.
The words are a display choice, not a rule; no Traveller meaning from memory.

Write `findings/daynight_locked_design.md`: the lines and the field behind each; the look,
copied from the design page where it has one; whether it types on, and what reduced motion
does; column, half, full, 520 px; a mockup (`fu18_*`); and exactly what Agent C must build in
`dossier/DayNight.vue`, which is C's file. If more than one treatment is worth Johnny's eye,
give at most three, numbered, your recommendation first.

## 3. New, from Johnny today: where the bodies will be

His words: *"when plotting courses, we're going to want to know where the planets will be at
that time, so as the time advances, we're going to make like holographic outlines of the
celestial bodies of where they would be at that time so the user can plot their location
correctly."* And: *"let's just keep it easy for now"*; a supplement he does not yet have may
change the rules later.

Today the plot card measures to where the destination is **at departure**, and a ship in
flight is drawn on the line between the two bodies as they move. A flight of days lands
where the destination no longer is. Design the easy, honest version:

- **Holographic outlines.** While a plot preview is open, each body also shows a ghost at
  the place it will have **at the previewed arrival** (departure plus the hours in the
  card), and the destination's ghost is the one the eye goes to. As the hours or the G
  change, the ghosts move. Decide what a ghost is (an outline, a wireframe in the family of
  the designators and the Moons sweep, how faint, labelled or not, which bodies get one so
  the picture does not fill up), and how it arrives and leaves under the tokens' motion.
- **The flight line** in the preview runs from the ship to the destination's ghost, not to
  the destination's present place.
- **The estimate** measures to the ghost: the distance from where the ship is at departure
  to where the destination will be at arrival, which settles in a few rounds of the same
  sum (`realPositionAu` at two dates, `transitSeconds`). Say what the card shows while it
  settles and when a place is unknown.
- **A ship under way** then travels the straight line from where it left to where the
  destination will be when it arrives, so the mark ends on the body.

Write `findings/plot_ghosts_design.md`: the look, with mockups
(`findings/ui_design_shots/fu21_*`: the picture with a short flight and with one of several
days, at Regina); the commands and keys, if any; reduced motion; exactly what Agent C must
draw and what data the renderer needs from the view (C owns `OrbitRenderer.ts`,
`orbit/ships.ts` and `orbit/distance.ts`); exactly what you will wire; and the order of
steps. Choices for Johnny only where the look truly forks, three at most, your
recommendation first.

## Report

Lead with one sentence. Then the recommendation for 18 in three lines, the design for the
ghosts in five lines, the files written, and anything you need ruled. No commands to run; say
"no edits outside findings/". Stop and report.
