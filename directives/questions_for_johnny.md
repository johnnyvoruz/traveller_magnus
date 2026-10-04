# Questions for Johnny

Open decisions that only you can make. Type your answer on the **Answer:** line under each
question, save the file, and tell the orchestrator "answers are in". A few words is enough.
Leave a line blank to keep the interim choice shown under it.

Last updated: 2026-10-04.

---

## A. The orbit view (from Agent D)

The agent is building with the interim choice shown, so nothing is blocked; your answer
replaces it.

### A1. Seasons on a moon

Regina is a moon of a gas giant, and its data says it is tidally locked. The delighter note
says a locked world has "no seasons: one face always sunward", which is true of a planet
locked to its star, not of a moon locked to its planet. For a moon, should the season line:

- (a) use the parent planet's year with the moon's own tilt,
- (b) say only that its year is its parent's, with no hemisphere claim, or
- (c) not appear?

*Interim: (c), moons show no season line.*

**Answer:**

### A2. Where spring starts

The old orbit view has no closest-approach point: a body starts at a fixed angle and moves
at a steady rate on a circle. The delighter note puts the northern spring equinox "at
periapsis", which the data does not have. Proposal: spring equinox is where the drawn orbit
angle is zero, and the tooltip says so. Agree, or name another convention.

*Interim: the proposal.*

**Answer:**

### A3. "Today's" temperature

The delighter wants the average temperature adjusted for the current season, but no formula
was given. Supply one, or the card shows the yearly average, high and low only.

*Interim: left out.*

**Answer:**

### A4. The date a visitor sees first

The old app opens on the campaign clock, or Year 0 Day 1 if there is none. The viewer has no
campaign. Options: Year 0 Day 1, Year 1105 Day 1 (the year the chart data is for), or another
date you name. A date in the link always wins.

*Interim: Year 1105, Day 1.*

**Answer:**

### A5. Body chips

A row of chips along the bottom of the orbit view, one per star and world, with each
world's moons in a pop-up. It is in the design reference but the old app does not have it.
It is also how a keyboard user reaches every body. Keep it?

*Interim: built.*

**Answer:**

### A6. Temperature scales

Show both (°C first, then °F), or one, and which? There is no settings screen yet, so the
first build has no switch.

*Interim: both.*

**Answer:**

### A7. Highport art (answered)

**Answered 2026-10-04: yes, the images are yours and ship.** The four highport paintings
are copied to `apps/web/public/starports/`.

---

## B. The map

### B1. Two route colours are hard to see

The X-boat green and the core-route purple fall below the contrast level for lines on the
map background (2.85 and 2.08 against a minimum of 3). They are the colours the charts use.
Keep the chart colours, or brighten them?

*Interim: chart colours kept.*

**Answer:**

### B2. Small text contrast

Agent D held all text under 12 px to a stricter contrast level than the standard requires
(7:1 instead of 4.5:1), because your concern was small type. Keep the stricter level, or use
the standard one?

*Interim: stricter level kept.*

**Answer:**

### B3. Unlabelled subsectors

After the title jitter fix, a subsector whose title would sit off to the left or under the
panel has no title, even when it fills the view. Suggestion: add a constant
"Sector · Subsector" readout for the centre of the view in the status line. Do you want it?

*Interim: not built.*

**Answer:**

### B4. Polity colours

Each polity now has one colour everywhere, picked from the old palette by its name (the
Imperium is white, the Zhodani orange, the Aslan purple; some polities share a colour). You
said colours should be set in the UI per map, which is Builder work. Until then, do you want
any of the big polities set by hand in `universe/polity_colours.json`? List name and colour,
or leave blank to keep the defaults.

*Interim: defaults.*

**Answer:**

### B5. Body position counter in the dossier

The old app shows "3 / 14" after the Next button; the new one shows it between Previous and
Next. Keep it between, or move it after?

*Interim: between.*

**Answer:**

---

## C. The app

### C1. The favicon

Agent D installed a far-trader wedge with a red V. The red (`#d8202a`) is its guess at
Traveller red. Keep it, pick another of the four options in
`findings/ui_design_shots/favicon_options.png`, or give the exact colour.

*Interim: D's choice.*

**Answer:**

### C2. Fonts

The old app uses two font weights the new one does not ship, so some text is slightly too
light or too heavy. Fixing it means adding two font files. Yes or no?

*Interim: not added.*

**Answer:**

### C3. Where production deploys from

Today every push to `campaign` goes live. Now that tests run on every push, production could
deploy from `main`, with `campaign` as a preview site. Do you want that?

*Interim: `campaign` deploys to production.*

**Answer:**

---

## D. Direction

### D1. Players before the Builder?

An earlier review suggested a thin "Table" slice (campaign, invite link, members, ship,
clock, journal) between the Viewer and the Builder, so players exist before the full editing
tools do. Do you want that order, or Builder first as the plan has it?

*Interim: the plan's order (Builder next).*

**Answer:**

### D2. Sign-in providers

Only X sign-in exists. Discord and Google before anyone outside is invited?

*Interim: X only.*

**Answer:**

### D3. One subsector at a time

You said users may generate "no more than one subsystem at a time". I read that as one
subsector (80 hexes) per request, with per-user metering. Is that right?

*Interim: not yet applied to the specs.*

**Answer:**

### D4. Three commits that include old-app files

Commits `089551d`, `595457c` and `0b96b80` (2 and 3 October) include files from the old app
alongside the new one. Were those your own pending old-app work being committed? (This is
the last open box on the slice 0 checklist that only you can close.)

**Answer:**
