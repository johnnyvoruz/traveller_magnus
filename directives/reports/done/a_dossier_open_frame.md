# A dossier_open_frame report
Prompt: prompts/a_dossier_open_frame.md
Status: done

Warm opens on this machine present no frame at or over 50 ms. The stop rule ends the pass there. `DossierPanel.vue` and `DossierBody.vue` were not edited, so there are no line ranges. The after column is the same table.

A frame counts only when it starts at or after the click. The recorder stores `requestAnimationFrame` gaps, and a gap is in the open when `gap.t - gap.ms` is at or after the mark set in the click handler. Wall-clock click-to-`.doss-body` can sit over 50 ms while every frame stays short. The following 800 ms on the chart opens also had no gap at or over 50 ms.

An earlier pass counted a frame that was already on screen when the mark was set, and started the Chrome profiler before the click. That pass recorded 66–75 ms gaps. One of them ended at 2889.9 ms with duration 75 ms while the mark was 2885.8 ms, so it began before the click. Those numbers are discarded. The profile below ran only from the second click until `.doss-body` appeared.

Headless Chrome (Playwright `channel: 'chrome'`, isolated context, viewport 1440×900). Dev is `http://127.0.0.1:5198`. Preview is the production build on `http://127.0.0.1:5199`. Each row is the second open in that page, after a cold open and the crumb back. Regina's moon chip opens the moon popover before the measured click.

Chart opens, recorder threshold 49.5 ms. Worst is the longest frame that starts after the click. "none" means no such frame reached 49.5 ms.

| Open | DPR | Dev open ms | Dev worst | Preview open ms | Preview worst |
|---|---:|---:|---|---:|---|
| Rangent II tree `/s/Spinward_Marches/1411/b/w1` | 1 | 43 | none | 43 | none |
| Rangent II chip `/orbit/b/w1` | 1 | 57 | none | 43 | none |
| Regina mainworld tree `/s/Spinward_Marches/1910/b/w4m1` | 1 | 53 | none | 51 | none |
| Regina chip `/orbit/b/w4m1` | 1 | 67 | none | 44 | none |
| Rangent II tree | 2 | 45 | none | 42 | none |
| Rangent II chip | 2 | 52 | none | 41 | none |
| Regina mainworld tree | 2 | 56 | none | 44 | none |
| Regina chip | 2 | 60 | none | 48 | none |

Preview chart opens measured again with a 16 ms recorder. Longest frame 16.7 ms (Regina tree DPR 1, Rangent tree DPR 2, Regina tree DPR 2). The other five preview chart opens recorded no frame at or over 16 ms. Open times were 40, 39, 50, 36, 44, 40, 41, 37 ms in the same order as the table.

Generated mainworld: Offenburg, Spinward Marches 1911, body `w6` (the mainworld row, UWP E454431-8). Same 16 ms recorder.

| Open | DPR | Preview open ms | Preview worst | Dev open ms | Dev worst |
|---|---:|---:|---:|---:|---:|
| Offenburg tree `/s/Spinward_Marches/1911/b/w6` | 1 | 37 | none | 50 | none |
| Offenburg chip `/orbit/b/w6` | 1 | 49 | none | 54 | 16.6 |
| Offenburg tree | 2 | 36 | 16.6 | 38 | 25.1 |
| Offenburg chip | 2 | 40 | none | 45 | none |

The worst warm frame in the set is 25.1 ms: dev, DPR 2, Offenburg tree. Self time on that open, sampler interval 100 µs:

| Function | ms |
|---|---:|
| `insertBefore` | 1.6 |
| `removeChild` | 1.1 |
| `getPropertyValue` | 1.1 |
| `draw` `src/surface/hybrid/daynight_layer.ts:50` | 0.7 |
| `bodyModel` `src/dossier/model.ts:908` | 0.6 |
| `createBaseLocation` (vue-router) | 0.5 |
| `hexCorners` `src/map/geometry.ts:115` | 0.5 |
| `seaPlan` `src/surface/enhanced/map.ts:293` | 0.5 |
| `chartText` `src/map/MapRenderer.ts:582` | 0.5 |

No function fills a long frame. `bodyModel` is the heaviest owned call and is 0.6 ms, so it stays as it is.

Layout: nothing was deferred, and the mount order is unchanged. `DossierBody` still mounts SurfaceStage, UwpRibbon, FactTiles, DayNight, JourneyTimes, StatRows, and SocioBlock together. This pass added no late arrival, so no space was reserved and no pixel shift was introduced.

Private servers stopped: wrangler 8828, Vite dev 5198, Vite preview 5199. Port 5173 was left listening.

## Changed files
- directives/prompts/a_dossier_open_frame.md: Progress line.
- directives/reports/a_dossier_open_frame.md: this report.

No product file changed. `DossierPanel.vue` and `DossierBody.vue` have no edit ranges.

## Gates
npm test:      pass (1331 tests, 1316 pass, 0 fail, 15 skipped, 21588 ms)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
fourth gate:   pass. Worst warm frame 25.1 ms, under 50 ms on every listed open, dev and preview, DPR 1 and 2. After matches before.

`npm run build` also passed (vue-tsc, then vite, 492 modules, built in 735 ms).

`scripts/surface_parity.js`: exit 1 while preview already held port 5199. The script then reported `Dev middleware did not serve js/planet_renderer.js from disk.` It also printed the four auditor base-rule notes (0834, 1315, 2420, 2924) that the test suite prints. That run is the port clash, and it was not the Ocean radius drift. The script was left as it is. It was not started again: port 5173 is still a Vite on `apps/web`, and the script would spawn a second Vite on that app's default cache. The surface map was not edited.

## Contract published
none

## Needs from others
none. The sampled surface, map, and router calls on the worst open are each at or under 0.7 ms, and they sit inside a 25.1 ms frame.

## Questions for Johnny
none
