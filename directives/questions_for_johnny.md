# Questions for Johnny

Open decisions that only you can make. Type your answer on the **Answer:** line under each
question, save the file, and tell the orchestrator "answers are in". A few words is enough.
Leave a line blank to keep the interim choice shown under it.

Last updated: 2026-10-05 (A5, A8 to A10, A15, A16, E11 to E13 answered by the orchestrator on Johnny's instruction).

---

## A. The orbit view and the dossier (from Agent D)

Rewritten 2026-10-04 so the open ones are together. Nothing here blocks the build: the agent
is working with the interim choice shown, and your answer replaces it. Six are open (A5,
A8 to A10, A15, A16). A11 to A14 were ruled on 2026-10-04 and are done; the earlier answered
ones are listed at the end of this section.

### Open

### A5. Body chips

A row of chips along the bottom of the orbit view, one per star and world, with each
world's moons in a pop-up. It is in the design reference but the old app does not have it.
It is also how a keyboard user reaches every body. Keep it?

*Interim: built.*

**Answer:**
Keep it. It is the keyboard path to every body and a referee's quickest way round a system at the table. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### A8. Daylight latitude

The orbit card quotes hours of light at 45° latitude over the year, and the dossier's Day and
night card draws its second strip for 45°. Is 45° the latitude you want, or another?

*Interim: 45°.*

**Answer:**
45°: keep. A middle latitude is the honest single figure; the strip and the card say "at 45°". (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### A9. How small a tilt means "no seasons"

Your answer on moon seasons said a tilt under 3° reads "negligible seasons". The delighter
note (`campaign_manager_plan.md` §7.4) hides the season label under 5°. Which one holds for
every world: 3° or 5°?

*Interim: 3°.*

**Answer:**
3°, Johnny's own figure from A1, for every world. The 5° note in campaign_manager_plan.md §7.4 is superseded. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### A10. Star temperatures

Stars show their temperature in °C and °F like worlds. Keep that, or show stars in kelvin?

*Interim: °C and °F.*

**Answer:**
Kelvin for stars, as Johnny wrote above: "5,800 K". Worlds stay °C (°F). (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)
I feel like K is right for stars, because that's how we measure light bulbs 


### A11. Today's temperature on a planet locked to its star

The approved formula (A3) swings the temperature with the season. A planet locked to its star
has one face always sunward, and the engine leaves a locked world a tilt of 3° at most, so the
formula would show nearly the mean on both hemispheres, which says nothing about its hot and
cold faces. Should such a world show:

- (a) no "today" lines,
- (b) the formula's result anyway, or
- (c) something else you name (for example its high on the day side and low on the night side)?

*Interim: (a), no lines.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a), no lines.** Built and tested.

### A12. Today's temperature where the formula has no answer

When the tilt part is larger than 1 + pressure (a strongly tilted world with almost no
atmosphere), the winter side of the formula takes the fourth root of a negative number.
Should that hemisphere show:

- (a) no "today" line,
- (b) the world's low temperature instead, or
- (c) another floor you name?

*Interim: (a), no line for that world.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a).** When the bracket under the root is not positive there is no line. Built and tested.

### A13. Proving the copied tilt term against the engine

The brief said to stop if the engine does not expose the tilt term on its own. It does not:
the term is worked out in the middle of a larger function
(`packages/engines/src/mgt2e_world_engine.js:1757-1759`). The copy in
`apps/web/src/orbit/today_temp.ts` is tested against hand-worked values, but not against the
engine. Proposal: a test that reads those three lines out of the engine file and runs them
beside the copy, the way the legacy parity tests do, with no change to the engine. Yes or no?

*Interim: not written.*

**Answer (2026-10-04, ruled in `handoff.md` §59): yes.** The test reads the three lines from the engine file and runs them beside the copy. Written; it passes.

### A14. The "Day" tile beside the Day and night card

The dossier's "Day" tile comes from the dossier model: it is the spin against the stars, or
the words "Tidally locked". The Day and night card under it gives the day from one sunrise to
the next. On Regina the tile says "Tidally locked" (to its planet) while the card says
"24 hours", which reads as a contradiction though both are true. Choose:

- (a) rename the tile "Rotation",
- (b) drop the tile when the card is shown, or
- (c) leave it.

(a) and (b) change `dossier/model.ts`, which belongs to the dossier's owner, not Agent D.

*Interim: (c), left as it is.*

**Answer (2026-10-04, ruled in `handoff.md` §59): (a).** The tile is now labelled "Rotation".

### A15. What to call the 24-hour day

The dossier now says "standard days (24 h)" for the clock's day and "local days" for the
world's own. "Standard day" is Agent D's wording. Keep it, or name the term you want
("Imperial day", "galactic standard day", another)?

*Interim: "standard days (24 h)".*

**Answer:**
Keep "standard days (24 h)" and "local days". Nothing in rules/ names the calendar day; if Johnny later wants an in-setting name, it is one string. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### A16. Where a world's starport stands (for the local-time tick)

You decided the local-time tick on the Day and night strip is for the starport, with the
map's prime meridian as the fallback (`campaign_manager_plan.md` §7.10). Nothing in a released
system says where on a world its starport is. Until something does, every world uses the
fallback. How should a starport get its place?

- (a) the referee pins it on the surface map,
- (b) a rule you supply places it, or
- (c) the prime meridian is the starport's longitude by definition.

This goes with E3 (where longitude 0 is), which is also still open.

*Interim: the fallback for every world.*

**Answer:**
(c) for now: the prime meridian is the starport's longitude by definition, so the local-time tick is the starport's. (a), a referee-placed pin on the surface map, becomes a campaign feature once the surface map takes pins; the pin then overrides (c). Settles E3 the same way: longitude 0 is the starport. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### Answered

- **A1. Seasons on a moon.** Answered 2026-10-03: `tidallyLocked` means locked to the body it
  orbits; a moon takes its planet's year and orbit angle; under 3° of tilt it reads
  "negligible seasons". Built.
- **A2. Where spring starts.** Answered 2026-10-03: the northern spring equinox is at orbit
  angle 0°, and the tooltip says so. Built.
- **A3. "Today's" temperature.** Answered 2026-10-04: approved as written,
  `mean × (1 ± tiltPart × sin(orbit angle) / (1 + pressure)) ^ 0.25`, labelled an estimate
  with the inputs in the tooltip. Built on the orbit card. A11 to A13 are what it left open.
- **A4. The date a visitor sees first.** Answered 2026-10-03: day 002 of 1105, and a link may
  carry `?date=DDD-YYYY` and `&time=HHMM`. Built.
- **A6. Temperature scales.** Answered 2026-10-03: `18°C (64°F)`, no kelvin on the card. Built.
- **A7. Highport art.** Answered 2026-10-04: yes, the images are yours and ship. The four
  paintings are in `apps/web/public/starports/`.

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

### E7. The same continents as the old app?

The planet pictures will be drawn by the old app's code, ported and proven identical. But the
old app seeded each world's continents from values that lived on your device (its seed and the
hex's position on that map), so a world will look like the same *kind* of world, not have the
same coastlines you remember. Matching old coastlines exactly would need the old seed and map
positions carried over. Is "same look, different coastlines" acceptable?

*Interim: yes.*

**Answer:**

### E8. Planets on a computer without WebGL2

The old app has a third, slower planet painter for computers whose browser cannot do WebGL.
Porting it costs about three agent sessions. Phones and tablets are out of scope, so this
is rare. Port it now, later, or never? Without it those computers see plain lit discs in the
orbit view; the surface map in the dossier works everywhere.

*Interim: later.*

**Answer:**

### E9. Ice caps on hot worlds (first enhancement)

You spotted that the old map painter gives white poles to worlds over 100 °C and ignores
hydrographics. That is the old code, copied faithfully (`js/planet_renderer.js:288-301`): the
cap depends only on the temperature band, and even "Hot" gets a cap from about 80° latitude.
Proposal for the enhanced mode, vanilla left alone: a cap is drawn only where the world's
**low** temperature is below the freezing point of its surface liquid (273 K for water); its
size grows with hydrographics; hydrographics 0 has none. Approve, change, or give your own rule.

**Answer (2026-10-04): approved in principle. Not built yet.** Superseded by E10, which is the
fuller version of the same idea after Agent F's review.

### E10. Seas and ice in the enhanced mode (Agent F's proposal)

Three separate decisions, each from data the world already carries; vanilla is untouched:

1. **How much is covered:** the world's hydrographics percentage when it has one, else the
   Hydro digit times 10%. No minimum sea. (A Hydro 0 world can carry 1 to 5%.)
2. **What covers it:** the generated liquid (water, methane, ammonia, acid and so on), not a
   guess from the atmosphere.
3. **Where it is frozen:** by that liquid's own melting point from the rules table
   (`rules/mgt2e_data.js:740`). Low temperature above melting: no ice. High temperature below
   it: all of it frozen. In between: ice from the poles down, placed by a visual
   approximation, `T(latitude) = mean + A x (1/3 - sin^2(latitude))`, with A limited so it
   stays inside the world's own high and low. Unknown liquid, or missing temperatures: no ice
   drawn. Worlds locked to their star are handled separately (ice on the far side), designed
   when built. No extra snow on land for now.

The latitude formula is a presentation approximation, not a rules figure. Approve, change, or
say no.

**Answer (2026-10-04): approved,** including the latitude formula. Enhanced mode only.

### E11. Sea colours for three liquids (from Agent D, enhanced map)

The enhanced map colours a sea by its liquid, using the colours the old app's planet profile
already holds. Three liquids in the rules table have no colour there: **Fluorine,
Hydrofluoric Acid and Hydrochloric Acid**. The old profile paints any liquid it does not
know in one purple it calls "Unknown Exotic Liquid". Choose:

- (a) use that purple for these three,
- (b) supply a shallow and a deep colour for each, or
- (c) leave their seas undrawn.

*Interim: (c). Their basins are drawn as dry lowland and the caption says "not drawn".
No Regina body has one of the three.*

**Proposed for (b), for your yes** (shallows, then deeps, as red, green, blue), shown beside
the twelve existing colours in `findings/ui_design_shots/surface_liquid_swatches.png`:

| Liquid | Shallows | Deeps | Look |
|---|---|---|---|
| Fluorine | 222, 214, 138 | 136, 124, 52 | pale yellow |
| Hydrofluoric Acid | 150, 178, 172 | 62, 92, 92 | colourless: a pale grey-teal |
| Hydrochloric Acid | 186, 200, 150 | 96, 114, 70 | colourless to faintly yellow-green |

Say "yes", or change any of them. Nothing is in the code until you do.

**Answer:**
(b), the three proposed colours as drawn. A sea the data says is there is drawn. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### E12. The colour of a frozen sea that is not water (from Agent D, enhanced map)

The only ice colours with a source are the old profile's for frozen water. The enhanced map
uses them for every frozen sea, whatever the liquid (Regina A-VIII's frozen oxygen looks like
water ice). Keep one ice colour for all, or supply colours for other ices?

*Interim: water's ice colours for all.*

**Two proposals, for your yes,** on the same sheet
(`findings/ui_design_shots/surface_liquid_swatches.png`, columns 3 and 4):

- **Option A, one neutral "frozen exotic" colour** for every frozen sea that is not water:
  shallows 208, 210, 216; deeps 160, 164, 176 (a grey-white, against water ice's blue-white).
- **Option B, each liquid's own colour, paled:** the shallows 70% of the way to 236, 240, 246
  and the deeps 55% of the way to 176, 188, 204. Frozen oxygen stays faintly blue, frozen
  chlorine faintly green, frozen ethane a warm grey.

Water keeps its existing ice in both. Choose A, B, or keep water's ice for all.

**Answer:**
Option B: each liquid's own colour, paled by the stated amounts; water keeps its ice. A frozen chlorine sea should not look like water ice to a referee reading the map. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

### E13. A liquid the data calls "Unknown Exotic Liquid" (from Agent D, enhanced map)

Regina C-II-g has 26% cover of a liquid the generator named "Unknown Exotic Liquid". It is not
in the rules table, so it has no melting point and the approved rules cannot say where it
freezes. The old profile does hold a colour under that name. Draw such a sea in that colour
with no ice, or leave it undrawn?

*Interim: undrawn; the basin is dry lowland and the caption says so.*

**Answer:**
Draw it in the old profile's colour (152,112,172 / 68,40,102), never frozen, and say "exotic liquid; freezing point unknown" in the caption. A 26% sea drawn as dry land contradicts the data. (orchestrator, 2026-10-05, on Johnny's instruction to answer D's questions)

---

## F. The generated worlds contradict their charts (one decision)

Agent B found that the engines, old and new alike, store physical data for a mainworld that
contradicts its published UWP: Regina (A788899) is stored as a frozen ethane moon at 190 K;
about one mainworld in three in the Spinward Marches has a non-water liquid or an ice label
that its numbers do not support. Details: handoff §58.

### F1. Fix the engines, once, then rebuild the truth once?

Proposal: (1) the principle "a world's stored physical data never contradicts its published
UWP or itself"; (2) Agent F designs the corrections from the findings and the rules files,
and brings you only the points where the rules files do not decide; (3) the new engines are
allowed to differ from the old app, with each difference recorded; (4) one truth rebuild (v6)
at the end.

*Interim: nothing changes; the enhanced map draws what the data says.*

**Answer:**

### F2. What temperature makes a world "Frozen", "Cold", "Temperate", "Hot", "Boiling"?

The rules files tie those five words to **orbit position** only. To show a Climate that
matches the real temperature we need the temperatures. Your other agent quoted: Frozen at
-51 °C and below, Cold up to 0 °C, Temperate up to 30 °C, Hot up to 80 °C, Boiling above.
Confirm that table from your book, or give yours.

*Interim: the dossier shows the temperature and an "Orbital zone"; no Climate word.*

**Answer (2026-10-06): "make it an easy array we can edit later, let's just go with these
for now."** The quoted table is adopted as provisional: Frozen to -51 °C, Cold to 0 °C,
Temperate to 30 °C, Hot to 80 °C, Boiling above; each band includes its upper limit. It
lives in `rules/mgt2e_climate_bands.json` (typed by the orchestrator into
`findings/rules_drafts/`, copied into `rules/` by Johnny), a plain array he can edit; no
band number is written in code.

### F3. When a world's stored liquid is impossible at its real temperature

(Example: "liquid oxygen" at 541 K.) Replace it with the most abundant liquid from your
exotic-liquids table that *is* liquid at that temperature, or leave it marked unresolved?

*Recommended: replace; unresolved only when nothing in the table fits.*

**Answer (2026-10-04): yes, as recommended.**

### F4. What a liquid's name promises

Liquid at the world's **mean** temperature (it may freeze or boil at the extremes, and we
say so), or liquid across the whole low-to-high range?

*Recommended: the mean, with freezing and boiling noted.*

**Answer (2026-10-04): yes, as recommended.**

### F5. A charted world with no climate given

Today the engine assumes "temperate roll 7" and then often cannot honour it. Instead: place
the world in a legal orbit that suits its published atmosphere and hydrographics?

*Recommended: yes.*

**Answer (2026-10-04): yes, as recommended.**

### F6. When no legal orbit suits the chart

List the system as unresolved for you to look at, or let the engine bend albedo and
greenhouse to force a fit?

*Recommended: list it; decide when we see how many there are.*

**Answer (2026-10-04): yes, as recommended.**

### F7. The two internal-heat caps

Keep the engine's existing caps (1000 and 150 on the two components, none on their sum)?

*Recommended: keep.*

**Answer (2026-10-04): yes, as recommended.**

---

## G. Jumps (from K12, parked)

### G1. The jump rules the app would need

For the jump-plotting feature you described on 2026-10-05 (`slice_2_campaign.md` K12),
nothing in `rules/` covers jump or in-system travel, so the app cannot build it yet. When
you are ready, add a `rules/` file (any name) that states, from the Mongoose 2e books:

1. the minimum distance from a body before a ship may jump, and how it is measured;
2. the travel time for a ship at a given G rating over a distance (the formula, and whether
   the ship turns over at the midpoint);
3. how far a jump may reach, from the drive rating;
4. whether the jump duration varies from the 168 hours you gave on 2026-10-02;
5. anything about fuel the app should show or refuse on, or "nothing".

No orchestrator will fill these in from memory. Not needed until the MVP steps are done.

Note (2026-10-05): for (1), the orbit view already draws jump-limit circles at 100 diameters,
copied from the legacy `js/system_viewer.js` (2916 to 2950). Say whether that is the rule to
use for the minimum jump distance, or give another. Likewise for (2): the dossier's "100D jump
travel times" table (1G to 6G) comes from `calculateBaseJourneyTimes` in the engines, copied
from the legacy `universal_math.js`. Confirm it as the travel-time rule, or give another.

**Answer (2026-10-06), with the book's text pasted by Johnny (Fuel, Jump Travel, Travel
Times, Travel Calculations, Transit Times, Common Distances for Traders):**
1. **Yes:** 100 diameters, as the copied code has it (the world's, and the star's where it
   is larger).
2. **Confirmed by the book:** Time = 2 × √(Distance ÷ Acceleration), metres and seconds,
   from rest, accelerating to the midpoint and decelerating to rest, 1 G about 10 m/s².
   That is what `calculateBaseJourneyTimes` computes. The book's Transit Times table
   differs from its own formula by more than rounding in 11 of 90 cells (largest: 100,000 km
   at 6G, table 42 minutes, formula 43.03); the book calls the table a summary of the
   formulae, so the app computes from the formula and the table is kept as reference.
3. A jump carries a number of parsecs equal to the jump number; a jump of less than one
   parsec counts as jump-1.
4. **148 + 6D hours** in jumpspace, whatever the distance. This supersedes the fixed 168
   of 2026-10-02.
5. Fuel: 10% of hull tonnage per parsec jumped. Refined Cr500 a ton, unrefined Cr100 a
   ton; refuelling takes 1D hours. An accurate jump arrives outside or on the verge of the
   100-diameter limit of the target world.

The numbers live in `rules/mgt2e_space_travel.json` (typed by the orchestrator into
`findings/rules_drafts/`, copied in by Johnny). Astrogation checks, inaccurate jumps and the
danger of unrefined fuel are named in the text and not supplied: not built.

### G2. Which ship sheet fields hold the three numbers a jump needs?

The official sheet's Ship Data File has Name, Class, Configuration, **Size**, Hull Options,
Armour, Hull Points; Drives has Reaction Drive Output, **Manoeuvre Drive Output**, **Jump
Drive Output**, **Fuel Capacity**, and cost and power fields. To show "this jump needs 40
tons" and to warn "beyond this ship's drive", the app needs the hull's tonnage, the jump
number and the thrust in G. Is the tonnage "Size", the jump number "Jump Drive Output" and
the thrust "Manoeuvre Drive Output", each written as a plain number?

*Recommended: yes to all three. Interim: the jump preview shows the parsecs and the fuel
as a share of the hull ("2 parsecs, 20% of hull"), with no warning.*

**Answer (2026-10-06): not for the MVP.** "For MVP we won't actually deduct fuel numbers
from a ship, but I'd like to maybe put estimated numbers of time / distance / fuel
measurements when plotting a course for a ship. If it needs data to be calculated due to
mass, we can just set mass at 100 tons for now just for MVP and then I'll figure out what on
the ship fields would actually be used for calculations. The MVP design will essentially let
anything go, it's just measuring and then for vNext we will tie in ship logic to plotting
warnings / refueling." So: the plotting previews show estimates of distance, time and fuel;
the hull is assumed to be 100 tons and the screen says so; no ship field is read, nothing is
deducted, nothing warns or refuses. Which sheet fields feed the sums is Johnny's to decide
for vNext.

### G3. Does a flight inside a system use fuel?

The text pasted on 2026-10-06 gives a fuel cost for jumps only (10% of hull tonnage per
parsec). Does the book give a fuel cost for manoeuvring from one body to another? If so,
the rule is needed; if not, a flight shows distance and time and no fuel.

*Interim: a flight shows distance and time only; fuel appears on jumps only.*

**Answer (2026-10-06):** "I think there might be inner-system fuel rules in a supplement I
don't have, this is the only rule I can find that might be relevant", with the book's text:
**manoeuvre drives do not require fuel; reaction drives do**, at 2.5% of the ship's total
tonnage per Thrust per hour (a Thrust 4 ship needs 10% of its tonnage per hour of use); a
Reaction 0 drive needs 0.25 tons per hour of Thrust; there are 10 combat rounds in an hour.
So a manoeuvre-drive flight uses no fuel. Not yet in `rules/` and not yet built: see G4.

### G4. Should the flight estimate show a reaction drive's fuel, and is this the sum?

The MVP does not know which drive a ship has. The flight preview could show both lines:
"Manoeuvre drive: no fuel" and "Reaction drive: about N tons". The orchestrator reads the
rule as: fuel = 2.5% × hull tonnage × the G flown × the hours of the flight (a flight
thrusts the whole way, to the midpoint and back down). For the assumed 100-ton hull at 2 G
for 10 hours that is 50 tons. Is that the sum, and should both lines show?

*Recommended: yes to both. Interim: a flight shows distance and time and no fuel line.*

**Answer (2026-10-06): yes.** Both lines show, and the sum is 2.5% × hull tonnage × the G
flown × the hours of the flight. The numbers go into `rules/mgt2e_space_travel.json` (a
`manoeuvre` block); `reactionFuelTons` in `campaign/travel.ts` computes it.

### G5. The reaction-drive figure on a long flight

The flight estimate's reaction-drive line uses the sum Johnny confirmed (2.5% × hull × G ×
hours) and assumes thrust all the way. On a long flight it passes the ship's own tonnage: a
35 AU flight at 2 G reads "about 1,424 tons" for the assumed 100-ton hull. Leave the number
as it is; or, when it is more than the hull, say "more than the ship's tonnage" in place of
the number; or hide the reaction line for the MVP?

*Recommended: the second. Interim: the number is shown as computed.*

**Answer (2026-10-06): not picked.** Johnny pasted the book's drive tables (kept in
`findings/rules_notes/mgt2e_drives.json`, not in `rules/`) and said "let's just keep it easy
for now, knowing we might change some stuff up" when he has the Cluster Truck supplement.
The orchestrator took the recommended option: over the assumed hull the line reads "more
than the ship's tonnage". He may change it.


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

**Answer (2026-10-04): campaign first.** Optional login; everyone signed in gets their own
campaign layer over the base truth map; making their own maps (the Builder) comes after.

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
