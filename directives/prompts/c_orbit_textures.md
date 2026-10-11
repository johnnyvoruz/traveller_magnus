# Lane C — URGENT: the planet textures in the orbit view are broken

Issued 2026-10-11 by the orchestrator. Top priority; it comes before anything else you
hold. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`, then this
file. No git but read-only, no deploy, no `rules/`, no Traveller rule from memory.

## Johnny, 2026-10-11

> "Whatever happened broke all the orbit textures on the planetary bodies."

That is all that is known. He has not said whether he saw it on his local dev server
or on the live site, nor on which system. Treat both as possible until you have seen
it yourself.

## What the orchestrator checked (reading only, nothing reproduced)

- The last push is `8118f72`; the one before is `3d28e33`. Between them, in the
  surface and orbit folders: the hybrid surface map (`surface/hybrid/`, and
  `surface/service.ts`, `surface.worker.ts`, `contracts.ts`, `preferences.ts`,
  `caption.ts`, `enhanced/climate.ts`), `orbit/system.ts` (hand systems, and
  `starColor` now reads tokens), `orbit/layout.ts`, `orbit/hand_present.ts`,
  `orbit/sim_clock.ts`, `orbit/sun.ts`, `orbit/tree_source.ts`, `platform/browser.ts`.
  `git diff 3d28e33 8118f72 -- apps/web/src/surface apps/web/src/orbit apps/web/src/views/OrbitView.vue apps/web/src/platform`
  is the whole suspect list.
- In `service.ts` the `enhanced` mode now means the hybrid sheet (an unfolded
  icosahedral net), and the cache key changed. `requestMap` is called only by the
  dossier's stage and a dev page, so the orbit discs do not obviously go through it;
  find what they do go through (`surface/disc_link.ts`, `disc_hold.ts`,
  `disc_shade.ts`, `orbit/disc_batch.ts`, the workers) and whether a mode, a
  preference or a cache key they share was changed.
- Uncommitted since the push: only `apps/web/src/builder/` (Lane A), the checker
  scripts and `router.ts`. None is a surface file.
- A Vite is listening on port 5173 (process 63556), started by nobody on the bus and
  possibly stale: a server running old or half-updated modules can show this by
  itself. Do not stop it (it is not yours); test on your own ports, and say in the
  report whether a fresh server shows the fault.
- Lane A's `scripts/surface_parity.js` run today exited 1 with "Dev middleware did not
  serve js/planet_renderer.js from disk." A put that down to a port clash. Check it.
- All 1,331 tests pass, including the `surface_disc_*` tests. So the tests do not see
  what Johnny sees: part of this job is a test that would have.

## Goal

1. **See it.** Your own API port and state directory, your own Vite, and a production
   build (`npm run build`, preview). Open the orbit view for Regina
   (`/s/Spinward_Marches/1910/orbit`), Rangent (`1411`), one generated system and one
   hand-made system, in each surface mode the preferences offer. Shots
   `findings/ui_design_shots/kc_orbit_tex_*`. Say exactly what is wrong (blank discs,
   flat colour, the wrong picture wrapped on the sphere, seams, missing shading, only
   some bodies).
2. **Find the change.** Build `3d28e33` and `8118f72` side by side in scratch copies
   outside the repository and compare the same views. **A scratch copy must run its
   own `npm ci`:** the repository's `node_modules/@voyage/*` are links back into the
   working tree, and a borrowed `node_modules` will silently run today's code. Name
   the commit, the file and the lines.
3. **Fix it if it is in your files** (`apps/web/src/surface/`,
   `dossier/SurfaceStage.vue`, `dossier/SurfaceTimeBar.vue`), smallest change, without
   taking the hybrid map away from the dossier. If the cause is in `orbit/` (Lane A),
   `views/OrbitView.vue` (shared), the build config or a stale server, do not edit:
   report the line and the fix.
4. **A test that fails on the broken tree and passes on the fixed one**, in
   `tests/web/`, plus `scripts/surface_parity.js` exit 0 on a free port.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`,
`scripts/surface_parity.js`, pasted. Fourth gate: before and after shots of the same
four systems in the orbit view and of one body's dossier map (the hybrid map must be
unchanged), dev and production build. Your servers stopped.

## Stop rule

Stop when the orbit view shows its textures again and the gates pass, or when the
cause is outside your files and is written up for its owner. If you cannot reproduce
it on a fresh server on any of the four systems, stop and say so with the shots: the
question then goes to Johnny (where he saw it, which system, a hard reload).

Write `directives/reports/c_orbit_textures.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 15:10: it is the live site

Johnny saw it on **the live site** (traveller.voyage), not on a local dev server. So:

- The production build is the case that matters: `npm run build` and the built
  Worker and assets served the way the deploy serves them (`wrangler dev` on your own
  port over `apps/web/dist`, not only Vite preview). A fault that shows only there is
  likely one of: a worker script or asset that the build does not emit or the Worker
  does not serve (check the network panel for 404s and the console for a worker error),
  a cache header or content hash that lets an old worker script run against new page
  code, an asset path that differs between dev and build, a browser cache holding
  discs under a key whose meaning changed.
- Compare a production build of `3d28e33` with one of `8118f72`, each in its own
  scratch copy with its own `npm ci`.
- You do not call production and you do not deploy. If the built tree is fine locally,
  say exactly what Johnny should look at on the live site (the request that fails, the
  console line, whether a hard reload or a cleared site cache changes it) and stop.
- The stale Vite on 5173 is no longer a suspect.

## Progress
done: board says the orbit textures are broken and the cause is unknown. next: trace the disc texture path and open Regina on a fresh Vite.
done: disc pipeline files are unchanged between 3d28e33 and 8118f72; the built page starts /assets/gl.worker-*.js. next: serve dist through wrangler on 8794 and open Regina.
done: wrangler on 8794 paints textured discs for Regina (both modes, A-V zoomed) and Rangent (17 tiles, failed false). Worker gl.worker-CfgM4y3Z.js is 200 JavaScript. No generated or hand-made system in local state. next: stop and write the report.
done: the 15:10 note asks for a production build of 3d28e33 and of 8118f72, each with its own npm ci. The 8794 run used the working tree dist. next: archive both commits outside the repo and build them.
done: both scratch builds paint Regina A-V. gl.worker-CfgM4y3Z.js is byte-identical (sha256 76f2e265). next: stop the scratch servers and update the report.
