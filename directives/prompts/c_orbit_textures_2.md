# Lane C — URGENT, second pass: the orbit view's discs are grey, with day and night but no texture

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file, then your first report
(`directives/reports/done/c_orbit_textures.md`). No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory.

## What Johnny sees (live site, screenshot of 2026-10-11)

System **Azgul Kou, Meshan 2008** (`/s/Meshan/2008/orbit`; `universe/raw/Meshan.tsv`:
E67A000-0, F5 V and M6 V). Zoomed so the mainworld's surroundings fill the view: a
dozen worlds and moons are drawn as **plain grey discs with the day-and-night half
shaded**, and no surface texture on any of them, the mainworld included (a water world,
hydrographics A). The stars, the rings of orbits, the habitable band and the body chips
are fine. His words: "it shows day/night but no planet textures."

## Why the first pass missed it

You zoomed Regina A-V until the world **filled the frame**: there the tile path posted
tiles and the world was textured, on both `3d28e33` and `8118f72`. Johnny's view is the
**middle zoom**, many small and medium discs at once. That is a different path
(`apps/web/src/orbit/disc_batch.ts`, `surface/disc_link.ts`, `disc_hold.ts`,
`disc_shade.ts`, and where `OrbitRenderer.ts` decides between a flat disc, a batch disc
and tiles). The orchestrator opened the live Regina system at whole-system zoom: the
worlds were small flat-coloured dots and there was no console error, so nothing throws;
the textures simply never arrive or are never asked for.

So the fault may be older than today's push. Do not assume `8118f72`.

## Goal

1. **Reproduce Johnny's exact view** on a production build served through wrangler on
   your own port: Azgul Kou at the zoom of his screenshot, then step the zoom from the
   whole system to one world filling the frame, and say at which zoom range discs are
   grey and whether they ever fill in after waiting 10 seconds. Shots
   `findings/ui_design_shots/kc_orbit_tex2_*`. Do the same on Regina and Rangent.
2. **Find the first bad commit** for that view, on scratch copies outside the
   repository, each with its own `npm ci`: `8118f72`, `3d28e33`, `aeada0e`, `1f5eccc`,
   `9a95a0c`, and further back along
   `git log --oneline -- apps/web/src/orbit/disc_batch.ts apps/web/src/surface apps/web/src/orbit/OrbitRenderer.ts`
   until the same view is textured. Name the commit, file and lines. If no commit
   shows textures at that zoom, say so plainly: then it is a missing feature, not a
   regression, and Johnny needs to know that.
3. **Follow one disc through the path** in the bad build: is a batch disc requested;
   does the worker answer; is the answer kept or dropped (a size or zoom threshold, a
   cache key, a budget, a hold that never releases, a preference such as the surface
   mode read from storage); is it drawn. Say which step fails, with the values. Check
   with cleared site storage and with the surface mode set each way: the push changed
   `surface/preferences.ts` and what `enhanced` means in `surface/service.ts`.
4. **Fix it.** For this pass you may edit, besides your own folders
   (`apps/web/src/surface/`), **`apps/web/src/orbit/disc_batch.ts` and the disc-drawing
   part of `apps/web/src/orbit/OrbitRenderer.ts`** (Lane A's; lent to you for this
   fault only; list every line). Not `orbit/hand_present.ts`, `orbit/system.ts`,
   `views/OrbitView.vue` or anything else: Lane A is editing `hand_present.ts` now. If
   the fix belongs elsewhere, report the line and stop.
5. **A test that fails on the broken tree and passes on the fix** (`tests/web/`): the
   decision "this disc at this pixel size gets a texture" and the hand-over of the
   worker's answer to the painter, as pure functions.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted;
`scripts/surface_parity.js` on a free port. Fourth gate: before and after shots of
Johnny's view on a production build, DPR 1 and 2, and no presented frame at or over
50 ms while panning that view with textures arriving (paste the worst). Servers
stopped.

## Stop rule

Stop when Johnny's view is textured on a production build and the gates pass; or when
the cause is outside what this prompt lets you edit, written up for its owner; or when
you have shown it was never textured at that zoom. You do not call production and you
do not deploy.

Write `directives/reports/c_orbit_textures_2.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

done: read the board, the lane, and this prompt. The middle-zoom path asks for a texture at 2.5 px and the worker drops an in-flight answer when any later watch object arrives, including the same generation. next: confirm that drop in git history and shoot the middle zoom on a production build.
