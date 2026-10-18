# Lane E e_dossier_codes report
Prompt: prompts/e_dossier_codes.md
Status: done

Found no half-finished dossier edits on this prompt.
Finished the sentences, the wiring, the inventory, the four gates, and the Regina browser pass.
Backed out nothing.

## Changed files
- `apps/web/src/dossier/code_words.ts`: one sentence per code that `rules/` or `assets/` explains. Lookup helpers for labels, trade chips, zones, editions, bases, the profile ribbon, the stellar line, and the socioeconomics headline.
- `apps/web/src/dossier/CodeNote.vue`: the rail's on-screen sentence. Hover, keyboard focus, and a tap. A tap does not follow the parent link or button. The pop does not change the row height.
- `apps/web/src/dossier/SocioBlock.vue`: headline parts at the summary and the stay line.
- `apps/web/src/dossier/StatRows.vue`: label, trade chip, zone, base letter, edition, and stellar type.
- `apps/web/src/dossier/UwpRibbon.vue`: one note per digit. `quiet` when the ribbon is inside the system-page link.
- `apps/web/src/dossier/DossierOverview.vue`: focusing that link reads every digit in one sentence.
- `apps/web/src/dossier/StellarLines.vue`: the stellar line, when the helper has a sentence.
- `apps/web/src/dossier/BodyRow.vue`: the tree profile is quiet inside the row button and opens while that button has focus.
- `tests/web/dossier_codes.test.js`: sentence shape, the Regina headline, quiet codes, sourced codes, and the Vue wiring.
- `findings/dossier_codes.md`: the inventory, with file and line for each source. Shots `findings/ke9_column.png`, `ke9_half.png`, `ke9_full.png`, `ke9_520.png`, `ke9_world_tip.png`.

`DossierBody.vue` already renders these rows, so it was not edited. `model.ts`, `SurfaceStage.vue`, `DayNight.vue`, and `workspace/build/` were not edited.

## Gates
npm test: pass. 1603 tests, 1576 pass, 0 fail, 27 skipped (the API suite skips without `RUN_API_TESTS=1`).
npm run check: pass. manifesto clean.
typecheck: pass (`tsc --noEmit -p apps/api`).
npm run build: pass. `index-BOw0y2K3.js` 175.34 kB (gzip 59.13 kB). Dossier chunk `DossierPanel-DLPwle5k.js` 151.50 kB (gzip 49.00 kB). Dossier CSS 46.57 kB.

Browser, stopped after: Vite on 127.0.0.1:5197 with its own cache, truth proxied to https://traveller.voyage. Regina at `/s/Spinward_Marches/1910`. Every explanation that was on screen was opened by pointer (hover and tap) and by keyboard at column, half, full, and a 520 px viewport. The system ribbon is one link, so keyboard focus reads the digits as one sentence. On the world page each digit is its own tab stop. The Port digit reads "Class A is an excellent starport." The tree profile opens when its row button is focused. Socioeconomics detail rows sit in a closed disclosure at column and half. At full the disclosure is open, and those rows (Importance, world trade number, resource units, cultural profile) took hover, focus, and tap there. The world-page chips on Regina were Fl, Ht, and Sa. The server was stopped and the temporary Vite config was deleted.

## Lane D copy
Not edited. Suggested words only.

The Build generator label "Full system, top down" (`apps/web/src/workspace/build/state.ts`): "Full system, from the star outward."

The hex pane and orbit badge "MgT2E": keep the letters. The tooltip already used on the dossier Edition row is "Mongoose 2nd Edition." CT is "Classic Traveller." T5 is "Traveller 5."

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. The headline figure `Cr233280`. Recommended answer: leave it without a tooltip until you confirm that `Cr` means credits and that this figure is GWP per capita. The row label already says "GWP per capita". `rules/guideline_3_3_ix_ex_cx.md` line 21 gives the per-capita formula and does not say what `Cr` stands for.
2. Nobility `BcCeF`. Recommended answer: leave the letters bare until you cite a letter table. Do not guess baron, count, or the other titles. `assets/HybridSurfaceMap_Design.md` line 476 names nobility and does not define `B`, `c`, `C`, `e`, or `F`.
3. Allegiance `ImDd`. Recommended answer: no tooltip. The sector name beside the code is enough. No line says what an allegiance code means.
4. Trade codes `Ph`, `An`, `Cp`, and remarks such as `(Amindii)2`, `Varg0`, `Asla0`. Recommended answer: no tooltip. `rules/t5_data.js` line 198 lists `Ph` with a population requirement and no name. Nothing in `rules/` or `assets/` gives a plain meaning for `An`, `Cp`, or those remarks.
5. `PCR` on the socioeconomics rows (`model.ts` around line 723). Recommended answer: no tooltip. No expansion in `rules/` or `assets/`.
6. The government, law, tech, starport, and military profile strings. Recommended answer: no tooltip until the names are in `rules/` or `assets/`. `rules/mgt2e_data.js` lines 860–889 store the letters and no names.
7. Edition values `AoW` and `RTT`. Recommended answer: no tooltip. `AoW` does not appear in `rules/`. `RTT` is not spelled out there.
8. Luminosity classes other than V and D, and the token `BD` on Regina's star line. Recommended answer: no extra names. `rules/guideline_1_1_stellar_life_cycles_and_classsifications.md` names the range Ia through D and does not define Ia, Ib, II, III, IV, or VI. No line calls `BD` a brown dwarf. A line that also contains `F7 V` or `M3 V` still gets the spectral-type sentence. `BD` alone gets nothing.
