# C orbit textures report
Prompt: prompts/c_orbit_textures.md
Status: partial

## Changed files
- none in product code. The disc worker already paints textured worlds on a fresh production build of this tree. No commit, file, or line to change.

## What was served
Two scratch copies, outside the repo, each from `git archive` and each with its own `npm ci` (the `@voyage/engines` link points at that scratch, not the working tree). `npm run build` in each, then `wrangler dev` on that scratch's `apps/web/dist`: `8118f72` on port 8795, `3d28e33` on port 8796. Both servers are stopped. Chart JSON came from `truth-local` (version `v2`) through a page intercept. The live site was not requested.

The disc worker is the same file in both builds: `assets/gl.worker-CfgM4y3Z.js`, 83,613 bytes, sha256 `76f2e26564045120f7de54d0a559379c6f90e727aaba1f153f052f898f74dc5b`. Each server returns it as 200 `text/javascript`. The page bundles differ (`index-Dt6hh0_X.js` on `8118f72`, `index-Dldmw3HH.js` on `3d28e33`). The sheet worker differs (`surface.worker-C2M-9wWZ.js` at 35.65 kB, `surface.worker-Dzgy389V.js` at 14.01 kB). That sheet worker paints the dossier map. It does not paint the orbit discs.

`git diff 3d28e33 8118f72` does not touch `disc_link.ts`, `disc_hold.ts`, `disc_shade.ts`, `vanilla/gl.worker.ts`, or `orbit/disc_batch.ts`.

## What the pictures show
Zoomed Regina A-V on the `8118f72` scratch is an icy world with cloud, open water, rings, and a terminator: `findings/ui_design_shots/kc_orbit_tex_8118_regina_av.png`. The same frame on the `3d28e33` scratch is the same kind of world: `kc_orbit_tex_3d28_regina_av.png`. Both pages reached `data-state="ready"`. Both workers posted `{ op: "tiles", ready: true, failed: false, tiles: 1 }` once that body filled the frame. Sampled colour counts were 153 and 154.

An earlier pass on the working tree's `dist` (port 8794, since replaced by other lanes' builds) showed the same body in vanilla mode (`kc_orbit_tex_regina_av_vanilla_vanilla_wrangler.png`) and Rangent posting 17 tiles (`kc_orbit_tex_rangent_enhanced_wrangler.png`).

The Regina mainworld dossier stage reported `data-state="full"` and `data-mode="enhanced"`. `surface.worker-C2M-9wWZ.js` and the default icon set returned 200. The sheet sits below the day-and-night block, so `kc_orbit_tex_regina_dossier_wrangler.png` shows that block and the chart behind the pane.

A generated system and a hand-made system were not opened. All 196 local universe databases have zero hex rows. Creating one would write shared state. A visitor can open the chart worlds above without an account.

The only console error on these pages is 401 on the signed-out session call. The worker request itself is 200 JavaScript.

## Gates
npm test:      not run (no product change)
npm run check: not run
typecheck:     not run
fourth gate:   not run. No before/after, because nothing was edited. `scripts/surface_parity.js` was not run.

Porcelain at the end of the pass is other lanes' files plus this report. This pass edited only the Progress lines of `directives/prompts/c_orbit_textures.md`.

## Contract published
none

## Needs from others
- none

## Questions for Johnny
1. On the live site, hard-reload Regina's orbit (`/s/Spinward_Marches/1910/orbit`), select Regina A-V, and zoom until the world fills the picture. In the network panel, open `gl.worker-CfgM4y3Z.js`. Suggested answer: that is the disc worker both `3d28e33` and `8118f72` emit, byte for byte (83,613 bytes, sha256 `76f2e26564045120f7de54d0a559379c6f90e727aaba1f153f052f898f74dc5b`). It should be 200, content type JavaScript, and the body should start with `(function(){function e()`. The world should show ice, cloud, and open water, as in `kc_orbit_tex_8118_regina_av.png`. A cached copy of this same file cannot be the break between those two commits, because the bytes did not change. If the live page asks for a different `gl.worker-*.js`, or this name comes back as HTML (a body that starts with `<!doctype`) or not 200, the deploy's page and its assets do not match, and the planets stay flat discs. The console line is a worker parse error. A hard reload, or a cleared cache for the site, is the thing to try. If this request is that JavaScript file and the world is still a flat disc, the fault is not in either of these builds: which system, and what does the console say?
2. Was the live site deployed from `8118f72`? Suggested answer: the live `index.html` script should be `/assets/index-Dt6hh0_X.js`. This pass did not call traveller.voyage. The parent commit's page is `/assets/index-Dldmw3HH.js`. The disc worker name is the same on both.
