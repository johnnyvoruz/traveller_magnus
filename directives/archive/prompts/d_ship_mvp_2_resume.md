# Agent D — ship MVP part 2, resumed: steps 1 to 3, and the Party tab

Issued 2026-10-06 by the orchestrator. Your step 4 (the Track section, `TrackBlock.vue`,
`track_rows.ts`, `track_actions.ts`) and its commands are **accepted as built**. Stopping at
the missing helpers was right. This continues `directives/prompts/d_ship_mvp_2.md`; that file
still holds the steps, and this one only says what has changed.

## The helpers are on disk now

They were written while you worked. Read both before you start.

- `apps/web/src/campaign/travel.ts` (Agent A): `transitSeconds(distanceKm, accelG)`,
  `jumpParsecsCounted(parsecs)`, `jumpFuelTons(hullTons, parsecs)`, `ASSUMED_HULL_TONS`,
  `rollJumpHours(random?) -> { hours, dice }`.
- `apps/web/src/orbit/distance.ts` (Agent C): `realDistanceKm(plan, fromKey, toKey, days)`.
  It answers null for a moon today; C is adding moons now. Build your "distance unknown"
  state as the prompt says and it will fill itself in when C's step lands.

**Build steps 1, 2 and 3 of `d_ship_mvp_2.md` exactly as written**, with one addition.

## Addition to step 3: the flight's fuel (Johnny, 2026-10-06)

Johnny supplied the rule: a manoeuvre drive uses no fuel; a reaction drive does. The app does
not know which drive a ship has, so the flight preview shows **two quiet lines**:
"Manoeuvre drive: no fuel" and "Reaction drive: about N tons · 100-ton hull assumed", where
N is `reactionFuelTons(ASSUMED_HULL_TONS, G, hours)` from `campaign/travel.ts`. Agent A is
adding that function. **If it is not there when you reach this, leave both fuel lines out
and say so in the report.** No formula of your own.

## Your two questions, ruled

1. **"Where are we" answers from the track.** On the Party tab, and for the party's marker
   on the map, the place is `whereAreWe(party, records, campaignDays)` from
   `campaign/track.ts` at the campaign date, not the anchor alone:
   - an anchor: the place in words, as now;
   - a fix on a flight or a jump: the strip's own words (`statusWords` in `ship_list.ts`;
     one formatter, not a second), for example "In flight Regina A-IV → Regina A-X, arrives
     136-1105 20:00";
   - the marker: on a flight, the system the leg is in; **in a jump, your design call**
     (the ship is in no hex): decide from the manifesto, build it through
     `MapRenderer.setCampaign` as the marker is fed today, and record the choice.
   - **"Move the party"**: for a ship with a track it writes one `docked` leg at the chosen
     place at the campaign date, through `appendLeg`; when the track refuses it (a later leg,
     or the ship still under way at that date), a toast says why in plain words and what to
     do. For a ship with no track it writes the anchor, as now.
2. **An empty track is no track.** Agent A is changing `whereAreWe` so that an emptied track
   falls back to the anchor. Build as if it does; do not edit `track.ts`, and do not work
   round it on your side.

## Seeing the real chart in your local browser

Your orbit picture stayed on "Loading this system" because the local API's newest released
truth is `vtest`, which the public CDN does not hold. Until Agent A adds a dev proxy for it:
**have your browser driver answer `GET /api/truth/versions` with production's answer**
(`https://traveller.voyage/api/truth/versions`), and let every other `/api` call go to the
local API. The chart is then the released truth from the CDN, and the campaign is local.
Use the existing local campaign "Spinward Run"; do not create one (the local API refuses a
truth version it does not know). Your own Vite on its own port, as you did, is right; leave
the servers on 5173 and 8787 alone.

**The orbit view must be exercised for this step** (plot a flight, see the estimate follow
the G chooser, mark a destination, see the parsecs, the roll and the fuel, jump). If you
still cannot load a system, stop and say exactly what was fetched and what came back.

## Check, and report

As `d_ship_mvp_2.md` says, plus: the Party tab at a date mid-flight, mid-jump and after
arrival; "Move the party" on a ship with a track (accepted and refused) and without one;
the marker in each case. Retake `k12b_track_jump_docked.png`. Notes into
`findings/orbit_view_design.md` §8s. The same "do not touch" list. Stop and report, in the
brief's format.
