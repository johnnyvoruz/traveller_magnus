# versionvideo

A jig that turns one Traveller.voyage release into a short changelog video (MP4, with music).
Feed it a release file, and it cuts the same video every time.

It is not an npm workspace and shares no code with `apps/`, `packages/` or `tests/`. The colours
in `scene/scene.css` are copied from `apps/web/src/design/tokens.css`, and the fonts and the mark
in `assets/` are copied from `apps/web/public/`. If the app's look changes, copy them again.

## Requirements

- Node 20 or later
- `ffmpeg` on `PATH`
- Microsoft Edge or Google Chrome. The renderer looks in the usual install paths. To use another
  browser, set `BROWSER` to its executable.

Install once, from this folder:

```sh
npm install
```

## Make a video

1. Draft the release file from the release commit's subject line:

   ```sh
   npm run draft -- 1.1.15
   ```

   This reads `git log` (read-only), finds the subject that starts with `1.1.15 `, splits it on
   `; ` into items, and writes `releases/1.1.15.json`. An item that starts with a short `area:`
   label keeps the label as its area. To skip git, pass the text yourself:
   `npm run draft -- 1.1.16 --subject "1.1.16 map: ...; ..." --date 2026-10-20`.

2. Edit `releases/1.1.15.json`. Each item has a `text` and an optional `area`. Set `area` to
   `null` to leave the label off. To show an engine chip next to the date, add
   `"engine": "e1.2"`.

3. Watch it in a browser, with the music:

   ```sh
   npm run preview -- 1.1.15
   ```

   Open the printed URL and click **Play**. Browsers only start sound after a click, so the
   preview opens paused. To tune the video, see [Dial it in](#dial-it-in).

4. Render it:

   ```sh
   npm run render -- 1.1.15
   ```

   The video is written to `out/traveller-voyage-1.1.15-1080x1080.mp4`.

## Dial it in

Every knob is in `scene/tune.js`, with a comment on each one: the words on screen, the music,
overall speed, how long each part runs, how long each item stays up, sizes, and the background.
Colours, fonts and type sizes are in `scene/scene.css`. Change either file, then reload the
preview.

The preview keeps your place across reloads: the time is saved in the address (`&t=9.20`)
whenever you pause or scrub. So the loop is: pause on the moment you want to change, edit, and
reload.

| Key | Does |
|---|---|
| Space | Play or pause |
| ← and → | Step one frame back or forward |
| Shift+← and Shift+→ | Step one second back or forward |
| `[` and `]` | Jump to the start of the previous or next part |
| Home and End | Jump to the start or the end |

The readout shows the time, the running time, and the part you're in: `intro`, `version`,
`item 1`, `item 2` and so on, `summary`, or `outro`.

To check one frame at full size, render a still: `npm run render -- 1.1.15 --still 9.2`.

For a change that `tune.js` doesn't cover, such as a new kind of motion, edit the timeline in
`scene/scene.js`. Each of the five parts is commented there.

## Music

`music` in `scene/tune.js` names the track (`assets/Timeline 1.wav`) and sets its volume and
fades. The track runs from the first frame. If the video is longer than the track, the track
loops. The last `fadeOut` seconds always fade to silence, wherever the video ends. The preview
plays the same track at the same level, so what you hear there is what renders. Set
`file: null` for no music, or pass `--silent` to leave it off a single render.

## Options

| Option | Meaning |
|---|---|
| `--size square` | 1080 × 1080 (the default) |
| `--size wide` | 1920 × 1080 |
| `--size tall` | 1080 × 1920 |
| `--size 1280x720` | any width × height |
| `--fps 60` | frame rate (default 30) |
| `--still 9.5` | write one PNG at 9.5 seconds instead of a video |
| `--out path.mp4` | where to write the file |
| `--silent` | render without the music |
| `--force` | `draft` only: replace an existing release file |

## How it works

The scene (`scene/`) is plain HTML, SVG and CSS. `scene.js` lays everything out once, then builds
one paused GSAP timeline, in five parts:

1. The far-trader mark draws itself, the name arrives, and both jump to the header.
2. The version number reads out over a red line, with the date.
3. For each item, the ship jumps to the next hex on a route, and the item reads in. Long lists scroll.
4. All items return to full strength for a last look.
5. Everything clears, the ship returns to centre, and the address types in.

Running time comes from the number of items and their length (about 16 s for two items, 30 s for
eight). `speed` in `tune.js` stretches or squeezes it.

The renderer (`scripts/render.js`) serves this folder, opens the scene in headless Edge, seeks the
timeline to each frame (`window.__jig.seek(t)`), takes a screenshot, and pipes the PNGs to ffmpeg, which adds the music.
Nothing in the scene reads the clock or `Math.random` (the star field is seeded from the
version), so a frame at a given time always looks the same.

To build a different scene, keep the contract: the page sets `window.__jig.ready`, a promise of
`{ duration, fps }`, and `window.__jig.seek(t)`, which draws time `t` synchronously. Anything
that can be drawn on demand at a given time can go in: GSAP tweens, SVG, CSS, or a three.js
scene rendered inside `seek`.
