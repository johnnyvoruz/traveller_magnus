# E handout images 2 report
Prompt: prompts/e_handout_images_2.md
Status: done

found: part 1 was already written, and the entry gallery was already in the journal files. Lane B's report is `directives/reports/done/b_entry_images.md`. The field matches the step 1 ask.
finished: the browser pass, and this report. The gallery writes images through saveEntry.
backed out: nothing.

## Changed files
- apps/web/src/workspace/journal/entry_images.ts: list ops for an entry's images. Twelve is full. Empty clears with null. No clock and no network.
- apps/web/src/workspace/journal/EntryGallery.vue: choose, drop, and paste, the same words as a record. The first image is the avatar.
- apps/web/src/workspace/journal/EntryPage.vue: avatar in the header, strip under the body. A failed upload marks the page the way a record does.
- apps/web/src/workspace/journal/list.ts: a row carries the entry's images.
- apps/web/src/workspace/journal/JournalList.vue: the row shows that first image.
- apps/web/src/workspace/timeline.ts: an entry row's avatar is the entry's images.
- tests/web/entry_images.test.js: list, caption, row, timeline, and the gallery's words.
- findings/ui_design_shots/ke6_*.png: the browser shots. `findings/` is gitignored.
- findings/player_pack_design.md: part 1, already accepted. Not changed in this pass.

## What the screen stores
A new handout is stored with visibility `players` (`apps/web/src/workspace/journal/create.ts`). The switch on the page still writes `entry.visibility`, `referee` or `players`. No player view exists, so the images show to whoever can open the entry. `GET /api/universes/:id/objects/:hash` stays owner-only, so a future player view cannot load the bytes until Lane B opens a read.

Image writes spread the latest entry into `saveEntry` and set `images`. They do not write the clock. Before any image, and after the choose, the drop, the reload, and the undo, the campaign date button read "No campaign date yet" and `clock.days` was null. The handout's own fiction date was set to 100-1105 so the timeline had a row. That is the entry's `when`.

## Gates
npm test:      fail 1, pass 1527, skipped 22. The failure is `tests/api/passkeys.test.js` line 233: `SyntaxError: Identifier 'again' has already been declared`. That file is Lane B. `tests/web/entry_images.test.js` passed inside the same run.
npm run check: pass. manifesto: clean
typecheck:     pass. `tsc --noEmit -p apps/api`
npm run build: pass. vite built in 739ms. Vite also printed INEFFECTIVE_DYNAMIC_IMPORT for `src/router.ts` and `src/workspace/market/command.ts`. The build still exited 0.

Fourth gate, pass. Isolated Playwright, channel chrome, from `.tmp/atlas-testing`. API `127.0.0.1:8852` with persist `.tmp/e-handout-state`. Vite `localhost:5197` with `--force`, `VOYAGE_API` on that API, `VOYAGE_TRUTH_API=https://traveller.voyage`. Both servers were stopped. Nothing was left listening on 8852 or 5197.

On a handout: one image by choosing a file, a second by dropping. Reload kept both. Enter on a thumb opened the lightbox and focus was on Close. Remove, then Undo, put the image back. The journal list and the timeline showed the first image. `notes.txt` said "notes.txt is not an image." A file over 8 MB said "huge.png is over 8 MB." Neither was added. Column, Half, and Full answered a pointer click. At a 520 px viewport the column card was 432 px wide. Shots: `ke6_column`, `ke6_half`, `ke6_full`, `ke6_520`, `ke6_lightbox`, `ke6_list`, `ke6_timeline`. The shots are from after the rejected file, so the header reads "Not saved", which is the same mark a record shows for a failed upload. The two images were still there.

## Contract published
none

## Needs from others
- Lane B: `GET /api/universes/:id/objects/:hash` is owner-only. A player view cannot fetch image bytes until that read is opened. Do not change the route from this lane.
- Lane B: `npm test` fails in `tests/api/passkeys.test.js` (`again` declared twice at line 233). Not this lane's file.

## Questions for Johnny
None for part 2. The eight Player Pack questions are already filed in `directives/reports/done/e_handout_images_2_part1.md` and `findings/player_pack_design.md`.
