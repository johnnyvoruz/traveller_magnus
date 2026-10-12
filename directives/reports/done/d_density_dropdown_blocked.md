# D density_dropdown report
Prompt: prompts/d_density_dropdown.md
Status: blocked at item 1, at the adapter line, as the stop rule says.

## What blocks it
`apps/web/src/builder/screen.ts` (Lane A's), lines 101 to 108, `generateMany`. The adapter builds the store's generate body itself, from `hexes` and `choice` only:

```ts
generateMany: (hexes, choice, onProgress) => {
    const handle = builder.generate({
        hexKeys: hexes.map((item) => item.hexKey),
        edition: choice.engine,
        generator: choice.generator,
        roll: 0,
        filledToo: true,
    }, (progress) => onProgress(screenProgress(progress)));
```

A `density` added on the seam would never reach `builder.generate`, so the dropdown would do nothing for the ordinary many-hex Generate (a box, a subsector, a sector).

The empty-slot path is different: `generateGrowing` forwards its body whole (line 114), so a `density` there would reach the server. But most selections don't take that path.

## The exact need, for Lane A
In `builder/screen.ts`, `generateMany` takes a fourth argument and puts it on the body only when it's named:

```ts
generateMany: (hexes, choice, onProgress, density) => {
    const handle = builder.generate({
        hexKeys: hexes.map((item) => item.hexKey),
        edition: choice.engine,
        generator: choice.generator,
        roll: 0,
        filledToo: true,
        ...(density ? { density } : {}),
    }, (progress) => onProgress(screenProgress(progress)));
```

On my side, `workspace/build/seam.ts` then declares:
- `generateMany(hexes, choice, onProgress, density?: 'every' | 'sparse' | 'standard' | 'dense')`;
- `density?` on `GrowBody`;
- `skipped`, `leftEmpty`, `placed` and `landed` on `JobProgress` and on `FollowedJob`'s progress.

Your adapter's own return type already lists those four progress fields, so nothing else of yours changes.

## Changed files
- None. I stopped before item 1's seam change, which on its own would have shipped a dropdown that does nothing for many hexes.

## Gates
Not run: nothing changed. The tree's state is as Lane A's report left it (1434 pass, 0 fail).

## Contract published
none

## Needs from others
- Lane A: the four-line change to `builder/screen.ts` `generateMany` above. Once it's on disk, items 1 to 5 are mine and need nothing else from another lane:
  - the seam types;
  - the "Hexes to fill" dropdown on the sheet, with the choice on the Generate button's and the right-click menu's second line, remembered per universe with the engine and method;
  - honest counts ("Generate up to 80 hexes", "N of M hexes checked", "Generated 40 systems in Subsector C. 40 hexes were left empty.");
  - marks from `landed`;
  - the second-run sentence.

## Questions for Johnny
none
