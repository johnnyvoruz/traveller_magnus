# Agent A — three small things Agent D is waiting on

Issued 2026-10-06 by the orchestrator. Do this **after** `a_pane_step1.md` is reported (or
now, if that is done). Report all three together.

## 1. Reaction-drive fuel, in `campaign/travel.ts`

Johnny supplied the rule and confirmed the reading. `rules/mgt2e_space_travel.json` now has a
`manoeuvre` block. **If that block is absent, stop and say so.** Run `npm run rules:gen`.

- `reactionFuelTons(hullTons, thrust, hours)`:
  `manoeuvre.reactionDriveHullFractionPerThrustPerHour * hullTons * thrust * hours`.
  Inputs that are not finite, or negative, throw. Zero hours is zero tons.
- `MANOEUVRE_DRIVE_USES_FUEL`: a boolean read from `manoeuvre.manoeuvreDriveFuel`
  (`"none"` is false). No number from the block written in code.
- Tests: the book's own example read from the rule (Thrust 4 for one hour is 10% of the
  tonnage); the assumed hull at 2 G for 10 hours; zero hours; the refusals.

## 2. An empty track is no track, in `campaign/track.ts`

Agent D found it: "Remove last leg" on a one-leg track leaves `status.track = []`, and
`whereAreWe` then answers `positionAt([])`, which is null, where a ship with no track answers
its anchor. Rule: **an empty track reads as no track everywhere.** `whereAreWe` falls back to
the vessel's anchor; anything else in `campaign/` that asks "has this ship a track" agrees.
Leave what is stored as it is. A test for a ship whose only leg was removed.

## 3. The real chart in a local browser, in `apps/web/vite.config.ts`

A fresh agent's local orbit view cannot load a system: the local API's newest released truth
is `vtest`, and the web then asks the public CDN for `truth/vtest/manifest.json`, a 404.
Add a second dev proxy rule: when the environment variable `VOYAGE_TRUTH_API` is set,
`/api/truth` goes to it; unset, everything is as today. Dev server only; no change to the
build, to `src/`, or to any chunk. Then
`VOYAGE_TRUTH_API=https://traveller.voyage npm run dev:web` shows the released chart from the
CDN over a local campaign API. Prove it with the dev server: `/api/truth/versions` through
the proxy returns production's list with the variable set and the local list without it.
Say the exact command in your report; it goes into the agents' briefs.

## Check

`npm test`, `npm run check`, `npm run build` green, pasted. Do not touch `orbit/`,
`workspace/`, `views/` (Agent D is mid-step), `packages/`, or `router.ts` in this step.
Stop and report.
