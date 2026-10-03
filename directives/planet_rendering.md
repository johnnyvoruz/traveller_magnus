# Planet rendering in orbit view

How a world's generated data becomes what it looks like in orbit view, and
how the renderer is put together. Presentation only: nothing here changes
generation, export, or any RPG value.

## Goal

Every world and moon in orbit view is drawn from its own data. A player who
knows the UWP should recognise the world by sight: a garden world, a frozen
ocean, a corrosive hothouse, a gas giant's bands. Spin, day and night, and
seasons move smoothly at any time rate.

## Where it lives

| File | Role |
|---|---|
| `js/planet_profile.js` | Data → appearance. Reads the body, returns a profile. No drawing. |
| `js/planet_gl.js` | WebGL2 renderer. Paints each world into cube maps once, then shades every visible world each frame. |
| `js/system_viewer.js` | Orbit view. Lays the frame out, hands the worlds to PlanetGL, copies the results in. |

Load order: `planet_profile.js` and `planet_gl.js` load before
`system_viewer.js` (see `hex_map.html`).

## How a frame is drawn

1. **Layout pass.** Orbit view draws the frame on a 1×1 canvas. Nothing is
   painted; each visible world records its position, size, spin angle, the
   direction of its star, and which moon or parent can eclipse it.
   Worlds off the canvas are dropped (they still count as eclipse casters).
2. **Shading.** PlanetGL shades every recorded world into a tile of one
   shared WebGL canvas.
3. **Paint.** Orbit view draws the frame as before (orbits, labels, rings,
   selection) and copies each world's tile where its disc goes.

Hit testing, the campaign locator, tracking, and the lineups never touch the
GPU; they read the same layout they always did.

If WebGL2 is missing or a shader fails to compile, PlanetGL reports itself
unavailable and orbit view uses the older canvas painter in
`system_viewer.js`. With Day / night off, worlds are flat discs, as before.

## Painting a world (once)

Each world is painted into two cube maps (six faces, so there is no pinch at
the pole, which is the centre of the disc in a top-down view):

- **A:** surface colour, and height in alpha.
- **B:** open water (for sun glint), city lights, lava, and cloud density.

Before painting, a small equal-area map of the world's terrain and cloud
fields is measured on the GPU. The sea level is set so the share of the
world below it matches its hydrographics; the cloud edge so the share under
cloud matches its expected cover.

Cube maps come in sizes from 32 to 1024 per face, chosen from the world's
size on screen. A world's first painting is 32 px and done at once; sharper
ones are painted a face or two per frame, so zooming in never stalls a frame.
Paintings are kept until a 320 MB budget is reached, then the least recently
seen world is dropped.

## Shading a world (every frame)

Orbit view looks down on the ecliptic, so each world is seen from above.
Its spin axis is tipped by its axial tilt toward a fixed direction in space;
as the world orbits, the sunlit half moves across the pole (seasons).

Per pixel: sunlight (tinted by the primary's spectral class), relief lit by
the real sun direction (on large discs only), sun glint on open water,
clouds and their shadows, eclipses by a moon or parent, city lights and lava
by night, haze thickening toward the limb, a sunset band at the terminator,
and a halo past the limb that fades out gradually.

**Motion blur.** The surface is averaged over the angle it turns during one
frame, with every layer (ground, clouds, lights) blurred together. The
samples are jittered per pixel and read from softer mip levels as they
spread, so a fast spin reads as smooth motion, never as ghost copies or
strobing. At real time the blur is zero.

Spin angles are reduced to one turn in double precision on the CPU before
they reach the GPU, so a world thousands of turns into a campaign turns as
smoothly as on day one.

## Data → appearance

These are the current mappings. **Values marked ⚑ are interpretations
awaiting review**; change them in `planet_profile.js`.

### Family (`PlanetProfile.kind`)

Gas giant, belt, and ring by type. T5 world types Iceworld, Inferno,
RadWorld, StormWorld map directly. Otherwise, in order: mean temperature
≥ 450 K → hot; atmosphere A+ → exotic; temperature band Frozen → ice (or
barren with no air and no water); atmosphere 0 → barren; hydrographics 9+ →
ocean; hydrographics 3+ → temperate (breathable air) or ocean; else desert.

### Atmosphere

| Field | Effect |
|---|---|
| `totalPressureBar` (else a pressure implied by the UWP digit ⚑) | Haze, halo, and terminator softness. 1 bar = 0.85; ×10 pressure adds 0.45. |
| Digit 2, 4, 7, 9 (tainted) | Haze shifted toward brown ⚑ |
| Digit A (exotic) | Orange haze ⚑; clouds ~55 % |
| Digit B (corrosive) | Pale yellow overcast ⚑; clouds ~95 % |
| Digit C (insidious) | Yellow-green overcast ⚑; clouds ~95 % |
| Digit D (super-high density) | Blue-white haze ⚑; clouds ~85 % |
| Digit E (Thin, Low) | A thin atmosphere with low pressure and low temperature: pale, cold blue haze; 0.15 bar when no pressure is given. |
| Digit F (Unusual) | Livable only in certain zones; includes ellipsoidal worlds. Drawn iridescent: a thin-film shimmer that gathers at the limb and in the halo, with a faint sheen across the day side. |

### Water and other liquids

| Field | Effect |
|---|---|
| Hydrographics digit | Share of the world below sea level (B = full cover). |
| `liquidType` | Sea colour: water blue, ice white, sulphuric acid ochre, methane and ethane near-black, ammonia pale blue, chlorine yellow-green, etc. ⚑ |
| Local temperature | Seas freeze toward the poles below about −6 °C. |

Without `liquidType` (CT, T5): water below 373 K, ice below 262 K.

### Temperature

`meanTempK` (else the temperature band) sets the climate; the spread between
`highTempK` and `lowTempK` sets how much colder the poles are than the
equator. Height cools the ground (about 28 °C across the full relief).
Tidally locked worlds (`tidallyLocked`, `isTwilightZone`) are warm on the
star-facing side and frozen on the far side instead of by latitude.

### Life

| Field | Effect |
|---|---|
| `biomass` | Share of mild land under vegetation. 0 means none: no green. |
| `biocomplexity` | Low values stay as mats and films, not forest. |
| `compatibility` | How Terran the colours are: high is green; low drifts to one of five alien hues (purple, rust, teal, gold, violet) chosen per world. ⚑ |

Without these fields (CT, T5): vegetation on breathable, wet, mild worlds. ⚑

### Rock and geology

| Field | Effect |
|---|---|
| `composition` | Bedrock tone: metal greys, rock browns, ice whites, exotic ice violet. |
| Dry thin-air desert without life | Iron-oxide reds (Mars). ⚑ |
| `seismicStress` | Volcanism: glowing vents on land, seen best at night. |
| `tectonicPlates`, `plateInteraction` | How strong the mountain ranges are (converging strongest). |
| Size digit | Relief strength: smaller worlds are more rugged. ⚑ |
| Thin or no air, no seas, quiet geology | Crater density. |

### People

| Field | Effect |
|---|---|
| Population digit | Share of usable ground that is built up: scattered towns at 1–3, 3 % at 5, 20 % at 8, 38 % at 9, 80 % at A (an ecumenopolis), and from B the seas too. Usable ground is dry land on a world with open seas, all of it otherwise. ⚑ |
| Tech level | Light colour and strength: amber firelight (0–3), warm lamplight (4–5), incandescent (6–7), 5,600 K daylight (8–11), then neon districts (magenta, cyan, electric blue, hot pink, violet) mixed in from 12, a quarter of districts at 12 rising to most of them at 15. |
| Tech level, by day | Built-up ground covers the same footprint the lights do at night, drawn from the same street network: blocks of mixed tone in the tech level's material (timber and stone up to glass and steel), dark asphalt arteries and streets, pale highways, and brighter glass downtowns. Glass and steel catch the sun. |
| Tech level, bloom | Light domes spill past the districts over dark ground, sea, and cloud; on a world more than about 20 % built up the night-side air glows toward the limb. Faint at low tech, strongest and neon-violet at 12+. |
| City structure (night) | Drawn per pixel, not baked: highways between districts (warm gold, with traffic moving along them), arterial roads, street grids, downtown cores, rooftop beacons. Roads stay crisp lines at least a pixel wide; each layer settles to an even glow once its cells are too small to show, and eases out as a world blurs with its spin. Night lights dim toward the limb. Neon is an accent on the street light, block by block. |

### Rotation

| Field | Effect |
|---|---|
| `siderealHours` / `rotationPeriod` | Spin speed. |
| `axialTilt` | Spin axis tilt; over 90° spins retrograde. The project follows Mongoose 2e, which supplies tilt; CT and T5 worlds have none and stay upright. |
| `tidallyLocked`, `isTwilightZone` | One face stays toward the star. |

### Gas giants

`ggType` picks the family (GS ice-giant blues, GM pale gold, GL cream and
rust). Over 700 K darkens toward bronze; under 90 K cools toward blue. A
faster spin packs more bands (6–16). ⚑

### Rings

MgT2E keeps rings on the world (`rings[]`); CT stores them as ring-sized
moons (size `R`). Either way the world gets one ring system, in its
equatorial plane, so it tilts with the spin axis: face-on circles for an
upright world, ellipses that pass behind and in front of the globe for a
tilted one.

- Span: from 1.22 planet radii out to 1.6 + 0.2 per ring (at most 2.05).
  A ringed world's moons are spaced out beyond the rings.
- Structure: fine ringlets, a dense bright middle, a broad division and a
  narrow gap (positions seeded per world), a fading outer edge.
- Colour: icy (cream to tan) around cold worlds (under 200 K) and ice
  worlds; dusty grey-brown otherwise. ⚑
- Light: brighter the higher the sun stands over the ring plane, never quite
  dark. The planet's shadow falls across the rings; the rings shadow the
  planet.
- Motion: clumps and faint spokes circle the planet, inner ones faster
  (a seven-hour inner period), and smooth out into clean bands as time
  speeds up.

## Inspector surface map

The diamond sheet in the system panel takes about 140 ms to draw. When a
world is opened for the first time, its empty sheet is scanned while the
surface draws: the diamond in black under the world's own hex grid in teal,
with one unhurried sweep down and back up (2.4 s). The surface then fades in
as the scanner dissolves; if it is not ready by the end of a pass, the sweep
goes round again. Sheets are cached: moving between worlds already charted
fades the last sheet out over the next one fading in.

Timings live in `style.css` as `--scan-cycle` (one down-and-up pass) and
`--scan-pass` (the fade-in).

## Habitable zones

Every star but a close companion gets its own zone, by the generator's rule
(`computeWorldHzco` in `js/mgt2e_stellar_engine.js`): the primary's is the
system's, which already counts a close companion's light; any other star's
is centred at √L AU from its own luminosity. Each is drawn on its star's
subsystem scale as a band from 0.70 to 1.55 × the centre, labelled once it
is wide enough to read. A star whose luminosity is unknown gets no band. In
the row and column lineups, a world is lit as habitable by its own star's
zone.

## Orbit view backdrop and scan view

Behind every system is a faint deep-space field, different per system: a
nebula and galactic band painted once on the GPU, under small stars of mixed
colour, denser along the band. It drifts slightly with the camera.

The **Scan** chip adds a reticle to every world and moon (a faint ring, four
turning brackets, and its designation), and a sweep that circles the primary
every eight seconds, brightening each reticle as it passes. Tiny moons get a
quiet ring instead, so crowded moon systems stay readable.

## Starports

From the Mongoose starport profile (`starportProfile`, e.g. `B-HY:DY:+1`:
highport yes, downport yes) where there is one. Otherwise from the class
alone. Mainworld starports: A–E have a downport, X is no starport (an
interdiction: no landing site). Secondary-world spaceports (MgT2E): F good,
G basic, H primitive have a small downport; Y is no spaceport, with no site
marked for landing. No highport is assumed without a profile.

- **Downport:** a landing beacon at the largest city on the hemisphere orbit
  view looks down on. A lit pad by day; by night a strobing glow with
  four-point light spikes. Brighter for better classes (A brightest, then B
  to E; F to H fainter still); blue-white for A and B, warm otherwise. ⚑
- **Highport:** a small painted station in low equatorial orbit, one
  painting per class from `assets/starports` (A and B full rings, C a
  three-quarter ring, E a cross; D borrows E's art). Drawn at a fifth of
  the world's radius, 3 to 14 px across its half width, downscaled once per
  on-screen size so it stays crisp, turning slowly about its hub. It
  carries a breathing wash in the port's colour, a pulsing hub glow, red
  (port) and green (starboard) navigation lights blinking in turn on its
  spar tips, and white double-flash strobes on its docking modules. Its period is a real circular
  orbit about 6 % of the world's radius up, from its diameter and gravity
  (about 90 minutes for a Terran world), so at real time it visibly moves.
  It passes behind the world and loses its sunlit glint in the world's
  shadow. Drawn at a display distance clear of the disc, with a faint path.
  It is scenery, not a body: it cannot be selected.

## Selection

Selecting a body locks on: four brackets swing in from wide and snap onto
it while the ring draws itself around it; then a slowly turning range scale,
three counter-rotating arcs, a soft glow, a double ping every 2.4 s, and a
readout tag (name, and UWP or spectral class) hold the lock. With reduced
motion the lock appears in its final state.

## Edge cases

- **Tiny discs** (under 2.5 px) are flat dots with a night half.
- **Huge close-ups** are shaded at up to 1100 px radius and scaled up.
- **Print mode** shades with a higher ambient light and no halo or night lights.
- **Lost WebGL context** falls back to the canvas painter until restored.

## Settled

- Atmosphere E (Thin, Low) and F (Unusual, drawn iridescent): as above.
- Axial tilt: Mongoose 2e is the reference; CT and T5 stay upright.
- City lights: amber for fire, 5,600 K for modern, neon for high tech.

## Open questions

1. Is `compatibility` the right field to drive how Terran vegetation looks?
