# Large campaigns

Undo stores the records an edit changed. It does not copy the campaign.

## What an undo entry is

`saveHistoryState` in `js/core.js` keeps a patch:

- `hexIds` — the previous value of each hex the action will replace or delete.
  A hex that did not exist is stored as empty, so undo removes it again.
- `routes` — the route-leg list, only when the action changes legs.
- `includeRouteDefinitions` — the route names and colours, only when a slot is
  added or removed by an action that still uses undo (combine, duplicate-slot
  cleanup).
- `borders`, `allegiances`, `regions`, `campaignAtlas` — those smaller lists,
  only when that action edits them.

Ctrl+Z writes the patch back. The size of the history follows how many hexes
the edit touched, not how many worlds are loaded. A fifty-step log of
allegiance changes stays small on a million-hex map.

Adding, drawing, clearing, and deleting a route from the Route Manager do not
call `saveHistoryState`. Those writes go straight to the route list. The
console logs `[Route]` for each of them. Ctrl+Z will not reverse them.

## What is not undoable

A whole sector import and clearing a sector slot do not record a patch. They
would have to remember every hex in the sector. Save a map file before either
one. The console logs `[History]` when an action is skipped for that reason.

The map file still splits at about 250 MB per part (`SAVE_CHUNK_SIZE` in
`js/io_manager.js`). The browser database still writes one hex at a time.

## If a patch is still too big

Cloning every generated system in a huge selection can still throw
`RangeError: Invalid string length`. `saveHistoryState` catches that, logs
`[History] "…" was not recorded`, and lets the edit continue. Ctrl+Z then has
no entry for it. The same message appears if a caller forgets to name the
hexes it changes: an empty patch is not stored, because undo would look like
it worked and change nothing.

