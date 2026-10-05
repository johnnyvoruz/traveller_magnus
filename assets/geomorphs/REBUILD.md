# Rebuild a ship from Geomorph Shipyard JSON

Import the JSON the shipyard exports. Do not import a flattened picture as the ship. The JSON is the ship. The PNGs in this folder are only the tiles you stamp down.

The shipyard can also export a picture. That picture is a snapshot. Use it as a preview if you want, but the campaign ship should be rebuilt from the JSON so it can be shown again from these files.

## What the file is

The shipyard writes a file named like `geomorph-YYYY-MM-DD-{dTons}dTon-{ship name}.json`.

```json
{
  "meta": "Traveller Geomorph Ship",
  "name": "YourShipNameGoesHere",
  "parts": [
    { "code": "SE-239", "corner": [-75, -25], "rotation": 90, "overlay": false },
    { "code": "SS-165", "corner": [-25, -75], "rotation": 90, "mirror": true }
  ]
}
```

Reject the file unless `meta` is `Traveller Geomorph Ship`, `parts` is an array, and every part has `code` and `corner`. That is the same check the shipyard uses on load.

Each part:

- `code` is the tile id, such as `SE-239`. It is not a filename.
- `corner` is `[x, y]` in map units. `x` is `corner[0]`, `y` is `corner[1]`. Y increases up, same as the shipyard map.
- `rotation` is degrees, one of 0, 90, 180, 270. It is applied when drawing. It is not a different file.
- `mirror` is optional. When true, use the Port image (`role` `mirrorUrl` in `manifest.json`) instead of the Starboard image (`role` `url`).
- `overlay` is optional. When true, draw the overlay PNG on top of the same rectangle. Use `overlayMirrorUrl` if the part is mirrored, otherwise `overlayUrl`. If that role is missing, draw the base tile only.

## Which file to draw

`manifest.json` in this folder lists every image. Paths are relative to this folder.

For each part:

1. Find the rows with that `code`.
2. Base image: the row whose `role` is `mirrorUrl` if `mirror` is true, otherwise the row whose `role` is `url`.
3. If `overlay` is true, also take `overlayMirrorUrl` or `overlayUrl` the same way.
4. Open `path`. Example: code `SE-239` is `SEF/SE-239 [Fore] [50x50] [18-dTons] Bridge, Staterooms.png`.

35 catalog rows have no file. The shipyard host returned 404 for them, mostly LS shuttle tiles `LS/AF01` through `LS/AF13`. If a path is missing, skip that layer and keep the rest of the ship.

## Where to put it

The shipyard does this in `src/routes/geomorph-shipyard/+page.svelte`. Copy that math. Do not invent a grid.

`sizeX` and `sizeY` are the tile footprint in 1.5 m squares. They are not in the export. Read them from the `[width x height]` feet tag in the filename: divide each number by 5. `[50x50]` is 10 by 10. `[70x100]` is 14 by 20. That matches the catalog (`SE-239` is `sizeX` 10, `sizeY` 10).

```
x1 = corner[0] - 10
y1 = corner[1] - 10
width  = (sizeX + 4) * 5
length = (sizeY + 4) * 5
```

The extra 4 squares and the -10 are the gutter baked into the PNG. The deck itself, without gutter, is the rectangle inset by 10 on every side.

Map the PNG onto three corners. Image top-left, top-right, and bottom-left go to these map points `(x, y)`. This is the rotation. Do not rotate the file on disk.

- 0: top-left `(x1, y1 + length)`, top-right `(x1 + width, y1 + length)`, bottom-left `(x1, y1)`
- 90: top-left `(x1, y1)`, top-right `(x1, y1 + width)`, bottom-left `(x1 + length, y1)`
- 180: top-left `(x1 + width, y1)`, top-right `(x1, y1)`, bottom-left `(x1 + width, y1 + length)`
- 270: top-left `(x1 + length, y1 + width)`, top-right `(x1 + length, y1)`, bottom-left `(x1, y1 + width)`

On a screen, flip Y. Pick any origin, then `screenX = mapX` and `screenY = -mapY`.

One map unit is 0.3 m. One square is 5 map units, which is 1.5 m by 1.5 m, and 3 m of deck height. The PNGs are 12 pixels per map unit, so one square is 60 pixels. A 50 by 50 foot tile is 840 by 840 pixels, including gutter.

Draw parts in array order, later parts on top. Draw the overlay in the same quad after the base image.

## Code

```js
function feetToSquares(path) {
  const tag = path.match(/\[(\d+)x(\d+)\]/);
  if (!tag) throw new Error("No size tag in " + path);
  return { sizeX: Number(tag[1]) / 5, sizeY: Number(tag[2]) / 5 };
}

function rowsFor(manifest, code) {
  return manifest.images.filter((row) => row.code === code);
}

function pick(rows, role) {
  return rows.find((row) => row.role === role);
}

// manifest is manifest.json. parts is the export's parts array.
// drawImage(path, topLeft, topRight, bottomLeft) maps the PNG's
// top-left, top-right, and bottom-left pixels onto those [x, y] points.
function placeShip(manifest, parts, drawImage) {
  for (const part of parts) {
    const rows = rowsFor(manifest, part.code);
    const base = pick(rows, part.mirror ? "mirrorUrl" : "url");
    if (!base) continue;

    const { sizeX, sizeY } = feetToSquares(base.path);
    const x1 = part.corner[0] - 10;
    const y1 = part.corner[1] - 10;
    const width = (sizeX + 4) * 5;
    const length = (sizeY + 4) * 5;
    const rotation = part.rotation % 360;

    let topLeft, topRight, bottomLeft;
    if (rotation === 0) {
      topLeft = [x1, y1 + length];
      topRight = [x1 + width, y1 + length];
      bottomLeft = [x1, y1];
    } else if (rotation === 90) {
      topLeft = [x1, y1];
      topRight = [x1, y1 + width];
      bottomLeft = [x1 + length, y1];
    } else if (rotation === 180) {
      topLeft = [x1 + width, y1];
      topRight = [x1, y1];
      bottomLeft = [x1 + width, y1 + length];
    } else if (rotation === 270) {
      topLeft = [x1 + length, y1 + width];
      topRight = [x1 + length, y1];
      bottomLeft = [x1, y1 + width];
    } else {
      continue;
    }

    drawImage(base.path, topLeft, topRight, bottomLeft);

    if (part.overlay) {
      const over = pick(rows, part.mirror ? "overlayMirrorUrl" : "overlayUrl");
      if (over) drawImage(over.path, topLeft, topRight, bottomLeft);
    }
  }
}
```

## Later

A new builder can write this same JSON. Keep `meta`, `name`, and `parts` with `code`, `corner`, `rotation`, and optional `mirror` and `overlay`. Any file this folder can rebuild, the shipyard can load, and the other way around.
