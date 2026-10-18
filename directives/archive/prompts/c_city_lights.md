# Lane C — city lights belong on the ground, not on the atmosphere; and the late first high-tilt disc

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your tilt and caption report is accepted and is out in version 1.1.8
(`57ec8d0`). Johnny on your question: yes, the sheet stays on `hydroPercent` and the
caption stays on the hydrographics digit; change neither.

## 1. City lights are drawn on the atmosphere layer (Johnny, 2026-10-11)

His words: "the city lights are still being rendered on the atmospheric layer". On a
world's night side the lights read as if they sit on top of the air and the cloud,
not on the ground under them.

- **Look first, on the live page** (https://traveller.voyage, a populated world with
  an atmosphere and cloud, in Chrome with WebGL; the sector in a URL is
  `Spinward_Marches`): say exactly what is wrong, with shots at two zooms in the
  orbit view and in the dossier: lights over cloud, lights over the limb's haze,
  lights past the edge of the disc, lights not dimmed by a thick atmosphere, or
  something else. Do not fix what you have not seen.
- Then find it in the code: where the city channel is baked
  (`surface/vanilla/gl_shaders.ts`, `BAKE_FRAG`, `city`) and the order in which the
  draw pass composes ground, lights, cloud, haze and the night shade. Name the lines.
- **The rule to build:** lights are part of the ground. Cloud over a city hides or
  dims it; the atmosphere's haze and limb glow are drawn over the lights, never under
  them; no light shows outside the solid disc; on the day side there are none, as
  now. Which worlds have lights, and how many, is unchanged: that comes from the
  world's data through the existing bake and is not yours to re-decide.
- Every surface that shows lights agrees: the orbit disc, the dossier's disc if it
  has one, and the surface map's night side if it draws them. Say which do.
- A world with no atmosphere, a world with no cloud, and a world with full cloud:
  show each.
- Pins: `node scripts/surface_parity.js` stays as it is for the day side. If a night
  pin moves, say which and by how much; a cache version that names the city pass
  (`ENHANCED_CITY_VERSION`) moves if stored pictures would otherwise be stale: say
  what you did.
- Before and after shots `kc_lights_*`, the same worlds and zooms.

## 2. The first high-tilt disc in a session is late

Your own measurement: the first use of `BAKE_FRAG_TILT` in a context cost 1,632 ms on
one face (the compile and link), against about 9 ms warmed. Say where that time is
spent (the main thread or the disc worker) and what a person sees (a late disc, or a
stalled frame). Then remove the wait from the moment a person looks at a tilted
world: for one, link the tilt program when the baker is made, in idle time, and use
`KHR_parallel_shader_compile` where the context has it so nothing blocks. The
program for worlds at 45 degrees or less must not get slower to first picture: show
the first-disc time before and after for both kinds.

## Owned files (this pass)

`apps/web/src/surface/`, `apps/web/src/dossier/SurfaceStage.vue`,
`scripts/surface_parity.js`, your tests in `tests/web/`, shots `kc_lights_*`,
`directives/reports/c_city_lights.md`. No engine file, no `rules/`. If the fault is
in a file that is not yours (the orbit view's own drawing), name the lines and stop
that part.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`node scripts/surface_parity.js`; the shots; bake time for a disc batch before and
after (not more than 10 percent slower warmed); the first-disc times in part 2.

## Stop rule

Stop when both parts pass and the report is written, or at a file that is not yours.

Write `directives/reports/c_city_lights.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the prompt is read. next: look at the live orbit view and dossier before any change.
done: live Regina orbit shows night lights added on top of the cloud deck. next: put the enhanced lights under the cloud and the limb.
done: the enhanced lights sit in the ground fraction under the cloud, and the limb tint stays after them. next: photograph the local build.
done: the local Regina disc, the dossier map, and the cloud harness are photographed. next: write the report.
done: the report is written. next: stop.

