# E checker colours report
Prompt: prompts/e_checker_colours.md
Status: done

## Changed files
- scripts/check_manifesto.js: script text now fails on a hex, an `rgb(` / `rgba(` / `hsl(` / `hsla(` with a digit, or a named colour used as a value. The audit's patch, fitted to the current file.
- scripts/check_allowlist.json: `colour literal` on `packages/generation/src/regions.ts`, `route_colours.ts`, and `territories.ts`, each "published chart colour tables".

## Gates
npm test:      pass (1308 pass, 0 fail, 15 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
fourth gate:   pass

Before this pass, `npm run check` printed `manifesto: clean`.

Before the allowlist, the patched check reported 3 colour literals, all in one folder:

- `packages/generation/src`: 3 (`regions.ts`, `route_colours.ts`, `territories.ts`)

No other folder. The audit's four paint files (`orbit/system.ts`, `surface/hybrid/daynight_layer.ts`, `surface/hybrid/symbols.ts`, `dossier/SurfaceStage.vue`) are no longer hits.

After the three allowlist entries, `npm run check` printed `manifesto: clean`.

A scratch copy of the checker, pointed at a directory outside the repository, reported:

- `hex_swatch.ts: colour literal` for `export const swatch = '#aabbcc';`
- `rgb_ink.ts: colour literal` for `export const ink = 'rgb(1, 2, 3)';`

A third file with no colour was not reported. The scratch directory was deleted. Nothing in the tree was left failing on purpose.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. Should `apps/web/src/surface/vanilla/map_palette.ts` get a `colour literal` allowlist entry? Suggested answer: no. The audit says this patch does not see its channel triples, and an entry would hide a later `#rrggbb` or `rgb()` in that file. The three chart tables are the allowlist.
