# City lights from space: the design (paper only)

Issued 2026-10-06 by the orchestrator, for the high-effort design agent Johnny gives it to
(Agent F is recommended). **This step writes to `findings/` only.** It edits nothing under
`apps/`, `packages/` or `tests/`; five other agents are working in the tree. No git.

## Read first

`CLAUDE.md`; `directives/manifesto.md`; `directives/design_reference.md`;
`directives/plan_planet_surfaces.md` (the vanilla and enhanced modes); then the code as it
is: `apps/web/src/surface/profile.ts` (`cityLight`, by tech level), `surface/vanilla/`
(`gl_shaders.ts`, `gl_shade.ts`, `gl_bake.ts`: the urban mask and how the lights are
painted), `surface/preferences.ts` (the mode), `orbit/disc_batch.ts` and the disc calls in
`orbit/OrbitRenderer.ts`. Agent C's two frames of today's look:
`findings/ui_design_shots/city_lights_vanilla.png` and `city_lights_enhanced.png`.

## What Johnny said

He saw the city texture "on the atmosphere layer and not the planet layer". Agent C found
that our planet shader is the old app's, line for line: night lights dimmed by cloud but not
hidden, a city-coloured glow at the limb, and city colour in the air halo. Offered the
choice, Johnny chose to differ from the old app, and set the bar:

> *"it needs to look sci-fi and incredible, beautiful, glowy, spectacular, it really needs
> to inspire awe and wonder and capture sci-fi city feel from space, like 'oh, I want to
> visit there or go there'"*

## Fixed points

1. **The lights belong to the planet.** They turn with the surface, sit where the bake's
   urban mask puts them, and cloud covers them. No city colour is painted on the air shell
   or as a ring at the limb. Whatever glow there is comes from the cities themselves.
2. **Vanilla stays the old app, exactly.** `tests/web/surface_gl.test.js` pins the vanilla
   shader to `js/planet_gl.js` and that test is not touched. The new look is the
   **enhanced** disc: say how it is built beside the vanilla one (a second program, a
   variant of the source, a flag) so that vanilla's bytes do not change.
3. **No new Traveller facts.** What drives the look today (population through the urban
   mask, tech level through `cityLight`'s colour, neon, gain and glow) is what drives it
   tomorrow. Anything added is decoration computed from those, never a claim about a world.
4. **The budget.** The disc pipeline bakes in a worker and no frame may pass 50 ms. A world
   is 20 to 60 px across at system zoom and a few hundred when the view flies to it: the
   design must read at both, and say what is dropped when small.
5. **Tokens and motion.** Any time-based shimmer follows the view's clock and stops under
   reduced motion; nothing in the shader is a UI colour, so the token rule does not apply
   to city colours, but say where each colour comes from.

## The design to write: `findings/city_lights_design.md`

- **The look, in words and pictures.** What a high-population, high-tech world's night side
  looks like, and a low-tech one, and a thinly settled one: the clusters, the threads
  between them, the coast-hugging, the colour, the bloom round the densest cores, light
  bleeding softly through thin cloud and vanishing under thick, lights coming on across the
  twilight band, the day side's built-up ground. What makes it read as a living sci-fi
  world and not as noise. Reference frames or mockups in
  `findings/ui_design_shots/city_design_*` (hand-made is fine; the dev pages
  `/dev/surface-parity/gl` and `/dev/surface-sheet` can render discs).
- **How it is drawn.** The passes and the terms, in shader terms an implementer can follow:
  what is baked (which channel, at what resolution), what is computed per frame, how the
  glow is made without painting on the air, how cloud occludes, the twilight ramp, the
  small-size fallback. Costs, with numbers you can stand behind.
- **The parameters,** each with the value it takes from `cityLight` and the urban mask
  today and what it becomes.
- **What Agent C builds, in order,** each step ending in something Johnny can look at, and
  which frames prove it (a named world at a named date, near and far, the same three
  worlds every time).
- **Choices for Johnny,** only where the look truly forks, three at most, each with a
  picture and your recommendation first.

## Report

One sentence, then the look in five lines, the approach in five lines, the choices if any,
the files written. "No edits outside findings/." Stop and report.
