# E player pack report
Prompt: prompts/e_player_pack.md
Status: done

Found the Player Pack prompt with Johnny's eight answers and the accepted design note. The handout-image pass was already reported. The pack module, the journal button, and the leak test were already in the tree.
Finished the leak test, the manifesto check, the browser pass, and this report.
Backed out nothing.

## Changed files
- apps/web/src/pack/: selection, redaction, counts, and one HTML file. Pure functions. They do not write the campaign.
- apps/web/src/workspace/journal/JournalList.vue: "Download the Player Pack", then the confirmation, then the file. The pack loads only when that button is used.
- tests/web/player_pack.test.js: leak gate, the no-date case, a safe file name, and the ten-times size.
- findings/ui_design_shots/ke7_ask.png, ke7_desktop.png, ke7_phone.png: the confirmation, and the file at desktop and phone width.

## Gates
npm test: fail. 1566 tests, 1541 pass, 2 fail, 23 skipped. The Player Pack tests passed, including the line `player pack 10x bytes 136690 ms 7 records 81`. The two failures are outside this pass:
- tests/api/public_games.test.js cannot load: `./server.js` does not export `runWrangler`.
- tests/web/renderer.test.js:412 "draw reports animating while a title fades in, then settles (B1.12b)": the fade took more than one frame.

npm run check: pass (manifesto: clean).

typecheck: fail. `packages/shared/src/index.ts` exports `PublicGamesSetting`, `PublicGamesHex`, and `PublicGamesSector` twice. This pass did not edit that file.

npm run build: fail at `vue-tsc` with the same shared duplicate. `vite build` in `apps/web` then succeeded. The pack is three chunks, loaded from the journal button:
- dist/assets/paint-BnO5X9lN.js 0.39 kB, gzip 0.25 kB
- dist/assets/plan-D06zn5Sa.js 5.03 kB, gzip 2.02 kB
- dist/assets/build-Die8lemL.js 7.22 kB, gzip 2.92 kB

Fourth gate: pass. Own ports (API 127.0.0.1:8861, Vite localhost:5203, persist `.tmp/e-pack-state`), then both servers stopped. A campaign held every record type and every journal kind in both visibilities, a link between two player records, a link across that line, and a player note that mentions a referee record, a player record, a labelled hex, and a bare hex. The clock was 100-1105. The confirmation read "10 records, 5 entries. 13 items are left out because they are not marked for players." The file was `Pack Probe - Player Pack - 100-1105.html` (16,279 bytes). Opened from disk in a fresh profile with the network off: no request left the file, and no `ZREF_` marker was in the bytes. A note typed in the cover box downloaded as `player_notes_Pack-Probe.json` with that text. Shots are the three `ke7_` files above.

At ten times the leak fixture the file is 136,690 bytes and the build took 7 ms, for 81 included records.

## What the file keeps and drops
A person record that is marked for players includes that person's sheet. Sheets on every other record type are left out. Provenance, images, the party anchor, and `settings.kinds` are left out. A link shows the two player records and the kind. Role, notes, since, and until are left off. A mention of a referee-only record becomes "a record". A hex mention keeps the written label, or the hex key when there is no label.

## Contract published
none

## Needs from others
- packages/shared/src/index.ts: the Public Games names are exported twice, so `npm run typecheck` and `npm run build` stop before the web typecheck. tests/api/public_games.test.js also fails to load because `runWrangler` is not exported from tests/api/server.js.
- tests/web/renderer.test.js:412: the title-fade assertion failed. This pass did not edit the renderer.

## Questions for Johnny
none
