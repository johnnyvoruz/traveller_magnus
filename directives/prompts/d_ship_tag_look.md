# Agent D — an addition to `d_waypoints.md`, while you are in it: what a ship's tag looks like

Issued 2026-10-06 by the orchestrator. This changes one part of the step you are on (the
tag); nothing else in `d_waypoints.md` changes. Finish the item you are on, then fold this
in. One report at the end, as before.

## What Johnny said

Looking at a ship on the live picture beside a selected planet
(`findings/ui_design_shots/ref_ship_tag_like_planet_tag.png`: the planet's amber tag reads
"DENSITOMETER / X448000-0" on its leader; the ship is a small grey circle with "New vessel"
in small grey type):

> *"I want the ship tag to look like the planet select tag like we have here; it's nearly
> impossible to see right now."*

## What it means for the tag you are building

- **A ship's tag is the planet's selection tag:** the same box, border, fill
  (`--orbit-tag`), type, capitals, weight and leader line, at the same size. Two lines, as
  the planet's has: the ship's name, and under it its state in the strip's short words
  (docked, in orbit, under way to …, holding at …, in jump). No invented fact: the second
  line is `statusWords`, shortened if you must.
- **Every ship on the picture has one, not only a docked ship:** docked or in orbit (popping
  out of the body, as `d_waypoints.md` says), holding at a point, and under way (the tag
  rides with the mark, on a short leader, and does not flip sides while it moves). It is
  still the pressable, keyboard-reachable control that selects the ship.
- **It must be seen.** The planet's tag is the standard: if a ship's tag is harder to read
  than that at the fitted zoom, it is not done. The selected ship's tag is the amber one;
  say what the unselected ones are (the same construction and as legible; the party's ship
  distinguished). When a planet is selected too, its tag and the ships' tags do not
  overlap: say the rule.
- **The designator stays** as the ship's mark on the picture; the tag names it.
- The renderer still draws each ship's small grey name beside its designator. Agent A is
  adding a switch so that it stops when your tags are on (asked in A's next prompt). Until
  it lands, place the tag so the two do not sit on top of each other, and say so.

Screenshots `fu28_tag_*` beside `ref_ship_tag_like_planet_tag.png`: a docked ship, two at
one body, one under way, one holding at a point, the party's ship selected, with a planet
selected as well. Contrast pairs for each state.
