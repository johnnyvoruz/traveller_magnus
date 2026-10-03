# Design reference — what "sci-fi" means here

**Status:** ADOPTED 2026-10-02. The manifesto says the sci-fi word cannot be a grep rule;
this file is the reference it points to. It is extracted from the legacy pieces Johnny
named as the look: the planet select controls in the orbit view, the tracker (locator)
line, and the sci-fi inspector panel. Slice 1 builds `apps/web/src/design/` from this:
`tokens.css` and a design-system page that renders every component below.

Legacy sources to read for feel (never copy UI code): `style.css` (the `.sv-*`,
`.atlas-*`, `.dossier-*`, `#campaign-locator` rules), `campaign_atlas.js:251-317`
(locator line), `system_inspector.js:13-38, 275-290, 583-620` (helpers, spans, world map
lead), `system_viewer.js` (`.sv-view-nav`, `.sv-pop*`, `.sv-jog`, `.sv-timecode`).

---

## 0. Amendments (2026-10-03): where the legacy app and this file disagreed, the legacy app won

Johnny rejected a first dossier that followed this file's tokens but not the legacy look
("not cohesive at all"). A design pass (Agent D, `findings/ui_design_audit.md`, screenshots in
`findings/ui_design_shots/`) then matched the legacy app directly. Where the two disagreed the
legacy look is now the rule, and the sections below are read with these changes:

| This file said | The rule now |
|---|---|
| §1, §2.1: no shadows; depth from background steps and hairlines | floating chrome (panel card, omnibox, popups) carries the legacy shadows |
| §2.6: a 1px `--signal` focus ring | a 2 px amber ring, everywhere |
| §5: panel title and section headings in the display font | Inter 700 in the panel; no Orbitron in the inspector |
| §2.7: column width 320 px | 520 px, the legacy inspector's column |
| §3 command palette: centred input over a dimmed map | the omnibox: an always-visible field at the top left, on the panel's edge, no dimming |

Shared primitives are in `apps/web/src/design/base.css`; the design-system page is `/design`.
New UI copies from those, and is judged side by side with the legacy app before it is called
done.

## 1. Tokens (`tokens.css`) — the only place a literal colour or duration may appear

Extracted from `style.css` by frequency; names are new, values are the legacy ones.

```css
:root {
  /* field */
  --bg-0: #0b0c10;        /* deepest: canvas backdrop */
  --bg-1: #101820;        /* panels (legacy --atlas-bg) */
  --bg-2: #0b1a1d;        /* inset wells, inputs */
  --surface-1: #1f2833;   /* raised rows, cards */
  --surface-2: #1c383e;   /* hover / selected rows */
  --line-1: #324650;      /* hairlines */
  --line-2: #415864;      /* stronger rules, borders */

  /* signal */
  --signal: #66fcf1;      /* primary teal: active, links, locator, numerics */
  --signal-dim: #45a29e;  /* secondary teal: borders, idle controls, scroll thumb */
  --signal-bright: #9afff2; /* hover / focus of signal */
  --attention: #ffce73;   /* amber: focus-of-interest, warnings, trade focus */
  --danger: #ff6b6b;      /* destructive; use rarely */

  /* text */
  --text-1: #d2e0e5;      /* body */
  --text-2: #c5c6c7;      /* secondary */
  --text-muted: #9faeb8;  /* captions, meta (legacy --atlas-muted) */
  --text-faint: #8aa0ab;

  /* type */
  --font-display: 'Orbitron', sans-serif;   /* headings, sector names, timecodes */
  --font-text: 'Inter', sans-serif;         /* everything else */
  --font-data: ui-monospace, monospace;     /* UWP strings, hex ids, coordinates */
  --tabular: tabular-nums;

  /* space (4-based) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;

  /* radius */
  --r-1: 4px; --r-2: 6px; --r-3: 8px; --r-4: 12px; --r-pill: 999px;

  /* motion */
  --t-fast: 200ms;        /* hover, toggles */
  --t-base: 300ms;        /* panel reveal, dissolve */
  --t-slow: 450ms;        /* locator connect, camera short hop */
  --t-long: 800ms;        /* scanner reveal, camera long flight */
  --ease-out: cubic-bezier(.2,.8,.2,1);
  --ease-in-out: cubic-bezier(.4,0,.2,1);

  /* elevation: no shadows; depth comes from --bg steps and hairlines */
}
```

Light theme is a token swap on `[data-theme="light"]` and nothing else; it is not a slice 1
deliverable but the tokens must make it possible.

## 2. Principles of the look

1. **Dark field, thin light.** Depth is layered backgrounds and 1px hairlines, never drop
   shadows or gradients. Panels are `--bg-1` on `--bg-0`.
2. **Teal is signal, amber is attention.** Teal marks what is live, linked or selected.
   Amber marks the one thing to look at now (the focused trade partner, a warning). Nothing
   else is coloured; data colour on the map comes from the referee's filters, not the UI.
3. **Numbers are instruments.** Every numeric readout uses `--font-data` or
   `font-variant-numeric: tabular-nums` so values do not jitter. Timecodes and hex ids are
   display-font or mono, never body text.
4. **Reveal, do not pop.** Panels dissolve in over `--t-base`; data sheets reveal with the
   scanner sweep over `--t-long` the first time and appear sharp instantly on a cache hit;
   the camera flies. `prefers-reduced-motion` disables every animation, as the legacy
   locator already does.
5. **Lines connect things.** The locator line is the signature: a thin teal path from the
   panel to the target with a pulsing ring at the end. Use it for any "this refers to that":
   record to body, trade partner to partner, search result to hex.
6. **Chrome is quiet.** Icons over labels in the rail, labels on hover or expand. Buttons
   are outlined teal-dim, filled on hover only. No glossy, no bevels, no glow beyond a
   1px `--signal` focus ring.
7. **One panel, three widths.** Column (320px) for glancing, half for reading, full for
   charts and timelines. The panel slides over the map; the map stays alive behind it.

## 3. Components the design page must render

| Component | Legacy source | Notes |
|---|---|---|
| **Rail** | left icon rail, `nav-*` | Icons; expands to labels on hover/focus; active item gets a `--signal` left bar |
| **Panel** | `.atlas-*`, `#dg-panel` | Three widths; header with title in `--font-display`, meta in `--text-muted`, close; body scroll with the teal scrollbar (`--scroll-*` legacy) |
| **Dossier** | `.dossier-*` | Mainworld identity block, stellar line, system tree, world-map lead with stage/caption/badge/hint; scanner reveal |
| **View nav** | `.sv-view-nav`, `.sv-pop-btn` | The planet select: a row of body chips, selected chip filled; popovers (`.sv-pop`) anchored to chips |
| **Time controls** | `.sv-time-controls`, `.sv-jog`, `.sv-timecode` | Timecode in display font; jog slider with spring return; speed select; local clock muted |
| **Locator line** | `#campaign-locator` | SVG overlay, `stroke-width: 1.5`, `stroke-dasharray: 1` connect animation `--t-slow`, pulse ring 1.8s infinite; `.is-focus` amber, `.is-dim` 35% |
| **Command palette** | omni-search | Centered input over a dimmed map; result rows with type badge, name, hex id in mono; arrow keys, Enter, Escape |
| **Toast** | `showToast` | Bottom-left, `--bg-1` with `--signal-dim` left bar; optional action (Restore); never stacks more than two |
| **Progress** | `showWorkStatus` | Single thin bar under the header with title and detail; appears only after 300 ms of work |
| **Buttons** | `.atlas-icon-btn` | Outlined `--signal-dim`, text `--text-1`, hover fills `--surface-2`, primary variant fills `--signal` with `--bg-0` text |
| **Inputs** | legacy mono inputs | `--bg-2` well, `--line-2` border, `--signal` focus ring, mono for data fields |
| **Tooltip** | `.sv-tip-docked` | Docked, not floating: a one-line strip at the panel edge |
| **Badge / chip** | `.dossier-map-badge`, `.atlas-types` | Pill, hairline border, uppercase 11px display font |
| **Table** | `.atlas-stats`, `.atlas-record-row` | Hairline rows, tabular numbers right-aligned |
| **Empty state** | — | One sentence in `--text-muted`, one action |

## 4. Motion rules

| Event | Motion |
|---|---|
| Panel open/close | opacity + 8px translate, `--t-base`, `--ease-out` |
| Camera to a hex within 12 hexes | ease, `--t-slow` |
| Camera to a far hex | zoom out, pan, zoom in, `--t-long`, `--ease-in-out` |
| Dossier first render | scanner sweep `--t-long`; cache hit renders sharp with no delay |
| Locator | connect `--t-slow`, then pulse 1.8s infinite |
| Hover | `--t-fast` on background and border only |
| Lists | virtualized; items do not animate in |

## 5. Typography scale

| Role | Font | Size / line |
|---|---|---|
| Panel title, sector name | display | 18 / 24 |
| Section heading | display | 13 / 16, uppercase, letter-spacing .06em |
| Body | text | 14 / 20 |
| Meta, caption | text | 12 / 16, `--text-muted` |
| Data (UWP, hex, coords) | data | 13 / 20 |
| Timecode | display | 14 / 20, tabular |

## 6. Iconography

Font Awesome Free Solid, self-hosted (already in `assets/fontawesome`), used through one
`<Icon name="..."/>` component so the set can be swapped once. No emoji in UI.

## 7. The orbit view (2.5D)

Decided in `architecture.md` §9. Rules for the look:

- **Camera.** Opens top-down, fitted to the system. Drag rotates around the primary; a second
  axis tilts between 0° and 60°; wheel and pinch zoom; double-click a body to fly to it. Every
  move is a flight (`--t-slow` near, `--t-long` far). A "Fit system" chip and a "Top-down"
  chip reset. Keyboard: arrows rotate and tilt, +/- zoom, Home fits.
- **Orbits.** Thin `--signal-dim` ellipses on the ecliptic plane, the selected body's orbit in
  `--signal`, moons' orbits only around the focused planet. Belts are a stippled band, rings a
  flat translucent disc. Log-compressed radii exactly as the legacy orrery computes them.
- **Bodies.** Spheres textured from the colour cube-map bake with the height bake as
  normal detail; the star lights them; the terminator follows the stardate. Companions are
  smaller suns with their own light. Gas giants, worlds and moons share one shader.
- **Labels and chips.** HTML, projected from 3D each frame, in `--font-data` for ids and
  `--font-text` for names; the view-nav chip row along the bottom stays 2D. Labels fade out
  with distance and never overlap: a simple occlusion pass hides the smaller one.
- **Time.** Timecode in `--font-display`, tabular. Scrubbing moves bodies along their orbits;
  the line-up result draws one `--attention` line through the star and the aligned bodies.
- **Reduced motion.** Camera moves become cuts; bodies still move with time.
- **Fallback.** Without WebGL2 the 2D canvas renderer draws the same model with discs and
  the flat bake sheet; the chrome is identical.

## 8. The design-system page

`apps/web/src/design/DesignSystem.vue`, routed at `/design` (dev and preview only). It
renders every component in §3 in every state (default, hover, focus, active, disabled,
loading, empty) on the dark field, and the token sheet with swatches. A session building
a new panel copies from this page. `npm run check` fails on any hex colour or `ms` literal
outside `tokens.css`.
