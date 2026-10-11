# C orbit textures 2 report
Prompt: prompts/c_orbit_textures_2.md
Status: done

Found: a frozen edit that stops the disc worker dropping an in-flight answer when the next watch is the same picture. The committed worker already paints textures at Johnny's middle zoom on a production build of this tree.
Finished: kept that handover, locked it with a test, and shot Azgul Kou, Regina and Rangent textured.
Backed out: nothing. The half-written edit was the fix, not a probe.

## Changed files
- apps/web/src/surface/enhanced/delivery.ts: a later watch supersedes an in-flight answer only when mode, version or generation changed. Same picture is handed to the painter.
- apps/web/src/surface/vanilla/gl.worker.ts: stillCurrent uses that handover.
- apps/web/src/orbit/disc_batch.ts: discWantsTexture is the 2.5 CSS-pixel decision, same threshold as before.
- apps/web/src/surface/service.ts: the comment matches the handover.
- tests/web/orbit_disc_texture.test.js: fails on the old object-identity drop, passes on the envelope compare.
- findings/ui_design_shots/kc_orbit_tex2_before_azgul_dpr1.png
- findings/ui_design_shots/kc_orbit_tex2_after_azgul_dpr1.png
- findings/ui_design_shots/kc_orbit_tex2_after_azgul_dpr2.png
- findings/ui_design_shots/kc_orbit_tex2_after_azgul_vanilla_dpr1.png
- findings/ui_design_shots/kc_orbit_tex2_after_regina_dpr1.png
- findings/ui_design_shots/kc_orbit_tex2_after_rangent_dpr1.png

## What the pictures show
Production build served with wrangler on 127.0.0.1:8807 (stopped after). Chart JSON came from the public CDN. The versions call was stubbed to v6 because this lane's local D1 has no released row. Cleared storage, so enhanced unless the vanilla shot.

Committed worker (before the fix), Azgul Kou, zoom 3.1× the fitted view, DPR 1: data-discs ready:12. Gas giants and rocky worlds show surface and a terminator. Shot: kc_orbit_tex2_before_azgul_dpr1.png. A closer look in the browser, about 9×, shows the water mainworld with cloud, ocean and a terminator. That view was not grey.

After the fix, same zoom 3.1×:
- Azgul Kou, DPR 1, enhanced: ready:12, draw 0.50/0.80 ms
- Azgul Kou, DPR 2: ready:12, draw 0.68/1.70 ms
- Azgul Kou, DPR 1, vanilla: ready:13, draw 0.47/0.70 ms
- Regina: ready:5, draw 0.47/0.70 ms
- Rangent: ready:6, draw 0.34/0.60 ms

Canvas draw stayed under 2 ms. A PerformanceObserver long task of 50–55 ms fired once on some scripted pans. It did not show up as a slow canvas draw.

Bodies under 2.5 CSS pixels stay flat discs. That threshold did not change.

## Where the drop came from
703041d (2026-10-06) added watchSuperseded as `queued !== job` and gl.worker.ts stillCurrent. A new watch object, even with the same mode, version and generation, threw the in-flight bitmaps away. The parent of that commit posted the in-flight tiles. 8118f72, 3d28e33, aeada0e, 1f5eccc and 9a95a0c all contain 703041d, so they all have the drop. Those commits were not rebuilt as separate scratch trees. The production build compared here is this working tree, first with those three files restored to HEAD, then with the fix.

On this machine each batch finished before the next watch was processed, so the drop never left the middle zoom grey. The fix still matters when a bake runs longer than the gap between watches: the answer for the picture already on screen is kept.

## Gates
npm test:      fail (1). tests/web/packages_entry.test.js:77 "My packages is a menu item". Lane E's file. 1372 pass, 15 skipped. This lane's disc tests passed.
npm run check: pass
typecheck:     fail in apps/api/src/jobs/publish_queue.ts (PackageHex used as a type). Not this lane's file. vue-tsc in npm run build passed.
fourth gate:   pass. node scripts/surface_parity.js exited 0, "ok": true, on port 5199.

## Contract published
none

## Needs from others
- none

## Questions for Johnny
1. If the live orbit is still grey after a hard reload, is the page loading a worker other than the one this tree builds? Suggested answer: this tree's production build, committed worker and the fix, both paint Azgul Kou at 3.1× the fitted view with textured discs (ready:12). A body under 2.5 CSS pixels stays a flat disc on purpose. A cached worker, or a page whose assets do not match the build, is the remaining way to get grey discs at that zoom.
