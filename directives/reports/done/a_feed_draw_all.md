Found: Progress was empty, and public_games.ts still dropped a lone game whose name matched the open universe.
Finished: dropOwn is gone. Every hex the server sends is drawn. ownName stays optional and is not read, so MapView.vue still compiles.
Backed out: nothing.

# Lane A a_feed_draw_all report
Prompt: prompts/a_feed_draw_all.md
Status: done

## Changed files
- apps/web/src/map/public_games.ts: removed dropOwn. publicMarks returns the server's marks. ownName is optional on PublicGamesWatch and watchPublicGames does not read it.
- tests/web/public_games.test.js: a hex named "Far Margin" with count 1 is drawn when the open universe has that name, in the order the server sent (1910, 0101, 0202).

MapView.vue was not edited. It still passes ownName.

## Gates
npm test:      fail. 1640 tests, 1611 pass, 2 fail, 27 skipped. Both failures are outside this pass (see Needs from others). tests/web/public_games.test.js and tests/web/public_games_wire.test.js pass.
npm run check: pass
typecheck:     pass
build:         pass. dist/assets/index-g7xjII2r.js 178.47 kB, gzip 60.15 kB. vue-tsc passed, so the MapView call still typechecks.
fourth gate:   not run. The prompt says Lane D's two-account pass covers it.

## Contract published
none

## Needs from others
- Lane C: tests/golden/esm.test.js "esm profile_regina matches legacy fixture" is red. Engine fixture, Lane C mid-step. Not touched.
- Lane D: tests/web/packages_entry.test.js "the account menu offers My packages while signed in" is red. It looks for the menu item in the teleported body and got nothing. AccountMenu.vue is Lane D's file. Not touched. Lane D still drops ownName from the watchPublicGames call in MapView.vue (d_menu_and_job_error.md item 2).

## Questions for Johnny
none
