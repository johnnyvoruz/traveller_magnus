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

### A3. "Today's" temperature: a formula to approve

You asked for this if it can be calculated. It can, using only the engine's own terms.

The engine works out a world's high and low temperature by raising or lowering the star's
effective brightness by a "variance" made of three parts (`mgt2e_world_engine.js:1757-1786`):
a **tilt** part (the sine of the axial tilt, halved for a very short year and raised by half
for a very long one), a **rotation** part (day and night) and a **geography** part (how much
land), all divided by `1 + pressure`. Temperature goes with the fourth root of brightness.

Proposal: "today's" temperature uses the **tilt part only**, scaled by where the world is in
its year:

```
today (northern) = mean × (1 + tiltPart × sin(orbit angle) / (1 + pressure)) ^ 0.25
today (southern) = the same with the sign of sin flipped
```

The orbit angle is the one the orbit view already draws, with spring at angle 0 (your
convention). Day and night, geography and the orbit's eccentricity are left out, so this is
the hemisphere's average for the season, labelled as an estimate with the inputs in the
tooltip.

Worked example with made-up round numbers: mean 288 K (15 °C), tilt 23°, pressure 1 bar.
Tilt part = sin 23° = 0.39. At midsummer: 288 × (1 + 0.39 / 2)^0.25 = 301 K (28 °C). At
midwinter: 288 × (1 − 0.39 / 2)^0.25 = 273 K (0 °C). At the equinoxes: 288 K.

This is a new derived figure, not something the rules state, so it needs your yes. Approve
it as written, change it, or say no.

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

### A8. Daylight latitude

The orbit card now shows hours of light at the equator and at 45° over the year. Is 45° the
latitude you want quoted, or another?

*Interim: 45°.*

**Answer:**

### A9. How small a tilt means "no seasons"

Below some axial tilt the season line is dropped. 3° or 5°?

*Interim: Agent D's current value.*

**Answer:**

### A10. Star temperatures

Stars show their temperature in °C and °F like worlds. Keep that, or show stars in kelvin?

*Interim: °C and °F.*

**Answer:**

### A7. Highport art (answered)

**Answered 2026-10-04: yes, the images are yours and ship.** The four highport paintings
are copied to `apps/web/public/starports/`.

---

## E. Planet surfaces (from the surfaces recipe, `recipe_planet_surfaces.md` §9)

E1 and E2 are answered. The others have interim answers.

### E1 and E2. Hex terrain (answered)

**Answered 2026-10-04:** copy what the old app does first ("vanilla"). Improvements to terrain
and world appearance are welcome, as enhancements that can be switched off to return to
vanilla. Recorded in `recipe_planet_surfaces.md` §0. Terrain stays a picture made in the
browser, as in the old app; any terrain class table belongs to the enhanced mode and comes
to you for approval when it is proposed.

### E3. Where is longitude 0 on a world?

The map and the turning disc need one answer. The old orbit view puts a world's prime
meridian toward the right of the system at day 0. Keep that?

*Interim: keep the old app's.*

**Answer:**

### E4. Effects with nothing in the data behind them

Aurora would need a magnetic-field or stellar-activity value, which the generated systems do
not carry. The same goes for volcanic plumes beyond what the geology fields say. Supply a
rule or a field, or they stay out.

*Interim: left out.*

**Answer:**

### E5. Vegetation that looks Terran

`planet_rendering.md` has an open question: is `compatibility` the right field to decide how
Earth-like a world's vegetation looks?

*Interim: as that document has it.*

**Answer:**

### E6. Surfaces for other editions

The orbit view reads Mongoose-generated systems only. Do Classic, T5, RTT and Architect of
Worlds systems get surfaces now, or with the Builder slice where those can be generated?

*Interim: with the Builder slice.*

**Answer:**

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
