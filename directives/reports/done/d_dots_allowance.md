# D dots_allowance report
Prompt: prompts/d_dots_allowance.md
Status: done. Part 1 (the dots) and part 2 (the daily allowance) are built and passed in the browser. Both of part 2's files were on disk.

## Changed files
- `apps/web/src/views/MapView.vue`:
  - A's two calls, with one change and one addition:
    - The chart's `slug -> cells` map is built once per overview and kept (`chartDots`), not every frame. `noteDots` only copies it into the store, so a cached map works the same.
    - `noteDots(...).catch(() => undefined)` instead of `void`. The store sets `lastError` and then throws, so an offline frame would otherwise be an unhandled rejection.
  - `setDotOverlay` is in the watch that follows `store.tick()`, before `markDirty()`, as written.
  - `BuildStrip` gets `:pane-open="dossierShown"`, for the allowance note at zero.
- `apps/web/src/workspace/build/allowance_words.ts` (new): `allowanceNow`, `writesOf`, `allowanceSay`, `allowanceSpent`, `resetWords`, `refusalWords`, `actError`.
- `apps/web/src/workspace/build/acts.ts`:
  - `allowanceFor(keys, density, filledToo)`.
  - A request sure to pass what is left isn't sent; its sentence goes to `build.error`.
  - `previewAt` (one hex, Roll again) is held at zero.
  - `generateMany` holds the marks and the toast until the store's `job` is set, when the roll might pass what is left.
  - `fail` uses `actError`.
- `apps/web/src/workspace/build/grow_acts.ts`: the same in an empty sector slot (the sentence goes beside the names; the marks and the toast wait for `accepted`). `said` uses `actError`.
- `apps/web/src/workspace/build/job_toast.ts`: `newJob()`.
  - `startJobToast` used to clear the "taken over" flag at the click. With the toast held, a flag left over from an earlier route change would have swallowed a refusal; `newJob()` clears it at the click.
- `apps/web/src/workspace/build/DensityAsk.vue`: the line under the hint for the chosen density; Generate is off when held.
- `apps/web/src/workspace/build/GenerateSheet.vue`: the line in the foot; the submit is off when held.
- `apps/web/src/workspace/build/BuildPane.vue`: the line under the one-hex Generate (off when held); the `.build-allowance` styles.
- `apps/web/src/workspace/build/BuildBar.vue`: the preview bar shows the line beside Roll again, or the refusal. Roll again is off when held.
- `apps/web/src/workspace/build/BuildStrip.vue`: at zero, a note below the strip while nothing is selected and no hex pane is open. The notes stack in `.build-strip-notes`.
- `tests/web/build_allowance.test.js` (new), 11 tests:
  - the words at plenty, 20, sure to pass, might pass, zero, an admin, signed out;
  - the reset today and tomorrow, and the refusal's words;
  - a held request isn't sent, and one hex at zero asks for no preview;
  - plenty runs with marks and a toast at once;
  - a might-pass request waits for `job`;
  - a refusal leaves no marks, no toast and no job, and says the local time;
  - the empty-slot path, both ways.
- `findings/builder_system_design.md` §31, with its strings.
- Shots: `findings/ui_design_shots/kb14_dots_*` and `kb14_allow_*`. Pass scripts: `findings/builder_pass_src/dt6.mjs`, `dt7.mjs`, `dt8.mjs`, `dt10.mjs`, `da1.mjs`, `allow.sh`.

## Gates
npm test:      pass. 1524 tests, 1503 pass, 0 fail, 21 skipped.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes too. The main bundle grew from 169 kB (my first build today) to 251 kB. None of my strings are in that chunk (they're in the `acts` chunk), and zod isn't in it. The growth is probably other lanes' in-flight work; I didn't trace it further.

fourth gate:   pass. My Vite dev server (my own config and cache) on 5197, my API on 8797 with its own state, CDP 9397, inspector 9247; all stopped after.

**My private API had no chart.** Its bucket had no `truth/v5/overview.json`. The dots route then starts every chart sector as 1,280 dots, so every chart dot vanished zoomed out once the store's strings arrived (my first `kb14_dots_sector_tier` shot). I put the published v5 overview (1,417,411 bytes, from the CDN) into my private bucket and restarted my API. After that, the server's Spinward Marches string matched the chart except the 13 hexes I'd changed. See Needs from others.

**Part 1, the dots:**
- **A cold view, whole chart:** dots requests went out in pages of 32, once per sector. From the home view: 7 pages of 32 and 1 of 23; zoomed out to the whole chart (0.3): 1 more page of 18. A second run from a different camera made 12 pages of 32 and 1 of 17: 401 sectors, the canonical count, each once.
- **Repeats:** a second look and 20 camera moves at 3 px per parsec: no new request.
- **Generated in a charted sector:** "Generated 9 systems in Spinward Marches" on 0823 to 1025, by the density prompt (Every hex). Zoomed out to 8 (sector tier), 3 and 0.8 (galaxy tier), the renderer's string has each of the nine's characters, the same as the server's (`kb14_dots_sector_tier`, `kb14_dots_galaxy_tier`).
- **Remove and Undo:** "Attica removed from your map." At 8, 0414 is `.` (`kb14_dots_removed`). Undo: 0414 is `C` again (`kb14_dots_undo`), with one single-sector request.
- **An own sector:** 9 systems in Twice, subsector A. Zoomed out at 8 and at 2, all nine are drawn (`kb14_dots_own_sector`).
- **A job while zoomed out:**
  - Twice, the whole sector, Sparse, with the camera already at 8: "Generated 392 systems in Twice. 825 hexes were left empty." The 392 dots arrived with no reload, followed by one single-sector request (`kb14_dots_job_done`). The job was undone after.
  - **They didn't arrive as hexes landed.** On my local API, the job's first poll answer came back only after the whole job had finished (about 5 seconds). So the store had no mid-job progress to paint, and the toast also stayed at "0 of 1,217" until the end. An 80-hex subsector was the same (done in about 2 seconds).
  - I couldn't show progressive arrival locally. A's store test covers `landed`. It needs a check on production, where the queue runs in slices.
- **Signed out:** no store, no overlay, no dots request; the chart's dots only (`kb14_dots_signed_out`).
- **Frame time:** the renderer's own `drawMs`, 40 camera steps, headless Edge with software rendering. Signed out has no overlay and no `noteDots`; signed in has both. Median per run:

  | Zoom | Signed out (two runs) | Signed in (two runs) |
  |---|---|---|
  | Whole chart (0.3) | 14.4, 15.0 ms | 15.2, 13.9 ms |
  | 3 | 5.0, 5.6 ms | 1.8, 4.8 ms |
  | 8 | 1.2, 1.3 ms | 1.2, 1.3 ms |

  No cost shows.
- **Seen, not mine:** zoomed out with a whole sector selected, the selection's hex outlines cover that sector's dots (`kb14_dots_job_done`, Twice). It's the renderer's `selectionOutline`, drawn after the points.

**Part 2, the allowance:** my private API's dev account, made a capped `user` in my local database, with its `generation_allowance` row set by `allow.sh`, and set back to `admin` after. The shots are `kb14_allow_<state>_*`. One hex is 1111 in Twice; the selection is nine empty hexes, 1010 to 1212.

| State | One hex | Prompt (Sparse, Standard, Dense) | Prompt (Every hex) and sheet | Strip, nothing selected |
|---|---|---|---|---|
| Plenty (90 left) | no line | no line | no line | nothing |
| 20 left | "20 of 100 left today." | the same | the same | nothing |
| 5 left | "5 of 100 left today." | button on: "You can generate 5 more systems today. If the roll would make more than 5, nothing is generated." | button off: "You can generate 5 more systems today. The allowance resets tomorrow at 7:00 PM." | nothing |
| Zero | off: "You’ve used today’s 100 systems. The allowance resets tomorrow at 7:00 PM." | off, the same | off, the same | the same sentence |
| Admin | no line | no line | no line | nothing |

- **Widths:** column, half, full, and 520 px for 20 left, 5 left, and zero (`_prompt_half`, `_full`, `_520`).
- **The refusal:** 1 left, nine hexes, Standard.
  - The button was on, with the might-pass sentence.
  - While it was asked: no marks and no toast, sampled 10 times.
  - The pane then said: "You can generate 1 more system today. The allowance resets at 00:00 UTC. In your time zone, that’s tomorrow at 7:00 PM." No toast. `GET /api/me` still said 1 left.
- **Roll again:** 1 left; G on one hex made a preview, which used it.
  - The bar then said "You’ve used today’s 100 systems. The allowance resets tomorrow at 7:00 PM." Roll again was off, with that tooltip (`kb14_allow_roll_bar`).
  - R said the same and asked for nothing.
- **"Tomorrow" is correct here:** the browser's zone is UTC−5, and it was 00:40 UTC on 13 October, so 00:00 UTC on the 14th is 7:00 PM local on the 13th.

My local state after this pass:
- 9 generated systems in Spinward Marches (0823 to 1025) and 9 in Twice subsector A.
- 53 in Twice subsector P, from the 80-hex job (not undone).
- The account is admin again, with 100 used today.
- The v5 overview is in my private bucket.

## Contract published
none

## Needs from others
- **Lane B:** when `truth/<version>/overview.json` can't be read, the dots routes answer a chart sector as all dots. The store keeps that string, and the zoomed-out map then hides every charted system in it. That happened on my private API. In production it would need a missing or unreadable overview. Suggest an error, or `null` cells, so the client draws the chart's own string.
- **Lane A or the renderer's owner:** a selected sector's hex outlines cover its own dots when zoomed out (`selectionOutline` after `overviewPoints`).
- **Production check:** dots arriving while a job runs. My local queue answered the first poll only after the job had ended.

## Questions for Johnny
1. When the roll might make more systems than are left (Sparse, Standard or Dense on more empty hexes than are left), should Generate stay on? I built it on. The server counts what the roll writes, so the request may well pass, and the sentence says that nothing is generated if the roll would make too many. The alternative is to switch it off whenever the selection has more empty hexes than are left; that refuses some requests the server would allow.
2. At zero, should the note under the build strip stay up for as long as Build is on with nothing selected? I suggest yes, as built: it goes when a hex's pane opens, which says the same thing by its Generate button. The alternative is to show it once and let it be put away, like the "your map" note.
