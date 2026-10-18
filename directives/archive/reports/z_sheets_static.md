# Lane E z_sheets_static report
Prompt: prompts/z_sheets_static.md
Status: done

Found no half-finished files under `apps/web/public/sheets/`.
Finished the static sheets, the menu, and the local worker check.
Backed out nothing.

## Changed files
New files only, under `apps/web/public/sheets/`:
- `portrait.webp`: copy of `findings/sheets_source/portrait.webp`. SHA-256 matches.
- `meridian-03/index.html`: verbatim copy of `findings/sheets_source/meridian-03.html`. SHA-256 matches. No `noindex`. The name is not on the menu, in a comment, or in a sitemap.
- `man-in-the-low-berth/index.html`: verbatim copy of `findings/sheets_source/man-in-the-low-berth.html`. SHA-256 matches.
- `index.html`: the menu. One link, `/sheets/man-in-the-low-berth/`, titled "The Man in the Low Berth".

No edit under `apps/web/src`. No edit to `apps/api/wrangler.toml`.

## Gates
npm test: pass. 1611 tests, 1584 pass, 0 fail, 27 skipped (the API suite skips without `RUN_API_TESTS=1`).
npm run check: pass. manifesto clean.
typecheck: pass.
npm run build: pass. `index-BGxj_sDo.js` 179.75 kB (gzip 60.68 kB). The sheets are copied into `apps/web/dist/sheets/`.

Worker, stopped after: `wrangler dev` on 127.0.0.1:8796, state in a temp directory, assets from the build. Default `html_handling` is `auto-trailing-slash`. No host-config line was added.

| URL | Result |
|---|---|
| `/sheets` | 307 to `/sheets/` |
| `/sheets/` | 200, title "Character sheets" |
| `/sheets/man-in-the-low-berth` | 307 to `/sheets/man-in-the-low-berth/` |
| `/sheets/man-in-the-low-berth/` | 200, title "The Man in the Low Berth" |
| `/sheets/meridian-03/` | 200, title "MERIDIAN-03 Dossier" |

None of those bodies is the map app. `/sheets/portrait.webp` is 200. `/s/Spinward_Marches/1910` is still the map, title "Traveller.voyage". Vite's own preview server does swallow the slashless paths into the app. The worker does not.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. Add `noindex` to Meridian-03 so search engines do not list it? Recommended answer: yes. Unlisted is not private. Anyone with the URL can open it. Left the file verbatim until you answer.
