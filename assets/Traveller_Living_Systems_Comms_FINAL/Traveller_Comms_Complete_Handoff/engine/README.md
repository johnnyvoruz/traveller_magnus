# Procedural conversation generator — integration starter

`chatterProcedural.ts` is the full previously drafted TypeScript scenario bank, intended to sit alongside the actual `facts.ts` and import the repo's `SystemFacts`.

Exports: `welcomeFor(facts,truthVersion)`, `nextProceduralEvent(facts,{truthVersion,day,eventIndex,avoidIds})`, `suggestedGapSeconds(facts,truthVersion,day,eventIndex)`, `scenarioCount(facts)`, plus event and turn types.

It includes around 60 multi-turn templates for approach, dock, freight, customs, field traffic, technical, environmental and related system activities. It is *not* a complete scheduler: add the corpus adapter, event mixer, bounded cooldown, persistent system identity, arrival detection, one-at-a-time playback with completion-driven transitions, reliable cleanup, and Beowulf gating. Improve the template wording/logic after evaluating local lore and the actual app's system representation.

Do not place the file directly into an arbitrary directory while leaving `import type {SystemFacts} from './facts.ts'` unresolved. Move beside the real facts module or adjust import according to the repo convention.
