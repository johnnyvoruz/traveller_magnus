// The knobs. The scene (in the browser) and the renderer (in Node) both read this file.
// Times are in seconds. Sizes are design units: one unit is a pixel on a 1080 × 1080 video.
// Colours, fonts and type sizes live in scene.css.

export const TUNE = {
  // Words on screen.
  words: {
    wordmark: 'TRAVELLER.VOYAGE',
    kicker: 'Changelog',
    versionLabel: 'Version',
    enginePrefix: 'Engine',
    domain: 'traveller.voyage',
  },

  // Music under the whole video. Set file to null for a silent video.
  // A track shorter than the video loops; the end always fades out.
  music: {
    file: 'assets/Timeline 1.wav',
    volume: 1, // 1 is the file as recorded; 0.5 is half
    fadeIn: 0,
    fadeOut: 2.5,
  },

  // 1 is normal. 0.8 plays everything 20% slower (a longer video); 1.25 plays it faster.
  speed: 1,

  // 1. The mark draws itself and the name arrives, then both jump to the header.
  intro: {
    markSize: 240, // the mark at centre
    wordScale: 1.9, // the name at centre, relative to its header size
    draw: 1.1, // how long the mark's outline takes to draw
    jumpAt: 2.7, // when the mark and name leave the centre for the header
    jump: 0.8, // how long that move takes
  },

  // 2. The version number.
  version: {
    after: 0.7, // gap after the jump starts, before the version appears
    scramble: 1.0, // how long the digits spin before they land
  },

  // 3. One row per release item.
  items: {
    after: 1.3, // gap after the version appears, before the first item
    jump: 0.3, // the ship's jump from one hex to the next
    dimTo: 0.6, // earlier rows fade to this while a new one reads in
    // How long each item stays on screen: base + perWord × words, kept between min and max.
    hold: { base: 0.9, perWord: 0.2, min: 1.4, max: 3.6 },
  },

  // 4. All rows at full strength.
  summary: { hold: 1.8 },

  // 5. The address at the end.
  outro: {
    markSize: 200,
    hold: 1.8, // how long the last frame stays after the address finishes
  },

  // The field behind everything.
  background: {
    hexSize: 46, // radius of one grid hex
    stars: 120, // on a 1080 × 1080 video; scaled by area for other sizes
    drift: 1, // 0 holds the grid and stars still; 2 drifts twice as fast
  },
};
