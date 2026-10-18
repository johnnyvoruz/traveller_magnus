# Report — x_integration_sweep (read-only)

Session 2026-10-17 15:01–15:35 CDT. Tree as of 15:02 (HEAD `d6658f5` plus 239 changed and untracked
paths, `findings/`, `versionvideo/` and `*.wav` left out), frozen under `%TEMP%\xsweep_copy` with
`node_modules` junctions. Served with `vite preview` on port 6100, `/api` proxied to traveller.voyage
(signed out), chart from cdn.traveller.voyage. Headless Edge over the DevTools protocol (ports
6101–6103, state folders `%TEMP%\xsweep_state*`). Nothing in the repo changed but this file and the shots
`findings/ui_design_shots/x_sweep_*.png`. Everything started was stopped.

The web app was built twice: once with `npm run build` (the gate, production mode) and once with
`vite build --mode preview` for the browser run, because `/design` is only routed in dev and preview
(`router.ts` 50). The second build was clean too.

## Findings, worst first

Lane = the board's lane table and `streams/*.md` areas; a file in `streams/claims.md` names the lane holding it.

| # | Route | Width | What | File it most likely lives in | Lane |
|---|---|---|---|---|---|
| 1 | `/` (palette) | 1600 | Typing the command's full name **"Roll dice"** finds nothing: the list falls back to "Try a world, a sector, or a subsector" (Regina, Spinward Marches, Jewell) and then every command. Regina is the first row, so Enter opens Regina, not the roller. "roll" finds "Roll dice"; "dice" finds nothing. Command names are matched from their start only, and a space ends the match. Shot `x_sweep_palette_roll_dice_1600.png`. | `components/OmniBox.vue` (its result matching) | N (palette commands are in N's queue); M owns the OmniBox look only |
| 2 | `/s/Spinward_Marches`, `/s/Spinward_Marches/sub/C` | 1600, 390 | Cold load, signed out: the dossier panel opens with one sentence, "Build is off. Switch it on to select and generate in this sector.", and nothing else. A visitor cannot switch Build on (the rail says "Build: sign in to generate…"). The panel is otherwise empty at both widths. Shots `x_sweep_s_Spinward_Marches_1600.png`, `_390.png`, `x_sweep_s_Spinward_Marches_sub_C_*.png`. | `dossier/DossierPanel.vue` (~276, "asked for this pane while Build is off") | E holds `DossierPanel.vue` (claims 14:57, words); the behaviour is the orchestrator's call |
| 3 | `/` after R | 1600 | The dice result card ("2D 9" with two dice) sits at the bottom of the map over the locator line ("Pscias · Spinward Marches 2106 · X555423-2"), hiding it. Shot `x_sweep_dice_boon_1600.png`. | `dice/DiceRoller.vue` | A (claims 15:01) |
| 4 | `/s/Spinward_Marches/1910/orbit` | 1600 | A second "Back to the map (Esc)" button is rendered under the dossier column at (131, 39), covered by the panel's h1 "Regina system". The visible "← Map" is at x≈660. A covered control, no visible harm. Shot `x_sweep_s_Spinward_Marches_1910_orbit_1600.png`. | `orbit/OrbitHeader.vue`, `views/OrbitView.vue` | L (claims 14:50) |
| 5 | `/s/Spinward_Marches/1910` | 1600, 390 | Subsector labels overlap: "Spinward Marches - Jewell" and "Spinward Marches - Regina" are drawn on top of each other at the top edge (y≈82). At 390 the label "Spinward Marches - Reg…" is cut under the date clock. Shots `x_sweep_s_Spinward_Marches_1910_1600.png`, `_390.png`. | `map/MapRenderer.ts` (subsector labels) | D (`MapRenderer.ts` is D's; the route painting is L's) |
| 6 | `/s/Spinward_Marches/1910/orbit` | 390 | The body-chip strip is clipped at the right edge ("Re…" half shown); the chip "Regina A-I" is not the hit target at its centre (its ancestor `div.orbit` is). Fine if the strip scrolls; no scroll affordance is visible. Shot `x_sweep_s_Spinward_Marches_1910_orbit_390.png`. | `orbit/BodyChips.vue` | L (claims 14:50) |
| 7 | every map route, the body route | 390 | The bottom sheet covers the rail's "Sign in" button (y≈805) while the rest of the rail stays usable above it. Probably by design (the sheet is on top); listed because `elementFromPoint` flags it on six routes. | `shell/Panel.vue` | E (shell/), M (shell look) |
| 8 | `/` (palette) | 1600 | After Escape the palette keeps the last query: Ctrl+K again and typing gave "rolldice". May be intended ("keeps your query"); it surprised this run. Shot `x_sweep_dice_boon_1600.png` (search box). | `components/OmniBox.vue` | N / M |
| 9 | `/packages` | 390 | "+ Publish" is shown to a signed-out visitor at the top of the store. If it opens the Publish chooser and asks to sign in, fine; it is the first control on the page at 390. Shot `x_sweep_packages_390.png`. | `workspace/market/PackagesView.vue`, `PublishChooser.vue` | D |
| 10 | build | — | `vite build` warns `INEFFECTIVE_DYNAMIC_IMPORT`: `src/router.ts` is dynamically imported by `workspace/campaign_command.ts`, `workspace/help_command.ts` and `workspace/market/command.ts` but statically by `main.ts`, so the dynamic import moves nothing. A warning, not a failure. | those three files | N, E, D |

Checked and clean on every route at both widths: no console error or warning, no uncaught exception,
no request failed other than `/api/me` 401 (signed out), no page wider than the window
(`scrollWidth > innerWidth` was false everywhere), no heading or button with cut text
(`scrollWidth > clientWidth` on h1–h5 and buttons: none). The rail under the modal scrim on `/changes`
and `/help` at 1600 is the modal doing its job, not listed.

## Step 3, the new pieces

- **Dice roller.** Palette "roll" → "Roll dice" rolls 2D (card at the bottom of the map, finding 3). The R
  key on the map rolls too. **Boon could not be tried signed out:** Boon and Bane are `DiceButton.vue`,
  mounted only in `CampaignPanel.vue` (464), which needs an account. The palette "Roll dice" has no Boon.
- **Store filter column.** `/packages`, tick Systems and People: URL becomes
  `/packages?kind=system&kind=people`, "2 results", both boxes checked. Open "Feri terraces", browser
  Back: the URL, "2 results" and both ticks come back. Works. Shots `x_sweep_store_two_kinds_1600.png`,
  `x_sweep_store_after_back_1600.png`. The product page has no control labelled "Back"; its crumbs are
  "Marketplace" and "Systems" (`/packages?kind=system`), and "Back to the Marketplace" only in an error state.
- **Record hover card.** None signed out: the hex page has no record, mention or journal element to hover.
  Nothing to test without an account.
- **Help window from the palette.** "Help" → one command "Help", Enter opens the Help window on `/help`
  (modal, title "Help"), no error. Shot `x_sweep_help_window_1600.png`.

## Body route

The hex page's body rows are buttons, not links, so no `/b/` href exists to follow cold; the mainworld row
was clicked and gave `/s/Spinward_Marches/1910/b/w4m1`. Opened cold at 1600 and 390: renders the body
dossier (Regina, 13 / 41 orbits, Day/Night, surface map), no error, no overflow. Shots
`x_sweep_body_1600.png`, `x_sweep_body_390.png`.

## Step 1 gate results (the frozen copy)

| Gate | Result |
|---|---|
| `npm run rules:gen` | ok |
| `npm run names:gen` | ok (52,551 names) |
| `npm test` | **green**: 1970 tests, 1924 pass, 0 fail, 46 skipped, 22 suites, 84 s |
| `npm run check` | `manifesto: clean` |
| `npm run typecheck` | clean, 0 errors |
| `npm run build` | ok, 10.7 s, one warning (finding 10) |

No failure to record; no first assertion to quote.

## Shots

`findings/ui_design_shots/x_sweep_<route>_<width>.png` for `/`, `s_Spinward_Marches`,
`s_Spinward_Marches_sub_C`, `s_Spinward_Marches_1910`, `s_Spinward_Marches_1910_orbit`, `packages`,
`packages_pk_W5FTJF8B2M77XHXT7FTBT1XB08`, `changes`, `help`, `design`, `account` at 1600 and 390; plus
`body_1600/390`, `palette_roll_dice_1600`, `palette_roll_1600`, `dice_open_1600`, `dice_r_key_1600`,
`dice_boon_1600`, `store_two_kinds_1600`, `store_after_back_1600`, `help_window_1600`.

## Not done

Everything in the prompt was reached. Not tried: anything that needs an account (Boon, hover cards,
the campaign), and the orbit body route (`/orbit/b/w4m1`), which the prompt did not list.
