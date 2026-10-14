# C liquid_temperature_once report
Prompt: directives/lanes/C.md (water, ice and temperature: one pass that ends it)
Status: partial (built and gated in the copy; landing prepared, not landed by rule)

## Changed files
- findings/liquid_temperature_once.md: design, causes in three bins, citations, before/after census and Regina
- findings/liquid_temperature_once.patch: 25-file patch, verified byte-exact against the copy D:\webstorm\lane_c_liquid_once
- findings/liquid_temperature_once_landing.md: numbered landing recipe, four gates, truth rebuild, browser-lane changes
- directives/reports/c_liquid_temperature_once.md: this report
No file under packages/, tests/, rules/, tools/, apps/ in the repo changed.

## Gates
npm test:      pass (1569 tests, 1543 pass, 0 fail, 26 skipped; in the copy)
npm run check: pass
typecheck:     pass
fourth gate:   pass (npm run build)

## Contract published
none

## Needs from others
- Browser lane: seaIce/seaPlan/dossier read liquidStatus; boiling test in seaIce; 273 vs 273.15 (see landing recipe step 7)
## Questions for Johnny (one batch; my recommended answer first; each trialled in the copy)
1. Mainworld temperature: the book roll decides the band and the formula mean is held inside it? Recommended: yes, hold the formula mean at the nearest edge of the rolled band (built, PROVISIONAL, surface_liquid.js:60). The Kelvin formula (mgt2e_math.js:157) is not quoted in rules/ or assets/ (gap); the band roll is (assets/2eWorldCreation.txt 399-462; EngineSpec 4.3, lines 103-124). Decides 1351 of 2135 mainworlds (median shift 26 K, 428 move more than 50 K, max 2607 K). Side effect: held worlds sit exactly on an edge (0.0 C shows for many Spinward Marches worlds); the alternative is holding to the band middle (same count).
2. Ice line: compare the melting point with the MEAN temperature, not the high? Recommended: mean (built). Decides 2055 bodies (201 mainworlds) whose mean is below 273 K and high above it.
3. Exotic atmosphere (codes 10-12) where no liquid in rules/mgt2e_data.js 756-771 is liquid at the mean: no liquid label, liquidStatus {status:'unresolved', outcome:'unknown-exotic'}? Recommended: yes (built). Decides 2690 bodies (1973 colder than every window, 717 hotter; 0 in a gap between windows; 0 mainworlds). The exotic windows themselves sit only in rules/, with no page in assets/ (gap): confirm rules/ is the authority.
4. Is atmosphere code 1 vacuum for the Ice rule? Recommended: no, only code 0 (guideline_2_3 line 9). Decides 422 of 1597 atm-1 bodies with hydro > 0 (those at or above 273 K get Water rather than forced Ice).
5. No liquidType at all when hydroPercent is 0? Recommended: yes (built). Decides 14093 bodies.
6. A mainworld whose formula mean is above the boiling point while it charts hydro 1+ (Regina): no free liquid, liquidStatus none/above-boiling, hydrographics kept from the chart? Recommended: yes (built; book line 460 for Boiling reads as little liquid water). Decides 32 mainworlds.
7. Companion forbidden zone covering the habitable-zone centre: keep moving the baseline orbit to the nearest clear edge (stellar engine 1223-1240)? Recommended: keep, no change in this lane. HZCO sits inside a forbidden zone in 352 systems; the mainworld baseline lands on a zone edge in 51.
8. Sa remark: only a charted Sa makes the mainworld a moon? Recommended: keep current behaviour in this lane (out of scope; touches no invariant). 38 charted Sa; 502 lunar mainworlds, 464 of them without Sa.
9. Display offset: units.ts uses 273.15, the engine and liquid table use 273 (rules/mgt2e_data.js 767). Recommended: browser lane uses 273 for the phase so a world held at 273 K reads 0 C and Water. Affects every displayed temperature; with 273.15, 100 of 246 Spinward Marches water mainworlds read as below freezing, many of them held at exactly 273 K (0.0 C) by question 1.
## Progress
done: copy made, own engines proven (Regina 1.1.0 reproduced). next: census.
done: census baseline I1 4260, I2 4706, I3 43053, I4 2160, I5 0, I6 0. next: trace causes.
done: causes sorted into order/plumbing, quotable text, gap. next: design.
done: surface_liquid.js, chart lock, isolated temperature roll, reconciler alignment. next: gates.
done: census final all 0 (2690 counted unresolved); four gates pass in the copy. next: patch.
done: patch, fixtures 1.2.0, parity ledger 1.2.0, findings and landing written. next: Johnny answers the question batch, then land.