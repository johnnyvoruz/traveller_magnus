# Surface map symbol sets

The hybrid surface map (dossier → Surface, enhanced look, **Symbols** on) draws one symbol per
hex code. The symbols come from a *set* in this folder, so the art can change without touching
the generator or the renderer.

```
public/surface-icons/
  README.md          this file
  default/           the set the app ships with (our own simple strokes)
    manifest.json
    oc.svg  sh.svg  ...  dome.svg
```

## The codes

The single list of codes lives in `apps/web/src/surface/hybrid/codes.ts` (`SURFACE_CODES`,
`CODE_TABLE`). A set may draw any of them:

| kind | codes |
|---|---|
| sea | `OC` ocean, `SH` shallows |
| ice | `SI` sea ice, `IF` ice field, `IC` ice cap, `FR` frost |
| land | `TU` tundra, `TA` taiga, `FO` forest, `JU` jungle, `SW` swamp, `GR` grass and steppe, `DE` desert, `BK` baked lands, `EV` evaporite flat, `XR` exotic terrain, `RG` regolith, `RK` bare rock, `LV` lava |
| accent | `MT` mountains, `VO` volcano, `CR` crater |
| feature | `starport`, `city`, `arcology`, `town`, `outpost`, `rural`, `farm`, `resource`, `naval`, `scout`, `military`, `estate`, `penal`, `dome` |

Codes are case-sensitive. The renderer draws the starport's class letter on top of the
`starport` icon, so leave its middle clear. `dome` is drawn over `starport`, `city`, `arcology`,
`town` and `outpost` where the air is not breathable.

## manifest.json

```json
{
  "name": "default",
  "version": 1,
  "icons": {
    "MT": { "file": "mt.svg", "name": "Mountains", "tint": "auto" },
    "city": { "file": "city.svg", "name": "City", "scale": 1.1, "anchor": [0.5, 0.5] }
  }
}
```

- `version` must be `1`.
- `icons` maps a code to an entry. A bare string is short for `{ "file": "<string>" }`.
- `file`: a plain `.svg` file name in the same folder (no paths, no `..`).
- `name` (optional): display name; defaults to the name in `codes.ts`.
- `tint` (optional): leave it out to draw the SVG as it is. `"auto"` recolours the whole icon
  to the map's ink (dark on light ground, light on dark ground), so draw such icons in a single
  colour. Any CSS colour (`"#2846a0"`, `"steelblue"`) recolours it to that colour.
- `scale` (optional, default 1, clamped 0.1–4): multiplies the hex's symbol size. The icon box is
  drawn as a square two symbol-radii wide, so a 64×64 view box with the shape filling about
  three quarters of it matches the built-in look.
- `anchor` (optional, default `[0.5, 0.5]`): the point of the icon, as fractions of its box,
  placed on the hex centre.

Unknown codes and bad entries are skipped (and listed in the set's `problems`); the rest of the
set still loads. Any code the set leaves out, or whose file fails to load, is drawn with the
built-in glyph from `icons.ts`, so a partial set is fine.

## Making and choosing a set

1. Copy `default/` to a new folder, e.g. `ink-and-wash/` (lower case letters, digits, `-`, `_`).
2. Replace the SVGs you want to change and edit `manifest.json`. Use only art you made or are
   licensed to ship.
3. Choose the set. The preference is `voyage_surface_icons` in local storage (default
   `default`); in code, `setIconSetName('ink-and-wash')` from `src/surface/preferences.ts`. An
   unknown or invalid name falls back to `default`.

Sets are cached by name for the page's lifetime; reload the page after editing a set (or call
`clearIconSets()` from `src/surface/hybrid/icons.ts`).

`tests/web/surface_hybrid.test.js` checks that the `default` set covers every code and that
every file it names exists.
