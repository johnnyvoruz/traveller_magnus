# Lane A — the long frame when a body's dossier opens

Issued 2026-10-11 by the orchestrator. **Start only after the board says the Builder
push is made.** You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`, then this
file. No git but read-only, no deploy, no `rules/`, no Traveller rule from memory. Your
draft-handle and star-colour reports are accepted.

## Goal

Opening a body's dossier inside the app presents a frame of 58 to 75 ms. The manifesto's
budget is no presented frame at or over 50 ms. Lane C measured it
(`directives/reports/done/c_hybrid_warm_open.md`: read it first, the numbers, routes
and method are there) and showed it is **not** the surface map: with the five surface
bitmaps held at 1×1 and the hybrid model skipped, the frame was still 66.8 ms. The cost
is in the dossier route: `dossier/DossierPanel.vue`, `dossier/DossierBody.vue`, the
router, and the map view laying out when the pane opens. Find it and bring the worst
frame under 50 ms.

## Owned files (this pass)

**You hold the shared files this turn**, for this purpose only:
- `apps/web/src/dossier/DossierPanel.vue` and `dossier/DossierBody.vue`: the mount and
  first-render path only. Leave the surface map's lines (listed in
  `findings/push/hybrid_surface_notes.md`) and the Build editor's blocks working exactly
  as they do; you may defer when they mount, not change what they do.
- `apps/web/src/dossier/model.ts`, `apps/web/src/orbit/` (yours)
- `tests/web/` for what you change; `directives/reports/a_dossier_open_frame.md`

Not yours: `views/OrbitView.vue`, `views/MapView.vue` (Lane D's), `router.ts`,
`workspace/`, `surface/`, `dossier/SurfaceStage.vue`, `apps/api`, `packages/`. If the
measured cost is in one of those, do not edit it: report the line, the milliseconds and
the smallest fix, under "Needs from others".

## Steps

1. **Measure before changing anything**, on your own API port and state directory and
   your own Vite, in a production build (`npm run build`, then preview) as well as dev,
   headless Edge or Chrome, DPR 1 and 2. Opens to measure, warm (second open in the
   session): Rangent II from the system-tree row (`/s/Spinward_Marches/1411/b/w1`) and
   from the body chip in the orbit view; Regina's mainworld (`.../1910/b/w4m1`) both
   ways; one generated system. Record every `requestAnimationFrame` gap at or over
   50 ms and a performance trace of the worst open. Name the functions that fill the
   long frame, with milliseconds each.
2. Fix what is in your owned files, smallest change first: work computed on mount that
   can be computed once or lazily, synchronous component trees that can mount on the
   next frame (the page must not shift when they arrive: reserve their space),
   watchers that fire several times for one open.
3. Measure again, same opens, same machine. Paste before and after side by side.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the before and after table; worst warm frame under 50 ms on all opens listed, or the
remaining milliseconds attributed by file and owner. No layout shift on data arrival
(say how you checked). `scripts/surface_parity.js` exit code pasted (the surface map
must be untouched).

## Stop rule

Stop when the table is under budget, or when what remains is outside your owned files
and is written up for its owner. Do not restructure the dossier; this is a
first-render pass. Both servers stopped.

Write `directives/reports/a_dossier_open_frame.md` from
`directives/reports/_TEMPLATE.md`, with line ranges for every edit in the two shared
files. Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: store grow is reported. next: measure the warm dossier open before any dossier edit.
done: warm opens present no frame at or over 50 ms, so no dossier file changed, and the report is written. next: none.
